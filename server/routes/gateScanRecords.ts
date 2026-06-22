import express from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../middleware/auth';
import { requireRoles } from '../middleware/roleGuard';
import GateScanRecord from '../models/GateScanRecord';

const router = express.Router();

router.get('/', authMiddleware, requireRoles(['admin', 'gatekeeper']), async (req, res) => {
  const limit = Math.min(Number.parseInt((req.query.limit as string) || '200', 10), 500);
  const stage = req.query.stage as 'EXIT' | 'CAMPUS_ENTRY' | 'HOSTEL_ENTRY' | undefined;
  const outcome = req.query.outcome as 'SUCCESS' | 'REJECTED' | undefined;

  const filter: Record<string, unknown> = {};
  if (stage) {
    filter.stage = stage;
  }
  if (outcome) {
    filter.outcome = outcome;
  }

  const records = await GateScanRecord.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'name registerId hostelBlock roomNumber')
    .populate('scannedBy', 'name registerId role')
    .lean();

  return res.json({ records });
});

router.get('/user/:userId', authMiddleware, requireRoles(['admin', 'gatekeeper', 'student']), async (req: any, res) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  if (req.user?.role === 'student' && req.user.id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const records = await GateScanRecord.find({ userId })
    .sort({ createdAt: -1 })
    .limit(300)
    .populate('scannedBy', 'name registerId role')
    .lean();

  return res.json({ records });
});

export default router;
