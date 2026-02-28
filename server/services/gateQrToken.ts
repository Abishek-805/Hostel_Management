import crypto from 'crypto';
import QRTokenLog from '../models/QRTokenLog';
import { GATE_QR_HMAC_SECRET, GATE_QR_TOKEN_TTL_SECONDS } from '../config/gate';

export type GateStage = 'CAMPUS_ENTRY' | 'HOSTEL_ENTRY';

export interface GateQrPayload {
  userId: string;
  gatePassId: string;
  stage: GateStage;
  timestamp: number;
  nonce: string;
}

interface SignedTokenEnvelope {
  payload: GateQrPayload;
  signature: string;
}

function signPayload(payload: GateQrPayload): string {
  const payloadJson = JSON.stringify(payload);
  return crypto.createHmac('sha256', GATE_QR_HMAC_SECRET).update(payloadJson).digest('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export async function createSignedGateQrToken(input: {
  userId: string;
  gatePassId: string;
  stage: GateStage;
}): Promise<{ token: string; expiresAt: Date; ttlSeconds: number }> {
  const payload: GateQrPayload = {
    userId: input.userId,
    gatePassId: input.gatePassId,
    stage: input.stage,
    timestamp: Date.now(),
    nonce: crypto.randomUUID(),
  };

  const signature = signPayload(payload);
  const envelope: SignedTokenEnvelope = { payload, signature };
  const token = toBase64Url(JSON.stringify(envelope));

  const expiresAt = new Date(payload.timestamp + GATE_QR_TOKEN_TTL_SECONDS * 1000);
  await QRTokenLog.create({
    tokenHash: hashToken(token),
    userId: payload.userId,
    expiresAt,
    consumed: false,
  });

  return { token, expiresAt, ttlSeconds: GATE_QR_TOKEN_TTL_SECONDS };
}

export function parseAndValidateSignedToken(token: string): { valid: true; payload: GateQrPayload } | { valid: false; error: string } {
  try {
    const envelopeRaw = fromBase64Url(token);
    const envelope = JSON.parse(envelopeRaw) as SignedTokenEnvelope;
    if (!envelope?.payload || !envelope?.signature) {
      return { valid: false, error: 'Malformed token' };
    }

    const expectedSignature = signPayload(envelope.payload);
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const incomingBuffer = Buffer.from(envelope.signature, 'hex');
    if (expectedBuffer.length !== incomingBuffer.length) {
      return { valid: false, error: 'Invalid token signature' };
    }

    const isValidSignature = crypto.timingSafeEqual(expectedBuffer, incomingBuffer);
    if (!isValidSignature) {
      return { valid: false, error: 'Invalid token signature' };
    }

    const now = Date.now();
    const expiresAtMs = envelope.payload.timestamp + GATE_QR_TOKEN_TTL_SECONDS * 1000;
    if (now > expiresAtMs) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload: envelope.payload };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Token parse failed' };
  }
}

export async function consumeTokenIfUsable(token: string): Promise<{ success: true } | { success: false; error: string }> {
  const tokenHash = hashToken(token);
  const existing = await QRTokenLog.findOne({ tokenHash });

  if (!existing) {
    return { success: false, error: 'Token not recognized' };
  }

  if (existing.consumed) {
    return { success: false, error: 'Token already used' };
  }

  if (existing.expiresAt.getTime() < Date.now()) {
    return { success: false, error: 'Token expired' };
  }

  existing.consumed = true;
  existing.usedAt = new Date();
  await existing.save();
  return { success: true };
}
