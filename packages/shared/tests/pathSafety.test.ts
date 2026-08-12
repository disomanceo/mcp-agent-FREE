import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertProjectDirectory,
  rejectUnsafeRelativePath,
  resolveProjectPath,
  validateProjectName,
} from "../src/pathSafety.js";

describe("safe path validation", () => {
  it("resolves a project path under the workspace", () => {
    const root = makeWorkspace();
    fs.mkdirSync(path.join(root, "ProjectA"));

    expect(resolveProjectPath(root, "ProjectA", "src/index.ts")).toBe(
      path.join(root, "ProjectA", "src", "index.ts"),
    );
  });

  it.each(["../secret", "..\\secret", "C:\\Windows", "\\\\server\\share", "project/../../secret"])(
    "rejects unsafe relative path %s",
    (value) => {
      expect(() => rejectUnsafeRelativePath(value)).toThrow();
    },
  );

  it.each(["..", ".", "nested/project", "nested\\project", "C:", "\\\\server"])(
    "rejects invalid project name %s",
    (value) => {
      expect(() => validateProjectName(value)).toThrow();
    },
  );

  it("rejects project directories that do not exist", () => {
    const root = makeWorkspace();
    expect(() => assertProjectDirectory(root, "Missing")).toThrow("Project was not found");
  });
});

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "personal-mcp-agent-"));
}
