// แปลงข้อความสั่งของจากไลน์ ให้เป็นรายการสินค้าพร้อมจำนวน
//
// เป็นฟังก์ชันบริสุทธิ์ทั้งไฟล์ ไม่มี JSX และไม่แตะฐานข้อมูล ทดสอบใน Node ได้ตรง ๆ
//
// ---------------------------------------------------------------------------
// หลักคิด: ตัวแปลงนี้ "เดา" ไม่ได้ "ตัดสิน"
//
// ลูกค้าพิมพ์อะไรก็ได้ในไลน์ ไม่มีทางแปลงถูก 100% ตัวแปลงจึงทำหน้าที่
// ร่างรายการให้คนตรวจ แล้วบอกด้วยว่าแต่ละบรรทัดมั่นใจแค่ไหนและจับคู่ด้วยวิธีอะไร
// ไม่มีทางไหนเลยที่ข้อความจากไลน์จะกลายเป็นเอกสารตัดสต็อกโดยไม่มีคนกดยืนยัน
//
// บรรทัดที่หาสินค้าไม่เจอจะไม่ถูกทิ้งเงียบ ๆ แต่ถูกยกไปอยู่ใน unmatched
// ให้คนเลือกสินค้าเอง แล้วบันทึกคำนั้นเป็น "คำเรียกของลูกค้า" (alias) ไว้ใช้ครั้งหน้า
// ระบบจึงแม่นขึ้นเรื่อย ๆ ตามคำที่ลูกค้ากลุ่มนี้ใช้จริง แทนที่จะต้องเดาให้ถูกตั้งแต่ครั้งแรก
// ---------------------------------------------------------------------------

/** เลขไทย ๐-๙ ลูกค้าพิมพ์มาได้จริง โดยเฉพาะจากแป้นพิมพ์มือถือ */
const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

/**
 * หน่วยนับที่พบบ่อย ใช้ช่วยแยกว่า "500" เป็นจำนวนหรือเป็นราคา
 * รายการนี้เป็นตัวช่วย ไม่ใช่ข้อบังคับ — หน่วยจริงของสินค้าแต่ละตัวถูกเติมเข้ามาตอนใช้งาน
 */
export const UNIT_WORDS = [
  "ชิ้น", "อัน", "ใบ", "ตัว", "แผ่น", "เส้น", "ม้วน", "ขวด", "ถุง", "ห่อ",
  "กล่อง", "ลัง", "แพ็ค", "แพค", "โหล", "ชุด", "คู่", "คัน", "ต้น", "ลูก",
  "กก", "กก.", "กิโล", "กิโลกรัม", "กรัม", "ตัน", "ลิตร", "ซีซี", "เมตร", "หลา",
];

/** คำที่บอกว่าเลขตัวนั้นเป็นเงิน ไม่ใช่จำนวนของ */
const MONEY_WORDS = ["บาท", "฿", "baht"];

/** แปลงเลขไทยเป็นเลขอารบิก แบบตัวต่อตัว ความยาวไม่เปลี่ยน ดัชนีจึงยังตรงกัน */
export function arabicDigits(s) {
  let out = "";
  for (const ch of String(s)) {
    const i = THAI_DIGITS.indexOf(ch);
    out += i >= 0 ? String(i) : ch;
  }
  return out;
}

/**
 * ทำให้ข้อความเทียบกันได้ โดยความยาวไม่เปลี่ยน
 *
 * ต้องไม่เปลี่ยนความยาว เพราะตัวจับคู่ใช้ตำแหน่งตัวอักษรของข้อความที่ทำความสะอาดแล้ว
 * ไปตัดข้อความจริงมาแสดง ถ้าความยาวเพี้ยนไปตัวเดียว ข้อความที่ตัดมาจะเลื่อนทั้งบรรทัด
 */
export const normText = (s) => arabicDigits(String(s || "")).toLowerCase();

/** ยุบช่องว่างซ้ำและตัดหัวท้าย — ทำก่อนเสมอ แล้วค่อยใช้ normText กับผลลัพธ์ */
export const cleanText = (s) =>
  String(s || "")
    .replace(/[\u200B-\u200F\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** อ่านตัวเลขที่มีจุลภาคคั่นหลักพัน เช่น 1,250.5 */
const toNum = (s) => {
  const n = parseFloat(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/* ------------------------------------------------------------ พจนานุกรม */

/**
 * สร้างพจนานุกรมคำ -> สินค้า จากทะเบียนสินค้าและคำเรียกของลูกค้า
 *
 * เรียงคำยาวก่อนเสมอ เพราะถ้าจับคำสั้นก่อน "หมอน" จะไปชนะ "หมอนยางพารา"
 * แล้วลูกค้าที่พิมพ์ชื่อเต็มจะได้สินค้าผิดตัว ทั้งที่พิมพ์ละเอียดกว่า
 *
 * kind บอกว่าจับคู่ด้วยอะไร เอาไปแสดงให้คนตรวจเห็นว่าควรเชื่อมากแค่ไหน:
 *   code    รหัสสินค้า        แม่นที่สุด
 *   barcode บาร์โค๊ด          แม่นที่สุด
 *   alias   คำเรียกที่เคยสอนไว้ แม่น เพราะคนยืนยันเองมาก่อน
 *   name    ชื่อสินค้าในทะเบียน  แม่นพอควร
 */
export function buildDict(products, aliases) {
  const out = [];
  const push = (key, productId, kind, unit) => {
    const k = normText(cleanText(key));
    if (k.length < 2) return; // คำสั้นกว่าสองตัวอักษรชนกับข้อความทั่วไปเละแน่
    out.push({ key: k, productId, kind, unit: unit || "" });
  };

  (products || []).forEach((p) => {
    push(p.code, p.id, "code", p.unit);
    if (p.barcode) push(p.barcode, p.id, "barcode", p.unit);
    push(p.name, p.id, "name", p.unit);
  });

  // คำเรียกของลูกค้ามาทีหลัง แต่ได้น้ำหนักสูงกว่าชื่อ เพราะมีคนยืนยันไว้แล้ว
  (aliases || [])
    .filter((a) => a.active !== false)
    .forEach((a) => push(a.word, a.productId, "alias", ""));

  // ยาวก่อนสั้น และถ้ายาวเท่ากันให้ชนิดที่แม่นกว่ามาก่อน
  const rank = { code: 0, barcode: 1, alias: 2, name: 3 };
  return out.sort((a, b) => b.key.length - a.key.length || rank[a.kind] - rank[b.kind]);
}

/** ความมั่นใจของแต่ละวิธีจับคู่ 0-1 ใช้เตือนคนตรวจว่าบรรทัดไหนควรดูให้ดี */
export const MATCH_SCORE = { code: 1, barcode: 1, alias: 0.95, name: 0.8, pick: 1 };

/** ชื่อภาษาไทยของวิธีจับคู่ ใช้แสดงบนหน้าจอ */
export const MATCH_NAME = {
  code: "รหัสสินค้า",
  barcode: "บาร์โค๊ด",
  alias: "คำเรียกที่สอนไว้",
  name: "ชื่อสินค้า",
  pick: "คนเลือกเอง",
};

/* ------------------------------------------------------ หาสินค้าในข้อความ */

/**
 * หาตำแหน่งของทุกสินค้าที่ปรากฏในข้อความหนึ่งบรรทัด
 *
 * ทับซ้อนกันไม่ได้ ใครยาวกว่าได้ไปก่อน (พจนานุกรมเรียงมาแล้ว)
 * จึงรองรับกรณีพิมพ์รวดเดียวหลายอย่างโดยไม่มีเครื่องหมายคั่น เช่น
 *   "หมอน 2 ใบ ท้อปเปอร์ 1 ชิ้น"
 * ซึ่งเป็นวิธีพิมพ์ที่พบบ่อยที่สุดในไลน์ คนไม่ได้พิมพ์เป็นตารางให้
 */
export function findHits(clean, dict) {
  const hay = normText(clean);
  const taken = new Array(hay.length).fill(false);
  const hits = [];

  dict.forEach((d) => {
    let at = hay.indexOf(d.key);
    while (at >= 0) {
      let free = true;
      for (let i = at; i < at + d.key.length; i++) {
        if (taken[i]) {
          free = false;
          break;
        }
      }
      if (free) {
        for (let i = at; i < at + d.key.length; i++) taken[i] = true;
        hits.push({ at, len: d.key.length, productId: d.productId, kind: d.kind, unit: d.unit });
      }
      at = hay.indexOf(d.key, at + 1);
    }
  });

  return hits.sort((a, b) => a.at - b.at);
}

/* -------------------------------------------------------- จำนวนและราคา */

/**
 * ดึงจำนวนออกจากข้อความท่อนหนึ่ง
 *
 * ไล่ตามลำดับความชัดเจน หยุดที่แบบแรกที่เจอ:
 *   1. x2 / X 2 / ×2 / *2          เขียนแบบคูณ ชัดเจนที่สุด
 *   2. จำนวน 2 / เอา 2 / สั่ง 2     มีคำบอกตรง ๆ
 *   3. 2 ใบ / 500 กก.              เลขติดหน่วยนับ
 *   4. เลขตัวแรกที่ไม่ได้ตามด้วยคำว่าบาท
 *
 * ข้อ 4 เสี่ยงที่สุดจึงอยู่ท้ายสุด และคืน weak = true มาด้วย
 * เพื่อให้หน้าจอเตือนว่าบรรทัดนี้เดาจำนวนมา ควรตรวจก่อนออกเอกสาร
 */
export function findQty(text, units) {
  const s = normText(cleanText(text));
  const unitList = [...new Set([...(units || []), ...UNIT_WORDS].map((u) => normText(u)))]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const mul = /(?:^|[\s(])[x×*]\s*([\d,]+(?:\.\d+)?)/.exec(s);
  if (mul) return { qty: toNum(mul[1]), unit: "", weak: false };

  const word = /(?:จำนวน|เอา|ขอ|สั่ง|ต้องการ|รับ)\s*([\d,]+(?:\.\d+)?)/.exec(s);
  if (word) return { qty: toNum(word[1]), unit: "", weak: false };

  for (const u of unitList) {
    // หน่วยอาจมีจุดท้าย (กก.) ต้อง escape ก่อนเอาไปประกอบ regex
    const esc = u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("([\\d,]+(?:\\.\\d+)?)\\s*" + esc + "(?![ก-ฮa-z])");
    const m = re.exec(s);
    if (m) return { qty: toNum(m[1]), unit: u, weak: false };
  }

  // เลขลอย ๆ ที่ไม่ใช่เงิน และไม่ใช่เบอร์โทร (10 หลักขึ้นไปถือว่าเป็นเบอร์)
  const all = [...s.matchAll(/([\d,]+(?:\.\d+)?)/g)];
  for (const m of all) {
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 6);
    if (MONEY_WORDS.some((w) => after.includes(w))) continue;
    if (m[1].replace(/\D/g, "").length >= 9) continue;
    const n = toNum(m[1]);
    if (n !== null && n > 0) return { qty: n, unit: "", weak: true };
  }

  return { qty: null, unit: "", weak: true };
}

/**
 * ดึงราคาต่อหน่วยที่ลูกค้าระบุมา (ถ้ามี)
 *
 * เอาเฉพาะที่เขียนชัดว่าเป็นเงิน (@ / ราคา / บาท) ไม่เดาจากเลขลอย ๆ
 * เพราะเดาราคาผิดแล้วออกเอกสารไป เสียหายกว่าเดาจำนวนผิดมาก
 * ไม่เจอก็ปล่อยว่าง แล้วให้หน้าจอเติมราคาจากทะเบียนสินค้าแทน ซึ่งถูกเสมอ
 */
export function findPrice(text) {
  const s = normText(cleanText(text));
  const at = /@\s*([\d,]+(?:\.\d+)?)/.exec(s);
  if (at) return toNum(at[1]);
  const word = /(?:ราคา|ตัวละ|ชิ้นละ|ใบละ|กิโลละ|โลละ)\s*([\d,]+(?:\.\d+)?)/.exec(s);
  if (word) return toNum(word[1]);
  const baht = /([\d,]+(?:\.\d+)?)\s*(?:บาท|฿)/.exec(s);
  if (baht) return toNum(baht[1]);
  return null;
}

/* ------------------------------------------------------------ ตัวแปลงหลัก */

/** ตัดข้อความเป็นท่อน ๆ ตามบรรทัดและเครื่องหมายคั่นที่คนใช้จริง */
const segmentsOf = (text) =>
  String(text || "")
    .split(/[\r\n]+|[;•]|\s+และ\s+/)
    .map(cleanText)
    .filter(Boolean);

/**
 * แปลงข้อความหนึ่งก้อนเป็นรายการสินค้า
 *
 * @param text    ข้อความจากไลน์ (หลายบรรทัดได้)
 * @param products ทะเบียนสินค้า
 * @param aliases  คำเรียกของลูกค้าที่สอนไว้แล้ว
 * @returns {{items: Array, unmatched: Array, note: string}}
 *   items     บรรทัดที่จับคู่สินค้าได้ พร้อมจำนวน ราคา และความมั่นใจ
 *   unmatched ท่อนที่มีจำนวนแต่หาสินค้าไม่เจอ — ต้องให้คนเลือกเอง
 *   note      ข้อความส่วนที่ไม่เกี่ยวกับการสั่งของ เก็บไว้เป็นหมายเหตุของเอกสาร
 */
export function parseOrderText(text, products, aliases) {
  const dict = buildDict(products, aliases);
  const byId = new Map((products || []).map((p) => [p.id, p]));
  const units = (products || []).map((p) => p.unit).filter(Boolean);

  const items = [];
  const unmatched = [];
  const noteParts = [];

  segmentsOf(text).forEach((seg) => {
    const hits = findHits(seg, dict);

    if (!hits.length) {
      /*
       * ไม่เจอสินค้าเลย — ถ้ามีตัวเลขที่ดูเหมือนจำนวน ถือว่าน่าจะเป็นการสั่งของ
       * ที่เราอ่านไม่ออก ต้องยกให้คนดู ไม่ใช่ทิ้งเงียบ ๆ
       * ที่เหลือเก็บเป็นหมายเหตุ (คำทักทาย ที่อยู่จัดส่ง เงื่อนไขการชำระ ฯลฯ)
       */
      const q = findQty(seg, units);
      if (q.qty !== null && !q.weak) unmatched.push({ raw: seg, qty: q.qty });
      else noteParts.push(seg);
      return;
    }

    hits.forEach((h, i) => {
      // ท่อนของสินค้าตัวนี้ = ตั้งแต่ชื่อมัน ไปจนก่อนชื่อตัวถัดไป
      const end = i + 1 < hits.length ? hits[i + 1].at : seg.length;
      const chunk = seg.slice(h.at, end);
      const p = byId.get(h.productId);

      // ตัวแรกของท่อน ให้มองข้อความข้างหน้าชื่อด้วย เพราะคนเขียน "เอา 2 หมอน" ก็มี
      const look = i === 0 ? seg.slice(0, end) : chunk;
      const q = findQty(look, p && p.unit ? [p.unit] : []);

      items.push({
        raw: chunk,
        productId: h.productId,
        qty: q.qty === null ? 1 : q.qty,
        // ไม่เจอจำนวนเลยให้เป็น 1 ซึ่งเป็นค่าที่เดาผิดแล้วเสียหายน้อยที่สุด
        // และติดธง weak ไว้ให้หน้าจอเตือน ไม่ใช่ปล่อยผ่านเงียบ ๆ
        qtyWeak: q.qty === null || q.weak,
        unit: (p && p.unit) || q.unit || "",
        price: findPrice(chunk),
        how: h.kind,
        score: MATCH_SCORE[h.kind] || 0.5,
      });
    });
  });

  return { items, unmatched, note: noteParts.join(" ") };
}

/**
 * รวมบรรทัดที่เป็นสินค้าตัวเดียวกันเข้าด้วยกัน
 *
 * ลูกค้าพิมพ์ทักมาหลายครั้งในบทสนทนาเดียว "เอาหมอน 2" แล้วอีกสิบนาที "หมอนอีก 3"
 * ถ้าไม่รวมจะได้ใบเสนอราคาที่มีหมอนสองบรรทัด ซึ่งดูเหมือนออกเอกสารผิด
 * ราคาใช้ค่าที่ระบุมาล่าสุด เพราะการต่อรองครั้งหลังย่อมแทนครั้งก่อน
 */
export function mergeItems(items) {
  const out = [];
  (items || []).forEach((it) => {
    const same = out.find((x) => x.productId === it.productId);
    if (!same) {
      out.push({ ...it });
      return;
    }
    same.qty += it.qty;
    same.qtyWeak = same.qtyWeak || it.qtyWeak;
    if (it.price !== null && it.price !== undefined) same.price = it.price;
    same.raw = same.raw + " + " + it.raw;
    if (it.score < same.score) same.score = it.score;
  });
  return out;
}

/**
 * แนะนำสินค้าที่ใกล้เคียงที่สุด สำหรับท่อนที่จับคู่ไม่ได้
 *
 * นับคำที่ตรงกัน ไม่ได้วัดระยะห่างตัวอักษร เพราะภาษาไทยไม่มีช่องว่างระหว่างคำ
 * การวัดระยะตัวอักษรจึงให้ผลที่อธิบายกับคนใช้ไม่ได้เลย
 * วิธีนี้แค่ "เดาให้ใกล้" พอให้คนกดเลือกได้เร็วขึ้น ไม่ได้ตั้งใจให้ถูกเสมอ
 */
export function suggestProducts(phrase, products, limit = 5) {
  const q = normText(cleanText(phrase)).replace(/[\d,.]/g, " ").trim();
  if (!q) return [];

  const scored = (products || [])
    .map((p) => {
      const name = normText(p.name);
      let hit = 0;
      // ไล่ทีละช่วงตัวอักษรยาว 3 ตัว ถ้าชื่อสินค้ามีช่วงนั้นอยู่ถือว่าใกล้เคียง
      for (let i = 0; i + 3 <= q.length; i++) {
        if (name.includes(q.slice(i, i + 3))) hit++;
      }
      const span = Math.max(1, q.length - 2);
      return { product: p, score: hit / span };
    })
    .filter((x) => x.score > 0.15)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}
