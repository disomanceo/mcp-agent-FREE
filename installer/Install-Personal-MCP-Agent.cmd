@echo off
setlocal
title Personal MCP Agent Installer

echo.
echo Personal MCP Agent installer
echo ============================
echo.
echo This installer downloads and runs the official install.ps1 script from GitHub.
echo It will install/check Node.js, Git, cloudflared, ngrok, npm dependencies,
echo local config, and the Desktop shortcut.
echo.

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo ERROR: PowerShell was not found on this Windows machine.
  echo.
  pause
  exit /b 1
)

set "INSTALL_PS1=%TEMP%\install-personal-mcp-agent.ps1"

echo Downloading installer script...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/disomanceo/personal-mcp-agent/master/install.ps1' -OutFile '%INSTALL_PS1%' -UseBasicParsing } catch { Write-Error $_; exit 1 }"
if errorlevel 1 (
  echo.
  echo ERROR: Could not download install.ps1.
  echo Please check your internet connection and try again.
  echo.
  pause
  exit /b 1
)

echo.
echo Running installer...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_PS1%"
set "RESULT=%ERRORLEVEL%"

echo.
if not "%RESULT%"=="0" (
  echo Installation failed with exit code %RESULT%.
  echo Review the messages above, then try again.
  echo.
  pause
  exit /b %RESULT%
)

echo Installation completed.
echo You can start Personal MCP Agent from the Desktop shortcut.
echo.
pause
exit /b 0
