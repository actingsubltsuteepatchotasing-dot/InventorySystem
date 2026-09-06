// ชุดข้อมูลที่นำเข้าจาก Excel ได้ — หนึ่งชุดคือหนึ่งหน้าจอ
//
// แยกออกมาจากหน้าจอ เพราะเป็น "สัญญา" ระหว่างสามอย่างที่ต้องตรงกันเสมอ:
//   1. แบบฟอร์มที่ให้ดาวน์โหลดไปกรอก
//   2. ตัวอย่างที่แสดงบนหน้าจอก่อนเลือกไฟล์
//   3. ตัวตรวจและตัวแปลงตอนนำเข้าจริง
// ถ้าเขียนกระจายอยู่ในหน้าจอ สามอย่างนี้จะหลุดจากกันทันทีที่แก้อันใดอันหนึ่ง
//
// ทุกชุดต้องบอก key ว่าใช้อะไรเป็นตัวกันซ้ำ — เลขที่เอกสารหรือรหัส
// เพราะข้อกำหนดคือ "ถ้ามีข้อมูลเดิมซ้ำอยู่แล้วต้องบอกว่าซ้ำเลขที่ไหน"
// ชุดที่ไม่มีตัวกันซ้ำจะเช็คซ้ำไม่ได้ ซึ่งเป็นสิ่งที่ไม่ควรปล่อยผ่าน

/**
 * ชนิดของช่อง — ใช้ทั้งตอนตรวจและตอนแสดงตัวอย่าง
 *   text  ข้อความ
 *   num   ตัวเลข (ตัดลูกน้ำและสัญลักษณ์เงินให้)
 *   date  วันที่ (รับหลายรูปแบบ ดู parseDate ในหน้าจอ)
 *   bool  ใช่/ไม่ใช่
 */
export const IMPORT_SETS = [
  {
    id: "products",
    name: "ข้อมูลสินค้า",
    screen: "products",
    hint: "เพิ่มสินค้าใหม่เข้าทะเบียน · สินค้าที่มีรหัสซ้ำจะไม่ถูกเขียนทับ",
    key: "code",
    keyName: "รหัสสินค้า",
    fields: [
      { id: "code", name: "รหัสสินค้า", type: "text", need: true, example: "IC0001",
        note: "ห้ามซ้ำกับที่มีอยู่แล้ว ใช้เป็นตัวอ้างถึงสินค้า" },
      { id: "name", name: "ชื่อสินค้า", type: "text", need: true, example: "น้ำยางข้น 60%",
        note: "ชื่อที่จะแสดงในทุกหน้าจอ" },
      { id: "unit", name: "หน่วยนับ", type: "text", need: true, example: "ถัง",
        note: "เช่น ชิ้น กล่อง ถัง กิโลกรัม" },
      { id: "cat", name: "หมวดหมู่", type: "text", need: false, example: "ยางพารา",
        note: "เว้นว่างได้ ระบบจะใส่ว่า ทั่วไป ให้" },
      { id: "price", name: "ราคาต่อหน่วย", type: "num", need: false, example: "1250.00",
        note: "ใส่เป็นตัวเลข มีลูกน้ำก็ได้" },
      { id: "min", name: "จุดสั่งซื้อ", type: "num", need: false, example: "10",
        note: "ต่ำกว่านี้จะขึ้นเตือนที่แดชบอร์ด" },
      { id: "barcode", name: "บาร์โค๊ด", type: "text", need: false, example: "8851234567890",
        note: "ใช้ยิงที่หน้า POS และหน้านับสินค้า" },
    ],
  },

  {
    id: "customers",
    name: "รายละเอียดลูกค้า",
    screen: "customers",
    hint: "เพิ่มลูกค้าเข้าทะเบียน · รหัสที่ซ้ำจะไม่ถูกเขียนทับ",
    key: "code",
    keyName: "รหัสลูกค้า",
    fields: [
      { id: "code", name: "รหัสลูกค้า", type: "text", need: true, example: "C0001",
        note: "ห้ามซ้ำ ใช้อ้างถึงลูกค้าในเอกสาร" },
      { id: "name", name: "ชื่อลูกค้า", type: "text", need: true, example: "บริษัท สยามยาง จำกัด",
        note: "ชื่อตามที่จะพิมพ์ลงใบกำกับภาษี" },
      { id: "address", name: "ที่อยู่", type: "text", need: false, example: "99/1 ถนนมิตรภาพ",
        note: "บ้านเลขที่และถนน" },
      { id: "subdistrict", name: "ตำบล / แขวง", type: "text", need: false, example: "ในเมือง", note: "" },
      { id: "district", name: "อำเภอ / เขต", type: "text", need: false, example: "เมืองขอนแก่น", note: "" },
      { id: "province", name: "จังหวัด", type: "text", need: false, example: "ขอนแก่น",
        note: "ใช้กรองรายจังหวัดที่กระดานสถานะจัดส่ง" },
      { id: "postcode", name: "รหัสไปรษณีย์", type: "text", need: false, example: "40000", note: "" },
      { id: "phone", name: "เบอร์โทร", type: "text", need: false, example: "043-123456", note: "" },
      { id: "taxId", name: "เลขประจำตัวผู้เสียภาษี", type: "text", need: false, example: "0105512345678",
        note: "ต้องมีถ้าจะออกใบกำกับภาษีเต็มรูปแบบให้" },
      { id: "branch", name: "สาขา", type: "text", need: false, example: "สำนักงานใหญ่", note: "" },
      { id: "kind", name: "ประเภทลูกค้า", type: "text", need: false, example: "โรงงาน", note: "" },
    ],
  },

  {
    id: "suppliers",
    name: "รายละเอียดเจ้าหนี้",
    screen: "suppliers",
    hint: "เพิ่มเจ้าหนี้เข้าทะเบียน · โครงเดียวกับลูกค้าทุกช่อง",
    key: "code",
    keyName: "รหัสเจ้าหนี้",
    fields: [
      { id: "code", name: "รหัสเจ้าหนี้", type: "text", need: true, example: "S0001", note: "ห้ามซ้ำ" },
      { id: "name", name: "ชื่อเจ้าหนี้", type: "text", need: true, example: "หจก. วัสดุภัณฑ์", note: "" },
      { id: "address", name: "ที่อยู่", type: "text", need: false, example: "12 ถนนศรีจันทร์", note: "" },
      { id: "subdistrict", name: "ตำบล / แขวง", type: "text", need: false, example: "ในเมือง", note: "" },
      { id: "district", name: "อำเภอ / เขต", type: "text", need: false, example: "เมืองขอนแก่น", note: "" },
      { id: "province", name: "จังหวัด", type: "text", need: false, example: "ขอนแก่น", note: "" },
      { id: "postcode", name: "รหัสไปรษณีย์", type: "text", need: false, example: "40000", note: "" },
      { id: "phone", name: "เบอร์โทร", type: "text", need: false, example: "043-654321", note: "" },
      { id: "taxId", name: "เลขประจำตัวผู้เสียภาษี", type: "text", need: false, example: "0403512345678", note: "" },
      { id: "branch", name: "สาขา", type: "text", need: false, example: "สำนักงานใหญ่", note: "" },
      { id: "kind", name: "ประเภทเจ้าหนี้", type: "text", need: false, example: "ผู้ผลิต", note: "" },
    ],
  },

  {
    id: "warehouses",
    name: "คลังสินค้า",
    screen: "whsetup",
    hint: "เพิ่มคลัง · ระบบจะสร้างช่องเก็บตั้งต้นให้เองที่หน้ากำหนดคลังและที่เก็บ",
    key: "code",
    keyName: "รหัสคลัง",
    fields: [
      { id: "code", name: "รหัสคลัง", type: "text", need: true, example: "WH-KKN", note: "ห้ามซ้ำ" },
      { id: "name", name: "ชื่อคลัง", type: "text", need: true, example: "คลังขอนแก่น", note: "" },
      { id: "province", name: "จังหวัด", type: "text", need: true, example: "ขอนแก่น",
        note: "ใช้แสดงบนแผนที่หน้าสินค้าตามจังหวัด" },
      { id: "lat", name: "ละติจูด", type: "num", need: false, example: "16.4419",
        note: "เว้นว่างได้ ไปปักหมุดเองทีหลังที่หน้าสินค้าตามจังหวัด" },
      { id: "lng", name: "ลองจิจูด", type: "num", need: false, example: "102.8360", note: "" },
    ],
  },

  {
    id: "bills",
    name: "บิลสำหรับติดตามการจัดส่ง",
    screen: "billimport",
    hint: "ใบสำหรับติดตามการจัดส่งเท่านั้น ไม่ตัดสต็อก (เหมือนหน้าดึงบิลอัตโนมัติ)",
    key: "docNo",
    keyName: "เลขที่เอกสาร",
    fields: [
      { id: "docNo", name: "เลขที่เอกสาร", type: "text", need: true, example: "IV-202609-0001",
        note: "ห้ามซ้ำ ใช้ยิงบาร์โค๊ดที่สถานีสแกน" },
      { id: "date", name: "วันที่เอกสาร", type: "date", need: true, example: "06/09/2026",
        note: "รับทั้ง 2026-09-06 · 06/09/2026 · 06/09/2569 และรูปแบบวันที่ของ Excel" },
      { id: "custCode", name: "รหัสลูกค้า", type: "text", need: true, example: "C0001",
        note: "ตรงกับทะเบียนลูกค้าแล้วระบบผูกให้เอง" },
      { id: "custName", name: "ชื่อลูกค้า", type: "text", need: true, example: "บริษัท สยามยาง จำกัด", note: "" },
      { id: "custAddress", name: "ที่อยู่จัดส่ง", type: "text", need: true, example: "99/1 ถนนมิตรภาพ", note: "" },
      { id: "custProvince", name: "จังหวัด", type: "text", need: true, example: "ขอนแก่น", note: "" },
      { id: "total", name: "ยอดเงิน", type: "num", need: true, example: "10700.00", note: "" },
    ],
  },
];

/** ชุดข้อมูลจากรหัส ไม่รู้จักคืน null ให้ผู้เรียกจัดการเอง ไม่เดาเป็นตัวแรก */
export const setOf = (id) => IMPORT_SETS.find((s) => s.id === id) || null;

/** หัวคอลัมน์ของแบบฟอร์มชุดนั้น */
export const headOf = (set) => set.fields.map((f) => f.name);

/** แถวตัวอย่างของชุดนั้น ใช้ทั้งบนหน้าจอและในไฟล์แบบฟอร์ม */
export const sampleOf = (set) => set.fields.map((f) => f.example);
