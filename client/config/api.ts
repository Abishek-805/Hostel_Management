const DEV_URL = "http://localhost:5001";
const PROD_URL = "https://hostel-management-4el0.onrender.com";

export const API_BASE_URL =
  process.env.NODE_ENV === "development" ? DEV_URL : PROD_URL;

export const buildApiUrl = (route: string): string => {
  let normalizedRoute = route.startsWith("/") ? route.slice(1) : route;

  if (normalizedRoute.startsWith("api/")) {
    normalizedRoute = normalizedRoute.slice(4);
  }

  return `${API_BASE_URL}/api/${normalizedRoute}`;
};