import { QueryClient, QueryFunction } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL, buildApiUrl } from "@/config/api";

// Callback for when token expires
let onTokenExpired: (() => void) | null = null;

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

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: (data && method !== 'GET' && method !== 'HEAD') ? JSON.stringify(data) : undefined,
    credentials: "include", // Optional if using token, but harmless
  });

  // Handle 401 - token is invalid/expired
  if (res.status === 401) {
    console.warn(`⚠️ apiRequest: Got 401 Unauthorized, clearing auth state for ${method} ${url}`);
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
      } else {
        console.warn(`🔴 getQueryFn: No token found for URL: ${url}`);
      }

      console.log(`🟢 getQueryFn: Fetching ${url} with token: ${token ? 'YES' : 'NO'}`);

      const res = await fetch(url, {
        headers,
        credentials: "include",
      });

      console.log(`🟡 getQueryFn: Response status for ${url}: ${res.status}`);

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
