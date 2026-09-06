"use client";

// หน้าจอเพิ่มผู้ใช้งาน — สร้างบัญชีเข้าระบบด้วยอีเมลและรหัสผ่าน
//
// เดิมต้องไปสร้างผู้ใช้ที่ Supabase Dashboard ทีละคน ซึ่งคนที่ดูแลระบบหน้างานเข้าไม่ถึง
// หน้านี้ย้ายงานนั้นมาไว้ในระบบ แต่ยังคงข้อจำกัดด้านความปลอดภัยไว้ครบ
//
// ไม่ต้องยืนยันอีเมล — ตั้งค่านี้อยู่ที่ Supabase ไม่ใช่ที่โค้ด:
//   Authentication > Sign In / Providers > Email > ปิด "Confirm email"
//   ปิดแล้วบัญชีที่สร้างจากหน้านี้จะล็อกอินได้ทันที
//   หน้านี้ตรวจผลที่ได้กลับมาแล้วบอกให้รู้ทันทีว่าเป็นกรณีไหน
//   จะได้ไม่เข้าใจว่าสร้างสำเร็จแล้ว แต่คนใช้ล็อกอินไม่ได้จริง
//
// ทำไมไม่มีรายชื่อผู้ใช้ทั้งหมดให้ดูหรือลบ:
//   การอ่านและลบผู้ใช้ต้องใช้ service_role key ซึ่งข้ามทุกสิทธิ์ในฐานข้อมูล
//   ถ้าฝังไว้ในเว็บ ใครเปิดหน้าเว็บก็อ่านกุญแจนั้นได้และลบข้อมูลทั้งระบบได้
//   งานที่ต้องใช้กุญแจนั้นจึงยังต้องทำที่ Supabase Dashboard เท่านั้น

import { useState } from "react";
import { createUser } from "@/lib/supabase";
import { thDateTime } from "@/lib/format";
import { useToast } from "../Toast";
import { Badge, Card, Empty, TableWrap } from "../ui";

/** ความยาวขั้นต่ำที่ Supabase กำหนดไว้เป็นค่าเริ่มต้น */
const MIN_LEN = 6;

/** รูปแบบอีเมลแบบหลวม ๆ — กันพิมพ์ตกหล่น ไม่ได้ตรวจว่ามีอยู่จริง */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Users() {
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  // บัญชีที่สร้างไปแล้วในรอบนี้ — ไม่ใช่รายชื่อผู้ใช้ทั้งระบบ
  const [made, setMade] = useState([]);

  const badEmail = email.length > 0 && !EMAIL_RE.test(email.trim());
  const tooShort = pw1.length > 0 && pw1.length < MIN_LEN;
  const mismatch = pw2.length > 0 && pw1 !== pw2;
  const ready = EMAIL_RE.test(email.trim()) && pw1.length >= MIN_LEN && pw1 === pw2;

  async function submit(e) {
    if (e) e.preventDefault();
    if (!ready || busy) return;

    setBusy(true);
    try {
      const res = await createUser(email.trim(), pw1);
      setMade((prev) => [{ ...res, at: Date.now() }, ...prev]);
      setEmail("");
      setPw1("");
      setPw2("");
      setShow(false);

      toast(
        res.confirmed
          ? "สร้างผู้ใช้ " + res.email + " แล้ว — ล็อกอินได้ทันที"
          : "สร้างผู้ใช้ " + res.email + " แล้ว แต่ยังล็อกอินไม่ได้จนกว่าจะยืนยันอีเมล",
        res.confirmed ? "ok" : "warn"
      );
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Card title="เพิ่มผู้ใช้งาน">
        <p className="muted" style={{ marginTop: 0 }}>
          สร้างบัญชีสำหรับเข้าระบบด้วยอีเมลและรหัสผ่าน
          บัญชีที่สร้างจากหน้านี้ใช้ได้ทันทีโดยไม่ต้องยืนยันอีเมล
          (ถ้าตั้งค่าที่ Supabase ไว้ตามหัวข้อด้านล่างแล้ว)
        </p>

        <form className="pw-form" onSubmit={submit}>
          <div className="field">
            <label className="lbl" htmlFor="us_email">อีเมล</label>
            <input
              className="inp"
              id="us_email"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="somchai@example.com"
            />
            <span className="hint" style={badEmail ? { color: "var(--err)" } : undefined}>
              {badEmail
                ? "รูปแบบอีเมลยังไม่ถูกต้อง"
                : "ใช้อีเมลนี้เป็นชื่อผู้ใช้ตอนเข้าระบบ เปลี่ยนทีหลังไม่ได้"}
            </span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="us_pw">รหัสผ่าน</label>
            <input
              className="inp"
              id="us_pw"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
            />
            <span className="hint" style={tooShort ? { color: "var(--err)" } : undefined}>
              {tooShort
                ? "สั้นเกินไป — ต้องอย่างน้อย " + MIN_LEN + " ตัวอักษร"
                : "อย่างน้อย " + MIN_LEN + " ตัวอักษร"}
            </span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="us_pw2">ยืนยันรหัสผ่านอีกครั้ง</label>
            <input
              className="inp"
              id="us_pw2"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit(e);
              }}
            />
            <span className="hint" style={mismatch ? { color: "var(--err)" } : undefined}>
              {mismatch
                ? "สองช่องยังไม่ตรงกัน"
                : pw2 && pw1 === pw2
                  ? "ตรงกันแล้ว"
                  : "พิมพ์ซ้ำอีกครั้งเพื่อกันพิมพ์ผิด — ผู้ใช้ใหม่จะเข้าระบบไม่ได้ถ้ารหัสไม่ตรงกับที่บอกเขา"}
            </span>
          </div>

          <div className="pw-actions">
            <label className="chk-line" htmlFor="us_show">
              <input
                id="us_show"
                className="chk"
                type="checkbox"
                checked={show}
                onChange={(e) => setShow(e.target.checked)}
              />
              <span>แสดงรหัสผ่านที่พิมพ์</span>
            </label>
            <button className="btn btn-p" type="submit" disabled={!ready || busy}>
              {busy ? "กำลังสร้าง…" : "สร้างผู้ใช้"}
            </button>
          </div>
        </form>
      </Card>

      <Card
        title="ผู้ใช้ที่สร้างในรอบนี้"
        actions={made.length ? <Badge kind="ok">{made.length} บัญชี</Badge> : null}
      >
        {made.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th>อีเมล</th>
                <th style={{ width: 180 }}>สร้างเมื่อ</th>
                <th style={{ width: 170 }}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {made.map((u) => (
                <tr key={u.id || u.at}>
                  <td>{u.email}</td>
                  <td>{thDateTime(u.at)}</td>
                  <td>
                    <Badge kind={u.confirmed ? "ok" : "warn"}>
                      {u.confirmed ? "ใช้งานได้ทันที" : "รอยืนยันอีเมล"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>ยังไม่ได้สร้างผู้ใช้ในรอบนี้</Empty>
        )}
        <p className="muted" style={{ marginBottom: 0, fontSize: 12.5 }}>
          รายการนี้แสดงเฉพาะบัญชีที่สร้างจากหน้านี้ในรอบการใช้งานปัจจุบัน
          ไม่ใช่รายชื่อผู้ใช้ทั้งระบบ (ดูรายชื่อทั้งหมดได้ที่ Supabase Dashboard)
        </p>
      </Card>

      <Card title="ตั้งค่าให้ไม่ต้องยืนยันอีเมล (ทำครั้งเดียว)">
        <ul className="note-list">
          <li>
            เปิด Supabase Dashboard &gt; <b>Authentication</b> &gt; <b>Sign In / Providers</b> &gt;{" "}
            <b>Email</b>
          </li>
          <li>
            ปิดสวิตช์ <b>Confirm email</b> แล้วกดบันทึก —
            บัญชีที่สร้างหลังจากนี้จะเข้าระบบได้ทันทีโดยไม่ต้องเปิดอีเมล
          </li>
          <li>
            ต้องเปิด <b>Allow new users to sign up</b> ไว้ด้วย ไม่งั้นหน้านี้จะสร้างผู้ใช้ไม่ได้
          </li>
          <li>
            บัญชีที่สร้างไว้ก่อนปิดสวิตช์ ยังต้องยืนยันอยู่ —
            แก้ได้โดยเข้า Authentication &gt; Users แล้วกด Confirm ให้รายนั้น
          </li>
        </ul>
      </Card>

      <Card title="ข้อควรรู้">
        <ul className="note-list">
          <li>
            ผู้ใช้ทุกคนที่เข้าระบบได้ จะเห็นและแก้ข้อมูลได้ตามที่ตั้งไว้ที่หน้า{" "}
            <b>กำหนดสิทธิการใช้งาน</b> ซึ่งเป็นสิทธิของทั้งระบบ ยังไม่ได้แยกรายคน
          </li>
          <li>
            หน้านี้ลบผู้ใช้หรือดูรายชื่อทั้งหมดไม่ได้ เพราะงานนั้นต้องใช้กุญแจระดับผู้ดูแล
            (service_role) ซึ่งฝังไว้ในเว็บไม่ได้ — ใครเปิดหน้าเว็บก็จะอ่านกุญแจนั้นได้
          </li>
          <li>ผู้ใช้เปลี่ยนรหัสผ่านของตัวเองได้ที่เมนู <b>เปลี่ยนรหัสผ่าน</b></li>
          <li>ลืมรหัสผ่านต้องให้ผู้ดูแลตั้งใหม่ให้จาก Supabase Dashboard</li>
        </ul>
      </Card>
    </div>
  );
}
