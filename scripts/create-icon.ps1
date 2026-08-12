param(
  [string]$OutputDir = "assets"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $OutputDir)) {
  New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

$pngPath = Join-Path $OutputDir "app-icon.png"
$icoPath = Join-Path $OutputDir "app-icon.ico"

$bitmap = New-Object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$rect = New-Object System.Drawing.Rectangle 0, 0, 256, 256
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius = 56
$diameter = $radius * 2
$path.AddArc(0, 0, $diameter, $diameter, 180, 90)
$path.AddArc(256 - $diameter, 0, $diameter, $diameter, 270, 90)
$path.AddArc(256 - $diameter, 256 - $diameter, $diameter, $diameter, 0, 90)
$path.AddArc(0, 256 - $diameter, $diameter, $diameter, 90, 90)
$path.CloseFigure()

$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(59,130,246)), ([System.Drawing.Color]::FromArgb(20,59,159)), 45
$graphics.FillPath($brush, $path)

$penOuter = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(150,255,255,255)), 13
$penOuter.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$outer = [System.Drawing.Point[]]@(
  [System.Drawing.Point]::new(128,40),
  [System.Drawing.Point]::new(202,82),
  [System.Drawing.Point]::new(202,168),
  [System.Drawing.Point]::new(128,212),
  [System.Drawing.Point]::new(54,168),
  [System.Drawing.Point]::new(54,82),
  [System.Drawing.Point]::new(128,40)
)
$graphics.DrawLines($penOuter, $outer)

$top = [System.Drawing.Point[]]@(
  [System.Drawing.Point]::new(128,69),
  [System.Drawing.Point]::new(177,97),
  [System.Drawing.Point]::new(128,126),
  [System.Drawing.Point]::new(79,97)
)
$left = [System.Drawing.Point[]]@(
  [System.Drawing.Point]::new(79,97),
  [System.Drawing.Point]::new(128,126),
  [System.Drawing.Point]::new(128,184),
  [System.Drawing.Point]::new(79,155)
)
$right = [System.Drawing.Point[]]@(
  [System.Drawing.Point]::new(177,97),
  [System.Drawing.Point]::new(128,126),
  [System.Drawing.Point]::new(128,184),
  [System.Drawing.Point]::new(177,155)
)

$graphics.FillPolygon((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(238,244,255))), $top)
$graphics.FillPolygon((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(185,204,255))), $left)
$graphics.FillPolygon((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(217,229,255))), $right)

$penInner = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(49,88,212)), 10
$penInner.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$penInner.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($penInner, 103, 98, 152, 127)
$graphics.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(35,201,120))), 182, 44, 28, 28)

$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [System.IO.File]::Create($icoPath)
try {
  $icon.Save($stream)
} finally {
  $stream.Dispose()
  $icon.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Host "Created $pngPath"
Write-Host "Created $icoPath"
