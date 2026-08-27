"use client";

// ข้อความแจ้งเตือนมุมขวาล่าง

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const seq = useRef(0);

  const toast = useCallback((message, kind) => {
    const id = ++seq.current;
    setItems((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div id="toasts" className="no-print" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={"toast" + (t.kind ? " " + t.kind : "")}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast ต้องอยู่ภายใน ToastProvider");
  return ctx.toast;
}
