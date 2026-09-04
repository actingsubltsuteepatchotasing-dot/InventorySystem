"use client";

// React Context เก็บข้อมูลคลังสินค้าทั้งระบบ
// โหลดจาก Supabase ครั้งเดียวตอนเข้าระบบ แล้วเก็บไว้ในหน่วยความจำเพื่อให้หน้าจอเร็ว
// ทุกการแก้ไขจะเขียนขึ้น Supabase ก่อน แล้วค่อยอัปเดตหน่วยความจำ (ถ้าเขียนพลาดจะไม่เปลี่ยนสถานะ)

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as api from "./api";
import { useAuth } from "./auth";
import { uid } from "./format";
import {
  applyPlacementChanges,
  binQty,
  checkWhLoc,
  docGroupOf,
  firstLocOf,
  itemsOfSale,
  locById,
  locInWh,
  locName,
  locsOf,
  placedIn,
  placedQty,
  placementsFromTxns,
  placementsIn,
  planPlacementChanges,
  prodById,
  prodName,
  stockMap,
  stockOf,
  stockTotal,
  whById,
  whLocName,
  whName,
  whTotal,
  zonesOf,
} from "./db";

/**
 * ข้อความบอกว่าของในช่องเก็บไหนไม่พอ
 * เขียนแยกไว้เพราะทั้งการบันทึกเอกสารและการขายใช้ข้อความชุดเดียวกัน
 */
function shortageMessage(db, shortages) {
  return shortages
    .map((s) => {
      const p = prodById(db, s.productId);
      return (
        "ของในช่องเก็บ " + locName(db, s.locationId) +
        " ไม่พอสำหรับ " + (p ? p.name : s.productId) +
        " (มีอยู่ " + s.available + " ต้องการ " + s.need + ")"
      );
    })
    .join(" · ");
}

const EMPTY = {
  products: [],
  warehouses: [],
  txns: [],
  locations: [],
  placements: [],
  sales: [],
  saleItems: [],
  docGroups: [],
  customers: [],
};

const InventoryContext = createContext(null);

export function InventoryProvider({ children }) {
  const { user } = useAuth();
  const [db, setDb] = useState(null);
  const [error, setError] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [missingTables, setMissingTables] = useState([]);

  const reload = useCallback(async () => {
    setError("");
    try {
      const data = await api.loadAll();
      setMissingTables(data.missingTables || []);

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

  /**
   * บันทึกรายการเคลื่อนไหว พร้อมปรับผังที่เก็บไปด้วยเสมอ
   *
   * คลังกับที่เก็บต้องไปด้วยกันตลอด รายการที่บันทึกจึงต้องทำให้ของในช่องเก็บ
   * ขยับตามไปด้วย ไม่งั้นผังที่เก็บกับยอดคงเหลือจะเพี้ยนกันทันทีที่ทำรายการแรก
   */
  const addTxns = useCallback(
    async (rows) => {
      if (!db) throw new Error("ยังโหลดข้อมูลไม่เสร็จ");

      const plan = planPlacementChanges(db, rows, uid);
      if (plan.shortages.length) {
        throw new Error(shortageMessage(db, plan.shortages));
      }

      await api.insertTxns(rows);
      // ถ้าขั้นนี้พลาด รายการถูกบันทึกแล้วแต่ผังยังไม่ขยับ
      // หน้าจอผังที่เก็บจะขึ้นเตือนว่ายังระบุตำแหน่งไม่ครบ และซ่อมได้จากตรงนั้น
      await api.applyPlacementPlan(plan);

      setDb((prev) =>
        prev
          ? {
              ...prev,
              txns: [...prev.txns, ...rows].sort((a, b) => a.ts - b.ts),
              placements: applyPlacementChanges(prev.placements, plan),
            }
          : prev
      );
    },
    [db]
  );

  /** ซ่อมผังที่เก็บให้ตรงกับรายการเคลื่อนไหวทั้งหมด */
  const rebuildPlacements = useCallback(async () => {
    if (!db) throw new Error("ยังโหลดข้อมูลไม่เสร็จ");
    const fresh = placementsFromTxns(db.txns);
    await api.replacePlacements(fresh);
    setDb((prev) => (prev ? { ...prev, placements: fresh } : prev));
    return fresh.length;
  }, [db]);

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

  /* ------------------------------------------------------- คลังสินค้า */

  const saveWarehouse = useCallback(async (warehouse) => {
    await api.upsertWarehouse(warehouse);
    setDb((prev) => {
      if (!prev) return prev;
      const i = prev.warehouses.findIndex((w) => w.id === warehouse.id);
      const warehouses =
        i >= 0
          ? prev.warehouses.map((w, k) => (k === i ? { ...w, ...warehouse } : w))
          : [...prev.warehouses, warehouse];
      return { ...prev, warehouses };
    });
  }, []);

  const removeWarehouse = useCallback(async (id) => {
    await api.deleteWarehouse(id);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            warehouses: prev.warehouses.filter((w) => w.id !== id),
            // ช่องเก็บของคลังนี้ถูกลบตามไปด้วยที่ฐานข้อมูล (on delete cascade)
            locations: prev.locations.filter((l) => l.whId !== id),
          }
        : prev
    );
  }, []);

  /* ------------------------------------------------------- กลุ่มเอกสาร */

  const saveDocGroup = useCallback(async (group) => {
    await api.upsertDocGroup(group);
    setDb((prev) => {
      if (!prev) return prev;
      const list = prev.docGroups || [];
      const i = list.findIndex((g) => g.id === group.id);
      const docGroups =
        i >= 0 ? list.map((g, k) => (k === i ? { ...g, ...group } : g)) : [...list, group];
      return { ...prev, docGroups };
    });
  }, []);

  /* ------------------------------------------------------------ ลูกค้า */

  const saveCustomer = useCallback(async (customer) => {
    await api.upsertCustomer(customer);
    setDb((prev) => {
      if (!prev) return prev;
      const list = prev.customers || [];
      const i = list.findIndex((c) => c.id === customer.id);
      const customers =
        i >= 0 ? list.map((c, k) => (k === i ? { ...c, ...customer } : c)) : [...list, customer];
      return { ...prev, customers };
    });
  }, []);

  const removeCustomer = useCallback(async (id) => {
    await api.deleteCustomer(id);
    setDb((prev) =>
      prev ? { ...prev, customers: (prev.customers || []).filter((c) => c.id !== id) } : prev
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
  const addSale = useCallback(
    async (sale, items) => {
      if (!db) throw new Error("ยังโหลดข้อมูลไม่เสร็จ");

      const txns = items.map((i) => ({
        id: i.txnId,
        type: "SALE",
        docNo: sale.docNo,
        date: sale.date,
        productId: i.productId,
        qty: i.qty,
        whId: sale.whId,
        whTo: "",
        locId: i.locId || sale.locId || "",
        locTo: "",
        note: "ขายหน้าร้าน",
        ref: sale.docNo,
        user: sale.user,
        ts: sale.ts,
      }));

      // ตรวจของในช่องเก็บก่อนยิงขึ้นฐานข้อมูล จะได้ขึ้นข้อความที่อ่านรู้เรื่อง
      // ฝั่งฐานข้อมูลใน create_sale ก็ตรวจซ้ำอีกชั้นและตัดของในช่องให้เอง
      const plan = planPlacementChanges(db, txns, uid);
      if (plan.shortages.length) {
        throw new Error(shortageMessage(db, plan.shortages));
      }

      await api.createSale(sale, items);

      setDb((prev) =>
        prev
          ? {
              ...prev,
              sales: [...prev.sales, sale].sort((a, b) => a.ts - b.ts),
              saleItems: [...prev.saleItems, ...items.map(({ txnId, locId, ...rest }) => rest)],
              txns: [...prev.txns, ...txns].sort((a, b) => a.ts - b.ts),
              placements: applyPlacementChanges(prev.placements, plan),
            }
          : prev
      );
    },
    [db]
  );

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

      // ตารางของฟีเจอร์ใหม่ที่ยังไม่ได้สร้างในฐานข้อมูล
      missingTables,
      locationsReady: api.locationsReady(missingTables),
      salesReady: api.salesReady(missingTables),
      docGroupsReady: api.docGroupsReady(missingTables),
      customersReady: api.customersReady(missingTables),

      addTxns,
      rebuildPlacements,
      saveProduct,
      removeProduct,
      saveWarehouse,
      removeWarehouse,
      saveDocGroup,
      saveCustomer,
      removeCustomer,
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

      // ---------------------------------------------- ที่เก็บสินค้า
      loc: (id) => (db ? locById(db, id) : undefined),
      locsOf: (wid) => (db ? locsOf(db, wid) : []),
      firstLocOf: (wid) => (db ? firstLocOf(db, wid) : ""),
      locName: (id) => (db ? locName(db, id) : "—"),
      whLocName: (wid, lid) => (db ? whLocName(db, wid, lid) : ""),
      locInWh: (lid, wid) => (db ? locInWh(db, lid, wid) : false),
      checkWhLoc: (wid, lid, label) => (db ? checkWhLoc(db, wid, lid, label) : "ยังโหลดข้อมูลไม่เสร็จ"),
      placedIn: (pid, lid) => (db ? placedIn(db, pid, lid) : 0),

      zonesOf: (wid) => (db ? zonesOf(db, wid) : []),
      placementsIn: (lid) => (db ? placementsIn(db, lid) : []),
      binQty: (lid) => (db ? binQty(db, lid) : 0),
      placedQty: (pid, wid) => (db ? placedQty(db, pid, wid) : 0),
      itemsOfSale: (sid) => (db ? itemsOfSale(db, sid) : []),

      // กลุ่มเอกสารของชนิดรายการ ยังไม่ได้ตั้งค่าก็ได้ค่าเริ่มต้นเดิมกลับไป
      docGroup: (type) => docGroupOf(db, type),
    }),
    [
      db, error, seeded, missingTables, stock, reload,
      addTxns, rebuildPlacements, saveProduct, removeProduct,
      saveWarehouse, removeWarehouse, saveDocGroup, saveCustomer, removeCustomer,
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
