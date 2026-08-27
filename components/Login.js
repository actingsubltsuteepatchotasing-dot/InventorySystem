"use client";

import { useState } from "react";
import { AUTH } from "@/lib/constants";
import { Logo } from "./Icons";

/** หน้าเข้าสู่ระบบ — ตรวจสอบกับรหัสแบบ Fixed ตามข้อกำหนด (ไม่ใช้ Database) */
export default function Login({ onSuccess }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");

  function submit(e) {
    e.preventDefault();
    if (u.trim() === AUTH.username && p === AUTH.password) {
      setErr("");
      onSuccess();
    } else {
      setErr("ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง");
      setP("");
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit} noValidate>
        <div className="login-logo">
          <Logo size={62} />
          <div>
            <h1>ระบบควบคุมสินค้าคงคลัง</h1>
            <small>
              การยางแห่งประเทศไทย
              <br />
              Rubber Authority of Thailand
            </small>
          </div>
        </div>

        <div className="field">
          <label className="lbl" htmlFor="u">
            ชื่อผู้ใช้งาน
          </label>
          <input
            className="inp"
            id="u"
            value={u}
            onChange={(e) => setU(e.target.value)}
            autoComplete="username"
            placeholder="admin"
            autoFocus
          />
        </div>

        <div className="field">
          <label className="lbl" htmlFor="p">
            รหัสผ่าน
          </label>
          <input
            className="inp"
            id="p"
            type="password"
            value={p}
            onChange={(e) => setP(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>

        {err ? (
          <div className="bdg bdg-err" style={{ marginBottom: 14 }} role="alert">
            {err}
          </div>
        ) : null}

        <button className="btn btn-p" type="submit" style={{ width: "100%", padding: 11 }}>
          เข้าสู่ระบบ
        </button>

        <div className="hint">
          บัญชีสำหรับทดสอบ (ไม่ใช้ฐานข้อมูล) — ชื่อผู้ใช้ <code>{AUTH.username}</code> · รหัสผ่าน{" "}
          <code>{AUTH.password}</code>
        </div>
      </form>
    </div>
  );
}
