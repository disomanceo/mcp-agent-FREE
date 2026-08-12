import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { executeTool } from "./tools.js";

describe("tool argument validation", () => {
  it("rejects traversal in read_file args", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "personal-mcp-agent-"));
    fs.mkdirSync(path.join(root, "Demo"));

    await expect(
      executeTool(
        "read_file",
        { project: "Demo", path: "../secret" },
        {
          deviceId: "test",
          workspaceRoot: root,
          permissionMode: "SAFE",
          auditLogPath: path.join(root, "audit.jsonl"),
        },
      ),
    ).rejects.toThrow("Path traversal");
  });

  it("writes a file in WORK mode", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "personal-mcp-agent-"));
    fs.mkdirSync(path.join(root, "Demo"));

    const result = await executeTool(
      "write_file",
      {
        project: "Demo",
        path: "src/hello.ts",
        content: "export const hello = 'world';\n",
        createDirs: true,
      },
      {
        deviceId: "test",
        workspaceRoot: root,
        permissionMode: "WORK",
        auditLogPath: path.join(root, "audit.jsonl"),
      },
    );

    expect(result).toMatchObject({ path: "src/hello.ts", created: true });
    expect(fs.readFileSync(path.join(root, "Demo", "src", "hello.ts"), "utf8")).toContain("hello");
  });

  it("rejects write_file in SAFE mode", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "personal-mcp-agent-"));
    fs.mkdirSync(path.join(root, "Demo"));

    await expect(
      executeTool(
        "write_file",
        { project: "Demo", path: "hello.txt", content: "nope" },
        {
          deviceId: "test",
          workspaceRoot: root,
          permissionMode: "SAFE",
          auditLogPath: path.join(root, "audit.jsonl"),
        },
      ),
    ).rejects.toThrow("not allowed in SAFE mode");
  });

  it("rejects writing environment secret files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "personal-mcp-agent-"));
    fs.mkdirSync(path.join(root, "Demo"));

    await expect(
      executeTool(
        "write_file",
        { project: "Demo", path: ".env", content: "SECRET=value" },
        {
          deviceId: "test",
          workspaceRoot: root,
          permissionMode: "WORK",
          auditLogPath: path.join(root, "audit.jsonl"),
        },
      ),
    ).rejects.toThrow("Secret-looking");
  });

  it("rejects staging secret-looking files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "personal-mcp-agent-"));
    const project = path.join(root, "Demo");
    fs.mkdirSync(project);
    fs.writeFileSync(path.join(project, ".env"), "SECRET=value\n");
    await runGit(project, ["init"]);

    await expect(
      executeTool(
        "git_stage",
        { project: "Demo", paths: [".env"] },
        {
          deviceId: "test",
          workspaceRoot: root,
          permissionMode: "WORK",
          auditLogPath: path.join(root, "audit.jsonl"),
        },
      ),
    ).rejects.toThrow("Secret-looking");
  });
});

function runGit(cwd: string, args: string[]) {
  const result = fsSyncSpawn("git", args, cwd);
  if (result.status !== 0) {
    throw new Error(result.stderr);
  }
}

function fsSyncSpawn(command: string, args: string[], cwd: string) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}
