// สรุปข้อมูลคลังสินค้าให้อยู่ในรูปข้อความกระชับ สำหรับส่งให้ผู้ช่วย AI ใช้ตอบคำถาม
//
// แยกสองชั้นเพื่อให้ทดสอบได้:
//   buildSummary(db, now)  -> object  (ทดสอบตัวเลขได้ตรง ๆ)
//   renderSummary(summary) -> string  (ทดสอบขนาดและรูปแบบได้)
//
// เป็นฟังก์ชันบริสุทธิ์ล้วน ไม่แตะ window/localStorage จึงคัดลอกไปทดสอบด้วย Node ได้
//
// สำคัญ: products.img เป็น data URL ขนาดหลายสิบ KB
// ต้องเลือก field ทีละตัวเสมอ ห้าม spread ...p หรือ JSON.stringify(db)

import { TYPES, VAT_RATE } from "./constants";
import { stockMap, stockTotal, whTotal } from "./db";
import { ellipsis } from "./format";

/** จำนวนสูงสุดของช่องในเมทริกซ์ สินค้า x คลัง ถ้าเกินนี้จะข้ามเพื่อคุมขนาด */
const MATRIX_MAX_CELLS = 200;

/**
 * ล้างข้อความที่ผู้ใช้กรอกเองก่อนใส่ลง prompt
 * - ตัดขึ้นบรรทัดใหม่ ไม่ให้ปลอมโครงสร้างตาราง
 * - ตัด | ` ที่ทำให้ตาราง/โค้ดบล็อกเพี้ยน
 * - ตัดคำที่ใช้ปิดบล็อกข้อมูล ไม่ให้หลุดออกจากรั้ว
 */
export function clean(s, len = 60) {
  return ellipsis(
    String(s == null ? "" : s)
      .replace(/[\r\n|`]/g, " ")
      .replace(/<<<|DATA>>>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    len
  );
}

/** ปัดเป็นจำนวนเต็ม — ไม่ใช้ num() เพราะคอมมาและ locale ไทยทำให้ LLM อ่านผิดและเปลือง token */
const n0 = (v) => Math.round(Number(v) || 0);

/** คีย์เดือนของวันที่ ISO เช่น "2026-09" */
const ym = (iso) => String(iso || "").slice(0, 7);

/** คีย์เดือนของ Date ในเขตเวลาเครื่องผู้ใช้ (ไม่ใช้ toISOString ที่เป็น UTC) */
function ymOf(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

/** วันที่ท้องถิ่นแบบ YYYY-MM-DD (ไม่ใช้ toISOString ที่เป็น UTC) */
function localDate(d) {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

/**
 * สร้างสรุปข้อมูลเป็น object
 * @param {object} db  { products, warehouses, txns, locations, placements, sales, saleItems }
 * @param {Date}   now เวลาอ้างอิง (ส่งเข้ามาเพื่อให้ทดสอบด้วยเวลาคงที่ได้)
 */
export function buildSummary(db, now = new Date()) {
  const products = db.products || [];
  const warehouses = db.warehouses || [];
  const txns = db.txns || [];
  const sales = db.sales || [];
  const saleItems = db.saleItems || [];
  const locations = db.locations || [];
  const placements = db.placements || [];

  // คำนวณยอดคงเหลือครั้งเดียวแล้วส่ง m ต่อ ไม่งั้นเป็น O(n^2) บน txns หลายร้อยรายการ
  const m = stockMap({ products, warehouses, txns });
  const dbForCalc = { products, warehouses, txns };

  const today = localDate(now);
  const thisMonth = ymOf(now);
  const prevMonth = ymOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  /* ------------------------------------------------------------ สินค้า */
  const productRows = products.map((p) => {
    const qty = stockTotal(dbForCalc, m, p.id);
    return {
      code: clean(p.code, 20),
      name: clean(p.name, 46),
      unit: clean(p.unit, 18),
      cat: clean(p.cat, 20),
      price: Number(p.price) || 0,
      min: Number(p.min) || 0,
      qty,
      value: qty * (Number(p.price) || 0),
      low: qty < (Number(p.min) || 0),
      id: p.id,
    };
  });

  const totalQty = productRows.reduce((s, r) => s + r.qty, 0);
  const totalValue = productRows.reduce((s, r) => s + r.value, 0);
  const lowStock = productRows
    .filter((r) => r.low)
    .map((r) => ({ ...r, short: r.min - r.qty }))
    .sort((a, b) => b.short - a.short);

  /* ------------------------------------------------------------- คลัง */
  const warehouseRows = warehouses.map((w) => {
    const qty = whTotal(dbForCalc, m, w.id);
    const value = products.reduce(
      (s, p) => s + (m[p.id + "|" + w.id] || 0) * (Number(p.price) || 0),
      0
    );
    return {
      id: w.id,
      code: clean(w.code, 12),
      name: clean(w.name, 40),
      province: clean(w.province, 24),
      qty,
      value,
    };
  });

  /* ------------------------------- เมทริกซ์ สินค้า x คลัง (คุ้มค่า token มาก) */
  const cells = productRows.length * warehouseRows.length;
  const matrix =
    cells > 0 && cells <= MATRIX_MAX_CELLS
      ? productRows.map((r) => ({
          code: r.code,
          byWh: warehouseRows.map((w) => m[r.id + "|" + w.id] || 0),
        }))
      : null;

  /* --------------------------------------------- รายการเคลื่อนไหว */
  const typeKeys = Object.keys(TYPES);
  const blankStat = () => {
    const o = {};
    typeKeys.forEach((k) => (o[k] = { lines: 0, qty: 0 }));
    return o;
  };

  const monthStat = blankStat();
  const prevStat = blankStat();
  let todayLines = 0;

  txns.forEach((t) => {
    if (!TYPES[t.type]) return;
    const mo = ym(t.date);
    const q = Math.abs(Number(t.qty) || 0);
    if (mo === thisMonth) {
      monthStat[t.type].lines++;
      monthStat[t.type].qty += q;
    } else if (mo === prevMonth) {
      prevStat[t.type].lines++;
      prevStat[t.type].qty += q;
    }
    if (t.date === today) todayLines++;
  });

  // แนวโน้ม 6 เดือน — สูตรเดียวกับ Dashboard
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: ymOf(d), inQty: 0, outQty: 0 });
  }
  const monthIndex = new Map(months.map((x, i) => [x.key, i]));
  txns.forEach((t) => {
    const i = monthIndex.get(ym(t.date));
    if (i === undefined) return;
    const q = Number(t.qty) || 0;
    if (t.type === "RECEIVE") months[i].inQty += q;
    else if (t.type === "ISSUE" || t.type === "SALE") months[i].outQty += Math.abs(q);
    else if (t.type === "ADJUST") {
      if (q > 0) months[i].inQty += q;
      else months[i].outQty += -q;
    }
  });

  const recent = [...txns]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 10)
    .map((t) => {
      const p = products.find((x) => x.id === t.productId);
      const w = warehouses.find((x) => x.id === t.whId);
      return {
        date: t.date,
        type: TYPES[t.type] ? TYPES[t.type].name : t.type,
        docNo: clean(t.docNo, 24),
        product: p ? clean(p.name, 34) : "(ถูกลบ)",
        qty: Number(t.qty) || 0,
        wh: w ? clean(w.code, 12) : "-",
      };
    });

  /* ------------------------------------------------------------- ขาย */
  const saleStat = (key) => {
    const bills = sales.filter((s) => ym(s.date) === key);
    return {
      bills: bills.length,
      total: bills.reduce((s, b) => s + (Number(b.total) || 0), 0),
      vat: bills.reduce((s, b) => s + (Number(b.vat) || 0), 0),
      discount: bills.reduce((s, b) => s + (Number(b.discount) || 0), 0),
    };
  };
  const salesThisMonth = saleStat(thisMonth);
  const salesPrevMonth = saleStat(prevMonth);

  const byPay = {};
  sales
    .filter((s) => ym(s.date) === thisMonth)
    .forEach((s) => {
      const k = s.payMethod || "CASH";
      byPay[k] = byPay[k] || { bills: 0, total: 0 };
      byPay[k].bills++;
      byPay[k].total += Number(s.total) || 0;
    });

  // ขายดี 30 วันล่าสุด
  const since = now.getTime() - 30 * 86400000;
  const recentSaleIds = new Set(sales.filter((s) => s.ts >= since).map((s) => s.id));
  const sold = new Map();
  saleItems.forEach((it) => {
    if (!recentSaleIds.has(it.saleId)) return;
    const cur = sold.get(it.productId) || { qty: 0, amount: 0 };
    cur.qty += Number(it.qty) || 0;
    cur.amount += Number(it.amount) || 0;
    sold.set(it.productId, cur);
  });
  const topSellers = Array.from(sold.entries())
    .map(([pid, v]) => {
      const p = products.find((x) => x.id === pid);
      return { name: p ? clean(p.name, 34) : "(ถูกลบ)", qty: v.qty, amount: v.amount };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  /* ------------------------------------------------------ ผังที่เก็บ */
  const usedBins = new Set(placements.map((pl) => pl.locationId));
  const placedByWh = new Map();
  const binWh = new Map(locations.map((l) => [l.id, l.whId]));
  placements.forEach((pl) => {
    const wid = binWh.get(pl.locationId);
    if (!wid) return;
    const key = pl.productId + "|" + wid;
    placedByWh.set(key, (placedByWh.get(key) || 0) + (Number(pl.qty) || 0));
  });
  let unplacedItems = 0;
  products.forEach((p) => {
    warehouses.forEach((w) => {
      const have = m[p.id + "|" + w.id] || 0;
      if (have > 0 && (placedByWh.get(p.id + "|" + w.id) || 0) < have) unplacedItems++;
    });
  });

  return {
    generatedAt: now,
    counts: {
      products: products.length,
      warehouses: warehouses.length,
      txns: txns.length,
      sales: sales.length,
      locations: locations.length,
    },
    overview: {
      totalQty,
      totalValue,
      lowCount: lowStock.length,
      todayLines,
      today,
      thisMonth,
      prevMonth,
    },
    productRows,
    warehouseRows,
    matrix,
    lowStock,
    monthStat,
    prevStat,
    months,
    recent,
    salesThisMonth,
    salesPrevMonth,
    byPay,
    topSellers,
    storage: {
      bins: locations.length,
      usedBins: usedBins.size,
      unplacedItems,
    },
  };
}

/* ------------------------------------------------------------------ render */

const row = (cols) => cols.join(" | ");

/** แปลงสรุปเป็นข้อความสำหรับแนบไปกับ prompt */
export function renderSummary(s) {
  const L = [];
  const d = s.generatedAt;
  const stamp =
    localDate(d) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");

  L.push("ข้อมูล ณ " + stamp + " (เขตเวลาไทย) — จำนวนทั้งหมดเป็นหน่วยนับของสินค้านั้น ๆ, เงินเป็นบาท");
  L.push(
    "จำนวน: สินค้า " +
      s.counts.products +
      " รายการ, คลัง " +
      s.counts.warehouses +
      " แห่ง, รายการเคลื่อนไหว " +
      s.counts.txns +
      ", บิลขาย " +
      s.counts.sales +
      ", ช่องเก็บ " +
      s.counts.locations
  );
  L.push("");

  L.push("## ภาพรวม");
  L.push("ยอดคงเหลือรวมทุกคลัง: " + n0(s.overview.totalQty));
  L.push("มูลค่าคงเหลือรวม: " + n0(s.overview.totalValue));
  L.push("สินค้าต่ำกว่าจุดสั่งซื้อ: " + s.overview.lowCount + " รายการ");
  L.push("รายการเคลื่อนไหววันนี้ (" + s.overview.today + "): " + s.overview.todayLines);
  L.push("");

  L.push("## สินค้าทั้งหมด");
  L.push(row(["รหัส", "ชื่อ", "หน่วย", "หมวด", "ราคา", "จุดสั่งซื้อ", "คงเหลือ", "มูลค่า", "สถานะ"]));
  s.productRows.forEach((p) => {
    L.push(
      row([
        p.code,
        p.name,
        p.unit,
        p.cat,
        n0(p.price),
        n0(p.min),
        n0(p.qty),
        n0(p.value),
        p.low ? "ต่ำกว่าเกณฑ์" : "ปกติ",
      ])
    );
  });
  L.push("");

  L.push("## คลังสินค้า");
  L.push(row(["รหัส", "ชื่อ", "จังหวัด", "คงเหลือ", "มูลค่า"]));
  s.warehouseRows.forEach((w) => {
    L.push(row([w.code, w.name, w.province, n0(w.qty), n0(w.value)]));
  });
  L.push("");

  if (s.matrix) {
    L.push("## ยอดคงเหลือ แยกตามสินค้าและคลัง");
    L.push(row(["รหัสสินค้า"].concat(s.warehouseRows.map((w) => w.code))));
    s.matrix.forEach((r) => {
      L.push(row([r.code].concat(r.byWh.map(n0))));
    });
  } else {
    L.push("## ยอดคงเหลือ แยกตามสินค้าและคลัง");
    L.push("(ข้อมูลมากเกินกว่าจะแสดงทั้งหมด — ให้แนะนำผู้ใช้ดูที่หน้าจอ สินค้าตามจังหวัด)");
  }
  L.push("");

  // แสดงหัวข้อนี้เสมอ แม้ไม่มีรายการ เพื่อให้ AI ตอบ "ไม่มีสินค้าใกล้หมด" ได้อย่างมั่นใจ
  L.push("## สินค้าต่ำกว่าจุดสั่งซื้อ");
  if (s.lowStock.length) {
    L.push(row(["รหัส", "ชื่อ", "คงเหลือ", "จุดสั่งซื้อ", "ขาดอีก"]));
    s.lowStock.slice(0, 15).forEach((p) => {
      L.push(row([p.code, p.name, n0(p.qty), n0(p.min), n0(p.short)]));
    });
    if (s.lowStock.length > 15) L.push("(และอีก " + (s.lowStock.length - 15) + " รายการ)");
  } else {
    L.push("ไม่มี — สินค้าทุกรายการมียอดคงเหลือสูงกว่าจุดสั่งซื้อ");
  }
  L.push("");

  L.push("## รายการเคลื่อนไหว เดือนนี้ (" + s.overview.thisMonth + ") เทียบเดือนก่อน (" + s.overview.prevMonth + ")");
  L.push(row(["ประเภท", "เดือนนี้ (รายการ/ปริมาณ)", "เดือนก่อน (รายการ/ปริมาณ)"]));
  Object.keys(TYPES).forEach((k) => {
    const a = s.monthStat[k];
    const b = s.prevStat[k];
    L.push(row([TYPES[k].name, a.lines + " / " + n0(a.qty), b.lines + " / " + n0(b.qty)]));
  });
  L.push("");

  L.push("## แนวโน้ม 6 เดือน");
  L.push(row(["เดือน", "รับเข้า", "จ่ายออก"]));
  s.months.forEach((mo) => L.push(row([mo.key, n0(mo.inQty), n0(mo.outQty)])));
  L.push("");

  L.push("## ยอดขาย");
  L.push(
    "เดือนนี้: " +
      s.salesThisMonth.bills +
      " บิล ยอดสุทธิ " +
      n0(s.salesThisMonth.total) +
      " (VAT " +
      n0(s.salesThisMonth.vat) +
      ", ส่วนลด " +
      n0(s.salesThisMonth.discount) +
      ")"
  );
  L.push("เดือนก่อน: " + s.salesPrevMonth.bills + " บิล ยอดสุทธิ " + n0(s.salesPrevMonth.total));
  const payKeys = Object.keys(s.byPay);
  if (payKeys.length) {
    L.push("แยกวิธีชำระเดือนนี้: " + payKeys.map((k) => k + " " + s.byPay[k].bills + " บิล/" + n0(s.byPay[k].total)).join(", "));
  }
  L.push("อัตราภาษีมูลค่าเพิ่มที่ระบบใช้: " + Math.round(VAT_RATE * 100) + "%");
  L.push("");

  L.push("## สินค้าขายดี 30 วันล่าสุด");
  if (s.topSellers.length) {
    L.push(row(["ชื่อ", "จำนวนที่ขาย", "ยอดเงิน"]));
    s.topSellers.forEach((t) => L.push(row([t.name, n0(t.qty), n0(t.amount)])));
  } else {
    L.push("ไม่มี — ยังไม่มีการขายใน 30 วันที่ผ่านมา");
  }
  L.push("");

  L.push("## รายการเคลื่อนไหวล่าสุด 10 รายการ");
  if (s.recent.length) {
    L.push(row(["วันที่", "ประเภท", "เลขที่", "สินค้า", "จำนวน", "คลัง"]));
    s.recent.forEach((t) => {
      L.push(row([t.date, t.type, t.docNo, t.product, n0(t.qty), t.wh]));
    });
  } else {
    L.push("ไม่มี — ยังไม่มีรายการเคลื่อนไหวในระบบ");
  }
  L.push("");

  L.push("## ผังที่เก็บสินค้า");
  L.push(
    "ช่องเก็บทั้งหมด " +
      s.storage.bins +
      " ช่อง, มีของอยู่ " +
      s.storage.usedBins +
      " ช่อง, คู่ (สินค้า+คลัง) ที่ยังระบุตำแหน่งไม่ครบ " +
      s.storage.unplacedItems
  );

  return L.join("\n");
}

/** สร้างข้อความสรุปพร้อมใช้ในขั้นตอนเดียว */
export function summarize(db, now = new Date()) {
  return renderSummary(buildSummary(db, now));
}
