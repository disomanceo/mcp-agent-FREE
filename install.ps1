param(
  [string]$InstallDir = "D:\personal-mcp-agent",
  [string]$WorkspaceRoot = "D:\AI-Workspace",
  [string]$NgrokAuthtoken = $env:NGROK_AUTHTOKEN,
  [switch]$SkipNgrok
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/disomanceo/personal-mcp-agent.git"

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

function Invoke-Step($Title, [scriptblock]$Action) {
  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  & $Action
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

Invoke-Step "Checking required tools" {
  Refresh-ProcessPath
  Ensure-Node
  Ensure-Git
  Assert-Command "node" "Install Node.js 22 or newer: https://nodejs.org/"
  Assert-Command "npm" "Install Node.js 22 or newer: https://nodejs.org/"
  Assert-Command "git" "Install Git for Windows: https://git-scm.com/download/win"
}

Invoke-Step "Installing or updating repository" {
  if (Test-Path -LiteralPath $InstallDir) {
    if (Test-Path -LiteralPath (Join-Path $InstallDir ".git")) {
      git -C $InstallDir pull --ff-only
    } else {
      throw "InstallDir exists but is not a git repository: $InstallDir"
    }
  } else {
    $parent = Split-Path -Parent $InstallDir
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    git clone $RepoUrl $InstallDir
  }
}

Invoke-Step "Installing npm dependencies" {
  npm --prefix $InstallDir install
}

Invoke-Step "Creating local configuration" {
  Push-Location $InstallDir
  try {
    $env:WORKSPACE_ROOT = $WorkspaceRoot
    npm run setup:local
    npm run mode:work
  } finally {
    Pop-Location
  }
}

if (-not $SkipNgrok) {
  Invoke-Step "Installing/checking ngrok" {
    $ngrok = Install-Ngrok
    Configure-Ngrok -NgrokPath $ngrok
  }
}

Invoke-Step "Creating Desktop shortcut" {
  $cmdPath = Join-Path $InstallDir "Personal MCP Agent.cmd"
  $desktop = [Environment]::GetFolderPath("Desktop")
  $shortcutPath = Join-Path $desktop "Personal MCP Agent.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $cmdPath
  $shortcut.WorkingDirectory = $InstallDir
  $shortcut.Description = "Start Personal MCP Agent for ChatGPT"
  $iconPath = Join-Path $InstallDir "assets\app-icon.ico"
  if (Test-Path -LiteralPath $iconPath) {
    $shortcut.IconLocation = $iconPath
  }
  $shortcut.Save()
  Write-Host "Shortcut created: $shortcutPath"
}

Write-Host ""
Write-Host "Personal MCP Agent installed." -ForegroundColor Green
Write-Host "Install directory: $InstallDir"
Write-Host "Workspace root: $WorkspaceRoot"
Write-Host ""
Write-Host "How to use:"
Write-Host "1. Double-click 'Personal MCP Agent' on your Desktop."
Write-Host "2. Wait for the MCP URL, for example: https://xxxxx.ngrok-free.app/mcp"
Write-Host "3. Copy that /mcp URL into ChatGPT MCP / custom connector settings."
Write-Host "4. Put real projects under: $WorkspaceRoot"
Write-Host "5. To change the active project, run:"
Write-Host "   cd $InstallDir"
Write-Host "   npm run project:list"
Write-Host "   npm run project:set -- <project-folder-name>"
Write-Host ""
Write-Host "Thai quick start guide:"
Write-Host (Join-Path $InstallDir "docs\QUICKSTART-TH.md")
