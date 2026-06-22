import GatePass from '../models/GatePass';
import StudentGateState from '../models/StudentGateState';

export type GateState = 'INSIDE_HOSTEL' | 'OUTSIDE_CAMPUS' | 'INSIDE_CAMPUS';

export const ALLOWED_GATE_TRANSITIONS: Record<GateState, GateState[]> = {
  INSIDE_HOSTEL: ['OUTSIDE_CAMPUS'],
  OUTSIDE_CAMPUS: ['INSIDE_CAMPUS'],
  INSIDE_CAMPUS: ['INSIDE_HOSTEL'],
};

export function isAllowedGateTransition(from: GateState, to: GateState): boolean {
  return ALLOWED_GATE_TRANSITIONS[from].includes(to);
}

export function assertAllowedGateTransition(from: GateState, to: GateState): void {
  if (!isAllowedGateTransition(from, to)) {
    throw new Error(`Invalid gate transition: ${from} -> ${to}`);
  }
}

interface GateInvariantInput {
  userId: string;
  gatePassId?: string;
  expectedAttendanceLocked?: boolean;
}

interface LeanGatePass {
  gatePassId: string;
  enteredCampusAt?: Date;
  enteredHostelAt?: Date;
}

export async function validateGateInvariants(input: GateInvariantInput): Promise<void> {
  const [gateState, activePassCount] = await Promise.all([
    StudentGateState.findOne({ userId: input.userId }).lean<{ attendanceLocked: boolean }>(),
    GatePass.countDocuments({ userId: input.userId, status: { $in: ['PENDING', 'APPROVED'] } }),
  ]);

  if (activePassCount > 1) {
    throw new Error('Gate invariant failed: multiple active passes for one user');
  }

  if (typeof input.expectedAttendanceLocked === 'boolean' && gateState) {
    if (gateState.attendanceLocked !== input.expectedAttendanceLocked) {
      throw new Error('Gate invariant failed: attendanceLocked consistency mismatch');
    }
  }

  if (!input.gatePassId) {
    return;
  }

  const pass = await GatePass.findOne({ gatePassId: input.gatePassId, userId: input.userId })
    .select('gatePassId enteredCampusAt enteredHostelAt')
    .lean<LeanGatePass>();

  if (!pass) {
    return;
  }

  if (pass.enteredHostelAt && !pass.enteredCampusAt) {
    throw new Error('Gate invariant failed: hostel entry without campus entry');
  }

  if (pass.enteredCampusAt && pass.enteredHostelAt) {
    const campusAt = new Date(pass.enteredCampusAt).getTime();
    const hostelAt = new Date(pass.enteredHostelAt).getTime();
    if (campusAt > hostelAt) {
      throw new Error('Gate invariant failed: campus entry timestamp is after hostel entry');
    }
  }
}
