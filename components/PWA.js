"use client";

// ส่วนที่ทำให้เว็บติดตั้งเป็นแอปได้
//   PWARegister   ลงทะเบียน service worker และแจ้งเมื่อมีเวอร์ชันใหม่
//   InstallButton ปุ่ม "ติดตั้งแอป" ที่โผล่เฉพาะตอนเบราว์เซอร์ยอมให้ติดตั้ง

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useToast } from "./Toast";
import { IcDownload } from "./Icons";

const InstallContext = createContext(null);

/** เปิดจากหน้าจอโฮมหรือหน้าต่างแอปอยู่หรือไม่ (ติดตั้งแล้ว) */
function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari ใช้ property นี้แทน
    window.navigator.standalone === true
  );
}

export function PWAProvider({ children }) {
  const toast = useToast();
  const [promptEvent, setPromptEvent] = useState(null);
  const [installed, setInstalled] = useState(false);

  /* ------------------------------------------- ลงทะเบียน service worker */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // ลงทะเบียนหลังโหลดเสร็จ ไม่ให้แย่งแบนด์วิดท์ตอนเปิดหน้าแรก
    const onLoad = () => {
      navigator.serviceWorker
        // updateViaCache none = ให้ดึง sw.js สดเสมอ ไม่งั้นเวอร์ชันใหม่อาจไม่มาสักที
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((r) => {
          // มีเวอร์ชันใหม่รออยู่ตั้งแต่โหลด
          if (r.waiting && navigator.serviceWorker.controller) {
            toast("มีเวอร์ชันใหม่ — ปิดแล้วเปิดแอปใหม่เพื่ออัปเดต");
          }

          r.addEventListener("updatefound", () => {
            const sw = r.installing;
            if (!sw) return;
            sw.addEventListener("statechange", () => {
              // มี controller อยู่แล้ว = ไม่ใช่การติดตั้งครั้งแรก แปลว่าเป็นเวอร์ชันใหม่
              if (sw.state === "installed" && navigator.serviceWorker.controller) {
                toast("มีเวอร์ชันใหม่ — ปิดแล้วเปิดแอปใหม่เพื่ออัปเดต");
              }
            });
          });
        })
        .catch(() => {
          // ลงทะเบียนไม่ได้ก็ไม่เป็นไร เว็บยังใช้งานได้ตามปกติ แค่ติดตั้งเป็นแอปไม่ได้
        });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);

    return () => window.removeEventListener("load", onLoad);
    // ตั้งใจให้ทำงานครั้งเดียวตอน mount — toast เป็นฟังก์ชันคงที่จาก context
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------------------------- ดักโอกาสเสนอให้ติดตั้ง */
  useEffect(() => {
    if (typeof window === "undefined") return;

    setInstalled(isStandalone());

    const onPrompt = (e) => {
      // กันเบราว์เซอร์เด้งแถบของตัวเอง แล้วเก็บ event ไว้ให้ปุ่มของเราเรียกเอง
      e.preventDefault();
      setPromptEvent(e);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setInstalled(true);
      toast("ติดตั้งแอปเรียบร้อยแล้ว");
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    promptEvent.prompt();
    try {
      await promptEvent.userChoice;
    } catch (e) {
      // ผู้ใช้ปิดกล่องไปเฉย ๆ
    }
    // เรียกซ้ำไม่ได้ ต้องรอ event รอบใหม่จากเบราว์เซอร์
    setPromptEvent(null);
  }, [promptEvent]);

  const value = useMemo(
    () => ({ canInstall: !!promptEvent && !installed, installed, install }),
    [promptEvent, installed, install]
  );

  return <InstallContext.Provider value={value}>{children}</InstallContext.Provider>;
}

export function useInstall() {
  return useContext(InstallContext) || { canInstall: false, installed: false, install: () => {} };
}

/** ปุ่มติดตั้งแอป — ไม่แสดงอะไรเลยถ้าเบราว์เซอร์ยังไม่พร้อมให้ติดตั้ง */
export function InstallButton() {
  const { canInstall, install } = useInstall();
  if (!canInstall) return null;

  return (
    <button className="btn btn-o btn-sm" onClick={install} title="ติดตั้งเป็นแอปบนเครื่องนี้">
      <IcDownload size={15} />
      ติดตั้งแอป
    </button>
  );
}
