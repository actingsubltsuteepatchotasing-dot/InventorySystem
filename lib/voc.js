// การรับฟังลูกค้า (SE-AM หมวด 3) — กติกา เกณฑ์ และการคำนวณทั้งหมด
//
// หมวดนี้แยกออกจากงานส่วนอื่นของโปรแกรมโดยตั้งใจ
//   งานคลัง งานขาย งานลูกค้าสัมพันธ์ ตอบคำถามว่า "ขายอะไรไปเท่าไร"
//   ส่วนหมวดนี้ตอบคำถามว่า "เราฟังลูกค้าอย่างเป็นระบบแค่ไหน และอยู่ระดับไหนของเกณฑ์"
//   ซึ่งเป็นคนละเรื่องกัน มีผู้ใช้คนละกลุ่ม และถูกตรวจด้วยเกณฑ์คนละชุด
//
// สิ่งที่หมวดนี้ต้องทำให้ได้ (ตามเกณฑ์ประเมินรัฐวิสาหกิจ หมวด 3 น้ำหนัก 10%):
//   3.1 การรับฟังลูกค้า
//   3.2 การประเมินความพึงพอใจ ความไม่พึงพอใจ และความผูกพัน
//   แต่ละข้อมี 5 ระดับ และเป็นเกณฑ์แบบสะสม — ระดับ 3 จะได้ก็ต่อเมื่อผ่าน 1 และ 2 มาแล้ว
//
// กติกาที่ยึดไว้:
//   1. ระดับที่ได้ "คำนวณสด" จากข้อมูลจริงในระบบ ไม่ใช่ตัวเลขที่คนพิมพ์ใส่
//      จุดตรวจส่วนใหญ่ผูกกับข้อมูลที่ระบบมีอยู่แล้ว (ช่องทาง เสียงลูกค้า รอบประเมิน แผนงาน)
//      ตรวจเองไม่ได้จริง ๆ เท่านั้นจึงให้คนยืนยัน และต้องแนบหลักฐานเสมอ
//      เกณฑ์ที่ให้คนติ๊กเองได้ทั้งหมด ไม่ต่างอะไรกับแบบฟอร์มกระดาษ
//   2. จุดตรวจที่ระบบตรวจให้ จะบอกด้วยว่า "ขาดอะไร" ไม่ใช่แค่ผ่าน/ไม่ผ่าน
//      เพราะรายงานที่บอกว่าไม่ผ่านเฉย ๆ ไม่ช่วยให้ใครรู้ว่าต้องไปทำอะไรต่อ
//   3. ข้อความของแต่ละระดับเก็บตามต้นฉบับของเกณฑ์ ไม่ย่อ ไม่ตีความใหม่
//      เพราะเวลาถูกตรวจจริง ผู้ตรวจอ่านจากต้นฉบับ

import { todayISO } from "./format";

/* ==========================================================================
 * ข้อมูลตั้งต้นของหน่วยงาน
 * ======================================================================== */

/**
 * กลุ่มลูกค้า — มี 2 กลุ่มใหญ่
 *
 * เกณฑ์ระดับ 2 ขึ้นไปบังคับว่าต้องรับฟัง "ครบถ้วนทุกกลุ่มลูกค้า"
 * รายชื่อกลุ่มจึงต้องตายตัว ไม่ใช่ให้พิมพ์เอง ไม่งั้นพิมพ์ต่างกันนิดเดียว
 * ระบบจะนับว่าเป็นคนละกลุ่ม แล้วรายงานความครอบคลุมจะผิดทันที
 */
export const CUST_GROUPS = [
  {
    id: "COMM",
    name: "กลุ่มลูกค้าเชิงพาณิชย์",
    short: "เชิงพาณิชย์",
    desc: "ซื้อขายตามกลไกตลาด เน้นราคา คุณภาพ และความตรงเวลา",
  },
  {
    id: "PROMO",
    name: "กลุ่มลูกค้าด้านส่งเสริม",
    short: "ด้านส่งเสริม",
    desc: "รับการส่งเสริมและสนับสนุนตามภารกิจ เน้นการเข้าถึงและองค์ความรู้",
  },
];

export const groupOf = (id) => CUST_GROUPS.find((g) => g.id === id) || CUST_GROUPS[0];

/**
 * ผลิตภัณฑ์ที่อยู่ในขอบเขตการรับฟัง
 *
 * แยกจากทะเบียนสินค้า (products) โดยตั้งใจ
 *   ทะเบียนสินค้าเป็นรายการที่ซื้อ-ขาย-นับสต็อกจริง มีเป็นร้อยรายการและเปลี่ยนตลอด
 *   ส่วนรายการนี้คือ "กลุ่มผลิตภัณฑ์ที่ใช้จำแนกเสียงลูกค้าและผลสำรวจ"
 *   ซึ่งต้องคงที่ ไม่งั้นเทียบผลข้ามรอบประเมินไม่ได้
 */
export const VOC_PRODUCTS = [
  { id: "RUBPRD", name: "ผลิตภัณฑ์จากยางพารา", group: "ผลิตภัณฑ์แปรรูป" },
  { id: "PILLOW", name: "หมอน", group: "ผลิตภัณฑ์แปรรูป" },
  { id: "TOPPER", name: "ท้อปเปอร์", group: "ผลิตภัณฑ์แปรรูป" },
  { id: "CUPLUMP", name: "ยางก้อนถ้วย", group: "วัตถุดิบยาง" },
  { id: "BLOCK", name: "ยางก้อนแท่ง", group: "วัตถุดิบยาง" },
  { id: "FERTCHEM", name: "ปุ๋ยเคมี", group: "ปัจจัยการผลิต" },
  { id: "FERTORG", name: "ปุ๋ยอินทรีย์", group: "ปัจจัยการผลิต" },
  { id: "BIOEXT", name: "น้ำหมักชีวภาพ", group: "ปัจจัยการผลิต" },
];

export const productOf = (id) => VOC_PRODUCTS.find((p) => p.id === id);
export const productName = (id) => (productOf(id) || {}).name || "ไม่ระบุผลิตภัณฑ์";

/**
 * วงจรชีวิตของการเป็นลูกค้า
 *
 * เกณฑ์ระดับ 2 ระบุไว้ตรง ๆ ว่าต้องครอบคลุม "ลูกค้าปัจจุบัน อดีตลูกค้า
 * ลูกค้าคู่แข่ง และผู้ที่อาจจะเป็นลูกค้าในอนาคต" — สี่กลุ่มนี้จึงห้ามขาด
 * ส่วนลูกค้าใหม่แยกออกมาเพราะความคาดหวังต่างจากลูกค้าที่อยู่มานาน
 */
export const LIFECYCLE = [
  { id: "FUTURE", name: "ผู้ที่อาจเป็นลูกค้าในอนาคต", required: true },
  { id: "NEW", name: "ลูกค้าใหม่", required: false },
  { id: "CURRENT", name: "ลูกค้าปัจจุบัน", required: true },
  { id: "FORMER", name: "อดีตลูกค้า", required: true },
  { id: "RIVAL", name: "ลูกค้าของคู่แข่ง", required: true },
];

export const lifecycleOf = (id) => LIFECYCLE.find((l) => l.id === id);
export const REQUIRED_LIFECYCLE = LIFECYCLE.filter((l) => l.required).map((l) => l.id);

/**
 * มิติของความต้องการและความคาดหวัง
 * เกณฑ์ระบุสี่ด้าน: ผลิตภัณฑ์และบริการ · การสนับสนุนลูกค้า · การทำธุรกรรม · การจัดการความสัมพันธ์
 */
export const DIMENSIONS = [
  { id: "PRODUCT", name: "ผลิตภัณฑ์และบริการ" },
  { id: "SUPPORT", name: "การสนับสนุนลูกค้า" },
  { id: "TXN", name: "การทำธุรกรรม" },
  { id: "RELATION", name: "การจัดการความสัมพันธ์" },
  { id: "IMAGE", name: "ภาพลักษณ์องค์กร" },
];

export const dimensionOf = (id) => DIMENSIONS.find((d) => d.id === id);
/** สี่มิติแรกคือมิติที่เกณฑ์ข้อ 3.1 บังคับ ส่วนภาพลักษณ์เป็นมิติของข้อ 3.2 */
export const REQUIRED_DIMENSIONS = ["PRODUCT", "SUPPORT", "TXN", "RELATION"];

/**
 * ชนิดช่องทางการรับฟัง
 *
 * digital = ช่องทางดิจิทัล ใช้ตรวจเกณฑ์ระดับ 2 ที่บังคับว่าต้องมี
 * "การใช้สื่อสังคมออนไลน์และเทคโนโลยีบนเว็บเพื่อรับฟังลูกค้า"
 */
export const CHANNEL_KINDS = [
  { id: "SOCIAL", name: "สื่อสังคมออนไลน์", digital: true },
  { id: "WEB", name: "เว็บไซต์ / แบบฟอร์มออนไลน์", digital: true },
  { id: "APP", name: "แอปพลิเคชัน / แชทบอท", digital: true },
  { id: "CALL", name: "ศูนย์รับเรื่อง / โทรศัพท์", digital: false },
  { id: "VISIT", name: "พบลูกค้า / ลงพื้นที่", digital: false },
  { id: "EVENT", name: "ประชุม สัมมนา ออกบูธ", digital: false },
  { id: "SURVEY", name: "แบบสำรวจ / แบบสอบถาม", digital: false },
  { id: "FRONT", name: "จุดให้บริการหน้าเคาน์เตอร์", digital: false },
  { id: "DOC", name: "หนังสือร้องเรียน / จดหมาย", digital: false },
];

export const channelKindOf = (id) => CHANNEL_KINDS.find((k) => k.id === id) || CHANNEL_KINDS[0];

/** ความถี่ในการรับฟังและการประเมิน */
export const FREQUENCIES = [
  { id: "REALTIME", name: "ตลอดเวลา", perYear: 365 },
  { id: "DAILY", name: "ทุกวัน", perYear: 250 },
  { id: "WEEKLY", name: "ทุกสัปดาห์", perYear: 52 },
  { id: "MONTHLY", name: "ทุกเดือน", perYear: 12 },
  { id: "QUARTERLY", name: "ทุกไตรมาส", perYear: 4 },
  { id: "HALFYEAR", name: "ทุกครึ่งปี", perYear: 2 },
  { id: "YEARLY", name: "ปีละครั้ง", perYear: 1 },
];

export const freqOf = (id) => FREQUENCIES.find((f) => f.id === id) || FREQUENCIES[3];

/* ==========================================================================
 * เสียงของลูกค้า (VOC)
 * ======================================================================== */

/** ประเภทของเสียงที่รับฟังมา */
export const VOC_KINDS = [
  { id: "NEED", name: "ความต้องการ / ความคาดหวัง", kind: "info" },
  { id: "COMPLAINT", name: "ข้อร้องเรียน", kind: "err" },
  { id: "SUGGEST", name: "ข้อเสนอแนะ", kind: "warn" },
  { id: "PRAISE", name: "คำชม", kind: "ok" },
  { id: "INQUIRY", name: "สอบถาม / ขอข้อมูล", kind: "gray" },
];

export const vocKindOf = (id) => VOC_KINDS.find((k) => k.id === id) || VOC_KINDS[0];

/**
 * ระดับความสำคัญ — เกณฑ์ระดับ 4 บังคับว่าต้อง "จัดลำดับความสำคัญ"
 * weight ใช้เรียงลำดับในรายงาน
 */
export const PRIORITIES = [
  { id: "HIGH", name: "สูง", weight: 3, kind: "err" },
  { id: "MED", name: "ปานกลาง", weight: 2, kind: "warn" },
  { id: "LOW", name: "ต่ำ", weight: 1, kind: "gray" },
];

export const priorityOf = (id) => PRIORITIES.find((p) => p.id === id) || PRIORITIES[1];

/**
 * สถานะการจัดการเสียงลูกค้าหนึ่งเรื่อง
 *
 * analyzed = ผ่านการวิเคราะห์และจัดลำดับความสำคัญแล้ว (ใช้ตรวจเกณฑ์ระดับ 4)
 * closed   = ปิดเรื่องแล้ว
 */
export const VOC_STATUS = [
  { id: "NEW", name: "รับเรื่องใหม่", analyzed: false, closed: false, kind: "info" },
  { id: "ANALYZED", name: "วิเคราะห์แล้ว", analyzed: true, closed: false, kind: "warn" },
  { id: "ASSIGNED", name: "ส่งต่อหน่วยงานแล้ว", analyzed: true, closed: false, kind: "warn" },
  { id: "DONE", name: "ดำเนินการแล้ว", analyzed: true, closed: true, kind: "ok" },
  { id: "CLOSED", name: "ปิดเรื่อง", analyzed: true, closed: true, kind: "gray" },
];

export const vocStatusOf = (id) => VOC_STATUS.find((s) => s.id === id) || VOC_STATUS[0];
export const isAnalyzed = (r) => vocStatusOf(r.status).analyzed;

/* ==========================================================================
 * การประเมินความพึงพอใจ ความไม่พึงพอใจ และความผูกพัน
 * ======================================================================== */

/**
 * ชนิดของรอบประเมิน
 *
 * เกณฑ์ข้อ 3.2 ระดับ 2 บังคับให้ประเมินครบทั้งสามเรื่อง
 * ส่วน EFFECT คือการประเมิน "ประสิทธิผลของแนวทางการประเมิน" ซึ่งเป็นเกณฑ์ระดับ 5
 * (ประเมินตัวเครื่องมือเอง ไม่ใช่ประเมินลูกค้า จึงต้องแยกชนิดออกมา)
 */
export const SURVEY_KINDS = [
  { id: "SAT", name: "ความพึงพอใจ", core: true },
  { id: "DISSAT", name: "ความไม่พึงพอใจ", core: true },
  { id: "ENGAGE", name: "ความผูกพัน", core: true },
  { id: "EFFECT", name: "ประสิทธิผลของแนวทางการประเมิน", core: false },
];

export const surveyKindOf = (id) => SURVEY_KINDS.find((k) => k.id === id) || SURVEY_KINDS[0];
/** สามชนิดที่เกณฑ์บังคับว่าต้องมีครบ */
export const CORE_SURVEY_KINDS = SURVEY_KINDS.filter((k) => k.core).map((k) => k.id);

/** สถานะของรอบประเมิน */
export const SURVEY_STATUS = [
  { id: "PLAN", name: "วางแผน", done: false, kind: "gray" },
  { id: "FIELD", name: "กำลังเก็บข้อมูล", done: false, kind: "info" },
  { id: "ANALYZE", name: "กำลังวิเคราะห์", done: false, kind: "warn" },
  { id: "DONE", name: "รายงานผลแล้ว", done: true, kind: "ok" },
  { id: "CANCEL", name: "ยกเลิก", done: false, kind: "gray" },
];

export const surveyStatusOf = (id) => SURVEY_STATUS.find((s) => s.id === id) || SURVEY_STATUS[0];

/** ระเบียบวิธีที่ใช้เก็บข้อมูล — เกณฑ์ระดับ 5 ให้ประเมินความเหมาะสมของระเบียบวิธี */
export const METHODS = [
  "แบบสอบถามออนไลน์",
  "แบบสอบถามทางไปรษณีย์",
  "สัมภาษณ์ทางโทรศัพท์",
  "สัมภาษณ์เชิงลึกรายบุคคล",
  "สนทนากลุ่ม (Focus Group)",
  "สำรวจ ณ จุดให้บริการ",
];

/** วิธีสุ่มตัวอย่าง */
export const SAMPLINGS = [
  "สุ่มอย่างง่าย (Simple Random)",
  "สุ่มแบบชั้นภูมิ (Stratified)",
  "สุ่มแบบกลุ่ม (Cluster)",
  "สุ่มตามสะดวก (Convenience)",
  "สำมะโน (เก็บทุกราย)",
];

/* ==========================================================================
 * แผนปรับปรุง ความรู้ และนวัตกรรม
 * ======================================================================== */

/**
 * ชนิดของงานที่ทำต่อจากสารสนเทศที่ได้
 *
 * แต่ละชนิดผูกกับข้อกำหนดของเกณฑ์คนละข้อ จึงต้องแยกชนิดให้ชัด
 * ไม่ใช่กองรวมกันเป็น "แผนงาน" เฉย ๆ แล้วรายงานว่าครบ
 */
export const ACTION_KINDS = [
  { id: "REPORT", name: "รายงานต่อผู้บริหาร", forLevel: "3.1 ระดับ 4" },
  { id: "STRATEGY", name: "จัดทำ/ทบทวนยุทธศาสตร์", forLevel: "3.1-3.2 ระดับ 4" },
  { id: "IMPROVE", name: "ปรับปรุงผลิตภัณฑ์ บริการ หรือกระบวนการ", forLevel: "3.1-3.2 ระดับ 4" },
  { id: "DIGITAL", name: "นำเทคโนโลยีดิจิทัลมาปรับใช้", forLevel: "3.1 ระดับ 3" },
  { id: "COMMUNICATE", name: "สื่อสาร/ถ่ายทอดแนวทางให้บุคลากร", forLevel: "3.1 ระดับ 2" },
  { id: "CONTROL", name: "กำกับ ติดตาม ควบคุมการปฏิบัติงาน", forLevel: "3.1-3.2 ระดับ 3" },
  { id: "EVAL", name: "ประเมินประสิทธิผลของแนวทาง", forLevel: "3.1-3.2 ระดับ 5" },
  { id: "KM", name: "จัดการความรู้ (KM)", forLevel: "3.1-3.2 ระดับ 5" },
  { id: "INNOVATION", name: "นวัตกรรม", forLevel: "3.1-3.2 ระดับ 5" },
];

export const actionKindOf = (id) => ACTION_KINDS.find((k) => k.id === id) || ACTION_KINDS[0];

/** สถานะของแผนงาน */
export const ACTION_STATUS = [
  { id: "PLAN", name: "วางแผน", done: false, kind: "gray" },
  { id: "DOING", name: "กำลังดำเนินการ", done: false, kind: "warn" },
  { id: "DONE", name: "ดำเนินการแล้ว", done: true, kind: "ok" },
  { id: "HOLD", name: "ชะลอไว้", done: false, kind: "gray" },
];

export const actionStatusOf = (id) => ACTION_STATUS.find((s) => s.id === id) || ACTION_STATUS[0];

/* ==========================================================================
 * ตัวเกณฑ์ — ข้อความตามต้นฉบับ และจุดตรวจของแต่ละระดับ
 * ======================================================================== */

/**
 * จุดตรวจหนึ่งข้อ
 *   id     รหัสไม่ซ้ำทั้งระบบ ใช้เป็นกุญแจของตารางบันทึกผล
 *   label  สิ่งที่ต้องทำ เขียนให้เป็นประโยคที่ตรวจได้จริง
 *   auto   ชื่อฟังก์ชันตรวจอัตโนมัติ (ไม่มี = ต้องให้คนยืนยันพร้อมแนบหลักฐาน)
 *
 * จุดตรวจที่มี auto จะไม่ให้คนติ๊กเอง เพราะข้อมูลจริงตอบได้แม่นกว่าความจำของคน
 */

export const CRITERIA = [
  {
    id: "3.1",
    name: "การรับฟังลูกค้า",
    weight: 5,
    intro:
      "กำหนดช่องทางและแนวทางปฏิบัติในการรับฟังลูกค้าอย่างเป็นระบบ " +
      "เพื่อให้ได้มาซึ่งสารสนเทศเสียงของลูกค้าที่ครบถ้วนทุกกลุ่มและทุกช่องทาง " +
      "แล้วนำไปใช้ปรับปรุงงานจริง",
    levels: [
      {
        level: 1,
        text:
          "รัฐวิสาหกิจกำหนดช่องทางและแนวทางปฏิบัติในการรับฟังลูกค้าอย่างเป็นระบบ " +
          "สำหรับลูกค้าเพียงบางกลุ่ม หรือเฉพาะลูกค้าในปัจจุบันเท่านั้น",
        checks: [
          { id: "31L1a", label: "มีช่องทางการรับฟังลูกค้าที่ขึ้นทะเบียนไว้อย่างน้อย 1 ช่องทาง", auto: "hasChannel" },
          { id: "31L1b", label: "ทุกช่องทางมีแนวทางปฏิบัติและผู้รับผิดชอบที่ระบุชัดเจน", auto: "channelHasOwner" },
          { id: "31L1c", label: "มีการบันทึกเสียงลูกค้าที่รับฟังมาแล้วอย่างน้อย 1 เรื่อง", auto: "hasRecord" },
        ],
      },
      {
        level: 2,
        text:
          "รัฐวิสาหกิจกำหนดช่องทางและแนวทางปฏิบัติในการรับฟังลูกค้าอย่างเป็นระบบ ครบถ้วนทุกกลุ่มลูกค้า " +
          "และครอบคลุมทั้งลูกค้าปัจจุบัน อดีตลูกค้า ลูกค้าคู่แข่ง และผู้ที่อาจจะเป็นลูกค้าในอนาคต " +
          "เพื่อค้นหาความต้องการและความคาดหวังของลูกค้าตลอดวงจรชีวิตของการเป็นลูกค้า " +
          "และระดับความสำคัญเชิงเปรียบเทียบในมุมมองของลูกค้าเกี่ยวกับผลิตภัณฑ์และบริการ การสนับสนุนลูกค้า " +
          "การทำธุรกรรม และการจัดการความสัมพันธ์ ตลอดจนมีการใช้สื่อสังคมออนไลน์และเทคโนโลยีบนเว็บเพื่อรับฟังลูกค้า " +
          "รัฐวิสาหกิจสื่อสารและถ่ายทอดแนวทางปฏิบัติในการรับฟังลูกค้าให้กับบุคลากรที่เกี่ยวข้องรับทราบอย่างทั่วถึง " +
          "และสามารถนำไปใช้ในการปฏิบัติงานให้เป็นไปในแนวทางเดียวกัน",
        checks: [
          { id: "31L2a", label: "ช่องทางการรับฟังครอบคลุมครบทุกกลุ่มลูกค้า (เชิงพาณิชย์ และด้านส่งเสริม)", auto: "channelCoversGroups" },
          { id: "31L2b", label: "ครอบคลุมวงจรชีวิตครบ: ลูกค้าปัจจุบัน อดีตลูกค้า ลูกค้าคู่แข่ง และผู้ที่อาจเป็นลูกค้า", auto: "channelCoversLifecycle" },
          { id: "31L2c", label: "รับฟังครบทั้งสี่มิติ: ผลิตภัณฑ์และบริการ การสนับสนุนลูกค้า การทำธุรกรรม และการจัดการความสัมพันธ์", auto: "recordCoversDimensions" },
          { id: "31L2d", label: "มีการใช้สื่อสังคมออนไลน์และเทคโนโลยีบนเว็บเพื่อรับฟังลูกค้า", auto: "hasDigitalChannel" },
          { id: "31L2e", label: "บันทึกระดับความสำคัญเชิงเปรียบเทียบของทุกเรื่องที่รับฟังมา", auto: "recordHasPriority" },
          { id: "31L2f", label: "สื่อสารและถ่ายทอดแนวทางปฏิบัติให้บุคลากรที่เกี่ยวข้องรับทราบอย่างทั่วถึง", auto: "hasCommunicateAction" },
        ],
      },
      {
        level: 3,
        text:
          "รัฐวิสาหกิจกำหนดแนวทางและกลไกในการกำกับ ติดตาม ควบคุมการปฏิบัติงานด้านการรับฟังลูกค้า " +
          "และมีการดำเนินการติดตามการปฏิบัติงานของบุคลากรที่เกี่ยวข้อง เพื่อให้ได้มาซึ่งสารสนเทศเสียงของลูกค้า " +
          "ครบถ้วนในทุกช่องทาง และครบถ้วนทุกกลุ่มลูกค้าตามวงจรชีวิตของลูกค้า " +
          "รัฐวิสาหกิจมีการวิเคราะห์เพื่อพิจารณาการนำเทคโนโลยีดิจิทัลมาปรับใช้ในกระบวนการรับฟังลูกค้าอย่างเหมาะสม",
        checks: [
          { id: "31L3a", label: "มีแนวทางและกลไกกำกับ ติดตาม ควบคุมการปฏิบัติงานด้านการรับฟังลูกค้า", auto: "hasControlAction" },
          { id: "31L3b", label: "ทุกช่องทางที่เปิดใช้งาน มีเสียงลูกค้าเข้ามาจริง (ไม่มีช่องทางที่ตั้งไว้เฉย ๆ)", auto: "everyChannelUsed" },
          { id: "31L3c", label: "ได้สารสนเทศครบถ้วนทุกกลุ่มลูกค้าตามวงจรชีวิต", auto: "recordCoversLifecycle" },
          { id: "31L3d", label: "มีการวิเคราะห์เพื่อนำเทคโนโลยีดิจิทัลมาปรับใช้ในกระบวนการรับฟัง", auto: "hasDigitalAction" },
        ],
      },
      {
        level: 4,
        text:
          "รัฐวิสาหกิจบูรณาการสารสนเทศเสียงของลูกค้าจากทุกช่องทาง มาวิเคราะห์ จัดลำดับความสำคัญ " +
          "และสรุปเป็นความต้องการความคาดหวังได้ครบถ้วนในทุกมิติ (มิติวงจรชีวิตลูกค้า มิติด้านผลิตภัณฑ์และบริการ " +
          "สนับสนุนลูกค้า และมิติกลุ่มลูกค้า) และจัดทำเป็นสารสนเทศเสียงของลูกค้าเพื่อรายงานต่อผู้บริหารระดับสูง " +
          "หน่วยงานที่เกี่ยวข้องอย่างน้อยเป็นรายไตรมาส รวมถึงแสดงให้เห็นถึงการนำสารสนเทศเสียงของลูกค้าไปใช้ " +
          "ในการวางแผนยุทธศาสตร์หรือแผนแม่บท การปรับปรุงผลิตภัณฑ์และบริการ และกระบวนการทำงานที่เกี่ยวข้อง " +
          "รัฐวิสาหกิจมีระบบสารสนเทศสำหรับบูรณาการเชื่อมโยงข้อมูลลูกค้าที่รวบรวมจากทุกจุดที่ให้บริการ " +
          "หรือทุกจุดที่รัฐวิสาหกิจมีปฏิสัมพันธ์กับลูกค้า และสามารถวิเคราะห์ข้อมูลเพื่อให้ได้สารสนเทศความต้องการ " +
          "ความคาดหวังเชิงลึกของแต่ละกลุ่มลูกค้า",
        checks: [
          { id: "31L4a", label: "เสียงลูกค้าทุกเรื่องผ่านการวิเคราะห์และจัดลำดับความสำคัญแล้ว", auto: "recordsAnalyzed" },
          { id: "31L4b", label: "สรุปได้ครบทุกมิติ: วงจรชีวิต ผลิตภัณฑ์และบริการ และกลุ่มลูกค้า", auto: "summaryComplete" },
          { id: "31L4c", label: "รายงานสารสนเทศเสียงของลูกค้าต่อผู้บริหารอย่างน้อยรายไตรมาส", auto: "quarterlyReport" },
          { id: "31L4d", label: "นำสารสนเทศไปใช้วางแผนยุทธศาสตร์หรือแผนแม่บท", auto: "hasStrategyAction" },
          { id: "31L4e", label: "นำสารสนเทศไปปรับปรุงผลิตภัณฑ์ บริการ และกระบวนการทำงาน", auto: "hasImproveAction" },
          { id: "31L4f", label: "มีระบบสารสนเทศบูรณาการข้อมูลลูกค้าจากทุกจุดที่มีปฏิสัมพันธ์" },
        ],
      },
      {
        level: 5,
        text:
          "รัฐวิสาหกิจมีการประเมินประสิทธิผลของการรับฟังลูกค้า ตลอดจนนำผลที่ได้จากการประเมินประสิทธิผล " +
          "ไปเรียนรู้ และจัดการความรู้ เพื่อนำไปปรับปรุงและทำนวัตกรรม " +
          "โดยมีการจัดเก็บความรู้และนวัตกรรมที่ได้ลงระบบดิจิทัล",
        checks: [
          { id: "31L5a", label: "มีการประเมินประสิทธิผลของการรับฟังลูกค้า", auto: "hasEvalAction" },
          { id: "31L5b", label: "นำผลการประเมินไปเรียนรู้และจัดการความรู้ (KM)", auto: "hasKmAction" },
          { id: "31L5c", label: "นำไปปรับปรุงและทำนวัตกรรม", auto: "hasInnovationAction" },
          { id: "31L5d", label: "จัดเก็บความรู้และนวัตกรรมที่ได้ลงระบบดิจิทัล (ระบุที่จัดเก็บ)", auto: "knowledgeStoredDigital" },
        ],
      },
    ],
  },

  {
    id: "3.2",
    name: "การประเมินความพึงพอใจ ความไม่พึงพอใจ และความผูกพัน",
    weight: 5,
    intro:
      "ประเมินความพึงพอใจ ความไม่พึงพอใจ และความผูกพันของลูกค้าอย่างมีระเบียบวิธีที่น่าเชื่อถือ " +
      "ครบทุกกลุ่มลูกค้าและส่วนตลาด เทียบกับคู่แข่งหรือคู่เทียบได้ " +
      "แล้วนำผลไปใช้พัฒนาผลิตภัณฑ์ บริการ และกระบวนการ",
    levels: [
      {
        level: 1,
        text:
          "รัฐวิสาหกิจมีแนวทางการประเมินความพึงพอใจของลูกค้าที่มีต่อผลิตภัณฑ์และบริการของรัฐวิสาหกิจ " +
          "โดยมีวิธีการประเมิน รวบรวมข้อมูล และรายงานผลการประเมินที่มีความน่าเชื่อถืออย่างเหมาะสม",
        checks: [
          { id: "32L1a", label: "มีรอบการประเมินความพึงพอใจอย่างน้อย 1 รอบ", auto: "hasSatSurvey" },
          { id: "32L1b", label: "ทุกรอบระบุระเบียบวิธี วิธีสุ่มตัวอย่าง และขนาดตัวอย่างไว้ครบ", auto: "surveyHasMethod" },
          { id: "32L1c", label: "มีการบันทึกผลการประเมินและรายงานผลแล้วอย่างน้อย 1 รอบ", auto: "hasSurveyResult" },
        ],
      },
      {
        level: 2,
        text:
          "รัฐวิสาหกิจมีการวิเคราะห์ความต้องการความจำเป็นของรัฐวิสาหกิจทั้งในระยะสั้นและระยะยาว " +
          "เพื่อกำหนดวัตถุประสงค์ รูปแบบ ความถี่ของการประเมินความพึงพอใจ ความไม่พึงพอใจ และความผูกพันของลูกค้า " +
          "ที่มีต่อผลิตภัณฑ์และบริการ การสนับสนุนลูกค้า การสร้างความผูกพัน และภาพลักษณ์ของรัฐวิสาหกิจ " +
          "อย่างครบถ้วนในทุกกลุ่มลูกค้าและส่วนตลาด รัฐวิสาหกิจศึกษาปัจจัยความต้องการ ความคาดหวัง " +
          "ที่มีผลต่อความพึงพอใจ ความไม่พึงพอใจ และความผูกพันของลูกค้าครบถ้วนตามกลุ่มลูกค้าและส่วนตลาด " +
          "ตลอดจนมีแนวทางดำเนินการให้ได้มาซึ่งสารสนเทศด้านความพึงพอใจของลูกค้าที่มีต่อรัฐวิสาหกิจ " +
          "เปรียบเทียบกับระดับความพึงพอใจของลูกค้าที่มีต่อคู่แข่งหรือที่มีต่อคู่เทียบ " +
          "ในบริบทการดำเนินงานด้านต่างๆ ที่มีความคล้ายคลึงกัน",
        checks: [
          { id: "32L2a", label: "ทุกรอบระบุวัตถุประสงค์ รูปแบบ และความถี่ของการประเมินไว้ครบ", auto: "surveyHasPurpose" },
          { id: "32L2b", label: "ประเมินครบทั้งสามเรื่อง: ความพึงพอใจ ความไม่พึงพอใจ และความผูกพัน", auto: "surveyCoversKinds" },
          { id: "32L2c", label: "ประเมินครบถ้วนทุกกลุ่มลูกค้าและส่วนตลาด", auto: "surveyCoversGroups" },
          { id: "32L2d", label: "ครอบคลุมทุกด้าน: ผลิตภัณฑ์และบริการ การสนับสนุนลูกค้า ความผูกพัน และภาพลักษณ์", auto: "resultCoversDimensions" },
          { id: "32L2e", label: "ศึกษาปัจจัยที่มีผลต่อความพึงพอใจและความผูกพันครบตามกลุ่มลูกค้า" },
          { id: "32L2f", label: "มีผลเปรียบเทียบกับคู่แข่งหรือคู่เทียบ", auto: "resultHasBenchmark" },
        ],
      },
      {
        level: 3,
        text:
          "รัฐวิสาหกิจกำหนดแนวทางและกลไกในการกำกับ ควบคุม ติดตาม เพื่อให้การประเมินความพึงพอใจ ความไม่พึงพอใจ " +
          "และความผูกพัน เป็นไปตามรูปแบบ ความถี่ และสอดคล้องตามวัตถุประสงค์ที่กำหนด " +
          "และดำเนินการติดตามการปฏิบัติงานของบุคลากรที่เกี่ยวข้องทั้งภายในและภายนอกรัฐวิสาหกิจ " +
          "เพื่อให้การประเมินความพึงพอใจ ความไม่พึงพอใจ และความผูกพัน บรรลุตามวัตถุประสงค์ที่กำหนด",
        checks: [
          { id: "32L3a", label: "มีแนวทางและกลไกกำกับ ควบคุม ติดตามการประเมินให้เป็นไปตามที่กำหนด", auto: "hasSurveyControlAction" },
          { id: "32L3b", label: "ทุกรอบที่ถึงกำหนดแล้ว ดำเนินการเสร็จและรายงานผลครบ", auto: "surveysOnSchedule" },
          { id: "32L3c", label: "ติดตามการปฏิบัติงานของผู้เกี่ยวข้องทั้งภายในและภายนอก (ผู้รับจ้างสำรวจ)" },
        ],
      },
      {
        level: 4,
        text:
          "สารสนเทศที่ได้จากการประเมินความพึงพอใจ ความไม่พึงพอใจ และความผูกพัน สะท้อนประสิทธิผลการดำเนินงาน " +
          "ในการตอบสนองความต้องการ ความคาดหวังด้านผลิตภัณฑ์และบริการ การสนับสนุนลูกค้า การสร้างความผูกพัน ภาพลักษณ์ ฯลฯ " +
          "ของลูกค้าที่มีต่อรัฐวิสาหกิจ รัฐวิสาหกิจนำผลที่ได้จากการประเมินด้านความพึงพอใจ ความไม่พึงพอใจ " +
          "และความผูกพันของลูกค้า ตลอดจนสารสนเทศอื่นๆ ที่ได้จากการสำรวจ ไปใช้เป็นปัจจัยนำเข้าในการจัดทำยุทธศาสตร์ " +
          "ด้านลูกค้าและตลาด การพัฒนา/ปรับปรุงผลิตภัณฑ์และบริการ และกระบวนการดำเนินงานที่เกี่ยวข้อง " +
          "เพื่อตอบสนองลูกค้าได้ตามความต้องการ และเหนือกว่าที่ลูกค้าคาดหวัง และเพิ่มความผูกพันให้กับลูกค้า",
        checks: [
          { id: "32L4a", label: "มีผลประเมินแยกรายกลุ่มลูกค้าและรายผลิตภัณฑ์ ที่สะท้อนประสิทธิผลได้", auto: "resultByGroupProduct" },
          { id: "32L4b", label: "นำผลไปใช้จัดทำยุทธศาสตร์ด้านลูกค้าและตลาด", auto: "surveyToStrategy" },
          { id: "32L4c", label: "นำผลไปพัฒนา/ปรับปรุงผลิตภัณฑ์ บริการ และกระบวนการ", auto: "surveyToImprove" },
        ],
      },
      {
        level: 5,
        text:
          "รัฐวิสาหกิจประเมินประสิทธิผลของแนวทางการประเมินความพึงพอใจ ความไม่พึงพอใจ และความผูกพัน " +
          "โดยพิจารณาจากประเด็นต่างๆ เช่น ความเหมาะสมของระเบียบวิธีวิจัย ความครอบคลุมของประเด็นในการสำรวจ " +
          "ความเหมาะสมของการสุ่มตัวอย่าง ความเที่ยงตรง/น่าเชื่อถือของผลสำรวจ และร้อยละการตอบกลับของกลุ่มตัวอย่าง เป็นต้น " +
          "ตลอดจนนำผลที่ได้จากการประเมินประสิทธิผลไปเรียนรู้ และจัดการความรู้เพื่อนำไปปรับปรุงและทำนวัตกรรม " +
          "โดยมีการจัดเก็บความรู้และนวัตกรรมที่ได้ลงระบบดิจิทัล",
        checks: [
          { id: "32L5a", label: "ทุกรอบบันทึกร้อยละการตอบกลับของกลุ่มตัวอย่าง", auto: "surveyHasResponseRate" },
          { id: "32L5b", label: "มีรอบประเมินประสิทธิผลของแนวทางการประเมิน", auto: "hasEffectSurvey" },
          { id: "32L5c", label: "นำผลไปเรียนรู้และจัดการความรู้ (KM)", auto: "hasKmAction" },
          { id: "32L5d", label: "นำไปปรับปรุงและทำนวัตกรรม", auto: "hasInnovationAction" },
          { id: "32L5e", label: "จัดเก็บความรู้และนวัตกรรมที่ได้ลงระบบดิจิทัล (ระบุที่จัดเก็บ)", auto: "knowledgeStoredDigital" },
        ],
      },
    ],
  },
];

export const criterionOf = (id) => CRITERIA.find((c) => c.id === id) || CRITERIA[0];

/** จุดตรวจทั้งหมดแบนเป็นรายการเดียว ใช้ตอนตรวจว่ารหัสซ้ำหรือหาย */
export const ALL_CHECKS = CRITERIA.flatMap((c) =>
  c.levels.flatMap((lv) => lv.checks.map((ck) => ({ ...ck, crit: c.id, level: lv.level })))
);

export const checkOf = (id) => ALL_CHECKS.find((c) => c.id === id);

/* ==========================================================================
 * ตัวตรวจอัตโนมัติ — ตอบจากข้อมูลจริงในระบบ
 * ======================================================================== */

/** ผลของจุดตรวจหนึ่งข้อ */
const pass = (detail) => ({ ok: true, detail });
const fail = (detail) => ({ ok: false, detail });

/** ชื่อของสิ่งที่ยังขาด เอาไปต่อท้ายข้อความว่า "ยังขาด ..." */
const missingNames = (all, have, nameOf) =>
  all.filter((x) => !have.includes(x)).map((x) => nameOf(x)).join(" · ");

/**
 * ตัวตรวจทั้งหมด — รับข้อมูลทั้งกองแล้วตอบว่าผ่านหรือไม่ พร้อมเหตุผล
 *
 * ทุกตัวต้องตอบเหตุผลเสมอ ไม่ว่าจะผ่านหรือไม่ผ่าน
 * เพราะรายงานที่บอกแค่ "ไม่ผ่าน" ไม่ช่วยให้ใครรู้ว่าต้องไปทำอะไรต่อ
 */
export const AUTO = {
  /* ---------------- ช่องทางการรับฟัง ---------------- */

  hasChannel(d) {
    const n = active(d.vocChannels).length;
    return n ? pass("มีช่องทางที่เปิดใช้งาน " + n + " ช่องทาง") : fail("ยังไม่มีช่องทางที่เปิดใช้งาน");
  },

  channelHasOwner(d) {
    const list = active(d.vocChannels);
    if (!list.length) return fail("ยังไม่มีช่องทางให้ตรวจ");
    const bad = list.filter((c) => !String(c.owner || "").trim() || !String(c.practice || "").trim());
    return bad.length
      ? fail("ยังไม่ได้ระบุผู้รับผิดชอบหรือแนวทางปฏิบัติ " + bad.length + " ช่องทาง: " + bad.map((c) => c.name).join(" · "))
      : pass("ครบทั้ง " + list.length + " ช่องทาง");
  },

  channelCoversGroups(d) {
    const have = uniq(active(d.vocChannels).flatMap((c) => c.groups || []));
    const all = CUST_GROUPS.map((g) => g.id);
    return all.every((g) => have.includes(g))
      ? pass("ครอบคลุมครบทั้ง " + all.length + " กลุ่ม")
      : fail("ยังขาด " + missingNames(all, have, (g) => groupOf(g).name));
  },

  channelCoversLifecycle(d) {
    const have = uniq(active(d.vocChannels).flatMap((c) => c.lifecycle || []));
    return REQUIRED_LIFECYCLE.every((l) => have.includes(l))
      ? pass("ครอบคลุมวงจรชีวิตครบตามที่เกณฑ์กำหนด")
      : fail("ยังขาด " + missingNames(REQUIRED_LIFECYCLE, have, (l) => (lifecycleOf(l) || {}).name || l));
  },

  hasDigitalChannel(d) {
    const digital = active(d.vocChannels).filter((c) => channelKindOf(c.kind).digital);
    const social = digital.some((c) => c.kind === "SOCIAL");
    const web = digital.some((c) => c.kind === "WEB" || c.kind === "APP");
    if (social && web) return pass("มีทั้งสื่อสังคมออนไลน์และช่องทางบนเว็บ");
    if (!digital.length) return fail("ยังไม่มีช่องทางดิจิทัลเลย");
    return fail("มีช่องทางดิจิทัลแล้วแต่ยังไม่ครบ — ยังขาด" + (social ? "ช่องทางบนเว็บ" : "สื่อสังคมออนไลน์"));
  },

  everyChannelUsed(d) {
    const list = active(d.vocChannels);
    if (!list.length) return fail("ยังไม่มีช่องทางให้ตรวจ");
    const used = uniq((d.vocRecords || []).map((r) => r.channelId));
    const idle = list.filter((c) => !used.includes(c.id));
    return idle.length
      ? fail("ยังไม่มีเสียงลูกค้าเข้ามาเลย " + idle.length + " ช่องทาง: " + idle.map((c) => c.name).join(" · "))
      : pass("ทุกช่องทางมีเสียงลูกค้าเข้ามาจริง");
  },

  /* ---------------- เสียงลูกค้า ---------------- */

  hasRecord(d) {
    const n = (d.vocRecords || []).length;
    return n ? pass("บันทึกไว้แล้ว " + n + " เรื่อง") : fail("ยังไม่มีการบันทึกเสียงลูกค้า");
  },

  recordCoversDimensions(d) {
    const have = uniq((d.vocRecords || []).map((r) => r.dimension));
    return REQUIRED_DIMENSIONS.every((x) => have.includes(x))
      ? pass("รับฟังครบทั้งสี่มิติ")
      : fail("ยังขาดมิติ " + missingNames(REQUIRED_DIMENSIONS, have, (x) => (dimensionOf(x) || {}).name || x));
  },

  recordCoversLifecycle(d) {
    const have = uniq((d.vocRecords || []).map((r) => r.lifecycle));
    return REQUIRED_LIFECYCLE.every((x) => have.includes(x))
      ? pass("มีเสียงลูกค้าครบทุกช่วงของวงจรชีวิต")
      : fail("ยังไม่มีเสียงจาก " + missingNames(REQUIRED_LIFECYCLE, have, (x) => (lifecycleOf(x) || {}).name || x));
  },

  recordHasPriority(d) {
    const list = d.vocRecords || [];
    if (!list.length) return fail("ยังไม่มีการบันทึกเสียงลูกค้า");
    const bad = list.filter((r) => !PRIORITIES.some((p) => p.id === r.priority));
    return bad.length
      ? fail("ยังไม่ได้จัดระดับความสำคัญ " + bad.length + " เรื่อง")
      : pass("จัดระดับความสำคัญครบทั้ง " + list.length + " เรื่อง");
  },

  recordsAnalyzed(d) {
    const list = d.vocRecords || [];
    if (!list.length) return fail("ยังไม่มีการบันทึกเสียงลูกค้า");
    const bad = list.filter((r) => !isAnalyzed(r));
    return bad.length
      ? fail("ยังไม่ได้วิเคราะห์ " + bad.length + " เรื่อง จากทั้งหมด " + list.length + " เรื่อง")
      : pass("วิเคราะห์ครบทั้ง " + list.length + " เรื่อง");
  },

  summaryComplete(d) {
    const list = d.vocRecords || [];
    if (!list.length) return fail("ยังไม่มีการบันทึกเสียงลูกค้า");
    const gaps = [];
    if (!CUST_GROUPS.every((g) => list.some((r) => r.groupId === g.id))) gaps.push("มิติกลุ่มลูกค้า");
    if (!REQUIRED_LIFECYCLE.every((l) => list.some((r) => r.lifecycle === l))) gaps.push("มิติวงจรชีวิต");
    if (!REQUIRED_DIMENSIONS.every((x) => list.some((r) => r.dimension === x))) gaps.push("มิติผลิตภัณฑ์และบริการ");
    return gaps.length ? fail("ยังสรุปไม่ครบ: " + gaps.join(" · ")) : pass("สรุปได้ครบทุกมิติ");
  },

  /* ---------------- รอบการประเมิน ---------------- */

  hasSatSurvey(d) {
    const n = (d.vocSurveys || []).filter((s) => s.kind === "SAT").length;
    return n ? pass("มีรอบประเมินความพึงพอใจ " + n + " รอบ") : fail("ยังไม่มีรอบประเมินความพึงพอใจ");
  },

  surveyHasMethod(d) {
    const list = d.vocSurveys || [];
    if (!list.length) return fail("ยังไม่มีรอบประเมิน");
    const bad = list.filter(
      (s) => !String(s.method || "").trim() || !String(s.sampling || "").trim() || !(Number(s.sampleSize) > 0)
    );
    return bad.length
      ? fail("ยังระบุระเบียบวิธีไม่ครบ " + bad.length + " รอบ: " + bad.map((s) => s.name).join(" · "))
      : pass("ครบทั้ง " + list.length + " รอบ");
  },

  surveyHasPurpose(d) {
    const list = d.vocSurveys || [];
    if (!list.length) return fail("ยังไม่มีรอบประเมิน");
    const bad = list.filter((s) => !String(s.purpose || "").trim() || !String(s.form || "").trim() || !s.freq);
    return bad.length
      ? fail("ยังไม่ได้ระบุวัตถุประสงค์ รูปแบบ หรือความถี่ " + bad.length + " รอบ")
      : pass("ครบทั้ง " + list.length + " รอบ");
  },

  surveyCoversKinds(d) {
    const have = uniq((d.vocSurveys || []).map((s) => s.kind));
    return CORE_SURVEY_KINDS.every((k) => have.includes(k))
      ? pass("ประเมินครบทั้งสามเรื่อง")
      : fail("ยังขาดการประเมิน" + missingNames(CORE_SURVEY_KINDS, have, (k) => surveyKindOf(k).name));
  },

  surveyCoversGroups(d) {
    const have = uniq((d.vocResults || []).map((r) => r.groupId));
    const all = CUST_GROUPS.map((g) => g.id);
    return all.every((g) => have.includes(g))
      ? pass("มีผลประเมินครบทั้ง " + all.length + " กลุ่ม")
      : fail("ยังไม่มีผลประเมินของ " + missingNames(all, have, (g) => groupOf(g).name));
  },

  hasSurveyResult(d) {
    const n = (d.vocResults || []).length;
    return n ? pass("บันทึกผลไว้แล้ว " + n + " รายการ") : fail("ยังไม่มีการบันทึกผลการประเมิน");
  },

  resultCoversDimensions(d) {
    const have = uniq((d.vocResults || []).map((r) => r.dimension));
    const need = ["PRODUCT", "SUPPORT", "RELATION", "IMAGE"];
    return need.every((x) => have.includes(x))
      ? pass("ครอบคลุมครบทุกด้านที่เกณฑ์กำหนด")
      : fail("ยังขาดด้าน " + missingNames(need, have, (x) => (dimensionOf(x) || {}).name || x));
  },

  resultHasBenchmark(d) {
    const list = d.vocResults || [];
    if (!list.length) return fail("ยังไม่มีผลการประเมิน");
    const n = list.filter((r) => Number(r.benchmark) > 0).length;
    return n ? pass("มีผลเทียบคู่แข่ง/คู่เทียบ " + n + " รายการ") : fail("ยังไม่มีรายการใดบันทึกคะแนนคู่เทียบไว้");
  },

  resultByGroupProduct(d) {
    const list = d.vocResults || [];
    if (!list.length) return fail("ยังไม่มีผลการประเมิน");
    const byGroup = uniq(list.map((r) => r.groupId)).length;
    const byProduct = uniq(list.filter((r) => r.productId).map((r) => r.productId)).length;
    return byGroup >= CUST_GROUPS.length && byProduct >= 1
      ? pass("แยกผลได้ " + byGroup + " กลุ่มลูกค้า และ " + byProduct + " ผลิตภัณฑ์")
      : fail("ยังแยกผลไม่ครบ — ได้ " + byGroup + " กลุ่ม และ " + byProduct + " ผลิตภัณฑ์");
  },

  surveysOnSchedule(d) {
    const today = todayISO();
    const due = (d.vocSurveys || []).filter((s) => s.status !== "CANCEL" && s.endDate && s.endDate < today);
    if (!due.length) return fail("ยังไม่มีรอบที่ถึงกำหนดแล้วให้ตรวจ");
    const late = due.filter((s) => !surveyStatusOf(s.status).done);
    return late.length
      ? fail("เลยกำหนดแต่ยังไม่รายงานผล " + late.length + " รอบ: " + late.map((s) => s.name).join(" · "))
      : pass("รอบที่ถึงกำหนดแล้ว " + due.length + " รอบ รายงานผลครบ");
  },

  surveyHasResponseRate(d) {
    const list = (d.vocSurveys || []).filter((s) => surveyStatusOf(s.status).done);
    if (!list.length) return fail("ยังไม่มีรอบที่รายงานผลแล้ว");
    const bad = list.filter((s) => !(Number(s.responded) > 0) || !(Number(s.sampleSize) > 0));
    return bad.length
      ? fail("ยังไม่ได้บันทึกจำนวนตอบกลับ " + bad.length + " รอบ")
      : pass("บันทึกครบทั้ง " + list.length + " รอบ · ตอบกลับเฉลี่ย " + Math.round(avgResponseRate(list)) + "%");
  },

  hasEffectSurvey(d) {
    const n = (d.vocSurveys || []).filter((s) => s.kind === "EFFECT").length;
    return n
      ? pass("มีรอบประเมินประสิทธิผลของแนวทาง " + n + " รอบ")
      : fail("ยังไม่มีรอบประเมินประสิทธิผลของแนวทางการประเมิน");
  },

  /* ---------------- แผนงานที่ทำต่อ ---------------- */

  hasCommunicateAction: (d) => actionDone(d, "COMMUNICATE", "การสื่อสารถ่ายทอดแนวทางให้บุคลากร"),
  hasControlAction: (d) => actionDone(d, "CONTROL", "กลไกกำกับ ติดตาม ควบคุมการรับฟัง", "3.1"),
  hasSurveyControlAction: (d) => actionDone(d, "CONTROL", "กลไกกำกับ ควบคุม ติดตามการประเมิน", "3.2"),
  hasDigitalAction: (d) => actionDone(d, "DIGITAL", "การวิเคราะห์นำเทคโนโลยีดิจิทัลมาปรับใช้"),
  hasStrategyAction: (d) => actionDone(d, "STRATEGY", "การนำไปใช้วางแผนยุทธศาสตร์"),
  hasImproveAction: (d) => actionDone(d, "IMPROVE", "การนำไปปรับปรุงผลิตภัณฑ์ บริการ และกระบวนการ"),
  hasEvalAction: (d) => actionDone(d, "EVAL", "การประเมินประสิทธิผล"),
  hasKmAction: (d) => actionDone(d, "KM", "การจัดการความรู้"),
  hasInnovationAction: (d) => actionDone(d, "INNOVATION", "การทำนวัตกรรม"),

  /** นำผลสำรวจไปทำยุทธศาสตร์ — ต้องเป็นแผนที่อ้างรอบประเมินจริง ไม่ใช่แผนลอย ๆ */
  surveyToStrategy: (d) => actionFromSurvey(d, "STRATEGY", "ยุทธศาสตร์ด้านลูกค้าและตลาด"),
  surveyToImprove: (d) => actionFromSurvey(d, "IMPROVE", "การพัฒนา/ปรับปรุงผลิตภัณฑ์และบริการ"),

  quarterlyReport(d) {
    const reports = (d.vocActions || []).filter((a) => a.kind === "REPORT" && actionStatusOf(a.status).done);
    if (!reports.length) return fail("ยังไม่มีรายงานต่อผู้บริหารที่ดำเนินการแล้ว");
    const quarters = uniq(reports.map((a) => quarterKeyOf(a.doneDate || a.dueDate)).filter(Boolean));
    const last4 = lastQuarters(4);
    const have = last4.filter((q) => quarters.includes(q));
    return have.length >= 4
      ? pass("รายงานครบทุกไตรมาสใน 4 ไตรมาสล่าสุด")
      : fail("4 ไตรมาสล่าสุดมีรายงานเพียง " + have.length + " ไตรมาส (ยังขาด " + (4 - have.length) + " ไตรมาส)");
  },

  knowledgeStoredDigital(d) {
    const km = (d.vocActions || []).filter(
      (a) => (a.kind === "KM" || a.kind === "INNOVATION") && actionStatusOf(a.status).done
    );
    if (!km.length) return fail("ยังไม่มีงานจัดการความรู้หรือนวัตกรรมที่ดำเนินการแล้ว");
    const bad = km.filter((a) => !String(a.storeUrl || "").trim());
    return bad.length
      ? fail("ยังไม่ได้ระบุที่จัดเก็บในระบบดิจิทัล " + bad.length + " รายการ")
      : pass("จัดเก็บลงระบบดิจิทัลครบทั้ง " + km.length + " รายการ");
  },
};

/* ------------------------------------------------------- ตัวช่วยของตัวตรวจ */

const uniq = (arr) => [...new Set((arr || []).filter((x) => x !== undefined && x !== null && x !== ""))];
const active = (list) => (list || []).filter((c) => c.active !== false);

/** ค่าเฉลี่ยร้อยละการตอบกลับของรอบที่รายงานผลแล้ว */
export function avgResponseRate(surveys) {
  const list = (surveys || []).filter((s) => Number(s.sampleSize) > 0);
  if (!list.length) return 0;
  const sum = list.reduce((t, s) => t + (Number(s.responded) / Number(s.sampleSize)) * 100, 0);
  return sum / list.length;
}

/** มีแผนงานชนิดนี้ที่ดำเนินการเสร็จแล้วหรือยัง */
function actionDone(d, kind, label, crit) {
  const list = (d.vocActions || []).filter(
    (a) => a.kind === kind && (!crit || !a.crit || a.crit === crit)
  );
  const done = list.filter((a) => actionStatusOf(a.status).done);
  if (done.length) return pass(label + " — ดำเนินการแล้ว " + done.length + " รายการ");
  if (list.length) return fail(label + " — มีแผนแล้ว " + list.length + " รายการ แต่ยังไม่มีรายการใดเสร็จ");
  return fail("ยังไม่มีแผนงานเรื่อง" + label);
}

/** แผนงานที่อ้างรอบประเมินจริง — ใช้พิสูจน์ว่า "นำผลไปใช้" ไม่ใช่แค่มีแผน */
function actionFromSurvey(d, kind, label) {
  const list = (d.vocActions || []).filter((a) => a.kind === kind && a.surveyId);
  const done = list.filter((a) => actionStatusOf(a.status).done);
  if (done.length) return pass("นำผลประเมินไปใช้ใน" + label + " แล้ว " + done.length + " รายการ");
  if (list.length) return fail("มีแผนที่อ้างผลประเมินแล้ว " + list.length + " รายการ แต่ยังไม่เสร็จ");
  return fail("ยังไม่มีแผนงานที่อ้างอิงผลการประเมินไปใช้ใน" + label);
}

/** รหัสไตรมาสของวันที่ เช่น 2026Q3 */
export function quarterKeyOf(iso) {
  if (!iso || iso.length < 7) return "";
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  if (!y || !m) return "";
  return y + "Q" + Math.ceil(m / 3);
}

/** รหัสไตรมาสย้อนหลัง n ไตรมาสนับจากไตรมาสปัจจุบัน (เรียงจากเก่าไปใหม่) */
export function lastQuarters(n, fromISO) {
  const iso = fromISO || todayISO();
  let y = Number(iso.slice(0, 4));
  let q = Math.ceil(Number(iso.slice(5, 7)) / 3);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.unshift(y + "Q" + q);
    q -= 1;
    if (q === 0) {
      q = 4;
      y -= 1;
    }
  }
  return out;
}

/* ==========================================================================
 * การประเมินระดับ
 * ======================================================================== */

/**
 * ผลของจุดตรวจหนึ่งข้อ รวมทั้งแบบอัตโนมัติและแบบที่คนยืนยัน
 *
 * @param {object} check จุดตรวจจาก CRITERIA
 * @param {object} db ข้อมูลทั้งกอง
 * @param {object} manual แถวใน vocLevels ของจุดตรวจนี้ (ถ้ามี)
 */
export function checkResult(check, db, manual) {
  if (check.auto) {
    const fn = AUTO[check.auto];
    // ตัวตรวจหายไปถือว่าไม่ผ่าน ไม่ใช่ผ่าน — ไม่งั้นเขียนชื่อผิดแล้วได้คะแนนฟรี
    if (typeof fn !== "function") {
      return { ok: false, auto: true, detail: "ไม่พบตัวตรวจ " + check.auto, evidence: "" };
    }
    const r = fn(db) || fail("ตรวจไม่ได้");
    return { ok: !!r.ok, auto: true, detail: r.detail || "", evidence: (manual && manual.evidence) || "" };
  }

  const done = !!(manual && manual.done);
  const evidence = String((manual && manual.evidence) || "").trim();
  // ยืนยันเองต้องมีหลักฐานเสมอ ติ๊กเปล่า ๆ ไม่นับ
  if (done && !evidence) return { ok: false, auto: false, detail: "ยืนยันแล้วแต่ยังไม่ได้ระบุหลักฐาน", evidence: "" };
  return {
    ok: done,
    auto: false,
    detail: done ? "ยืนยันโดย " + ((manual && manual.owner) || "ผู้รับผิดชอบ") : "รอการยืนยันพร้อมหลักฐาน",
    evidence,
  };
}

/**
 * ประเมินเกณฑ์ย่อยหนึ่งข้อ
 *
 * เกณฑ์เป็นแบบสะสม — ระดับ n จะได้ก็ต่อเมื่อระดับ 1..n ผ่านครบทุกระดับ
 * ระดับที่ผ่านแบบข้ามขั้น (เช่น 1,2 ไม่ผ่าน แต่ 3 ผ่าน) ไม่นับเป็นระดับที่ได้
 * แต่ยังแสดงให้เห็นในรายงาน เพราะเป็นข้อมูลที่ผู้บริหารต้องรู้ว่าทำไปแล้ว
 */
export function assessCriterion(crit, db, levelRows) {
  const byCheck = new Map((levelRows || []).map((r) => [r.checkId, r]));

  const levels = crit.levels.map((lv) => {
    const checks = lv.checks.map((ck) => ({
      ...ck,
      result: checkResult(ck, db, byCheck.get(ck.id)),
    }));
    const passed = checks.filter((c) => c.result.ok).length;
    return {
      level: lv.level,
      text: lv.text,
      checks,
      passed,
      total: checks.length,
      complete: passed === checks.length,
      percent: checks.length ? (passed / checks.length) * 100 : 0,
    };
  });

  let level = 0;
  for (const lv of levels) {
    if (lv.complete) level = lv.level;
    else break;
  }

  const totalChecks = levels.reduce((t, l) => t + l.total, 0);
  const totalPassed = levels.reduce((t, l) => t + l.passed, 0);

  return {
    id: crit.id,
    name: crit.name,
    weight: crit.weight,
    levels,
    level,
    // คะแนนคิดตามสัดส่วนระดับที่ได้ต่อระดับเต็ม คูณน้ำหนักของเกณฑ์ย่อย
    score: (level / 5) * crit.weight,
    totalChecks,
    totalPassed,
    percent: totalChecks ? (totalPassed / totalChecks) * 100 : 0,
    // ระดับถัดไปที่ต้องไปให้ถึง พร้อมสิ่งที่ยังขาด
    next: levels.find((l) => !l.complete) || null,
  };
}

/** ประเมินทั้งหมวด */
export function assessAll(db) {
  const rows = db.vocLevels || [];
  const items = CRITERIA.map((c) => assessCriterion(c, db, rows.filter((r) => r.crit === c.id)));
  const weight = CRITERIA.reduce((t, c) => t + c.weight, 0);
  const score = items.reduce((t, i) => t + i.score, 0);
  return {
    items,
    weight,
    score,
    // ระดับของทั้งหมวดคือระดับต่ำสุดของข้อย่อย — เกณฑ์ตัดสินจากจุดที่อ่อนที่สุด
    level: items.length ? Math.min(...items.map((i) => i.level)) : 0,
    percent: weight ? (score / weight) * 100 : 0,
    totalChecks: items.reduce((t, i) => t + i.totalChecks, 0),
    totalPassed: items.reduce((t, i) => t + i.totalPassed, 0),
  };
}

/**
 * สิ่งที่ต้องทำต่อเพื่อขึ้นระดับถัดไป — เรียงตามลำดับที่ควรทำก่อนหลัง
 * ใช้ในรายงานผู้บริหาร ซึ่งต้องการคำตอบว่า "แล้วต้องทำอะไรต่อ" ไม่ใช่แค่ตัวเลข
 */
export function gapsOf(assessment) {
  const out = [];
  assessment.items.forEach((it) => {
    it.levels.forEach((lv) => {
      if (lv.complete) return;
      lv.checks.forEach((ck) => {
        if (ck.result.ok) return;
        out.push({
          crit: it.id,
          critName: it.name,
          level: lv.level,
          checkId: ck.id,
          label: ck.label,
          detail: ck.result.detail,
          auto: ck.result.auto,
          // ระดับที่กำลังจะขึ้นถือว่าด่วนที่สุด ระดับที่สูงกว่านั้นรอได้
          blocking: !!it.next && lv.level === it.next.level,
        });
      });
    });
  });
  return out.sort((a, b) => (b.blocking ? 1 : 0) - (a.blocking ? 1 : 0) || a.level - b.level);
}

/* ==========================================================================
 * สรุปเสียงลูกค้าและผลประเมิน (ใช้ในหน้าภาพรวมและรายงาน)
 * ======================================================================== */

/** นับเสียงลูกค้าแยกตามคีย์ที่เลือก */
export function countBy(records, keyOf) {
  const map = new Map();
  (records || []).forEach((r) => {
    const k = keyOf(r);
    if (k === undefined || k === null || k === "") return;
    map.set(k, (map.get(k) || 0) + 1);
  });
  return map;
}

/**
 * สรุปภาพรวมเสียงลูกค้า
 * ตัวเลขชุดนี้ถูกใช้ทั้งหน้าภาพรวม รายงาน และไฟล์นำเสนอ จึงคำนวณที่เดียว
 */
export function vocSummary(db) {
  const list = db.vocRecords || [];
  const analyzed = list.filter(isAnalyzed).length;
  const closed = list.filter((r) => vocStatusOf(r.status).closed).length;
  const complaints = list.filter((r) => r.kind === "COMPLAINT").length;

  return {
    total: list.length,
    analyzed,
    closed,
    open: list.length - closed,
    complaints,
    highPriority: list.filter((r) => r.priority === "HIGH").length,
    byGroup: CUST_GROUPS.map((g) => ({
      id: g.id,
      name: g.name,
      count: list.filter((r) => r.groupId === g.id).length,
    })),
    byLifecycle: LIFECYCLE.map((l) => ({
      id: l.id,
      name: l.name,
      required: l.required,
      count: list.filter((r) => r.lifecycle === l.id).length,
    })),
    byDimension: DIMENSIONS.map((d) => ({
      id: d.id,
      name: d.name,
      count: list.filter((r) => r.dimension === d.id).length,
    })),
    byProduct: VOC_PRODUCTS.map((p) => ({
      id: p.id,
      name: p.name,
      count: list.filter((r) => r.productId === p.id).length,
    })),
    byKind: VOC_KINDS.map((k) => ({
      id: k.id,
      name: k.name,
      count: list.filter((r) => r.kind === k.id).length,
    })),
    byChannel: (db.vocChannels || []).map((c) => ({
      id: c.id,
      name: c.name,
      count: list.filter((r) => r.channelId === c.id).length,
    })),
  };
}

/**
 * คะแนนเฉลี่ยของรอบประเมินหนึ่งรอบ แยกตามกลุ่มลูกค้า
 * คะแนนดิบเก็บเป็นคะแนนกับคะแนนเต็ม เพื่อรองรับแบบสำรวจที่ใช้สเกลต่างกัน
 */
export function surveyScore(results) {
  const list = (results || []).filter((r) => Number(r.full) > 0);
  if (!list.length) return { percent: 0, count: 0, respondents: 0, benchmark: 0 };

  const weightSum = list.reduce((t, r) => t + (Number(r.respondents) || 1), 0);
  const scoreSum = list.reduce(
    (t, r) => t + (Number(r.score) / Number(r.full)) * 100 * (Number(r.respondents) || 1),
    0
  );

  const withBm = list.filter((r) => Number(r.benchmark) > 0);
  const bmSum = withBm.reduce((t, r) => t + (Number(r.benchmark) / Number(r.full)) * 100, 0);

  return {
    percent: weightSum ? scoreSum / weightSum : 0,
    count: list.length,
    respondents: list.reduce((t, r) => t + (Number(r.respondents) || 0), 0),
    benchmark: withBm.length ? bmSum / withBm.length : 0,
  };
}

/** สรุปผลประเมินทุกรอบ แยกตามชนิดและกลุ่มลูกค้า */
export function surveySummary(db) {
  const surveys = db.vocSurveys || [];
  const results = db.vocResults || [];

  return SURVEY_KINDS.map((k) => {
    const rounds = surveys.filter((s) => s.kind === k.id);
    const ids = rounds.map((s) => s.id);
    const mine = results.filter((r) => ids.includes(r.surveyId));
    return {
      id: k.id,
      name: k.name,
      core: k.core,
      rounds: rounds.length,
      done: rounds.filter((s) => surveyStatusOf(s.status).done).length,
      overall: surveyScore(mine),
      byGroup: CUST_GROUPS.map((g) => ({
        id: g.id,
        name: g.name,
        ...surveyScore(mine.filter((r) => r.groupId === g.id)),
      })),
    };
  });
}
