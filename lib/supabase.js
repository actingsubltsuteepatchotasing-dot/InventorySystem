// ตัวเชื่อม Supabase แบบเรียก REST ตรงด้วย fetch — ไม่ต้องติดตั้ง package เพิ่ม
// ใช้เพียง Project URL + anon (public) key ตามที่กำหนดไว้

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const SESSION_KEY = "raot-sb-session";

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
    const raw = localStorage.getItem(SESSION_KEY);
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

async function readError(res) {
  let detail = "";
  try {
    const body = await res.json();
    detail =
      body.error_description || body.msg || body.message || body.error || body.hint || "";
  } catch (e) {
    detail = "";
  }
  return detail;
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
    const detail = await readError(res);
    if (res.status === 401) throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
    if (res.status === 403) {
      throw new Error("ไม่มีสิทธิ์เข้าถึงข้อมูล — ตรวจสอบว่ารัน schema.sql และเปิด RLS policy แล้ว");
    }
    if (res.status === 404) {
      throw new Error("ไม่พบตารางในฐานข้อมูล — ยังไม่ได้รัน supabase/schema.sql ใช่หรือไม่");
    }
    throw new Error(detail || "เรียกฐานข้อมูลไม่สำเร็จ (HTTP " + res.status + ")");
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
