export type SystemEventType =
  | 'GATE_PASS_CREATED'
  | 'GATE_PASS_APPROVED'
  | 'GATE_EXIT_MARKED'
  | 'GATE_CAMPUS_ENTRY'
  | 'GATE_HOSTEL_ENTRY'
  | 'GATE_LATE_LOCK'
  | 'GATE_OVERRIDE';

export interface SystemEventPayload {
  event: SystemEventType;
  timestamp: string;
  actorId?: string;
  userId?: string;
  gatePassId?: string;
  metadata?: Record<string, unknown>;
}

export async function logSystemEvent(input: Omit<SystemEventPayload, 'timestamp'>): Promise<void> {
  try {
    const payload: SystemEventPayload = {
      ...input,
      timestamp: new Date().toISOString(),
    };

    console.info(`[SYSTEM_EVENT] ${JSON.stringify(payload)}`);
  } catch (error) {
    console.warn('Failed to log system event', error);
  }
}
