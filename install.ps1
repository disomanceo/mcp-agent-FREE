param(
  [string]$InstallDir = "D:\personal-mcp-agent",
  [string]$WorkspaceRoot = "D:\AI-Workspace",
  [switch]$SkipNgrok
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/disomanceo/personal-mcp-agent.git"

function Assert-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name not found. $InstallHint"
  }
}

function Invoke-Step($Title, [scriptblock]$Action) {
  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  & $Action
}

Invoke-Step "Checking required tools" {
  Assert-Command "git" "Install Git for Windows: https://git-scm.com/download/win"
  Assert-Command "node" "Install Node.js 22 or newer: https://nodejs.org/"
  Assert-Command "npm" "Install Node.js 22 or newer: https://nodejs.org/"
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
  Invoke-Step "Checking ngrok" {
    $ngrok = Get-Command "ngrok" -ErrorAction SilentlyContinue
    if (-not $ngrok) {
      $winget = Get-Command "winget" -ErrorAction SilentlyContinue
      if ($winget) {
        winget install --id Ngrok.Ngrok -e --accept-package-agreements --accept-source-agreements
      } else {
        Write-Warning "ngrok not found and winget is unavailable. Install ngrok manually from https://ngrok.com/download"
      }
    }
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
