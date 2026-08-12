param(
  [string]$ScriptPath = "installer\PersonalMcpAgent.iss"
)

$ErrorActionPreference = "Stop"

function Find-InnoCompiler {
  $cmd = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  $candidates = @(
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  return $null
}

$compiler = Find-InnoCompiler
if (-not $compiler) {
  throw "Inno Setup compiler not found. Install it with: winget install --id JRSoftware.InnoSetup -e"
}

$resolvedScript = Resolve-Path -LiteralPath $ScriptPath
Write-Host "Building installer with $compiler" -ForegroundColor Cyan
& $compiler $resolvedScript

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Installer output is in dist-installer" -ForegroundColor Green
