import { Platform } from "react-native";

const PRODUCTION_API_BASE_URL = "https://hostel-management-4el0.onrender.com";
const WEB_DEVELOPMENT_API_BASE_URL = "http://localhost:5001";
const LOCALHOST_URL_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i;

const isDevelopmentRuntime = (() => {
  if (typeof __DEV__ !== "undefined") {
    return __DEV__;
  }
  return process.env.NODE_ENV !== "production";
})();

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, "");
}

let warnedUnsafeProductionApiBase = false;

function warnIfUnsafeProductionBase(apiBaseUrl: string): void {
  if (isDevelopmentRuntime || warnedUnsafeProductionApiBase) {
    return;
  }

  if (LOCALHOST_URL_PATTERN.test(apiBaseUrl)) {
    warnedUnsafeProductionApiBase = true;
    console.warn("[api] Production runtime is configured to use a localhost API base URL. This is unsafe and likely unreachable.");
  }
}

export const API_BASE_URL =
  Platform.OS === "web" && isDevelopmentRuntime
    ? normalizeBaseUrl(WEB_DEVELOPMENT_API_BASE_URL)
    : normalizeBaseUrl(PRODUCTION_API_BASE_URL);

warnIfUnsafeProductionBase(API_BASE_URL);

export const buildApiUrl = (route: string): string => {
  let normalizedRoute = route.startsWith("/") ? route.slice(1) : route;

  if (normalizedRoute.startsWith("api/")) {
    normalizedRoute = normalizedRoute.slice(4);
  }

  return `${API_BASE_URL}/api/${normalizedRoute}`;
};