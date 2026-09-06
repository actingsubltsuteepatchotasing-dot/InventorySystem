// เป้าขาย — การจับคู่เป้ากับยอดขายจริง
//
// แยกจากหน้าจอเพราะใช้ร่วมกันสามที่: หน้ากำหนดเป้าขาย · Quick View · แดชบอร์ด
// ถ้าเขียนซ้ำในแต่ละหน้า ตัวเลขจะไม่ตรงกันทันทีที่แก้ที่ใดที่หนึ่ง
//
// กติกาการจับคู่ (ต้องเข้าใจตรงกันทุกที่):
//   เป้าหนึ่งแถวมีสี่มิติ: พนักงานขาย · กลุ่มสินค้า · ยี่ห้อ · ประเภท
//   มิติไหนเว้นว่าง = ไม่จำกัดมิตินั้น (เป้ารวมของทุกคน / ทุกยี่ห้อ)
//
//   เป้าที่ไม่ระบุมิติสินค้าเลย เทียบกับ "ยอดสุทธิของทั้งใบ"
//   เป้าที่ระบุมิติสินค้า เทียบกับ "ยอดเฉพาะบรรทัดที่สินค้าตรงมิตินั้น"
//     เพราะใบเดียวมีสินค้าหลายยี่ห้อได้ ถ้านับทั้งใบให้ยี่ห้อหนึ่ง
//     ยอดของยี่ห้ออื่นในใบเดียวกันจะถูกนับซ้ำเข้าไปด้วย
//
//   ยอดที่ใช้เทียบคือยอด "ก่อนภาษี" (base) ไม่ใช่ยอดสุทธิที่รวมภาษี
//     เพราะเป้าขายที่คนตั้งกันคือยอดขายจริง ไม่ได้รวมภาษีที่เก็บแทนรัฐ
//     และอัตราภาษีปรับได้รายใบ ถ้าใช้ยอดรวมภาษี เป้าจะขยับตามอัตราภาษีโดยไม่ตั้งใจ

/** เดือนของวันที่แบบ YYYY-MM-DD คืนเป็นเลข 1-12 */
const monthOf = (iso) => Number(String(iso || "").slice(5, 7)) || 0;

/** ปีของวันที่แบบ YYYY-MM-DD */
const yearOf = (iso) => Number(String(iso || "").slice(0, 4)) || 0;

/** ใบขายใบนี้อยู่ในงวดของเป้านี้หรือไม่ (month = 0 คือทั้งปี) */
export function inPeriod(target, invoice) {
  if (yearOf(invoice.date) !== Number(target.year)) return false;
  if (!Number(target.month)) return true;
  return monthOf(invoice.date) === Number(target.month);
}

/** สินค้าชิ้นนี้ตรงกับมิติสินค้าของเป้านี้หรือไม่ */
export function productMatches(target, product) {
  if (!product) return false;
  if (target.grp && product.grp !== target.grp) return false;
  if (target.brand && product.brand !== target.brand) return false;
  if (target.kind && product.kind !== target.kind) return false;
  return true;
}

/** เป้านี้ระบุมิติสินค้าไว้หรือไม่ */
export const hasProductScope = (t) => !!(t.grp || t.brand || t.kind);

/**
 * ยอดขายจริงที่เข้าเกณฑ์ของเป้านี้
 *
 * @param {object} db ข้อมูลทั้งระบบ
 * @param {object} target เป้าหนึ่งแถว
 * @returns {{amount:number, qty:number, docs:number}}
 */
export function actualOf(db, target) {
  const invoices = (db.invoices || []).filter((v) => {
    if (!inPeriod(target, v)) return false;
    if (target.salesId && v.salesId !== target.salesId) return false;
    return true;
  });

  // ไม่ระบุมิติสินค้า = นับทั้งใบ
  if (!hasProductScope(target)) {
    return {
      amount: invoices.reduce((s, v) => s + (Number(v.base) || 0), 0),
      qty: 0,
      docs: invoices.length,
    };
  }

  // ระบุมิติสินค้า = นับเฉพาะบรรทัดที่สินค้าตรงมิตินั้น
  const ids = new Set(invoices.map((v) => v.id));
  const byId = new Map((db.products || []).map((p) => [p.id, p]));

  let amount = 0;
  let qty = 0;
  const docs = new Set();

  (db.invoiceItems || []).forEach((i) => {
    if (!ids.has(i.invoiceId)) return;
    if (!productMatches(target, byId.get(i.productId))) return;
    amount += Number(i.amount) || 0;
    qty += Number(i.qty) || 0;
    docs.add(i.invoiceId);
  });

  return { amount, qty, docs: docs.size };
}

/**
 * เป้าหนึ่งแถวพร้อมผลเทียบ
 * @returns {{target, actual, pct, diff, done}}
 */
export function compare(db, target) {
  const actual = actualOf(db, target);
  const goal = Number(target.amount) || 0;
  // เป้าเป็นศูนย์แล้วหารไม่ได้ ให้ถือว่ายังไม่ได้ตั้งเป้า ไม่ใช่ทำได้ 100%
  const pct = goal > 0 ? (actual.amount / goal) * 100 : null;
  return {
    target,
    actual,
    pct,
    diff: actual.amount - goal,
    done: goal > 0 && actual.amount >= goal,
  };
}

/** ชื่ออ่านง่ายของงวด */
export const periodName = (t) =>
  Number(t.month)
    ? "เดือน " + String(t.month).padStart(2, "0") + "/" + (Number(t.year) + 543)
    : "ทั้งปี " + (Number(t.year) + 543);

/** ชื่ออ่านง่ายของมิติที่ระบุไว้ */
export function scopeName(t, salesName) {
  const parts = [];
  if (t.salesId) parts.push("พนักงาน " + (salesName || t.salesId));
  if (t.grp) parts.push("กลุ่ม " + t.grp);
  if (t.brand) parts.push("ยี่ห้อ " + t.brand);
  if (t.kind) parts.push("ประเภท " + t.kind);
  return parts.length ? parts.join(" · ") : "ทั้งบริษัท";
}

/** ชื่อมิติในตารางทะเบียน เทียบกับชื่อคอลัมน์ในตารางสินค้า */
const DIM_OF = { grp: "GRP", brand: "BRAND", kind: "KIND" };

/**
 * ค่าของมิติหนึ่งที่เลือกมาตั้งเป้าได้
 * รวมทะเบียนที่ตั้งไว้ กับค่าที่สินค้าใช้อยู่จริง
 */
export const valuesOf = (db, field) =>
  [
    ...new Set([
      // ทะเบียนที่ตั้งไว้ที่หน้า "กลุ่ม ยี่ห้อ ประเภทสินค้า" — ตั้งเป้าล่วงหน้าได้
      // แม้ยังไม่มีสินค้าตัวไหนใช้ค่านั้น (เช่น ยี่ห้อใหม่ที่กำลังจะเข้ามาปีหน้า)
      ...((db.productTerms || [])
        .filter((t) => t.dim === DIM_OF[field])
        .map((t) => t.name)),
      // ค่าที่สินค้าใช้อยู่จริง — รวมของที่พิมพ์ไว้ก่อนมีหน้าทะเบียนด้วย
      ...((db.products || []).map((p) => p[field]).filter(Boolean)),
    ]),
  ].sort((a, b) => a.localeCompare(b, "th"));

