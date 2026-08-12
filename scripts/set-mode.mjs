import fs from "node:fs";
import path from "node:path";

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

const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
let updated = false;
const nextLines = lines.map((line) => {
  if (line.startsWith("PERMISSION_MODE=")) {
    updated = true;
    return `PERMISSION_MODE=${mode}`;
  }
  return line;
});

if (!updated) {
  nextLines.push(`PERMISSION_MODE=${mode}`);
}

fs.writeFileSync(envPath, nextLines.join("\n"), "utf8");
console.log(`PERMISSION_MODE=${mode}`);
console.log("Restart Gateway and Desktop Agent for the change to take effect.");
