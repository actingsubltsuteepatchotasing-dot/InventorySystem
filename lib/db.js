// ชั้นข้อมูล — สร้างข้อมูลตั้งต้น, อ่าน/เขียน localStorage และคำนวณยอดคงเหลือ
// ตามข้อกำหนด "ไม่ต้องใช้ Database" ข้อมูลทั้งหมดเก็บในเบราว์เซอร์ของผู้ใช้

import { SEED_PROD, SEED_WH, STORE_KEY, TYPES } from "./constants";
import { rng, uid } from "./format";

/* ------------------------------------------------------------------ seed */

/** สร้างชุดข้อมูลตัวอย่าง (คงที่ทุกครั้งเพราะใช้ seed เดียวกัน) */
export function seed() {
  const db = {
    warehouses: SEED_WH.map((w) => ({ ...w })),
    products: SEED_PROD.map((p, i) => ({ id: "PR" + (i + 1), img: "", note: "", ...p })),
    txns: [],
    counters: {},
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

  db.txns.sort((a, b) => a.ts - b.ts);

  // ออกเลขที่เอกสารตามลำดับเวลา
  const seq = {};
  db.txns.forEach((t) => {
    if (t.docNo) return;
    const key = TYPES[t.type].code + t.date.slice(0, 7).replace("-", "");
    seq[key] = (seq[key] || 0) + 1;
    t.docNo = key.slice(0, 2) + "-" + key.slice(2) + "-" + String(seq[key]).padStart(4, "0");
  });
  db.counters = seq;

  return db;
}

/* ------------------------------------------------------- persistence */

/** อ่านข้อมูลจาก localStorage — ถ้าไม่มีหรือเสียหายจะสร้างข้อมูลตัวอย่างใหม่ */
export function loadDB() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.products && d.warehouses && d.txns) {
        d.counters = d.counters || {};
        return d;
      }
    }
  } catch (e) {
    // ข้อมูลเสียหาย → สร้างใหม่
  }
  const fresh = seed();
  saveDB(fresh);
  return fresh;
}

/** บันทึกลง localStorage — คืน true เมื่อสำเร็จ */
export function saveDB(db) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
    return true;
  } catch (e) {
    return false;
  }
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

/** เลขที่เอกสารถัดไป เช่น RC-202608-0007 (ยังไม่จองเลข) */
export function nextDocNo(db, type, dateISO) {
  const ym = (dateISO || new Date().toISOString().slice(0, 10)).slice(0, 7).replace("-", "");
  const key = TYPES[type].code + ym;
  const n = (db.counters[key] || 0) + 1;
  return TYPES[type].code + "-" + ym + "-" + String(n).padStart(4, "0");
}

/** จองเลขที่เอกสาร (เรียกตอนบันทึกจริง) — แก้ไข db ที่ส่งเข้ามา */
export function commitDocNo(db, type, dateISO) {
  const ym = (dateISO || new Date().toISOString().slice(0, 10)).slice(0, 7).replace("-", "");
  const key = TYPES[type].code + ym;
  db.counters[key] = (db.counters[key] || 0) + 1;
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
    else if (t.type === "ISSUE") add(t.productId, t.whId, -t.qty);
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
  if (t.type === "ISSUE") return !wid || t.whId === wid ? -t.qty : 0;
  if (t.type === "ADJUST") return !wid || t.whId === wid ? t.qty : 0;
  if (t.type === "TRANSFER") {
    if (!wid) return 0;
    if (t.whId === wid) return -t.qty;
    if (t.whTo === wid) return t.qty;
  }
  return 0;
}
