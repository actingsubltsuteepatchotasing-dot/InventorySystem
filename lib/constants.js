// ค่าคงที่ของระบบควบคุมสินค้าคงคลัง การยางแห่งประเทศไทย
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
};

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
export const ADJUST_REASONS = [
  "ผลต่างจากการตรวจนับประจำงวด",
  "สินค้าชำรุด / เสื่อมสภาพ",
  "สินค้าสูญหาย",
  "บันทึกรับ-จ่ายผิดพลาด",
  "อื่น ๆ",
];
