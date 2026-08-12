# Personal MCP Remote Agent

Personal MCP Remote Agent คือ MVP สำหรับให้ ChatGPT เชื่อมผ่าน MCP ไปยัง Gateway แล้วส่งคำสั่งแบบปลอดภัยไปยัง Desktop Agent บน Windows เครื่องนี้ โดยรอบแรกเปิดเฉพาะโหมด `SAFE`: อ่านโปรเจกต์, อ่านไฟล์ text, ดู git status/diff, และรัน `npm run build` / `npm test` จากโปรเจกต์ที่อยู่ใน `WORKSPACE_ROOT` เท่านั้น

## Architecture

```text
ChatGPT -> MCP over HTTPS -> Gateway -> Secure WebSocket -> Desktop Agent -> WORKSPACE_ROOT
```

- `apps/gateway`: HTTP server, WebSocket server, MCP endpoint
- `apps/desktop-agent`: CLI agent ที่เชื่อม Gateway และ execute tools
- `packages/shared`: path safety, permission, command wrapper, audit log
- `packages/protocol`: Zod schemas สำหรับ message และ tool args

## Requirements

- Node.js 22+
- npm 10+
- Git ใน PATH

## Setup บน Windows

```powershell
cd personal-mcp-agent
npm install
Copy-Item .env.example .env
```

แก้ `.env`:

```env
GATEWAY_PORT=8787
GATEWAY_HOST=127.0.0.1
GATEWAY_URL=ws://127.0.0.1:8787/agent
AGENT_TOKEN=replace-with-a-long-random-token
WORKSPACE_ROOT=D:\AI-Workspace
DEVICE_ID=personal-windows-agent
DEVICE_NAME=Windows Desktop Agent
PERMISSION_MODE=SAFE
```

สร้าง `WORKSPACE_ROOT` และวางโปรเจกต์ที่ต้องการให้ Agent อ่านไว้ใต้ folder นี้ ห้ามใช้ token จริงใน source code

## Run

เปิด Gateway:

```powershell
npm run dev:gateway
```

ตรวจ health:

```powershell
curl http://127.0.0.1:8787/health
```

เปิด Desktop Agent อีก terminal:

```powershell
npm run dev:agent
```

ดู Agent ที่เชื่อมแล้ว:

```powershell
curl http://127.0.0.1:8787/api/devices
```

MCP endpoint อยู่ที่:

```text
POST http://127.0.0.1:8787/mcp
```

## MCP Tools

- `get_devices`
- `get_projects`
- `list_files`
- `read_file`
- `git_status`
- `git_diff`
- `npm_build`
- `npm_test`

ถ้ามี Agent มากกว่า 1 เครื่อง ให้ส่ง `deviceId` มากับ tool arguments

## Security Limitations

- Agent อ่านหรือรันคำสั่งได้เฉพาะ path ใต้ `WORKSPACE_ROOT`
- ป้องกัน `../`, absolute path, UNC path, network path และ symlink escape เท่าที่ตรวจได้ใน MVP
- ไม่มี `write_file`, `delete_file`, arbitrary shell, git commit, git push, remote mouse/keyboard/screen control
- `WORK` และ `DANGEROUS` มีไว้เป็น architecture placeholder แต่ยังไม่เปิดใช้งาน

## Verify

```powershell
npm run typecheck
npm test
npm run build
npm run smoke
```

## ทดลองใช้งานจริง

ดูขั้นตอนแบบจับมือทำที่ [docs/USAGE.md](docs/USAGE.md)

## เชื่อมกับ ChatGPT

ดูขั้นตอนเชื่อม ChatGPT Developer mode / MCP ที่ [docs/CHATGPT.md](docs/CHATGPT.md)

เปิด Gateway + Agent + ngrok ในหน้าต่างเดียว:

```powershell
cd D:\personal-mcp-agent
npm run start:chatgpt
```

หรือดับเบิลคลิก `Personal MCP Agent.cmd`

## Windows App-like Installer

ติดตั้งจาก GitHub แบบคำสั่งเดียว:

```powershell
irm https://raw.githubusercontent.com/disomanceo/personal-mcp-agent/master/install.ps1 | iex
```

หลังติดตั้งจะมี shortcut ชื่อ `Personal MCP Agent` บน Desktop ให้ดับเบิลคลิกเปิดใช้งานได้ทันที

รายละเอียดเพิ่มเติม: [docs/INSTALLER.md](docs/INSTALLER.md)

## Phase 1 Status

Phase 1 is complete when `typecheck`, `test`, `build`, `lint`, and `smoke` all pass. The first commit and any push should happen only after user approval.

## Vercel Project

This repository is linked to a new Vercel project:

```text
Vercel Project: disomanceo/personal-mcp-agent
GitHub Repo: https://github.com/disomanceo/personal-mcp-agent
Production URL: https://personal-mcp-agent.vercel.app
```

Important: the Phase 1 Gateway uses a long-lived WebSocket connection to the Desktop Agent. Vercel Functions are not the right runtime for that WebSocket relay by themselves. For full cloud operation, run the Gateway on a persistent WebSocket-capable host, or use Vercel for HTTP/MCP-facing pieces and a separate relay service for Desktop Agent WebSockets.
