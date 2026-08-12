import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
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

  const pathEntries = (process.env.PATH ?? "").split(path.delimiter);
  for (const entry of pathEntries) {
    candidates.push(path.join(entry, "ngrok.exe"));
  }

  return candidates.find((candidate) => fs.existsSync(candidate));
}
