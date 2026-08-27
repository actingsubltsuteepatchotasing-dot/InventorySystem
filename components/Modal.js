"use client";

import { useEffect } from "react";
import { IcClose } from "./Icons";

/** กล่องโต้ตอบ — ปิดด้วยปุ่ม Escape หรือคลิกพื้นหลัง */
export default function Modal({ title, onClose, footer, maxWidth = 720, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-bg"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth }}>
        <div className="modal-h">
          <h3>{title}</h3>
          <button className="btn btn-g btn-icon" onClick={onClose} aria-label="ปิด">
            <IcClose size={16} />
          </button>
        </div>
        <div className="modal-b">{children}</div>
        {footer ? <div className="modal-f">{footer}</div> : null}
      </div>
    </div>
  );
}
