import { Types } from 'mongoose';
import GatePass, { GatePassCategory, GatePassStatus, IGatePass } from '../models/GatePass';
import StudentGateState, { StudentGatePosition } from '../models/StudentGateState';
import User from '../models/User';
import { readMealCountCache, writeMealCountCache } from './mealCountCache';
import {
  addDays,
  endOfLocalDay,
  formatLocalIsoDate,
  getMealSlotDateTime,
  isSameLocalDay,
  MealSlot,
  startOfLocalDay,
} from './mealSlots';

type StudentRecord = {
  _id: Types.ObjectId;
};

type GateStateRecord = {
  userId: Types.ObjectId;
  currentState: StudentGatePosition;
};

type PassRecord = Pick<IGatePass,
  'userId' |
  'category' |
  'status' |
  'expectedReturnTime' |
  'actualReturnTime' |
  'createdAt' |
  'updatedAt' |
  'exitMarkedAt'
>;

type DailyMealCounts = {
  date: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  lateStudents: number;
  outsideNow: number;
  returningBeforeDinner: number;
};

type SlotEvaluationResult = {
  shouldCount: boolean;
  isLate: boolean;
};

const ACTIVE_PASS_STATUSES: GatePassStatus[] = ['APPROVED', 'LATE', 'COMPLETED'];

function getStudentEligibilityQuery() {
  return {
    role: 'student',
    $and: [
      { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
      { $or: [{ suspended: { $ne: true } }, { suspended: { $exists: false } }] },
      { $or: [{ archived: { $ne: true } }, { archived: { $exists: false } }] },
    ],
  };
}

function isOutsideState(state: StudentGatePosition | undefined): boolean {
  return state === 'OUTSIDE_CAMPUS';
}

function toObjectIdString(value: Types.ObjectId): string {
  return value.toHexString();
}

function selectMostRelevantPass(slotTime: Date, passes: PassRecord[]): PassRecord | null {
  const eligible = passes
    .filter((pass) => pass.createdAt <= slotTime)
    .sort((left, right) => right.expectedReturnTime.getTime() - left.expectedReturnTime.getTime());

  return eligible[0] || null;
}

function evaluateOutsideStudentAtSlot(slotTime: Date, slot: MealSlot, pass: PassRecord | null): SlotEvaluationResult {
  if (!pass) {
    return { shouldCount: true, isLate: false };
  }

  if (pass.actualReturnTime && pass.actualReturnTime.getTime() < slotTime.getTime()) {
    return { shouldCount: true, isLate: false };
  }

  if (
    slot === MealSlot.DINNER &&
    pass.category === ('OD' as GatePassCategory) &&
    isSameLocalDay(pass.expectedReturnTime, slotTime) &&
    pass.expectedReturnTime.getTime() <= slotTime.getTime()
  ) {
    return { shouldCount: true, isLate: false };
  }

  if (pass.expectedReturnTime.getTime() > slotTime.getTime()) {
    return { shouldCount: false, isLate: false };
  }

  if (!pass.actualReturnTime) {
    return { shouldCount: false, isLate: true };
  }

  return { shouldCount: true, isLate: false };
}

async function getDataForDate(date: Date) {
  const dayStart = startOfLocalDay(date);
  const dayEnd = endOfLocalDay(date);

  const students = await User.find(getStudentEligibilityQuery())
    .select('_id')
    .lean<StudentRecord[]>();

  const studentIds = students.map((student) => student._id);
  if (studentIds.length === 0) {
    return {
      students,
      statesByUserId: new Map<string, GateStateRecord>(),
      passesByUserId: new Map<string, PassRecord[]>(),
    };
  }

  const [states, passes] = await Promise.all([
    StudentGateState.find({ userId: { $in: studentIds } })
      .select('userId currentState')
      .lean<GateStateRecord[]>(),
    GatePass.find({
      userId: { $in: studentIds },
      status: { $in: ACTIVE_PASS_STATUSES },
      createdAt: { $lte: addDays(dayEnd, 1) },
      expectedReturnTime: { $gte: addDays(dayStart, -3) },
    })
      .select('userId category status expectedReturnTime actualReturnTime createdAt updatedAt exitMarkedAt')
      .lean<PassRecord[]>(),
  ]);

  const statesByUserId = new Map<string, GateStateRecord>();
  for (const state of states) {
    statesByUserId.set(toObjectIdString(state.userId), state);
  }

  const passesByUserId = new Map<string, PassRecord[]>();
  for (const pass of passes) {
    const key = toObjectIdString(pass.userId as unknown as Types.ObjectId);
    const existing = passesByUserId.get(key) || [];
    existing.push(pass);
    passesByUserId.set(key, existing);
  }

  return {
    students,
    statesByUserId,
    passesByUserId,
  };
}

export async function calculateMealCount(date: Date, slot: MealSlot): Promise<{ count: number; lateStudentIds: string[] }> {
  const slotTime = getMealSlotDateTime(date, slot);
  const { students, statesByUserId, passesByUserId } = await getDataForDate(date);

  let count = 0;
  const lateStudentIds = new Set<string>();

  for (const student of students) {
    const userId = toObjectIdString(student._id);
    const state = statesByUserId.get(userId);

    if (!isOutsideState(state?.currentState)) {
      count += 1;
      continue;
    }

    const userPasses = passesByUserId.get(userId) || [];
    const relevantPass = selectMostRelevantPass(slotTime, userPasses);
    const evaluation = evaluateOutsideStudentAtSlot(slotTime, slot, relevantPass);

    if (evaluation.shouldCount) {
      count += 1;
    }
    if (evaluation.isLate) {
      lateStudentIds.add(userId);
    }
  }

  return { count, lateStudentIds: Array.from(lateStudentIds) };
}

export async function calculateDailyCounts(date: Date): Promise<DailyMealCounts> {
  const day = startOfLocalDay(date);
  const cacheKey = `meal:daily:${formatLocalIsoDate(day)}`;
  const cached = readMealCountCache<DailyMealCounts>(cacheKey);
  if (cached) {
    return cached;
  }

  const [breakfastResult, lunchResult, dinnerResult, outsideNow, returningBeforeDinner] = await Promise.all([
    calculateMealCount(day, MealSlot.BREAKFAST),
    calculateMealCount(day, MealSlot.LUNCH),
    calculateMealCount(day, MealSlot.DINNER),
    StudentGateState.countDocuments({ currentState: 'OUTSIDE_CAMPUS' }),
    GatePass.countDocuments({
      status: { $in: ['APPROVED', 'LATE'] },
      expectedReturnTime: {
        $gt: new Date(),
        $lte: getMealSlotDateTime(day, MealSlot.DINNER),
      },
    }),
  ]);

  const lateStudents = new Set<string>([
    ...breakfastResult.lateStudentIds,
    ...lunchResult.lateStudentIds,
    ...dinnerResult.lateStudentIds,
  ]);

  const result: DailyMealCounts = {
    date: formatLocalIsoDate(day),
    breakfast: breakfastResult.count,
    lunch: lunchResult.count,
    dinner: dinnerResult.count,
    lateStudents: lateStudents.size,
    outsideNow,
    returningBeforeDinner,
  };

  writeMealCountCache(cacheKey, result);
  return result;
}

export async function calculateRangeCounts(start: Date, end: Date): Promise<{ start: string; end: string; days: DailyMealCounts[] }> {
  const startDay = startOfLocalDay(start);
  const endDay = startOfLocalDay(end);
  const rangeKey = `meal:range:${formatLocalIsoDate(startDay)}:${formatLocalIsoDate(endDay)}`;
  const cached = readMealCountCache<{ start: string; end: string; days: DailyMealCounts[] }>(rangeKey);
  if (cached) {
    return cached;
  }

  const days: DailyMealCounts[] = [];
  for (let cursor = new Date(startDay); cursor.getTime() <= endDay.getTime(); cursor = addDays(cursor, 1)) {
    const dayCount = await calculateDailyCounts(cursor);
    days.push(dayCount);
  }

  const result = {
    start: formatLocalIsoDate(startDay),
    end: formatLocalIsoDate(endDay),
    days,
  };

  writeMealCountCache(rangeKey, result);
  return result;
}
