@echo off
cd /d "%~dp0"
call "%~dp0installer\Install-Personal-MCP-Agent.cmd"
exit /b %ERRORLEVEL%
