// ทะเบียนประเภทลูกค้า
//
// เดิมประเภทลูกค้าเป็นรายการตายตัว 5 ค่าในโค้ด (CUSTOMER_KINDS)
// เพิ่มประเภทใหม่ต้องรอ deploy ซึ่งไม่สมเหตุสมผล เพราะเป็นเรื่องของกิจการ ไม่ใช่ของโปรแกรม
// ตอนนี้ย้ายมาเป็นทะเบียนที่ผู้ใช้ตั้งเองได้ รูปแบบเดียวกับพนักงานขายและทะเบียนสินค้า
//
// สิ่งที่เก็บลงในตัวลูกค้าคือ "ชื่อประเภท" ไม่ใช่รหัส
//   เพราะ customers.kind เก็บเป็นข้อความมาตั้งแต่ต้น และเอกสารที่คัดลอกค่านี้ไป
//   (ใบขาย) ก็เก็บเป็นข้อความเหมือนกัน เปลี่ยนไปเก็บรหัสเมื่อไร
//   ลูกค้าและเอกสารเดิมทั้งหมดจะอ่านประเภทไม่ออกทันที
//   ทะเบียนนี้จึงเป็น "รายการให้เลือก" ไม่ใช่กุญแจอ้างอิง — จงใจไม่ผูก foreign key
//
// ค่าเดิม 5 ค่ายังอยู่ใน lib/constants.js ในฐานะ "ตัวช่วยเริ่มต้น"
// ใช้เติมทะเบียนให้เร็ว ๆ ตอนเปิดหน้าครั้งแรก ไม่ได้ใช้เป็นรายการจริงอีกแล้ว

import { mergeChoices, registryProblems, unregisteredOf } from "./choices";

/** ความยาวสูงสุด — ต้องตรงกับ constraint ใน schema.sql (กติกาเดียวกับพนักงานขาย) */
export const CODE_MAX = 50;
export const NAME_MAX = 200;

/** ทะเบียนทั้งหมด เรียงตามรหัส */
export const kindsOf = (db) =>
  ((db && db.customerKinds) || []).slice().sort((a, b) => a.code.localeCompare(b.code, "th"));

/** ทะเบียนที่ยังใช้งานอยู่ — ที่ปิดใช้งานแล้วไม่ควรขึ้นให้เลือกในรายการใหม่ */
export const activeKinds = (db) => kindsOf(db).filter((k) => k.active !== false);

/** ตรวจก่อนบันทึก */
export const problemsOf = (v, list) =>
  registryProblems(v, list, { code: "รหัสประเภทลูกค้า", name: "ชื่อประเภทลูกค้า" }, {
    code: CODE_MAX,
    name: NAME_MAX,
  });

/** ค่าที่ลูกค้าใช้อยู่จริง (รวมค่าที่พิมพ์ไว้ก่อนมีหน้าทะเบียน) */
export const usedValues = (db) => ((db && db.customers) || []).map((c) => c.kind);

/**
 * ตัวเลือกสำหรับช่องประเภทลูกค้าที่หน้ารายละเอียดลูกค้า
 * @param {string} current ค่าปัจจุบันของลูกค้ารายที่กำลังแก้ ต้องอยู่ในรายการเสมอ
 */
export const optionsFor = (db, current) =>
  mergeChoices(activeKinds(db), usedValues(db), current);

/** ค่าที่ลูกค้าใช้อยู่แต่ยังไม่ได้จดทะเบียน */
export const unregistered = (db) => unregisteredOf(kindsOf(db), usedValues(db));

/** จำนวนลูกค้าที่เป็นประเภทนี้ ใช้เตือนก่อนลบและแสดงในตาราง */
export const usedBy = (db, name) =>
  ((db && db.customers) || []).filter(
    (c) => String(c.kind || "").trim().toLowerCase() === String(name || "").trim().toLowerCase()
  ).length;

/**
 * รายการประเภทที่เอาไปใช้กรองได้ — รวมทะเบียนกับค่าที่ใช้อยู่จริง
 *
 * ตัวกรองต้องเห็นค่าที่ข้อมูลใช้อยู่ทั้งหมด ไม่ใช่เฉพาะที่จดทะเบียนไว้
 * ไม่งั้นลูกค้าที่ยังถือค่าเก่าอยู่จะกรองหาไม่เจอ ทั้งที่มองเห็นอยู่ในตาราง
 */
export const filterValues = (db) =>
  Array.from(
    new Set([
      ...kindsOf(db).map((k) => k.name),
      ...usedValues(db)
        .map((v) => String(v || "").trim())
        .filter(Boolean),
    ])
  ).sort((a, b) => a.localeCompare(b, "th"));
