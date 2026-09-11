"use client";

// คำเรียกสินค้าของลูกค้า — สอนระบบว่าคำไหนหมายถึงสินค้าตัวไหน
//
// ลูกค้าไม่ได้เรียกสินค้าด้วยชื่อในทะเบียน เขาเรียก "หมอนเด้ง" "ยางถ้วย" "ปุ๋ยสูตร 15"
// ทะเบียนนี้คือสิ่งที่ทำให้ตัวอ่านข้อความแม่นขึ้นเรื่อย ๆ โดยไม่ต้องแก้โค้ด
//
// สอนได้สองทาง:
//   1. ที่หน้าคำสั่งซื้อ กดปุ่ม "จำคำ" หลังเลือกสินค้าให้บรรทัดที่ระบบอ่านไม่ออก
//   2. ที่หน้านี้ เพิ่มเองล่วงหน้า หรือเก็บจากรายการคำที่ระบบยังอ่านไม่ออกด้านล่าง
//
// คำห้ามซ้ำ เพราะคำเดียวชี้ไปสองสินค้าแปลว่าตัวแปลงต้องเดา ซึ่งเดาผิดแน่นอน
// ถ้าคำหนึ่งกำกวมจริง ๆ ต้องตั้งคำให้ยาวและชัดขึ้น ไม่ใช่ปล่อยให้ซ้ำ

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { unmatchedWords } from "@/lib/lineOrders";
import { cleanText, suggestProducts } from "@/lib/lineParse";
import { num, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { IcPlus, IcTrash } from "../Icons";
import Modal from "../Modal";
import { Badge, Card, Empty, ProductSelect, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";
import { LINE_TABLES } from "./lineShared";

export default function LineAliases() {
  const inv = useInv();

  // สิทธิของหน้าจอนี้ — ไม่ติ๊ก "แก้ไข" แล้วเพิ่มและลบคำไม่ได้ ดูได้อย่างเดียว
  const perm = inv.perm("linealias");
  const { db } = inv;
  const { user } = useAuth();
  const toast = useToast();

  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const all = db.lineAliases || [];

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all
      .filter((a) => !s || (a.word + " " + inv.prodName(a.productId)).toLowerCase().includes(s))
      .slice()
      .sort((a, b) => a.word.localeCompare(b.word, "th"));
  }, [all, q, inv]);

  /** คำที่ระบบยังอ่านไม่ออก เรียงตามความถี่ — นี่คือรายการงานที่ต้องทำของหน้านี้ */
  const todo = useMemo(() => unmatchedWords(db, "", "", 15), [db]);

  async function save() {
    if (busy || !form) return;
    const word = cleanText(form.word);
    if (word.length < 2) return toast("คำเรียกต้องยาวอย่างน้อย 2 ตัวอักษร", "err");
    if (!form.productId) return toast("กรุณาเลือกสินค้า", "err");

    const dup = all.find(
      (a) => a.id !== form.id && a.word.toLowerCase() === word.toLowerCase()
    );
    if (dup) {
      return toast(
        "คำว่า “" + word + "” ถูกใช้กับ " + inv.prodName(dup.productId) + " อยู่แล้ว",
        "err"
      );
    }

    setBusy(true);
    try {
      await inv.saveLineAlias({
        id: form.id,
        word,
        productId: form.productId,
        hits: Number(form.hits) || 0,
        active: form.active !== false,
        note: String(form.note || "").trim(),
        user: (user && user.email) || "",
        ts: Date.now(),
      });
      toast("บันทึกคำเรียก “" + word + "” แล้ว", "ok");
      setForm(null);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove(a) {
    if (busy) return;
    if (!window.confirm("ยืนยันการลบคำเรียก “" + a.word + "” ?")) return;
    setBusy(true);
    try {
      await inv.removeLineAlias(a.id);
      toast("ลบคำเรียกแล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (!inv.lineReady) {
    return <SetupNotice feature="คำเรียกสินค้าของลูกค้า" tables={LINE_TABLES} />;
  }

  return (
    <div className="stack">
      <Card
        title="คำเรียกสินค้าของลูกค้า"
        actions={
          <>
            <Badge kind="info">{num(all.length, 0)} คำ</Badge>
            <button
              className="btn btn-p btn-sm"
              disabled={!perm.edit}
              onClick={() =>
                setForm({ id: uid(), word: "", productId: "", hits: 0, active: true, note: "" })
              }
            >
              <IcPlus size={15} />
              เพิ่มคำเรียก
            </button>
          </>
        }
      >
        <p className="hint" style={{ marginTop: 0 }}>
          ระบบใช้รายการนี้ตอนอ่านข้อความจากไลน์ · คำที่สอนไว้จะถูกใช้ก่อนชื่อสินค้าในทะเบียน
          เพราะมีคนยืนยันไว้แล้ว
        </p>

        <div className="row" style={{ marginBottom: 12 }}>
          <input
            className="inp"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาคำเรียก หรือชื่อสินค้า…"
            aria-label="ค้นหาคำเรียก"
            style={{ maxWidth: 320 }}
          />
        </div>

        {rows.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ minWidth: 170 }}>คำที่ลูกค้าใช้</th>
                <th style={{ minWidth: 220 }}>หมายถึงสินค้า</th>
                <th className="num" style={{ width: 110 }}>ใช้ไปแล้ว</th>
                <th style={{ width: 110 }}>สถานะ</th>
                <th style={{ minWidth: 160 }}>หมายเหตุ</th>
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <b>{a.word}</b>
                  </td>
                  <td>{inv.prodName(a.productId)}</td>
                  <td className="num">{num(a.hits, 0)}</td>
                  <td>
                    <Badge kind={a.active ? "ok" : "gray"}>
                      {a.active ? "ใช้งาน" : "ปิดไว้"}
                    </Badge>
                  </td>
                  <td style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>{a.note || "—"}</td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <button className="btn btn-o btn-sm" onClick={() => setForm({ ...a })}>
                        แก้ไข
                      </button>
                      <button
                        className="btn btn-d btn-icon"
                        onClick={() => remove(a)}
                        disabled={busy || !perm.edit}
                        title="ลบคำเรียก"
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
            {all.length
              ? "ไม่พบคำเรียกที่ตรงกับที่ค้นหา"
              : "ยังไม่มีคำเรียก — ระบบจะอ่านจากรหัสและชื่อสินค้าไปก่อน"}
          </Empty>
        )}
      </Card>

      {/* --------------- คำที่ระบบยังอ่านไม่ออก = งานที่ต้องทำ --------------- */}
      <Card title="คำที่ระบบยังอ่านไม่ออก">
        <p className="hint" style={{ marginTop: 0 }}>
          ทุกคำในนี้คือครั้งที่คนต้องมานั่งเลือกสินค้าเอง สอนไว้ครั้งเดียวแล้วไม่ต้องทำอีก
        </p>
        {todo.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ minWidth: 240 }}>ข้อความที่อ่านไม่ออก</th>
                <th className="num" style={{ width: 110 }}>พบกี่ครั้ง</th>
                <th style={{ minWidth: 260 }}>สินค้าที่น่าจะใช่</th>
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {todo.map((t) => {
                const hints = suggestProducts(t.word, db.products, 3);
                return (
                  <tr key={t.word}>
                    <td style={{ fontSize: 13 }}>{t.word}</td>
                    <td className="num">{num(t.times, 0)}</td>
                    <td>
                      {hints.length ? (
                        <div className="row" style={{ gap: 5 }}>
                          {hints.map((h) => (
                            <button
                              key={h.product.id}
                              className="btn btn-g btn-sm"
                              disabled={!perm.edit}
                              onClick={() =>
                                setForm({
                                  id: uid(),
                                  word: t.word.replace(/[\d,.]+/g, " ").replace(/\s+/g, " ").trim(),
                                  productId: h.product.id,
                                  hits: 0,
                                  active: true,
                                  note: "สอนจากคำที่อ่านไม่ออก",
                                })
                              }
                            >
                              {h.product.name}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: "var(--fg-faint)", fontSize: 12.5 }}>
                          เดาไม่ได้ ต้องเลือกเอง
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-o btn-sm"
                        disabled={!perm.edit}
                        onClick={() =>
                          setForm({
                            id: uid(),
                            word: t.word.replace(/[\d,.]+/g, " ").replace(/\s+/g, " ").trim(),
                            productId: "",
                            hits: 0,
                            active: true,
                            note: "สอนจากคำที่อ่านไม่ออก",
                          })
                        }
                      >
                        สอนคำนี้
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>ไม่มีคำที่อ่านไม่ออกค้างอยู่ — ระบบอ่านคำสั่งซื้อได้ครบทุกบรรทัด</Empty>
        )}
      </Card>

      {form ? (
        <Modal
          title={form.word ? "แก้ไขคำเรียก" : "เพิ่มคำเรียก"}
          onClose={() => setForm(null)}
          maxWidth={560}
          footer={
            <>
              <button className="btn btn-g" onClick={() => setForm(null)} disabled={busy}>
                ยกเลิก
              </button>
              <button className="btn btn-p" onClick={save} disabled={busy || !perm.edit}>
                บันทึก
              </button>
            </>
          }
        >
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
            <div className="field span2">
              <label className="lbl" htmlFor="la_word">คำที่ลูกค้าใช้เรียก</label>
              <input
                className="inp"
                id="la_word"
                value={form.word}
                maxLength={100}
                onChange={(e) => setForm({ ...form, word: e.target.value })}
                placeholder="เช่น หมอนเด้ง / ยางถ้วย / ปุ๋ยสูตร 15"
              />
              <span className="hint">
                ตั้งให้ยาวพอที่จะไม่ไปชนกับคำอื่น · คำสั้นเกินไปจะจับคู่ผิดบ่อย
              </span>
            </div>
            <div className="field span2">
              <label className="lbl" htmlFor="la_prod">หมายถึงสินค้า</label>
              <ProductSelect
                db={db}
                id="la_prod"
                value={form.productId}
                onChange={(v) => setForm({ ...form, productId: v })}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="la_active">สถานะ</label>
              <select
                className="sel"
                id="la_active"
                value={form.active ? "1" : "0"}
                onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}
              >
                <option value="1">ใช้งาน</option>
                <option value="0">ปิดไว้ (ไม่เอาไปใช้อ่านข้อความ)</option>
              </select>
            </div>
            <div className="field">
              <label className="lbl" htmlFor="la_note">หมายเหตุ</label>
              <input
                className="inp"
                id="la_note"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
