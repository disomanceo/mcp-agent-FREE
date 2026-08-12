import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runWhitelistedCommand } from "../src/command.js";

describe("command whitelist", () => {
  it("rejects non-whitelisted command names", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "personal-mcp-agent-"));

    await expect(
      runWhitelistedCommand({
        workspaceRoot: root,
        cwd: ".",
        command: "powershell" as never,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow("Command is not whitelisted");
  });
});
