import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import dotenv from "dotenv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

dotenv.config({ quiet: true });

const projectName = process.argv[2] ?? "SampleProject";
const writePath = process.argv[3] ?? ".agent-scratch/CHATGPT_AGENT_TEST.md";
const workspaceRoot = process.env.WORKSPACE_ROOT;
const port = process.env.DEMO_GATEWAY_PORT ?? "8793";
const demoEnv = {
  ...process.env,
  GATEWAY_PORT: port,
  GATEWAY_URL: `ws://127.0.0.1:${port}/agent`,
};

if (process.env.PERMISSION_MODE !== "WORK") {
  console.error("PERMISSION_MODE must be WORK. Run npm run mode:work, then retry.");
  process.exit(1);
}

if (!workspaceRoot) {
  console.error("WORKSPACE_ROOT is missing. Run npm run setup:local first.");
  process.exit(1);
}

const gateway = spawn(process.execPath, ["apps/gateway/dist/index.js"], {
  env: demoEnv,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
const agent = spawn(process.execPath, ["apps/desktop-agent/dist/index.js"], {
  env: demoEnv,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForHealth();
  await waitForDevice();

  const client = new Client({ name: "personal-mcp-agent-work-demo", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
  await client.connect(transport);

  const content = `# ChatGPT Agent Test\n\nwrite_file works for ${projectName} at ${new Date().toISOString()}.\n`;
  console.log("TOOL write_file");
  console.log(
    JSON.stringify(
      await call(client, "write_file", {
        project: projectName,
        path: writePath,
        content,
        createDirs: true,
      }),
      null,
      2,
    ),
  );

  console.log("TOOL read_file");
  console.log(
    JSON.stringify(
      await call(client, "read_file", {
        project: projectName,
        path: writePath,
      }),
      null,
      2,
    ),
  );

  await transport.close();
} finally {
  agent.kill();
  gateway.kill();
  cleanupScratchFile();
}

async function call(client, name, args) {
  return client.request(
    {
      method: "tools/call",
      params: { name, arguments: args },
    },
    CallToolResultSchema,
  );
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const health = await fetchJson(`http://127.0.0.1:${port}/health`);
      if (health.ok) return;
    } catch {
      await delay(500);
    }
  }
  throw new Error("Gateway did not become healthy");
}

async function waitForDevice() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const devices = await fetchJson(`http://127.0.0.1:${port}/api/devices`);
    if (Array.isArray(devices) && devices.length > 0) return;
    await delay(500);
  }
  throw new Error("Agent did not connect");
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

function cleanupScratchFile() {
  const target = path.resolve(workspaceRoot, projectName, writePath);
  const projectRoot = path.resolve(workspaceRoot, projectName);
  if (!target.startsWith(projectRoot)) {
    return;
  }
  fs.rmSync(target, { force: true });

  const parent = path.dirname(target);
  if (path.basename(parent) === ".agent-scratch") {
    fs.rmSync(parent, { recursive: true, force: true });
  }
}
