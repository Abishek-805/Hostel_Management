import express, { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { authMiddleware } from '../middleware/auth';
import { requireRoles } from '../middleware/roleGuard';
import GatePass from '../models/GatePass';
import StudentGateState from '../models/StudentGateState';
import GateLog from '../models/GateLog';
import User from '../models/User';
import { HOSTEL_LOCATIONS } from '../config/hostels';
import {
  consumeTokenIfUsable,
  createSignedGateQrToken,
  GateStage,
  parseAndValidateSignedToken,
} from '../services/gateQrToken';
import { invalidateMealCountCache } from '../services/mealCountCache';

const router = express.Router();

router.get('/health', (_req, res) => {
  return res.status(200).json({ ok: true, module: 'gate' });
});

interface RequestUser {
  id: string;
  role: 'student' | 'admin' | 'gatekeeper';
  hostelBlock: string;
}

interface RequestWithUser extends Request {
  user?: RequestUser;
}

const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 25,
  message: { error: 'Too many scan attempts, please try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const requestUser = (req as RequestWithUser).user;
    return requestUser?.id || req.ip || 'unknown-scan-client';
  },
});

const objectId = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), {
  message: 'Invalid id',
});

const createPassSchema = z.object({
  category: z.enum(['HOME', 'PERSONAL', 'MEDICAL', 'ACADEMIC', 'OTHER']).default('OTHER'),
  reason: z.string().trim().min(3),
  destination: z.string().trim().min(2),
  emergencyContact: z.string().trim().optional(),
  requestedExitTime: z.string().datetime().optional(),
  expectedReturnTime: z.string().datetime(),
});

const approveSchema = z.object({
  approvedReturnTime: z.string().datetime().optional(),
});

const rejectSchema = z.object({
  rejectionReason: z.string().trim().min(3),
});

const scanSchema = z.object({
  token: z.string().min(20),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radius * c;
}

async function getOrCreateGateState(userId: string) {
  const existing = await StudentGateState.findOne({ userId });
  if (existing) return existing;
  return StudentGateState.create({ userId, currentState: 'INSIDE_HOSTEL', attendanceLocked: false });
}

function resolvePassUserId(userId: unknown): string {
  if (typeof userId === 'string') {
    return userId;
  }
  if (userId instanceof mongoose.Types.ObjectId) {
    return userId.toString();
  }
  if (typeof userId === 'object' && userId !== null && '_id' in userId) {
    const idValue = (userId as { _id: unknown })._id;
    if (idValue instanceof mongoose.Types.ObjectId) {
      return idValue.toString();
    }
    if (typeof idValue === 'string') {
      return idValue;
    }
  }
  return '';
}

async function addGateLog(input: {
  userId: string;
  gatePassId: string;
  type: 'EXIT' | 'CAMPUS_ENTRY' | 'HOSTEL_ENTRY' | 'SYSTEM_ACTION';
  markedBy?: string;
  metadata?: Record<string, unknown>;
}) {
  await GateLog.create({
    userId: new mongoose.Types.ObjectId(input.userId),
    gatePassId: input.gatePassId,
    type: input.type,
    timestamp: new Date(),
    markedBy: input.markedBy ? new mongoose.Types.ObjectId(input.markedBy) : undefined,
    metadata: input.metadata || {},
  });
}

async function addSystemActionLogIfPossible(input: {
  userId?: string;
  gatePassId: string;
  markedBy?: string;
  metadata: Record<string, unknown>;
}) {
  if (!input.userId || !mongoose.Types.ObjectId.isValid(input.userId)) {
    return;
  }

  try {
    await addGateLog({
      userId: input.userId,
      gatePassId: input.gatePassId,
      type: 'SYSTEM_ACTION',
      markedBy: input.markedBy,
      metadata: input.metadata,
    });
  } catch (error) {
    console.warn('Failed to record gate system action log', error);
  }
}

async function validateScanToken(token: string, stage: GateStage) {
  const parsed = parseAndValidateSignedToken(token);
  if (!parsed.valid) {
    return { ok: false as const, status: 400, error: parsed.error };
  }
  if (parsed.payload.stage !== stage) {
    return { ok: false as const, status: 400, error: 'Invalid token stage' };
  }
  return { ok: true as const, payload: parsed.payload };
}

async function consumeValidatedScanToken(token: string) {
  const consumeResult = await consumeTokenIfUsable(token);
  if (!consumeResult.success) {
    return { ok: false as const, status: 409, error: consumeResult.error };
  }
  return { ok: true as const };
}

router.post('/passes', authMiddleware, requireRoles(['student'], { allowAdminOverride: false }), async (req: RequestWithUser, res) => {
  try {
    const parsed = createPassSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    if (parsed.data.category === 'HOME' && !parsed.data.emergencyContact) {
      return res.status(400).json({ error: 'Emergency contact is required for HOME category.' });
    }

    const activePass = await GatePass.findOne({
      userId: req.user!.id,
      status: { $in: ['PENDING', 'APPROVED'] },
    }).lean();

    if (activePass) {
      return res.status(409).json({ error: 'Single active gate pass allowed. Complete current pass first.' });
    }

    const gatePass = await GatePass.create({
      userId: req.user!.id,
      category: parsed.data.category,
      reason: parsed.data.reason,
      destination: parsed.data.destination,
      emergencyContact: parsed.data.emergencyContact,
      requestedExitTime: parsed.data.requestedExitTime ? new Date(parsed.data.requestedExitTime) : undefined,
      expectedReturnTime: new Date(parsed.data.expectedReturnTime),
      status: 'PENDING',
    });

    await getOrCreateGateState(req.user!.id);

    return res.status(201).json({ success: true, gatePass });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create gate pass' });
  }
});

router.get('/passes/my', authMiddleware, requireRoles(['student'], { allowAdminOverride: false }), async (req: RequestWithUser, res) => {
  try {
    const passes = await GatePass.find({ userId: req.user!.id }).sort({ createdAt: -1 }).lean();
    const gateState = await getOrCreateGateState(req.user!.id);
    return res.json({ passes, gateState });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch gate passes' });
  }
});

router.get('/passes/pending', authMiddleware, requireRoles(['admin']), async (_req: RequestWithUser, res) => {
  const passes = await GatePass.find({ status: 'PENDING' })
    .populate('userId', 'name registerId hostelBlock roomNumber')
    .sort({ createdAt: -1 })
    .lean();
  return res.json({ passes });
});

router.get('/passes/approved', authMiddleware, requireRoles(['gatekeeper']), async (_req, res) => {
  const passes = await GatePass.find({ status: 'APPROVED' })
    .populate('userId', 'name registerId hostelBlock roomNumber')
    .sort({ expectedReturnTime: 1 })
    .lean();
  return res.json({ passes });
});

router.post('/passes/:gatePassId/approve', authMiddleware, requireRoles(['admin']), async (req: RequestWithUser, res) => {
  try {
    const body = approveSchema.safeParse(req.body || {});
    if (!body.success) {
      return res.status(400).json({ error: body.error.flatten() });
    }

    const gatePass = await GatePass.findOne({ gatePassId: req.params.gatePassId });
    if (!gatePass) {
      return res.status(404).json({ error: 'Gate pass not found' });
    }
    if (gatePass.status !== 'PENDING') {
      return res.status(409).json({ error: 'Only pending gate pass can be approved' });
    }

    gatePass.status = 'APPROVED';
    gatePass.approvedBy = new mongoose.Types.ObjectId(req.user!.id);
    gatePass.approvalTimestamp = new Date();
    gatePass.approvedReturnTime = body.data.approvedReturnTime
      ? new Date(body.data.approvedReturnTime)
      : gatePass.expectedReturnTime;
    await gatePass.save();
    invalidateMealCountCache();

    return res.json({ success: true, gatePass });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to approve gate pass' });
  }
});

router.post('/passes/:gatePassId/reject', authMiddleware, requireRoles(['admin']), async (req: RequestWithUser, res) => {
  try {
    const body = rejectSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: body.error.flatten() });
    }

    const gatePass = await GatePass.findOne({ gatePassId: req.params.gatePassId });
    if (!gatePass) {
      return res.status(404).json({ error: 'Gate pass not found' });
    }
    if (gatePass.status !== 'PENDING') {
      return res.status(409).json({ error: 'Only pending gate pass can be rejected' });
    }

    gatePass.status = 'REJECTED';
    gatePass.rejectionReason = body.data.rejectionReason;
    gatePass.approvedBy = new mongoose.Types.ObjectId(req.user!.id);
    gatePass.approvalTimestamp = new Date();
    await gatePass.save();
    invalidateMealCountCache();

    return res.json({ success: true, gatePass });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to reject gate pass' });
  }
});

router.post('/passes/:gatePassId/mark-exit', authMiddleware, requireRoles(['gatekeeper']), async (req: RequestWithUser, res) => {
  try {
    const gatePass = await GatePass.findOne({ gatePassId: req.params.gatePassId });
    if (!gatePass) {
      return res.status(404).json({ error: 'Gate pass not found' });
    }
    if (gatePass.status !== 'APPROVED') {
      return res.status(409).json({ error: 'Exit can be marked only for approved gate pass' });
    }

    const gateState = await getOrCreateGateState(gatePass.userId.toString());
    if (gateState.currentState === 'OUTSIDE_CAMPUS') {
      return res.status(409).json({ error: 'Exit already marked' });
    }

    const now = new Date();
    gatePass.exitMarkedAt = now;
    await gatePass.save();

    gateState.currentState = 'OUTSIDE_CAMPUS';
    gateState.lastExitTime = now;
    await gateState.save();

    await addGateLog({
      userId: gatePass.userId.toString(),
      gatePassId: gatePass.gatePassId,
      type: 'EXIT',
      markedBy: req.user!.id,
      metadata: { source: 'mark-exit' },
    });
    invalidateMealCountCache();

    return res.json({ success: true, gatePass, gateState });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to mark exit' });
  }
});

router.get('/passes/:gatePassId/qr-token', authMiddleware, requireRoles(['student'], { allowAdminOverride: false }), async (req: RequestWithUser, res) => {
  try {
    const stage = (req.query.stage as GateStage) || 'CAMPUS_ENTRY';
    if (stage !== 'CAMPUS_ENTRY' && stage !== 'HOSTEL_ENTRY') {
      return res.status(400).json({ error: 'Invalid stage' });
    }

    const gatePass = await GatePass.findOne({ gatePassId: req.params.gatePassId, userId: req.user!.id });
    if (!gatePass) {
      return res.status(404).json({ error: 'Gate pass not found' });
    }

    if (gatePass.status !== 'APPROVED' && gatePass.status !== 'LATE') {
      return res.status(409).json({ error: 'QR token can be generated only for active return flow' });
    }

    const tokenData = await createSignedGateQrToken({
      userId: req.user!.id,
      gatePassId: gatePass.gatePassId,
      stage,
    });

    return res.json({ success: true, ...tokenData });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create QR token' });
  }
});

router.post('/scan/campus-entry', authMiddleware, requireRoles(['gatekeeper']), scanLimiter, async (req: RequestWithUser, res) => {
  try {
    const parsed = scanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const tokenCheck = await validateScanToken(parsed.data.token, 'CAMPUS_ENTRY');
    if (!tokenCheck.ok) {
      await addSystemActionLogIfPossible({
        gatePassId: 'N/A',
        markedBy: req.user?.id,
        metadata: { source: 'scan-campus-entry', outcome: 'TOKEN_REJECTED', reason: tokenCheck.error },
      });
      return res.status(tokenCheck.status).json({ error: tokenCheck.error });
    }

    const gatePass = await GatePass.findOne({
      gatePassId: tokenCheck.payload.gatePassId,
      userId: tokenCheck.payload.userId,
    });
    if (!gatePass) {
      await addSystemActionLogIfPossible({
        userId: tokenCheck.payload.userId,
        gatePassId: tokenCheck.payload.gatePassId,
        markedBy: req.user?.id,
        metadata: { source: 'scan-campus-entry', outcome: 'PASS_NOT_FOUND' },
      });
      return res.status(404).json({ error: 'Gate pass not found' });
    }
    if (gatePass.status !== 'APPROVED' && gatePass.status !== 'LATE') {
      await addSystemActionLogIfPossible({
        userId: tokenCheck.payload.userId,
        gatePassId: gatePass.gatePassId,
        markedBy: req.user?.id,
        metadata: { source: 'scan-campus-entry', outcome: 'INVALID_PASS_STATUS', status: gatePass.status },
      });
      return res.status(409).json({ error: 'Gate pass is not in entry-allowed status' });
    }

    if (gatePass.enteredCampusAt) {
      await addSystemActionLogIfPossible({
        userId: tokenCheck.payload.userId,
        gatePassId: gatePass.gatePassId,
        markedBy: req.user?.id,
        metadata: { source: 'scan-campus-entry', outcome: 'DUPLICATE_SCAN' },
      });
      return res.status(409).json({ error: 'Campus entry already recorded for this pass' });
    }

    const gateState = await getOrCreateGateState(tokenCheck.payload.userId);
    if (gateState.currentState !== 'OUTSIDE_CAMPUS') {
      await addSystemActionLogIfPossible({
        userId: tokenCheck.payload.userId,
        gatePassId: gatePass.gatePassId,
        markedBy: req.user?.id,
        metadata: {
          source: 'scan-campus-entry',
          outcome: 'INVALID_STATE_TRANSITION',
          expectedState: 'OUTSIDE_CAMPUS',
          currentState: gateState.currentState,
        },
      });
      return res.status(409).json({ error: 'Invalid state transition: expected OUTSIDE_CAMPUS' });
    }

    const consumeResult = await consumeValidatedScanToken(parsed.data.token);
    if (!consumeResult.ok) {
      await addSystemActionLogIfPossible({
        userId: tokenCheck.payload.userId,
        gatePassId: gatePass.gatePassId,
        markedBy: req.user?.id,
        metadata: { source: 'scan-campus-entry', outcome: 'TOKEN_CONSUME_REJECTED', reason: consumeResult.error },
      });
      return res.status(consumeResult.status).json({ error: consumeResult.error });
    }

    const now = new Date();
    gatePass.enteredCampusAt = now;
    gatePass.actualReturnTime = now;
    if (now.getTime() > gatePass.expectedReturnTime.getTime()) {
      gateState.attendanceLocked = true;
      gatePass.status = 'LATE';
      gatePass.finalStatus = 'LATE';
    }
    await gatePass.save();

    gateState.currentState = 'INSIDE_CAMPUS';
    gateState.lastCampusEntryTime = now;
    await gateState.save();

    await addGateLog({
      userId: tokenCheck.payload.userId,
      gatePassId: gatePass.gatePassId,
      type: 'CAMPUS_ENTRY',
      markedBy: req.user!.id,
      metadata: { latitude: parsed.data.latitude, longitude: parsed.data.longitude },
    });
    invalidateMealCountCache();

    return res.json({ success: true, gatePass, gateState });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to verify campus entry' });
  }
});

router.post('/scan/hostel-entry', authMiddleware, requireRoles(['gatekeeper']), scanLimiter, async (req: RequestWithUser, res) => {
  try {
    const parsed = scanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const tokenCheck = await validateScanToken(parsed.data.token, 'HOSTEL_ENTRY');
    if (!tokenCheck.ok) {
      await addSystemActionLogIfPossible({
        gatePassId: 'N/A',
        markedBy: req.user?.id,
        metadata: { source: 'scan-hostel-entry', outcome: 'TOKEN_REJECTED', reason: tokenCheck.error },
      });
      return res.status(tokenCheck.status).json({ error: tokenCheck.error });
    }

    const gatePass = await GatePass.findOne({
      gatePassId: tokenCheck.payload.gatePassId,
      userId: tokenCheck.payload.userId,
    });
    if (!gatePass) {
      await addSystemActionLogIfPossible({
        userId: tokenCheck.payload.userId,
        gatePassId: tokenCheck.payload.gatePassId,
        markedBy: req.user?.id,
        metadata: { source: 'scan-hostel-entry', outcome: 'PASS_NOT_FOUND' },
      });
      return res.status(404).json({ error: 'Gate pass not found' });
    }

    if (gatePass.status !== 'APPROVED' && gatePass.status !== 'LATE') {
      await addSystemActionLogIfPossible({
        userId: tokenCheck.payload.userId,
        gatePassId: gatePass.gatePassId,
        markedBy: req.user?.id,
        metadata: { source: 'scan-hostel-entry', outcome: 'INVALID_PASS_STATUS', status: gatePass.status },
      });
      return res.status(409).json({ error: 'Gate pass is not in entry-allowed status' });
    }

    if (gatePass.enteredHostelAt) {
      await addSystemActionLogIfPossible({
        userId: tokenCheck.payload.userId,
        gatePassId: gatePass.gatePassId,
        markedBy: req.user?.id,
        metadata: { source: 'scan-hostel-entry', outcome: 'DUPLICATE_SCAN' },
      });
      return res.status(409).json({ error: 'Hostel entry already recorded for this pass' });
    }

    const gateState = await getOrCreateGateState(tokenCheck.payload.userId);
    if (gateState.currentState !== 'INSIDE_CAMPUS') {
      await addSystemActionLogIfPossible({
        userId: tokenCheck.payload.userId,
        gatePassId: gatePass.gatePassId,
        markedBy: req.user?.id,
        metadata: {
          source: 'scan-hostel-entry',
          outcome: 'INVALID_STATE_TRANSITION',
          expectedState: 'INSIDE_CAMPUS',
          currentState: gateState.currentState,
        },
      });
      return res.status(409).json({ error: 'Invalid state transition: expected INSIDE_CAMPUS' });
    }

    const consumeResult = await consumeValidatedScanToken(parsed.data.token);
    if (!consumeResult.ok) {
      await addSystemActionLogIfPossible({
        userId: tokenCheck.payload.userId,
        gatePassId: gatePass.gatePassId,
        markedBy: req.user?.id,
        metadata: { source: 'scan-hostel-entry', outcome: 'TOKEN_CONSUME_REJECTED', reason: consumeResult.error },
      });
      return res.status(consumeResult.status).json({ error: consumeResult.error });
    }

    const userRecord = await User.findById(tokenCheck.payload.userId)
      .select('hostelBlock')
      .lean<{ hostelBlock: string }>();
    if (!userRecord) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hostelConfig = HOSTEL_LOCATIONS[userRecord.hostelBlock];
    if (!hostelConfig || !hostelConfig.center || !hostelConfig.radius) {
      return res.status(400).json({ error: 'Hostel geofence not configured for user block' });
    }

    if (typeof parsed.data.latitude !== 'number' || typeof parsed.data.longitude !== 'number') {
      return res.status(400).json({ error: 'Latitude and longitude are required for hostel entry' });
    }

    const distance = getDistanceMeters(
      parsed.data.latitude,
      parsed.data.longitude,
      hostelConfig.center.latitude,
      hostelConfig.center.longitude
    );
    if (distance > hostelConfig.radius) {
      return res.status(400).json({ error: 'Location outside hostel radius. Hostel entry denied.' });
    }

    const now = new Date();
    gatePass.enteredHostelAt = now;
    gatePass.actualReturnTime = now;
    if (now.getTime() > gatePass.expectedReturnTime.getTime()) {
      gateState.attendanceLocked = true;
      gatePass.status = 'LATE';
      gatePass.finalStatus = 'LATE';
    } else {
      gatePass.status = 'COMPLETED';
      gatePass.finalStatus = 'COMPLETED';
    }
    await gatePass.save();

    gateState.currentState = 'INSIDE_HOSTEL';
    gateState.lastHostelEntryTime = now;
    await gateState.save();

    await addGateLog({
      userId: tokenCheck.payload.userId,
      gatePassId: gatePass.gatePassId,
      type: 'HOSTEL_ENTRY',
      markedBy: req.user!.id,
      metadata: {
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        distance,
      },
    });
    invalidateMealCountCache();

    return res.json({ success: true, gatePass, gateState });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to verify hostel entry' });
  }
});

router.get('/outside', authMiddleware, requireRoles(['gatekeeper']), async (_req, res) => {
  const outsideStates = await StudentGateState.find({ currentState: 'OUTSIDE_CAMPUS' })
    .populate('userId', 'name registerId hostelBlock roomNumber')
    .sort({ updatedAt: -1 })
    .lean();
  return res.json({ students: outsideStates });
});

router.get('/late', authMiddleware, requireRoles(['admin']), async (_req, res) => {
  const latePasses = await GatePass.find({ status: 'LATE' })
    .populate('userId', 'name registerId hostelBlock roomNumber')
    .sort({ updatedAt: -1 })
    .lean();
  return res.json({ passes: latePasses });
});

router.post('/unlock/:userId', authMiddleware, requireRoles(['admin']), async (req: RequestWithUser, res) => {
  const parsed = objectId.safeParse(req.params.userId);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const gateState = await getOrCreateGateState(parsed.data);
  gateState.attendanceLocked = false;
  await gateState.save();

  await addGateLog({
    userId: parsed.data,
    gatePassId: 'N/A',
    type: 'SYSTEM_ACTION',
    markedBy: req.user!.id,
    metadata: { action: 'ATTENDANCE_UNLOCK' },
  });

  return res.json({ success: true, gateState });
});

router.post('/passes/:gatePassId/override-hostel-entry', authMiddleware, requireRoles(['admin']), async (req: RequestWithUser, res) => {
  try {
    const gatePass = await GatePass.findOne({ gatePassId: req.params.gatePassId });
    if (!gatePass) {
      return res.status(404).json({ error: 'Gate pass not found' });
    }
    if (gatePass.status !== 'APPROVED' && gatePass.status !== 'LATE') {
      return res.status(409).json({ error: 'Only active pass can be manually closed' });
    }

    const now = new Date();
    gatePass.enteredHostelAt = now;
    gatePass.actualReturnTime = now;
    gatePass.status = now > gatePass.expectedReturnTime ? 'LATE' : 'COMPLETED';
    gatePass.finalStatus = gatePass.status === 'LATE' ? 'LATE' : 'COMPLETED';
    await gatePass.save();

    const state = await getOrCreateGateState(gatePass.userId.toString());
    state.currentState = 'INSIDE_HOSTEL';
    state.lastHostelEntryTime = now;
    if (gatePass.status === 'LATE') {
      state.attendanceLocked = true;
    }
    await state.save();

    await addGateLog({
      userId: gatePass.userId.toString(),
      gatePassId: gatePass.gatePassId,
      type: 'HOSTEL_ENTRY',
      markedBy: req.user!.id,
      metadata: { source: 'ADMIN_OVERRIDE' },
    });
    invalidateMealCountCache();

    return res.json({ success: true, gatePass, gateState: state });
  } catch (error) {
    return res.status(500).json({ error: 'Override failed' });
  }
});

router.get('/logs', authMiddleware, requireRoles(['admin']), async (req: RequestWithUser, res) => {
  const limit = Math.min(Number.parseInt((req.query.limit as string) || '200', 10), 500);
  const logs = await GateLog.find({})
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('userId', 'name registerId hostelBlock')
    .populate('markedBy', 'name registerId role')
    .lean();
  return res.json({ logs });
});

router.get('/state/:userId', authMiddleware, requireRoles(['admin', 'gatekeeper', 'student']), async (req: RequestWithUser, res) => {
  const parsed = objectId.safeParse(req.params.userId);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  if (req.user!.role === 'student' && req.user!.id !== parsed.data) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const gateState = await getOrCreateGateState(parsed.data);
  return res.json({ gateState });
});

router.get('/passes/:gatePassId', authMiddleware, requireRoles(['admin', 'gatekeeper', 'student']), async (req: RequestWithUser, res) => {
  const gatePass = await GatePass.findOne({ gatePassId: req.params.gatePassId }).populate(
    'userId',
    'name registerId hostelBlock roomNumber'
  );
  if (!gatePass) {
    return res.status(404).json({ error: 'Gate pass not found' });
  }
  if (req.user!.role === 'student' && gatePass.userId && resolvePassUserId(gatePass.userId) !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return res.json({ gatePass });
});

router.get('/passes/:gatePassId/pdf', authMiddleware, requireRoles(['admin', 'gatekeeper', 'student']), async (req: RequestWithUser, res) => {
  const stage = (req.query.stage as GateStage) || 'CAMPUS_ENTRY';
  if (stage !== 'CAMPUS_ENTRY' && stage !== 'HOSTEL_ENTRY') {
    return res.status(400).json({ error: 'Invalid stage' });
  }

  const gatePass = await GatePass.findOne({ gatePassId: req.params.gatePassId }).populate(
    'userId',
    'name registerId hostelBlock roomNumber'
  );

  if (!gatePass) {
    return res.status(404).json({ error: 'Gate pass not found' });
  }

  if (req.user!.role === 'student' && gatePass.userId && resolvePassUserId(gatePass.userId) !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (gatePass.status !== 'APPROVED') {
    return res.status(409).json({ error: 'PDF is available only for approved gate passes' });
  }

  const tokenData = await createSignedGateQrToken({
    userId: resolvePassUserId(gatePass.userId),
    gatePassId: gatePass.gatePassId,
    stage,
  });

  const qrDataUrl = await QRCode.toDataURL(tokenData.token, {
    margin: 1,
    width: 180,
  });
  const qrBase64 = qrDataUrl.split(',')[1];
  const qrBuffer = Buffer.from(qrBase64, 'base64');

  const user = gatePass.userId as unknown as {
    name: string;
    registerId: string;
    hostelBlock: string;
    roomNumber?: string;
  };

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${gatePass.gatePassId}.pdf`);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  doc.fontSize(18).text('HostelEase - College Gate Pass', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).text('Digital Gate Pass (Invoice Style)', { align: 'center' });
  doc.moveDown(1.2);

  doc.fontSize(12).text(`Gate Pass ID: ${gatePass.gatePassId}`);
  doc.text(`Status: ${gatePass.status}`);
  doc.text(`Category: ${gatePass.category}`);
  doc.text(`Approved At: ${gatePass.approvalTimestamp ? gatePass.approvalTimestamp.toISOString() : 'N/A'}`);
  doc.moveDown();

  doc.fontSize(13).text('Student Details', { underline: true });
  doc.fontSize(11).text(`Name: ${user?.name || 'N/A'}`);
  doc.text(`Register ID: ${user?.registerId || 'N/A'}`);
  doc.text(`Hostel: ${user?.hostelBlock || 'N/A'}`);
  doc.text(`Room: ${user?.roomNumber || 'N/A'}`);
  doc.moveDown();

  doc.fontSize(13).text('Pass Details', { underline: true });
  doc.fontSize(11).text(`Reason: ${gatePass.reason}`);
  doc.text(`Destination: ${gatePass.destination}`);
  doc.text(`Expected Return Time: ${new Date(gatePass.expectedReturnTime).toISOString()}`);
  doc.text(`Approved Return Time: ${gatePass.approvedReturnTime ? new Date(gatePass.approvedReturnTime).toISOString() : 'N/A'}`);
  doc.moveDown();

  doc.fontSize(13).text('Approval Section', { underline: true });
  doc.fontSize(11).text(`Approved By: ${gatePass.approvedBy ? gatePass.approvedBy.toString() : 'N/A'}`);
  doc.text(`Approval Timestamp: ${gatePass.approvalTimestamp ? new Date(gatePass.approvalTimestamp).toISOString() : 'N/A'}`);
  doc.moveDown();

  doc.fontSize(13).text('QR Reference', { underline: true });
  doc.image(qrBuffer, { fit: [120, 120], align: 'center' });
  doc.text(`QR token stage: ${stage}`);
  doc.text(`QR token expires at: ${tokenData.expiresAt.toISOString()}`);
  doc.text(`QR token TTL: ${tokenData.ttlSeconds} seconds`);
  doc.moveDown();

  if (gatePass.status === 'COMPLETED' || gatePass.status === 'LATE') {
    doc.fontSize(13).text('Movement Tracking', { underline: true });
    doc.fontSize(11).text(`Exit Marked At: ${gatePass.exitMarkedAt ? new Date(gatePass.exitMarkedAt).toISOString() : 'N/A'}`);
    doc.text(`Entered Campus At: ${gatePass.enteredCampusAt ? new Date(gatePass.enteredCampusAt).toISOString() : 'N/A'}`);
    doc.text(`Entered Hostel At: ${gatePass.enteredHostelAt ? new Date(gatePass.enteredHostelAt).toISOString() : 'N/A'}`);
    doc.text(`Actual Return: ${gatePass.actualReturnTime ? new Date(gatePass.actualReturnTime).toISOString() : 'N/A'}`);
    doc.text(`Final Status: ${gatePass.finalStatus || gatePass.status}`);
  }

  doc.end();
  return undefined;
});

export default router;
