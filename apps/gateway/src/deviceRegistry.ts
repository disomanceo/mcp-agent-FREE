import crypto from "node:crypto";
import WebSocket from "ws";
import {
  AgentHello,
  AgentRequest,
  AgentResponse,
  agentResponseSchema,
} from "@personal-mcp-agent/protocol";
import { AgentError } from "@personal-mcp-agent/shared";

export type DeviceRecord = AgentHello & {
  socket: WebSocket;
  lastHeartbeatAt: string;
};

export class DeviceRegistry {
  private readonly devices = new Map<string, DeviceRecord>();
  private readonly pending = new Map<
    string,
    {
      resolve: (response: AgentResponse) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();

  register(hello: AgentHello, socket: WebSocket): void {
    this.devices.set(hello.deviceId, {
      ...hello,
      socket,
      lastHeartbeatAt: new Date().toISOString(),
    });
  }

  heartbeat(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastHeartbeatAt = new Date().toISOString();
    }
  }

  unregister(socket: WebSocket): void {
    for (const [deviceId, device] of this.devices.entries()) {
      if (device.socket === socket) {
        this.devices.delete(deviceId);
      }
    }
  }

  listSafeDevices() {
    return [...this.devices.values()].map((device) => ({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      agentVersion: device.agentVersion,
      workspaceRoot: device.workspaceRoot,
      defaultProject: device.defaultProject,
      permissionMode: device.permissionMode,
      connectedAt: device.connectedAt,
      lastHeartbeatAt: device.lastHeartbeatAt,
      online: device.socket.readyState === WebSocket.OPEN,
    }));
  }

  select(deviceId?: string): DeviceRecord {
    if (deviceId) {
      const device = this.devices.get(deviceId);
      if (!device || device.socket.readyState !== WebSocket.OPEN) {
        throw new AgentError("DEVICE_OFFLINE", "Selected device is offline");
      }
      return device;
    }

    const online = [...this.devices.values()].filter(
      (device) => device.socket.readyState === WebSocket.OPEN,
    );
    if (online.length !== 1) {
      throw new AgentError(
        "DEVICE_OFFLINE",
        "Specify deviceId when zero or multiple devices are online",
      );
    }
    return online[0]!;
  }

  async request(
    deviceId: string | undefined,
    tool: string,
    args: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    const device = this.select(deviceId);
    const id = crypto.randomUUID();
    const message: AgentRequest = { id, type: "tool_request", tool, args };

    const response = await new Promise<AgentResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new AgentError("COMMAND_TIMEOUT", "Agent request timed out"));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      device.socket.send(JSON.stringify(message));
    });

    if (!response.ok) {
      throw new AgentError(
        (response.error?.code as any) ?? "COMMAND_FAILED",
        response.error?.message ?? "Tool failed",
      );
    }

    return response.data;
  }

  handleAgentResponse(raw: unknown): boolean {
    const parsed = agentResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return false;
    }

    const pending = this.pending.get(parsed.data.id);
    if (!pending) {
      return true;
    }

    clearTimeout(pending.timer);
    this.pending.delete(parsed.data.id);
    pending.resolve(parsed.data);
    return true;
  }
}
