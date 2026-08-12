export const errorCodes = [
  "DEVICE_OFFLINE",
  "PROJECT_NOT_FOUND",
  "PATH_NOT_ALLOWED",
  "FILE_TOO_LARGE",
  "BINARY_FILE_NOT_SUPPORTED",
  "NOT_A_GIT_REPOSITORY",
  "SCRIPT_NOT_FOUND",
  "COMMAND_TIMEOUT",
  "COMMAND_FAILED",
  "AUTH_FAILED",
  "INVALID_ARGUMENTS",
  "PERMISSION_DENIED",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export class AgentError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AgentError";
  }
}

export function toAgentError(error: unknown): { code: ErrorCode; message: string } {
  if (error instanceof AgentError) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof Error) {
    return { code: "COMMAND_FAILED", message: error.message };
  }

  return { code: "COMMAND_FAILED", message: "Unknown error" };
}
