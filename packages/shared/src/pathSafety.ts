import fs from "node:fs";
import path from "node:path";
import { AgentError } from "./errors.js";

const windowsDrivePattern = /^[a-zA-Z]:/;
const uncPattern = /^(\\\\|\/\/)/;

export function normalizeWorkspaceRoot(workspaceRoot: string): string {
  if (!workspaceRoot || workspaceRoot.trim().length === 0) {
    throw new AgentError("INVALID_ARGUMENTS", "WORKSPACE_ROOT is required");
  }

  if (uncPattern.test(workspaceRoot)) {
    throw new AgentError("PATH_NOT_ALLOWED", "UNC workspace roots are not allowed");
  }

  return fs.realpathSync.native(path.resolve(workspaceRoot));
}

export function validateProjectName(project: string): void {
  if (!project || project === "." || project === "..") {
    throw new AgentError("INVALID_ARGUMENTS", "Invalid project name");
  }

  if (
    project.includes("/") ||
    project.includes("\\") ||
    project.includes("\0") ||
    windowsDrivePattern.test(project) ||
    uncPattern.test(project)
  ) {
    throw new AgentError("INVALID_ARGUMENTS", "Project names must be a single folder name");
  }
}

export function rejectUnsafeRelativePath(relativePath: string): void {
  if (
    relativePath.includes("\0") ||
    windowsDrivePattern.test(relativePath) ||
    uncPattern.test(relativePath)
  ) {
    throw new AgentError("PATH_NOT_ALLOWED", "Absolute, UNC, and network paths are not allowed");
  }

  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized.split("/").some((part) => part === "..")) {
    throw new AgentError("PATH_NOT_ALLOWED", "Path traversal is not allowed");
  }
}

export function resolveSafePath(workspaceRoot: string, relativePath = "."): string {
  const root = normalizeWorkspaceRoot(workspaceRoot);
  rejectUnsafeRelativePath(relativePath);

  const candidate = path.resolve(root, relativePath || ".");
  const existingPath = nearestExistingPath(candidate);
  const realExistingPath = fs.realpathSync.native(existingPath);
  const realCandidate = realExistingPath + candidate.slice(existingPath.length);

  if (!isPathInside(root, realCandidate)) {
    throw new AgentError("PATH_NOT_ALLOWED", "Resolved path escapes WORKSPACE_ROOT");
  }

  return candidate;
}

export function resolveProjectPath(
  workspaceRoot: string,
  project: string,
  relativePath = ".",
): string {
  validateProjectName(project);
  rejectUnsafeRelativePath(relativePath);
  return resolveSafePath(workspaceRoot, path.join(project, relativePath));
}

export function assertProjectDirectory(workspaceRoot: string, project: string): string {
  const projectPath = resolveProjectPath(workspaceRoot, project);
  const stat = fs.statSync(projectPath, { throwIfNoEntry: false });

  if (!stat?.isDirectory()) {
    throw new AgentError("PROJECT_NOT_FOUND", "Project was not found in WORKSPACE_ROOT");
  }

  return fs.realpathSync.native(projectPath);
}

function nearestExistingPath(candidate: string): string {
  let current = candidate;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      throw new AgentError("PATH_NOT_ALLOWED", "No existing parent path could be resolved");
    }
    current = parent;
  }
  return current;
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
