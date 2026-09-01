// ชั้นข้อมูล — สร้างข้อมูลตั้งต้น และคำนวณยอดคงเหลือ (ฟังก์ชันบริสุทธิ์ทั้งหมด)
// การอ่าน/เขียนจริงอยู่ที่ lib/api.js ซึ่งคุยกับ Supabase

import { SEED_COLS, SEED_PROD, SEED_WH, SEED_ZONES, TYPES, VAT_RATE } from "./constants";
import { rng, uid } from "./format";

/* ------------------------------------------------------------------ seed */

/** สร้างชุดข้อมูลตัวอย่าง (คงที่ทุกครั้งเพราะใช้ seed เดียวกัน) */
export function seed() {
  const db = {
    warehouses: SEED_WH.map((w) => ({ ...w })),
    products: SEED_PROD.map((p, i) => ({ id: "PR" + (i + 1), img: "", note: "", ...p })),
    txns: [],
    locations: [],
    placements: [],
    sales: [],
    saleItems: [],
  };

  const r = rng(20260827);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 7, 1);
  const days = Math.floor((now - start) / 86400000);
  const users = ["admin", "somchai.k", "nipa.s", "wichai.p"];

  // ยอดยกมาต้นงวดของทุกสินค้าในทุกคลัง
  db.products.forEach((p) => {
    db.warehouses.forEach((w) => {
      db.txns.push({
        id: uid(),
        type: "RECEIVE",
        docNo: "RC-OPEN-" + p.code + "-" + w.code,
        date: start.toISOString().slice(0, 10),
        productId: p.id,
        qty: Math.round(p.min * (1.2 + r() * 2.2)),
        whId: w.id,
        whTo: "",
        note: "ยอดยกมาต้นงวด",
        ref: "ยกมา",
        user: "admin",
        ts: start.getTime(),
      });
    });
  });

  // รายการเคลื่อนไหวย้อนหลัง
  const kinds = ["RECEIVE", "ISSUE", "ISSUE", "ISSUE", "TRANSFER", "ADJUST"];
  for (let i = 0; i < 320; i++) {
    const d = new Date(start.getTime() + Math.floor(r() * days) * 86400000 + 7 * 86400000);
    if (d > now) continue;

    const p = db.products[Math.floor(r() * db.products.length)];
    const w = db.warehouses[Math.floor(r() * db.warehouses.length)];
    const type = kinds[Math.floor(r() * kinds.length)];

    let qty = Math.max(1, Math.round(p.min * (0.05 + r() * 0.35)));
    let whTo = "";

    if (type === "TRANSFER") {
      let t = db.warehouses[Math.floor(r() * db.warehouses.length)];
      if (t.id === w.id) t = db.warehouses[(db.warehouses.indexOf(w) + 3) % db.warehouses.length];
      whTo = t.id;
    }
    if (type === "ADJUST") {
      qty = (r() < 0.5 ? -1 : 1) * Math.max(1, Math.round(p.min * r() * 0.06));
    }

    db.txns.push({
      id: uid(),
      type,
      docNo: "",
      date: d.toISOString().slice(0, 10),
      productId: p.id,
      qty,
      whId: w.id,
      whTo,
      note: type === "ADJUST" ? "ปรับปรุงจากการตรวจนับ" : "",
      ref: "",
      user: users[Math.floor(r() * users.length)],
      ts: d.getTime(),
    });
  }

  // ---------------------------------------------------------- การขายหน้าร้าน
  // สร้างบิลขายย้อนหลัง พร้อมรายการ SALE ที่ตัดสต็อกจริง
  const payMethods = ["CASH", "CASH", "CASH", "TRANSFER", "CARD"];
  const customers = ["", "", "ลูกค้าทั่วไป", "สหกรณ์ชาวสวนยาง", "ร้านค้าชุมชน", "บจก. ยางไทยพัฒนา"];

  for (let i = 0; i < 60; i++) {
    const d = new Date(start.getTime() + Math.floor(r() * days) * 86400000 + 14 * 86400000);
    if (d > now) continue;

    const w = db.warehouses[Math.floor(r() * db.warehouses.length)];
    const saleId = uid();
    const ts = d.getTime();
    const lineCount = 1 + Math.floor(r() * 3);

    const picked = [];
    let subtotal = 0;

    for (let k = 0; k < lineCount; k++) {
      const p = db.products[Math.floor(r() * db.products.length)];
      if (picked.some((x) => x.productId === p.id)) continue;

      const qty = Math.max(1, Math.round(p.min * (0.01 + r() * 0.05)));
      const amount = qty * p.price;
      subtotal += amount;

      picked.push({ productId: p.id, qty, price: p.price, amount });
    }
    if (!picked.length) continue;

    const discount = r() < 0.25 ? Math.round(subtotal * 0.05) : 0;
    const net = subtotal - discount;
    const vat = Math.round(net * VAT_RATE * 100) / 100;
    const total = Math.round((net + vat) * 100) / 100;
    const paid = Math.ceil(total / 100) * 100;

    db.sales.push({
      id: saleId,
      docNo: "",
      date: d.toISOString().slice(0, 10),
      whId: w.id,
      customer: customers[Math.floor(r() * customers.length)],
      subtotal,
      discount,
      vat,
      total,
      paid,
      change: Math.round((paid - total) * 100) / 100,
      payMethod: payMethods[Math.floor(r() * payMethods.length)],
      user: "admin",
      note: "",
      ts,
    });

    picked.forEach((line) => {
      db.saleItems.push({ id: uid(), saleId, ...line });
      db.txns.push({
        id: uid(),
        type: "SALE",
        docNo: "",
        date: d.toISOString().slice(0, 10),
        productId: line.productId,
        qty: line.qty,
        whId: w.id,
        whTo: "",
        note: "ขายหน้าร้าน",
        ref: saleId,
        user: "admin",
        ts,
      });
    });
  }

  db.txns.sort((a, b) => a.ts - b.ts);
  db.sales.sort((a, b) => a.ts - b.ts);

  // ออกเลขที่เอกสารตามลำดับเวลา
  const seq = {};
  const nextNo = (type, date) => {
    const key = TYPES[type].code + date.slice(0, 7).replace("-", "");
    seq[key] = (seq[key] || 0) + 1;
    return key.slice(0, 2) + "-" + key.slice(2) + "-" + String(seq[key]).padStart(4, "0");
  };

  // บิลขายต้องได้เลขก่อน แล้วจึงผูกกับรายการ SALE ที่อ้าง saleId ไว้
  const saleDocNo = {};
  db.sales.forEach((s) => {
    s.docNo = nextNo("SALE", s.date);
    saleDocNo[s.id] = s.docNo;
  });

  db.txns.forEach((t) => {
    if (t.docNo) return;
    if (t.type === "SALE") {
      t.docNo = saleDocNo[t.ref] || nextNo("SALE", t.date);
      t.ref = t.docNo;
      return;
    }
    t.docNo = nextNo(t.type, t.date);
  });

  // ------------------------------------------------------- ผังที่เก็บสินค้า
  // สร้างช่องเก็บให้ทุกคลัง แล้วนำยอดคงเหลือปัจจุบันไปวางลงช่องให้ครบ
  db.warehouses.forEach((w) => {
    SEED_ZONES.forEach((zone, zi) => {
      for (let c = 1; c <= SEED_COLS; c++) {
        db.locations.push({
          id: uid(),
          whId: w.id,
          code: zone + "-" + String(c).padStart(2, "0"),
          name: "ชั้นวาง " + zone + " ช่อง " + c,
          zone,
          row: zi + 1,
          col: c,
          kind: zone === "C" ? "floor" : "shelf",
          capacity: zone === "C" ? 5000 : 2000,
          note: "",
        });
      }
    });
  });

  const stock = stockMap(db);
  db.warehouses.forEach((w) => {
    const bins = db.locations.filter((l) => l.whId === w.id);
    db.products.forEach((p, pi) => {
      const qty = stock[p.id + "|" + w.id] || 0;
      if (qty <= 0) return;
      const bin = bins[pi % bins.length];
      db.placements.push({ id: uid(), productId: p.id, locationId: bin.id, qty, note: "" });
    });
  });

  return db;
}

/* ------------------------------------------------------------ lookups */

export const prodById = (db, id) => db.products.find((p) => p.id === id);
export const whById = (db, id) => db.warehouses.find((w) => w.id === id);
export const prodName = (db, id) => {
  const p = prodById(db, id);
  return p ? p.name : "(ถูกลบ)";
};
export const whName = (db, id) => {
  const w = whById(db, id);
  return w ? w.name : "—";
};

/** รหัสสินค้าถัดไปในรูปแบบ Pnnn */
export function nextProdCode(db) {
  let n = 1;
  db.products.forEach((p) => {
    const m = /^P(\d+)$/.exec(p.code);
    if (m) n = Math.max(n, parseInt(m[1], 10) + 1);
  });
  return "P" + String(n).padStart(3, "0");
}

/* -------------------------------------------------- document numbers */

/**
 * เลขที่เอกสารถัดไป เช่น RC-202608-0007
 *
 * คำนวณจากเลขที่สูงสุดที่มีอยู่จริงใน txns (ไม่ใช้ตัวนับแยก)
 * เพราะฐานข้อมูลใช้ร่วมกันหลายเครื่อง ตัวนับที่เก็บฝั่ง client จะไม่ตรงกัน
 */
export function nextDocNo(db, type, dateISO) {
  const ym = (dateISO || new Date().toISOString().slice(0, 10)).slice(0, 7).replace("-", "");
  const prefix = TYPES[type].code + "-" + ym + "-";

  let max = 0;
  db.txns.forEach((t) => {
    if (!t.docNo || !t.docNo.startsWith(prefix)) return;
    const n = parseInt(t.docNo.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  });

  return prefix + String(max + 1).padStart(4, "0");
}

/* ------------------------------------------------- คำนวณยอดคงเหลือ */

/** คำนวณยอดคงเหลือทั้งหมดในครั้งเดียว → { "productId|whId": qty } */
export function stockMap(db) {
  const m = Object.create(null);
  const add = (pid, wid, q) => {
    const k = pid + "|" + wid;
    m[k] = (m[k] || 0) + q;
  };
  db.txns.forEach((t) => {
    if (t.type === "RECEIVE") add(t.productId, t.whId, t.qty);
    else if (t.type === "ISSUE" || t.type === "SALE") add(t.productId, t.whId, -t.qty);
    else if (t.type === "ADJUST") add(t.productId, t.whId, t.qty);
    else if (t.type === "TRANSFER") {
      add(t.productId, t.whId, -t.qty);
      add(t.productId, t.whTo, t.qty);
    }
  });
  return m;
}

export const stockOf = (m, pid, wid) => m[pid + "|" + wid] || 0;

export function stockTotal(db, m, pid) {
  return db.warehouses.reduce((s, w) => s + (m[pid + "|" + w.id] || 0), 0);
}

export function whTotal(db, m, wid) {
  return db.products.reduce((s, p) => s + (m[p.id + "|" + wid] || 0), 0);
}

/**
 * การเคลื่อนไหวของรายการหนึ่ง เมื่อมองจากคลังที่ระบุ
 * ถ้าไม่ระบุคลัง (wid ว่าง) = มองภาพรวมทั้งองค์กร ซึ่งการโอนจะไม่ทำให้ยอดเปลี่ยน
 */
export function movement(t, wid) {
  if (t.type === "RECEIVE") return !wid || t.whId === wid ? t.qty : 0;
  if (t.type === "ISSUE" || t.type === "SALE") return !wid || t.whId === wid ? -t.qty : 0;
  if (t.type === "ADJUST") return !wid || t.whId === wid ? t.qty : 0;
  if (t.type === "TRANSFER") {
    if (!wid) return 0;
    if (t.whId === wid) return -t.qty;
    if (t.whTo === wid) return t.qty;
  }
  return 0;
}

/* -------------------------------------------------- ผังที่เก็บสินค้า */

/** ช่องเก็บทั้งหมดของคลัง จัดกลุ่มเป็นแถวตามโซน พร้อมเรียงตามคอลัมน์ */
export function zonesOf(db, whId) {
  const bins = db.locations.filter((l) => l.whId === whId);
  const byZone = new Map();
  bins.forEach((l) => {
    if (!byZone.has(l.zone)) byZone.set(l.zone, []);
    byZone.get(l.zone).push(l);
  });
  return Array.from(byZone.entries())
    .map(([zone, items]) => ({ zone, items: items.sort((a, b) => a.col - b.col) }))
    .sort((a, b) => a.zone.localeCompare(b.zone));
}

/** รายการสินค้าที่วางอยู่ในช่องเก็บนี้ */
export const placementsIn = (db, locationId) =>
  db.placements.filter((pl) => pl.locationId === locationId);

/** จำนวนรวมที่วางอยู่ในช่องเก็บนี้ */
export const binQty = (db, locationId) =>
  placementsIn(db, locationId).reduce((s, pl) => s + pl.qty, 0);

/** จำนวนของสินค้าหนึ่งที่ถูกระบุตำแหน่งแล้วในคลังนี้ */
export function placedQty(db, productId, whId) {
  const ids = new Set(db.locations.filter((l) => l.whId === whId).map((l) => l.id));
  return db.placements
    .filter((pl) => pl.productId === productId && ids.has(pl.locationId))
    .reduce((s, pl) => s + pl.qty, 0);
}

/** ช่องเก็บที่สินค้าหนึ่งถูกวางอยู่ (ทุกคลัง) */
export function locationsOfProduct(db, productId) {
  return db.placements
    .filter((pl) => pl.productId === productId)
    .map((pl) => ({ placement: pl, location: db.locations.find((l) => l.id === pl.locationId) }))
    .filter((x) => x.location);
}

/* ------------------------------------------------------- การขาย (POS) */

/** ค้นหาสินค้าจากบาร์โค๊ดหรือรหัสสินค้า — ใช้ตอนยิงบาร์โค๊ดที่หน้า POS */
export function findByScan(db, text) {
  const q = String(text || "").trim();
  if (!q) return null;
  const lower = q.toLowerCase();
  return (
    db.products.find((p) => p.barcode && p.barcode === q) ||
    db.products.find((p) => p.code.toLowerCase() === lower) ||
    null
  );
}

/** รายการสินค้าของบิลขายหนึ่งใบ */
export const itemsOfSale = (db, saleId) => db.saleItems.filter((i) => i.saleId === saleId);

/** คำนวณยอดท้ายบิลจากรายการและส่วนลด */
export function saleTotals(lines, discount, vatRate) {
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const disc = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const net = subtotal - disc;
  const vat = Math.round(net * vatRate * 100) / 100;
  const total = Math.round((net + vat) * 100) / 100;
  return { subtotal, discount: disc, net, vat, total };
}
