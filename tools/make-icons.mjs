// สร้างไอคอน PNG สำหรับ PWA จากโลโก้ กยท. (ใบยางในวงกลม)
//
// รันด้วย:  node tools/make-icons.mjs
//
// เขียน PNG encoder เองด้วย zlib ที่มีมากับ Node — ไม่ต้องติดตั้ง sharp หรือ canvas
// รูปทรงลอกมาจาก <Logo> ใน components/Icons.js ซึ่งใช้ viewBox 64x64
// ถ้าแก้โลโก้ในไฟล์นั้น ให้แก้ที่นี่แล้วรันใหม่

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/* ---------------------------------------------------------- PNG encoder */

let crcTable = null;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  return crcTable;
}

function crc32(buf) {
  const t = getCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

/** เข้ารหัสภาพ RGBA เป็นไฟล์ PNG */
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (none)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------- รูปทรง */

const RING = [0x00, 0x69, 0x3c]; // --brand   เขียว กยท.
const LEAF = [0xa8, 0xcf, 0x45]; // --accent  เขียวใบยาง
const VEIN = [0x00, 0x51, 0x2f]; // --brand-d เขียวเข้ม

/** อยู่ในวงกลมพื้นหลังหรือไม่ (viewBox 64x64, ศูนย์กลาง 32,32 รัศมี 30) */
const inCircle = (x, y) => (x - 32) ** 2 + (y - 32) ** 2 <= 30 * 30;

/**
 * อยู่ในรูปใบยางหรือไม่
 * ส่วนล่างเป็นครึ่งวงกลมศูนย์กลาง (32,34) รัศมี 14
 * ส่วนบนสอบขึ้นไปจบเป็นปลายแหลมที่ (32,13)
 */
function inLeaf(x, y) {
  if (y > 48 || y < 13) return false;
  if (y >= 34) return (x - 32) ** 2 + (y - 34) ** 2 <= 14 * 14;
  const t = (34 - y) / 21; // 0 ที่ฐาน -> 1 ที่ปลาย
  const halfWidth = 14 * Math.pow(1 - t, 0.62);
  return Math.abs(x - 32) <= halfWidth;
}

/** ระยะจากจุดถึงส่วนของเส้นตรง ใช้วาดเส้นใบ */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

const VEINS = [
  [32, 18, 32, 48], // ก้านกลาง
  [32, 30, 39, 24], // แขนงขวา
  [32, 38, 25, 32], // แขนงซ้าย
];
const VEIN_HALF_WIDTH = 1.3;

/**
 * สีของจุดหนึ่งในพิกัด viewBox
 * @param {boolean} fullBleed true = พื้นหลังเต็มสี่เหลี่ยม (สำหรับไอคอน maskable)
 * @returns {[number,number,number,number]|null} RGBA หรือ null = โปร่งใส
 */
function colorAt(x, y, fullBleed) {
  const onVein = VEINS.some(
    ([x1, y1, x2, y2]) => distToSegment(x, y, x1, y1, x2, y2) <= VEIN_HALF_WIDTH
  );

  if (inLeaf(x, y)) return onVein ? [...VEIN, 255] : [...LEAF, 255];

  // เส้นก้านที่ยื่นพ้นใบลงมาด้านล่าง ให้กลมกลืนกับพื้นวงกลม
  if (onVein && (fullBleed || inCircle(x, y))) return [...VEIN, 255];

  if (fullBleed) return [...RING, 255];
  if (inCircle(x, y)) return [...RING, 255];
  return null;
}

/**
 * วาดไอคอนหนึ่งขนาด
 * @param {number} size ความกว้าง/สูงเป็นพิกเซล
 * @param {{fullBleed?:boolean, padding?:number}} opts
 *        padding = สัดส่วนขอบว่าง (0.1 = โลโก้กิน 80% ของด้าน)
 */
function render(size, opts = {}) {
  const fullBleed = !!opts.fullBleed;
  const padding = opts.padding || 0;
  const SS = 4; // supersampling กันขอบหยัก

  const rgba = Buffer.alloc(size * size * 4);
  const inner = size * (1 - padding * 2);
  const scale = inner / 64;
  const offset = size * padding;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = px + (sx + 0.5) / SS;
          const fy = py + (sy + 0.5) / SS;
          const vx = (fx - offset) / scale;
          const vy = (fy - offset) / scale;

          let c = null;
          if (fullBleed) {
            // นอกกรอบโลโก้ยังเป็นพื้นสีเขียว เพราะ maskable ต้องเต็มสี่เหลี่ยม
            c = vx < 0 || vx > 64 || vy < 0 || vy > 64 ? [...RING, 255] : colorAt(vx, vy, true);
          } else if (vx >= 0 && vx <= 64 && vy >= 0 && vy <= 64) {
            c = colorAt(vx, vy, false);
          }

          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += c[3];
          }
        }
      }

      const n = SS * SS;
      const i = (py * size + px) * 4;
      const alpha = a / n;
      if (alpha > 0) {
        // ค่าสีเฉลี่ยเฉพาะตัวอย่างที่ทึบ ไม่ให้ขอบคล้ำ
        const opaque = a / 255;
        rgba[i] = Math.round(r / opaque);
        rgba[i + 1] = Math.round(g / opaque);
        rgba[i + 2] = Math.round(b / opaque);
        rgba[i + 3] = Math.round(alpha);
      }
    }
  }

  return encodePNG(size, size, rgba);
}

/* --------------------------------------------------------------- เขียนไฟล์ */

const root = process.cwd();
const iconDir = path.join(root, "public", "icons");
fs.mkdirSync(iconDir, { recursive: true });

const outputs = [
  // ไอคอนหลักของ PWA — โปร่งใสรอบวงกลม
  { file: path.join(iconDir, "icon-192.png"), size: 192 },
  { file: path.join(iconDir, "icon-512.png"), size: 512 },

  // maskable ต้องเต็มสี่เหลี่ยมและเว้น safe zone ให้ระบบครอบรูปทรงได้
  // ข้อกำหนดคือเนื้อหาสำคัญต้องอยู่ในวงกลมกลางขนาด 80% -> เว้นขอบข้างละ 14%
  { file: path.join(iconDir, "icon-maskable-512.png"), size: 512, fullBleed: true, padding: 0.14 },

  // Next.js file convention — วางที่ app/ แล้วจะแทรก <link> ให้เอง
  { file: path.join(root, "app", "icon.png"), size: 192 },
  { file: path.join(root, "app", "apple-icon.png"), size: 180, fullBleed: true, padding: 0.1 },
];

for (const o of outputs) {
  const buf = render(o.size, { fullBleed: o.fullBleed, padding: o.padding });
  fs.writeFileSync(o.file, buf);
  console.log(
    "  " +
      String(o.size).padStart(3) +
      "px  " +
      String(Math.round(buf.length / 1024)).padStart(3) +
      " KB  " +
      path.relative(root, o.file).split(path.sep).join("/")
  );
}

console.log("\nสร้างไอคอนครบ " + outputs.length + " ไฟล์");
