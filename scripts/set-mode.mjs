import fs from "node:fs";
import path from "node:path";
import { upsertEnvValue } from "./env-file.mjs";

const mode = process.argv[2];
const allowed = new Set(["SAFE", "WORK"]);

if (!allowed.has(mode)) {
  console.error("Usage: npm run mode:safe OR npm run mode:work");
  process.exit(1);
}

const envPath = path.join(process.cwd(), ".env");
if (!fs.existsSync(envPath)) {
  console.error(".env not found. Run npm run setup:local first.");
  process.exit(1);
}

upsertEnvValue("PERMISSION_MODE", mode);
console.log(`PERMISSION_MODE=${mode}`);
console.log("Restart Gateway and Desktop Agent for the change to take effect.");
