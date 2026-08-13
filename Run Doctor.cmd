@echo off
cd /d "%~dp0"
npm run doctor
pause
exit /b %ERRORLEVEL%
