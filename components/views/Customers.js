"use client";

// หน้าจอรายละเอียดลูกค้า — ทะเบียนลูกค้าพร้อมที่อยู่แบบแยกช่อง
//
// ที่อยู่แยกเป็น ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์ คนละคอลัมน์
// เพราะต้องเอาไปกรองและออกรายงานรายจังหวัด ถ้าเก็บรวมเป็นก้อนเดียวจะแยกไม่ออกทีหลัง

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { CUSTOMER_KINDS } from "@/lib/constants";
import { nextCustCode } from "@/lib/db";
import { uid } from "@/lib/format";
import { useToast } from "../Toast";
import { IcPlus, IcTrash } from "../Icons";
import Modal from "../Modal";
import { Badge, Card, Empty, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

const blank = (code) => ({
  id: uid(),
  code,
  name: "",
  address: "",
  subdistrict: "",
  district: "",
  province: "",
  postcode: "",
  phone: "",
  kind: CUSTOMER_KINDS[0],
});

export default function Customers() {
  const inv = useInv();
  const { db } = inv;
  const toast = useToast();

  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const all = db.customers || [];

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((c) => {
      if (kind && c.kind !== kind) return false;
      if (!s) return true;
      // ค้นได้ทั้งรหัส ชื่อ เบอร์โทร และที่อยู่ทุกส่วน เพราะคนจำคนละอย่างกัน
      return [c.code, c.name, c.phone, c.address, c.subdistrict, c.district, c.province, c.postcode]
        .join(" ")
        .toLowerCase()
        .includes(s);
    });
  }, [all, q, kind]);

  const isNew = form ? !all.some((c) => c.id === form.id) : false;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (busy) return;
    const code = String(form.code || "").trim().toUpperCase();
    const name = String(form.name || "").trim();

    if (!code) return toast("กรุณากรอกรหัสลูกค้า", "err");
    if (!name) return toast("กรุณากรอกชื่อลูกค้า", "err");

    // รหัสลูกค้าเป็นตัวที่คนใช้อ้างถึงกันในเอกสาร ฐานข้อมูลก็มี unique index กันไว้
    // แต่ตรวจตรงนี้ก่อนเพื่อให้ข้อความบอกได้ว่าซ้ำกับใคร
    const dup = all.find((c) => c.id !== form.id && c.code.toUpperCase() === code);
    if (dup) return toast("รหัสลูกค้า " + code + " ถูกใช้โดย " + dup.name + " แล้ว", "err");

    const postcode = String(form.postcode || "").trim();
    if (postcode && !/^\d{5}$/.test(postcode)) return toast("รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก", "err");

    setBusy(true);
    try {
      await inv.saveCustomer({
        id: form.id,
        code,
        name,
        address: String(form.address || "").trim(),
        subdistrict: String(form.subdistrict || "").trim(),
        district: String(form.district || "").trim(),
        province: String(form.province || "").trim(),
        postcode,
        phone: String(form.phone || "").trim(),
        kind: form.kind || "",
      });
      toast("บันทึกลูกค้า " + name + " แล้ว", "ok");
      setForm(null);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove(c) {
    if (busy) return;
    if (!window.confirm("ยืนยันการลบลูกค้า " + c.name + " ?")) return;
    setBusy(true);
    try {
      await inv.removeCustomer(c.id);
      toast("ลบลูกค้า " + c.name + " แล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (!inv.customersReady) {
    return <SetupNotice feature="หน้าจอรายละเอียดลูกค้า" tables={["customers"]} />;
  }

  return (
    <div className="stack">
      <Card
        title="รายละเอียดลูกค้า"
        actions={
          <>
            <Badge kind="info">
              {rows.length === all.length
                ? all.length + " ราย"
                : rows.length + " จาก " + all.length + " ราย"}
            </Badge>
            <button className="btn btn-p btn-sm" onClick={() => setForm(blank(nextCustCode(db)))}>
              <IcPlus size={15} />
              เพิ่มลูกค้า
            </button>
          </>
        }
      >
        <div className="row" style={{ marginBottom: 12 }}>
          <input
            className="inp"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา รหัส ชื่อ เบอร์โทร หรือที่อยู่…"
            aria-label="ค้นหาลูกค้า"
            style={{ maxWidth: 320 }}
          />
          <select
            className="sel"
            style={{ maxWidth: 210 }}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            aria-label="กรองตามประเภทลูกค้า"
          >
            <option value="">ทุกประเภท</option>
            {CUSTOMER_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </div>

        {rows.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 90 }}>รหัสลูกค้า</th>
                <th style={{ minWidth: 200 }}>ชื่อลูกค้า</th>
                <th style={{ minWidth: 200 }}>ที่อยู่</th>
                <th style={{ minWidth: 130 }}>ตำบล</th>
                <th style={{ minWidth: 130 }}>อำเภอ</th>
                <th style={{ minWidth: 140 }}>จังหวัด</th>
                <th style={{ width: 110 }}>รหัสไปรษณีย์</th>
                <th style={{ minWidth: 130 }}>เบอร์โทร</th>
                <th style={{ minWidth: 140 }}>ประเภทลูกค้า</th>
                <th style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <code>{c.code}</code>
                  </td>
                  <td>
                    <b>{c.name}</b>
                  </td>
                  <td>{c.address || "—"}</td>
                  <td>{c.subdistrict || "—"}</td>
                  <td>{c.district || "—"}</td>
                  <td>{c.province || "—"}</td>
                  <td>{c.postcode || "—"}</td>
                  <td>{c.phone || "—"}</td>
                  <td>{c.kind || "—"}</td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <button className="btn btn-o btn-sm" onClick={() => setForm({ ...c })}>
                        แก้ไข
                      </button>
                      <button
                        className="btn btn-d btn-icon"
                        onClick={() => remove(c)}
                        disabled={busy}
                        title="ลบลูกค้า"
                      >
                        <IcTrash size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>
            {all.length ? "ไม่พบลูกค้าที่ตรงกับที่ค้นหา" : "ยังไม่มีข้อมูลลูกค้า กดปุ่ม “เพิ่มลูกค้า” เพื่อเริ่มต้น"}
          </Empty>
        )}
      </Card>

      {form ? (
        <Modal
          title={isNew ? "เพิ่มลูกค้า" : "แก้ไขลูกค้า " + form.code}
          onClose={() => setForm(null)}
          maxWidth={720}
          footer={
            <>
              <button className="btn btn-g" onClick={() => setForm(null)} disabled={busy}>
                ยกเลิก
              </button>
              <button className="btn btn-p" onClick={save} disabled={busy}>
                บันทึก
              </button>
            </>
          }
        >
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
            <div className="field">
              <label className="lbl" htmlFor="cf_code">รหัสลูกค้า</label>
              <input
                className="inp"
                id="cf_code"
                value={form.code}
                maxLength={20}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="cf_kind">ประเภทลูกค้า</label>
              <select
                className="sel"
                id="cf_kind"
                value={form.kind}
                onChange={(e) => set("kind", e.target.value)}
              >
                {CUSTOMER_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </div>

            <div className="field span2">
              <label className="lbl" htmlFor="cf_name">ชื่อลูกค้า</label>
              <input
                className="inp"
                id="cf_name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="ชื่อบุคคล ร้านค้า หรือหน่วยงาน"
              />
            </div>

            <div className="field span2">
              <label className="lbl" htmlFor="cf_addr">ที่อยู่ (บ้านเลขที่ หมู่ ถนน)</label>
              <input
                className="inp"
                id="cf_addr"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="เช่น 128/4 หมู่ 3 ถนนบางขุนนนท์"
              />
            </div>

            <div className="field">
              <label className="lbl" htmlFor="cf_sub">ตำบล / แขวง</label>
              <input
                className="inp"
                id="cf_sub"
                value={form.subdistrict}
                onChange={(e) => set("subdistrict", e.target.value)}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="cf_dis">อำเภอ / เขต</label>
              <input
                className="inp"
                id="cf_dis"
                value={form.district}
                onChange={(e) => set("district", e.target.value)}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="cf_prov">จังหวัด</label>
              <input
                className="inp"
                id="cf_prov"
                value={form.province}
                onChange={(e) => set("province", e.target.value)}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="cf_post">รหัสไปรษณีย์</label>
              <input
                className="inp"
                id="cf_post"
                value={form.postcode}
                inputMode="numeric"
                maxLength={5}
                onChange={(e) => set("postcode", e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="field span2">
              <label className="lbl" htmlFor="cf_phone">เบอร์โทร</label>
              <input
                className="inp"
                id="cf_phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="เช่น 081-234-5678"
              />
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
