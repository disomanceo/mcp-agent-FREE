import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const checks = [];

checkCommand("node", ["--version"], (stdout) => /^v(2[2-9]|[3-9]\d)\./.test(stdout.trim()));
checkCommand("npm", ["--version"]);
checkCommand("git", ["--version"]);

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
