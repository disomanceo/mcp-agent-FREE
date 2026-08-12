import fs from "node:fs";
import path from "node:path";

export type AuditEvent = {
  timestamp: string;
  deviceId: string;
  tool: string;
  project?: string;
  summary?: string;
  durationMs: number;
  success: boolean;
  errorCode?: string;
};

export function appendAuditLog(logPath: string, event: AuditEvent): void {
  const resolved = path.resolve(logPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.appendFileSync(resolved, JSON.stringify(event) + "\n", "utf8");
}
