// ตัวช่วยติดตั้ง — สั่ง npm run setup แล้วมันบอกเองว่าติดตั้งถึงไหนและต้องทำอะไรต่อ
//
// ทำไมต้องมี:
//   คู่มือบอกได้ว่า "ต้องทำอะไรบ้าง" แต่บอกไม่ได้ว่า "ตอนนี้คุณอยู่ตรงไหน"
//   คนติดตั้งจึงต้องไล่อ่านทั้งคู่มือแล้วเดาเองว่าพลาดตรงไหน ซึ่งเสียเวลาที่สุด
//   ไฟล์นี้ตรวจของจริงให้ทีละข้อ แล้วบอกเป็นข้อ ๆ ว่าเหลืออะไร
//
//   ตรวจจากนอกโปรแกรม จึงใช้ได้ตอนที่ยังเปิดเว็บไม่ได้หรือล็อกอินไม่ผ่าน
//   ซึ่งเป็นตอนที่ต้องการความช่วยเหลือมากที่สุด
//
// ใช้แค่ของที่มากับ Node จึงรันได้ทันทีโดยไม่ต้อง npm install
//
// สั่งได้สองแบบ:
//   node tools/setup.mjs          ตรวจอย่างเดียว
//   node tools/setup.mjs --init   สร้างไฟล์ .env.local จากไฟล์ตัวอย่างให้ด้วย (ถ้ายังไม่มี)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const readFile = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const INIT = process.argv.includes("--init");

/* ------------------------------------------------------------ การแสดงผล */

let problems = 0;
const todo = [];

const line = (s = "") => console.log(s);
const head = (t) => line("\n" + t);
const ok = (m) => line("  ผ่าน    " + m);
const bad = (m, fix) => {
  problems++;
  line("  ไม่ผ่าน " + m);
  if (fix) todo.push(fix);
};
const warn = (m, fix) => {
  line("  เตือน   " + m);
  if (fix) todo.push(fix);
};
const skip = (m) => line("  ข้าม    " + m);

/* -------------------------------------------------- 1. ไฟล์ในโปรเจกต์ */

head("1. ไฟล์ที่โปรเจกต์ต้องมี");

const NEED_FILES = [
  ["package.json", "รายชื่อไลบรารีและคำสั่ง"],
  ["jsconfig.json", "ทำให้ import แบบ @/lib/... ใช้ได้"],
  ["next.config.mjs", "ค่าตั้งต้นของ Next.js"],
  [".gitignore", "กันไฟล์ลับไม่ให้ขึ้น git"],
  ["supabase/schema.sql", "ไฟล์สร้างฐานข้อมูล"],
];

NEED_FILES.forEach(([f, why]) => {
  if (exists(f)) ok(f);
  else bad(f + " หายไป (" + why + ")", "คัดลอกไฟล์ " + f + " มาจากโปรเจกต์ต้นแบบ");
});

// .gitignore ต้องกันไฟล์ลับจริง ไม่ใช่แค่มีไฟล์
if (exists(".gitignore")) {
  const gi = readFile(".gitignore");
  if (/^\.env\*?\.local$|^\.env\*$/m.test(gi) || gi.includes(".env*.local")) {
    ok(".gitignore กันไฟล์ .env.local ไว้แล้ว");
  } else {
    bad(
      ".gitignore ไม่ได้กันไฟล์ .env.local",
      "เพิ่มบรรทัด .env*.local ใน .gitignore ก่อน commit ครั้งแรก"
    );
  }
}

/* ------------------------------------------------------ 2. ไฟล์ค่าลับ */

head("2. ไฟล์ค่าที่ตั้งไว้ (.env.local)");

const ENV_PATH = path.join(ROOT, ".env.local");

if (!fs.existsSync(ENV_PATH) && INIT && exists(".env.local.example")) {
  fs.copyFileSync(path.join(ROOT, ".env.local.example"), ENV_PATH);
  line("  สร้าง   .env.local จากไฟล์ตัวอย่างให้แล้ว");
}

/** อ่านไฟล์ .env แบบง่าย ๆ — รองรับเท่าที่ไฟล์ตัวอย่างใช้จริงก็พอ */
function readEnvFile(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  fs.readFileSync(p, "utf8")
    .split(/\r?\n/)
    .forEach((raw) => {
      const s = raw.trim();
      if (!s || s.startsWith("#")) return;
      const at = s.indexOf("=");
      if (at < 1) return;
      out[s.slice(0, at).trim()] = s.slice(at + 1).trim().replace(/^["']|["']$/g, "");
    });
  return out;
}

const fromFile = readEnvFile(ENV_PATH);
// ค่าที่ตั้งไว้ในระบบปฏิบัติการมาก่อน เหมือนตอนรันบน Vercel
const env = { ...fromFile, ...process.env };

if (fs.existsSync(ENV_PATH)) ok("มีไฟล์ .env.local");
else {
  warn(
    "ยังไม่มีไฟล์ .env.local (จำเป็นเฉพาะตอนรันในเครื่อง)",
    "สั่ง node tools/setup.mjs --init เพื่อสร้างจากไฟล์ตัวอย่าง แล้วใส่ค่าจริงสองตัว"
  );
}

/* ------------------------------------------------ 3. ค่าที่ขาดไม่ได้ */

head("3. ค่าที่ขาดไม่ได้สองตัว");

const URL_RAW = (env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const KEY = (env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

const PLACEHOLDER = /xxxx|your-app|AIzaSy\.\.\./i;

let urlOK = false;
if (!URL_RAW) {
  bad("NEXT_PUBLIC_SUPABASE_URL ยังไม่ได้ตั้ง", "ใส่ Project URL จาก Supabase > Project Settings > API");
} else if (PLACEHOLDER.test(URL_RAW)) {
  bad("NEXT_PUBLIC_SUPABASE_URL ยังเป็นค่าตัวอย่าง ไม่ใช่ค่าจริง", "แทนที่ด้วย Project URL จริงของโปรเจกต์คุณ");
} else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(URL_RAW)) {
  warn(
    "NEXT_PUBLIC_SUPABASE_URL หน้าตาไม่เหมือนที่อยู่ของ Supabase (" + URL_RAW + ")",
    "ตรวจว่าเป็นแบบ https://xxxx.supabase.co และไม่มีเครื่องหมาย / ปิดท้าย"
  );
  urlOK = true;
} else {
  ok("NEXT_PUBLIC_SUPABASE_URL ตั้งแล้ว");
  urlOK = true;
}

let keyOK = false;
if (!KEY) {
  bad("NEXT_PUBLIC_SUPABASE_ANON_KEY ยังไม่ได้ตั้ง", "ใส่ anon public key จาก Supabase > Project Settings > API");
} else if (PLACEHOLDER.test(KEY)) {
  bad("NEXT_PUBLIC_SUPABASE_ANON_KEY ยังเป็นค่าตัวอย่าง", "แทนที่ด้วย anon public key จริง");
} else if (!KEY.startsWith("ey")) {
  warn("NEXT_PUBLIC_SUPABASE_ANON_KEY หน้าตาไม่เหมือนกุญแจของ Supabase", "กุญแจที่ถูกต้องขึ้นต้นด้วย ey");
  keyOK = true;
} else {
  ok("NEXT_PUBLIC_SUPABASE_ANON_KEY ตั้งแล้ว");
  keyOK = true;
}

/*
 * กุญแจที่ข้ามทุกสิทธิ์ ห้ามอยู่ในช่องที่ถูกฝังลงหน้าเว็บ
 * เช็คด้วยการอ่าน role ที่อยู่ในตัวกุญแจเอง (ส่วนกลางของ JWT)
 * ผิดข้อนี้คือเรื่องใหญ่ที่สุดที่จะเกิดได้ จึงตรวจให้ตั้งแต่ยังไม่ทันขึ้นเว็บ
 */
if (keyOK) {
  try {
    const body = JSON.parse(Buffer.from(KEY.split(".")[1], "base64").toString("utf8"));
    if (body.role === "service_role") {
      bad(
        "กุญแจที่ใส่ในช่อง ANON_KEY เป็น service_role ซึ่งข้ามทุกสิทธิ์",
        "เปลี่ยนเป็น anon public key ทันที · service_role ที่อยู่ในหน้าเว็บ ใครเปิดเว็บก็ลบข้อมูลได้ทั้งระบบ"
      );
      keyOK = false;
    } else if (body.role === "anon") {
      ok("กุญแจเป็นชนิด anon ถูกต้อง");
    }
  } catch (e) {
    // อ่านไม่ออกก็ไม่เป็นไร ปล่อยให้ไปเจอตอนเรียกจริงข้างล่าง
  }
}

/* ------------------------------------------------- 4. ต่อ Supabase ได้ไหม */

head("4. เชื่อมต่อ Supabase");

const expected = (() => {
  const m = /from \(values([\s\S]*?)\) as x\(name\)/.exec(readFile("supabase/schema.sql"));
  return m ? [...m[1].matchAll(/\('([a-z_]+)'\)/g)].map((x) => x[1]) : [];
})();

let ready = false;

if (!urlOK || !keyOK) {
  skip("ยังตรวจไม่ได้ เพราะค่าสองตัวข้างบนยังไม่ครบ");
} else {
  try {
    const res = await fetch(URL_RAW + "/rest/v1/", {
      headers: { apikey: KEY, Authorization: "Bearer " + KEY },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 401 || res.status === 403) {
      bad("ต่อได้แต่กุญแจถูกปฏิเสธ (HTTP " + res.status + ")", "คัดลอก anon public key ใหม่จาก Supabase > Project Settings > API");
    } else if (!res.ok) {
      bad("ต่อไม่ได้ (HTTP " + res.status + ")", "ตรวจว่า Project URL ถูกต้อง และโปรเจกต์ Supabase ไม่ได้ถูก pause");
    } else {
      ok("ต่อ Supabase ได้ และกุญแจใช้งานได้");

      const spec = await res.json();
      const have = new Set(Object.keys((spec && spec.paths) || {}).map((p) => p.replace(/^\//, "")));
      const missing = expected.filter((t) => !have.has(t));

      if (!expected.length) {
        warn("อ่านรายชื่อตารางจาก schema.sql ไม่ได้", "ตรวจว่าไฟล์ supabase/schema.sql ครบถ้วน");
      } else if (missing.length === expected.length) {
        bad(
          "ยังไม่มีตารางสักตาราง (ต้องมี " + expected.length + " ตาราง)",
          "เปิด Supabase > SQL Editor > New query แล้ววางไฟล์ supabase/schema.sql ทั้งไฟล์ กด Run"
        );
      } else if (missing.length) {
        bad(
          "ตารางยังไม่ครบ ขาด " + missing.length + " จาก " + expected.length + " ตาราง: " + missing.join(", "),
          "รัน supabase/schema.sql ทั้งไฟล์อีกครั้ง (รันซ้ำได้ ไม่ลบข้อมูลเดิม) แล้วดูตารางสรุปท้ายผลให้ขึ้น ผ่าน ครบทุกแถว"
        );
      } else {
        ok("ตารางครบทั้ง " + expected.length + " ตาราง");
        ready = true;
      }
    }
  } catch (e) {
    bad(
      "ต่อ Supabase ไม่ได้: " + (e.message || e),
      "ตรวจอินเทอร์เน็ต · ตรวจ Project URL · โปรเจกต์ฟรีที่ไม่มีคนใช้เกิน 7 วันจะถูก pause ให้เข้า Dashboard กด Restore"
    );
  }
}

/* -------------------------------------------------- 5. ระบบล็อกอิน */

head("5. ระบบล็อกอิน");

if (!urlOK || !keyOK) {
  skip("ยังตรวจไม่ได้");
} else {
  try {
    const res = await fetch(URL_RAW + "/auth/v1/settings", {
      headers: { apikey: KEY },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      warn("อ่านค่าระบบล็อกอินไม่ได้ (HTTP " + res.status + ")", "");
    } else {
      const s = await res.json();
      ok("ระบบล็อกอินตอบรับปกติ");

      if (s.disable_signup === false) {
        warn(
          "เปิดให้สมัครสมาชิกเองอยู่ — ใครก็สมัครเข้ามาเห็นข้อมูลได้",
          "ถ้าสร้างผู้ใช้ครบแล้ว ให้ปิดที่ Supabase > Authentication > Sign In / Providers > Email > Allow new users to sign up"
        );
      } else {
        ok("ปิดการสมัครสมาชิกเองไว้แล้ว (ปลอดภัยกว่า)");
      }

      if (s.mailer_autoconfirm === false) {
        warn(
          "ระบบบังคับยืนยันอีเมล — ผู้ใช้ที่สร้างโดยไม่ติ๊ก Auto Confirm User จะล็อกอินไม่ได้",
          "ตอนสร้างผู้ใช้ที่ Authentication > Users ให้ติ๊ก Auto Confirm User ทุกครั้ง"
        );
      }
    }
  } catch (e) {
    warn("ตรวจระบบล็อกอินไม่ได้: " + (e.message || e), "");
  }

  /*
   * นับจำนวนผู้ใช้ได้เฉพาะเมื่อมี service_role key ซึ่งเป็นของไม่บังคับ
   * ไม่มีก็ข้ามไป ไม่ถือว่าผิด — แค่บอกวิธีตรวจเองแทน
   */
  const SERVICE = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!SERVICE || PLACEHOLDER.test(SERVICE)) {
    skip("นับจำนวนผู้ใช้ไม่ได้ (ต้องมี SUPABASE_SERVICE_ROLE_KEY) — ดูเองที่ Authentication > Users");
  } else {
    try {
      const res = await fetch(URL_RAW + "/auth/v1/admin/users?per_page=1", {
        headers: { apikey: SERVICE, Authorization: "Bearer " + SERVICE },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        warn("นับจำนวนผู้ใช้ไม่ได้ (HTTP " + res.status + ")", "");
      } else {
        const body = await res.json();
        const n = Number(res.headers.get("x-total-count")) || (body.users || []).length;
        if (n > 0) ok("มีผู้ใช้ในระบบแล้ว " + n + " คน");
        else {
          bad(
            "ยังไม่มีผู้ใช้สักคน — ล็อกอินไม่ได้แน่นอน",
            "สร้างที่ Supabase > Authentication > Users > Add user แล้วติ๊ก Auto Confirm User ด้วย"
          );
        }
      }
    } catch (e) {
      warn("นับจำนวนผู้ใช้ไม่ได้: " + (e.message || e), "");
    }
  }
}

/* ------------------------------------------------ 6. ค่าเสริม (ไม่บังคับ) */

head("6. ค่าเสริม (ไม่ใส่ก็ใช้งานได้)");

const OPTIONAL = [
  ["GEMINI_API_KEY", "ผู้ช่วย AI"],
  ["LINE_CHANNEL_SECRET", "รับข้อความจากไลน์อัตโนมัติ"],
  ["SUPABASE_SERVICE_ROLE_KEY", "รับข้อความจากไลน์อัตโนมัติ"],
  ["NEXT_PUBLIC_SITE_URL", "การ์ดพรีวิวตอนแชร์ลิงก์"],
];

OPTIONAL.forEach(([k, what]) => {
  const v = (env[k] || "").trim();
  if (v && !PLACEHOLDER.test(v)) ok(k + " ตั้งแล้ว (" + what + ")");
  else skip(k + " ยังไม่ได้ตั้ง — " + what + " จะยังใช้ไม่ได้");
});

/* ------------------------------------------------------------- สรุป */

line("\n" + "=".repeat(66));

if (!problems) {
  line("พร้อมใช้งาน — ติดตั้งครบแล้ว");
  line("");
  line("ขั้นต่อไป:");
  line("  1. สั่ง npm run dev แล้วเปิด http://localhost:3000 (ถ้ารันในเครื่อง)");
  line("  2. ล็อกอินด้วยผู้ใช้ที่สร้างไว้");
  line("  3. ตั้งค่าเริ่มต้นตามชีต 4 ในไฟล์ Docs/เช็คลิสต์การติดตั้ง.xlsx");
  if (!ready) {
    line("");
    line("หมายเหตุ: ยังตรวจตารางในฐานข้อมูลไม่ครบทุกข้อ ดูรายละเอียดด้านบน");
  }
} else {
  line("ยังไม่พร้อม — เหลืออีก " + problems + " เรื่องที่ต้องแก้");
  line("");
  line("ทำตามนี้ตามลำดับ:");
  todo.forEach((t, i) => line("  " + (i + 1) + ". " + t));
}

line("");
line("คู่มือฉบับเต็ม: Docs/คู่มือการติดตั้ง.md");
line("เช็คลิสต์ติ๊กตาม: Docs/เช็คลิสต์การติดตั้ง.xlsx");
line("=".repeat(66));

process.exit(problems ? 1 : 0);
