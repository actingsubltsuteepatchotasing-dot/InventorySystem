# สร้างรูป Open Graph 1200x630 สำหรับพรีวิวตอนแชร์ลิงก์ (LINE / Facebook / X)
#
# รันด้วย:  powershell -ExecutionPolicy Bypass -File tools/make-og-image.ps1
#
# ใช้ System.Drawing ที่มากับ Windows จึงไม่ต้องติดตั้งอะไรเพิ่ม
# ไฟล์นี้ต้องบันทึกเป็น UTF-8 with BOM ไม่งั้น PowerShell จะอ่านข้อความไทยเพี้ยน

param(
  [string]$Source = "components/fav/ERP.jpg",
  [string]$Out    = "public/og-image.png"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root $Source
$dst  = Join-Path $root $Out

if (-not (Test-Path $src)) { throw "not found: $src" }

# 1200x630 คือสัดส่วนที่ LINE, Facebook และ X ใช้แสดงการ์ดใหญ่
$W = 1200
$H = 630

$GREEN = [System.Drawing.Color]::FromArgb(0, 105, 60)      # สีแบรนด์ กยท. #00693C
$INK   = [System.Drawing.Color]::FromArgb(26, 41, 33)
$MUTE  = [System.Drawing.Color]::FromArgb(92, 112, 100)
$BG    = [System.Drawing.Color]::FromArgb(244, 247, 245)   # เท่ากับ background_color ใน manifest

$img = New-Object System.Drawing.Bitmap($src)
$bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g   = [System.Drawing.Graphics]::FromImage($bmp)

$g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint  = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$g.Clear($BG)

# เลือกฟอนต์ไทยที่มีอยู่จริงในเครื่อง ไม่งั้น .NET จะ fallback เป็นฟอนต์ที่ไม่มีสระไทย
$installed = ([System.Drawing.FontFamily]::Families | ForEach-Object { $_.Name })
$fam = @("Leelawadee UI", "Leelawadee", "Tahoma", "Microsoft Sans Serif") |
       Where-Object { $installed -contains $_ } | Select-Object -First 1
if (-not $fam) { $fam = "Tahoma" }
Write-Host "font: $fam"

$brushInk   = New-Object System.Drawing.SolidBrush($INK)
$brushMute  = New-Object System.Drawing.SolidBrush($MUTE)
$brushGreen = New-Object System.Drawing.SolidBrush($GREEN)

# แถบเขียวบน-ล่าง ให้การ์ดดูเป็นของ กยท. แม้รูปสินค้าจะเป็นโทนม่วง
$g.FillRectangle($brushGreen, 0, 0, $W, 16)
$g.FillRectangle($brushGreen, 0, $H - 16, $W, 16)

# การ์ดขาวรองรูป ให้ขอบรูปไม่จมไปกับพื้นหลัง
$g.FillRectangle([System.Drawing.Brushes]::White, 72, 105, 420, 420)
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(72, 105, 420, 420)),
             77, 77, 400, 400, [System.Drawing.GraphicsUnit]::Pixel)

# วาดข้อความโดยลดขนาดฟอนต์ลงจนกว่าจะพอดีความกว้างที่ให้ ป้องกันข้อความล้นการ์ด
function Draw-Fit {
  param(
    [string]$Text, [single]$X, [single]$Y, [single]$MaxWidth,
    [single]$Size, [System.Drawing.FontStyle]$Style, $Brush
  )
  $s = $Size
  while ($s -gt 8) {
    $f = New-Object System.Drawing.Font($fam, $s, $Style, [System.Drawing.GraphicsUnit]::Pixel)
    $m = $g.MeasureString($Text, $f)
    if ($m.Width -le $MaxWidth) { break }
    $f.Dispose()
    $s = $s - 1
  }
  $g.DrawString($Text, $f, $Brush, $X, $Y)
  $h = $g.MeasureString($Text, $f).Height
  $f.Dispose()
  return $h
}

$TX = 546.0
$TW = 1200.0 - $TX - 72.0
$bold = [System.Drawing.FontStyle]::Bold
$reg  = [System.Drawing.FontStyle]::Regular

$y = 128.0
$y = $y + (Draw-Fit -Text "การยางแห่งประเทศไทย (กยท.)" -X $TX -Y $y -MaxWidth $TW -Size 26 -Style $bold -Brush $brushGreen) + 14
$y = $y + (Draw-Fit -Text "ระบบควบคุม" -X $TX -Y $y -MaxWidth $TW -Size 66 -Style $bold -Brush $brushInk) + 2
$y = $y + (Draw-Fit -Text "สินค้าคงคลัง" -X $TX -Y $y -MaxWidth $TW -Size 66 -Style $bold -Brush $brushInk) + 26

# เส้นคั่นสั้น ๆ ให้บล็อกข้อความไม่ติดกันเป็นพืด
$g.FillRectangle($brushGreen, $TX, $y, 72, 5)
$y = $y + 26

$y = $y + (Draw-Fit -Text "รับ · เบิก · โอน · ปรับปรุงสินค้า" -X $TX -Y $y -MaxWidth $TW -Size 27 -Style $reg -Brush $brushMute) + 6
$y = $y + (Draw-Fit -Text "ขายหน้าร้าน (POS) · รายงาน · ผู้ช่วย AI" -X $TX -Y $y -MaxWidth $TW -Size 27 -Style $reg -Brush $brushMute)

$g.Dispose()

$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$img.Dispose()
$bytes = $ms.ToArray()
$ms.Dispose()

# ลบก่อนเขียนเสมอ OneDrive ล็อกไฟล์ที่เพิ่งสร้างไว้ชั่วครู่จนเขียนทับไม่ได้
if (Test-Path $dst) { Remove-Item $dst -Force -ErrorAction Stop }
[System.IO.File]::WriteAllBytes($dst, $bytes)
if (-not (Test-Path $dst)) { throw "write failed: $Out" }

Write-Host ("{0}  {1}x{2}  {3} KB" -f $Out, $W, $H, [Math]::Round((Get-Item $dst).Length / 1KB))
