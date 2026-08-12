import { execa, ExecaError } from "execa";
import { AgentError } from "./errors.js";
import { resolveSafePath } from "./pathSafety.js";

const allowedCommands = new Map<string, readonly string[]>([
  ["git_status", ["git", "status", "--short", "--branch"]],
  ["git_diff", ["git", "diff"]],
  ["npm_lint", ["npm", "run", "lint"]],
  ["npm_build", ["npm", "run", "build"]],
  ["npm_test", ["npm", "test"]],
]);

export type SafeCommandName = "git_status" | "git_diff" | "npm_lint" | "npm_build" | "npm_test";

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export async function runWhitelistedCommand(options: {
  workspaceRoot: string;
  cwd: string;
  command: SafeCommandName;
  timeoutMs: number;
  maxOutputBytes?: number;
}): Promise<CommandResult> {
  const command = allowedCommands.get(options.command);
  if (!command) {
    throw new AgentError("PERMISSION_DENIED", "Command is not whitelisted");
  }

  const [executable, ...args] = command;
  if (!executable) {
    throw new AgentError("INVALID_ARGUMENTS", "Invalid command configuration");
  }

  return runSafeCommand({
    workspaceRoot: options.workspaceRoot,
    cwd: options.cwd,
    executable,
    args,
    timeoutMs: options.timeoutMs,
    maxOutputBytes: options.maxOutputBytes,
  });
}

export async function runSafeCommand(options: {
  workspaceRoot: string;
  cwd: string;
  executable: string;
  args: readonly string[];
  timeoutMs: number;
  maxOutputBytes?: number;
}): Promise<CommandResult> {
  const cwd = resolveSafePath(options.workspaceRoot, options.cwd);
  const start = Date.now();

  try {
    const result = await execa(options.executable, [...options.args], {
      cwd,
      timeout: options.timeoutMs,
      reject: false,
      windowsHide: true,
      all: false,
    });

    return {
      exitCode: result.exitCode ?? 0,
      stdout: limitText(result.stdout, options.maxOutputBytes ?? 64_000),
      stderr: limitText(result.stderr, options.maxOutputBytes ?? 64_000),
      durationMs: Date.now() - start,
    };
  } catch (error) {
    if (error instanceof ExecaError && error.timedOut) {
      throw new AgentError("COMMAND_TIMEOUT", "Command timed out");
    }
    throw error;
  }
}

function limitText(value: string, maxBytes: number): string {
  const buffer = Buffer.from(value, "utf8");
  if (buffer.byteLength <= maxBytes) {
    return value;
  }
  return buffer.subarray(0, maxBytes).toString("utf8") + "\n[output truncated]";
}
