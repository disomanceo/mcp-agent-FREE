# Connect from ChatGPT

Goal: let ChatGPT call this machine through MCP tools.

## What is required

Official OpenAI documentation says ChatGPT Developer mode supports MCP tools, including read and write tools, but this is higher risk and should be used only by developers who understand the safety tradeoffs. ChatGPT can connect to remote MCP servers that support Streamable HTTP or SSE.

Because this Gateway runs on your Windows machine, ChatGPT cannot call `http://127.0.0.1:8787/mcp` directly from the web. You need one of these:

1. Secure MCP Tunnel from OpenAI, recommended for private local MCP servers.
2. A public HTTPS forwarding endpoint for local testing.
3. A persistent cloud host that can keep the Gateway connected to Desktop Agent WebSocket.

Vercel Functions are not enough for the Desktop Agent WebSocket relay by themselves.

## Local preparation

```powershell
cd D:\personal-mcp-agent
npm install
npm run setup:local
npm run mode:work
npm run doctor
npm run build
```

Close old Gateway or Agent terminals before starting the updated version. Old running processes may not expose newly added tools like `write_file`.

Easy mode: open everything in one terminal.

```powershell
cd D:\personal-mcp-agent
npm run start:chatgpt
```

Or double-click:

```text
D:\personal-mcp-agent\Personal MCP Agent.cmd
```

The launcher starts Gateway, Desktop Agent, and ngrok, then prints the `MCP URL`.
If it says port `8787` is already in use, close old Gateway/Agent terminals and run the launcher again.

Manual mode: open two terminals.

Terminal 1:

```powershell
cd D:\personal-mcp-agent
npm run dev:gateway
```

Terminal 2:

```powershell
cd D:\personal-mcp-agent
npm run dev:agent
```

Check:

```powershell
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/api/devices
```

Terminal 3, for ngrok testing:

```powershell
cd D:\personal-mcp-agent
npm run tunnel:ngrok
```

Copy the `Forwarding` HTTPS URL from ngrok and append `/mcp`.

Example:

```text
https://example.ngrok-free.app/mcp
```

## Switch projects

```powershell
cd D:\personal-mcp-agent
npm run project:list
npm run project:set -- TravelTank300
```

Restart the launcher after changing `DEFAULT_PROJECT`. Most tools accept `project`, but if ChatGPT omits it, the agent uses `DEFAULT_PROJECT`.

## Test write locally before connecting ChatGPT

```powershell
cd D:\personal-mcp-agent
npm run mcp:call -- write_file "{\"project\":\"TravelTank300\",\"path\":\"CHATGPT_AGENT_TEST.md\",\"content\":\"# ChatGPT Agent Test`n`nwrite_file works.`n\"}"
npm run mcp:call -- read_file "{\"project\":\"TravelTank300\",\"path\":\"CHATGPT_AGENT_TEST.md\"}"
```

Or run a temporary write/read cleanup demo:

```powershell
npm run demo:work -- TravelTank300
```

To return to read-only mode:

```powershell
npm run mode:safe
```

Restart Gateway and Agent after changing mode.

## Add to ChatGPT Developer mode

### Option A: Secure MCP Tunnel

Create or select a tunnel in OpenAI Platform tunnel settings. You need:

- `tunnel_id`
- runtime API key for `tunnel-client`
- `tunnel-client` downloaded from OpenAI Platform tunnel settings or the latest public release

With Gateway running locally at `http://127.0.0.1:8787/mcp`, initialize an HTTP MCP profile:

```powershell
setx CONTROL_PLANE_API_KEY "sk-..."
tunnel-client init --profile personal-mcp-agent --tunnel-id tunnel_0123456789abcdef0123456789abcdef --mcp-server-url http://127.0.0.1:8787/mcp
tunnel-client doctor --profile personal-mcp-agent --explain
tunnel-client run --profile personal-mcp-agent
```

Keep `tunnel-client run` open while using ChatGPT.

### Option B: Public HTTPS endpoint for testing

Use an HTTPS forwarding service that points to:

```text
http://127.0.0.1:8787/mcp
```

Then use the public HTTPS URL ending in `/mcp` when adding the MCP server in ChatGPT.

### Create the app in ChatGPT

In ChatGPT web:

1. Open Settings.
2. Open Security and login.
3. Turn on Developer mode.
4. Go to ChatGPT Plugins.
5. Press the plus button.
6. Create a developer-mode app.
7. For connection, use either:
   - Secure MCP Tunnel and select/enter the tunnel id.
   - A public HTTPS endpoint ending in `/mcp`.
8. Refresh the app metadata and confirm these tools are visible:
   - `get_devices`
   - `get_projects`
   - `list_files`
   - `read_file`
   - `write_file`

- `git_status`
- `git_diff`
- `git_stage`
- `git_commit`
- `git_push`
- `git_pull_ff_only`
- `git_log`
- `git_diff_staged`
- `npm_lint`
- `npm_install`
- `npm_build`
- `npm_test`

## Prompt pattern in ChatGPT

Use a direct prompt:

```text
Use the Personal MCP Agent app only.
Project: TravelTank300
First call read_file for package.json.
Then make a small change using write_file.
Then run npm_lint and npm_build.
Do not use browser or other tools.
```

## Safety rules

- Keep `WORKSPACE_ROOT=D:\AI-Workspace`.
- Put only projects you want ChatGPT to access under `D:\AI-Workspace`.
- `WORK` mode can write files inside allowed projects.
- Git tools are controlled: no force push, no arbitrary shell, no custom push destination, no reset, no rebase.
- Switch back to `SAFE` mode when you only want read/build access.

## Current local status

This repository has verified:

- `write_file` works in `WORK` mode.
- `write_file` is rejected in `SAFE` mode.
- Writing `.env` secret files is rejected.
- Path traversal remains rejected.
