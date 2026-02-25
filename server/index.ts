import "./polyfill";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";
import { APP_ORIGIN, isProduction } from "./config/env";

const app = express();
const log = console.log;

/* =========================
   RAW BODY SUPPORT
========================= */
declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

/* =========================
   ✅ CORS (FIXED)
========================= */
function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }

    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    next();
  });
}

/* =========================
   BODY PARSING
========================= */
function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "50mb", // Support large base64 photos
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );


  app.use(express.urlencoded({ limit: "50mb", extended: false }));
}

/* =========================
   REQUEST LOGGING
========================= */
function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const reqPath = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined;

    const originalResJson = res.json.bind(res);
    res.json = (body: any) => {
      capturedJsonResponse = body;
      return originalResJson(body);
    };

    res.on("finish", () => {
      if (!reqPath.startsWith("/api")) return;

      const duration = Date.now() - start;
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;

      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 100) {
        logLine = logLine.slice(0, 99) + "…";
      }

      log(logLine);
    });

    next();
  });
}

/* =========================
   APP NAME
========================= */
function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

/* =========================
   EXPO MANIFEST
========================= */
function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );

  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({
      error: `Manifest not found for platform: ${platform}`,
    });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  res.send(fs.readFileSync(manifestPath, "utf-8"));
}

/* =========================
   LANDING PAGE
========================= */
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const protocol = req.header("x-forwarded-proto") || req.protocol || "https";
  const host = req.header("x-forwarded-host") || req.get("host");
  const baseUrl = `${protocol}://${host}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, host || "")
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

/* =========================
   EXPO + STATIC
========================= */
function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );

  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();

    if (req.path !== "/" && req.path !== "/manifest") return next();

    const platform = req.header("expo-platform");
    if (platform === "ios" || platform === "android") {
      return serveExpoManifest(platform, res);
    }

    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  // Serve menu images
  app.use('/images', express.static(path.join(__dirname, 'public', 'menu')));
}

/* =========================
   ERROR HANDLER
========================= */
function setupErrorHandler(app: express.Application) {
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });
}

/* =========================
   BOOTSTRAP
========================= */
(async () => {
  setupCors(app);              // ✅ FIRST
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

const port = Number(process.env.PORT) || 5000;

server.listen(port, "0.0.0.0", () => {
  log(`✅ Server running on port ${port}`);
});
})();
