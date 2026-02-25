const fs = require("fs");
const path = require("path");

const source = path.resolve(process.cwd(), "server", "weights");
const target = path.resolve(process.cwd(), "weights");

if (!fs.existsSync(source)) {
  console.warn("[sync-weights] Source weights directory not found:", source);
  process.exit(0);
}

fs.cpSync(source, target, { recursive: true, force: true });
console.log("[sync-weights] Synced weights to:", target);
