// สร้างไฟล์คู่มือการใช้งานหมวดการรับฟังลูกค้า (.docx)
//
// รัน: node tools/make-voc-manual.mjs
//
// เนื้อหามาจาก lib/vocManual.js ซึ่งดึงข้อความเกณฑ์และรายการตั้งต้นจาก lib/voc.js อีกที
// แก้เกณฑ์ที่เดียว คู่มือเปลี่ยนตามเองทั้งเล่ม ไม่ต้องไล่แก้ไฟล์ Word ด้วยมือ
//
// ไฟล์เดียวกันนี้กดสร้างจากในโปรแกรมได้ด้วย (หน้ารายงานและนำเสนอ > ปุ่ม คู่มือ Word)
// ที่มีสคริปต์นี้ด้วยเพราะอยากให้ไฟล์คู่มืออยู่ในโครงงานตั้งแต่แรก
// คนที่เพิ่งเข้ามาจะได้อ่านได้ทันทีโดยไม่ต้องเปิดระบบก่อน

import fs from "node:fs";
import path from "node:path";
import { buildDOCX } from "../lib/docx.js";
import { buildManual } from "../lib/vocManual.js";

/** วันที่แบบไทย เขียนเองเพราะไฟล์นี้รันนอกเบราว์เซอร์ */
function thaiDate(d) {
  const months = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];
  return d.getDate() + " " + months[d.getMonth()] + " " + (d.getFullYear() + 543);
}

const org = process.argv[2] || "";
const doc = buildManual({ org, dateText: thaiDate(new Date()) });
const bytes = buildDOCX(doc);

const out = path.join(process.cwd(), "Docs", "คู่มือการรับฟังลูกค้า.docx");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, bytes);

const tables = doc.blocks.filter((b) => b.kind === "table").length;
const heads = doc.blocks.filter((b) => b.kind === "h1").length;

console.log("เขียน " + path.relative(process.cwd(), out) + " แล้ว (" + Math.round(bytes.length / 1024) + " KB)");
console.log("  บท/ภาคผนวก   " + heads + " หัวข้อใหญ่");
console.log("  ตาราง        " + tables + " ตาราง");
console.log("  บล็อกเนื้อหา  " + doc.blocks.length + " บล็อก");
