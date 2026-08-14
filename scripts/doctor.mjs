import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const checks = [];

checkCommand("node", ["--version"], (stdout) => /^v(2[2-9]|[3-9]\d)\./.test(stdout.trim()));
checkCommand("npm", ["--version"]);
checkCommand("git", ["--version"]);

const ngrokPath = findNgrok();
const cloudflaredPath = findCloudflared();
checks.push({
  name: "ngrok.exe exists or Cloudflare fallback is available",
  ok: Boolean(ngrokPath || cloudflaredPath),
  detail: ngrokPath ?? "ngrok not found; Cloudflare fallback is available",
});

checks.push({
  name: "cloudflared.exe exists",
  ok: Boolean(cloudflaredPath),
  detail: cloudflaredPath ?? "not found",
});

const ngrokConfig = path.join(process.env.LOCALAPPDATA ?? "", "ngrok", "ngrok.yml");
checks.push({
  name: "ngrok authtoken config",
  ok: fs.existsSync(ngrokConfig),
  detail: fs.existsSync(ngrokConfig)
    ? ngrokConfig
    : "missing; run: ngrok config add-authtoken YOUR_TOKEN_HERE",
});

checks.push({
  name: ".env exists",
  ok: fs.existsSync(path.join(process.cwd(), ".env")),
  detail: path.join(process.cwd(), ".env"),
});

checks.push({
  name: "AGENT_TOKEN length",
  ok: typeof process.env.AGENT_TOKEN === "string" && process.env.AGENT_TOKEN.length >= 16,
  detail: process.env.AGENT_TOKEN ? "configured" : "missing",
});

checks.push({
  name: "WORKSPACE_ROOT exists",
  ok: typeof process.env.WORKSPACE_ROOT === "string" && fs.existsSync(process.env.WORKSPACE_ROOT),
  detail: process.env.WORKSPACE_ROOT ?? "missing",
});

checks.push({
  name: "DEFAULT_PROJECT exists",
  ok:
    typeof process.env.WORKSPACE_ROOT === "string" &&
    typeof process.env.DEFAULT_PROJECT === "string" &&
    fs.existsSync(path.join(process.env.WORKSPACE_ROOT, process.env.DEFAULT_PROJECT)),
  detail: process.env.DEFAULT_PROJECT ?? "missing",
});

let failed = false;
for (const check of checks) {
  const marker = check.ok ? "PASS" : "FAIL";
  console.log(`${marker} ${check.name}: ${check.detail}`);
  failed = failed || !check.ok;
}

process.exitCode = failed ? 1 : 0;

function checkCommand(
  command,
  args,
  validate = () => true,
  label = `${command} ${args.join(" ")}`,
) {
  const result = spawnSync([command, ...args].join(" "), {
    encoding: "utf8",
    shell: true,
    windowsHide: true,
  });
  const output =
    (result.stdout ?? "").trim() || (result.stderr ?? "").trim() || result.error?.message || "";
  checks.push({
    name: label,
    ok: result.status === 0 && validate(output),
    detail: output || "not found",
  });
}

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

  for (const entry of (process.env.PATH ?? "").split(path.delimiter)) {
    candidates.push(path.join(entry, "ngrok.exe"));
  }

  candidates.push(...findFilesUnder(
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages"),
    "ngrok.exe",
    4,
  ));

  return [...new Set(candidates.filter(Boolean))].find((candidate) => fs.existsSync(candidate));
}

function findCloudflared() {
  const candidates = [
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Links", "cloudflared.exe"),
    path.join(os.homedir(), "AppData", "Local", "Programs", "cloudflared", "cloudflared.exe"),
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "cloudflared", "cloudflared.exe"),
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Cloudflare", "cloudflared.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "cloudflared", "cloudflared.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Cloudflare", "cloudflared.exe"),
  ];

  const where = spawnSync("where.exe", ["cloudflared"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 5000,
  });
  if (where.status === 0 && where.stdout) {
    candidates.push(...where.stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean));
  }

  for (const entry of (process.env.PATH ?? "").split(path.delimiter)) {
    candidates.push(path.join(entry, "cloudflared.exe"));
  }

  candidates.push(...findFilesUnder(
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages"),
    "cloudflared.exe",
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
