// ฟอร์มพิมพ์ที่ออกแบบเองได้
//
// แนวคิด: ไม่ทำเป็นผืนผ้าใบลากวางอิสระ แต่ให้ "ประกอบจากชิ้นส่วนที่มีอยู่"
//   ลากวางอิสระฟังดูยืดหยุ่นกว่า แต่ในทางปฏิบัติคนใช้จะได้ฟอร์มที่เบี้ยว
//   ข้อความล้นกรอบเมื่อชื่อสินค้ายาว และพังเมื่อจำนวนบรรทัดเปลี่ยน
//   เอกสารการค้าเป็นตารางที่มีโครงตายตัวอยู่แล้ว สิ่งที่คนอยากเปลี่ยนจริง ๆ คือ
//   หัวเอกสารเขียนว่าอะไร · เอาคอลัมน์ไหนบ้างและเรียงยังไง · ช่องลงนามมีกี่ช่องเขียนว่าอะไร
//   ให้เลือกสิ่งเหล่านั้นได้ ก็ครอบคลุมงานจริงเกือบทั้งหมดโดยไม่มีทางออกแบบให้พัง
//
// ฟอร์มผูกกับ "ชนิดเอกสาร" ไม่ใช่ผูกกับหน้าจอ
//   เพราะใบขายพิมพ์ได้จากหลายที่ (หน้าขาย · รายงาน · หน้าจัดส่ง)
//   ถ้าผูกกับหน้าจอ จะต้องตั้งฟอร์มซ้ำทุกที่ที่พิมพ์ได้

import { num, thDate, thDateTime } from "./format";

/** ชนิดเอกสารที่ออกแบบฟอร์มได้ */
export const FORM_KINDS = [
  { id: "INVOICE", name: "ใบขายสินค้าและบริการ", party: "ผู้ซื้อ", defTitle: "ใบกำกับภาษี / ใบส่งของ" },
  { id: "PURCHASE", name: "ใบซื้อสินค้าและบริการ", party: "ผู้ขาย", defTitle: "ใบรับสินค้า / บันทึกซื้อ" },
  { id: "PURRET", name: "ใบส่งคืนสินค้า", party: "ผู้รับคืน", defTitle: "ใบส่งคืนสินค้า" },
];

export const kindOf = (id) => FORM_KINDS.find((k) => k.id === id) || FORM_KINDS[0];

/**
 * คอลัมน์ที่เลือกใส่ในตารางรายการได้
 *
 * value รับ (item, ctx) โดย ctx มี inv สำหรับหาชื่อสินค้า และ index ของบรรทัด
 * เขียนไว้ที่เดียวเพื่อให้ตัวออกแบบ ตัวอย่าง และตอนพิมพ์จริง ใช้ค่าจากที่เดียวกัน
 */
export const FORM_COLUMNS = [
  { id: "seq", name: "ลำดับ", width: 34, align: "left", value: (it, c) => c.index + 1 },
  {
    id: "code",
    name: "รหัสสินค้า",
    width: 78,
    align: "left",
    value: (it, c) => {
      const p = c.inv.prod(it.productId);
      return p ? p.code : "";
    },
  },
  { id: "name", name: "รายการสินค้า / บริการ", width: 0, align: "left", value: (it, c) => c.inv.prodName(it.productId) },
  {
    id: "unit",
    name: "หน่วย",
    width: 60,
    align: "left",
    value: (it, c) => {
      const p = c.inv.prod(it.productId);
      return p ? p.unit : "";
    },
  },
  { id: "qty", name: "จำนวน", width: 58, align: "right", value: (it) => num(it.qty, 0) },
  { id: "price", name: "ราคา/หน่วย", width: 74, align: "right", value: (it) => num(it.price, 2) },
  {
    id: "disc",
    name: "ส่วนลด",
    width: 74,
    align: "right",
    value: (it) => {
      const gross = (Number(it.qty) || 0) * (Number(it.price) || 0);
      const d = gross - (Number(it.amount) || 0);
      return d > 0 ? num(d, 2) : "-";
    },
  },
  { id: "discPct", name: "ส่วนลด (%)", width: 66, align: "right", value: (it) => (it.discPct ? num(it.discPct, 2) : "-") },
  { id: "amount", name: "จำนวนเงิน", width: 86, align: "right", value: (it) => num(it.amount, 2) },
  {
    id: "wh",
    name: "คลัง / ที่เก็บ",
    width: 120,
    align: "left",
    value: (it, c) => c.inv.whLocName(it.whId, it.locId),
  },
  {
    id: "brand",
    name: "ยี่ห้อ",
    width: 80,
    align: "left",
    value: (it, c) => {
      const p = c.inv.prod(it.productId);
      return (p && p.brand) || "";
    },
  },
];

export const columnOf = (id) => FORM_COLUMNS.find((c) => c.id === id) || null;

/** ช่องลงนามที่ใช้บ่อย ให้กดเติมได้เร็ว ๆ แทนการพิมพ์เอง */
export const SIGN_PRESETS = [
  "ผู้รับสินค้า / วันที่",
  "ผู้ส่งสินค้า / วันที่",
  "ผู้มีอำนาจลงนาม",
  "ผู้จัดทำ",
  "ผู้ตรวจสอบ",
  "ผู้อนุมัติ",
];

/**
 * ฟอร์มมาตรฐานของแต่ละชนิดเอกสาร
 *
 * ใช้เมื่อยังไม่ได้ออกแบบฟอร์มเอง หรือกลุ่มเอกสารยังไม่ได้เลือกฟอร์มไว้
 * หน้าตาตรงกับที่ระบบเคยพิมพ์มาก่อนมีหน้าออกแบบฟอร์ม ของเดิมจึงไม่เปลี่ยนไปเอง
 */
export function defaultForm(kindId) {
  const k = kindOf(kindId);
  return {
    id: "",
    name: "ฟอร์มมาตรฐาน",
    docKind: k.id,
    title: k.defTitle,
    copyLabel: "ต้นฉบับ (เอกสารออกเป็นชุด)",
    paper: "A4",
    showLogo: false,
    showCompany: true,
    showBarcode: true,
    showWords: true,
    showNote: true,
    showTotals: true,
    columns: ["seq", "code", "name", "unit", "qty", "price", "disc", "amount"],
    signs: ["ผู้รับสินค้า / วันที่", "ผู้ส่งสินค้า / วันที่", "ผู้มีอำนาจลงนาม"],
    note: "",
    isDefault: false,
  };
}

/**
 * ฟอร์มที่จะใช้พิมพ์จริง
 *
 * ลำดับการเลือก: ฟอร์มที่สั่งมาตรง ๆ -> ฟอร์มที่ตั้งเป็นค่าเริ่มต้นของชนิดนั้น -> ฟอร์มมาตรฐาน
 * ฟอร์มที่ถูกลบไปแล้วแต่ยังถูกอ้างอยู่ ต้องถอยไปใช้ฟอร์มมาตรฐาน ไม่ใช่พิมพ์ไม่ออก
 */
export function resolveForm(db, kindId, formId) {
  const list = (db.printForms || []).filter((f) => f.docKind === kindId);
  const picked = formId ? list.find((f) => f.id === formId) : null;
  if (picked) return picked;
  const def = list.find((f) => f.isDefault);
  return def || defaultForm(kindId);
}

/** ฟอร์มทั้งหมดของชนิดหนึ่ง เรียงให้ค่าเริ่มต้นอยู่บนสุด */
export const formsOf = (db, kindId) =>
  (db.printForms || [])
    .filter((f) => f.docKind === kindId)
    .slice()
    .sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.name.localeCompare(b.name, "th"));

/**
 * ตรวจว่าฟอร์มใช้ได้จริงหรือยัง
 * ฟอร์มที่ไม่มีคอลัมน์เลย พิมพ์ออกมาจะได้ตารางเปล่า ซึ่งไม่มีใครตั้งใจ
 */
export function problemsOf(f) {
  const out = [];
  if (!String(f.name || "").trim()) out.push("ชื่อฟอร์ม");
  if (!String(f.title || "").trim()) out.push("หัวเอกสาร");
  if (!f.columns || !f.columns.length) out.push("คอลัมน์ในตารางอย่างน้อยหนึ่งคอลัมน์");
  if ((f.columns || []).some((c) => !columnOf(c))) out.push("มีคอลัมน์ที่ระบบไม่รู้จัก");
  return out;
}

/** แถวข้อมูลของตารางตามคอลัมน์ที่ฟอร์มเลือกไว้ */
export function bodyRows(form, items, inv) {
  const cols = (form.columns || []).map(columnOf).filter(Boolean);
  return (items || []).map((it, index) => cols.map((c) => c.value(it, { inv, index })));
}

/** หัวตารางตามคอลัมน์ที่ฟอร์มเลือกไว้ */
export const headCells = (form) => (form.columns || []).map(columnOf).filter(Boolean);

/** ยอดท้ายเอกสาร — ใช้ทั้งตอนพิมพ์และตอนดูตัวอย่าง */
export function totalRows(doc) {
  return [
    ["รวมเงิน", num(doc.itemsTotal, 2)],
    ["ส่วนลดท้ายบิล", num(doc.billDiscount, 2)],
    ["มูลค่าก่อนภาษี", num(doc.base, 2)],
    ["ภาษีมูลค่าเพิ่ม " + num(doc.vatRate, 2) + "%", num(doc.vat, 2)],
    ["จำนวนเงินรวมทั้งสิ้น", num(doc.total, 2)],
  ];
}

/** ข้อมูลหัวเอกสารฝั่งขวา */
export function metaRows(doc) {
  return [
    ["เลขที่เอกสาร", doc.docNo],
    ["วันที่", thDate(doc.date)],
    ["ผู้ออกเอกสาร", doc.user || "-"],
    ["พิมพ์เมื่อ", thDateTime(Date.now())],
  ];
}
