// สร้างไอคอน PNG สำหรับ PWA จากตราสัญลักษณ์ OFAU (เปลวไฟกับลูกศรพุ่งขึ้น)
//
// รันด้วย:  node tools/make-icons.mjs
//
// เขียน PNG encoder เองด้วย zlib ที่มีมากับ Node — ไม่ต้องติดตั้ง sharp หรือ canvas
// รูปทรงอ่านจาก lib/logo.js ชุดเดียวกับที่หน้าจอใช้ ไม่ได้ลอกมาเขียนซ้ำ
// แก้โลโก้ที่ไฟล์นั้นที่เดียวแล้วรันสคริปต์นี้ใหม่ ไอคอนจะตรงกับบนหน้าจอเสมอ

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { MARK, markColorAt } from "../lib/logo.js";

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

// รูปทรงมาจาก lib/logo.js ชุดเดียวกับที่หน้าจอใช้วาด SVG
// เมื่อก่อนไฟล์นี้เขียนรูปทรงซ้ำไว้เอง พร้อมหมายเหตุว่า "ถ้าแก้โลโก้ ให้แก้ที่นี่ด้วย"
// ซึ่งแปลว่าวันหนึ่งจะมีที่หนึ่งที่ลืมแก้ แล้วไอคอนบนหน้าจอโฮมกับในเว็บจะคนละรูป
// ตอนนี้อ่านจากที่เดียว จึงไม่มีทางหลุดจากกันอีก

const HEX = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const BG = HEX(MARK.bg);
const EDGE = HEX(MARK.edge);

/** ระยะจากศูนย์กลางกรอบ ใช้แยกพื้น ขอบ และนอกวงกลม */
const radius = (x, y) => Math.hypot(x - 32, y - 32);

/** อยู่ในวงกลมพื้นหลังหรือไม่ (viewBox 64x64, ศูนย์กลาง 32,32 รัศมี 31) */
const inCircle = (x, y) => radius(x, y) <= 31;

/**
 * สีของจุดหนึ่งในพิกัด viewBox
 * @param {boolean} fullBleed true = พื้นหลังเต็มสี่เหลี่ยม (สำหรับไอคอน maskable)
 * @returns {[number,number,number,number]|null} RGBA หรือ null = โปร่งใส
 */
function colorAt(x, y, fullBleed) {
  const mark = markColorAt(x, y);
  if (mark) return [...HEX(mark), 255];

  // พื้นขาวเพื่อให้ทั้งเปลวไฟและลูกศรตัดกับพื้นชัด (พื้นเขียวทำให้ลูกศรจมหาย)
  // ขอบจาง ๆ ด้านนอกสุด กันไอคอนกลืนไปกับหน้าจอโฮมที่พื้นหลังสว่าง
  if (fullBleed) return [...BG, 255];
  const r = radius(x, y);
  if (r > 31) return null;
  if (r > 30) return [...EDGE, 255];
  return [...BG, 255];
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
            c = vx < 0 || vx > 64 || vy < 0 || vy > 64 ? [...BG, 255] : colorAt(vx, vy, true);
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

/* ------------------------------------------------------------------ ICO */

/**
 * ห่อ PNG เป็นไฟล์ .ico
 *
 * .ico รุ่นใหม่ (Vista ขึ้นไป) ใส่ข้อมูล PNG ลงไปตรง ๆ ได้เลย ไม่ต้องแปลงเป็น BMP
 * จึงเหลือแค่เขียนหัวไฟล์ 6 ไบต์ กับรายการภาพอีกรายการละ 16 ไบต์
 * เบราว์เซอร์ทุกตัวที่ยังใช้กันอ่านแบบนี้ได้หมด
 */
function encodeICO(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = ไอคอน
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;

  images.forEach((img) => {
    const e = Buffer.alloc(16);
    // ขนาด 256 เขียนเป็น 0 ตามข้อกำหนดของรูปแบบไฟล์
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 0);
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 1);
    e.writeUInt8(0, 2); // จำนวนสีในจานสี (0 = ไม่ใช้จานสี)
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(img.data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += img.data.length;
    entries.push(e);
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
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

// ไอคอนบนแท็บเบราว์เซอร์ — ใส่หลายขนาดในไฟล์เดียว ให้แต่ละที่หยิบขนาดที่เหมาะไปใช้
const icoSizes = [16, 32, 48, 64];
fs.writeFileSync(
  path.join(root, "app", "favicon.ico"),
  encodeICO(icoSizes.map((size) => ({ size, data: render(size, { fullBleed: true }) })))
);
console.log("  ico     " + icoSizes.join("/") + "px  app/favicon.ico");

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
