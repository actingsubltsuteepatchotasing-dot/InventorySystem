# ปรับไฟล์โลโก้ต้นฉบับให้เอาไปใช้บนหน้าจอ บนกระดาษ และเป็นไอคอนแอปได้
#
# รันด้วย:  powershell -ExecutionPolicy Bypass -File tools/trim-logo.ps1
#
# ต้นฉบับ components/fav/NewLogo.jpg เป็นไฟล์ JPEG ที่มีปัญหาสามอย่างเมื่อเอามาวางบนเว็บ:
#   1. พื้นหลังเป็นสีเทาอ่อน (~#F0F0F0) ไม่ใช่สีขาว วางบนการ์ดสีขาวแล้วเห็นเป็นกล่องเทา
#   2. มีขอบว่างรอบตรากว้างมาก พอกำหนดความสูงเป็นพิกเซล ตัวตราจึงเล็กกว่าที่ควรจะเป็น
#   3. JPEG ไม่มีความโปร่งใส และมีรอยหยักรอบตัวอักษรจากการบีบอัด
#
# สคริปต์นี้แก้ทั้งสามข้อ แล้วเขียนไฟล์ที่โปรแกรมใช้จริงทั้งหมด:
#   public/logo.png                    ตราเต็ม ตัวอักษรสีเขียวเข้ม (สำหรับพื้นสว่าง)
#   public/logo-light.png              ตราเต็ม ตัวอักษรสีขาว (สำหรับแถบเมนูสีเข้ม)
#   public/icons/icon-192.png          ไอคอน PWA
#   public/icons/icon-512.png          ไอคอน PWA
#   public/icons/icon-maskable-512.png ไอคอน PWA แบบเต็มสี่เหลี่ยม
#   app/icon.png                       ไอคอนตาม file convention ของ Next.js
#   app/apple-icon.png                 ไอคอนหน้าจอโฮมของ iOS
#   app/favicon.ico                    ไอคอนแท็บเบราว์เซอร์ (16/32/48/64 ในไฟล์เดียว)
#
# ไอคอนตัดเฉพาะเปลวไฟกับลูกศรจากตราจริง ไม่ได้วาดเลียนแบบด้วยโค้ด
# ตอนย่อเหลือ 16 จุด ตัวอักษร OFAU อ่านไม่ออกอยู่แล้ว เหลือแต่รูปทรงจึงจำได้ง่ายกว่า
#
# ใช้ System.Drawing ที่มากับ Windows จึงไม่ต้องติดตั้งไลบรารีเพิ่ม
# (ข้อกำหนดของโครงงานคือไม่เพิ่ม dependency)

param(
  [string]$Src = "components\fav\NewLogo.jpg",
  [int]$OutWidth = 900
)

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root $Src
if (-not (Test-Path $srcPath)) { throw "ไม่พบไฟล์ต้นฉบับ: $srcPath" }

$img = New-Object System.Drawing.Bitmap $srcPath
$W = $img.Width
$H = $img.Height

# อ่านทั้งภาพเข้าอาเรย์ทีเดียว — GetPixel ทีละจุดกับภาพล้านจุดช้าเกินกว่าจะรอไหว
$rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
$data = $img.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $data.Stride
$buf = New-Object byte[] ($stride * $H)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buf, 0, $buf.Length)
$img.UnlockBits($data)
$img.Dispose()

# ---------------------------------------------------------------- ค่าที่ใช้ตัดสิน
# พื้นหลังของไฟล์นี้อยู่ราว 237-248 และแทบไม่มีสี จึงตัดสินจาก "สว่างและจืด"
$BG = 240.0      # ค่าเฉลี่ยของพื้นหลัง ใช้ถอดสีพื้นออกจากขอบที่ถูกเกลี่ย
$HI = 236        # สว่างกว่านี้และจืด = พื้นหลังเต็มตัว (โปร่งใส 100%)
$LO = 202        # เข้มกว่านี้ = ตัวตราเต็มตัว (ทึบ 100%)
$SAT = 26        # ความต่างของช่องสีที่ถือว่า "มีสี" ไม่ใช่เทา

function Get-Alpha([int]$r, [int]$g, [int]$b) {
  $max = [Math]::Max($r, [Math]::Max($g, $b))
  $min = [Math]::Min($r, [Math]::Min($g, $b))
  # จุดที่มีสีชัด (ส้ม/เขียว) ถือเป็นตัวตราเสมอ แม้จะสว่าง
  if (($max - $min) -gt $SAT) { return 255 }
  if ($max -ge $HI) { return 0 }
  if ($max -le $LO) { return 255 }
  return [int](255.0 * ($HI - $max) / ($HI - $LO))
}

# ---------------------------------------------------------------- หาขอบเขตของตรา
$minX = $W; $minY = $H; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $H; $y++) {
  $row = $y * $stride
  for ($x = 0; $x -lt $W; $x++) {
    $i = $row + $x * 4
    if ((Get-Alpha $buf[$i + 2] $buf[$i + 1] $buf[$i]) -gt 40) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
if ($maxX -lt 0) { throw "ไม่พบตราในภาพ — ค่าที่ใช้ตัดสินพื้นหลังอาจไม่ตรงกับไฟล์นี้" }

# เว้นขอบไว้เล็กน้อย ไม่ให้ตราชิดขอบภาพจนดูอึดอัด
$pad = [int]([Math]::Max(6, ($maxX - $minX) * 0.012))
$minX = [Math]::Max(0, $minX - $pad)
$minY = [Math]::Max(0, $minY - $pad)
$maxX = [Math]::Min($W - 1, $maxX + $pad)
$maxY = [Math]::Min($H - 1, $maxY + $pad)

$cw = $maxX - $minX + 1
$ch = $maxY - $minY + 1
"ตัดขอบว่างออก: $W x $H  ->  $cw x $ch"

# ---------------------------------------------------------------- สร้างภาพผลลัพธ์
# variant: "dark" = ตัวอักษรสีเขียวเข้มตามต้นฉบับ · "light" = ตัวอักษรสีขาว
function New-Trimmed([string]$variant) {
  $out = New-Object System.Drawing.Bitmap $cw, $ch, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $orect = New-Object System.Drawing.Rectangle 0, 0, $cw, $ch
  $odata = $out.LockBits($orect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly,
                         [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $ostride = $odata.Stride
  $obuf = New-Object byte[] ($ostride * $ch)

  for ($y = 0; $y -lt $ch; $y++) {
    $srow = ($y + $minY) * $stride
    $orow = $y * $ostride
    for ($x = 0; $x -lt $cw; $x++) {
      $i = $srow + ($x + $minX) * 4
      $b = [int]$buf[$i]
      $g = [int]$buf[$i + 1]
      $r = [int]$buf[$i + 2]

      $a = Get-Alpha $r $g $b
      if ($a -eq 0) { continue }   # ปล่อยให้โปร่งใส (อาเรย์เริ่มต้นเป็นศูนย์อยู่แล้ว)

      if ($a -lt 255) {
        # ขอบที่ถูกเกลี่ยคือสีจริงผสมกับพื้นเทามาแล้ว ต้องถอดพื้นออกไม่งั้นขอบจะซีด
        $f = $a / 255.0
        $r = [int][Math]::Round(($r - $BG * (1 - $f)) / $f)
        $g = [int][Math]::Round(($g - $BG * (1 - $f)) / $f)
        $b = [int][Math]::Round(($b - $BG * (1 - $f)) / $f)
      }

      if ($variant -eq "light") {
        $max = [Math]::Max($r, [Math]::Max($g, $b))
        $min = [Math]::Min($r, [Math]::Min($g, $b))
        if (($max -lt 130) -and ($g -ge $r)) {
          # ตัวอักษรเขียวเข้ม -> ขาว (บนแถบเมนูสีเข้มต้องอ่านออก)
          $r = 255; $g = 255; $b = 255
        }
        elseif (($max -lt 205) -and ($g -gt $r) -and (($max - $min) -gt $SAT)) {
          # ลูกศรเขียวกลาง -> ผสมขาว 40% ให้สว่างขึ้นพอตัดกับพื้นเข้ม
          $r = [int](($r * 0.6) + 102); $g = [int](($g * 0.6) + 102); $b = [int](($b * 0.6) + 102)
        }
      }

      $o = $orow + $x * 4
      $obuf[$o]     = [byte][Math]::Max(0, [Math]::Min(255, $b))
      $obuf[$o + 1] = [byte][Math]::Max(0, [Math]::Min(255, $g))
      $obuf[$o + 2] = [byte][Math]::Max(0, [Math]::Min(255, $r))
      $obuf[$o + 3] = [byte]$a
    }
  }

  [System.Runtime.InteropServices.Marshal]::Copy($obuf, 0, $odata.Scan0, $obuf.Length)
  $out.UnlockBits($odata)
  return $out
}

# ย่อภาพลงให้ได้ความกว้างที่ต้องการ แล้วเขียนเป็น PNG
function Get-Scaled([System.Drawing.Bitmap]$bmp, [int]$w) {
  $h = [int][Math]::Round($bmp.Height * ($w / [double]$bmp.Width))
  $scaled = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gfx = [System.Drawing.Graphics]::FromImage($scaled)
  $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gfx.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $gfx.Clear([System.Drawing.Color]::Transparent)
  $gfx.DrawImage($bmp, (New-Object System.Drawing.Rectangle 0, 0, $w, $h))
  $gfx.Dispose()
  return $scaled
}

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$name) {
  # GDI+ ไม่รับเส้นทางที่ปนขีดหน้ากับขีดหลัง ต้องแปลงเป็นขีดหลังของวินโดวส์ให้หมดก่อน
  $target = Join-Path $root ($name -replace "/", "\")
  $dir = Split-Path -Parent $target
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
  $bmp.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  $size = [int]((Get-Item $target).Length / 1024)
  "  {0,-34} {1} x {2}  ({3} KB)" -f $name, $bmp.Width, $bmp.Height, $size
}

$dark = New-Trimmed "dark"
$light = New-Trimmed "light"

$darkOut = Get-Scaled $dark ([Math]::Min($OutWidth, $dark.Width))
$lightOut = Get-Scaled $light ([Math]::Min($OutWidth, $light.Width))
Save-Png $darkOut "public/logo.png"
Save-Png $lightOut "public/logo-light.png"
$darkOut.Dispose()
$lightOut.Dispose()
$light.Dispose()

# -------------------------------------------------------- ตัดเฉพาะเปลวไฟกับลูกศร
# ไอคอนแอปเป็นกรอบจัตุรัสเล็ก ย่อตราทั้งใบลงไปแล้วตัวอักษรอ่านไม่ออกอยู่ดี
# จึงเอาเฉพาะเปลวไฟกับลูกศร ซึ่งหาขอบเขตเองได้จากตัวภาพ ไม่ต้องกรอกพิกัดมือ
#
# ขั้นแรกหาหัวตัวอักษร: ตัวอักษร OFAU กินความกว้างเกือบเต็มภาพ
# ส่วนเปลวไฟกับลูกศรกินไม่ถึงครึ่ง จึงไล่จากบนลงล่างหาแถวแรกที่เนื้อหากว้างเกินครึ่ง
function Get-WordTop([byte[]]$bits, [int]$st, [int]$bw, [int]$bh) {
  for ($y = 0; $y -lt $bh; $y++) {
    $lo = -1; $hi = -1
    $row = $y * $st
    for ($x = 0; $x -lt $bw; $x++) {
      if ($bits[$row + $x * 4 + 3] -gt 60) {
        if ($lo -lt 0) { $lo = $x }
        $hi = $x
      }
    }
    if (($hi - $lo) -gt ($bw * 0.6)) { return $y }
  }
  throw "หาหัวตัวอักษรไม่เจอ — สัดส่วนของภาพอาจไม่เหมือนต้นฉบับ"
}

# สร้างผืนจัตุรัสที่มีแต่เปลวไฟกับลูกศร
#
# เหนือหัวตัวอักษรไม่ได้มีแต่ตัวตรา หัวตัว A กับ O โผล่ขึ้นมาก่อนตัวอื่นด้วย
# แยกด้วยสีไม่ได้ เพราะใต้ลูกศรก็เป็นเขียวเข้มเท่าตัวอักษร
# แต่แยกด้วย "ขนาดก้อน" ได้ชัดเจน — ไล่ระบายก้อนที่ติดกันแล้วนับจุด
# ในไฟล์ต้นฉบับได้ เปลวไฟ 16298 จุด ลูกศร 14269 จุด ส่วนหัวตัว A กับ O เหลือแค่ 219 กับ 114
# จึงเก็บเฉพาะก้อนที่ใหญ่กว่าหนึ่งในสิบของก้อนใหญ่สุด (คิดเป็นสัดส่วนจึงไม่ผูกกับขนาดภาพ)
# วิธีนี้กำจัดจุดสีหลงจากการบีบอัด JPEG ไปด้วยในตัว
function New-Mark([System.Drawing.Bitmap]$bmp) {
  $bw = $bmp.Width; $bh = $bmp.Height
  $r = New-Object System.Drawing.Rectangle 0, 0, $bw, $bh
  $d = $bmp.LockBits($r, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                     [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $st = $d.Stride
  $bits = New-Object byte[] ($st * $bh)
  [System.Runtime.InteropServices.Marshal]::Copy($d.Scan0, $bits, 0, $bits.Length)
  $bmp.UnlockBits($d)

  $wordTop = Get-WordTop $bits $st $bw $bh
  $n = $bw * $wordTop

  # ระบายก้อน: lab = 0 ยังไม่ตรวจ · -1 โปร่งใส · 1 ขึ้นไปคือหมายเลขก้อน
  $lab = New-Object int[] $n
  $queue = New-Object int[] $n
  $sizes = New-Object System.Collections.Generic.List[int]
  $id = 0
  for ($p0 = 0; $p0 -lt $n; $p0++) {
    if ($lab[$p0] -ne 0) { continue }
    $y0 = [int][Math]::Floor($p0 / $bw); $x0 = $p0 - $y0 * $bw
    if ($bits[$y0 * $st + $x0 * 4 + 3] -le 60) { $lab[$p0] = -1; continue }
    $id++
    $qh = 0; $qt = 0
    $lab[$p0] = $id; $queue[$qt] = $p0; $qt++
    while ($qh -lt $qt) {
      $p = $queue[$qh]; $qh++
      $py = [int][Math]::Floor($p / $bw); $px = $p - $py * $bw
      foreach ($dd in @(@(1, 0), @(-1, 0), @(0, 1), @(0, -1))) {
        $nx = $px + $dd[0]; $ny = $py + $dd[1]
        if ($nx -lt 0 -or $ny -lt 0 -or $nx -ge $bw -or $ny -ge $wordTop) { continue }
        $np = $ny * $bw + $nx
        if ($lab[$np] -ne 0) { continue }
        if ($bits[$ny * $st + $nx * 4 + 3] -le 60) { $lab[$np] = -1; continue }
        $lab[$np] = $id; $queue[$qt] = $np; $qt++
      }
    }
    $sizes.Add($qt)
  }
  if ($sizes.Count -eq 0) { throw "ไม่พบเปลวไฟกับลูกศรเหนือตัวอักษร" }

  $biggest = 0
  foreach ($v in $sizes) { if ($v -gt $biggest) { $biggest = $v } }
  $min = [Math]::Max(50, [int]($biggest / 10))

  $mnX = $bw; $mxX = -1; $mnY = $bh; $mxY = -1
  for ($p = 0; $p -lt $n; $p++) {
    $l = $lab[$p]
    if ($l -lt 1) { continue }
    if ($sizes[$l - 1] -lt $min) { $lab[$p] = -1; continue }   # ก้อนเล็ก = ไม่ใช่ตัวตรา
    $py = [int][Math]::Floor($p / $bw); $px = $p - $py * $bw
    if ($px -lt $mnX) { $mnX = $px }
    if ($px -gt $mxX) { $mxX = $px }
    if ($py -lt $mnY) { $mnY = $py }
    if ($py -gt $mxY) { $mxY = $py }
  }
  if ($mxX -lt 0) { throw "ไม่พบก้อนที่ใหญ่พอจะเป็นตัวตรา" }

  $kept = 0
  foreach ($v in $sizes) { if ($v -ge $min) { $kept++ } }
  # ต้องใช้ Write-Host ไม่ใช่วางสตริงเปล่า ๆ
  # ในฟังก์ชัน สตริงเปล่าจะกลายเป็นค่าที่ส่งกลับปนกับ Bitmap แล้วผู้เรียกได้อาเรย์แทนภาพ
  Write-Host "ตัดเฉพาะเปลวไฟกับลูกศร: เก็บ $kept ก้อนจาก $($sizes.Count) ก้อน · หัวตัวอักษรอยู่แถวที่ $wordTop"

  # ขยายให้เป็นจัตุรัสรอบจุดกึ่งกลาง ไอคอนจะได้ไม่บิดสัดส่วนและตัวตราอยู่กลางผืน
  $side = [Math]::Max($mxX - $mnX + 1, $mxY - $mnY + 1)
  $ox = [int][Math]::Round((($mnX + $mxX) / 2.0) - $side / 2.0)
  $oy = [int][Math]::Round((($mnY + $mxY) / 2.0) - $side / 2.0)

  $out = New-Object System.Drawing.Bitmap $side, $side, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $orect = New-Object System.Drawing.Rectangle 0, 0, $side, $side
  $odata = $out.LockBits($orect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly,
                         [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $ostride = $odata.Stride
  $obuf = New-Object byte[] ($ostride * $side)
  for ($y = 0; $y -lt $side; $y++) {
    $sy = $y + $oy
    if ($sy -lt 0 -or $sy -ge $wordTop) { continue }
    $orow = $y * $ostride
    $srow = $sy * $st
    for ($x = 0; $x -lt $side; $x++) {
      $sx = $x + $ox
      if ($sx -lt 0 -or $sx -ge $bw) { continue }
      if ($lab[$sy * $bw + $sx] -lt 1) { continue }
      $i = $srow + $sx * 4
      $o = $orow + $x * 4
      $obuf[$o] = $bits[$i]
      $obuf[$o + 1] = $bits[$i + 1]
      $obuf[$o + 2] = $bits[$i + 2]
      $obuf[$o + 3] = $bits[$i + 3]
    }
  }
  [System.Runtime.InteropServices.Marshal]::Copy($obuf, 0, $odata.Scan0, $obuf.Length)
  $out.UnlockBits($odata)
  return $out
}

$mark = New-Mark $dark
$dark.Dispose()

# ------------------------------------------------------------------- ไอคอนแอป
# พื้นขาวเพื่อให้ทั้งเปลวไฟและลูกศรตัดกับพื้นชัด (พื้นเขียวทำให้ลูกศรจมหาย)
$WHITE = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
$EDGE = [System.Drawing.Color]::FromArgb(255, 221, 229, 224)

# shape: "circle" = วงกลมขาวมีขอบจาง · "square" = ขาวเต็มสี่เหลี่ยม (สำหรับ maskable/ios)
# inset = สัดส่วนขอบว่างรอบตรา (0.2 = ตรากิน 60% ของด้าน)
function New-Icon([int]$size, [string]$shape, [double]$inset) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  if ($shape -eq "circle") {
    $brush = New-Object System.Drawing.SolidBrush $WHITE
    $g.FillEllipse($brush, 0.5, 0.5, $size - 1.0, $size - 1.0)
    $brush.Dispose()
    # ขอบจาง ๆ กันไอคอนกลืนไปกับหน้าจอโฮมที่พื้นหลังสว่าง
    $pen = New-Object System.Drawing.Pen $EDGE, ([float]([Math]::Max(1.0, $size / 48.0)))
    $g.DrawEllipse($pen, 0.5, 0.5, $size - 1.0, $size - 1.0)
    $pen.Dispose()
  }
  else {
    $brush = New-Object System.Drawing.SolidBrush $WHITE
    $g.FillRectangle($brush, 0, 0, $size, $size)
    $brush.Dispose()
  }

  $inner = [int][Math]::Round($size * (1.0 - $inset * 2.0))
  $off = [int][Math]::Round(($size - $inner) / 2.0)
  $g.DrawImage($mark, (New-Object System.Drawing.Rectangle $off, $off, $inner, $inner))
  $g.Dispose()
  return $bmp
}

$icons = @(
  @{ name = "public/icons/icon-192.png"; size = 192; shape = "circle"; inset = 0.14 },
  @{ name = "public/icons/icon-512.png"; size = 512; shape = "circle"; inset = 0.14 },
  # maskable ต้องเต็มสี่เหลี่ยมและเว้น safe zone ให้ระบบครอบรูปทรงได้
  # ข้อกำหนดคือเนื้อหาสำคัญต้องอยู่ในวงกลมกลางขนาด 80% จึงเว้นขอบมากกว่าปกติ
  @{ name = "public/icons/icon-maskable-512.png"; size = 512; shape = "square"; inset = 0.24 },
  # Next.js file convention — วางที่ app/ แล้วจะแทรก <link> ให้เอง
  @{ name = "app/icon.png"; size = 192; shape = "circle"; inset = 0.14 },
  @{ name = "app/apple-icon.png"; size = 180; shape = "square"; inset = 0.16 }
)
foreach ($ic in $icons) {
  $bmp = New-Icon $ic.size $ic.shape $ic.inset
  Save-Png $bmp $ic.name
  $bmp.Dispose()
}

# ------------------------------------------------------------------------ ICO
# .ico รุ่นใหม่ (Vista ขึ้นไป) ใส่ข้อมูล PNG ลงไปตรง ๆ ได้เลย ไม่ต้องแปลงเป็น BMP
# จึงเหลือแค่เขียนหัวไฟล์ 6 ไบต์ กับรายการภาพอีกรายการละ 16 ไบต์
function Get-PngBytes([System.Drawing.Bitmap]$bmp) {
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $ms.ToArray()
  $ms.Dispose()
  return ,$bytes
}

$icoSizes = @(16, 32, 48, 64)
$blobs = @()
foreach ($s in $icoSizes) {
  $bmp = New-Icon $s "square" 0.10
  $blobs += , (Get-PngBytes $bmp)
  $bmp.Dispose()
}

$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $ms
$bw.Write([uint16]0)               # reserved
$bw.Write([uint16]1)               # 1 = ไอคอน
$bw.Write([uint16]$blobs.Count)
$offset = 6 + 16 * $blobs.Count
for ($i = 0; $i -lt $blobs.Count; $i++) {
  $s = $icoSizes[$i]
  $bw.Write([byte]$(if ($s -ge 256) { 0 } else { $s }))   # ขนาด 256 เขียนเป็น 0 ตามข้อกำหนด
  $bw.Write([byte]$(if ($s -ge 256) { 0 } else { $s }))
  $bw.Write([byte]0)               # จำนวนสีในจานสี (0 = ไม่ใช้จานสี)
  $bw.Write([byte]0)               # reserved
  $bw.Write([uint16]1)             # color planes
  $bw.Write([uint16]32)            # bits per pixel
  $bw.Write([uint32]$blobs[$i].Length)
  $bw.Write([uint32]$offset)
  $offset += $blobs[$i].Length
}
foreach ($blob in $blobs) { $bw.Write($blob) }
$bw.Flush()
$icoPath = Join-Path $root "app/favicon.ico"
[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
$bw.Dispose()
$ms.Dispose()
"  {0,-34} {1} จุด  ({2} KB)" -f "app/favicon.ico", ($icoSizes -join "/"), [int]((Get-Item $icoPath).Length / 1024)

$mark.Dispose()
"เสร็จแล้ว — ตราเต็มพื้นโปร่งใส และไอคอนทุกขนาดตัดจากภาพจริง"
