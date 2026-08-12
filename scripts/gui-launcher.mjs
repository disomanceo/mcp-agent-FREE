import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import express from "express";
import dotenv from "dotenv";
import { upsertEnvValue } from "./env-file.mjs";

dotenv.config({ quiet: true });

const app = express();
const guiPort = Number(process.env.GUI_PORT ?? 8790);
const gatewayPort = process.env.GATEWAY_PORT ?? "8787";
const ngrokApi = "http://127.0.0.1:4040/api/tunnels";
const children = [];
const logs = [];

let state = {
  phase: "stopped",
  mcpUrl: "",
  error: "",
  startedAt: null,
};

app.use(express.json());

app.get("/", (_req, res) => {
  res.type("html").send(renderPage());
});

app.get("/api/status", async (_req, res) => {
  res.json({
    ...state,
    gatewayHealthy: await gatewayHealthy(),
    agentOnline: await agentOnline(),
    workspaceRoot: process.env.WORKSPACE_ROOT ?? "",
    defaultProject: process.env.DEFAULT_PROJECT ?? "",
    permissionMode: process.env.PERMISSION_MODE ?? "SAFE",
    logs: logs.slice(-250),
  });
});

app.get("/api/projects", (_req, res) => {
  try {
    res.json({ projects: listProjects(), defaultProject: process.env.DEFAULT_PROJECT ?? "" });
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/projects/default", (req, res) => {
  try {
    const project = String(req.body?.project ?? "");
    setDefaultProject(project);
    res.json({ ok: true, defaultProject: project });
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/start", async (_req, res) => {
  try {
    await startAll();
    res.json({ ok: true });
  } catch (error) {
    state.phase = "error";
    state.error = messageOf(error);
    log("launcher", state.error);
    cleanup();
    res.status(500).json({ error: state.error });
  }
});

app.post("/api/stop", (_req, res) => {
  cleanup();
  state = { ...state, phase: "stopped", mcpUrl: "", startedAt: null };
  log("launcher", "Stopped Gateway, Agent, and ngrok.");
  res.json({ ok: true });
});

const server = app.listen(guiPort, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${guiPort}`;
  console.log(`Personal MCP Agent GUI: ${url}`);
  if (process.env.GUI_NO_OPEN !== "1") {
    openBrowser(url);
  }
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function startAll() {
  if (state.phase === "starting" || state.phase === "ready") return;

  if (await gatewayHealthy()) {
    throw new Error(
      `Gateway already responds on port ${gatewayPort}. Stop the old launcher first.`,
    );
  }

  state = { phase: "starting", mcpUrl: "", error: "", startedAt: new Date().toISOString() };
  log("launcher", "Building project...");

  const build = spawnSync("npm run build", {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: true,
    windowsHide: true,
  });
  if (build.stdout) log("build", build.stdout.trimEnd());
  if (build.stderr) log("build", build.stderr.trimEnd());
  if (build.status !== 0) {
    throw new Error("Build failed. See logs below.");
  }

  startChild("gateway", process.execPath, ["apps/gateway/dist/index.js"]);
  startChild("agent", process.execPath, ["apps/desktop-agent/dist/index.js"]);

  const ngrokPath = findNgrok();
  if (!ngrokPath) {
    throw new Error("ngrok.exe not found. Install ngrok first, then retry.");
  }
  startChild("ngrok", ngrokPath, ["http", gatewayPort]);

  await waitUntil(gatewayHealthy, "Gateway did not become healthy.");
  await waitUntil(agentOnline, "Desktop Agent did not connect.");
  const publicUrl = await waitForNgrokUrl();

  state.phase = "ready";
  state.mcpUrl = `${publicUrl}/mcp`;
  log("launcher", `READY: ${state.mcpUrl}`);
}

function startChild(label, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  child.stdout.on("data", (chunk) => log(label, chunk.toString().trimEnd()));
  child.stderr.on("data", (chunk) => log(label, chunk.toString().trimEnd()));
  child.on("exit", (code) => {
    if (state.phase !== "stopped") {
      log(label, `Exited with code ${code ?? 0}`);
    }
  });
}

function cleanup() {
  for (const child of children.splice(0).reverse()) {
    child.kill();
  }
}

function shutdown() {
  cleanup();
  server.close(() => process.exit(0));
}

async function gatewayHealthy() {
  try {
    const response = await fetch(`http://127.0.0.1:${gatewayPort}/health`);
    const json = await response.json();
    return Boolean(response.ok && json?.ok);
  } catch {
    return false;
  }
}

async function agentOnline() {
  try {
    const response = await fetch(`http://127.0.0.1:${gatewayPort}/api/devices`);
    const devices = await response.json();
    return Array.isArray(devices) && devices.some((device) => device.online);
  } catch {
    return false;
  }
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

async function waitUntil(check, errorMessage) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await check()) return;
    await delay(500);
  }
  throw new Error(errorMessage);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listProjects() {
  const workspaceRoot = process.env.WORKSPACE_ROOT;
  if (!workspaceRoot || !fs.existsSync(workspaceRoot)) {
    return [];
  }
  return fs
    .readdirSync(workspaceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function setDefaultProject(project) {
  if (
    !project ||
    project.includes("/") ||
    project.includes("\\") ||
    project === "." ||
    project === ".."
  ) {
    throw new Error("Project must be a single folder name under WORKSPACE_ROOT.");
  }

  const workspaceRoot = process.env.WORKSPACE_ROOT;
  if (!workspaceRoot) throw new Error("WORKSPACE_ROOT is missing.");

  const projectPath = path.join(workspaceRoot, project);
  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    throw new Error(`Project not found: ${projectPath}`);
  }

  upsertEnvValue("DEFAULT_PROJECT", project);
  process.env.DEFAULT_PROJECT = project;
  log(
    "launcher",
    `Default project changed to ${project}. Restart agent to apply to active sessions.`,
  );
}

function findNgrok() {
  const candidates = [
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Links", "ngrok.exe"),
    path.join(os.homedir(), "AppData", "Local", "Programs", "ngrok", "ngrok.exe"),
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

function openBrowser(url) {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  } else if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

function log(label, text) {
  if (!text) return;
  for (const line of String(text).split(/\r?\n/)) {
    logs.push({ time: new Date().toLocaleTimeString(), label, text: line });
  }
  while (logs.length > 500) logs.shift();
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function renderPage() {
  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Personal MCP Agent</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f7f9;
        --panel: #ffffff;
        --ink: #1d2433;
        --muted: #647084;
        --line: #d9dee7;
        --green: #10845b;
        --red: #bd2d2d;
        --blue: #1d5fd0;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: "Segoe UI", Arial, sans-serif;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 24px;
        border-bottom: 1px solid var(--line);
        background: var(--panel);
      }
      h1 { margin: 0; font-size: 20px; font-weight: 650; }
      main {
        max-width: 1120px;
        margin: 0 auto;
        padding: 24px;
        display: grid;
        gap: 16px;
      }
      section {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 16px;
      }
      .grid {
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
        gap: 16px;
      }
      .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .title { font-size: 14px; color: var(--muted); margin-bottom: 8px; }
      .status {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        padding: 0 12px;
        border-radius: 999px;
        background: #eceff4;
        font-weight: 600;
      }
      .status.ready { background: #dff6eb; color: var(--green); }
      .status.error { background: #ffe6e6; color: var(--red); }
      button, select {
        min-height: 38px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: #fff;
        color: var(--ink);
        font: inherit;
        padding: 0 12px;
      }
      button.primary { background: var(--blue); border-color: var(--blue); color: #fff; }
      button.danger { color: var(--red); }
      button:disabled { opacity: 0.55; cursor: not-allowed; }
      select { min-width: 230px; }
      .url {
        flex: 1;
        min-width: 260px;
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: #f9fafc;
        font-family: Consolas, "Courier New", monospace;
        overflow-wrap: anywhere;
      }
      .meta {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .meta div {
        border: 1px solid var(--line);
        border-radius: 7px;
        padding: 10px;
        min-height: 70px;
      }
      .meta strong { display: block; font-size: 13px; color: var(--muted); margin-bottom: 8px; }
      pre {
        height: 300px;
        margin: 0;
        overflow: auto;
        padding: 12px;
        border-radius: 7px;
        background: #101622;
        color: #dbe7ff;
        font: 12px/1.45 Consolas, "Courier New", monospace;
        white-space: pre-wrap;
      }
      .hint { color: var(--muted); font-size: 13px; }
      @media (max-width: 820px) {
        .grid, .meta { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Personal MCP Agent</h1>
      <span id="status" class="status">Stopped</span>
    </header>
    <main>
      <section>
        <div class="title">ควบคุมการทำงาน</div>
        <div class="row">
          <button id="start" class="primary">Start</button>
          <button id="stop" class="danger">Stop</button>
          <button id="refresh">Refresh</button>
        </div>
      </section>

      <section>
        <div class="title">MCP URL สำหรับ ChatGPT</div>
        <div class="row">
          <div id="url" class="url">ยังไม่มี URL ให้กด Start ก่อน</div>
          <button id="copy">Copy</button>
        </div>
        <p class="hint">ถ้าใช้ ngrok ฟรี URL อาจเปลี่ยนเมื่อเปิดใหม่ ให้ copy URL ล่าสุดไปใส่ใน ChatGPT</p>
      </section>

      <div class="grid">
        <section>
          <div class="title">โปรเจกต์</div>
          <div class="row">
            <select id="projects"></select>
            <button id="setProject">Set Active Project</button>
          </div>
          <p class="hint">โปรเจกต์ต้องอยู่ใต้ D:\\AI-Workspace หลังเปลี่ยนโปรเจกต์ให้ Stop แล้ว Start ใหม่</p>
        </section>

        <section>
          <div class="title">สถานะ</div>
          <div class="meta">
            <div><strong>Workspace</strong><span id="workspace"></span></div>
            <div><strong>Active Project</strong><span id="activeProject"></span></div>
            <div><strong>Mode</strong><span id="mode"></span></div>
          </div>
        </section>
      </div>

      <section>
        <div class="title">Logs</div>
        <pre id="logs"></pre>
      </section>
    </main>
    <script>
      const els = {
        status: document.querySelector("#status"),
        start: document.querySelector("#start"),
        stop: document.querySelector("#stop"),
        refresh: document.querySelector("#refresh"),
        copy: document.querySelector("#copy"),
        url: document.querySelector("#url"),
        projects: document.querySelector("#projects"),
        setProject: document.querySelector("#setProject"),
        workspace: document.querySelector("#workspace"),
        activeProject: document.querySelector("#activeProject"),
        mode: document.querySelector("#mode"),
        logs: document.querySelector("#logs"),
      };

      els.start.addEventListener("click", () => post("/api/start"));
      els.stop.addEventListener("click", () => post("/api/stop"));
      els.refresh.addEventListener("click", refreshAll);
      els.copy.addEventListener("click", async () => {
        const text = els.url.textContent.trim();
        if (text.startsWith("https://")) await navigator.clipboard.writeText(text);
      });
      els.setProject.addEventListener("click", async () => {
        await post("/api/projects/default", { project: els.projects.value });
        await refreshAll();
      });

      async function post(url, body) {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: body ? JSON.stringify(body) : "{}",
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          alert(data.error || "Request failed");
        }
        await refreshAll();
      }

      async function refreshAll() {
        const [status, projects] = await Promise.all([
          fetch("/api/status").then((r) => r.json()),
          fetch("/api/projects").then((r) => r.json()),
        ]);
        renderStatus(status);
        renderProjects(projects);
      }

      function renderStatus(data) {
        const label = data.phase === "ready" ? "Ready" : data.phase === "starting" ? "Starting" : data.phase === "error" ? "Error" : "Stopped";
        els.status.textContent = label;
        els.status.className = "status " + (data.phase === "ready" ? "ready" : data.phase === "error" ? "error" : "");
        els.start.disabled = data.phase === "starting" || data.phase === "ready";
        els.stop.disabled = data.phase === "stopped";
        els.url.textContent = data.mcpUrl || "ยังไม่มี URL ให้กด Start ก่อน";
        els.workspace.textContent = data.workspaceRoot || "-";
        els.activeProject.textContent = data.defaultProject || "-";
        els.mode.textContent = data.permissionMode || "-";
        els.logs.textContent = data.logs.map((item) => "[" + item.time + "] [" + item.label + "] " + item.text).join("\\n");
        els.logs.scrollTop = els.logs.scrollHeight;
      }

      function renderProjects(data) {
        const selected = els.projects.value || data.defaultProject;
        els.projects.innerHTML = "";
        for (const project of data.projects || []) {
          const option = document.createElement("option");
          option.value = project;
          option.textContent = project === data.defaultProject ? project + " (active)" : project;
          option.selected = project === selected;
          els.projects.append(option);
        }
      }

      refreshAll();
      setInterval(refreshAll, 1500);
    </script>
  </body>
</html>`;
}
