import { JWT_SECRET } from './env';

export const GATE_QR_TOKEN_TTL_SECONDS = Number.parseInt(process.env.GATE_QR_TOKEN_TTL_SECONDS || '60', 10);
export const GATE_CURFEW_CHECK_INTERVAL_MS = Number.parseInt(
  process.env.GATE_CURFEW_CHECK_INTERVAL_MS || `${10 * 60 * 1000}`,
  10
);
export const GATE_CAMPUS_CUTOFF_HOUR = Number.parseInt(process.env.GATE_CAMPUS_CUTOFF_HOUR || '19', 10);
export const GATE_CAMPUS_CUTOFF_MINUTE = Number.parseInt(process.env.GATE_CAMPUS_CUTOFF_MINUTE || '30', 10);
export const GATE_QR_HMAC_SECRET = process.env.GATE_QR_HMAC_SECRET || JWT_SECRET;
