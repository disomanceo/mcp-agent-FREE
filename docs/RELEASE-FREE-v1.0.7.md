# Personal MCP Agent FREE v1.0.7

รุ่นแจกฟรีที่แยกจากสายพัฒนาหลัก โดยใช้ Personal MCP Agent v1.0.7 เป็นฐาน

## ไฟล์ดาวน์โหลด

- `PersonalMCPAgent-FREE-Setup-1.0.7.exe` — แนะนำสำหรับผู้ใช้ทั่วไป
- `PersonalMCPAgent-FREE-Installer-1.0.7.cmd` — ตัวติดตั้งสำรองเมื่อ EXE ถูก Windows บล็อก

## สิ่งที่ตัวติดตั้งจัดการให้

- ตรวจ Node.js 22+
- ตรวจ npm
- ตรวจ/ติดตั้ง Git for Windows
- ติดตั้ง npm dependencies
- build Personal MCP Agent
- ตรวจ/ติดตั้ง ngrok
- รองรับ Cloudflare Quick Tunnel fallback
- สร้าง `D:\AI-Workspace`
- สร้าง shortcut Start / Stop / Repair / Doctor / Update

## ตำแหน่งติดตั้ง

```text
D:\mcp-agent-FREE
```

Workspace:

```text
D:\AI-Workspace
```

## ผลการตรวจสอบก่อน Release

- npm install: ผ่าน, 0 vulnerabilities
- typecheck: ผ่าน
- tests: ผ่าน 30/30
- build: ผ่าน
- lint: ผ่าน
- smoke: ผ่าน
- PowerShell syntax: ผ่าน
- Inno Setup compile: ผ่าน

## หมายเหตุ Windows Security

ไฟล์ EXE ยังไม่ได้ลงนามด้วย commercial code-signing certificate จึงอาจมี Windows SmartScreen / Smart App Control warning บางเครื่อง หาก EXE ถูกบล็อกให้ใช้ไฟล์ CMD จาก Release แทน และตรวจว่าดาวน์โหลดจาก repository `disomanceo/mcp-agent-FREE` เท่านั้น

## คู่มือ

อ่าน `docs/INSTALL-FREE-TH.md` สำหรับขั้นตอนติดตั้งและใช้งานแบบละเอียด
