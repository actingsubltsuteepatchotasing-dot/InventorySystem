"use client";

// หน้าจอข้อมูลกิจการ — ชื่อ ที่อยู่ และเลขประจำตัวผู้เสียภาษีของผู้ออกใบกำกับภาษี
//
// ทำไมไม่เก็บเป็นค่าคงที่ในโค้ด: ใบกำกับภาษีต้องมีข้อมูลนี้ตามกฎหมาย
// ถ้าฝังไว้ในโค้ด วันที่กิจการย้ายที่อยู่หรือเปลี่ยนชื่อ ต้องรอโปรแกรมเมอร์ deploy ใหม่
// ระหว่างนั้นเอกสารทุกใบที่ออกไปจะผิด

import { useEffect, useState } from "react";
import { useInv } from "@/lib/store";
import { SEED_COMPANY } from "@/lib/constants";
import { useToast } from "../Toast";
import { Badge, Card } from "../ui";
import SetupNotice from "../SetupNotice";

export default function Company() {
  const inv = useInv();
  const { db } = inv;
  const toast = useToast();

  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  // ข้อมูลมาทีหลังตอนโหลดเสร็จ จึงเติมลงฟอร์มใน effect ไม่ใช่ตอนสร้าง state
  useEffect(() => {
    setForm(db.company ? { ...db.company } : { ...SEED_COMPANY });
  }, [db.company]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (busy || !form) return;

    const name = String(form.name || "").trim();
    if (!name) return toast("กรุณากรอกชื่อกิจการ", "err");

    /*
     * เลขประจำตัวผู้เสียภาษีของไทยมี 13 หลักเสมอ
     * ปล่อยว่างได้ (ยังไม่ได้จดทะเบียน) แต่ถ้ากรอกแล้วต้องครบ
     * ไม่งั้นใบกำกับภาษีที่พิมพ์ออกไปจะใช้ไม่ได้ แล้วกว่าจะรู้ก็ตอนลูกค้าตีกลับ
     */
    const taxId = String(form.taxId || "").replace(/\D/g, "");
    if (taxId && taxId.length !== 13) {
      return toast("เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก", "err");
    }

    setBusy(true);
    try {
      await inv.saveCompany({
        id: "main",
        name,
        branch: String(form.branch || "").trim(),
        taxId,
        address: String(form.address || "").trim(),
        phone: String(form.phone || "").trim(),
        email: String(form.email || "").trim(),
      });
      toast("บันทึกข้อมูลกิจการแล้ว", "ok");
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (!inv.companyReady) {
    return <SetupNotice feature="หน้าจอข้อมูลกิจการ" tables={["company"]} />;
  }
  if (!form) return null;

  const ready = !!String(form.name || "").trim() && String(form.taxId || "").length === 13;

  return (
    <div className="stack">
      <Card
        title="ข้อมูลกิจการ (ผู้ออกใบกำกับภาษี)"
        actions={
          <>
            <Badge kind={ready ? "ok" : "warn"}>
              {ready ? "พร้อมออกใบกำกับภาษี" : "ยังกรอกไม่ครบ"}
            </Badge>
            <button className="btn btn-p btn-sm" onClick={save} disabled={busy}>
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </>
        }
      >
        <p className="muted" style={{ marginTop: 0 }}>
          ข้อมูลชุดนี้ถูกพิมพ์เป็นหัวกระดาษของใบกำกับภาษี ต้องตรงกับที่จดทะเบียนไว้จริง
          ไม่งั้นเอกสารที่ออกไปใช้ไม่ได้
        </p>

        <div className="form-grid">
          <div className="field span2">
            <label className="lbl" htmlFor="co_name">ชื่อกิจการ</label>
            <input
              className="inp"
              id="co_name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="เช่น บริษัท ตัวอย่าง จำกัด"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="co_tax">เลขประจำตัวผู้เสียภาษี (13 หลัก)</label>
            <input
              className="inp"
              id="co_tax"
              value={form.taxId}
              inputMode="numeric"
              maxLength={13}
              onChange={(e) => set("taxId", e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="co_branch">สำนักงานใหญ่ / สาขา</label>
            <input
              className="inp"
              id="co_branch"
              value={form.branch}
              onChange={(e) => set("branch", e.target.value)}
              placeholder="เช่น สำนักงานใหญ่ หรือ สาขาที่ 00001"
            />
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="co_addr">ที่อยู่</label>
            <input
              className="inp"
              id="co_addr"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="เลขที่ ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="co_phone">เบอร์โทร</label>
            <input
              className="inp"
              id="co_phone"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="co_mail">อีเมล</label>
            <input
              className="inp"
              id="co_mail"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
