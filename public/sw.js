/* Service Worker — Ultra ERP (ระบบควบคุมสินค้าคงคลัง)
 *
 * เป้าหมาย: ทำให้ติดตั้งเป็นแอปได้ และเปิดได้เร็วขึ้น
 * ไม่ใช่การทำให้ใช้งาน offline ได้เต็มรูปแบบ เพราะข้อมูลอยู่บน Supabase
 *
 * กฎความปลอดภัยที่ห้ามแหก (สำคัญมากกับระบบที่มีหลายผู้ใช้):
 *   1. ไม่ cache อะไรก็ตามที่ไม่ใช่ GET
 *   2. ไม่ cache คำขอข้ามโดเมน — Supabase และ Gemini ต้องผ่านเน็ตเสมอ
 *      ถ้า cache ข้อมูลผู้ใช้ไว้ อาจเสิร์ฟข้อมูลของคนอื่นหรือข้อมูลเก่าให้
 *   3. ไม่แตะ /api/ เลย
 *   4. HTML ใช้ network-first เสมอ เพื่อให้ deploy ใหม่มีผลทันที
 *      ไม่งั้นผู้ใช้จะค้างอยู่กับเวอร์ชันเก่าไปเรื่อย ๆ
 */

// ขึ้นเลขทุกครั้งที่ต้องบังคับให้เครื่องที่ติดตั้งไปแล้วทิ้ง cache เก่า
// (activate จะลบ cache ที่ชื่อไม่ตรงกับเวอร์ชันนี้ทั้งหมด)
const VERSION = "v2";
const SHELL = "ultra-shell-" + VERSION;
const RUNTIME = "ultra-runtime-" + VERSION;

/** ไฟล์ที่ต้องมีตั้งแต่ติดตั้ง เพื่อให้เปิดแอปตอนออฟไลน์แล้วเห็นอะไรบ้าง */
const PRECACHE = ["/offline.html"];

/**
 * ไฟล์ที่มีลายเซ็นในชื่อ เปลี่ยนเนื้อหาเมื่อไรชื่อก็เปลี่ยน จึง cache ยาวได้
 *
 * ห้ามใส่ /icons/ ตรงนี้ — ชื่อไฟล์ไอคอนคงที่ (icon-192.png) ไม่มีลายเซ็น
 * เคยใส่ไว้แล้วเจอปัญหาจริง: เปลี่ยนรูปไอคอนแล้ว deploy ใหม่
 * แต่เครื่องที่เคยเข้าเว็บยังเห็นไอคอนเก่าตลอดไป เพราะ cache-first เจอของเก่าก็จบ
 * ตอนนี้ไอคอนตกไปใช้ network-first ด้านล่าง ได้ของสดเมื่อออนไลน์
 * และยังมีของเก่าให้ใช้ตอนออฟไลน์
 */
const IMMUTABLE = ["/_next/static/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // ใช้ allSettled เพื่อไม่ให้ไฟล์เดียวพลาดแล้วการติดตั้งล้มทั้งหมด
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/** เก็บลง cache เฉพาะคำตอบที่ใช้ได้จริงเท่านั้น */
function cacheable(response) {
  return response && response.ok && response.type === "basic";
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (cacheable(fresh)) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const fresh = await fetch(request);
  if (cacheable(fresh)) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // กฎ 1 และ 2 — ปล่อยผ่านทุกอย่างที่ไม่ใช่ GET ภายในโดเมนเดียวกัน
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // กฎ 3 — API ต้องสดเสมอ
  if (url.pathname.startsWith("/api/")) return;

  // กฎ 4 — หน้าเว็บใช้ network-first แล้วค่อยตกไป cache และหน้า offline
  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, RUNTIME).catch(async () => {
        const cache = await caches.open(SHELL);
        const offline = await cache.match("/offline.html");
        return (
          offline ||
          new Response("ออฟไลน์ — กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      })
    );
    return;
  }

  // ไฟล์ที่ชื่อเปลี่ยนตามเนื้อหา อ่านจาก cache ได้เลย
  if (IMMUTABLE.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(cacheFirst(request, SHELL));
    return;
  }

  // ที่เหลือ (เช่น /manifest.webmanifest) เอาของสดก่อน
  event.respondWith(networkFirst(request, RUNTIME).catch(() => fetch(request)));
});

// ให้หน้าเว็บสั่งข้ามคิวรอได้ เมื่อผู้ใช้ยอมรับการอัปเดตเอง
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
