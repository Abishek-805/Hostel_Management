import GatePass from '../models/GatePass';
import User from '../models/User';
import Notification from '../models/Notification';

const LATE_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute
let intervalRef: NodeJS.Timeout | null = null;

/**
 * Calculates duration in minutes between two dates.
 */
function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
}

/**
 * Runs one cycle of the late-return check.
 *
 * Finds approved/late passes where:
 *   - expectedReturnTime has passed
 *   - Student hasn't entered hostel (enteredHostelAt is null)
 *
 * For each late pass, creates a notification for the admin of that
 * student's hostel block. Uses a unique compound index
 * (gatePassId + type + recipientId) to avoid duplicates.
 */
export async function runLateCheckCycle(): Promise<number> {
  const now = new Date();

  const latePasses = await GatePass.find({
    status: { $in: ['APPROVED', 'LATE'] },
    enteredHostelAt: null,
    expectedReturnTime: { $lt: now },
  }).populate('userId', 'name registerId hostelBlock roomNumber');

  let created = 0;

  for (const pass of latePasses) {
    try {
      const student = pass.userId as unknown as {
        _id: string;
        name: string;
        registerId: string;
        hostelBlock: string;
        roomNumber?: string;
      };

      if (!student || !student.hostelBlock) {
        continue;
      }

      // Mark the pass as LATE if still APPROVED
      if (pass.status === 'APPROVED') {
        pass.status = 'LATE';
        pass.finalStatus = 'LATE';
        await pass.save();
      }

      // Find admin(s) of this hostel block
      const admins = await User.find({
        role: { $regex: /^admin$/i },
        hostelBlock: student.hostelBlock,
      }).select('_id').lean();

      if (admins.length === 0) {
        continue;
      }

      const lateDuration = minutesBetween(pass.expectedReturnTime, now);

      for (const admin of admins) {
        try {
          await Notification.create({
            recipientId: admin._id,
            studentId: student._id,
            gatePassId: pass.gatePassId,
            type: 'LATE_RETURN',
            title: `Late Return: ${student.name}`,
            message: `${student.name} (${student.registerId}) has not returned. Expected by ${pass.expectedReturnTime.toLocaleString()}. Late by ${lateDuration} minute(s).`,
            details: {
              studentName: student.name,
              registerId: student.registerId,
              hostelBlock: student.hostelBlock,
              roomNumber: student.roomNumber,
              exitTime: pass.exitMarkedAt || undefined,
              entryTime: undefined,
              expectedReturnTime: pass.expectedReturnTime,
              lateDurationMinutes: lateDuration,
              destination: pass.destination,
            },
            read: false,
          });
          created++;
        } catch (err: any) {
          // Duplicate key error (code 11000) → notification already exists, skip
          if (err?.code === 11000) {
            // Update the late duration on existing notification
            await Notification.updateOne(
              { gatePassId: pass.gatePassId, type: 'LATE_RETURN', recipientId: admin._id },
              {
                $set: {
                  message: `${student.name} (${student.registerId}) has not returned. Expected by ${pass.expectedReturnTime.toLocaleString()}. Late by ${lateDuration} minute(s).`,
                  'details.lateDurationMinutes': lateDuration,
                },
              }
            );
          } else {
            console.error(`[late-check] Failed to create notification for pass ${pass.gatePassId}:`, err);
          }
        }
      }
    } catch (err) {
      console.error(`[late-check] Error processing pass ${pass.gatePassId}:`, err);
    }
  }

  if (created > 0) {
    console.log(`🔔 Late-check: created ${created} new notification(s)`);
  }

  return created;
}

/**
 * Starts the late-check cron loop (every 1 minute).
 */
export function startLateCheckMonitor(): void {
  if (intervalRef) {
    return;
  }

  const runner = async () => {
    try {
      await runLateCheckCycle();
    } catch (error) {
      console.error('[late-check] Cycle failed:', error);
    }
  };

  intervalRef = setInterval(runner, LATE_CHECK_INTERVAL_MS);
  void runner(); // Run immediately on startup
  console.log(`✅ Late-check monitor started (interval ${LATE_CHECK_INTERVAL_MS}ms)`);
}

/**
 * Stops the late-check cron loop.
 */
export function stopLateCheckMonitor(): void {
  if (intervalRef) {
    clearInterval(intervalRef);
    intervalRef = null;
    console.log('⏹ Late-check monitor stopped');
  }
}
