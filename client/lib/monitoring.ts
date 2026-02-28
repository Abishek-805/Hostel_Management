import Constants from "expo-constants";
import { logger } from "@/lib/logger";

type EventPayload = Record<string, unknown>;

const MONITORING_ENDPOINT = process.env.EXPO_PUBLIC_MONITORING_ENDPOINT;
const ANALYTICS_ENDPOINT = process.env.EXPO_PUBLIC_ANALYTICS_ENDPOINT;
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

let sentryClient: any = null;
let monitoringInitialized = false;

async function postJson(endpoint: string | undefined, body: Record<string, unknown>) {
  if (!endpoint) return;
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // no-op: never crash app on monitoring failure
  }
}

export async function initMonitoring() {
  if (monitoringInitialized) return;
  monitoringInitialized = true;

  if (!SENTRY_DSN) return;

  try {
    const req = (0, eval)("require");
    sentryClient = req("@sentry/react-native");
    sentryClient.init({
      dsn: SENTRY_DSN,
      enableNative: true,
      enableAutoSessionTracking: true,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV || "development",
      release: Constants.expoConfig?.version,
    });
  } catch {
    logger.warn("Monitoring: Sentry SDK not installed, using endpoint fallback");
  }
}

export async function captureException(error: unknown, context?: EventPayload) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  if (sentryClient) {
    try {
      sentryClient.captureException(error, { extra: context });
      return;
    } catch {
      // fallback below
    }
  }

  await postJson(MONITORING_ENDPOINT, {
    type: "exception",
    message: errorMessage,
    stack,
    context,
    platform: Constants.platform,
    appVersion: Constants.expoConfig?.version,
    timestamp: new Date().toISOString(),
  });
}

export async function trackEvent(name: string, payload?: EventPayload) {
  if (sentryClient) {
    try {
      sentryClient.addBreadcrumb({
        category: "analytics",
        level: "info",
        message: name,
        data: payload,
      });
    } catch {
      // fallback below
    }
  }

  await postJson(ANALYTICS_ENDPOINT, {
    event: name,
    payload,
    platform: Constants.platform,
    appVersion: Constants.expoConfig?.version,
    timestamp: new Date().toISOString(),
  });
}
