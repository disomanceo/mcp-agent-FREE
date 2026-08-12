import dotenv from "dotenv";
import { z } from "zod";
import { permissionModeSchema } from "@personal-mcp-agent/protocol";

dotenv.config();

const configSchema = z.object({
  gatewayUrl: z.string().url().default("ws://127.0.0.1:8787/agent"),
  agentToken: z.string().min(16, "AGENT_TOKEN must be at least 16 characters"),
  workspaceRoot: z.string().min(1).default("D:\\AI-Workspace"),
  deviceId: z.string().min(1).default("personal-windows-agent"),
  deviceName: z.string().min(1).default("Windows Desktop Agent"),
  permissionMode: permissionModeSchema.default("SAFE"),
  auditLogPath: z.string().min(1).default("./audit/agent-tools.jsonl"),
});

export function loadAgentConfig() {
  return configSchema.parse({
    gatewayUrl: process.env.GATEWAY_URL,
    agentToken: process.env.AGENT_TOKEN,
    workspaceRoot: process.env.WORKSPACE_ROOT,
    deviceId: process.env.DEVICE_ID,
    deviceName: process.env.DEVICE_NAME,
    permissionMode: process.env.PERMISSION_MODE,
    auditLogPath: process.env.AUDIT_LOG_PATH,
  });
}
