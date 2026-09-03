# สร้างไอคอนทั้งชุดจากไฟล์ภาพต้นฉบับ (JPG/PNG)
#
# รันด้วย:  powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
#
# ใช้ System.Drawing ที่มากับ Windows จึงไม่ต้องติดตั้งอะไรเพิ่ม
# ถ้าอยากกลับไปใช้โลโก้ใบไม้ที่วาดด้วยโค้ด ให้รัน tools\make-icons.mjs แทน

param(
  [string]$Source = "components\fav\ERP.jpg",
  # ตัดขอบขาวรอบภาพทิ้งก่อนย่อ ภาพต้นฉบับมักมีพื้นที่ว่างเยอะ
  # ถ้าไม่ตัด เนื้อโลโก้จะเหลือนิดเดียวตอนย่อเป็น 32px บนแท็บเบราว์เซอร์
  [switch]$NoTrim,
  # ระบุกรอบครอปเองเป็นพิกเซลบนภาพต้นฉบับ ใช้เมื่อ auto-trim ยังกว้างเกินไป
  # ภาพอินโฟกราฟิกมักมีจุดเด่นอยู่แค่ตรงกลาง ถ้าย่อทั้งภาพลง 32px จะอ่านไม่ออก
  [int]$CropX = -1,
  [int]$CropY = -1,
  [int]$CropSize = 0,
  # กรอบครอปเฉพาะ favicon.ico ซึ่งใช้แค่บนแท็บเบราว์เซอร์ที่ 16-48px
  # ครอปแคบกว่าไอคอนแอปเพราะที่ 16px ต้องเห็นคำว่า ERP ให้ได้
  # ใช้จุดกึ่งกลางเดียวกับกรอบหลัก ใส่ 0 = ใช้กรอบเดียวกับไอคอนแอป
  [int]$FaviconCrop = 250
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


# สร้าง favicon.ico ที่บรรจุหลายขนาดไว้ในไฟล์เดียว
#
# ทำไมต้องมี ico ทั้งที่มี app/icon.png อยู่แล้ว:
#   icon.png มีขนาดเดียวคือ 192px แล้วปล่อยให้เบราว์เซอร์ย่อลง 16/32 เอง
#   ซึ่งเบลอกว่าการเรนเดอร์ที่ขนาดนั้นตรง ๆ มาก โดยเฉพาะภาพที่มีตัวอักษร
#   ico เก็บภาพที่เรนเดอร์แยกตามขนาดไว้ เบราว์เซอร์หยิบอันที่พอดีไปใช้ได้เลย
#
# ประกอบไฟล์ ico เองเพราะ System.Drawing บันทึก ico หลายขนาดไม่ได้
# โครงสร้าง: ICONDIR 6 ไบต์ + ICONDIRENTRY ขนาด 16 ไบต์ต่อรูป + เนื้อ PNG ต่อท้าย
function Save-Favicon {
  param(
    [string]$OutPath,
    [int[]]$Sizes = @(16, 32, 48)
  )

  # ครอปของ favicon คิดจากจุดกึ่งกลางเดียวกับกรอบหลัก แล้วบีบให้อยู่ในภาพ
  $fc = $crop
  if ($FaviconCrop -gt 0) {
    $cx = $crop.X + ($crop.Width / 2)
    $cy = $crop.Y + ($crop.Height / 2)
    $side = [Math]::Min($FaviconCrop, [Math]::Min($original.Width, $original.Height))
    $fx = [Math]::Max(0, [Math]::Min([int][Math]::Round($cx - $side / 2), $original.Width - $side))
    $fy = [Math]::Max(0, [Math]::Min([int][Math]::Round($cy - $side / 2), $original.Height - $side))
    $fc = New-Object System.Drawing.Rectangle($fx, $fy, $side, $side)
  }

  $blobs = @()
  foreach ($sz in $Sizes) {
    $bmp = New-Object System.Drawing.Bitmap($sz, $sz, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear($bgColor)
    $dest = New-Object System.Drawing.Rectangle(0, 0, $sz, $sz)
    $g.DrawImage($original, $dest, $fc.X, $fc.Y, $fc.Width, $fc.Height,
                 [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $blobs += , @{ size = $sz; data = $ms.ToArray() }
    $ms.Dispose()
  }

  $out = New-Object System.IO.MemoryStream
  $w = New-Object System.IO.BinaryWriter($out)
  $w.Write([uint16]0)               # reserved ต้องเป็น 0 เสมอ
  $w.Write([uint16]1)               # ชนิด 1 = icon (2 = cursor)
  $w.Write([uint16]$blobs.Count)

  $offset = 6 + (16 * $blobs.Count)
  foreach ($b in $blobs) {
    $w.Write([byte]$b.size)         # กว้าง (ค่า 0 หมายถึง 256)
    $w.Write([byte]$b.size)         # สูง
    $w.Write([byte]0)               # จำนวนสีในพาเลต 0 = ไม่ใช้พาเลต
    $w.Write([byte]0)               # reserved
    $w.Write([uint16]1)             # color planes
    $w.Write([uint16]32)            # bits per pixel
    $w.Write([uint32]$b.data.Length)
    $w.Write([uint32]$offset)
    $offset = $offset + $b.data.Length
  }
  foreach ($b in $blobs) { $w.Write($b.data) }
  $w.Flush()
  $bytes = $out.ToArray()
  $w.Dispose()
  $out.Dispose()

  $full = Join-Path $root $OutPath
  if (Test-Path $full) { Remove-Item $full -Force -ErrorAction Stop }
  [System.IO.File]::WriteAllBytes($full, $bytes)
  if (-not (Test-Path $full)) { throw "write failed: $OutPath" }

  Write-Host ("  {0,-8} {1,3} KB  {2}  (crop {3})" -f ($Sizes -join "/"), [Math]::Round($bytes.Length / 1KB), $OutPath, $fc.Width)
}

Save-Icon -OutPath "public\icons\icon-192.png"          -Size 192
Save-Icon -OutPath "public\icons\icon-512.png"          -Size 512
# maskable ต้องเว้น safe zone 14% ไม่งั้นระบบครอบเป็นวงกลมแล้วเนื้อหาขาด
Save-Icon -OutPath "public\icons\icon-maskable-512.png" -Size 512 -Padding 0.14
Save-Icon -OutPath "app\icon.png"                       -Size 192
Save-Icon -OutPath "app\apple-icon.png"                 -Size 180

# favicon.ico ต้องมาหลังสุด เพราะใช้ $crop ตัวเดียวกับไอคอนด้านบน
Save-Favicon -OutPath "app/favicon.ico"

$original.Dispose()
Write-Host ""
Write-Host "done"
