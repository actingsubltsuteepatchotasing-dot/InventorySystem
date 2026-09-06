"use client";

// หน้าจอเชื่อมต่อฐานข้อมูลภายนอก — เก็บค่าการเชื่อมต่อไว้ใช้ซ้ำ
//
// รองรับสามชนิด: SQL Server · MySQL/MariaDB · Microsoft Access
//   แต่ละชนิดต้องการค่าคนละชุด (Access เป็นไฟล์ ไม่มีเครื่องและไม่มีพอร์ต)
//   หน้าจอจึงซ่อนช่องที่ชนิดนั้นไม่ได้ใช้ ไม่ใช่แสดงทุกช่องแล้วให้เดาเอาเองว่าต้องกรอกอันไหน
//
// ต้องพูดให้ตรงตั้งแต่ต้น: เว็บที่รันในเบราว์เซอร์ต่อฐานข้อมูลพวกนี้ตรง ๆ ไม่ได้สักตัว
//   SQL Server พูด TDS บนพอร์ต 1433 · MySQL พูดโปรโตคอลของตัวเองบน 3306
//   ทั้งคู่เป็น TCP ดิบ ซึ่งเบราว์เซอร์เปิดไม่ได้ ทำได้แค่ HTTP กับ WebSocket
//   ส่วน Access เป็นไฟล์บนเครื่อง เว็บก็เปิดไฟล์ในเครื่องคนอื่นไม่ได้เหมือนกัน
//   และเซิร์ฟเวอร์ที่อยู่ในวงแลนของบริษัท เครื่องบนอินเทอร์เน็ตก็ต่อเข้าไปไม่ถึงอยู่ดี
//
// หน้านี้จึงทำสองอย่างที่ทำได้จริงและมีประโยชน์:
//   1. เก็บค่าการเชื่อมต่อไว้ (ชื่อ Server / ฐานข้อมูล / ผู้ใช้ / รหัสผ่าน / ตัวเลือก)
//      บันทึกได้หลายชุด ตั้งค่าเริ่มต้นได้ และคัดลอก connection string ไปใช้ที่อื่นได้
//   2. ทดสอบและใช้งานผ่าน "ตัวเชื่อม" — โปรแกรมเล็ก ๆ ที่ลูกค้ารันไว้ในวงเดียวกับเซิร์ฟเวอร์
//      หน้านี้คุยกับตัวเชื่อมด้วย HTTP ซึ่งเบราว์เซอร์ทำได้ แล้วตัวเชื่อมไปต่อ SQL Server ให้
//      สัญญาการคุยกันบอกไว้บนหน้าจอ จะได้เขียนตัวเชื่อมด้วยภาษาอะไรก็ได้
//
// ทางเลือกที่ไม่เลือก และเหตุผล:
//   ลงไลบรารี mssql/tedious แล้วต่อจากฝั่งเซิร์ฟเวอร์ของแอปนี้ — ทำไม่ได้สองข้อ
//   ข้อแรกโปรเจกต์นี้ไม่เพิ่ม dependency ข้อสองแอปรันบน Vercel ซึ่งอยู่นอกวงแลนลูกค้า
//   ต่อเข้าเครื่องหลังไฟร์วอลล์ไม่ได้อยู่ดี ต่อให้ลงไลบรารีไปก็ยังต้องมีตัวเชื่อมอยู่ดี
//
// รหัสผ่าน: ค่าเริ่มต้นเก็บไว้ในเครื่องที่กรอกเท่านั้น ไม่ขึ้นฐานข้อมูล
//   เพราะทุกคนที่ล็อกอินระบบนี้ได้ อ่านตารางนี้ได้หมด (สิทธิเป็นของทั้งระบบ ไม่แยกรายคน)
//   และรหัสผ่านที่อยู่ในตารางจะติดไปกับไฟล์สำรองข้อมูลด้วย
//   ใครต้องการให้ทุกเครื่องใช้ร่วมกันจริง ๆ ต้องติ๊กเลือกเอง พร้อมคำเตือนบนหน้าจอ

import { useEffect, useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { DB_KINDS, DB_KIND_DEFAULT } from "@/lib/constants";
import { thDateTime, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { Badge, Card, Empty, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

/** ที่เก็บรหัสผ่านเฉพาะเครื่องนี้ — คีย์แยกตามรหัสการเชื่อมต่อ */
const PW_KEY = "ultraerp.sqlpw.";

const readPw = (id) => {
  try {
    return localStorage.getItem(PW_KEY + id) || "";
  } catch (e) {
    return ""; // เบราว์เซอร์ปิด storage — ใช้งานต่อได้ แค่ต้องกรอกรหัสใหม่ทุกครั้ง
  }
};

const writePw = (id, pw) => {
  try {
    if (pw) localStorage.setItem(PW_KEY + id, pw);
    else localStorage.removeItem(PW_KEY + id);
  } catch (e) {
    // เก็บไม่ได้ก็ไม่เป็นไร ค่าที่เหลือยังบันทึกได้ตามปกติ
  }
};

/** ค่าประจำชนิดฐานข้อมูล ไม่รู้จักชนิดไหนก็ถอยไปใช้ตัวแรก */
export const kindOf = (id) => DB_KINDS.find((k) => k.id === id) || DB_KINDS[0];

const BLANK = {
  id: "",
  name: "",
  kind: DB_KIND_DEFAULT,
  server: "",
  port: kindOf(DB_KIND_DEFAULT).port,
  filePath: "",
  database: "",
  login: "",
  encrypt: true,
  trustCert: false,
  bridgeUrl: "",
  note: "",
  isDefault: false,
};

/**
 * ข้อความการเชื่อมต่อของชนิดนั้น ๆ เอาไปวางในโปรแกรมอื่นได้เลย
 *
 * ไม่ใส่รหัสผ่านจริงลงไป เพราะข้อความนี้ถูกคัดลอกไปวางในที่ที่เราควบคุมไม่ได้
 * รูปแบบต่างกันตามชนิด ถ้าใช้รูปแบบเดียวกันหมดจะวางแล้วใช้ไม่ได้ทันทีทุกตัว
 */
export function connString(c) {
  const k = kindOf(c.kind);
  const port = Number(c.port) || 0;
  // ไม่ระบุมา = เปิดเข้ารหัส ให้ตรงกับตัวแปลงข้อมูลที่อ่านค่าจากฐานข้อมูล (r.encrypt !== false)
  // ถ้าตีความคนละอย่าง ข้อความที่คัดลอกไปจะไม่ตรงกับที่ระบบใช้จริง
  const enc = c.encrypt !== false;

  if (k.id === "access") {
    return (
      "Driver={" + k.driver + "};DBQ=" + (c.filePath || "") +
      (c.login ? ";Uid=" + c.login + ";Pwd=********" : "") + ";"
    );
  }

  if (k.id === "mysql") {
    return (
      "Server=" + (c.server || "") +
      ";Port=" + (port || k.port) +
      ";Database=" + (c.database || "") +
      ";Uid=" + (c.login || "") +
      ";Pwd=********" +
      ";SslMode=" + (enc ? "Required" : "None") + ";"
    );
  }

  return (
    "Server=" + (c.server || "") + (port && port !== k.port ? "," + port : "") +
    ";Database=" + (c.database || "") +
    ";User Id=" + (c.login || "") +
    ";Password=********" +
    ";Encrypt=" + (enc ? "True" : "False") +
    ";TrustServerCertificate=" + (c.trustCert ? "True" : "False") + ";"
  );
}

/**
 * ตรวจว่ากรอกครบพอที่จะบันทึกได้หรือยัง
 *
 * ตรวจตามชนิดที่เลือก ไม่ใช่ตรวจทุกช่องเหมือนกันหมด
 * ไม่งั้น Access จะบันทึกไม่ได้เพราะไม่มีชื่อ Server ทั้งที่ไม่ต้องมีอยู่แล้ว
 */
export function problemsOf(c) {
  const k = kindOf(c.kind);
  const out = [];

  if (!String(c.name || "").trim()) out.push("ชื่อการเชื่อมต่อ");

  if (k.needsServer) {
    if (!String(c.server || "").trim()) out.push("ชื่อ Server");
    if (!String(c.database || "").trim()) out.push("ฐานข้อมูล");
    const port = Number(c.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) out.push("พอร์ต (1–65535)");
  }

  if (k.needsFile && !String(c.filePath || "").trim()) out.push("ที่อยู่ไฟล์ฐานข้อมูล");
  if (k.needsLogin && !String(c.login || "").trim()) out.push("ผู้ใช้");

  return out;
}

export default function SqlServer() {
  const inv = useInv();
  const perm = inv.perm("sqlserver");
  const { db } = inv;
  const toast = useToast();
  const { user } = useAuth();

  const list = useMemo(
    () => (db.sqlConnections || []).slice().sort((a, b) => a.name.localeCompare(b.name, "th")),
    [db.sqlConnections]
  );

  const [form, setForm] = useState(BLANK);
  const [pw, setPw] = useState("");
  const [sharePw, setSharePw] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState("");
  const [test, setTest] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const problems = problemsOf(form);
  const editing = !!form.id;
  const kind = kindOf(form.kind);

  /**
   * เปลี่ยนชนิดฐานข้อมูล — เปลี่ยนพอร์ตให้เป็นค่ามาตรฐานของชนิดใหม่ด้วย
   * ถ้าไม่เปลี่ยนให้ คนจะเลือก MySQL แล้วพอร์ตยังค้างเป็น 1433 ของ SQL Server
   */
  function setKind(id) {
    const k = kindOf(id);
    setForm((f) => ({ ...f, kind: id, port: k.port }));
    setTest(null);
  }

  /** ชื่อ Server ที่เคยใช้ ให้เลือกซ้ำได้โดยไม่ต้องพิมพ์ใหม่ */
  const servers = useMemo(
    () =>
      [...new Set(list.filter((c) => c.kind === form.kind).map((c) => c.server).filter(Boolean))]
        .sort(),
    [list, form.kind]
  );

  function edit(c) {
    setForm({ ...c, password: undefined });
    setPw(c.password === null || c.password === undefined ? readPw(c.id) : c.password);
    setSharePw(c.password !== null && c.password !== undefined);
    setTest(null);
  }

  function clear() {
    setForm(BLANK);
    setPw("");
    setSharePw(false);
    setShowPw(false);
    setTest(null);
  }

  async function save() {
    if (busy) return;
    if (problems.length) return toast("ยังกรอกไม่ครบ: " + problems.join(" · "), "err");

    const id = form.id || uid();
    const conn = {
      ...form,
      id,
      name: form.name.trim(),
      server: form.server.trim(),
      // Access ไม่มีพอร์ต เก็บเป็น 0 ไว้ ไม่ใช่ยัดค่ามาตรฐานของชนิดอื่นลงไป
      port: kind.needsServer ? Number(form.port) || kind.port : 0,
      database: form.database.trim(),
      login: form.login.trim(),
      bridgeUrl: form.bridgeUrl.trim(),
      note: form.note.trim(),
      // null = ไม่เก็บบนฐานข้อมูล เก็บไว้ในเครื่องนี้แทน
      password: sharePw ? pw : null,
      user: user && user.email ? user.email : "",
      ts: Date.now(),
    };

    setBusy("save");
    try {
      await inv.saveSqlConn(conn);
      // เก็บในเครื่องเฉพาะตอนที่เลือกไม่แชร์ ไม่งั้นจะมีรหัสผ่านค้างอยู่สองที่
      writePw(id, sharePw ? "" : pw);
      toast("บันทึกการเชื่อมต่อ " + conn.name + " แล้ว", "ok");
      setForm({ ...conn, password: undefined });
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  async function drop(c) {
    if (busy) return;
    if (!window.confirm("ลบการเชื่อมต่อ " + c.name + " ออกจากระบบ?")) return;

    setBusy(c.id);
    try {
      await inv.removeSqlConn(c.id);
      writePw(c.id, "");
      if (form.id === c.id) clear();
      toast("ลบการเชื่อมต่อ " + c.name + " แล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  /**
   * ทดสอบการเชื่อมต่อผ่านตัวเชื่อม
   *
   * ส่งค่าไปให้ตัวเชื่อมแล้วรอผลกลับ ไม่ได้ต่อ SQL Server เอง
   * รหัสผ่านถูกส่งไปด้วยเพราะตัวเชื่อมต้องใช้ต่อ จึงย้ำบนหน้าจอว่าต้องเป็น https
   */
  async function runTest() {
    if (busy) return;
    if (problems.length) return toast("ยังกรอกไม่ครบ: " + problems.join(" · "), "err");
    if (!form.bridgeUrl.trim()) {
      return toast("ยังไม่ได้ใส่ที่อยู่ตัวเชื่อม — ดูวิธีทำที่หัวข้อด้านล่าง", "err");
    }

    setBusy("test");
    setTest(null);
    const started = Date.now();
    try {
      const res = await fetch(form.bridgeUrl.trim(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: form.kind,
          server: form.server.trim(),
          port: kind.needsServer ? Number(form.port) || kind.port : 0,
          filePath: form.filePath.trim(),
          database: form.database.trim(),
          user: form.login.trim(),
          password: pw,
          encrypt: !!form.encrypt,
          trustServerCertificate: !!form.trustCert,
        }),
      });

      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = null;
      }

      const took = Date.now() - started;
      if (!res.ok) {
        setTest({ ok: false, msg: "ตัวเชื่อมตอบกลับ HTTP " + res.status + " · " + text.slice(0, 200), took });
      } else if (data && data.ok === false) {
        setTest({ ok: false, msg: data.error || "ตัวเชื่อมต่อฐานข้อมูลไม่สำเร็จ", took });
      } else if (data && data.ok) {
        setTest({ ok: true, msg: data.version || data.message || "เชื่อมต่อสำเร็จ", took });
      } else {
        setTest({ ok: false, msg: "ตัวเชื่อมตอบกลับในรูปแบบที่อ่านไม่ออก: " + text.slice(0, 200), took });
      }
    } catch (e) {
      setTest({
        ok: false,
        took: Date.now() - started,
        msg:
          "ติดต่อตัวเชื่อมไม่ได้: " + e.message +
          " — ตรวจว่าโปรแกรมตัวเชื่อมเปิดอยู่ ที่อยู่ถูกต้อง และเปิด CORS ให้เว็บนี้แล้ว",
      });
    } finally {
      setBusy("");
    }
  }

  function copyConn() {
    const s = connString(form);
    try {
      navigator.clipboard.writeText(s);
      toast("คัดลอกข้อความการเชื่อมต่อแล้ว (ไม่รวมรหัสผ่าน)", "ok");
    } catch (e) {
      toast("คัดลอกไม่ได้ — เลือกข้อความในกล่องแล้วคัดลอกเอง", "warn");
    }
  }

  // เปิดหน้ามาแล้วมีอันเดียว เปิดให้แก้เลย ไม่ต้องกดอีกที
  useEffect(() => {
    if (!form.id && list.length === 1) edit(list[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  if (!inv.sqlReady) {
    return <SetupNotice feature="หน้าจอเชื่อมต่อ SQL Server" tables={["sql_connections"]} />;
  }

  return (
    <div className="stack">
      <Card
        title={editing ? "แก้ไขการเชื่อมต่อ" : "เพิ่มการเชื่อมต่อใหม่"}
        actions={
          <>
            {editing ? (
              <button className="btn btn-g btn-sm" onClick={clear}>
                เพิ่มอันใหม่
              </button>
            ) : null}
            <button
              className="btn btn-g btn-sm"
              onClick={runTest}
              disabled={!!busy || !perm.edit}
              title="ส่งค่าไปให้ตัวเชื่อมลองต่อฐานข้อมูลจริง"
            >
              {busy === "test" ? "กำลังทดสอบ…" : "ทดสอบการเชื่อมต่อ"}
            </button>
            <button
              className="btn btn-p btn-sm"
              onClick={save}
              disabled={!!busy || !perm.edit || !!problems.length}
              title={problems.length ? "ยังกรอกไม่ครบ: " + problems.join(", ") : ""}
            >
              {busy === "save" ? "กำลังบันทึก…" : "บันทึกการเชื่อมต่อ"}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field span2">
            <label className="lbl">ชนิดฐานข้อมูล</label>
            <div className="cs-tabs" style={{ marginBottom: 0 }}>
              {DB_KINDS.map((k) => (
                <button
                  key={k.id}
                  className={"cs-tab" + (form.kind === k.id ? " on" : "")}
                  onClick={() => setKind(k.id)}
                  disabled={!perm.edit}
                >
                  {k.name}
                </button>
              ))}
            </div>
            <span className="hint">
              เลือกชนิดก่อน ช่องที่ต้องกรอกจะเปลี่ยนตาม · ตัวขับที่ตัวเชื่อมต้องใช้:{" "}
              <b>{kind.driver}</b>
            </span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="sq_name">ชื่อการเชื่อมต่อ *</label>
            <input
              className="inp"
              id="sq_name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="เช่น ระบบบัญชีสำนักงานใหญ่"
            />
            <span className="hint">ตั้งชื่อให้รู้ว่าต่อไปที่ไหน ใช้แยกเวลามีหลายชุด</span>
          </div>

          {kind.needsFile ? (
            <div className="field span2">
              <label className="lbl" htmlFor="sq_file">ที่อยู่ไฟล์ฐานข้อมูล *</label>
              <input
                className="inp"
                id="sq_file"
                value={form.filePath}
                onChange={(e) => set("filePath", e.target.value)}
                placeholder="เช่น C:\\ERP\\data\\accounting.accdb หรือ \\\\SRV01\\share\\erp.mdb"
              />
              <span className="hint">
                เป็นที่อยู่บน <b>เครื่องที่รันตัวเชื่อม</b> ไม่ใช่เครื่องที่เปิดหน้านี้
                · ไฟล์บนแชร์ต้องให้ผู้ใช้ที่รันตัวเชื่อมเข้าถึงได้
              </span>
            </div>
          ) : null}

          {kind.needsServer ? (
          <div className="field">
            <label className="lbl" htmlFor="sq_server">ชื่อ Server *</label>
            {/* datalist ให้เลือกจากที่เคยใช้ได้ และพิมพ์ชื่อใหม่เองก็ได้ */}
            <input
              className="inp"
              id="sq_server"
              list="sq_servers"
              value={form.server}
              onChange={(e) => set("server", e.target.value)}
              placeholder="เช่น 192.168.1.10 หรือ SRV-SQL01\\SQLEXPRESS"
            />
            <datalist id="sq_servers">
              {servers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <span className="hint">{kind.serverHint} · เลือกจากที่เคยใช้ได้</span>
          </div>
          ) : null}

          {kind.needsServer ? (
          <div className="field">
            <label className="lbl" htmlFor="sq_port">พอร์ต</label>
            <input
              className="inp"
              id="sq_port"
              type="number"
              min={1}
              max={65535}
              value={form.port}
              onChange={(e) => set("port", e.target.value)}
            />
            <span className="hint">ค่ามาตรฐานของ {kind.name} คือ {kind.port}</span>
          </div>
          ) : null}

          {kind.needsServer ? (
          <div className="field">
            <label className="lbl" htmlFor="sq_db">ฐานข้อมูล *</label>
            <input
              className="inp"
              id="sq_db"
              value={form.database}
              onChange={(e) => set("database", e.target.value)}
              placeholder="เช่น ERPDB"
            />
          </div>
          ) : null}

          <div className="field">
            <label className="lbl" htmlFor="sq_login">
              ผู้ใช้{kind.needsLogin ? " *" : " (ถ้ามี)"}
            </label>
            <input
              className="inp"
              id="sq_login"
              autoComplete="off"
              value={form.login}
              onChange={(e) => set("login", e.target.value)}
              placeholder={kind.id === "mysql" ? "เช่น root หรือ erp_reader" : "เช่น sa หรือ erp_reader"}
            />
            <span className="hint">
              {kind.needsLogin
                ? "ควรใช้ผู้ใช้ที่มีสิทธิเท่าที่จำเป็น ไม่ใช้บัญชีผู้ดูแลถ้าเลี่ยงได้"
                : "ไฟล์ Access ส่วนใหญ่ไม่มีผู้ใช้ ปล่อยว่างไว้ได้ ใส่เมื่อไฟล์ตั้งรหัสไว้"}
            </span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="sq_pw">รหัสผ่าน</label>
            <input
              className="inp"
              id="sq_pw"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <label className="chk-line" htmlFor="sq_showpw" style={{ marginTop: 6 }}>
              <input
                id="sq_showpw"
                className="chk"
                type="checkbox"
                checked={showPw}
                onChange={(e) => setShowPw(e.target.checked)}
              />
              <span>แสดงรหัสผ่าน</span>
            </label>
          </div>

          <div className="field span2">
            <label className="lbl">ที่เก็บรหัสผ่าน</label>
            <label className="chk-line" htmlFor="sq_share">
              <input
                id="sq_share"
                className="chk"
                type="checkbox"
                checked={sharePw}
                onChange={(e) => setSharePw(e.target.checked)}
              />
              <span>เก็บรหัสผ่านไว้บนฐานข้อมูล ให้ทุกเครื่องใช้ร่วมกัน</span>
            </label>
            <span className="hint" style={sharePw ? { color: "var(--warn)" } : undefined}>
              {sharePw
                ? "ทุกคนที่ล็อกอินระบบนี้ได้จะอ่านรหัสผ่านนี้ได้ และรหัสจะติดไปกับไฟล์สำรองข้อมูลด้วย"
                : "ไม่ติ๊ก = เก็บไว้ในเครื่องนี้เครื่องเดียว เครื่องอื่นเปิดมาต้องกรอกรหัสเอง (ปลอดภัยกว่า)"}
            </span>
          </div>

          {kind.needsServer ? (
          <div className="field">
            <label className="lbl">ตัวเลือกการเชื่อมต่อ</label>
            <label className="chk-line" htmlFor="sq_enc">
              <input
                id="sq_enc"
                className="chk"
                type="checkbox"
                checked={form.encrypt}
                onChange={(e) => set("encrypt", e.target.checked)}
              />
              <span>
                {kind.id === "mysql" ? "ใช้ SSL (SslMode=Required)" : "เข้ารหัสการเชื่อมต่อ (Encrypt)"}
              </span>
            </label>
            <label className="chk-line" htmlFor="sq_trust" style={{ marginTop: 6 }}>
              <input
                id="sq_trust"
                className="chk"
                type="checkbox"
                checked={form.trustCert}
                onChange={(e) => set("trustCert", e.target.checked)}
              />
              <span>ยอมรับใบรับรองที่เครื่องออกเอง</span>
            </label>
            <span className="hint">
              เซิร์ฟเวอร์ในวงแลนส่วนใหญ่ใช้ใบรับรองที่ออกเอง ถ้าต่อไม่ติดให้ลองติ๊กข้อล่าง
            </span>
          </div>
          ) : null}

          <div className="field">
            <label className="lbl" htmlFor="sq_default">ค่าเริ่มต้น</label>
            <label className="chk-line" htmlFor="sq_default">
              <input
                id="sq_default"
                className="chk"
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => set("isDefault", e.target.checked)}
              />
              <span>ใช้การเชื่อมต่อนี้เป็นค่าเริ่มต้น</span>
            </label>
            <span className="hint">ตั้งได้ทีละหนึ่งชุด ตั้งอันใหม่แล้วอันเดิมจะถูกปลดให้เอง</span>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="sq_bridge">ที่อยู่ตัวเชื่อม (Bridge URL)</label>
            <input
              className="inp"
              id="sq_bridge"
              value={form.bridgeUrl}
              onChange={(e) => set("bridgeUrl", e.target.value)}
              placeholder="เช่น https://bridge.company.co.th/sqltest"
            />
            <span className="hint">
              ใส่เมื่อต้องการกดทดสอบการเชื่อมต่อจากหน้านี้ · ควรเป็น https เพราะรหัสผ่านถูกส่งไปด้วย
            </span>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="sq_note">หมายเหตุ</label>
            <input
              className="inp"
              id="sq_note"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="เช่น ใช้ดึงยอดลูกหนี้ทุกคืน"
            />
          </div>
        </div>

        <div className="field" style={{ marginTop: 4 }}>
          <label className="lbl">ข้อความการเชื่อมต่อ (Connection string)</label>
          <div className="row" style={{ gap: 8 }}>
            <input className="inp" readOnly value={connString(form)} style={{ flex: 1 }} />
            <button className="btn btn-g btn-sm" onClick={copyConn}>
              คัดลอก
            </button>
          </div>
          <span className="hint">
            คัดลอกไปวางในโปรแกรมอื่นได้ · ไม่ใส่รหัสผ่านจริงลงไป ให้เติมเองตอนใช้
          </span>
        </div>

        {test ? (
          <div className={"scan-result " + (test.ok ? "ok" : "err")} style={{ marginTop: 4 }}>
            <b>{test.ok ? "เชื่อมต่อสำเร็จ" : "เชื่อมต่อไม่สำเร็จ"}</b>
            <span>{test.msg}</span>
            <em>ใช้เวลา {test.took} มิลลิวินาที</em>
          </div>
        ) : null}
      </Card>

      <Card
        title="การเชื่อมต่อที่บันทึกไว้"
        actions={<Badge kind={list.length ? "info" : "gray"}>{list.length} ชุด</Badge>}
      >
        {list.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ minWidth: 160 }}>ชื่อการเชื่อมต่อ</th>
                <th style={{ minWidth: 120 }}>ชนิด</th>
                <th style={{ minWidth: 190 }}>ปลายทาง</th>
                <th style={{ minWidth: 130 }}>ฐานข้อมูล</th>
                <th style={{ minWidth: 110 }}>ผู้ใช้</th>
                <th style={{ minWidth: 140 }}>รหัสผ่าน</th>
                <th style={{ minWidth: 150 }}>แก้ไขล่าสุด</th>
                <th style={{ width: 150 }}></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const shared = c.password !== null && c.password !== undefined;
                const local = !shared && !!readPw(c.id);
                return (
                  <tr key={c.id}>
                    <td>
                      {c.name}
                      {c.isDefault ? (
                        <>
                          {" "}
                          <Badge kind="ok">ค่าเริ่มต้น</Badge>
                        </>
                      ) : null}
                    </td>
                    <td>{kindOf(c.kind).name}</td>
                    <td className="code-cell">
                      {kindOf(c.kind).needsFile
                        ? c.filePath || "—"
                        : c.server + (c.port && c.port !== kindOf(c.kind).port ? ":" + c.port : "")}
                    </td>
                    <td>{c.database || "—"}</td>
                    <td>{c.login || "—"}</td>
                    <td>
                      {shared ? (
                        <Badge kind="warn">เก็บบนฐานข้อมูล</Badge>
                      ) : local ? (
                        <Badge kind="info">เก็บในเครื่องนี้</Badge>
                      ) : (
                        <Badge kind="gray">ยังไม่ได้กรอกในเครื่องนี้</Badge>
                      )}
                    </td>
                    <td className="muted">{c.ts ? thDateTime(c.ts) : "—"}</td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-o btn-sm" onClick={() => edit(c)}>
                          แก้ไข
                        </button>
                        <button
                          className="btn btn-d btn-sm"
                          onClick={() => drop(c)}
                          disabled={!!busy || !perm.edit}
                        >
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>ยังไม่ได้บันทึกการเชื่อมต่อไว้ — กรอกด้านบนแล้วกดบันทึกได้เลย</Empty>
        )}
      </Card>

      <Card title="ทำไมต้องมีตัวเชื่อม และทำอย่างไร">
        <p className="muted" style={{ marginTop: 0 }}>
          เว็บที่รันในเบราว์เซอร์ต่อฐานข้อมูลพวกนี้ตรง ๆ ไม่ได้สักตัว —
          SQL Server พูด TDS บนพอร์ต 1433 · MySQL พูดโปรโตคอลของตัวเองบน 3306
          ทั้งคู่เป็น TCP ดิบซึ่งเบราว์เซอร์เปิดไม่ได้ ทำได้แค่ HTTP กับ WebSocket
          ส่วน Access เป็นไฟล์บนเครื่อง เว็บก็เปิดไฟล์ในเครื่องคนอื่นไม่ได้เหมือนกัน
          และเซิร์ฟเวอร์ที่อยู่ในวงแลนของบริษัท เครื่องบนอินเทอร์เน็ตก็ต่อเข้าไปไม่ถึงอยู่ดี
        </p>
        <p className="muted">
          วิธีที่ใช้ได้จริงคือรัน <b>ตัวเชื่อม</b> ไว้ในวงเดียวกับเซิร์ฟเวอร์ —
          เป็นโปรแกรมเล็ก ๆ ที่รับ HTTP จากหน้านี้ แล้วไปต่อ SQL Server ให้
          เขียนด้วยภาษาอะไรก็ได้ ขอแค่รับส่งตามนี้:
        </p>

        <ul className="note-list">
          <li>
            รับ <b>POST</b> เป็น JSON: <code>kind</code> (mssql / mysql / access),{" "}
            <code>server</code>, <code>port</code>, <code>filePath</code>,{" "}
            <code>database</code>, <code>user</code>, <code>password</code>,{" "}
            <code>encrypt</code>, <code>trustServerCertificate</code>
          </li>
          <li>
            ต่อได้ ตอบ <code>{'{ "ok": true, "version": "..." }'}</code>
          </li>
          <li>
            ต่อไม่ได้ ตอบ <code>{'{ "ok": false, "error": "ข้อความบอกสาเหตุ" }'}</code>
          </li>
          <li>
            เปิด CORS ให้เว็บนี้เรียกได้ (ตอบหัว <code>Access-Control-Allow-Origin</code>)
            ไม่งั้นเบราว์เซอร์จะบล็อกก่อนถึงตัวเชื่อม
          </li>
          <li>
            ควรให้ตัวเชื่อมเป็น <b>https</b> เพราะรหัสผ่านถูกส่งไปในคำขอ
          </li>
          <li>
            ตัวขับที่ตัวเชื่อมต้องมี:{" "}
            {DB_KINDS.map((k) => k.name + " → " + k.driver).join(" · ")}
          </li>
        </ul>

        <p className="muted" style={{ marginBottom: 0, fontSize: 12.5 }}>
          ยังไม่มีตัวเชื่อมก็ใช้หน้านี้เก็บค่าการเชื่อมต่อไว้ได้ตามปกติ
          และคัดลอกข้อความการเชื่อมต่อไปใช้ในโปรแกรมอื่นได้เลย
          แค่ปุ่มทดสอบจะยังกดใช้ไม่ได้จนกว่าจะใส่ที่อยู่ตัวเชื่อม
        </p>
      </Card>
    </div>
  );
}
