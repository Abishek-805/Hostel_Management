import React from "react";
import { AppState } from "react-native";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryFunction,
  onlineManager,
} from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL, buildApiUrl } from "@/config/api";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/monitoring";

// Callback for when token expires
let onTokenExpired: (() => void) | null = null;

if (typeof window !== "undefined") {
  onlineManager.setEventListener((setOnline) => {
    const onOnline = () => {
      setOnline(true);
    };
    const onOffline = () => {
      setOnline(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  });
} else {
  onlineManager.setEventListener((setOnline) => {
    const subscription = AppState.addEventListener("change", (state) => {
      setOnline(state === "active");
    });
    return () => subscription.remove();
  });
}

export function useNetworkStatus() {
  const [offline, setOffline] = React.useState(!onlineManager.isOnline());

  React.useEffect(() => {
    setOffline(!onlineManager.isOnline());
    return onlineManager.subscribe(() => {
      setOffline(!onlineManager.isOnline());
    });
  }, []);

  return offline;
}

function parseHttpStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/^(\d{3}):/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function isRetriableError(error: unknown): boolean {
  const status = parseHttpStatus(error);
  if (status) return status >= 500 || status === 429;
  if (!(error instanceof Error)) return false;
  return /network|failed to fetch|timeout|request failed/i.test(error.message);
}

function retryDelay(attemptIndex: number): number {
  const base = 1000 * 2 ** attemptIndex;
  const jitter = Math.floor(Math.random() * 300);
  return Math.min(base + jitter, 30000);
}

export function setTokenExpiredCallback(callback: () => void) {
  onTokenExpired = callback;
}

export function getApiUrl(): string {
  return API_BASE_URL;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown,
): Promise<Response> {
  const url = buildApiUrl(route);

  // Get token
  const token = await AsyncStorage.getItem("@hostelease_token");

  const headers: Record<string, string> = (data && method !== 'GET' && method !== 'HEAD') ? { "Content-Type": "application/json" } : {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: (data && method !== 'GET' && method !== 'HEAD') ? JSON.stringify(data) : undefined,
      credentials: "include", // Optional if using token, but harmless
    });
  } catch (error) {
    await captureException(error, { scope: "apiRequest", method, route });
    throw new Error("Network error: unable to reach server. Please check your connection.");
  }

  // Handle 401 - token is invalid/expired
  if (res.status === 401) {
    logger.warn(`401 Unauthorized for ${method} ${url}`);
    // Clear stored auth data
    await AsyncStorage.removeItem("@hostelease_token");
    await AsyncStorage.removeItem("@hostelease_user");
    // Trigger callback to reset auth context
    if (onTokenExpired) {
      logger.info("Triggering token expired callback");
      onTokenExpired();
    }
  }

  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401 }) =>
    async ({ queryKey }) => {
      // Normalize path from queryKey
      let route = queryKey.join("/");

      // Remove leading slash
      if (route.startsWith("/")) route = route.slice(1);

      const url = buildApiUrl(route);

      // Get token
      const token = await AsyncStorage.getItem("@hostelease_token");
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      let res: Response;
      try {
        res = await fetch(url, {
          headers,
          credentials: "include",
        });
      } catch (error) {
        await captureException(error, { scope: "getQueryFn", route });
        throw new Error("Network error: unable to reach server. Please retry.");
      }

      // Handle 401 - token is invalid/expired
      if (res.status === 401) {
        logger.warn("401 Unauthorized while querying, clearing auth state");
        // Clear stored auth data
        await AsyncStorage.removeItem("@hostelease_token");
        await AsyncStorage.removeItem("@hostelease_user");
        // Trigger callback to reset auth context
        if (onTokenExpired) {
          logger.info("Triggering token expired callback");
          onTokenExpired();
        }
        if (on401 === "returnNull") {
          return null;
        }
      }

      await throwIfResNotOk(res);
      return res.json();
    };

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      void captureException(error, {
        scope: "react-query",
        queryKey: String(query.queryKey),
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      void captureException(error, {
        scope: "react-mutation",
        mutationKey: String(mutation.options.mutationKey),
      });
    },
  }),
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      networkMode: "online",
      staleTime: 1000 * 60, // 1 minute default
      gcTime: 1000 * 60 * 5,
      retry: (failureCount, error) => {
        if (failureCount >= 3) return false;
        return isRetriableError(error);
      },
      retryDelay,
    },
    mutations: {
      networkMode: "online",
      retry: (failureCount, error) => {
        if (failureCount >= 2) return false;
        return isRetriableError(error);
      },
      retryDelay,
    },
  },
});
