// ชั้นข้อมูล — สร้างข้อมูลตั้งต้น และคำนวณยอดคงเหลือ (ฟังก์ชันบริสุทธิ์ทั้งหมด)
// การอ่าน/เขียนจริงอยู่ที่ lib/api.js ซึ่งคุยกับ Supabase

import {
  SEED_COLS,
  SEED_COMPANY,
  SEED_CUST,
  SEED_DOC_GROUPS,
  SEED_PROD,
  SEED_WH,
  SEED_ZONES,
  TYPES,
  VAT_RATE,
} from "./constants";
import { rng, todayISO, uid } from "./format";

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
    docGroups: SEED_DOC_GROUPS.map((g) => ({ ...g })),
    customers: SEED_CUST.map((c) => ({ ...c })),
    company: { ...SEED_COMPANY },
    // ไม่มีแถวสิทธิ = เปิดใช้งานได้ทุกหน้าจอ (ดู permOf)
    perms: [],
    // ใบขายไม่มีตัวอย่างให้ เพราะแต่ละใบตัดสต็อกจริง
    // ถ้าสร้างตัวอย่างมาให้ ยอดคงเหลือของข้อมูลตั้งต้นจะไม่ตรงกับที่อธิบายไว้ในเอกสาร
    invoices: [],
    invoiceItems: [],
  };

  const r = rng(20260827);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 7, 1);
  const days = Math.floor((now - start) / 86400000);
  const users = ["admin", "somchai.k", "nipa.s", "wichai.p"];

  // ---------------------------------------------------- ผังที่เก็บสินค้า
  // ต้องสร้างช่องเก็บก่อนรายการเคลื่อนไหว เพราะทุกรายการต้องระบุช่องเก็บ
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

  /**
   * ช่องเก็บประจำของสินค้าหนึ่งในคลังหนึ่ง
   *
   * ข้อมูลตัวอย่างให้สินค้าแต่ละรายการอยู่ช่องเดียวต่อคลัง เพื่อให้ยอดในช่องเก็บ
   * รวมกันเท่ากับยอดคงเหลือของคลังเสมอ และไม่มีทางติดลบ
   * ของจริงผู้ใช้เลือกช่องเองได้ทุกครั้งที่ทำรายการ
   */
  const binsOf = new Map();
  db.warehouses.forEach((w) => binsOf.set(w.id, db.locations.filter((l) => l.whId === w.id)));
  const indexOfProduct = new Map(db.products.map((p, i) => [p.id, i]));
  const homeBin = (productId, whId) => {
    const bins = binsOf.get(whId) || [];
    if (!bins.length) return "";
    return bins[(indexOfProduct.get(productId) || 0) % bins.length].id;
  };

  // ตั้งคลังและที่เก็บประจำให้สินค้าตัวอย่าง = ช่องประจำในคลังแรก
  // หน้าจอต่าง ๆ จะเลือกคู่นี้ให้อัตโนมัติเมื่อเลือกสินค้า
  const homeWh = db.warehouses[0];
  db.products.forEach((p) => {
    p.defWhId = homeWh.id;
    p.defLocId = homeBin(p.id, homeWh.id);
  });

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
        locId: homeBin(p.id, w.id),
        locTo: "",
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
    let locTo = "";

    if (type === "TRANSFER") {
      let t = db.warehouses[Math.floor(r() * db.warehouses.length)];
      if (t.id === w.id) t = db.warehouses[(db.warehouses.indexOf(w) + 3) % db.warehouses.length];
      whTo = t.id;
      locTo = homeBin(p.id, t.id);
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
      locId: homeBin(p.id, w.id),
      locTo,
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
      // ช่องเก็บบนหัวบิล = ช่องของสินค้ารายการแรก ใช้เป็นค่าตั้งต้นบนหน้าจอ
      locId: homeBin(picked[0].productId, w.id),
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
        // ตัดจากช่องประจำของสินค้ารายการนั้น ไม่ใช่ช่องบนหัวบิล
        // ไม่งั้นช่องเก็บจะติดลบเพราะสินค้าในบิลเดียวไม่ได้อยู่ช่องเดียวกัน
        locId: homeBin(line.productId, w.id),
        locTo: "",
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

  // การจัดวางสินค้าคำนวณจากรายการเคลื่อนไหวทั้งหมด ไม่ได้สุ่มแยกต่างหาก
  // จึงรับประกันว่ายอดในช่องเก็บรวมกันเท่ากับยอดคงเหลือของคลังเสมอ
  db.placements = placementsFromTxns(db.txns);

  return db;
}

/**
 * สร้างรายการจัดวางสินค้าจากรายการเคลื่อนไหวทั้งชุด
 * ใช้ตอนสร้างข้อมูลตัวอย่าง และตอนซ่อมผังที่เก็บให้ตรงกับรายการจริง
 */
export function placementsFromTxns(txns) {
  const out = [];
  mergeBinDeltas(txns).forEach((qty, key) => {
    if (qty <= 0) return;
    const cut = key.indexOf("|");
    out.push({
      id: uid(),
      productId: key.slice(0, cut),
      locationId: key.slice(cut + 1),
      qty,
      note: "",
    });
  });
  return out;
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

/* ---------------------------------------------- ที่เก็บสินค้า (ช่องเก็บ) */

export const locById = (db, id) => db.locations.find((l) => l.id === id);

/** ช่องเก็บทั้งหมดของคลังหนึ่ง เรียงตามโซนแล้วตามคอลัมน์ */
export const locsOf = (db, whId) =>
  db.locations
    .filter((l) => l.whId === whId)
    .sort((a, b) => (a.zone === b.zone ? a.col - b.col : a.zone.localeCompare(b.zone)));

/** ช่องเก็บช่องแรกของคลัง ใช้เป็นค่าตั้งต้นบนหน้าจอ — คืน "" ถ้าคลังยังไม่มีช่องเก็บ */
export const firstLocOf = (db, whId) => {
  const list = locsOf(db, whId);
  return list.length ? list[0].id : "";
};

/** ชื่อที่เก็บแบบสั้น เช่น "A-01 — ชั้นวาง A ช่อง 1" */
export const locName = (db, id) => {
  const l = locById(db, id);
  if (!l) return "—";
  return l.name ? l.code + " — " + l.name : l.code;
};

/** ชื่อเต็มพร้อมคลัง ใช้ในรายงานที่ต้องเห็นทั้งคู่ */
export const whLocName = (db, whId, locId) =>
  whName(db, whId) + " · " + (locId ? locName(db, locId) : "ยังไม่ระบุที่เก็บ");

/** ที่เก็บนี้อยู่ในคลังนี้จริงหรือไม่ — คลังกับที่เก็บต้องไปด้วยกันเสมอ */
export const locInWh = (db, locId, whId) => {
  const l = locById(db, locId);
  return !!l && l.whId === whId;
};

/**
 * ตรวจว่าคู่ คลัง+ที่เก็บ ใช้ได้ไหม
 * @returns {string} ข้อความผิดพลาด หรือ "" ถ้าผ่าน
 */
export function checkWhLoc(db, whId, locId, label = "คลังสินค้า") {
  if (!whId) return "กรุณาเลือก" + label;
  if (!locId) {
    // แยกสาเหตุให้ชัด: ไม่ได้เลือก กับ ไม่มีให้เลือก แก้คนละวิธีกัน
    if (locsOf(db, whId).length === 0) {
      return whName(db, whId) + " ยังไม่มีช่องเก็บ — ไปเพิ่มที่หน้าจอผังที่เก็บสินค้าก่อน";
    }
    return "กรุณาเลือกที่เก็บใน" + label;
  }
  if (!locById(db, locId)) return "ไม่พบที่เก็บที่เลือก";
  if (!locInWh(db, locId, whId)) return "ที่เก็บที่เลือกไม่ได้อยู่ใน" + label;
  return "";
}

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

/** กลุ่มเอกสารของชนิดรายการนี้ ถ้ายังไม่ได้ตั้งค่าไว้ให้ใช้ค่าเริ่มต้นเดิม */
export function docGroupOf(db, type) {
  const saved = (db && db.docGroups ? db.docGroups : []).find((g) => g.id === type);
  if (saved) return saved;
  return SEED_DOC_GROUPS.find((g) => g.id === type) || SEED_DOC_GROUPS[0];
}

/**
 * ส่วนหน้าของเลขที่เอกสาร (ทุกอย่างที่อยู่ก่อนตัวเลขรัน) เช่น "RC-202608-"
 *
 * ส่วนนี้ทำหน้าที่สองอย่างพร้อมกัน: เป็นทั้งชื่อชุดเอกสาร และเป็นตัวกำหนดรอบ
 * ที่เลขจะขึ้นต้นใหม่ เพราะเลขรันนับจากเอกสารที่ขึ้นต้นด้วย prefix เดียวกันเท่านั้น
 * ดังนั้น period = none คือไม่ใส่ปี/เดือน เลขจึงวิ่งต่อเนื่องตลอด
 */
export function docPrefixOf(group, dateISO) {
  const d = dateISO || todayISO();
  const head = String(group.prefix || "").trim();
  if (group.period === "none") return head + "-";
  if (group.period === "year") return head + "-" + d.slice(0, 4) + "-";
  return head + "-" + d.slice(0, 7).replace("-", "") + "-";
}

/**
 * จำนวนหลักของเลขรัน
 *
 * ค่าที่ใช้ไม่ได้ (ว่าง ศูนย์ ไม่ใช่ตัวเลข) ถือว่า "ยังไม่ได้ตั้ง" จึงคืนค่าเริ่มต้น 4
 * ส่วนค่าที่อยู่นอกช่วงจะถูกบีบให้อยู่ในช่วงเดียวกับ constraint ของฐานข้อมูล
 */
function docDigits(group) {
  const n = Number(group.digits);
  if (!Number.isFinite(n) || n <= 0) return 4;
  return Math.min(8, Math.max(2, Math.trunc(n)));
}

/** ตัวอย่างเลขที่เอกสารของกลุ่มนี้ ใช้แสดงให้ดูตอนตั้งค่า */
export function docSample(group, dateISO) {
  return docPrefixOf(group, dateISO) + "1".padStart(docDigits(group), "0");
}

/**
 * เลขที่เอกสารถัดไป เช่น RC-202608-0007
 *
 * คำนวณจากเลขที่สูงสุดที่มีอยู่จริงใน txns (ไม่ใช้ตัวนับแยก)
 * เพราะฐานข้อมูลใช้ร่วมกันหลายเครื่อง ตัวนับที่เก็บฝั่ง client จะไม่ตรงกัน
 *
 * รูปแบบมาจากกลุ่มเอกสาร (หน้าจอการกำหนดกลุ่มเอกสาร) ถ้ายังไม่ได้ตั้งค่า
 * จะได้รูปแบบเดิมทุกประการ
 */
export function nextDocNo(db, type, dateISO) {
  const group = docGroupOf(db, type);
  const prefix = docPrefixOf(group, dateISO);
  const digits = docDigits(group);

  let max = 0;
  db.txns.forEach((t) => {
    if (!t.docNo || !t.docNo.startsWith(prefix)) return;
    // ตัดเฉพาะส่วนที่เป็นตัวเลขล้วน กันเลขเก่าที่มีรูปแบบอื่นมาปนแล้วนับเพี้ยน
    const tail = t.docNo.slice(prefix.length);
    if (!/^\d+$/.test(tail)) return;
    const n = parseInt(tail, 10);
    if (n > max) max = n;
  });

  return prefix + String(max + 1).padStart(digits, "0");
}

/** รหัสลูกค้าถัดไปในรูปแบบ Cnnnn */
export function nextCustCode(db) {
  let n = 1;
  (db.customers || []).forEach((c) => {
    const m = /^C(\d+)$/.exec(c.code || "");
    if (m) n = Math.max(n, parseInt(m[1], 10) + 1);
  });
  return "C" + String(n).padStart(4, "0");
}

/* --------------------------------------------- สิทธิการใช้งานหน้าจอ */

/**
 * สิทธิของหน้าจอหนึ่ง
 *
 * ยังไม่เคยตั้งค่า = เปิดหมด ไม่ใช่ปิดหมด
 * ถ้าค่าเริ่มต้นเป็นปิด ระบบที่เพิ่งติดตั้งจะเปิดมาแล้วว่างเปล่า
 * คนใช้จะคิดว่าโปรแกรมพัง ไม่ได้คิดว่ายังไม่ได้ตั้งสิทธิ
 */
export function permOf(db, screenId) {
  const found = (db && db.perms ? db.perms : []).find((p) => p.id === screenId);
  if (!found) return { id: screenId, view: true, edit: true, date: true };
  return found;
}

/* --------------------------------------- ใบขายสินค้าและบริการ (คิดเงิน) */

/** ปัดเป็นทศนิยม 2 ตำแหน่งแบบจำนวนเงิน */
export function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

/**
 * รวมเงินของบรรทัดหนึ่ง = จำนวน x ราคาต่อหน่วย แล้วหักส่วนลดการค้า
 *
 * หักเปอร์เซ็นต์ก่อน แล้วค่อยหักจำนวนเงิน เพราะเป็นลำดับที่ใช้กันในเอกสารการค้า
 * ("ลด 10% แล้วลดอีก 50 บาท") ถ้าสลับลำดับ ยอดจะไม่ตรงกับที่คนคิดในใจ
 *
 * ส่วนลดเกินยอดถูกจำกัดไว้ที่ 0 ไม่ปล่อยให้ติดลบ
 * บรรทัดที่ติดลบจะทำให้ยอดภาษีติดลบตามไปด้วย ซึ่งเป็นเอกสารที่ยื่นไม่ได้
 */
export function lineAmount(line) {
  const qty = Number(line.qty) || 0;
  const price = Number(line.price) || 0;
  const pct = Math.min(100, Math.max(0, Number(line.discPct) || 0));
  const amt = Math.max(0, Number(line.discAmt) || 0);

  const gross = money(qty * price);
  const afterPct = money(gross - (gross * pct) / 100);
  return Math.max(0, money(afterPct - amt));
}

/**
 * ยอดท้ายบิล
 *
 * ยอดก่อนภาษี = รวมทุกบรรทัด - ส่วนลดท้ายบิล
 * ภาษีคิดจากยอดหลังหักส่วนลดท้ายบิล ไม่ใช่ก่อนหัก
 * เพราะส่วนลดท้ายบิลเป็นส่วนลดการค้า ซึ่งลดฐานภาษีจริง
 */
export function invoiceTotals(lines, billDiscount, vatPercent) {
  const itemsTotal = money(lines.reduce((sum, l) => sum + lineAmount(l), 0));
  const discount = Math.min(itemsTotal, Math.max(0, money(billDiscount)));
  const base = money(itemsTotal - discount);
  const rate = Math.min(100, Math.max(0, Number(vatPercent) || 0));
  const vat = money((base * rate) / 100);

  return { itemsTotal, discount, base, rate, vat, total: money(base + vat) };
}

/** รายการในใบขายใบหนึ่ง เรียงตามลำดับที่กรอกไว้ */
export function itemsOfInvoice(db, invoiceId) {
  return (db.invoiceItems || [])
    .filter((i) => i.invoiceId === invoiceId)
    .sort((a, b) => (a.seq || 0) - (b.seq || 0));
}

/** ที่อยู่ลูกค้าแบบบรรทัดเดียว ใช้พิมพ์บนเอกสารและส่งให้แผนที่ */
export function customerAddress(c) {
  if (!c) return "";
  const bkk = c.province === "กรุงเทพมหานคร";
  return [
    c.address,
    c.subdistrict ? (bkk ? "แขวง" : "ตำบล") + c.subdistrict : "",
    c.district ? (bkk ? "" : "อำเภอ") + c.district : "",
    c.province ? (bkk ? "" : "จังหวัด") + c.province : "",
    c.postcode,
  ]
    .filter(Boolean)
    .join(" ");
}

/* ------------------------------------------------- คำนวณยอดคงเหลือ */

/**
 * คำนวณยอดคงเหลือทั้งหมดในครั้งเดียว → { "productId|whId": qty }
 *
 * @param {object} db
 * @param {string} [untilISO] ถ้าระบุ จะนับเฉพาะรายการถึงวันนั้น (รวมวันนั้นด้วย)
 *   ใช้ตอนดูยอด ณ วันสิ้นสุดของช่วงที่เลือกบนแดชบอร์ด
 */
export function stockMap(db, untilISO) {
  const m = Object.create(null);
  const add = (pid, wid, q) => {
    const k = pid + "|" + wid;
    m[k] = (m[k] || 0) + q;
  };
  db.txns.forEach((t) => {
    if (untilISO && t.date > untilISO) return;
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

/* ------------------------------------ ผลกระทบของรายการต่อช่องเก็บ */

/**
 * รายการหนึ่งทำให้ของในช่องเก็บไหนเปลี่ยนไปเท่าไร
 *
 * ใช้ตรรกะเดียวกับ stockMap แต่ลงลึกถึงระดับช่องเก็บ
 * รายการเก่าที่ยังไม่มี locId (ก่อนอัปเกรด) จะไม่ให้ผลอะไร — ตั้งใจให้เป็นแบบนั้น
 * ไม่งั้นผังที่เก็บจะเพี้ยนจากข้อมูลที่ไม่ครบ
 *
 * @returns {Array<{productId:string, locationId:string, delta:number}>}
 */
export function binDeltas(t) {
  const out = [];
  if (!t) return out;
  const push = (locationId, delta) => {
    if (locationId && delta) out.push({ productId: t.productId, locationId, delta });
  };

  if (t.type === "RECEIVE" || t.type === "ADJUST") push(t.locId, t.qty);
  else if (t.type === "ISSUE" || t.type === "SALE") push(t.locId, -t.qty);
  else if (t.type === "TRANSFER") {
    push(t.locId, -t.qty);
    push(t.locTo, t.qty);
  }
  return out;
}

/**
 * รวมผลกระทบของหลายรายการเป็นยอดสุทธิต่อคู่ (สินค้า, ช่องเก็บ)
 * @returns {Map<string, number>} คีย์คือ productId + "|" + locationId
 */
export function mergeBinDeltas(txns) {
  const m = new Map();
  (txns || []).forEach((t) =>
    binDeltas(t).forEach((d) => {
      const k = d.productId + "|" + d.locationId;
      m.set(k, (m.get(k) || 0) + d.delta);
    })
  );
  return m;
}

/**
 * คลังและที่เก็บประจำของสินค้า ที่ยังใช้ได้จริง
 *
 * ใช้เป็นค่าตั้งต้นบนหน้าจอต่าง ๆ ไม่ได้บังคับว่าของต้องอยู่ที่นั่นเท่านั้น
 * คืน null ถ้ายังไม่ได้ตั้ง หรือช่องเก็บถูกลบ/ย้ายคลังไปแล้ว
 * (ต้องเช็คซ้ำเพราะไฟล์สำรองเก่ากู้คืนเข้ามาได้โดยไม่ผ่าน foreign key)
 *
 * @returns {{whId:string, locId:string}|null}
 */
export function defaultBinOf(db, productId) {
  const p = prodById(db, productId);
  if (!p || !p.defWhId || !p.defLocId) return null;
  if (!locInWh(db, p.defLocId, p.defWhId)) return null;
  return { whId: p.defWhId, locId: p.defLocId };
}

/**
 * ช่องเก็บในคลังนี้ที่ควรหยิบของรายการนี้
 *
 * ลำดับความสำคัญ:
 *   1. ที่เก็บประจำของสินค้า ถ้าอยู่ในคลังนี้และมีของอยู่จริง
 *   2. ช่องที่มีของรายการนี้มากที่สุด
 *   3. ที่เก็บประจำ ถ้าอยู่ในคลังนี้ (แม้ยังไม่มีของ — ใช้ตอนรับของเข้า)
 *   4. ช่องแรกของคลัง เพื่อให้ยังเลือกต่อได้
 */
export function bestBinFor(db, productId, whId) {
  const bins = locsOf(db, whId);
  const def = defaultBinOf(db, productId);
  const defHere = def && def.whId === whId ? def.locId : "";

  if (defHere && placedIn(db, productId, defHere) > 0) return defHere;

  let best = "";
  let most = 0;
  bins.forEach((l) => {
    const q = placedIn(db, productId, l.id);
    if (q > most) {
      most = q;
      best = l.id;
    }
  });

  return best || defHere || (bins.length ? bins[0].id : "");
}

/**
 * การเคลื่อนไหวของรายการหนึ่ง เมื่อมองจากช่องเก็บที่ระบุ
 * คู่กับ movement() ที่มองจากคลัง — การโอนระหว่างช่องในคลังเดียวกัน
 * จะเห็นเป็น -qty ที่ช่องต้นทางและ +qty ที่ช่องปลายทาง
 */
export function movementInBin(t, locId) {
  if (!locId) return 0;
  return binDeltas(t)
    .filter((d) => d.locationId === locId)
    .reduce((s, d) => s + d.delta, 0);
}

/** จำนวนของสินค้าหนึ่งที่วางอยู่ในช่องเก็บหนึ่ง */
export function placedIn(db, productId, locationId) {
  const pl = db.placements.find(
    (x) => x.productId === productId && x.locationId === locationId
  );
  return pl ? pl.qty : 0;
}

/**
 * แปลงรายการเคลื่อนไหวชุดใหม่เป็นคำสั่งแก้ผังที่เก็บ
 *
 * @param {object} db ข้อมูลปัจจุบัน
 * @param {Array} txns รายการที่กำลังจะบันทึก
 * @param {function} newId ตัวออก id ให้แถวที่ยังไม่มี
 * @returns {{upserts:Array, deletes:Array<string>, shortages:Array}}
 *          shortages = ช่องที่ของไม่พอ (ยอดจะติดลบ) ผู้เรียกต้องหยุดถ้าไม่ว่าง
 */
export function planPlacementChanges(db, txns, newId) {
  const upserts = [];
  const deletes = [];
  const shortages = [];

  mergeBinDeltas(txns).forEach((delta, key) => {
    if (!delta) return;
    const cut = key.indexOf("|");
    const productId = key.slice(0, cut);
    const locationId = key.slice(cut + 1);

    const existing = db.placements.find(
      (x) => x.productId === productId && x.locationId === locationId
    );
    const before = existing ? existing.qty : 0;
    const after = before + delta;

    if (after < 0) {
      shortages.push({ productId, locationId, available: before, need: -delta });
      return;
    }
    if (after === 0) {
      if (existing) deletes.push(existing.id);
      return;
    }
    upserts.push({
      id: existing ? existing.id : newId(),
      productId,
      locationId,
      qty: after,
      note: existing ? existing.note : "",
    });
  });

  return { upserts, deletes, shortages };
}

/** นำคำสั่งแก้ผังไปใช้กับชุด placements ในหน่วยความจำ */
export function applyPlacementChanges(placements, plan) {
  const dropped = new Set(plan.deletes);
  const byKey = new Map(plan.upserts.map((u) => [u.productId + "|" + u.locationId, u]));

  const next = [];
  placements.forEach((pl) => {
    if (dropped.has(pl.id)) return;
    const k = pl.productId + "|" + pl.locationId;
    const hit = byKey.get(k);
    if (hit) {
      next.push({ ...pl, qty: hit.qty });
      byKey.delete(k);
      return;
    }
    next.push(pl);
  });
  byKey.forEach((u) => next.push(u));
  return next;
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
