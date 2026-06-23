#!/usr/bin/env bash
set -euo pipefail

echo "[vercel-build] pwd: $(pwd)"
echo "[vercel-build] contents:" 
ls -la

echo "[vercel-build] npm version:" 
npm --version

echo "[vercel-build] running: npm run build"
npm run build

echo "[vercel-build] dist contents:" 
ls -la dist || true

if [ ! -f dist/index.html ]; then
  echo "[vercel-build] ERROR: dist/index.html not found after build" >&2
  exit 1
fi

echo "[vercel-build] OK: dist/index.html exists"

