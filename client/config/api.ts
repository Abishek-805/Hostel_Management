const API_BASE_URL = "https://hostel-management-4el0.onrender.com";

export const buildApiUrl = (route: string): string => {
  let normalizedRoute = route.startsWith("/") ? route.slice(1) : route;

  if (normalizedRoute.startsWith("api/")) {
    normalizedRoute = normalizedRoute.slice(4);
  }

  return `${API_BASE_URL}/api/${normalizedRoute}`;
};