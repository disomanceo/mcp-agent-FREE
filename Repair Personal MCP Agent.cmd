@echo off
cd /d "%~dp0"
call "%~dp0Stop Personal MCP Agent.cmd"
npm install
if errorlevel 1 goto failed
npm run build
if errorlevel 1 goto failed
npm run doctor
if errorlevel 1 goto failed
echo.
echo Personal MCP Agent repair complete.
pause
exit /b 0

:failed
echo.
echo Repair failed. Please copy the message above and send it to support.
pause
exit /b 1
