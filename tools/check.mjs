// ตรวจสอบความเรียบร้อยของโปรเจกต์ทั้งกอง — รันด้วย  node tools/check.mjs
//
// ทำไมต้องมีไฟล์นี้:
//   โปรเจกต์นี้ไม่ได้ลง node_modules ไว้ในเครื่อง จึงรัน next build เพื่อจับ error ไม่ได้
//   บั๊กที่เจอบ่อยที่สุดจึงเป็นบั๊กที่ "ไม่มีใครฟ้องตอนแก้โค้ด แต่จอขาวตอนเปิดใช้จริง"
//   เช่น ส่ง prop ที่ไม่มีตัวแปรอยู่จริง หรือหัวตารางมีคอลัมน์มากกว่าแถวข้อมูล
//   ไฟล์นี้ไล่ตรวจรูปแบบพวกนั้นด้วยการอ่านไฟล์ตรง ๆ ไม่ต้องพึ่งไลบรารีอะไรเลย
//
// เป็นการตรวจแบบหยาบ (ไม่ได้ parse จริง) จึงตั้งใจให้ "แม่น" มากกว่า "ครบ"
// ยอมปล่อยบางเคสหลุด ดีกว่าฟ้องผิดจนไม่มีใครเชื่อผลของมันอีก

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = ["app", "components", "lib"];

let failed = 0;
const ok = (msg) => console.log("  ผ่าน   " + msg);
const bad = (msg) => {
  failed++;
  console.log("  ไม่ผ่าน " + msg);
};
const head = (t) => console.log("\n" + t);

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const f of fs.readdirSync(abs, { withFileTypes: true })) {
    if (f.name.startsWith(".")) continue;
    const rel = path.join(dir, f.name);
    if (f.isDirectory()) walk(rel, out);
    else if (f.name.endsWith(".js")) out.push(rel);
  }
  return out;
}

const FILES = SRC.flatMap((d) => walk(d));

/* ------------------------------------------------------------------ 1 */
head("1. import กับ export ตรงกันทุกไฟล์");
{
  const exportsOf = new Map();
  for (const f of FILES) {
    const s = read(f);
    const names = new Set();
    for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) {
      names.add(m[1]);
    }
    for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) {
      m[1].split(",").forEach((x) => {
        const t = x.trim().split(/\s+as\s+/).pop().trim();
        if (t) names.add(t);
      });
    }
    if (/export\s+default/.test(s)) names.add("default");
    exportsOf.set(f.replace(/\\/g, "/"), names);
  }

  /** แปลง "@/lib/db" หรือ "./ui" ให้เป็นพาธไฟล์จริงในโปรเจกต์ */
  function resolve(from, spec) {
    let rel;
    if (spec.startsWith("@/")) rel = spec.slice(2);
    else if (spec.startsWith(".")) rel = path.join(path.dirname(from), spec);
    else return null; // แพ็กเกจภายนอก ไม่ต้องตรวจ
    rel = rel.replace(/\\/g, "/");
    for (const c of [rel + ".js", rel + "/index.js", rel]) {
      if (exportsOf.has(c)) return c;
    }
    return undefined; // ชี้ไปไฟล์ที่ไม่มีอยู่
  }

  let n = 0;
  for (const f of FILES) {
    const key = f.replace(/\\/g, "/");
    for (const m of read(f).matchAll(/import\s+([^;]+?)\s+from\s+"([^"]+)"/g)) {
      const target = resolve(key, m[2]);
      if (target === null) continue;
      if (target === undefined) {
        bad(key + " import ไฟล์ที่ไม่มีอยู่: " + m[2]);
        continue;
      }
      const have = exportsOf.get(target);
      const clause = m[1];
      const braces = clause.match(/\{([^}]*)\}/);
      if (braces) {
        braces[1].split(",").forEach((x) => {
          const name = x.trim().split(/\s+as\s+/)[0].trim();
          if (!name) return;
          n++;
          if (!have.has(name)) bad(key + " เรียก " + name + " จาก " + m[2] + " แต่ไฟล์นั้นไม่ได้ export");
        });
      }
      const def = clause.replace(/\{[^}]*\}/, "").replace(/,/g, " ").trim();
      if (def && /^[A-Za-z_$][\w$]*$/.test(def)) {
        n++;
        if (!have.has("default")) bad(key + " เรียก default จาก " + m[2] + " แต่ไฟล์นั้นไม่มี export default");
      }
    }
  }
  ok("ตรวจการเรียกข้ามไฟล์ " + n + " จุด ใน " + FILES.length + " ไฟล์");
}

/* ------------------------------------------------------------------ 2 */
head("2. วงเล็บและปีกกาสมดุล");
{
  const PAIR = { ")": "(", "]": "[", "}": "{" };
  let badFiles = 0;
  for (const f of FILES) {
    const s = read(f);
    const st = [];
    let i = 0;
    let line = 1;
    let broke = false;
    while (i < s.length) {
      const c = s[i];
      const nx = s[i + 1];
      if (c === "\n") { line++; i++; continue; }
      if (c === "/" && nx === "/") { while (i < s.length && s[i] !== "\n") i++; continue; }
      if (c === "/" && nx === "*") {
        i += 2;
        while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) { if (s[i] === "\n") line++; i++; }
        i += 2;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        const q = c;
        i++;
        while (i < s.length && s[i] !== q) { if (s[i] === "\\") i++; if (s[i] === "\n") line++; i++; }
        i++;
        continue;
      }
      // regex literal: ดูตัวอักษรที่ไม่ใช่ช่องว่างตัวก่อนหน้าเพื่อแยกจากการหาร
      if (c === "/") {
        const prev = s.slice(0, i).replace(/\s+$/, "").slice(-1) || "(";
        if (/[=(,:[!&|?{;+]/.test(prev)) {
          i++;
          while (i < s.length && s[i] !== "/") { if (s[i] === "\\") i++; i++; }
          i++;
          continue;
        }
      }
      if ("([{".includes(c)) { st.push([c, line]); i++; continue; }
      if (")]}".includes(c)) {
        const t = st.pop();
        if (!t || t[0] !== PAIR[c]) {
          bad(f + ":" + line + " เจอ " + c + " ที่ไม่มีคู่");
          broke = true;
          break;
        }
        i++;
        continue;
      }
      i++;
    }
    if (!broke && st.length) {
      bad(f + " มีวงเล็บที่ยังไม่ปิด บรรทัด " + st[st.length - 1][1]);
      broke = true;
    }
    if (broke) badFiles++;
  }
  if (!badFiles) ok("สมดุลครบ " + FILES.length + " ไฟล์");
}

/* ------------------------------------------------------------------ 3 */
head("3. ชื่อที่ส่งเป็น prop ถูกประกาศไว้จริง");
{
  // จับบั๊กแบบ toast={toast} ในไฟล์ที่ไม่เคยเรียก useToast()
  // ไม่มี error ตอนแก้โค้ด แต่หน้าจอพังทั้งหน้าตอนเปิดใช้งานจริง
  const GLOBALS = new Set([
    "window", "document", "navigator", "console", "Math", "Number", "String", "Object",
    "Array", "JSON", "Date", "Boolean", "Promise", "Set", "Map", "URL", "Blob", "Error",
    "TextEncoder", "TextDecoder", "Uint8Array", "Uint32Array", "RegExp", "Intl",
    "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame",
    "cancelAnimationFrame", "fetch", "ResizeObserver", "React", "Fragment", "undefined",
    "true", "false", "null", "this",
  ]);

  function declared(s) {
    const names = new Set();
    const add = (n) => n && names.add(n);
    for (const m of s.matchAll(/import\s+([^;]+?)\s+from\s+"[^"]+"/g)) {
      const clause = m[1];
      const braces = clause.match(/\{([^}]*)\}/);
      if (braces) braces[1].split(",").forEach((x) => add(x.trim().split(/\s+as\s+/).pop().trim()));
      const def = clause.replace(/\{[^}]*\}/, "").replace(/,/g, " ").trim();
      if (def && /^[A-Za-z_$][\w$]*$/.test(def)) add(def);
    }
    for (const m of s.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
    for (const m of s.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}/g)) {
      m[1].split(",").forEach((x) => {
        const t = x.split(":").pop().split("=")[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(t)) add(t);
      });
    }
    for (const m of s.matchAll(/\b(?:const|let|var)\s*\[([^\]]*)\]/g)) {
      m[1].split(",").forEach((x) => {
        const t = x.split("=")[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(t)) add(t);
      });
    }
    for (const m of s.matchAll(/\(([^()]*)\)\s*(?:=>|\{)/g)) {
      m[1].split(",").forEach((x) => {
        const t = x.split("=")[0].replace(/[{}[\]]/g, "").split(":").pop().trim();
        if (/^[A-Za-z_$][\w$]*$/.test(t)) add(t);
      });
    }
    for (const m of s.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) add(m[1]);
    for (const m of s.matchAll(/function\s+[A-Za-z_$][\w$]*\s*\(\s*\{([\s\S]*?)\}\s*\)/g)) {
      m[1].split(",").forEach((x) => {
        const t = x.split("=")[0].split(":").pop().trim();
        if (/^[A-Za-z_$][\w$]*$/.test(t)) add(t);
      });
    }
    return names;
  }

  let n = 0;
  for (const f of FILES) {
    const s = read(f);
    const have = declared(s);
    for (const m of s.matchAll(/\s([a-zA-Z][\w]*)=\{([A-Za-z_$][\w$]*)\}/g)) {
      const used = m[2];
      if (GLOBALS.has(used) || have.has(used)) continue;
      n++;
      bad(f + ":" + s.slice(0, m.index).split("\n").length + " ใช้ " + m[1] + "={" + used + "} แต่ไม่ได้ประกาศ " + used);
    }
  }
  if (!n) ok("ไม่พบ prop ที่ส่งชื่อที่ไม่มีอยู่จริง");
}

/* ------------------------------------------------------------------ 4 */
head("4. หัวตารางตรงกับแถวข้อมูล");
{
  // บั๊กแบบลบ <td> ไปหนึ่งช่องตอนเพิ่มคอลัมน์ใหม่ ทำให้ข้อมูลเลื่อนไปคนละคอลัมน์
  // หน้าจอยังเปิดได้ตามปกติ ไม่มีใครสังเกตจนกว่าจะไปอ่านตัวเลขผิดคอลัมน์
  //
  // นับทีละบรรทัด ไม่ใช่นับทั้งบล็อก เพราะ tbody เดียวมีได้หลายแบบแถว
  // ช่องที่ "มีเสมอ" = บรรทัดขึ้นต้นด้วยแท็กเลย
  // ช่องที่ "มีบ้างไม่มีบ้าง" = บรรทัดขึ้นต้นด้วย { เช่น {cond ? <th/> : null}
  //   นับเป็นตัวเลขตายตัวไม่ได้ คืน null แล้วข้ามแถวนั้นไป
  const countRow = (row, tag) => {
    const open = new RegExp("<" + tag + "[\\s>/]");
    let cols = 0;
    for (const raw of row.split("\n")) {
      const line = raw.trim();
      if (!open.test(line)) continue;
      if (!line.startsWith("<" + tag)) return null;
      const span = /colSpan=\{(\d+)\}/.exec(line);
      cols += span ? Number(span[1]) : 1;
    }
    return cols;
  };
  const rowsOf = (block) => [...block.matchAll(/<tr[\s>][\s\S]*?<\/tr>/g)].map((m) => m[0]);

  let checked = 0;
  let skipped = 0;
  for (const f of FILES) {
    const src = read(f);
    const heads = [...src.matchAll(/<thead>([\s\S]*?)<\/thead>/g)];
    const bodies = [...src.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)];
    if (heads.length !== bodies.length) continue;

    heads.forEach((h, i) => {
      const body = bodies[i];
      if (body.index < h.index) return;

      const headRows = rowsOf(h[1]);
      if (headRows.length !== 1 || h[1].includes(".map(")) return skipped++;
      const want = countRow(headRows[0], "th");
      if (want === null) return skipped++;

      const bodyRows = rowsOf(body[1]);
      if (!bodyRows.length) return skipped++;

      checked++;
      bodyRows.forEach((r, n) => {
        const got = countRow(r, "td");
        if (got === null || got === want) return;
        bad(
          f + " ตารางที่ " + (i + 1) + " แถวแบบที่ " + (n + 1) +
            " — หัวตาราง " + want + " ช่อง แต่แถวข้อมูล " + got + " ช่อง"
        );
      });
    });
  }
  ok("ตรวจ " + checked + " ตาราง (ข้ามตารางที่คอลัมน์ไม่ตายตัว " + skipped + " ตาราง)");
}

/* ------------------------------------------------------------------ 5 */
head("5. เมนู สิทธิ และการสำรองข้อมูล ครบตรงกัน");
{
  const shell = read("components/Shell.js");
  const constants = read("lib/constants.js");
  const store = read("lib/store.js");
  const backup = read("components/views/Backup.js");

  const navIds = [...shell.matchAll(/\{ id: "([a-zA-Z]+)", Icon/g)].map((m) => m[1]);
  const screenIds = [...constants.matchAll(/\{ id: "([a-zA-Z]+)",\s+group:/g)].map((m) => m[1]);
  const permsScreen = (constants.match(/PERMS_SCREEN\s*=\s*"([^"]+)"/) || [])[1];

  const missing = navIds.filter((id) => id !== permsScreen && !screenIds.includes(id));
  if (missing.length) bad("เมนูที่ไม่มีในตารางสิทธิ: " + missing.join(", "));
  else ok("ทุกหน้าจอในเมนูมีให้ตั้งสิทธิได้ (" + navIds.length + " หน้า)");

  const extra = screenIds.filter((id) => !navIds.includes(id));
  if (extra.length) bad("ตารางสิทธิมีหน้าที่ไม่มีในเมนูแล้ว: " + extra.join(", "));
  else ok("ตารางสิทธิไม่มีหน้าจอที่เลิกใช้แล้วค้างอยู่");

  // ตารางใหม่ที่ลืมใส่ในหน้าสำรองข้อมูล = สำรอง "ทั้งหมด" แล้วได้ไม่ครบ
  const emptyBlock = (store.match(/const EMPTY = \{([\s\S]*?)\};/) || ["", ""])[1];
  const arrays = [...emptyBlock.matchAll(/(\w+):\s*\[\]/g)].map((m) => m[1]);
  const parts = [...backup.matchAll(/\{ key: "(\w+)"/g)].map((m) => m[1]);
  const notBacked = arrays.filter((k) => !parts.includes(k));
  if (notBacked.length) bad("ตารางที่ยังไม่ได้ใส่ในหน้าสำรองข้อมูล: " + notBacked.join(", "));
  else ok("หน้าสำรองข้อมูลครอบคลุมทุกตาราง (" + parts.length + " ส่วน)");

  const prefixes = [...constants.matchAll(/prefix: "(\w+)", period: "(\w+)"/g)].map((m) => m[1] + "-" + m[2]);
  const dup = prefixes.filter((p, i) => prefixes.indexOf(p) !== i);
  if (dup.length) bad("อักษรนำหน้าเลขที่เอกสารซ้ำกัน: " + dup.join(", "));
  else ok("อักษรนำหน้าเลขที่เอกสารไม่ซ้ำกัน (" + prefixes.length + " กลุ่ม)");
}

/* ------------------------------------------------------------------ 6 */
head("6. ไฟล์ schema.sql");
{
  const sql = read("supabase/schema.sql");
  const api = read("lib/api.js");

  const tags = [...sql.matchAll(/\$([a-z_]*)\$/g)].map((m) => m[1]);
  const c = {};
  tags.forEach((t) => { c[t] = (c[t] || 0) + 1; });
  const odd = Object.keys(c).filter((k) => c[k] % 2);
  if (odd.length) bad("บล็อก $...$ ไม่ได้ปิด: " + odd.join(", "));
  else ok("บล็อก $...$ ปิดครบทุกป้าย (" + Object.keys(c).length + " ป้าย)");

  const tables = [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
  const notLoaded = tables.filter((t) => !api.includes('"' + t + '"'));
  if (notLoaded.length) bad("ตารางที่ lib/api.js ยังไม่รู้จัก: " + notLoaded.join(", "));
  else ok("lib/api.js รู้จักครบทั้ง " + tables.length + " ตาราง");

  // ทุกตารางต้องเปิด RLS ไม่งั้น anon key อ่านข้อมูลได้โดยไม่ต้อง login
  const rls = sql.match(/enable row level security/g) || [];
  const listed = tables.filter((t) => new RegExp("'" + t + "'").test(sql));
  if (listed.length < tables.length) {
    bad("ตารางที่ยังไม่อยู่ในรายชื่อเปิด RLS: " + tables.filter((t) => !listed.includes(t)).join(", "));
  } else {
    ok("ทุกตารางอยู่ในรายชื่อเปิด RLS (" + tables.length + " ตาราง)");
  }
}

/* ------------------------------------------------------------------ 7 */
head("7. วันที่ต้องเป็นเวลาไทย ไม่ใช่ UTC");
{
  // toISOString() คืนเวลา UTC พอเป็นเมืองไทย (UTC+7) ช่วงเที่ยงคืนถึงเจ็ดโมงเช้า
  // จะได้ "เมื่อวาน" ทำให้เอกสารลงวันที่ผิดโดยไม่มีใครสังเกต ต้องใช้ localISO แทน
  const hits = [];
  for (const f of FILES) {
    const s = read(f);
    s.split("\n").forEach((line, i) => {
      if (/toISOString\(\)\.slice\(0,\s*10\)/.test(line) && !/localISO/.test(line)) {
        hits.push(f + ":" + (i + 1));
      }
    });
  }
  if (hits.length) bad("ตัดวันที่จากเวลา UTC ที่: " + hits.join(", "));
  else ok("ไม่มีที่ไหนตัดวันที่จากเวลา UTC");
}

console.log("\n" + (failed ? "พบปัญหา " + failed + " จุด" : "ตรวจผ่านทั้งหมด"));
process.exit(failed ? 1 : 0);
