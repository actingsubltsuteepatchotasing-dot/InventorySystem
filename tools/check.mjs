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

  /**
   * ตัดไฟล์เป็นบล็อกของฟังก์ชันที่เริ่มต้นคอลัมน์ 0 (คอมโพเนนต์แต่ละตัว)
   *
   * ต้องดูทีละฟังก์ชัน ไม่ใช่ทั้งไฟล์รวดเดียว เพราะไฟล์หนึ่งมีหลายคอมโพเนนต์
   * คอมโพเนนต์ A เรียก useToast() ไว้ ไม่ได้แปลว่าคอมโพเนนต์ B ในไฟล์เดียวกันมี toast ใช้
   * (บั๊กจริงที่เจอ: แท็บใบตรวจนับในหน้ารายงานส่ง toast={toast} โดยไม่ได้รับ prop นั้นมา
   *  การตรวจแบบทั้งไฟล์มองไม่เห็น เพราะคอมโพเนนต์หลักในไฟล์เดียวกันประกาศ toast ไว้)
   */
  function blocksOf(src) {
    const lines = src.split("\n");
    const out = [];
    let cur = null;

    // ไม่นับปีกกาหาจุดจบ เพราะปีกกาที่อยู่ในข้อความหรือใน JSX จะทำให้นับเพี้ยน
    // แล้วทั้งไฟล์จะกลายเป็นบล็อกเดียว ซึ่งเท่ากับกลับไปตรวจแบบทั้งไฟล์เหมือนเดิม
    // ใช้ "จบเมื่อเจอประกาศตัวถัดไปที่เริ่มคอลัมน์ 0" แทน ซึ่งตรงกับรูปแบบของโปรเจกต์นี้
    const START = /^(export\s+default\s+)?(export\s+)?(async\s+)?function\s+[A-Za-z_$]/;
    const NEXT = /^(export\b|const\b|let\b|var\b|class\b|function\b|async\s+function\b)/;

    lines.forEach((line, i) => {
      if (cur && NEXT.test(line)) {
        out.push(cur);
        cur = null;
      }
      if (!cur && START.test(line)) cur = { start: i, text: "" };
      if (cur) cur.text += line + "\n";
    });
    if (cur) out.push(cur);
    return out;
  }

  let n = 0;
  for (const f of FILES) {
    const s = read(f);

    const blocks = blocksOf(s);

    // ชื่อระดับไฟล์ = ทุกอย่างที่เหลือหลังตัดตัวฟังก์ชันออกไป
    //
    // ตัดด้วยการลบ "ตัวฟังก์ชัน" ทิ้ง ไม่ใช่กรองเอาเฉพาะบรรทัดที่ขึ้นต้นคอลัมน์ 0
    // เพราะการกรองแบบนั้นพลาดสองทาง: import หลายบรรทัดจะเหลือแค่บรรทัด "import {"
    // และบรรทัด signature อย่าง function Foo({ toast }) จะทำให้ toast
    // กลายเป็นชื่อระดับไฟล์ ซึ่งเป็นเหตุผลที่บั๊กจริงหลุดการตรวจไปตั้งแต่แรก
    let rest = s;
    blocks.forEach((b) => {
      rest = rest.replace(b.text, "\n");
    });
    const moduleLevel = declared(rest);

    for (const b of blocks) {
      const have = new Set([...moduleLevel, ...declared(b.text)]);
      for (const m of b.text.matchAll(/\s([a-zA-Z][\w]*)=\{([A-Za-z_$][\w$]*)\}/g)) {
        const used = m[2];
        if (GLOBALS.has(used) || have.has(used)) continue;
        n++;
        const line = b.start + b.text.slice(0, m.index).split("\n").length;
        bad(f + ":" + line + " ใช้ " + m[1] + "={" + used + "} แต่ไม่ได้ประกาศไว้ในฟังก์ชันนี้");
      }
    }
  }
  if (!n) ok("ไม่พบ prop ที่ส่งชื่อที่ไม่มีอยู่จริง (ตรวจแยกทีละฟังก์ชัน)");
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
    // ท้ายบรรทัดก็นับด้วย เพราะช่องที่มี attribute หลายตัวจะเขียน <td ไว้บรรทัดเดียวโดด ๆ
    // แล้วขึ้นบรรทัดใหม่ให้ attribute ซึ่งเป็นรูปแบบที่ prettier จัดให้เอง
    const open = new RegExp("<" + tag + "([\\s>/]|$)");
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

  // รับตัวเลขในรหัสหน้าจอด้วย (เช่น cust360) ไม่งั้นหน้าจอนั้นหลุดจากการตรวจทั้งหมด
  const navIds = [...shell.matchAll(/\{ id: "(\w+)", Icon/g)].map((m) => m[1]);
  const screenIds = [...constants.matchAll(/\{ id: "(\w+)",\s+group:/g)].map((m) => m[1]);
  const permsScreen = (constants.match(/PERMS_SCREEN\s*=\s*"([^"]+)"/) || [])[1];

  // เมนูที่ไม่มีบรรทัดวาดหน้าจอ = กดแล้วได้หน้าว่างโดยไม่มี error ให้เห็น
  const rendered = [...shell.matchAll(/activeView === "(\w+)"/g)].map((m) => m[1]);
  const noView = navIds.filter((id) => !rendered.includes(id));
  const noNav = rendered.filter((id) => !navIds.includes(id));
  if (noView.length) bad("เมนูที่ไม่มีบรรทัดวาดหน้าจอ: " + noView.join(", "));
  else if (noNav.length) bad("วาดหน้าจอที่ไม่มีในเมนูแล้ว: " + noNav.join(", "));
  else ok("ทุกหน้าจอในเมนูมีบรรทัดวาดครบ (" + rendered.length + " หน้า)");

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

  /*
   * ชื่อกลุ่มต้องเป็นข้อความเดียวกันทั้งในเมนูและในตารางสิทธิ
   * ถ้าไม่ตรง คนตั้งสิทธิจะหากลุ่มไม่เจอ เพราะสองหน้าเรียกชื่อคนละอย่าง
   * และไม่มีอะไรฟ้อง เพราะสองหน้านั้นอ่านคนละไฟล์กัน
   */
  const navGroups = [
    ...new Set([...shell.matchAll(/^    group: "([^"]+)",$/gm)].map((m) => m[1])),
  ];
  const permGroups = [
    ...new Set([...constants.matchAll(/group: "([^"]+)"/g)].map((m) => m[1])),
  ];
  const onlyNav = navGroups.filter((g) => !permGroups.includes(g));
  const onlyPerm = permGroups.filter((g) => !navGroups.includes(g));
  if (onlyNav.length || onlyPerm.length) {
    bad(
      "ชื่อกลุ่มในเมนูกับในตารางสิทธิไม่ตรงกัน" +
        (onlyNav.length ? " · มีแต่ในเมนู: " + onlyNav.join(", ") : "") +
        (onlyPerm.length ? " · มีแต่ในตารางสิทธิ: " + onlyPerm.join(", ") : "")
    );
  } else {
    ok("ชื่อกลุ่มตรงกันทั้งเมนูและตารางสิทธิ (" + navGroups.length + " กลุ่ม)");
  }

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

/* ------------------------------------------------------------------ 8 */
head("8. ตัวแปรสีใน CSS ถูกประกาศไว้จริง");
{
  // var(--ชื่อที่ไม่มีอยู่) ไม่ทำให้อะไรพัง เบราว์เซอร์แค่ข้ามบรรทัดนั้นไปเงียบ ๆ
  // ผลคือพื้นหลังหายไปทั้งกล่องโดยไม่มีใครรู้จนกว่าจะเปิดหน้าจอนั้นมาดูเอง
  const css = read("app/globals.css");
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

  // บางตัวถูกกำหนดจาก JS ผ่าน style={{ "--c": ... }} ไม่ได้ประกาศใน CSS
  const inline = new Set();
  for (const f of FILES) {
    for (const m of read(f).matchAll(/"(--[\w-]+)":/g)) inline.add(m[1]);
  }

  // var(--x, ค่าสำรอง) ไม่พังถ้าไม่มี จึงตรวจเฉพาะแบบที่ไม่มีค่าสำรอง
  const missing = [
    ...new Set(
      [...css.matchAll(/var\((--[\w-]+)\)/g)]
        .map((m) => m[1])
        .filter((v) => !defined.has(v) && !inline.has(v))
    ),
  ];
  if (missing.length) bad("ใช้ตัวแปรที่ไม่มีอยู่: " + missing.join(", "));
  else ok("ตัวแปรสีที่ใช้แบบไม่มีค่าสำรอง ถูกประกาศครบ (" + defined.size + " ตัว)");
}

/* ------------------------------------------------------------------ 9 */
head("9. แท็บรายงานใช้ตัวกรองตรงกับที่ประกาศไว้");
{
  // แท็บบอกว่ามีช่องค้นหา แต่คอมโพเนนต์ไม่ได้เอาไปใช้ = ช่องที่พิมพ์แล้วไม่มีอะไรเกิดขึ้น
  // ซึ่งแย่กว่าไม่มีช่องเลย เพราะคนใช้จะสรุปว่า "ค้นแล้วไม่เจอ = ไม่มีข้อมูล"
  const src = read("components/views/Reports.js");

  const COMPONENT = {
    stock: "StockReport", card: "StockCard", count: "CountReport", counts: "CountDocsReport",
    bills: "BillsReport", ship: "ShipReport", products: "ProductsReport", bins: "BinsReport",
    customers: "PartyReport", suppliers: "PartyReport",
    RECEIVE: "TxnReport", ISSUE: "TxnReport", TRANSFER: "TxnReport",
    ADJUST: "TxnReport", SALE: "TxnReport",
    docINVOICE: "DocReport", docPURCHASE: "DocReport", docPURRET: "DocReport",
    crmpipe: "PipelineReport", crmact: "ActivityReport",
    crmwin: "WinLossReport", crmquiet: "QuietReport",
  };

  /** ตัวฟังก์ชัน — ตัดถึง function/const ตัวถัดไปที่เริ่มคอลัมน์ 0 */
  function bodyOf(name) {
    const at = src.indexOf("\nfunction " + name + "(");
    if (at < 0) return "";
    const rest = src.slice(at + 1);
    const end = rest.search(/\n(function|const|export) /);
    return end < 0 ? rest : rest.slice(0, end);
  }

  const tabs = [...src.matchAll(/\{ id: "(\w+)", label: "([^"]+)".*?needs: \[([^\]]*)\]/g)].map(
    (m) => ({
      id: m[1],
      label: m[2],
      needs: m[3].replace(/["\s]/g, "").split(",").filter(Boolean),
    })
  );

  let n = 0;
  tabs.forEach((t) => {
    const comp = COMPONENT[t.id];
    if (!comp) {
      bad("แท็บ " + t.label + " ไม่มีคอมโพเนนต์ผูกไว้");
      n++;
      return;
    }
    const body = bodyOf(comp);
    if (!body) {
      bad("ไม่พบคอมโพเนนต์ " + comp + " ของแท็บ " + t.label);
      n++;
      return;
    }

    const usesMatch = /filter\.match\(/.test(body);
    const usesParty = /filter\.custId|filter\.supId|cfg\.idKey|partyId/.test(body);

    if (t.needs.includes("text") !== usesMatch) {
      bad(
        t.label + " — " +
          (t.needs.includes("text")
            ? "มีช่องค้นหาแต่ " + comp + " ไม่ได้ใช้ filter.match"
            : "ไม่มีช่องค้นหาแต่ " + comp + " ใช้ filter.match")
      );
      n++;
    }
    if ((t.needs.includes("customer") || t.needs.includes("supplier")) && !usesParty) {
      bad(t.label + " — มีช่องเลือกคู่ค้า แต่ " + comp + " ไม่ได้กรองด้วยรหัสคู่ค้า");
      n++;
    }
  });

  if (!n) ok("ทุกแท็บใช้ตัวกรองตรงกับที่ประกาศไว้ (" + tabs.length + " แท็บ)");
}

/* ----------------------------------------------------------------- 10 */
head("10. รายการค่าที่ฐานข้อมูลยอมรับ ตรงกับที่โค้ดประกาศไว้");
{
  // เพิ่มสถานะใหม่ในโค้ดแล้วลืมแก้ check constraint = บันทึกไม่ได้ตอนใช้งานจริง
  // และ error ที่ได้เป็นข้อความของ Postgres ซึ่งอ่านแล้วไม่รู้ว่าต้องไปแก้ตรงไหน
  const sql = read("supabase/schema.sql");
  const constants = read("lib/constants.js");

  /** ค่าใน check (col in ('A', 'B', ...)) ของ constraint ชื่อหนึ่ง */
  const allowedOf = (constraintName) => {
    const m = sql.match(
      // ยอมให้ขึ้นบรรทัดใหม่หลังคำว่า in ได้ ไม่งั้นจะเลยไปจับ constraint ตัวถัดไป
      new RegExp("constraint\\s+" + constraintName + "[\\s\\S]{0,200}?in\\s*\\(([^)]*)\\)")
    );
    return m ? m[1].match(/'([^']+)'/g).map((x) => x.replace(/'/g, "")) : null;
  };

  /** ค่าของ id ในอาร์เรย์ค่าคงที่ชื่อหนึ่ง */
  const idsOf = (name) => {
    const at = constants.indexOf("export const " + name + " = [");
    if (at < 0) return null;
    const body = constants.slice(at, constants.indexOf("\n];", at));
    return [...body.matchAll(/id: "(\w+)"/g)].map((m) => m[1]);
  };

  const compare = (label, allowed, want) => {
    if (!allowed) return bad(label + " — หา check constraint ในฐานข้อมูลไม่เจอ");
    if (!want) return bad(label + " — หาค่าคงที่ในโค้ดไม่เจอ");

    const missing = want.filter((v) => !allowed.includes(v));
    const extra = allowed.filter((v) => !want.includes(v));
    if (missing.length) bad(label + " — ฐานข้อมูลยังไม่ยอมรับ: " + missing.join(", "));
    else if (extra.length) bad(label + " — ฐานข้อมูลยอมรับค่าที่โค้ดไม่มีแล้ว: " + extra.join(", "));
    else ok(label + " ตรงกัน (" + want.join(", ") + ")");
  };

  compare("สถานะการจัดส่งของใบขาย", allowedOf("invoices_ship_status"), idsOf("SHIP_STATUS"));
  compare("สถานะในบันทึกการเดินสถานะ", allowedOf("ship_events_status"), idsOf("SHIP_STATUS"));
  compare("วิธีชำระเงินที่ POS", allowedOf("sales_pay_method_check"), idsOf("PAY_METHODS"));

  // ชนิดรายการเคลื่อนไหวประกาศเป็นอ็อบเจกต์ ไม่ใช่อาร์เรย์ จึงดึงคีย์แทน
  const typesAt = constants.indexOf("export const TYPES = {");
  const types = [
    ...constants.slice(typesAt, constants.indexOf("\n};", typesAt)).matchAll(/^\s{2}(\w+):/gm),
  ].map((m) => m[1]);
  const txnAllowed = (sql.match(/txns_type_check[\s\S]{0,200}?in \(([^)]*)\)/) || [])[1];
  compare(
    "ชนิดรายการเคลื่อนไหว",
    txnAllowed ? txnAllowed.match(/'([^']+)'/g).map((x) => x.replace(/'/g, "")) : null,
    types
  );

  /*
   * รายการค่าของงานลูกค้าสัมพันธ์ ประกาศอยู่ที่ lib/crm.js ไม่ใช่ lib/constants.js
   * (อยู่กับตรรกะที่ใช้มันจริง ๆ) จึงต้องอ่านจากไฟล์นั้นแยกอีกที
   */
  /*
   * หมวดการรับฟังลูกค้าประกาศรายการค่าไว้ที่ lib/voc.js
   * ทุกชุดผูกกับ check constraint ของฐานข้อมูล เพิ่มค่าในโค้ดแล้วลืมแก้ constraint
   * ผลคือกดบันทึกแล้วได้ error ของ Postgres ที่อ่านแล้วไม่รู้ว่าต้องไปแก้ตรงไหน
   * ซึ่งเป็นอาการที่หาต้นเหตุยากที่สุดแบบหนึ่ง
   */
  const vocSrc = read("lib/voc.js");
  const vocIdsOf = (name) => {
    const at = vocSrc.indexOf("export const " + name + " = [");
    if (at < 0) return null;
    const body = vocSrc.slice(at, vocSrc.indexOf("\n];", at));
    return [...body.matchAll(/id: "([\w.]+)"/g)].map((m) => m[1]);
  };

  [
    ["ชนิดช่องทางการรับฟัง", "voc_channels_kind", "CHANNEL_KINDS"],
    ["ความถี่ของช่องทาง", "voc_channels_freq", "FREQUENCIES"],
    ["กลุ่มลูกค้าในเสียงลูกค้า", "voc_records_group", "CUST_GROUPS"],
    ["ช่วงวงจรชีวิต", "voc_records_lifecycle", "LIFECYCLE"],
    ["มิติของความต้องการ", "voc_records_dimension", "DIMENSIONS"],
    ["ประเภทของเสียงลูกค้า", "voc_records_kind", "VOC_KINDS"],
    ["ระดับความสำคัญ", "voc_records_priority", "PRIORITIES"],
    ["สถานะของเสียงลูกค้า", "voc_records_status", "VOC_STATUS"],
    ["ชนิดการประเมิน", "voc_surveys_kind", "SURVEY_KINDS"],
    ["ความถี่ของรอบประเมิน", "voc_surveys_freq", "FREQUENCIES"],
    ["สถานะรอบประเมิน", "voc_surveys_status", "SURVEY_STATUS"],
    ["กลุ่มลูกค้าในผลประเมิน", "voc_results_group", "CUST_GROUPS"],
    ["มิติในผลประเมิน", "voc_results_dimension", "DIMENSIONS"],
    ["ชนิดของแผนงาน", "voc_actions_kind", "ACTION_KINDS"],
    ["สถานะของแผนงาน", "voc_actions_status", "ACTION_STATUS"],
  ].forEach(([label, cons, name]) => compare(label, allowedOf(cons), vocIdsOf(name)));

  const crm = read("lib/crm.js");
  const crmIdsOf = (name) => {
    const at = crm.indexOf("export const " + name + " = [");
    if (at < 0) return null;
    const body = crm.slice(at, crm.indexOf("\n];", at));
    return [...body.matchAll(/id: "(\w+)"/g)].map((m) => m[1]);
  };

  compare("ขั้นตอนการขาย", allowedOf("crm_deals_stage"), crmIdsOf("STAGES"));
  compare("ชนิดการติดต่อ", allowedOf("crm_activities_kind"), crmIdsOf("ACT_KINDS"));
  compare("สถานะลูกค้าเป้าหมาย", allowedOf("crm_leads_status"), crmIdsOf("LEAD_STATUS"));

  // สถานะตั้งต้นของใบใหม่ ต้องเป็นค่าเดียวกันทั้งในโค้ด ในนิยามตาราง และในฟังก์ชันสร้างใบ
  const start = (constants.match(/SHIP_START = "(\w+)"/) || [])[1];
  const tableDefault = (sql.match(/ship_status\s+text not null default '(\w+)'/) || [])[1];
  const alterDefault = (sql.match(/alter column ship_status set default '(\w+)'/) || [])[1];
  const rpcDefault = (sql.match(/coalesce\(p_inv ->> 'ship_status', '(\w+)'\)/) || [])[1];

  if (start && tableDefault === start && alterDefault === start && rpcDefault === start) {
    ok("สถานะตั้งต้นของใบใหม่ตรงกันทุกที่ (" + start + ")");
  } else {
    bad(
      "สถานะตั้งต้นไม่ตรงกัน — โค้ด: " + start + " · นิยามตาราง: " + tableDefault +
        " · ค่าตั้งต้นที่ตั้งทีหลัง: " + alterDefault + " · ฟังก์ชันสร้างใบ: " + rpcDefault
    );
  }
}

/* ----------------------------------------------------------------- 11 */
head("11. ทุกคอลัมน์ในฐานข้อมูลมีตัวแปลงอ่านและเขียน");
{
  // ข้อ 6 ดูแค่ระดับ "ตาราง" ว่า api.js รู้จักไหม
  // เพิ่มคอลัมน์ใหม่แล้วลืมแก้ตัวแปลง = ค่านั้นหายไปเงียบ ๆ ทั้งขาอ่านและขาบันทึก
  const sql = read("supabase/schema.sql");
  const api = read("lib/api.js");
  const AUTO = new Set(["created_at"]); // ฐานข้อมูลเติมให้เอง
  // คอลัมน์ที่ฐานข้อมูลออกให้ตอน insert — อ่านได้ แต่ไม่ต้องมีตัวแปลงเขียนกลับ
  // ถ้าส่งกลับไปด้วยจะทับเลขที่ sequence ออกให้ ซึ่งทำให้เลขซ้ำได้
  const READ_ONLY = new Set(["row_order"]);

  const tables = {};
  for (const m of sql.matchAll(/create table if not exists public\.(\w+) \(([\s\S]*?)\n\);/g)) {
    const cols = [];
    m[2].split("\n").forEach((line) => {
      const t = line.trim();
      if (!t || t.startsWith("--") || t.startsWith("(")) return;
      if (/^(constraint|primary key|unique|foreign key|check|or|and)\b/i.test(t)) return;
      const name = t.split(/\s+/)[0];
      if (/^[a-z_][a-z0-9_]*$/.test(name)) cols.push(name);
    });
    tables[m[1]] = cols;
  }
  for (const m of sql.matchAll(/alter table public\.(\w+) add column if not exists (\w+)/g)) {
    if (tables[m[1]] && !tables[m[1]].includes(m[2])) tables[m[1]].push(m[2]);
  }

  let n = 0;
  let cols = 0;
  Object.keys(tables).forEach((t) => {
    tables[t].forEach((col) => {
      if (AUTO.has(col)) return;
      cols++;
      const readOk = new RegExp("\\br\\." + col + "\\b").test(api);
      const writeOk =
        new RegExp("(^|[\\s{,])" + col + ":").test(api) || new RegExp('"' + col + '"').test(api);
      if (!readOk) {
        bad(t + "." + col + " — ไม่มีตัวแปลงอ่านค่าออกมา");
        n++;
      } else if (!writeOk && !READ_ONLY.has(col)) {
        bad(t + "." + col + " — อ่านได้แต่ไม่มีตัวแปลงเขียนกลับ");
        n++;
      }
    });
  });
  if (!n) ok("มีตัวแปลงครบ " + cols + " คอลัมน์ ใน " + Object.keys(tables).length + " ตาราง");

  // ตารางใหม่ที่ลืมใส่ในลูป row_order = ตารางนั้นไม่มีเลขลำดับแถว ทั้งที่ที่เหลือมีหมด
  const roAt = sql.indexOf("do $row_order$");
  const roBlock = sql.slice(roAt, sql.indexOf("$row_order$;", roAt));
  const noRowOrder = Object.keys(tables).filter((t) => !roBlock.includes("'" + t + "'"));
  if (noRowOrder.length) bad("ตารางที่ยังไม่มีเลขลำดับแถว: " + noRowOrder.join(", "));
  else ok("ทุกตารางมีเลขลำดับแถว (row_order) ครบ " + Object.keys(tables).length + " ตาราง");
}

/* ----------------------------------------------------------------- 12 */
head("12. ค่าที่ store แจกให้หน้าจอ อยู่ใน deps ครบ");
{
  // ฟังก์ชันที่ไม่อยู่ใน deps จะถูกหน้าจอถือค้างไว้เป็นรุ่นเก่า
  // แล้วเขียนทับข้อมูลด้วยค่าที่หมดอายุ ซึ่งเป็นบั๊กที่หาต้นตอยากที่สุดแบบหนึ่ง
  const s = read("lib/store.js");
  const at = s.indexOf("const value = useMemo(");
  const block = s.slice(at, s.indexOf("\n  );", at));
  const depsAt = block.lastIndexOf("[");
  const body = block.slice(0, depsAt);
  const deps = block
    .slice(depsAt)
    .replace(/[[\]\n]/g, " ")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  const cbs = [...s.matchAll(/const (\w+) = useCallback\(/g)].map((m) => m[1]);
  const used = cbs.filter((c) => new RegExp("(^|[\\s{,:])" + c + "([\\s,}]|$)").test(body));
  const missing = used.filter((c) => !deps.includes(c));
  const stale = deps.filter((d) => cbs.includes(d) && !used.includes(d));

  if (missing.length) bad("แจกให้หน้าจอแต่ไม่อยู่ใน deps: " + missing.join(", "));
  else if (stale.length) bad("อยู่ใน deps แต่ไม่ได้แจกออกไปแล้ว: " + stale.join(", "));
  else ok("ครบและไม่มีของค้าง (" + used.length + " ตัว)");
}

/* ----------------------------------------------------------------- 13 */
head("13. หน้าจอที่บันทึกข้อมูล ปิดปุ่มตามสิทธิ");
{
  // ตั้งสิทธิไว้แล้วปุ่มยังกดได้ อันตรายกว่าไม่มีระบบสิทธิเลย เพราะคนตั้งค่าเชื่อว่าปิดแล้ว
  const WRITES = [
    "addTxns", "saveProduct", "removeProduct", "saveWarehouse", "removeWarehouse",
    "saveDocGroup", "saveCustomer", "removeCustomer", "saveCompany", "addInvoice",
    "setInvoiceShip", "savePerms", "saveSupplier", "removeSupplier", "addPurchase",
    "addPurchaseReturn", "addCount", "setCounted", "closeCount", "removeCount",
    "saveLocation", "removeLocation", "savePlacement", "removePlacement", "addSale",
    "importAll", "resetSeed", "rebuildPlacements", "saveSqlConn", "removeSqlConn",
  ];

  const dir = "components/views";
  let n = 0;
  let screens = 0;

  for (const name of fs.readdirSync(path.join(ROOT, dir))) {
    if (!name.endsWith(".js")) continue;
    // หน้ากำหนดสิทธิเป็นข้อยกเว้นที่ตั้งใจ ถ้าปิดตัวเองได้จะล็อกคนตั้งค่าออกถาวร
    if (name === "Permissions.js") continue;

    const src = read(path.join(dir, name));
    if (!WRITES.some((w) => new RegExp("inv\\." + w + "\\(").test(src))) continue;
    screens++;

    if (!/const perm = inv\.perm\(/.test(src)) {
      bad(name + " บันทึกข้อมูลได้แต่ไม่ได้อ่านสิทธิของหน้าจอ");
      n++;
    } else if (!/!perm\.edit/.test(src)) {
      bad(name + " อ่านสิทธิแล้วแต่ไม่มีปุ่มไหนปิดตามสิทธิเลย");
      n++;
    }
  }
  if (!n) ok("ปิดปุ่มตามสิทธิครบ (" + screens + " หน้า)");
}

/* ----------------------------------------------------------------- 14 */
head("14. ชุดข้อมูลนำเข้า Excel ครบถ้วนและบันทึกได้จริง");
{
  // ชุดที่ไม่มีโค้ดบันทึก = เลือกได้ กรอกได้ กดอัพโหลดแล้วขึ้น error ตอนท้าย
  // ซึ่งเสียเวลาคนที่ทำไฟล์มาทั้งไฟล์แล้ว
  const sets = read("lib/importSets.js");
  const view = read("components/views/DataImport.js");
  const constants = read("lib/constants.js");

  const screens = [...constants.matchAll(/\{ id: "(\w+)",\s+group:/g)].map((m) => m[1]);
  const ids = [...sets.matchAll(/^    id: "(\w+)",$/gm)].map((m) => m[1]);
  const targets = [...sets.matchAll(/^    screen: "(\w+)",$/gm)].map((m) => m[1]);
  // ตัวกันซ้ำบอกได้สองแบบ: ช่องเดียว (key) หรือหลายช่องรวมกัน (keyFields)
  const keys = [...sets.matchAll(/^    (?:key|keyFields): /gm)].map((m) => m[0]);

  let n = 0;
  if (ids.length !== targets.length || ids.length !== keys.length) {
    bad("ชุดข้อมูลบางชุดไม่ได้บอกหน้าจอปลายทางหรือตัวกันซ้ำ");
    n++;
  }

  targets.forEach((t, i) => {
    if (!screens.includes(t)) {
      bad("ชุด " + ids[i] + " ผูกกับหน้าจอ " + t + " ที่ไม่มีในระบบ");
      n++;
    }
  });

  ids.forEach((id) => {
    if (!new RegExp('set\\.id === "' + id + '"').test(view)) {
      bad("ชุด " + id + " ไม่มีโค้ดบันทึกในหน้านำเข้า");
      n++;
    }
  });

  // ทุกช่องที่ใช้เป็นกุญแจ ต้องเป็นช่องที่มีอยู่จริงในชุดนั้น
  // ไม่งั้นกุญแจจะว่างเปล่าเสมอ แล้วทุกแถวจะถูกมองว่าซ้ำกันหมด
  sets.split(/^  \{$/m).slice(1).forEach((b) => {
    const id = (b.match(/id: "(\w+)"/) || [])[1] || "(ไม่ทราบ)";
    const fields = [...b.matchAll(/\{ id: "(\w+)", name:/g)].map((m) => m[1]);
    const single = (b.match(/^    key: "(\w+)",$/m) || [])[1];
    const multi = (b.match(/^    keyFields: \[([^\]]*)\],$/m) || [])[1];

    if (single && !fields.includes(single)) {
      bad("ชุด " + id + " ใช้ช่อง " + single + " เป็นตัวกันซ้ำ แต่ไม่มีช่องนั้นในชุด");
      n++;
    }
    if (multi) {
      const list = (multi.match(/"(\w+)"/g) || []).map((x) => x.replace(/"/g, ""));
      const gone = list.filter((f) => !fields.includes(f));
      if (gone.length) {
        bad("ชุด " + id + " ใช้ช่องที่ไม่มีอยู่เป็นตัวกันซ้ำ: " + gone.join(", "));
        n++;
      }
    }
    if (!single && !multi) {
      bad("ชุด " + id + " ไม่ได้บอกว่าใช้อะไรกันซ้ำ");
      n++;
    }
  });

  if (new Set(ids).size !== ids.length) {
    bad("รหัสชุดข้อมูลซ้ำกัน");
    n++;
  }

  if (!n) ok("ทุกชุดผูกกับหน้าจอจริงและบันทึกได้ครบ (" + ids.length + " ชุด)");
}

/* ----------------------------------------------------------------- 15 */
head("15. การ์ดบนแดชบอร์ดประกาศครบและหน้าจอวาดได้");
{
  // การ์ดที่ใช้ชนิดหรือความกว้างที่หน้าจอไม่รู้จัก = ติ๊กเลือกได้แต่เลือกแล้วไม่มีอะไรขึ้น
  const lib = read("lib/dashWidgets.js");
  const view = read("components/views/Dashboard.js");

  const ids = [...lib.matchAll(/^        id: "(\w+)",$/gm)].map((m) => m[1]);
  const sizes = [...lib.matchAll(/^        size: "(\w+)",$/gm)].map((m) => m[1]);
  const names = [...lib.matchAll(/^        name: "([^"]+)",$/gm)].map((m) => m[1]);
  const builds = (lib.match(/^        build: \(c\) => /gm) || []).length;
  const kinds = [...new Set([...lib.matchAll(/kind: "(\w+)"/g)].map((m) => m[1]))];

  const OK_SIZES = ["kpi", "half", "full"];
  let n = 0;

  if (ids.length !== sizes.length || ids.length !== names.length || ids.length !== builds) {
    bad(
      "การ์ดบางใบประกาศไม่ครบ — รหัส " + ids.length + " · ชื่อ " + names.length +
        " · ความกว้าง " + sizes.length + " · ตัวคำนวณ " + builds
    );
    n++;
  }

  if (new Set(ids).size !== ids.length) {
    bad("รหัสการ์ดซ้ำกัน");
    n++;
  }

  const badSize = sizes.filter((s) => !OK_SIZES.includes(s));
  if (badSize.length) {
    bad("ความกว้างที่ระบบไม่รู้จัก: " + [...new Set(badSize)].join(", "));
    n++;
  }

  // ทุกชนิดที่ lib คายออกมา หน้าจอต้องมีสาขาไว้วาด
  kinds.forEach((k) => {
    if (!new RegExp('d\\.kind === "' + k + '"').test(view)) {
      bad("การ์ดคืนชนิด " + k + " แต่หน้าจอไม่มีตัววาด");
      n++;
    }
  });

  if (!n) {
    ok("การ์ด " + ids.length + " ใบ · ชนิดที่วาดได้ " + kinds.length + " ชนิด");
  }
}

head("16. ฟอร์มพิมพ์ที่ออกแบบเองใช้ได้จริงทุกจุด");
{
  // ฟอร์มที่มีคอลัมน์ซึ่งหาค่าไม่ได้ หรือชนิดเอกสารที่ฐานข้อมูลไม่ยอมรับ
  // จะบันทึกได้ในหน้าจอ แต่ไปพังตอนสั่งพิมพ์ ซึ่งรู้ตอนกระดาษออกมาเปล่าแล้ว
  const lib = read("lib/printForms.js");
  const sql = read("supabase/schema.sql");
  let n = 0;

  const colBlock = (lib.match(/export const FORM_COLUMNS = \[([\s\S]*?)\n\];/) || ["", ""])[1];
  const colIds = [...colBlock.matchAll(/id: "(\w+)"/g)].map((m) => m[1]);
  const values = (colBlock.match(/value: \(/g) || []).length;
  if (colIds.length !== values) {
    bad("คอลัมน์ " + colIds.length + " แบบ แต่มีวิธีหาค่า " + values + " ตัว");
    n++;
  }
  if (new Set(colIds).size !== colIds.length) {
    bad("รหัสคอลัมน์ในฟอร์มซ้ำกัน");
    n++;
  }

  // คอลัมน์ที่ฟอร์มมาตรฐานเลือกไว้ต้องมีอยู่จริง ไม่งั้นฟอร์มตั้งต้นก็พังเอง
  const defCols = ((lib.match(/columns: \[([^\]]*)\]/) || ["", ""])[1])
    .split(",")
    .map((x) => x.trim().replace(/"/g, ""))
    .filter(Boolean);
  const missing = defCols.filter((c) => !colIds.includes(c));
  if (missing.length) {
    bad("ฟอร์มมาตรฐานใช้คอลัมน์ที่ไม่มีอยู่: " + missing.join(", "));
    n++;
  }

  // ชนิดเอกสารที่ออกแบบฟอร์มได้ ต้องตรงกับที่ฐานข้อมูลยอมรับเป๊ะ ๆ
  const kinds = [...lib.matchAll(/\{ id: "(\w+)", name: "[^"]+", party:/g)].map((m) => m[1]);
  const sqlKinds = ((sql.match(/print_forms_kind check \(doc_kind in \(([^)]*)\)/) || ["", ""])[1])
    .split(",")
    .map((x) => x.trim().replace(/'/g, ""))
    .filter(Boolean);
  if (kinds.slice().sort().join() !== sqlKinds.slice().sort().join()) {
    bad("ชนิดเอกสารไม่ตรงกัน — โค้ด: " + kinds.join(",") + " · ฐานข้อมูล: " + sqlKinds.join(","));
    n++;
  }

  // ทุกหน้าจอที่พิมพ์เอกสารการค้าต้องเลือกฟอร์มด้วยกติกาเดียวกัน
  // ถ้าหน้าไหนวาดเองตรง ๆ ฟอร์มที่ผู้ใช้ออกแบบไว้จะไม่ถูกใช้เฉพาะหน้านั้น
  [
    ["components/views/SalesInvoice.js", "INVOICE"],
    ["components/views/PurchaseInvoice.js", "PURCHASE"],
    ["components/views/PurchaseReturn.js", "PURRET"],
  ].forEach(([file, kind]) => {
    const src = read(file);
    if (!src.includes('resolveForm(db, "' + kind + '"')) {
      bad(file + " ไม่ได้เลือกฟอร์มด้วย resolveForm ของชนิด " + kind);
      n++;
    }
    if (!src.includes("<TradeDocBody")) {
      bad(file + " ไม่ได้ใช้ตัววาดเดียวกับหน้าออกแบบฟอร์ม");
      n++;
    }
    if (!src.includes('<FormPick kind="' + kind + '"')) {
      bad(file + " ไม่มีตัวเลือกฟอร์มตอนพิมพ์");
      n++;
    }
  });

  // ตัวอย่างบนจอกับกระดาษจริงต้องใช้กฎ CSS ชุดเดียวกัน ไม่ใช่เขียนแยกกันสองชุด
  const css = read("app/globals.css");
  const shared = (css.match(/#printRoot [^,{]*, \.pf-paper /g) || []).length;
  if (shared < 10) {
    bad("กฎหน้าตาเอกสารที่ใช้ร่วมกับกรอบตัวอย่างมีแค่ " + shared + " ข้อ — ตัวอย่างจะเพี้ยนจากกระดาษจริง");
    n++;
  }

  if (!n) {
    ok(
      "คอลัมน์ " + colIds.length + " แบบ · ชนิดเอกสาร " + kinds.length +
        " ชนิดตรงกับฐานข้อมูล · ทุกหน้าที่พิมพ์เลือกฟอร์มด้วยกติกาเดียวกัน"
    );
  }
}

head("17. ไม่มีชื่อซ้ำที่ทำให้ทั้งไฟล์ใช้ไม่ได้");
{
  /*
   * ประกาศชื่อเดิมซ้ำในไฟล์เดียวกัน = SyntaxError ทั้งไฟล์
   *   "Identifier 'x' has already been declared"
   * ไม่ใช่แค่ฟังก์ชันนั้นพัง แต่ทุกหน้าจอที่ import ไฟล์นั้นพังตามหมด
   * และถ้าเป็นตอน build บนเซิร์ฟเวอร์ จะ build ไม่ผ่าน เว็บที่ใช้งานอยู่จะค้าง
   * อยู่กับรุ่นเก่า ฟีเจอร์ใหม่ที่เขียนไปแล้วจึงไม่โผล่ ทั้งที่โค้ดมีอยู่จริง
   * (เกิดขึ้นจริงกับ salesReady ที่ประกาศสองความหมายใน lib/api.js — ดูรอบ 73)
   *
   * ส่วนคีย์ซ้ำในวัตถุเดียวกันไม่ใช่ error แต่ตัวหลังทับตัวหน้าเงียบ ๆ
   * ซึ่งอันตรายกว่า เพราะไม่มีอะไรเตือนเลย
   */
  const files = [...walk("lib"), ...walk("components")];
  let n = 0;

  files.forEach((rel) => {
    const src = read(rel);

    const names = [...src.matchAll(/^(?:export )?(?:const|let|function|class) (\w+)/gm)].map(
      (m) => m[1]
    );
    const dup = [...new Set(names.filter((x, i) => names.indexOf(x) !== i))];
    if (dup.length) {
      bad(rel + " ประกาศชื่อซ้ำในไฟล์เดียวกัน: " + dup.join(", "));
      n++;
    }
  });

  // คีย์ซ้ำในวัตถุที่ store แจกให้หน้าจอ — ตัวหลังทับตัวหน้าโดยไม่มีใครรู้
  const store = read("lib/store.js");
  // เอาเฉพาะตัววัตถุ ไม่รวมรายการ deps ที่ต่อท้าย ไม่งั้นชื่อเดียวกันจะถูกนับเป็นซ้ำ
  const from = store.indexOf("const value = ");
  const END = String.fromCharCode(10) + "    }),";
  const valueObj = store.slice(from, store.indexOf(END, from));
  const keys = [...valueObj.matchAll(/^ {6}(\w+)[:,]/gm)].map((m) => m[1]);
  const dupKeys = [...new Set(keys.filter((x, i) => keys.indexOf(x) !== i))];
  if (dupKeys.length) {
    bad("lib/store.js แจกค่าชื่อซ้ำให้หน้าจอ (ตัวหลังทับตัวหน้า): " + dupKeys.join(", "));
    n++;
  }

  if (!n) {
    ok("ตรวจ " + files.length + " ไฟล์ · ค่าที่ store แจก " + keys.length + " ตัว ไม่มีชื่อซ้ำ");
  }
}

head("18. คู่มือการใช้งานครอบคลุมทุกหน้าจอ");
{
  /*
   * คู่มือที่ตามโค้ดไม่ทันคือข้อมูลผิดที่คนเชื่อ ซึ่งแย่กว่าไม่มีคู่มือ
   * เพิ่มหน้าจอใหม่แล้วลืมเขียนคู่มือ ตรวจตรงนี้จะไม่ผ่าน
   * และลิงก์ในคู่มือที่ชี้ไปหน้าที่ไม่มีอยู่จริง กดแล้วจะไม่มีอะไรเกิดขึ้น
   */
  const guide = read("lib/guide.js");
  const constants = read("lib/constants.js");
  let n = 0;

  const screens = [...constants.matchAll(/\{ id: "(\w+)",\s+group:/g)].map((m) => m[1]);
  const permsScreen = (constants.match(/PERMS_SCREEN\s*=\s*"([^"]+)"/) || [])[1];
  const all = permsScreen && !screens.includes(permsScreen) ? [...screens, permsScreen] : screens;

  // รหัสหน้าจอที่คู่มือเขียนถึง — คีย์ของ GUIDES อยู่ต้นบรรทัดที่เยื้องสองช่อง
  const body = guide.slice(guide.indexOf("export const GUIDES = {"));
  const documented = [...body.matchAll(/^  (\w+): \{$/gm)].map((m) => m[1]);

  const missing = all.filter((id) => !documented.includes(id));
  if (missing.length) {
    bad("หน้าจอที่ยังไม่มีคู่มือ: " + missing.join(", "));
    n++;
  }

  const extra = documented.filter((id) => !all.includes(id));
  if (extra.length) {
    bad("คู่มือเขียนถึงหน้าจอที่ไม่มีแล้ว: " + extra.join(", "));
    n++;
  }

  // ทุกหน้าจอในคู่มือต้องมีครบสี่ส่วน ไม่งั้นการ์ดจะโหว่
  const blocks = [...body.matchAll(/^  (\w+): \{([\s\S]*?)^  \},$/gm)];
  const thin = blocks
    .filter(([, , b]) => !/what:/.test(b) || !/how: \[/.test(b) || !/from:/.test(b) || !/next:/.test(b))
    .map(([, id]) => id);
  if (thin.length) {
    bad("คู่มือไม่ครบส่วน (ต้องมี what / how / from / next): " + thin.join(", "));
    n++;
  }

  // ลิงก์ทุกเส้นต้องชี้ไปหน้าจอที่มีอยู่จริง
  const linked = new Set();
  [...guide.matchAll(/(?:from|next): \[([^\]]*)\]/g)].forEach((m) => {
    m[1].split(",").map((x) => x.trim().replace(/"/g, "")).filter(Boolean).forEach((x) => linked.add(x));
  });
  [...guide.matchAll(/screen: "(\w+)"/g)].forEach((m) => linked.add(m[1]));

  const broken = [...linked].filter((id) => !all.includes(id));
  if (broken.length) {
    bad("ลิงก์ในคู่มือชี้ไปหน้าจอที่ไม่มีอยู่จริง: " + broken.join(", "));
    n++;
  }

  // สายงานต้องมีขั้นตอนจริง ไม่ใช่ประกาศชื่อไว้เฉย ๆ
  const flows = [...guide.matchAll(/\n    id: "(\w+)",\n    name: "([^"]+)"/g)].map((m) => m[2]);
  const stepCount = (guide.match(/\{ screen: "/g) || []).length;
  if (!flows.length || stepCount < flows.length * 3) {
    bad("สายงานมี " + flows.length + " สาย แต่มีขั้นตอนรวมแค่ " + stepCount + " ขั้น");
    n++;
  }

  if (!n) {
    ok(
      "คู่มือครบ " + documented.length + " หน้าจอ · " + flows.length + " สายงาน · " +
        stepCount + " ขั้นตอน · ลิงก์ทุกเส้นชี้ไปหน้าที่มีจริง"
    );
  }
}

head("19. ตราสัญลักษณ์มาจากไฟล์ภาพต้นฉบับไฟล์เดียว");
{
  /*
   * โลโก้เคยถูกวาดเลียนแบบด้วยโค้ด (รูปหลายเหลี่ยมของเปลวไฟกับลูกศร)
   * แล้วไม่เหมือนต้นฉบับสักรอบ ตอนนี้ทุกที่ใช้ไฟล์ภาพจริงที่ผ่าน tools/trim-logo.ps1
   * ตรงนี้จึงเฝ้าสองอย่าง: ที่อยู่ไฟล์ต้องประกาศที่เดียว และไฟล์ที่สร้างไว้ต้องครบและตรงสเปก
   */
  const logo = read("lib/logo.js");
  let n = 0;

  /** อ่านขนาดกับชนิดสีจากหัวไฟล์ PNG (IHDR อยู่ต้นไฟล์เสมอตามข้อกำหนด) */
  const pngInfo = (rel) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return null;
    const b = fs.readFileSync(abs);
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    if (b.length < 33 || sig.some((v, i) => b[i] !== v)) return { broken: true };
    return {
      width: b.readUInt32BE(16),
      height: b.readUInt32BE(20),
      colorType: b[25], // 6 = RGBA (มีชั้นความโปร่งใส)
      bytes: b.length,
    };
  };

  // ---------- ที่อยู่ของไฟล์ต้องประกาศที่เดียว ----------
  const srcOf = (name) => (logo.match(new RegExp("export const " + name + ' = "([^"]+)"')) || [])[1];
  const variants = [
    { name: "LOGO_SRC", label: "ตราเต็มตัวอักษรเขียว" },
    { name: "LOGO_SRC_LIGHT", label: "ตราเต็มตัวอักษรขาว" },
  ];

  const sizes = [];
  for (const v of variants) {
    const src = srcOf(v.name);
    if (!src) {
      bad("lib/logo.js ไม่ได้ประกาศที่อยู่ไฟล์" + v.label + " (" + v.name + ")");
      n++;
      continue;
    }
    const info = pngInfo(path.join("public", src.replace(/^\//, "")));
    if (!info) {
      bad("ไม่พบไฟล์" + v.label + "ที่ public" + src);
      n++;
      continue;
    }
    if (info.broken) {
      bad("public" + src + " ไม่ใช่ไฟล์ PNG ที่อ่านได้");
      n++;
      continue;
    }
    // ต้องมีชั้นความโปร่งใส ไม่งั้นวางบนพื้นสีอะไรก็เห็นเป็นกล่องสี่เหลี่ยม
    if (info.colorType !== 6 && info.colorType !== 4) {
      bad("public" + src + " ไม่มีชั้นความโปร่งใส วางบนพื้นสีแล้วจะเห็นเป็นกล่อง");
      n++;
    }
    sizes.push({ ...v, src, w: info.width, h: info.height });

    // ห้ามไฟล์อื่นเขียนที่อยู่ไว้เอง ไม่งั้นวันเปลี่ยนชื่อไฟล์จะแก้ไม่ครบ
    const hardCoded = FILES.filter(
      (f) => f !== path.join("lib", "logo.js") && read(f).includes('"' + src + '"')
    );
    if (hardCoded.length) {
      bad("มีไฟล์เขียนที่อยู่ของโลโก้ไว้เอง แทนที่จะใช้ " + v.name + ": " + hardCoded.join(", "));
      n++;
    }
  }

  // สองฉบับต้องขนาดเท่ากันเป๊ะ ไม่งั้นสลับไปใช้ฉบับขาวแล้วหน้าจอขยับ
  if (sizes.length === 2 && (sizes[0].w !== sizes[1].w || sizes[0].h !== sizes[1].h)) {
    bad(
      "ตราสองฉบับขนาดไม่เท่ากัน (" + sizes[0].w + "x" + sizes[0].h + " กับ " +
        sizes[1].w + "x" + sizes[1].h + ") สลับฉบับแล้วหน้าจอจะขยับ"
    );
    n++;
  }

  // ---------- สัดส่วนที่ประกาศต้องตรงกับไฟล์จริง ----------
  /*
   * LOGO_RATIO ใช้กันภาพยืดและกันหน้ากระตุกตอนภาพโหลดเสร็จ
   * ถ้าเปลี่ยนไฟล์ภาพแล้วลืมแก้ตัวเลข ภาพจะยืดโดยไม่มีใครฟ้อง จึงเทียบกับหัวไฟล์จริง
   */
  const ratioExpr = (logo.match(/export const LOGO_RATIO = ([\d.]+) \/ ([\d.]+);/) || []).slice(1);
  if (ratioExpr.length !== 2) {
    bad("lib/logo.js ไม่ได้ประกาศสัดส่วนของตรา (LOGO_RATIO) ในรูป กว้าง / สูง");
    n++;
  } else if (sizes.length) {
    const [dw, dh] = ratioExpr.map(Number);
    if (dw !== sizes[0].w || dh !== sizes[0].h) {
      bad(
        "LOGO_RATIO เขียนไว้ " + dw + " / " + dh + " แต่ไฟล์จริงคือ " +
          sizes[0].w + " x " + sizes[0].h + " ภาพจะยืด"
      );
      n++;
    }
  }

  // ---------- ไอคอนแอปต้องครบและขนาดตรง ----------
  /*
   * ไอคอนตัดจากตราเดียวกันด้วย tools/trim-logo.ps1
   * ถ้าไฟล์ไหนหาย ผู้ใช้ที่ติดตั้งเป็นแอปจะได้ไอคอนว่างบนหน้าจอโฮมโดยไม่มีใครรู้
   */
  const icons = [
    ["public/icons/icon-192.png", 192],
    ["public/icons/icon-512.png", 512],
    ["public/icons/icon-maskable-512.png", 512],
    ["app/icon.png", 192],
    ["app/apple-icon.png", 180],
  ];
  for (const [rel, size] of icons) {
    const info = pngInfo(rel);
    if (!info || info.broken) {
      bad("ไม่พบไอคอน " + rel + " (สร้างด้วย tools/trim-logo.ps1)");
      n++;
      continue;
    }
    if (info.width !== size || info.height !== size) {
      bad(rel + " ควรเป็น " + size + "x" + size + " แต่เป็น " + info.width + "x" + info.height);
      n++;
    }
  }

  // ไอคอนที่ประกาศไว้ใน manifest ต้องมีอยู่จริงทุกไฟล์
  const manifest = read("app/manifest.js");
  for (const m of manifest.matchAll(/src: "(\/[^"]+\.png)"/g)) {
    const rel = path.join("public", m[1].replace(/^\//, ""));
    if (!fs.existsSync(path.join(ROOT, rel))) {
      bad("app/manifest.js อ้างไอคอน " + m[1] + " ที่ไม่มีไฟล์อยู่จริง");
      n++;
    }
  }

  // ---------- ไอคอนแท็บ ----------
  const icoPath = path.join(ROOT, "app", "favicon.ico");
  if (!fs.existsSync(icoPath)) {
    bad("ไม่พบ app/favicon.ico");
    n++;
  } else {
    const ico = fs.readFileSync(icoPath);
    // ต้องเช็กความยาวก่อนอ่านทุกครั้ง ไฟล์เสียที่สั้นกว่าหัวไฟล์จะทำให้ตัวตรวจพังเอง
    const count = ico.length >= 6 ? ico.readUInt16LE(4) : 0;
    if (ico.length < 6 || ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1 || count < 1) {
      bad("app/favicon.ico หัวไฟล์ไม่ถูกรูปแบบ เบราว์เซอร์จะไม่แสดงไอคอนแท็บ");
      n++;
    } else if (count < 4) {
      bad("app/favicon.ico มีแค่ " + count + " ขนาด ควรมี 16/32/48/64 ให้แต่ละที่เลือกใช้");
      n++;
    }
  }

  // ---------- ตัวสร้างไอคอนต้องยังอยู่ ----------
  // ไฟล์ปลายทางเป็นไฟล์ไบนารี สร้างใหม่เองด้วยมือไม่ได้ ถ้าสคริปต์หายก็แก้โลโก้ไม่ได้อีก
  if (!fs.existsSync(path.join(ROOT, "tools", "trim-logo.ps1"))) {
    bad("ไม่พบ tools/trim-logo.ps1 ซึ่งเป็นตัวสร้างไฟล์โลโก้และไอคอนทั้งหมด");
    n++;
  }

  if (!n) {
    ok(
      "ตราทุกที่มาจากไฟล์ภาพเดียว · เต็ม " + sizes[0].w + "x" + sizes[0].h +
        " สองฉบับ (เขียว/ขาว) · ไอคอน " + (icons.length + 1) + " ไฟล์ครบและขนาดตรง"
    );
  }
}

head("20. หมวดการรับฟังลูกค้าต่อครบทุกชั้น");
{
  /*
   * หมวดนี้เป็นหัวข้อใหญ่ของตัวเอง มีเจ็ดหน้าจอกับหกตาราง ที่ต้องประกาศตรงกันแปดที่:
   *   เมนู · ตารางสิทธิ · คู่มือ · ตัวเลือกหน้าจอใน Shell ·
   *   schema.sql · lib/api.js · lib/store.js · หน้าสำรองข้อมูล
   * ลืมที่ใดที่หนึ่งแล้วอาการจะต่างกันไปคนละแบบ และบางแบบเงียบมาก
   * (เช่น ลืมใส่ในหน้าสำรองข้อมูล = กู้คืนแล้วข้อมูลทั้งหมวดหายโดยไม่มีใครรู้)
   *
   * ที่สำคัญกว่านั้นคือ "ระดับที่ได้" ต้องคำนวณจากข้อมูลจริง
   * ถ้าจุดตรวจอ้างตัวตรวจที่ไม่มีอยู่ ระบบจะรายงานระดับผิดโดยไม่มีใครรู้
   * ซึ่งอันตรายกว่าไม่มีระบบนี้เลย
   */
  const voc = read("lib/voc.js");
  const shell = read("components/Shell.js");
  const consts = read("lib/constants.js");
  const guide = read("lib/guide.js");
  const api = read("lib/api.js");
  const store = read("lib/store.js");
  const backup = read("components/views/Backup.js");
  const schema = read("supabase/schema.sql");
  let n = 0;

  const SCREENS = ["voc", "vocchan", "vocrec", "vocsurvey", "voclevel", "vocaction", "vocreport"];
  const TABLES = [
    "voc_channels",
    "voc_records",
    "voc_surveys",
    "voc_survey_results",
    "voc_actions",
    "voc_levels",
  ];
  const STORE_KEYS = [
    "vocChannels",
    "vocRecords",
    "vocSurveys",
    "vocResults",
    "vocActions",
    "vocLevels",
  ];

  /* ---------------- หน้าจอต้องประกาศครบทุกที่ ---------------- */
  SCREENS.forEach((id) => {
    if (!new RegExp('id: "' + id + '"').test(shell)) {
      bad("เมนูยังไม่มีหน้าจอ " + id);
      n++;
    }
    if (!new RegExp('id: "' + id + '"').test(consts)) {
      bad("ตารางสิทธิยังไม่มีหน้าจอ " + id);
      n++;
    }
    if (!new RegExp('^  ' + id + ": \\{", "m").test(guide)) {
      bad("คู่มือยังไม่มีหน้าจอ " + id);
      n++;
    }
    if (!new RegExp('activeView === "' + id + '"').test(shell)) {
      bad("Shell ยังไม่ได้เลือกหน้าจอ " + id + " มาแสดง");
      n++;
    }
  });

  // ต้องอยู่ในกลุ่มเมนูของตัวเอง ไม่ปนกับหมวดอื่น
  if (!/group: "การรับฟังลูกค้า \(หมวด 3\)"/.test(shell)) {
    bad("หมวดการรับฟังลูกค้าไม่ได้แยกเป็นกลุ่มเมนูของตัวเอง");
    n++;
  }

  /* ---------------- ตารางต้องประกาศครบทุกชั้น ---------------- */
  TABLES.forEach((t) => {
    if (!new RegExp("create table if not exists public\\." + t + "\\b").test(schema)) {
      bad("schema.sql ยังไม่มีตาราง " + t);
      n++;
    }
    if (!new RegExp("grant all privileges on table public\\." + t + "\\b").test(schema)) {
      bad("schema.sql ยังไม่ได้ GRANT ตาราง " + t + " (403 จะเกิดตอนใช้งานจริง)");
      n++;
    }
    // ต้องอยู่ในทั้งสามรายการ: row_order · RLS · ตารางตรวจผลท้ายไฟล์
    const listed = (schema.match(new RegExp("'" + t + "'", "g")) || []).length;
    if (listed < 3) {
      bad("schema.sql อ้าง " + t + " แค่ " + listed + " ที่ ต้องมีครบทั้ง row_order, RLS และตารางตรวจผล");
      n++;
    }
    if (!new RegExp('"' + t + '"').test(api)) {
      bad("lib/api.js ยังไม่รู้จักตาราง " + t);
      n++;
    }
  });

  STORE_KEYS.forEach((k) => {
    if (!new RegExp("^  " + k + ": \\[\\]", "m").test(store)) {
      bad("lib/store.js ไม่มีค่าตั้งต้นของ " + k + " (หน้าจอจะพังตอนยังโหลดไม่เสร็จ)");
      n++;
    }
    if (!new RegExp('key: "' + k + '"').test(backup)) {
      bad("หน้าสำรองข้อมูลยังไม่มี " + k + " (กู้คืนแล้วข้อมูลส่วนนี้จะหายเงียบ ๆ)");
      n++;
    }
    if (!new RegExp(k + ":").test(api)) {
      bad("lib/api.js ไม่ได้ส่ง " + k + " กลับมาจาก loadAll");
      n++;
    }
  });

  // ตัวเช็คความพร้อมต้องครอบคลุมทุกตาราง ไม่งั้นเปิดหน้าจอมาแล้วพังกลางทาง
  const readyBlock = voc0(api, "export const vocReady", ";");
  TABLES.forEach((t) => {
    if (readyBlock && !readyBlock.includes(t)) {
      bad("vocReady ไม่ได้ตรวจตาราง " + t);
      n++;
    }
  });

  /* ---------------- เกณฑ์ต้องครบและตรวจได้จริง ---------------- */
  const critCount = (voc.match(/^    id: "3\.[12]",$/gm) || []).length;
  if (critCount !== 2) {
    bad("lib/voc.js ต้องมีเกณฑ์ย่อยสองข้อ (3.1 และ 3.2) แต่พบ " + critCount);
    n++;
  }

  const levels = (voc.match(/^        level: [1-5],$/gm) || []).length;
  if (levels !== 10) {
    bad("เกณฑ์ต้องมีข้อละ 5 ระดับ รวม 10 ระดับ แต่พบ " + levels);
    n++;
  }

  // รหัสจุดตรวจต้องไม่ซ้ำ — ซ้ำแล้วผลการยืนยันจะทับกันเพราะตารางใช้ check_id เป็นกุญแจ
  const checkIds = [...voc.matchAll(/\{ id: "(3[12]L[1-5][a-z])"/g)].map((m) => m[1]);
  const dupIds = checkIds.filter((x, i) => checkIds.indexOf(x) !== i);
  if (dupIds.length) {
    bad("รหัสจุดตรวจซ้ำ: " + [...new Set(dupIds)].join(", "));
    n++;
  }
  if (checkIds.length < 30) {
    bad("จุดตรวจมีแค่ " + checkIds.length + " ข้อ ซึ่งน้อยเกินกว่าจะครอบคลุมเกณฑ์ทั้ง 10 ระดับ");
    n++;
  }

  // รหัสต้องตรงกับข้อและระดับที่มันอยู่ ไม่งั้นรายงานจะจัดกลุ่มผิด
  const wrongPlace = [];
  CRIT_BLOCKS(voc).forEach(({ crit, level, ids }) => {
    ids.forEach((id) => {
      if (!id.startsWith(crit.replace(".", "") + "L" + level)) wrongPlace.push(id);
    });
  });
  if (wrongPlace.length) {
    bad("รหัสจุดตรวจไม่ตรงกับข้อหรือระดับที่มันอยู่: " + wrongPlace.join(", "));
    n++;
  }

  // ตัวตรวจอัตโนมัติที่อ้างถึงต้องมีอยู่จริง
  const autoNames = [...voc.matchAll(/auto: "(\w+)"/g)].map((m) => m[1]);
  const declared = new Set([
    ...[...voc.matchAll(/^  (\w+)\(d\) \{/gm)].map((m) => m[1]),
    ...[...voc.matchAll(/^  (\w+): \(d\) =>/gm)].map((m) => m[1]),
  ]);
  const missingAuto = [...new Set(autoNames)].filter((x) => !declared.has(x));
  if (missingAuto.length) {
    bad("จุดตรวจอ้างตัวตรวจที่ไม่มีอยู่จริง: " + missingAuto.join(", "));
    n++;
  }
  const unusedAuto = [...declared].filter((x) => !autoNames.includes(x));
  if (unusedAuto.length) {
    bad("มีตัวตรวจที่เขียนไว้แล้วไม่มีจุดตรวจไหนใช้: " + unusedAuto.join(", "));
    n++;
  }

  /* ---------------- ข้อมูลตั้งต้นต้องตรงกับที่ตกลงไว้ ---------------- */
  const PRODUCTS = [
    "ผลิตภัณฑ์จากยางพารา", "หมอน", "ท้อปเปอร์", "ยางก้อนถ้วย",
    "ยางก้อนแท่ง", "ปุ๋ยเคมี", "ปุ๋ยอินทรีย์", "น้ำหมักชีวภาพ",
  ];
  const missingProd = PRODUCTS.filter((x) => !voc.includes('name: "' + x + '"'));
  if (missingProd.length) {
    bad("รายการผลิตภัณฑ์ขาด: " + missingProd.join(", "));
    n++;
  }

  ["กลุ่มลูกค้าเชิงพาณิชย์", "กลุ่มลูกค้าด้านส่งเสริม"].forEach((g) => {
    if (!voc.includes(g)) {
      bad("รายการกลุ่มลูกค้าขาด: " + g);
      n++;
    }
  });

  // น้ำหนักรวมของหมวดต้องเป็น 10% ตามเกณฑ์
  const weights = [...voc.matchAll(/^    weight: (\d+),$/gm)].map((m) => Number(m[1]));
  const sum = weights.reduce((t, w) => t + w, 0);
  if (sum !== 10) {
    bad("น้ำหนักรวมของหมวดต้องเป็น 10% แต่รวมได้ " + sum);
    n++;
  }

  /* ---------------- รายงานและไฟล์นำเสนอ ---------------- */
  const report = read("lib/vocReport.js");
  const pptx = read("lib/pptx.js");

  // ตัวประกอบ zip ต้องมีชุดเดียว ไม่งั้นวันแก้บั๊กจะแก้ไม่ครบ
  ["lib/xlsx.js", "lib/pptx.js"].forEach((f) => {
    if (!/from "\.\/zip(\.js)?"/.test(read(f))) {
      bad(f + " ไม่ได้ใช้ตัวประกอบ zip จาก lib/zip.js");
      n++;
    }
    if (/^function zip\(/m.test(read(f))) {
      bad(f + " เขียนตัวประกอบ zip ซ้ำ แทนที่จะใช้ของกลาง");
      n++;
    }
  });

  // ไฟล์นำเสนอต้องมีทุกส่วนที่ PowerPoint บังคับ ขาดอันเดียวก็เปิดไม่ขึ้น
  [
    "[Content_Types].xml",
    "_rels/.rels",
    "ppt/presentation.xml",
    "ppt/slideMasters/slideMaster1.xml",
    "ppt/slideLayouts/slideLayout1.xml",
    "ppt/theme/theme1.xml",
  ].forEach((part) => {
    if (!pptx.includes(part)) {
      bad("lib/pptx.js ไม่ได้สร้างส่วนที่ PowerPoint บังคับ: " + part);
      n++;
    }
  });

  // หน้าจอรายงานต้องหยิบตัวเลขจากตัวประกอบกลาง ไม่ใช่คำนวณเอง
  const repScreen = read(path.join("components", "views", "VocReports.js"));
  if (!/from "@\/lib\/vocReport"/.test(repScreen)) {
    bad("หน้าจอรายงานไม่ได้ใช้ตัวประกอบรายงานกลาง ตัวเลขบนจอกับในไฟล์จะไม่ตรงกัน");
    n++;
  }
  if (/assessAll\(/.test(repScreen)) {
    bad("หน้าจอรายงานคำนวณระดับเอง แทนที่จะใช้ผลจาก lib/vocReport.js");
    n++;
  }

  /* ---------------- คู่มือ Word ---------------- */
  /*
   * คู่มือถูกสร้างจากโค้ด ไม่ใช่ไฟล์ Word ที่พิมพ์ทิ้งไว้
   * ถ้าเพิ่มหน้าจอใหม่แล้วลืมเขียนคู่มือ คนใช้จะได้เล่มที่ขาดไปหนึ่งบทโดยไม่มีใครรู้
   * ตรงนี้จึงบังคับให้คู่มือครอบคลุมทุกหน้าจอเสมอ เหมือนที่หมวด 18 ทำกับคู่มือในโปรแกรม
   */
  const manual = read("lib/vocManual.js");
  const docx = read("lib/docx.js");

  SCREENS.forEach((id) => {
    if (!new RegExp('id: "' + id + '"').test(manual)) {
      bad("คู่มือ Word ยังไม่มีบทของหน้าจอ " + id);
      n++;
    }
  });

  // ทุกหน้าจอในคู่มือต้องบอกครบว่าทำอะไร ใครใช้ ใช้ตอนไหน ได้อะไร และตอบเกณฑ์ข้อไหน
  const manualScreens = (manual.match(/^    id: "voc\w*",$/gm) || []).length;
  if (manualScreens !== SCREENS.length) {
    bad("คู่มือ Word มี " + manualScreens + " บท แต่มีหน้าจอ " + SCREENS.length + " หน้า");
    n++;
  }
  ["what:", "who:", "when:", "steps:", "result:", "criteria:"].forEach((key) => {
    const found = (manual.match(new RegExp("^    " + key, "gm")) || []).length;
    if (found !== SCREENS.length) {
      bad("คู่มือ Word มีหัวข้อ " + key.replace(":", "") + " แค่ " + found + " บท จาก " + SCREENS.length);
      n++;
    }
  });

  // ไฟล์คู่มือที่สร้างไว้ในโครงงานต้องมีอยู่จริงและเปิดได้
  const manualPath = path.join(ROOT, "Docs", "คู่มือการรับฟังลูกค้า.docx");
  if (!fs.existsSync(manualPath)) {
    bad("ไม่พบไฟล์ Docs/คู่มือการรับฟังลูกค้า.docx (สร้างด้วย node tools/make-voc-manual.mjs)");
    n++;
  } else {
    const b = fs.readFileSync(manualPath);
    if (b[0] !== 0x50 || b[1] !== 0x4b) {
      bad("Docs/คู่มือการรับฟังลูกค้า.docx ไม่ใช่ไฟล์ zip ที่ถูกต้อง");
      n++;
    } else if (b.length < 20000) {
      bad("Docs/คู่มือการรับฟังลูกค้า.docx เล็กผิดปกติ (" + Math.round(b.length / 1024) + " KB) น่าจะสร้างไม่ครบ");
      n++;
    }
  }

  if (!fs.existsSync(path.join(ROOT, "tools", "make-voc-manual.mjs"))) {
    bad("ไม่พบ tools/make-voc-manual.mjs ซึ่งเป็นตัวสร้างไฟล์คู่มือ");
    n++;
  }

  // ไฟล์ Word ต้องมีทุกส่วนที่ Word บังคับ ขาดอันเดียวก็เปิดไม่ขึ้น
  [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
    "word/styles.xml",
    "word/_rels/document.xml.rels",
  ].forEach((part) => {
    if (!docx.includes(part)) {
      bad("lib/docx.js ไม่ได้สร้างส่วนที่ Word บังคับ: " + part);
      n++;
    }
  });

  // ทุกช่องตารางต้องมีย่อหน้า ไม่งั้น Word ถือว่าไฟล์เสีย — ต้องมีตัวกันไว้ในโค้ด
  if (!/content && content\.length \? content : blank\(\)/.test(docx)) {
    bad("lib/docx.js ไม่ได้กันช่องตารางว่างเปล่า (Word จะฟ้องว่าไฟล์เสีย)");
    n++;
  }

  if (!n) {
    ok(
      "หมวดการรับฟังลูกค้าครบทุกชั้น · " + SCREENS.length + " หน้าจอ · " + TABLES.length +
        " ตาราง · เกณฑ์ 2 ข้อ 10 ระดับ " + checkIds.length + " จุดตรวจ · ตัวตรวจอัตโนมัติ " +
        new Set(autoNames).size + " ตัวมีครบ · คู่มือ Word ครบทุกหน้าจอ"
    );
  }
}

/** ตัดข้อความตั้งแต่คำที่ระบุจนถึงตัวปิด ใช้ดูเนื้อในของฟังก์ชันสั้น ๆ */
function voc0(src, from, until) {
  const at = src.indexOf(from);
  if (at < 0) return "";
  const end = src.indexOf(until, at);
  return end < 0 ? src.slice(at) : src.slice(at, end);
}

/**
 * แตกจุดตรวจของ lib/voc.js ออกเป็นกลุ่มตามข้อและระดับ
 * ใช้ตรวจว่ารหัสจุดตรวจอยู่ถูกที่ (ไม่ใช่ก๊อปมาแล้วลืมแก้เลขระดับ)
 */
function CRIT_BLOCKS(voc) {
  const out = [];
  let crit = "";
  let level = 0;
  voc.split("\n").forEach((line) => {
    const c = line.match(/^    id: "(3\.[12])",$/);
    if (c) {
      crit = c[1];
      return;
    }
    const l = line.match(/^        level: ([1-5]),$/);
    if (l) {
      level = Number(l[1]);
      out.push({ crit, level, ids: [] });
      return;
    }
    const id = line.match(/\{ id: "(3[12]L[1-5][a-z])"/);
    if (id && out.length) out[out.length - 1].ids.push(id[1]);
  });
  return out;
}

console.log("\n" + (failed ? "พบปัญหา " + failed + " จุด" : "ตรวจผ่านทั้งหมด"));
process.exit(failed ? 1 : 0);
