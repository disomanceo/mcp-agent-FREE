# คู่มือติดตั้ง Personal MCP Agent FREE v1.0.7

คู่มือนี้สำหรับ Personal MCP Agent FREE ซึ่งใช้ฐานโค้ด Personal MCP Agent v1.0.7

Repository: `https://github.com/disomanceo/mcp-agent-FREE`

## เลือกไฟล์ติดตั้งแบบไหนดี

ใน GitHub Release จะมีไฟล์หลัก 2 แบบ

### 1. PersonalMCPAgent-FREE-Setup-1.0.7.exe

แนะนำสำหรับผู้ใช้ทั่วไป

- ดับเบิลคลิกติดตั้งได้เลย
- ติดตั้งไฟล์โปรแกรมไว้ที่ `D:\mcp-agent-FREE`
- ตรวจ Node.js และ Git
- ติดตั้ง npm dependencies
- build โปรแกรม
- ตรวจ/ติดตั้ง ngrok
- มี Cloudflare Quick Tunnel เป็น fallback ถ้า ngrok ใช้งานไม่ได้
- สร้าง shortcut สำหรับ Start / Stop / Repair / Doctor

### 2. PersonalMCPAgent-FREE-Installer-1.0.7.cmd

ใช้เมื่อ `.exe` ถูก Windows Smart App Control / SmartScreen บล็อก หรืออยากใช้ตัวติดตั้งแบบ script

- ดาวน์โหลด `install.ps1` จาก repository FREE โดยตรง
- ตรวจและติดตั้งส่วนประกอบที่จำเป็น
- clone โปรแกรมลง `D:\mcp-agent-FREE`
- เหมาะสำหรับการซ่อมหรือติดตั้งใหม่

## สิ่งที่จำเป็นสำหรับ v1.0.7

ตัวติดตั้งจะพยายามตรวจและติดตั้งให้อัตโนมัติ แต่เครื่องต้องมี Windows และอินเทอร์เน็ต

### จำเป็น

1. Windows 10 หรือ Windows 11 แบบ 64-bit
2. PowerShell ซึ่งมีมากับ Windows
3. Node.js 22 หรือใหม่กว่า
4. npm ซึ่งติดมากับ Node.js
5. Git for Windows
6. อินเทอร์เน็ต
7. ChatGPT ที่สามารถเพิ่ม MCP / custom connector ได้

### สำหรับการเชื่อม MCP ผ่านอินเทอร์เน็ต

แนะนำให้มี

- ngrok รุ่นใหม่ และบัญชี ngrok สำหรับ authtoken

ตัว v1.0.7 มี Cloudflare Quick Tunnel fallback ถ้า ngrok ถูกบล็อกหรือเปิดไม่ได้ ดังนั้น cloudflared อาจถูกติดตั้งให้อัตโนมัติด้วย

## สิ่งที่ไม่ต้องติดตั้งเองก่อน ถ้าใช้ตัว Installer

ถ้าเครื่องมี `winget` ตัวติดตั้งจะพยายามติดตั้งให้อัตโนมัติ

- Node.js LTS
- Git for Windows
- ngrok
- cloudflared
- npm dependencies ของ Personal MCP Agent

ถ้า `winget` ไม่มี ให้ติดตั้ง Microsoft App Installer จาก Microsoft Store ก่อน แล้วเปิดตัวติดตั้งอีกครั้ง

## ขั้นตอนติดตั้งแบบ .exe

1. ไปที่ GitHub Releases ของ `mcp-agent-FREE`
2. ดาวน์โหลด `PersonalMCPAgent-FREE-Setup-1.0.7.exe`
3. ดับเบิลคลิกไฟล์
4. ถ้า Windows แสดงคำเตือน ให้ตรวจชื่อไฟล์และแหล่งที่มาก่อนอนุญาต
5. ติดตั้งตามหน้าจอ
6. รอขั้นตอน npm install และ build จนเสร็จ
7. หลังติดตั้งจะมี shortcut บน Desktop
8. เปิด `Personal MCP Agent FREE`

ตำแหน่งโปรแกรมเริ่มต้น

```text
D:\mcp-agent-FREE
```

ตำแหน่งโปรเจกต์งานของผู้ใช้

```text
D:\AI-Workspace
```

## ขั้นตอนติดตั้งแบบ .cmd

1. ดาวน์โหลด `PersonalMCPAgent-FREE-Installer-1.0.7.cmd`
2. คลิกขวาและเลือก Run หรือดับเบิลคลิก
3. ตัวติดตั้งจะดาวน์โหลด `install.ps1` ของรุ่น FREE
4. ระบบตรวจ Node.js, Git, ngrok และ dependency
5. ระบบ clone/ติดตั้งโปรแกรมที่ `D:\mcp-agent-FREE`
6. เมื่อเสร็จให้เปิด shortcut บน Desktop

## ตั้งค่า ngrok

หากยังไม่มีบัญชี ngrok ให้สมัครบัญชีและคัดลอก authtoken จากหน้า dashboard ของ ngrok

จากนั้นเปิด Command Prompt หรือ PowerShell และรัน

```powershell
ngrok config add-authtoken YOUR_TOKEN_HERE
```

ไม่ควรส่ง authtoken ให้ผู้อื่น และไม่ควร commit token ลง GitHub

## เปิดใช้งานครั้งแรก

1. เปิด `Personal MCP Agent FREE`
2. หน้า GUI จะเปิดใน browser
3. เลือกหรือเพิ่มโปรเจกต์ที่อยู่ใต้ `D:\AI-Workspace`
4. กด Start
5. รอจนระบบแสดง MCP URL ที่ลงท้ายด้วย `/mcp`
6. กด Copy
7. นำ URL ไปเพิ่มใน ChatGPT MCP / custom connector

ตัวอย่าง

```text
https://xxxxx.ngrok-free.app/mcp
```

## วิธีทดสอบว่าเชื่อมสำเร็จ

หลังเพิ่ม MCP ใน ChatGPT แล้ว ลองสั่ง

```text
ใช้ Home MCP Agent ช่วยแสดงรายชื่อโปรเจกต์ในเครื่องให้หน่อย
```

ถ้า ChatGPT เรียก Agent ได้ ระบบควรเห็นโปรเจกต์ใน `D:\AI-Workspace`

## Shortcut ที่ติดตั้งให้

- `Personal MCP Agent FREE` — เปิดโปรแกรม
- `Stop Personal MCP Agent` — หยุด Agent และ tunnel
- `Repair Personal MCP Agent` — ซ่อม dependency และตรวจระบบ
- `Run Doctor` — ตรวจสภาพแวดล้อม
- `Update Personal MCP Agent` — อัปเดตจาก repository FREE

## ถ้า .exe เปิดไม่ได้

ให้ใช้ไฟล์ `.cmd` จาก Release แทน เพราะ Windows บางเครื่องอาจบล็อกไฟล์ `.exe` ที่ยังไม่มี code-signing certificate

หากทั้ง `.exe` และ `.cmd` ถูกบล็อก ให้ตรวจ Windows Security / Smart App Control และยืนยันว่าไฟล์ถูกดาวน์โหลดจาก repository `disomanceo/mcp-agent-FREE` เท่านั้น

## ถ้า Start ไม่ผ่าน

ให้ลองตามลำดับ

1. เปิด `Run Doctor`
2. เปิด `Repair Personal MCP Agent`
3. ตรวจว่า Node.js เป็น 22+
4. ตรวจว่า Git ใช้งานได้
5. ตรวจว่า ngrok มี authtoken
6. ถ้า ngrok ถูกบล็อก ให้ระบบใช้ Cloudflare fallback
7. ปิด Agent เดิมด้วย `Stop Personal MCP Agent` แล้วเปิดใหม่

คำสั่งตรวจพื้นฐาน

```powershell
node -v
npm -v
git --version
ngrok version
```

## ข้อควรระวัง

- อย่าเก็บ `.env`, API key, token หรือ password ไว้ใน GitHub
- โปรเจกต์ที่ให้ Agent ทำงานควรอยู่ภายใต้ `D:\AI-Workspace`
- รุ่น FREE v1.0.7 เหมาะสำหรับการใช้งานพื้นฐานและทดลอง MCP
- ก่อนอนุญาตงานที่แก้ไขไฟล์หรือ Git ควรตรวจคำสั่งและโปรเจกต์ให้ถูกต้อง

## การถอนการติดตั้ง

ถ้าติดตั้งด้วย `.exe` สามารถถอนผ่าน Windows Settings > Apps ได้

ถ้าติดตั้งด้วย `.cmd` และต้องการลบเอง ให้หยุด Agent ก่อน แล้วจึงลบโฟลเดอร์

```text
D:\mcp-agent-FREE
```

โปรเจกต์งานจริงใน `D:\AI-Workspace` ไม่ควรถูกลบตามโปรแกรม
