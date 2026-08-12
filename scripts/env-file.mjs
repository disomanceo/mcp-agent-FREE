import fs from "node:fs";
import path from "node:path";

export function envPath() {
  return path.join(process.cwd(), ".env");
}

export function readEnvFile() {
  const filePath = envPath();
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/);
}

export function upsertEnvValue(key, value) {
  const filePath = envPath();
  const lines = readEnvFile();
  let updated = false;
  const nextLines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      updated = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!updated) {
    nextLines.push(`${key}=${value}`);
  }

  fs.writeFileSync(filePath, nextLines.join("\n"), "utf8");
}
