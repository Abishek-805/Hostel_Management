import express from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireRoles } from '../middleware/roleGuard';
import { calculateDailyCounts, calculateRangeCounts } from '../services/mealCountService';
import { startOfLocalDay } from '../services/mealSlots';

const router = express.Router();

const dateQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const rangeQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function parseLocalDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map((token) => Number.parseInt(token, 10));
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

router.get('/daily', authMiddleware, requireRoles(['admin']), async (req, res) => {
  const parsed = dateQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const targetDate = parseLocalDateInput(parsed.data.date);
  if (Number.isNaN(targetDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date query parameter' });
  }

  const result = await calculateDailyCounts(startOfLocalDay(targetDate));
  return res.json(result);
});

router.get('/range', authMiddleware, requireRoles(['admin']), async (req, res) => {
  const parsed = rangeQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const startDate = parseLocalDateInput(parsed.data.start);
  const endDate = parseLocalDateInput(parsed.data.end);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date range parameters' });
  }

  if (startDate.getTime() > endDate.getTime()) {
    return res.status(400).json({ error: 'Start date must be less than or equal to end date' });
  }

  const daySpan = Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  if (daySpan > 31) {
    return res.status(400).json({ error: 'Range query supports up to 31 days' });
  }

  const result = await calculateRangeCounts(startDate, endDate);
  return res.json(result);
});

export default router;
