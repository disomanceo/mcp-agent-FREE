param(
  [string]$InstallDir = (Split-Path -Parent $PSScriptRoot),
  [int]$GuiPort = 8790,
  [int]$GatewayPort = 8787,
  [switch]$Quiet
)

$ErrorActionPreference = "SilentlyContinue"
$current = $PID
$resolvedInstallDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($InstallDir)
$ports = @($GuiPort, $GatewayPort, 4040)
$owners = @()

foreach ($port in $ports) {
  $owners += Get-NetTCPConnection -LocalPort $port |
    Where-Object { $_.OwningProcess -ne 0 -and $_.OwningProcess -ne $current } |
    Select-Object -ExpandProperty OwningProcess
}

$ownerSet = @{}
foreach ($owner in $owners) {
  $ownerSet[[int]$owner] = $true
}

$targets = Get-CimInstance Win32_Process | Where-Object {
  if ($_.ProcessId -eq $current) { return $false }
  $cmd = [string]$_.CommandLine
  if ([string]::IsNullOrWhiteSpace($cmd)) { return $false }

  $ownsAppPort = $ownerSet.ContainsKey([int]$_.ProcessId)
  $isPersonalNode = (
    $cmd -like "*scripts/gui-launcher.mjs*" -or
    $cmd -like "*apps/gateway/dist/index.js*" -or
    $cmd -like "*apps/desktop-agent/dist/index.js*" -or
    $cmd -like "*npm-cli.js* run start:gui*" -or
    $cmd -like "*Personal MCP Agent.cmd*"
  )
  $isPersonalRoot = $cmd -like "*$resolvedInstallDir*" -and $isPersonalNode
  $isNgrok = $cmd -like "*ngrok*" -and $cmd -like "*http*" -and $cmd -like "*$GatewayPort*"
  $isCloudflared = $cmd -like "*cloudflared*" -and $cmd -like "*tunnel*" -and (
    $cmd -like "*$GatewayPort*" -or
    $cmd -like "*trycloudflare*"
  )

  return $ownsAppPort -or $isPersonalRoot -or $isNgrok -or $isCloudflared
}

$killed = 0
foreach ($target in $targets | Sort-Object ProcessId -Unique) {
  taskkill.exe /PID $target.ProcessId /T /F 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $killed += 1
  }
}

if (-not $Quiet) {
  Write-Host "Personal MCP Agent emergency stop complete."
  Write-Host "Processes stopped: $killed"
  Write-Host "Ports checked: $($ports -join ', ')"
}
