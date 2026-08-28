"use client";

// React Context เก็บข้อมูลคลังสินค้าทั้งระบบ
// โหลดจาก Supabase ครั้งเดียวตอนเข้าระบบ แล้วเก็บไว้ในหน่วยความจำเพื่อให้หน้าจอเร็ว
// ทุกการแก้ไขจะเขียนขึ้น Supabase ก่อน แล้วค่อยอัปเดตหน่วยความจำ (ถ้าเขียนพลาดจะไม่เปลี่ยนสถานะ)

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as api from "./api";
import { useAuth } from "./auth";
import {
  prodById,
  prodName,
  stockMap,
  stockOf,
  stockTotal,
  whById,
  whName,
  whTotal,
} from "./db";

const EMPTY = { products: [], warehouses: [], txns: [] };

const InventoryContext = createContext(null);

export function InventoryProvider({ children }) {
  const { user } = useAuth();
  const [db, setDb] = useState(null);
  const [error, setError] = useState("");
  const [seeded, setSeeded] = useState(false);

  const reload = useCallback(async () => {
    setError("");
    try {
      const data = await api.loadAll();
      // ฐานข้อมูลว่างเปล่า (เพิ่งรัน schema.sql) → ใส่ข้อมูลตัวอย่างให้อัตโนมัติ
      const fresh = await api.seedIfEmpty(data);
      if (fresh) {
        setSeeded(true);
        setDb(fresh);
      } else {
        setDb(data);
      }
    } catch (e) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
      setDb(null);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setDb(null);
      setError("");
      return;
    }
    reload();
  }, [user, reload]);

  /* --------------------------------------------------------- actions */

  /** บันทึกรายการเคลื่อนไหวหลายรายการในเอกสารเดียว */
  const addTxns = useCallback(async (rows) => {
    await api.insertTxns(rows);
    setDb((prev) =>
      prev ? { ...prev, txns: [...prev.txns, ...rows].sort((a, b) => a.ts - b.ts) } : prev
    );
  }, []);

  /** เพิ่มหรือแก้ไขสินค้า */
  const saveProduct = useCallback(async (product) => {
    await api.upsertProduct(product);
    setDb((prev) => {
      if (!prev) return prev;
      const i = prev.products.findIndex((p) => p.id === product.id);
      const products =
        i >= 0
          ? prev.products.map((p, k) => (k === i ? { ...p, ...product } : p))
          : [...prev.products, product];
      return { ...prev, products };
    });
  }, []);

  /** ลบสินค้า พร้อมรายการเคลื่อนไหวที่อ้างถึง */
  const removeProduct = useCallback(async (id) => {
    await api.deleteProduct(id);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            products: prev.products.filter((p) => p.id !== id),
            txns: prev.txns.filter((t) => t.productId !== id),
          }
        : prev
    );
  }, []);

  /** เขียนทับข้อมูลทั้งหมดจากไฟล์สำรอง */
  const importAll = useCallback(async (data) => {
    await api.replaceAll(data);
    setDb({
      products: data.products,
      warehouses: data.warehouses,
      txns: [...data.txns].sort((a, b) => a.ts - b.ts),
    });
  }, []);

  /** ล้างข้อมูลและสร้างชุดตัวอย่างใหม่ */
  const resetSeed = useCallback(async () => {
    const fresh = await api.resetToSeed();
    setDb(fresh);
  }, []);

  /* ------------------------------------------------------- derived */

  const stock = useMemo(() => (db ? stockMap(db) : {}), [db]);

  const value = useMemo(
    () => ({
      db: db || EMPTY,
      ready: !!db,
      error,
      seeded,
      reload,
      addTxns,
      saveProduct,
      removeProduct,
      importAll,
      resetSeed,
      stock,
      prod: (id) => (db ? prodById(db, id) : undefined),
      wh: (id) => (db ? whById(db, id) : undefined),
      prodName: (id) => (db ? prodName(db, id) : ""),
      whName: (id) => (db ? whName(db, id) : ""),
      stockOf: (pid, wid) => stockOf(stock, pid, wid),
      stockTotal: (pid) => (db ? stockTotal(db, stock, pid) : 0),
      whTotal: (wid) => (db ? whTotal(db, stock, wid) : 0),
    }),
    [db, error, seeded, stock, reload, addTxns, saveProduct, removeProduct, importAll, resetSeed]
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInv() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error("useInv ต้องอยู่ภายใน InventoryProvider");
  return ctx;
}
