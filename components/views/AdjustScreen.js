"use client";

// หน้าจอปรับปรุงสินค้า — เทียบยอดตามบัญชีกับยอดที่นับได้จริง แล้วบันทึกผลต่าง

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { ADJUST_REASONS } from "@/lib/constants";
import { defaultBinOf, firstLocOf, nextDocNo } from "@/lib/db";
import { num, thDate, todayISO, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { IcTrash } from "../Icons";
import { Badge, Card, Empty, ProductSelect, TableWrap, WhLocFields } from "../ui";
import SetupNotice from "../SetupNotice";
import { CountSheetBody } from "./printBodies";

export default function AdjustScreen() {
  const inv = useInv();
  const { db } = inv;
  const { user } = useAuth();
  const toast = useToast();
  const print = usePrint();
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(todayISO);
  const initDef = defaultBinOf(db, db.products[0].id);
  const [whId, setWhId] = useState(initDef ? initDef.whId : db.warehouses[0].id);
  const [locId, setLocId] = useState(() =>
    initDef ? initDef.locId : firstLocOf(db, db.warehouses[0].id)
  );
  const [productId, setProductId] = useState(db.products[0].id);

  /** เลือกสินค้าแล้วไปที่คลัง + ที่เก็บประจำของสินค้านั้น ถ้าตั้งไว้ */
  function pickProduct(id) {
    setProductId(id);
    const def = defaultBinOf(db, id);
    if (!def) return;
    setWhId(def.whId);
    setLocId(def.locId);
  }
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState(ADJUST_REASONS[0]);
  const [cart, setCart] = useState([]);

  const docNo = nextDocNo(db, "ADJUST", date);

  // ตรวจนับกันทีละช่องเก็บ ยอดตามบัญชีจึงเป็นยอดในช่องนั้น ไม่ใช่ทั้งคลัง
  // ทำแบบนี้ผลต่างจะไม่มีทางทำให้ของในช่องติดลบ เพราะยอดใหม่คือยอดที่นับได้จริง
  const book = inv.placedIn(productId, locId);
  const whBalance = inv.stockOf(productId, whId);
  const countedNum = parseFloat(counted);
  const diff = isNaN(countedNum) ? 0 : countedNum - book;

  function addLine() {
    const err = inv.checkWhLoc(whId, locId);
    if (err) return toast(err, "err");
    if (isNaN(countedNum) || countedNum < 0) return toast("กรุณาระบุยอดนับได้จริง", "err");
    if (diff === 0) return toast("ยอดตรงกับบัญชี ไม่ต้องปรับปรุง", "warn");
    if (cart.some((c) => c.productId === productId && c.locId === locId)) {
      return toast("มีรายการสินค้านี้ในที่เก็บนี้ในเอกสารแล้ว", "warn");
    }
    setCart((prev) => [
      ...prev,
      { key: uid(), productId, whId, locId, book, counted: countedNum, qty: diff, note: reason },
    ]);
    setCounted("");
    toast("เพิ่มรายการปรับปรุง " + inv.prodName(productId) + " ที่ " + inv.locName(locId));
  }

  async function saveDoc() {
    if (!cart.length || saving) return;

    const doc = nextDocNo(db, "ADJUST", date);
    const ts = new Date(date + "T09:00:00").getTime();
    const rows = cart.map((c) => ({
      id: uid(),
      type: "ADJUST",
      docNo: doc,
      date,
      productId: c.productId,
      qty: c.qty,
      whId: c.whId,
      whTo: "",
      locId: c.locId,
      locTo: "",
      note: c.note,
      ref: "นับได้ " + c.counted + " / บัญชี " + c.book,
      user: user && user.email ? user.email : "",
      ts,
    }));

    setSaving(true);
    try {
      await inv.addTxns(rows);
      toast("บันทึกเอกสารปรับปรุง " + doc + " เรียบร้อย");
      setCart([]);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setSaving(false);
    }
  }

  const recent = useMemo(
    () => db.txns.filter((t) => t.type === "ADJUST").sort((a, b) => b.ts - a.ts).slice(0, 15),
    [db.txns]
  );

  function printAdjustReport() {
    const list = db.txns.filter((t) => t.type === "ADJUST").sort((a, b) => a.ts - b.ts);
    if (!list.length) return toast("ไม่มีข้อมูลสำหรับพิมพ์", "warn");

    print({
      title: "รายงานการปรับปรุงสินค้า",
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
              <th>คลัง · ที่เก็บ</th>
              <th style={{ textAlign: "right" }}>ผลต่าง</th>
              <th>สาเหตุ</th>
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
                  <td>{inv.whLocName(t.whId, t.locId)}</td>
                  <td style={{ textAlign: "right" }}>
                    {(t.qty > 0 ? "+" : "") + num(t.qty, 0)}
                  </td>
                  <td>{t.note || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ),
    });
  }

  function printSheet() {
    const w = inv.wh(whId);
    print({
      title: "ใบตรวจนับสินค้าคงคลัง",
      subtitle: (w ? w.name + " · จังหวัด" + w.province : "ทุกคลัง") + " · ณ วันที่ " + thDate(todayISO()),
      body: <CountSheetBody db={db} inv={inv} whId={whId} />,
    });
  }

  if (!inv.locationsReady) {
    return (
      <SetupNotice feature="หน้าจอปรับปรุงสินค้า" tables={["locations", "product_locations"]} />
    );
  }

  return (
    <div className="stack">
      <Card
        title="บันทึกการปรับปรุงสินค้า (จากผลการตรวจนับ)"
        actions={<Badge>เลขที่เอกสาร {docNo}</Badge>}
      >
        <div className="form-grid">
          <div className="field">
            <label className="lbl" htmlFor="a_date">วันที่ตรวจนับ</label>
            <input className="inp" type="date" id="a_date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="a_doc">เลขที่เอกสาร</label>
            <input className="inp" id="a_doc" value={docNo} readOnly />
          </div>
          <WhLocFields
            db={db}
            idPrefix="a"
            whId={whId}
            locId={locId}
            locLabel="ที่เก็บที่ตรวจนับ"
            onChange={(w, l) => {
              setWhId(w);
              setLocId(l);
            }}
          />
          <div className="field span2">
            <label className="lbl" htmlFor="a_prod">สินค้า</label>
            <ProductSelect db={db} id="a_prod" value={productId} onChange={pickProduct} />
          </div>
          <div className="field">
            <label className="lbl">ยอดตามบัญชีในที่เก็บนี้</label>
            <input className="inp num" readOnly value={num(book, 0)} />
          </div>
          <div className="field">
            <label className="lbl">คงเหลือทั้งคลัง</label>
            <input className="inp num" readOnly value={num(whBalance, 0)} />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="a_count">ยอดนับได้จริง</label>
            <input
              className="inp num"
              type="number"
              step="any"
              id="a_count"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="field">
            <label className="lbl">ผลต่าง</label>
            <input
              className="inp num"
              readOnly
              value={(diff > 0 ? "+" : "") + num(diff, 0)}
              style={{ color: diff === 0 ? undefined : diff > 0 ? "var(--ok)" : "var(--err)", fontWeight: 700 }}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="a_reason">สาเหตุ</label>
            <select className="sel" id="a_reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {ADJUST_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="field span2" style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn btn-o" onClick={addLine} style={{ width: "100%" }}>
              เพิ่มลงรายการ
            </button>
          </div>
        </div>
      </Card>

      <Card
        title="รายการปรับปรุง"
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
                <th>คลัง · ที่เก็บ</th>
                <th className="num">ตามบัญชี</th>
                <th className="num">นับได้</th>
                <th className="num">ผลต่าง</th>
                <th>สาเหตุ</th>
                <th style={{ width: 52 }} />
              </tr>
            </thead>
            <tbody>
              {cart.map((c, i) => (
                <tr key={c.key}>
                  <td>{i + 1}</td>
                  <td>{inv.prodName(c.productId)}</td>
                  <td style={{ fontSize: 13 }}>{inv.whLocName(c.whId, c.locId)}</td>
                  <td className="num">{num(c.book, 0)}</td>
                  <td className="num">{num(c.counted, 0)}</td>
                  <td className="num">
                    <b style={{ color: c.qty > 0 ? "var(--ok)" : "var(--err)" }}>
                      {(c.qty > 0 ? "+" : "") + num(c.qty, 0)}
                    </b>
                  </td>
                  <td style={{ fontSize: 13 }}>{c.note}</td>
                  <td>
                    <button
                      className="btn btn-d btn-icon"
                      onClick={() => setCart((prev) => prev.filter((x) => x.key !== c.key))}
                    >
                      <IcTrash size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>ยังไม่มีรายการปรับปรุง</Empty>
        )}
      </Card>

      <Card
        title="รายงานการปรับปรุงล่าสุด"
        actions={
          <>
            <button className="btn btn-o btn-sm" onClick={printAdjustReport}>พิมพ์รายงาน</button>
            <button className="btn btn-g btn-sm" onClick={printSheet}>พิมพ์ใบตรวจนับ</button>
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
                <th>คลัง · ที่เก็บ</th>
                <th className="num">ผลต่าง</th>
                <th>สาเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id}>
                  <td>{thDate(t.date)}</td>
                  <td className="code-cell">{t.docNo}</td>
                  <td>{inv.prodName(t.productId)}</td>
                  <td style={{ fontSize: 13 }}>{inv.whLocName(t.whId, t.locId)}</td>
                  <td className="num">
                    <b style={{ color: t.qty > 0 ? "var(--ok)" : "var(--err)" }}>
                      {(t.qty > 0 ? "+" : "") + num(t.qty, 0)}
                    </b>
                  </td>
                  <td style={{ fontSize: 13 }}>{t.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>ยังไม่มีรายการปรับปรุง</Empty>
        )}
      </Card>
    </div>
  );
}
