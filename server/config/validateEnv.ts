/**
 * Environment variable validation at server startup
 *
 * This utility ensures all required environment variables are configured
 * before the server starts, preventing runtime errors.
 */

import { isProduction } from "./env";

export interface EnvironmentConfig {
  nodeEnv: string;
  port: number;
  mongoUri: string;
  jwtSecret: string;
  appOrigin: string;
  isProduction: boolean;
}

/**
 * Validate and load environment variables
 * Throws error if any required variable is missing
 */
export function validateEnvironment(): EnvironmentConfig {
  const errors: string[] = [];

  // Check required environment variables
  if (!process.env.MONGODB_URI) {
    errors.push("MONGODB_URI - MongoDB connection string");
  }

  if (!process.env.JWT_SECRET) {
    errors.push("JWT_SECRET - Secret key for JWT signing");
  }

  if (errors.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${errors
        .map((e) => `  - ${e}`)
        .join("\n")}\n\nPlease set these variables in your .env file or environment.`
    );
  }

  const config: EnvironmentConfig = {
    nodeEnv: process.env.NODE_ENV || "development",
    port: parseInt(process.env.PORT || "5000", 10),
    mongoUri: process.env.MONGODB_URI!,
    jwtSecret: process.env.JWT_SECRET!,
    appOrigin: process.env.APP_ORIGIN || "https://hostel-management-4el0.onrender.com",
    isProduction,
  };

  // Validate port is a valid number
  if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error(
      `Invalid PORT: ${process.env.PORT}. Port must be a number between 1 and 65535.`
    );
  }

  return config;
}

/**
 * Log environment configuration (safe to print in production)
 */
export function logEnvironmentConfig(config: EnvironmentConfig): void {
  console.log("📋 Environment Configuration:");
  console.log(`   Node Environment: ${config.nodeEnv}`);
  console.log(`   Port: ${config.port}`);
  console.log(
    `   MongoDB: ${config.mongoUri.substring(0, 30)}...${
      config.mongoUri.length > 30 ? "(hidden)" : ""
    }`
  );
  console.log(
    `   JWT Secret: ${config.jwtSecret.length > 0 ? "✓ Set" : "✗ Not Set"}`
  );
  console.log(`   App Origin: ${config.appOrigin}`);
  console.log(`   Production Mode: ${config.isProduction ? "✓" : "✗"}`);
}
