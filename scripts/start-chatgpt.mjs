import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const port = process.env.GATEWAY_PORT ?? "8787";
const ngrokApi = "http://127.0.0.1:4040/api/tunnels";
const children = [];

console.log("Personal MCP Agent Launcher");
console.log("===========================");
console.log(`Workspace: ${process.env.WORKSPACE_ROOT ?? "(missing)"}`);
console.log(`Default project: ${process.env.DEFAULT_PROJECT ?? "(not set)"}`);
console.log(`Mode: ${process.env.PERMISSION_MODE ?? "SAFE"}`);
console.log("");

if (await isGatewayAlreadyRunning()) {
  console.error(
    `Port ${port} already has a Gateway responding. Close old Gateway/Agent terminals first, then retry.`,
  );
  process.exit(1);
}

runBuild();

start("gateway", process.execPath, ["apps/gateway/dist/index.js"]);
start("agent", process.execPath, ["apps/desktop-agent/dist/index.js"]);
const ngrokPath = findNgrok();
if (!ngrokPath) {
  console.error("ngrok.exe not found. Install ngrok first.");
  cleanup();
  process.exit(1);
}
start("ngrok", ngrokPath, ["http", port]);

process.on("SIGINT", () => {
  console.log("\nStopping Personal MCP Agent...");
  cleanup();
  process.exit(0);
});

try {
  await waitForHealth();
  await waitForDevice();
  const publicUrl = await waitForNgrokUrl();
  console.log("");
  console.log("READY");
  console.log(`MCP URL: ${publicUrl}/mcp`);
  console.log("");
  console.log("Keep this window open while using ChatGPT.");
  console.log("Press Ctrl+C to stop Gateway, Agent, and ngrok.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  cleanup();
  process.exit(1);
}

function runBuild() {
  console.log("Building...");
  const result = spawnSync("npm run build", {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: true,
    windowsHide: true,
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(result.status ?? 1);
  }
  console.log("Build complete.");
}

function start(label, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  child.stdout.on("data", (chunk) => writeLog(label, chunk));
  child.stderr.on("data", (chunk) => writeLog(label, chunk));
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
    }
  });
  return child;
}

function writeLog(label, chunk) {
  const text = chunk.toString().trimEnd();
  if (text.length > 0) {
    console.log(`[${label}] ${text}`);
  }
}

async function isGatewayAlreadyRunning() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    if (!response.ok) {
      return false;
    }
    const json = await response.json();
    return json?.service === "personal-mcp-gateway";
  } catch {
    return false;
  }
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      const json = await response.json();
      if (json.ok) return;
    } catch {
      await delay(500);
    }
  }
  throw new Error("Gateway did not become healthy.");
}

async function waitForDevice() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${port}/api/devices`);
    const devices = await response.json();
    if (Array.isArray(devices) && devices.some((device) => device.online)) return;
    await delay(500);
  }
  throw new Error("Desktop Agent did not connect.");
}

async function waitForNgrokUrl() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(ngrokApi);
      const data = await response.json();
      const tunnel = data.tunnels?.find((item) => item.public_url?.startsWith("https://"));
      if (tunnel?.public_url) {
        return tunnel.public_url.replace(/\/$/, "");
      }
    } catch {
      await delay(500);
    }
  }
  throw new Error("ngrok did not expose a public HTTPS URL.");
}

function cleanup() {
  for (const child of children.reverse()) {
    child.kill();
  }
}

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

  for (const entry of (process.env.PATH ?? "").split(path.delimiter)) {
    candidates.push(path.join(entry, "ngrok.exe"));
  }

  return candidates.find((candidate) => fs.existsSync(candidate));
}
