"use client";

// หน้าจอเปลี่ยนรหัสผ่านของตัวเอง
//
// ตรวจรหัสเดิมก่อนเสมอ ถึงจะล็อกอินอยู่แล้วก็ตาม
//   เครื่องในคลังมักถูกเปิดค้างไว้ทั้งวัน ใครเดินผ่านก็ใช้ได้
//   ถ้าไม่ถามรหัสเดิม คนที่เดินผ่านจะล็อกเจ้าของบัญชีออกจากระบบตัวเองได้เลย
//   (การตรวจทำที่ lib/supabase.js ด้วยการล็อกอินซ้ำด้วยรหัสเดิม)
//
// ให้กรอกรหัสใหม่สองครั้ง เพราะช่องรหัสผ่านเป็นจุดที่พิมพ์ผิดแล้วไม่มีใครเห็น
// ถ้าพิมพ์ผิดครั้งเดียวแล้วบันทึกไป จะเข้าระบบไม่ได้อีกเลยและกู้เองไม่ได้
// มีปุ่มดูรหัสให้ด้วย เพราะบางคนพิมพ์ผิดซ้ำแบบเดิมทั้งสองช่อง

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { changePassword } from "@/lib/supabase";
import { useToast } from "../Toast";
import { Card } from "../ui";

/** ความยาวขั้นต่ำที่ Supabase กำหนดไว้เป็นค่าเริ่มต้น */
const MIN_LEN = 6;

export default function Password() {
  const { user } = useAuth();
  const toast = useToast();

  const [oldPw, setOldPw] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [doneAt, setDoneAt] = useState(0);

  const email = user && user.email ? user.email : "";

  // ตรวจตอนพิมพ์เพื่อบอกให้รู้ตัวก่อนกดปุ่ม ไม่ใช่ปล่อยให้กดแล้วค่อยบอกว่าผิด
  const tooShort = pw1.length > 0 && pw1.length < MIN_LEN;
  const mismatch = pw2.length > 0 && pw1 !== pw2;
  const sameAsOld = pw1.length > 0 && oldPw.length > 0 && pw1 === oldPw;
  const ready =
    !!email && oldPw.length > 0 && pw1.length >= MIN_LEN && pw1 === pw2 && !sameAsOld;

  async function submit(e) {
    if (e) e.preventDefault();
    if (!ready || busy) return;

    setBusy(true);
    try {
      await changePassword(email, oldPw, pw1);
      setOldPw("");
      setPw1("");
      setPw2("");
      setShow(false);
      setDoneAt(Date.now());
      toast("เปลี่ยนรหัสผ่านเรียบร้อย — ครั้งต่อไปให้ใช้รหัสใหม่เข้าระบบ", "ok");
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (!email) {
    return (
      <Card title="เปลี่ยนรหัสผ่าน">
        <p className="muted" style={{ margin: 0 }}>
          ยังไม่ทราบว่าใครล็อกอินอยู่ — ให้ออกจากระบบแล้วเข้าใหม่อีกครั้ง
        </p>
      </Card>
    );
  }

  return (
    <div className="stack">
      <Card title="เปลี่ยนรหัสผ่าน">
        <p className="muted" style={{ marginTop: 0 }}>
          เปลี่ยนรหัสผ่านของบัญชี <b>{email}</b> · ต้องใส่รหัสผ่านเดิมให้ถูกต้องก่อน
          และใส่รหัสใหม่สองครั้งให้ตรงกัน
        </p>

        <form className="pw-form" onSubmit={submit}>
          <div className="field">
            <label className="lbl" htmlFor="pw_old">รหัสผ่านเดิม</label>
            <input
              className="inp"
              id="pw_old"
              type={show ? "text" : "password"}
              value={oldPw}
              autoComplete="current-password"
              onChange={(e) => setOldPw(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="pw_new">รหัสผ่านใหม่</label>
            <input
              className="inp"
              id="pw_new"
              type={show ? "text" : "password"}
              value={pw1}
              autoComplete="new-password"
              onChange={(e) => setPw1(e.target.value)}
            />
            <span className="hint" style={tooShort || sameAsOld ? { color: "var(--err)" } : undefined}>
              {tooShort
                ? "สั้นเกินไป — ต้องอย่างน้อย " + MIN_LEN + " ตัวอักษร"
                : sameAsOld
                  ? "รหัสใหม่ซ้ำกับรหัสเดิม"
                  : "อย่างน้อย " + MIN_LEN + " ตัวอักษร"}
            </span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="pw_new2">ยืนยันรหัสผ่านใหม่อีกครั้ง</label>
            <input
              className="inp"
              id="pw_new2"
              type={show ? "text" : "password"}
              value={pw2}
              autoComplete="new-password"
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
                  : "พิมพ์รหัสใหม่ซ้ำอีกครั้งเพื่อกันพิมพ์ผิด"}
            </span>
          </div>

          <div className="pw-actions">
            <label className="chk-line" htmlFor="pw_show">
              <input
                id="pw_show"
                className="chk"
                type="checkbox"
                checked={show}
                onChange={(e) => setShow(e.target.checked)}
              />
              <span>แสดงรหัสผ่านที่พิมพ์</span>
            </label>
            <button className="btn btn-p" type="submit" disabled={!ready || busy}>
              {busy ? "กำลังเปลี่ยน…" : "เปลี่ยนรหัสผ่าน"}
            </button>
          </div>
        </form>

        {doneAt ? (
          <p className="muted" style={{ marginBottom: 0, color: "var(--ok)" }}>
            เปลี่ยนรหัสผ่านแล้วเมื่อสักครู่ — เครื่องนี้ยังใช้งานต่อได้ตามปกติ
            แต่เครื่องอื่นที่ล็อกอินบัญชีนี้ไว้อาจต้องเข้าระบบใหม่ด้วยรหัสใหม่
          </p>
        ) : null}
      </Card>

      <Card title="ข้อควรรู้">
        <ul className="note-list">
          <li>ระบบนี้ไม่มีหน้ากู้รหัสผ่าน ถ้าลืมรหัสต้องให้ผู้ดูแลตั้งรหัสใหม่ให้จาก Supabase Dashboard</li>
          <li>รหัสผ่านนี้ใช้เข้าระบบทุกเครื่อง เปลี่ยนที่นี่แล้วมีผลกับทุกเครื่องที่ใช้บัญชีนี้</li>
          <li>หน้านี้เปลี่ยนได้เฉพาะรหัสของบัญชีที่ล็อกอินอยู่ ไม่สามารถเปลี่ยนของคนอื่นได้</li>
        </ul>
      </Card>
    </div>
  );
}
