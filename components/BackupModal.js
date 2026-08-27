"use client";

// สำรองและกู้คืนข้อมูล — ระบบไม่ใช้ Database จึงควรส่งออกไฟล์สำรองเก็บไว้เป็นระยะ

import { useRef } from "react";
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

  function importFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.products || !data.warehouses || !data.txns) {
          throw new Error("รูปแบบไฟล์ไม่ถูกต้อง");
        }
        if (!window.confirm("การนำเข้าจะแทนที่ข้อมูลปัจจุบันทั้งหมด ยืนยันหรือไม่?")) return;
        inv.replace(data);
        toast("นำเข้าข้อมูลเรียบร้อย");
        onClose();
      } catch (err) {
        toast("ไฟล์ไม่ถูกต้อง: " + err.message, "err");
      }
    };
    reader.onerror = () => toast("อ่านไฟล์ไม่สำเร็จ", "err");
    reader.readAsText(file);
  }

  return (
    <Modal title="สำรองและกู้คืนข้อมูล" onClose={onClose} maxWidth={560}>
      <p style={{ color: "var(--fg-muted)", fontSize: 14, marginBottom: 16 }}>
        ระบบนี้ไม่ใช้ฐานข้อมูล — ข้อมูลทั้งหมดถูกเก็บไว้ในเบราว์เซอร์ของเครื่องนี้ (localStorage)
        แนะนำให้ส่งออกไฟล์สำรองเก็บไว้เป็นระยะ
      </p>

      <div className="grid" style={{ gap: 11 }}>
        <button
          className="btn btn-o"
          onClick={() => {
            downloadJSON(db, "raot-inventory-backup-" + todayISO() + ".json");
            toast("ส่งออกไฟล์สำรองแล้ว");
          }}
        >
          ส่งออกไฟล์สำรอง (.json)
        </button>

        <button className="btn btn-o" onClick={() => fileRef.current && fileRef.current.click()}>
          นำเข้าไฟล์สำรอง
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => importFile(e.target.files[0])}
        />

        <button
          className="btn btn-d"
          onClick={() => {
            if (!window.confirm("ข้อมูลทั้งหมดจะถูกลบและสร้างข้อมูลตัวอย่างใหม่ ยืนยันหรือไม่?")) return;
            inv.reset();
            toast("สร้างข้อมูลตัวอย่างใหม่เรียบร้อย");
            onClose();
          }}
        >
          ล้างข้อมูลและสร้างข้อมูลตัวอย่างใหม่
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
