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
  runSafeCommand,
  runWhitelistedCommand,
  toAgentError,
} from "@personal-mcp-agent/shared";
import {
  gitCommitArgsSchema,
  gitLogArgsSchema,
  gitStageArgsSchema,
  listFilesArgsSchema,
  projectArgsSchema,
  readFileArgsSchema,
  writeFileArgsSchema,
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
      case "write_file": {
        const parsed = writeFileArgsSchema.parse(input);
        project = parsed.project;
        return writeFile(ctx.workspaceRoot, parsed);
      }
      case "git_status":
        project = projectArgsSchema.parse(input).project;
        return gitCommand(ctx.workspaceRoot, project, "git_status");
      case "git_diff":
        project = projectArgsSchema.parse(input).project;
        return gitCommand(ctx.workspaceRoot, project, "git_diff");
      case "git_diff_staged":
        project = projectArgsSchema.parse(input).project;
        return fixedGitCommand(ctx.workspaceRoot, project, ["diff", "--cached"], 60_000);
      case "git_log": {
        const parsed = gitLogArgsSchema.parse(input);
        project = parsed.project;
        return fixedGitCommand(ctx.workspaceRoot, parsed.project, [
          "log",
          "--oneline",
          `-${parsed.limit}`,
        ]);
      }
      case "git_stage": {
        const parsed = gitStageArgsSchema.parse(input);
        project = parsed.project;
        return gitStage(ctx.workspaceRoot, parsed.project, parsed.paths);
      }
      case "git_commit": {
        const parsed = gitCommitArgsSchema.parse(input);
        project = parsed.project;
        return gitCommit(ctx.workspaceRoot, parsed.project, parsed.message, parsed.runChecks);
      }
      case "git_push":
        project = projectArgsSchema.parse(input).project;
        return gitPush(ctx.workspaceRoot, project);
      case "git_pull_ff_only":
        project = projectArgsSchema.parse(input).project;
        return gitPullFfOnly(ctx.workspaceRoot, project);
      case "npm_lint":
        project = projectArgsSchema.parse(input).project;
        return npmCommand(ctx.workspaceRoot, project, "npm_lint");
      case "npm_install":
        project = projectArgsSchema.parse(input).project;
        return npmInstall(ctx.workspaceRoot, project);
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

async function writeFile(
  workspaceRoot: string,
  options: {
    project: string;
    path: string;
    content: string;
    createDirs: boolean;
    overwrite: boolean;
    maxBytes: number;
  },
) {
  assertNotSecretPath(options.path);
  const filePath = resolveProjectPath(workspaceRoot, options.project, options.path);
  const encoded = Buffer.from(options.content, "utf8");
  if (encoded.byteLength > options.maxBytes) {
    throw new AgentError("FILE_TOO_LARGE", "Content exceeds the maximum allowed size");
  }

  const existing = await fs.stat(filePath).catch(() => undefined);
  if (existing?.isDirectory()) {
    throw new AgentError("PATH_NOT_ALLOWED", "Cannot write over a directory");
  }
  if (existing && !options.overwrite) {
    throw new AgentError("INVALID_ARGUMENTS", "File exists and overwrite is false");
  }

  const parent = path.dirname(filePath);
  if (options.createDirs) {
    await fs.mkdir(parent, { recursive: true });
  } else {
    const parentStat = await fs.stat(parent).catch(() => undefined);
    if (!parentStat?.isDirectory()) {
      throw new AgentError("PATH_NOT_ALLOWED", "Parent directory does not exist");
    }
  }

  await fs.writeFile(filePath, encoded, "utf8");
  return {
    path: options.path,
    sizeBytes: encoded.byteLength,
    created: !existing,
    overwritten: Boolean(existing),
  };
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

async function fixedGitCommand(
  workspaceRoot: string,
  project: string,
  args: readonly string[],
  timeoutMs = 60_000,
) {
  const cwd = assertGitProject(workspaceRoot, project);
  return runSafeCommand({
    workspaceRoot,
    cwd: path.relative(workspaceRoot, cwd),
    executable: "git",
    args,
    timeoutMs,
  });
}

async function gitStage(workspaceRoot: string, project: string, paths: string[]) {
  const cwd = assertGitProject(workspaceRoot, project);
  for (const relativePath of paths) {
    assertNotSecretPath(relativePath);
    resolveProjectPath(workspaceRoot, project, relativePath);
  }

  return runSafeCommand({
    workspaceRoot,
    cwd: path.relative(workspaceRoot, cwd),
    executable: "git",
    args: ["add", "--", ...paths],
    timeoutMs: 60_000,
  });
}

async function gitCommit(
  workspaceRoot: string,
  project: string,
  message: string,
  runChecks: boolean,
) {
  const cwd = assertGitProject(workspaceRoot, project);
  const cwdRelative = path.relative(workspaceRoot, cwd);
  const stagedFiles = await getStagedFiles(workspaceRoot, cwdRelative);
  if (stagedFiles.length === 0) {
    throw new AgentError("INVALID_ARGUMENTS", "No staged changes to commit");
  }
  assertNoSecretPaths(stagedFiles);

  const checkResults = [];
  if (runChecks) {
    checkResults.push(...(await runAvailableChecks(workspaceRoot, project)));
  }

  const commit = await runSafeCommand({
    workspaceRoot,
    cwd: cwdRelative,
    executable: "git",
    args: ["commit", "-m", message],
    timeoutMs: 60_000,
  });

  return { commit, checks: checkResults, stagedFiles };
}

async function gitPush(workspaceRoot: string, project: string) {
  const cwd = assertGitProject(workspaceRoot, project);
  const cwdRelative = path.relative(workspaceRoot, cwd);
  const upstream = await runSafeCommand({
    workspaceRoot,
    cwd: cwdRelative,
    executable: "git",
    args: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    timeoutMs: 30_000,
  });
  if (upstream.exitCode !== 0 || upstream.stdout.trim().length === 0) {
    throw new AgentError("INVALID_ARGUMENTS", "Current branch has no upstream");
  }

  const status = await runSafeCommand({
    workspaceRoot,
    cwd: cwdRelative,
    executable: "git",
    args: ["status", "--porcelain"],
    timeoutMs: 30_000,
  });
  if (status.stdout.trim().length > 0) {
    throw new AgentError("INVALID_ARGUMENTS", "Working tree must be clean before push");
  }

  return runSafeCommand({
    workspaceRoot,
    cwd: cwdRelative,
    executable: "git",
    args: ["push"],
    timeoutMs: 120_000,
  });
}

async function gitPullFfOnly(workspaceRoot: string, project: string) {
  const cwd = assertGitProject(workspaceRoot, project);
  return runSafeCommand({
    workspaceRoot,
    cwd: path.relative(workspaceRoot, cwd),
    executable: "git",
    args: ["pull", "--ff-only"],
    timeoutMs: 120_000,
  });
}

async function npmCommand(
  workspaceRoot: string,
  project: string,
  command: "npm_lint" | "npm_build" | "npm_test",
) {
  const cwd = assertProjectDirectory(workspaceRoot, project);
  const packageJsonPath = path.join(cwd, "package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const scriptName = command === "npm_build" ? "build" : command === "npm_lint" ? "lint" : "test";
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

async function npmInstall(workspaceRoot: string, project: string) {
  const cwd = assertProjectDirectory(workspaceRoot, project);
  return runSafeCommand({
    workspaceRoot,
    cwd: path.relative(workspaceRoot, cwd),
    executable: "npm",
    args: ["install"],
    timeoutMs: 300_000,
  });
}

function assertGitProject(workspaceRoot: string, project: string): string {
  const cwd = assertProjectDirectory(workspaceRoot, project);
  if (!fsSync.existsSync(path.join(cwd, ".git"))) {
    throw new AgentError("NOT_A_GIT_REPOSITORY", "Project is not a git repository");
  }
  return cwd;
}

async function getStagedFiles(workspaceRoot: string, cwd: string): Promise<string[]> {
  const result = await runSafeCommand({
    workspaceRoot,
    cwd,
    executable: "git",
    args: ["diff", "--cached", "--name-only"],
    timeoutMs: 30_000,
  });
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function runAvailableChecks(workspaceRoot: string, project: string) {
  const cwd = assertProjectDirectory(workspaceRoot, project);
  const packageJson = JSON.parse(await fs.readFile(path.join(cwd, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const results = [];
  for (const [scriptName, command] of [
    ["lint", "npm_lint"],
    ["build", "npm_build"],
  ] as const) {
    if (!packageJson.scripts?.[scriptName]) {
      continue;
    }
    const result = await npmCommand(workspaceRoot, project, command);
    if (result.exitCode !== 0) {
      throw new AgentError("COMMAND_FAILED", `${scriptName} failed before commit`);
    }
    results.push({ script: scriptName, result });
  }
  return results;
}

function assertNotSecretPath(relativePath: string): void {
  const normalized = relativePath.replaceAll("\\", "/").toLowerCase();
  const baseName = path.posix.basename(normalized);
  const secretNames = new Set(["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"]);
  if (
    baseName === ".env" ||
    (baseName.startsWith(".env.") && baseName !== ".env.example") ||
    baseName.endsWith(".pem") ||
    baseName.endsWith(".key") ||
    secretNames.has(baseName) ||
    baseName.includes("secret")
  ) {
    throw new AgentError("PATH_NOT_ALLOWED", "Secret-looking files are not allowed");
  }
}

function assertNoSecretPaths(paths: string[]): void {
  for (const relativePath of paths) {
    assertNotSecretPath(relativePath);
  }
}
