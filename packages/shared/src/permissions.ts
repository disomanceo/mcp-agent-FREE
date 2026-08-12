export const permissionModes = ["SAFE", "WORK", "DANGEROUS"] as const;

export type PermissionMode = (typeof permissionModes)[number];

export const safeTools = new Set([
  "get_projects",
  "list_files",
  "read_file",
  "git_status",
  "git_diff",
  "npm_build",
  "npm_test",
]);

export function assertToolAllowed(tool: string, mode: PermissionMode): void {
  if (mode !== "SAFE") {
    throw new Error(`Permission mode ${mode} is defined but disabled in the MVP`);
  }

  if (!safeTools.has(tool)) {
    throw new Error(`Tool ${tool} is not allowed in SAFE mode`);
  }
}
