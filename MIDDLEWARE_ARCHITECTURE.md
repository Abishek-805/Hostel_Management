# Security Middleware Architecture Guide

## 🏗️ Architecture Overview

The security middleware is organized in a modular, composable structure that makes it easy to understand, test, and extend.

```
server/index.ts (Entry Point)
    ↓
    ├─ validateEnvironment() [security startup check]
    ├─ logEnvironmentConfig() [configuration logging]
    └─ setupAllSecurityMiddleware(app) [All security setup]
            ↓
            ├─ setupHelmet(app) [HTTP security headers]
            ├─ setupSecurityHeaders(app) [Additional headers]
            ├─ setupRateLimiter(app) [API rate limiting]
            ├─ setupSanitization(app) [Input validation]
            ├─ setupRequestTimeout(app) [Connection timeout]
            └─ setupMorganLogger(app) [HTTP logging]
```

---

## 📁 File Structure

```
server/
├── index.ts                          # Main entry point (uses security middleware)
├── config/
│   ├── env.ts                        # Environment loading (original)
│   └── validateEnv.ts                # NEW: Environment validation at startup
└── middleware/
    └── security.ts                   # NEW: All security middleware
```

---

## 🔧 How Each Component Works

### 1. Environment Validation (`validateEnv.ts`)

**Called:** Before server startup in `index.ts`

**Purpose:** Ensure all required configuration is available before starting

**Flow:**
```typescript
// At server startup
try {
  const envConfig = validateEnvironment();
  logEnvironmentConfig(envConfig);
} catch (error) {
  console.error("❌ Environment validation failed");
  process.exit(1);  // Exit immediately on config error
}
```

**Exports:**
- `validateEnvironment(): EnvironmentConfig` - Validates and returns config
- `logEnvironmentConfig(config): void` - Safe logging of configuration
- `EnvironmentConfig` interface - Type definition for environment

**Validations:**
```typescript
// REQUIRED - Will cause process exit if missing
- MONGODB_URI: "mongodb+srv://..."
- JWT_SECRET: "secret-key"

// OPTIONAL - Has defaults
- PORT: 5000 (if not set)
- NODE_ENV: "development" (if not set)
- APP_ORIGIN: "https://hostel-management..." (if not set)
```

---

### 2. Helmet Security Headers (`security.ts` - setupHelmet)

**Applied:** First (order matters!)

**Purpose:** Set comprehensive HTTP security headers

**Headers Set:**
```
Strict-Transport-Security: max-age=...
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: ...
```

**Configuration:**
```typescript
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],  // Allows base64 images
      connectSrc: ["'self'", "https:"],      // All HTTPS
    },
  },
  frameguard: { action: "deny" },    // Block iframe embedding
  xssFilter: true,                   // Enable XSS filter
  noSniff: true,                     // Prevent MIME sniffing
})
```

**Browser Effect:**
- Prevents clickjacking attacks
- Prevents MIME type sniffing
- Enforces HTTPS connections
- Runs XSS filter

---

### 3. Additional Security Headers (`security.ts` - setupSecurityHeaders)

**Applied:** After Helmet

**Purpose:** Additional layer of protection

**Headers Set:**
```typescript
X-Powered-By: (removed)           // Don't advertise tech stack
X-Content-Type-Options: nosniff   // Prevent type confusion
X-Frame-Options: DENY             // No framing
X-XSS-Protection: 1; mode=block   // Enable browser XSS filter
Vary: Origin                       // Important for CORS caching
```

---

### 4. Rate Limiting (`security.ts` - setupRateLimiter)

**Applied:** After headers (before body parsing)

**Purpose:** Prevent brute force attacks and DoS

**Configuration:**
```typescript
{
  windowMs: 15 * 60 * 1000,    // 15-minute window
  max: 100,                     // 100 requests max
  message: {
    error: "Too many requests...",
    retryAfter: "15 minutes"
  },
  skip: (req) => !req.path.startsWith("/api")  // Only /api routes
}
```

**Per-IP Behavior:**
```
IP: 192.168.1.100
Time: 10:00 AM

Request 1-100: ✅ Allowed
Request 101: ❌ Rejected with 429

Window resets at 10:15 AM
```

**Response on Limit:**
```http
HTTP/1.1 429 Too Many Requests
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 1645877700

{
  "error": "Too many requests from this IP, please try again later.",
  "retryAfter": "15 minutes"
}
```

**Protected Routes:**
- ✅ `/api/*` - All API routes (protected)
- ❌ `/` - Landing page (not protected)
- ❌ `/assets/*` - Static files (not protected)

---

### 5. Input Sanitization (`security.ts` - setupSanitization)

**Applied:** Before body parsing

**Purpose:** Prevent MongoDB injection attacks

**Protection Pattern:**
```typescript
// Recursively check all request body values
const sanitizeData = (data) => {
  if (typeof data === "string") {
    if (data.startsWith("$")) {
      return "";  // Block $options, $where, etc.
    }
  }
  if (typeof data === "object") {
    // Check all nested keys
    for (const key in data) {
      if (key.startsWith("$")) {
        delete sanitized[key];  // Remove $-prefixed keys
      }
    }
  }
  return sanitized;
}
```

**Blocked Patterns:**
```javascript
// These are blocked:
{ "registerId": { "$ne": null } }                  // ❌ $ne operator
{ "password": { "$nin": [""] } }                   // ❌ $nin operator
{ "$where": "this.password == 'admin'" }           // ❌ $where operator
{ "field": "$regex: '^admin'" }                    // ❌ $regex operator

// Safe patterns:
{ "registerId": "user123" }                        // ✅ Direct value
{ "role": "student" }                              // ✅ Direct value
{ "isPresent": true }                              // ✅ Direct value
```

---

### 6. Request Timeout (`security.ts` - setupRequestTimeout)

**Applied:** After sanitization

**Purpose:** Prevent hung connections

**Behavior:**
```typescript
// On every request:
setTimeout(() => {
  if (!res.headersSent) {
    res.status(408).json({
      error: "Request Timeout",
      message: "The request took too long..."
    });
  }
}, 30000);  // 30 seconds

// Timeout clears when response sent
res.on("finish", () => clearTimeout(timeout));
```

**Timeline:**
```
0s:    Request arrives
...    Processing
30s:   If still pending → 408 response sent
31s+:  Client receives timeout error
```

**Protected Against:**
- Slowloris attacks (very slow client sends)
- Hung requests from slow database
- Infinite loops in request handlers

---

### 7. Morgan HTTP Logging (`security.ts` - setupMorganLogger)

**Applied:** After timeouts

**Purpose:** Log all HTTP requests for monitoring

**Formats:**

Production:
```
::1 - - [27/Feb/2026:05:30:11 +0000] GET /api/attendance/user/123 HTTP/1.1 200 512 65ms
```

Development:
```
GET /api/attendance/user/123 200 45.234 ms - 512
  ↑ Method ↑ Path         ↑ Status ↑ Response Time ↑ Size
```

**Logged Data:**
```
:remote-addr       - Client IP
:remote-user       - Authenticated user
:date[clf]         - Request date/time
:method            - HTTP method (GET, POST, etc)
:url               - Request path
:http-version      - HTTP version
:status            - Response status (200, 404, 500, etc)
:res[content-length] - Response body size
:response-time     - Time taken (ms)
```

---

### 8. Error Handler & Logging (`security.ts` - setupErrorLogging)

**Applied:** Last (catches all errors)

**Purpose:** Centralized error handling with environment awareness

**Handler Behavior:**

**Production Mode (isProduction = true):**
```typescript
// Don't leak stack traces
res.status(500).json({
  error: "Internal Server Error"
  // No stack trace, no sensitive info
});

// Log to console for monitoring
console.error("[ERROR 500] Database connection timeout");
```

**Development Mode (isProduction = false):**
```typescript
// Include stack trace for debugging
res.status(500).json({
  error: "Database connection timeout",
  stack: "Error: connect ECONNREFUSED 127.0.0.1:27017\n    at..."
});

// Full error logged to console
console.error(error);  // Full error object
```

**Error Status Codes:**
```
200-299: Success
400: Invalid request
401: Unauthorized
403: Forbidden
404: Not found
408: Request timeout (from timeout middleware)
429: Too many requests (from rate limiter)
500: Server error
```

---

## 🔄 Middleware Execution Order

**Critical**: Order matters! Security must be first.

```typescript
1. Environment Validation
   ↓
2. CORS Setup
   ↓
3. Body Parsing
   ↓
4. REQUEST LOGGING (Morgan) ← APPLIES TO ALL REQUESTS BELOW
   ↓
5. Expo/Landing Page Routes
   ↓
6. API Routes Registration
   ↓
7. Error Handler (catches all errors)
```

**Within setupAllSecurityMiddleware():**
```typescript
1. Helmet (security headers)
2. Security Headers (additional)
3. Rate Limiter (100 per 15min)
4. Sanitization (injection prevention)
5. Request Timeout (30s max)
6. Morgan Logger (request logging)
```

---

## 🧪 Testing Each Component

### Test Helmet Headers
```bash
curl -I http://localhost:5000/
grep -i x-frame-options
# Output: X-Frame-Options: DENY
```

### Test Rate Limiting
```bash
# Request 101 times
for i in {1..101}; do
  curl -s http://localhost:5000/api/test
done | tail -1
# Output: {"error": "Too many requests..."}
```

### Test Sanitization
```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"registerId": {"$ne": null}}'
# Body sanitized before reaching route
```

### Test Request Timeout
```bash
# (Requires manual slow endpoint for testing)
curl --max-time 35 http://localhost:5000/api/slow-endpoint
# Should timeout after 30s
```

### Test Morgan Logging
```bash
curl http://localhost:5000/api/announcements
# Check console output for request log
```

---

## 🛠️ How to Extend

### Add New Security Rule

**Example: Block specific user agents**

```typescript
// In security.ts
export function setupUserAgentFilter(app: express.Application) {
  const blockedAgents = ["curl", "wget", "python"];
  
  app.use((req: Request, res: Response, next: NextFunction) => {
    const userAgent = req.get("user-agent") || "";
    
    if (blockedAgents.some(agent => userAgent.toLowerCase().includes(agent))) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    next();
  });
}

// In setupAllSecurityMiddleware
export function setupAllSecurityMiddleware(app: express.Application) {
  setupHelmet(app);
  setupSecurityHeaders(app);
  setupRateLimiter(app);
  setupUserAgentFilter(app);     // Add new filter
  // ... rest
}
```

### Modify Rate Limit

**Example: Different limits for different routes**

```typescript
const apiLimiter = rateLimit({ max: 100 });
const authLimiter = rateLimit({ max: 5, windowMs: 60000 });  // 5 per minute

app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);
```

### Add Custom Logging

**Example: Log MongoDB slow queries**

```typescript
// In middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (duration > 1000) {  // Log queries > 1 second
      console.warn(`⚠️ SLOW REQUEST: ${req.method} ${req.path} took ${duration}ms`);
    }
  });
  
  next();
});
```

---

## 📊 Monitoring Checklist

After each deployment, monitor:

1. **Security Headers Present**
   ```bash
   curl -I https://api.example.com | grep -i "x-frame\|x-content\|x-xss"
   ```

2. **Rate Limiting Works**
   ```
   Check logs for 429 responses
   Should see: Few per day (indicates attack attempts blocked)
   ```

3. **Request Times**
   ```
   Check Morgan logs for response times
   Should see: Most requests < 100ms
   ```

4. **Timeout Errors**
   ```
   Check logs for 408 responses
   Should see: Very few (< 1 per day)
   ```

5. **Error Logging**
   ```
   Production: No stack traces visible
   Development: Full stack traces shown
   ```

---

## 🔐 Security Best Practices Used

| Practice | Implementation | Benefit |
|----------|-----------------|---------|
| Defense in Depth | Multiple layers | If one fails, others catch issues |
| Fail Secure | Blocks by default | Safer to deny than allow |
| Least Privilege | Rate limits for API only | Doesn't block static files |
| Input Validation | Sanitization middleware | Prevents injection attacks |
| Timeout Protection | 30s request timeout | Prevents resource exhaustion |
| Error Concealment | Stack traces hidden in prod | Prevents info disclosure |
| Monitoring | Morgan logging | Detects attacks in progress |

---

## 📖 Further Reading

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Helmet.js Documentation](https://helmetjs.github.io/)
- [MongoDB Security](https://docs.mongodb.com/manual/security/)

---

**Architecture Version:** 1.0
**Last Updated:** February 27, 2026
**Status:** Production-Ready ✅
