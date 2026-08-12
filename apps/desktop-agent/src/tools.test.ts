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
    const auditLogPath = path.join(root, "audit.jsonl");

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
        auditLogPath,
      },
    );

    expect(result).toMatchObject({ path: "src/hello.ts", created: true });
    expect(fs.readFileSync(path.join(root, "Demo", "src", "hello.ts"), "utf8")).toContain("hello");
    const auditEvent = JSON.parse(fs.readFileSync(auditLogPath, "utf8").trim());
    expect(auditEvent).toMatchObject({
      tool: "write_file",
      project: "Demo",
      summary: "created src/hello.ts +1 -0 lines (30 bytes)",
      success: true,
    });
  });

  it("records write_file line deltas for updated files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "personal-mcp-agent-"));
    fs.mkdirSync(path.join(root, "Demo"));
    fs.writeFileSync(path.join(root, "Demo", "notes.md"), "one\ntwo\nthree\n");
    const auditLogPath = path.join(root, "audit.jsonl");

    const result = await executeTool(
      "write_file",
      {
        project: "Demo",
        path: "notes.md",
        content: "one\ntwo\nthree\nfour\nfive\n",
        overwrite: true,
      },
      {
        deviceId: "test",
        workspaceRoot: root,
        permissionMode: "WORK",
        auditLogPath,
      },
    );

    expect(result).toMatchObject({ path: "notes.md", lineDelta: { added: 2, removed: 0 } });
    const auditEvent = JSON.parse(fs.readFileSync(auditLogPath, "utf8").trim());
    expect(auditEvent.summary).toBe("updated notes.md +2 -0 lines (24 bytes)");
  });

  it("uses defaultProject when project is omitted", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "personal-mcp-agent-"));
    fs.mkdirSync(path.join(root, "Demo"));
    fs.writeFileSync(path.join(root, "Demo", "README.md"), "default project works\n");

    const result = await executeTool(
      "read_file",
      { path: "README.md" },
      {
        deviceId: "test",
        workspaceRoot: root,
        defaultProject: "Demo",
        permissionMode: "SAFE",
        auditLogPath: path.join(root, "audit.jsonl"),
      },
    );

    expect(result).toMatchObject({ path: "README.md" });
  });

  it("requires a project when no defaultProject is configured", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "personal-mcp-agent-"));

    await expect(
      executeTool(
        "read_file",
        { path: "README.md" },
        {
          deviceId: "test",
          workspaceRoot: root,
          permissionMode: "SAFE",
          auditLogPath: path.join(root, "audit.jsonl"),
        },
      ),
    ).rejects.toThrow("Project is required");
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
