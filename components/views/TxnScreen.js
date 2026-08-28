"use client";

// หน้าจอ รับสินค้า / เบิกสินค้า / โอนสินค้า — ใช้โครงเดียวกัน ต่างกันที่ชนิดรายการ

import { useEffect, useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { TYPES } from "@/lib/constants";
import { nextDocNo } from "@/lib/db";
import { num, thDate, todayISO, uid } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { IcPlus, IcTrash } from "../Icons";
import { Badge, Card, Empty, ProductSelect, TableWrap, WarehouseSelect } from "../ui";

export default function TxnScreen({ type }) {
  const inv = useInv();
  const { db } = inv;
  const { user } = useAuth();
  const toast = useToast();
  const print = usePrint();
  const [saving, setSaving] = useState(false);

  const T = TYPES[type];
  const isTransfer = type === "TRANSFER";

  const [date, setDate] = useState(todayISO);
  const [whFrom, setWhFrom] = useState(db.warehouses[0].id);
  const [whTo, setWhTo] = useState(db.warehouses[1] ? db.warehouses[1].id : db.warehouses[0].id);
  const [ref, setRef] = useState("");
  const [productId, setProductId] = useState(db.products[0].id);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [cart, setCart] = useState([]);

  const docNo = nextDocNo(db, type, date);

  // ยอดคงเหลือปัจจุบันของสินค้า+คลังที่เลือก (หักของที่อยู่ในตะกร้าแล้ว)
  const inCart = cart
    .filter((c) => c.productId === productId && c.whId === whFrom)
    .reduce((s, c) => s + c.qty, 0);
  const balance = inv.stockOf(productId, whFrom);
  const available = balance - inCart;

  useEffect(() => {
    setCart([]);
  }, [type]);

  function addLine() {
    const q = parseFloat(qty);
    if (!(q > 0)) return toast("กรุณาระบุจำนวนให้มากกว่า 0", "err");
    if (isTransfer && whFrom === whTo) return toast("คลังต้นทางและปลายทางต้องไม่ใช่คลังเดียวกัน", "err");
    if (type !== "RECEIVE" && q > available) {
      return toast("ยอดคงเหลือไม่พอ — คงเหลือใช้ได้ " + num(available, 0) + " หน่วย", "err");
    }
    setCart((prev) => [
      ...prev,
      { key: uid(), productId, qty: q, note: note.trim(), whId: whFrom, whTo: isTransfer ? whTo : "" },
    ]);
    setQty("");
    setNote("");
    toast("เพิ่ม " + inv.prodName(productId) + " จำนวน " + num(q, 0) + " แล้ว");
  }

  async function saveDoc() {
    if (!cart.length || saving) return;

    const doc = nextDocNo(db, type, date);
    const ts = new Date(date + "T09:00:00").getTime();
    const rows = cart.map((c) => ({
      id: uid(),
      type,
      docNo: doc,
      date,
      productId: c.productId,
      qty: c.qty,
      whId: c.whId,
      whTo: c.whTo,
      note: c.note,
      ref: isTransfer ? "" : ref.trim(),
      user: user && user.email ? user.email : "",
      ts,
    }));

    setSaving(true);
    try {
      await inv.addTxns(rows);
      toast("บันทึกเอกสาร " + doc + " (" + rows.length + " รายการ) เรียบร้อย");
      setCart([]);
      setRef("");
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setSaving(false);
    }
  }

  const recent = useMemo(
    () => db.txns.filter((t) => t.type === type).sort((a, b) => b.ts - a.ts).slice(0, 15),
    [db.txns, type]
  );

  function printReport() {
    const list = db.txns.filter((t) => t.type === type).sort((a, b) => a.ts - b.ts);
    if (!list.length) return toast("ไม่มีข้อมูลสำหรับพิมพ์", "warn");

    print({
      title: "รายงาน" + T.name,
      subtitle: "ข้อมูลทั้งหมด " + list.length + " รายการ",
      body: (
        <table>
          <thead>
            <tr>
              <th>ลำดับ</th>
              <th>วันที่</th>
              <th>เลขที่เอกสาร</th>
              <th>รหัส</th>
              <th>รายการสินค้า</th>
              <th>หน่วย</th>
              <th>{isTransfer ? "ต้นทาง → ปลายทาง" : "คลัง"}</th>
              <th style={{ textAlign: "right" }}>จำนวน</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t, i) => {
              const p = inv.prod(t.productId);
              return (
                <tr key={t.id}>
                  <td>{i + 1}</td>
                  <td>{thDate(t.date)}</td>
                  <td>{t.docNo}</td>
                  <td>{p ? p.code : ""}</td>
                  <td>{inv.prodName(t.productId)}</td>
                  <td>{p ? p.unit : ""}</td>
                  <td>{inv.whName(t.whId) + (isTransfer ? " → " + inv.whName(t.whTo) : "")}</td>
                  <td style={{ textAlign: "right" }}>{num(Math.abs(t.qty), 0)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7}>รวมทั้งสิ้น {list.length} รายการ</td>
              <td style={{ textAlign: "right" }}>
                {num(list.reduce((s, t) => s + Math.abs(t.qty), 0), 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      ),
    });
  }

  function exportCSV() {
    const list = db.txns.filter((t) => t.type === type).sort((a, b) => b.ts - a.ts);
    if (!list.length) return toast("ไม่มีข้อมูลสำหรับส่งออก", "warn");
    downloadCSV(
      ["วันที่", "เลขที่เอกสาร", "รหัสสินค้า", "ชื่อสินค้า", "จำนวน", "คลัง", "คลังปลายทาง", "ผู้ทำรายการ", "หมายเหตุ"],
      list.map((t) => {
        const p = inv.prod(t.productId);
        return [t.date, t.docNo, p ? p.code : "", inv.prodName(t.productId), t.qty,
          inv.whName(t.whId), t.whTo ? inv.whName(t.whTo) : "", t.user, t.note || ""];
      }),
      "รายงาน" + T.name + ".csv"
    );
    toast("ส่งออกไฟล์ CSV แล้ว");
  }

  return (
    <div className="stack">
      <Card title={"บันทึก" + T.name} actions={<Badge>เลขที่เอกสาร {docNo}</Badge>}>
        <div className="form-grid">
          <div className="field">
            <label className="lbl" htmlFor="f_date">วันที่ทำรายการ</label>
            <input className="inp" type="date" id="f_date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="f_doc">เลขที่เอกสาร</label>
            <input className="inp" id="f_doc" value={docNo} readOnly />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="f_wh">{isTransfer ? "คลังต้นทาง" : "คลังสินค้า"}</label>
            <WarehouseSelect db={db} id="f_wh" value={whFrom} onChange={setWhFrom} />
          </div>
          {isTransfer ? (
            <div className="field">
              <label className="lbl" htmlFor="f_wh2">คลังปลายทาง</label>
              <WarehouseSelect db={db} id="f_wh2" value={whTo} onChange={setWhTo} />
            </div>
          ) : (
            <div className="field">
              <label className="lbl" htmlFor="f_ref">
                {type === "RECEIVE" ? "เลขที่ใบส่งของ / ผู้ขาย" : "หน่วยงานผู้เบิก"}
              </label>
              <input
                className="inp"
                id="f_ref"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder={type === "RECEIVE" ? "เช่น INV-2569-0142" : "เช่น ฝ่ายวิจัยและพัฒนา"}
              />
            </div>
          )}
        </div>

        <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "18px 0" }} />

        <div className="form-grid">
          <div className="field span2">
            <label className="lbl" htmlFor="f_prod">สินค้า</label>
            <ProductSelect db={db} id="f_prod" value={productId} onChange={setProductId} />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="f_qty">จำนวน</label>
            <input
              className="inp num"
              type="number"
              id="f_qty"
              min="0"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addLine();
                }
              }}
              placeholder="0"
            />
          </div>
          <div className="field">
            <label className="lbl">คงเหลือปัจจุบัน</label>
            <input className="inp num" readOnly value={num(available, 0)} />
          </div>
          <div className="field span2">
            <label className="lbl" htmlFor="f_note">หมายเหตุ</label>
            <input
              className="inp"
              id="f_note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ระบุรายละเอียดเพิ่มเติม (ถ้ามี)"
            />
          </div>
          <div className="field span2" style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn btn-o" onClick={addLine} style={{ width: "100%" }}>
              <IcPlus size={16} />
              เพิ่มลงรายการ
            </button>
          </div>
        </div>
      </Card>

      <Card
        title="รายการในเอกสาร"
        actions={
          <>
            <button className="btn btn-p" onClick={saveDoc} disabled={!cart.length || saving}>
              {saving ? "กำลังบันทึก…" : "บันทึกเอกสาร"}
            </button>
            <button className="btn btn-g" onClick={() => setCart([])} disabled={saving}>
              ล้างรายการ
            </button>
          </>
        }
      >
        {cart.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th>สินค้า</th>
                <th>หน่วย</th>
                <th>{isTransfer ? "ต้นทาง → ปลายทาง" : "คลัง"}</th>
                <th className="num">จำนวน</th>
                <th>หมายเหตุ</th>
                <th style={{ width: 52 }} />
              </tr>
            </thead>
            <tbody>
              {cart.map((c, i) => {
                const p = inv.prod(c.productId);
                return (
                  <tr key={c.key}>
                    <td>{i + 1}</td>
                    <td>
                      <b>{p ? p.name : ""}</b>
                      <br />
                      <span className="code-cell" style={{ color: "var(--fg-faint)" }}>{p ? p.code : ""}</span>
                    </td>
                    <td>{p ? p.unit : ""}</td>
                    <td style={{ fontSize: 13 }}>
                      {inv.whName(c.whId)}
                      {isTransfer ? <b> → {inv.whName(c.whTo)}</b> : null}
                    </td>
                    <td className="num">
                      <b>{num(c.qty, 0)}</b>
                    </td>
                    <td style={{ fontSize: 13 }}>{c.note || "—"}</td>
                    <td>
                      <button
                        className="btn btn-d btn-icon"
                        title="ลบ"
                        onClick={() => setCart((prev) => prev.filter((x) => x.key !== c.key))}
                      >
                        <IcTrash size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>รวมทั้งสิ้น {cart.length} รายการ</td>
                <td className="num">{num(cart.reduce((s, c) => s + c.qty, 0), 0)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </TableWrap>
        ) : (
          <Empty>ยังไม่มีรายการ — เลือกสินค้าและกด “เพิ่มลงรายการ” ด้านบน</Empty>
        )}
      </Card>

      <Card
        title={"รายงาน" + T.name + " ล่าสุด"}
        actions={
          <>
            <button className="btn btn-o btn-sm" onClick={printReport}>พิมพ์รายงาน</button>
            <button className="btn btn-g btn-sm" onClick={exportCSV}>ส่งออก CSV</button>
          </>
        }
      >
        {recent.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>เลขที่เอกสาร</th>
                <th>สินค้า</th>
                <th>{isTransfer ? "ต้นทาง → ปลายทาง" : "คลัง"}</th>
                <th className="num">จำนวน</th>
                <th>ผู้ทำรายการ</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id}>
                  <td>{thDate(t.date)}</td>
                  <td className="code-cell">{t.docNo}</td>
                  <td>{inv.prodName(t.productId)}</td>
                  <td style={{ fontSize: 13 }}>
                    {inv.whName(t.whId)}
                    {isTransfer ? <b> → {inv.whName(t.whTo)}</b> : null}
                  </td>
                  <td className="num">{num(Math.abs(t.qty), 0)}</td>
                  <td>{t.user}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>ยังไม่มีรายการ{T.name}</Empty>
        )}
      </Card>
    </div>
  );
}
