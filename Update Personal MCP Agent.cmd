@echo off
cd /d "%~dp0"
call "%~dp0Stop Personal MCP Agent.cmd"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" -InstallDir "%~dp0"
pause
exit /b %ERRORLEVEL%
