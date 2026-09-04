// Route Handler สำหรับผู้ช่วย AI
//
// รันฝั่งเซิร์ฟเวอร์เท่านั้น GEMINI_API_KEY จึงไม่มีวันหลุดไปถึงเบราว์เซอร์
// ลำดับการทำงาน: ตรวจ token -> ตรวจสิทธิ์ -> ตรวจโควตา -> ตรวจขนาด -> เรียก Gemini

import { bearerFrom, checkRate, isAllowed, verifyBearer } from "@/lib/authServer";
import { callGemini, isConfigured, modelName } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** เก็บสถิติการใช้งานต่อผู้ใช้ไว้ในหน่วยความจำของ instance นี้ */
const rateStore = new Map();

const NOT_CONFIGURED_MSG =
  "ยังไม่ได้ตั้งค่าผู้ช่วย AI — ผู้ดูแลระบบต้องเพิ่ม GEMINI_API_KEY ที่ Vercel > Settings > Environment Variables แล้ว Redeploy หนึ่งครั้ง";

const MAX_SUMMARY = 20000;
const MAX_MESSAGES = 20;
const MAX_TEXT = 4000;

function fail(code, message, status, extra) {
  return Response.json({ error: { code, message, ...(extra || {}) } }, { status });
}

export async function POST(request) {
  // ---------- 1. ตรวจว่าล็อกอินแล้วจริง ----------
  const token = bearerFrom(request);
  const user = await verifyBearer(token);
  if (!user) {
    return fail("UNAUTHENTICATED", "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่", 401);
  }

  // ---------- 2. อยู่ในรายชื่อที่อนุญาตหรือไม่ ----------
  if (!isAllowed(user.email)) {
    return fail("FORBIDDEN", "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้ผู้ช่วย AI กรุณาติดต่อผู้ดูแลระบบ", 403);
  }

  // ---------- 3. ตั้งค่าคีย์ครบหรือยัง ----------
  // ต้องตรวจก่อนนับโควตา ไม่งั้นผู้ใช้จะเผาโควตาทิ้งกับปัญหาที่ไม่ใช่ความผิดเขา
  // แล้วได้ข้อความ "ถามถี่เกินไป" ซึ่งชี้ผิดทาง
  if (!isConfigured()) {
    return fail("NOT_CONFIGURED", NOT_CONFIGURED_MSG, 503);
  }

  // ---------- 4. โควตาการใช้งาน ----------
  const rate = checkRate(rateStore, user.id, Date.now());
  if (!rate.ok) {
    return Response.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "ถามถี่เกินไป กรุณารออีก " + rate.retryAfter + " วินาทีแล้วลองใหม่",
          retryAfter: rate.retryAfter,
        },
      },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  // ---------- 5. อ่านและตรวจ payload ----------
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return fail("BAD_REQUEST", "รูปแบบคำขอไม่ถูกต้อง", 400);
  }

  const summary = typeof payload?.summary === "string" ? payload.summary : "";
  if (summary.length > MAX_SUMMARY) {
    return fail("BAD_REQUEST", "ข้อมูลที่แนบมามีขนาดใหญ่เกินกำหนด", 400);
  }

  const rawMessages = Array.isArray(payload?.messages) ? payload.messages : [];
  const messages = rawMessages
    .slice(-MAX_MESSAGES)
    .filter((m) => m && typeof m.text === "string" && m.text.trim())
    .map((m) => ({
      role: m.role === "model" ? "model" : "user",
      text: m.text.slice(0, MAX_TEXT),
    }));

  if (!messages.length) {
    return fail("BAD_REQUEST", "ไม่พบคำถาม กรุณาพิมพ์คำถามก่อนส่ง", 400);
  }
  if (messages[messages.length - 1].role !== "user") {
    return fail("BAD_REQUEST", "ข้อความสุดท้ายต้องเป็นคำถามของผู้ใช้", 400);
  }

  // ---------- 6. เรียก Gemini ----------
  const result = await callGemini(messages, summary);

  if (!result.ok) {
    return fail(result.code, result.message, result.httpStatus || 502);
  }

  return Response.json({ text: result.text, truncated: !!result.truncated });
}

/**
 * เช็คว่าผู้ช่วย AI พร้อมใช้หรือยัง — ใช้ตอนเปิดแผงแชท
 * ไม่เรียก Gemini จึงไม่เสียโควตา และไม่นับรวมกับ rate limit
 * ต้องมี force-dynamic (ประกาศไว้ด้านบน) ไม่งั้น Next.js จะ prerender
 * เป็น static ตอน build แล้วค้างคำตอบไว้จนกว่าจะ redeploy
 */
export async function GET(request) {
  const user = await verifyBearer(bearerFrom(request));
  if (!user) {
    return fail("UNAUTHENTICATED", "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่", 401);
  }
  if (!isAllowed(user.email)) {
    return Response.json({ configured: false, allowed: false });
  }
  // บอกชื่อโมเดลที่ตั้งไว้ด้วย จะได้ตรวจได้ว่า env ที่ Vercel มาถึงจริงไหม
  return Response.json({
    configured: isConfigured(),
    allowed: true,
    model: modelName(),
  });
}
