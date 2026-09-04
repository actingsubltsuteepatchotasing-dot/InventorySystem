// ค่าคงที่ของโปรแกรม Ultra ERP (ระบบควบคุมสินค้าคงคลัง)
//
// หมายเหตุ: เดิมระบบใช้รหัสผ่านแบบ Fixed (admin/admin888) และเก็บข้อมูลใน localStorage
// ตอนนี้ย้ายไปใช้ Supabase Auth + Supabase Database แล้ว
// การเข้าสู่ระบบอยู่ที่ lib/auth.js และข้อมูลอยู่ที่ lib/api.js

/** ประเภทรายการเคลื่อนไหว */
export const TYPES = {
  RECEIVE:  { code: "RC", name: "รับสินค้า",      badge: "bdg-ok"   },
  ISSUE:    { code: "IS", name: "เบิกสินค้า",     badge: "bdg-err"  },
  TRANSFER: { code: "TF", name: "โอนสินค้า",      badge: "bdg-info" },
  ADJUST:   { code: "AD", name: "ปรับปรุงสินค้า", badge: "bdg-warn" },
  SALE:     { code: "SL", name: "ขายสินค้า",      badge: "bdg-sale" },
};

/** อัตราภาษีมูลค่าเพิ่ม */
export const VAT_RATE = 0.07;

/** วิธีชำระเงินที่หน้า POS */
export const PAY_METHODS = [
  { id: "CASH",     name: "เงินสด" },
  { id: "TRANSFER", name: "โอนเงิน" },
  { id: "CARD",     name: "บัตรเครดิต" },
];

/** ประเภทช่องเก็บสินค้าในผังคลัง */
export const LOCATION_KINDS = [
  { id: "shelf",  name: "ชั้นวาง",       color: "#0F8A4D" },
  { id: "floor",  name: "พื้นวางกอง",    color: "#0B5FA5" },
  { id: "cold",   name: "ห้องเย็น",      color: "#0E7490" },
  { id: "danger", name: "วัตถุอันตราย",  color: "#B26A00" },
];

/** โซนและจำนวนช่องต่อโซน ที่ใช้สร้างผังตั้งต้นให้ทุกคลัง */
export const SEED_ZONES = ["A", "B", "C"];
export const SEED_COLS = 4;

/** คลังสินค้า 10 แห่ง พร้อมพิกัดสำหรับ Google Map */
export const SEED_WH = [
  { id: "W01", code: "BKK", name: "คลังสำนักงานใหญ่ บางขุนนนท์", province: "กรุงเทพมหานคร", lat: 13.7719, lng: 100.4735 },
  { id: "W02", code: "SNI", name: "คลังสุราษฎร์ธานี",            province: "สุราษฎร์ธานี",  lat: 9.1382,  lng: 99.3215  },
  { id: "W03", code: "SKA", name: "คลังหาดใหญ่",                 province: "สงขลา",         lat: 7.0086,  lng: 100.4747 },
  { id: "W04", code: "NRT", name: "คลังนครศรีธรรมราช",           province: "นครศรีธรรมราช", lat: 8.4304,  lng: 99.9631  },
  { id: "W05", code: "TRG", name: "คลังตรัง",                    province: "ตรัง",          lat: 7.5563,  lng: 99.6114  },
  { id: "W06", code: "YLA", name: "คลังยะลา",                    province: "ยะลา",          lat: 6.541,   lng: 101.2803 },
  { id: "W07", code: "RYG", name: "คลังระยอง",                   province: "ระยอง",         lat: 12.6814, lng: 101.2816 },
  { id: "W08", code: "BKN", name: "คลังบึงกาฬ",                  province: "บึงกาฬ",        lat: 18.3609, lng: 103.0645 },
  { id: "W09", code: "UBN", name: "คลังอุบลราชธานี",             province: "อุบลราชธานี",   lat: 15.2448, lng: 104.8473 },
  { id: "W10", code: "CRI", name: "คลังเชียงราย",                province: "เชียงราย",      lat: 19.9105, lng: 99.8406  },
];

/** สินค้าตัวอย่าง 12 รายการ */
export const SEED_PROD = [
  { code: "P001", name: "น้ำยางข้นชนิดครีม 60%",     unit: "ถัง (200 กก.)",   cat: "วัตถุดิบยาง",    price: 11500, min: 40,   barcode: "8850001000017" },
  { code: "P002", name: "ยางแผ่นรมควันชั้น 3 (RSS3)", unit: "กิโลกรัม",        cat: "วัตถุดิบยาง",    price: 62.5,  min: 2000, barcode: "8850001000024" },
  { code: "P003", name: "ยางแท่ง STR 20",             unit: "กิโลกรัม",        cat: "วัตถุดิบยาง",    price: 58.75, min: 2500, barcode: "8850001000031" },
  { code: "P004", name: "ยางเครพขาว (White Crepe)",   unit: "กิโลกรัม",        cat: "วัตถุดิบยาง",    price: 71,    min: 800,  barcode: "8850001000048" },
  { code: "P005", name: "ถุงมือยางธรรมชาติ",          unit: "กล่อง (100 คู่)", cat: "ผลิตภัณฑ์ยาง",  price: 340,   min: 150,  barcode: "8850001000055" },
  { code: "P006", name: "หมอนยางพารา",                unit: "ใบ",              cat: "ผลิตภัณฑ์ยาง",  price: 890,   min: 60,   barcode: "8850001000062" },
  { code: "P007", name: "แผ่นยางปูพื้นสนามกีฬา",      unit: "แผ่น",            cat: "ผลิตภัณฑ์ยาง",  price: 520,   min: 100,  barcode: "8850001000079" },
  { code: "P008", name: "กรดฟอร์มิก 94%",             unit: "ถัง (35 กก.)",    cat: "เคมีภัณฑ์",      price: 2650,  min: 25,   barcode: "8850001000086" },
  { code: "P009", name: "ปุ๋ยเคมีสูตร 20-8-20",       unit: "กระสอบ (50 กก.)", cat: "ปัจจัยการผลิต",  price: 1180,  min: 120,  barcode: "8850001000093" },
  { code: "P010", name: "ถ้วยรองน้ำยาง",              unit: "ใบ",              cat: "ปัจจัยการผลิต",  price: 9.5,   min: 3000, barcode: "8850001000109" },
  { code: "P011", name: "มีดกรีดยางเจ๊ะบง",           unit: "ด้าม",            cat: "อุปกรณ์",        price: 185,   min: 200,  barcode: "8850001000116" },
  { code: "P012", name: "ถังเก็บน้ำยาง 20 ลิตร",      unit: "ใบ",              cat: "อุปกรณ์",        price: 245,   min: 180,  barcode: "8850001000123" },
];

/** สาเหตุการปรับปรุงยอด */
/* ------------------------------------------------------ กลุ่มเอกสาร */

/**
 * รอบการขึ้นเลข 1 ใหม่ของเลขที่เอกสาร
 *
 * ym = ส่วนที่คั่นระหว่าง prefix กับเลขรัน ซึ่งเป็นตัวกำหนดรอบไปในตัว
 * ถ้าไม่มีส่วนนี้ (none) เลขจะวิ่งต่อเนื่องไปเรื่อย ๆ ไม่ขึ้นต้นใหม่
 */
export const DOC_PERIODS = [
  { id: "none",  name: "ต่อเนื่องตลอด",     hint: "เลขวิ่งต่อไปเรื่อย ๆ ไม่ขึ้นเลข 1 ใหม่" },
  { id: "year",  name: "ขึ้นใหม่ทุกปี",     hint: "ขึ้นเลข 1 ใหม่ทุกวันที่ 1 มกราคม" },
  { id: "month", name: "ขึ้นใหม่ทุกเดือน",  hint: "ขึ้นเลข 1 ใหม่ทุกต้นเดือน" },
];

/**
 * กลุ่มเอกสารเริ่มต้น — ตรงกับรูปแบบเดิมที่ระบบใช้มาก่อนมีหน้าจอนี้
 * (prefix สองตัวอักษร + ปีเดือน + เลข 4 หลัก เช่น RC-202608-0007)
 * ต้องเหมือนเดิมเป๊ะ ไม่งั้นเอกสารเก่ากับใหม่จะคนละชุดเลขกัน
 */
export const SEED_DOC_GROUPS = [
  { id: "RECEIVE",  name: "รับสินค้า",      prefix: "RC", period: "month", digits: 4 },
  { id: "ISSUE",    name: "เบิกสินค้า",     prefix: "IS", period: "month", digits: 4 },
  { id: "TRANSFER", name: "โอนสินค้า",      prefix: "TF", period: "month", digits: 4 },
  { id: "ADJUST",   name: "ปรับปรุงสินค้า", prefix: "AD", period: "month", digits: 4 },
  { id: "SALE",     name: "ขายสินค้า",      prefix: "SL", period: "month", digits: 4 },
];

/* ----------------------------------------------------------- ลูกค้า */

export const CUSTOMER_KINDS = [
  "ลูกค้าทั่วไป",
  "สมาชิก",
  "ตัวแทนจำหน่าย",
  "หน่วยงานราชการ",
  "นิติบุคคล",
];

/** ลูกค้าตัวอย่าง ใช้ตอนสร้างข้อมูลตั้งต้นเท่านั้น */
export const SEED_CUST = [
  { id: "CU1", code: "C0001", name: "ร้านวัสดุก่อสร้างบางขุนนนท์", address: "128/4 ถนนบางขุนนนท์", subdistrict: "บางขุนนนท์", district: "บางกอกน้อย", province: "กรุงเทพมหานคร", postcode: "10700", phone: "02-411-2233", kind: "ตัวแทนจำหน่าย" },
  { id: "CU2", code: "C0002", name: "สหกรณ์กองทุนสวนยางสุราษฎร์", address: "45 หมู่ 3", subdistrict: "ท่าโรงช้าง", district: "พุนพิน", province: "สุราษฎร์ธานี", postcode: "84130", phone: "077-311-455", kind: "นิติบุคคล" },
  { id: "CU3", code: "C0003", name: "นายสมชาย ใจดี", address: "9/12 หมู่ 5", subdistrict: "คอหงส์", district: "หาดใหญ่", province: "สงขลา", postcode: "90110", phone: "081-234-5678", kind: "ลูกค้าทั่วไป" },
];

export const ADJUST_REASONS = [
  "ผลต่างจากการตรวจนับประจำงวด",
  "สินค้าชำรุด / เสื่อมสภาพ",
  "สินค้าสูญหาย",
  "บันทึกรับ-จ่ายผิดพลาด",
  "อื่น ๆ",
];
