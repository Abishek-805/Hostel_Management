import express from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireRoles } from '../middleware/roleGuard';
import Notification from '../models/Notification';

const router = express.Router();

/**
 * GET /api/notifications
 * Fetch notifications for the logged-in admin.
 * Query params:
 *   - page (default 1)
 *   - limit (default 20, max 100)
 *   - type (optional filter: LATE_RETURN, CURFEW_VIOLATION, etc.)
 *   - unreadOnly (optional: "true" to show unread only)
 */
router.get('/', authMiddleware, requireRoles(['admin', 'student']), async (req: any, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter: any = { recipientId: req.user.id };

    if (req.query.type) {
      filter.type = req.query.type;
    }

    if (req.query.unreadOnly === 'true') {
      filter.read = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('studentId', 'name registerId hostelBlock roomNumber')
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipientId: req.user.id, read: false }),
    ]);

    res.json({
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      unreadCount,
    });
  } catch (error) {
    console.error('[notifications] GET error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * GET /api/notifications/unread-count
 * Quick count of unread notifications for badge display.
 */
router.get('/unread-count', authMiddleware, requireRoles(['admin', 'student']), async (req: any, res) => {
  try {
    const count = await Notification.countDocuments({
      recipientId: req.user.id,
      read: false,
    });
    res.json({ unreadCount: count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
router.patch('/:id/read', authMiddleware, requireRoles(['admin', 'student']), async (req: any, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user.id },
      { $set: { read: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ success: true, notification });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * PATCH /api/notifications/mark-all-read
 * Mark all notifications for this admin as read.
 */
router.patch('/mark-all-read', authMiddleware, requireRoles(['admin', 'student']), async (req: any, res) => {
  try {
    const result = await Notification.updateMany(
      { recipientId: req.user.id, read: false },
      { $set: { read: true } }
    );

    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a single notification.
 */
router.delete('/:id', authMiddleware, requireRoles(['admin', 'student']), async (req: any, res) => {
  try {
    const result = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipientId: req.user.id,
    });

    if (!result) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

/**
 * GET /api/notifications/late-students
 * Dedicated endpoint showing late students with full details.
 * Includes: Student Name, Register ID, GatePassId, Exit Time,
 * Entry Time, Expected Return Time, Late Duration.
 */
router.get('/late-students', authMiddleware, requireRoles(['admin']), async (req: any, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter: any = {
      recipientId: req.user.id,
      type: 'LATE_RETURN',
    };

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('studentId', 'name registerId hostelBlock roomNumber')
        .lean(),
      Notification.countDocuments(filter),
    ]);

    // Enrich with current late duration
    const now = new Date();
    const enriched = notifications.map((n: any) => ({
      ...n,
      details: {
        ...n.details,
        lateDurationMinutes: n.details?.expectedReturnTime
          ? Math.max(0, Math.round((now.getTime() - new Date(n.details.expectedReturnTime).getTime()) / 60000))
          : n.details?.lateDurationMinutes || 0,
      },
    }));

    res.json({
      lateStudents: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[notifications] late-students error:', error);
    res.status(500).json({ error: 'Failed to fetch late students' });
  }
});

export default router;
