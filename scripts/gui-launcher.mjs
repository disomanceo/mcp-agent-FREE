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
const tunnelProvider = (process.env.TUNNEL_PROVIDER ?? "cloudflare").toLowerCase();
const tunnelFallback = (process.env.TUNNEL_FALLBACK ?? "ngrok").toLowerCase();
const cloudflareTunnelMode = (process.env.CLOUDFLARE_TUNNEL_MODE ?? "quick").toLowerCase();
const children = [];
const devServers = new Map();
const logs = [];
const projectEvents = [];
const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
const appVersion = packageJson.version ?? "0.0.0";

let state = {
  phase: "stopped",
  mcpUrl: "",
  error: "",
  startedAt: null,
};

app.use(express.json());
app.use("/assets", express.static(path.join(process.cwd(), "assets")));

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
    tunnelProvider,
    tunnelFallback,
    cloudflareTunnelMode,
    version: appVersion,
    logs: combinedLogs(),
  });
});

app.get("/api/projects", (_req, res) => {
  try {
    res.json({ projects: listProjects(), defaultProject: process.env.DEFAULT_PROJECT ?? "" });
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.get("/api/projects/details", (_req, res) => {
  try {
    res.json({
      projects: listProjectDetails(),
      defaultProject: process.env.DEFAULT_PROJECT ?? "",
    });
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.get("/api/git/status", (_req, res) => {
  try {
    res.json(getGitStatus(String(_req.query.project ?? process.env.DEFAULT_PROJECT ?? "")));
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

app.post("/api/projects/from-url", (req, res) => {
  try {
    const url = String(req.body?.url ?? "");
    const result = addProjectFromUrl(url);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/projects/from-local", (req, res) => {
  try {
    const sourcePath = String(req.body?.path ?? "");
    const result = addProjectFromLocal(sourcePath);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/projects/delete", (req, res) => {
  try {
    const project = String(req.body?.project ?? "");
    const result = deleteProject(project);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/projects/browse-folder", (_req, res) => {
  try {
    const folder = browseLocalFolder();
    res.json({ ok: true, folder });
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
  res.json({ ok: true, exiting: false });
});

app.post("/api/git/commit", (req, res) => {
  try {
    const result = gitCommitFromGui({
      project: String(req.body?.project ?? process.env.DEFAULT_PROJECT ?? ""),
      files: Array.isArray(req.body?.files) ? req.body.files.map(String) : [],
      message: String(req.body?.message ?? ""),
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/git/dev-test", async (req, res) => {
  try {
    const result = await runDevTest(String(req.body?.project ?? process.env.DEFAULT_PROJECT ?? ""));
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/git/dev-stop", (req, res) => {
  try {
    const result = stopDevServer(String(req.body?.project ?? process.env.DEFAULT_PROJECT ?? ""));
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/open-url", (req, res) => {
  try {
    const url = String(req.body?.url ?? "");
    if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(url)) {
      throw new Error("Only local dev URLs can be opened from here.");
    }
    openBrowser(url);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/git/push", (req, res) => {
  try {
    const result = gitPushFromGui(String(req.body?.project ?? process.env.DEFAULT_PROJECT ?? ""));
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/deploy/vercel", (req, res) => {
  try {
    const result = deployVercelFromGui(
      String(req.body?.project ?? process.env.DEFAULT_PROJECT ?? ""),
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/deploy/gas", (req, res) => {
  try {
    const result = deployGasFromGui(String(req.body?.project ?? process.env.DEFAULT_PROJECT ?? ""));
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/logs/clear", (_req, res) => {
  logs.splice(0);
  clearAuditLog();
  res.json({ ok: true });
});

const server = app.listen(guiPort, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${guiPort}`;
  console.log(`Personal MCP Agent GUI: ${url}`);
  if (process.env.GUI_NO_OPEN !== "1") {
    openBrowser(url);
  }
});
server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    const url = `http://127.0.0.1:${guiPort}`;
    console.log(`Personal MCP Agent GUI is already running: ${url}`);
    if (process.env.GUI_NO_OPEN !== "1") {
      openBrowser(url);
    }
    process.exit(0);
  }
  throw error;
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function startAll() {
  if (state.phase === "starting" || state.phase === "ready") return;

  if (await gatewayHealthy()) {
    cleanupOrphanProcesses();
    await delay(700);
    if (await gatewayHealthy()) {
      throw new Error(
        `Gateway already responds on port ${gatewayPort}. Close old Personal MCP Agent windows, then retry.`,
      );
    }
  }

  state = { phase: "starting", mcpUrl: "", error: "", startedAt: new Date().toISOString() };
  ensureWorkspaceDependencies();
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

  const gateway = startChild("gateway", process.execPath, ["apps/gateway/dist/index.js"]);
  await waitUntil(
    gatewayHealthy,
    "Gateway did not become healthy.",
    () => childExitError(gateway, "Gateway"),
  );

  const agent = startChild("agent", process.execPath, ["apps/desktop-agent/dist/index.js"]);
  await waitUntil(
    agentOnline,
    "Desktop Agent did not connect.",
    () => childExitError(agent, "Desktop Agent"),
  );

  const publicUrl = await startTunnel();

  state.phase = "ready";
  state.mcpUrl = `${publicUrl}/mcp`;
  log("launcher", `READY: ${state.mcpUrl}`);
}

async function startTunnel() {
  const providers = tunnelProvider === "ngrok" ? ["ngrok"] : ["cloudflare"];
  if (tunnelFallback && !providers.includes(tunnelFallback)) {
    providers.push(tunnelFallback);
  }

  const errors = [];
  for (const provider of providers) {
    try {
      if (provider === "cloudflare") {
        return await startCloudflareTunnel();
      }
      if (provider === "ngrok") {
        return await startNgrokTunnel();
      }
      errors.push(`${provider}: unsupported tunnel provider`);
    } catch (error) {
      const message = messageOf(error);
      errors.push(`${provider}: ${message}`);
      log("launcher", `${provider} tunnel failed: ${message}`);
    }
  }

  throw new Error(`No tunnel provider could start. ${errors.join(" | ")}`);
}

async function startCloudflareTunnel() {
  const cloudflaredPath = findCloudflared();
  if (!cloudflaredPath) {
    throw new Error("cloudflared.exe not found. Install cloudflared first, then retry.");
  }

  const configuredUrl = (process.env.CLOUDFLARE_PUBLIC_URL ?? "").trim().replace(/\/$/, "");
  if (cloudflareTunnelMode === "named") {
    const token = (process.env.CLOUDFLARE_TUNNEL_TOKEN ?? "").trim();
    if (!token) {
      throw new Error("CLOUDFLARE_TUNNEL_TOKEN is missing for named Cloudflare tunnel.");
    }
    startChild("cloudflare", cloudflaredPath, ["tunnel", "run", "--token", token]);
    if (!configuredUrl) {
      throw new Error("CLOUDFLARE_PUBLIC_URL is required for named Cloudflare tunnel mode.");
    }
    await delay(1200);
    return configuredUrl;
  }

  const cloudflare = startChild("cloudflare", cloudflaredPath, [
    "tunnel",
    "--url",
    `http://127.0.0.1:${gatewayPort}`,
  ]);
  try {
    return await waitForCloudflareUrl(cloudflare, () =>
      childExitError(cloudflare, "Cloudflare tunnel"),
    );
  } catch (error) {
    killProcessTree(cloudflare.pid);
    removeChild(cloudflare);
    throw error;
  }
}

async function startNgrokTunnel() {
  const ngrokPath = findNgrok();
  if (!ngrokPath) {
    throw new Error("ngrok.exe not found. Install ngrok first, then retry.");
  }
  const ngrok = startChild("ngrok", ngrokPath, ["http", gatewayPort]);
  return waitForNgrokUrl(() => childExitError(ngrok, "ngrok"));
}

function ensureWorkspaceDependencies() {
  const check = spawnSync(
    process.execPath,
    ["-e", "import('@personal-mcp-agent/protocol').then(()=>import('@personal-mcp-agent/shared'))"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
      timeout: 20_000,
    },
  );
  if (check.status === 0) {
    return;
  }

  log("launcher", "Workspace dependencies are missing. Running npm install...");
  if (check.stderr) log("launcher", check.stderr.trimEnd());
  const install = spawnSync("npm install", {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: true,
    windowsHide: true,
    timeout: 120_000,
  });
  if (install.stdout) log("install", install.stdout.trimEnd());
  if (install.stderr) log("install", install.stderr.trimEnd());
  if (install.status !== 0) {
    throw new Error("npm install failed. See logs below.");
  }
}

function startChild(label, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.lastOutput = "";
  child.outputBuffer = "";
  child.exitCodeSeen = null;
  children.push(child);
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString().trimEnd();
    child.lastOutput = text || child.lastOutput;
    child.outputBuffer = `${child.outputBuffer}\n${text}`.slice(-20_000);
    log(label, text);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString().trimEnd();
    child.lastOutput = text || child.lastOutput;
    child.outputBuffer = `${child.outputBuffer}\n${text}`.slice(-20_000);
    log(label, text);
  });
  child.on("exit", (code) => {
    child.exitCodeSeen = code ?? 0;
    if (state.phase !== "stopped") {
      log(label, `Exited with code ${code ?? 0}`);
    }
  });
  return child;
}

function cleanup() {
  for (const child of children.splice(0).reverse()) {
    killProcessTree(child.pid);
  }
  for (const entry of devServers.values()) {
    killProcessTree(entry.child.pid);
  }
  devServers.clear();
  cleanupOrphanProcesses();
}

function removeChild(child) {
  const index = children.indexOf(child);
  if (index >= 0) {
    children.splice(index, 1);
  }
}

function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
    });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process may have already exited.
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

async function waitForNgrokUrl(exitError) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const failure = exitError?.();
    if (failure) throw failure;
    try {
      const response = await fetch(ngrokApi);
      const data = await response.json();
      const tunnel = data.tunnels?.find((item) => item.public_url?.startsWith("https://"));
      if (tunnel?.public_url) {
        return tunnel.public_url.replace(/\/$/, "");
      }
    } catch {
      // The ngrok API can take a moment to come online.
    }
    await delay(500);
  }
  throw new Error("ngrok did not expose a public HTTPS URL.");
}

async function waitForCloudflareUrl(child, exitError) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const match = child.outputBuffer?.match(/https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com/i);
    if (match?.[0]) {
      return match[0].replace(/\/$/, "");
    }
    const failure = exitError?.();
    if (failure) throw failure;
    await delay(500);
  }
  throw new Error("Cloudflare did not expose a public HTTPS URL.");
}

async function waitUntil(check, errorMessage, exitError) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const failure = exitError?.();
    if (failure) throw failure;
    if (await check()) return;
    await delay(500);
  }
  throw new Error(errorMessage);
}

function childExitError(child, label) {
  if (child.exitCodeSeen === null || child.exitCodeSeen === undefined) return null;
  const detail = child.lastOutput ? ` Last output: ${child.lastOutput}` : "";
  return new Error(`${label} exited with code ${child.exitCodeSeen}.${detail}`);
}

function cleanupOrphanProcesses() {
  if (process.platform !== "win32") return;
  const root = process.cwd().replaceAll("'", "''");
  const script = `
$root = '${root}'
$current = ${process.pid}
$gatewayPort = '${gatewayPort}'
$ports = @([int]$gatewayPort, 4040)
$owners = @()
foreach ($port in $ports) {
  $owners += Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -ne 0 -and $_.OwningProcess -ne $current } |
    Select-Object -ExpandProperty OwningProcess
}
$ownerSet = @{}
foreach ($owner in $owners) { $ownerSet[[int]$owner] = $true }
Get-CimInstance Win32_Process | Where-Object {
  $cmd = [string]$_.CommandLine
  if ($_.ProcessId -eq $current -or [string]::IsNullOrWhiteSpace($cmd)) { return $false }
  $ownsAppPort = $ownerSet.ContainsKey([int]$_.ProcessId)
  $isPersonalNode = (
    $cmd -like "*scripts/gui-launcher.mjs*" -or
    $cmd -like "*apps/gateway/dist/index.js*" -or
    $cmd -like "*apps/desktop-agent/dist/index.js*" -or
    $cmd -like "*npm-cli.js* run start:gui*"
  )
  $isPersonalRoot = $cmd -like "*$root*" -and $isPersonalNode
  $isNgrok = $cmd -like "*ngrok*" -and $cmd -like "*http*" -and $cmd -like "*$gatewayPort*"
  $isCloudflared = $cmd -like "*cloudflared*" -and $cmd -like "*tunnel*" -and (
    $cmd -like "*127.0.0.1:$gatewayPort*" -or
    $cmd -like "*localhost:$gatewayPort*" -or
    $cmd -like "*--token*"
  )
  return $ownsAppPort -or $isPersonalRoot -or $isNgrok -or $isCloudflared
} | ForEach-Object {
  taskkill.exe /PID $_.ProcessId /T /F 2>$null | Out-Null
}
`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
  });
  if (result.status === 0) return;
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  if (output) log("launcher", `Process cleanup warning: ${output}`);
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

function listProjectDetails() {
  const workspaceRoot = process.env.WORKSPACE_ROOT;
  if (!workspaceRoot || !fs.existsSync(workspaceRoot)) {
    return [];
  }

  return fs
    .readdirSync(workspaceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => projectDetails(workspaceRoot, entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function projectDetails(workspaceRoot, name) {
  const projectPath = path.join(workspaceRoot, name);
  const metadata = readJson(path.join(projectPath, ".personal-mcp", "project.json"));
  const packageJson = readJson(path.join(projectPath, "package.json"));
  const readmeSummary = readReadmeSummary(projectPath);
  const docs = readProjectDocs(projectPath);
  const isGit = fs.existsSync(path.join(projectPath, ".git"));
  const latestCommit = isGit
    ? gitSummary(projectPath, ["log", "-1", "--pretty=format:%h|%ci|%s"])
    : null;
  const gitStatus = isGit ? gitSummary(projectPath, ["status", "--short"]) : "";
  const remote = isGit ? gitSummary(projectPath, ["remote", "get-url", "origin"]) : "";
  const kind = metadata?.type ?? (isGit ? "github" : packageJson ? "local" : "folder");
  const description =
    packageJson?.description ||
    metadata?.note ||
    readmeSummary ||
    (kind === "github"
      ? "Git repository in the local workspace."
      : "Local project folder in the workspace.");

  return {
    name,
    kind,
    active: name === process.env.DEFAULT_PROJECT,
    path: projectPath,
    description,
    packageName: packageJson?.name ?? "",
    latestCommit: parseLatestCommit(latestCommit),
    dirty: Boolean(gitStatus.trim()),
    gitStatus: gitStatus.trim(),
    remote: remote.trim(),
    sourceUrl: metadata?.displayUrl ?? metadata?.sourceUrl ?? remote.trim(),
    docs,
    health: projectHealth(projectPath, { isGit, gitStatus, remote, docs, packageJson }),
    recentFiles: recentChangedFiles(projectPath),
    events: recentProjectEvents(name),
  };
}

function projectHealth(projectPath, { isGit, gitStatus, remote, docs, packageJson }) {
  const checks = [
    { key: "folder", label: "โฟลเดอร์พร้อม", ok: fs.existsSync(projectPath) },
    { key: "git", label: "รู้จัก Git", ok: isGit },
    { key: "readme", label: "มี README", ok: Boolean(docs.readme) },
    { key: "todo", label: "มี TODO", ok: Boolean(docs.todo) },
    { key: "package", label: "มี package.json", ok: Boolean(packageJson) },
    { key: "remote", label: "เชื่อม GitHub/remote", ok: Boolean(remote.trim()) },
  ];
  const changedCount = isGit
    ? gitStatus.split(/\r?\n/).filter((line) => line.trim()).length
    : 0;
  const warnings = [];
  if (!isGit) warnings.push("ยังไม่ใช่ Git repo ให้กดเริ่ม Git ก่อน commit");
  if (isGit && changedCount > 0) warnings.push(`มีไฟล์เปลี่ยนแปลง ${changedCount} ไฟล์ ควรตรวจสอบก่อน commit`);
  if (isGit && !remote.trim()) warnings.push("ยังไม่มี remote ถ้าจะสำรองออนไลน์ให้เชื่อม GitHub");
  if (!docs.readme) warnings.push("ยังไม่มี README อธิบายว่าโปรเจกต์นี้ทำอะไร");
  if (!docs.todo) warnings.push("ยังไม่มี TODO สำหรับจดงานค้าง/แผนถัดไป");
  const score = checks.filter((check) => check.ok).length;
  return {
    checks,
    changedCount,
    status: warnings.length === 0 ? "ready" : isGit ? "review" : "setup",
    summary:
      warnings.length === 0
        ? "พร้อมใช้งานและติดตามด้วย Git แล้ว"
        : warnings.slice(0, 2).join(" · "),
  };
}

function recentChangedFiles(projectPath) {
  try {
    return fs
      .readdirSync(projectPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const filePath = path.join(projectPath, entry.name);
        const stat = fs.statSync(filePath);
        return { name: entry.name, mtimeMs: stat.mtimeMs, updatedAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 5)
      .map(({ name, updatedAt }) => ({ name, updatedAt }));
  } catch {
    return [];
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readReadmeSummary(projectPath) {
  for (const fileName of ["README.md", "readme.md"]) {
    const filePath = path.join(projectPath, fileName);
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    const line = text
      .split(/\r?\n/)
      .map((item) => item.replace(/^#+\s*/, "").trim())
      .find((item) => item.length > 0);
    if (line) return line.slice(0, 180);
  }
  return "";
}

function readProjectDocs(projectPath) {
  return {
    readme: readDocPreview(projectPath, ["README.md", "readme.md"]),
    todo: readDocPreview(projectPath, ["TODO.md", "todo.md"]),
  };
}

function readDocPreview(projectPath, fileNames) {
  for (const fileName of fileNames) {
    const filePath = path.join(projectPath, fileName);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
    const text = fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 4)
      .join(" · ");
    return {
      file: fileName,
      text: text.slice(0, 320),
    };
  }
  return null;
}

function gitSummary(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
  });
  if (result.status !== 0) return "";
  return result.stdout;
}

function parseLatestCommit(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const [hash, date, ...messageParts] = text.split("|");
  return { hash, date, message: messageParts.join("|") };
}

function gitTrackingStatus(projectPath) {
  const upstream = gitSummary(projectPath, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{u}",
  ]).trim();
  if (!upstream) return { upstream: "", ahead: 0, behind: 0 };
  const counts = gitSummary(projectPath, ["rev-list", "--left-right", "--count", `HEAD...${upstream}`])
    .trim()
    .split(/\s+/)
    .map((value) => Number.parseInt(value, 10));
  return {
    upstream,
    ahead: Number.isFinite(counts[0]) ? counts[0] : 0,
    behind: Number.isFinite(counts[1]) ? counts[1] : 0,
  };
}

function getGitStatus(project) {
  const projectPath = requireGitProject(project);
  const branch = gitSummary(projectPath, ["branch", "--show-current"]).trim() || "(detached)";
  const remote = gitSummary(projectPath, ["remote", "get-url", "origin"]).trim();
  const latestCommit = parseLatestCommit(
    gitSummary(projectPath, ["log", "-1", "--pretty=format:%h|%ci|%s"]),
  );
  const porcelain = gitSummary(projectPath, ["status", "--porcelain=v1"]);
  const files = porcelain.split(/\r?\n/).map(parsePorcelainLine).filter(Boolean);
  const suggestedMessage = suggestCommitMessage(files);
  const tracking = gitTrackingStatus(projectPath);
  const packageJson = readJson(path.join(projectPath, "package.json"));
  const canRunDev = Boolean(packageJson?.scripts?.dev);
  return { project, branch, remote, latestCommit, tracking, files, suggestedMessage, canRunDev };
}

function gitCommitFromGui({ project, files, message }) {
  const projectPath = requireGitProject(project);
  const selectedFiles = files.filter(Boolean);
  if (selectedFiles.length === 0) {
    throw new Error("เลือกไฟล์อย่างน้อย 1 ไฟล์ก่อน commit");
  }
  if (!message.trim()) {
    throw new Error("ใส่ commit message ก่อน");
  }
  for (const file of selectedFiles) {
    assertSafeGitPath(file);
  }

  const add = spawnSync("git", ["add", "--", ...selectedFiles], {
    cwd: projectPath,
    encoding: "utf8",
    windowsHide: true,
    timeout: 60_000,
  });
  if (add.status !== 0) {
    throw new Error(add.stderr || "git add failed");
  }

  const commit = spawnSync("git", ["commit", "-m", message.trim()], {
    cwd: projectPath,
    encoding: "utf8",
    windowsHide: true,
    timeout: 60_000,
  });
  if (commit.status !== 0) {
    throw new Error(commit.stderr || commit.stdout || "git commit failed");
  }

  const hash = gitSummary(projectPath, ["rev-parse", "--short", "HEAD"]).trim();
  log("git", `Committed ${hash}: ${message.trim()}`);
  if (commit.stdout.trim()) {
    log("git", commit.stdout.trim());
  }
  markProjectEvent(project, "git", `Commit ${hash}`);
  return { ok: true, hash, output: commit.stdout.trim() };
}

async function runDevTest(project) {
  const projectPath = requireProjectDirectory(project);
  const packageJson = readJson(path.join(projectPath, "package.json"));
  if (!packageJson?.scripts?.dev) {
    throw new Error("This project does not have npm script: dev.");
  }
  const existing = devServers.get(project);
  if (existing && existing.child.exitCode === null) {
    return { ok: true, url: existing.url, output: existing.output, alreadyRunning: true };
  }

  log("test", `Starting npm run dev test for ${project}...`);
  const child = spawn(npmRunnerCommand(), npmRunnerArgs(["run", "dev"]), {
    cwd: projectPath,
    env: { ...process.env, CI: "1", BROWSER: "none" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const append = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-5000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);

  const result = await waitForDevServer(child, () => output);
  devServers.set(project, { child, url: result.url, output: result.output });
  child.on("exit", () => {
    if (devServers.get(project)?.child === child) devServers.delete(project);
  });
  markProjectEvent(project, "test", "Local dev test passed");
  log("test", `Local dev test passed for ${project}`);
  return result;
}

async function waitForDevServer(child, output) {
  const readyPattern = /(local:|ready|started|compiled|listening|localhost|127\.0\.0\.1|http:\/\/)/i;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    if (child.exitCode !== null) {
      throw new Error(`npm run dev exited early.\n${output().trim()}`);
    }
    const currentOutput = output();
    const url = extractLocalUrl(currentOutput);
    if (readyPattern.test(currentOutput) || url) {
      return { ok: true, url: url || "", output: currentOutput.trim() };
    }
    await delay(400);
  }
  const currentOutput = output();
  return {
    ok: true,
    url: extractLocalUrl(currentOutput),
    output: currentOutput.trim() || "Dev server stayed running for 15 seconds.",
  };
}

function extractLocalUrl(output) {
  const matches = String(output).match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/[^\s]*)?/gi);
  const url = matches?.find(Boolean) ?? "";
  return url.replace("0.0.0.0", "localhost");
}

function stopDevServer(project) {
  const server = devServers.get(project);
  if (!server) return { ok: true, stopped: false };
  server.child.kill();
  devServers.delete(project);
  log("test", `Stopped local dev server for ${project}`);
  return { ok: true, stopped: true };
}

function gitPushFromGui(project) {
  const projectPath = requireGitProject(project);
  const upstream = gitSummary(projectPath, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{u}",
  ]).trim();
  if (!upstream) {
    throw new Error("branch นี้ยังไม่มี upstream ให้ตั้ง upstream ใน PowerShell ครั้งแรกก่อน");
  }
  const dirty = gitSummary(projectPath, ["status", "--porcelain=v1"]).trim();
  if (dirty) {
    throw new Error("ยังมีไฟล์ที่ยังไม่ได้ commit ให้ commit ให้เรียบร้อยก่อน push");
  }
  const push = spawnSync("git", ["push"], {
    cwd: projectPath,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120_000,
  });
  if (push.status !== 0) {
    throw new Error(push.stderr || push.stdout || "git push failed");
  }
  log("git", `Pushed ${project} to ${upstream}`);
  markProjectEvent(project, "github", `Pushed to ${upstream}`);
  return { ok: true, upstream, output: `${push.stdout}\n${push.stderr}`.trim() };
}

function deployVercelFromGui(project) {
  const projectPath = requireProjectDirectory(project);
  assertCleanIfGit(projectPath);
  const vercelConfig = fs.existsSync(path.join(projectPath, "vercel.json"));
  const packageJson = readJson(path.join(projectPath, "package.json"));
  if (!vercelConfig && !packageJson) {
    throw new Error("This project does not look like a Vercel/Node project.");
  }
  const result = spawnSync(packageRunnerCommand(), packageRunnerArgs("vercel", [
    "deploy",
    "--prod",
    "--yes",
  ]), {
    cwd: projectPath,
    encoding: "utf8",
    windowsHide: true,
    timeout: 600_000,
  });
  const output = `${result.stdout}\n${result.stderr}`.trim();
  if (result.status !== 0) {
    throw new Error(output || "Vercel deploy failed");
  }
  log("deploy", `Vercel deploy complete for ${project}`);
  markProjectEvent(project, "vercel", "Vercel deploy");
  return { ok: true, output };
}

function deployGasFromGui(project) {
  const projectPath = requireProjectDirectory(project);
  assertCleanIfGit(projectPath);
  if (!fs.existsSync(path.join(projectPath, ".clasp.json"))) {
    throw new Error("Missing .clasp.json. Sync or clone the GAS project with clasp first.");
  }
  const push = spawnSync(packageRunnerCommand(), packageRunnerArgs("clasp", ["push", "-f"]), {
    cwd: projectPath,
    encoding: "utf8",
    windowsHide: true,
    timeout: 300_000,
  });
  const pushOutput = `${push.stdout}\n${push.stderr}`.trim();
  if (push.status !== 0) {
    throw new Error(pushOutput || "clasp push failed");
  }
  const deploy = spawnSync(packageRunnerCommand(), packageRunnerArgs("clasp", ["deploy"]), {
    cwd: projectPath,
    encoding: "utf8",
    windowsHide: true,
    timeout: 300_000,
  });
  const deployOutput = `${deploy.stdout}\n${deploy.stderr}`.trim();
  if (deploy.status !== 0) {
    throw new Error(deployOutput || "clasp deploy failed");
  }
  log("deploy", `GAS deploy complete for ${project}`);
  markProjectEvent(project, "gas", "GAS deploy");
  return { ok: true, output: `${pushOutput}\n${deployOutput}`.trim() };
}

function markProjectEvent(project, type, label) {
  projectEvents.unshift({
    project,
    type,
    label,
    at: new Date().toISOString(),
  });
  while (projectEvents.length > 80) projectEvents.pop();
}

function recentProjectEvents(project) {
  const cutoff = Date.now() - 30 * 60 * 1000;
  return projectEvents
    .filter((event) => event.project === project && Date.parse(event.at) >= cutoff)
    .slice(0, 4);
}

function packageRunnerCommand() {
  if (process.platform === "win32") return process.execPath;
  return "npx";
}

function packageRunnerArgs(command, args) {
  if (process.platform !== "win32") return [command, ...args];
  return [findNpxCli(), command, ...args];
}

function npmRunnerCommand() {
  if (process.platform === "win32") return process.execPath;
  return "npm";
}

function npmRunnerArgs(args) {
  if (process.platform !== "win32") return args;
  return [findNpmCli(), ...args];
}

function findNpmCli() {
  const candidates = [
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "nodejs", "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error("Cannot find npm-cli.js. Reinstall Node.js or add npm to PATH.");
  }
  return found;
}

function findNpxCli() {
  const candidates = [
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "nodejs", "node_modules", "npm", "bin", "npx-cli.js"),
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error("Cannot find npx-cli.js. Reinstall Node.js or run npm install -g npm.");
  }
  return found;
}

function assertCleanIfGit(projectPath) {
  if (!fs.existsSync(path.join(projectPath, ".git"))) return;
  const dirty = gitSummary(projectPath, ["status", "--porcelain=v1"]).trim();
  if (dirty) {
    throw new Error("Commit all changes before deploy.");
  }
}

function requireProjectDirectory(project) {
  if (!project) throw new Error("Select a project first.");
  const workspaceRoot = requireWorkspaceRoot();
  if (project.includes("/") || project.includes("\\") || project === "." || project === "..") {
    throw new Error("Project must be a folder name under WORKSPACE_ROOT.");
  }
  const projectPath = path.join(workspaceRoot, project);
  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    throw new Error(`Project not found: ${projectPath}`);
  }
  return projectPath;
}

function requireGitProject(project) {
  const projectPath = requireProjectDirectory(project);
  if (!fs.existsSync(path.join(projectPath, ".git"))) {
    throw new Error("โปรเจกต์นี้ยังไม่ใช่ Git repository");
  }
  return projectPath;
}

function parsePorcelainLine(line) {
  if (!line.trim()) return null;
  const status = line.slice(0, 2);
  const rawPath = line.slice(3).trim();
  const filePath = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) : rawPath;
  return {
    path: filePath,
    status,
    label: gitStatusLabel(status),
    safe: isSafeGitPath(filePath),
  };
}

function gitStatusLabel(status) {
  if (status.includes("?")) return "new";
  if (status.includes("D")) return "deleted";
  if (status.includes("R")) return "renamed";
  if (status.includes("A")) return "added";
  if (status.includes("M")) return "modified";
  return "changed";
}

function suggestCommitMessage(files) {
  if (files.length === 0) return "";
  const labels = new Set(files.map((file) => file.label));
  if (labels.has("added") || labels.has("new")) return "feat: add project updates";
  if (labels.has("deleted")) return "chore: remove unused files";
  return "fix: update project files";
}

function assertSafeGitPath(filePath) {
  if (!isSafeGitPath(filePath)) {
    throw new Error(`ไฟล์นี้ดูเหมือนเป็น secret จึงไม่อนุญาตให้ commit: ${filePath}`);
  }
}

function isSafeGitPath(filePath) {
  const normalized = String(filePath).replaceAll("\\", "/").toLowerCase();
  const baseName = path.posix.basename(normalized);
  return !(
    baseName === ".env" ||
    (baseName.startsWith(".env.") && baseName !== ".env.example") ||
    baseName.endsWith(".pem") ||
    baseName.endsWith(".key") ||
    baseName.includes("secret") ||
    ["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"].includes(baseName)
  );
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

function deleteProject(project) {
  const projectPath = requireProjectDirectory(project);
  const workspaceRoot = fs.realpathSync(requireWorkspaceRoot());
  const resolvedProject = fs.realpathSync(projectPath);
  if (resolvedProject === workspaceRoot || !resolvedProject.startsWith(workspaceRoot + path.sep)) {
    throw new Error("Refusing to delete a folder outside WORKSPACE_ROOT.");
  }

  fs.rmSync(resolvedProject, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
  if (process.env.DEFAULT_PROJECT === project) {
    upsertEnvValue("DEFAULT_PROJECT", "");
    process.env.DEFAULT_PROJECT = "";
  }
  log("launcher", `Deleted project folder: ${resolvedProject}`);
  markProjectEvent(project, "delete", "Project deleted");
  return { ok: true, project, deletedPath: resolvedProject };
}

function addProjectFromUrl(rawUrl) {
  const parsed = parseProjectUrl(rawUrl);
  if (parsed.type === "github") {
    return cloneGitHubProject(parsed);
  }
  return createLinkedProject(parsed);
}

function addProjectFromLocal(rawPath) {
  const cleanedPath = rawPath.trim().replace(/^["']|["']$/g, "");
  if (!cleanedPath) throw new Error("Local folder path is required.");
  const sourcePath = path.resolve(cleanedPath);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
    throw new Error(`Local folder not found: ${sourcePath}`);
  }

  const workspaceRoot = fs.realpathSync(requireWorkspaceRoot());
  const resolvedSource = fs.realpathSync(sourcePath);
  const projectName = cleanSlug(path.basename(resolvedSource));
  if (!projectName) throw new Error("Could not determine a project name from this folder.");

  let targetPath;
  let copied = false;
  if (resolvedSource === workspaceRoot || resolvedSource.startsWith(workspaceRoot + path.sep)) {
    targetPath = resolvedSource;
  } else {
    targetPath = path.join(workspaceRoot, uniqueProjectName(workspaceRoot, projectName));
    fs.cpSync(resolvedSource, targetPath, {
      recursive: true,
      filter: (source) => !isSkippedLocalImportPath(source, resolvedSource),
    });
    copied = true;
  }

  const project = {
    type: "local",
    name: path.basename(targetPath),
    sourcePath: resolvedSource,
    displayUrl: resolvedSource,
  };
  writeProjectMetadata(targetPath, project);
  upsertEnvValue("DEFAULT_PROJECT", project.name);
  process.env.DEFAULT_PROJECT = project.name;
  log("launcher", `${copied ? "Imported" : "Linked"} local project: ${project.name}`);
  markProjectEvent(project.name, "local", copied ? "Imported local folder" : "Added local folder");
  return { ok: true, project: project.name, kind: "local", copied, path: targetPath };
}

function browseLocalFolder() {
  if (process.platform !== "win32") {
    throw new Error("Folder picker is currently available on Windows only.");
  }
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select a project folder'
$dialog.ShowNewFolderButton = $false
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output $dialog.SelectedPath
}
`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Sta", "-Command", script], {
    encoding: "utf8",
    windowsHide: false,
    timeout: 120_000,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "Folder picker failed.");
  }
  return result.stdout.trim();
}

function isSkippedLocalImportPath(source, root) {
  const relative = path.relative(root, source).replaceAll("\\", "/");
  if (!relative) return false;
  const parts = relative.split("/");
  return parts.some((part) =>
    ["node_modules", ".next", ".nuxt", "dist", "build", ".turbo", ".cache", "coverage"].includes(
      part,
    ),
  );
}

function parseProjectUrl(rawUrl) {
  const trimmed = rawUrl.trim();
  if (!trimmed) throw new Error("URL is required.");

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Invalid URL.");
  }

  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "github.com" && parts.length >= 2) {
    const owner = cleanSlug(parts[0]);
    const repo = cleanSlug(parts[1].replace(/\.git$/i, ""));
    return {
      type: "github",
      name: repo,
      sourceUrl: `https://github.com/${owner}/${repo}.git`,
      displayUrl: `https://github.com/${owner}/${repo}`,
      owner,
      repo,
    };
  }

  if (host === "vercel.com" && parts.length >= 2) {
    const team = cleanSlug(parts[0]);
    const project = cleanSlug(parts[1]);
    return {
      type: "vercel",
      name: project,
      displayUrl: `https://vercel.com/${team}/${project}`,
      team,
      project,
    };
  }

  if (host === "script.google.com") {
    const projectIndex = parts.findIndex((part) => part === "projects");
    const scriptId = projectIndex >= 0 ? parts[projectIndex + 1] : undefined;
    if (!scriptId) {
      throw new Error("Could not find Google Apps Script project id in URL.");
    }
    return {
      type: "gas",
      name: `gas-${scriptId.slice(0, 10)}`,
      displayUrl: trimmed,
      scriptId,
    };
  }

  throw new Error(
    "Supported URLs: GitHub repository, Vercel project, or Google Apps Script project.",
  );
}

function cloneGitHubProject(project) {
  const workspaceRoot = requireWorkspaceRoot();
  const projectPath = path.join(workspaceRoot, project.name);
  if (fs.existsSync(projectPath)) {
    throw new Error(`Project already exists: ${projectPath}`);
  }

  log("launcher", `Cloning ${project.displayUrl} into ${projectPath}...`);
  const result = spawnSync("git", ["clone", project.sourceUrl, projectPath], {
    cwd: workspaceRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.stdout) log("git", result.stdout.trimEnd());
  if (result.stderr) log("git", result.stderr.trimEnd());
  if (result.status !== 0) {
    throw new Error("Git clone failed. Check the URL and GitHub access.");
  }

  writeProjectMetadata(projectPath, project);
  upsertEnvValue("DEFAULT_PROJECT", project.name);
  process.env.DEFAULT_PROJECT = project.name;
  log("launcher", `Added GitHub project: ${project.name}`);
  return { ok: true, project: project.name, kind: "github", cloned: true };
}

function createLinkedProject(project) {
  const workspaceRoot = requireWorkspaceRoot();
  const projectPath = path.join(workspaceRoot, uniqueProjectName(workspaceRoot, project.name));
  fs.mkdirSync(path.join(projectPath, ".personal-mcp"), { recursive: true });
  writeProjectMetadata(projectPath, project);
  fs.writeFileSync(path.join(projectPath, "README.md"), linkedProjectReadme(project), "utf8");

  const projectName = path.basename(projectPath);
  upsertEnvValue("DEFAULT_PROJECT", projectName);
  process.env.DEFAULT_PROJECT = projectName;
  log("launcher", `Added linked ${project.type.toUpperCase()} project: ${projectName}`);
  return { ok: true, project: projectName, kind: project.type, cloned: false };
}

function writeProjectMetadata(projectPath, project) {
  const note =
    project.type === "github"
      ? "Local git repository cloned from GitHub."
      : project.type === "local"
        ? "Local project folder imported for Personal MCP Agent editing."
        : "Linked project wrapper. Add or sync source files here before asking ChatGPT to edit code.";
  fs.mkdirSync(path.join(projectPath, ".personal-mcp"), { recursive: true });
  fs.writeFileSync(
    path.join(projectPath, ".personal-mcp", "project.json"),
    JSON.stringify(
      {
        ...project,
        addedAt: new Date().toISOString(),
        note,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

function linkedProjectReadme(project) {
  if (project.type === "vercel") {
    return `# ${project.project}

Linked Vercel project.

- Vercel URL: ${project.displayUrl}
- Team: ${project.team}
- Project: ${project.project}

This folder is a Personal MCP Agent project wrapper. If this Vercel project is connected to GitHub, add the GitHub repository URL in the launcher to clone the real source code into D:\\AI-Workspace.

Useful prompt:

\`\`\`text
อ่าน README.md และ .personal-mcp/project.json ของโปรเจกต์นี้ แล้วช่วยสรุปว่าต้องการ source code จาก GitHub repo ไหนต่อ
\`\`\`
`;
  }

  return `# Google Apps Script ${project.scriptId}

Linked Google Apps Script project.

- Apps Script URL: ${project.displayUrl}
- Script ID: ${project.scriptId}

This folder is a Personal MCP Agent project wrapper. To edit GAS code locally, sync the Apps Script project into this folder with clasp, then ask ChatGPT to work on the local files.

Typical clasp flow:

\`\`\`powershell
npm install -g @google/clasp
clasp login
clasp clone ${project.scriptId} .
\`\`\`

Useful prompt:

\`\`\`text
โปรเจกต์นี้เป็น Google Apps Script Web App ช่วยอ่าน README.md และ .personal-mcp/project.json แล้วแนะนำขั้นตอน sync ด้วย clasp ให้หน่อย
\`\`\`
`;
}

function uniqueProjectName(workspaceRoot, preferred) {
  let candidate = cleanSlug(preferred);
  let index = 2;
  while (fs.existsSync(path.join(workspaceRoot, candidate))) {
    candidate = `${cleanSlug(preferred)}-${index}`;
    index += 1;
  }
  return candidate;
}

function cleanSlug(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function requireWorkspaceRoot() {
  const workspaceRoot = process.env.WORKSPACE_ROOT;
  if (!workspaceRoot) throw new Error("WORKSPACE_ROOT is missing.");
  if (!fs.existsSync(workspaceRoot)) {
    fs.mkdirSync(workspaceRoot, { recursive: true });
  }
  return workspaceRoot;
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

function findCloudflared() {
  const candidates = [
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Links", "cloudflared.exe"),
    path.join(os.homedir(), "AppData", "Local", "Programs", "cloudflared", "cloudflared.exe"),
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages", "Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe", "cloudflared.exe"),
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages", "Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe", "cloudflared-windows-amd64.exe"),
    path.join(process.env.ProgramFiles ?? "", "cloudflared", "cloudflared.exe"),
    path.join(process.env.ProgramFiles ?? "", "Cloudflare", "cloudflared.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "", "cloudflared", "cloudflared.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "", "Cloudflare", "cloudflared.exe"),
  ];

  for (const entry of (process.env.PATH ?? "").split(path.delimiter)) {
    candidates.push(path.join(entry, "cloudflared.exe"));
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
    const now = new Date();
    logs.push({ timestamp: now.toISOString(), time: now.toLocaleTimeString(), label, text: line });
  }
  while (logs.length > 500) logs.shift();
}

function combinedLogs() {
  const merged = [...logs, ...readAuditLogs()]
    .sort((a, b) => Date.parse(a.timestamp ?? "") - Date.parse(b.timestamp ?? ""))
    .slice(-300);
  const complete = completionLog(merged);
  if (complete) merged.push(complete);
  return merged;
}

function readAuditLogs() {
  const filePath = path.resolve(process.env.AUDIT_LOG_PATH ?? "./audit/agent-tools.jsonl");
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\uFEFF/, ""))
    .filter(Boolean)
    .slice(-220)
    .map((line) => {
      try {
        const event = JSON.parse(line);
        const timestamp = String(event.timestamp ?? new Date().toISOString());
        return {
          timestamp,
          time: new Date(timestamp).toLocaleTimeString(),
          label: "code",
          text: formatAuditEvent(event),
          success: Boolean(event.success),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function formatAuditEvent(event) {
  const status = event.success ? "OK" : `ERROR ${event.errorCode ?? ""}`.trim();
  const project = event.project ? `${event.project} · ` : "";
  const summary = event.summary ? ` · ${event.summary}` : "";
  const duration = Number.isFinite(event.durationMs) ? ` (${event.durationMs}ms)` : "";
  return `${project}${event.tool}${summary} · ${status}${duration}`;
}

function completionLog(items) {
  const latest = [...items].reverse().find((item) => item.label === "code");
  if (!latest?.success) return null;
  const completeTools = [
    "write_file",
    "git_stage",
    "git_commit",
    "git_push",
    "npm_lint",
    "npm_build",
    "npm_test",
  ];
  if (!completeTools.some((tool) => latest.text.includes(tool))) return null;
  const now = new Date();
  return {
    timestamp: now.toISOString(),
    time: now.toLocaleTimeString(),
    label: "complete",
    text: "CODE COMPLETE · รอบล่าสุดเสร็จแล้ว ตรวจ Git แล้วกด Push ได้เมื่อพร้อม",
    success: true,
  };
}

function clearAuditLog() {
  const filePath = path.resolve(process.env.AUDIT_LOG_PATH ?? "./audit/agent-tools.jsonl");
  if (!fs.existsSync(filePath)) return;
  fs.writeFileSync(filePath, "", "utf8");
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function icon(name) {
  const icons = {
    bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="8" width="12" height="10" rx="3"/><path d="M12 4v4"/><path d="M8.5 13h.01"/><path d="M15.5 13h.01"/><path d="M9 18v2h6v-2"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    cube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M12 12 4.5 7.7"/><path d="M12 12v8.5"/><path d="m12 12 7.5-4.3"/><path d="m8.5 5.5 7 4"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h6"/></svg>',
    filter:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3H2l8 9.5V20l4-2v-5.5L22 3Z"/></svg>',
    folder:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
    git: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.2 8.2 15.8 15.8"/><path d="M6 9v6"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>',
    monitor:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/><path d="M12 16v4"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v16l14-8Z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
    refresh:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M3 12A9 9 0 0 1 18.5 5.8"/><path d="M18 2v4h4"/><path d="M6 22v-4H2"/></svg>',
    rocket:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1 1-1.5 3-1.5 4.5 1.5 0 3.5-.5 4.5-1.5"/><path d="M9 15 5 19"/><path d="M15 9l-6 6"/><path d="M14 4h6v6c0 4.4-3.6 8-8 8H8v-4c0-4.4 3.6-10 6-10Z"/><path d="M15 9h.01"/></svg>',
    settings:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.05.05a2.1 2.1 0 1 1-2.97 2.97l-.05-.05A1.8 1.8 0 0 0 14.8 19.6a1.8 1.8 0 0 0-1.08 1.64V21a2.1 2.1 0 1 1-4.2 0v-.08A1.8 1.8 0 0 0 8.45 19.3a1.8 1.8 0 0 0-1.98.36l-.05.05a2.1 2.1 0 1 1-2.97-2.97l.05-.05A1.8 1.8 0 0 0 3.86 14.7a1.8 1.8 0 0 0-1.64-1.08H2a2.1 2.1 0 1 1 0-4.2h.08A1.8 1.8 0 0 0 3.7 8.35a1.8 1.8 0 0 0-.36-1.98l-.05-.05A2.1 2.1 0 1 1 6.26 3.35l.05.05A1.8 1.8 0 0 0 8.3 3.76h.1A1.8 1.8 0 0 0 9.48 2.1V2a2.1 2.1 0 1 1 4.2 0v.08a1.8 1.8 0 0 0 1.08 1.64 1.8 1.8 0 0 0 1.98-.36l.05-.05a2.1 2.1 0 1 1 2.97 2.97l-.05.05A1.8 1.8 0 0 0 19.36 8.3v.1A1.8 1.8 0 0 0 21 9.48H21a2.1 2.1 0 1 1 0 4.2h-.08A1.8 1.8 0 0 0 19.4 15Z"/></svg>',
    shield:
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 20 5.5v6.2c0 5.1-3.4 8.8-8 10.3-4.6-1.5-8-5.2-8-10.3V5.5L12 2Zm3.7 7.6-4.8 4.8-2.1-2.1-1.4 1.4 3.5 3.5 6.2-6.2-1.4-1.4Z"/></svg>',
    square:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="1"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>',
    upload:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M20 16v4H4v-4"/></svg>',
  };
  return icons[name] ?? "";
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
        --app-bg: #f4f7fb;
        --sidebar: #071a3b;
        --sidebar-2: #0c2f6d;
        --sidebar-text: #f5f8ff;
        --sidebar-muted: #9fb4d9;
        --panel: #ffffff;
        --panel-soft: #f8fbff;
        --ink: #13213b;
        --muted: #62708a;
        --line: #dbe3ef;
        --shadow: 0 14px 36px rgba(31, 52, 91, 0.10);
        --green: #1ebd72;
        --green-2: #11945a;
        --red: #e94b55;
        --blue: #2463eb;
        --blue-2: #1749bd;
        --purple: #9347e8;
        --log-bg: #071735;
        --log-ink: #dce8ff;
      }
      [data-theme="dark"] {
        color-scheme: dark;
        --app-bg: #08111f;
        --sidebar: #030b18;
        --sidebar-2: #10275a;
        --sidebar-text: #f5f8ff;
        --sidebar-muted: #8fa3c4;
        --panel: #101c2e;
        --panel-soft: #0d1727;
        --ink: #edf4ff;
        --muted: #a9b8d0;
        --line: #243550;
        --shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
        --log-bg: #030712;
        --log-ink: #dbeafe;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: var(--app-bg);
        color: var(--ink);
        font-family: "Segoe UI", Arial, sans-serif;
      }
      .app-shell {
        display: grid;
        grid-template-columns: 292px minmax(0, 1fr);
        min-height: 100vh;
      }
      .sidebar {
        position: sticky;
        top: 0;
        height: 100vh;
        display: flex;
        flex-direction: column;
        padding: 22px 18px;
        background:
          radial-gradient(circle at 20% 0%, rgba(46, 99, 235, 0.42), transparent 30%),
          linear-gradient(180deg, var(--sidebar), #061327 58%, #07162f);
        color: var(--sidebar-text);
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 44px;
        margin-bottom: 34px;
      }
      .brand-mark {
        width: 44px;
        height: 44px;
        display: grid;
        place-items: center;
        border-radius: 12px;
        background: linear-gradient(135deg, #3478ff, #2146c7);
        box-shadow: 0 12px 28px rgba(36, 99, 235, 0.38);
      }
      .brand-title { font-size: 18px; font-weight: 750; letter-spacing: 0; }
      .brand-version {
        color: var(--sidebar-muted);
        font-size: 12px;
        margin-top: 2px;
      }
      .brand-meta {
        color: var(--sidebar-muted);
        font-size: 12px;
        line-height: 1.45;
        margin-top: 8px;
      }
      .nav {
        display: grid;
        gap: 10px;
      }
      .nav-item {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        min-height: 56px;
        padding: 0 16px;
        border: 1px solid transparent;
        border-radius: 8px;
        background: transparent;
        color: var(--sidebar-muted);
        text-align: left;
        font-weight: 650;
      }
      .nav-item.active {
        color: #fff;
        background: linear-gradient(135deg, #2563eb, #1c4fc7);
        border: 1px solid rgba(255, 255, 255, 0.16);
      }
      .device-card {
        margin-top: auto;
        padding: 18px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.08);
      }
      .device-card strong { display: block; margin-bottom: 6px; }
      .device-card span { color: #4ade80; font-size: 14px; }
      .content {
        min-width: 0;
        padding: 18px 28px;
      }
      .topbar {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 14px;
      }
      h1 {
        margin: 0;
        font-size: 30px;
        line-height: 1.1;
        font-weight: 800;
        letter-spacing: 0;
      }
      .subtitle {
        margin-top: 8px;
        color: var(--muted);
        font-size: 15px;
      }
      .top-actions {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      section {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        box-shadow: var(--shadow);
      }
      .card { padding: 18px; }
      .hero-card {
        min-height: 142px;
        display: grid;
        grid-template-columns: 142px minmax(280px, 0.72fr) minmax(360px, 1fr);
        align-items: center;
        gap: 22px;
        padding: 18px 24px;
        margin-bottom: 14px;
      }
      .agent-orb {
        width: 112px;
        height: 112px;
        display: grid;
        place-items: center;
        border: 8px solid rgba(30, 189, 114, 0.3);
        border-top-color: var(--green);
        border-right-color: var(--green);
        border-radius: 50%;
        background: var(--panel-soft);
      }
      .robot {
        width: 54px;
        height: 46px;
        display: grid;
        place-items: center;
        border-radius: 14px;
        background: linear-gradient(135deg, #24c37a, #108452);
        color: white;
      }
      .hero-title {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 0 0 8px;
        font-size: 25px;
        font-weight: 800;
      }
      .hero-subtitle {
        margin-bottom: 14px;
        color: var(--muted);
        font-size: 15px;
      }
      .hero-url-panel {
        min-width: 0;
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel-soft);
      }
      .hero-url-panel .title {
        margin-bottom: 8px;
        font-size: 15px;
      }
      .hero-url-panel .hint {
        margin: 8px 0 0;
      }
      .hero-url-panel .url {
        min-width: 0;
        background: var(--panel);
      }
      .stack { display: grid; gap: 14px; }
      .view { display: none; }
      .view.active-view { display: block; }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1.05fr;
        gap: 14px;
      }
      .info-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }
      .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .column { display: grid; gap: 10px; }
      .title {
        font-size: 17px;
        color: var(--ink);
        font-weight: 800;
        margin-bottom: 12px;
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 32px;
        padding: 0 14px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        font-weight: 600;
      }
      .status::before {
        content: "";
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--muted);
      }
      .status.ready { color: var(--green-2); }
      .status.ready::before { background: var(--green); }
      .status.error { color: var(--red); }
      .status.error::before { background: var(--red); }
      button, select, input {
        min-height: 38px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: var(--panel);
        color: var(--ink);
        font: inherit;
        padding: 0 12px;
      }
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-weight: 700;
        cursor: pointer;
      }
      button.primary {
        min-width: 154px;
        background: linear-gradient(135deg, #2f6df6, var(--blue-2));
        border-color: var(--blue);
        color: #fff;
        box-shadow: 0 10px 22px rgba(36, 99, 235, 0.24);
      }
      button.danger {
        min-width: 120px;
        color: var(--red);
        border-color: rgba(233, 75, 85, 0.62);
      }
      button.icon-btn {
        width: 52px;
        min-width: 52px;
        padding: 0;
      }
      button.copy-done {
        color: var(--green-2);
        border-color: rgba(30, 189, 114, 0.45);
        background: rgba(30, 189, 114, 0.08);
      }
      button:disabled { opacity: 0.55; cursor: not-allowed; }
      select { flex: 1; min-width: 240px; }
      input { flex: 1; min-width: 300px; }
      .url {
        flex: 1;
        min-width: 260px;
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: var(--panel-soft);
        font-family: Consolas, "Courier New", monospace;
        overflow-wrap: anywhere;
      }
      .info-card {
        border: 1px solid var(--line);
        border-radius: 7px;
        padding: 18px;
        min-height: 138px;
        background: var(--panel-soft);
      }
      .info-icon {
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        margin-bottom: 22px;
        color: var(--blue);
      }
      .info-card strong {
        display: block;
        font-size: 14px;
        color: var(--muted);
        margin-bottom: 8px;
      }
      .info-card span { font-size: 16px; font-weight: 650; overflow-wrap: anywhere; }
      .logs-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .project-list {
        display: grid;
        gap: 12px;
      }
      .project-card {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 14px;
        padding: 16px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel-soft);
      }
      .project-actions {
        display: grid;
        gap: 10px;
        align-content: start;
        min-width: 150px;
      }
      .project-name {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
        font-size: 17px;
        font-weight: 800;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        min-height: 26px;
        padding: 0 9px;
        border-radius: 999px;
        border: 1px solid var(--line);
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
      }
      .badge.active-badge {
        border-color: rgba(30, 189, 114, 0.38);
        color: var(--green-2);
        background: rgba(30, 189, 114, 0.08);
      }
      .badge.health-ready {
        border-color: rgba(30, 189, 114, 0.42);
        color: var(--green-2);
        background: rgba(30, 189, 114, 0.08);
      }
      .badge.health-review {
        border-color: rgba(245, 158, 11, 0.48);
        color: #b45309;
        background: rgba(245, 158, 11, 0.12);
      }
      .badge.health-setup {
        border-color: rgba(233, 75, 85, 0.45);
        color: var(--red);
        background: rgba(233, 75, 85, 0.08);
      }
      [data-theme="dark"] .badge.health-review { color: #fbbf24; }
      .project-health {
        display: grid;
        gap: 10px;
        margin-top: 12px;
      }
      .health-checks {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .health-check {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 28px;
        padding: 0 9px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: var(--panel);
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
      }
      .health-check.ok {
        color: var(--green-2);
        border-color: rgba(30, 189, 114, 0.32);
        background: rgba(30, 189, 114, 0.07);
      }
      .health-check.missing {
        color: #b45309;
        border-color: rgba(245, 158, 11, 0.36);
        background: rgba(245, 158, 11, 0.1);
      }
      [data-theme="dark"] .health-check.missing { color: #fbbf24; }
      .recent-files {
        color: var(--muted);
        font-size: 13px;
      }
      .recent-files strong {
        color: var(--ink);
        margin-right: 6px;
      }
      .recent-file {
        font-family: Consolas, "Courier New", monospace;
      }
      .event-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 10px 0 0;
      }
      .event-badge {
        border-color: rgba(245, 158, 11, 0.42);
        color: #b45309;
        background: rgba(245, 158, 11, 0.12);
        animation: pulseEvent 1.2s ease-in-out infinite;
      }
      [data-theme="dark"] .event-badge { color: #fbbf24; }
      @keyframes pulseEvent {
        0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.38); }
        50% { box-shadow: 0 0 0 5px rgba(245, 158, 11, 0); }
      }
      .latest-commit {
        color: var(--green-2);
        font-weight: 700;
      }
      .git-summary-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
      }
      .git-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 6px 10px;
        background: var(--panel-soft);
        color: var(--muted);
        font-size: 13px;
        font-weight: 700;
      }
      .git-pill.latest {
        border-color: rgba(30, 189, 114, 0.38);
        background: rgba(30, 189, 114, 0.08);
        color: var(--green-2);
      }
      .git-pill.pending {
        border-color: rgba(245, 158, 11, 0.46);
        background: rgba(245, 158, 11, 0.12);
        color: #b45309;
      }
      [data-theme="dark"] .git-pill.pending { color: #fbbf24; }
      button.push-ready {
        border-color: rgba(30, 189, 114, 0.55);
        background: var(--green);
        color: #ffffff;
        box-shadow: 0 12px 24px rgba(30, 189, 114, 0.22);
        animation: pulsePush 1.25s ease-in-out infinite;
      }
      button.push-ready svg { stroke: currentColor; }
      @keyframes pulsePush {
        0%, 100% { box-shadow: 0 0 0 0 rgba(30, 189, 114, 0.32); }
        50% { box-shadow: 0 0 0 6px rgba(30, 189, 114, 0); }
      }
      .doc-preview {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 12px;
      }
      .doc-snippet {
        min-height: 76px;
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: var(--panel);
        color: var(--muted);
        font-size: 13px;
        overflow-wrap: anywhere;
      }
      .doc-snippet strong {
        display: block;
        color: var(--ink);
        margin-bottom: 5px;
      }
      button.star-active {
        border-color: rgba(245, 158, 11, 0.5);
        color: #b45309;
        background: rgba(245, 158, 11, 0.12);
      }
      button.star-active svg {
        fill: #fbbf24;
        stroke: #b45309;
      }
      .project-meta {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 12px;
        color: var(--muted);
        font-size: 13px;
      }
      .project-meta strong {
        display: block;
        color: var(--ink);
        font-size: 13px;
        margin-bottom: 4px;
      }
      .settings-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }
      .git-steps {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }
      .step-card {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel-soft);
        padding: 14px;
      }
      .step-card strong { display: block; margin-bottom: 6px; }
      .file-list {
        display: grid;
        gap: 8px;
        margin: 12px 0;
      }
      .file-row {
        display: grid;
        grid-template-columns: 28px 92px minmax(0, 1fr);
        align-items: center;
        gap: 10px;
        padding: 10px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: var(--panel-soft);
      }
      .file-row input { min-width: auto; min-height: auto; }
      .file-path {
        font-family: Consolas, "Courier New", monospace;
        overflow-wrap: anywhere;
      }
      .git-output {
        min-height: 42px;
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: var(--panel-soft);
        color: var(--muted);
      }
      .deploy-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 16px;
      }
      pre {
        height: 220px;
        margin: 0;
        overflow: auto;
        padding: 16px 18px;
        border-radius: 7px;
        background: var(--log-bg);
        color: var(--log-ink);
        font: 12px/1.45 Consolas, "Courier New", monospace;
        white-space: pre-wrap;
      }
      .hint { color: var(--muted); font-size: 13px; }
      .log-line { color: #64e48f; }
      .log-line.code { color: #38bdf8; }
      .log-line.error { color: #ff8a92; }
      .log-insertions {
        color: #86efac;
        font-weight: 800;
      }
      .log-deletions {
        color: #ff8a92;
        font-weight: 800;
      }
      .log-line.complete {
        color: #86efac;
        font-weight: 800;
        animation: pulseComplete 1.4s ease-in-out 3;
      }
      #logsFull {
        height: calc(100vh - 245px);
        min-height: 520px;
      }
      @keyframes pulseComplete {
        0%, 100% { text-shadow: 0 0 0 rgba(134, 239, 172, 0); }
        50% { text-shadow: 0 0 12px rgba(134, 239, 172, 0.65); }
      }
      svg { width: 20px; height: 20px; flex: 0 0 auto; }
      @media (max-width: 980px) {
        .app-shell { grid-template-columns: 1fr; }
        .sidebar { position: relative; height: auto; }
        .hero-card, .grid, .info-grid, .project-card, .project-meta, .doc-preview, .settings-grid, .git-steps, .file-row, .deploy-grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 640px) {
        .content { padding: 18px; }
        .topbar { display: grid; }
        h1 { font-size: 25px; }
        .hero-card { padding: 20px; }
        input, select { min-width: 100%; }
      }
    </style>
  </head>
  <body>
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark"><img src="/assets/app-icon.png" alt="" style="width:30px;height:30px" /></div>
          <div>
            <div class="brand-title">Personal MCP Agent</div>
            <div class="brand-version">Version ${appVersion}</div>
            <div class="brand-meta">
              \u0e1e\u0e31\u0e12\u0e19\u0e32\u0e42\u0e14\u0e22 \u0e1c\u0e2d.\u0e2a\u0e38\u0e18\u0e19 \u0e1e\u0e38\u0e17\u0e18\u0e23\u0e31\u0e15\u0e19\u0e4c<br />
              \u0e1c\u0e39\u0e49\u0e2d\u0e33\u0e19\u0e27\u0e22\u0e01\u0e32\u0e23\u0e42\u0e23\u0e07\u0e40\u0e23\u0e35\u0e22\u0e19\u0e27\u0e31\u0e14\u0e44\u0e1c\u0e48\u0e21\u0e38\u0e49\u0e07<br />
              086-6271047
            </div>
          </div>
        </div>
        <nav class="nav">
          <button class="nav-item active" data-view="home">${icon("home")} หน้าหลัก</button>
          <button class="nav-item" data-view="projects">${icon("folder")} โปรเจกต์</button>
          <button class="nav-item" data-view="git">${icon("git")} Git</button>
          <button class="nav-item" data-view="logs">${icon("file")} บันทึกการทำงาน</button>
          <button class="nav-item" data-view="settings">${icon("settings")} ตั้งค่า</button>
        </nav>
        <div class="device-card">
          <div class="row">${icon("monitor")} <strong>Windows Desktop</strong></div>
          <span id="deviceStatus">ยังไม่ได้เชื่อมต่อ</span>
        </div>
      </aside>

      <main class="content">
        <div class="topbar">
          <div>
            <h1>ศูนย์ควบคุม Agent</h1>
            <div class="subtitle">ควบคุมการทำงานของ Personal MCP Agent และจัดการการเชื่อมต่อ</div>
          </div>
          <div class="top-actions">
            <span id="status" class="status">Stopped</span>
            <button id="themeToggle" class="icon-btn" title="สลับโหมดสว่าง/มืด">${icon("sun")}</button>
            <button id="settingsTop" class="icon-btn" title="ตั้งค่า">${icon("settings")}</button>
          </div>
        </div>

        <div id="view-home" class="view active-view">
          <section class="hero-card">
            <div class="agent-orb"><div class="robot">${icon("bot")}</div></div>
            <div>
              <h2 class="hero-title"><span id="heroTitle">Agent ยังไม่ทำงาน</span> ${icon("shield")}</h2>
              <div class="hero-subtitle">Windows Desktop Agent <span aria-hidden="true">•</span> <span id="heroMode">WORK mode</span></div>
              <div class="row">
                <button id="start" class="primary">${icon("play")} เริ่มทำงาน</button>
                <button id="stop" class="danger">${icon("square")} หยุด</button>
                <button id="refresh">${icon("refresh")} รีเฟรช</button>
              </div>
            </div>
            <div class="hero-url-panel">
              <div class="title">MCP URL \u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a ChatGPT</div>
              <div class="row">
                <div id="url" class="url">\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35 URL \u0e43\u0e2b\u0e49\u0e01\u0e14 Start \u0e01\u0e48\u0e2d\u0e19</div>
                <button id="copy">${icon("copy")} <span id="copyText">\u0e04\u0e31\u0e14\u0e25\u0e2d\u0e01</span></button>
              </div>
              <p class="hint">Cloudflare \u0e40\u0e1b\u0e47\u0e19\u0e04\u0e48\u0e32\u0e1e\u0e37\u0e49\u0e19\u0e10\u0e32\u0e19 \u0e16\u0e49\u0e32\u0e40\u0e1b\u0e34\u0e14\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e08\u0e30\u0e2a\u0e33\u0e23\u0e2d\u0e07\u0e14\u0e49\u0e27\u0e22 ngrok</p>
            </div>
          </section>

          <div class="stack">
            <div class="grid">
              <section class="card">
                <div class="title">โปรเจกต์ที่ใช้งาน</div>
                <div class="row">
                  <select id="projects"></select>
                  <button id="setProject">${icon("star")} ตั้งเป็นโปรเจกต์หลัก</button>
                </div>
                <p class="hint">โปรเจกต์ที่ดีต้องอยู่ใต้ D:\\AI-Workspace หลังเปลี่ยนโปรเจกต์ให้ Stop แล้ว Start ใหม่</p>
                <div class="column" style="margin-top: 16px">
                  <div class="title">เพิ่มโปรเจกต์จาก URL</div>
                  <div class="row">
                    <input id="projectUrl" placeholder="GitHub, Vercel, หรือ Google Apps Script URL" />
                    <button id="addProjectUrl">${icon("plus")} เพิ่ม URL</button>
                  </div>
                  <p class="hint">GitHub จะ clone source code ให้ทันที ส่วน Vercel/GAS จะสร้าง linked project พร้อม metadata</p>

                  <label class="title" for="localProjectPath" style="margin:10px 0 0">\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e42\u0e1b\u0e23\u0e40\u0e08\u0e01\u0e15\u0e4c\u0e08\u0e32\u0e01\u0e42\u0e1f\u0e25\u0e40\u0e14\u0e2d\u0e23\u0e4c\u0e43\u0e19\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07</label>
                  <div class="row">
                    <input id="localProjectPath" placeholder="D:\\Projects\\my-app" />
                    <button id="browseLocalProject">${icon("folder")} \u0e40\u0e25\u0e37\u0e2d\u0e01\u0e42\u0e1f\u0e25\u0e40\u0e14\u0e2d\u0e23\u0e4c</button>
                    <button id="addLocalProject">${icon("folder")} \u0e40\u0e1e\u0e34\u0e48\u0e21 Local</button>
                  </div>
                  <p class="hint">\u0e16\u0e49\u0e32\u0e42\u0e1f\u0e25\u0e40\u0e14\u0e2d\u0e23\u0e4c\u0e2d\u0e22\u0e39\u0e48\u0e19\u0e2d\u0e01 D:\\AI-Workspace \u0e23\u0e30\u0e1a\u0e1a\u0e08\u0e30\u0e04\u0e31\u0e14\u0e25\u0e2d\u0e01\u0e40\u0e02\u0e49\u0e32 workspace \u0e42\u0e14\u0e22\u0e02\u0e49\u0e32\u0e21 node_modules/dist/.next</p>
                </div>
              </section>

              <section class="card">
                <div class="title">ข้อมูลระบบ</div>
                <div class="info-grid">
                  <div class="info-card"><div class="info-icon">${icon("folder")}</div><strong>Workspace</strong><span id="workspace"></span></div>
                  <div class="info-card"><div class="info-icon">${icon("code")}</div><strong>Active Project</strong><span id="activeProject"></span></div>
                  <div class="info-card"><div class="info-icon">${icon("settings")}</div><strong>Mode</strong><span id="mode"></span></div>
                </div>
              </section>
            </div>

            <section class="card">
              <div class="logs-head">
                <div class="title" style="margin:0">บันทึกการทำงาน</div>
                <div class="row">
                  <button id="logFilter">${icon("filter")} ทั้งหมด</button>
                  <button id="clearLogs">${icon("trash")} ล้างประวัติ</button>
                </div>
              </div>
              <pre id="logs"></pre>
            </section>
          </div>
        </div>

        <div id="view-projects" class="view">
          <section class="card">
            <div class="logs-head">
              <div>
                <div class="title" style="margin:0">โปรเจกต์ทั้งหมด</div>
                <p class="hint">แสดงว่าแต่ละโปรเจกต์คืออะไร ทำอะไรอยู่ถึงไหน และ commit ล่าสุดคืออะไร</p>
              </div>
              <button id="refreshProjects">${icon("refresh")} รีเฟรช</button>
            </div>
            <div id="projectDetails" class="project-list"></div>
          </section>
        </div>

        <div id="view-logs" class="view">
          <section class="card">
            <div class="logs-head">
              <div>
                <div class="title" style="margin:0">บันทึกการทำงาน คืออะไร?</div>
                <p class="hint">คือ log ของ launcher, gateway, desktop agent และ ngrok ในรอบที่เปิดใช้งานนี้ ใช้ดูว่าเชื่อมต่อสำเร็จไหม หรือ error ตรงไหน</p>
              </div>
              <button id="clearLogsFull">${icon("trash")} ล้างประวัติ</button>
            </div>
            <pre id="logsFull"></pre>
          </section>
        </div>

        <div id="view-git" class="view">
          <section class="card">
            <div class="logs-head">
              <div>
                <div class="title" style="margin:0">Git Assistant</div>
                <p class="hint">สำหรับคนไม่ถนัด PowerShell: ตรวจไฟล์ เลือกไฟล์ ใส่ข้อความ แล้วกด Commit / Push ตามลำดับ</p>
              </div>
              <button id="gitRefresh">${icon("refresh")} ตรวจสถานะ</button>
            </div>
            <div class="git-steps">
              <div class="step-card"><strong>1. ตรวจไฟล์</strong><span class="hint">ดูว่ามีไฟล์อะไรเปลี่ยนบ้าง</span></div>
              <div class="step-card"><strong>2. Commit</strong><span class="hint">เลือกไฟล์และใส่ข้อความสั้น ๆ</span></div>
              <div class="step-card"><strong>3. Push</strong><span class="hint">ส่ง commit ขึ้น GitHub เมื่อพร้อม</span></div>
            </div>
            <div class="row">
              <select id="gitProject"></select>
              <button id="gitSelectAll">${icon("check")} เลือกทั้งหมดที่ปลอดภัย</button>
            </div>
            <div id="gitSummary" class="hint" style="margin-top:10px"></div>
            <div id="gitFiles" class="file-list"></div>
            <div class="column">
              <div class="row">
                <button id="gitDevTest">${icon("play")} \u0e17\u0e14\u0e2a\u0e2d\u0e1a Local: npm run dev</button>
                <button id="openDevUrl" disabled>${icon("rocket")} \u0e40\u0e1b\u0e34\u0e14 Browser</button>
                <button id="copyDevUrl" disabled>${icon("copy")} Copy URL</button>
                <button id="stopDevServer" disabled>${icon("square")} \u0e2b\u0e22\u0e38\u0e14 Local</button>
              </div>
              <label class="title" for="commitMessage" style="margin:0">Commit message</label>
              <input id="commitMessage" placeholder="เช่น fix: update payment tracker UI" />
              <div class="row">
                <button id="gitCommit" class="primary">${icon("check")} Commit ไฟล์ที่เลือก</button>
                <button id="gitPush">${icon("upload")} Push ขึ้น GitHub</button>
              </div>
              <div id="gitOutput" class="git-output">กด “ตรวจสถานะ” เพื่อเริ่ม</div>
            </div>
            <div class="deploy-grid">
              <div class="step-card">
                <strong>Deploy Vercel</strong>
                <p class="hint">เหมาะกับ Next.js/Vite/เว็บที่เชื่อม Vercel แล้ว ควร commit และ push ให้เรียบร้อยก่อน</p>
                <button id="deployVercel">${icon("rocket")} Deploy Vercel</button>
              </div>
              <div class="step-card">
                <strong>Deploy GAS / clasp</strong>
                <p class="hint">ต้องมี .clasp.json ในโปรเจกต์ก่อน ระบบจะรัน clasp push และ clasp deploy</p>
                <button id="deployGas">${icon("rocket")} Deploy GAS</button>
              </div>
            </div>
          </section>
        </div>

        <div id="view-settings" class="view">
          <section class="card">
            <div class="title">ตั้งค่า คืออะไร?</div>
            <p class="hint">หน้านี้รวมค่าพื้นฐานของระบบ เช่น version, workspace, active project, permission mode และ port ที่ใช้งาน เพื่อให้ตรวจสอบง่ายก่อนให้ ChatGPT ทำงานบนเครื่อง</p>
            <div class="settings-grid" style="margin-top: 16px">
              <div class="info-card"><div class="info-icon">${icon("cube")}</div><strong>Version</strong><span id="settingsVersion"></span></div>
              <div class="info-card"><div class="info-icon">${icon("folder")}</div><strong>Workspace Root</strong><span id="settingsWorkspace"></span></div>
              <div class="info-card"><div class="info-icon">${icon("code")}</div><strong>Active Project</strong><span id="settingsProject"></span></div>
              <div class="info-card"><div class="info-icon">${icon("settings")}</div><strong>Permission Mode</strong><span id="settingsMode"></span></div>
              <div class="info-card"><div class="info-icon">${icon("rocket")}</div><strong>Tunnel Provider</strong><span id="settingsTunnel"></span></div>
              <div class="info-card"><div class="info-icon">${icon("shield")}</div><strong>Cloudflare Mode</strong><span id="settingsCloudflareMode"></span></div>
              <div class="info-card"><div class="info-icon">${icon("monitor")}</div><strong>GUI Port</strong><span>${guiPort}</span></div>
              <div class="info-card"><div class="info-icon">${icon("refresh")}</div><strong>Gateway Port</strong><span>${gatewayPort}</span></div>
            </div>
          </section>
        </div>
      </main>
    </div>
    <script>
      const els = {
        navItems: document.querySelectorAll(".nav-item"),
        views: document.querySelectorAll(".view"),
        status: document.querySelector("#status"),
        deviceStatus: document.querySelector("#deviceStatus"),
        heroTitle: document.querySelector("#heroTitle"),
        heroMode: document.querySelector("#heroMode"),
        themeToggle: document.querySelector("#themeToggle"),
        settingsTop: document.querySelector("#settingsTop"),
        start: document.querySelector("#start"),
        stop: document.querySelector("#stop"),
        refresh: document.querySelector("#refresh"),
        copy: document.querySelector("#copy"),
        copyText: document.querySelector("#copyText"),
        url: document.querySelector("#url"),
        projects: document.querySelector("#projects"),
        projectUrl: document.querySelector("#projectUrl"),
        addProjectUrl: document.querySelector("#addProjectUrl"),
        localProjectPath: document.querySelector("#localProjectPath"),
        browseLocalProject: document.querySelector("#browseLocalProject"),
        addLocalProject: document.querySelector("#addLocalProject"),
        setProject: document.querySelector("#setProject"),
        workspace: document.querySelector("#workspace"),
        activeProject: document.querySelector("#activeProject"),
        mode: document.querySelector("#mode"),
        logs: document.querySelector("#logs"),
        logsFull: document.querySelector("#logsFull"),
        clearLogs: document.querySelector("#clearLogs"),
        clearLogsFull: document.querySelector("#clearLogsFull"),
        refreshProjects: document.querySelector("#refreshProjects"),
        projectDetails: document.querySelector("#projectDetails"),
        gitProject: document.querySelector("#gitProject"),
        gitRefresh: document.querySelector("#gitRefresh"),
        gitSelectAll: document.querySelector("#gitSelectAll"),
        gitFiles: document.querySelector("#gitFiles"),
        gitSummary: document.querySelector("#gitSummary"),
        gitDevTest: document.querySelector("#gitDevTest"),
        openDevUrl: document.querySelector("#openDevUrl"),
        copyDevUrl: document.querySelector("#copyDevUrl"),
        stopDevServer: document.querySelector("#stopDevServer"),
        commitMessage: document.querySelector("#commitMessage"),
        gitCommit: document.querySelector("#gitCommit"),
        gitPush: document.querySelector("#gitPush"),
        gitOutput: document.querySelector("#gitOutput"),
        deployVercel: document.querySelector("#deployVercel"),
        deployGas: document.querySelector("#deployGas"),
        settingsVersion: document.querySelector("#settingsVersion"),
        settingsWorkspace: document.querySelector("#settingsWorkspace"),
        settingsProject: document.querySelector("#settingsProject"),
        settingsMode: document.querySelector("#settingsMode"),
        settingsTunnel: document.querySelector("#settingsTunnel"),
        settingsCloudflareMode: document.querySelector("#settingsCloudflareMode"),
      };

      const savedTheme = localStorage.getItem("pma-theme") || "light";
      document.documentElement.dataset.theme = savedTheme;
      let latestDevUrl = "";

      els.start.addEventListener("click", () => post("/api/start"));
      els.stop.addEventListener("click", () => post("/api/stop"));
      els.refresh.addEventListener("click", refreshAll);
      els.settingsTop.addEventListener("click", () => showView("settings"));
      els.navItems.forEach((item) => {
        item.addEventListener("click", () => showView(item.dataset.view));
      });
      els.themeToggle.addEventListener("click", () => {
        const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        localStorage.setItem("pma-theme", next);
      });
      els.copy.addEventListener("click", async () => {
        const text = els.url.textContent.trim();
        if (!text.startsWith("https://")) return;
        await navigator.clipboard.writeText(text);
        els.copy.classList.add("copy-done");
        els.copyText.textContent = "คัดลอกแล้ว";
        els.copy.querySelector("svg").outerHTML = '${icon("check").replaceAll("'", "\\'")}';
        setTimeout(() => {
          els.copy.classList.remove("copy-done");
          els.copyText.textContent = "คัดลอก";
          els.copy.querySelector("svg").outerHTML = '${icon("copy").replaceAll("'", "\\'")}';
        }, 1600);
      });
      els.setProject.addEventListener("click", async () => {
        await post("/api/projects/default", { project: els.projects.value });
        await refreshAll();
      });
      els.addProjectUrl.addEventListener("click", async () => {
        await post("/api/projects/from-url", { url: els.projectUrl.value });
        els.projectUrl.value = "";
        await refreshAll();
      });
      els.browseLocalProject.addEventListener("click", async () => {
        const response = await post("/api/projects/browse-folder");
        if (response?.folder) {
          els.localProjectPath.value = response.folder;
        }
      });
      els.addLocalProject.addEventListener("click", async () => {
        await post("/api/projects/from-local", { path: els.localProjectPath.value });
        els.localProjectPath.value = "";
        await refreshAll();
      });
      els.clearLogs.addEventListener("click", () => post("/api/logs/clear"));
      els.clearLogsFull.addEventListener("click", () => post("/api/logs/clear"));
      els.refreshProjects.addEventListener("click", refreshAll);
      els.projects.addEventListener("change", () => {
        els.setProject.classList.toggle("star-active", els.projects.value && els.projects.value === els.projects.dataset.defaultProject);
      });
      els.gitRefresh.addEventListener("click", refreshGitStatus);
      els.gitProject.addEventListener("change", () => {
        setDevUrl("");
        els.stopDevServer.disabled = true;
        refreshGitStatus();
      });
      els.gitSelectAll.addEventListener("click", () => {
        document.querySelectorAll(".git-file-check:not(:disabled)").forEach((item) => {
          item.checked = true;
        });
      });
      els.gitDevTest.addEventListener("click", async () => {
        els.gitDevTest.disabled = true;
        els.gitOutput.textContent = "กำลังทดสอบ local ด้วย npm run dev...";
        try {
          const response = await post("/api/git/dev-test", { project: els.gitProject.value });
          if (response?.ok) {
            setDevUrl(response.url || "");
            els.gitOutput.textContent = "ทดสอบ local ผ่าน: npm run dev เริ่มทำงานได้"
              + (response.url ? "\\nURL: " + response.url : "\\nยังไม่พบ URL ใน output แต่ server เริ่มทำงานแล้ว")
              + "\\n" + (response.output || "");
          }
        } finally {
          els.gitDevTest.disabled = false;
        }
      });
      els.openDevUrl.addEventListener("click", async () => {
        if (!latestDevUrl) return;
        await post("/api/open-url", { url: latestDevUrl });
      });
      els.copyDevUrl.addEventListener("click", async () => {
        if (!latestDevUrl) return;
        await navigator.clipboard.writeText(latestDevUrl);
        els.copyDevUrl.textContent = "✓ Copied";
        setTimeout(() => {
          els.copyDevUrl.textContent = "Copy URL";
        }, 1400);
      });
      els.stopDevServer.addEventListener("click", async () => {
        const response = await post("/api/git/dev-stop", { project: els.gitProject.value });
        if (response?.ok) {
          setDevUrl("");
          els.gitOutput.textContent = response.stopped ? "หยุด local dev server แล้ว" : "ไม่มี local dev server ที่เปิดอยู่";
        }
      });
      els.gitCommit.addEventListener("click", async () => {
        const files = Array.from(document.querySelectorAll(".git-file-check:checked")).map((item) => item.value);
        const response = await post("/api/git/commit", {
          project: els.gitProject.value,
          files,
          message: els.commitMessage.value,
        });
        if (response?.ok) {
          els.gitOutput.textContent = "Commit สำเร็จ: " + response.hash;
          await refreshGitStatus();
        }
      });
      els.gitPush.addEventListener("click", async () => {
        if (!confirm("ยืนยัน Push ขึ้น GitHub? ควร commit ให้เรียบร้อยและตรวจ branch ก่อน")) return;
        const response = await post("/api/git/push", { project: els.gitProject.value });
        if (response?.ok) {
          els.gitOutput.textContent = "Push สำเร็จ: " + response.upstream;
          await refreshGitStatus();
        }
      });
      els.deployVercel.addEventListener("click", async () => {
        if (!confirm("ยืนยัน Deploy Vercel production? ควร commit/push ให้เรียบร้อยก่อน")) return;
        els.deployVercel.disabled = true;
        els.gitOutput.textContent = "กำลัง deploy Vercel...";
        try {
          const response = await post("/api/deploy/vercel", { project: els.gitProject.value });
          if (response?.ok) {
            els.gitOutput.textContent = "Vercel deploy สำเร็จ\\n" + (response.output || "");
          } else {
            els.gitOutput.textContent = "Vercel deploy ไม่สำเร็จ ดูรายละเอียดจาก popup แล้วลองกด Deploy ใหม่";
          }
        } finally {
          els.deployVercel.disabled = false;
        }
      });
      els.deployGas.addEventListener("click", async () => {
        if (!confirm("ยืนยัน Deploy Google Apps Script ด้วย clasp?")) return;
        els.deployGas.disabled = true;
        els.gitOutput.textContent = "กำลัง deploy GAS...";
        try {
          const response = await post("/api/deploy/gas", { project: els.gitProject.value });
          if (response?.ok) {
            els.gitOutput.textContent = "GAS deploy สำเร็จ\\n" + (response.output || "");
          } else {
            els.gitOutput.textContent = "GAS deploy ไม่สำเร็จ ดูรายละเอียดจาก popup แล้วลองกด Deploy ใหม่";
          }
        } finally {
          els.deployGas.disabled = false;
        }
      });

      function showView(name) {
        els.navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === name));
        els.views.forEach((view) => view.classList.toggle("active-view", view.id === "view-" + name));
      }

      function setDevUrl(url) {
        latestDevUrl = url || "";
        els.openDevUrl.disabled = !latestDevUrl;
        els.copyDevUrl.disabled = !latestDevUrl;
        els.stopDevServer.disabled = false;
      }

      async function post(url, body) {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: body ? JSON.stringify(body) : "{}",
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          alert(data.error || "Request failed");
          return null;
        }
        const data = await response.json().catch(() => ({ ok: true }));
        await refreshAll();
        return data;
      }

      async function refreshGitStatus() {
        if (!els.gitProject.value) {
          els.gitFiles.innerHTML = '<div class="hint">ยังไม่มีโปรเจกต์ให้เลือก</div>';
          return;
        }
        const response = await fetch("/api/git/status?project=" + encodeURIComponent(els.gitProject.value));
        const data = await response.json();
        if (!response.ok) {
          els.gitSummary.textContent = data.error || "อ่านสถานะ git ไม่ได้";
          els.gitFiles.innerHTML = "";
          return;
        }
        renderGitStatus(data);
      }

      function renderGitStatus(data) {
        const files = Array.isArray(data.files) ? data.files : [];
        const tracking = data.tracking || { upstream: "", ahead: 0, behind: 0 };
        const latest = data.latestCommit
          ? '<span class="git-pill latest">Commit \u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14 <span>' + escapeHtml(data.latestCommit.hash) + '</span> ' + escapeHtml(data.latestCommit.message || "") + '</span>'
          : '<span class="git-pill">Commit \u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14 -</span>';
        const upstream = tracking.upstream
          ? '<span class="git-pill">Upstream ' + escapeHtml(tracking.upstream) + '</span>'
          : '<span class="git-pill pending">\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35 upstream</span>';
        const pushState = tracking.ahead > 0
          ? '<span class="git-pill pending">\u0e23\u0e2d Push ' + tracking.ahead + ' commit</span>'
          : '<span class="git-pill latest">GitHub \u0e2d\u0e31\u0e1b\u0e40\u0e14\u0e15\u0e41\u0e25\u0e49\u0e27</span>';
        const behindState = tracking.behind > 0
          ? '<span class="git-pill pending">\u0e2b\u0e25\u0e31\u0e07 GitHub ' + tracking.behind + ' commit</span>'
          : "";
        els.gitSummary.innerHTML = '<div class="git-summary-row">'
          + '<span class="git-pill">Branch ' + escapeHtml(data.branch) + '</span>'
          + latest
          + upstream
          + pushState
          + behindState
          + '</div>'
          + '<div class="hint" style="margin-top:6px">Remote: ' + escapeHtml(data.remote || "-") + '</div>';
        if (!els.commitMessage.value && data.suggestedMessage) {
          els.commitMessage.value = data.suggestedMessage;
        }
        els.gitDevTest.disabled = !data.canRunDev;
        els.gitDevTest.title = data.canRunDev ? "" : "This project does not have npm run dev.";
        els.gitPush.classList.toggle("push-ready", tracking.ahead > 0 && files.length === 0);
        els.gitPush.textContent = tracking.ahead > 0
          ? '\u2191 Push \u0e02\u0e36\u0e49\u0e19 GitHub (' + tracking.ahead + ')'
          : '\u2713 Push \u0e41\u0e25\u0e49\u0e27 / \u0e44\u0e21\u0e48\u0e21\u0e35\u0e04\u0e49\u0e32\u0e07';
        if (!files.length) {
          els.gitFiles.innerHTML = '<div class="git-output">\u0e44\u0e21\u0e48\u0e21\u0e35\u0e44\u0e1f\u0e25\u0e4c\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e41\u0e1b\u0e25\u0e07 \u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49 working tree clean</div>';
          els.gitCommit.disabled = true;
          els.gitPush.disabled = tracking.ahead === 0 || !tracking.upstream;
          els.gitOutput.textContent = tracking.ahead > 0
            ? "Commit \u0e40\u0e2a\u0e23\u0e47\u0e08\u0e41\u0e25\u0e49\u0e27 \u0e40\u0e2b\u0e25\u0e37\u0e2d Push \u0e02\u0e36\u0e49\u0e19 GitHub \u0e2d\u0e35\u0e01 " + tracking.ahead + " commit"
            : "\u0e40\u0e23\u0e35\u0e22\u0e1a\u0e23\u0e49\u0e2d\u0e22\u0e41\u0e25\u0e49\u0e27: \u0e44\u0e21\u0e48\u0e21\u0e35\u0e44\u0e1f\u0e25\u0e4c\u0e04\u0e49\u0e32\u0e07 commit \u0e41\u0e25\u0e30\u0e44\u0e21\u0e48\u0e21\u0e35 commit \u0e04\u0e49\u0e32\u0e07 Push";
          return;
        }
        els.gitCommit.disabled = false;
        els.gitPush.disabled = true;
        els.gitPush.classList.remove("push-ready");
        els.gitPush.textContent = '\u2191 Push \u0e02\u0e36\u0e49\u0e19 GitHub';
        els.gitOutput.textContent = "\u0e21\u0e35\u0e44\u0e1f\u0e25\u0e4c\u0e17\u0e35\u0e48\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49 commit \u0e43\u0e2b\u0e49\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e44\u0e1f\u0e25\u0e4c \u0e41\u0e25\u0e49\u0e27\u0e01\u0e14 Commit \u0e44\u0e1f\u0e25\u0e4c\u0e17\u0e35\u0e48\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e01\u0e48\u0e2d\u0e19 \u0e08\u0e32\u0e01\u0e19\u0e31\u0e49\u0e19\u0e23\u0e30\u0e1a\u0e1a\u0e08\u0e30\u0e40\u0e1b\u0e34\u0e14\u0e1b\u0e38\u0e48\u0e21 Push \u0e43\u0e2b\u0e49\u0e40\u0e2d\u0e07";
        els.gitFiles.innerHTML = files.map((file) => {
          const disabled = file.safe ? "" : "disabled";
          const note = file.safe ? "" : " · blocked: secret-looking";
          return '<label class="file-row">'
            + '<input class="git-file-check" type="checkbox" value="' + escapeHtml(file.path) + '" ' + disabled + ' />'
            + '<span class="badge">' + escapeHtml(file.label) + '</span>'
            + '<span class="file-path">' + escapeHtml(file.path) + '<span class="hint">' + note + '</span></span>'
            + '</label>';
        }).join("");
      }

      async function refreshAll() {
        const [status, projects, details] = await Promise.all([
          fetch("/api/status").then((r) => r.json()),
          fetch("/api/projects").then((r) => r.json()),
          fetch("/api/projects/details").then((r) => r.json()),
        ]);
        renderStatus(status);
        renderProjects(projects);
        renderProjectDetails(details);
      }

      function renderStatus(data) {
        const label = data.phase === "ready" ? "Ready" : data.phase === "starting" ? "Starting" : data.phase === "error" ? "Error" : "Stopped";
        els.status.textContent = data.phase === "ready" ? "เชื่อมต่อแล้ว" : data.phase === "starting" ? "กำลังเริ่ม" : data.phase === "error" ? "มีข้อผิดพลาด" : "ยังไม่เชื่อมต่อ";
        els.status.className = "status " + (data.phase === "ready" ? "ready" : data.phase === "error" ? "error" : "");
        els.deviceStatus.textContent = data.agentOnline ? "เชื่อมต่อแล้ว" : "ยังไม่ได้เชื่อมต่อ";
        els.heroTitle.textContent = data.phase === "ready" ? "Agent พร้อมทำงาน" : data.phase === "starting" ? "Agent กำลังเริ่ม" : data.phase === "error" ? "Agent ต้องตรวจสอบ" : "Agent ยังไม่ทำงาน";
        els.heroMode.textContent = (data.permissionMode || "SAFE") + " mode";
        els.start.disabled = data.phase === "starting" || data.phase === "ready";
        els.stop.disabled = data.phase === "stopped";
        els.url.textContent = data.mcpUrl || "ยังไม่มี URL ให้กด Start ก่อน";
        els.workspace.textContent = data.workspaceRoot || "-";
        els.activeProject.textContent = data.defaultProject || "-";
        els.mode.textContent = data.permissionMode || "-";
        els.settingsVersion.textContent = data.version || "-";
        els.settingsWorkspace.textContent = data.workspaceRoot || "-";
        els.settingsProject.textContent = data.defaultProject || "-";
        els.settingsMode.textContent = data.permissionMode || "-";
        els.settingsTunnel.textContent = data.tunnelProvider || "-";
        els.settingsCloudflareMode.textContent = data.cloudflareTunnelMode || "-";
        const logHtml = data.logs.map((item) => {
          const lineClass = item.label === "complete" ? "log-line complete" : item.label === "code" ? "log-line code" : item.success === false ? "log-line error" : "log-line";
          const level = item.label === "complete" ? "DONE" : item.label === "code" ? "CODE" : item.success === false ? "ERR " : "INFO";
          return '<span class="' + lineClass + '">●  ' + escapeHtml(item.time) + '  ' + level + '</span>    [' + escapeHtml(item.label) + '] ' + renderLogText(item.text);
        }).join("\\n");
        els.logs.innerHTML = logHtml;
        els.logsFull.innerHTML = logHtml;
        els.logs.scrollTop = els.logs.scrollHeight;
        els.logsFull.scrollTop = els.logsFull.scrollHeight;
      }

      function renderProjects(data) {
        const selected = els.projects.value || data.defaultProject;
        els.projects.dataset.defaultProject = data.defaultProject || "";
        els.projects.innerHTML = "";
        for (const project of data.projects || []) {
          const option = document.createElement("option");
          option.value = project;
          option.textContent = project === data.defaultProject ? project + " (active)" : project;
          option.selected = project === selected;
          els.projects.append(option);
        }
        els.setProject.classList.toggle("star-active", selected && selected === data.defaultProject);
        const gitSelected = els.gitProject.value || data.defaultProject;
        els.gitProject.innerHTML = "";
        for (const project of data.projects || []) {
          const option = document.createElement("option");
          option.value = project;
          option.textContent = project === data.defaultProject ? project + " (active)" : project;
          option.selected = project === gitSelected;
          els.gitProject.append(option);
        }
      }

      function renderProjectDetails(data) {
        const projects = data.projects || [];
        if (projects.length === 0) {
          els.projectDetails.innerHTML = '<div class="hint">ยังไม่มีโปรเจกต์ใน workspace</div>';
          return;
        }
        els.projectDetails.innerHTML = projects.map((project) => {
          const commit = project.latestCommit
            ? '<span class="latest-commit">' + escapeHtml(project.latestCommit.hash + " · " + project.latestCommit.message) + '</span>'
            : "ยังไม่มี commit หรือไม่ใช่ git repo";
          const dirty = project.dirty ? "มีไฟล์เปลี่ยนแปลง" : "clean";
          const source = project.sourceUrl ? escapeHtml(project.sourceUrl) : "-";
          const events = (project.events || []).map((event) =>
            '<span class="badge event-badge">' + escapeHtml(event.label) + '</span>'
          ).join("");
          const healthClass = project.health?.status === "ready" ? "health-ready" : project.health?.status === "setup" ? "health-setup" : "health-review";
          const healthLabel = project.health?.status === "ready" ? "ตรวจแล้วพร้อม" : project.health?.status === "setup" ? "ต้องเริ่ม Git" : "ควรตรวจสอบ";
          const checks = (project.health?.checks || []).map((check) =>
            '<span class="health-check ' + (check.ok ? "ok" : "missing") + '">' + (check.ok ? "✓" : "!") + " " + escapeHtml(check.label) + '</span>'
          ).join("");
          const recentFiles = (project.recentFiles || []).map((file) =>
            '<span class="recent-file">' + escapeHtml(file.name) + '</span>'
          ).join(", ");
          const health = '<div class="project-health">'
            + '<div class="health-checks">' + checks + '</div>'
            + '<div class="hint">' + escapeHtml(project.health?.summary || "-") + '</div>'
            + '<div class="recent-files"><strong>ไฟล์แก้ล่าสุด</strong>' + (recentFiles || "-") + '</div>'
            + '</div>';
          const readme = project.docs?.readme
            ? '<div class="doc-snippet"><strong>' + escapeHtml(project.docs.readme.file) + '</strong>' + escapeHtml(project.docs.readme.text || "-") + '</div>'
            : '<div class="doc-snippet"><strong>README</strong>ยังไม่มีไฟล์ README.md</div>';
          const todo = project.docs?.todo
            ? '<div class="doc-snippet"><strong>' + escapeHtml(project.docs.todo.file) + '</strong>' + escapeHtml(project.docs.todo.text || "-") + '</div>'
            : '<div class="doc-snippet"><strong>TODO</strong>ยังไม่มีไฟล์ TODO.md</div>';
          return '<div class="project-card">'
            + '<div>'
            + '<div class="project-name">' + escapeHtml(project.name)
            + ' <span class="badge">' + escapeHtml(project.kind) + '</span>'
            + (project.active ? ' <span class="badge active-badge">active</span>' : '')
            + ' <span class="badge ' + healthClass + '">' + healthLabel + '</span>'
            + '</div>'
            + '<div class="hint">' + escapeHtml(project.description) + '</div>'
            + (events ? '<div class="event-badges">' + events + '</div>' : '')
            + health
            + '<div class="doc-preview">' + readme + todo + '</div>'
            + '<div class="project-meta">'
            + '<div><strong>ล่าสุด commit</strong>' + commit + '</div>'
            + '<div><strong>สถานะ Git</strong>' + escapeHtml(dirty) + '</div>'
            + '<div><strong>แหล่งที่มา</strong>' + source + '</div>'
            + '</div>'
            + '</div>'
            + '<div class="project-actions">'
            + '<button data-project="' + escapeHtml(project.name) + '" class="set-project-inline' + (project.active ? ' star-active' : '') + '">${icon("star")} ใช้โปรเจกต์นี้</button>'
            + '<button data-project="' + escapeHtml(project.name) + '" class="delete-project danger">${icon("trash")} ลบโปรเจกต์</button>'
            + '</div>'
            + '</div>';
        }).join("");
        document.querySelectorAll(".set-project-inline").forEach((button) => {
          button.addEventListener("click", async () => {
            await post("/api/projects/default", { project: button.dataset.project });
            await refreshAll();
          });
        });
        document.querySelectorAll(".delete-project").forEach((button) => {
          button.addEventListener("click", async () => {
            const project = button.dataset.project;
            const typed = prompt("การลบจะลบทั้ง UI และไฟล์ใน D:\\\\AI-Workspace\\\\ ให้พิมพ์ชื่อโปรเจกต์เพื่อยืนยัน:", project);
            if (typed !== project) return;
            await post("/api/projects/delete", { project });
            await refreshAll();
          });
        });
      }

      function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char]);
      }

      function renderLogText(value) {
        return escapeHtml(value)
          .replace(/(^|[\s,(])([+]\d+)(?=[\s,),]|$)/g, '$1<span class="log-insertions">$2</span>')
          .replace(/(^|[\s,(])(-\d+)(?=[\s,),]|$)/g, '$1<span class="log-deletions">$2</span>');
      }

      refreshAll();
      setInterval(refreshAll, 1500);
    </script>
  </body>
</html>`;
}
