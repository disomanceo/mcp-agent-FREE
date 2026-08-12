import WebSocket from "ws";
import { AgentRequest, agentRequestSchema } from "@personal-mcp-agent/protocol";
import { toAgentError } from "@personal-mcp-agent/shared";
import { loadAgentConfig } from "./config.js";
import { executeTool } from "./tools.js";

const agentVersion = "0.1.0";
const config = loadAgentConfig();

console.log("Personal MCP Desktop Agent");
console.log("Status: Connecting");
console.log(`Workspace: ${config.workspaceRoot}`);
console.log(`Mode: ${config.permissionMode}`);

let reconnectAttempt = 0;
let heartbeatTimer: NodeJS.Timeout | undefined;

function connect() {
  const url = new URL(config.gatewayUrl);
  url.searchParams.set("token", config.agentToken);

  const socket = new WebSocket(url);

  socket.on("open", () => {
    reconnectAttempt = 0;
    console.log("Status: Connected");
    socket.send(
      JSON.stringify({
        type: "agent_hello",
        deviceId: config.deviceId,
        deviceName: config.deviceName,
        agentVersion,
        workspaceRoot: config.workspaceRoot,
        defaultProject: config.defaultProject,
        permissionMode: config.permissionMode,
        connectedAt: new Date().toISOString(),
      }),
    );
    heartbeatTimer = setInterval(() => {
      socket.send(
        JSON.stringify({
          type: "heartbeat",
          deviceId: config.deviceId,
          timestamp: new Date().toISOString(),
        }),
      );
    }, 10_000);
  });

  socket.on("message", async (raw) => {
    let request: AgentRequest;
    try {
      request = agentRequestSchema.parse(JSON.parse(raw.toString()));
    } catch {
      return;
    }

    try {
      const data = await executeTool(request.tool, request.args, {
        deviceId: config.deviceId,
        workspaceRoot: config.workspaceRoot,
        defaultProject: config.defaultProject,
        permissionMode: config.permissionMode,
        auditLogPath: config.auditLogPath,
      });
      socket.send(JSON.stringify({ id: request.id, type: "tool_response", ok: true, data }));
    } catch (error) {
      socket.send(
        JSON.stringify({
          id: request.id,
          type: "tool_response",
          ok: false,
          error: toAgentError(error),
        }),
      );
    }
  });

  socket.on("close", () => reconnect());
  socket.on("error", () => socket.close());
}

function reconnect() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }
  const delayMs = Math.min(30_000, 1000 * 2 ** reconnectAttempt++);
  console.log(`Status: Reconnecting in ${delayMs}ms`);
  setTimeout(connect, delayMs);
}

connect();
