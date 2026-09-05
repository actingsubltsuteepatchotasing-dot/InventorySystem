// คณิตศาสตร์ของแผนที่ (Web Mercator) และการค้นหาสถานที่
//
// ส่วนคำนวณเป็นฟังก์ชันบริสุทธิ์ทั้งหมด ทดสอบได้โดยไม่ต้องมีเบราว์เซอร์
// ส่วนค้นหาเรียก REST ด้วย fetch เอง ไม่ได้ติดตั้ง SDK อะไรเพิ่ม
//
// ระบบพิกัดที่ใช้เรียกว่า "world coordinate": ทั้งโลกกว้าง 2^zoom ช่อง (tile)
// ช่องละ 256 พิกเซล ตัวเลขจึงเป็นทศนิยมได้ ไม่ใช่เฉพาะเลขช่อง

/** ขนาดภาพหนึ่งช่องของแผนที่ (พิกเซล) — มาตรฐานของ tile server */
export const TILE = 256;

/** ซูมต่ำสุด/สูงสุดที่ tile server ให้บริการ */
export const MIN_ZOOM = 4;
export const MAX_ZOOM = 18;

/* -------------------------------------------------- พิกัด <-> ตำแหน่งบนแผนที่ */

export function lngToX(lng, z) {
  return ((lng + 180) / 360) * Math.pow(2, z);
}

export function latToY(lat, z) {
  // ละติจูดเกิน ±85.05 องศาจะเข้าใกล้อนันต์ในสูตรนี้ จึงบีบไว้ก่อน
  const l = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const r = (l * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z);
}

export function xToLng(x, z) {
  return (x / Math.pow(2, z)) * 360 - 180;
}

export function yToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** ปัดพิกัดเหลือ 6 ตำแหน่ง — ละเอียดราว 0.1 เมตร เกินกว่านั้นไม่มีประโยชน์ */
export function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * ที่อยู่ของภาพช่องหนึ่งบน tile server
 *
 * แกน x วนรอบโลกได้ (ลากไปทางตะวันออกเรื่อย ๆ แล้วกลับมาที่เดิม) จึงหารเอาเศษ
 * ส่วนแกน y วนไม่ได้ เลยขอบบน/ล่างคือไม่มีภาพ คืน null ให้ผู้เรียกข้ามไป
 */
export function tileURL(x, y, z) {
  const n = Math.pow(2, z);
  if (y < 0 || y >= n) return null;
  const wrapped = ((x % n) + n) % n;
  return "https://tile.openstreetmap.org/" + z + "/" + wrapped + "/" + y + ".png";
}

/* ------------------------------------------------------------- ค้นหาสถานที่ */

/**
 * ค้นหาสถานที่ในประเทศไทยด้วย Nominatim ของ OpenStreetMap
 *
 * ใช้ตอนตั้งค่าตำแหน่งคลังเท่านั้น ซึ่งนาน ๆ ทำที จึงอยู่ในเกณฑ์การใช้งานที่เขาอนุญาต
 * (ไม่เกิน 1 คำขอต่อวินาที ห้ามยิงถี่ ๆ อัตโนมัติ) หน้าจอจึงค้นเมื่อกดปุ่มหรือกด Enter
 * ไม่ค้นให้เองทุกตัวอักษรที่พิมพ์
 *
 * หมายเหตุตอนทดสอบ: ยิงจาก Node จะได้ 403 เพราะ Nominatim บล็อก User-Agent เริ่มต้นของ Node
 * จากเบราว์เซอร์ได้ 200 ปกติ (มี Access-Control-Allow-Origin: * ให้อยู่แล้ว)
 * เจอ 403 ตอนเทสต์จึงไม่ได้แปลว่าโค้ดผิด
 *
 * @returns [{ name, lat, lng }] — ค้นไม่เจอคืนรายการว่าง
 */
export async function searchPlaces(q, signal) {
  const term = String(q || "").trim();
  if (!term) return [];

  const url =
    "https://nominatim.openstreetmap.org/search" +
    "?format=jsonv2&limit=8&countrycodes=th&accept-language=th&q=" +
    encodeURIComponent(term);

  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("ค้นหาไม่สำเร็จ (HTTP " + res.status + ")");

  const rows = await res.json();
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      name: String(r.display_name || "").trim(),
      lat: Number(r.lat),
      lng: Number(r.lon),
    }))
    .filter((r) => r.name && Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

/**
 * อ่านพิกัดจากข้อความที่ผู้ใช้วางมา เช่น "13.7563, 100.5018"
 *
 * มีไว้เพราะคนส่วนใหญ่หาพิกัดจาก Google Maps แล้วคัดลอกมาวาง
 * รับได้ทั้งคั่นด้วยจุลภาคและเว้นวรรค — ไม่ใช่พิกัดคืน null
 */
export function parseLatLng(text) {
  const m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(
    String(text || "")
  );
  if (!m) return null;

  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/* --------------------------------------------------- ระยะทางจัดส่ง */

/**
 * แปลงที่อยู่เป็นพิกัด — เอาผลแรกที่ตรงที่สุด
 *
 * ที่อยู่บ้านเลขที่ในไทยมักหาไม่เจอตรง ๆ จึงถอยไปหาแบบหยาบลงทีละขั้น
 * เช่น "45 หมู่ 3 ตำบลท่าโรงช้าง อำเภอพุนพิน จังหวัดสุราษฎร์ธานี 84130"
 * หาไม่เจอ ก็ลองตัดส่วนหน้าออกจนเหลือระดับอำเภอหรือจังหวัด
 * ได้พิกัดคร่าว ๆ ดีกว่าไม่ได้อะไรเลย เพราะระยะทางข้ามจังหวัดคลาดเคลื่อนไม่กี่กิโล
 */
export async function geocodeAddress(address) {
  const full = String(address || "").trim();
  if (!full) return null;

  const parts = full.split(/\s+/);
  const tries = [full];

  // ตัดคำหน้าออกทีละสองคำ เหลือท้ายไว้เพราะท้ายคือตำบล/อำเภอ/จังหวัด
  for (let cut = 2; cut < parts.length - 1; cut += 2) {
    tries.push(parts.slice(cut).join(" "));
  }

  for (const q of tries) {
    const hits = await searchPlaces(q);
    if (hits.length) return { lat: hits[0].lat, lng: hits[0].lng, matched: q };
  }
  return null;
}

/**
 * ระยะทางตามถนนจริง (กิโลเมตร) ระหว่างสองพิกัด
 *
 * ใช้ OSRM ซึ่งเป็นตัวคำนวณเส้นทางของ OpenStreetMap ใช้ได้โดยไม่ต้องมี API key
 * (Google Distance Matrix ให้ผลแบบเดียวกันแต่บังคับใช้คีย์และมีค่าใช้จ่าย
 *  ซึ่งขัดข้อกำหนด "ไม่ต้องติดตั้ง/ไม่ต้องตั้งค่าอะไรเพิ่ม" ของโปรเจกต์)
 *
 * @returns { km, hours } หรือ null ถ้าหาเส้นทางไม่ได้ (เช่นคนละเกาะ ไม่มีถนนเชื่อม)
 */
export async function roadDistance(from, to, signal) {
  const url =
    "https://router.project-osrm.org/route/v1/driving/" +
    from.lng + "," + from.lat + ";" + to.lng + "," + to.lat +
    "?overview=false";

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("หาเส้นทางไม่สำเร็จ (HTTP " + res.status + ")");

  const data = await res.json();
  if (data.code !== "Ok" || !data.routes || !data.routes.length) return null;

  const r = data.routes[0];
  return {
    km: Math.round((Number(r.distance) || 0) / 100) / 10,
    hours: Math.round(((Number(r.duration) || 0) / 3600) * 10) / 10,
  };
}
