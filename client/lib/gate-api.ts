import { apiRequest } from "@/lib/query-client";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const GATE_NOT_DEPLOYED_MESSAGE = "Gate module not deployed on backend.";
const GATE_SERVICE_UNAVAILABLE_MESSAGE = "Gate service is currently unavailable. Please try again shortly.";
const GATE_GENERIC_REQUEST_ERROR = "Unable to process gate request right now.";
const HEALTH_CACHE_MS = 30_000;

let lastHealthCheckAt = 0;
let lastHealthStatus = false;

function isGateRouteUnavailable(response: Response, payload?: unknown): boolean {
  if (response.status !== 404) {
    return false;
  }

  if (!payload || typeof payload !== "object") {
    return true;
  }

  const errorValue = (payload as { error?: unknown }).error;
  if (typeof errorValue !== "string") {
    return true;
  }

  const normalized = errorValue.toLowerCase();
  return normalized.includes("cannot") || normalized.includes("not found") || normalized.includes("route");
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const errorValue = (payload as { error?: unknown }).error;
  if (typeof errorValue !== "string") {
    return null;
  }

  const trimmed = errorValue.trim();
  if (!trimmed) {
    return null;
  }

  if (/<!doctype html>|<html|\n\s*at\s+/i.test(trimmed)) {
    return null;
  }

  return trimmed.slice(0, 220);
}

export async function ensureGateApiAvailable(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastHealthCheckAt < HEALTH_CACHE_MS) {
    if (!lastHealthStatus) {
      throw new Error(GATE_NOT_DEPLOYED_MESSAGE);
    }
    return;
  }

  lastHealthCheckAt = now;

  try {
    const response = await apiRequest("GET", "/gate/health");
    if (!response.ok) {
      lastHealthStatus = false;
      throw new Error(response.status === 404 ? GATE_NOT_DEPLOYED_MESSAGE : GATE_SERVICE_UNAVAILABLE_MESSAGE);
    }
    lastHealthStatus = true;
  } catch (error) {
    lastHealthStatus = false;
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(GATE_SERVICE_UNAVAILABLE_MESSAGE);
  }
}

export async function gateApiRequest(method: HttpMethod, path: string, body?: unknown): Promise<Response> {
  await ensureGateApiAvailable();

  const response = await apiRequest(method, path, body);
  if (response.ok) {
    return response;
  }

  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    payload = undefined;
  }

  if (isGateRouteUnavailable(response, payload)) {
    throw new Error(GATE_NOT_DEPLOYED_MESSAGE);
  }

  const extractedError = extractErrorMessage(payload);
  if (extractedError) {
    throw new Error(extractedError);
  }

  if (response.status >= 500) {
    throw new Error(GATE_SERVICE_UNAVAILABLE_MESSAGE);
  }

  throw new Error(GATE_GENERIC_REQUEST_ERROR);
}
