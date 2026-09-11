// สรุปยอดคงเหลือรายคลัง และการเคลื่อนไหวเข้า–ออกในช่วงที่เลือก
//
// แยกจากหน้าจอเพราะเป็นการคำนวณล้วน ๆ ไม่มี JSX เลย ทดสอบใน Node ได้ตรง ๆ
// และหน้าจอเหลือหน้าที่แค่วาดตามที่ได้มา
//
// ---------------------------------------------------------------------------
// ยอดยกมาคิดจาก "ยอดปลายงวด ลบ การเคลื่อนไหวในงวด" ไม่ได้ไปไล่นับใหม่ถึงวันก่อนหน้า
//
//   ยกมา = คงเหลือ ณ วันสุดท้าย − (รับเข้า − จ่ายออก) ในช่วง
//
// ทำแบบนี้เพราะถ้าคิดยอดยกมาแยกอีกชุด (ไล่ txns ถึงวันก่อนวันเริ่ม) จะได้ตัวเลข
// ที่มาจากคนละที่กับยอดปลายงวด แล้ววันหนึ่งที่กติกาการนับเปลี่ยน (เช่น เพิ่ม
// ชนิดรายการใหม่) จะมีที่หนึ่งที่ลืมแก้ แล้วตารางจะบวกไม่ลงโดยไม่มีใครรู้ว่าผิดตรงไหน
// วิธีนี้รับประกันว่า ยกมา + รับเข้า − จ่ายออก = คงเหลือ เสมอ ไม่ว่ากติกาจะเปลี่ยนยังไง
//
// และยังต้องคิด "วันก่อนวันเริ่ม" เองด้วยถ้าทำอีกแบบ ซึ่งพลาดง่ายเรื่องเขตเวลา
// (ดูเหตุผลเรื่องเวลาไทยในตัวตรวจหมวด 7)

import { stockMap, whTotal } from "./db";

/** รายการเคลื่อนไหวที่อยู่ในช่วงวันที่ที่เลือก */
const inRange = (txns, from, to) =>
  txns.filter((t) => (!from || t.date >= from) && (!to || t.date <= to));

/*
 * เติมรายการที่ยังไม่มีให้เป็นอาร์เรย์ว่าง ก่อนส่งต่อให้ stockMap / whTotal
 *
 * ตอนเปิดหน้าจอจริง db มีครบทุกคีย์เสมอ แต่ตัวคำนวณนี้ถูกเรียกจากที่อื่นได้
 * (ชุดทดสอบ และวันหน้าคือรายงานหรือการ์ดบนแดชบอร์ด) การพังด้วย
 * "Cannot read properties of undefined" ตรงกลางการคำนวณ เป็นอาการที่ไล่หาต้นเหตุยาก
 * กว่าที่ควร ทั้งที่คำตอบที่ถูกคือ "ไม่มีข้อมูล" เฉย ๆ
 */
const norm = (db) => ({
  ...db,
  txns: (db && db.txns) || [],
  products: (db && db.products) || [],
  warehouses: (db && db.warehouses) || [],
});

/** ช่องนับของคลังหนึ่ง — แยกตามที่มาของของ ไม่ได้รวมเป็นเข้า/ออกก้อนเดียว */
const blank = () => ({
  receive: 0,
  issue: 0,
  sale: 0,
  adjUp: 0,
  adjDown: 0,
  transIn: 0,
  transOut: 0,
  docs: 0,
});

/**
 * นับการเคลื่อนไหวของคลังหนึ่ง จากรายการที่ให้มา
 *
 * ปรับปรุงแยกขึ้น/ลงเป็นคนละช่อง เพราะรายการชนิดเดียวกันเป็นได้ทั้งเพิ่มและลด
 * ถ้ารวมเป็นช่องเดียวแล้วบวกกัน การปรับขึ้น 10 กับปรับลง 10 จะหักล้างกันเป็นศูนย์
 * แล้วรายงานจะบอกว่า "ไม่มีการปรับปรุงเลย" ทั้งที่มีสองรายการที่ต้องอธิบายให้ผู้ตรวจฟัง
 *
 * การโอนนับสองฝั่ง: คลังต้นทางเป็นออก คลังปลายทางเป็นเข้า
 * ของยังอยู่ในระบบเท่าเดิม แต่ในมุมของ "คลังหนึ่ง" มันคือของที่เข้าหรือออกจริง
 */
export function whMovement(txns, whId) {
  const m = blank();
  txns.forEach((t) => {
    let hit = false;
    if (t.type === "RECEIVE" && t.whId === whId) {
      m.receive += t.qty;
      hit = true;
    } else if ((t.type === "ISSUE" || t.type === "SALE") && t.whId === whId) {
      if (t.type === "SALE") m.sale += t.qty;
      else m.issue += t.qty;
      hit = true;
    } else if (t.type === "ADJUST" && t.whId === whId) {
      if (t.qty >= 0) m.adjUp += t.qty;
      else m.adjDown += -t.qty;
      hit = true;
    } else if (t.type === "TRANSFER") {
      if (t.whId === whId) {
        m.transOut += t.qty;
        hit = true;
      }
      // โอนเข้าตัวเองไม่ได้ (ฐานข้อมูลกันไว้) จึงไม่ต้องกลัวนับซ้ำสองฝั่ง
      if (t.whTo === whId) {
        m.transIn += t.qty;
        hit = true;
      }
    }
    if (hit) m.docs += 1;
  });

  m.inQty = m.receive + m.adjUp + m.transIn;
  m.outQty = m.issue + m.sale + m.adjDown + m.transOut;
  m.net = m.inQty - m.outQty;
  return m;
}

/**
 * สรุปรายคลังทั้งหมด — หนึ่งแถวคือหนึ่งคลัง
 *
 * คืนทุกคลังเสมอ รวมถึงคลังที่ไม่มีความเคลื่อนไหวเลย
 * เพราะ "คลังนี้ทั้งเดือนไม่มีอะไรเข้าออกเลย" เป็นข้อมูลที่ต้องเห็น ไม่ใช่เรื่องที่ควรซ่อน
 */
export function whSummary(db, from, to) {
  const safe = norm(db);
  const closeMap = stockMap(safe, to);
  const ranged = inRange(safe.txns, from, to);
  const products = safe.products;

  return safe.warehouses.map((w) => {
    const m = whMovement(ranged, w.id);
    const close = whTotal(safe, closeMap, w.id);
    const value = products.reduce(
      (s, p) => s + (closeMap[p.id + "|" + w.id] || 0) * (p.price || 0),
      0
    );
    const items = products.filter((p) => (closeMap[p.id + "|" + w.id] || 0) !== 0).length;
    return { wh: w, ...m, open: close - m.net, close, value, items };
  });
}

/** รวมทุกคลังเป็นแถวเดียว ใช้เป็นแถวท้ายตารางและเป็นตัวเลขบนการ์ดสรุป */
export function whTotals(rows) {
  const keys = [
    "receive", "issue", "sale", "adjUp", "adjDown", "transIn", "transOut",
    "docs", "inQty", "outQty", "net", "open", "close", "value", "items",
  ];
  const t = {};
  keys.forEach((k) => {
    t[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  });
  return t;
}

/**
 * แยกรายสินค้าภายในคลังเดียว — ใช้ตอนกดดูรายละเอียดของคลังนั้น
 *
 * คืนเฉพาะสินค้าที่มียอดหรือมีความเคลื่อนไหวในช่วง
 * สินค้าที่ยอดเป็นศูนย์และทั้งงวดไม่ขยับเลย ไม่ได้ให้ข้อมูลอะไรกับคนอ่าน
 * มีแต่จะทำให้ตารางยาวจนหาของที่สนใจไม่เจอ
 */
export function whProducts(db, from, to, whId) {
  const safe = norm(db);
  const closeMap = stockMap(safe, to);
  const ranged = inRange(safe.txns, from, to).filter(
    (t) => t.whId === whId || t.whTo === whId
  );

  return safe.products
    .map((p) => {
      const m = whMovement(ranged.filter((t) => t.productId === p.id), whId);
      const close = closeMap[p.id + "|" + whId] || 0;
      return { product: p, ...m, open: close - m.net, close, value: close * (p.price || 0) };
    })
    .filter((r) => r.close !== 0 || r.inQty !== 0 || r.outQty !== 0)
    .sort((a, b) => b.close - a.close);
}

/**
 * ยอดเข้า–ออกรายเดือนของคลังหนึ่ง (หรือทุกคลังถ้าไม่ระบุ) ใช้เขียนกราฟแท่ง
 *
 * months มาจาก monthsBetween ของ lib/format เพื่อให้แกนเดือนตรงกับหน้าอื่น
 */
export function whByMonth(db, months, whIds) {
  const safe = norm(db);
  const ids = whIds && whIds.length ? whIds : safe.warehouses.map((w) => w.id);
  return months.map((mo) => {
    const list = safe.txns.filter((t) => String(t.date).slice(0, 7) === mo.key);
    let inQty = 0;
    let outQty = 0;
    ids.forEach((id) => {
      const m = whMovement(list, id);
      inQty += m.inQty;
      outQty += m.outQty;
    });
    return { key: mo.key, label: mo.label, inQty, outQty };
  });
}
