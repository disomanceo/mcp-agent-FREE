param(
  [string]$InstallDir = "D:\personal-mcp-agent",
  [string]$WorkspaceRoot = "D:\AI-Workspace"
)

$ErrorActionPreference = "Stop"

function Assert-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name not found. $InstallHint"
  }
}

Write-Host "Configuring Personal MCP Agent..." -ForegroundColor Cyan

Assert-Command "node" "Install Node.js 22 or newer: https://nodejs.org/"
Assert-Command "npm" "Install Node.js 22 or newer: https://nodejs.org/"

if (-not (Get-Command "git" -ErrorAction SilentlyContinue)) {
  Write-Warning "Git was not found. The app can start, but real project clone/commit/push workflows need Git for Windows."
}

if (-not (Test-Path -LiteralPath $WorkspaceRoot)) {
  New-Item -ItemType Directory -Force -Path $WorkspaceRoot | Out-Null
}

Push-Location $InstallDir
try {
  $env:WORKSPACE_ROOT = $WorkspaceRoot
  npm install
  npm run build
  npm run setup:local
  npm run mode:work
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Personal MCP Agent is ready." -ForegroundColor Green
Write-Host "Start it from the Desktop shortcut: Personal MCP Agent"
Write-Host "Thai quick start guide: $InstallDir\docs\QUICKSTART-TH.md"
