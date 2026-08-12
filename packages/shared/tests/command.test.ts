import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runWhitelistedCommand } from "../src/command.js";
import { assertToolAllowed } from "../src/permissions.js";

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

  it("allows npm_lint in SAFE mode", () => {
    expect(() => assertToolAllowed("npm_lint", "SAFE")).not.toThrow();
  });

  it("rejects write_file in SAFE mode", () => {
    expect(() => assertToolAllowed("write_file", "SAFE")).toThrow("not allowed in SAFE mode");
  });
});
