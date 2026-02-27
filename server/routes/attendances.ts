import express from 'express';
import Attendance from '../models/Attendance';
import User from '../models/User';
import HostelSettings from '../models/HostelSettings';
import LeaveRequest from '../models/LeaveRequest';
import { authMiddleware } from '../middleware/auth';
import ExcelJS from 'exceljs';
import { validateAttendanceTimeWindow, getFormattedISTTime } from '../utils/timezone';


const router = express.Router();

// Get all attendances (Admin view - Scoped by Block)
router.get('/', authMiddleware, async (req: any, res) => {
  try {
    // Fetch latest user data to ensure valid hostelBlock
    const User = (await import('../models/User')).default;
    const admin = await User.findById(req.user.id);

    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    // Admin sees only attendances from their block
    const studentsInBlock = await (await import('../models/User')).default.find({ hostelBlock: admin.hostelBlock }).select('_id');
    const studentIds = studentsInBlock.map(s => s._id);

    const attendances = await Attendance.find({ userId: { $in: studentIds } })
      .populate('userId', 'name registerId hostelBlock')
      .sort({ markedAt: -1 })
      .lean();

    res.json(attendances);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get attendances by user
router.get('/user/:userId', authMiddleware, async (req: any, res) => {
  try {
    // Security: Only own data or admin of same block
    if (req.params.userId !== req.user.id) {
      if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

      const targetUser = await User.findById(req.params.userId);
      if (!targetUser || targetUser.hostelBlock !== req.user.hostelBlock) {
        return res.status(403).json({ error: 'Unauthorized block access' });
      }
    }

    const attendances = await Attendance.find({ userId: req.params.userId });
    res.json(attendances);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Check attendance for a specific user and date
router.get('/check/:userId/:date', authMiddleware, async (req: any, res) => {
  try {
    const { userId, date } = req.params;

    // Security: Only own check allowed (or admin)
    if (userId !== req.user.id) {
      if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

      const targetUser = await User.findById(userId);
      if (!targetUser || targetUser.hostelBlock !== req.user.hostelBlock) {
        return res.status(403).json({ error: 'Unauthorized block access' });
      }
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const attendances = await Attendance.find({
      userId,
      date: { $gte: startOfDay, $lte: endOfDay }
    });

    const morning = attendances.find(a => a.session === 'morning');
    const afternoon = attendances.find(a => a.session === 'afternoon');

    res.json({
      morningMarked: !!morning,
      afternoonMarked: !!afternoon,
      morning,
      afternoon
    });
  } catch (error) {
    console.error("CHECK ERROR:", error);
    res.status(500).json({ error: 'Server error CHECK' });
  }
});

// Get attendance by date (Admin - Scoped by Block)
router.get('/date/:date', authMiddleware, async (req: any, res) => {
  try {
    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { date } = req.params;
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const isHoliday = false; // Removed automatic weekend holiday logic

    const students = await User.find({ role: 'student', hostelBlock: admin.hostelBlock }).select('name registerId hostelBlock');
    const attendances = await Attendance.find({
      date: { $gte: startOfDay, $lte: endOfDay },
      userId: { $in: students.map(s => s._id) }
    }).lean();

    const hSettings = await HostelSettings.findOne({ hostelBlock: admin.hostelBlock }).lean() as any;
    const isHostelLeave = hSettings && hSettings.leaveWindowLabel && hSettings.leaveWindowFrom && hSettings.leaveWindowTo &&
      endOfDay >= new Date(new Date(hSettings.leaveWindowFrom).setHours(0, 0, 0, 0)) &&
      startOfDay <= new Date(new Date(hSettings.leaveWindowTo).setHours(23, 59, 59, 999));

    const approvedLeaves = await LeaveRequest.find({
      status: 'approved',
      hostelBlock: admin.hostelBlock, // Added for strict isolation & efficiency
      fromDate: { $lte: endOfDay },
      toDate: { $gte: startOfDay }
    }).select('userId').lean();

    const result = students.reduce((acc: any[], student) => {
      const studentAttendances = attendances.filter(a => a.userId.toString() === student._id.toString());
      const isOnApprovedLeave = approvedLeaves.some(l => l.userId.toString() === student._id.toString());
      const studentIsOnLeave = isOnApprovedLeave || isHostelLeave;

      ['morning', 'afternoon'].forEach(session => {
        const existing = studentAttendances.find(a => a.session === session);
        const calculatedStatus = existing?.isPresent ? 'present' : (isOnApprovedLeave ? 'leave' : (isHostelLeave ? 'holiday' : (isHoliday ? 'holiday' : 'absent')));
        if (existing) {
          acc.push({
            ...existing,
            userId: student,
            status: calculatedStatus,
            isLeave: !existing.isPresent && isOnApprovedLeave,
            isHoliday: isHostelLeave || isHoliday
          });
        } else {
          acc.push({
            userId: student,
            isPresent: false,
            isLeave: isOnApprovedLeave,
            isHoliday: isHostelLeave || isHoliday,
            session,
            markedAt: startOfDay,
            status: calculatedStatus
          });
        }
      });
      return acc;
    }, []);

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json(result);
  } catch (error) {
    console.error("DATE ERROR:", error);
    res.status(500).json({ error: 'Server error DATE' });
  }
});

// Get today's attendance (Admin - Scoped by Block)
router.get("/today", authMiddleware, async (req: any, res) => {
  try {
    // Fetch latest user data to ensure valid hostelBlock
    const User = (await import('../models/User')).default;
    const admin = await User.findById(req.user.id);

    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    // Get student IDs in admin's block
    const studentIdsInBlock = await User.distinct('_id', { role: 'student', hostelBlock: admin.hostelBlock });

    const attendances = await Attendance.find({
      date: { $gte: startOfDay, $lte: endOfDay },
      userId: { $in: studentIdsInBlock }
    }).populate("userId", "name registerId hostelBlock");

    res.json(attendances);
  } catch (error) {
    res.status(500).json({ error: "Server error TODAY" });
  }
});

// Get simple stats for a specific user
router.get("/stats/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const mongoose = (await import('mongoose')).default;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const [attendances, leaves, hostelSettings] = await Promise.all([
      Attendance.find({ userId: new mongoose.Types.ObjectId(userId) }).lean(),
      LeaveRequest.find({ userId: new mongoose.Types.ObjectId(userId), status: 'approved' }).lean(),
      HostelSettings.findOne({ hostelBlock: user.hostelBlock }).lean() as any
    ]);

    const allAttendances = await Attendance.find().lean();
    const uniqueDates = Array.from(new Set(allAttendances.map(a => {
      const d = new Date(a.date);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }))).sort();

    let present = 0;
    let absent = 0;
    let leave = 0;

    uniqueDates.forEach(dateTime => {
      const date = new Date(dateTime);
      const attendance = attendances.find(a => {
        const ad = new Date(a.date);
        return ad.getFullYear() === date.getFullYear() && ad.getMonth() === date.getMonth() && ad.getDate() === date.getDate();
      });

      if (attendance && (attendance as any).isPresent) {
        present++;
      } else {
        const isOnApprovedLeave = leaves.some(l => {
          const from = new Date(l.fromDate);
          const to = new Date(l.toDate);
          return date >= from && date <= to;
        });

        const isHostelLeave = hostelSettings &&
          hostelSettings.leaveWindowLabel &&
          hostelSettings.leaveWindowFrom &&
          hostelSettings.leaveWindowTo &&
          new Date(date.getTime() + 86399999) >= new Date(new Date(hostelSettings.leaveWindowFrom).setHours(0, 0, 0, 0)) &&
          date <= new Date(new Date(hostelSettings.leaveWindowTo).setHours(23, 59, 59, 999));

        if (isOnApprovedLeave) {
          leave++;
        } else if (isHostelLeave) {
          // Holiday: not absent, not leave in personal stats
        } else {
          absent++;
        }
      }
    });

    const total = present + absent;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

    res.json({
      present,
      absent,
      leave,
      percentage
    });
  } catch (error) {
    console.error("STATS ERROR:", error);
    res.status(500).json({ error: "Server error STATS" });
  }
});

// @ts-ignore - config path exists
import { HOSTEL_LOCATIONS } from '../config/hostels';
import { getFaceEmbedding, calculateSimilarity } from '../services/faceRecognition';

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}

function isPointInPolygon(
  lat: number,
  lon: number,
  polygon: Array<{ latitude: number; longitude: number }>
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].latitude;
    const yi = polygon[i].longitude;
    const xj = polygon[j].latitude;
    const yj = polygon[j].longitude;

    const intersect =
      yi > lon !== yj > lon &&
      lat < ((xj - xi) * (lon - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Mark attendance with Triple Verification
router.post('/', authMiddleware, async (req, res) => {

  try {
    const { userId, date, isPresent, photoUrl, latitude, longitude, reason, selectedHostel } = req.body;

    // 0. Sanitize photoUrl - remove double prefixes
    let sanitizedPhotoUrl = photoUrl;
    if (photoUrl && typeof photoUrl === 'string') {
      const parts = photoUrl.split('base64,');
      if (parts.length > 2) {
        // We have double prefix, e.g. data:image/jpeg;base64,data:image/png;base64,...
        sanitizedPhotoUrl = `data:image/jpeg;base64,${parts[parts.length - 1]}`;
      }
    }

    // 1. Fetch User to get their Hostel and Face Embedding
    const User = (await import('../models/User')).default;
    const user = await User.findById(userId);

    if (user) {
      console.log(`🔍 Checking attendance for ${user.name} (ID: ${user._id})`);
      console.log(`   - Face ID present: ${!!user.faceEmbedding}, Length: ${user.faceEmbedding?.length}`);
    }

    if (!user) {
      console.log(`❌ User not found for ID: ${userId}`);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`👤 User fetched: ${user.name} (${user._id})`);
    console.log(`👤 Face Embedding Status: ${user.faceEmbedding ? 'Present' : 'Missing'}, Length: ${user.faceEmbedding?.length}`);

    // Check for session using IST (India Standard Time)
    const { allowed, session, currentTime } = validateAttendanceTimeWindow();
    console.log(`🕐 IST Time: ${getFormattedISTTime()} | Allowed: ${allowed} | Session: ${session}`);

    if (!session && isPresent) {
      return res.status(400).json({
        error: `Attendance can only be marked between 07:00 AM - 12:30 PM (Morning) or 12:30 PM - 06:00 PM (Afternoon). Current IST time: ${currentTime}.`
      });
    }

    // Check for existing attendance for this date and session
    const attendanceDate = new Date(date);
    const startOfDay = new Date(attendanceDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(attendanceDate);
    endOfDay.setHours(23, 59, 59, 999);

    const query: any = {
      userId,
      date: { $gte: startOfDay, $lte: endOfDay }
    };
    if (session) query.session = session;

    const existingAttendance = await Attendance.findOne(query);

    if (existingAttendance && isPresent) {
      return res.status(400).json({ error: `Attendance already marked for ${session} session today.` });
    }

    // 2. Validate GPS (Geofencing) - Strict Enforcement: Students can ONLY mark for their own block
    const hostelToValidate = user.hostelBlock; // Ignore selectedHostel for security
    const hostelConfig = HOSTEL_LOCATIONS[hostelToValidate];

    console.log(`📍 Geofencing check for ${hostelToValidate}`);
    console.log(`   User location: ${latitude}, ${longitude}`);
    console.log(`   Hostel center: ${hostelConfig?.center?.latitude}, ${hostelConfig?.center?.longitude}`);
    console.log(`   Hostel radius: ${hostelConfig?.radius}m`);

    // Skip geofencing for web/testing
    const isWebTest = latitude === "web" || latitude === undefined || longitude === undefined;

    if (hostelConfig && latitude && longitude && !isWebTest) {
      let isInside = false;

      if (hostelConfig.radius && hostelConfig.center) {
        const distance = getDistance(
          parseFloat(latitude),
          parseFloat(longitude),
          hostelConfig.center.latitude,
          hostelConfig.center.longitude
        );
        console.log(`📍 Distance from center: ${distance.toFixed(2)}m (Max: ${hostelConfig.radius}m)`);
        console.log(`   ${distance <= hostelConfig.radius ? '✅ INSIDE' : '❌ OUTSIDE'} geofence`);
        isInside = distance <= hostelConfig.radius;
      } else {
        isInside = isPointInPolygon(
          parseFloat(latitude),
          parseFloat(longitude),
          hostelConfig.points
        );
        console.log(`   Polygon check: ${isInside ? '✅ INSIDE' : '❌ OUTSIDE'}`);
      }

      if (!isInside) {
        return res.status(400).json({
          error: `Location validation failed. You are outside ${hostelToValidate} boundaries.`
        });
      }
    } else if (!isWebTest) {
      console.log(`⏭️ Skipping geofencing check for web/test environment`);
    } else if (!hostelConfig && isPresent) {
      console.warn(`No coordinates configured for hostel: ${hostelToValidate}`);
    }

    // 3. Face Verification using FaceNet (JS-based)
    if (isPresent && photoUrl) {
      // Check if user has a registered Face ID (embedding)
      if (!user.faceEmbedding || user.faceEmbedding.length === 0) {
        console.log(`❌ No face embedding registered for ${user.name}`);
        return res.status(400).json({ error: 'Face ID not registered. Please tap your profile picture to register your Face ID.' });
      }

      try {
        console.log(`\n🔍 === FACE VERIFICATION START for ${user.name} ===`);
        const faceStartTime = Date.now();

        // Generate embedding for the current capture
        let currentEmbedding;
        try {
          currentEmbedding = await getFaceEmbedding(sanitizedPhotoUrl);
        } catch (faceError: any) {
          console.log(`❌ Face detection/verification error: ${faceError.message}`);
          const message = faceError?.message || 'Face verification failed';
          const statusCode = message.includes('currently unavailable') ? 503 : 400;
          return res.status(statusCode).json({ error: message });
        }
        const faceElapsed = Date.now() - faceStartTime;

        // Compare current embedding with stored Face ID
        const similarity = calculateSimilarity(user.faceEmbedding, Array.from(currentEmbedding));

        console.log(`📊 Face matching result: ${similarity.toFixed(2)}% similarity (checked in ${faceElapsed}ms)`);

        const MATCH_THRESHOLD = 50; // Threshold for FaceNet (Cosine Similarity * 100)

        if (similarity < MATCH_THRESHOLD) {
          return res.status(400).json({
            error: `Face mismatch! Similarity: ${similarity.toFixed(1)}%. Please ensure it's you.`
          });
        }

        console.log(`✅ Face ID verified for ${user.name}`);
      } catch (err: any) {
        console.error("Face verification error:", err);
        // Fallback or stricter error handling
        return res.status(500).json({ error: 'Face verification service error. Please try again.' });
      }
    }

    const attendance = new Attendance({
      userId,
      date,
      isPresent,
      photoUrl: sanitizedPhotoUrl, // Use sanitized URL
      latitude,
      longitude,
      reason,
      status: isPresent ? 'present' : 'absent',
      session: session || 'morning' // Fallback for manual admin entries if needed
    });
    await attendance.save();
    res.status(201).json(attendance);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update attendance (Admin - Scoped by Block)
router.put('/:id', authMiddleware, async (req: any, res) => {
  try {
    // Fetch latest user data to ensure valid hostelBlock
    const User = (await import('../models/User')).default;
    const admin = await User.findById(req.user.id);

    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    // Get the attendance record and verify it belongs to admin's block
    const attendance = await Attendance.findById(req.params.id).populate('userId', 'hostelBlock');

    if (!attendance) {
      return res.status(404).json({ error: 'Attendance not found' });
    }

    // Verify the student belongs to admin's block
    if ((attendance.userId as any).hostelBlock !== admin.hostelBlock) {
      return res.status(403).json({ error: 'Unauthorized to update attendance from another block' });
    }

    const updated = await Attendance.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete today's attendance (For testing)
// Delete today's attendance (For testing)
router.delete('/today/:userId', authMiddleware, async (req: any, res) => {

  try {
    const { userId } = req.params;
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    // Security check: Only own delete or admin of same block
    const targetUser = await User.findById(userId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    if (userId !== req.user.id) {
      if (req.user.role !== 'admin' || req.user.hostelBlock !== targetUser.hostelBlock) {
        return res.status(403).json({ error: 'Unauthorized to delete attendance' });
      }
    }

    const result = await Attendance.deleteMany({
      userId,
      date: { $gte: startOfDay, $lte: endOfDay }
    });

    res.json({
      message: 'Attendance deleted',
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting attendance:", error);
    res.status(500).json({ error: 'Server error DELETE TODAY' });
  }
});

// Delete attendance for specific user and date
router.delete('/user/:userId/date/:date', authMiddleware, async (req, res) => {

  try {
    const { userId, date } = req.params;
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Widen the search to account for timezone shifts.
    // If the user says "2025-12-17", we surely mean an attendance marked "approx now"
    // The previous math covers 00:00 to 23:59 LOCAL SERVER TIME.
    // But if sending dateStr, it's UTC 00:00.
    // Let's cover the entire 48h window surrounding that date to be safe, 
    // effectively catching any record marked "for that calendar date" in any timezone.

    // Better yet, just use a wider window.
    startOfDay.setDate(startOfDay.getDate() - 1);
    endOfDay.setDate(endOfDay.getDate() + 1);

    console.log(`--- DELETE REQUEST (WIDENED) ---`);
    console.log(`User: ${userId}, Date param: ${date}`);
    console.log(`Start of Day (Widened): ${startOfDay.toISOString()}`);
    console.log(`End of Day (Widened): ${endOfDay.toISOString()}`);

    // Debug: Find ALL records for this user to see what dates we have
    const allUserRecords = await Attendance.find({ userId });

    // Debug: Find specific range match
    const existing = await Attendance.find({
      userId,
      date: { $gte: startOfDay, $lte: endOfDay }
    });

    const result = await Attendance.deleteMany({
      userId,
      date: { $gte: startOfDay, $lte: endOfDay }
    });

    console.log(`Deleted count: ${result.deletedCount}`);
    console.log(`----------------------`);

    res.json({
      message: 'Attendance deleted',
      deletedCount: result.deletedCount,
      debug: {
        userId,
        dateParam: date,
        serverQueryStart: startOfDay.toISOString(),
        serverQueryEnd: endOfDay.toISOString(),
        foundRecordsInRange: existing.map(e => ({ id: e._id, date: e.date.toISOString() })),
        ALL_USER_RECORDS: allUserRecords.map(e => ({ id: e._id, date: e.date.toISOString() }))
      }
    });
  } catch (error) {
    console.error("Error deleting attendance:", error);
    res.status(500).json({ error: 'Server error DELETE DATE' });
  }
});


// Export Attendance to Excel
router.get('/export-excel', authMiddleware, async (req: any, res) => {
  try {
    const User = (await import('../models/User')).default;
    const admin = await User.findById(req.user.id);

    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Hostel Hub';
    workbook.lastModifiedBy = 'Hostel Hub Admin';
    workbook.created = new Date();

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // 1. Fetch Data Scoped to Admin's Block
    const students = await User.find({ role: 'student', hostelBlock: admin.hostelBlock }).sort({ name: 1 });
    const studentIds = students.map(s => s._id);

    const attendances = await Attendance.find({
      userId: { $in: studentIds }
    }).lean();

    const allApprovedLeaves = await LeaveRequest.find({
      userId: { $in: studentIds },
      status: 'approved'
    }).lean();

    const hostelSettings = await HostelSettings.findOne({
      hostelBlock: admin.hostelBlock
    }).lean();

    // Get range of last 30 days
    const dateRange: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dateRange.push(d);
    }
    dateRange.reverse();

    // 2. Create Main Sheet (Block Specific Summary)
    const sheet = workbook.addWorksheet(`Attendance Summary`);

    sheet.columns = [
      { header: 'Register ID', key: 'id', width: 15 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Room', key: 'room', width: 12 },
      { header: 'Morning Present', key: 'mPresent', width: 18 },
      { header: 'Morning Absent', key: 'mAbsent', width: 18 },
      { header: 'Afternoon Present', key: 'nPresent', width: 18 },
      { header: 'Afternoon Absent', key: 'nAbsent', width: 18 },
      { header: 'Total Leave', key: 'leave', width: 15 },
      { header: 'Attendance %', key: 'percentage', width: 15 },
    ];

    // Style Header
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Populate Summary
    students.forEach((student, studentIndex) => {
      const studentAttendances = attendances.filter(a => a.userId.toString() === student._id.toString());
      const studentLeaves = allApprovedLeaves.filter(l => l.userId.toString() === student._id.toString());

      let mPresent = 0, mAbsent = 0, nPresent = 0, nAbsent = 0, leaveCount = 0;

      dateRange.forEach(date => {
        const isOnApprovedLeave = studentLeaves.some(l =>
          new Date(date.getTime() + 86399999) >= new Date(new Date(l.fromDate).setHours(0, 0, 0, 0)) &&
          date <= new Date(new Date(l.toDate).setHours(23, 59, 59, 999))
        );
        const isHostelLeave = (hostelSettings as any) && (hostelSettings as any).leaveWindowLabel && (hostelSettings as any).leaveWindowFrom && (hostelSettings as any).leaveWindowTo &&
          new Date(date.getTime() + 86399999) >= new Date(new Date((hostelSettings as any).leaveWindowFrom).setHours(0, 0, 0, 0)) &&
          date <= new Date(new Date((hostelSettings as any).leaveWindowTo).setHours(23, 59, 59, 999));
        const isLeaveDay = isOnApprovedLeave || isHostelLeave;

        // Morning
        const morningRec = studentAttendances.find(a => new Date(a.date).toDateString() === date.toDateString() && a.session === 'morning');
        const isHoliday = false; // Removed automatic weekend holiday logic

        if (morningRec && (morningRec as any).isPresent) mPresent++;
        else if (isLeaveDay) leaveCount++;
        else if (!isHoliday) mAbsent++;

        // Afternoon
        const afternoonRec = studentAttendances.find(a => new Date(a.date).toDateString() === date.toDateString() && a.session === 'afternoon');
        if (afternoonRec && (afternoonRec as any).isPresent) nPresent++;
        else if (isLeaveDay) leaveCount++;
        else if (!isHoliday) nAbsent++;
      });

      const totalPresent = mPresent + nPresent;
      const totalPossible = totalPresent + mAbsent + nAbsent;
      const percentage = totalPossible > 0 ? ((totalPresent / totalPossible) * 100).toFixed(1) + '%' : '0.0%';

      const row = sheet.addRow({
        id: student.registerId,
        name: student.name,
        room: student.roomNumber || 'N/A',
        mPresent, mAbsent, nPresent, nAbsent,
        leave: leaveCount,
        percentage
      });

      if (studentIndex % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      }
      row.eachCell(cell => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
    });

    // 3. Create "Monthly Attendance Matrix" (Horizontal View)
    const matrixSheet = workbook.addWorksheet('Monthly Matrix');

    // Prepare dynamic columns
    const columns: any[] = [
      { header: 'Register ID', key: 'id', width: 15 },
      { header: 'Name', key: 'name', width: 25 },
    ];

    dateRange.forEach((date) => {
      const dateStr = date.getDate().toString().padStart(2, '0') + '/' + (date.getMonth() + 1).toString().padStart(2, '0');
      // Slightly wider columns for better date visibility
      columns.push({ header: `${dateStr} M`, key: `${date.getTime()}_m`, width: 10 });
      columns.push({ header: `${dateStr} A`, key: `${date.getTime()}_a`, width: 10 });
    });

    matrixSheet.columns = columns;

    // Style Matrix Header selectively
    const matrixHeader = matrixSheet.getRow(1);
    matrixHeader.height = 25;
    matrixHeader.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };

    matrixHeader.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      if (colNumber <= 2) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // Indigo for ID/Name
      } else {
        // Alternating colors for Morning and Afternoon columns
        const isMorning = (colNumber - 2) % 2 !== 0;
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isMorning ? 'FF1E40AF' : 'FF475569' } // Deep Blue for Morning, Slate for Afternoon
        };
      }
    });

    // Freeze first two columns
    matrixSheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

    students.forEach((student) => {
      const studentAttendances = attendances.filter(a => a.userId.toString() === student._id.toString());
      const studentLeaves = allApprovedLeaves.filter(l => l.userId.toString() === student._id.toString());

      const rowData: any = {
        id: student.registerId,
        name: student.name
      };

      dateRange.forEach((date) => {
        const isHoliday = false; // Removed automatic weekend holiday logic
        const isOnApprovedLeave = studentLeaves.some(l =>
          new Date(date.getTime() + 86399999) >= new Date(new Date(l.fromDate).setHours(0, 0, 0, 0)) &&
          date <= new Date(new Date(l.toDate).setHours(23, 59, 59, 999))
        );
        const isHostelLeave = (hostelSettings as any) && (hostelSettings as any).leaveWindowLabel && (hostelSettings as any).leaveWindowFrom && (hostelSettings as any).leaveWindowTo &&
          new Date(date.getTime() + 86399999) >= new Date(new Date((hostelSettings as any).leaveWindowFrom).setHours(0, 0, 0, 0)) &&
          date <= new Date(new Date((hostelSettings as any).leaveWindowTo).setHours(23, 59, 59, 999));
        const isLeaveDay = isOnApprovedLeave || isHostelLeave;

        ['morning', 'afternoon'].forEach(session => {
          const key = `${date.getTime()}_${session === 'morning' ? 'm' : 'a'}`;
          const rec = studentAttendances.find(a => new Date(a.date).toDateString() === date.toDateString() && a.session === session);

          if (rec && (rec as any).isPresent) rowData[key] = 'P';
          else if (isOnApprovedLeave) rowData[key] = 'L';
          else if (isHostelLeave || isHoliday) rowData[key] = 'H';
          else rowData[key] = 'A';
        });
      });

      const row = matrixSheet.addRow(rowData);
      row.eachCell((cell, colNumber) => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        if (colNumber > 2) {
          const val = cell.value as string;
          if (val === 'P') cell.font = { color: { argb: 'FF059669' }, bold: true }; // Green for Present
          if (val === 'A') cell.font = { color: { argb: 'FFDC2626' }, bold: true }; // Red for Absent
          if (val === 'L') cell.font = { color: { argb: 'FFD97706' }, bold: true }; // Orange for Leave
          if (val === 'H') cell.font = { color: { argb: 'FF7C3AED' }, bold: true }; // Purple for Holiday (Distinct from Present)
        }
      });
    });

    // 4. Create "Live Today Status" Sheet
    const todayStatusSheet = workbook.addWorksheet('Today Live Status');
    todayStatusSheet.columns = [
      { header: 'Register ID', key: 'id', width: 15 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Room', key: 'room', width: 10 },
      { header: 'Morning (07:00-11:30)', key: 'morning', width: 15 },
      { header: 'Afternoon (11:33-16:30)', key: 'afternoon', width: 15 },
    ];

    const todayHeader = todayStatusSheet.getRow(1);
    todayHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    todayHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    todayHeader.alignment = { vertical: 'middle', horizontal: 'center' };

    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);

    const isHolidayToday = false; // Removed automatic weekend holiday logic

    students.forEach(student => {
      const studentAttendances = attendances.filter(a => a.userId.toString() === student._id.toString());
      const isOnLeaveToday = allApprovedLeaves.some(l => l.userId.toString() === student._id.toString() && startOfToday >= new Date(l.fromDate) && startOfToday <= new Date(l.toDate)) ||
        ((hostelSettings as any) && (hostelSettings as any).leaveWindowLabel && (hostelSettings as any).leaveWindowFrom && (hostelSettings as any).leaveWindowTo &&
          endOfToday >= new Date(new Date((hostelSettings as any).leaveWindowFrom).setHours(0, 0, 0, 0)) &&
          startOfToday <= new Date(new Date((hostelSettings as any).leaveWindowTo).setHours(23, 59, 59, 999)));

      const mornToday = studentAttendances.find(a => new Date(a.date).toDateString() === startOfToday.toDateString() && a.session === 'morning');
      const afternoonToday = studentAttendances.find(a => new Date(a.date).toDateString() === startOfToday.toDateString() && a.session === 'afternoon');

      const leaveLabel = (hostelSettings as any)?.leaveWindowLabel || 'LEAVE';
      const getLabel = (rec: any) => rec ? 'PRESENT' : (isOnLeaveToday ? leaveLabel.toUpperCase() : 'ABSENT');

      const row = todayStatusSheet.addRow({
        id: student.registerId,
        name: student.name,
        room: student.roomNumber || 'N/A',
        morning: getLabel(mornToday),
        afternoon: getLabel(afternoonToday),
      });

      row.eachCell((cell, colNumber) => {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        if (colNumber > 3) {
          const val = cell.value as string;
          if (val === 'PRESENT') cell.font = { color: { argb: 'FF059669' }, bold: true };
          if (val === 'ABSENT') cell.font = { color: { argb: 'FFDC2626' }, bold: true };
          if (val === 'HOLIDAY' || val === 'WEEKEND') cell.font = { color: { argb: 'FF4F46E5' }, bold: true }; // Indigo for Holiday
          if (val !== 'PRESENT' && val !== 'ABSENT' && val !== 'HOLIDAY' && val !== 'WEEKEND') cell.font = { color: { argb: 'FFD97706' }, bold: true }; // Orange for Leave/Custom Label
        }
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Attendance_Report.xlsx');

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('EXPORT EXCEL ERROR:', error);
    res.status(500).json({ error: 'Server error while exporting Excel' });
  }
});

export default router;
