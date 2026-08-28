"use client";

// สถานะการเข้าสู่ระบบ (Supabase Auth — อีเมล + รหัสผ่าน)

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getUser,
  isConfigured,
  restoreSession,
  signInWithPassword,
  signOut as sbSignOut,
  verifySession,
} from "./supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  // กู้คืน session ที่เก็บไว้ แล้วยืนยันกับเซิร์ฟเวอร์ว่ายังใช้ได้จริง
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!isConfigured()) {
        if (alive) setChecking(false);
        return;
      }
      if (restoreSession()) {
        try {
          const u = await verifySession();
          if (alive) setUser(u);
        } catch (e) {
          if (alive) setUser(null);
        }
      }
      if (alive) setChecking(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const session = await signInWithPassword(email, password);
    setUser(session.user || getUser());
    return session;
  }, []);

  const signOut = useCallback(async () => {
    await sbSignOut();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, checking, signIn, signOut, configured: isConfigured() }),
    [user, checking, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth ต้องอยู่ภายใน AuthProvider");
  return ctx;
}
