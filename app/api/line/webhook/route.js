// Route Handler รับข้อความจากไลน์ (LINE Messaging API webhook)
//
// *** ไฟล์นี้รันฝั่งเซิร์ฟเวอร์เท่านั้น กุญแจจึงไม่มีวันหลุดไปถึงเบราว์เซอร์ ***
//
// ลำดับการทำงาน: ตรวจลายเซ็น -> แปลงเป็นข้อความ -> เขียนลงฐานข้อมูล -> ตอบ 200
//
// ---------------------------------------------------------------------------
// ทำไมต้องตรวจลายเซ็น
//
// ที่อยู่ของ webhook เป็น URL สาธารณะ ใครเดาถูกก็ยิงเข้ามาได้
// ถ้าไม่ตรวจ ใครก็ยัดคำสั่งซื้อปลอมเข้าระบบได้ทั้งวัน
// ไลน์เซ็นทุกคำขอด้วย HMAC-SHA256 ของ channel secret ซึ่งมีแค่เรากับไลน์ที่รู้
//
// เทียบด้วย timingSafeEqual ไม่ใช่ === เพราะการเทียบสตริงแบบปกติหยุดทันทีที่เจอตัวต่าง
// เวลาที่ใช้จึงบอกใบ้ว่าเดาถูกไปกี่ตัว ซึ่งพอจะไล่เดาทีละตัวได้
//
// ---------------------------------------------------------------------------
// ทำไมต้องใช้ service role key
//
// คำขอนี้มาจากเซิร์ฟเวอร์ของไลน์ ไม่มีผู้ใช้ล็อกอินอยู่ จึงไม่มี JWT ให้ใช้
// และ anon key เขียนไม่ได้เพราะ RLS อนุญาตเฉพาะ role authenticated
// service role key ข้ามทุกสิทธิ์ จึงต้องอยู่ฝั่งเซิร์ฟเวอร์เท่านั้น
// (ชื่อตัวแปรห้ามขึ้นต้นด้วย NEXT_PUBLIC_ ไม่งั้น Next.js จะฝังลงไปในไฟล์ที่เบราว์เซอร์โหลด)
//
// ไฟล์นี้เขียนได้ตารางเดียวคือ line_messages และเขียนได้อย่างเดียว ไม่ลบไม่แก้
// ข้อความที่เข้ามายังไม่เป็นเอกสารอะไรทั้งนั้น ต้องมีคนกดตรวจที่หน้าจอก่อนเสมอ

import crypto from "node:crypto";
import { bearerFrom, verifyBearer } from "@/lib/authServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || "";

/** ตั้งค่าครบหรือยัง — ใช้ทั้งตอนรับข้อความและตอนหน้าจอถามสถานะ */
const configured = () => ({
  url: !!URL_BASE,
  serviceKey: !!SERVICE_KEY,
  channelSecret: !!CHANNEL_SECRET,
});

const ready = () => {
  const c = configured();
  return c.url && c.serviceKey && c.channelSecret;
};

/**
 * ลายเซ็นถูกต้องหรือไม่
 *
 * รับ body เป็นข้อความดิบ ไม่ใช่ object ที่ parse แล้ว
 * เพราะการ parse แล้ว stringify กลับจะได้ตัวอักษรไม่เหมือนเดิม (ลำดับคีย์ ช่องว่าง)
 * แล้วลายเซ็นจะไม่ตรงทั้งที่คำขอถูกต้อง
 */
function validSignature(rawBody, signature) {
  if (!signature || !CHANNEL_SECRET) return false;
  const mine = crypto.createHmac("sha256", CHANNEL_SECRET).update(rawBody).digest("base64");
  const a = Buffer.from(mine);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** ชนิดข้อความของไลน์ -> ชนิดที่ระบบเก็บ (ดู LINE_MSG_KINDS ใน lib/lineOrders.js) */
const KIND = {
  text: "TEXT",
  image: "IMAGE",
  file: "FILE",
  sticker: "STICKER",
};

/** เวลาไทยของ timestamp (มิลลิวินาที) เป็น YYYY-MM-DD */
function thaiDateOf(ms) {
  // ไลน์ส่งเวลาเป็น UTC ถ้าแปลงตรง ๆ ข้อความหลังหนึ่งทุ่มจะไปลงวันถัดไป
  // ซึ่งทำให้รายงานรายวันเพี้ยนทุกเย็น (เหตุผลเดียวกับตัวตรวจหมวด 7)
  const d = new Date(Number(ms) + 7 * 3600 * 1000);
  const p = (x) => String(x).padStart(2, "0");
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
}

/** เขียนข้อความลงฐานข้อมูล — merge-duplicates กันไลน์ส่งซ้ำแล้วได้ข้อความซ้ำ */
async function insertMessages(rows) {
  if (!rows.length) return;
  const res = await fetch(URL_BASE + "/rest/v1/line_messages", {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=minimal,resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error("เขียนฐานข้อมูลไม่สำเร็จ (" + res.status + ") " + detail.slice(0, 200));
  }
}

export async function POST(request) {
  // ---------- 1. ตั้งค่าครบหรือยัง ----------
  // ตอบ 200 ทั้งที่ยังตั้งค่าไม่ครบ เพราะถ้าตอบ error ไลน์จะยิงซ้ำไม่หยุด
  // และสุดท้ายจะปิด webhook ให้เอง ซึ่งต้องไปเปิดใหม่ด้วยมือ
  if (!ready()) {
    return Response.json({ ok: false, reason: "NOT_CONFIGURED" }, { status: 200 });
  }

  const raw = await request.text();

  // ---------- 2. ลายเซ็นต้องถูกต้อง ----------
  if (!validSignature(raw, request.headers.get("x-line-signature"))) {
    return Response.json({ ok: false, reason: "BAD_SIGNATURE" }, { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch (e) {
    return Response.json({ ok: false, reason: "BAD_JSON" }, { status: 200 });
  }

  // ปุ่ม "Verify" ใน LINE Developers Console ส่ง events ว่างมา ต้องตอบ 200 ให้ผ่าน
  const events = Array.isArray(body && body.events) ? body.events : [];
  if (!events.length) return Response.json({ ok: true, saved: 0 }, { status: 200 });

  const rows = [];
  events.forEach((ev) => {
    if (!ev || ev.type !== "message" || !ev.message) return;
    const src = ev.source || {};
    const kind = KIND[ev.message.type] || "OTHER";

    rows.push({
      // ใช้รหัสข้อความของไลน์เป็น id เลย ส่งซ้ำมากี่ครั้งก็เป็นแถวเดิม
      id: "LW" + ev.message.id,
      msg_id: ev.message.id,
      source: "WEBHOOK",
      source_kind: src.type || "user",
      source_id: src.groupId || src.roomId || src.userId || "",
      sender_id: src.userId || "",
      // ไลน์ไม่ได้ส่งชื่อผู้ส่งมากับ webhook ต้องยิงถามเพิ่มอีกคำขอ
      // ไม่ยิงเพราะจะช้าจนไลน์ตัดสาย และคนตรวจที่หน้าจอเห็นข้อความก็รู้อยู่แล้วว่าใคร
      sender_name: "",
      kind,
      text: kind === "TEXT" ? String(ev.message.text || "") : "",
      file_url: "",
      date: thaiDateOf(ev.timestamp || Date.now()),
      order_id: null,
      note: kind === "TEXT" ? "" : "ข้อความชนิด " + kind + " แปลงเป็นรายการสินค้าไม่ได้",
      user_name: "",
      ts: Number(ev.timestamp) || Date.now(),
    });
  });

  try {
    await insertMessages(rows);
  } catch (e) {
    // ตอบ 500 ให้ไลน์ยิงซ้ำ เพราะข้อความหายไปเลยแย่กว่าได้ซ้ำ
    // (ได้ซ้ำไม่เป็นไร เพราะ id มาจากรหัสข้อความของไลน์ ซึ่งซ้ำแล้วทับกันเอง)
    return Response.json({ ok: false, reason: "DB_ERROR" }, { status: 500 });
  }

  return Response.json({ ok: true, saved: rows.length }, { status: 200 });
}

/**
 * สถานะการตั้งค่า — ให้หน้าจอตั้งค่าเรียกดูว่าฝั่งเซิร์ฟเวอร์พร้อมหรือยัง
 *
 * ต้องล็อกอินก่อน เพราะ "ตั้งค่าอะไรไว้บ้าง" เป็นข้อมูลที่ไม่ควรบอกคนนอก
 * และคืนแค่ว่ามีหรือไม่มี ไม่เคยคืนค่าจริงของกุญแจออกไป
 */
export async function GET(request) {
  const user = await verifyBearer(bearerFrom(request));
  if (!user) {
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  return Response.json({ ok: true, ready: ready(), configured: configured() });
}
