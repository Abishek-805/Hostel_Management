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
import GateScanRecord, { GateScanOutcome, GateScanStage } from '../models/GateScanRecord';
import User from '../models/User';
import Notification, { NotificationType } from '../models/Notification';
import CurfewConfig from '../models/CurfewConfig';
import GatePassExtension from '../models/GatePassExtension';
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

const bulkActionSchema = z.object({
  gatePassIds: z.array(z.string().trim().min(3)).min(1).max(100),
  action: z.enum(['APPROVE', 'REJECT']),
  approvedReturnTime: z.string().datetime().optional(),
  rejectionReason: z.string().trim().min(3).optional(),
});

const curfewConfigSchema = z.object({
  curfewHour: z.number().int().min(0).max(23),
  curfewMinute: z.number().int().min(0).max(59),
  checkIntervalMs: z.number().int().min(60_000).max(24 * 60 * 60 * 1000).optional(),
});

const extensionCreateSchema = z.object({
  requestedReturnTime: z.string().datetime(),
  reason: z.string().trim().min(3),
});

const extensionReviewSchema = z.object({
  rejectionReason: z.string().trim().min(3).optional(),
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

async function addGateScanRecord(input: {
  gatePassId?: string;
  userId?: string;
  scannedBy?: string;
  stage: GateScanStage;
  outcome: GateScanOutcome;
  reason?: string;
  latitude?: number;
  longitude?: number;
}) {
  const userId = input.userId && mongoose.Types.ObjectId.isValid(input.userId)
    ? new mongoose.Types.ObjectId(input.userId)
    : undefined;
  const scannedBy = input.scannedBy && mongoose.Types.ObjectId.isValid(input.scannedBy)
    ? new mongoose.Types.ObjectId(input.scannedBy)
    : undefined;

  await GateScanRecord.create({
    gatePassId: input.gatePassId,
    userId,
    scannedBy,
    stage: input.stage,
    outcome: input.outcome,
    reason: input.reason,
    latitude: input.latitude,
    longitude: input.longitude,
  });
}

async function createGateNotification(input: {
  recipientId: string;
  studentId: string;
  gatePassId: string;
  type: NotificationType;
  title: string;
  message: string;
  details?: Record<string, unknown>;
}) {
  try {
    await Notification.updateOne(
      {
        gatePassId: input.gatePassId,
        type: input.type,
        recipientId: new mongoose.Types.ObjectId(input.recipientId),
      },
      {
        $set: {
          studentId: new mongoose.Types.ObjectId(input.studentId),
          title: input.title,
          message: input.message,
          details: input.details || {},
          read: false,
        },
        $setOnInsert: {
          gatePassId: input.gatePassId,
          type: input.type,
          recipientId: new mongoose.Types.ObjectId(input.recipientId),
        },
      },
      { upsert: true }
    );
  } catch (error) {
    console.warn('Failed to create gate notification', error);
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

    const existingPass = await GatePass.findOne({
      userId: req.user!.id,
      status: { $in: ['PENDING', 'APPROVED'] },
    });

    if (existingPass) {
      // If it's PENDING, or APPROVED but they haven't physically LEFT yet, allow overwriting
      if (existingPass.status === 'PENDING' || (existingPass.status === 'APPROVED' && !existingPass.exitMarkedAt)) {
        await GatePass.deleteOne({ _id: existingPass._id });
      } else {
        // They have already left or have an active approved pass they are currently using
        return res.status(409).json({
          error: 'Active movement detected. You already have an approved pass in use. Please complete your current return flow before applying for a new pass.'
        });
      }
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

router.delete('/passes/:gatePassId', authMiddleware, requireRoles(['student'], { allowAdminOverride: false }), async (req: RequestWithUser, res) => {
  try {
    const gatePass = await GatePass.findOne({ gatePassId: req.params.gatePassId, userId: req.user!.id });
    if (!gatePass) {
      return res.status(404).json({ error: 'Gate pass not found' });
    }
    if (gatePass.status !== 'PENDING') {
      return res.status(409).json({ error: 'Only pending gate passes can be cancelled.' });
    }

    await GatePass.deleteOne({ _id: gatePass._id });
    return res.json({ success: true, message: 'Gate pass cancelled successfully.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to cancel gate pass' });
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

router.get('/passes/approved', authMiddleware, requireRoles(['admin', 'gatekeeper']), async (_req, res) => {
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

    await createGateNotification({
      recipientId: gatePass.userId.toString(),
      studentId: gatePass.userId.toString(),
      gatePassId: gatePass.gatePassId,
      type: 'PASS_APPROVED',
      title: 'Gate Pass Approved',
      message: `Your gate pass ${gatePass.gatePassId} has been approved.`,
      details: {
        destination: gatePass.destination,
        approvedReturnTime: gatePass.approvedReturnTime,
      },
    });
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

    await createGateNotification({
      recipientId: gatePass.userId.toString(),
      studentId: gatePass.userId.toString(),
      gatePassId: gatePass.gatePassId,
      type: 'PASS_REJECTED',
      title: 'Gate Pass Rejected',
      message: `Your gate pass ${gatePass.gatePassId} was rejected by admin.`,
      details: {
        destination: gatePass.destination,
        rejectionReason: gatePass.rejectionReason,
      },
    });
    invalidateMealCountCache();

    return res.json({ success: true, gatePass });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to reject gate pass' });
  }
});

router.post('/passes/bulk-action', authMiddleware, requireRoles(['admin']), async (req: RequestWithUser, res) => {
  try {
    const parsed = bulkActionSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { gatePassIds, action, approvedReturnTime } = parsed.data;
    const rejectionReason = parsed.data.rejectionReason || 'Rejected by administrator.';

    const pendingPasses = await GatePass.find({
      gatePassId: { $in: gatePassIds },
      status: 'PENDING',
    });

    const passMap = new Map(pendingPasses.map((pass) => [pass.gatePassId, pass]));
    const processed: string[] = [];
    const skipped: Array<{ gatePassId: string; reason: string }> = [];

    for (const gatePassId of gatePassIds) {
      const gatePass = passMap.get(gatePassId);
      if (!gatePass) {
        skipped.push({ gatePassId, reason: 'Not found or not pending' });
        continue;
      }

      if (action === 'APPROVE') {
        gatePass.status = 'APPROVED';
        gatePass.approvedBy = new mongoose.Types.ObjectId(req.user!.id);
        gatePass.approvalTimestamp = new Date();
        gatePass.approvedReturnTime = approvedReturnTime
          ? new Date(approvedReturnTime)
          : gatePass.expectedReturnTime;
        await gatePass.save();

        await createGateNotification({
          recipientId: gatePass.userId.toString(),
          studentId: gatePass.userId.toString(),
          gatePassId: gatePass.gatePassId,
          type: 'PASS_APPROVED',
          title: 'Gate Pass Approved',
          message: `Your gate pass ${gatePass.gatePassId} has been approved.`,
          details: {
            destination: gatePass.destination,
            approvedReturnTime: gatePass.approvedReturnTime,
          },
        });
      } else {
        gatePass.status = 'REJECTED';
        gatePass.rejectionReason = rejectionReason;
        gatePass.approvedBy = new mongoose.Types.ObjectId(req.user!.id);
        gatePass.approvalTimestamp = new Date();
        await gatePass.save();

        await createGateNotification({
          recipientId: gatePass.userId.toString(),
          studentId: gatePass.userId.toString(),
          gatePassId: gatePass.gatePassId,
          type: 'PASS_REJECTED',
          title: 'Gate Pass Rejected',
          message: `Your gate pass ${gatePass.gatePassId} was rejected by admin.`,
          details: {
            destination: gatePass.destination,
            rejectionReason,
          },
        });
      }

      processed.push(gatePass.gatePassId);
    }

    invalidateMealCountCache();

    return res.json({
      success: true,
      action,
      processedCount: processed.length,
      processed,
      skipped,
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to process bulk action' });
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
    const stage = (req.query.stage as GateStage) || 'EXIT';
    if (stage !== 'EXIT' && stage !== 'CAMPUS_ENTRY' && stage !== 'HOSTEL_ENTRY') {
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

router.get('/extensions/my', authMiddleware, requireRoles(['student'], { allowAdminOverride: false }), async (req: RequestWithUser, res) => {
  try {
    const extensions = await GatePassExtension.find({ userId: req.user!.id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return res.json({ extensions });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to fetch extension requests' });
  }
});

router.post('/passes/:gatePassId/extensions', authMiddleware, requireRoles(['student'], { allowAdminOverride: false }), async (req: RequestWithUser, res) => {
  try {
    const body = extensionCreateSchema.safeParse(req.body || {});
    if (!body.success) {
      return res.status(400).json({ error: body.error.flatten() });
    }

    const gatePass = await GatePass.findOne({
      gatePassId: req.params.gatePassId,
      userId: req.user!.id,
      status: { $in: ['APPROVED', 'LATE'] },
    });

    if (!gatePass) {
      return res.status(404).json({ error: 'Active gate pass not found' });
    }

    if (gatePass.enteredHostelAt) {
      return res.status(409).json({ error: 'Cannot request extension for completed pass' });
    }

    const requestedReturnTime = new Date(body.data.requestedReturnTime);
    if (requestedReturnTime.getTime() <= gatePass.expectedReturnTime.getTime()) {
      return res.status(400).json({ error: 'Requested return time must be after current expected return time' });
    }

    const existingPending = await GatePassExtension.findOne({ gatePassRef: gatePass._id, status: 'PENDING' });
    if (existingPending) {
      return res.status(409).json({ error: 'A pending extension request already exists for this gate pass' });
    }

    const extension = await GatePassExtension.create({
      gatePassId: gatePass.gatePassId,
      gatePassRef: gatePass._id,
      userId: gatePass.userId,
      requestedBy: gatePass.userId,
      currentExpectedReturnTime: gatePass.expectedReturnTime,
      requestedReturnTime,
      reason: body.data.reason,
      status: 'PENDING',
    });

    return res.status(201).json({ success: true, extension });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to create extension request' });
  }
});

router.get('/extensions/pending', authMiddleware, requireRoles(['admin']), async (_req: RequestWithUser, res) => {
  try {
    const extensions = await GatePassExtension.find({ status: 'PENDING' })
      .populate('userId', 'name registerId hostelBlock roomNumber')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ extensions });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to fetch pending extension requests' });
  }
});

router.post('/extensions/:extensionId/approve', authMiddleware, requireRoles(['admin']), async (req: RequestWithUser, res) => {
  try {
    const extension = await GatePassExtension.findOne({ extensionId: req.params.extensionId, status: 'PENDING' });
    if (!extension) {
      return res.status(404).json({ error: 'Extension request not found' });
    }

    const gatePass = await GatePass.findById(extension.gatePassRef);
    if (!gatePass || (gatePass.status !== 'APPROVED' && gatePass.status !== 'LATE')) {
      return res.status(409).json({ error: 'Gate pass is no longer active' });
    }

    gatePass.expectedReturnTime = extension.requestedReturnTime;
    if (gatePass.approvedReturnTime && gatePass.approvedReturnTime < extension.requestedReturnTime) {
      gatePass.approvedReturnTime = extension.requestedReturnTime;
    }
    await gatePass.save();

    extension.status = 'APPROVED';
    extension.reviewedBy = new mongoose.Types.ObjectId(req.user!.id);
    extension.reviewedAt = new Date();
    await extension.save();

    await createGateNotification({
      recipientId: extension.userId.toString(),
      studentId: extension.userId.toString(),
      gatePassId: extension.gatePassId,
      type: 'EXTENSION_APPROVED',
      title: 'Extension Approved',
      message: `Your extension request (${extension.extensionId}) has been approved.`,
      details: {
        approvedReturnTime: extension.requestedReturnTime,
        extensionRequestedReturnTime: extension.requestedReturnTime,
      },
    });

    return res.json({ success: true, extension, gatePass });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to approve extension request' });
  }
});

router.post('/extensions/:extensionId/reject', authMiddleware, requireRoles(['admin']), async (req: RequestWithUser, res) => {
  try {
    const body = extensionReviewSchema.safeParse(req.body || {});
    if (!body.success) {
      return res.status(400).json({ error: body.error.flatten() });
    }

    const extension = await GatePassExtension.findOne({ extensionId: req.params.extensionId, status: 'PENDING' });
    if (!extension) {
      return res.status(404).json({ error: 'Extension request not found' });
    }

    extension.status = 'REJECTED';
    extension.rejectionReason = body.data.rejectionReason || 'Rejected by administrator.';
    extension.reviewedBy = new mongoose.Types.ObjectId(req.user!.id);
    extension.reviewedAt = new Date();
    await extension.save();

    await createGateNotification({
      recipientId: extension.userId.toString(),
      studentId: extension.userId.toString(),
      gatePassId: extension.gatePassId,
      type: 'EXTENSION_REJECTED',
      title: 'Extension Rejected',
      message: `Your extension request (${extension.extensionId}) was rejected.`,
      details: {
        rejectionReason: extension.rejectionReason,
        extensionRequestedReturnTime: extension.requestedReturnTime,
      },
    });

    return res.json({ success: true, extension });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to reject extension request' });
  }
});

router.post('/scan/exit', authMiddleware, requireRoles(['gatekeeper']), scanLimiter, async (req: RequestWithUser, res) => {
  try {
    const parsed = scanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const tokenCheck = await validateScanToken(parsed.data.token, 'EXIT');
    if (!tokenCheck.ok) {
      await addGateScanRecord({
        scannedBy: req.user?.id,
        stage: 'EXIT',
        outcome: 'REJECTED',
        reason: tokenCheck.error,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
      await addSystemActionLogIfPossible({
        gatePassId: 'N/A',
        markedBy: req.user?.id,
        metadata: { source: 'scan-exit', outcome: 'TOKEN_REJECTED', reason: tokenCheck.error },
      });
      return res.status(tokenCheck.status).json({ error: tokenCheck.error });
    }

    const gatePass = await GatePass.findOne({
      gatePassId: tokenCheck.payload.gatePassId,
      userId: tokenCheck.payload.userId,
    });

    if (!gatePass) {
      await addGateScanRecord({
        gatePassId: tokenCheck.payload.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'EXIT',
        outcome: 'REJECTED',
        reason: 'Gate pass not found',
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
      return res.status(404).json({ error: 'Gate pass not found' });
    }

    if (gatePass.status !== 'APPROVED') {
      await addGateScanRecord({
        gatePassId: gatePass.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'EXIT',
        outcome: 'REJECTED',
        reason: 'Exit allowed only for approved passes',
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
      return res.status(409).json({ error: 'Exit allowed only for approved passes' });
    }

    if (gatePass.exitMarkedAt) {
      await addGateScanRecord({
        gatePassId: gatePass.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'EXIT',
        outcome: 'REJECTED',
        reason: 'Exit already marked for this pass',
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
      return res.status(409).json({ error: 'Exit already marked for this pass' });
    }

    const gateState = await getOrCreateGateState(tokenCheck.payload.userId);
    if (gateState.currentState !== 'INSIDE_HOSTEL' && gateState.currentState !== 'INSIDE_CAMPUS') {
      await addGateScanRecord({
        gatePassId: gatePass.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'EXIT',
        outcome: 'REJECTED',
        reason: 'Student must be inside campus to exit',
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
      return res.status(409).json({ error: 'Student must be inside campus to exit' });
    }

    const consumeResult = await consumeValidatedScanToken(parsed.data.token);
    if (!consumeResult.ok) {
      await addGateScanRecord({
        gatePassId: gatePass.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'EXIT',
        outcome: 'REJECTED',
        reason: consumeResult.error,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
      return res.status(consumeResult.status).json({ error: consumeResult.error });
    }

    const now = new Date();
    gatePass.exitMarkedAt = now;
    await gatePass.save();

    gateState.currentState = 'OUTSIDE_CAMPUS';
    gateState.lastExitTime = now;
    await gateState.save();

    await addGateLog({
      userId: tokenCheck.payload.userId,
      gatePassId: gatePass.gatePassId,
      type: 'EXIT',
      markedBy: req.user!.id,
      metadata: { latitude: parsed.data.latitude, longitude: parsed.data.longitude },
    });
    await addGateScanRecord({
      gatePassId: gatePass.gatePassId,
      userId: tokenCheck.payload.userId,
      scannedBy: req.user?.id,
      stage: 'EXIT',
      outcome: 'SUCCESS',
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
    });
    invalidateMealCountCache();

    return res.json({ success: true, gatePass, gateState });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to verify exit' });
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
      await addGateScanRecord({
        scannedBy: req.user?.id,
        stage: 'CAMPUS_ENTRY',
        outcome: 'REJECTED',
        reason: tokenCheck.error,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
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
      await addGateScanRecord({
        gatePassId: tokenCheck.payload.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'CAMPUS_ENTRY',
        outcome: 'REJECTED',
        reason: 'Gate pass not found',
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
      await addSystemActionLogIfPossible({
        userId: tokenCheck.payload.userId,
        gatePassId: tokenCheck.payload.gatePassId,
        markedBy: req.user?.id,
        metadata: { source: 'scan-campus-entry', outcome: 'PASS_NOT_FOUND' },
      });
      return res.status(404).json({ error: 'Gate pass not found' });
    }
    if (gatePass.status !== 'APPROVED' && gatePass.status !== 'LATE') {
      await addGateScanRecord({
        gatePassId: gatePass.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'CAMPUS_ENTRY',
        outcome: 'REJECTED',
        reason: 'Gate pass is not in entry-allowed status',
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
      await addSystemActionLogIfPossible({
        userId: tokenCheck.payload.userId,
        gatePassId: gatePass.gatePassId,
        markedBy: req.user?.id,
        metadata: { source: 'scan-campus-entry', outcome: 'INVALID_PASS_STATUS', status: gatePass.status },
      });
      return res.status(409).json({ error: 'Gate pass is not in entry-allowed status' });
    }

    if (gatePass.enteredCampusAt) {
      await addGateScanRecord({
        gatePassId: gatePass.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'CAMPUS_ENTRY',
        outcome: 'REJECTED',
        reason: 'Campus entry already recorded for this pass',
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
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
      await addGateScanRecord({
        gatePassId: gatePass.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'CAMPUS_ENTRY',
        outcome: 'REJECTED',
        reason: 'Invalid state transition: expected OUTSIDE_CAMPUS',
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
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
      await addGateScanRecord({
        gatePassId: gatePass.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'CAMPUS_ENTRY',
        outcome: 'REJECTED',
        reason: consumeResult.error,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
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
    await addGateScanRecord({
      gatePassId: gatePass.gatePassId,
      userId: tokenCheck.payload.userId,
      scannedBy: req.user?.id,
      stage: 'CAMPUS_ENTRY',
      outcome: 'SUCCESS',
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
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
      await addGateScanRecord({
        scannedBy: req.user?.id,
        stage: 'HOSTEL_ENTRY',
        outcome: 'REJECTED',
        reason: tokenCheck.error,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
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
      await addGateScanRecord({
        gatePassId: tokenCheck.payload.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'HOSTEL_ENTRY',
        outcome: 'REJECTED',
        reason: 'Gate pass not found',
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
      await addSystemActionLogIfPossible({
        userId: tokenCheck.payload.userId,
        gatePassId: tokenCheck.payload.gatePassId,
        markedBy: req.user?.id,
        metadata: { source: 'scan-hostel-entry', outcome: 'PASS_NOT_FOUND' },
      });
      return res.status(404).json({ error: 'Gate pass not found' });
    }

    if (gatePass.status !== 'APPROVED' && gatePass.status !== 'LATE') {
      await addGateScanRecord({
        gatePassId: gatePass.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'HOSTEL_ENTRY',
        outcome: 'REJECTED',
        reason: 'Gate pass is not in entry-allowed status',
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
      await addSystemActionLogIfPossible({
        userId: tokenCheck.payload.userId,
        gatePassId: gatePass.gatePassId,
        markedBy: req.user?.id,
        metadata: { source: 'scan-hostel-entry', outcome: 'INVALID_PASS_STATUS', status: gatePass.status },
      });
      return res.status(409).json({ error: 'Gate pass is not in entry-allowed status' });
    }

    if (gatePass.enteredHostelAt) {
      await addGateScanRecord({
        gatePassId: gatePass.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'HOSTEL_ENTRY',
        outcome: 'REJECTED',
        reason: 'Hostel entry already recorded for this pass',
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
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
      await addGateScanRecord({
        gatePassId: gatePass.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'HOSTEL_ENTRY',
        outcome: 'REJECTED',
        reason: 'Invalid state transition: expected INSIDE_CAMPUS',
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
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
      await addGateScanRecord({
        gatePassId: gatePass.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'HOSTEL_ENTRY',
        outcome: 'REJECTED',
        reason: consumeResult.error,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
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
      await addGateScanRecord({
        gatePassId: gatePass.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'HOSTEL_ENTRY',
        outcome: 'REJECTED',
        reason: 'User not found',
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
      return res.status(404).json({ error: 'User not found' });
    }

    const hostelConfig = HOSTEL_LOCATIONS[userRecord.hostelBlock];
    if (!hostelConfig || !hostelConfig.center || !hostelConfig.radius) {
      await addGateScanRecord({
        gatePassId: gatePass.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'HOSTEL_ENTRY',
        outcome: 'REJECTED',
        reason: 'Hostel geofence not configured for user block',
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
      return res.status(400).json({ error: 'Hostel geofence not configured for user block' });
    }

    if (typeof parsed.data.latitude !== 'number' || typeof parsed.data.longitude !== 'number') {
      await addGateScanRecord({
        gatePassId: gatePass.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'HOSTEL_ENTRY',
        outcome: 'REJECTED',
        reason: 'Latitude and longitude are required for hostel entry',
      });
      return res.status(400).json({ error: 'Latitude and longitude are required for hostel entry' });
    }

    const distance = getDistanceMeters(
      parsed.data.latitude,
      parsed.data.longitude,
      hostelConfig.center.latitude,
      hostelConfig.center.longitude
    );
    if (distance > hostelConfig.radius) {
      await addGateScanRecord({
        gatePassId: gatePass.gatePassId,
        userId: tokenCheck.payload.userId,
        scannedBy: req.user?.id,
        stage: 'HOSTEL_ENTRY',
        outcome: 'REJECTED',
        reason: 'Location outside hostel radius. Hostel entry denied.',
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      });
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
    await addGateScanRecord({
      gatePassId: gatePass.gatePassId,
      userId: tokenCheck.payload.userId,
      scannedBy: req.user?.id,
      stage: 'HOSTEL_ENTRY',
      outcome: 'SUCCESS',
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
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

router.get('/curfew-config', authMiddleware, requireRoles(['admin']), async (_req: RequestWithUser, res) => {
  try {
    const existing = await CurfewConfig.findOne({ key: 'default' }).lean<{
      curfewHour: number;
      curfewMinute: number;
      checkIntervalMs: number;
    }>();

    return res.json({
      curfewHour: existing?.curfewHour ?? 19,
      curfewMinute: existing?.curfewMinute ?? 30,
      checkIntervalMs: existing?.checkIntervalMs ?? 600_000,
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to fetch curfew config' });
  }
});

router.put('/curfew-config', authMiddleware, requireRoles(['admin']), async (req: RequestWithUser, res) => {
  try {
    const parsed = curfewConfigSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const config = await CurfewConfig.findOneAndUpdate(
      { key: 'default' },
      {
        $set: {
          key: 'default',
          curfewHour: parsed.data.curfewHour,
          curfewMinute: parsed.data.curfewMinute,
          updatedBy: new mongoose.Types.ObjectId(req.user!.id),
          ...(parsed.data.checkIntervalMs ? { checkIntervalMs: parsed.data.checkIntervalMs } : {}),
        },
      },
      { new: true, upsert: true }
    );

    return res.json({ success: true, config });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to update curfew config' });
  }
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

  if (req.user!.role?.toLowerCase() === 'student' && req.user!.id !== parsed.data) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const gateState = await getOrCreateGateState(parsed.data);
  return res.json({ gateState });
});

router.get('/passes/:gatePassId', authMiddleware, requireRoles(['admin', 'gatekeeper', 'student']), async (req: RequestWithUser, res) => {
  const gatePass = await GatePass.findOne({ gatePassId: req.params.gatePassId })
    .populate('userId', 'name registerId hostelBlock roomNumber')
    .populate('approvedBy', 'name registerId');
  if (!gatePass) {
    return res.status(404).json({ error: 'Gate pass not found' });
  }
  if (req.user!.role?.toLowerCase() === 'student' && gatePass.userId && resolvePassUserId(gatePass.userId) !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return res.json({ gatePass });
});

router.get('/passes/:gatePassId/qr-image', authMiddleware, async (req: RequestWithUser, res) => {
  try {
    const stage = (req.query.stage as GateStage) || 'EXIT';
    if (stage !== 'EXIT' && stage !== 'CAMPUS_ENTRY' && stage !== 'HOSTEL_ENTRY') {
      return res.status(400).json({ error: 'Invalid stage' });
    }

    const gatePass = await GatePass.findOne({ gatePassId: req.params.gatePassId });
    if (!gatePass) {
      return res.status(404).json({ error: 'Gate pass not found' });
    }

    if (req.user!.role?.toLowerCase() === 'student' && resolvePassUserId(gatePass.userId) !== req.user!.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (gatePass.status !== 'APPROVED' && gatePass.status !== 'LATE') {
      return res.status(409).json({ error: 'QR only available for active passes' });
    }

    const tokenData = await createSignedGateQrToken({
      userId: resolvePassUserId(gatePass.userId),
      gatePassId: gatePass.gatePassId,
      stage,
    });

    const qrBuffer = await QRCode.toBuffer(tokenData.token, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M',
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('X-Token-Expires-At', tokenData.expiresAt.toISOString());
    res.setHeader('X-Token-TTL', String(tokenData.ttlSeconds));
    return res.send(qrBuffer);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to generate QR image' });
  }
});

router.get('/passes/:gatePassId/pdf', authMiddleware, requireRoles(['admin', 'gatekeeper', 'student']), async (req: RequestWithUser, res) => {
  const stage = (req.query.stage as GateStage) || 'EXIT';
  if (stage !== 'EXIT' && stage !== 'CAMPUS_ENTRY' && stage !== 'HOSTEL_ENTRY') {
    return res.status(400).json({ error: 'Invalid stage' });
  }

  const gatePass = await GatePass.findOne({ gatePassId: req.params.gatePassId }).populate(
    'userId',
    'name registerId hostelBlock roomNumber'
  );

  if (!gatePass) {
    return res.status(404).json({ error: 'Gate pass not found' });
  }

  if (req.user!.role?.toLowerCase() === 'student' && gatePass.userId && resolvePassUserId(gatePass.userId) !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (gatePass.status !== 'APPROVED' && gatePass.status !== 'LATE') {
    return res.status(409).json({ error: 'PDF is available only for active gate passes' });
  }

  const user = gatePass.userId as unknown as {
    name: string;
    registerId: string;
    hostelBlock: string;
    roomNumber?: string;
  };

  const approvedByRecord = gatePass.approvedBy as unknown as
    | { name?: string; registerId?: string }
    | mongoose.Types.ObjectId
    | undefined;
  const approvedByName =
    approvedByRecord && typeof approvedByRecord === 'object' && 'name' in approvedByRecord
      ? (approvedByRecord.name || 'N/A')
      : gatePass.approvedBy
        ? gatePass.approvedBy.toString()
        : 'N/A';

  const approvedByRegisterId =
    approvedByRecord && typeof approvedByRecord === 'object' && 'registerId' in approvedByRecord
      ? approvedByRecord.registerId
      : undefined;

  const qrDetailsText = [
    'HostelEase Gate Pass',
    `Gate Pass ID: ${gatePass.gatePassId}`,
    `Status: ${gatePass.status}`,
    `Category: ${gatePass.category}`,
    `Approved At: ${gatePass.approvalTimestamp ? new Date(gatePass.approvalTimestamp).toISOString() : 'N/A'}`,
    'Student Details',
    `Name: ${user?.name || 'N/A'}`,
    `Register ID: ${user?.registerId || 'N/A'}`,
    `Hostel: ${user?.hostelBlock || 'N/A'}`,
    `Room: ${user?.roomNumber || 'N/A'}`,
    'Pass Details',
    `Reason: ${gatePass.reason}`,
    `Destination: ${gatePass.destination}`,
    `Expected Return Time: ${new Date(gatePass.expectedReturnTime).toISOString()}`,
    `Approved Return Time: ${gatePass.approvedReturnTime ? new Date(gatePass.approvedReturnTime).toISOString() : 'N/A'}`,
    'Approval Section',
    `Approved By: ${approvedByName}${approvedByRegisterId ? ` (${approvedByRegisterId})` : ''}`,
    `Approval Timestamp: ${gatePass.approvalTimestamp ? new Date(gatePass.approvalTimestamp).toISOString() : 'N/A'}`,
  ].join('\n');

  const qrDataUrl = await QRCode.toDataURL(qrDetailsText, {
    margin: 1,
    width: 220,
    errorCorrectionLevel: 'M',
  });
  const qrBase64 = qrDataUrl.split(',')[1];
  const qrBuffer = Buffer.from(qrBase64, 'base64');

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
  doc.fontSize(11).text(`Approved By: ${approvedByName}${approvedByRegisterId ? ` (${approvedByRegisterId})` : ''}`);
  doc.text(`Approval Timestamp: ${gatePass.approvalTimestamp ? new Date(gatePass.approvalTimestamp).toISOString() : 'N/A'}`);
  doc.moveDown();

  doc.fontSize(13).text('QR Reference', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(9).text('This is a general QR. It can be scanned with any QR app (Google Lens, etc.) to view gate pass details.', { lineGap: 2 });
  doc.moveDown(0.5);
  doc.image(qrBuffer, { fit: [160, 160], align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(9).text('QR contains summary fields shown above (ID, student, pass details, approval details).');
  doc.moveDown();

  doc.fontSize(13).text('Movement Tracking', { underline: true });
  doc.fontSize(11).text(`Exit Marked At: ${gatePass.exitMarkedAt ? new Date(gatePass.exitMarkedAt).toISOString() : 'Not yet'}`);
  doc.text(`Entered Campus At: ${gatePass.enteredCampusAt ? new Date(gatePass.enteredCampusAt).toISOString() : 'Not yet'}`);
  doc.text(`Entered Hostel At: ${gatePass.enteredHostelAt ? new Date(gatePass.enteredHostelAt).toISOString() : 'Not yet'}`);
  doc.text(`Actual Return: ${gatePass.actualReturnTime ? new Date(gatePass.actualReturnTime).toISOString() : 'Pending'}`);
  doc.text(`Final Status: ${gatePass.finalStatus || gatePass.status}`);

  doc.end();
  return undefined;
});

export default router;
