// สร้าง lib/thaiAddress.js จากข้อมูลเขตปกครองของไทย
//
// วิธีใช้:  node tools/make-thai-address.mjs
// ต้องต่อเน็ตตอนรัน (ดึงข้อมูลจาก GitHub) แต่ผลลัพธ์เป็นไฟล์ในโปรเจกต์
// เว็บตอนใช้งานจริงจึงไม่ต้องเรียกบริการภายนอกเลย
//
// ทำไมไม่ยิง API ตอนใช้งาน:
//   ที่อยู่ลูกค้าเป็นข้อมูลที่ต้องกรอกได้ตลอด ถ้าไปพึ่งเว็บนอก
//   วันไหนเขาปิดหรือเปลี่ยน URL หน้าจอนี้จะกรอกไม่ได้ทันที
//   และเพิ่ม dependency ตอนรันซึ่งขัดกับข้อกำหนดของโปรเจกต์
//
// ที่มา: https://github.com/kongvut/thai-province-data  (MIT)
//        อ้างอิงข้อมูลของกรมการปกครอง

import { writeFile } from "node:fs/promises";

const SRC =
  "https://raw.githubusercontent.com/kongvut/thai-province-data/master/api/latest/" +
  "province_with_district_and_sub_district.json";

const OUT = new URL("../lib/thaiAddress.js", import.meta.url);

/* ------------------------------------------------------------------ ดึงข้อมูล */

console.log("ดึงข้อมูลจาก " + SRC);
const res = await fetch(SRC);
if (!res.ok) throw new Error("ดึงข้อมูลไม่สำเร็จ: HTTP " + res.status);
const provinces = await res.json();
console.log("ได้ " + provinces.length + " จังหวัด");

/* --------------------------------------------------------------- ตรวจข้อมูล */

// ตัวคั่นที่ใช้ต้องไม่โผล่ในชื่อสถานที่ ไม่งั้นแยกกลับไม่ได้
const SEPARATORS = ["\n", ";", ":", ",", "*"];

let nDistricts = 0;
let nSubs = 0;

for (const p of provinces) {
  for (const name of [p.name_th]) checkName(name);
  for (const d of p.districts) {
    nDistricts++;
    checkName(d.name_th);
    for (const s of d.sub_districts) {
      nSubs++;
      checkName(s.name_th);
      if (!/^\d{5}$/.test(String(s.zip_code))) {
        throw new Error("รหัสไปรษณีย์ผิดรูปแบบ: " + s.name_th + " = " + s.zip_code);
      }
    }
  }
}

function checkName(name) {
  if (!name) throw new Error("มีชื่อว่าง");
  for (const sep of SEPARATORS) {
    if (name.includes(sep)) throw new Error("ชื่อมีตัวคั่นปนอยู่: " + JSON.stringify(name));
  }
}

console.log("อำเภอ/เขต " + nDistricts + " · ตำบล/แขวง " + nSubs);

/* ------------------------------------------------------------------- ย่อข้อมูล */

// อำเภอส่วนใหญ่ใช้รหัสไปรษณีย์เดียวทั้งอำเภอ (มีแค่ ~200 อำเภอที่ใช้หลายรหัส)
// จึงเก็บรหัสหลักไว้ที่อำเภอ แล้วใส่รหัสรายตำบลเฉพาะตัวที่ต่างจากรหัสหลัก
// ประหยัดกว่าเก็บรหัส 5 หลักซ้ำทุกตำบลอยู่มาก
const lines = provinces.map((p) => {
  const districts = p.districts.map((d) => {
    const count = new Map();
    for (const s of d.sub_districts) {
      const z = String(s.zip_code);
      count.set(z, (count.get(z) || 0) + 1);
    }
    let main = "";
    let best = -1;
    for (const [z, n] of count) {
      if (n > best) {
        best = n;
        main = z;
      }
    }

    const subs = d.sub_districts.map((s) => {
      const z = String(s.zip_code);
      return z === main ? s.name_th : s.name_th + "*" + z;
    });

    return d.name_th + ":" + main + ":" + subs.join(",");
  });

  return p.name_th + ";" + districts.join(";");
});

const raw = lines.join("\n");

/* -------------------------------------------------------------- เขียนไฟล์ */

const today = new Date().toISOString().slice(0, 10);

const file = `// ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์ ของไทย — ข้อมูลนิ่ง ไม่ต้องเรียกเว็บนอก
//
// ไฟล์นี้สร้างด้วย tools/make-thai-address.mjs อย่าแก้ด้วยมือ
// อัปเดตข้อมูล: node tools/make-thai-address.mjs
//
// ที่มา: https://github.com/kongvut/thai-province-data (MIT) อ้างอิงกรมการปกครอง
// ดึงเมื่อ ${today} — ${provinces.length} จังหวัด ${nDistricts} อำเภอ/เขต ${nSubs} ตำบล/แขวง
//
// รูปแบบข้อมูล (ย่อให้ไฟล์เล็ก แตกกลับตอนใช้ครั้งแรกครั้งเดียว):
//   หนึ่งบรรทัด = หนึ่งจังหวัด    ชื่อจังหวัด;อำเภอ;อำเภอ;...
//   อำเภอ                        ชื่ออำเภอ:รหัสไปรษณีย์หลัก:ตำบล,ตำบล,...
//   ตำบล                         ชื่อตำบล  หรือ  ชื่อตำบล*รหัสไปรษณีย์ (ถ้าต่างจากรหัสหลัก)
//
// ไฟล์นี้ใหญ่ (~${Math.round(Buffer.byteLength(raw) / 1024)} KB) จึงตั้งใจให้ import แบบ dynamic
// จากหน้าจอที่ใช้จริงเท่านั้น ไม่ให้ติดไปกับ bundle ของทุกหน้า

const RAW = \`${raw}\`;

/**
 * แตกข้อมูลเป็น Map ตอนเรียกใช้ครั้งแรกครั้งเดียว
 * โครงสร้าง: Map<จังหวัด, Map<อำเภอ, Map<ตำบล, รหัสไปรษณีย์>>>
 */
let TREE = null;

function tree() {
  if (TREE) return TREE;

  TREE = new Map();
  for (const line of RAW.split("\\n")) {
    const parts = line.split(";");
    const districts = new Map();

    for (let i = 1; i < parts.length; i++) {
      const [dName, mainZip, subList] = splitDistrict(parts[i]);
      const subs = new Map();
      for (const item of subList.split(",")) {
        const at = item.indexOf("*");
        if (at < 0) subs.set(item, mainZip);
        else subs.set(item.slice(0, at), item.slice(at + 1));
      }
      districts.set(dName, subs);
    }

    TREE.set(parts[0], districts);
  }
  return TREE;
}

/** ชื่ออำเภอห้ามมี ":" อยู่แล้ว จึงตัดสองตัวแรกแล้วเหลือที่เหลือเป็นรายชื่อตำบล */
function splitDistrict(chunk) {
  const a = chunk.indexOf(":");
  const b = chunk.indexOf(":", a + 1);
  return [chunk.slice(0, a), chunk.slice(a + 1, b), chunk.slice(b + 1)];
}

/** รายชื่อจังหวัดทั้งหมด เรียงตามตัวอักษรไทย */
export function provinces() {
  return [...tree().keys()].sort((a, b) => a.localeCompare(b, "th"));
}

/** อำเภอ/เขต ของจังหวัดนั้น — จังหวัดที่ไม่รู้จักคืนรายการว่าง */
export function districtsOf(province) {
  const d = tree().get(province);
  return d ? [...d.keys()].sort((a, b) => a.localeCompare(b, "th")) : [];
}

/** ตำบล/แขวง ของอำเภอนั้น — คู่ที่ไม่รู้จักคืนรายการว่าง */
export function subdistrictsOf(province, district) {
  const d = tree().get(province);
  const s = d && d.get(district);
  return s ? [...s.keys()].sort((a, b) => a.localeCompare(b, "th")) : [];
}

/** รหัสไปรษณีย์ของตำบลนั้น — หาไม่เจอคืนค่าว่าง */
export function postcodeOf(province, district, subdistrict) {
  const d = tree().get(province);
  const s = d && d.get(district);
  return (s && s.get(subdistrict)) || "";
}

/**
 * กรุงเทพฯ เรียก เขต/แขวง จังหวัดอื่นเรียก อำเภอ/ตำบล
 * ป้ายบนหน้าจอต้องเปลี่ยนตาม ไม่งั้นคนกรุงเทพฯ จะสะดุดว่าทำไมเรียกผิด
 */
export function addressWords(province) {
  return province === "กรุงเทพมหานคร"
    ? { district: "เขต", subdistrict: "แขวง" }
    : { district: "อำเภอ", subdistrict: "ตำบล" };
}
`;

await writeFile(OUT, file, "utf8");
console.log("เขียน lib/thaiAddress.js แล้ว (" + Math.round(file.length / 1024) + " KB)");
