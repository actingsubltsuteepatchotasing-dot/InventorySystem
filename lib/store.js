"use client";

// React Context เก็บข้อมูลคลังสินค้าทั้งระบบ
// โหลดจาก Supabase ครั้งเดียวตอนเข้าระบบ แล้วเก็บไว้ในหน่วยความจำเพื่อให้หน้าจอเร็ว
// ทุกการแก้ไขจะเขียนขึ้น Supabase ก่อน แล้วค่อยอัปเดตหน่วยความจำ (ถ้าเขียนพลาดจะไม่เปลี่ยนสถานะ)

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as api from "./api";
import { useAuth } from "./auth";
import {
  binQty,
  itemsOfSale,
  placedQty,
  placementsIn,
  prodById,
  prodName,
  stockMap,
  stockOf,
  stockTotal,
  whById,
  whName,
  whTotal,
  zonesOf,
} from "./db";

const EMPTY = {
  products: [],
  warehouses: [],
  txns: [],
  locations: [],
  placements: [],
  sales: [],
  saleItems: [],
};

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
        return;
      }

      // มีข้อมูลเดิมอยู่แต่ยังไม่มีผังที่เก็บ (อัปเกรดจากรุ่นก่อน) → สร้างผังให้
      const added = await api.seedLocationsIfEmpty(data);
      setDb(added ? { ...data, locations: added.locations } : data);
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

  /* ------------------------------------------------ รายการเคลื่อนไหว */

  const addTxns = useCallback(async (rows) => {
    await api.insertTxns(rows);
    setDb((prev) =>
      prev ? { ...prev, txns: [...prev.txns, ...rows].sort((a, b) => a.ts - b.ts) } : prev
    );
  }, []);

  /* ------------------------------------------------------------ สินค้า */

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

  const removeProduct = useCallback(async (id) => {
    await api.deleteProduct(id);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            products: prev.products.filter((p) => p.id !== id),
            txns: prev.txns.filter((t) => t.productId !== id),
            placements: prev.placements.filter((pl) => pl.productId !== id),
          }
        : prev
    );
  }, []);

  /* ------------------------------------------------- ผังที่เก็บสินค้า */

  const saveLocation = useCallback(async (location) => {
    await api.upsertLocation(location);
    setDb((prev) => {
      if (!prev) return prev;
      const i = prev.locations.findIndex((l) => l.id === location.id);
      const locations =
        i >= 0
          ? prev.locations.map((l, k) => (k === i ? { ...l, ...location } : l))
          : [...prev.locations, location];
      return { ...prev, locations };
    });
  }, []);

  const removeLocation = useCallback(async (id) => {
    await api.deleteLocation(id);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            locations: prev.locations.filter((l) => l.id !== id),
            placements: prev.placements.filter((pl) => pl.locationId !== id),
          }
        : prev
    );
  }, []);

  const savePlacement = useCallback(async (placement) => {
    await api.upsertPlacement(placement);
    setDb((prev) => {
      if (!prev) return prev;
      const i = prev.placements.findIndex(
        (pl) => pl.productId === placement.productId && pl.locationId === placement.locationId
      );
      const placements =
        i >= 0
          ? prev.placements.map((pl, k) => (k === i ? { ...pl, ...placement, id: pl.id } : pl))
          : [...prev.placements, placement];
      return { ...prev, placements };
    });
  }, []);

  const removePlacement = useCallback(async (id) => {
    await api.deletePlacement(id);
    setDb((prev) =>
      prev ? { ...prev, placements: prev.placements.filter((pl) => pl.id !== id) } : prev
    );
  }, []);

  /* -------------------------------------------------------- การขาย POS */

  /**
   * บันทึกบิลขาย — เขียน sales / sale_items / txns พร้อมกันในฝั่งฐานข้อมูล
   * @param {object} sale
   * @param {Array} items รายการที่มี txnId มาแล้ว
   */
  const addSale = useCallback(async (sale, items) => {
    await api.createSale(sale, items);

    const txns = items.map((i) => ({
      id: i.txnId,
      type: "SALE",
      docNo: sale.docNo,
      date: sale.date,
      productId: i.productId,
      qty: i.qty,
      whId: sale.whId,
      whTo: "",
      note: "ขายหน้าร้าน",
      ref: sale.docNo,
      user: sale.user,
      ts: sale.ts,
    }));

    setDb((prev) =>
      prev
        ? {
            ...prev,
            sales: [...prev.sales, sale].sort((a, b) => a.ts - b.ts),
            saleItems: [...prev.saleItems, ...items.map(({ txnId, ...rest }) => rest)],
            txns: [...prev.txns, ...txns].sort((a, b) => a.ts - b.ts),
          }
        : prev
    );
  }, []);

  /* --------------------------------------------------------- ทั้งระบบ */

  const importAll = useCallback(async (data) => {
    const full = { ...EMPTY, ...data };
    await api.replaceAll(full);
    setDb({
      ...full,
      txns: [...full.txns].sort((a, b) => a.ts - b.ts),
      sales: [...full.sales].sort((a, b) => a.ts - b.ts),
    });
  }, []);

  const resetSeed = useCallback(async () => {
    const fresh = await api.resetToSeed();
    setDb(fresh);
  }, []);

  /* ---------------------------------------------------------- derived */

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
      saveLocation,
      removeLocation,
      savePlacement,
      removePlacement,
      addSale,
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

      zonesOf: (wid) => (db ? zonesOf(db, wid) : []),
      placementsIn: (lid) => (db ? placementsIn(db, lid) : []),
      binQty: (lid) => (db ? binQty(db, lid) : 0),
      placedQty: (pid, wid) => (db ? placedQty(db, pid, wid) : 0),
      itemsOfSale: (sid) => (db ? itemsOfSale(db, sid) : []),
    }),
    [
      db, error, seeded, stock, reload,
      addTxns, saveProduct, removeProduct,
      saveLocation, removeLocation, savePlacement, removePlacement,
      addSale, importAll, resetSeed,
    ]
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInv() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error("useInv ต้องอยู่ภายใน InventoryProvider");
  return ctx;
}
