// ทะเบียนกลุ่มสินค้า · ยี่ห้อสินค้า · ประเภทสินค้า
//
// สามอย่างนี้โครงเหมือนกันเป๊ะ (รหัส + ชื่อ) ต่างกันแค่ความหมาย
// จึงเก็บในตารางเดียวแล้วแยกด้วยคอลัมน์ dim ไม่ได้ทำสามตาราง
//   ถ้าแยกสามตาราง ต้องเขียนตัวแปลง หน้าจอ ตัวนำเข้า และการสำรองข้อมูลซ้ำสามชุด
//   ทุกครั้งที่แก้กติกาต้องไล่แก้สามที่ แล้วจะมีที่หนึ่งที่ลืมเสมอ
//   และถ้าวันหน้าเพิ่มมิติที่สี่ (เช่น รุ่นสินค้า) จะเพิ่มได้โดยไม่ต้องสร้างตารางใหม่
//
// สิ่งที่เก็บลงในตัวสินค้าคือ "ชื่อ" ไม่ใช่ "รหัส"
//   เพราะระบบเก็บเป็นชื่อมาก่อนหน้านี้แล้ว และเป้าขายจับคู่ด้วยชื่อเหมือนกัน
//   ถ้าเปลี่ยนไปเก็บรหัส สินค้าและเป้าขายที่มีอยู่เดิมจะจับคู่กันไม่ติดทั้งหมดทันที
//   รหัสมีไว้เรียงลำดับ ค้นหา และอ้างอิงตอนนำเข้าจาก Excel

/** มิติที่จัดทะเบียนได้ — id ตรงกับชื่อคอลัมน์ในตารางสินค้า */
export const TERM_DIMS = [
  {
    id: "grp",
    dim: "GRP",
    name: "กลุ่มสินค้า",
    hint: "ใช้ตั้งเป้าขายแยกรายกลุ่ม",
    sample: "วัตถุดิบ",
  },
  {
    id: "brand",
    dim: "BRAND",
    name: "ยี่ห้อสินค้า",
    hint: "ใช้กรองที่ Quick View และตั้งเป้าขายรายยี่ห้อ",
    sample: "ตราช้าง",
  },
  {
    id: "kind",
    dim: "KIND",
    name: "ประเภทสินค้า",
    hint: "ใช้แยกว่าเป็นสินค้าสำเร็จรูปหรือกึ่งสำเร็จรูป",
    sample: "สินค้าสำเร็จรูป",
  },
];

export const dimOf = (id) => TERM_DIMS.find((d) => d.id === id || d.dim === id) || TERM_DIMS[0];

/** ความยาวสูงสุด — ต้องตรงกับ constraint ใน schema.sql (กติกาเดียวกับพนักงานขาย) */
export const CODE_MAX = 50;
export const NAME_MAX = 200;

/** รายการในทะเบียนของมิติหนึ่ง เรียงตามรหัส */
export const termsOf = (db, id) =>
  ((db && db.productTerms) || [])
    .filter((t) => t.dim === dimOf(id).dim)
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code, "th"));

/**
 * ตรวจก่อนบันทึก คืนรายการสิ่งที่ยังไม่ผ่าน
 * @param {object} t ค่าที่กรอก
 * @param {Array} list รายการในมิติเดียวกัน ใช้เช็ครหัสซ้ำ
 */
export function problemsOf(t, list) {
  const out = [];
  const code = String(t.code || "").trim();
  const name = String(t.name || "").trim();

  if (!code) out.push("รหัส");
  else if (code.length > CODE_MAX) out.push("รหัสยาวเกิน " + CODE_MAX + " ตัวอักษร");
  else if ((list || []).some((x) => x.id !== t.id && x.code.toLowerCase() === code.toLowerCase())) {
    out.push("รหัสนี้มีอยู่แล้ว");
  }

  if (!name) out.push("ชื่อ");
  else if (name.length > NAME_MAX) out.push("ชื่อยาวเกิน " + NAME_MAX + " ตัวอักษร");
  else if ((list || []).some((x) => x.id !== t.id && x.name.toLowerCase() === name.toLowerCase())) {
    // ชื่อซ้ำเป็นปัญหาจริง เพราะตัวสินค้าเก็บ "ชื่อ" ไว้ ถ้ามีสองรหัสชื่อเดียวกัน
    // จะแยกไม่ออกว่าสินค้าตัวนั้นหมายถึงรายการไหน และเป้าขายจะนับรวมกันทั้งคู่
    out.push("ชื่อนี้มีอยู่แล้ว (ชื่อซ้ำกันจะแยกไม่ออกตอนตั้งเป้าขาย)");
  }

  return out;
}

/**
 * ตัวเลือกสำหรับช่องกดเลือกที่หน้าแก้ไขสินค้า
 *
 * รวมสองแหล่ง: ทะเบียนที่ตั้งไว้ กับค่าที่สินค้าตัวอื่นใช้อยู่แล้วแต่ยังไม่ได้จดทะเบียน
 *   ถ้าเอาเฉพาะทะเบียน ค่าที่พิมพ์ไว้ก่อนมีหน้านี้จะหายไปจากรายการ
 *   แล้วคนแก้สินค้าเก่าจะเลือกค่าเดิมของตัวเองไม่ได้ กลายเป็นบังคับให้ตั้งใหม่ทั้งระบบ
 * ค่าที่ยังไม่ได้จดทะเบียนจะติดป้ายไว้ ให้รู้ว่าควรไปจดทะเบียนให้เรียบร้อย
 *
 * @param {object} db ข้อมูลทั้งก้อน
 * @param {string} id มิติ (grp / brand / kind)
 * @param {string} current ค่าที่สินค้าตัวนี้ใช้อยู่ ต้องมีในรายการเสมอแม้ไม่มีที่ไหนแล้ว
 */
export function optionsFor(db, id, current) {
  const d = dimOf(id);
  const registered = termsOf(db, id);
  const seen = new Set(registered.map((t) => t.name.toLowerCase()));

  const loose = Array.from(
    new Set(
      ((db && db.products) || [])
        .map((p) => String(p[d.id] || "").trim())
        .filter((v) => v && !seen.has(v.toLowerCase()))
    )
  ).sort((a, b) => a.localeCompare(b, "th"));

  const cur = String(current || "").trim();
  const extra =
    cur && !seen.has(cur.toLowerCase()) && !loose.some((v) => v.toLowerCase() === cur.toLowerCase())
      ? [cur]
      : [];

  return [
    ...registered.map((t) => ({ value: t.name, label: t.name, code: t.code, meta: t.note })),
    ...[...loose, ...extra].map((v) => ({
      value: v,
      label: v,
      meta: "ยังไม่ได้จดทะเบียน",
      search: "ยังไม่ได้จดทะเบียน",
    })),
  ];
}

/** จำนวนสินค้าที่ใช้รายการนี้อยู่ ใช้เตือนก่อนลบและแสดงในตาราง */
export const usedBy = (db, id, name) =>
  ((db && db.products) || []).filter(
    (p) => String(p[dimOf(id).id] || "").trim().toLowerCase() === String(name || "").trim().toLowerCase()
  ).length;

/** ค่าที่ถูกใช้ในสินค้าแต่ยังไม่ได้จดทะเบียน — เอาไว้ชวนให้จดให้ครบ */
export function unregistered(db, id) {
  const seen = new Set(termsOf(db, id).map((t) => t.name.toLowerCase()));
  return Array.from(
    new Set(
      ((db && db.products) || [])
        .map((p) => String(p[dimOf(id).id] || "").trim())
        .filter((v) => v && !seen.has(v.toLowerCase()))
    )
  ).sort((a, b) => a.localeCompare(b, "th"));
}
