"use client";

// ระบบพิมพ์เอกสาร — เนื้อหาที่จะพิมพ์ถูก render ลง #printRoot
// ซึ่งซ่อนอยู่บนหน้าจอ และแสดงเฉพาะตอนสั่งพิมพ์ (ดู @media print ใน globals.css)

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Logo } from "./Icons";
import { thDateTime } from "@/lib/format";

const PrintContext = createContext(null);

export function PrintProvider({ children }) {
  const [doc, setDoc] = useState(null);

  /**
   * สั่งพิมพ์เอกสาร
   * @param {{title:string, subtitle?:string, body:React.ReactNode, signers?:boolean}} d
   */
  const print = useCallback((d) => setDoc(d), []);

  useEffect(() => {
    if (!doc) return;
    // รอให้ React วาดเนื้อหาลง #printRoot ก่อนเปิดหน้าต่างพิมพ์
    const raf = requestAnimationFrame(() => {
      window.print();
      setDoc(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [doc]);

  const value = useMemo(() => ({ print }), [print]);

  return (
    <PrintContext.Provider value={value}>
      <div className="no-print">{children}</div>
      <div id="printRoot">{doc ? <PrintDoc {...doc} /> : null}</div>
    </PrintContext.Provider>
  );
}

function PrintDoc({ title, subtitle, body, signers = true }) {
  return (
    <>
      <div className="pr-head">
        <Logo size={46} vein="#00693C" />
        <div className="org">
          <b>การยางแห่งประเทศไทย</b>
          <span>Rubber Authority of Thailand · ระบบควบคุมสินค้าคงคลัง</span>
        </div>
        <div className="rt">
          พิมพ์โดย: admin
          <br />
          วันที่พิมพ์: {thDateTime(Date.now())}
        </div>
      </div>

      <div className="pr-title">{title}</div>
      {subtitle ? <div className="pr-sub">{subtitle}</div> : null}

      {body}

      {signers ? (
        <div className="pr-sign">
          <div>
            <div className="line" />
            ผู้จัดทำ / ผู้ตรวจนับ
          </div>
          <div>
            <div className="line" />
            หัวหน้าคลังสินค้า
          </div>
          <div>
            <div className="line" />
            ผู้อนุมัติ
          </div>
        </div>
      ) : null}
    </>
  );
}

export function usePrint() {
  const ctx = useContext(PrintContext);
  if (!ctx) throw new Error("usePrint ต้องอยู่ภายใน PrintProvider");
  return ctx.print;
}
