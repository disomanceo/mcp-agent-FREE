import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const [, , toolName, rawArgs = "{}", endpoint = "http://127.0.0.1:8787/mcp"] = process.argv;

if (!toolName) {
  console.error(
    'Usage: npm run mcp:call -- <tool_name> \'{"project":"SampleProject"}\' [endpoint]',
  );
  process.exit(1);
}

let args;
try {
  args = JSON.parse(rawArgs);
} catch {
  console.error("Tool args must be valid JSON.");
  process.exit(1);
}

const client = new Client({ name: "personal-mcp-agent-cli", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(new URL(endpoint));

try {
  await client.connect(transport);
  const result = await client.request(
    {
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    },
    CallToolResultSchema,
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await transport.close();
}
