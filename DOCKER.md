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

