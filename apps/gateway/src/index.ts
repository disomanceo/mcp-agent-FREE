import http from "node:http";
import express from "express";
import { WebSocketServer } from "ws";
import { agentHelloSchema, heartbeatSchema } from "@personal-mcp-agent/protocol";
import { toAgentError } from "@personal-mcp-agent/shared";
import { loadGatewayConfig } from "./config.js";
import { DeviceRegistry } from "./deviceRegistry.js";
import { createMcpServer, createMcpTransport } from "./mcp.js";

const config = loadGatewayConfig();
const registry = new DeviceRegistry();
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "personal-mcp-gateway" });
});

app.get("/api/devices", (_request, response) => {
  response.json(registry.listSafeDevices());
});

app.post("/mcp", async (request, response) => {
  const mcpServer = createMcpServer(registry, config.requestTimeoutMs);
  const transport = createMcpTransport();
  await mcpServer.connect(transport);
  await transport.handleRequest(request, response, request.body);
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  if (url.pathname !== "/agent" || url.searchParams.get("token") !== config.agentToken) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
});

wss.on("connection", (socket) => {
  socket.on("message", (raw) => {
    try {
      const json = JSON.parse(raw.toString());
      if (registry.handleAgentResponse(json)) {
        return;
      }

      const hello = agentHelloSchema.safeParse(json);
      if (hello.success) {
        registry.register(hello.data, socket);
        return;
      }

      const heartbeat = heartbeatSchema.safeParse(json);
      if (heartbeat.success) {
        registry.heartbeat(heartbeat.data.deviceId);
      }
    } catch {
      socket.close(1003, "Invalid message");
    }
  });

  socket.on("close", () => registry.unregister(socket));
});

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    response.status(500).json({ ok: false, error: toAgentError(error) });
  },
);

server.listen(config.port, config.host, () => {
  console.log(`Personal MCP Gateway listening on http://${config.host}:${config.port}`);
  console.log("MCP endpoint: POST /mcp");
});
