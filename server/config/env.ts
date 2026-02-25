import dotenv from "dotenv";
import path from "path";

export const isProduction = process.env.NODE_ENV === "production";

if (!isProduction) {
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const APP_ORIGIN =
  process.env.APP_ORIGIN || "https://hostel-management-4el0.onrender.com";
export const MONGODB_URI = getRequiredEnv("MONGODB_URI");
export const JWT_SECRET = getRequiredEnv("JWT_SECRET");
