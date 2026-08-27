"use client";

// ฟอร์มเพิ่ม / แก้ไขสินค้า — รองรับการใส่รูปภาพและบาร์โค๊ด

import { useMemo, useRef, useState } from "react";
import { useInv } from "@/lib/store";
import { nextProdCode } from "@/lib/db";
import { resizeImage } from "@/lib/image";
import { uid } from "@/lib/format";
import Modal from "../Modal";
import { useToast } from "../Toast";
import { Barcode } from "../ui";

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
        }
  );
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

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

  function save() {
    const code = String(form.code).trim();
    const name = String(form.name).trim();
    const unit = String(form.unit).trim();

    if (!code) return toast("กรุณาระบุรหัสสินค้า", "err");
    if (!name) return toast("กรุณาระบุชื่อสินค้า", "err");
    if (!unit) return toast("กรุณาระบุหน่วยนับ", "err");
    if (db.products.some((p) => p.code.toLowerCase() === code.toLowerCase() && p.id !== productId)) {
      return toast("รหัสสินค้านี้ถูกใช้แล้ว", "err");
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
    };

    inv.update((draft) => {
      if (isNew) {
        draft.products.push({ id: uid(), ...value });
      } else {
        const i = draft.products.findIndex((p) => p.id === productId);
        if (i >= 0) draft.products[i] = { ...draft.products[i], ...value };
      }
    });

    toast(isNew ? "เพิ่มสินค้าเรียบร้อย" : "บันทึกการแก้ไขเรียบร้อย");
    onClose();
  }

  function remove() {
    const used = db.txns.some((t) => t.productId === productId);
    const msg = used
      ? "สินค้านี้มีประวัติการเคลื่อนไหวอยู่ หากลบ ประวัติที่เกี่ยวข้องจะถูกลบไปด้วย\n\nยืนยันการลบ?"
      : "ยืนยันการลบสินค้า " + form.name + " ?";
    if (!window.confirm(msg)) return;

    inv.update((draft) => {
      draft.products = draft.products.filter((p) => p.id !== productId);
      draft.txns = draft.txns.filter((t) => t.productId !== productId);
    });
    toast("ลบสินค้าเรียบร้อย");
    onClose();
  }

  return (
    <Modal
      title={isNew ? "เพิ่มสินค้าใหม่" : "แก้ไขข้อมูลสินค้า"}
      onClose={onClose}
      footer={
        <>
          {!isNew ? (
            <button className="btn btn-d" onClick={remove}>
              ลบสินค้า
            </button>
          ) : null}
          <button className="btn btn-p" onClick={save}>
            บันทึกข้อมูล
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
          <input
            className="inp num"
            type="number"
            step="any"
            id="e_min"
            value={form.min}
            onChange={(e) => set("min", e.target.value)}
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
