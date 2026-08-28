"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import Login from "@/components/Login";
import Shell from "@/components/Shell";

export default function Page() {
  const { user, checking } = useAuth();
  const [mounted, setMounted] = useState(false);

  // แตะ localStorage ได้เฉพาะฝั่ง client จึงรอให้ mount เสร็จก่อน
  useEffect(() => setMounted(true), []);

  if (!mounted || checking) {
    return (
      <div className="boot">
        <div className="spinner" />
        <span>กำลังตรวจสอบสิทธิ์…</span>
      </div>
    );
  }

  return user ? <Shell /> : <Login />;
}
