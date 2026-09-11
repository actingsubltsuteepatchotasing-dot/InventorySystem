// ตัวเชื่อม Supabase แบบเรียก REST ตรงด้วย fetch — ไม่ต้องติดตั้ง package เพิ่ม
// ใช้เพียง Project URL + anon (public) key ตามที่กำหนดไว้

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const SESSION_KEY = "ultra-sb-session";

/**
 * คีย์เดิมสมัยที่โปรแกรมยังใช้ชื่อหน่วยงาน
 *
 * ยังอ่านต่อได้หนึ่งครั้งแล้วย้ายมาคีย์ใหม่ให้เอง
 * ถ้าเปลี่ยนชื่อคีย์เฉย ๆ ทุกคนที่ค้างล็อกอินอยู่จะหลุดพร้อมกันตอน deploy
 * ลบบรรทัดนี้ทิ้งได้เมื่อมั่นใจว่าทุกเครื่องย้ายมาแล้ว
 */
const LEGACY_SESSION_KEY = "raot-sb-session";

/** ตั้งค่า environment ครบหรือยัง */
export function isConfigured() {
  return Boolean(URL_BASE && ANON_KEY);
}

export function configHint() {
  const missing = [];
  if (!URL_BASE) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!ANON_KEY) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return missing;
}

/* ------------------------------------------------------------------ session */

let session = null;         // { access_token, refresh_token, expires_at, user }
let refreshing = null;      // กัน refresh ซ้อนกันหลายครั้ง

function persist(s) {
  session = s;
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch (e) {
    // เบราว์เซอร์ปิด storage — ใช้งานต่อได้ในแท็บนี้ แต่รีเฟรชแล้วต้องล็อกอินใหม่
  }
}

/** อ่าน session ที่เก็บไว้ (เรียกครั้งเดียวตอน mount) */
export function restoreSession() {
  if (session) return session;
  try {
    let raw = localStorage.getItem(SESSION_KEY);

    // ยังไม่มีคีย์ใหม่ แต่มีของเดิมอยู่ -> ย้ายให้แล้วลบของเดิมทิ้ง
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_SESSION_KEY);
      if (legacy) {
        localStorage.setItem(SESSION_KEY, legacy);
        localStorage.removeItem(LEGACY_SESSION_KEY);
        raw = legacy;
      }
    }

    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.access_token && s.refresh_token) session = s;
    }
  } catch (e) {
    // ข้อมูลเสียหาย — ถือว่ายังไม่ล็อกอิน
  }
  return session;
}

export function getUser() {
  return session ? session.user : null;
}

function storeTokens(data) {
  const s = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    // เผื่อเวลา 30 วินาที กันกรณีนาฬิกาเครื่องเพี้ยนเล็กน้อย
    expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000 - 30000,
    user: data.user || null,
  };
  persist(s);
  return s;
}

/* --------------------------------------------------------------- HTTP core */

/** อ่านรายละเอียด error จาก response — คืนทั้งรหัสและข้อความดิบเพื่อวินิจฉัยได้ */
async function readErrorInfo(res) {
  try {
    const body = await res.json();
    return {
      code: body.code || "",
      message:
        body.error_description || body.msg || body.message || body.error || "",
      details: body.details || "",
      hint: body.hint || "",
    };
  } catch (e) {
    return { code: "", message: "", details: "", hint: "" };
  }
}

/** รวมรายละเอียดเป็นบรรทัดเดียวสำหรับต่อท้ายข้อความแจ้งเตือน */
function rawOf(info) {
  const parts = [info.code, info.message, info.details, info.hint].filter(Boolean);
  return parts.length ? parts.join(" · ") : "";
}

async function readError(res) {
  return rawOf(await readErrorInfo(res));
}

/** แปลข้อความ error ของ Supabase เป็นภาษาไทย */
function friendlyAuthError(status, detail) {
  const d = (detail || "").toLowerCase();
  if (d.includes("invalid login credentials")) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  if (d.includes("email not confirmed")) {
    return "อีเมลนี้ยังไม่ได้ยืนยัน — ให้เปิด Supabase > Authentication > Users แล้วติ๊ก Auto Confirm User";
  }
  if (d.includes("too many requests") || status === 429) {
    return "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
  }
  if (status === 401 || status === 403) return "ไม่มีสิทธิ์เข้าถึง — ตรวจสอบ anon key อีกครั้ง";
  return detail || "เข้าสู่ระบบไม่สำเร็จ (HTTP " + status + ")";
}

/* ------------------------------------------------------------------- auth */

/** เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน */
export async function signInWithPassword(email, password) {
  if (!isConfigured()) throw new Error("ยังไม่ได้ตั้งค่า Supabase — ขาด " + configHint().join(", "));

  const res = await fetch(URL_BASE + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) throw new Error(friendlyAuthError(res.status, await readError(res)));
  return storeTokens(await res.json());
}

/** ต่ออายุ access token ด้วย refresh token */
async function refreshSession() {
  if (!session || !session.refresh_token) return null;
  if (refreshing) return refreshing;

  refreshing = (async () => {
    try {
      const res = await fetch(URL_BASE + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if (!res.ok) {
        persist(null); // refresh token หมดอายุ → ต้องล็อกอินใหม่
        return null;
      }
      return storeTokens(await res.json());
    } catch (e) {
      return null; // เน็ตหลุด — คง session เดิมไว้ ให้ลองใหม่รอบหน้า
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

/** คืน access token ที่ยังไม่หมดอายุ (ต่ออายุอัตโนมัติถ้าจำเป็น) */
export async function getAccessToken() {
  if (!session) return null;
  if (Date.now() >= session.expires_at) {
    const s = await refreshSession();
    return s ? s.access_token : null;
  }
  return session.access_token;
}

/** ออกจากระบบ */
export async function signOut() {
  const token = session ? session.access_token : null;
  persist(null);
  if (!token) return;
  try {
    await fetch(URL_BASE + "/auth/v1/logout", {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: "Bearer " + token },
    });
  } catch (e) {
    // ออกจากระบบฝั่งเครื่องสำเร็จแล้ว ถึงยิงไม่ถึงเซิร์ฟเวอร์ก็ไม่เป็นไร
  }
}

/** ตรวจว่า session ที่กู้คืนมายังใช้ได้จริงหรือไม่ */
export async function verifySession() {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(URL_BASE + "/auth/v1/user", {
      headers: { apikey: ANON_KEY, Authorization: "Bearer " + token },
    });
    if (!res.ok) {
      persist(null);
      return null;
    }
    const user = await res.json();
    persist({ ...session, user });
    return user;
  } catch (e) {
    // เน็ตหลุด — ยังถือว่าล็อกอินอยู่ ใช้ข้อมูลผู้ใช้ที่เก็บไว้
    return session ? session.user : null;
  }
}

/**
 * สร้างผู้ใช้ใหม่ด้วยอีเมลและรหัสผ่าน โดยไม่ต้องยืนยันอีเมล
 *
 * ใช้ปลายทาง /auth/v1/signup ด้วย anon key ซึ่งเรียกจากเบราว์เซอร์ได้
 *   ทางเลือกอีกทางคือ Admin API (/auth/v1/admin/users) ที่ตั้ง email_confirm ได้ตรง ๆ
 *   แต่ต้องใช้ service_role key ซึ่งเป็นกุญแจที่ข้ามทุกสิทธิ์ในฐานข้อมูล
 *   ห้ามฝังไว้ในเว็บเด็ดขาด เพราะใครเปิดหน้าเว็บก็อ่านออกและลบข้อมูลทั้งระบบได้
 *
 * "ไม่ต้องยืนยันอีเมล" ตั้งที่ Supabase ไม่ใช่ที่โค้ด:
 *   Authentication > Sign In / Providers > Email > ปิด "Confirm email"
 *   ปิดแล้ว signup จะคืน session กลับมาเลย = ผู้ใช้ล็อกอินได้ทันที
 *   ถ้ายังเปิดอยู่ ผู้ใช้จะถูกสร้างแต่ล็อกอินไม่ได้จนกว่าจะกดลิงก์ในอีเมล
 *   ฟังก์ชันนี้จึงคืนค่า confirmed กลับไปให้หน้าจอบอกผู้ใช้ได้ว่าเป็นกรณีไหน
 *
 * ไม่แตะ session ที่เก็บไว้ในเครื่อง (ไม่เรียก storeTokens)
 * ไม่งั้นคนที่กดสร้างผู้ใช้จะกลายเป็นล็อกอินด้วยบัญชีที่เพิ่งสร้างแทนบัญชีตัวเอง
 *
 * @returns {Promise<{confirmed: boolean, id: string, email: string}>}
 */
export async function createUser(email, password) {
  if (!isConfigured()) throw new Error("ยังไม่ได้ตั้งค่า Supabase — ขาด " + configHint().join(", "));

  const res = await fetch(URL_BASE + "/auth/v1/signup", {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: String(email).trim(), password }),
  });

  if (!res.ok) {
    const detail = await readError(res);
    const d = detail.toLowerCase();
    if (d.includes("already registered") || d.includes("already been registered")) {
      throw new Error("อีเมลนี้มีผู้ใช้อยู่แล้ว");
    }
    if (d.includes("signups not allowed") || d.includes("signup is disabled")) {
      throw new Error(
        "โปรเจกต์นี้ปิดการสมัครไว้ — เปิดที่ Supabase > Authentication > Sign In / Providers > " +
          "Email แล้วเปิด Allow new users to sign up"
      );
    }
    if (d.includes("password")) throw new Error("รหัสผ่านไม่ผ่านเกณฑ์: " + detail);
    if (d.includes("email")) throw new Error("อีเมลไม่ถูกต้อง: " + detail);
    throw new Error(detail || "สร้างผู้ใช้ไม่สำเร็จ (HTTP " + res.status + ")");
  }

  const data = await res.json();
  const user = data.user || data;

  // มี access_token = ล็อกอินได้เลย · มี confirmed_at = ยืนยันแล้ว
  // ถ้าไม่มีทั้งคู่แปลว่าโปรเจกต์ยังบังคับยืนยันอีเมลอยู่
  const confirmed = !!(
    data.access_token ||
    (user && (user.email_confirmed_at || user.confirmed_at))
  );

  return { confirmed, id: (user && user.id) || "", email: (user && user.email) || email };
}

/**
 * เปลี่ยนรหัสผ่านของผู้ใช้ที่ล็อกอินอยู่
 *
 * ตรวจรหัสเดิมด้วยการ "เข้าสู่ระบบใหม่ด้วยรหัสเดิม" ก่อนเสมอ
 *   Supabase ไม่มี API ที่รับรหัสเดิมมาตรวจให้ตรง ๆ ถ้าไม่ตรวจเอง
 *   ใครที่เดินผ่านเครื่องที่เปิดค้างไว้จะเปลี่ยนรหัสของคนอื่นได้ทันที
 *   การล็อกอินซ้ำได้ token ใหม่มาด้วย ซึ่งจำเป็นอยู่แล้วสำหรับคำสั่งเปลี่ยนรหัส
 *
 * รหัสใหม่สั้นกว่าที่ Supabase กำหนดจะถูกปฏิเสธจากฝั่งเซิร์ฟเวอร์
 * จึงส่งข้อความจากเซิร์ฟเวอร์กลับไปตรง ๆ ไม่ต้องเดากติกาซ้ำที่ฝั่งหน้าจอ
 */
export async function changePassword(email, oldPassword, newPassword) {
  if (!isConfigured()) throw new Error("ยังไม่ได้ตั้งค่า Supabase — ขาด " + configHint().join(", "));

  // ล็อกอินด้วยรหัสเดิม = ตรวจว่ารหัสเดิมถูกต้องจริง
  let fresh;
  try {
    fresh = await signInWithPassword(email, oldPassword);
  } catch (e) {
    throw new Error("รหัสผ่านเดิมไม่ถูกต้อง");
  }

  const res = await fetch(URL_BASE + "/auth/v1/user", {
    method: "PUT",
    headers: {
      apikey: ANON_KEY,
      Authorization: "Bearer " + fresh.access_token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: newPassword }),
  });

  if (!res.ok) {
    const detail = await readError(res);
    if (/should be different|same as the old/i.test(detail)) {
      throw new Error("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม");
    }
    if (/at least|length|short|weak/i.test(detail)) {
      throw new Error("รหัสผ่านใหม่สั้นหรือคาดเดาง่ายเกินไป: " + detail);
    }
    throw new Error(detail || "เปลี่ยนรหัสผ่านไม่สำเร็จ (HTTP " + res.status + ")");
  }

  return true;
}

/* -------------------------------------------------------------- PostgREST */

/**
 * เรียก PostgREST (/rest/v1/...) พร้อมแนบ token อัตโนมัติ
 * @param {string} path เช่น "products?select=*"
 */
export async function rest(path, options = {}) {
  if (!isConfigured()) throw new Error("ยังไม่ได้ตั้งค่า Supabase");

  const token = await getAccessToken();
  if (!token) throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");

  const headers = {
    apikey: ANON_KEY,
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const res = await fetch(URL_BASE + "/rest/v1/" + path, { ...options, headers });

  if (!res.ok) {
    const info = await readErrorInfo(res);
    const raw = rawOf(info);
    const msg = (info.message || "").toLowerCase();

    // แนบรหัสไว้กับ error เพื่อให้ผู้เรียกแยกแยะกรณีได้เอง
    const fail = (text) => {
      const err = new Error(text);
      err.code = info.code || "";
      err.status = res.status;
      err.missingTable = res.status === 404 || info.code === "42P01" || info.code === "PGRST205";
      return err;
    };

    if (res.status === 401) {
      throw fail("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" + (raw ? " [" + raw + "]" : ""));
    }

    if (res.status === 403 || info.code === "42501") {
      // 42501 เกิดได้ 2 กรณี แยกจากข้อความ
      if (msg.includes("row-level security") || msg.includes("row level security")) {
        throw fail(
          "RLS ปฏิเสธคำสั่งนี้ — ยังไม่มี policy สำหรับ role authenticated " +
            "ให้รัน supabase/schema.sql ส่วน RLS ซ้ำอีกครั้ง [" + raw + "]"
        );
      }
      /*
       * 42501 ที่พูดถึง sequence เป็นคนละเรื่องกับสิทธิ์ของตาราง
       * ทุกตารางมีคอลัมน์ row_order ที่ default เป็น nextval(...) ตอน insert
       * Postgres จึงต้องเรียก nextval ซึ่งขอสิทธิ์บน sequence แยกอีกชั้น
       * ถ้าไม่แยกข้อความ คนอ่านจะไปไล่ดู GRANT ของตารางซึ่งครบอยู่แล้ว
       */
      if (msg.includes("sequence")) {
        throw fail(
          "สิทธิ์ของ sequence ไม่พอ — ตารางได้ GRANT ครบแล้ว แต่ sequence ของคอลัมน์ " +
            "row_order ยังไม่ได้ ให้รัน supabase/schema.sql ทั้งไฟล์อีกครั้ง " +
            "(ไฟล์รุ่นใหม่มีบรรทัด grant usage on all sequences แล้ว) [" + raw + "]"
        );
      }
      throw fail(
        "สิทธิ์ระดับตารางไม่พอ — role authenticated ยังไม่ได้รับ GRANT บนตารางนี้ " +
          "ให้รัน supabase/schema.sql ทั้งไฟล์ใน SQL Editor [" + raw + "]"
      );
    }

    if (res.status === 404 || info.code === "42P01" || info.code === "PGRST205") {
      throw fail(
        "ไม่พบตารางในฐานข้อมูล — ยังไม่ได้รัน supabase/schema.sql เวอร์ชันล่าสุด " +
          "หรือ PostgREST ยังไม่รีเฟรช schema cache [" + raw + "]"
      );
    }

    throw fail(raw || "เรียกฐานข้อมูลไม่สำเร็จ (HTTP " + res.status + ")");
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
