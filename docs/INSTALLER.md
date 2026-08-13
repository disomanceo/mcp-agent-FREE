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
- configure ngrok automatically when `NGROK_AUTHTOKEN` is set
- create a Desktop shortcut named `Personal MCP Agent`

ngrok requires an account token before it can create a public URL. Get your token from:

```text
https://dashboard.ngrok.com/get-started/your-authtoken
```

Then either run:

```powershell
ngrok config add-authtoken YOUR_TOKEN_HERE
```

Or install with:

```powershell
$env:NGROK_AUTHTOKEN="YOUR_TOKEN_HERE"
irm https://raw.githubusercontent.com/disomanceo/personal-mcp-agent/master/install.ps1 | iex
```

## Setup.exe installer

For non-technical users, the easiest option is the Windows setup file from GitHub Releases:

[Latest release](https://github.com/disomanceo/personal-mcp-agent/releases/latest)

Download the file named like:

```text
PersonalMCPAgent-Setup-x.x.x.exe
```

Then double-click it and follow the installer. The setup creates the same Desktop shortcut named `Personal MCP Agent`.

Developers can build the setup file locally with:

```powershell
npm run installer:build
```

This requires Inno Setup:

```powershell
winget install --id JRSoftware.InnoSetup -e
```

## Start the app

Double-click:

```text
Personal MCP Agent
```

Or run:

```powershell
cd D:\personal-mcp-agent
npm run start:gui
```

The GUI opens in your browser. Click `Start`, then copy the MCP URL shown on screen.
The current version is shown in the left sidebar.

The left sidebar opens real views:

- Home: start/stop, MCP URL, active project
- Projects: project list, type, description, git status, latest commit
- Git: beginner-friendly commit/push workflow without typing PowerShell
- Deploy: Vercel production deploy and Google Apps Script clasp deploy from the Git view
- Logs: launcher/gateway/agent/ngrok logs for the current session
- Settings: version, workspace, active project, permission mode, ports

The old terminal launcher is still available:

```powershell
cd D:\personal-mcp-agent
npm run start:chatgpt
```

Both launchers show:

```text
MCP URL: https://xxxxx.ngrok-free.app/mcp
```

Use that URL in ChatGPT.

## Easy Thai guide

For a simple step-by-step guide after installation, read:

[QUICKSTART-TH.md](QUICKSTART-TH.md)

## Change project

In the GUI, choose a project from the dropdown and click `Set Active Project`.

You can also paste a URL into `Add Project from URL`.

Supported URL types:

- GitHub repository: cloned into `D:\AI-Workspace`
- Vercel project: creates a linked project wrapper with metadata
- Google Apps Script project: creates a linked project wrapper with Script ID and clasp instructions

Or use PowerShell:

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
