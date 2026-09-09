// งานลูกค้าสัมพันธ์ (CRM) — กติกาและการคำนวณทั้งหมด
//
// แยกจากหน้าจอเพราะตัวเลขชุดนี้ถูกใช้สี่ที่: หน้าโอกาสการขาย · หน้ากิจกรรม ·
// Customer 360 · และแท็บรายงาน ถ้าเขียนซ้ำในแต่ละหน้า ตัวเลขจะไม่ตรงกัน
// ทันทีที่แก้ที่ใดที่หนึ่ง (เคยเกิดแล้วกับยอดขายเทียบเป้า ดู lib/targets.js)
//
// กติกาที่ยึดไว้:
//   1. ไม่สร้างทะเบียนลูกค้าใหม่ — ผู้สนใจ (lead) กับลูกค้า (customer) คนละตาราง
//      เพราะ customers ถูกใบขายอ้างแบบ restrict และรายงานทุกตัวที่นับ
//      "จำนวนลูกค้า" จะเพี้ยนทันทีถ้าเอาคนที่ยังไม่เคยซื้อไปปนไว้ด้วย
//   2. ดีลผูกได้ทั้งกับลูกค้าและกับผู้สนใจ เพราะของจริงคุยกันก่อนเปิดเป็นลูกค้าเสมอ
//   3. ปิดดีลว่าชนะแล้ว "ไม่" สร้างใบขายให้อัตโนมัติ
//      ใบขายตัดสต็อกจริง ถ้าสร้างเองจะตัดของทั้งที่คนยังไม่ได้ตรวจ
//   4. ตัวเลขทุกตัวคำนวณสดจากข้อมูลจริง ไม่เก็บยอดสรุปไว้ในตาราง
//      กติกาเดียวกับยอดคงเหลือที่มาจาก txns เท่านั้น — เก็บสรุปไว้เมื่อไร
//      ก็เพี้ยนเมื่อนั้น และไม่มีทางรู้ว่าเพี้ยนตั้งแต่เมื่อไร

import { daysBetween, todayISO } from "./format";

/* ------------------------------------------------------------ ค่าคงที่ */

/**
 * ขั้นตอนการขาย — ลำดับในอาร์เรย์คือลำดับของกรวย (funnel)
 *
 * เฟส 1 ตั้งค่าตายตัวไว้ในโค้ดก่อน ยังไม่ทำหน้าจอให้แก้ขั้นตอนเอง
 * เพราะขั้นตอนที่แก้ได้ต้องรับมือกับดีลที่ค้างอยู่ในขั้นที่เพิ่งถูกลบทิ้ง
 * ซึ่งเป็นงานคนละก้อน และของจริงชุดนี้ครอบคลุมงานขายทั่วไปได้เกือบหมดแล้ว
 *
 * prob = โอกาสปิดได้โดยประมาณของขั้นนั้น ใช้เป็นค่าตั้งต้นให้คนแก้ทีหลังได้
 */
export const STAGES = [
  { id: "NEW", name: "เปิดโอกาส", prob: 10, kind: "gray" },
  { id: "QUALIFY", name: "คัดกรองแล้ว", prob: 30, kind: "info" },
  { id: "PROPOSAL", name: "เสนอราคาแล้ว", prob: 50, kind: "info" },
  { id: "NEGOTIATE", name: "กำลังต่อรอง", prob: 75, kind: "warn" },
  { id: "WON", name: "ปิดการขายได้", prob: 100, kind: "ok" },
  { id: "LOST", name: "เสียโอกาส", prob: 0, kind: "err" },
];

export const stageOf = (id) => STAGES.find((s) => s.id === id) || STAGES[0];

/** ขั้นที่ยังไล่ปิดอยู่ = ยังไม่ชนะและยังไม่แพ้ */
export const OPEN_STAGES = STAGES.filter((s) => s.id !== "WON" && s.id !== "LOST").map((s) => s.id);
export const isOpen = (d) => OPEN_STAGES.includes(d.stage);

/** ชนิดการติดต่อ */
export const ACT_KINDS = [
  { id: "CALL", name: "โทรศัพท์" },
  { id: "VISIT", name: "เข้าพบ" },
  { id: "EMAIL", name: "อีเมล" },
  { id: "LINE", name: "Line / แชท" },
  { id: "QUOTE", name: "ส่งใบเสนอราคา" },
  { id: "OTHER", name: "อื่น ๆ" },
];
export const actKindOf = (id) => ACT_KINDS.find((k) => k.id === id) || ACT_KINDS[0];

/** สถานะของผู้สนใจ */
export const LEAD_STATUS = [
  { id: "NEW", name: "ใหม่", kind: "info" },
  { id: "WORKING", name: "กำลังติดตาม", kind: "warn" },
  { id: "QUALIFIED", name: "ผ่านการคัดกรอง", kind: "info" },
  { id: "CONVERTED", name: "แปลงเป็นลูกค้าแล้ว", kind: "ok" },
  { id: "DROPPED", name: "ยกเลิก", kind: "gray" },
];
export const leadStatusOf = (id) => LEAD_STATUS.find((s) => s.id === id) || LEAD_STATUS[0];

/** แหล่งที่มาที่เจอบ่อย — เป็นแค่ตัวช่วยกรอก พิมพ์เองก็ได้ */
export const SOURCES = [
  "ลูกค้าเดิมแนะนำ",
  "โทรเข้ามาเอง",
  "เว็บไซต์",
  "Facebook / Line",
  "ออกบูธ / งานแสดงสินค้า",
  "พนักงานขายหาเอง",
];

/** เหตุผลที่เสียโอกาส — ต้องเลือกหรือพิมพ์เมื่อปิดดีลว่าแพ้ */
export const LOST_REASONS = [
  "ราคาสูงกว่าคู่แข่ง",
  "ลูกค้าเลื่อนการตัดสินใจ",
  "ของไม่พร้อมส่งตามกำหนด",
  "คู่แข่งได้งาน",
  "ติดต่อไม่ได้",
  "ไม่ตรงกับสิ่งที่ลูกค้าต้องการ",
];

/* ------------------------------------------------------ ตัวช่วยพื้นฐาน */

const list = (db, k) => (db && db[k]) || [];
const txt = (v) => String(v == null ? "" : v).trim();

/** อยู่ในช่วงวันที่ที่เลือกไหม (ช่องว่าง = ไม่จำกัดด้านนั้น) */
export function inRange(date, from, to) {
  const d = txt(date);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/** ชื่อคู่ค้าของดีลหรือกิจกรรม — ลูกค้าก่อน ถ้าไม่มีค่อยดูผู้สนใจ */
export function partyNameOf(db, row) {
  if (row.customerId) {
    const c = list(db, "customers").find((x) => x.id === row.customerId);
    if (c) return c.name;
  }
  if (row.leadId) {
    const l = list(db, "crmLeads").find((x) => x.id === row.leadId);
    if (l) return l.name;
  }
  // คู่ค้าถูกลบไปแล้ว ยังเหลือชื่อที่คัดลอกไว้ตอนบันทึก จึงไม่กลายเป็นแถวไร้ชื่อ
  return txt(row.partyName) || "(ไม่ระบุ)";
}

/* ------------------------------------------------------------ ผู้สนใจ */

export function leadProblems(v, all) {
  const out = [];
  const code = txt(v.code);
  const name = txt(v.name);

  if (!code) out.push("รหัสผู้สนใจ");
  else if ((all || []).some((x) => x.id !== v.id && x.code.toLowerCase() === code.toLowerCase())) {
    out.push("รหัสนี้มีอยู่แล้ว");
  }
  if (!name) out.push("ชื่อผู้สนใจ");
  // ต้องติดต่อกลับได้อย่างน้อยทางหนึ่ง ไม่งั้นรายชื่อนั้นเอาไปใช้งานต่อไม่ได้เลย
  if (!txt(v.phone) && !txt(v.email)) out.push("เบอร์โทรหรืออีเมลอย่างน้อยหนึ่งอย่าง");
  return out;
}

/** ผู้สนใจที่ยังไล่ตามอยู่ (ยังไม่แปลงเป็นลูกค้าและยังไม่ยกเลิก) */
export const openLeads = (db) =>
  list(db, "crmLeads").filter((l) => l.status !== "CONVERTED" && l.status !== "DROPPED");

/* -------------------------------------------------------- โอกาสการขาย */

export function dealProblems(v, all) {
  const out = [];
  const code = txt(v.code);

  if (!code) out.push("รหัสโอกาสการขาย");
  else if ((all || []).some((x) => x.id !== v.id && x.code.toLowerCase() === code.toLowerCase())) {
    out.push("รหัสนี้มีอยู่แล้ว");
  }
  if (!txt(v.name)) out.push("ชื่อโอกาสการขาย");

  // บังคับที่หน้าจอ ไม่ได้บังคับที่ฐานข้อมูล (ดูเหตุผลใน schema.sql)
  if (!v.customerId && !v.leadId) out.push("ต้องเลือกลูกค้าหรือผู้สนใจอย่างใดอย่างหนึ่ง");
  if (!txt(v.openDate)) out.push("วันที่เปิดโอกาส");
  if (Number(v.amount) < 0) out.push("มูลค่าต้องไม่ติดลบ");

  const prob = Number(v.probability);
  if (!Number.isFinite(prob) || prob < 0 || prob > 100) out.push("โอกาสปิดได้ต้องอยู่ระหว่าง 0-100");

  // แพ้แล้วต้องบอกเหตุผล ไม่งั้นรายงานแพ้-ชนะจะไม่มีอะไรให้เรียนรู้เลย
  if (v.stage === "LOST" && !txt(v.lostReason)) out.push("เหตุผลที่เสียโอกาส");
  if ((v.stage === "WON" || v.stage === "LOST") && !txt(v.closeDate)) out.push("วันที่ปิด");

  return out;
}

/** ดีลที่ผ่านตัวกรอง — ใช้ร่วมกันทั้งหน้าจอและรายงาน */
export function filterDeals(db, f) {
  const q = txt(f && f.q).toLowerCase();
  return list(db, "crmDeals")
    .filter((d) => {
      if (f && f.stage && d.stage !== f.stage) return false;
      if (f && f.openOnly && !isOpen(d)) return false;
      if (f && f.salesId && d.salesId !== f.salesId) return false;
      if (f && (f.from || f.to) && !inRange(d.openDate, f.from, f.to)) return false;
      if (!q) return true;
      const hay = [d.code, d.name, partyNameOf(db, d), d.source, d.note].join(" ").toLowerCase();
      return q.split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
    })
    .slice()
    .sort((a, b) => b.ts - a.ts);
}

/**
 * สรุปกรวยการขายตามขั้น
 *
 * weighted = มูลค่า x โอกาสปิดได้ ใช้ประมาณรายได้ที่น่าจะเข้าจริง
 * ดูแต่มูลค่ารวมอย่างเดียวจะมองโลกในแง่ดีเกินไปเสมอ เพราะรวมดีลที่เพิ่งเปิดไว้ด้วย
 */
export function pipelineOf(db, f) {
  const deals = filterDeals(db, f);
  return STAGES.map((s) => {
    const rows = deals.filter((d) => d.stage === s.id);
    const amount = rows.reduce((n, d) => n + (Number(d.amount) || 0), 0);
    const weighted = rows.reduce(
      (n, d) => n + ((Number(d.amount) || 0) * (Number(d.probability) || 0)) / 100,
      0
    );
    return { ...s, count: rows.length, amount, weighted, rows };
  });
}

/**
 * อัตราชนะ = ชนะ ÷ (ชนะ + แพ้)
 * นับเฉพาะดีลที่ปิดไปแล้ว ดีลที่ยังค้างอยู่ไม่ถูกนับ
 * ถ้าเอาดีลที่ยังไม่ปิดมาหารด้วย อัตราจะต่ำเสมอโดยไม่มีความหมาย
 * ยังไม่มีดีลปิดเลยคืน null ไม่ใช่ 0 เพราะ "ยังไม่รู้" คนละเรื่องกับ "แพ้หมด"
 */
export function winRate(deals) {
  const won = deals.filter((d) => d.stage === "WON").length;
  const lost = deals.filter((d) => d.stage === "LOST").length;
  if (!won && !lost) return null;
  return (won * 100) / (won + lost);
}

/** จำนวนวันเฉลี่ยที่ใช้ปิดดีล (นับเฉพาะที่ปิดแล้วและมีวันครบ) */
export function avgCloseDays(deals) {
  const done = deals.filter((d) => !isOpen(d) && d.openDate && d.closeDate);
  if (!done.length) return null;
  const total = done.reduce((n, d) => n + Math.max(0, daysBetween(d.openDate, d.closeDate)), 0);
  return total / done.length;
}

/* ---------------------------------------------------------- กิจกรรม */

export function activityProblems(v) {
  const out = [];
  if (!txt(v.date)) out.push("วันที่ติดต่อ");
  if (!v.customerId && !v.leadId && !v.dealId) out.push("ต้องเลือกลูกค้า ผู้สนใจ หรือโอกาสการขาย");
  if (!txt(v.subject)) out.push("เรื่องที่คุย");
  if (txt(v.nextDate) && txt(v.nextDate) < txt(v.date)) out.push("วันนัดครั้งถัดไปต้องไม่ก่อนวันที่ติดต่อ");
  return out;
}

export function filterActivities(db, f) {
  const q = txt(f && f.q).toLowerCase();
  return list(db, "crmActivities")
    .filter((a) => {
      if (f && f.kind && a.kind !== f.kind) return false;
      if (f && f.salesId && a.salesId !== f.salesId) return false;
      if (f && f.customerId && a.customerId !== f.customerId) return false;
      if (f && (f.from || f.to) && !inRange(a.date, f.from, f.to)) return false;
      if (!q) return true;
      const hay = [partyNameOf(db, a), a.subject, a.result, a.note].join(" ").toLowerCase();
      return q.split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
    })
    .slice()
    .sort((a, b) => (a.date === b.date ? b.ts - a.ts : b.date.localeCompare(a.date)));
}

/**
 * งานที่ต้องตาม = นัดครั้งถัดไปถึงกำหนดแล้วหรือเลยกำหนด
 * เรียงของที่เลยกำหนดขึ้นก่อน เพราะเป็นสิ่งที่ต้องรีบที่สุด
 */
export function dueList(db, today) {
  const day = today || todayISO();
  return list(db, "crmActivities")
    .filter((a) => txt(a.nextDate) && a.nextDate <= day)
    .map((a) => ({ ...a, overdue: a.nextDate < day, lateDays: daysBetween(a.nextDate, day) }))
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}

/** จำนวนกิจกรรมแยกตามพนักงานขาย ใช้ทั้งรายงานและตัวชี้วัด */
export function activityByPerson(db, f) {
  const rows = filterActivities(db, f);
  const map = new Map();
  rows.forEach((a) => {
    const sp = list(db, "salespersons").find((x) => x.id === a.salesId);
    const key = sp ? sp.code + " " + sp.name : "(ไม่ระบุพนักงานขาย)";
    const cur = map.get(key) || { name: key, total: 0, kinds: {} };
    cur.total += 1;
    cur.kinds[a.kind] = (cur.kinds[a.kind] || 0) + 1;
    map.set(key, cur);
  });
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/* ------------------------------------------------- ภาพรวมของลูกค้าราย */

/**
 * สรุปลูกค้าหนึ่งราย (Customer 360)
 *
 * ยอดซื้อใช้ยอดก่อนภาษี (base) ให้ตรงกับกติกาของเป้าขาย (ดู lib/targets.js)
 * ภาษีเป็นเงินที่เก็บแทนรัฐ ไม่ใช่ยอดขายของกิจการ
 */
export function customerSummary(db, customerId, today) {
  const day = today || todayISO();
  const invoices = list(db, "invoices")
    .filter((v) => v.customerId === customerId)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  const base = invoices.reduce((n, v) => n + (Number(v.base) || 0), 0);
  const last = invoices[0] || null;
  const deals = list(db, "crmDeals").filter((d) => d.customerId === customerId);
  const acts = list(db, "crmActivities")
    .filter((a) => a.customerId === customerId)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    invoices,
    bills: invoices.length,
    base,
    avgBill: invoices.length ? base / invoices.length : 0,
    lastBuy: last ? last.date : "",
    quietDays: last ? daysBetween(last.date, day) : null,
    deals,
    openDeals: deals.filter(isOpen),
    wonDeals: deals.filter((d) => d.stage === "WON"),
    winRate: winRate(deals),
    activities: acts,
    lastContact: acts[0] ? acts[0].date : "",
    nextDate: acts.map((a) => a.nextDate).filter(Boolean).sort()[0] || "",
  };
}

/**
 * ลูกค้าเงียบ — เคยซื้อแล้วแต่ไม่ซื้อมานานเกินกำหนด
 *
 * นับจากใบขายจริง ไม่ได้นับจากกิจกรรม เพราะ "เงียบ" ในทางธุรกิจคือไม่มีเงินเข้า
 * ลูกค้าที่คุยกันบ่อยแต่ไม่เคยซื้อ เป็นคนละปัญหาและอยู่ในรายงานกรวยการขายแทน
 */
export function silentCustomers(db, days, today) {
  const day = today || todayISO();
  const limit = Number(days) || 90;

  return list(db, "customers")
    .map((c) => {
      const inv = list(db, "invoices")
        .filter((v) => v.customerId === c.id)
        .sort((a, b) => b.date.localeCompare(a.date));
      if (!inv.length) return null;
      const quiet = daysBetween(inv[0].date, day);
      return {
        id: c.id,
        code: c.code,
        name: c.name,
        province: c.province,
        lastBuy: inv[0].date,
        quietDays: quiet,
        bills: inv.length,
        base: inv.reduce((n, v) => n + (Number(v.base) || 0), 0),
      };
    })
    .filter((x) => x && x.quietDays >= limit)
    .sort((a, b) => b.quietDays - a.quietDays);
}

/* --------------------------------------------------------- ตัวชี้วัด */

/**
 * ตัวเลขสรุปของช่วงเวลาหนึ่ง — ใช้ที่หน้าโอกาสการขายและรายงาน
 * ทุกค่าคำนวณสดจากข้อมูลจริง ไม่มีการเก็บยอดสรุปไว้ที่ไหน
 */
export function crmSummary(db, f) {
  const deals = filterDeals(db, f);
  const acts = filterActivities(db, f);
  const open = deals.filter(isOpen);

  return {
    deals: deals.length,
    open: open.length,
    openAmount: open.reduce((n, d) => n + (Number(d.amount) || 0), 0),
    weighted: open.reduce(
      (n, d) => n + ((Number(d.amount) || 0) * (Number(d.probability) || 0)) / 100,
      0
    ),
    won: deals.filter((d) => d.stage === "WON").length,
    wonAmount: deals
      .filter((d) => d.stage === "WON")
      .reduce((n, d) => n + (Number(d.amount) || 0), 0),
    lost: deals.filter((d) => d.stage === "LOST").length,
    winRate: winRate(deals),
    avgDays: avgCloseDays(deals),
    activities: acts.length,
    leads: list(db, "crmLeads").filter((l) => !f || !f.from || inRange(l.tsDate || "", f.from, f.to))
      .length,
  };
}
