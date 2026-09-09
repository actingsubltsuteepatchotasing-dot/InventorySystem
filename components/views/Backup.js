"use client";

// หน้าจอสำรองและกู้คืนฐานข้อมูล
//
// สำรอง "ทั้งหมด" หมายถึงทุกตารางในระบบจริง ๆ ไม่ใช่แค่สินค้ากับรายการเคลื่อนไหว
// รวมทั้งลูกค้า เจ้าหนี้ ใบขาย ใบซื้อ ใบส่งคืน ข้อมูลกิจการ กลุ่มเอกสาร และสิทธิการใช้งาน
// ไฟล์เดียวจึงกู้กลับมาได้ครบทั้งระบบ ไม่ต้องไปตามเก็บทีละส่วน
//
// บันทึกไฟล์ได้สองทาง:
//   1. เลือกโฟลเดอร์ในเครื่องไว้ครั้งเดียว แล้วกดสำรองทีหลังไฟล์ลงโฟลเดอร์นั้นเลย
//      (ใช้ File System Access API — Chrome/Edge บนคอมพิวเตอร์)
//   2. ดาวน์โหลดไฟล์ตามปกติ ใช้ได้ทุกเบราว์เซอร์
//
// ทำไมไม่ให้เว็บสร้างโฟลเดอร์เองเงียบ ๆ:
//   เว็บเขียนไฟล์ลงเครื่องโดยที่คนใช้ไม่รู้ตัวไม่ได้ และไม่ควรได้ด้วย
//   ผู้ใช้ต้องเป็นคนชี้เองว่าจะให้เก็บที่ไหน เบราว์เซอร์ถึงจะยอมให้เขียน
//   หน้านี้จึงบอกชื่อโฟลเดอร์ที่แนะนำไว้ให้ แล้วให้กดเลือกเอง

import { useEffect, useState } from "react";
import { useInv } from "@/lib/store";
import { downloadJSON } from "@/lib/csv";
import { num, thDateTime, todayISO } from "@/lib/format";
import { useToast } from "../Toast";
import { Badge, Card, TableWrap } from "../ui";

/** ชื่อโฟลเดอร์ที่แนะนำให้สร้างไว้ในเครื่อง */
export const BACKUP_DIR = "UltraERP-Backup";

/**
 * ส่วนต่าง ๆ ของฐานข้อมูลที่ต้องอยู่ในไฟล์สำรอง
 *
 * ประกาศเป็นรายการไว้ตรงนี้เพื่อให้หน้าจอนับจำนวนให้ดูได้ก่อนสำรอง
 * และเวลาเพิ่มตารางใหม่ในระบบจะได้เห็นทันทีว่าลืมใส่ในรายการนี้หรือเปล่า
 */
const PARTS = [
  { key: "warehouses", name: "คลังสินค้า" },
  { key: "locations", name: "ช่องเก็บสินค้า" },
  { key: "products", name: "สินค้า" },
  { key: "placements", name: "การจัดวางสินค้าในช่องเก็บ" },
  { key: "txns", name: "รายการเคลื่อนไหว" },
  { key: "sales", name: "บิลขายหน้าร้าน (POS)" },
  { key: "saleItems", name: "รายการในบิลขาย" },
  { key: "customers", name: "ลูกค้า" },
  { key: "suppliers", name: "เจ้าหนี้" },
  { key: "invoices", name: "ใบขายสินค้าและบริการ" },
  { key: "invoiceItems", name: "รายการในใบขาย" },
  { key: "purchases", name: "ใบซื้อสินค้าและบริการ" },
  { key: "purchaseItems", name: "รายการในใบซื้อ" },
  { key: "purchaseReturns", name: "ใบส่งคืนสินค้า" },
  { key: "purchaseReturnItems", name: "รายการในใบส่งคืน" },
  { key: "shipEvents", name: "บันทึกการเดินสถานะจัดส่ง" },
  { key: "stockCounts", name: "ใบตรวจนับสินค้า" },
  { key: "stockCountItems", name: "รายการในใบตรวจนับ" },
  { key: "docGroups", name: "กลุ่มเอกสาร" },
  { key: "perms", name: "สิทธิการใช้งานหน้าจอ" },
  { key: "sqlConnections", name: "การเชื่อมต่อฐานข้อมูลภายนอก" },
  { key: "salespersons", name: "พนักงานขาย" },
  { key: "productTerms", name: "กลุ่ม/ยี่ห้อ/ประเภทสินค้า" },
  { key: "salesTargets", name: "เป้าขาย" },
  { key: "printForms", name: "ฟอร์มพิมพ์" },
  { key: "crmLeads", name: "ลูกค้าเป้าหมาย" },
  { key: "crmDeals", name: "โอกาสการขาย" },
  { key: "crmActivities", name: "บันทึกกิจกรรม" },
];

const stamp = () =>
  todayISO() + "-" + new Date().toTimeString().slice(0, 5).replace(":", "");

export default function Backup() {
  const inv = useInv();
  const perm = inv.perm("backup");
  const { db } = inv;
  const toast = useToast();

  const [busy, setBusy] = useState("");
  const [dir, setDir] = useState(null);
  const [last, setLast] = useState(null);

  /** เบราว์เซอร์นี้เลือกโฟลเดอร์ปลายทางได้ไหม */
  const [canPickDir, setCanPickDir] = useState(false);
  useEffect(() => {
    setCanPickDir(typeof window !== "undefined" && "showDirectoryPicker" in window);
  }, []);

  const counts = PARTS.map((p) => ({ ...p, n: (db[p.key] || []).length }));
  const totalRows = counts.reduce((s, p) => s + p.n, 0);

  /** ข้อมูลทั้งชุดที่จะเขียนลงไฟล์ */
  function snapshot() {
    const out = { savedAt: Date.now(), app: "One for All Ultra" };
    PARTS.forEach((p) => {
      out[p.key] = db[p.key] || [];
    });
    // ข้อมูลกิจการเป็นก้อนเดียว ไม่ใช่รายการ จึงไม่ได้อยู่ใน PARTS
    out.company = db.company || null;
    return out;
  }

  async function pickDir() {
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      setDir(handle);
      toast("จะบันทึกไฟล์สำรองลงโฟลเดอร์ " + handle.name, "ok");
    } catch (e) {
      // ผู้ใช้กดยกเลิกเองก็เข้ามาทางนี้ ไม่ต้องขึ้น error ให้ตกใจ
      if (e && e.name !== "AbortError") toast("เลือกโฟลเดอร์ไม่สำเร็จ: " + e.message, "err");
    }
  }

  async function backup() {
    if (busy) return;
    setBusy("backup");
    const name = "ultra-erp-backup-" + stamp() + ".json";
    try {
      const data = snapshot();

      if (dir) {
        const file = await dir.getFileHandle(name, { create: true });
        const w = await file.createWritable();
        await w.write(JSON.stringify(data, null, 2));
        await w.close();
        toast("บันทึกลงโฟลเดอร์ " + dir.name + " แล้ว: " + name, "ok");
      } else {
        downloadJSON(data, name);
        toast("ดาวน์โหลดไฟล์สำรองแล้ว: " + name, "ok");
      }
      setLast({ at: Date.now(), name, rows: totalRows, where: dir ? dir.name : "โฟลเดอร์ดาวน์โหลด" });
    } catch (e) {
      toast("สำรองข้อมูลไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  /**
   * กู้คืนทั้งหมด — ลบข้อมูลบนฐานข้อมูลแล้วเขียนทับด้วยไฟล์สำรอง
   *
   * เป็นงานที่ย้อนกลับไม่ได้และกระทบทุกคนที่ใช้ระบบอยู่ ไม่ใช่แค่เครื่องตัวเอง
   * จึงถามยืนยันพร้อมบอกจำนวนแถวที่จะเข้ามาแทน ไม่ใช่ถามลอย ๆ ว่า "แน่ใจไหม"
   */
  async function restore(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file || busy) return;

    let data;
    try {
      data = JSON.parse(await file.text());
      if (!data.products || !data.warehouses || !data.txns) {
        throw new Error("ไฟล์นี้ไม่ใช่ไฟล์สำรองของระบบนี้");
      }
    } catch (err) {
      return toast("อ่านไฟล์ไม่ได้: " + err.message, "err");
    }

    const rows = PARTS.reduce((s, p) => s + (data[p.key] || []).length, 0);
    const when = data.savedAt ? thDateTime(data.savedAt) : "ไม่ทราบเวลา";
    const ok = window.confirm(
      "กู้คืนจากไฟล์ " + file.name + "\n" +
        "สำรองไว้เมื่อ " + when + " · " + num(rows, 0) + " แถว\n\n" +
        "ข้อมูลบนฐานข้อมูลตอนนี้ (" + num(totalRows, 0) + " แถว) จะถูกลบทิ้งทั้งหมด\n" +
        "แล้วเขียนทับด้วยข้อมูลในไฟล์ กระทบทุกคนที่ใช้ระบบอยู่ ไม่ใช่แค่เครื่องนี้\n\n" +
        "ยืนยันหรือไม่?"
    );
    if (!ok) return;

    setBusy("restore");
    try {
      await inv.importAll(data);
      toast("กู้คืนข้อมูลจาก " + file.name + " เรียบร้อย", "ok");
    } catch (err) {
      toast("กู้คืนไม่สำเร็จ: " + err.message, "err");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="stack">
      <Card
        title="สำรองข้อมูลทั้งหมด"
        actions={
          <>
            <Badge kind="info">{num(totalRows, 0)} แถว</Badge>
            {canPickDir ? (
              <button className="btn btn-g btn-sm" onClick={pickDir} disabled={!!busy}>
                {dir ? "เปลี่ยนโฟลเดอร์ (" + dir.name + ")" : "เลือกโฟลเดอร์ปลายทาง"}
              </button>
            ) : null}
            <button
              className="btn btn-p btn-sm"
              onClick={backup}
              disabled={!!busy || !perm.edit}
            >
              {busy === "backup" ? "กำลังสำรอง…" : "สำรองข้อมูลเดี๋ยวนี้"}
            </button>
          </>
        }
      >
        <p className="muted" style={{ marginTop: 0 }}>
          สำรองทุกตารางในระบบลงไฟล์เดียว ไฟล์นี้กู้กลับมาได้ครบทั้งระบบ
          {dir
            ? " · ไฟล์จะถูกเขียนลงโฟลเดอร์ " + dir.name + " ที่เลือกไว้"
            : " · ยังไม่ได้เลือกโฟลเดอร์ ไฟล์จะไปอยู่ที่โฟลเดอร์ดาวน์โหลดตามปกติ"}
        </p>

        <TableWrap>
          <thead>
            <tr>
              <th style={{ minWidth: 240 }}>ส่วนของข้อมูล</th>
              <th className="num" style={{ width: 120 }}>จำนวนแถว</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((p) => (
              <tr key={p.key}>
                <td>{p.name}</td>
                <td className="num">{p.n ? num(p.n, 0) : "—"}</td>
              </tr>
            ))}
            <tr>
              <td>ข้อมูลกิจการ (ผู้ออกใบกำกับภาษี)</td>
              <td className="num">{db.company ? 1 : "—"}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>รวมทั้งหมด</td>
              <td className="num">
                <b>{num(totalRows, 0)}</b>
              </td>
            </tr>
          </tfoot>
        </TableWrap>

        {last ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            สำรองล่าสุด {thDateTime(last.at)} · {last.name} · {num(last.rows, 0)} แถว ·
            เก็บที่ {last.where}
          </p>
        ) : null}
      </Card>

      <Card title="กู้คืนข้อมูลจากไฟล์สำรอง">
        <p className="muted" style={{ marginTop: 0 }}>
          เลือกไฟล์ <code>.json</code> ที่สำรองไว้ ระบบจะ<b>ลบข้อมูลบนฐานข้อมูลทั้งหมด</b>
          แล้วเขียนทับด้วยข้อมูลในไฟล์ · กระทบทุกคนที่ใช้ระบบอยู่ ไม่ใช่แค่เครื่องนี้
        </p>
        <label className={"btn btn-d" + (busy || !perm.edit ? " is-off" : "")}>
          {busy === "restore" ? "กำลังกู้คืน…" : "เลือกไฟล์สำรองแล้วกู้คืน"}
          <input
            type="file"
            accept="application/json,.json"
            hidden
            disabled={!!busy || !perm.edit}
            onChange={restore}
          />
        </label>
      </Card>

      <Card title={"โฟลเดอร์สำรองข้อมูลในเครื่อง — " + BACKUP_DIR}>
        <ul className="note-list">
          <li>
            สร้างโฟลเดอร์ชื่อ <code>{BACKUP_DIR}</code> ไว้ในเครื่อง เช่นที่ Documents
            แล้วกด <b>เลือกโฟลเดอร์ปลายทาง</b> ชี้ไปที่โฟลเดอร์นั้น
            จากนั้นกดสำรองทีไรไฟล์จะลงโฟลเดอร์นั้นเลย ไม่ต้องมานั่งย้ายไฟล์เอง
          </li>
          <li>
            ในโปรเจกต์มีโฟลเดอร์ <code>backups/</code> เตรียมไว้ให้แล้ว
            ใช้เป็นที่วางไฟล์สำรองตอนพัฒนาได้ (ไฟล์ <code>.json</code> ในนั้นไม่ถูกเก็บขึ้น git
            เพราะเป็นข้อมูลจริงของแต่ละที่ ไม่ควรอยู่ในโค้ด)
          </li>
          <li>
            การเลือกโฟลเดอร์ใช้ได้กับ Chrome และ Edge บนคอมพิวเตอร์
            {canPickDir ? "" : " — เบราว์เซอร์นี้ยังไม่รองรับ จึงใช้การดาวน์โหลดแทน"}
            เบราว์เซอร์ที่ไม่รองรับยังสำรองได้ตามปกติ แค่ไฟล์ไปอยู่ที่โฟลเดอร์ดาวน์โหลด
          </li>
          <li>
            เว็บสร้างโฟลเดอร์ในเครื่องเองเงียบ ๆ ไม่ได้ และไม่ควรได้ด้วย
            ผู้ใช้ต้องเป็นคนชี้เองว่าจะให้เก็บที่ไหน เบราว์เซอร์ถึงจะยอมให้เขียนไฟล์
          </li>
          <li>
            สิทธิที่เลือกไว้จะหายไปเมื่อปิดแท็บ ต้องกดเลือกโฟลเดอร์ใหม่ทุกครั้งที่เปิดระบบ
            เป็นข้อจำกัดของเบราว์เซอร์เอง ไม่ใช่ของโปรแกรม
          </li>
        </ul>
      </Card>
    </div>
  );
}
