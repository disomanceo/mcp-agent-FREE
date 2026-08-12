import { describe, expect, it } from "vitest";
import { agentRequestSchema, listFilesArgsSchema } from "../src/index.js";

describe("protocol parsing", () => {
  it("parses valid agent requests", () => {
    const parsed = agentRequestSchema.parse({
      id: "1",
      type: "tool_request",
      tool: "read_file",
      args: { project: "Demo", path: "package.json" },
    });

    expect(parsed.tool).toBe("read_file");
  });

  it("applies safe list_files defaults", () => {
    const parsed = listFilesArgsSchema.parse({ project: "Demo" });

    expect(parsed.path).toBe(".");
    expect(parsed.limit).toBe(200);
  });

  it("rejects excessive list_files limits", () => {
    expect(() => listFilesArgsSchema.parse({ project: "Demo", limit: 1000 })).toThrow();
  });
});
