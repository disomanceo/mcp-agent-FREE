import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import dotenv from "dotenv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

dotenv.config({ quiet: true });

const port = process.env.GATEWAY_PORT ?? "8787";
const endpoint = `http://127.0.0.1:${port}/mcp`;
const projectName = process.argv[2] ?? "SampleProject";
const readPath = process.argv[3] ?? "README.md";
const gateway = spawn(process.execPath, ["apps/gateway/dist/index.js"], {
  env: process.env,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
const agent = spawn(process.execPath, ["apps/desktop-agent/dist/index.js"], {
  env: process.env,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForHealth();
  await waitForDevice();

  console.log("HEALTH");
  console.log(await fetchJson(`http://127.0.0.1:${port}/health`));
  console.log("DEVICES");
  console.log(await fetchJson(`http://127.0.0.1:${port}/api/devices`));

  const client = new Client({ name: "personal-mcp-agent-demo", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint));
  await client.connect(transport);

  for (const [name, args] of [
    ["get_projects", {}],
    ["list_files", { project: projectName }],
    ["read_file", { project: projectName, path: readPath }],
    ["git_status", { project: projectName }],
    ["git_diff", { project: projectName }],
    ["npm_build", { project: projectName }],
    ["npm_test", { project: projectName }],
  ]) {
    console.log(`TOOL ${name}`);
    try {
      console.log(JSON.stringify(await call(client, name, args), null, 2));
    } catch (error) {
      console.log(
        JSON.stringify(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      );
    }
  }

  await transport.close();
} finally {
  agent.kill();
  gateway.kill();
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
