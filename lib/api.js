// ชั้นข้อมูลบน Supabase — แปลงระหว่างคอลัมน์ snake_case กับ object camelCase ในแอป

import { rest } from "./supabase";
import { seed } from "./db";
import { uid } from "./format";

/* ------------------------------------------------------------- mappers */

const toProduct = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  code: r.code,
  name: r.name,
  unit: r.unit,
  cat: r.cat,
  grp: r.grp || "",
  brand: r.brand || "",
  kind: r.kind || "",
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
  grp: p.grp || "",
  brand: p.brand || "",
  kind: p.kind || "",
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
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
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
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  name: r.name,
  prefix: r.prefix,
  period: r.period,
  digits: Number(r.digits) || 4,
  formId: r.form_id || "",
});

const fromDocGroup = (g) => ({
  id: g.id,
  name: g.name,
  prefix: g.prefix,
  period: g.period,
  digits: g.digits,
  form_id: g.formId || null,
});

const toCompany = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  name: r.name || "",
  branch: r.branch || "",
  taxId: r.tax_id || "",
  address: r.address || "",
  phone: r.phone || "",
  email: r.email || "",
});

const fromCompany = (c) => ({
  id: "main",
  name: c.name || "",
  branch: c.branch || "",
  tax_id: c.taxId || "",
  address: c.address || "",
  phone: c.phone || "",
  email: c.email || "",
});

const toInvoice = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  docNo: r.doc_no,
  date: r.date,
  customerId: r.customer_id || "",
  custCode: r.cust_code || "",
  custName: r.cust_name || "",
  custAddress: r.cust_address || "",
  custProvince: r.cust_province || "",
  custTaxId: r.cust_tax_id || "",
  custBranch: r.cust_branch || "",
  // ประเภทลูกค้า ณ วันที่ออกเอกสาร ไม่ได้อ่านสดจากทะเบียน
  custKind: r.cust_kind || "",
  salesId: r.sales_id || "",
  salesCode: r.sales_code || "",
  salesName: r.sales_name || "",
  vatRate: Number(r.vat_rate) || 0,
  itemsTotal: Number(r.items_total) || 0,
  billDiscount: Number(r.bill_discount) || 0,
  base: Number(r.base) || 0,
  vat: Number(r.vat) || 0,
  total: Number(r.total) || 0,
  note: r.note || "",
  shipStatus: r.ship_status || "WAIT",
  shipFrom: r.ship_from || "",
  shipNote: r.ship_note || "",
  shipTs: Number(r.ship_ts) || 0,
  custLat: r.cust_lat === null || r.cust_lat === undefined ? null : Number(r.cust_lat),
  custLng: r.cust_lng === null || r.cust_lng === undefined ? null : Number(r.cust_lng),
  // null = ยังไม่เคยคำนวณ ต่างจาก 0 ที่แปลว่าอยู่ที่เดียวกับคลัง
  shipKm: r.ship_km === null || r.ship_km === undefined ? null : Number(r.ship_km),
  shipKmAt: Number(r.ship_km_at) || 0,
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromInvoice = (v) => ({
  id: v.id,
  doc_no: v.docNo,
  date: v.date,
  customer_id: v.customerId || null,
  cust_code: v.custCode || "",
  cust_name: v.custName || "",
  cust_address: v.custAddress || "",
  cust_province: v.custProvince || "",
  cust_tax_id: v.custTaxId || "",
  cust_branch: v.custBranch || "",
  cust_kind: v.custKind || "",
  sales_id: v.salesId || null,
  sales_code: v.salesCode || "",
  sales_name: v.salesName || "",
  vat_rate: v.vatRate,
  items_total: v.itemsTotal,
  bill_discount: v.billDiscount,
  base: v.base,
  vat: v.vat,
  total: v.total,
  note: v.note || "",
  ship_status: v.shipStatus || "WAIT",
  ship_from: v.shipFrom || null,
  ship_note: v.shipNote || "",
  ship_ts: v.shipTs || null,
  cust_lat: v.custLat === undefined ? null : v.custLat,
  cust_lng: v.custLng === undefined ? null : v.custLng,
  ship_km: v.shipKm === undefined ? null : v.shipKm,
  ship_km_at: v.shipKmAt || null,
  user_name: v.user || "",
  ts: v.ts,
});

const toInvoiceItem = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  invoiceId: r.invoice_id,
  productId: r.product_id,
  whId: r.wh_id,
  locId: r.loc_id || "",
  qty: Number(r.qty) || 0,
  price: Number(r.price) || 0,
  discPct: Number(r.disc_pct) || 0,
  discAmt: Number(r.disc_amt) || 0,
  amount: Number(r.amount) || 0,
  seq: Number(r.seq) || 0,
});

const fromInvoiceItem = (i) => ({
  id: i.id,
  invoice_id: i.invoiceId,
  product_id: i.productId,
  wh_id: i.whId,
  loc_id: i.locId || null,
  qty: i.qty,
  price: i.price,
  disc_pct: i.discPct,
  disc_amt: i.discAmt,
  amount: i.amount,
  seq: i.seq,
});

/* คู่ค้าฝั่งซื้อ — โครงเดียวกับลูกค้าเป๊ะ จึงแปลงด้วยรูปแบบเดียวกัน */
const toSupplier = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
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
  taxId: r.tax_id || "",
  branch: r.branch || "",
});

const fromSupplier = (c) => ({
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
  tax_id: c.taxId || "",
  branch: c.branch || "",
});

const toPurchase = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  docNo: r.doc_no,
  date: r.date,
  supplierId: r.supplier_id || "",
  supCode: r.sup_code || "",
  supName: r.sup_name || "",
  supAddress: r.sup_address || "",
  supProvince: r.sup_province || "",
  supTaxId: r.sup_tax_id || "",
  supBranch: r.sup_branch || "",
  refNo: r.ref_no || "",
  vatRate: Number(r.vat_rate) || 0,
  itemsTotal: Number(r.items_total) || 0,
  billDiscount: Number(r.bill_discount) || 0,
  base: Number(r.base) || 0,
  vat: Number(r.vat) || 0,
  total: Number(r.total) || 0,
  note: r.note || "",
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromPurchase = (v) => ({
  id: v.id,
  doc_no: v.docNo,
  date: v.date,
  supplier_id: v.supplierId || null,
  sup_code: v.supCode || "",
  sup_name: v.supName || "",
  sup_address: v.supAddress || "",
  sup_province: v.supProvince || "",
  sup_tax_id: v.supTaxId || "",
  sup_branch: v.supBranch || "",
  ref_no: v.refNo || "",
  vat_rate: v.vatRate,
  items_total: v.itemsTotal,
  bill_discount: v.billDiscount,
  base: v.base,
  vat: v.vat,
  total: v.total,
  note: v.note || "",
  user_name: v.user || "",
  ts: v.ts,
});

const toPurchaseItem = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  purchaseId: r.purchase_id,
  productId: r.product_id,
  whId: r.wh_id,
  locId: r.loc_id || "",
  qty: Number(r.qty) || 0,
  price: Number(r.price) || 0,
  discPct: Number(r.disc_pct) || 0,
  discAmt: Number(r.disc_amt) || 0,
  amount: Number(r.amount) || 0,
  seq: Number(r.seq) || 0,
});

const fromPurchaseItem = (i) => ({
  id: i.id,
  purchase_id: i.purchaseId,
  product_id: i.productId,
  wh_id: i.whId,
  loc_id: i.locId || null,
  qty: i.qty,
  price: i.price,
  disc_pct: i.discPct,
  disc_amt: i.discAmt,
  amount: i.amount,
  seq: i.seq,
});

const toReturn = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  docNo: r.doc_no,
  date: r.date,
  purchaseId: r.purchase_id,
  purDocNo: r.pur_doc_no || "",
  supplierId: r.supplier_id || "",
  supCode: r.sup_code || "",
  supName: r.sup_name || "",
  supAddress: r.sup_address || "",
  supProvince: r.sup_province || "",
  supTaxId: r.sup_tax_id || "",
  supBranch: r.sup_branch || "",
  reason: r.reason || "",
  vatRate: Number(r.vat_rate) || 0,
  itemsTotal: Number(r.items_total) || 0,
  billDiscount: Number(r.bill_discount) || 0,
  base: Number(r.base) || 0,
  vat: Number(r.vat) || 0,
  total: Number(r.total) || 0,
  note: r.note || "",
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromReturn = (v) => ({
  id: v.id,
  doc_no: v.docNo,
  date: v.date,
  purchase_id: v.purchaseId,
  pur_doc_no: v.purDocNo || "",
  supplier_id: v.supplierId || null,
  sup_code: v.supCode || "",
  sup_name: v.supName || "",
  sup_address: v.supAddress || "",
  sup_province: v.supProvince || "",
  sup_tax_id: v.supTaxId || "",
  sup_branch: v.supBranch || "",
  reason: v.reason || "",
  vat_rate: v.vatRate,
  items_total: v.itemsTotal,
  bill_discount: v.billDiscount,
  base: v.base,
  vat: v.vat,
  total: v.total,
  note: v.note || "",
  user_name: v.user || "",
  ts: v.ts,
});

const toReturnItem = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  returnId: r.return_id,
  itemId: r.item_id || "",
  productId: r.product_id,
  whId: r.wh_id,
  locId: r.loc_id || "",
  qty: Number(r.qty) || 0,
  price: Number(r.price) || 0,
  discPct: Number(r.disc_pct) || 0,
  discAmt: Number(r.disc_amt) || 0,
  amount: Number(r.amount) || 0,
  seq: Number(r.seq) || 0,
});

const fromReturnItem = (i) => ({
  id: i.id,
  return_id: i.returnId,
  item_id: i.itemId || "",
  product_id: i.productId,
  wh_id: i.whId,
  loc_id: i.locId || null,
  qty: i.qty,
  price: i.price,
  disc_pct: i.discPct,
  disc_amt: i.discAmt,
  amount: i.amount,
  seq: i.seq,
});

const toCount = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  docNo: r.doc_no,
  date: r.date,
  whId: r.wh_id,
  by1: r.by1 || "",
  by2: r.by2 || "",
  status: r.status || "OPEN",
  note: r.note || "",
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
  postedDoc: r.posted_doc || "",
});

const fromCount = (c) => ({
  id: c.id,
  doc_no: c.docNo,
  date: c.date,
  wh_id: c.whId,
  by1: c.by1 || "",
  by2: c.by2 || "",
  status: c.status || "OPEN",
  note: c.note || "",
  user_name: c.user || "",
  ts: c.ts,
  posted_doc: c.postedDoc || "",
});

const toCountItem = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  countId: r.count_id,
  productId: r.product_id,
  whId: r.wh_id,
  locId: r.loc_id || "",
  sysQty: Number(r.sys_qty) || 0,
  // null = ยังไม่ได้นับ ต่างจาก 0 ที่แปลว่านับแล้วไม่เจอของเลย
  counted: r.counted === null || r.counted === undefined ? null : Number(r.counted),
  countedAt: Number(r.counted_at) || 0,
  seq: Number(r.seq) || 0,
});

const fromCountItem = (i) => ({
  id: i.id,
  count_id: i.countId,
  product_id: i.productId,
  wh_id: i.whId,
  loc_id: i.locId || null,
  sys_qty: i.sysQty,
  counted: i.counted === undefined ? null : i.counted,
  counted_at: i.countedAt || null,
  seq: i.seq,
});

const toPrintForm = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  name: r.name,
  docKind: r.doc_kind,
  title: r.title || "",
  copyLabel: r.copy_label || "",
  paper: r.paper || "A4",
  showLogo: r.show_logo === true,
  showCompany: r.show_company !== false,
  showBarcode: r.show_barcode !== false,
  showWords: r.show_words !== false,
  showNote: r.show_note !== false,
  showTotals: r.show_totals !== false,
  // jsonb คืนมาเป็นอาร์เรย์อยู่แล้ว แต่กันไว้เผื่อแถวเก่าที่เป็น null
  columns: Array.isArray(r.columns) ? r.columns : [],
  signs: Array.isArray(r.signs) ? r.signs : [],
  note: r.note || "",
  isDefault: r.is_default === true,
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromPrintForm = (f) => ({
  id: f.id,
  name: f.name,
  doc_kind: f.docKind,
  title: f.title || "",
  copy_label: f.copyLabel || "",
  paper: f.paper || "A4",
  show_logo: f.showLogo === true,
  show_company: f.showCompany !== false,
  show_barcode: f.showBarcode !== false,
  show_words: f.showWords !== false,
  show_note: f.showNote !== false,
  show_totals: f.showTotals !== false,
  columns: f.columns || [],
  signs: f.signs || [],
  note: f.note || "",
  is_default: f.isDefault === true,
  user_name: f.user || "",
  ts: f.ts,
});

const toSalesperson = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  code: r.code,
  name: r.name,
  phone: r.phone || "",
  note: r.note || "",
  active: r.active !== false,
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromSalesperson = (p) => ({
  id: p.id,
  code: p.code,
  name: p.name,
  phone: p.phone || "",
  note: p.note || "",
  active: p.active !== false,
  user_name: p.user || "",
  ts: p.ts,
});

const toCustomerKind = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  code: r.code,
  name: r.name,
  note: r.note || "",
  active: r.active !== false,
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromCustomerKind = (k) => ({
  id: k.id,
  code: k.code,
  name: k.name,
  note: k.note || "",
  active: k.active !== false,
  user_name: k.user || "",
  ts: k.ts,
});

const toProductTerm = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  dim: r.dim,
  code: r.code,
  name: r.name,
  note: r.note || "",
  active: r.active !== false,
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromProductTerm = (t) => ({
  id: t.id,
  dim: t.dim,
  code: t.code,
  name: t.name,
  note: t.note || "",
  active: t.active !== false,
  user_name: t.user || "",
  ts: t.ts,
});

/* ------------------------------------------- การรับฟังลูกค้า (SE-AM หมวด 3) */

/*
 * groups กับ lifecycle ในฐานข้อมูลเป็น text[] ของ Postgres
 * PostgREST ส่งกลับมาเป็นอาร์เรย์อยู่แล้ว แต่ถ้าตารางเพิ่งสร้างและยังว่าง
 * บางครั้งได้ null กลับมา จึงกันไว้ด้วย || [] ทุกที่
 */
const toArr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : []);

const toVocChannel = (r) => ({
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  code: r.code,
  name: r.name,
  kind: r.kind || "WEB",
  groups: toArr(r.groups),
  lifecycle: toArr(r.lifecycle),
  dimension: r.dimension || "",
  freq: r.freq || "MONTHLY",
  owner: r.owner || "",
  practice: r.practice || "",
  note: r.note || "",
  active: r.active !== false,
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromVocChannel = (c) => ({
  id: c.id,
  code: c.code,
  name: c.name,
  kind: c.kind || "WEB",
  groups: toArr(c.groups),
  lifecycle: toArr(c.lifecycle),
  dimension: c.dimension || "",
  freq: c.freq || "MONTHLY",
  owner: c.owner || "",
  practice: c.practice || "",
  note: c.note || "",
  active: c.active !== false,
  user_name: c.user || "",
  ts: c.ts,
});

const toVocRecord = (r) => ({
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  code: r.code,
  date: r.date,
  channelId: r.channel_id || "",
  groupId: r.group_id || "COMM",
  lifecycle: r.lifecycle || "CURRENT",
  dimension: r.dimension || "PRODUCT",
  productId: r.product_id || "",
  kind: r.kind || "NEED",
  priority: r.priority || "MED",
  status: r.status || "NEW",
  customerId: r.customer_id || "",
  partyName: r.party_name || "",
  province: r.province || "",
  subject: r.subject || "",
  detail: r.detail || "",
  response: r.response || "",
  owner: r.owner || "",
  dueDate: r.due_date || "",
  closedDate: r.closed_date || "",
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromVocRecord = (v) => ({
  id: v.id,
  code: v.code,
  date: v.date,
  channel_id: v.channelId,
  group_id: v.groupId || "COMM",
  lifecycle: v.lifecycle || "CURRENT",
  dimension: v.dimension || "PRODUCT",
  product_id: v.productId || "",
  kind: v.kind || "NEED",
  priority: v.priority || "MED",
  status: v.status || "NEW",
  customer_id: v.customerId || null,
  party_name: v.partyName || "",
  province: v.province || "",
  subject: v.subject || "",
  detail: v.detail || "",
  response: v.response || "",
  owner: v.owner || "",
  due_date: v.dueDate || null,
  closed_date: v.closedDate || null,
  user_name: v.user || "",
  ts: v.ts,
});

const toVocSurvey = (r) => ({
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  code: r.code,
  name: r.name,
  kind: r.kind || "SAT",
  year: Number(r.fiscal_year) || 0,
  purpose: r.purpose || "",
  form: r.form || "",
  freq: r.freq || "YEARLY",
  method: r.method || "",
  sampling: r.sampling || "",
  sampleSize: Number(r.sample_size) || 0,
  responded: Number(r.responded) || 0,
  startDate: r.start_date || "",
  endDate: r.end_date || "",
  status: r.status || "PLAN",
  vendor: r.vendor || "",
  owner: r.owner || "",
  note: r.note || "",
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromVocSurvey = (s) => ({
  id: s.id,
  code: s.code,
  name: s.name,
  kind: s.kind || "SAT",
  fiscal_year: Number(s.year) || 0,
  purpose: s.purpose || "",
  form: s.form || "",
  freq: s.freq || "YEARLY",
  method: s.method || "",
  sampling: s.sampling || "",
  sample_size: Number(s.sampleSize) || 0,
  responded: Number(s.responded) || 0,
  start_date: s.startDate || null,
  end_date: s.endDate || null,
  status: s.status || "PLAN",
  vendor: s.vendor || "",
  owner: s.owner || "",
  note: s.note || "",
  user_name: s.user || "",
  ts: s.ts,
});

const toVocResult = (r) => ({
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  surveyId: r.survey_id || "",
  groupId: r.group_id || "COMM",
  productId: r.product_id || "",
  dimension: r.dimension || "PRODUCT",
  score: Number(r.score) || 0,
  full: Number(r.full_score) || 5,
  respondents: Number(r.respondents) || 0,
  benchmark: Number(r.benchmark) || 0,
  note: r.note || "",
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromVocResult = (r) => ({
  id: r.id,
  survey_id: r.surveyId,
  group_id: r.groupId || "COMM",
  product_id: r.productId || "",
  dimension: r.dimension || "PRODUCT",
  score: Number(r.score) || 0,
  full_score: Number(r.full) || 5,
  respondents: Number(r.respondents) || 0,
  benchmark: Number(r.benchmark) || 0,
  note: r.note || "",
  user_name: r.user || "",
  ts: r.ts,
});

const toVocAction = (r) => ({
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  code: r.code,
  kind: r.kind || "IMPROVE",
  crit: r.crit || "",
  title: r.title,
  detail: r.detail || "",
  recordId: r.record_id || "",
  surveyId: r.survey_id || "",
  owner: r.owner || "",
  dueDate: r.due_date || "",
  doneDate: r.done_date || "",
  status: r.status || "PLAN",
  result: r.result || "",
  storeUrl: r.store_url || "",
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromVocAction = (a) => ({
  id: a.id,
  code: a.code,
  kind: a.kind || "IMPROVE",
  crit: a.crit || "",
  title: a.title,
  detail: a.detail || "",
  record_id: a.recordId || null,
  survey_id: a.surveyId || null,
  owner: a.owner || "",
  due_date: a.dueDate || null,
  done_date: a.doneDate || null,
  status: a.status || "PLAN",
  result: a.result || "",
  store_url: a.storeUrl || "",
  user_name: a.user || "",
  ts: a.ts,
});

const toVocLevel = (r) => ({
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  crit: r.crit,
  level: Number(r.level) || 1,
  checkId: r.check_id,
  done: !!r.done,
  evidence: r.evidence || "",
  owner: r.owner || "",
  doneDate: r.done_date || "",
  note: r.note || "",
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromVocLevel = (l) => ({
  id: l.id,
  crit: l.crit,
  level: Number(l.level) || 1,
  check_id: l.checkId,
  done: !!l.done,
  evidence: l.evidence || "",
  owner: l.owner || "",
  done_date: l.doneDate || null,
  note: l.note || "",
  user_name: l.user || "",
  ts: l.ts,
});

/* ------------------------------------------------- งานลูกค้าสัมพันธ์ */

const toLead = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  code: r.code,
  name: r.name,
  contact: r.contact || "",
  phone: r.phone || "",
  email: r.email || "",
  province: r.province || "",
  source: r.source || "",
  status: r.status || "NEW",
  salesId: r.sales_id || "",
  customerId: r.customer_id || "",
  note: r.note || "",
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromLead = (l) => ({
  id: l.id,
  code: l.code,
  name: l.name,
  contact: l.contact || "",
  phone: l.phone || "",
  email: l.email || "",
  province: l.province || "",
  source: l.source || "",
  status: l.status || "NEW",
  sales_id: l.salesId || null,
  customer_id: l.customerId || null,
  note: l.note || "",
  user_name: l.user || "",
  ts: l.ts,
});

const toDeal = (r) => ({
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  code: r.code,
  name: r.name,
  customerId: r.customer_id || "",
  leadId: r.lead_id || "",
  partyName: r.party_name || "",
  amount: Number(r.amount) || 0,
  stage: r.stage || "NEW",
  probability: Number(r.probability) || 0,
  openDate: r.open_date,
  expectDate: r.expect_date || "",
  closeDate: r.close_date || "",
  salesId: r.sales_id || "",
  source: r.source || "",
  lostReason: r.lost_reason || "",
  note: r.note || "",
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromDeal = (d) => ({
  id: d.id,
  code: d.code,
  name: d.name,
  customer_id: d.customerId || null,
  lead_id: d.leadId || null,
  party_name: d.partyName || "",
  amount: Number(d.amount) || 0,
  stage: d.stage || "NEW",
  probability: Number(d.probability) || 0,
  open_date: d.openDate,
  // วันที่ว่างต้องส่งเป็น null ไม่ใช่สตริงว่าง ไม่งั้น Postgres ปฏิเสธทั้งแถว
  expect_date: d.expectDate || null,
  close_date: d.closeDate || null,
  sales_id: d.salesId || null,
  source: d.source || "",
  lost_reason: d.lostReason || "",
  note: d.note || "",
  user_name: d.user || "",
  ts: d.ts,
});

const toActivity = (r) => ({
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  kind: r.kind || "CALL",
  date: r.date,
  customerId: r.customer_id || "",
  leadId: r.lead_id || "",
  dealId: r.deal_id || "",
  partyName: r.party_name || "",
  subject: r.subject || "",
  result: r.result || "",
  nextDate: r.next_date || "",
  nextNote: r.next_note || "",
  salesId: r.sales_id || "",
  note: r.note || "",
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromActivity = (a) => ({
  id: a.id,
  kind: a.kind || "CALL",
  date: a.date,
  customer_id: a.customerId || null,
  lead_id: a.leadId || null,
  deal_id: a.dealId || null,
  party_name: a.partyName || "",
  subject: a.subject || "",
  result: a.result || "",
  next_date: a.nextDate || null,
  next_note: a.nextNote || "",
  sales_id: a.salesId || null,
  note: a.note || "",
  user_name: a.user || "",
  ts: a.ts,
});

const toTarget = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  year: Number(r.year) || 0,
  // 0 = เป้าทั้งปี ไม่ใช่เดือนศูนย์
  month: Number(r.month) || 0,
  salesId: r.sales_id || "",
  grp: r.grp || "",
  brand: r.brand || "",
  kind: r.kind || "",
  amount: Number(r.amount) || 0,
  qty: Number(r.qty) || 0,
  note: r.note || "",
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromTarget = (t) => ({
  id: t.id,
  year: Number(t.year) || 0,
  month: Number(t.month) || 0,
  sales_id: t.salesId || null,
  grp: t.grp || "",
  brand: t.brand || "",
  kind: t.kind || "",
  amount: Number(t.amount) || 0,
  qty: Number(t.qty) || 0,
  note: t.note || "",
  user_name: t.user || "",
  ts: t.ts,
});

const toSqlConn = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  name: r.name,
  kind: r.kind || "mssql",
  server: r.server || "",
  port: Number(r.port) || 0,
  filePath: r.file_path || "",
  database: r.db_name || "",
  login: r.login || "",
  // null = ไม่ได้เก็บรหัสผ่านไว้บนฐานข้อมูล ต่างจาก "" ที่แปลว่าเก็บไว้แต่เป็นค่าว่าง
  password: r.password === null || r.password === undefined ? null : r.password,
  encrypt: r.encrypt !== false,
  trustCert: r.trust_cert === true,
  bridgeUrl: r.bridge_url || "",
  note: r.note || "",
  isDefault: r.is_default === true,
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromSqlConn = (c) => ({
  id: c.id,
  name: c.name,
  kind: c.kind || "mssql",
  server: c.server || "",
  port: Number(c.port) || 0,
  file_path: c.filePath || "",
  db_name: c.database || "",
  login: c.login || "",
  password: c.password === null || c.password === undefined ? null : c.password,
  encrypt: c.encrypt !== false,
  trust_cert: c.trustCert === true,
  bridge_url: c.bridgeUrl || "",
  note: c.note || "",
  is_default: c.isDefault === true,
  user_name: c.user || "",
  ts: c.ts,
});

const toShipEvent = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  invoiceId: r.invoice_id,
  docNo: r.doc_no || "",
  status: r.status,
  station: r.station || "",
  note: r.note || "",
  user: r.user_name || "",
  ts: Number(r.ts) || 0,
});

const fromShipEvent = (e) => ({
  id: e.id,
  invoice_id: e.invoiceId,
  doc_no: e.docNo || "",
  status: e.status,
  station: e.station || "",
  note: e.note || "",
  user_name: e.user || "",
  ts: e.ts,
});

const toPerm = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
  id: r.id,
  view: r.can_view !== false,
  edit: r.can_edit !== false,
  date: r.can_date !== false,
});

const fromPerm = (p) => ({
  id: p.id,
  can_view: p.view !== false,
  can_edit: p.edit !== false,
  can_date: p.date !== false,
});

const toCustomer = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
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
  // พนักงานขายประจำของลูกค้ารายนี้ ใช้เติมให้เองตอนออกใบขาย
  salesId: r.sales_id || "",
  taxId: r.tax_id || "",
  branch: r.branch || "",
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
  sales_id: c.salesId || null,
  tax_id: c.taxId || "",
  branch: c.branch || "",
});

const toTxn = (r) => ({
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
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
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
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
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
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
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
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
  // เลขลำดับแถวที่ฐานข้อมูลออกให้ อ่านอย่างเดียว ไม่ได้ส่งกลับตอนบันทึก
  rowOrder: Number(r.row_order) || 0,
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
  "company",
  "invoices",
  "invoice_items",
  "screen_perms",
  "suppliers",
  "purchases",
  "purchase_items",
  "purchase_returns",
  "purchase_return_items",
  "stock_counts",
  "stock_count_items",
  "ship_events",
  "sql_connections",
  "salespersons",
  "sales_targets",
  "print_forms",
  "product_terms",
  "crm_leads",
  "crm_deals",
  "crm_activities",
  "customer_kinds",
  "voc_channels",
  "voc_records",
  "voc_surveys",
  "voc_survey_results",
  "voc_actions",
  "voc_levels",
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

  const [locations, placements, sales, saleItems, docGroups, customers, company, invoices, invoiceItems, perms] =
    await Promise.all([
      fetchOptional("locations", "zone.asc,col_no.asc", missing),
      fetchOptional("product_locations", null, missing),
      fetchOptional("sales", "ts.asc", missing),
      fetchOptional("sale_items", null, missing),
      fetchOptional("doc_groups", "id.asc", missing),
      fetchOptional("customers", "code.asc", missing),
      fetchOptional("company", null, missing),
      fetchOptional("invoices", "ts.asc", missing),
      fetchOptional("invoice_items", null, missing),
      fetchOptional("screen_perms", "id.asc", missing),
    ]);

  const [suppliers, purchases, purchaseItems, purchaseReturns, purchaseReturnItems] =
    await Promise.all([
      fetchOptional("suppliers", "code.asc", missing),
      fetchOptional("purchases", "ts.asc", missing),
      fetchOptional("purchase_items", null, missing),
      fetchOptional("purchase_returns", "ts.asc", missing),
      fetchOptional("purchase_return_items", null, missing),
    ]);

  const [
    stockCounts,
    stockCountItems,
    shipEvents,
    sqlConnections,
    salespersons,
    targets,
    forms,
    terms,
    leads,
    deals,
    acts,
    custKinds,
  ] =
    await Promise.all([
      fetchOptional("stock_counts", "ts.asc", missing),
      fetchOptional("stock_count_items", null, missing),
      fetchOptional("ship_events", "ts.asc", missing),
      fetchOptional("sql_connections", "name.asc", missing),
      fetchOptional("salespersons", "code.asc", missing),
      fetchOptional("sales_targets", null, missing),
      fetchOptional("print_forms", "name.asc", missing),
      fetchOptional("product_terms", "code.asc", missing),
      fetchOptional("crm_leads", "code.asc", missing),
      fetchOptional("crm_deals", "ts.asc", missing),
      fetchOptional("crm_activities", "date.asc", missing),
      fetchOptional("customer_kinds", "code.asc", missing),
    ]);

  // หมวดการรับฟังลูกค้า — ดึงแยกชุดเพราะเป็นหมวดของตัวเอง
  // ระบบที่ยังไม่ได้อัปเดต schema จะไม่มีตารางชุดนี้ ส่วนอื่นต้องยังใช้งานได้ตามปกติ
  const [vocChannels, vocRecords, vocSurveys, vocResults, vocActions, vocLevels] =
    await Promise.all([
      fetchOptional("voc_channels", "code.asc", missing),
      fetchOptional("voc_records", "date.asc", missing),
      fetchOptional("voc_surveys", "code.asc", missing),
      fetchOptional("voc_survey_results", null, missing),
      fetchOptional("voc_actions", "code.asc", missing),
      fetchOptional("voc_levels", null, missing),
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
    // ตารางกิจการมีแถวเดียวเสมอ ยังไม่เคยบันทึกก็ถือว่าไม่มีข้อมูล
    company: (company || []).map(toCompany)[0] || null,
    invoices: (invoices || []).map(toInvoice).sort((a, b) => a.ts - b.ts),
    invoiceItems: (invoiceItems || []).map(toInvoiceItem),
    perms: (perms || []).map(toPerm),
    suppliers: (suppliers || []).map(toSupplier),
    purchases: (purchases || []).map(toPurchase).sort((a, b) => a.ts - b.ts),
    purchaseItems: (purchaseItems || []).map(toPurchaseItem),
    purchaseReturns: (purchaseReturns || []).map(toReturn).sort((a, b) => a.ts - b.ts),
    purchaseReturnItems: (purchaseReturnItems || []).map(toReturnItem),
    stockCounts: (stockCounts || []).map(toCount).sort((a, b) => a.ts - b.ts),
    stockCountItems: (stockCountItems || []).map(toCountItem),
    shipEvents: (shipEvents || []).map(toShipEvent).sort((a, b) => a.ts - b.ts),
    sqlConnections: (sqlConnections || []).map(toSqlConn),
    salespersons: (salespersons || []).map(toSalesperson),
    salesTargets: (targets || []).map(toTarget),
    printForms: (forms || []).map(toPrintForm),
    productTerms: (terms || []).map(toProductTerm),
    crmLeads: (leads || []).map(toLead),
    crmDeals: (deals || []).map(toDeal).sort((a, b) => a.ts - b.ts),
    crmActivities: (acts || []).map(toActivity),
    customerKinds: (custKinds || []).map(toCustomerKind),
    vocChannels: (vocChannels || []).map(toVocChannel),
    vocRecords: (vocRecords || []).map(toVocRecord),
    vocSurveys: (vocSurveys || []).map(toVocSurvey),
    vocResults: (vocResults || []).map(toVocResult),
    vocActions: (vocActions || []).map(toVocAction),
    vocLevels: (vocLevels || []).map(toVocLevel),
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
    { name: "company", label: "ตารางข้อมูลกิจการ" },
    { name: "invoices", label: "ตารางใบขายสินค้าและบริการ" },
    { name: "invoice_items", label: "ตารางรายการในใบขาย" },
    { name: "screen_perms", label: "ตารางสิทธิการใช้งานหน้าจอ" },
    { name: "suppliers", label: "ตารางเจ้าหนี้" },
    { name: "purchases", label: "ตารางใบซื้อสินค้าและบริการ" },
    { name: "purchase_items", label: "ตารางรายการในใบซื้อ" },
    { name: "purchase_returns", label: "ตารางใบส่งคืนสินค้า" },
    { name: "purchase_return_items", label: "ตารางรายการในใบส่งคืน" },
    { name: "stock_counts", label: "ตารางใบตรวจนับสินค้า" },
    { name: "stock_count_items", label: "ตารางรายการในใบตรวจนับ" },
    { name: "ship_events", label: "ตารางบันทึกการเดินสถานะจัดส่ง" },
    { name: "sql_connections", label: "ตารางการเชื่อมต่อ SQL Server" },
    { name: "salespersons", label: "ตารางพนักงานขาย" },
    { name: "sales_targets", label: "ตารางเป้าขาย" },
    { name: "print_forms", label: "ตารางฟอร์มพิมพ์" },
    { name: "product_terms", label: "ตารางกลุ่ม/ยี่ห้อ/ประเภทสินค้า" },
    { name: "crm_leads", label: "ตารางลูกค้าเป้าหมาย" },
    { name: "crm_deals", label: "ตารางโอกาสการขาย" },
    { name: "crm_activities", label: "ตารางบันทึกกิจกรรม" },
    { name: "customer_kinds", label: "ตารางประเภทลูกค้า" },
    { name: "voc_channels", label: "ตารางช่องทางการรับฟังลูกค้า" },
    { name: "voc_records", label: "ตารางเสียงของลูกค้า" },
    { name: "voc_surveys", label: "ตารางรอบการประเมินความพึงพอใจ" },
    { name: "voc_survey_results", label: "ตารางผลการประเมิน" },
    { name: "voc_actions", label: "ตารางแผนปรับปรุงและนวัตกรรม" },
    { name: "voc_levels", label: "ตารางผลการยืนยันจุดตรวจตามเกณฑ์" },
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

/** หน้าจอข้อมูลกิจการพร้อมใช้หรือยัง */
export const companyReady = (missing) => !missing.includes("company");

/** หน้าจอขายสินค้าและบริการ / จัดส่ง พร้อมใช้หรือยัง */
export const invoicesReady = (missing) =>
  !missing.includes("invoices") && !missing.includes("invoice_items");

/** หน้าจอกำหนดสิทธิการใช้งานพร้อมใช้หรือยัง */
export const permsReady = (missing) => !missing.includes("screen_perms");

/** หน้าจอตรวจนับสินค้าพร้อมใช้หรือยัง */
export const countsReady = (missing) =>
  !missing.includes("stock_counts") && !missing.includes("stock_count_items");

/** หน้าจอสถานีสแกนจัดส่งพร้อมใช้หรือยัง (ต้องมีใบขายด้วย ไม่ใช่แค่ตารางเหตุการณ์) */
export const shipEventsReady = (missing) =>
  !missing.includes("ship_events") && !missing.includes("invoices");

/** หน้าจอออกแบบฟอร์มพิมพ์พร้อมใช้หรือยัง */
export const formsReady = (missing) => !missing.includes("print_forms");

/* ------------------------------------------------- ฟอร์มพิมพ์ */

/**
 * เพิ่ม/แก้ไขฟอร์มพิมพ์
 *
 * ตั้งเป็นค่าเริ่มต้นได้ทีละหนึ่งฟอร์มต่อชนิดเอกสาร จึงต้องปลดของเดิมที่ฐานข้อมูลด้วย
 * ไม่ใช่ปลดแค่ในหน้าจอ ไม่งั้นเปิดใหม่อีกครั้งจะมีค่าเริ่มต้นสองอัน
 * แล้วเอกสารจะพิมพ์ด้วยฟอร์มไหนก็ขึ้นกับลำดับที่อ่านข้อมูลมาได้ ซึ่งไม่แน่นอน
 *
 * ปลดของเดิมก่อนค่อยเขียนอันใหม่ ถ้าทำสลับกันจะปลดอันที่เพิ่งตั้งไปด้วย
 */
export async function upsertPrintForm(f) {
  if (f.isDefault) {
    await rest(
      "print_forms?doc_kind=eq." + encodeURIComponent(f.docKind) +
        "&id=neq." + encodeURIComponent(f.id) + "&is_default=is.true",
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ is_default: false }),
      }
    );
  }

  await rest("print_forms", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromPrintForm(f)]),
  });
}

/** ลบฟอร์มพิมพ์ — กลุ่มเอกสารที่อ้างอยู่จะกลับไปใช้ฟอร์มมาตรฐาน */
export async function deletePrintForm(id) {
  await rest("print_forms?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/**
 * หน้าจอพนักงานขายพร้อมใช้หรือยัง
 *
 * ชื่อต้องไม่ชนกับ salesReady ที่หมายถึงตารางขายหน้าร้าน (sales / sale_items)
 * ทั้งสองอย่างเป็นคนละตารางและพังคนละแบบ ถ้าใช้ชื่อเดียวกันจะประกาศซ้ำ
 * ซึ่งเป็น SyntaxError ที่ทำให้ทั้งไฟล์ใช้ไม่ได้ (เคยเกิดขึ้นจริง ดูรอบ 73)
 */
export const salespersonsReady = (missing) => !missing.includes("salespersons");

/** หน้าจอทะเบียนประเภทลูกค้าพร้อมใช้หรือยัง */
export const custKindsReady = (missing) => !missing.includes("customer_kinds");

/** เพิ่ม/แก้ไขประเภทลูกค้า */
export async function upsertCustomerKind(k) {
  await rest("customer_kinds", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromCustomerKind(k)]),
  });
}

/** ลบประเภทลูกค้า — ลูกค้าที่ใช้ชื่อนี้อยู่ไม่ถูกแตะ เพราะเก็บเป็นข้อความในตัวเอง */
export async function deleteCustomerKind(id) {
  await rest("customer_kinds?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/** หน้าจอทะเบียนกลุ่ม/ยี่ห้อ/ประเภทสินค้าพร้อมใช้หรือยัง */
export const termsReady = (missing) => !missing.includes("product_terms");

/** เพิ่ม/แก้ไขรายการในทะเบียนกลุ่ม/ยี่ห้อ/ประเภทสินค้า */
export async function upsertProductTerm(t) {
  await rest("product_terms", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromProductTerm(t)]),
  });
}

/** ลบรายการในทะเบียน — สินค้าที่ใช้ชื่อนี้อยู่ไม่ถูกแตะ เพราะเก็บเป็นข้อความในตัวเอง */
export async function deleteProductTerm(id) {
  await rest("product_terms?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/**
 * หน้าจองานลูกค้าสัมพันธ์พร้อมใช้หรือยัง
 *
 * ต้องมีครบทั้งสามตาราง เพราะทุกหน้าจอในกลุ่มนี้อ้างถึงกัน
 * (ดีลอ้างผู้สนใจ · กิจกรรมอ้างดีล) มีไม่ครบแล้วเปิดใช้ จะพังตอนกดบันทึก
 */
export const crmReady = (missing) =>
  !missing.includes("crm_leads") &&
  !missing.includes("crm_deals") &&
  !missing.includes("crm_activities");

/** เพิ่ม/แก้ไขลูกค้าเป้าหมาย */
export async function upsertLead(l) {
  await rest("crm_leads", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromLead(l)]),
  });
}

/** ลบลูกค้าเป้าหมาย — ดีลและกิจกรรมที่อ้างอยู่จะถูกตั้งเป็นว่าง ไม่ถูกลบตาม */
export async function deleteLead(id) {
  await rest("crm_leads?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/** เพิ่ม/แก้ไขโอกาสการขาย */
export async function upsertDeal(d) {
  await rest("crm_deals", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromDeal(d)]),
  });
}

/** ลบโอกาสการขาย */
export async function deleteDeal(id) {
  await rest("crm_deals?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/** เพิ่ม/แก้ไขบันทึกกิจกรรม */
export async function upsertActivity(a) {
  await rest("crm_activities", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromActivity(a)]),
  });
}

/** ลบบันทึกกิจกรรม */
export async function deleteActivity(id) {
  await rest("crm_activities?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/** หน้าจอเป้าขายพร้อมใช้หรือยัง — ต้องมีพนักงานขายด้วย เพราะเป้าอ้างถึงคน */
export const targetsReady = (missing) =>
  !missing.includes("sales_targets") && !missing.includes("salespersons");

/* ------------------------------------------ พนักงานขายและเป้าขาย */

/** เพิ่ม/แก้ไขพนักงานขาย */
export async function upsertSalesperson(p) {
  await rest("salespersons", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromSalesperson(p)]),
  });
}

/** ลบพนักงานขาย — ใบขายเดิมยังเก็บรหัสและชื่อไว้ในตัวเอกสาร */
export async function deleteSalesperson(id) {
  await rest("salespersons?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/** เพิ่ม/แก้ไขเป้าขาย */
export async function upsertTarget(t) {
  await rest("sales_targets", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromTarget(t)]),
  });
}

/** ลบเป้าขาย */
export async function deleteTarget(id) {
  await rest("sales_targets?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/** หน้าจอเชื่อมต่อ SQL Server พร้อมใช้หรือยัง */

/* ================================================ การรับฟังลูกค้า (หมวด 3) */

/**
 * หมวดการรับฟังลูกค้าพร้อมใช้หรือยัง
 *
 * ต้องมีครบทั้งหกตาราง เพราะทุกหน้าจอในหมวดนี้อ้างถึงกันเป็นทอด ๆ
 * (เสียงลูกค้าอ้างช่องทาง · ผลประเมินอ้างรอบ · แผนงานอ้างทั้งสองอย่าง ·
 *  หน้าประเมินระดับอ่านทุกตารางเพื่อตรวจจุดตรวจอัตโนมัติ)
 * มีไม่ครบแล้วเปิดใช้ ระดับที่คำนวณได้จะผิดโดยไม่มีใครรู้ ซึ่งอันตรายกว่าเปิดไม่ได้เลย
 */
export const vocReady = (missing) =>
  !missing.includes("voc_channels") &&
  !missing.includes("voc_records") &&
  !missing.includes("voc_surveys") &&
  !missing.includes("voc_survey_results") &&
  !missing.includes("voc_actions") &&
  !missing.includes("voc_levels");

/** เพิ่ม/แก้ไขช่องทางการรับฟัง */
export async function upsertVocChannel(c) {
  await rest("voc_channels", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromVocChannel(c)]),
  });
}

/** ลบช่องทางการรับฟัง — ถ้ามีเสียงลูกค้าอ้างอยู่ ฐานข้อมูลจะปฏิเสธ (restrict) */
export async function deleteVocChannel(id) {
  await rest("voc_channels?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/** เพิ่ม/แก้ไขเสียงของลูกค้า */
export async function upsertVocRecord(r) {
  await rest("voc_records", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromVocRecord(r)]),
  });
}

/** ลบเสียงของลูกค้า — แผนงานที่อ้างอยู่จะถูกตั้งเป็นว่าง ไม่ถูกลบตาม */
export async function deleteVocRecord(id) {
  await rest("voc_records?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/** เพิ่ม/แก้ไขรอบการประเมิน */
export async function upsertVocSurvey(s) {
  await rest("voc_surveys", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromVocSurvey(s)]),
  });
}

/** ลบรอบการประเมิน — ผลของรอบนั้นถูกลบตามไปด้วย (cascade) */
export async function deleteVocSurvey(id) {
  await rest("voc_surveys?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/** เพิ่ม/แก้ไขผลการประเมินหนึ่งรายการ */
export async function upsertVocResult(r) {
  await rest("voc_survey_results", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromVocResult(r)]),
  });
}

/** ลบผลการประเมินหนึ่งรายการ */
export async function deleteVocResult(id) {
  await rest("voc_survey_results?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/** เพิ่ม/แก้ไขแผนปรับปรุง ความรู้ หรือนวัตกรรม */
export async function upsertVocAction(a) {
  await rest("voc_actions", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromVocAction(a)]),
  });
}

/** ลบแผนงาน */
export async function deleteVocAction(id) {
  await rest("voc_actions?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/**
 * บันทึกผลการยืนยันจุดตรวจหนึ่งข้อ
 *
 * check_id มี unique index อยู่ จึงต้องส่ง on_conflict ให้ตรงกับคอลัมน์นั้น
 * ไม่งั้น PostgREST จะชนกับ primary key แทน แล้วยืนยันซ้ำจุดเดิมจะได้ 409
 */
export async function upsertVocLevel(l) {
  await rest("voc_levels?on_conflict=check_id", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromVocLevel(l)]),
  });
}

/** ลบผลการยืนยันจุดตรวจ (กลับไปเป็นยังไม่ยืนยัน) */
export async function deleteVocLevel(id) {
  await rest("voc_levels?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

export const sqlReady = (missing) => !missing.includes("sql_connections");

/* ------------------------------------------ การเชื่อมต่อ SQL Server */

/**
 * เพิ่มหรือแก้ไขการเชื่อมต่อที่บันทึกไว้
 *
 * ตั้งเป็นค่าเริ่มต้นได้ทีละหนึ่งอัน จึงต้องปลดของเดิมที่ฐานข้อมูลด้วย ไม่ใช่ปลดแค่ในหน้าจอ
 * ไม่งั้นเปิดใหม่อีกครั้งจะมีค่าเริ่มต้นสองอัน แล้วหน้าจอจะเลือกอันไหนก็ขึ้นกับลำดับที่อ่านมา
 */
export async function upsertSqlConn(conn) {
  if (conn.isDefault) {
    await rest(
      "sql_connections?id=neq." + encodeURIComponent(conn.id) + "&is_default=is.true",
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ is_default: false }),
      }
    );
  }

  await rest("sql_connections", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromSqlConn(conn)]),
  });
}

/** ลบการเชื่อมต่อที่บันทึกไว้ */
export async function deleteSqlConn(id) {
  await rest("sql_connections?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/* --------------------------------------------- การเดินสถานะจัดส่ง */

/**
 * บันทึกเหตุการณ์เดินสถานะหนึ่งครั้ง
 *
 * แยกจาก updateInvoiceShip เพราะเหตุการณ์ต้องเขียนได้แม้ตารางสถานะปัจจุบันจะเขียนพลาด
 * และเขียนเหตุการณ์ก่อนเสมอ ประวัติจึงไม่มีทางขาดช่วง
 */
export async function addShipEvent(ev) {
  await rest("ship_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([fromShipEvent(ev)]),
  });
}

/* ------------------------------------------------- ใบตรวจนับสินค้า */

/** สร้างใบตรวจนับพร้อมรายการที่จะไปนับ */
export async function createCount(count, items) {
  await rest("stock_counts", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([fromCount(count)]),
  });
  await insertChunked("stock_count_items", items.map(fromCountItem));
}

/**
 * บันทึกจำนวนที่นับได้ของรายการเดียว
 *
 * ยิงทีละรายการตอนกดตกลงบนมือถือ ไม่รอจนนับครบทั้งใบแล้วค่อยส่งทีเดียว
 * เพราะคนเดินนับในคลังสัญญาณมักหลุด ถ้าเก็บไว้ในเครื่องแล้วแอปถูกปิด งานหายทั้งกะ
 */
export async function saveCountItem(id, counted) {
  await rest("stock_count_items?id=eq." + encodeURIComponent(id), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      counted: counted === null ? null : Number(counted),
      counted_at: counted === null ? null : Date.now(),
    }),
  });
}

/** ปิดใบตรวจนับ พร้อมผูกเลขที่เอกสารปรับปรุงที่ออกไป */
export async function closeCount(id, postedDoc) {
  await rest("stock_counts?id=eq." + encodeURIComponent(id), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "DONE", posted_doc: postedDoc || "" }),
  });
}

/** ลบใบตรวจนับ (รายการในใบถูกลบตามด้วย on delete cascade) */
export async function deleteCount(id) {
  await rest("stock_counts?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/** หน้าจอเจ้าหนี้พร้อมใช้หรือยัง */
export const suppliersReady = (missing) => !missing.includes("suppliers");

/** หน้าจอซื้อสินค้าและบริการพร้อมใช้หรือยัง */
export const purchasesReady = (missing) =>
  !missing.includes("purchases") && !missing.includes("purchase_items");

/** หน้าจอส่งคืนสินค้าพร้อมใช้หรือยัง */
export const returnsReady = (missing) =>
  purchasesReady(missing) &&
  !missing.includes("purchase_returns") &&
  !missing.includes("purchase_return_items");

/* ---------------------------------------------- สิทธิการใช้งานหน้าจอ */

/** บันทึกสิทธิของหน้าจอหนึ่ง */
export async function savePerm(perm) {
  await rest("screen_perms", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromPerm(perm)]),
  });
}

/** บันทึกสิทธิหลายหน้าจอพร้อมกัน (ปุ่มเปิดหมด/ปิดหมด) */
export async function savePerms(list) {
  if (!list.length) return;
  await rest("screen_perms", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify(list.map(fromPerm)),
  });
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

/* ---------------------------------------------------------- เจ้าหนี้ */

/** เพิ่ม/แก้ไขเจ้าหนี้ */
export async function upsertSupplier(supplier) {
  await rest("suppliers", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromSupplier(supplier)]),
  });
}

/** ลบเจ้าหนี้ */
export async function deleteSupplier(id) {
  await rest("suppliers?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/* -------------------------------------------- ซื้อ / ส่งคืนสินค้า */

/** ยิง RPC พร้อมข้อความช่วยเหลือเมื่อฐานข้อมูลยังไม่มีฟังก์ชันนั้น */
async function callRpc(name, body) {
  try {
    await rest("rpc/" + name, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (new RegExp(name + "|PGRST202|function", "i").test(e.message)) {
      throw new Error(
        "ยังไม่มีฟังก์ชัน " + name + " บนฐานข้อมูล — ให้รัน supabase/schema.sql ทั้งไฟล์อีกครั้ง " +
          "ใน Supabase SQL Editor (" + e.message + ")"
      );
    }
    throw e;
  }
}

/** บันทึกใบซื้อ + รายการ + รับของเข้าคลัง ในคำขอเดียว */
export async function createPurchase(purchase, items) {
  await callRpc("create_purchase", {
    p_pur: fromPurchase(purchase),
    p_items: items.map((i) => ({
      id: i.id,
      txn_id: i.txnId,
      pl_id: i.plId,
      product_id: i.productId,
      wh_id: i.whId,
      loc_id: i.locId || null,
      qty: Number(i.qty) || 0,
      price: Number(i.price) || 0,
      disc_pct: Number(i.discPct) || 0,
      disc_amt: Number(i.discAmt) || 0,
      amount: Number(i.amount) || 0,
      seq: Number(i.seq) || 0,
    })),
  });
}

/** บันทึกใบส่งคืน + รายการ + ตัดของออกจากคลัง ในคำขอเดียว */
export async function createPurchaseReturn(ret, items) {
  await callRpc("create_purchase_return", {
    p_ret: fromReturn(ret),
    p_items: items.map((i) => ({
      id: i.id,
      txn_id: i.txnId,
      item_id: i.itemId || "",
      product_id: i.productId,
      wh_id: i.whId,
      loc_id: i.locId || null,
      qty: Number(i.qty) || 0,
      price: Number(i.price) || 0,
      disc_pct: Number(i.discPct) || 0,
      disc_amt: Number(i.discAmt) || 0,
      amount: Number(i.amount) || 0,
      seq: Number(i.seq) || 0,
    })),
  });
}

/* ------------------------------------------------------ ข้อมูลกิจการ */

/** บันทึกข้อมูลกิจการ (มีแถวเดียวเสมอ id = main) */
export async function saveCompany(company) {
  await rest("company", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify([fromCompany(company)]),
  });
}

/* ------------------------------------------ ใบขายสินค้าและบริการ */

/**
 * บันทึกใบขาย + รายการ + ตัดสต็อก ในคำขอเดียว
 *
 * ใช้ฟังก์ชันบนฐานข้อมูลเหมือน create_sale ของ POS เพราะต้องสำเร็จหมดหรือไม่สำเร็จเลย
 * ถ้าเขียนทีละตารางจากฝั่ง client แล้วพลาดกลางทาง จะได้ใบขายที่ไม่ได้ตัดสต็อก
 */
export async function createInvoice(invoice, items) {
  const payloadItems = items.map((i) => ({
    id: i.id,
    txn_id: i.txnId,
    product_id: i.productId,
    wh_id: i.whId,
    loc_id: i.locId || null,
    qty: Number(i.qty) || 0,
    price: Number(i.price) || 0,
    disc_pct: Number(i.discPct) || 0,
    disc_amt: Number(i.discAmt) || 0,
    amount: Number(i.amount) || 0,
    seq: Number(i.seq) || 0,
  }));

  try {
    await rest("rpc/create_invoice", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ p_inv: fromInvoice(invoice), p_items: payloadItems }),
    });
  } catch (e) {
    if (/create_invoice|PGRST202|function/i.test(e.message)) {
      throw new Error(
        "ยังไม่มีฟังก์ชัน create_invoice บนฐานข้อมูล — ให้รัน supabase/schema.sql ทั้งไฟล์อีกครั้ง " +
          "ใน Supabase SQL Editor (" + e.message + ")"
      );
    }
    throw e;
  }
}

/**
 * เก็บผลการคำนวณระยะทาง (พิกัดปลายทาง + ระยะทาง + เวลาที่คำนวณ)
 *
 * แยกจาก updateInvoiceShip เพราะเป็นคนละเรื่องกัน อันนั้นคือคนกดเปลี่ยนสถานะ
 * อันนี้คือระบบเติมข้อมูลที่คำนวณได้ให้เอง ถ้ารวมกันแล้วเรียกผิดตัว
 * การคำนวณระยะทางจะไปทับสถานะที่คนเพิ่งกดโดยไม่ตั้งใจ
 */
export async function updateInvoiceDistance(id, patch) {
  await rest("invoices?id=eq." + encodeURIComponent(id), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      cust_lat: patch.custLat === undefined ? null : patch.custLat,
      cust_lng: patch.custLng === undefined ? null : patch.custLng,
      ship_km: patch.shipKm === undefined ? null : patch.shipKm,
      ship_km_at: patch.shipKmAt || null,
    }),
  });
}

/** แก้สถานะการจัดส่งของใบขาย (ไม่แตะรายการหรือสต็อก) */
export async function updateInvoiceShip(id, patch) {
  await rest("invoices?id=eq." + encodeURIComponent(id), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      ship_status: patch.shipStatus,
      ship_from: patch.shipFrom || null,
      ship_note: patch.shipNote || "",
      ship_ts: patch.shipTs || null,
    }),
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
  // ตารางของฟีเจอร์ใหม่ ฐานข้อมูลที่ยังไม่ได้อัปเดต schema จะไม่มี จึงข้ามได้
  // ใบขายต้องลบก่อนลูกค้า เพราะอ้าง customer_id แบบ restrict
  await skipIfMissing(rest("sales_targets?id=not.is.null", opts));
  await skipIfMissing(rest("print_forms?id=not.is.null", opts));
  await skipIfMissing(rest("product_terms?id=not.is.null", opts));
  await skipIfMissing(rest("customer_kinds?id=not.is.null", opts));
  // ลบจากปลายทางเข้าหาต้นทาง กิจกรรม -> ดีล -> ผู้สนใจ
  // หมวดการรับฟังลูกค้า ลบจากปลายทางเข้าหาต้นทาง
  // แผนงาน -> ผลประเมิน -> รอบประเมิน -> เสียงลูกค้า -> ช่องทาง (ช่องทางถูกอ้างแบบ restrict)
  await skipIfMissing(rest("voc_levels?id=not.is.null", opts));
  await skipIfMissing(rest("voc_actions?id=not.is.null", opts));
  await skipIfMissing(rest("voc_survey_results?id=not.is.null", opts));
  await skipIfMissing(rest("voc_surveys?id=not.is.null", opts));
  await skipIfMissing(rest("voc_records?id=not.is.null", opts));
  await skipIfMissing(rest("voc_channels?id=not.is.null", opts));
  await skipIfMissing(rest("crm_activities?id=not.is.null", opts));
  await skipIfMissing(rest("crm_deals?id=not.is.null", opts));
  await skipIfMissing(rest("crm_leads?id=not.is.null", opts));
  await skipIfMissing(rest("sql_connections?id=not.is.null", opts));
  await skipIfMissing(rest("ship_events?id=not.is.null", opts));
  await skipIfMissing(rest("invoice_items?id=not.is.null", opts));
  await skipIfMissing(rest("invoices?id=not.is.null", opts));
  await skipIfMissing(rest("doc_groups?id=not.is.null", opts));
  await skipIfMissing(rest("customers?id=not.is.null", opts));
  await skipIfMissing(rest("company?id=not.is.null", opts));
  await skipIfMissing(rest("screen_perms?id=not.is.null", opts));
  // ใบส่งคืนอ้างใบซื้อ ใบซื้ออ้างเจ้าหนี้ จึงต้องลบไล่จากปลายทางกลับมา
  await skipIfMissing(rest("purchase_return_items?id=not.is.null", opts));
  await skipIfMissing(rest("purchase_returns?id=not.is.null", opts));
  await skipIfMissing(rest("purchase_items?id=not.is.null", opts));
  await skipIfMissing(rest("purchases?id=not.is.null", opts));
  await skipIfMissing(rest("suppliers?id=not.is.null", opts));
  await skipIfMissing(rest("stock_count_items?id=not.is.null", opts));
  await skipIfMissing(rest("stock_counts?id=not.is.null", opts));
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
  if (data.company) await skipIfMissing(saveCompany(data.company));
  // ใบขายต้องมาหลังลูกค้าและช่องเก็บ เพราะอ้างถึงทั้งสองอย่าง
  await skipIfMissing(insertChunked("invoices", (data.invoices || []).map(fromInvoice)));
  await skipIfMissing(
    insertChunked("invoice_items", (data.invoiceItems || []).map(fromInvoiceItem))
  );
  await skipIfMissing(insertChunked("screen_perms", (data.perms || []).map(fromPerm)));
  await skipIfMissing(insertChunked("suppliers", (data.suppliers || []).map(fromSupplier)));
  await skipIfMissing(insertChunked("purchases", (data.purchases || []).map(fromPurchase)));
  await skipIfMissing(
    insertChunked("purchase_items", (data.purchaseItems || []).map(fromPurchaseItem))
  );
  await skipIfMissing(
    insertChunked("purchase_returns", (data.purchaseReturns || []).map(fromReturn))
  );
  await skipIfMissing(
    insertChunked("purchase_return_items", (data.purchaseReturnItems || []).map(fromReturnItem))
  );
  await skipIfMissing(insertChunked("stock_counts", (data.stockCounts || []).map(fromCount)));
  await skipIfMissing(
    insertChunked("stock_count_items", (data.stockCountItems || []).map(fromCountItem))
  );
  await skipIfMissing(insertChunked("ship_events", (data.shipEvents || []).map(fromShipEvent)));
  await skipIfMissing(
    insertChunked("sql_connections", (data.sqlConnections || []).map(fromSqlConn))
  );
  await skipIfMissing(
    insertChunked("salespersons", (data.salespersons || []).map(fromSalesperson))
  );
  await skipIfMissing(insertChunked("sales_targets", (data.salesTargets || []).map(fromTarget)));
  await skipIfMissing(insertChunked("print_forms", (data.printForms || []).map(fromPrintForm)));
  await skipIfMissing(
    insertChunked("product_terms", (data.productTerms || []).map(fromProductTerm))
  );
  await skipIfMissing(
    insertChunked("customer_kinds", (data.customerKinds || []).map(fromCustomerKind))
  );
  // ลำดับสำคัญ: ผู้สนใจต้องมาก่อนดีล และดีลต้องมาก่อนกิจกรรม เพราะอ้างถึงกัน
  await skipIfMissing(insertChunked("crm_leads", (data.crmLeads || []).map(fromLead)));
  await skipIfMissing(insertChunked("crm_deals", (data.crmDeals || []).map(fromDeal)));
  await skipIfMissing(
    insertChunked("crm_activities", (data.crmActivities || []).map(fromActivity))
  );

  // ลำดับสำคัญ: ช่องทางต้องมาก่อนเสียงลูกค้า และรอบประเมินต้องมาก่อนผลของรอบนั้น
  await skipIfMissing(insertChunked("voc_channels", (data.vocChannels || []).map(fromVocChannel)));
  await skipIfMissing(insertChunked("voc_records", (data.vocRecords || []).map(fromVocRecord)));
  await skipIfMissing(insertChunked("voc_surveys", (data.vocSurveys || []).map(fromVocSurvey)));
  await skipIfMissing(
    insertChunked("voc_survey_results", (data.vocResults || []).map(fromVocResult))
  );
  await skipIfMissing(insertChunked("voc_actions", (data.vocActions || []).map(fromVocAction)));
  await skipIfMissing(insertChunked("voc_levels", (data.vocLevels || []).map(fromVocLevel)));
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
  if (companyReady(missing)) {
    await saveCompany(fresh.company);
  } else {
    fresh.company = null;
  }
  // ข้อมูลตั้งต้นไม่มีใบขาย แต่ยังต้องบอกหน้าจอว่าตารางพร้อมหรือยัง
  if (!invoicesReady(missing)) {
    fresh.invoices = [];
    fresh.invoiceItems = [];
  }
  // ไม่ใส่แถวสิทธิตั้งต้น เพราะ "ไม่มีแถว" แปลว่าเปิดหมดอยู่แล้ว
  fresh.perms = [];

  if (suppliersReady(missing)) {
    await insertChunked("suppliers", fresh.suppliers.map(fromSupplier));
  } else {
    fresh.suppliers = [];
  }
  // ข้อมูลตั้งต้นไม่มีใบซื้อ/ใบส่งคืน แต่ยังต้องบอกหน้าจอว่าตารางพร้อมหรือยัง
  if (!purchasesReady(missing)) {
    fresh.purchases = [];
    fresh.purchaseItems = [];
  }
  if (!returnsReady(missing)) {
    fresh.purchaseReturns = [];
    fresh.purchaseReturnItems = [];
  }
  if (!countsReady(missing)) {
    fresh.stockCounts = [];
    fresh.stockCountItems = [];
  }
  if (!shipEventsReady(missing)) fresh.shipEvents = [];
  if (!sqlReady(missing)) fresh.sqlConnections = [];
  if (!salespersonsReady(missing)) fresh.salespersons = [];
  if (!targetsReady(missing)) fresh.salesTargets = [];
  if (!formsReady(missing)) fresh.printForms = [];
  if (!termsReady(missing)) fresh.productTerms = [];
  if (!custKindsReady(missing)) fresh.customerKinds = [];
  if (!crmReady(missing)) {
    fresh.crmLeads = [];
    fresh.crmDeals = [];
    fresh.crmActivities = [];
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
