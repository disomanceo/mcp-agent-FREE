# ทดลองใช้งานจริง

เอกสารนี้ใช้กับการรันแบบ local บน Windows ก่อน ส่วน Vercel ตอนนี้เป็นหน้า project status เพราะ Gateway ของเฟสแรกต้องใช้ WebSocket connection แบบ long-lived กับ Desktop Agent

## 1. เตรียมเครื่อง

```powershell
cd D:\personal-mcp-agent
npm install
npm run setup:local
npm run doctor
```

`setup:local` จะสร้าง:

- `.env` พร้อม token แบบสุ่ม
- `D:\AI-Workspace`
- `D:\AI-Workspace\SampleProject`

## 2. เปิด Gateway

เปิด PowerShell หน้าต่างที่ 1:

```powershell
cd D:\personal-mcp-agent
npm run dev:gateway
```

ควรเห็นประมาณนี้:

```text
Personal MCP Gateway listening on http://127.0.0.1:8787
MCP endpoint: POST /mcp
```

## 3. เปิด Desktop Agent

เปิด PowerShell หน้าต่างที่ 2:

```powershell
cd D:\personal-mcp-agent
npm run dev:agent
```

ควรเห็น:

```text
Personal MCP Desktop Agent
Status: Connecting
Workspace: D:\AI-Workspace
Mode: SAFE
Status: Connected
```

## 4. ตรวจว่า Agent ต่อแล้ว

เปิด PowerShell หน้าต่างที่ 3:

```powershell
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/api/devices
```

## 5. ทดลองเรียก MCP tools

```powershell
npm run mcp:call -- get_projects "{}"
npm run mcp:call -- list_files "{\"project\":\"SampleProject\"}"
npm run mcp:call -- read_file "{\"project\":\"SampleProject\",\"path\":\"README.md\"}"
npm run mcp:call -- npm_build "{\"project\":\"SampleProject\"}"
npm run mcp:call -- npm_test "{\"project\":\"SampleProject\"}"
```

ถ้าต้องการดู git status ให้ทำให้ sample project เป็น git repo ก่อน:

```powershell
cd D:\AI-Workspace\SampleProject
git init
git add README.md package.json
cd D:\personal-mcp-agent
npm run mcp:call -- git_status "{\"project\":\"SampleProject\"}"
```

## 6. ทดสอบครบชุดอัตโนมัติ

```powershell
npm run smoke
```

หรือทดลองแบบเปิด Gateway + Agent ชั่วคราว แล้วเรียก tools กับ `SampleProject`:

```powershell
npm run demo:local
```

ตรวจโปรเจกต์จริงด้วยชื่อโฟลเดอร์ใต้ `D:\AI-Workspace`:

```powershell
npm run demo:local -- TravelTank300 package.json
```

## ใช้งานกับโปรเจกต์จริง

วางหรือ clone โปรเจกต์จริงไว้ใต้:

```text
D:\AI-Workspace
```

ตัวอย่าง:

```powershell
cd D:\AI-Workspace
git clone https://github.com/your-name/your-project.git
cd D:\personal-mcp-agent
npm run mcp:call -- list_files "{\"project\":\"your-project\"}"
```

Agent จะปฏิเสธ path ที่ออกนอก `WORKSPACE_ROOT` เช่น `../secret`, `C:\Windows`, หรือ `\\server\share`
