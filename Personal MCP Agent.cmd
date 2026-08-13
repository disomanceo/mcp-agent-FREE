@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-agent.ps1" -InstallDir "%~dp0" -Quiet
npm run start:gui
exit /b %ERRORLEVEL%
