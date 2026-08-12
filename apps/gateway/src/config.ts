import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const configSchema = z.object({
  port: z.coerce.number().int().positive().default(8787),
  host: z.string().min(1).default("127.0.0.1"),
  agentToken: z.string().min(16, "AGENT_TOKEN must be at least 16 characters"),
  requestTimeoutMs: z.coerce.number().int().positive().default(310_000),
});

export function loadGatewayConfig() {
  return configSchema.parse({
    port: process.env.GATEWAY_PORT,
    host: process.env.GATEWAY_HOST,
    agentToken: process.env.AGENT_TOKEN,
    requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS,
  });
}
