"use client";

// สำรองและกู้คืนข้อมูล — ข้อมูลจริงอยู่บน Supabase การนำเข้า/รีเซ็ตจะเขียนทับบนฐานข้อมูล

import { useRef, useState } from "react";
import { useInv } from "@/lib/store";
import { healthCheck } from "@/lib/api";
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
  const [checks, setChecks] = useState(null);

  async function runCheck() {
    if (busy) return;
    setBusy("check");
    setChecks(null);
    try {
      const r = await healthCheck();
      setChecks(r);
      const bad = r.filter((x) => !x.ok).length;
      toast(bad ? "ตรวจพบปัญหา " + bad + " รายการ" : "ตรวจสอบครบ ทุกรายการปกติ", bad ? "warn" : "");
    } catch (e) {
      toast("ตรวจสอบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

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
    <Modal title="ข้อมูลและระบบ" onClose={onClose} maxWidth={620}>
      {/* ---------------- ตรวจสอบระบบ ---------------- */}
      <h4 className="sec-title">ตรวจสอบระบบ</h4>
      <p className="sec-desc">
        ตรวจว่าฐานข้อมูลมีตารางและฟังก์ชันครบหรือยัง โดยไม่ต้องเปิด Supabase — อ่านอย่างเดียว
        ไม่แก้ไขข้อมูลใด ๆ
      </p>

      <button className="btn btn-o" disabled={!!busy} onClick={runCheck} style={{ width: "100%" }}>
        {busy === "check" ? "กำลังตรวจสอบ…" : "ตรวจสอบระบบตอนนี้"}
      </button>

      {checks ? (
        <>
          <ul className="check-list">
            {checks.map((c) => (
              <li key={c.name} className={c.ok ? "ok" : "bad"}>
                <span className="mark">{c.ok ? "✓" : "✕"}</span>
                <span className="txt">
                  <b>{c.label}</b>
                  <span className="code-cell">{c.name}</span>
                  <span className="detail">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>

          {checks.some((c) => !c.ok) ? (
            <div className="setup-tip" style={{ marginTop: 12 }}>
              <b>วิธีแก้</b>
              <p>
                เปิด Supabase Dashboard &gt; SQL Editor &gt; New query แล้ววางไฟล์{" "}
                <code>supabase/schema.sql</code> ทั้งไฟล์ กด Run — ไฟล์เดียวจบทุกอย่าง
                รันซ้ำได้ ไม่ลบข้อมูลเดิม
              </p>
              <p>ถ้ารันแล้วยังไม่ผ่าน ให้รันคำสั่งนี้แล้วรอ 5 วินาที:</p>
              <pre>notify pgrst, &#39;reload schema&#39;;</pre>
            </div>
          ) : null}
        </>
      ) : null}

      <hr className="sec-hr" />

      {/* ---------------- สำรองข้อมูล ---------------- */}
      <h4 className="sec-title">สำรองและกู้คืนข้อมูล</h4>
      <p className="sec-desc">
        ข้อมูลทั้งหมดเก็บอยู่บน Supabase และแชร์กับผู้ใช้ทุกคนที่เข้าระบบ
        การนำเข้าหรือรีเซ็ตจะมีผลกับทุกคน ไม่ใช่เฉพาะเครื่องนี้
      </p>

      <div className="grid" style={{ gap: 11 }}>
        <button
          className="btn btn-o"
          disabled={!!busy}
          onClick={() => {
            downloadJSON(db, "ultra-erp-backup-" + todayISO() + ".json");
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
        ที่เก็บ <b>{db.locations.length}</b> ช่อง · การจัดวาง <b>{num(db.placements.length, 0)}</b> รายการ ·
        รายการเคลื่อนไหว <b>{num(db.txns.length, 0)}</b> รายการ
      </div>
    </Modal>
  );
}
