// ตรวจ token ของ Supabase ฝั่งเซิร์ฟเวอร์
//
// *** ไฟล์นี้ใช้ได้เฉพาะฝั่งเซิร์ฟเวอร์ ห้าม import จาก client component ***
//
// ทำไมไม่ใช้ lib/supabase.js ซ้ำ: ไฟล์นั้นเก็บ session ไว้ในตัวแปรระดับโมดูล
// และเรียก localStorage โดยตรง ซึ่งไม่มีบนเซิร์ฟเวอร์ จะได้ ReferenceError

import crypto from "node:crypto";

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** cache ผลตรวจ token ไว้ชั่วคราว ลดการยิงไป Supabase ทุกข้อความ */
const CACHE_MS = 60000;
const cache = new Map(); // hash(token) -> { user, at }

const hash = (t) => crypto.createHash("sha256").update(t).digest("hex").slice(0, 32);

/** ล้างรายการที่หมดอายุ กัน Map โตไม่จำกัด */
function sweep(now) {
  for (const [k, v] of cache) {
    if (now - v.at > CACHE_MS) cache.delete(k);
  }
}

/**
 * ตรวจว่า token ใช้ได้จริงและคืนข้อมูลผู้ใช้
 * @param {string} token access token จาก Supabase
 * @returns {Promise<{id:string, email:string}|null>} null = ใช้ไม่ได้
 */
export async function verifyBearer(token) {
  if (!token || !URL_BASE || !ANON_KEY) return null;

  const now = Date.now();
  const key = hash(token);
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.user;

  try {
    const res = await fetch(URL_BASE + "/auth/v1/user", {
      headers: { apikey: ANON_KEY, Authorization: "Bearer " + token },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const body = await res.json();
    if (!body || !body.id) return null;

    const user = { id: body.id, email: body.email || "" };
    sweep(now);
    cache.set(key, { user, at: now });
    return user;
  } catch (e) {
    // เน็ตหลุดระหว่างเซิร์ฟเวอร์กับ Supabase — ถือว่าตรวจไม่ผ่าน
    return null;
  }
}

/** อ่าน token จาก header Authorization: Bearer xxx */
export function bearerFrom(request) {
  const h = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : "";
}

/**
 * อีเมลนี้ได้รับอนุญาตให้ใช้ผู้ช่วย AI หรือไม่
 * ตั้ง CHAT_ALLOWED_EMAILS="a@x.com,b@x.com" เพื่อจำกัด
 * ถ้าไม่ตั้ง = อนุญาตทุกคนที่ล็อกอินแล้ว
 */
export function isAllowed(email, rawList = process.env.CHAT_ALLOWED_EMAILS) {
  const list = String(rawList || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!list.length) return true;
  return list.includes(String(email || "").toLowerCase());
}

/* ------------------------------------------------------------ rate limit */

/**
 * ตรวจโควตาการใช้งานแบบ sliding window
 *
 * ข้อจำกัดที่ต้องรู้: เก็บใน memory ของ instance เดียว
 * Vercel มีหลาย instance และ cold start จะรีเซ็ตค่า
 * จึงเป็นแค่การกันสแปมเบา ๆ ไม่ใช่โควตาที่แม่นยำ
 *
 * @param {Map} store  Map ที่เก็บสถานะ (ส่งเข้ามาเพื่อให้ทดสอบได้)
 * @param {string} userId
 * @param {number} now  เวลาปัจจุบัน (ส่งเข้ามาเพื่อให้ทดสอบด้วยเวลาปลอมได้)
 * @param {{perMinute:number, perDay:number}} limits
 * @returns {{ok:boolean, retryAfter:number}} retryAfter เป็นวินาที
 */
export function checkRate(store, userId, now = Date.now(), limits = {}) {
  const perMinute = limits.perMinute || 8;
  const perDay = limits.perDay || 80;
  const MIN = 60000;
  const DAY = 86400000;

  const all = (store.get(userId) || []).filter((t) => now - t < DAY);

  const inDay = all.length;
  const inMinute = all.filter((t) => now - t < MIN).length;

  if (inMinute >= perMinute) {
    const oldest = all.filter((t) => now - t < MIN)[0];
    return { ok: false, retryAfter: Math.max(1, Math.ceil((MIN - (now - oldest)) / 1000)) };
  }
  if (inDay >= perDay) {
    const oldest = all[0];
    return { ok: false, retryAfter: Math.max(1, Math.ceil((DAY - (now - oldest)) / 1000)) };
  }

  all.push(now);
  store.set(userId, all);

  // ล้างผู้ใช้ที่ไม่มีรายการเหลือแล้ว
  if (store.size > 500) {
    for (const [k, v] of store) {
      if (!v.some((t) => now - t < DAY)) store.delete(k);
    }
  }

  return { ok: true, retryAfter: 0 };
}
