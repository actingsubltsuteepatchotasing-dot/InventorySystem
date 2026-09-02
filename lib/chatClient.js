"use client";

// เรียก /api/chat จากฝั่งเบราว์เซอร์
// ไม่แตะ GEMINI_API_KEY เลย คีย์อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น

import { getAccessToken } from "./supabase";

const CLIENT_TIMEOUT = 30000;

/** ข้อความสำรอง เผื่อ response เสียหายจนอ่าน message ไม่ได้ */
const FALLBACK = {
  UNAUTHENTICATED: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
  FORBIDDEN: "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้ผู้ช่วย AI",
  RATE_LIMITED: "ถามถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  NOT_CONFIGURED: "ยังไม่ได้ตั้งค่าผู้ช่วย AI กรุณาติดต่อผู้ดูแลระบบ",
  QUOTA: "โควตาผู้ช่วย AI เต็มแล้ว กรุณารอสักครู่",
  TIMEOUT: "ผู้ช่วย AI ตอบช้าเกินไป กรุณาถามใหม่ให้สั้นลง",
  BLOCKED: "คำถามนี้ถูกระบบความปลอดภัยของ AI ปฏิเสธ",
  OFFLINE: "เชื่อมต่อไม่ได้ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่",
  BAD_RESPONSE: "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่",
};

/** error ที่พร้อมแสดงให้ผู้ใช้อ่าน */
export class ChatError extends Error {
  constructor(code, message, retryAfter) {
    super(message || FALLBACK[code] || FALLBACK.BAD_RESPONSE);
    this.code = code;
    this.retryAfter = retryAfter || 0;
  }
}

/**
 * ถามผู้ช่วย AI
 * @param {{messages: Array<{role:string,text:string}>, summary: string, signal?: AbortSignal}} opts
 * @returns {Promise<{text:string, truncated:boolean}>}
 */
export async function askChat({ messages, summary, signal }) {
  let token = null;
  try {
    token = await getAccessToken();
  } catch (e) {
    token = null;
  }
  if (!token) throw new ChatError("UNAUTHENTICATED");

  // ตัดคำขอเองถ้านานเกินไป กันค้างเมื่อ gateway ไม่ตอบ
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let res;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ messages, summary }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === "AbortError") {
      // ผู้ใช้ปิดแผงเอง — โยนต่อให้ผู้เรียกเงียบ ๆ
      if (signal && signal.aborted) throw e;
      throw new ChatError("TIMEOUT");
    }
    throw new ChatError("OFFLINE");
  } finally {
    clearTimeout(timer);
  }

  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    throw new ChatError("BAD_RESPONSE");
  }

  if (body && body.error) {
    throw new ChatError(body.error.code, body.error.message, body.error.retryAfter);
  }
  if (!res.ok) {
    throw new ChatError("BAD_RESPONSE");
  }
  if (!body || typeof body.text !== "string" || !body.text) {
    throw new ChatError("BAD_RESPONSE", "ผู้ช่วย AI ไม่ได้ตอบกลับ กรุณาลองถามใหม่");
  }

  return { text: body.text, truncated: !!body.truncated };
}
