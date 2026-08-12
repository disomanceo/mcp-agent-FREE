import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const root = process.cwd();
const smoke = path.join(root, "work-smoke");
const workspace = path.join(smoke, "workspace");
const project = path.join(workspace, "DemoProject");
const token = "test-token-1234567890";
const port = "8791";

fs.rmSync(smoke, { recursive: true, force: true });
fs.mkdirSync(project, { recursive: true });
fs.writeFileSync(
  path.join(project, "package.json"),
  JSON.stringify({
    scripts: {
      build: "node -e \"console.log('build ok')\"",
      test: "node -e \"console.log('test ok')\"",
    },
  }),
);
fs.writeFileSync(path.join(project, "README.md"), "hello from demo project\n");
spawnSync("git", ["-C", project, "init"], { stdio: "ignore", windowsHide: true });
spawnSync("git", ["-C", project, "add", "README.md", "package.json"], {
  stdio: "ignore",
  windowsHide: true,
});

const env = {
  ...process.env,
  GATEWAY_PORT: port,
  GATEWAY_HOST: "127.0.0.1",
  AGENT_TOKEN: token,
  GATEWAY_URL: `ws://127.0.0.1:${port}/agent`,
  WORKSPACE_ROOT: workspace,
  DEFAULT_PROJECT: "DemoProject",
  DEVICE_ID: "smoke-agent",
  DEVICE_NAME: "Smoke Agent",
  PERMISSION_MODE: "SAFE",
  AUDIT_LOG_PATH: path.join(smoke, "audit.jsonl"),
};

const gateway = spawn(process.execPath, ["apps/gateway/dist/index.js"], {
  cwd: root,
  env,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
const agent = spawn(process.execPath, ["apps/desktop-agent/dist/index.js"], {
  cwd: root,
  env,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForHealth();
  await waitForDevice();

  const client = new Client({ name: "smoke-client", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
  await client.connect(transport);

  const result = {
    health: await fetchJson(`http://127.0.0.1:${port}/health`),
    devices: await fetchJson(`http://127.0.0.1:${port}/api/devices`),
    get_projects: await call(client, "get_projects", {}),
    list_files: await call(client, "list_files", { project: "DemoProject" }),
    read_file: await call(client, "read_file", { project: "DemoProject", path: "README.md" }),
    git_status: await call(client, "git_status", { project: "DemoProject" }),
    git_diff: await call(client, "git_diff", { project: "DemoProject" }),
    npm_build: await call(client, "npm_build", { project: "DemoProject" }),
    npm_test: await call(client, "npm_test", { project: "DemoProject" }),
  };

  await transport.close();
  console.log(JSON.stringify(result, null, 2));
} finally {
  agent.kill();
  gateway.kill();
}

async function call(client, name, args) {
  return client.request(
    { method: "tools/call", params: { name, arguments: args } },
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
    if (Array.isArray(devices) && devices.some((device) => device.deviceId === "smoke-agent"))
      return;
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
