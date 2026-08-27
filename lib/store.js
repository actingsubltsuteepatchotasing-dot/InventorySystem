"use client";

// React Context เก็บสถานะข้อมูลคลังสินค้าทั้งระบบ

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  loadDB,
  saveDB,
  seed,
  stockMap,
  stockOf,
  stockTotal,
  whTotal,
  prodById,
  whById,
  prodName,
  whName,
} from "./db";

const InventoryContext = createContext(null);

export function InventoryProvider({ children }) {
  const [db, setDb] = useState(null);

  useEffect(() => {
    setDb(loadDB());
  }, []);

  /**
   * แก้ไขข้อมูลอย่างปลอดภัย — สร้าง object ใหม่ให้ React รู้ว่ามีการเปลี่ยนแปลง
   * แล้วบันทึกลง localStorage ทันที
   * @param {(draft: object) => void} mutator
   */
  const update = useCallback((mutator) => {
    setDb((prev) => {
      if (!prev) return prev;
      const next = {
        products: [...prev.products],
        warehouses: [...prev.warehouses],
        txns: [...prev.txns],
        counters: { ...prev.counters },
      };
      mutator(next);
      saveDB(next);
      return next;
    });
  }, []);

  /** แทนที่ข้อมูลทั้งชุด (ใช้ตอนนำเข้าไฟล์สำรอง) */
  const replace = useCallback((next) => {
    const clean = { ...next, counters: next.counters || {} };
    saveDB(clean);
    setDb(clean);
  }, []);

  /** ล้างข้อมูลและสร้างชุดตัวอย่างใหม่ */
  const reset = useCallback(() => {
    const fresh = seed();
    saveDB(fresh);
    setDb(fresh);
  }, []);

  // คำนวณยอดคงเหลือครั้งเดียวต่อการเปลี่ยนแปลงข้อมูล
  const stock = useMemo(() => (db ? stockMap(db) : {}), [db]);

  const value = useMemo(
    () => ({
      db,
      ready: !!db,
      update,
      replace,
      reset,
      stock,
      prod: (id) => (db ? prodById(db, id) : undefined),
      wh: (id) => (db ? whById(db, id) : undefined),
      prodName: (id) => (db ? prodName(db, id) : ""),
      whName: (id) => (db ? whName(db, id) : ""),
      stockOf: (pid, wid) => stockOf(stock, pid, wid),
      stockTotal: (pid) => (db ? stockTotal(db, stock, pid) : 0),
      whTotal: (wid) => (db ? whTotal(db, stock, wid) : 0),
    }),
    [db, stock, update, replace, reset]
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInv() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error("useInv ต้องอยู่ภายใน InventoryProvider");
  return ctx;
}
