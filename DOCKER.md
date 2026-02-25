# Docker Setup for HostelEase

This setup includes Docker configurations for backend, frontend, and MongoDB database.

## Prerequisites
- Docker Desktop installed and running
- Docker Compose installed

## Quick Start

### 1. Build and Start All Services
```bash
docker-compose up --build
```

This will:
- Build the backend Docker image
- Build the frontend Docker image  
- Start MongoDB on port 27017
- Start backend on port 5001
- Start frontend on port 8081

### 2. Access the Application
- **Frontend (Web):** http://localhost:8081
- **Backend API:** http://localhost:5001
- **MongoDB:** localhost:27017

---

## Individual Commands

### Build Images
```bash
# Build backend only
docker build -f Dockerfile.backend -t hostelease-backend .

# Build frontend only
docker build -f Dockerfile.frontend -t hostelease-frontend .

# Build all (using compose)
docker-compose build
```

### Run Containers
```bash
# Start all services
docker-compose up

# Start in detached mode (background)
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f mongodb
```

### Rebuild After Code Changes
```bash
# Rebuild and restart services
docker-compose up --build

# Or update specific service
docker-compose up --build backend
docker-compose up --build frontend
```

---

## Environment Variables

Edit `docker-compose.yml` to modify:
- `MONGODB_URI`: Database connection string
- `JWT_SECRET`: JWT secret key
- `PORT`: Backend port
- `NODE_ENV`: Environment (production/development)

---

## Database

MongoDB runs in a container with:
- Volume: `mongodb_data` (persists data)
- Health check enabled
- Auto-restart on failure

To reset database:
```bash
docker volume rm hostelease-mongodb_data
docker-compose up
```

---

## Development vs Production

### Development (Local)
```bash
# Use npm scripts directly (no Docker needed)
npm run all:dev
```

### Production (Docker)
```bash
# Use docker-compose.yml (runs production builds)
docker-compose up
```

---

## Common Issues

**Port Already in Use:**
```bash
# Change ports in docker-compose.yml or use:
docker-compose down
```

**Container Won't Start:**
```bash
# Check logs
docker-compose logs backend
docker-compose logs frontend
docker-compose logs mongodb
```

**Database Connection Failed:**
- Ensure MongoDB container is healthy: `docker-compose ps`
- Wait for health check to pass (5-10 seconds)

---

## Production Deployment

For production, use:
- `docker compose -f docker-compose.prod.yml up --build -d`
- Add environment-specific `.env` files
- Ensure SSL certificates are present in `./ssl` before enabling HTTPS in `nginx.conf`
- Use Docker Swarm or Kubernetes for orchestration
- Configure CI/CD pipeline for automated builds

---

## Render Deployment (Recommended)

Use this when deploying backend on Render instead of Docker runtime.

### Build and Start Commands

```bash
npm run server:build
npm run server:prod
```

`server:build` now bundles the server and syncs face recognition weights to `/weights`.

### Required Environment Variables (Render)

- `NODE_ENV=production`
- `MONGODB_URI=<your_mongodb_atlas_connection_string>`
- `JWT_SECRET=<strong_random_secret>`

### Optional Environment Variables

- `PORT` (Render injects this automatically)
- `APP_ORIGIN=https://hostel-management-4el0.onrender.com`

### Runtime Expectations

- Server listens on `0.0.0.0` and `Number(process.env.PORT) || 5000`.
- Dotenv is loaded only in development (not in production runtime).
- App fails fast on startup with clear error if `MONGODB_URI` or `JWT_SECRET` is missing.

### Face Recognition Weights on Render

- Weights are expected at `weights/` (with fallback to `server/weights/`).
- If weights are missing/corrupt, server does **not** crash.
- Face endpoints return `503` (`Face verification service is currently unavailable`) until weights are available.

### CORS / Mobile Compatibility

- Production origin defaults to `https://hostel-management-4el0.onrender.com`.
- Override with `APP_ORIGIN` if your frontend domain changes.
- Preflight (`OPTIONS`) and credential headers are enabled for app clients.

### Health Check Suggestion

Configure Render Health Check Path to:

```text
/
```

Expected behavior:
- Returns `200` when server is up.
- If critical env vars are missing, service fails during startup and Render marks it unhealthy.

