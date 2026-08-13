param(
  [string]$InstallDir = "D:\personal-mcp-agent",
  [string]$WorkspaceRoot = "D:\AI-Workspace",
  [string]$NgrokAuthtoken = $env:NGROK_AUTHTOKEN
)

$ErrorActionPreference = "Stop"

function Assert-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name not found. $InstallHint"
  }
}

function Find-Ngrok {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\ngrok.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\ngrok\ngrok.exe"),
    (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe")
  )

  $command = Get-Command "ngrok" -ErrorAction SilentlyContinue
  if ($command) {
    $candidates += $command.Source
  }

  foreach ($entry in ($env:PATH -split [IO.Path]::PathSeparator)) {
    if ($entry) {
      $candidates += (Join-Path $entry "ngrok.exe")
    }
  }

  $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
}

function Install-Ngrok {
  $ngrok = Find-Ngrok
  if ($ngrok) {
    return $ngrok
  }

  $winget = Get-Command "winget" -ErrorAction SilentlyContinue
  if (-not $winget) {
    Write-Warning "ngrok not found and winget is unavailable. Install ngrok manually from https://ngrok.com/download"
    return $null
  }

  winget install --id Ngrok.Ngrok -e --accept-package-agreements --accept-source-agreements
  Find-Ngrok
}

function Configure-Ngrok {
  param([string]$NgrokPath)

  if (-not $NgrokPath) {
    return
  }

  Write-Host "ngrok found: $NgrokPath"

  if ($NgrokAuthtoken) {
    & $NgrokPath config add-authtoken $NgrokAuthtoken | Out-Host
    return
  }

  $configPath = Join-Path $env:LOCALAPPDATA "ngrok\ngrok.yml"
  if (-not (Test-Path -LiteralPath $configPath)) {
    Write-Warning "ngrok is installed, but no authtoken is configured yet."
    Write-Host "Get your token: https://dashboard.ngrok.com/get-started/your-authtoken"
    Write-Host "Then run:"
    Write-Host "  ngrok config add-authtoken YOUR_TOKEN_HERE"
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

$ngrok = Install-Ngrok
Configure-Ngrok -NgrokPath $ngrok

Write-Host ""
Write-Host "Personal MCP Agent is ready." -ForegroundColor Green
Write-Host "Start it from the Desktop shortcut: Personal MCP Agent"
Write-Host "Thai quick start guide: $InstallDir\docs\QUICKSTART-TH.md"
