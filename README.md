# Personal MCP Agent FREE

เวอร์ชันแจกฟรีของ **Personal MCP Agent** สำหรับเชื่อม ChatGPT ผ่าน MCP เข้ากับเครื่อง Windows เพื่อช่วยอ่านโปรเจกต์ ตรวจสอบไฟล์ ดูสถานะ Git และทำงานกับโปรเจกต์ภายใต้โฟลเดอร์ที่กำหนด

> ฐานซอร์สของรุ่น FREE นี้: **Personal MCP Agent v1.0.7**

## จุดประสงค์

โปรเจกต์นี้จัดทำเป็นรุ่นฟรีสำหรับผู้ที่ต้องการทดลองใช้งาน Personal MCP Agent และเรียนรู้การเชื่อมต่อ ChatGPT กับเครื่องคอมพิวเตอร์ของตนเองผ่าน MCP โดยเน้นการใช้งานที่ควบคุมขอบเขตได้และตรวจสอบการทำงานได้

## Architecture

```text
ChatGPT -> MCP over HTTPS -> Gateway -> Secure WebSocket -> Desktop Agent -> WORKSPACE_ROOT
```

ส่วนประกอบหลัก:

- `apps/gateway` — Gateway สำหรับ MCP/HTTP/WebSocket
- `apps/desktop-agent` — Agent บนเครื่อง Windows
- `packages/shared` — path safety, permission, command wrapper และ audit
- `packages/protocol` — schema และ protocol ที่ใช้สื่อสารกัน

## ความสามารถหลักของ v1.0.7

- เชื่อม ChatGPT กับ Desktop Agent ผ่าน MCP
- อ่านรายการโปรเจกต์ใน `WORKSPACE_ROOT`
- อ่านไฟล์ text ภายในโปรเจกต์
- ตรวจสอบ Git status / diff / log
- รองรับ controlled WORK mode สำหรับงานที่อนุญาต
- รัน build / test / lint ที่กำหนดไว้
- รองรับ ngrok และมี Cloudflare Quick Tunnel fallback ในกรณีที่ ngrok ใช้งานไม่ได้
- มีคำสั่ง Start / Stop / Update / Repair / Doctor สำหรับ Windows
- มี GUI สำหรับช่วยเปิดใช้งาน Agent

## ดาวน์โหลดและติดตั้ง

ไปที่ GitHub Releases ของ repository `disomanceo/mcp-agent-FREE` แล้วเลือกไฟล์ตามต้องการ:

- `PersonalMCPAgent-FREE-Setup-1.0.7.exe` — แนะนำสำหรับผู้ใช้ทั่วไป
- `PersonalMCPAgent-FREE-Installer-1.0.7.cmd` — ตัวสำรองเมื่อ Windows บล็อก EXE หรือเมื่อต้องการติดตั้งผ่าน script

คู่มือภาษาไทยแบบละเอียด: [docs/INSTALL-FREE-TH.md](docs/INSTALL-FREE-TH.md)

ตัวติดตั้งจะตรวจ Node.js 22+, npm, Git, ngrok และ Cloudflare fallback ตามความจำเป็น โดยติดตั้งโปรแกรมเริ่มต้นที่:

```text
D:\mcp-agent-FREE
```

และใช้พื้นที่โปรเจกต์งานที่:

```text
D:\AI-Workspace
```

## Requirements

- Windows 10/11 64-bit
- Node.js 22+
- npm 10+
- Git
- อินเทอร์เน็ตสำหรับการเชื่อมต่อ ChatGPT และ tunnel
- ngrok แนะนำสำหรับ MCP URL; มี Cloudflare fallback ใน v1.0.7

ถ้าใช้ตัว Installer และเครื่องมี `winget` ระบบจะพยายามติดตั้งส่วนที่ขาดให้อัตโนมัติ

## ติดตั้งสำหรับนักพัฒนา

```powershell
git clone https://github.com/disomanceo/mcp-agent-FREE.git
cd mcp-agent-FREE
npm install
Copy-Item .env.example .env
```

จากนั้นแก้ `.env` ให้ตรงกับเครื่องของคุณ เช่น

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

> ห้ามนำ token หรือ secret จริง commit ขึ้น GitHub

## เปิดใช้งาน

สามารถใช้ไฟล์คำสั่งบน Windows ที่อยู่ในโปรเจกต์ เช่น

- `Personal MCP Agent.cmd`
- `Stop Personal MCP Agent.cmd`
- `Repair Personal MCP Agent.cmd`
- `Run Doctor.cmd`

หรือเปิดผ่าน npm scripts ตามที่กำหนดใน `package.json`

## ตรวจสอบระบบ

```powershell
npm run typecheck
npm test
npm run build
npm run lint
npm run smoke
```

## ความปลอดภัย

Personal MCP Agent ถูกออกแบบให้จำกัดการเข้าถึงให้อยู่ภายใต้ `WORKSPACE_ROOT` และมีการแบ่งระดับ permission เพื่อช่วยลดความเสี่ยงจากการเข้าถึงไฟล์หรือคำสั่งนอกขอบเขต

ก่อนเปิด WORK mode หรืออนุญาตคำสั่งที่แก้ไขไฟล์ ควรตรวจสอบโปรเจกต์และคำสั่งทุกครั้ง โดยเฉพาะเมื่อใช้งานกับข้อมูลสำคัญ

## FREE Edition

Repository นี้ตั้งใจใช้เป็น **รุ่นแจกฟรี** โดยยึดฐานความสามารถของ **v1.0.7** และจะพัฒนาเฉพาะส่วนที่เหมาะกับรุ่น FREE เช่น

- ความง่ายในการติดตั้ง
- ความเสถียรในการเชื่อมต่อ
- UX/UI สำหรับผู้ใช้ทั่วไป
- คู่มือภาษาไทย
- การตรวจสอบและซ่อมแซมระบบอัตโนมัติ

ฟีเจอร์ขั้นสูงจากสายพัฒนารุ่นใหม่อาจไม่ถูกนำเข้ามาทั้งหมด เพื่อให้รุ่น FREE ยังคงเรียบง่ายและดูแลได้ง่าย

## เอกสารเพิ่มเติม

- `docs/INSTALL-FREE-TH.md` — คู่มือติดตั้ง FREE v1.0.7
- `docs/QUICKSTART-TH.md` — คู่มือเริ่มต้นภาษาไทย
- `docs/CHATGPT.md` — แนวทางเชื่อมต่อกับ ChatGPT
- `docs/USAGE.md` — ตัวอย่างการใช้งาน
- `docs/INSTALLER.md` — รายละเอียดตัวติดตั้ง
- `TODO.md` — แผนพัฒนารุ่น FREE

## Repository

```text
https://github.com/disomanceo/mcp-agent-FREE
```

## Version

Current FREE baseline: **v1.0.7**
