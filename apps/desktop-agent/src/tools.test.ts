import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
});
