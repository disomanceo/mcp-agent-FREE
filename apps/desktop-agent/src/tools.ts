import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import {
  AgentError,
  appendAuditLog,
  assertProjectDirectory,
  assertToolAllowed,
  PermissionMode,
  resolveProjectPath,
  runWhitelistedCommand,
  toAgentError,
} from "@personal-mcp-agent/shared";
import {
  listFilesArgsSchema,
  projectArgsSchema,
  readFileArgsSchema,
} from "@personal-mcp-agent/protocol";

export type ToolContext = {
  deviceId: string;
  workspaceRoot: string;
  permissionMode: PermissionMode;
  auditLogPath: string;
};

export async function executeTool(
  tool: string,
  args: unknown,
  context: ToolContext,
): Promise<unknown> {
  const start = Date.now();
  let project: string | undefined;

  try {
    assertToolAllowed(tool, context.permissionMode);
    const data = await executeAllowedTool(tool, args, context);
    appendAuditLog(context.auditLogPath, {
      timestamp: new Date().toISOString(),
      deviceId: context.deviceId,
      tool,
      project,
      durationMs: Date.now() - start,
      success: true,
    });
    return data;
  } catch (error) {
    const agentError = toAgentError(error);
    appendAuditLog(context.auditLogPath, {
      timestamp: new Date().toISOString(),
      deviceId: context.deviceId,
      tool,
      project,
      durationMs: Date.now() - start,
      success: false,
      errorCode: agentError.code,
    });
    throw error;
  }

  async function executeAllowedTool(
    name: string,
    input: unknown,
    ctx: ToolContext,
  ): Promise<unknown> {
    switch (name) {
      case "get_projects":
        return getProjects(ctx.workspaceRoot);
      case "list_files": {
        const parsed = listFilesArgsSchema.parse(input);
        project = parsed.project;
        return listFiles(ctx.workspaceRoot, parsed.project, parsed.path, parsed.limit);
      }
      case "read_file": {
        const parsed = readFileArgsSchema.parse(input);
        project = parsed.project;
        return readFile(ctx.workspaceRoot, parsed.project, parsed.path, parsed.maxBytes);
      }
      case "git_status":
        project = projectArgsSchema.parse(input).project;
        return gitCommand(ctx.workspaceRoot, project, "git_status");
      case "git_diff":
        project = projectArgsSchema.parse(input).project;
        return gitCommand(ctx.workspaceRoot, project, "git_diff");
      case "npm_build":
        project = projectArgsSchema.parse(input).project;
        return npmCommand(ctx.workspaceRoot, project, "npm_build");
      case "npm_test":
        project = projectArgsSchema.parse(input).project;
        return npmCommand(ctx.workspaceRoot, project, "npm_test");
      default:
        throw new AgentError("INVALID_ARGUMENTS", `Unknown tool: ${name}`);
    }
  }
}

async function getProjects(workspaceRoot: string) {
  const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .slice(0, 500)
    .map((entry) => ({ name: entry.name, path: entry.name }));
}

async function listFiles(
  workspaceRoot: string,
  project: string,
  relativePath: string,
  limit: number,
) {
  const directory = resolveProjectPath(workspaceRoot, project, relativePath);
  const stat = await fs.stat(directory).catch(() => undefined);
  if (!stat?.isDirectory()) {
    throw new AgentError("PATH_NOT_ALLOWED", "Requested path is not a directory");
  }

  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries.slice(0, limit).map((entry) => ({
    name: entry.name,
    path: path.posix.join(relativePath.replaceAll("\\", "/"), entry.name).replace(/^\.\//, ""),
    type: entry.isDirectory() ? "directory" : "file",
  }));
}

async function readFile(
  workspaceRoot: string,
  project: string,
  relativePath: string,
  maxBytes: number,
) {
  const filePath = resolveProjectPath(workspaceRoot, project, relativePath);
  const stat = await fs.stat(filePath).catch(() => undefined);
  if (!stat?.isFile()) {
    throw new AgentError("PATH_NOT_ALLOWED", "Requested path is not a file");
  }
  if (stat.size > maxBytes) {
    throw new AgentError("FILE_TOO_LARGE", "File exceeds the maximum allowed size");
  }

  const buffer = await fs.readFile(filePath);
  if (buffer.includes(0)) {
    throw new AgentError("BINARY_FILE_NOT_SUPPORTED", "Binary files are not supported in the MVP");
  }

  return { path: relativePath, content: buffer.toString("utf8"), sizeBytes: buffer.byteLength };
}

async function gitCommand(
  workspaceRoot: string,
  project: string,
  command: "git_status" | "git_diff",
) {
  const cwd = assertProjectDirectory(workspaceRoot, project);
  if (!fsSync.existsSync(path.join(cwd, ".git"))) {
    throw new AgentError("NOT_A_GIT_REPOSITORY", "Project is not a git repository");
  }
  return runWhitelistedCommand({
    workspaceRoot,
    cwd: path.relative(workspaceRoot, cwd),
    command,
    timeoutMs: 60_000,
  });
}

async function npmCommand(
  workspaceRoot: string,
  project: string,
  command: "npm_build" | "npm_test",
) {
  const cwd = assertProjectDirectory(workspaceRoot, project);
  const packageJsonPath = path.join(cwd, "package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const scriptName = command === "npm_build" ? "build" : "test";
  if (!packageJson.scripts?.[scriptName]) {
    throw new AgentError("SCRIPT_NOT_FOUND", `package.json does not define a ${scriptName} script`);
  }
  return runWhitelistedCommand({
    workspaceRoot,
    cwd: path.relative(workspaceRoot, cwd),
    command,
    timeoutMs: 300_000,
  });
}
