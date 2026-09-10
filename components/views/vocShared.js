// ของที่ทุกหน้าจอในหมวดการรับฟังลูกค้าใช้ร่วมกัน
//
// แยกไว้ที่เดียวเพราะทั้งเจ็ดหน้าจอในหมวดนี้ต้องบอกชื่อตารางชุดเดียวกัน
// ตอนขึ้นข้อความ "ยังใช้งานไม่ได้" ถ้าเขียนซ้ำในแต่ละหน้า วันเพิ่มตารางใหม่
// จะมีหน้าหนึ่งที่ลืมแก้ แล้วคนใช้จะได้คำแนะนำที่ไม่ครบ

/** ตารางทั้งหมดของหมวดนี้ — ต้องตรงกับ vocReady ใน lib/api.js */
export const VOC_TABLES = [
  "voc_channels",
  "voc_records",
  "voc_surveys",
  "voc_survey_results",
  "voc_actions",
  "voc_levels",
];

/** สีของแถบระดับ 1-5 — ระดับสูงขึ้นสีเข้มขึ้น */
export const LEVEL_KINDS = ["gray", "err", "warn", "info", "ok", "ok"];

/** ป้ายบอกระดับที่ได้ */
export const levelLabel = (n) => (n > 0 ? "ระดับ " + n : "ยังไม่ผ่านระดับ 1");

/**
 * ออกรหัสถัดไปของทะเบียนหนึ่ง เช่น VOC-0007
 *
 * ดูจากรหัสที่มีอยู่จริง ไม่ใช่นับจำนวนแถว
 * เพราะลบแถวกลาง ๆ ทิ้งแล้วนับจำนวนจะได้รหัสซ้ำกับของเดิมทันที
 */
export function nextCode(list, prefix, width = 4) {
  let max = 0;
  (list || []).forEach((x) => {
    const m = String(x.code || "").match(new RegExp("^" + prefix + "-?(\\d+)$", "i"));
    if (m) max = Math.max(max, Number(m[1]) || 0);
  });
  return prefix + "-" + String(max + 1).padStart(width, "0");
}
