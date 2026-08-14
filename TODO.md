# TODO

## 2026-08-14 v1.0.7 ngrok Repair and Stop Shortcut Fix

### Completed This Round

- Made Start try to repair/install ngrok through winget before failing.
- Expanded ngrok discovery to search PATH, common install folders, WinGet links, and WinGet package subfolders.
- Added automatic ngrok version repair because ngrok `3.3.1` is rejected by accounts that require `3.20.0` or newer.
- Added Cloudflare Quick Tunnel fallback when Windows Smart App Control blocks ngrok from running.
- Restored cloudflared installation/checks so fallback is available on other machines.
- Updated doctor and ngrok helper scripts to use the same stronger ngrok discovery.
- Made the installer create the Stop Personal MCP Agent Desktop shortcut even when the optional desktop shortcut task is skipped.
- Added post-install Desktop shortcut creation for Start, Stop, Update, Repair, and Doctor shortcuts.
- Bumped app and installer version to `1.0.7`.

### Next TODO

- Add an in-GUI Repair button so users can run dependency/ngrok repair without leaving the browser.
- Show a clearer Thai message if winget cannot install ngrok due to Store/App Installer restrictions.

## 2026-08-13 v1.0.6 Start Self-Repair for Missing Workspace Packages

### Completed This Round

- Fixed Start failure when `@personal-mcp-agent/protocol` or `@personal-mcp-agent/shared` is missing from `node_modules`.
- Reworked startup checks so the app repairs workspace package links with `npm install` before build.
- Added a post-build runtime artifact check for Gateway, Desktop Agent, Protocol, and Shared dist files.
- Increased startup repair install timeout to 5 minutes for slower machines or first installs.
- Bumped app and installer version to `1.0.6`.

### Next TODO

- Add a visible Repair button inside the GUI so users can trigger dependency repair without using a separate shortcut.
- Show a Thai explanation when the installed app version is older than the latest GitHub release.

## 2026-08-13 v1.0.5 Stop Button Shutdown Fix

### Completed This Round

- Changed the GUI Stop button to stop child services and then close the GUI process.
- Avoided the extra refresh request after `/api/stop`, which could make the page look stuck while the server is shutting down.
- Kept emergency cleanup available through `Stop Personal MCP Agent.cmd` for old or stuck processes.
- Bumped app and installer version to `1.0.5`.

### Next TODO

- Add a visible "Reset stuck app" button that calls the emergency stop helper from inside the GUI.
- Add a post-stop browser page message or lightweight local HTML fallback for users whose browser remains open after the app exits.

## 2026-08-13 v1.0.4 ChatGPT Completion Status Alignment

### Completed This Round

- Changed the auto summary line after local code/build/test work from `CODE COMPLETE` to a `WAIT` state.
- The log now tells users that computer-side work is finished, but they should wait for ChatGPT to finish its final reply before checking Git or pushing.
- Split final log hints into clearer states: local work done, local commit done, and GitHub push done.
- Bumped app and installer version to `1.0.4`.

### Next TODO

- Add an explicit "ChatGPT response finished" checklist hint in the Git Assistant before enabling beginner-friendly push guidance.
- Consider adding a small manual "Mark chat finished" button for users who want the app log to match the visible ChatGPT page.

## 2026-08-13 v1.0.3 ngrok Auth and Dashboard Restore

### Completed This Round

- Restored ngrok-only tunnel settings in the GUI, based on the working ngrok auth flow around `ac6e5f9`.
- Added `ngrok authtoken` and optional static/dev domain fields to the Home dashboard.
- Added `/api/tunnel/config` so the app can save ngrok settings into `.env` and run `ngrok config add-authtoken`.
- Removed the alternate tunnel direction from the active path and kept ngrok as the single supported tunnel in the UI.
- Reworked the Home dashboard layout: system cards sit under the Agent panel, MCP URL sits on the right, and the work log occupies the lower-right panel.
- Bumped app and installer version to `1.0.3`.

### Next TODO

- Add a dedicated "Reset stuck app" button in the GUI that force-stops old Node/ngrok processes.
- Add richer tunnel diagnostics that explains old ngrok versions, missing authtoken, and domain mismatch in Thai.
- Add a Help page with screenshots for installing ngrok, saving the token, starting the Agent, and copying MCP URL into ChatGPT.

## 2026-08-13 v1.0.2 Batch/CMD Usability Pass

### Completed This Round

- Added root `Install Personal MCP Agent.cmd` for users who prefer double-click batch installation.
- Added `Update Personal MCP Agent.cmd`, `Repair Personal MCP Agent.cmd`, and `Run Doctor.cmd`.
- Updated installer shortcuts to use `.cmd` wrappers instead of direct PowerShell commands where possible.
- Updated `install.ps1` to create Desktop shortcuts for Start, Stop, Update, Repair, and Doctor.

### Next TODO

- Add an in-app Help page that explains when to use Start, Stop, Update, Repair, and Doctor.
- Add a single "Reset stuck app" button inside the GUI that calls the same emergency stop logic.
- Consider code signing the installer to reduce Windows SmartScreen warnings.

## Current Status

Phase 3 Complete: Controlled WORK mode with git commit/push tools

## Completed

- npm workspaces monorepo structure
- Gateway HTTP/WebSocket service
- Desktop CLI Agent with reconnect and heartbeat
- SAFE-only tool layer
- shared path safety and command whitelist helpers
- protocol schemas with Zod
- local JSONL audit log helper
- unit tests for path safety, invalid projects, protocol parsing, tool validation, and command whitelist
- runtime smoke test for Gateway, Desktop Agent, WebSocket auth/connection, MCP tools, git tools, and npm build/test
- local git repository initialized for this project only
- GitHub repository connected to Vercel project `disomanceo/personal-mcp-agent`
- Vercel static project status page added for successful production deployment
- WORK mode added for controlled `write_file` access inside `WORKSPACE_ROOT`
- `npm_lint` tool added as a fixed safe command
- local `demo:work` verifies MCP write/read behavior and cleans up scratch files
- ChatGPT Developer mode and Secure MCP Tunnel runbook added
- controlled git tools added: stage, commit, push, pull ff-only, log, staged diff
- `npm_install` added as a fixed command
- one-window ChatGPT launcher added for Gateway + Agent + ngrok
- default project switching added

## Pending

- OAuth/JWT authentication design
- durable async job model for long-running build/test
- staged WORK/DANGEROUS approval flow
- cloud deployment hardening for public Gateway
- production WebSocket hosting plan outside Vercel Functions or via a dedicated relay service
- real ChatGPT connection requires user-created OpenAI Secure MCP Tunnel or public HTTPS forwarding URL
- approval UX for git commit/push is still handled by ChatGPT confirmation and prompt discipline, not by a native desktop approval dialog

## Known Issues

- MCP endpoint is implemented as a stateless Streamable HTTP endpoint for local MVP testing.
- `work-smoke/` is generated by `npm run smoke` and ignored by git.
- File reading assumes UTF-8 text after binary null-byte rejection.
- Vercel project linking is complete, but the MVP Gateway still requires a persistent WebSocket-capable runtime for full Desktop Agent connectivity.
- Existing Gateway/Agent terminals must be restarted after adding tools so ChatGPT can discover new metadata.

## Security Notes

- SAFE mode remains the read/build default; WORK mode is available only when explicitly enabled in `.env`.
- No delete, arbitrary shell, git reset, git rebase, force push, or custom push destination operations are implemented.
- All project file access must stay inside WORKSPACE_ROOT.
- Tokens and environment variables are not written to audit logs.
- WORK mode enables controlled git commit/push, but still blocks force push, reset, rebase, delete, arbitrary shell, custom push targets, and `.env` secret writes.

## Next Step

- Select and configure a persistent Gateway host for production WebSocket connectivity.
