# Architecture

```text
ChatGPT
  |
  | MCP over HTTPS
  v
Cloud MCP Gateway
  |
  | Secure WebSocket
  v
Desktop Agent on Windows
  |-- Project Manager
  |-- File Tools
  |-- Git Tools
  |-- Build/Test Tools
  `-- Security / Permission Layer
```

MVP นี้รัน Gateway และ Desktop Agent แยก process กัน โดย Gateway expose HTTP/MCP และรับ WebSocket จาก Agent ส่วน Agent ถือสิทธิ์ในการอ่านไฟล์และรันคำสั่งที่ whitelist ไว้เท่านั้น
