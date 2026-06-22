import GatePass from '../models/GatePass';
import StudentGateState from '../models/StudentGateState';
import GateScanRecord from '../models/GateScanRecord';

export interface SystemMetricsSnapshot {
  totalGatePasses: number;
  currentlyOutsideCount: number;
  lateCount: number;
  scanRecordsLast24h: number;
  attendanceLockedCount: number;
}

export async function getSystemMetricsSnapshot(): Promise<SystemMetricsSnapshot> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [totalGatePasses, currentlyOutsideCount, lateCount, scanRecordsLast24h, attendanceLockedCount] =
    await Promise.all([
      GatePass.countDocuments({}),
      StudentGateState.countDocuments({ currentState: 'OUTSIDE_CAMPUS' }),
      GatePass.countDocuments({ status: 'LATE' }),
      GateScanRecord.countDocuments({ createdAt: { $gte: since } }),
      StudentGateState.countDocuments({ attendanceLocked: true }),
    ]);

  return {
    totalGatePasses,
    currentlyOutsideCount,
    lateCount,
    scanRecordsLast24h,
    attendanceLockedCount,
  };
}
