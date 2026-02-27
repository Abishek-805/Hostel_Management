# Security Upgrade - Testing & Verification Guide

## 🚀 LOCAL TESTING

### 1. Start Backend Server
```bash
cd Hostel_Management
npm run server:dev
```

Expected output:
```
✅ Server running on port 5000
🌍 Environment: DEVELOPMENT
🔒 Security: Helmet enabled, Rate limiting: 100/15min, Timeout: 30s
```

---

## 🔒 SECURITY FEATURES TEST

### 1. Test Security Headers
```bash
curl -I http://localhost:5000/
```

Expected response headers:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

---

### 2. Test Helmet CSP Headers
```bash
curl -I http://localhost:5000/ | grep -i content-security-policy
```

Expected: Content-Security-Policy header present

---

### 3. Test Rate Limiting
Make 101 rapid requests to trigger rate limit:

```bash
# Bash/Linux/Mac:
for i in {1..101}; do
  curl http://localhost:5000/api/attendance/user/123 -H "Authorization: Bearer fake"
done

# PowerShell:
1..101 | ForEach-Object { 
  Invoke-RestMethod -Uri "http://localhost:5000/api/attendance/user/123" -Headers @{"Authorization" = "Bearer fake"} -ErrorAction SilentlyContinue
}
```

Expected: After 100 requests, next request returns 429 Too Many Requests

---

### 4. Test Request Timeout (30s)
```bash
# Simulate slow endpoint (requires test route)
curl --max-time 35 http://localhost:5000/api/slow-endpoint
```

Expected: Times out and returns 408 after 30s

---

### 5. Test MongoDB Injection Prevention
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"registerId": {"$ne": null}, "password": "test"}'
```

Expected: Request body sanitized, injection blocked

---

## 🗄️ DATABASE INDEX VERIFICATION

### 1. Check User Model Indexes
```bash
# In MongoDB shell or MongoDB Compass
db.users.getIndexes()
```

Expected indexes:
```javascript
[
  { key: { _id: 1 } },                    // Default
  { key: { registerId: 1 } },             // Login query
  { key: { role: 1 } },                   // Filter by role
  { key: { hostelBlock: 1 } },            // Filter by hostel
  { key: { role: 1, hostelBlock: 1 } }    // Compound index
]
```

### 2. Check Attendance Model Indexes
```bash
db.attendances.getIndexes()
```

Expected indexes:
```javascript
[
  { key: { _id: 1 } },
  { key: { userId: 1, date: 1 } },        // Fetch by user+date
  { key: { userId: 1 } },                 // User records
  { key: { date: 1 } },                   // Daily reports
  { key: { userId: 1, date: -1 } }        // Recent records
]
```

---

## 🛑 GRACEFUL SHUTDOWN TEST

### 1. Start Server
```bash
npm run server:dev
```

### 2. Send Shutdown Signal
```bash
# In another terminal:
# Find process ID and send SIGTERM
ps aux | grep "tsx watch server"
kill -TERM <pid>

# Or in PowerShell:
Get-Process -Name node | Stop-Process -Force
```

Expected output:
```
🛑 SIGTERM received. Starting graceful shutdown...
✅ Server closed
✅ MongoDB connection closed
✅ Graceful shutdown complete
```

---

## 📊 MORGAN LOGGING TEST

### 1. Make API Requests and Check Logs
```bash
curl http://localhost:5000/api/announcements -H "Authorization: Bearer token"
```

Expected in console:
```
GET /api/announcements 200 45ms
```

---

## 🔑 ENVIRONMENT VALIDATION TEST

### 1. Test Missing MongoDB URI
```bash
# Simulate missing env var
unset MONGODB_URI
npm run server:dev
```

Expected error:
```
❌ Environment validation failed:
Missing required environment variables:
  - MONGODB_URI - MongoDB connection string

Please set these variables in your .env file or environment.
```

### 2. Test Invalid PORT
```bash
PORT=invalid npm run server:dev
```

Expected error:
```
❌ Environment validation failed:
Invalid PORT: invalid. Port must be a number between 1 and 65535.
```

---

## 🎯 PRODUCTION BUILD TEST

### 1. Build for Production
```bash
npm run server:build
```

Expected output:
```
> server:build
> esbuild server/index.ts --platform=node --packages=external --bundle --format=cjs --outdir=server_dist && node scripts/sync-weights.js

server_dist\index.js  138.3kb
Done in 162ms
[sync-weights] Synced weights to: ...
```

### 2. Run Production Bundle
```bash
NODE_ENV=production node server_dist/index.js
```

Expected output:
```
✅ Server running on port 5000
🌍 Environment: PRODUCTION
🔒 Security: Helmet enabled, Rate limiting: 100/15min, Timeout: 30s
```

---

## 🌐 RENDER DEPLOYMENT TEST

### 1. Verify Environment Variables Set
```bash
# Check in Render Dashboard > Environment
MONGODB_URI=...
JWT_SECRET=...
NODE_ENV=production
```

### 2. Check Logs After Deploy
```
✅ Server running on port 5000
🌍 Environment: PRODUCTION
🔒 Security: Helmet enabled, Rate limiting: 100/15min, Timeout: 30s
```

### 3. Test Live API
```bash
curl -I https://your-render-url.onrender.com/api/attendance

# Should return security headers
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
```

---

## 📈 PERFORMANCE MONITORING

### 1. Query Performance Before Indexes
```javascript
db.attendances.find({ userId: ObjectId("..."), date: { $gte: new Date("2026-02-01") } }).explain("executionStats")
```

Check: `totalDocsExamined` should be LOW with indexes

### 2. Query Performance After Indexes
```javascript
// Same query with indexes should show:
// - "stage": "IXSCAN" (index scan, not collection scan)
// - Much lower totalDocsExamined
// - Much lower executionTimeMillis
```

---

## 🐛 COMMON ISSUES & FIXES

### Issue: "Cannot find module 'helmet'"
**Solution:**
```bash
npm install
npm run server:dev
```

### Issue: Port 5000 Already in Use
**Solution:**
```bash
PORT=5001 npm run server:dev
```

### Issue: "MONGODB_URI" not set
**Solution:**
```bash
# Create/verify .env file has:
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret
```

### Issue: Rate Limiting Not Working
**Solution:**
- Ensure requests are to `/api/*` routes
- Rate limit resets every 15 minutes
- Check IP address (localhost vs 127.0.0.1 might be treated differently)

---

## ✅ COMPREHENSIVE CHECKLIST

### Backend Security
- [ ] Server starts with security messages
- [ ] Helmet security headers present
- [ ] Rate limiting works (101st request blocked)
- [ ] Environment variables validated
- [ ] MongoDB injection prevented
- [ ] Graceful shutdown handles SIGTERM

### Performance
- [ ] Indexes created in MongoDB
- [ ] Request timeout works (30s limit)
- [ ] Morgan logging shows request times
- [ ] Production build successful (138KB)
- [ ] Face recognition models load once

### Deployment
- [ ] Environment variables set in Render
- [ ] PORT environment variable used
- [ ] Server binds to 0.0.0.0
- [ ] Graceful shutdown on redeploy
- [ ] No errors in production logs

### Backward Compatibility
- [ ] Authentication works unchanged
- [ ] Attendance marking works
- [ ] Face recognition works
- [ ] CORS still functional
- [ ] API responses format unchanged

---

## 📞 SUPPORT

If issues arise:

1. Check server logs: `npm run server:dev`
2. Verify environment variables: `echo $MONGODB_URI`
3. Test with curl: `curl -v http://localhost:5000/api/test`
4. Review error messages (usually descriptive)
5. Check rate limit headers: `curl -I http://localhost:5000/api/test`

---

**Last Updated:** February 27, 2026
**Status:** Ready for Production ✅
