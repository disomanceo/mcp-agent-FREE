# Windows Installer

Use this when you want a simple app-like installation instead of manually cloning the repository.

## One-line install

Open PowerShell as a normal user:

```powershell
irm https://raw.githubusercontent.com/disomanceo/personal-mcp-agent/master/install.ps1 | iex
```

The installer will:

- clone or update `D:\personal-mcp-agent`
- install npm dependencies
- create `.env`
- create `D:\AI-Workspace`
- set `PERMISSION_MODE=WORK`
- check/install ngrok when possible
- create a Desktop shortcut named `Personal MCP Agent`

## Start the app

Double-click:

```text
Personal MCP Agent
```

Or run:

```powershell
cd D:\personal-mcp-agent
npm run start:chatgpt
```

The launcher prints:

```text
MCP URL: https://xxxxx.ngrok-free.app/mcp
```

Use that URL in ChatGPT.

## Easy Thai guide

For a simple step-by-step guide after installation, read:

[QUICKSTART-TH.md](QUICKSTART-TH.md)

## Change project

```powershell
cd D:\personal-mcp-agent
npm run project:list
npm run project:set -- TravelTank300
```

Restart the launcher after changing projects.

## Update

```powershell
irm https://raw.githubusercontent.com/disomanceo/personal-mcp-agent/master/update.ps1 | iex
```

## Custom install path

```powershell
irm https://raw.githubusercontent.com/disomanceo/personal-mcp-agent/master/install.ps1 -OutFile "$env:TEMP\install-personal-mcp-agent.ps1"
powershell -ExecutionPolicy Bypass -File "$env:TEMP\install-personal-mcp-agent.ps1" -InstallDir "C:\Tools\personal-mcp-agent" -WorkspaceRoot "D:\AI-Workspace"
```
