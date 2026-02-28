import GatePass from '../models/GatePass';
import StudentGateState from '../models/StudentGateState';
import GateLog from '../models/GateLog';
import { GATE_CAMPUS_CUTOFF_HOUR, GATE_CAMPUS_CUTOFF_MINUTE, GATE_CURFEW_CHECK_INTERVAL_MS } from '../config/gate';

let intervalRef: NodeJS.Timeout | null = null;

function getCutoffDate(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setHours(GATE_CAMPUS_CUTOFF_HOUR, GATE_CAMPUS_CUTOFF_MINUTE, 0, 0);
  return cutoff;
}

async function lockStateAndPass(userId: string, gatePassId: string, reason: string): Promise<void> {
  const [gateState, gatePass] = await Promise.all([
    StudentGateState.findOne({ userId }),
    GatePass.findOne({ gatePassId, userId }),
  ]);

  if (!gateState || !gatePass) {
    return;
  }

  gateState.attendanceLocked = true;
  await gateState.save();

  if (gatePass.status === 'APPROVED') {
    gatePass.status = 'LATE';
    gatePass.finalStatus = 'LATE';
    await gatePass.save();
  }

  await GateLog.create({
    userId,
    gatePassId,
    type: 'SYSTEM_ACTION',
    timestamp: new Date(),
    metadata: {
      action: 'CURFEW_LOCK',
      reason,
    },
  });

  console.warn(`🚨 Curfew lock: user=${userId}, gatePassId=${gatePassId}, reason=${reason}`);
}

export async function runCurfewMonitorCycle(): Promise<void> {
  const now = new Date();
  const cutoff = getCutoffDate(now);

  const outsideLateStates = await StudentGateState.find({
    currentState: 'OUTSIDE_CAMPUS',
  });

  for (const state of outsideLateStates) {
    const activePass = await GatePass.findOne({
      userId: state.userId,
      status: { $in: ['APPROVED', 'LATE'] },
      expectedReturnTime: { $lt: now },
    })
      .sort({ expectedReturnTime: -1 });

    if (activePass) {
      await lockStateAndPass(state.userId.toString(), activePass.gatePassId, 'OUTSIDE_CAMPUS_AFTER_EXPECTED_RETURN');
    }
  }

  if (now >= cutoff) {
    const insideCampusStates = await StudentGateState.find({ currentState: 'INSIDE_CAMPUS' });

    for (const state of insideCampusStates) {
      const activePass = await GatePass.findOne({
        userId: state.userId,
        status: { $in: ['APPROVED', 'LATE'] },
      })
        .sort({ expectedReturnTime: -1 });

      if (activePass && !activePass.enteredHostelAt) {
        await lockStateAndPass(state.userId.toString(), activePass.gatePassId, 'INSIDE_CAMPUS_AFTER_1930_WITHOUT_HOSTEL_ENTRY');
      }
    }
  }
}

export function startCurfewMonitor(): void {
  if (intervalRef) {
    return;
  }

  const runner = async () => {
    try {
      await runCurfewMonitorCycle();
    } catch (error) {
      console.error('Curfew monitor cycle failed:', error);
    }
  };

  intervalRef = setInterval(runner, GATE_CURFEW_CHECK_INTERVAL_MS);
  void runner();
  console.log(`✅ Curfew monitor started (interval ${GATE_CURFEW_CHECK_INTERVAL_MS}ms)`);
}
