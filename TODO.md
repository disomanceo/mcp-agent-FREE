# TODO — Personal MCP Agent FREE

Current baseline: **v1.0.7**
Repository: `disomanceo/mcp-agent-FREE`

## เป้าหมายของรุ่น FREE

ทำให้ Personal MCP Agent ใช้งานง่ายสำหรับผู้ใช้ทั่วไปบน Windows โดยเน้นการติดตั้งง่าย เชื่อมต่อได้เสถียร มีคู่มือภาษาไทย และคงขอบเขตฟีเจอร์ให้เหมาะกับรุ่นแจกฟรี

## สถานะปัจจุบัน

- [x] แยกโปรเจกต์ FREE ออกจาก repository หลัก
- [x] ใช้ Personal MCP Agent v1.0.7 เป็นฐาน
- [x] รองรับ Gateway + Desktop Agent + MCP
- [x] รองรับ SAFE / controlled WORK workflow ตามฐาน v1.0.7
- [x] รองรับ ngrok พร้อม fallback เมื่อใช้งานไม่ได้
- [x] มี Start / Stop / Update / Repair / Doctor สำหรับ Windows
- [x] มี GUI สำหรับช่วยใช้งาน Agent
- [x] ปรับ README สำหรับรุ่นแจกฟรี
- [x] สร้าง TODO แยกสำหรับรุ่น FREE

## งานลำดับถัดไป

- [ ] ตรวจสอบ `npm install` บนเครื่องใหม่แบบ clean install
- [ ] รัน `typecheck`, `test`, `build`, `lint` และ `smoke` ให้ผ่านทั้งหมด
- [ ] ตรวจสอบข้อความภาษาไทยใน GUI ทุกหน้าไม่ให้ encoding เพี้ยน
- [ ] เพิ่มปุ่ม Repair ใน GUI เพื่อซ่อม dependency / tunnel โดยไม่ต้องเปิดไฟล์ CMD
- [ ] เพิ่มข้อความภาษาไทยเมื่อ ngrok หรือ winget ติดตั้งไม่ได้
- [ ] ทำหน้า Help ภาษาไทยแบบสั้นสำหรับผู้ใช้ใหม่
- [ ] ตรวจสอบขั้นตอนเชื่อม ChatGPT Developer Mode / MCP ให้ตรงกับการใช้งานจริงปัจจุบัน
- [ ] ทำตัวติดตั้งรุ่น FREE ที่ระบุชื่อและเวอร์ชันชัดเจน
- [ ] เตรียม GitHub Release แรกของสาย FREE

## ขอบเขตที่ต้องรักษา

- รุ่น FREE ต้องใช้งานพื้นฐานได้โดยไม่ต้องมี License ID
- ไม่เพิ่มระบบ Pro/License ที่ทำให้การใช้งานพื้นฐานถูกล็อก
- ไม่เพิ่มฟีเจอร์ที่เสี่ยงต่อการลบไฟล์, force push หรือแก้ไขระบบโดยไม่มีการควบคุม
- เก็บ file access ให้อยู่ภายใต้ `WORKSPACE_ROOT`
- ห้าม commit `.env`, token, API key หรือ secret ขึ้น GitHub
- ฟีเจอร์ใหม่ต้องไม่ทำลายการใช้งานของผู้ใช้ v1.0.7 เดิมโดยไม่จำเป็น

## แนวทางเวอร์ชัน

เริ่มสาย FREE จากฐาน `v1.0.7` และใช้เวอร์ชันแยกของ repository นี้เมื่อเริ่มแก้ไขฟีเจอร์ เช่น `free-v1.0.0` หรือรูปแบบเวอร์ชันที่กำหนดภายหลัง

## ก่อนออก Release

- [ ] `npm install` ผ่าน
- [ ] `npm run typecheck` ผ่าน
- [ ] `npm test` ผ่าน
- [ ] `npm run build` ผ่าน
- [ ] `npm run lint` ผ่าน (ถ้ามี script)
- [ ] `npm run smoke` ผ่าน
- [ ] ทดสอบ Start / Stop / Repair / Doctor บน Windows
- [ ] ตรวจสอบว่าไม่มี secret ใน Git diff
- [ ] ตรวจสอบ README และคู่มือภาษาไทย
- [ ] สร้าง Release notes

## หมายเหตุฐาน v1.0.7

Commit ฐานเดิม: `5e1c620` — `fix: add tunnel fallback and stop shortcut repair`
