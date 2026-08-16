# เธ—เธ”เธฅเธญเธเนเธเนเธเธฒเธเธเธฃเธดเธ

เน€เธญเธเธชเธฒเธฃเธเธตเนเนเธเนเธเธฑเธเธเธฒเธฃเธฃเธฑเธเนเธเธ local เธเธ Windows เธเนเธญเธ เธชเนเธงเธ Vercel เธ•เธญเธเธเธตเนเน€เธเนเธเธซเธเนเธฒ project status เน€เธเธฃเธฒเธฐ Gateway เธเธญเธเน€เธเธชเนเธฃเธเธ•เนเธญเธเนเธเน WebSocket connection เนเธเธ long-lived เธเธฑเธ Desktop Agent

## 1. เน€เธ•เธฃเธตเธขเธกเน€เธเธฃเธทเนเธญเธ

```powershell
cd D:\mcp-agent-FREE
npm install
npm run setup:local
npm run mode:work
npm run doctor
```

`setup:local` เธเธฐเธชเธฃเนเธฒเธ:

- `.env` เธเธฃเนเธญเธก token เนเธเธเธชเธธเนเธก
- `D:\AI-Workspace`
- `D:\AI-Workspace\SampleProject`

`mode:work` เน€เธเธดเธ”เธชเธดเธ—เธเธดเนเน€เธเธตเธขเธเนเธเธฅเนเธเนเธฒเธ tool `write_file` เธ เธฒเธขเนเธ•เน `D:\AI-Workspace` เน€เธ—เนเธฒเธเธฑเนเธ

## 2. เน€เธเธดเธ” Gateway

เธงเธดเธเธตเธเนเธฒเธขเธชเธธเธ”:

```powershell
cd D:\mcp-agent-FREE
npm run start:chatgpt
```

เธซเธฃเธทเธญเธ”เธฑเธเน€เธเธดเธฅเธเธฅเธดเธ:

```text
D:\mcp-agent-FREE\Personal MCP Agent.cmd
```

เธเธณเธชเธฑเนเธเธเธตเนเธเธฐเน€เธเธดเธ” Gateway + Agent + ngrok เนเธซเนเนเธเธซเธเนเธฒเธ•เนเธฒเธเน€เธ”เธตเธขเธง เนเธฅเธฐเธเธดเธกเธเน `MCP URL` เธชเธณเธซเธฃเธฑเธ ChatGPT

เธ–เนเธฒเธ•เนเธญเธเธเธฒเธฃเน€เธเธดเธ”เนเธขเธเน€เธญเธ เนเธซเนเนเธเนเธงเธดเธเธตเธ”เนเธฒเธเธฅเนเธฒเธ

เน€เธเธดเธ” PowerShell เธซเธเนเธฒเธ•เนเธฒเธเธ—เธตเน 1:

```powershell
cd D:\mcp-agent-FREE
npm run dev:gateway
```

เธเธงเธฃเน€เธซเนเธเธเธฃเธฐเธกเธฒเธ“เธเธตเน:

```text
Personal MCP Gateway listening on http://127.0.0.1:8787
MCP endpoint: POST /mcp
```

## 3. เน€เธเธดเธ” Desktop Agent

เน€เธเธดเธ” PowerShell เธซเธเนเธฒเธ•เนเธฒเธเธ—เธตเน 2:

```powershell
cd D:\mcp-agent-FREE
npm run dev:agent
```

เธเธงเธฃเน€เธซเนเธ:

```text
Personal MCP Desktop Agent
Status: Connecting
Workspace: D:\AI-Workspace
Mode: SAFE
Status: Connected
```

## 4. เธ•เธฃเธงเธเธงเนเธฒ Agent เธ•เนเธญเนเธฅเนเธง

เน€เธเธดเธ” PowerShell เธซเธเนเธฒเธ•เนเธฒเธเธ—เธตเน 3:

```powershell
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/api/devices
```

## 5. เธ—เธ”เธฅเธญเธเน€เธฃเธตเธขเธ MCP tools

```powershell
npm run mcp:call -- get_projects "{}"
npm run mcp:call -- list_files "{\"project\":\"SampleProject\"}"
npm run mcp:call -- read_file "{\"project\":\"SampleProject\",\"path\":\"README.md\"}"
npm run mcp:call -- npm_build "{\"project\":\"SampleProject\"}"
npm run mcp:call -- npm_test "{\"project\":\"SampleProject\"}"
```

เธ—เธ”เธฅเธญเธเน€เธเธตเธขเธเนเธเธฅเน:

```powershell
npm run mcp:call -- write_file "{\"project\":\"SampleProject\",\"path\":\"CHATGPT_AGENT_TEST.md\",\"content\":\"# Test`n`nwrite_file works.`n\"}"
npm run mcp:call -- read_file "{\"project\":\"SampleProject\",\"path\":\"CHATGPT_AGENT_TEST.md\"}"
```

เธ—เธ”เธฅเธญเธเน€เธเธตเธขเธเนเธเธฅเนเธเธฑเธเนเธเธฃเน€เธเธเธ•เนเธเธฃเธดเธเนเธเธเธเธฑเนเธงเธเธฃเธฒเธงเนเธฅเธฐ cleanup เธญเธฑเธ•เนเธเธกเธฑเธ•เธด:

```powershell
npm run demo:work -- TravelTank300
```

เธ—เธ”เธฅเธญเธ stage/commit/push เธเธฑเธ repo เธเธฑเนเธงเธเธฃเธฒเธงเธ—เธตเน cleanup เธญเธฑเธ•เนเธเธกเธฑเธ•เธด:

```powershell
npm run demo:git
```

เน€เธเธดเธ” tunnel เธเนเธฒเธ ngrok เธชเธณเธซเธฃเธฑเธ ChatGPT:

```powershell
npm run tunnel:ngrok
```

เธ–เนเธฒเธ•เนเธญเธเธเธฒเธฃเธ”เธน git status เนเธซเนเธ—เธณเนเธซเน sample project เน€เธเนเธ git repo เธเนเธญเธ:

```powershell
cd D:\AI-Workspace\SampleProject
git init
git add README.md package.json
cd D:\mcp-agent-FREE
npm run mcp:call -- git_status "{\"project\":\"SampleProject\"}"
```

## 6. เธ—เธ”เธชเธญเธเธเธฃเธเธเธธเธ”เธญเธฑเธ•เนเธเธกเธฑเธ•เธด

```powershell
npm run smoke
```

เธซเธฃเธทเธญเธ—เธ”เธฅเธญเธเนเธเธเน€เธเธดเธ” Gateway + Agent เธเธฑเนเธงเธเธฃเธฒเธง เนเธฅเนเธงเน€เธฃเธตเธขเธ tools เธเธฑเธ `SampleProject`:

```powershell
npm run demo:local
```

เธ•เธฃเธงเธเนเธเธฃเน€เธเธเธ•เนเธเธฃเธดเธเธ”เนเธงเธขเธเธทเนเธญเนเธเธฅเน€เธ”เธญเธฃเนเนเธ•เน `D:\AI-Workspace`:

```powershell
npm run demo:local -- TravelTank300 package.json
```

## เนเธเนเธเธฒเธเธเธฑเธเนเธเธฃเน€เธเธเธ•เนเธเธฃเธดเธ

เธงเธฒเธเธซเธฃเธทเธญ clone เนเธเธฃเน€เธเธเธ•เนเธเธฃเธดเธเนเธงเนเนเธ•เน:

```text
D:\AI-Workspace
```

เธ•เธฑเธงเธญเธขเนเธฒเธ:

```powershell
cd D:\AI-Workspace
git clone https://github.com/your-name/your-project.git
cd D:\mcp-agent-FREE
npm run mcp:call -- list_files "{\"project\":\"your-project\"}"
```

เธ•เธฑเนเธ default project เน€เธเธทเนเธญเนเธซเน ChatGPT เนเธกเนเธ•เนเธญเธเธชเนเธ `project` เธ—เธธเธ tool:

```powershell
cd D:\mcp-agent-FREE
npm run project:list
npm run project:set -- TravelTank300
```

เธซเธฅเธฑเธเน€เธเธฅเธตเนเธขเธ default project เนเธซเน restart Agent/Gateway เธซเธฃเธทเธญเธฃเธฑเธ `npm run start:chatgpt` เนเธซเธกเน

Agent เธเธฐเธเธเธดเน€เธชเธ path เธ—เธตเนเธญเธญเธเธเธญเธ `WORKSPACE_ROOT` เน€เธเนเธ `../secret`, `C:\Windows`, เธซเธฃเธทเธญ `\\server\share`

## เน€เธเธทเนเธญเธกเธเธฑเธ ChatGPT

เธ”เธนเธเธฑเนเธเธ•เธญเธเธ—เธตเน [docs/CHATGPT.md](CHATGPT.md)

