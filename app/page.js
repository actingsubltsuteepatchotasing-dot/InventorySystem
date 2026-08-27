"use client";

import { useEffect, useState } from "react";
import { SESSION_KEY } from "@/lib/constants";
import Login from "@/components/Login";
import Shell from "@/components/Shell";
import { useToast } from "@/components/Toast";

export default function Page() {
  const [mounted, setMounted] = useState(false);
  const [logged, setLogged] = useState(false);
  const toast = useToast();

  // อ่านสถานะล็อกอินหลัง mount เท่านั้น เพื่อไม่ให้ SSR กับ client ไม่ตรงกัน
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") setLogged(true);
    } catch (e) {
      // เบราว์เซอร์ปิด storage ไว้ — ให้ล็อกอินใหม่ตามปกติ
    }
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div style={{ minHeight: "100vh", background: "var(--bg)" }} />;
  }

  if (!logged) {
    return (
      <Login
        onSuccess={() => {
          try {
            sessionStorage.setItem(SESSION_KEY, "1");
          } catch (e) {}
          setLogged(true);
          toast("ยินดีต้อนรับเข้าสู่ระบบ");
        }}
      />
    );
  }

  return (
    <Shell
      onLogout={() => {
        try {
          sessionStorage.removeItem(SESSION_KEY);
        } catch (e) {}
        setLogged(false);
      }}
    />
  );
}
