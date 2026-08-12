# คู่มือเริ่มใช้งานแบบง่าย

หน้านี้สำหรับคนที่ติดตั้งเสร็จแล้ว และต้องการรู้ว่า “ต้องกดอะไรต่อ”

## ภาพรวมแบบสั้น

- ตัวโปรแกรมอยู่ที่ `D:\personal-mcp-agent`
- โปรเจกต์ที่ให้ ChatGPT ทำงานด้วย ควรอยู่ใต้ `D:\AI-Workspace`
- เวลาใช้งาน ให้เปิด shortcut ชื่อ `Personal MCP Agent` บน Desktop
- โปรแกรมจะโชว์ URL ที่ลงท้ายด้วย `/mcp`
- เอา URL นั้นไปใส่ใน ChatGPT ที่เมนู MCP / ตัวเชื่อมต่อ

## 1. เปิดใช้งาน

วิธีง่ายสุด:

1. ไปที่ Desktop
2. ดับเบิลคลิก `Personal MCP Agent`
3. ระบบจะเปิดหน้า GUI ใน browser
4. กดปุ่ม `Start`
5. รอจนหน้าจอแสดง URL ประมาณนี้:

```text
MCP URL: https://xxxxx.ngrok-free.app/mcp
```

6. กดปุ่ม `Copy`
7. เปิด ChatGPT แล้วนำ URL นี้ไปใส่ใน MCP server URL

ถ้าไม่อยากใช้ shortcut ให้เปิด PowerShell แล้วรัน:

```powershell
cd D:\personal-mcp-agent
npm run start:gui
```

ถ้าติดตั้งจากไฟล์ `setup.exe` ให้ใช้งานเหมือนกัน คือเปิดจาก shortcut `Personal MCP Agent` บน Desktop

## 2. เอา URL ไปใส่ใน ChatGPT

ใน ChatGPT ภาษาไทย ให้ไปที่หน้าจัดการ MCP / ตัวเชื่อมต่อแบบกำหนดเอง แล้วใส่ข้อมูลประมาณนี้:

- ชื่อ: `Personal MCP Agent`
- URL เซิร์ฟเวอร์: URL ที่คัดลอกจากหน้าต่างโปรแกรม เช่น `https://xxxxx.ngrok-free.app/mcp`
- การพิสูจน์ตัวตน: ถ้าไม่มี token/OAuth ให้เลือกแบบที่ไม่ต้องใช้ หรือใช้ค่าตามที่ ChatGPT แสดงให้เลือก
- ยืนยันความเสี่ยงของ MCP server แบบกำหนดเอง เฉพาะเมื่อมั่นใจว่า URL นี้เป็นของเครื่องคุณเอง

หลังบันทึกแล้ว ให้ลองพิมพ์ใน ChatGPT:

```text
ใช้ Personal MCP Agent ช่วยดูโปรเจกต์ที่เชื่อมอยู่ตอนนี้ให้หน่อย
```

## 3. โครงสร้างโฟลเดอร์ที่ต้องจำ

มี 2 โฟลเดอร์หลัก:

```text
D:\personal-mcp-agent
```

คือโฟลเดอร์ของตัวโปรแกรม ไม่ต้องเอาโปรเจกต์งานจริงมาใส่ในนี้

```text
D:\AI-Workspace
```

คือโฟลเดอร์รวมโปรเจกต์งานจริง เช่น:

```text
D:\AI-Workspace\TravelTank300
D:\AI-Workspace\my-app
D:\AI-Workspace\client-web
```

เวลาสั่ง ChatGPT ให้ทำงาน ให้เรียกชื่อโฟลเดอร์โปรเจกต์ เช่น `TravelTank300` หรือ `my-app`

## 4. ดูว่ามีโปรเจกต์อะไรบ้าง

เปิด PowerShell แล้วรัน:

```powershell
cd D:\personal-mcp-agent
npm run project:list
```

ระบบจะแสดงรายชื่อโฟลเดอร์ใต้ `D:\AI-Workspace`

## 5. เปลี่ยนโปรเจกต์หลัก

วิธีง่ายสุดคือเปลี่ยนจากหน้า GUI:

1. เปิด `Personal MCP Agent`
2. เลือกโปรเจกต์จาก dropdown
3. กด `Set Active Project`
4. กด `Stop`
5. กด `Start` ใหม่

หรือใช้ PowerShell:

ตัวอย่าง ถ้าต้องการเปลี่ยนไปใช้ `TravelTank300`:

```powershell
cd D:\personal-mcp-agent
npm run project:set -- TravelTank300
```

หลังเปลี่ยนโปรเจกต์แล้ว ให้ปิดหน้าต่าง `Personal MCP Agent` ที่เปิดอยู่ แล้วเปิดใหม่อีกครั้ง

## 6. เพิ่มโปรเจกต์ใหม่

วิธีง่ายสุดคือเพิ่มจากหน้า GUI:

1. เปิด `Personal MCP Agent`
2. วาง URL ในช่อง `Add Project from URL`
3. กด `Add URL`
4. ถ้าเป็น GitHub ระบบจะ clone source code ให้
5. ถ้าเป็น Vercel หรือ Google Apps Script ระบบจะสร้าง linked project พร้อม README และ metadata

ตัวอย่าง URL ที่รองรับ:

```text
https://github.com/disomanceo/smart-bill-payment-tracker
https://vercel.com/disomanceo/pm-coming
https://script.google.com/home/projects/1iy2pVV7YPZBbY-wcUaQ_DYi2LpGTLMZpL41rPbYIdwmMh3MG42QQC96v/edit
```

ถ้าทำเองผ่าน PowerShell ให้เอาโปรเจกต์ไปไว้ใต้ `D:\AI-Workspace`

ตัวอย่าง clone จาก GitHub:

```powershell
cd D:\AI-Workspace
git clone https://github.com/disomanceo/TravelTank300.git
```

จากนั้นตั้งเป็นโปรเจกต์หลัก:

```powershell
cd D:\personal-mcp-agent
npm run project:set -- TravelTank300
```

## 6.1 กรณีรู้แค่ GitHub / Vercel / GAS URL

GitHub:

- ใช้งานดีที่สุด
- ระบบ clone repo เป็น local project ได้เลย
- ChatGPT สามารถอ่านไฟล์ แก้โค้ด test build commit/push ได้ตาม permission

Vercel:

- Vercel URL อย่างเดียวมักเป็นหน้า deploy/project
- ถ้า Vercel project เชื่อม GitHub อยู่ ควรหา GitHub repo URL แล้วเพิ่ม URL นั้นแทน
- ถ้ายังไม่มี GitHub URL ระบบจะสร้าง linked project เพื่อเก็บข้อมูล Vercel ไว้ก่อน

Google Apps Script:

- URL ของ GAS ไม่ใช่ git repo โดยตรง
- ระบบจะสร้าง linked project พร้อม Script ID
- ถ้าจะให้ ChatGPT แก้ code จริง ควร sync code ลง local ด้วย `clasp`

ตัวอย่างในโฟลเดอร์ linked GAS:

```powershell
npm install -g @google/clasp
clasp login
clasp clone <SCRIPT_ID> .
```

## 7. อัปเดตตัวโปรแกรม

ใช้คำสั่งนี้:

```powershell
irm https://raw.githubusercontent.com/disomanceo/personal-mcp-agent/master/update.ps1 | iex
```

หรือถ้าอยู่ในโฟลเดอร์โปรแกรมแล้ว:

```powershell
cd D:\personal-mcp-agent
git pull
npm install
npm run build
```

## 8. ย้ายไปเครื่องใหม่

บนเครื่องใหม่ให้ทำตามนี้:

1. ติดตั้ง Git
2. ติดตั้ง Node.js 22 หรือใหม่กว่า
3. ติดตั้ง ngrok และตั้งค่า authtoken ของคุณ
4. เปิด PowerShell แล้วรัน:

```powershell
irm https://raw.githubusercontent.com/disomanceo/personal-mcp-agent/master/install.ps1 | iex
```

5. เอาโปรเจกต์งานจริงไปไว้ใต้ `D:\AI-Workspace`
6. ตั้งโปรเจกต์หลักด้วย `npm run project:set -- ชื่อโปรเจกต์`
7. เปิด shortcut `Personal MCP Agent`
8. เอา URL `/mcp` ใหม่ไปใส่ใน ChatGPT

## 9. ปิดโปรแกรม

กลับไปที่หน้าต่าง `Personal MCP Agent` แล้วกด:

```text
Ctrl + C
```

ถ้าถามว่าจะหยุดไหม ให้กด `Y` แล้ว Enter

## 10. ปัญหาที่พบบ่อย

ถ้า ChatGPT ต่อไม่ได้:

- เช็กว่าเปิด `Personal MCP Agent` อยู่หรือไม่
- เช็กว่า URL ใน ChatGPT เป็น URL ล่าสุดหรือไม่
- ถ้าใช้ ngrok ฟรี URL อาจเปลี่ยนทุกครั้งที่เปิดใหม่ ต้องเอา URL ใหม่ไปใส่ใน ChatGPT

ถ้าไม่เห็นโปรเจกต์:

- เช็กว่าโปรเจกต์อยู่ใต้ `D:\AI-Workspace`
- รัน `npm run project:list`
- ตั้งโปรเจกต์ด้วย `npm run project:set -- ชื่อโฟลเดอร์`

ถ้าสั่ง commit/push ไม่ได้:

- เช็กว่าโปรเจกต์นั้น login GitHub แล้ว
- เช็กว่า remote ของ repo ถูกต้อง
- เช็กว่า permission mode ของ agent เป็น `WORK`
- ถ้าเป็นงานเสี่ยงมาก ChatGPT อาจต้องให้คุณยืนยันก่อน
