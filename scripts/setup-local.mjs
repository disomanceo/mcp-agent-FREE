import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const workspaceRoot = process.env.WORKSPACE_ROOT ?? "D:\\AI-Workspace";
const token = process.env.AGENT_TOKEN ?? crypto.randomBytes(32).toString("hex");

if (!fs.existsSync(workspaceRoot)) {
  fs.mkdirSync(workspaceRoot, { recursive: true });
}

if (!fs.existsSync(envPath)) {
  fs.writeFileSync(
    envPath,
    [
      "GATEWAY_PORT=8787",
      "GATEWAY_HOST=127.0.0.1",
      "GATEWAY_URL=ws://127.0.0.1:8787/agent",
      `AGENT_TOKEN=${token}`,
      `WORKSPACE_ROOT=${workspaceRoot}`,
      "DEVICE_ID=personal-windows-agent",
      "DEVICE_NAME=Windows Desktop Agent",
      "PERMISSION_MODE=SAFE",
      "AUDIT_LOG_PATH=./audit/agent-tools.jsonl",
      "",
    ].join("\n"),
    "utf8",
  );
}

const sampleProject = path.join(workspaceRoot, "SampleProject");
if (!fs.existsSync(sampleProject)) {
  fs.mkdirSync(sampleProject, { recursive: true });
  fs.writeFileSync(
    path.join(sampleProject, "README.md"),
    "# SampleProject\n\nทดลองอ่านไฟล์ผ่าน MCP Agent\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(sampleProject, "package.json"),
    JSON.stringify(
      {
        scripts: {
          build: "node -e \"console.log('sample build ok')\"",
          test: "node -e \"console.log('sample test ok')\"",
        },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

console.log(`Created/verified .env at ${envPath}`);
console.log(`Created/verified workspace at ${workspaceRoot}`);
console.log(`Created/verified sample project at ${sampleProject}`);
