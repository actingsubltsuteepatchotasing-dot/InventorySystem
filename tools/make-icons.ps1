# สร้างไอคอนทั้งชุดจากไฟล์ภาพต้นฉบับ (JPG/PNG)
#
# รันด้วย:  powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
#
# ใช้ System.Drawing ที่มากับ Windows จึงไม่ต้องติดตั้งอะไรเพิ่ม
# ถ้าอยากกลับไปใช้โลโก้ใบยาง กยท. ที่วาดด้วยโค้ด ให้รัน tools\make-icons.mjs แทน

param(
  [string]$Source = "components\fav\ERP.jpg",
  # ตัดขอบขาวรอบภาพทิ้งก่อนย่อ ภาพต้นฉบับมักมีพื้นที่ว่างเยอะ
  # ถ้าไม่ตัด เนื้อโลโก้จะเหลือนิดเดียวตอนย่อเป็น 32px บนแท็บเบราว์เซอร์
  [switch]$NoTrim,
  # ระบุกรอบครอปเองเป็นพิกเซลบนภาพต้นฉบับ ใช้เมื่อ auto-trim ยังกว้างเกินไป
  # ภาพอินโฟกราฟิกมักมีจุดเด่นอยู่แค่ตรงกลาง ถ้าย่อทั้งภาพลง 32px จะอ่านไม่ออก
  [int]$CropX = -1,
  [int]$CropY = -1,
  [int]$CropSize = 0
)

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root $Source

if (-not (Test-Path $src)) {
  Write-Error "not found: $src"
  exit 1
}

$iconDir = Join-Path $root "public\icons"
if (-not (Test-Path $iconDir)) { New-Item -ItemType Directory -Force -Path $iconDir | Out-Null }

$original = New-Object System.Drawing.Bitmap($src)
Write-Host ("source: {0} ({1}x{2})" -f $Source, $original.Width, $original.Height)

# พื้นหลังสำหรับภาพที่ไม่มีช่องโปร่งใส (JPG) ใช้ขาวให้กลืนกับพื้นภาพ
$bgColor = [System.Drawing.Color]::White

# หากรอบเนื้อหาจริง โดยมองข้ามพิกเซลที่ขาวเกือบสนิทและพิกเซลโปร่งใส
# อ่านผ่าน LockBits เพราะ GetPixel ทีละจุดกับภาพ 554x554 ช้ามาก
function Get-ContentBounds {
  param([System.Drawing.Bitmap]$Bitmap)

  $w = $Bitmap.Width
  $h = $Bitmap.Height
  $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
  $data = $Bitmap.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                           [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bytes = New-Object byte[] ($data.Stride * $h)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $Bitmap.UnlockBits($data)

  $minX = $w; $minY = $h; $maxX = -1; $maxY = -1
  for ($y = 0; $y -lt $h; $y++) {
    $row = $y * $data.Stride
    for ($x = 0; $x -lt $w; $x++) {
      $i = $row + ($x * 4)          # ลำดับไบต์ของ Format32bppArgb คือ B G R A
      if ($bytes[$i + 3] -lt 16) { continue }
      if ($bytes[$i] -gt 245 -and $bytes[$i + 1] -gt 245 -and $bytes[$i + 2] -gt 245) { continue }
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }

  if ($maxX -lt 0) { return $rect }   # ภาพขาวล้วน ใช้ทั้งภาพไปเลย

  # ขยายกรอบให้เป็นสี่เหลี่ยมจัตุรัสรอบจุดกึ่งกลางเดิม ไม่งั้นภาพจะถูกยืดผิดสัดส่วน
  $cx = ($minX + $maxX) / 2
  $cy = ($minY + $maxY) / 2
  $side = [Math]::Max($maxX - $minX + 1, $maxY - $minY + 1)
  $side = [int][Math]::Ceiling($side * 1.04)          # เผื่อขอบหายใจเล็กน้อย
  $side = [Math]::Min($side, [Math]::Min($w, $h))

  $x0 = [int][Math]::Round($cx - $side / 2)
  $y0 = [int][Math]::Round($cy - $side / 2)
  $x0 = [Math]::Max(0, [Math]::Min($x0, $w - $side))
  $y0 = [Math]::Max(0, [Math]::Min($y0, $h - $side))

  return New-Object System.Drawing.Rectangle($x0, $y0, $side, $side)
}

if ($CropSize -gt 0) {
  $crop = New-Object System.Drawing.Rectangle($CropX, $CropY, $CropSize, $CropSize)
  Write-Host ("crop: {0},{1} {2}x{3}" -f $crop.X, $crop.Y, $crop.Width, $crop.Height)
} elseif ($NoTrim) {
  $crop = New-Object System.Drawing.Rectangle(0, 0, $original.Width, $original.Height)
  Write-Host "trim: off"
} else {
  $crop = Get-ContentBounds -Bitmap $original
  Write-Host ("trim: {0},{1} {2}x{3}" -f $crop.X, $crop.Y, $crop.Width, $crop.Height)
}
Write-Host ""

function Save-Icon {
  param(
    [string]$OutPath,
    [int]$Size,
    [double]$Padding = 0   # สัดส่วนขอบว่างแต่ละด้าน 0.14 = เนื้อหากิน 72% ของด้าน
  )

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)

  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $g.Clear($bgColor)

  $inset = [int][Math]::Round($Size * $Padding)
  $inner = $Size - ($inset * 2)
  $dest = New-Object System.Drawing.Rectangle($inset, $inset, $inner, $inner)
  $g.DrawImage($original, $dest, $crop.X, $crop.Y, $crop.Width, $crop.Height,
               [System.Drawing.GraphicsUnit]::Pixel)

  $g.Dispose()

  # เขียนผ่าน MemoryStream แล้วค่อยลงดิสก์เอง
  # ถ้าให้ GDI+ เขียนไฟล์ตรง ๆ จะได้ "A generic error occurred in GDI+"
  # เมื่อไฟล์ปลายทางถูกล็อกอยู่ (เช่น OneDrive กำลัง sync)
  $full = Join-Path $root $OutPath
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $bytes = $ms.ToArray()
  $ms.Dispose()

  # ลบไฟล์เดิมก่อนเสมอ ไม่งั้น OneDrive ที่กำลัง sync จะล็อกไว้จนเขียนทับไม่ได้
  # และต้องหยุดทันทีเมื่อเขียนไม่สำเร็จ ไม่งั้นจะไปอ่านขนาดของไฟล์เก่ามารายงานว่าผ่าน
  if (Test-Path $full) { Remove-Item $full -Force -ErrorAction Stop }
  [System.IO.File]::WriteAllBytes($full, $bytes)
  if (-not (Test-Path $full)) { throw "write failed: $OutPath" }

  $kb = [Math]::Round((Get-Item $full).Length / 1KB)
  Write-Host ("  {0,3}px  {1,3} KB  {2}" -f $Size, $kb, $OutPath)
}

Save-Icon -OutPath "public\icons\icon-192.png"          -Size 192
Save-Icon -OutPath "public\icons\icon-512.png"          -Size 512
# maskable ต้องเว้น safe zone 14% ไม่งั้นระบบครอบเป็นวงกลมแล้วเนื้อหาขาด
Save-Icon -OutPath "public\icons\icon-maskable-512.png" -Size 512 -Padding 0.14
Save-Icon -OutPath "app\icon.png"                       -Size 192
Save-Icon -OutPath "app\apple-icon.png"                 -Size 180

$original.Dispose()
Write-Host ""
Write-Host "done"
