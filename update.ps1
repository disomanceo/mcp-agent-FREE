param(
  [string]$InstallDir = "D:\personal-mcp-agent"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath (Join-Path $InstallDir ".git"))) {
  throw "Not a git repository: $InstallDir"
}

Write-Host "Updating Personal MCP Agent..." -ForegroundColor Cyan
git -C $InstallDir pull --ff-only
npm --prefix $InstallDir install
npm --prefix $InstallDir run build
Write-Host "Update complete." -ForegroundColor Green
