// งานผ่านไลน์ — สถานะ การอ่านไฟล์แชทที่ส่งออกมา และตัวเลขสรุปสำหรับรายงาน
//
// ฟังก์ชันบริสุทธิ์ทั้งไฟล์ ไม่มี JSX และไม่แตะฐานข้อมูล ทดสอบใน Node ได้ตรง ๆ
// ส่วนการอ่านข้อความให้เป็นรายการสินค้าอยู่ที่ lib/lineParse.js

import { cleanText } from "./lineParse";

/* -------------------------------------------------------------- สถานะ */

/**
 * ที่มาของข้อความ
 *
 * เก็บไว้เพราะสามทางนี้เชื่อถือได้ไม่เท่ากัน และเวลาไล่ตรวจย้อนหลัง
 * ต้องตอบให้ได้ว่าข้อความนี้เข้ามาทางไหน:
 *   WEBHOOK ระบบรับมาเองจาก LINE ตอนลูกค้าพิมพ์ — มีลายเซ็นของ LINE ยืนยัน
 *   IMPORT  คนเอาไฟล์แชทที่ส่งออกจากแอปมาโหลดเข้า — เชื่อตามไฟล์
 *   MANUAL  คนพิมพ์ใส่เอง — เชื่อตามคนที่พิมพ์
 */
export const LINE_SOURCES = [
  { id: "WEBHOOK", name: "รับอัตโนมัติจากไลน์", badge: "bdg-ok" },
  { id: "IMPORT", name: "นำเข้าจากไฟล์แชท", badge: "bdg-info" },
  { id: "MANUAL", name: "พิมพ์เข้าเอง", badge: "bdg-gray" },
];

/** ชนิดข้อความที่ไลน์ส่งมาได้ ข้อความที่ไม่ใช่ตัวอักษรแปลงเป็นรายการสินค้าไม่ได้ */
export const LINE_MSG_KINDS = [
  { id: "TEXT", name: "ข้อความ" },
  { id: "IMAGE", name: "รูปภาพ" },
  { id: "FILE", name: "ไฟล์" },
  { id: "STICKER", name: "สติกเกอร์" },
  { id: "OTHER", name: "อื่น ๆ" },
];

/**
 * สถานะของคำสั่งซื้อที่มาจากไลน์
 *
 * ไล่จากซ้ายไปขวา ข้ามขั้นไม่ได้ ยกเว้นยกเลิกซึ่งทำได้ทุกเมื่อก่อนออกเอกสาร
 *   NEW       เพิ่งดึงข้อความมา ยังไม่มีใครดู
 *   REVIEW    มีคนกดแปลงเป็นรายการแล้ว กำลังตรวจ/แก้
 *   CONFIRMED ตรวจแล้วว่ารายการถูก พร้อมออกเอกสาร
 *   QUOTED    ออกใบเสนอราคาแล้ว
 *   INVOICED  ออกใบขายแล้ว — ปลายทางสุดท้าย
 *   CANCEL    ยกเลิก (ลูกค้าไม่เอาแล้ว / คุยกันไม่จบ)
 */
export const LINE_ORDER_STATUS = [
  { id: "NEW", name: "ใหม่", badge: "bdg-warn" },
  { id: "REVIEW", name: "กำลังตรวจ", badge: "bdg-info" },
  { id: "CONFIRMED", name: "ยืนยันรายการแล้ว", badge: "bdg-info" },
  { id: "QUOTED", name: "ออกใบเสนอราคาแล้ว", badge: "bdg-ok" },
  { id: "INVOICED", name: "ออกใบขายแล้ว", badge: "bdg-ok" },
  { id: "CANCEL", name: "ยกเลิก", badge: "bdg-err" },
];

/** สถานะที่ถือว่าปิดงานแล้ว ไม่ต้องตามต่อ */
export const CLOSED_STATUS = ["QUOTED", "INVOICED", "CANCEL"];

/** สถานะของใบเสนอราคา */
export const QUOTE_STATUS = [
  { id: "DRAFT", name: "ร่าง", badge: "bdg-gray" },
  { id: "SENT", name: "ส่งให้ลูกค้าแล้ว", badge: "bdg-info" },
  { id: "ACCEPTED", name: "ลูกค้าตอบรับ", badge: "bdg-ok" },
  { id: "REJECTED", name: "ลูกค้าปฏิเสธ", badge: "bdg-err" },
  { id: "INVOICED", name: "ออกใบขายแล้ว", badge: "bdg-ok" },
];

export const sourceOf = (id) => LINE_SOURCES.find((x) => x.id === id) || LINE_SOURCES[2];
export const orderStatusOf = (id) =>
  LINE_ORDER_STATUS.find((x) => x.id === id) || LINE_ORDER_STATUS[0];
export const quoteStatusOf = (id) => QUOTE_STATUS.find((x) => x.id === id) || QUOTE_STATUS[0];

/* ------------------------------------------------------------- รหัสถัดไป */

/**
 * ออกรหัสถัดไปของทะเบียนหนึ่ง เช่น LN-0007
 *
 * ดูจากรหัสที่มีอยู่จริง ไม่ใช่นับจำนวนแถว
 * เพราะลบแถวกลาง ๆ ทิ้งแล้วนับจำนวนจะได้รหัสซ้ำกับของเดิมทันที
 */
export function nextLineCode(list, prefix, width = 4) {
  let max = 0;
  const re = new RegExp("^" + prefix + "-(\\d+)$", "i");
  (list || []).forEach((x) => {
    const m = re.exec(String(x.code || ""));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return prefix + "-" + String(max + 1).padStart(width, "0");
}

/* ------------------------------------------ อ่านไฟล์แชทที่ส่งออกจากไลน์ */

/**
 * แปลงไฟล์แชทที่ส่งออกจากแอปไลน์ ให้เป็นรายการข้อความ
 *
 * ทำไมต้องมีทางนี้ ทั้งที่มีการรับอัตโนมัติแล้ว:
 *   การรับอัตโนมัติต้องมีบัญชีทางการ (LINE Official Account) และตั้งค่า
 *   Messaging API ซึ่งหลายที่ยังไม่มี และบทสนทนาที่เกิดก่อนเชื่อมระบบก็ดึงย้อนไม่ได้
 *   ทางนี้ใช้ได้ทันทีตั้งแต่วันแรก และดึงของเก่าย้อนหลังได้ด้วย
 *
 * รูปแบบไฟล์ที่ไลน์ส่งออก (ทั้งไทยและอังกฤษ):
 *   บรรทัดวันที่   2026/09/11(ศ.)  หรือ  11/09/2026
 *   บรรทัดข้อความ  10:23 <tab> ชื่อคนส่ง <tab> ข้อความ
 *   ข้อความหลายบรรทัดจะขึ้นบรรทัดใหม่โดยไม่มีเวลานำหน้า ต้องต่อเข้ากับข้อความก่อนหน้า
 *
 * บรรทัดที่อ่านไม่ออกจะถูกข้าม ไม่ทำให้ทั้งไฟล์ล้ม
 * เพราะไฟล์จริงมีหัวไฟล์ บรรทัดว่าง และข้อความระบบ ("สมชายเข้าร่วมแชท") ปนอยู่เสมอ
 */
export function parseChatExport(text) {
  const out = [];
  let date = "";
  let cur = null;

  const push = () => {
    if (cur && cleanText(cur.text)) out.push({ ...cur, text: cleanText(cur.text) });
    cur = null;
  };

  String(text || "")
    .split(/\r?\n/)
    .forEach((line) => {
      // ---- บรรทัดวันที่ (ปี/เดือน/วัน) เช่น 2026/09/11(ศ.)
      const ymd = /^\s*(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(line);
      if (ymd && !/\d{1,2}:\d{2}/.test(line)) {
        push();
        date = ymd[1] + "-" + ymd[2].padStart(2, "0") + "-" + ymd[3].padStart(2, "0");
        return;
      }

      // ---- บรรทัดวันที่ (วัน/เดือน/ปี) เช่น 11/09/2026 หรือ Sat, 09/11/2026
      const dmy = /(\d{1,2})[/](\d{1,2})[/](\d{4})/.exec(line);
      if (dmy && !/\d{1,2}:\d{2}/.test(line)) {
        push();
        // ไฟล์ภาษาไทยเรียง วัน/เดือน/ปี ส่วนภาษาอังกฤษเรียง เดือน/วัน/ปี
        // ตัวเลขที่เกิน 12 คือวันแน่นอน ใช้ตัวนั้นตัดสิน ถ้าทั้งคู่ไม่เกิน 12 ให้ถือตามแบบไทย
        const a = parseInt(dmy[1], 10);
        const b = parseInt(dmy[2], 10);
        const [d, mo] = a > 12 ? [a, b] : b > 12 ? [b, a] : [a, b];
        date =
          dmy[3] + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        return;
      }

      // ---- บรรทัดข้อความ: เวลา <tab> ผู้ส่ง <tab> ข้อความ
      const msg = /^(\d{1,2}):(\d{2})\t([^\t]*)\t?([\s\S]*)$/.exec(line);
      if (msg) {
        push();
        cur = {
          date,
          time: msg[1].padStart(2, "0") + ":" + msg[2],
          sender: cleanText(msg[3]),
          text: msg[4] || "",
        };
        return;
      }

      // ---- บรรทัดต่อเนื่องของข้อความก่อนหน้า
      if (cur && line.trim()) cur.text += "\n" + line;
    });

  push();
  // ข้อความระบบของไลน์ไม่ใช่คำสั่งซื้อ และไม่มีใครอยากเห็นในกล่องข้อความ
  return out.filter((m) => m.date && !/^\[?(สติกเกอร์|ภาพ|รูปภาพ|Sticker|Photo)\]?$/i.test(m.text));
}

/* --------------------------------------------------------- ยอดเงินของใบ */

/**
 * รวมเงินของใบเสนอราคา — กติกาเดียวกับใบขายทุกประการ
 *
 * จงใจให้เหมือนกันเป๊ะ เพราะใบเสนอราคาที่ลูกค้าตอบรับแล้วต้องกลายเป็นใบขาย
 * ที่ยอดตรงกัน ถ้าคิดคนละกติกา ลูกค้าจะเห็นยอดเปลี่ยนตอนได้ใบกำกับภาษี
 * ซึ่งเป็นเรื่องที่อธิบายยากที่สุดเรื่องหนึ่งในงานขาย
 */
export function quoteTotals(lines, billDiscount, vatPercent) {
  const itemsTotal = (lines || []).reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const disc = Math.min(Math.max(Number(billDiscount) || 0, 0), itemsTotal);
  const base = Math.round((itemsTotal - disc) * 100) / 100;
  const vat = Math.round(base * ((Number(vatPercent) || 0) / 100) * 100) / 100;
  return { itemsTotal, billDiscount: disc, base, vat, total: Math.round((base + vat) * 100) / 100 };
}

/** วันที่ยืนราคาถึง — นับจากวันที่ออกใบ บวกจำนวนวันที่ยืนราคา */
export function validUntil(dateISO, days) {
  const n = Number(days) || 0;
  if (!dateISO || n <= 0) return "";
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/** ใบเสนอราคาหมดอายุแล้วหรือยัง ณ วันที่ที่กำหนด */
export const isExpired = (quote, todayISO) =>
  !!(quote && quote.validTo && todayISO && quote.validTo < todayISO &&
    quote.status !== "INVOICED" && quote.status !== "REJECTED");

/* ------------------------------------------------------------- รายงาน */

const inRange = (list, from, to) =>
  (list || []).filter((x) => (!from || x.date >= from) && (!to || x.date <= to));

/**
 * ตัวเลขสรุปของงานผ่านไลน์ในช่วงที่เลือก
 *
 * วัด "อัตราปิดการขาย" จากคำสั่งซื้อที่จบแล้วเท่านั้น (ออกเอกสารหรือยกเลิก)
 * ไม่นับใบที่ยังคุยกันอยู่เป็นตัวหาร ไม่งั้นวันที่มีคำสั่งซื้อใหม่เข้ามาเยอะ ๆ
 * อัตราปิดจะดิ่งลงทันทีทั้งที่ยังไม่มีใครแพ้งานสักใบ ซึ่งทำให้ตัวเลขนี้ใช้ตัดสินใจไม่ได้
 */
export function lineSummary(db, from, to) {
  const orders = inRange(db.lineOrders || [], from, to);
  const msgs = inRange(db.lineMessages || [], from, to);
  const quotes = inRange(db.quotes || [], from, to);

  const byStatus = {};
  LINE_ORDER_STATUS.forEach((s) => {
    byStatus[s.id] = orders.filter((o) => o.status === s.id).length;
  });

  const done = orders.filter((o) => CLOSED_STATUS.includes(o.status));
  const won = orders.filter((o) => o.status === "QUOTED" || o.status === "INVOICED");

  // มูลค่าที่ปิดได้จริง นับจากใบขายที่ผูกกับคำสั่งซื้อจากไลน์
  const invoices = db.invoices || [];
  const fromLine = new Set(orders.map((o) => o.invoiceId).filter(Boolean));
  const invValue = invoices
    .filter((v) => fromLine.has(v.id))
    .reduce((s, v) => s + (Number(v.total) || 0), 0);

  const quoteValue = quotes.reduce((s, q) => s + (Number(q.total) || 0), 0);

  return {
    messages: msgs.length,
    orders: orders.length,
    byStatus,
    open: orders.length - done.length,
    closed: done.length,
    won: won.length,
    winRate: done.length ? Math.round((won.length / done.length) * 1000) / 10 : 0,
    quotes: quotes.length,
    quoteValue,
    invoices: fromLine.size,
    invValue,
    // เวลาเฉลี่ยจากข้อความแรกจนออกเอกสาร (ชั่วโมง) — วัดความไวในการตอบงาน
    leadHours: avgLeadHours(orders, db),
  };
}

/** เวลาเฉลี่ยจากคำสั่งซื้อเข้ามา จนออกเอกสารสำเร็จ หน่วยเป็นชั่วโมง */
function avgLeadHours(orders, db) {
  const quotes = db.quotes || [];
  const invoices = db.invoices || [];
  const spans = [];

  orders.forEach((o) => {
    const doc =
      (o.invoiceId && invoices.find((v) => v.id === o.invoiceId)) ||
      (o.quoteId && quotes.find((q) => q.id === o.quoteId));
    if (!doc || !o.ts || !doc.ts || doc.ts < o.ts) return;
    spans.push((doc.ts - o.ts) / 3600000);
  });

  if (!spans.length) return null;
  return Math.round((spans.reduce((s, x) => s + x, 0) / spans.length) * 10) / 10;
}

/**
 * สินค้าที่ถูกสั่งผ่านไลน์มากที่สุด
 *
 * นับจากรายการในคำสั่งซื้อ ไม่ได้นับจากใบขาย เพราะคำถามคือ
 * "ลูกค้าถามหาอะไรทางไลน์" ซึ่งรวมของที่สุดท้ายไม่ได้ขายด้วย
 * ของที่ถูกถามบ่อยแต่ปิดไม่ได้ คือสิ่งที่ต้องรู้มากที่สุด
 */
export function topLineProducts(db, from, to, limit = 10) {
  const ids = new Set(inRange(db.lineOrders || [], from, to).map((o) => o.id));
  const acc = new Map();

  (db.lineOrderItems || []).forEach((it) => {
    if (!ids.has(it.orderId) || !it.productId) return;
    const cur = acc.get(it.productId) || { qty: 0, times: 0 };
    cur.qty += Number(it.qty) || 0;
    cur.times += 1;
    acc.set(it.productId, cur);
  });

  return [...acc.entries()]
    .map(([productId, v]) => ({ productId, ...v }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

/**
 * คำที่ระบบยังจับคู่สินค้าไม่ได้ เรียงตามความถี่
 *
 * นี่คือรายการงานที่ต้องทำของหน้า "คำเรียกสินค้าของลูกค้า"
 * ทุกคำในนี้คือครั้งที่คนต้องมานั่งเลือกสินค้าเอง สอนไว้ครั้งเดียวแล้วไม่ต้องทำอีก
 */
export function unmatchedWords(db, from, to, limit = 20) {
  const ids = new Set(inRange(db.lineOrders || [], from, to).map((o) => o.id));
  const acc = new Map();

  (db.lineOrderItems || []).forEach((it) => {
    if (!ids.has(it.orderId) || it.productId) return;
    const w = cleanText(it.raw);
    if (!w) return;
    acc.set(w, (acc.get(w) || 0) + 1);
  });

  return [...acc.entries()]
    .map(([word, times]) => ({ word, times }))
    .sort((a, b) => b.times - a.times || a.word.localeCompare(b.word, "th"))
    .slice(0, limit);
}

/** คู่สนทนาที่สั่งของผ่านไลน์มากที่สุด */
export function topLineParties(db, from, to, limit = 10) {
  const acc = new Map();
  inRange(db.lineOrders || [], from, to).forEach((o) => {
    const k = cleanText(o.partyName) || "(ไม่ระบุชื่อ)";
    const cur = acc.get(k) || { orders: 0, won: 0 };
    cur.orders += 1;
    if (o.status === "QUOTED" || o.status === "INVOICED") cur.won += 1;
    acc.set(k, cur);
  });

  return [...acc.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, limit);
}
