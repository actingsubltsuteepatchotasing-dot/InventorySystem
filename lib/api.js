// ชั้นข้อมูลบน Supabase — แปลงระหว่างคอลัมน์ snake_case กับ object camelCase ในแอป

import { rest } from "./supabase";
import { seed } from "./db";
import { uid } from "./format";

/* ------------------------------------------------------------- mappers */

const toProduct = (r) => ({
  id: r.id,
  code: r.code,
  name: r.name,
  unit: r.unit,
  cat: r.cat,
  price: Number(r.price) || 0,
  min: Number(r.min_qty) || 0,
  barcode: r.barcode || "",
  img: r.img || "",
  note: r.note || "",
});

const fromProduct = (p) => ({
  id: p.id,
  code: p.code,
  name: p.name,
  unit: p.unit,
  cat: p.cat || "ทั่วไป",
  price: Number(p.price) || 0,
  min_qty: Number(p.min) || 0,
  barcode: p.barcode || "",
  img: p.img || "",
  note: p.note || "",
});

const toWarehouse = (r) => ({
  id: r.id,
  code: r.code,
  name: r.name,
  province: r.province,
  lat: Number(r.lat),
  lng: Number(r.lng),
});

const fromWarehouse = (w) => ({
  id: w.id,
  code: w.code,
  name: w.name,
  province: w.province,
  lat: w.lat,
  lng: w.lng,
});

const toTxn = (r) => ({
  id: r.id,
  type: r.type,
  docNo: r.doc_no,
  date: r.date,
  productId: r.product_id,
  qty: Number(r.qty) || 0,
  whId: r.wh_id,
  whTo: r.wh_to || "",
  note: r.note || "",
  ref: r.ref || "",
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromTxn = (t) => ({
  id: t.id,
  type: t.type,
  doc_no: t.docNo,
  date: t.date,
  product_id: t.productId,
  qty: Number(t.qty) || 0,
  wh_id: t.whId,
  wh_to: t.whTo || null,
  note: t.note || "",
  ref: t.ref || "",
  user_name: t.user || "",
  ts: Number(t.ts) || 0,
});

const toLocation = (r) => ({
  id: r.id,
  whId: r.wh_id,
  code: r.code,
  name: r.name || "",
  zone: r.zone || "A",
  row: Number(r.row_no) || 1,
  col: Number(r.col_no) || 1,
  kind: r.kind || "shelf",
  capacity: Number(r.capacity) || 0,
  note: r.note || "",
});

const fromLocation = (l) => ({
  id: l.id,
  wh_id: l.whId,
  code: l.code,
  name: l.name || "",
  zone: l.zone || "A",
  row_no: Number(l.row) || 1,
  col_no: Number(l.col) || 1,
  kind: l.kind || "shelf",
  capacity: Number(l.capacity) || 0,
  note: l.note || "",
});

const toPlacement = (r) => ({
  id: r.id,
  productId: r.product_id,
  locationId: r.location_id,
  qty: Number(r.qty) || 0,
  note: r.note || "",
});

const fromPlacement = (p) => ({
  id: p.id,
  product_id: p.productId,
  location_id: p.locationId,
  qty: Number(p.qty) || 0,
  note: p.note || "",
});

const toSale = (r) => ({
  id: r.id,
  docNo: r.doc_no,
  date: r.date,
  whId: r.wh_id,
  customer: r.customer || "",
  subtotal: Number(r.subtotal) || 0,
  discount: Number(r.discount) || 0,
  vat: Number(r.vat) || 0,
  total: Number(r.total) || 0,
  paid: Number(r.paid) || 0,
  change: Number(r.change_amt) || 0,
  payMethod: r.pay_method || "CASH",
  user: r.user_name || "",
  note: r.note || "",
  ts: Number(r.ts) || 0,
});

const fromSale = (s) => ({
  id: s.id,
  doc_no: s.docNo,
  date: s.date,
  wh_id: s.whId,
  customer: s.customer || "",
  subtotal: Number(s.subtotal) || 0,
  discount: Number(s.discount) || 0,
  vat: Number(s.vat) || 0,
  total: Number(s.total) || 0,
  paid: Number(s.paid) || 0,
  change_amt: Number(s.change) || 0,
  pay_method: s.payMethod || "CASH",
  user_name: s.user || "",
  note: s.note || "",
  ts: Number(s.ts) || 0,
});

const toSaleItem = (r) => ({
  id: r.id,
  saleId: r.sale_id,
  productId: r.product_id,
  qty: Number(r.qty) || 0,
  price: Number(r.price) || 0,
  amount: Number(r.amount) || 0,
});

const fromSaleItem = (i) => ({
  id: i.id,
  sale_id: i.saleId,
  product_id: i.productId,
  qty: Number(i.qty) || 0,
  price: Number(i.price) || 0,
  amount: Number(i.amount) || 0,
});

/* ---------------------------------------------------------------- read */

/** ดึงข้อมูลทั้งหมด (แบ่งหน้าเพราะ PostgREST จำกัดจำนวนแถวต่อครั้ง) */
async function fetchAllRows(table, order) {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const rows = await rest(
      table + "?select=*" + (order ? "&order=" + order : "") + "&limit=" + PAGE + "&offset=" + from
    );
    if (!rows || !rows.length) break;
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * ตารางที่ระบบหลักต้องมี ถ้าขาดถือว่าใช้งานไม่ได้เลย
 * ส่วนตารางของฟีเจอร์ใหม่ ถ้ายังไม่มีให้ทำงานต่อได้โดยปิดเฉพาะฟีเจอร์นั้น
 */
const OPTIONAL_TABLES = ["locations", "product_locations", "sales", "sale_items"];

/** ดึงตารางที่ไม่บังคับ — ถ้ายังไม่มีตารางจะคืน null แทนการโยน error */
async function fetchOptional(table, order, missing) {
  try {
    return await fetchAllRows(table, order);
  } catch (e) {
    if (e && e.missingTable) {
      missing.push(table);
      return null;
    }
    throw e;
  }
}

/**
 * โหลดข้อมูลทั้งระบบมาเก็บในหน่วยความจำ
 * @returns ข้อมูล พร้อม missingTables = รายชื่อตารางของฟีเจอร์ใหม่ที่ยังไม่ได้สร้าง
 */
export async function loadAll() {
  const missing = [];

  const [products, warehouses, txns] = await Promise.all([
    fetchAllRows("products", "code.asc"),
    fetchAllRows("warehouses", "code.asc"),
    fetchAllRows("txns", "ts.asc"),
  ]);

  const [locations, placements, sales, saleItems] = await Promise.all([
    fetchOptional("locations", "zone.asc,col_no.asc", missing),
    fetchOptional("product_locations", null, missing),
    fetchOptional("sales", "ts.asc", missing),
    fetchOptional("sale_items", null, missing),
  ]);

  return {
    products: products.map(toProduct),
    warehouses: warehouses.map(toWarehouse),
    txns: txns.map(toTxn).sort((a, b) => a.ts - b.ts),
    locations: (locations || []).map(toLocation),
    placements: (placements || []).map(toPlacement),
    sales: (sales || []).map(toSale).sort((a, b) => a.ts - b.ts),
    saleItems: (saleItems || []).map(toSaleItem),
    missingTables: missing,
  };
}

/** ฟีเจอร์ผังที่เก็บสินค้าพร้อมใช้หรือยัง */
export const locationsReady = (missing) =>
  !missing.includes("locations") && !missing.includes("product_locations");

/** ฟีเจอร์ขายหน้าร้านพร้อมใช้หรือยัง */
export const salesReady = (missing) =>
  !missing.includes("sales") && !missing.includes("sale_items");

/* --------------------------------------------------------------- write */

/** แบ่งชุดข้อมูลเป็นก้อนย่อย ไม่ให้ payload ใหญ่เกินไป */
async function insertChunked(table, rows, size = 300) {
  for (let i = 0; i < rows.length; i += size) {
    await rest(table, {
      method: "POST",
      headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
      body: JSON.stringify(rows.slice(i, i + size)),
    });
  }
}

/** เพิ่ม/แก้ไขสินค้า (upsert ตาม id) */
export async function upsertProduct(product) {
  await rest("products", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromProduct(product)]),
  });
}

/** ลบสินค้า — รายการเคลื่อนไหวที่อ้างถึงจะถูกลบตาม (on delete cascade) */
export async function deleteProduct(id) {
  await rest("products?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/** บันทึกรายการเคลื่อนไหวหลายรายการในเอกสารเดียว */
export async function insertTxns(txns) {
  if (!txns.length) return;
  await insertChunked("txns", txns.map(fromTxn));
}

/* ------------------------------------------------ ผังที่เก็บสินค้า */

/** เพิ่ม/แก้ไขช่องเก็บ */
export async function upsertLocation(location) {
  await rest("locations", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromLocation(location)]),
  });
}

/** ลบช่องเก็บ — สินค้าที่วางอยู่จะถูกถอดออกตาม (on delete cascade) */
export async function deleteLocation(id) {
  await rest("locations?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/** วางสินค้าลงช่องเก็บ หรือแก้จำนวนที่วางไว้ */
export async function upsertPlacement(placement) {
  await rest("product_locations?on_conflict=product_id,location_id", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromPlacement(placement)]),
  });
}

/** ถอดสินค้าออกจากช่องเก็บ */
export async function deletePlacement(id) {
  await rest("product_locations?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/* -------------------------------------------------------- การขาย (POS) */

/**
 * บันทึกการขายหนึ่งบิล — เรียกฟังก์ชัน create_sale บนฐานข้อมูล
 * เพื่อให้ sales / sale_items / txns ถูกเขียนใน transaction เดียว
 */
export async function createSale(sale, items) {
  const payloadItems = items.map((i) => ({
    id: i.id,
    txn_id: i.txnId,
    product_id: i.productId,
    qty: Number(i.qty) || 0,
    price: Number(i.price) || 0,
    amount: Number(i.amount) || 0,
  }));

  try {
    await rest("rpc/create_sale", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ p_sale: fromSale(sale), p_items: payloadItems }),
    });
  } catch (e) {
    if (/create_sale|PGRST202|function/i.test(e.message)) {
      throw new Error(
        "ยังไม่มีฟังก์ชัน create_sale บนฐานข้อมูล — ให้รัน supabase/schema.sql ทั้งไฟล์อีกครั้ง " +
          "แล้วรัน supabase/fix-permissions.sql (" + e.message + ")"
      );
    }
    throw e;
  }
}

/* ------------------------------------------------------------- ทั้งระบบ */

/** ลบข้อมูลทั้งหมดในทุกตาราง (เรียงตาม foreign key) */
async function clearAll() {
  const opts = { method: "DELETE", headers: { Prefer: "return=minimal" } };
  await rest("sale_items?id=not.is.null", opts);
  await rest("sales?id=not.is.null", opts);
  await rest("product_locations?id=not.is.null", opts);
  await rest("locations?id=not.is.null", opts);
  await rest("txns?id=not.is.null", opts);
  await rest("products?id=not.is.null", opts);
  await rest("warehouses?id=not.is.null", opts);
}

/** เขียนทับข้อมูลทั้งหมด — ใช้ตอนนำเข้าไฟล์สำรองและตอนสร้างข้อมูลตัวอย่างใหม่ */
export async function replaceAll(data) {
  await clearAll();
  await insertChunked("warehouses", data.warehouses.map(fromWarehouse));
  await insertChunked("products", data.products.map(fromProduct));
  await insertChunked("txns", data.txns.map(fromTxn));
  await insertChunked("locations", (data.locations || []).map(fromLocation));
  await insertChunked("product_locations", (data.placements || []).map(fromPlacement));
  await insertChunked("sales", (data.sales || []).map(fromSale));
  await insertChunked("sale_items", (data.saleItems || []).map(fromSaleItem));
}

/** สร้างข้อมูลตัวอย่างชุดใหม่ทับของเดิม */
export async function resetToSeed() {
  const fresh = seed();
  await replaceAll(fresh);
  return fresh;
}

/**
 * ถ้าฐานข้อมูลว่างเปล่าทั้งหมด ให้ใส่ข้อมูลตัวอย่างให้อัตโนมัติ
 * @returns {object|null} ข้อมูลที่สร้าง หรือ null ถ้าฐานข้อมูลมีข้อมูลอยู่แล้ว
 */
export async function seedIfEmpty(current) {
  if (current.products.length || current.warehouses.length || current.txns.length) return null;

  const missing = current.missingTables || [];
  const fresh = seed();

  await insertChunked("warehouses", fresh.warehouses.map(fromWarehouse));
  await insertChunked("products", fresh.products.map(fromProduct));

  // ถ้ายังไม่มีตารางของฟีเจอร์ใหม่ ให้ข้ามส่วนนั้นไปก่อน ระบบหลักยังใช้ได้
  if (!salesReady(missing)) {
    fresh.sales = [];
    fresh.saleItems = [];
    fresh.txns = fresh.txns.filter((t) => t.type !== "SALE");
  }
  if (!locationsReady(missing)) {
    fresh.locations = [];
    fresh.placements = [];
  }

  await insertChunked("txns", fresh.txns.map(fromTxn));

  if (locationsReady(missing)) {
    await insertChunked("locations", fresh.locations.map(fromLocation));
    await insertChunked("product_locations", fresh.placements.map(fromPlacement));
  }
  if (salesReady(missing)) {
    await insertChunked("sales", fresh.sales.map(fromSale));
    await insertChunked("sale_items", fresh.saleItems.map(fromSaleItem));
  }

  fresh.missingTables = missing;
  return fresh;
}

/**
 * เติมผังที่เก็บให้ฐานข้อมูลที่มีข้อมูลอยู่แล้วแต่ยังไม่มี locations
 * (กรณีอัปเกรดจากรุ่นก่อนที่ยังไม่มีหน้าจอผังคลัง)
 * @returns {{locations:Array, placements:Array}|null}
 */
export async function seedLocationsIfEmpty(current) {
  if (!locationsReady(current.missingTables || [])) return null;
  if (current.locations.length || !current.warehouses.length) return null;

  const fresh = seed();
  const byCode = new Map(current.warehouses.map((w) => [w.code, w.id]));

  // ใช้ผังจากข้อมูลตั้งต้น แต่ผูกกับ id คลังจริงในฐานข้อมูล
  const locations = [];
  const idMap = new Map();
  fresh.locations.forEach((l) => {
    const seedWh = fresh.warehouses.find((w) => w.id === l.whId);
    const realWhId = seedWh ? byCode.get(seedWh.code) : null;
    if (!realWhId) return;
    const nl = { ...l, id: uid(), whId: realWhId };
    idMap.set(l.id, nl.id);
    locations.push(nl);
  });
  if (!locations.length) return null;

  await insertChunked("locations", locations.map(fromLocation));
  return { locations, placements: [] };
}
