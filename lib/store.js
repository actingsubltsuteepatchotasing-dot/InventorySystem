"use client";

// React Context เก็บข้อมูลคลังสินค้าทั้งระบบ
// โหลดจาก Supabase ครั้งเดียวตอนเข้าระบบ แล้วเก็บไว้ในหน่วยความจำเพื่อให้หน้าจอเร็ว
// ทุกการแก้ไขจะเขียนขึ้น Supabase ก่อน แล้วค่อยอัปเดตหน่วยความจำ (ถ้าเขียนพลาดจะไม่เปลี่ยนสถานะ)

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as api from "./api";
import { useAuth } from "./auth";
import { SHIP_START } from "./constants";
import { uid } from "./format";
import {
  applyPlacementChanges,
  binQty,
  checkWhLoc,
  customerAddress,
  docGroupOf,
  firstLocOf,
  itemsOfCount,
  itemsOfInvoice,
  itemsOfPurchase,
  itemsOfReturn,
  itemsOfSale,
  appUserOf,
  isAdminOf,
  permOf,
  returnedQtyOf,
  shipEventsOf,
  shipTimeline,
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
  company: null,
  invoices: [],
  invoiceItems: [],
  perms: [],
  suppliers: [],
  purchases: [],
  purchaseItems: [],
  purchaseReturns: [],
  purchaseReturnItems: [],
  stockCounts: [],
  stockCountItems: [],
  shipEvents: [],
  sqlConnections: [],
  salespersons: [],
  salesTargets: [],
  printForms: [],
  productTerms: [],
  customerKinds: [],
  crmLeads: [],
  crmDeals: [],
  crmActivities: [],
  vocChannels: [],
  vocRecords: [],
  vocSurveys: [],
  vocResults: [],
  vocActions: [],
  vocLevels: [],
  appUsers: [],
  userPerms: [],
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

  /**
   * โหลดข้อมูลใหม่โดยไม่ล้างหน้าจอถ้าพลาด
   *
   * ต่างจาก reload ตรงที่ reload ตั้ง db เป็น null เมื่อโหลดไม่สำเร็จ
   * ซึ่งถูกสำหรับตอนเข้าระบบครั้งแรก เพราะยังไม่มีอะไรให้แสดงอยู่แล้ว
   * แต่ผิดสำหรับการรีเฟรชเป็นระยะ เน็ตกระตุกทีเดียวหน้าที่เปิดค้างไว้จะกลายเป็นหน้า error
   * จึงคงข้อมูลเดิมไว้บนจอแล้วโยน error กลับให้ผู้เรียกตัดสินใจเอง
   */
  const refresh = useCallback(async () => {
    const data = await api.loadAll();
    setMissingTables(data.missingTables || []);
    setDb(data);
  }, []);

  useEffect(() => {
    if (!user) {
      setDb(null);
      setError("");
      return;
    }

    /*
     * ลงทะเบียนตัวเองเข้าทะเบียนผู้ใช้ก่อนโหลดข้อมูล
     *
     * ฐานข้อมูลมี trigger รับผู้ใช้ใหม่อยู่แล้ว แต่บางโปรเจกต์สร้าง trigger บน
     * schema auth ไม่ได้เพราะสิทธิ์ถูกจำกัด ถ้าพึ่ง trigger อย่างเดียว
     * ผู้ใช้จะไม่โผล่ในทะเบียน แล้วแอดมินจะตั้งสิทธิให้ไม่ได้เลย
     *
     * ทำก่อนโหลด เพื่อให้แถวของตัวเองติดมากับข้อมูลรอบแรกเลย ไม่ต้องรอรอบถัดไป
     * ล้มเหลวก็ไม่เป็นไร ตัวมันกลืน error ไว้เองและระบบยังใช้งานได้ตามปกติ
     */
    let cancelled = false;
    api.ensureAppUser(user).then(() => {
      if (!cancelled) reload();
    });
    return () => {
      cancelled = true;
    };
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

  /* ------------------------------------------------------ ข้อมูลกิจการ */

  const saveCompany = useCallback(async (company) => {
    await api.saveCompany(company);
    setDb((prev) => (prev ? { ...prev, company: { ...company, id: "main" } } : prev));
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

  /* ---------------------------------------------------------- เจ้าหนี้ */

  const saveSupplier = useCallback(async (supplier) => {
    await api.upsertSupplier(supplier);
    setDb((prev) => {
      if (!prev) return prev;
      const list = prev.suppliers || [];
      const i = list.findIndex((c) => c.id === supplier.id);
      const suppliers =
        i >= 0 ? list.map((c, k) => (k === i ? { ...c, ...supplier } : c)) : [...list, supplier];
      return { ...prev, suppliers };
    });
  }, []);

  const removeSupplier = useCallback(async (id) => {
    await api.deleteSupplier(id);
    setDb((prev) =>
      prev ? { ...prev, suppliers: (prev.suppliers || []).filter((c) => c.id !== id) } : prev
    );
  }, []);

  /* ------------------------------------------ ซื้อสินค้าและบริการ */

  const addPurchase = useCallback(
    async (purchase, items) => {
      if (!db) throw new Error("ยังโหลดข้อมูลไม่เสร็จ");

      const txns = items.map((i) => ({
        id: i.txnId,
        type: "RECEIVE",
        docNo: purchase.docNo,
        date: purchase.date,
        productId: i.productId,
        qty: i.qty,
        whId: i.whId,
        whTo: "",
        locId: i.locId || "",
        locTo: "",
        note: "ซื้อสินค้าและบริการ",
        ref: purchase.refNo || purchase.docNo,
        user: purchase.user,
        ts: purchase.ts,
      }));

      // รับของเข้าไม่มีทางของไม่พอ แต่ยังคำนวณผังผ่านทางเดิมเพื่อให้ยอดในช่องเก็บตรงกัน
      const plan = planPlacementChanges(db, txns, uid);
      if (plan.shortages.length) throw new Error(shortageMessage(db, plan.shortages));

      await api.createPurchase(purchase, items);

      setDb((prev) =>
        prev
          ? {
              ...prev,
              purchases: [...(prev.purchases || []), purchase].sort((a, b) => a.ts - b.ts),
              purchaseItems: [
                ...(prev.purchaseItems || []),
                ...items.map(({ txnId, plId, ...rest }) => rest),
              ],
              txns: [...prev.txns, ...txns].sort((a, b) => a.ts - b.ts),
              placements: applyPlacementChanges(prev.placements, plan),
            }
          : prev
      );
    },
    [db]
  );

  /* ---------------------------------------- ส่งคืนสินค้าและบริการ */

  const addPurchaseReturn = useCallback(
    async (ret, items) => {
      if (!db) throw new Error("ยังโหลดข้อมูลไม่เสร็จ");

      const txns = items.map((i) => ({
        id: i.txnId,
        type: "ISSUE",
        docNo: ret.docNo,
        date: ret.date,
        productId: i.productId,
        qty: i.qty,
        whId: i.whId,
        whTo: "",
        locId: i.locId || "",
        locTo: "",
        note: "ส่งคืนสินค้าและบริการ",
        ref: ret.purDocNo || "",
        user: ret.user,
        ts: ret.ts,
      }));

      const plan = planPlacementChanges(db, txns, uid);
      if (plan.shortages.length) throw new Error(shortageMessage(db, plan.shortages));

      await api.createPurchaseReturn(ret, items);

      setDb((prev) =>
        prev
          ? {
              ...prev,
              purchaseReturns: [...(prev.purchaseReturns || []), ret].sort((a, b) => a.ts - b.ts),
              purchaseReturnItems: [
                ...(prev.purchaseReturnItems || []),
                ...items.map(({ txnId, ...rest }) => rest),
              ],
              txns: [...prev.txns, ...txns].sort((a, b) => a.ts - b.ts),
              placements: applyPlacementChanges(prev.placements, plan),
            }
          : prev
      );
    },
    [db]
  );

  /* ------------------------------------------------- ฟอร์มพิมพ์ */

  const savePrintForm = useCallback(async (f) => {
    await api.upsertPrintForm(f);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            printForms: [
              // ตั้งเป็นค่าเริ่มต้นได้ทีละหนึ่งฟอร์มต่อชนิดเอกสาร อันอื่นถูกปลดให้เอง
              ...(prev.printForms || [])
                .filter((x) => x.id !== f.id)
                .map((x) =>
                  f.isDefault && x.docKind === f.docKind ? { ...x, isDefault: false } : x
                ),
              f,
            ].sort((a, b) => a.name.localeCompare(b.name, "th")),
          }
        : prev
    );
  }, []);

  const removePrintForm = useCallback(async (id) => {
    await api.deletePrintForm(id);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            printForms: (prev.printForms || []).filter((x) => x.id !== id),
            // กลุ่มเอกสารที่อ้างฟอร์มนี้ต้องกลับไปใช้ฟอร์มมาตรฐานทันที
            // ไม่ใช่รอโหลดใหม่ ไม่งั้นหน้าจอจะยังโชว์ฟอร์มที่ลบไปแล้ว
            docGroups: (prev.docGroups || []).map((g) =>
              g.formId === id ? { ...g, formId: "" } : g
            ),
          }
        : prev
    );
  }, []);

  /* ------------------------------------------ พนักงานขายและเป้าขาย */

  const saveSalesperson = useCallback(async (p) => {
    await api.upsertSalesperson(p);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            salespersons: [...(prev.salespersons || []).filter((x) => x.id !== p.id), p].sort(
              (a, b) => a.code.localeCompare(b.code, "th")
            ),
          }
        : prev
    );
  }, []);

  const removeSalesperson = useCallback(async (id) => {
    await api.deleteSalesperson(id);
    setDb((prev) =>
      prev
        ? { ...prev, salespersons: (prev.salespersons || []).filter((x) => x.id !== id) }
        : prev
    );
  }, []);

  const saveCustomerKind = useCallback(async (k) => {
    await api.upsertCustomerKind(k);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            customerKinds: [...(prev.customerKinds || []).filter((x) => x.id !== k.id), k].sort(
              (a, b) => a.code.localeCompare(b.code, "th")
            ),
          }
        : prev
    );
  }, []);

  /*
   * ลบประเภทลูกค้า — ไม่แตะลูกค้าที่ใช้ชื่อนั้นอยู่
   *
   * ลูกค้าเก็บชื่อประเภทเป็นข้อความของตัวเอง ไม่ได้อ้างถึงแถวในทะเบียน
   * ลบแล้วลูกค้ายังมีค่าเดิมครบ และใบขายเก่าที่คัดลอกค่าไว้ก็ไม่เปลี่ยน
   * แค่ค่านั้นจะกลายเป็น "ยังไม่ได้จดทะเบียน" ในช่องเลือก
   */
  const removeCustomerKind = useCallback(async (id) => {
    await api.deleteCustomerKind(id);
    setDb((prev) =>
      prev ? { ...prev, customerKinds: (prev.customerKinds || []).filter((x) => x.id !== id) } : prev
    );
  }, []);

  const saveProductTerm = useCallback(async (t) => {
    await api.upsertProductTerm(t);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            productTerms: [...(prev.productTerms || []).filter((x) => x.id !== t.id), t].sort(
              (a, b) => a.code.localeCompare(b.code, "th")
            ),
          }
        : prev
    );
  }, []);

  /*
   * ลบรายการในทะเบียน — ไม่แตะสินค้าที่ใช้ชื่อนั้นอยู่
   *
   * ตัวสินค้าเก็บชื่อไว้เป็นข้อความของตัวเอง ไม่ได้อ้างถึงแถวในทะเบียน
   * ลบทะเบียนแล้วสินค้ายังมีค่าเดิมครบ เป้าขายก็ยังจับคู่ได้เหมือนเดิม
   * แค่ค่านั้นจะกลายเป็น "ยังไม่ได้จดทะเบียน" ในช่องเลือก
   */
  const removeProductTerm = useCallback(async (id) => {
    await api.deleteProductTerm(id);
    setDb((prev) =>
      prev ? { ...prev, productTerms: (prev.productTerms || []).filter((x) => x.id !== id) } : prev
    );
  }, []);

  /* ------------------------------------------ งานลูกค้าสัมพันธ์ (CRM) */

  const saveLead = useCallback(async (l) => {
    await api.upsertLead(l);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            crmLeads: [...(prev.crmLeads || []).filter((x) => x.id !== l.id), l].sort((a, b) =>
              a.code.localeCompare(b.code, "th")
            ),
          }
        : prev
    );
  }, []);

  /*
   * ลบผู้สนใจ — ดีลและกิจกรรมที่อ้างอยู่ไม่ถูกลบตาม
   *
   * ฐานข้อมูลตั้ง on delete set null ไว้ ของที่อ้างจึงกลายเป็น "ไม่ระบุคู่ค้า"
   * แต่ยังเก็บชื่อที่คัดลอกไว้ตอนบันทึก (partyName) จึงไม่กลายเป็นแถวไร้ชื่อ
   * ต้องล้างค่าในหน่วยความจำให้ตรงกับฐานข้อมูลด้วย ไม่งั้นหน้าจอจะยังโชว์ของที่หายไปแล้ว
   */
  const removeLead = useCallback(async (id) => {
    await api.deleteLead(id);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            crmLeads: (prev.crmLeads || []).filter((x) => x.id !== id),
            crmDeals: (prev.crmDeals || []).map((d) =>
              d.leadId === id ? { ...d, leadId: "" } : d
            ),
            crmActivities: (prev.crmActivities || []).map((a) =>
              a.leadId === id ? { ...a, leadId: "" } : a
            ),
          }
        : prev
    );
  }, []);

  const saveDeal = useCallback(async (d) => {
    await api.upsertDeal(d);
    setDb((prev) =>
      prev
        ? { ...prev, crmDeals: [...(prev.crmDeals || []).filter((x) => x.id !== d.id), d] }
        : prev
    );
  }, []);

  const removeDeal = useCallback(async (id) => {
    await api.deleteDeal(id);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            crmDeals: (prev.crmDeals || []).filter((x) => x.id !== id),
            crmActivities: (prev.crmActivities || []).map((a) =>
              a.dealId === id ? { ...a, dealId: "" } : a
            ),
          }
        : prev
    );
  }, []);

  const saveActivity = useCallback(async (a) => {
    await api.upsertActivity(a);
    setDb((prev) =>
      prev
        ? { ...prev, crmActivities: [...(prev.crmActivities || []).filter((x) => x.id !== a.id), a] }
        : prev
    );
  }, []);

  const removeActivity = useCallback(async (id) => {
    await api.deleteActivity(id);
    setDb((prev) =>
      prev ? { ...prev, crmActivities: (prev.crmActivities || []).filter((x) => x.id !== id) } : prev
    );
  }, []);

  /* --------------------------------- ผู้ใช้ในระบบ และสิทธิรายคน */

  const saveAppUser = useCallback(async (u) => {
    await api.upsertAppUser(u);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            appUsers: [...(prev.appUsers || []).filter((x) => x.id !== u.id), u].sort((a, b) =>
              a.email.localeCompare(b.email, "th")
            ),
          }
        : prev
    );
  }, []);

  /* ลบผู้ใช้ออกจากทะเบียน — สิทธิรายคนของคนนั้นถูกลบตามด้วย (cascade) */
  const removeAppUser = useCallback(async (id) => {
    await api.deleteAppUser(id);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            appUsers: (prev.appUsers || []).filter((x) => x.id !== id),
            userPerms: (prev.userPerms || []).filter((x) => x.userId !== id),
          }
        : prev
    );
  }, []);

  /*
   * บันทึกสิทธิรายคนทีเดียวทั้งหน้า
   *
   * ส่งไปก้อนเดียวแทนที่จะยิงทีละหน้าจอ เพราะหน้าจอมีห้าสิบกว่าหน้า
   * ยิงทีละแถวคือห้าสิบกว่าคำขอต่อการกดบันทึกหนึ่งครั้ง
   * และถ้าขาดกลางคันจะได้สิทธิที่บันทึกไปครึ่งเดียวโดยไม่มีใครรู้
   */
  const saveUserPerms = useCallback(async (rows) => {
    await api.saveUserPerms(rows);
    setDb((prev) => {
      if (!prev) return prev;
      const ids = rows.map((r) => r.id);
      return {
        ...prev,
        userPerms: [...(prev.userPerms || []).filter((x) => !ids.includes(x.id)), ...rows],
      };
    });
  }, []);

  /* ล้างสิทธิเฉพาะตัว กลับไปใช้ค่าเริ่มต้นของทุกคน */
  const clearUserPerms = useCallback(async (userId) => {
    await api.clearUserPerms(userId);
    setDb((prev) =>
      prev
        ? { ...prev, userPerms: (prev.userPerms || []).filter((x) => x.userId !== userId) }
        : prev
    );
  }, []);

  /* --------------------------------- การรับฟังลูกค้า (SE-AM หมวด 3) */

  /*
   * ทุกตัวในหมวดนี้ใช้รูปแบบเดียวกัน: บันทึกขึ้นฐานข้อมูลก่อน แล้วค่อยแก้ในหน่วยความจำ
   * บันทึกไม่ผ่านจะโยน error ออกไปโดยที่หน่วยความจำยังเป็นของเดิม
   * หน้าจอจึงไม่มีทางแสดงของที่ฐานข้อมูลไม่มี (เคยพลาดมาแล้วตอนทำหน้าเป้าขาย)
   */

  const saveVocChannel = useCallback(async (c) => {
    await api.upsertVocChannel(c);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            vocChannels: [...(prev.vocChannels || []).filter((x) => x.id !== c.id), c].sort((a, b) =>
              a.code.localeCompare(b.code, "th")
            ),
          }
        : prev
    );
  }, []);

  /*
   * ลบช่องทาง — เสียงลูกค้าอ้างช่องทางแบบ restrict ฐานข้อมูลจะปฏิเสธถ้ายังมีคนอ้างอยู่
   * จงใจให้ปฏิเสธ เพราะเสียงลูกค้าที่ไม่รู้ว่ามาจากช่องทางไหน
   * ใช้ตรวจความครอบคลุมของช่องทางไม่ได้เลย ซึ่งเป็นหัวใจของเกณฑ์ระดับ 2 และ 3
   */
  const removeVocChannel = useCallback(async (id) => {
    await api.deleteVocChannel(id);
    setDb((prev) =>
      prev ? { ...prev, vocChannels: (prev.vocChannels || []).filter((x) => x.id !== id) } : prev
    );
  }, []);

  const saveVocRecord = useCallback(async (r) => {
    await api.upsertVocRecord(r);
    setDb((prev) =>
      prev
        ? { ...prev, vocRecords: [...(prev.vocRecords || []).filter((x) => x.id !== r.id), r] }
        : prev
    );
  }, []);

  const removeVocRecord = useCallback(async (id) => {
    await api.deleteVocRecord(id);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            vocRecords: (prev.vocRecords || []).filter((x) => x.id !== id),
            // แผนงานที่อ้างเรื่องนี้ไม่ถูกลบตาม ฐานข้อมูลตั้ง set null ไว้
            vocActions: (prev.vocActions || []).map((a) =>
              a.recordId === id ? { ...a, recordId: "" } : a
            ),
          }
        : prev
    );
  }, []);

  const saveVocSurvey = useCallback(async (v) => {
    await api.upsertVocSurvey(v);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            vocSurveys: [...(prev.vocSurveys || []).filter((x) => x.id !== v.id), v].sort((a, b) =>
              a.code.localeCompare(b.code, "th")
            ),
          }
        : prev
    );
  }, []);

  /* ลบรอบประเมิน — ผลของรอบนั้นถูกลบตามด้วย (cascade) ต้องล้างในหน่วยความจำให้ตรงกัน */
  const removeVocSurvey = useCallback(async (id) => {
    await api.deleteVocSurvey(id);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            vocSurveys: (prev.vocSurveys || []).filter((x) => x.id !== id),
            vocResults: (prev.vocResults || []).filter((x) => x.surveyId !== id),
            vocActions: (prev.vocActions || []).map((a) =>
              a.surveyId === id ? { ...a, surveyId: "" } : a
            ),
          }
        : prev
    );
  }, []);

  const saveVocResult = useCallback(async (r) => {
    await api.upsertVocResult(r);
    setDb((prev) =>
      prev
        ? { ...prev, vocResults: [...(prev.vocResults || []).filter((x) => x.id !== r.id), r] }
        : prev
    );
  }, []);

  const removeVocResult = useCallback(async (id) => {
    await api.deleteVocResult(id);
    setDb((prev) =>
      prev ? { ...prev, vocResults: (prev.vocResults || []).filter((x) => x.id !== id) } : prev
    );
  }, []);

  const saveVocAction = useCallback(async (a) => {
    await api.upsertVocAction(a);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            vocActions: [...(prev.vocActions || []).filter((x) => x.id !== a.id), a].sort((x, y) =>
              x.code.localeCompare(y.code, "th")
            ),
          }
        : prev
    );
  }, []);

  const removeVocAction = useCallback(async (id) => {
    await api.deleteVocAction(id);
    setDb((prev) =>
      prev ? { ...prev, vocActions: (prev.vocActions || []).filter((x) => x.id !== id) } : prev
    );
  }, []);

  /* บันทึกการยืนยันจุดตรวจ — หนึ่งจุดตรวจมีได้แถวเดียว จึงแทนที่ตาม checkId ไม่ใช่ตาม id */
  const saveVocLevel = useCallback(async (l) => {
    await api.upsertVocLevel(l);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            vocLevels: [...(prev.vocLevels || []).filter((x) => x.checkId !== l.checkId), l],
          }
        : prev
    );
  }, []);

  const removeVocLevel = useCallback(async (id) => {
    await api.deleteVocLevel(id);
    setDb((prev) =>
      prev ? { ...prev, vocLevels: (prev.vocLevels || []).filter((x) => x.id !== id) } : prev
    );
  }, []);

  const saveTarget = useCallback(async (t) => {
    await api.upsertTarget(t);
    setDb((prev) =>
      prev
        ? { ...prev, salesTargets: [...(prev.salesTargets || []).filter((x) => x.id !== t.id), t] }
        : prev
    );
  }, []);

  const removeTarget = useCallback(async (id) => {
    await api.deleteTarget(id);
    setDb((prev) =>
      prev
        ? { ...prev, salesTargets: (prev.salesTargets || []).filter((x) => x.id !== id) }
        : prev
    );
  }, []);

  /* ------------------------------------------ การเชื่อมต่อ SQL Server */

  const saveSqlConn = useCallback(async (conn) => {
    await api.upsertSqlConn(conn);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            sqlConnections: [
              // ตั้งเป็นค่าเริ่มต้นได้ทีละหนึ่งอันเท่านั้น อันอื่นต้องถูกปลดให้เอง
              ...(prev.sqlConnections || [])
                .filter((c) => c.id !== conn.id)
                .map((c) => (conn.isDefault ? { ...c, isDefault: false } : c)),
              conn,
            ].sort((a, b) => a.name.localeCompare(b.name, "th")),
          }
        : prev
    );
  }, []);

  const removeSqlConn = useCallback(async (id) => {
    await api.deleteSqlConn(id);
    setDb((prev) =>
      prev
        ? { ...prev, sqlConnections: (prev.sqlConnections || []).filter((c) => c.id !== id) }
        : prev
    );
  }, []);

  /* --------------------------------------------- ใบตรวจนับสินค้า */

  const addCount = useCallback(async (count, items) => {
    await api.createCount(count, items);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            stockCounts: [...(prev.stockCounts || []), count].sort((a, b) => a.ts - b.ts),
            stockCountItems: [...(prev.stockCountItems || []), ...items],
          }
        : prev
    );
  }, []);

  const setCounted = useCallback(async (itemId, counted) => {
    await api.saveCountItem(itemId, counted);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            stockCountItems: (prev.stockCountItems || []).map((i) =>
              i.id === itemId
                ? { ...i, counted, countedAt: counted === null ? 0 : Date.now() }
                : i
            ),
          }
        : prev
    );
  }, []);

  const closeCount = useCallback(async (id, postedDoc) => {
    await api.closeCount(id, postedDoc);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            stockCounts: (prev.stockCounts || []).map((c) =>
              c.id === id ? { ...c, status: "DONE", postedDoc: postedDoc || "" } : c
            ),
          }
        : prev
    );
  }, []);

  const removeCount = useCallback(async (id) => {
    await api.deleteCount(id);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            stockCounts: (prev.stockCounts || []).filter((c) => c.id !== id),
            stockCountItems: (prev.stockCountItems || []).filter((i) => i.countId !== id),
          }
        : prev
    );
  }, []);

  /* ------------------------------------------- สิทธิการใช้งานหน้าจอ */

  const savePerms = useCallback(async (list) => {
    await api.savePerms(list);
    setDb((prev) => {
      if (!prev) return prev;
      const byId = new Map((prev.perms || []).map((p) => [p.id, p]));
      list.forEach((p) => byId.set(p.id, { ...byId.get(p.id), ...p }));
      return { ...prev, perms: [...byId.values()] };
    });
  }, []);

  /* ------------------------------------------ ใบขายสินค้าและบริการ */

  const addInvoice = useCallback(
    async (invoice, items) => {
      if (!db) throw new Error("ยังโหลดข้อมูลไม่เสร็จ");

      const txns = items.map((i) => ({
        id: i.txnId,
        type: "SALE",
        docNo: invoice.docNo,
        date: invoice.date,
        productId: i.productId,
        qty: i.qty,
        whId: i.whId,
        whTo: "",
        locId: i.locId || "",
        locTo: "",
        note: "ขายสินค้าและบริการ",
        ref: invoice.docNo,
        user: invoice.user,
        ts: invoice.ts,
      }));

      // ตรวจของในช่องเก็บก่อนยิงขึ้นฐานข้อมูล จะได้ขึ้นข้อความที่อ่านรู้เรื่อง
      // ฝั่ง create_invoice ตรวจซ้ำอีกชั้นและตัดของในช่องให้เอง
      const plan = planPlacementChanges(db, txns, uid);
      if (plan.shortages.length) throw new Error(shortageMessage(db, plan.shortages));

      await api.createInvoice(invoice, items);

      // ใบใหม่ต้องมีเหตุการณ์ตั้งต้นด้วย ไม่งั้นรายงานเวลาจะไม่มีจุดเริ่มให้นับ
      // ถ้าเขียนไม่สำเร็จก็ไม่ยกเลิกการขาย เพราะของถูกตัดสต็อกไปแล้ว
      // และหน้ารายงานยังถอยไปใช้เวลาที่ออกใบแทนได้ (ดู shipTimeline)
      let startEvent = null;
      if (api.shipEventsReady(missingTables)) {
        startEvent = {
          id: uid(),
          invoiceId: invoice.id,
          docNo: invoice.docNo,
          status: invoice.shipStatus || SHIP_START,
          station: "ออกใบขาย",
          note: "",
          user: invoice.user || "",
          ts: invoice.ts,
        };
        try {
          await api.addShipEvent(startEvent);
        } catch (e) {
          startEvent = null;
        }
      }

      setDb((prev) =>
        prev
          ? {
              ...prev,
              shipEvents: startEvent
                ? [...(prev.shipEvents || []), startEvent]
                : prev.shipEvents || [],
              invoices: [...(prev.invoices || []), invoice].sort((a, b) => a.ts - b.ts),
              invoiceItems: [
                ...(prev.invoiceItems || []),
                ...items.map(({ txnId, ...rest }) => rest),
              ],
              txns: [...prev.txns, ...txns].sort((a, b) => a.ts - b.ts),
              placements: applyPlacementChanges(prev.placements, plan),
            }
          : prev
      );
    },
    [db, missingTables]
  );

  const setInvoiceDistance = useCallback(async (id, patch) => {
    await api.updateInvoiceDistance(id, patch);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            invoices: (prev.invoices || []).map((v) => (v.id === id ? { ...v, ...patch } : v)),
          }
        : prev
    );
  }, []);

  /**
   * เปลี่ยนสถานะจัดส่ง พร้อมบันทึกเป็นเหตุการณ์ไว้ด้วย
   *
   * เขียนเหตุการณ์ก่อนแล้วค่อยอัปเดตสถานะปัจจุบัน
   * ถ้าสลับลำดับกันแล้วพลาดกลางทาง จะได้ใบที่สถานะเดินไปแล้วแต่ไม่มีเวลาบันทึกไว้
   * ซึ่งเป็นข้อมูลที่ผิดแบบมองไม่เห็น รายงานเวลาจะเพี้ยนโดยไม่มีใครรู้
   * ทางกลับกันถ้าเหตุการณ์ถูกเขียนแล้วสถานะพลาด ยังเห็นได้ว่าสถานะไม่ขยับแล้วยิงซ้ำได้
   *
   * @param {object} [meta] { station, note, user } ข้อมูลของเหตุการณ์ครั้งนี้
   */
  const setInvoiceShip = useCallback(async (id, patch, meta) => {
    const ts = patch.shipTs || Date.now();
    let event = null;

    if (patch.shipStatus && api.shipEventsReady(missingTables)) {
      event = {
        id: uid(),
        invoiceId: id,
        docNo: (meta && meta.docNo) || "",
        status: patch.shipStatus,
        station: (meta && meta.station) || "",
        note: (meta && meta.note) || "",
        user: (meta && meta.user) || "",
        ts,
      };
      await api.addShipEvent(event);
    }

    await api.updateInvoiceShip(id, patch);
    setDb((prev) =>
      prev
        ? {
            ...prev,
            invoices: (prev.invoices || []).map((v) => (v.id === id ? { ...v, ...patch } : v)),
            shipEvents: event ? [...(prev.shipEvents || []), event] : prev.shipEvents || [],
          }
        : prev
    );
  }, [missingTables]);

  /* --------------------------------------------------------- ทั้งระบบ */

  const importAll = useCallback(async (data) => {
    const full = { ...EMPTY, ...data };
    await api.replaceAll(full);
    setDb({
      ...full,
      txns: [...full.txns].sort((a, b) => a.ts - b.ts),
      sales: [...full.sales].sort((a, b) => a.ts - b.ts),
      invoices: [...(full.invoices || [])].sort((a, b) => a.ts - b.ts),
      purchases: [...(full.purchases || [])].sort((a, b) => a.ts - b.ts),
      purchaseReturns: [...(full.purchaseReturns || [])].sort((a, b) => a.ts - b.ts),
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
      refresh,

      // ตารางของฟีเจอร์ใหม่ที่ยังไม่ได้สร้างในฐานข้อมูล
      missingTables,
      locationsReady: api.locationsReady(missingTables),
      salesReady: api.salesReady(missingTables),
      formsReady: api.formsReady(missingTables),
      docGroupsReady: api.docGroupsReady(missingTables),
      customersReady: api.customersReady(missingTables),
      companyReady: api.companyReady(missingTables),
      invoicesReady: api.invoicesReady(missingTables),
      permsReady: api.permsReady(missingTables),
      suppliersReady: api.suppliersReady(missingTables),
      purchasesReady: api.purchasesReady(missingTables),
      returnsReady: api.returnsReady(missingTables),
      countsReady: api.countsReady(missingTables),

      addTxns,
      rebuildPlacements,
      saveProduct,
      removeProduct,
      saveWarehouse,
      removeWarehouse,
      saveDocGroup,
      saveCustomer,
      removeCustomer,
      saveCompany,
      addInvoice,
      setInvoiceShip,
      setInvoiceDistance,
      savePerms,
      saveSupplier,
      removeSupplier,
      addPurchase,
      addPurchaseReturn,
      addCount,
      setCounted,
      closeCount,
      removeCount,
      saveSqlConn,
      removeSqlConn,
      saveSalesperson,
      removeSalesperson,
      saveProductTerm,
      removeProductTerm,
      saveCustomerKind,
      removeCustomerKind,
      saveLead,
      removeLead,
      saveDeal,
      removeDeal,
      saveActivity,
      removeActivity,
      savePrintForm,
      removePrintForm,
      saveTarget,
      removeTarget,
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
      itemsOfInvoice: (vid) => (db ? itemsOfInvoice(db, vid) : []),
      itemsOfPurchase: (pid) => (db ? itemsOfPurchase(db, pid) : []),
      itemsOfCount: (cid) => (db ? itemsOfCount(db, cid) : []),
      shipEventsOf: (vid) => (db ? shipEventsOf(db, vid) : []),
      shipTimeline: (v) => (db ? shipTimeline(db, v) : { steps: [], firstTs: 0, lastTs: 0, totalMs: 0 }),
      shipEventsReady: api.shipEventsReady(missingTables),
      sqlReady: api.sqlReady(missingTables),
      salespersonsReady: api.salespersonsReady(missingTables),
      targetsReady: api.targetsReady(missingTables),
      termsReady: api.termsReady(missingTables),
      custKindsReady: api.custKindsReady(missingTables),
      crmReady: api.crmReady(missingTables),
      vocReady: api.vocReady(missingTables),
      saveVocChannel,
      removeVocChannel,
      saveVocRecord,
      removeVocRecord,
      saveVocSurvey,
      removeVocSurvey,
      saveVocResult,
      removeVocResult,
      saveVocAction,
      removeVocAction,
      saveVocLevel,
      removeVocLevel,
      itemsOfReturn: (rid) => (db ? itemsOfReturn(db, rid) : []),
      returnedQty: (pid, itemId) => (db ? returnedQtyOf(db, pid, itemId) : 0),
      sup: (id) => (db ? (db.suppliers || []).find((c) => c.id === id) : undefined),
      /*
       * สิทธิของหน้าจอ — ผูกกับคนที่ล็อกอินอยู่
       * ลำดับการตัดสิน: สิทธิเฉพาะตัว > ค่าเริ่มต้นของทุกคน > เปิดหมด (ดู permOf)
       */
      perm: (screenId) => permOf(db, screenId, user && user.id),

      // ทะเบียนผู้ใช้และสิทธิรายคน
      usersReady: api.usersReady(missingTables),
      isAdmin: isAdminOf(db, user && user.id),
      me: appUserOf(db, user && user.id),
      saveAppUser,
      removeAppUser,
      saveUserPerms,
      clearUserPerms,
      cust: (id) => (db ? (db.customers || []).find((c) => c.id === id) : undefined),
      custAddress: (id) =>
        db ? customerAddress((db.customers || []).find((c) => c.id === id)) : "",

      // กลุ่มเอกสารของชนิดรายการ ยังไม่ได้ตั้งค่าก็ได้ค่าเริ่มต้นเดิมกลับไป
      docGroup: (type) => docGroupOf(db, type),
    }),
    [
      db, error, seeded, missingTables, stock, reload, refresh,
      addTxns, rebuildPlacements, saveProduct, removeProduct,
      saveWarehouse, removeWarehouse, saveDocGroup, saveCustomer, removeCustomer,
      saveCompany, addInvoice, setInvoiceShip, setInvoiceDistance, savePerms,
      saveSupplier, removeSupplier, addPurchase, addPurchaseReturn,
      addCount, setCounted, closeCount, removeCount,
      saveSqlConn, removeSqlConn, saveSalesperson, removeSalesperson, saveTarget, removeTarget,
      saveProductTerm, removeProductTerm, saveCustomerKind, removeCustomerKind,
      saveLead, removeLead, saveDeal, removeDeal, saveActivity, removeActivity,
      user,
      saveAppUser, removeAppUser, saveUserPerms, clearUserPerms,
      saveVocChannel, removeVocChannel, saveVocRecord, removeVocRecord,
      saveVocSurvey, removeVocSurvey, saveVocResult, removeVocResult,
      saveVocAction, removeVocAction, saveVocLevel, removeVocLevel,
      savePrintForm, removePrintForm,
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
