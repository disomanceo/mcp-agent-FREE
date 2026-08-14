import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const port = process.env.GATEWAY_PORT ?? "8787";
const ngrokPath = findNgrok();

if (!ngrokPath) {
  console.error("ngrok.exe not found. Install ngrok first, then retry.");
  process.exit(1);
}

console.log(`Starting ngrok for http://127.0.0.1:${port}`);
console.log("Copy the Forwarding HTTPS URL and append /mcp for ChatGPT.");
console.log("");

const child = spawn(ngrokPath, ["http", port], {
  stdio: "inherit",
  windowsHide: false,
});

child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});

function findNgrok() {
  const candidates = [
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Links", "ngrok.exe"),
    path.join(os.homedir(), "AppData", "Local", "Programs", "ngrok", "ngrok.exe"),
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "ngrok", "ngrok.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "ngrok", "ngrok.exe"),
    path.join(
      os.homedir(),
      "AppData",
      "Local",
      "Microsoft",
      "WinGet",
      "Packages",
      "Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe",
      "ngrok.exe",
    ),
  ];

  const where = spawnSync("where.exe", ["ngrok"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 5000,
  });
  if (where.status === 0 && where.stdout) {
    candidates.push(...where.stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean));
  }

  const pathEntries = (process.env.PATH ?? "").split(path.delimiter);
  for (const entry of pathEntries) {
    candidates.push(path.join(entry, "ngrok.exe"));
  }

  candidates.push(...findFilesUnder(
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages"),
    "ngrok.exe",
    4,
  ));

  return [...new Set(candidates.filter(Boolean))].find((candidate) => fs.existsSync(candidate));
}

function findFilesUnder(root, fileName, maxDepth) {
  const results = [];
  if (!root || maxDepth < 0 || !fs.existsSync(root)) return results;

  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
      results.push(fullPath);
    } else if (entry.isDirectory() && maxDepth > 0) {
      results.push(...findFilesUnder(fullPath, fileName, maxDepth - 1));
    }
  }
  return results;
}
