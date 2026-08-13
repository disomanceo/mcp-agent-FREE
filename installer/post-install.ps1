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

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:PATH = @($machinePath, $userPath) -join [IO.Path]::PathSeparator
}

function Find-CommandPath {
  param(
    [string]$Name,
    [string[]]$Candidates = @()
  )

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  foreach ($candidate in $Candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  return $null
}

function Install-WingetPackage {
  param(
    [string]$Id,
    [string]$DisplayName
  )

  $winget = Get-Command "winget" -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "$DisplayName is missing and winget is unavailable. Install App Installer from Microsoft Store, then rerun setup."
  }

  winget install --id $Id -e --accept-package-agreements --accept-source-agreements
  Refresh-ProcessPath
}

function Test-NodeVersion {
  $node = Find-CommandPath "node" @(
    "$env:ProgramFiles\nodejs\node.exe",
    "${env:ProgramFiles(x86)}\nodejs\node.exe"
  )
  if (-not $node) {
    return $false
  }

  $version = & $node --version
  if ($LASTEXITCODE -ne 0 -or -not ($version -match '^v(\d+)\.')) {
    return $false
  }

  return ([int]$Matches[1] -ge 22)
}

function Ensure-Node {
  if (Test-NodeVersion) {
    return
  }

  Write-Host "Node.js 22+ not found. Installing Node.js LTS..."
  Install-WingetPackage -Id "OpenJS.NodeJS.LTS" -DisplayName "Node.js LTS"

  if (-not (Test-NodeVersion)) {
    throw "Node.js 22 or newer is still unavailable after installation."
  }
}

function Ensure-Git {
  $git = Find-CommandPath "git" @(
    "$env:ProgramFiles\Git\cmd\git.exe",
    "${env:ProgramFiles(x86)}\Git\cmd\git.exe"
  )
  if ($git) {
    return
  }

  Write-Host "Git not found. Installing Git for Windows..."
  Install-WingetPackage -Id "Git.Git" -DisplayName "Git for Windows"
  Assert-Command "git" "Install Git for Windows: https://git-scm.com/download/win"
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
    return (Update-Ngrok -NgrokPath $ngrok)
  }

  $winget = Get-Command "winget" -ErrorAction SilentlyContinue
  if (-not $winget) {
    Write-Warning "ngrok not found and winget is unavailable. Install ngrok manually from https://ngrok.com/download"
    return $null
  }

  winget install --id Ngrok.Ngrok -e --accept-package-agreements --accept-source-agreements
  $ngrok = Find-Ngrok
  if ($ngrok) {
    return (Update-Ngrok -NgrokPath $ngrok)
  }
  return $null
}

function Update-Ngrok {
  param([string]$NgrokPath)

  if (-not $NgrokPath) {
    return $null
  }

  Write-Host "Checking ngrok update..."
  & $NgrokPath update | Out-Host
  $updated = Find-Ngrok
  if ($updated) {
    return $updated
  }
  return $NgrokPath
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

Refresh-ProcessPath
Ensure-Node
Ensure-Git
Assert-Command "node" "Install Node.js 22 or newer: https://nodejs.org/"
Assert-Command "npm" "Install Node.js 22 or newer: https://nodejs.org/"
Assert-Command "git" "Install Git for Windows: https://git-scm.com/download/win"

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
