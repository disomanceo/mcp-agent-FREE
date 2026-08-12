import fs from "node:fs";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import dotenv from "dotenv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

dotenv.config({ quiet: true });

if (process.env.PERMISSION_MODE !== "WORK") {
  console.error("PERMISSION_MODE must be WORK. Run npm run mode:work, then retry.");
  process.exit(1);
}

const workspaceRoot = process.env.WORKSPACE_ROOT;
if (!workspaceRoot) {
  console.error("WORKSPACE_ROOT is missing. Run npm run setup:local first.");
  process.exit(1);
}

const projectName = "AgentGitDemo";
const remotePath = path.join(workspaceRoot, "AgentGitDemoRemote.git");
const projectPath = path.join(workspaceRoot, projectName);
const port = process.env.DEMO_GATEWAY_PORT ?? "8794";
const demoEnv = {
  ...process.env,
  GATEWAY_PORT: port,
  GATEWAY_URL: `ws://127.0.0.1:${port}/agent`,
};

cleanDemoPaths();
fs.mkdirSync(projectPath, { recursive: true });
run("git", ["init", "--bare", remotePath], workspaceRoot);
run("git", ["init"], projectPath);
run("git", ["config", "user.name", "Personal MCP Agent Demo"], projectPath);
run("git", ["config", "user.email", "agent-demo@example.local"], projectPath);
run("git", ["remote", "add", "origin", remotePath], projectPath);
fs.writeFileSync(path.join(projectPath, "package.json"), JSON.stringify({ scripts: {} }, null, 2));
run("git", ["add", "package.json"], projectPath);
run("git", ["commit", "-m", "chore: initial demo project"], projectPath);
run("git", ["push", "-u", "origin", "master"], projectPath);

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

  const client = new Client({ name: "personal-mcp-agent-git-demo", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
  await client.connect(transport);

  for (const [name, args] of [
    [
      "write_file",
      {
        project: projectName,
        path: "README.md",
        content: "# AgentGitDemo\n\nCreated through MCP git tools.\n",
      },
    ],
    ["git_stage", { project: projectName, paths: ["README.md"] }],
    [
      "git_commit",
      {
        project: projectName,
        message: "docs: add mcp git demo readme",
        runChecks: false,
      },
    ],
    ["git_push", { project: projectName }],
    ["git_log", { project: projectName, limit: 3 }],
  ]) {
    console.log(`TOOL ${name}`);
    console.log(JSON.stringify(await call(client, name, args), null, 2));
  }

  await transport.close();
} finally {
  agent.kill();
  gateway.kill();
  cleanDemoPaths();
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} failed`);
  }
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

function cleanDemoPaths() {
  for (const target of [projectPath, remotePath]) {
    if (target.startsWith(workspaceRoot)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
}
