import { QueryClient, QueryFunction } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * ✅ FIXED: Always point to local backend in dev
 */
import Constants from "expo-constants";
import { Platform } from "react-native";

// Callback for when token expires
let onTokenExpired: (() => void) | null = null;

export function setTokenExpiredCallback(callback: () => void) {
  onTokenExpired = callback;
}

export function getApiUrl(): string {
  // 1. For Web, use localhost (since browser matches machine)
  if (Platform.OS === 'web') {
    return "http://127.0.0.1:5001";
  }

  // 2. For Real Devices/Emulators, try to get IP from Expo config
  const debuggerHost = Constants.expoConfig?.hostUri;
  const localhost = "10.0.2.2"; // Android Emulator standard IP

  if (debuggerHost) {
    // debuggerHost is like "192.168.1.5:8081"
    const ip = debuggerHost.split(":")[0];
    return `http://${ip}:5001`;
  }

  // 3. Fallback for Android Emulator if no debugger host
  if (Platform.OS === 'android') {
    return `http://${localhost}:5001`;
  }

  // 4. Last resort (iOS simulator usually maps localhost)
  return "http://localhost:5001";
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
  const baseUrl = getApiUrl();

  // Normalize route to avoid double /api
  // Remove leading slash for consistent processing
  let cleanRoute = route.startsWith("/") ? route.slice(1) : route;
  // Ensure it starts with api/
  if (!cleanRoute.startsWith("api/")) {
    cleanRoute = `api/${cleanRoute}`;
  }

  const url = new URL(`/${cleanRoute}`, baseUrl);

  // Get token
  const token = await AsyncStorage.getItem("@hostelease_token");

  const headers: Record<string, string> = (data && method !== 'GET' && method !== 'HEAD') ? { "Content-Type": "application/json" } : {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: (data && method !== 'GET' && method !== 'HEAD') ? JSON.stringify(data) : undefined,
    credentials: "include", // Optional if using token, but harmless
  });

  // Handle 401 - token is invalid/expired
  if (res.status === 401) {
    console.warn(`⚠️ apiRequest: Got 401 Unauthorized, clearing auth state for ${method} ${url.toString()}`);
    // Clear stored auth data
    await AsyncStorage.removeItem("@hostelease_token");
    await AsyncStorage.removeItem("@hostelease_user");
    // Trigger callback to reset auth context
    if (onTokenExpired) {
      console.log(`🔄 apiRequest: Triggering token expired callback`);
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
      const baseUrl = getApiUrl();

      // Normalize path from queryKey
      let route = queryKey.join("/");

      // Remove leading slash
      if (route.startsWith("/")) route = route.slice(1);

      // Handle potential double /api if someone passed it in the key
      route = route.replace(/^api\//, '');

      // Ensure it starts with api/ consistently
      route = `api/${route}`;

      const url = new URL(`/${route}`, baseUrl);

      // Get token
      const token = await AsyncStorage.getItem("@hostelease_token");
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      } else {
        console.warn(`🔴 getQueryFn: No token found for URL: ${url.toString()}`);
      }

      console.log(`🟢 getQueryFn: Fetching ${url.toString()} with token: ${token ? 'YES' : 'NO'}`);

      const res = await fetch(url.toString(), {
        headers,
        credentials: "include",
      });

      console.log(`🟡 getQueryFn: Response status for ${url.toString()}: ${res.status}`);

      // Handle 401 - token is invalid/expired
      if (res.status === 401) {
        console.warn(`⚠️ getQueryFn: Got 401 Unauthorized, clearing auth state`);
        // Clear stored auth data
        await AsyncStorage.removeItem("@hostelease_token");
        await AsyncStorage.removeItem("@hostelease_user");
        // Trigger callback to reset auth context
        if (onTokenExpired) {
          console.log(`🔄 Triggering token expired callback`);
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
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60, // 1 minute default
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
