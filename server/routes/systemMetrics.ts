import express from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireRoles } from '../middleware/roleGuard';
import { getSystemMetricsSnapshot } from '../services/systemMetrics';

const router = express.Router();

router.get('/metrics', authMiddleware, requireRoles(['admin']), async (_req, res) => {
  const metrics = await getSystemMetricsSnapshot();
  return res.json(metrics);
});

export default router;
