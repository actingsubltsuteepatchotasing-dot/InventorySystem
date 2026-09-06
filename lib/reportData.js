// ชุดข้อมูลสำหรับหน้า "สร้างรายงาน" — แปลงข้อมูลในระบบให้เป็นตารางแบน ๆ
//
// หน้าสร้างรายงานทำงานแบบ pivot table: ผู้ใช้เลือกเองว่าจะเอาอะไรเป็นแถว
// อะไรเป็นคอลัมน์ และจะรวมค่าอะไร ตัวมันเองจึงต้องไม่รู้จักโครงสร้างของแต่ละหน้าจอ
// ไฟล์นี้คือชั้นที่รู้ ทำหน้าที่แปลงข้อมูลจริงให้เป็น "แถวกับฟิลด์" ที่หน้าจอเอาไปหมุนได้
//
// ฟิลด์มีสองชนิด:
//   dim  = เอาไปจัดกลุ่มได้ (ข้อความ วันที่ เดือน)
//   num  = เอาไปรวมค่าได้ (จำนวน มูลค่า)
//
// ทุกชุดข้อมูลต้องมีฟิลด์วันที่ชื่อ date เสมอ หน้าจอใช้กรองช่วงวันที่จากฟิลด์นี้

import { TYPES } from "./constants";
import { thDate } from "./format";

/** เดือนของวันที่แบบ YYYY-MM (เทียบและเรียงได้ตรง ๆ) */
const ym = (iso) => String(iso || "").slice(0, 7);

/** ปีพุทธศักราชของวันที่ */
const beYear = (iso) => {
  const y = parseInt(String(iso || "").slice(0, 4), 10);
  return Number.isFinite(y) ? String(y + 543) : "";
};

/**
 * ชุดข้อมูลทั้งหมดที่เลือกได้
 *
 * ตั้งใจให้ชื่อชุดตรงกับชื่อหน้าจอที่คนใช้คุ้นอยู่แล้ว ไม่ใช่ชื่อตารางในฐานข้อมูล
 * คนที่จะสร้างรายงานเองคิดจาก "หน้าจอไหน" ไม่ได้คิดจาก "ตารางไหน"
 */
export const DATASETS = [
  {
    id: "txns",
    name: "รายการเคลื่อนไหวทั้งหมด",
    hint: "ทุกการรับ เบิก โอน ปรับปรุง และขาย รวมกันในตารางเดียว",
    fields: [
      { id: "date", name: "วันที่", type: "dim" },
      { id: "month", name: "เดือน", type: "dim" },
      { id: "year", name: "ปี (พ.ศ.)", type: "dim" },
      { id: "typeName", name: "ชนิดรายการ", type: "dim" },
      { id: "docNo", name: "เลขที่เอกสาร", type: "dim" },
      { id: "prodCode", name: "รหัสสินค้า", type: "dim" },
      { id: "prodName", name: "ชื่อสินค้า", type: "dim" },
      { id: "cat", name: "หมวดหมู่", type: "dim" },
      { id: "unit", name: "หน่วยนับ", type: "dim" },
      { id: "whName", name: "คลังสินค้า", type: "dim" },
      { id: "province", name: "จังหวัดของคลัง", type: "dim" },
      { id: "locName", name: "ที่เก็บสินค้า", type: "dim" },
      { id: "user", name: "ผู้ทำรายการ", type: "dim" },
      { id: "qty", name: "จำนวน", type: "num" },
      { id: "value", name: "มูลค่า (ราคาขาย)", type: "num" },
    ],
    rows: (db, inv) =>
      db.txns.map((t) => {
        const p = inv.prod(t.productId);
        const w = inv.wh(t.whId);
        return {
          date: t.date,
          month: ym(t.date),
          year: beYear(t.date),
          typeName: TYPES[t.type] ? TYPES[t.type].name : t.type,
          docNo: t.docNo,
          prodCode: p ? p.code : "",
          prodName: inv.prodName(t.productId),
          cat: p ? p.cat : "",
          unit: p ? p.unit : "",
          whName: inv.whName(t.whId),
          province: w ? w.province : "",
          locName: t.locId ? inv.locName(t.locId) : "ยังไม่ระบุที่เก็บ",
          user: t.user || "",
          qty: Number(t.qty) || 0,
          value: (Number(t.qty) || 0) * (p ? Number(p.price) || 0 : 0),
        };
      }),
  },

  {
    id: "stock",
    name: "ยอดคงเหลือปัจจุบัน",
    hint: "ยอดคงเหลือรายสินค้า x คลัง ณ ตอนนี้",
    // ยอดคงเหลือไม่มีวันที่ในตัวเอง ตัวกรองช่วงวันที่จึงใช้กับชุดนี้ไม่ได้
    noDate: true,
    fields: [
      { id: "prodCode", name: "รหัสสินค้า", type: "dim" },
      { id: "prodName", name: "ชื่อสินค้า", type: "dim" },
      { id: "cat", name: "หมวดหมู่", type: "dim" },
      { id: "unit", name: "หน่วยนับ", type: "dim" },
      { id: "whName", name: "คลังสินค้า", type: "dim" },
      { id: "province", name: "จังหวัดของคลัง", type: "dim" },
      { id: "low", name: "ต่ำกว่าจุดสั่งซื้อ", type: "dim" },
      { id: "qty", name: "คงเหลือ", type: "num" },
      { id: "value", name: "มูลค่าคงเหลือ", type: "num" },
    ],
    rows: (db, inv) => {
      const out = [];
      db.products.forEach((p) => {
        db.warehouses.forEach((w) => {
          const q = inv.stockOf(p.id, w.id);
          if (!q) return;
          out.push({
            prodCode: p.code,
            prodName: p.name,
            cat: p.cat,
            unit: p.unit,
            whName: w.name,
            province: w.province,
            low: q < (Number(p.min) || 0) ? "ต่ำกว่าเกณฑ์" : "ปกติ",
            qty: q,
            value: q * (Number(p.price) || 0),
          });
        });
      });
      return out;
    },
  },

  {
    id: "invoices",
    name: "ใบขายสินค้าและบริการ",
    hint: "หัวเอกสารใบขาย หนึ่งแถวคือหนึ่งใบ",
    fields: [
      { id: "date", name: "วันที่", type: "dim" },
      { id: "month", name: "เดือน", type: "dim" },
      { id: "year", name: "ปี (พ.ศ.)", type: "dim" },
      { id: "docNo", name: "เลขที่เอกสาร", type: "dim" },
      { id: "custCode", name: "รหัสลูกค้า", type: "dim" },
      { id: "custName", name: "ชื่อลูกค้า", type: "dim" },
      { id: "province", name: "จังหวัดที่ส่ง", type: "dim" },
      { id: "shipName", name: "สถานะการจัดส่ง", type: "dim" },
      { id: "user", name: "ผู้บันทึก", type: "dim" },
      { id: "base", name: "ยอดก่อนภาษี", type: "num" },
      { id: "vat", name: "ภาษีขาย", type: "num" },
      { id: "total", name: "ยอดสุทธิ", type: "num" },
      { id: "km", name: "ระยะทาง (กม.)", type: "num" },
      { id: "docs", name: "จำนวนใบ", type: "num" },
    ],
    rows: (db, inv, extra) =>
      (db.invoices || []).map((v) => ({
        date: v.date,
        month: ym(v.date),
        year: beYear(v.date),
        docNo: v.docNo,
        custCode: v.custCode,
        custName: v.custName,
        province: v.custProvince || "",
        shipName: extra.shipName(v.shipStatus),
        user: v.user || "",
        base: v.base,
        vat: v.vat,
        total: v.total,
        km: v.shipKm === null ? 0 : v.shipKm,
        docs: 1,
      })),
  },

  {
    id: "invoiceItems",
    name: "รายการในใบขาย",
    hint: "แตกเป็นรายบรรทัดสินค้า ใช้ดูว่าขายอะไรให้ใครมากที่สุด",
    fields: [
      { id: "date", name: "วันที่", type: "dim" },
      { id: "month", name: "เดือน", type: "dim" },
      { id: "docNo", name: "เลขที่เอกสาร", type: "dim" },
      { id: "custName", name: "ชื่อลูกค้า", type: "dim" },
      { id: "province", name: "จังหวัดที่ส่ง", type: "dim" },
      { id: "prodCode", name: "รหัสสินค้า", type: "dim" },
      { id: "prodName", name: "ชื่อสินค้า", type: "dim" },
      { id: "cat", name: "หมวดหมู่", type: "dim" },
      { id: "whName", name: "คลังสินค้า", type: "dim" },
      { id: "qty", name: "จำนวน", type: "num" },
      { id: "amount", name: "จำนวนเงิน", type: "num" },
    ],
    rows: (db, inv) => {
      const head = new Map((db.invoices || []).map((v) => [v.id, v]));
      return (db.invoiceItems || []).map((it) => {
        const v = head.get(it.invoiceId) || {};
        const p = inv.prod(it.productId);
        return {
          date: v.date || "",
          month: ym(v.date),
          docNo: v.docNo || "",
          custName: v.custName || "",
          province: v.custProvince || "",
          prodCode: p ? p.code : "",
          prodName: inv.prodName(it.productId),
          cat: p ? p.cat : "",
          whName: inv.whName(it.whId),
          qty: it.qty,
          amount: it.amount,
        };
      });
    },
  },

  {
    id: "purchases",
    name: "ใบซื้อสินค้าและบริการ",
    hint: "หัวเอกสารใบซื้อ หนึ่งแถวคือหนึ่งใบ",
    fields: [
      { id: "date", name: "วันที่", type: "dim" },
      { id: "month", name: "เดือน", type: "dim" },
      { id: "year", name: "ปี (พ.ศ.)", type: "dim" },
      { id: "docNo", name: "เลขที่เอกสาร", type: "dim" },
      { id: "refNo", name: "เลขที่ใบของเจ้าหนี้", type: "dim" },
      { id: "supCode", name: "รหัสเจ้าหนี้", type: "dim" },
      { id: "supName", name: "ชื่อเจ้าหนี้", type: "dim" },
      { id: "province", name: "จังหวัดเจ้าหนี้", type: "dim" },
      { id: "user", name: "ผู้บันทึก", type: "dim" },
      { id: "base", name: "ยอดก่อนภาษี", type: "num" },
      { id: "vat", name: "ภาษีซื้อ", type: "num" },
      { id: "total", name: "ยอดสุทธิ", type: "num" },
      { id: "docs", name: "จำนวนใบ", type: "num" },
    ],
    rows: (db) =>
      (db.purchases || []).map((v) => ({
        date: v.date,
        month: ym(v.date),
        year: beYear(v.date),
        docNo: v.docNo,
        refNo: v.refNo || "",
        supCode: v.supCode,
        supName: v.supName,
        province: v.supProvince || "",
        user: v.user || "",
        base: v.base,
        vat: v.vat,
        total: v.total,
        docs: 1,
      })),
  },

  {
    id: "purchaseItems",
    name: "รายการในใบซื้อ",
    hint: "แตกเป็นรายบรรทัด ใช้ดูว่าซื้ออะไรจากใครเท่าไร",
    fields: [
      { id: "date", name: "วันที่", type: "dim" },
      { id: "month", name: "เดือน", type: "dim" },
      { id: "docNo", name: "เลขที่เอกสาร", type: "dim" },
      { id: "supName", name: "ชื่อเจ้าหนี้", type: "dim" },
      { id: "prodCode", name: "รหัสสินค้า", type: "dim" },
      { id: "prodName", name: "ชื่อสินค้า", type: "dim" },
      { id: "cat", name: "หมวดหมู่", type: "dim" },
      { id: "whName", name: "คลังสินค้า", type: "dim" },
      { id: "qty", name: "จำนวน", type: "num" },
      { id: "price", name: "ราคาต่อหน่วย", type: "num" },
      { id: "amount", name: "จำนวนเงิน", type: "num" },
    ],
    rows: (db, inv) => {
      const head = new Map((db.purchases || []).map((v) => [v.id, v]));
      return (db.purchaseItems || []).map((it) => {
        const v = head.get(it.purchaseId) || {};
        const p = inv.prod(it.productId);
        return {
          date: v.date || "",
          month: ym(v.date),
          docNo: v.docNo || "",
          supName: v.supName || "",
          prodCode: p ? p.code : "",
          prodName: inv.prodName(it.productId),
          cat: p ? p.cat : "",
          whName: inv.whName(it.whId),
          qty: it.qty,
          price: it.price,
          amount: it.amount,
        };
      });
    },
  },

  {
    id: "returns",
    name: "ใบส่งคืนสินค้า",
    hint: "การคืนของให้เจ้าหนี้ อ้างกลับไปที่ใบซื้อเดิม",
    fields: [
      { id: "date", name: "วันที่", type: "dim" },
      { id: "month", name: "เดือน", type: "dim" },
      { id: "docNo", name: "เลขที่เอกสาร", type: "dim" },
      { id: "purDocNo", name: "อ้างใบซื้อ", type: "dim" },
      { id: "supName", name: "ชื่อเจ้าหนี้", type: "dim" },
      { id: "reason", name: "เหตุผลที่คืน", type: "dim" },
      { id: "base", name: "ยอดก่อนภาษี", type: "num" },
      { id: "vat", name: "ภาษีที่คืน", type: "num" },
      { id: "total", name: "ยอดสุทธิ", type: "num" },
      { id: "docs", name: "จำนวนใบ", type: "num" },
    ],
    rows: (db) =>
      (db.purchaseReturns || []).map((v) => ({
        date: v.date,
        month: ym(v.date),
        docNo: v.docNo,
        purDocNo: v.purDocNo,
        supName: v.supName,
        reason: v.reason || "",
        base: v.base,
        vat: v.vat,
        total: v.total,
        docs: 1,
      })),
  },

  {
    id: "sales",
    name: "บิลขายหน้าร้าน (POS)",
    hint: "หัวบิลจากหน้า POS",
    fields: [
      { id: "date", name: "วันที่", type: "dim" },
      { id: "month", name: "เดือน", type: "dim" },
      { id: "docNo", name: "เลขที่บิล", type: "dim" },
      { id: "customer", name: "ชื่อลูกค้า", type: "dim" },
      { id: "whName", name: "คลังสินค้า", type: "dim" },
      { id: "payName", name: "วิธีชำระเงิน", type: "dim" },
      { id: "user", name: "ผู้ขาย", type: "dim" },
      { id: "subtotal", name: "ยอดก่อนภาษี", type: "num" },
      { id: "vat", name: "ภาษี", type: "num" },
      { id: "total", name: "ยอดสุทธิ", type: "num" },
      { id: "docs", name: "จำนวนบิล", type: "num" },
    ],
    rows: (db, inv, extra) =>
      db.sales.map((s) => ({
        date: s.date,
        month: ym(s.date),
        docNo: s.docNo,
        customer: s.customer || "ลูกค้าทั่วไป",
        whName: inv.whName(s.whId),
        payName: extra.payName(s.payMethod),
        user: s.user || "",
        subtotal: s.subtotal,
        vat: s.vat,
        total: s.total,
        docs: 1,
      })),
  },

  {
    id: "customers",
    name: "ทะเบียนลูกค้า",
    hint: "ข้อมูลลูกค้า ใช้ดูการกระจายตามจังหวัดหรือประเภท",
    noDate: true,
    fields: [
      { id: "code", name: "รหัสลูกค้า", type: "dim" },
      { id: "name", name: "ชื่อลูกค้า", type: "dim" },
      { id: "kind", name: "ประเภทลูกค้า", type: "dim" },
      { id: "province", name: "จังหวัด", type: "dim" },
      { id: "district", name: "อำเภอ / เขต", type: "dim" },
      { id: "hasTax", name: "มีเลขผู้เสียภาษี", type: "dim" },
      { id: "count", name: "จำนวนราย", type: "num" },
    ],
    rows: (db) =>
      (db.customers || []).map((c) => ({
        code: c.code,
        name: c.name,
        kind: c.kind || "",
        province: c.province || "",
        district: c.district || "",
        hasTax: c.taxId ? "มี" : "ไม่มี",
        count: 1,
      })),
  },

  {
    id: "suppliers",
    name: "ทะเบียนเจ้าหนี้",
    hint: "ข้อมูลเจ้าหนี้ ใช้ดูการกระจายตามจังหวัดหรือประเภท",
    noDate: true,
    fields: [
      { id: "code", name: "รหัสเจ้าหนี้", type: "dim" },
      { id: "name", name: "ชื่อเจ้าหนี้", type: "dim" },
      { id: "kind", name: "ประเภทเจ้าหนี้", type: "dim" },
      { id: "province", name: "จังหวัด", type: "dim" },
      { id: "district", name: "อำเภอ / เขต", type: "dim" },
      { id: "hasTax", name: "มีเลขผู้เสียภาษี", type: "dim" },
      { id: "count", name: "จำนวนราย", type: "num" },
    ],
    rows: (db) =>
      (db.suppliers || []).map((c) => ({
        code: c.code,
        name: c.name,
        kind: c.kind || "",
        province: c.province || "",
        district: c.district || "",
        hasTax: c.taxId ? "มี" : "ไม่มี",
        count: 1,
      })),
  },

  {
    id: "shipTiming",
    name: "เวลาแต่ละขั้นของการจัดส่ง",
    hint: "ดูว่าของค้างที่ช่วงไหน แยกตามจังหวัด ลูกค้า หรือเดือนได้",
    fields: [
      { id: "date", name: "วันที่เอกสาร", type: "dim" },
      { id: "month", name: "เดือน", type: "dim" },
      { id: "year", name: "ปี (พ.ศ.)", type: "dim" },
      { id: "docNo", name: "เลขที่เอกสาร", type: "dim" },
      { id: "custCode", name: "รหัสลูกค้า", type: "dim" },
      { id: "custName", name: "ชื่อลูกค้า", type: "dim" },
      { id: "province", name: "จังหวัดที่ส่ง", type: "dim" },
      { id: "shipName", name: "สถานะปัจจุบัน", type: "dim" },
      { id: "whName", name: "คลังต้นทาง", type: "dim" },
      { id: "done", name: "ส่งถึงแล้วหรือยัง", type: "dim" },
      // หน่วยเป็นชั่วโมง เพราะ pivot ต้องรวมและเฉลี่ยได้
      // ถ้าเก็บเป็นข้อความอย่าง "2 ชม. 15 นาที" จะทำได้แค่นับจำนวนแถว
      { id: "hWait", name: "ชม. รอส่งจัด → รอจัด", type: "num" },
      { id: "hPack", name: "ชม. รอจัด → จัดเสร็จ", type: "num" },
      { id: "hHandover", name: "ชม. จัดเสร็จ → ส่งแล้ว", type: "num" },
      { id: "hDeliver", name: "ชม. ส่งแล้ว → ถึงมือ", type: "num" },
      { id: "hTotal", name: "ชม. รวมทั้งกระบวนการ", type: "num" },
      { id: "km", name: "ระยะทาง (กม.)", type: "num" },
      { id: "docs", name: "จำนวนใบ", type: "num" },
    ],
    rows: (db, inv, extra) => {
      const hrs = (ms) => (ms ? Math.round((ms / 3600000) * 100) / 100 : 0);
      return (db.invoices || []).map((v) => {
        const tl = extra.shipTimeline(v);
        return {
          date: v.date,
          month: ym(v.date),
          year: beYear(v.date),
          docNo: v.docNo,
          custCode: v.custCode,
          custName: v.custName,
          province: v.custProvince || "",
          shipName: extra.shipName(v.shipStatus),
          whName: v.shipFrom ? extra.whName(v.shipFrom) : "",
          done: v.shipStatus === "DELIVERED" ? "ส่งถึงแล้ว" : "ยังไม่ถึง",
          hWait: hrs(tl.steps[1] ? tl.steps[1].ms : 0),
          hPack: hrs(tl.steps[2] ? tl.steps[2].ms : 0),
          hHandover: hrs(tl.steps[3] ? tl.steps[3].ms : 0),
          hDeliver: hrs(tl.steps[4] ? tl.steps[4].ms : 0),
          hTotal: hrs(tl.totalMs),
          km: v.shipKm === null ? 0 : v.shipKm,
          docs: 1,
        };
      });
    },
  },
];

/** วิธีรวมค่าที่เลือกได้ */
export const AGGS = [
  { id: "sum", name: "ผลรวม" },
  { id: "count", name: "นับจำนวนแถว" },
  { id: "avg", name: "ค่าเฉลี่ย" },
  { id: "min", name: "ค่าต่ำสุด" },
  { id: "max", name: "ค่าสูงสุด" },
];

/** รวมค่าตามวิธีที่เลือก — ไม่มีข้อมูลคืน null ไม่ใช่ 0 เพราะคนละความหมาย */
export function aggregate(values, how) {
  if (how === "count") return values.length;
  if (!values.length) return null;
  if (how === "sum") return values.reduce((a, b) => a + b, 0);
  if (how === "avg") return values.reduce((a, b) => a + b, 0) / values.length;
  if (how === "min") return Math.min(...values);
  if (how === "max") return Math.max(...values);
  return null;
}

/** ป้ายของค่าในกลุ่ม ใช้แสดงหัวแถว/หัวคอลัมน์ (วันที่แปลงเป็นแบบไทยให้อ่านง่าย) */
export function labelOf(fieldId, value) {
  if (value === "" || value === null || value === undefined) return "(ไม่ระบุ)";
  if (fieldId === "date") return thDate(value);
  return String(value);
}
