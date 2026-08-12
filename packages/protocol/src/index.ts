import { z } from "zod";

export const permissionModeSchema = z.enum(["SAFE", "WORK", "DANGEROUS"]);

export const agentHelloSchema = z.object({
  type: z.literal("agent_hello"),
  deviceId: z.string().min(1),
  deviceName: z.string().min(1),
  agentVersion: z.string().min(1),
  workspaceRoot: z.string().min(1),
  defaultProject: z.string().min(1).optional(),
  permissionMode: permissionModeSchema,
  connectedAt: z.string().datetime(),
});

export const heartbeatSchema = z.object({
  type: z.literal("heartbeat"),
  deviceId: z.string().min(1),
  timestamp: z.string().datetime(),
});

export const agentRequestSchema = z.object({
  id: z.string().min(1),
  type: z.literal("tool_request"),
  tool: z.string().min(1),
  args: z.unknown(),
});

export const agentResponseSchema = z.object({
  id: z.string().min(1),
  type: z.literal("tool_response"),
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .optional(),
});

export const gatewayMessageSchema = z.discriminatedUnion("type", [
  agentRequestSchema,
  agentResponseSchema,
  agentHelloSchema,
  heartbeatSchema,
]);

export const projectArgsSchema = z.object({
  project: z.string().min(1).optional(),
});

export const listFilesArgsSchema = z.object({
  project: z.string().min(1).optional(),
  path: z.string().default("."),
  limit: z.number().int().min(1).max(500).default(200),
});

export const readFileArgsSchema = z.object({
  project: z.string().min(1).optional(),
  path: z.string().min(1),
  maxBytes: z.number().int().min(1).max(1_000_000).default(1_000_000),
});

export const writeFileArgsSchema = z.object({
  project: z.string().min(1).optional(),
  path: z.string().min(1),
  content: z.string(),
  createDirs: z.boolean().default(false),
  overwrite: z.boolean().default(true),
  maxBytes: z.number().int().min(1).max(1_000_000).default(1_000_000),
});

export const gitStageArgsSchema = z.object({
  project: z.string().min(1).optional(),
  paths: z.array(z.string().min(1)).min(1).max(100),
});

export const gitCommitArgsSchema = z.object({
  project: z.string().min(1).optional(),
  message: z.string().min(1).max(200),
  runChecks: z.boolean().default(true),
});

export const gitLogArgsSchema = z.object({
  project: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

export const deviceToolArgsSchema = z.object({
  deviceId: z.string().min(1).optional(),
});

export type AgentHello = z.infer<typeof agentHelloSchema>;
export type AgentHeartbeat = z.infer<typeof heartbeatSchema>;
export type AgentRequest = z.infer<typeof agentRequestSchema>;
export type AgentResponse = z.infer<typeof agentResponseSchema>;
export type GatewayMessage = z.infer<typeof gatewayMessageSchema>;
