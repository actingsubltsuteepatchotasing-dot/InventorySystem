// ฟังก์ชันจัดรูปแบบข้อมูลสำหรับแสดงผล

/** จัดรูปแบบตัวเลขแบบไทย — num(1234.5) => "1,234.5" · num(1234.5, 0) => "1,235" */
export function num(n, d) {
  return Number(n || 0).toLocaleString("th-TH", {
    minimumFractionDigits: d || 0,
    maximumFractionDigits: d == null ? 2 : d,
  });
}

/** วันที่วันนี้ในรูปแบบ YYYY-MM-DD */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** แปลง ISO date เป็นวันที่ไทย พ.ศ. — "27 ส.ค. 2569" */
export function thDate(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** แปลง timestamp เป็นวันที่-เวลาไทย */
export function thDateTime(ts) {
  return new Date(ts).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** สร้างรหัสไม่ซ้ำสำหรับ record ใหม่ */
export function uid() {
  return "x" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** ตัวสร้างเลขสุ่มแบบกำหนด seed — ให้ข้อมูลตัวอย่างเหมือนกันทุกครั้ง */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ย่อข้อความยาวให้พอดีป้ายกำกับกราฟ */
/**
 * รายชื่อเดือนตั้งแต่ from ถึง to สำหรับใช้เป็นแกนของกราฟ
 *
 * ช่วงยาวมากจะได้แท่งเล็กจนอ่านไม่ออก จึงจำกัดไว้ที่ 24 เดือนล่าสุดของช่วงนั้น
 * @returns {Array<{key:string, label:string}>} key เป็น YYYY-MM
 */
export function monthsBetween(fromISO, toISO, max = 24) {
  if (!fromISO || !toISO || fromISO > toISO) return [];

  const a = new Date(fromISO + "T00:00:00");
  const b = new Date(toISO + "T00:00:00");
  const out = [];

  const cur = new Date(a.getFullYear(), a.getMonth(), 1);
  const end = new Date(b.getFullYear(), b.getMonth(), 1);
  while (cur <= end) {
    out.push({
      key:
        cur.getFullYear() + "-" + String(cur.getMonth() + 1).padStart(2, "0"),
      label:
        cur.toLocaleDateString("th-TH", { month: "short" }) +
        " " +
        String((cur.getFullYear() + 543) % 100),
    });
    cur.setMonth(cur.getMonth() + 1);
  }

  return out.length > max ? out.slice(out.length - max) : out;
}

/** วันแรกของเดือนที่ถอยหลังไป n เดือนจากวันนี้ */
export function monthsAgoISO(n) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return (
    d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-01"
  );
}

export function ellipsis(s, len) {
  const str = String(s == null ? "" : s);
  return str.length > len ? str.slice(0, len - 1) + "…" : str;
}

/* ------------------------------------------------- จำนวนเงินเป็นตัวอักษร */

const TH_DIGIT = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const TH_PLACE = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/**
 * อ่านจำนวนเต็มเป็นคำไทย
 *
 * เกินหกหลักจะตัดหัวออกมาอ่านแล้วต่อคำว่า "ล้าน" เพราะภาษาไทยนับเป็นชุดละหกหลัก
 * ไม่ใช่สามหลักแบบภาษาอังกฤษ
 */
function readThaiInt(digits) {
  if (digits.length > 6) {
    const cut = digits.length - 6;
    return readThaiInt(digits.slice(0, cut)) + "ล้าน" + readThaiInt(digits.slice(cut));
  }

  let out = "";
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits[i]);
    const place = digits.length - i - 1;
    if (!d) continue;

    // หลักหน่วยของจำนวนที่มีมากกว่าหนึ่งหลัก เลข 1 อ่านว่า "เอ็ด"
    if (place === 0 && d === 1 && digits.length > 1) out += "เอ็ด";
    else if (place === 1 && d === 1) out += "สิบ";
    else if (place === 1 && d === 2) out += "ยี่สิบ";
    else out += TH_DIGIT[d] + TH_PLACE[place];
  }
  return out;
}

/**
 * จำนวนเงินเป็นตัวอักษรไทย เช่น 1250.5 -> "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์"
 *
 * ใบกำกับภาษีต้องมีบรรทัดนี้ ไม่ใช่ของประดับ — เป็นตัวกันการแก้ตัวเลขในเอกสาร
 */
export function bahtText(amount) {
  const v = Number(amount);
  if (!Number.isFinite(v)) return "";

  const neg = v < 0;
  // ปัดที่สตางค์ก่อนแยกส่วน ไม่งั้น 0.005 จะกลายเป็น 0 บาท 0 สตางค์ แต่ยอดรวมเป็น 0.01
  const cents = Math.round(Math.abs(v) * 100);
  const baht = Math.floor(cents / 100);
  const satang = cents % 100;

  const head = baht ? readThaiInt(String(baht)) : "ศูนย์";
  const body = satang
    ? head + "บาท" + readThaiInt(String(satang)) + "สตางค์"
    : head + "บาทถ้วน";

  return (neg ? "ลบ" : "") + body;
}
