// ประกอบไฟล์ zip เอง — ไม่ใช้ไลบรารี
//
// แยกออกมาจาก lib/xlsx.js เพราะตอนนี้มีสองที่ที่ต้องใช้:
//   lib/xlsx.js  ไฟล์ Excel (.xlsx)
//   lib/pptx.js  ไฟล์นำเสนอ PowerPoint (.pptx)
// ทั้งสองรูปแบบคือ zip ที่ข้างในเป็น XML หลายไฟล์ (Open XML) ต่างกันแค่เนื้อใน
// ถ้าปล่อยให้แต่ละไฟล์เขียน zip เอง วันที่แก้บั๊กของตัวประกอบ zip จะต้องไล่แก้หลายที่
//
// เขียนแบบ "ไม่บีบอัด" (stored) จึงไม่ต้องมีตัวบีบอัด ใช้แค่ CRC32 ที่เขียนเองได้
// ไฟล์ใหญ่กว่าแบบบีบอัดอยู่บ้าง แต่เอกสารระดับนี้ก็ยังไม่กี่เมกะไบต์

/* ------------------------------------------------------------------ CRC32 */

/** ตารางค่า CRC32 สร้างครั้งเดียวตอนใช้ครั้งแรก */
let CRC_TABLE = null;

function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[i] = c >>> 0;
  }
  return CRC_TABLE;
}

export function crc32(bytes) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* -------------------------------------------------------------------- zip */

export const utf8 = (s) => new TextEncoder().encode(s);

/**
 * ประกอบไฟล์ zip จากรายการ { name, data }
 *
 * โครงของ zip: [ส่วนหัว+ข้อมูลของแต่ละไฟล์] แล้วตามด้วย [สารบัญ] และ [ท้ายสารบัญ]
 * สารบัญต้องรู้ว่าไฟล์แต่ละอันเริ่มที่ไบต์ที่เท่าไร จึงต้องเดินสองรอบ
 *
 * @param {Array<{name:string, data:string}>} files ชื่อไฟล์ในซิปกับเนื้อไฟล์ (ข้อความล้วน)
 * @returns {Uint8Array} เนื้อไฟล์ zip
 */
export function zip(files) {
  const parts = [];
  const dir = [];
  let offset = 0;

  const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

  files.forEach((f) => {
    const name = utf8(f.name);
    const data = utf8(f.data);
    const sum = crc32(data);

    // เวลาแก้ไขไฟล์ ตั้งเป็นค่าคงที่ไปเลย ไฟล์เดิมจะได้ไบต์เดิมทุกครั้ง
    // (เทียบไฟล์สองครั้งแล้วต่างกันเพราะนาฬิกา เป็นเรื่องที่ตามหาสาเหตุยาก)
    const time = 0;
    const date = (2020 - 1980) * 512 + 1 * 32 + 1;

    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0),
      ...u16(time), ...u16(date),
      ...u32(sum), ...u32(data.length), ...u32(data.length),
      ...u16(name.length), ...u16(0),
    ];
    parts.push(new Uint8Array(local), name, data);

    dir.push({ name, sum, size: data.length, offset });
    offset += local.length + name.length + data.length;
  });

  const central = [];
  dir.forEach((e) => {
    central.push(
      new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
        ...u16(0), ...u16((2020 - 1980) * 512 + 1 * 32 + 1),
        ...u32(e.sum), ...u32(e.size), ...u32(e.size),
        ...u16(e.name.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0),
        ...u32(e.offset),
      ]),
      e.name
    );
  });

  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(dir.length), ...u16(dir.length),
    ...u32(cdSize), ...u32(offset), ...u16(0),
  ]);

  const all = [...parts, ...central, end];
  const total = all.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  all.forEach((b) => {
    out.set(b, at);
    at += b.length;
  });
  return out;
}

/**
 * แปลงอักขระที่ XML ห้ามใช้ตรง ๆ
 *
 * ใช้ร่วมกันทั้ง .xlsx และ .pptx เพราะทั้งคู่เป็น XML
 * อักขระควบคุม (นอกจาก tab/ขึ้นบรรทัด) ทำให้ Office ฟ้องว่าไฟล์เสีย จึงตัดทิ้ง
 */
export const xmlEsc = (v) =>
  String(v === undefined || v === null ? "" : v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
