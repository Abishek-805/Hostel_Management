import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { isProduction } from "../config/env";

/**
 * PHASE 1: SECURITY HARDENING
 */

/**
 * 1️⃣ Helmet - Security Headers Middleware
 */
export function setupHelmet(app: express.Application) {
  // Helmet middleware with custom CSP for face-api.js
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", "https:"],
        },
      },
      frameguard: { action: "deny" },
      xssFilter: true,
      noSniff: true,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    })
  );
}

/**
 * 2️⃣ Rate Limiting - Protect API endpoints
 */
export function setupRateLimiter(app: express.Application) {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per windowMs
    message: {
      error: "Too many requests from this IP, please try again later.",
      retryAfter: "15 minutes",
    },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    skip: (req: Request) => {
      // Skip rate limiting for non-API routes and health checks
      return !req.path.startsWith("/api");
    },
  });

  app.use(limiter);
}

/**
 * 3️⃣ Sanitization - Prevent MongoDB Injection
 */
export function setupSanitization(app: express.Application) {
  // Middleware to prevent $ operators in user inputs
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const sanitizeData = (data: any): any => {
      if (typeof data === "string") {
        // Reject strings that start with $
        if (data.startsWith("$")) {
          return ""; // Replace with empty string or throw error
        }
        return data;
      }
      if (Array.isArray(data)) {
        return data.map(sanitizeData);
      }
      if (typeof data === "object" && data !== null) {
        const sanitized: any = {};
        for (const key in data) {
          // Reject keys that start with $
          if (!key.startsWith("$")) {
            sanitized[key] = sanitizeData(data[key]);
          }
        }
        return sanitized;
      }
      return data;
    };

    req.body = sanitizeData(req.body);
    next();
  });
}

/**
 * 4️⃣ Security Headers - Additional headers
 */
export function setupSecurityHeaders(app: express.Application) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Disable x-powered-by header
    res.removeHeader("X-Powered-By");

    // Additional security headers
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");

    // Preserve Vary header for CORS
    const vary = res.getHeader("Vary");
    if (vary) {
      res.setHeader("Vary", `${vary}, Origin`);
    } else {
      res.setHeader("Vary", "Origin");
    }

    next();
  });
}

/**
 * PHASE 2: PERFORMANCE OPTIMIZATION
 */

/**
 * 1️⃣ Request Timeout Middleware
 */
export function setupRequestTimeout(app: express.Application) {
  const timeoutMs = 30000; // 30 seconds

  app.use((req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          error: "Request Timeout",
          message: "The request took too long to process. Please try again.",
        });
      }
    }, timeoutMs);

    // Clear timeout when response is sent
    res.on("finish", () => clearTimeout(timeout));
    res.on("close", () => clearTimeout(timeout));

    next();
  });
}

/**
 * PHASE 3: LOGGING & MONITORING
 */

/**
 * 1️⃣ Morgan HTTP Request Logger
 */
export function setupMorganLogger(app: express.Application) {
  // Custom Morgan format for production
  const morganFormat = isProduction
    ? ":remote-addr - :remote-user [:date[clf]] :method :url HTTP/:http-version :status :res[content-length] :response-time ms"
    : "dev"; // More detailed in development

  app.use(morgan(morganFormat));
}

/**
 * 2️⃣ Centralized Error Logging
 */
export function setupErrorLogging() {
  return (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log errors in production
    if (isProduction) {
      console.error(`[ERROR ${status}] ${message}`);
      // In production, don't leak stack trace
      res.status(status).json({
        error: message,
        ...(status === 500 ? {} : { details: err.details }),
      });
    } else {
      // In development, include stack trace
      console.error(err);
      res.status(status).json({
        error: message,
        stack: err.stack,
      });
    }
  };
}

/**
 * Setup all security and middleware
 */
export function setupAllSecurityMiddleware(app: express.Application) {
  setupHelmet(app);
  setupSecurityHeaders(app);
  setupRateLimiter(app);
  setupSanitization(app);
  setupRequestTimeout(app);
  setupMorganLogger(app);
}
