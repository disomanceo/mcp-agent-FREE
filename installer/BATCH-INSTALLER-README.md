# Personal MCP Agent Batch Installer

Use this when Windows Smart App Control blocks the unsigned `.exe` setup file.

## Install

Double-click:

```text
Install-Personal-MCP-Agent.cmd
```

Or right-click it and choose:

```text
Run as administrator
```

The script downloads and runs the official `install.ps1` from GitHub. It installs/checks Node.js, Git, cloudflared, ngrok, npm dependencies, local config, WORK mode, and the Desktop shortcut.

## Notes

- Requires internet access.
- Uses `winget` to install missing prerequisites.
- If Windows does not have `winget`, install Microsoft App Installer first.
- ngrok authtoken is not embedded because it is account-specific.
