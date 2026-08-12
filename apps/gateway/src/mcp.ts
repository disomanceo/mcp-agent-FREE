import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  deviceToolArgsSchema,
  listFilesArgsSchema,
  projectArgsSchema,
  readFileArgsSchema,
} from "@personal-mcp-agent/protocol";
import { DeviceRegistry } from "./deviceRegistry.js";

export function createMcpServer(registry: DeviceRegistry, requestTimeoutMs: number) {
  const server = new McpServer({
    name: "personal-mcp-gateway",
    version: "0.1.0",
  });

  server.registerTool(
    "get_devices",
    {
      title: "Get connected devices",
      description: "List connected Desktop Agents and safe metadata only.",
      inputSchema: {},
    },
    async () => textResult(registry.listSafeDevices()),
  );

  registerAgentTool(
    server,
    registry,
    requestTimeoutMs,
    "get_projects",
    deviceToolArgsSchema.shape,
    "List first-level project folders from WORKSPACE_ROOT on the selected device.",
  );
  registerAgentTool(
    server,
    registry,
    requestTimeoutMs,
    "list_files",
    deviceToolArgsSchema.merge(listFilesArgsSchema).shape,
    "List files and folders inside an allowed project path with a result limit.",
  );
  registerAgentTool(
    server,
    registry,
    requestTimeoutMs,
    "read_file",
    deviceToolArgsSchema.merge(readFileArgsSchema).shape,
    "Read a UTF-8 text file from an allowed project workspace. Cannot access outside WORKSPACE_ROOT.",
  );
  registerAgentTool(
    server,
    registry,
    requestTimeoutMs,
    "git_status",
    deviceToolArgsSchema.merge(projectArgsSchema).shape,
    "Run git status --short --branch for an allowed git project.",
  );
  registerAgentTool(
    server,
    registry,
    requestTimeoutMs,
    "git_diff",
    deviceToolArgsSchema.merge(projectArgsSchema).shape,
    "Run git diff for an allowed git project with bounded output.",
  );
  registerAgentTool(
    server,
    registry,
    requestTimeoutMs,
    "npm_build",
    deviceToolArgsSchema.merge(projectArgsSchema).shape,
    "Run npm run build for an allowed project. No arbitrary command input is accepted.",
  );
  registerAgentTool(
    server,
    registry,
    requestTimeoutMs,
    "npm_test",
    deviceToolArgsSchema.merge(projectArgsSchema).shape,
    "Run npm test for an allowed project. Returns SCRIPT_NOT_FOUND if no test script exists.",
  );

  return server;
}

export function createMcpTransport() {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
}

function registerAgentTool(
  server: McpServer,
  registry: DeviceRegistry,
  requestTimeoutMs: number,
  name: string,
  inputSchema: Record<string, z.ZodTypeAny>,
  description: string,
) {
  server.registerTool(
    name,
    {
      title: name,
      description,
      inputSchema,
    },
    async (args) => {
      const { deviceId, ...agentArgs } = args as { deviceId?: string; [key: string]: unknown };
      const data = await registry.request(deviceId, name, agentArgs, requestTimeoutMs);
      return textResult(data);
    },
  );
}

function textResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}
