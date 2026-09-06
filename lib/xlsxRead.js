// อ่านไฟล์ Excel (.xlsx) และ CSV ให้กลายเป็นตารางสองมิติ
//
// คู่กับ lib/xlsx.js ที่ทำหน้าที่ "เขียน" ไฟล์ออกไป ไฟล์นี้ทำหน้าที่ "อ่าน" กลับเข้ามา
//
// ทำไมไม่ลงไลบรารีอ่าน xlsx:
//   โปรเจกต์นี้ไม่เพิ่ม dependency และไลบรารีพวกนั้นใหญ่กว่าตัวโปรแกรมทั้งระบบ
//   ทั้งที่เราต้องการแค่ "ตารางข้อความ" ไม่ได้ต้องการสูตร รูปแบบ หรือกราฟ
//
// .xlsx คือไฟล์ zip ที่ข้างในเป็น XML ไฟล์นี้จึงทำสามอย่าง:
//   1. แกะ zip เอง (อ่าน central directory แล้วตัดข้อมูลออกมาทีละไฟล์)
//   2. คลายการบีบอัดด้วย DecompressionStream("deflate-raw") ที่มีมากับเบราว์เซอร์
//      ซึ่งเป็นวิธีเดียวที่คลาย deflate ได้โดยไม่ต้องเขียน inflate เอง
//   3. อ่าน XML ด้วย DOMParser ที่มีมากับเบราว์เซอร์เหมือนกัน
//
// ข้อจำกัดที่ยอมรับ: อ่านชีตแรกชีตเดียว และได้ค่าเป็นข้อความล้วน
// ซึ่งพอสำหรับการนำเข้าข้อมูล เพราะรหัสลูกค้าอย่าง "0001" ต้องคงศูนย์นำหน้าไว้อยู่แล้ว

/* ------------------------------------------------------------------ zip */

const u16 = (v, i) => v.getUint16(i, true);
const u32 = (v, i) => v.getUint32(i, true);

/**
 * แกะไฟล์ zip เป็น Map ของ ชื่อไฟล์ -> Uint8Array
 *
 * อ่านจาก central directory ท้ายไฟล์ ไม่ใช่ไล่อ่านจากหัวไฟล์ไปเรื่อย ๆ
 * เพราะ local header บางตัวไม่ได้ใส่ขนาดไว้ (ใช้ data descriptor แทน)
 * ซึ่งจะทำให้ไม่รู้ว่าข้อมูลของไฟล์นั้นจบตรงไหน
 */
async function unzip(buf) {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);

  // หา End of Central Directory — ไล่จากท้ายไฟล์ เพราะมีคอมเมนต์ต่อท้ายได้
  let eocd = -1;
  const from = Math.max(0, bytes.length - 66000);
  for (let i = bytes.length - 22; i >= from; i--) {
    if (u32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ไฟล์นี้ไม่ใช่ไฟล์ zip/xlsx ที่อ่านได้");

  const count = u16(view, eocd + 10);
  let p = u32(view, eocd + 16);

  const out = new Map();
  for (let n = 0; n < count; n++) {
    if (u32(view, p) !== 0x02014b50) break;

    const method = u16(view, p + 10);
    const compSize = u32(view, p + 20);
    const nameLen = u16(view, p + 28);
    const extraLen = u16(view, p + 30);
    const cmtLen = u16(view, p + 32);
    const localAt = u32(view, p + 42);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));

    // ความยาว extra ของ local header ไม่จำเป็นต้องเท่ากับของ central directory
    const lNameLen = u16(view, localAt + 26);
    const lExtraLen = u16(view, localAt + 28);
    const start = localAt + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(start, start + compSize);

    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflateRaw(raw));
    else throw new Error("ไฟล์ในนี้บีบอัดด้วยวิธีที่อ่านไม่ได้ (method " + method + ")");

    p += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

/** คลาย deflate ด้วยความสามารถที่มีมากับเบราว์เซอร์ */
async function inflateRaw(data) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "เบราว์เซอร์นี้อ่านไฟล์ .xlsx ไม่ได้ (ไม่มี DecompressionStream) — ให้บันทึกเป็น .csv แล้วนำเข้าแทน"
    );
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ------------------------------------------------------------------ xlsx */

const text = (bytes) => new TextDecoder().decode(bytes);

/** แปลงชื่อคอลัมน์แบบ A, B, ... AA เป็นเลขลำดับเริ่มที่ 0 */
function colOf(ref) {
  let n = 0;
  for (const ch of String(ref)) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/** ข้อความของ <si> หนึ่งก้อน — รวมทุก <t> เพราะข้อความที่มีหลายรูปแบบถูกหั่นเป็นหลายชิ้น */
const textOf = (el) =>
  Array.from(el.getElementsByTagName("t"))
    .map((t) => t.textContent)
    .join("");

/**
 * อ่าน .xlsx เป็นตารางสองมิติของข้อความ
 * @param {ArrayBuffer} buf เนื้อไฟล์
 * @returns {Promise<string[][]>}
 */
export async function readXLSX(buf) {
  const files = await unzip(buf);
  const parser = new DOMParser();

  // ตารางข้อความรวม — xlsx เก็บข้อความซ้ำ ๆ ไว้ที่เดียวแล้วอ้างด้วยเลขลำดับ
  let shared = [];
  const ss = files.get("xl/sharedStrings.xml");
  if (ss) {
    const doc = parser.parseFromString(text(ss), "application/xml");
    shared = Array.from(doc.getElementsByTagName("si")).map(textOf);
  }

  // ชีตแรก — ปกติคือ sheet1.xml แต่บางโปรแกรมตั้งชื่ออื่น จึงเผื่อไว้
  let sheetName = "xl/worksheets/sheet1.xml";
  if (!files.has(sheetName)) {
    sheetName = [...files.keys()].find((k) => /^xl\/worksheets\/.*\.xml$/.test(k));
  }
  if (!sheetName) throw new Error("ไม่พบชีตข้อมูลในไฟล์นี้");

  const doc = parser.parseFromString(text(files.get(sheetName)), "application/xml");
  const rows = [];

  Array.from(doc.getElementsByTagName("row")).forEach((row) => {
    const cells = [];
    Array.from(row.getElementsByTagName("c")).forEach((c) => {
      const at = colOf(c.getAttribute("r") || "");
      const type = c.getAttribute("t") || "";

      let value = "";
      if (type === "inlineStr") {
        value = textOf(c);
      } else {
        const v = c.getElementsByTagName("v")[0];
        const rawValue = v ? v.textContent : "";
        if (type === "s") value = shared[Number(rawValue)] || "";
        else if (type === "b") value = rawValue === "1" ? "TRUE" : "FALSE";
        else value = rawValue;
      }

      if (at >= 0) cells[at] = value;
    });

    // ช่องที่ไม่มีค่าเลย xlsx จะไม่เขียนแท็กไว้ ทำให้เกิดรูโหว่ในอาร์เรย์
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
    rows.push(cells);
  });

  return rows;
}

/* ------------------------------------------------------------------- csv */

/**
 * อ่าน CSV เป็นตารางสองมิติ
 *
 * เขียนเองเพราะต้องรองรับค่าที่มีลูกน้ำหรือขึ้นบรรทัดใหม่อยู่ข้างในเครื่องหมายคำพูด
 * ซึ่งการ split(",") ธรรมดาจะพังทันทีเมื่อเจอที่อยู่ลูกค้าที่มีลูกน้ำ
 */
export function readCSV(str) {
  const s = String(str).replace(/^﻿/, ""); // ตัด BOM ที่ Excel ใส่มา
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }

    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }

  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * อ่านไฟล์ที่ผู้ใช้เลือกมา ไม่ว่าจะเป็น .xlsx หรือ .csv
 * @param {File} file
 * @returns {Promise<string[][]>}
 */
export async function readTable(file) {
  const name = String(file.name || "").toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return readCSV(await file.text());
  if (name.endsWith(".xlsx")) return readXLSX(await file.arrayBuffer());

  throw new Error(
    "รองรับเฉพาะไฟล์ .xlsx และ .csv — ไฟล์ .xls รุ่นเก่าให้เปิดใน Excel แล้วบันทึกใหม่เป็น .xlsx ก่อน"
  );
}
