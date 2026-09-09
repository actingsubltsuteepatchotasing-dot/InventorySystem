// รายการให้เลือกที่มาจาก "ทะเบียนที่ตั้งไว้" บวก "ค่าที่ข้อมูลจริงใช้อยู่"
//
// ใช้ร่วมกันระหว่างทะเบียนกลุ่ม/ยี่ห้อ/ประเภทสินค้า กับทะเบียนประเภทลูกค้า
// เพราะทั้งสองที่มีปัญหาเดียวกันเป๊ะ: ตอนเพิ่มหน้าทะเบียนเข้ามาทีหลัง
// ข้อมูลเดิมมีค่าที่พิมพ์ไว้เองอยู่แล้ว ถ้าช่องเลือกแสดงเฉพาะทะเบียน
// ค่าเดิมจะหายไปจากรายการ กลายเป็นบังคับให้ตั้งทะเบียนใหม่ทั้งระบบ
// ก่อนถึงจะแก้ข้อมูลเก่าได้ ซึ่งไม่มีใครยอมทำ
//
// เขียนที่เดียวเพราะกติกาการรวมสามอย่างนี้ต้องเหมือนกันทุกที่:
//   1. ทะเบียนมาก่อน (มีรหัสให้ค้นหา)
//   2. ค่าที่ใช้อยู่แต่ยังไม่ได้จดทะเบียน ตามมาและติดป้ายไว้
//   3. ค่าปัจจุบันของแถวที่กำลังแก้ ต้องอยู่ในรายการเสมอ แม้ไม่เหลือที่ไหนแล้ว
//      (ไม่งั้นเปิดฟอร์มมาแล้วช่องจะว่าง แล้วกดบันทึกทีเดียวค่าเดิมหายทันที)

const txt = (v) => String(v == null ? "" : v).trim();

/** ป้ายที่ติดให้ค่าที่ยังไม่ได้จดทะเบียน — ใช้เป็นทั้งข้อความและคำค้น */
export const UNREGISTERED = "ยังไม่ได้จดทะเบียน";

/**
 * รวมทะเบียนกับค่าที่ใช้อยู่จริงให้เป็นรายการเดียว
 *
 * @param {Array<{code: string, name: string, note?: string}>} registered ทะเบียนที่ตั้งไว้
 * @param {string[]} used ค่าที่ข้อมูลจริงใช้อยู่ (ซ้ำได้ ระบบตัดให้เอง)
 * @param {string} current ค่าปัจจุบันของแถวที่กำลังแก้
 * @returns {Array<{value, label, code?, meta?, search?}>} ตัวเลือกสำหรับ SearchSelect
 */
export function mergeChoices(registered, used, current) {
  const list = registered || [];
  const seen = new Set(list.map((t) => t.name.toLowerCase()));

  const loose = Array.from(
    new Set((used || []).map(txt).filter((v) => v && !seen.has(v.toLowerCase())))
  ).sort((a, b) => a.localeCompare(b, "th"));

  const cur = txt(current);
  const extra =
    cur && !seen.has(cur.toLowerCase()) && !loose.some((v) => v.toLowerCase() === cur.toLowerCase())
      ? [cur]
      : [];

  return [
    ...list.map((t) => ({ value: t.name, label: t.name, code: t.code, meta: t.note })),
    ...[...loose, ...extra].map((v) => ({
      value: v,
      label: v,
      meta: UNREGISTERED,
      search: UNREGISTERED,
    })),
  ];
}

/** ค่าที่ข้อมูลจริงใช้อยู่แต่ยังไม่มีในทะเบียน — เอาไว้ชวนให้จดให้ครบ */
export function unregisteredOf(registered, used) {
  const seen = new Set((registered || []).map((t) => t.name.toLowerCase()));
  return Array.from(
    new Set((used || []).map(txt).filter((v) => v && !seen.has(v.toLowerCase())))
  ).sort((a, b) => a.localeCompare(b, "th"));
}

/**
 * ตรวจทะเบียนที่มีแค่ "รหัส + ชื่อ" ก่อนบันทึก
 *
 * ใช้ร่วมกันเพราะกติกาเหมือนกัน: รหัสห้ามซ้ำ และชื่อก็ห้ามซ้ำ
 * ชื่อห้ามซ้ำเพราะข้อมูลจริง (สินค้า / ลูกค้า) เก็บ "ชื่อ" ไว้ ไม่ได้เก็บรหัส
 * สองรหัสชื่อเดียวกันจะแยกไม่ออกว่าแถวนั้นหมายถึงรายการไหน
 *
 * @param {object} v ค่าที่กรอก
 * @param {Array} list รายการทั้งหมดในทะเบียนเดียวกัน
 * @param {object} label ชื่อช่องที่จะใช้ในข้อความ { code, name }
 * @param {object} max ความยาวสูงสุด { code, name }
 */
export function registryProblems(v, list, label, max) {
  const out = [];
  const code = txt(v.code);
  const name = txt(v.name);
  const all = list || [];

  if (!code) out.push(label.code);
  else if (code.length > max.code) out.push("รหัสยาวเกิน " + max.code + " ตัวอักษร");
  else if (all.some((x) => x.id !== v.id && x.code.toLowerCase() === code.toLowerCase())) {
    out.push("รหัสนี้มีอยู่แล้ว");
  }

  if (!name) out.push(label.name);
  else if (name.length > max.name) out.push("ชื่อยาวเกิน " + max.name + " ตัวอักษร");
  else if (all.some((x) => x.id !== v.id && x.name.toLowerCase() === name.toLowerCase())) {
    out.push("ชื่อนี้มีอยู่แล้ว (ชื่อซ้ำกันจะแยกไม่ออกว่าหมายถึงรายการไหน)");
  }

  return out;
}
