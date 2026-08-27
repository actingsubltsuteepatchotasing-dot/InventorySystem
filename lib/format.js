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
export function ellipsis(s, len) {
  const str = String(s == null ? "" : s);
  return str.length > len ? str.slice(0, len - 1) + "…" : str;
}
