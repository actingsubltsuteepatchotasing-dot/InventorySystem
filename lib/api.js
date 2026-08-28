// ชั้นข้อมูลบน Supabase — แปลงระหว่างคอลัมน์ snake_case กับ object camelCase ในแอป

import { rest } from "./supabase";
import { seed } from "./db";

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

/** โหลดข้อมูลทั้งระบบมาเก็บในหน่วยความจำ */
export async function loadAll() {
  const [products, warehouses, txns] = await Promise.all([
    fetchAllRows("products", "code.asc"),
    fetchAllRows("warehouses", "code.asc"),
    fetchAllRows("txns", "ts.asc"),
  ]);

  return {
    products: products.map(toProduct),
    warehouses: warehouses.map(toWarehouse),
    txns: txns.map(toTxn).sort((a, b) => a.ts - b.ts),
  };
}

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

/** ลบข้อมูลทั้งหมดในทุกตาราง (ลบ txns ก่อนเพราะมี foreign key) */
async function clearAll() {
  const opts = { method: "DELETE", headers: { Prefer: "return=minimal" } };
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
  const fresh = seed();
  await insertChunked("warehouses", fresh.warehouses.map(fromWarehouse));
  await insertChunked("products", fresh.products.map(fromProduct));
  await insertChunked("txns", fresh.txns.map(fromTxn));
  return fresh;
}
