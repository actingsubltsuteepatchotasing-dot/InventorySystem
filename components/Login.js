"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { configHint } from "@/lib/supabase";
import { Logo } from "./Icons";

/** หน้าเข้าสู่ระบบ — Supabase Auth ด้วยอีเมลและรหัสผ่าน */
export default function Login() {
  const { signIn, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;

    if (!email.trim() || !password) {
      setErr("กรุณากรอกอีเมลและรหัสผ่าน");
      return;
    }

    setBusy(true);
    setErr("");
    try {
      await signIn(email.trim(), password);
    } catch (e2) {
      setErr(e2.message || "เข้าสู่ระบบไม่สำเร็จ");
      setPassword("");
    } finally {
      setBusy(false);
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

        {!configured ? (
          <div className="setup-warn">
            <b>ยังไม่ได้ตั้งค่า Supabase</b>
            <p>
              ขาดตัวแปร: <code>{configHint().join(", ")}</code>
            </p>
            <p>
              เพิ่มค่าเหล่านี้ในไฟล์ <code>.env.local</code> (ตอนรันในเครื่อง) หรือที่
              Vercel &gt; Project Settings &gt; Environment Variables แล้ว deploy ใหม่
            </p>
          </div>
        ) : null}

        <div className="field">
          <label className="lbl" htmlFor="email">
            อีเมล
          </label>
          <input
            className="inp"
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="you@example.com"
            disabled={!configured || busy}
            autoFocus
          />
        </div>

        <div className="field">
          <label className="lbl" htmlFor="password">
            รหัสผ่าน
          </label>
          <input
            className="inp"
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            disabled={!configured || busy}
          />
        </div>

        {err ? (
          <div className="login-err" role="alert">
            {err}
          </div>
        ) : null}

        <button
          className="btn btn-p"
          type="submit"
          style={{ width: "100%", padding: 11 }}
          disabled={!configured || busy}
        >
          {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </button>

        <div className="hint">
          ระบบไม่มีหน้าสมัครสมาชิก — ผู้ดูแลสร้างบัญชีให้ที่ Supabase Dashboard &gt; Authentication
          &gt; Users (อย่าลืมติ๊ก <b>Auto Confirm User</b>)
        </div>
      </form>
    </div>
  );
}
