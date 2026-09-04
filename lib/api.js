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
  defWhId: r.def_wh_id || "",
  defLocId: r.def_loc_id || "",
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
  // ต้องเป็นคู่เสมอ ฝั่งฐานข้อมูลมี check บังคับไว้ว่าต้องตั้งทั้งคู่หรือไม่ตั้งเลย
  def_wh_id: p.defWhId && p.defLocId ? p.defWhId : null,
  def_loc_id: p.defWhId && p.defLocId ? p.defLocId : null,
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

const toDocGroup = (r) => ({
  id: r.id,
  name: r.name,
  prefix: r.prefix,
  period: r.period,
  digits: Number(r.digits) || 4,
});

const fromDocGroup = (g) => ({
  id: g.id,
  name: g.name,
  prefix: g.prefix,
  period: g.period,
  digits: g.digits,
});

const toCustomer = (r) => ({
  id: r.id,
  code: r.code,
  name: r.name,
  address: r.address || "",
  subdistrict: r.subdistrict || "",
  district: r.district || "",
  province: r.province || "",
  postcode: r.postcode || "",
  phone: r.phone || "",
  kind: r.kind || "",
});

const fromCustomer = (c) => ({
  id: c.id,
  code: c.code,
  name: c.name,
  address: c.address || "",
  subdistrict: c.subdistrict || "",
  district: c.district || "",
  province: c.province || "",
  postcode: c.postcode || "",
  phone: c.phone || "",
  kind: c.kind || "",
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
  locId: r.loc_id || "",
  locTo: r.loc_to || "",
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
  // ส่ง null ไม่ใช่สตริงว่าง ไม่งั้น foreign key จะหาช่องเก็บรหัส "" ไม่เจอ
  loc_id: t.locId || null,
  loc_to: t.locTo || null,
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
  locId: r.loc_id || "",
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
  loc_id: s.locId || null,
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
const OPTIONAL_TABLES = [
  "locations",
  "product_locations",
  "sales",
  "sale_items",
  "doc_groups",
  "customers",
];

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

  const [locations, placements, sales, saleItems, docGroups, customers] = await Promise.all([
    fetchOptional("locations", "zone.asc,col_no.asc", missing),
    fetchOptional("product_locations", null, missing),
    fetchOptional("sales", "ts.asc", missing),
    fetchOptional("sale_items", null, missing),
    fetchOptional("doc_groups", "id.asc", missing),
    fetchOptional("customers", "code.asc", missing),
  ]);

  return {
    products: products.map(toProduct),
    warehouses: warehouses.map(toWarehouse),
    txns: txns.map(toTxn).sort((a, b) => a.ts - b.ts),
    locations: (locations || []).map(toLocation),
    placements: (placements || []).map(toPlacement),
    sales: (sales || []).map(toSale).sort((a, b) => a.ts - b.ts),
    saleItems: (saleItems || []).map(toSaleItem),
    docGroups: (docGroups || []).map(toDocGroup),
    customers: (customers || []).map(toCustomer),
    missingTables: missing,
  };
}

/**
 * ตรวจสภาพฐานข้อมูลทีละรายการ — ใช้ในหน้า "ตรวจสอบระบบ"
 * ไม่แก้ไขข้อมูลใด ๆ อ่านอย่างเดียว
 * @returns {Promise<Array<{name:string, label:string, ok:boolean, detail:string}>>}
 */
export async function healthCheck() {
  const TABLES = [
    { name: "warehouses", label: "ตารางคลังสินค้า" },
    { name: "products", label: "ตารางสินค้า" },
    { name: "txns", label: "ตารางรายการเคลื่อนไหว" },
    { name: "locations", label: "ตารางช่องเก็บ (ผังคลัง)" },
    { name: "product_locations", label: "ตารางการจัดวางสินค้า" },
    { name: "sales", label: "ตารางบิลขาย (POS)" },
    { name: "sale_items", label: "ตารางรายการในบิล (POS)" },
    { name: "doc_groups", label: "ตารางกลุ่มเอกสาร" },
    { name: "customers", label: "ตารางลูกค้า" },
  ];

  const results = [];

  for (const t of TABLES) {
    try {
      await rest(t.name + "?select=id&limit=1");
      results.push({ name: t.name, label: t.label, ok: true, detail: "อ่านได้ปกติ" });
    } catch (e) {
      results.push({
        name: t.name,
        label: t.label,
        ok: false,
        detail: e.missingTable ? "ยังไม่มีตารางนี้" : e.message,
      });
    }
  }

  // ตรวจฟังก์ชันจากรายการ endpoint ที่ PostgREST ประกาศไว้ (อ่านอย่างเดียว)
  const FUNCS = [
    { name: "create_sale", label: "ฟังก์ชันบันทึกการขาย" },
    { name: "stock_of", label: "ฟังก์ชันคำนวณยอดคงเหลือ" },
  ];
  try {
    const spec = await rest("");
    const paths = spec && spec.paths ? Object.keys(spec.paths).join(" ") : "";
    FUNCS.forEach((f) => {
      const ok = paths.includes("/rpc/" + f.name);
      results.push({
        name: f.name,
        label: f.label,
        ok,
        detail: ok ? "เรียกใช้ได้" : "ยังไม่มีฟังก์ชันนี้ หรือยังไม่ได้ให้สิทธิ์ execute",
      });
    });
  } catch (e) {
    FUNCS.forEach((f) => {
      results.push({ name: f.name, label: f.label, ok: false, detail: "ตรวจไม่ได้: " + e.message });
    });
  }

  return results;
}

/** ฟีเจอร์ผังที่เก็บสินค้าพร้อมใช้หรือยัง */
export const locationsReady = (missing) =>
  !missing.includes("locations") && !missing.includes("product_locations");

/** ฟีเจอร์ขายหน้าร้านพร้อมใช้หรือยัง */
export const salesReady = (missing) =>
  !missing.includes("sales") && !missing.includes("sale_items");

/** หน้าจอกำหนดกลุ่มเอกสารพร้อมใช้หรือยัง */
export const docGroupsReady = (missing) => !missing.includes("doc_groups");

/** หน้าจอข้อมูลลูกค้าพร้อมใช้หรือยัง */
export const customersReady = (missing) => !missing.includes("customers");

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

/* ------------------------------------------------------ คลังสินค้า */

/** เพิ่ม/แก้ไขคลังสินค้า */
export async function upsertWarehouse(warehouse) {
  await rest("warehouses", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromWarehouse(warehouse)]),
  });
}

/**
 * ลบคลังสินค้า
 *
 * txns อ้างถึง warehouses แบบ on delete restrict ฐานข้อมูลจึงปฏิเสธเองอยู่แล้ว
 * ถ้าคลังนี้เคยมีรายการเคลื่อนไหว แต่ฝั่งหน้าจอกันไว้ก่อนเพื่อให้ข้อความอ่านรู้เรื่อง
 */
export async function deleteWarehouse(id) {
  await rest("warehouses?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/* ----------------------------------------------------- กลุ่มเอกสาร */

/** เพิ่ม/แก้ไขกลุ่มเอกสาร */
export async function upsertDocGroup(group) {
  await rest("doc_groups", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromDocGroup(group)]),
  });
}

/* ---------------------------------------------------------- ลูกค้า */

/** เพิ่ม/แก้ไขลูกค้า */
export async function upsertCustomer(customer) {
  await rest("customers", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromCustomer(customer)]),
  });
}

/** ลบลูกค้า */
export async function deleteCustomer(id) {
  await rest("customers?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
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

/**
 * ปรับผังที่เก็บตามแผนที่คำนวณไว้ (planPlacementChanges ใน lib/db.js)
 *
 * เขียน upsert ทีเดียวทั้งชุด แล้วค่อยลบแถวที่เหลือศูนย์
 * ลำดับนี้สำคัญ: ถ้าลบก่อนแล้ว upsert พลาด ของจะหายไปจากผังโดยไม่มีที่ไป
 */
export async function applyPlacementPlan(plan) {
  if (!plan) return;

  if (plan.upserts && plan.upserts.length) {
    await rest("product_locations?on_conflict=product_id,location_id", {
      method: "POST",
      headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
      body: JSON.stringify(plan.upserts.map(fromPlacement)),
    });
  }

  for (const id of plan.deletes || []) {
    await rest("product_locations?id=eq." + encodeURIComponent(id), {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }
}

/** เขียนผังที่เก็บทั้งชุดใหม่ทับของเดิม — ใช้ตอนซ่อมผังให้ตรงกับรายการจริง */
export async function replacePlacements(rows) {
  await rest("product_locations?id=not.is.null", {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  await insertChunked("product_locations", rows.map(fromPlacement));
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
    // ที่เก็บของแต่ละรายการ ถ้ารายการไม่ได้ระบุก็ใช้ที่เก็บบนหัวบิล
    loc_id: i.locId || sale.locId || null,
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
          "ใน Supabase SQL Editor (" + e.message + ")"
      );
    }
    throw e;
  }
}

/* ------------------------------------------------------------- ทั้งระบบ */

/**
 * ปล่อยผ่านถ้าตารางยังไม่มีในฐานข้อมูล ข้อผิดพลาดอื่นยังโยนต่อตามปกติ
 * ใช้กับตารางของฟีเจอร์ใหม่เท่านั้น ไม่ใช้กับตารางหลัก
 */
async function skipIfMissing(promise) {
  try {
    return await promise;
  } catch (e) {
    if (e && e.missingTable) return null;
    throw e;
  }
}

/** ลบข้อมูลทั้งหมดในทุกตาราง (เรียงตาม foreign key) */
async function clearAll() {
  const opts = { method: "DELETE", headers: { Prefer: "return=minimal" } };
  // สองตารางนี้ยังใหม่ ฐานข้อมูลที่ยังไม่ได้อัปเดต schema จะไม่มี จึงข้ามได้
  await skipIfMissing(rest("doc_groups?id=not.is.null", opts));
  await skipIfMissing(rest("customers?id=not.is.null", opts));
  await rest("sale_items?id=not.is.null", opts);
  await rest("sales?id=not.is.null", opts);
  await rest("product_locations?id=not.is.null", opts);
  // ต้องลบ txns ก่อน locations เพราะ txns อ้างช่องเก็บด้วย foreign key แบบ restrict
  await rest("txns?id=not.is.null", opts);
  await rest("locations?id=not.is.null", opts);
  await rest("products?id=not.is.null", opts);
  await rest("warehouses?id=not.is.null", opts);
}

/** เขียนทับข้อมูลทั้งหมด — ใช้ตอนนำเข้าไฟล์สำรองและตอนสร้างข้อมูลตัวอย่างใหม่ */
export async function replaceAll(data) {
  await clearAll();
  await insertChunked("warehouses", data.warehouses.map(fromWarehouse));
  // ต้องมีช่องเก็บก่อน products (อ้างที่เก็บประจำ) และก่อน txns (อ้างที่เก็บของรายการ)
  await insertChunked("locations", (data.locations || []).map(fromLocation));
  await insertChunked("products", data.products.map(fromProduct));
  await insertChunked("txns", data.txns.map(fromTxn));
  await insertChunked("product_locations", (data.placements || []).map(fromPlacement));
  await insertChunked("sales", (data.sales || []).map(fromSale));
  await insertChunked("sale_items", (data.saleItems || []).map(fromSaleItem));
  await skipIfMissing(insertChunked("doc_groups", (data.docGroups || []).map(fromDocGroup)));
  await skipIfMissing(insertChunked("customers", (data.customers || []).map(fromCustomer)));
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

  // ช่องเก็บต้องมาก่อน products และ txns เพราะทั้งคู่อ้างที่เก็บด้วย foreign key
  if (locationsReady(missing)) {
    await insertChunked("locations", fresh.locations.map(fromLocation));
  } else {
    // ยังไม่มีตารางผังคลัง จึงบันทึกที่เก็บไม่ได้ ต้องตัดออกก่อนไม่งั้น FK พัง
    fresh.txns = fresh.txns.map((t) => ({ ...t, locId: "", locTo: "" }));
    fresh.sales = fresh.sales.map((s) => ({ ...s, locId: "" }));
    fresh.products = fresh.products.map((p) => ({ ...p, defWhId: "", defLocId: "" }));
  }

  await insertChunked("products", fresh.products.map(fromProduct));
  await insertChunked("txns", fresh.txns.map(fromTxn));

  if (locationsReady(missing)) {
    await insertChunked("product_locations", fresh.placements.map(fromPlacement));
  }
  if (salesReady(missing)) {
    await insertChunked("sales", fresh.sales.map(fromSale));
    await insertChunked("sale_items", fresh.saleItems.map(fromSaleItem));
  }

  if (docGroupsReady(missing)) {
    await insertChunked("doc_groups", fresh.docGroups.map(fromDocGroup));
  } else {
    fresh.docGroups = [];
  }
  if (customersReady(missing)) {
    await insertChunked("customers", fresh.customers.map(fromCustomer));
  } else {
    fresh.customers = [];
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
