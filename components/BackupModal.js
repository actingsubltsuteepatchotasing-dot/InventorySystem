"use client";

// สำรองและกู้คืนข้อมูล — ข้อมูลจริงอยู่บน Supabase การนำเข้า/รีเซ็ตจะเขียนทับบนฐานข้อมูล

import { useRef, useState } from "react";
import { useInv } from "@/lib/store";
import { downloadJSON } from "@/lib/csv";
import { num, todayISO } from "@/lib/format";
import Modal from "./Modal";
import { useToast } from "./Toast";

export default function BackupModal({ onClose }) {
  const inv = useInv();
  const { db } = inv;
  const toast = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState("");

  async function importFile(file) {
    if (!file || busy) return;

    let data;
    try {
      data = JSON.parse(await file.text());
      if (!data.products || !data.warehouses || !data.txns) {
        throw new Error("รูปแบบไฟล์ไม่ถูกต้อง");
      }
    } catch (e) {
      toast("ไฟล์ไม่ถูกต้อง: " + e.message, "err");
      return;
    }

    if (!window.confirm("การนำเข้าจะลบข้อมูลบน Supabase ทั้งหมดแล้วเขียนทับ ยืนยันหรือไม่?")) return;

    setBusy("import");
    try {
      await inv.importAll(data);
      toast("นำเข้าข้อมูลขึ้น Supabase เรียบร้อย");
      onClose();
    } catch (e) {
      toast("นำเข้าไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  async function reset() {
    if (busy) return;
    if (!window.confirm("ข้อมูลบน Supabase ทั้งหมดจะถูกลบและสร้างข้อมูลตัวอย่างใหม่ ยืนยันหรือไม่?")) {
      return;
    }
    setBusy("reset");
    try {
      await inv.resetSeed();
      toast("สร้างข้อมูลตัวอย่างใหม่เรียบร้อย");
      onClose();
    } catch (e) {
      toast("รีเซ็ตไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  return (
    <Modal title="สำรองและกู้คืนข้อมูล" onClose={onClose} maxWidth={560}>
      <p style={{ color: "var(--fg-muted)", fontSize: 14, marginBottom: 16 }}>
        ข้อมูลทั้งหมดเก็บอยู่บน Supabase และแชร์กับผู้ใช้ทุกคนที่เข้าระบบ
        การนำเข้าหรือรีเซ็ตจะมีผลกับทุกคน ไม่ใช่เฉพาะเครื่องนี้
      </p>

      <div className="grid" style={{ gap: 11 }}>
        <button
          className="btn btn-o"
          disabled={!!busy}
          onClick={() => {
            downloadJSON(db, "raot-inventory-backup-" + todayISO() + ".json");
            toast("ส่งออกไฟล์สำรองแล้ว");
          }}
        >
          ส่งออกไฟล์สำรอง (.json)
        </button>

        <button
          className="btn btn-o"
          disabled={!!busy}
          onClick={() => fileRef.current && fileRef.current.click()}
        >
          {busy === "import" ? "กำลังนำเข้า…" : "นำเข้าไฟล์สำรอง (เขียนทับทั้งหมด)"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            importFile(e.target.files[0]);
            e.target.value = "";
          }}
        />

        <button className="btn btn-o" disabled={!!busy} onClick={inv.reload}>
          โหลดข้อมูลใหม่จาก Supabase
        </button>

        <button className="btn btn-d" disabled={!!busy} onClick={reset}>
          {busy === "reset" ? "กำลังรีเซ็ต…" : "ล้างข้อมูลและสร้างข้อมูลตัวอย่างใหม่"}
        </button>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 12,
          background: "var(--brand-50)",
          borderRadius: 9,
          fontSize: 13,
          color: "var(--brand-d)",
        }}
      >
        ข้อมูลปัจจุบัน: สินค้า <b>{db.products.length}</b> รายการ · คลัง <b>{db.warehouses.length}</b> แห่ง ·
        รายการเคลื่อนไหว <b>{num(db.txns.length, 0)}</b> รายการ
      </div>
    </Modal>
  );
}
