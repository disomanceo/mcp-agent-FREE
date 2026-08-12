import { AgentError } from "./errors.js";

export const permissionModes = ["SAFE", "WORK", "DANGEROUS"] as const;

export type PermissionMode = (typeof permissionModes)[number];

export const safeTools = new Set([
  "get_projects",
  "list_files",
  "read_file",
  "git_status",
  "git_diff",
  "npm_lint",
  "npm_build",
  "npm_test",
]);

export const workTools = new Set([...safeTools, "write_file"]);
export const controlledGitTools = new Set([
  "git_stage",
  "git_commit",
  "git_push",
  "git_pull_ff_only",
  "git_log",
  "git_diff_staged",
  "npm_install",
]);

export function assertToolAllowed(tool: string, mode: PermissionMode): void {
  if (mode === "SAFE") {
    if (!safeTools.has(tool)) {
      throw new AgentError("PERMISSION_DENIED", `Tool ${tool} is not allowed in SAFE mode`);
    }
    return;
  }

  if (mode === "WORK") {
    if (!workTools.has(tool) && !controlledGitTools.has(tool)) {
      throw new AgentError("PERMISSION_DENIED", `Tool ${tool} is not allowed in WORK mode`);
    }
    return;
  }

  throw new AgentError("PERMISSION_DENIED", `Permission mode ${mode} is defined but disabled`);
}
