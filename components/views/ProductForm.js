"use client";

// ฟอร์มเพิ่ม / แก้ไขสินค้า — รองรับการใส่รูปภาพและบาร์โค๊ด

import { useMemo, useRef, useState } from "react";
import { useInv } from "@/lib/store";
import { firstLocOf, nextProdCode } from "@/lib/db";
import { resizeImage } from "@/lib/image";
import { num, uid } from "@/lib/format";
import Modal from "../Modal";
import { useToast } from "../Toast";
import { IcTrash } from "../Icons";
import { Barcode, LocationSelect, QtyInput, WarehouseSelect } from "../ui";

export default function ProductForm({ productId, onClose }) {
  const inv = useInv();
  const { db } = inv;
  const toast = useToast();

  const existing = productId ? inv.prod(productId) : null;
  const isNew = !existing;

  const [form, setForm] = useState(() =>
    existing
      ? { ...existing }
      : {
          code: nextProdCode(db),
          name: "",
          unit: "",
          cat: "",
          price: 0,
          min: 0,
          barcode: "",
          img: "",
          note: "",
          defWhId: "",
          defLocId: "",
        }
  );
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  // ยอดคงเหลือรวมทุกคลัง ใช้ทั้งตอนปิดปุ่มลบและตอนขึ้นข้อความบอกเหตุผล
  const stockLeft = productId ? inv.stockTotal(productId) : 0;

  const cats = useMemo(() => Array.from(new Set(db.products.map((p) => p.cat))), [db.products]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function handleFile(file) {
    if (!file) return;
    try {
      const dataURL = await resizeImage(file);
      set("img", dataURL);
    } catch (err) {
      toast(err.message, "err");
    }
  }

  async function save() {
    if (busy) return;
    const code = String(form.code).trim();
    const name = String(form.name).trim();
    const unit = String(form.unit).trim();

    if (!code) return toast("กรุณาระบุรหัสสินค้า", "err");
    if (!name) return toast("กรุณาระบุชื่อสินค้า", "err");
    if (!unit) return toast("กรุณาระบุหน่วยนับ", "err");
    if (db.products.some((p) => p.code.toLowerCase() === code.toLowerCase() && p.id !== productId)) {
      return toast("รหัสสินค้านี้ถูกใช้แล้ว", "err");
    }

    // คลังประจำกับที่เก็บประจำต้องมาเป็นคู่ ตั้งทั้งคู่หรือไม่ตั้งเลย
    // (ฝั่งฐานข้อมูลมี check บังคับไว้อีกชั้น ถ้าหลุดไปจะ error ตอนบันทึก)
    const defWhId = form.defWhId || "";
    const defLocId = form.defLocId || "";
    if (defWhId && !defLocId) {
      return toast("เลือกคลังประจำแล้ว ต้องเลือกที่เก็บประจำด้วย", "err");
    }
    if (defLocId && !defWhId) {
      return toast("เลือกที่เก็บประจำแล้ว ต้องเลือกคลังประจำด้วย", "err");
    }
    if (defLocId && !inv.locInWh(defLocId, defWhId)) {
      return toast("ที่เก็บประจำไม่ได้อยู่ในคลังประจำที่เลือก", "err");
    }

    const value = {
      code,
      name,
      unit,
      cat: String(form.cat).trim() || "ทั่วไป",
      price: parseFloat(form.price) || 0,
      min: parseFloat(form.min) || 0,
      barcode: String(form.barcode).trim(),
      note: String(form.note).trim(),
      img: form.img || "",
      defWhId,
      defLocId,
    };

    setBusy(true);
    try {
      await inv.saveProduct({ id: productId || uid(), ...value });
      toast(isNew ? "เพิ่มสินค้าเรียบร้อย" : "บันทึกการแก้ไขเรียบร้อย");
      onClose();
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;

    /*
     * ห้ามลบถ้ายังมีของคงเหลือ
     *
     * ตาราง txns ตั้ง on delete cascade ไว้ ลบสินค้าแล้วประวัติหายตามทั้งหมด
     * ของที่ยังนับได้ในคลังจะกลายเป็นของที่ไม่มีเอกสารรองรับ ตรวจสอบย้อนหลังไม่ได้
     * ต้องเบิกหรือปรับปรุงให้เหลือศูนย์ก่อน จะได้มีร่องรอยว่าของหายไปไหน
     */
    const left = inv.stockTotal(productId);
    if (left > 0) {
      return toast(
        "ลบไม่ได้ — " + form.name + " ยังมีสินค้าคงเหลือ " + num(left, 0) +
          " หน่วย กรุณาเบิกออกหรือปรับปรุงยอดให้เป็นศูนย์ก่อน",
        "err"
      );
    }

    const used = db.txns.some((t) => t.productId === productId);
    const msg = used
      ? "สินค้านี้มีประวัติการเคลื่อนไหวอยู่ หากลบ ประวัติที่เกี่ยวข้องจะถูกลบไปด้วย\n\nยืนยันการลบ?"
      : "ยืนยันการลบสินค้า " + form.name + " ?";
    if (!window.confirm(msg)) return;

    setBusy(true);
    try {
      await inv.removeProduct(productId);
      toast("ลบสินค้าเรียบร้อย");
      onClose();
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isNew ? "เพิ่มสินค้าใหม่" : "แก้ไขข้อมูลสินค้า"}
      onClose={onClose}
      footer={
        <>
          {!isNew ? (
            <button
              className="btn btn-d"
              onClick={remove}
              disabled={busy || stockLeft > 0}
              title={
                stockLeft > 0
                  ? "ลบไม่ได้ — ยังมีสินค้าคงเหลือ " + num(stockLeft, 0) + " หน่วย"
                  : "ลบสินค้า"
              }
            >
              <IcTrash size={15} />
              ลบสินค้า
            </button>
          ) : null}
          <button className="btn btn-p" onClick={save} disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึกข้อมูล"}
          </button>
        </>
      }
    >
      <div className="form-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
        <div className="field">
          <label className="lbl" htmlFor="e_code">รหัสสินค้า</label>
          <input className="inp" id="e_code" value={form.code} onChange={(e) => set("code", e.target.value)} />
        </div>

        <div className="field">
          <label className="lbl" htmlFor="e_cat">หมวดหมู่</label>
          <input
            className="inp"
            id="e_cat"
            list="catList"
            value={form.cat}
            onChange={(e) => set("cat", e.target.value)}
            placeholder="เช่น วัตถุดิบยาง"
          />
          <datalist id="catList">
            {cats.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div className="field span2">
          <label className="lbl" htmlFor="e_name">ชื่อสินค้า</label>
          <input
            className="inp"
            id="e_name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="ระบุชื่อสินค้า"
          />
        </div>

        <div className="field">
          <label className="lbl" htmlFor="e_unit">หน่วยนับ</label>
          <input
            className="inp"
            id="e_unit"
            value={form.unit}
            onChange={(e) => set("unit", e.target.value)}
            placeholder="เช่น กิโลกรัม"
          />
        </div>

        <div className="field">
          <label className="lbl" htmlFor="e_price">ราคาต่อหน่วย (บาท)</label>
          <input
            className="inp num"
            type="number"
            step="any"
            id="e_price"
            value={form.price}
            onChange={(e) => set("price", e.target.value)}
          />
        </div>

        <div className="field">
          <label className="lbl" htmlFor="e_min">จุดสั่งซื้อต่ำสุด</label>
          <QtyInput
            id="e_min"
            value={form.min}
            onChange={(v) => set("min", v)}
            ariaLabel="จุดสั่งซื้อต่ำสุด"
          />
        </div>

        <div className="field">
          <label className="lbl" htmlFor="e_bc">บาร์โค๊ด</label>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input
              className="inp"
              id="e_bc"
              value={form.barcode}
              onChange={(e) => set("barcode", e.target.value)}
              placeholder="สแกนหรือพิมพ์"
            />
            <button
              className="btn btn-g btn-sm"
              type="button"
              style={{ whiteSpace: "nowrap" }}
              onClick={() => set("barcode", "885" + String(Math.floor(Math.random() * 1e10)).padStart(10, "0"))}
            >
              สุ่ม
            </button>
          </div>
        </div>

        {/* คลังและที่เก็บประจำ — ใช้เป็นค่าตั้งต้นบนหน้าจอรับ/เบิก/โอน/ปรับปรุง/ขาย
            เลือกคลังแล้วที่เก็บจะถูกตั้งเป็นช่องแรกให้ทันที จะได้ไม่เหลือคู่ที่ใช้ไม่ได้ */}
        <div className="field">
          <label className="lbl" htmlFor="e_defwh">คลังประจำ (ไม่บังคับ)</label>
          <WarehouseSelect
            db={db}
            id="e_defwh"
            value={form.defWhId || ""}
            includeAll
            allLabel="— ไม่กำหนด —"
            onChange={(w) =>
              setForm((f) => ({ ...f, defWhId: w, defLocId: w ? firstLocOf(db, w) : "" }))
            }
          />
        </div>

        <div className="field">
          <label className="lbl" htmlFor="e_defloc">ที่เก็บประจำ</label>
          <LocationSelect
            db={db}
            whId={form.defWhId || ""}
            id="e_defloc"
            value={form.defLocId || ""}
            includeAll={!form.defWhId}
            allLabel="— ไม่กำหนด —"
            onChange={(l) => set("defLocId", l)}
          />
        </div>

        <div className="field span2" style={{ marginTop: -6 }}>
          <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
            ตั้งไว้แล้ว หน้าจอรับ / เบิก / โอน / ปรับปรุง จะเลือกคลังและที่เก็บนี้ให้อัตโนมัติ
            เมื่อเลือกสินค้ารายการนี้ และหน้า POS จะหยิบจากช่องนี้ก่อนถ้ามีของ
          </span>
        </div>

        <div className="field span2">
          <label className="lbl">ตัวอย่างบาร์โค๊ด</label>
          <div className="bc-box">
            <Barcode value={form.barcode} module={2} height={44} />
          </div>
        </div>

        <div className="field span2">
          <label className="lbl">รูปภาพสินค้า</label>
          <div
            className={"drop" + (dragOver ? " over" : "")}
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current && fileRef.current.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileRef.current && fileRef.current.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files[0]);
            }}
          >
            {form.img ? <img src={form.img} alt="" /> : null}
            <div className="t">
              {form.img
                ? "คลิกเพื่อเปลี่ยนรูป"
                : "คลิกเพื่อเลือกรูป หรือลากไฟล์มาวางที่นี่ · ระบบจะย่อรูปให้อัตโนมัติ"}
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => handleFile(e.target.files[0])}
          />
          {form.img ? (
            <button className="btn btn-d btn-sm" type="button" style={{ marginTop: 8 }} onClick={() => set("img", "")}>
              ลบรูปภาพ
            </button>
          ) : null}
        </div>

        <div className="field span2">
          <label className="lbl" htmlFor="e_note">รายละเอียดเพิ่มเติม</label>
          <textarea
            className="txa"
            id="e_note"
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="คุณลักษณะ เงื่อนไขการจัดเก็บ ฯลฯ"
          />
        </div>
      </div>
    </Modal>
  );
}
