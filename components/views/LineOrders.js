"use client";

// คำสั่งซื้อจากไลน์ — ตรวจสิ่งที่ระบบอ่านได้ แก้ให้ถูก แล้วออกเอกสาร
//
// หน้านี้คือ "ด่านคน" ที่คั่นระหว่างข้อความในแชทกับเอกสารจริง
// ข้อความจากไลน์ไม่มีทางกลายเป็นเอกสารได้เองโดยไม่ผ่านหน้านี้ เพราะ:
//   ลูกค้าพิมพ์ผิดได้ ตัวแปลงอ่านผิดได้ และราคาต้องมีคนรับผิดชอบ
//   ระบบที่ออกใบเสนอราคาเองจากข้อความแชท จะส่งราคาผิดให้ลูกค้าในวันแรกที่ใช้
//
// ปลายทางมีสองทาง:
//   ใบเสนอราคา  ออกจากหน้านี้ได้เลย เพราะไม่ขยับสต็อก ไม่ต้องรู้ว่าหยิบของจากคลังไหน
//   ใบขาย       ส่งร่างไปหน้าขายสินค้าและบริการ เพราะต้องเลือกคลังและช่องเก็บรายบรรทัด
//               ซึ่งคนขายเท่านั้นที่รู้ และฐานข้อมูลจะตรวจของในช่องนั้นอีกชั้น

import { useEffect, useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { VAT_PERCENT } from "@/lib/constants";
import { customerAddress, lineAmount, nextQuoteNo } from "@/lib/db";
import { putDraft } from "@/lib/handoff";
import { MATCH_NAME, mergeItems, parseOrderText, suggestProducts } from "@/lib/lineParse";
import {
  LINE_ORDER_STATUS,
  orderStatusOf,
  quoteTotals,
  sourceOf,
  validUntil,
} from "@/lib/lineOrders";
import { num, thDate, todayISO, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { IcPlus, IcTrash } from "../Icons";
import Modal from "../Modal";
import { Badge, Card, Empty, ProductSelect, QtyInput, SearchSelect, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";
import { LINE_TABLES, scoreKind } from "./lineShared";

const blankLine = (orderId, seq) => ({
  id: uid(),
  orderId,
  seq,
  raw: "",
  productId: "",
  qty: 1,
  unit: "",
  price: null,
  matchedBy: "pick",
  score: 1,
  note: "",
});

export default function LineOrders({ onNavigate }) {
  const inv = useInv();

  // สิทธิของหน้าจอนี้ — ไม่ติ๊ก "แก้ไข" แล้วแก้รายการและออกเอกสารไม่ได้
  const perm = inv.perm("lineorder");
  const { db } = inv;
  const { user } = useAuth();
  const toast = useToast();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState("");
  const [lines, setLines] = useState([]);
  const [head, setHead] = useState(null);
  const [busy, setBusy] = useState(false);
  const [quoteBox, setQuoteBox] = useState(null);

  const orders = db.lineOrders || [];
  const order = orders.find((o) => o.id === openId) || null;

  /* เปิดใบไหน ให้ดึงรายการของใบนั้นมาแก้บนหน้าจอ (ยังไม่เขียนลงฐานข้อมูล) */
  useEffect(() => {
    if (!order) {
      setLines([]);
      setHead(null);
      return;
    }
    setLines(
      (db.lineOrderItems || [])
        .filter((x) => x.orderId === order.id)
        .slice()
        .sort((a, b) => a.seq - b.seq)
    );
    setHead({
      partyName: order.partyName,
      customerId: order.customerId,
      note: order.note,
      status: order.status,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, db.lineOrderItems]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return orders
      .filter((o) => {
        if (status && o.status !== status) return false;
        if (!s) return true;
        return (o.code + " " + o.partyName + " " + o.rawText).toLowerCase().includes(s);
      })
      .slice()
      .sort((a, b) => b.ts - a.ts);
  }, [orders, q, status]);

  const customers = useMemo(
    () => (db.customers || []).slice().sort((a, b) => a.code.localeCompare(b.code)),
    [db.customers]
  );

  /* -------------------------------------------------- คำนวณเงินของใบ */

  /** ราคาที่จะใช้จริงของบรรทัดหนึ่ง — ลูกค้าระบุมาก่อน ไม่งั้นใช้ราคาในทะเบียน */
  const priceOf = (l) => {
    if (l.price !== null && l.price !== undefined && l.price !== "") return Number(l.price) || 0;
    const p = inv.prod(l.productId);
    return p ? Number(p.price) || 0 : 0;
  };

  // ใช้ lineAmount ตัวเดียวกับใบขาย ยอดที่เสนอไปกับยอดที่เก็บเงินจริงจะได้ไม่ต่างกัน
  // แม้แต่สตางค์เดียว ซึ่งเป็นเรื่องที่ลูกค้าทักมาแน่ถ้ามันต่าง
  const priced = lines
    .filter((l) => l.productId && Number(l.qty) > 0)
    .map((l) => ({
      ...l,
      unitPrice: priceOf(l),
      amount: lineAmount({ qty: l.qty, price: priceOf(l) }),
    }));

  const totals = quoteTotals(priced, 0, VAT_PERCENT);
  const unread = lines.filter((l) => !l.productId).length;
  const weak = lines.filter((l) => l.productId && l.score < 0.95).length;

  /* ------------------------------------------------------ แก้รายการ */

  const setLine = (id, patch) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  /** เลือกสินค้าเองให้บรรทัดที่ระบบอ่านไม่ออก — ถือว่าคนยืนยันแล้ว จึงมั่นใจเต็ม */
  const pickProduct = (id, productId) => {
    const p = inv.prod(productId);
    setLine(id, {
      productId,
      matchedBy: productId ? "pick" : "",
      score: productId ? 1 : 0,
      unit: p ? p.unit : "",
      note: "",
    });
  };

  async function saveLines(nextStatus) {
    if (!order || busy) return;
    const clean = lines
      .filter((l) => l.raw || l.productId)
      .map((l, i) => ({ ...l, seq: i + 1, qty: Number(l.qty) || 0 }));

    setBusy(true);
    try {
      await inv.saveLineOrder(
        {
          ...order,
          partyName: head.partyName,
          customerId: head.customerId,
          note: head.note,
          status: nextStatus || head.status,
        },
        clean
      );
      toast("บันทึกคำสั่งซื้อ " + order.code + " แล้ว", "ok");
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  /** อ่านข้อความเดิมใหม่อีกครั้ง — ใช้หลังสอนคำเรียกสินค้าเพิ่ม */
  function reparse() {
    if (!order) return;
    const parsed = parseOrderText(order.rawText, db.products, db.lineAliases);
    const merged = mergeItems(parsed.items);
    setLines([
      ...merged.map((it, i) => ({
        id: uid(),
        orderId: order.id,
        seq: i + 1,
        raw: it.raw,
        productId: it.productId,
        qty: it.qty,
        unit: it.unit,
        price: it.price,
        matchedBy: it.how,
        score: it.score,
        note: it.qtyWeak ? "ระบบเดาจำนวนมา ควรตรวจก่อนออกเอกสาร" : "",
      })),
      ...parsed.unmatched.map((u, i) => ({
        id: uid(),
        orderId: order.id,
        seq: merged.length + i + 1,
        raw: u.raw,
        productId: "",
        qty: u.qty,
        unit: "",
        price: null,
        matchedBy: "",
        score: 0,
        note: "ยังไม่รู้ว่าเป็นสินค้าตัวไหน",
      })),
    ]);
    toast(
      "อ่านใหม่แล้ว — ได้ " + merged.length + " รายการ · อ่านไม่ออก " + parsed.unmatched.length,
      "info"
    );
  }

  /** สอนคำเรียกสินค้าจากบรรทัดที่เพิ่งเลือกเอง จะได้ไม่ต้องเลือกซ้ำครั้งหน้า */
  async function teachAlias(l) {
    if (!l.productId || !l.raw || busy) return;
    const word = l.raw.replace(/[\d,.]+/g, " ").replace(/\s+/g, " ").trim();
    if (word.length < 2) return toast("ข้อความสั้นเกินกว่าจะใช้เป็นคำเรียกได้", "err");

    const dup = (db.lineAliases || []).find((a) => a.word.toLowerCase() === word.toLowerCase());
    if (dup) {
      return toast(
        "คำว่า “" + word + "” ถูกใช้กับ " + inv.prodName(dup.productId) + " อยู่แล้ว",
        "err"
      );
    }

    setBusy(true);
    try {
      await inv.saveLineAlias({
        id: uid(),
        word,
        productId: l.productId,
        hits: 0,
        active: true,
        note: "สอนจากคำสั่งซื้อ " + (order ? order.code : ""),
        user: (user && user.email) || "",
        ts: Date.now(),
      });
      toast("จำคำว่า “" + word + "” = " + inv.prodName(l.productId) + " แล้ว", "ok");
    } catch (e) {
      toast("บันทึกคำเรียกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------ ออกเอกสาร */

  function openQuoteBox() {
    if (!priced.length) return toast("ยังไม่มีรายการที่พร้อมออกเอกสาร", "err");
    setQuoteBox({ validDays: 30, terms: "ยืนราคาตามวันที่ระบุ · ราคานี้รวมภาษีมูลค่าเพิ่มแล้ว" });
  }

  async function makeQuote() {
    if (!order || busy) return;
    const cust = customers.find((c) => c.id === head.customerId) || null;
    const date = order.date || todayISO();
    const quoteId = uid();

    const quote = {
      id: quoteId,
      docNo: nextQuoteNo(db, date),
      date,
      customerId: head.customerId || "",
      custCode: cust ? cust.code : "",
      // ไม่มีในทะเบียนก็ใช้ชื่อที่เห็นในไลน์ไปก่อน ใบเสนอราคาไม่ได้บังคับว่าต้องเป็นลูกค้าจดทะเบียน
      custName: cust ? cust.name : head.partyName || "",
      custAddress: cust ? customerAddress(cust) : "",
      custProvince: cust ? cust.province : "",
      custTaxId: cust ? cust.taxId || "" : "",
      custBranch: cust ? cust.branch || "" : "",
      custKind: cust ? cust.kind || "" : "",
      salesId: cust && cust.salesId ? cust.salesId : "",
      salesCode: "",
      salesName: "",
      validDays: Number(quoteBox.validDays) || 0,
      validTo: validUntil(date, quoteBox.validDays),
      terms: quoteBox.terms || "",
      vatRate: VAT_PERCENT,
      itemsTotal: totals.itemsTotal,
      billDiscount: 0,
      base: totals.base,
      vat: totals.vat,
      total: totals.total,
      note: head.note || "",
      status: "DRAFT",
      invoiceId: "",
      user: (user && user.email) || "",
      ts: Date.now(),
    };

    const items = priced.map((l, i) => ({
      id: uid(),
      quoteId,
      productId: l.productId,
      qty: Number(l.qty) || 0,
      price: l.unitPrice,
      discPct: 0,
      discAmt: 0,
      amount: l.amount,
      note: l.raw,
      seq: i + 1,
    }));

    setBusy(true);
    try {
      await inv.saveQuote(quote, items);
      await inv.saveLineOrder(
        {
          ...order,
          partyName: head.partyName,
          customerId: head.customerId,
          note: head.note,
          status: "QUOTED",
          quoteId,
        },
        lines
      );
      setQuoteBox(null);
      toast("ออกใบเสนอราคา " + quote.docNo + " แล้ว", "ok");
      if (onNavigate) onNavigate("quote");
    } catch (e) {
      toast("ออกใบเสนอราคาไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  /**
   * ส่งร่างไปหน้าขายสินค้าและบริการ
   *
   * ไม่สร้างใบขายให้เองจากหน้านี้ เพราะใบขายตัดสต็อกจริงและต้องระบุคลัง/ช่องเก็บ
   * รายบรรทัด ซึ่งต้องให้คนที่หยิบของเป็นคนเลือก และฐานข้อมูลจะตรวจของในช่องอีกชั้น
   * การสร้างให้เองเงียบ ๆ แปลว่าตัดสต็อกจากช่องที่ไม่มีใครยืนยัน
   */
  async function toInvoice() {
    if (!order || busy) return;
    if (!priced.length) return toast("ยังไม่มีรายการที่พร้อมออกเอกสาร", "err");

    putDraft("invoice", {
      from: "line",
      code: order.code,
      customerId: head.customerId || "",
      note:
        "จากคำสั่งซื้อทางไลน์ " + order.code + (head.note ? " · " + head.note : ""),
      lines: priced.map((l) => ({
        productId: l.productId,
        qty: Number(l.qty) || 0,
        price: l.unitPrice,
      })),
    });

    setBusy(true);
    try {
      await inv.saveLineOrder(
        { ...order, partyName: head.partyName, customerId: head.customerId, note: head.note, status: "CONFIRMED" },
        lines
      );
      toast("ส่งรายการไปหน้าขายสินค้าและบริการแล้ว — เลือกคลังและช่องเก็บให้ครบก่อนบันทึก", "info");
      if (onNavigate) onNavigate("invoice");
    } catch (e) {
      toast("ส่งต่อไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function removeOrder(o) {
    if (busy) return;
    if (o.quoteId || o.invoiceId) {
      return toast("ใบนี้ออกเอกสารไปแล้ว ลบไม่ได้ ถ้าต้องการยกเลิกให้เปลี่ยนสถานะแทน", "err");
    }
    if (!window.confirm("ยืนยันการลบคำสั่งซื้อ " + o.code + " ?")) return;
    setBusy(true);
    try {
      await inv.removeLineOrder(o.id);
      if (openId === o.id) setOpenId("");
      toast("ลบคำสั่งซื้อแล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (!inv.lineReady) {
    return <SetupNotice feature="คำสั่งซื้อจากไลน์" tables={LINE_TABLES} />;
  }

  return (
    <div className="stack">
      <Card
        title="คำสั่งซื้อจากไลน์"
        actions={
          <>
            <Badge kind="info">{num(rows.length, 0)} ใบ</Badge>
            <button className="btn btn-g btn-sm" onClick={() => onNavigate && onNavigate("lineinbox")}>
              ไปกล่องข้อความ
            </button>
          </>
        }
      >
        <div className="row" style={{ marginBottom: 12 }}>
          <input
            className="inp"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหารหัส ชื่อลูกค้า หรือข้อความ…"
            aria-label="ค้นหาคำสั่งซื้อ"
            style={{ maxWidth: 320 }}
          />
          <select
            className="sel"
            style={{ maxWidth: 210 }}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="กรองตามสถานะ"
          >
            <option value="">ทุกสถานะ</option>
            {LINE_ORDER_STATUS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {rows.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 110 }}>รหัส</th>
                <th style={{ width: 110 }}>วันที่</th>
                <th style={{ minWidth: 150 }}>ลูกค้า / ผู้ส่ง</th>
                <th style={{ minWidth: 240 }}>ข้อความย่อ</th>
                <th className="num">รายการ</th>
                <th style={{ width: 150 }}>สถานะ</th>
                <th style={{ width: 130 }}>เอกสารที่ออก</th>
                <th style={{ width: 140 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const st = orderStatusOf(o.status);
                const n = (db.lineOrderItems || []).filter((x) => x.orderId === o.id);
                const miss = n.filter((x) => !x.productId).length;
                const qt = (db.quotes || []).find((x) => x.id === o.quoteId);
                const iv = (db.invoices || []).find((x) => x.id === o.invoiceId);
                return (
                  <tr key={o.id} className={o.id === openId ? "sel" : ""}>
                    <td className="code-cell">{o.code}</td>
                    <td>{thDate(o.date)}</td>
                    <td>
                      <b>{o.partyName || "—"}</b>
                      <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                        {sourceOf(o.source).name}
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
                      {o.rawText.slice(0, 90)}
                      {o.rawText.length > 90 ? "…" : ""}
                    </td>
                    <td className="num">
                      {num(n.length, 0)}
                      {miss ? <div style={{ fontSize: 11.5, color: "var(--err)" }}>อ่านไม่ออก {miss}</div> : null}
                    </td>
                    <td>
                      <span className={"bdg " + st.badge}>{st.name}</span>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {qt ? <div>{qt.docNo}</div> : null}
                      {iv ? <div>{iv.docNo}</div> : null}
                      {!qt && !iv ? <span style={{ color: "var(--fg-faint)" }}>—</span> : null}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <button
                          className="btn btn-o btn-sm"
                          onClick={() => setOpenId(o.id === openId ? "" : o.id)}
                        >
                          {o.id === openId ? "ปิด" : "ตรวจ"}
                        </button>
                        <button
                          className="btn btn-d btn-icon"
                          onClick={() => removeOrder(o)}
                          disabled={busy || !perm.edit || !!(o.quoteId || o.invoiceId)}
                          title="ลบคำสั่งซื้อ"
                        >
                          <IcTrash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>
            {orders.length
              ? "ไม่พบคำสั่งซื้อที่ตรงกับเงื่อนไข"
              : "ยังไม่มีคำสั่งซื้อ — ไปที่กล่องข้อความจากไลน์ เลือกข้อความแล้วกดสร้างคำสั่งซื้อ"}
          </Empty>
        )}
      </Card>

      {/* ------------------ ตรวจรายการของใบที่เปิดอยู่ ------------------ */}
      {order && head ? (
        <Card
          title={"ตรวจรายการ · " + order.code}
          actions={
            <>
              {unread ? <Badge kind="err">อ่านไม่ออก {unread} รายการ</Badge> : null}
              {weak ? <Badge kind="warn">ควรตรวจ {weak} รายการ</Badge> : null}
              <button className="btn btn-g btn-sm" onClick={reparse} disabled={!perm.edit}>
                อ่านข้อความใหม่
              </button>
              <button className="btn btn-g btn-sm" onClick={() => saveLines()} disabled={busy || !perm.edit}>
                บันทึกร่าง
              </button>
              <button className="btn btn-o btn-sm" onClick={openQuoteBox} disabled={busy || !perm.edit}>
                ออกใบเสนอราคา
              </button>
              <button className="btn btn-p btn-sm" onClick={toInvoice} disabled={busy || !perm.edit}>
                ไปออกใบขาย
              </button>
            </>
          }
        >
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 14 }}>
            <div className="field">
              <label className="lbl" htmlFor="lo_party">ชื่อผู้ส่งในไลน์</label>
              <input
                className="inp"
                id="lo_party"
                value={head.partyName}
                onChange={(e) => setHead({ ...head, partyName: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="lo_cust">จับคู่กับลูกค้าในทะเบียน</label>
              {/* ไม่บังคับ — คนที่ทักมาทางไลน์ส่วนใหญ่ยังไม่อยู่ในทะเบียน
                  จับคู่ไว้แล้วเอกสารจะได้ที่อยู่และเลขผู้เสียภาษีครบ */}
              <SearchSelect
                id="lo_cust"
                value={head.customerId}
                onChange={(v) => setHead({ ...head, customerId: v })}
                options={customers.map((c) => ({
                  value: c.id,
                  code: c.code,
                  label: c.name,
                  meta: c.province,
                  search: c.taxId + " " + c.phone,
                }))}
                emptyLabel="— ยังไม่จับคู่ —"
                notFound="ไม่พบลูกค้าที่ตรงกับ"
                disabled={!perm.edit}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="lo_status">สถานะ</label>
              <select
                className="sel"
                id="lo_status"
                value={head.status}
                disabled={!perm.edit}
                onChange={(e) => setHead({ ...head, status: e.target.value })}
              >
                {LINE_ORDER_STATUS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field span2">
              <label className="lbl" htmlFor="lo_note">หมายเหตุ (ข้อความส่วนที่ไม่ใช่การสั่งของ)</label>
              <input
                className="inp"
                id="lo_note"
                value={head.note}
                onChange={(e) => setHead({ ...head, note: e.target.value })}
                placeholder="เช่น ที่อยู่จัดส่ง เงื่อนไขการชำระ"
              />
            </div>
            <div className="field">
              <label className="lbl">ยอดรวมโดยประมาณ</label>
              <input
                className="inp num"
                readOnly
                value={"฿" + num(totals.total, 2)}
                aria-label="ยอดรวมโดยประมาณ"
              />
              <span className="hint">
                ก่อนภาษี ฿{num(totals.base, 2)} · ภาษี ฿{num(totals.vat, 2)}
              </span>
            </div>
          </div>

          <details style={{ marginBottom: 14 }}>
            <summary style={{ cursor: "pointer", fontSize: 13.5, color: "var(--fg-muted)" }}>
              ข้อความต้นฉบับจากไลน์
            </summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 12,
                marginTop: 8,
                fontSize: 13,
              }}
            >
              {order.rawText || "(ไม่มีข้อความ)"}
            </pre>
          </details>

          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th style={{ minWidth: 170 }}>ข้อความที่ลูกค้าพิมพ์</th>
                <th style={{ minWidth: 220 }}>สินค้า</th>
                <th style={{ width: 120 }}>จำนวน</th>
                <th style={{ width: 120 }}>ราคา/หน่วย</th>
                <th className="num" style={{ width: 110 }}>รวม</th>
                <th style={{ width: 150 }}>จับคู่จาก</th>
                <th style={{ width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const kind = scoreKind(l.score, l.productId);
                const hints = l.productId ? [] : suggestProducts(l.raw, db.products, 3);
                return (
                  <tr key={l.id}>
                    <td>{i + 1}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {l.raw || "—"}
                      {l.note ? (
                        <div style={{ fontSize: 11.5, color: "var(--warn)" }}>{l.note}</div>
                      ) : null}
                    </td>
                    <td>
                      <ProductSelect
                        db={db}
                        id={"lo_p_" + l.id}
                        value={l.productId}
                        onChange={(v) => pickProduct(l.id, v)}
                      />
                      {/* ระบบอ่านไม่ออก ให้เดาไว้ให้สองสามตัว กดครั้งเดียวจบ
                          ไม่ต้องเลื่อนหาในรายการสินค้าทั้งหมด */}
                      {hints.length ? (
                        <div className="row" style={{ gap: 5, marginTop: 5 }}>
                          {hints.map((h) => (
                            <button
                              key={h.product.id}
                              className="btn btn-g btn-sm"
                              disabled={!perm.edit}
                              onClick={() => pickProduct(l.id, h.product.id)}
                              title={"ใกล้เคียง " + Math.round(h.score * 100) + "%"}
                            >
                              {h.product.name}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <QtyInput
                        id={"lo_q_" + l.id}
                        value={l.qty}
                        disabled={!perm.edit}
                        onChange={(v) => setLine(l.id, { qty: v })}
                        ariaLabel="จำนวน"
                      />
                    </td>
                    <td>
                      <input
                        className="inp num"
                        type="number"
                        step="any"
                        min="0"
                        disabled={!perm.edit}
                        value={l.price === null || l.price === undefined ? "" : l.price}
                        placeholder={l.productId ? String(priceOf(l)) : ""}
                        onChange={(e) =>
                          setLine(l.id, { price: e.target.value === "" ? null : e.target.value })
                        }
                        aria-label="ราคาต่อหน่วย"
                      />
                    </td>
                    <td className="num">
                      {l.productId ? num(Number(l.qty || 0) * priceOf(l), 2) : "—"}
                    </td>
                    <td>
                      <span className={"bdg bdg-" + kind}>
                        {l.productId ? MATCH_NAME[l.matchedBy] || "ไม่ทราบ" : "อ่านไม่ออก"}
                      </span>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        {l.productId && l.raw && l.matchedBy === "pick" ? (
                          <button
                            className="btn btn-g btn-sm"
                            onClick={() => teachAlias(l)}
                            disabled={busy || !perm.edit}
                            title="จำคำนี้ไว้ ครั้งหน้าระบบจะอ่านออกเอง"
                          >
                            จำคำ
                          </button>
                        ) : null}
                        <button
                          className="btn btn-d btn-icon"
                          onClick={() => setLines((p) => p.filter((x) => x.id !== l.id))}
                          disabled={!perm.edit}
                          title="ลบบรรทัด"
                        >
                          <IcTrash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>

          <button
            className="btn btn-g btn-sm"
            style={{ marginTop: 10 }}
            disabled={!perm.edit}
            onClick={() => setLines((p) => [...p, blankLine(order.id, p.length + 1)])}
          >
            <IcPlus size={15} />
            เพิ่มบรรทัดเอง
          </button>
        </Card>
      ) : null}

      {/* ---------------------- กล่องออกใบเสนอราคา ---------------------- */}
      {quoteBox ? (
        <Modal
          title="ออกใบเสนอราคา"
          onClose={() => setQuoteBox(null)}
          maxWidth={560}
          footer={
            <>
              <button className="btn btn-g" onClick={() => setQuoteBox(null)} disabled={busy}>
                ยกเลิก
              </button>
              <button className="btn btn-p" onClick={makeQuote} disabled={busy || !perm.edit}>
                ออกใบเสนอราคา
              </button>
            </>
          }
        >
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
            <div className="field">
              <label className="lbl" htmlFor="qb_days">ยืนราคา (วัน)</label>
              <QtyInput
                id="qb_days"
                value={quoteBox.validDays}
                onChange={(v) => setQuoteBox({ ...quoteBox, validDays: v })}
                ariaLabel="จำนวนวันที่ยืนราคา"
              />
              <span className="hint">
                ถึงวันที่ {validUntil(order.date || todayISO(), quoteBox.validDays)
                  ? thDate(validUntil(order.date || todayISO(), quoteBox.validDays))
                  : "— ไม่กำหนด —"}
              </span>
            </div>
            <div className="field">
              <label className="lbl">ยอดรวม</label>
              <input className="inp num" readOnly value={"฿" + num(totals.total, 2)} aria-label="ยอดรวม" />
              <span className="hint">{priced.length} รายการ</span>
            </div>
            <div className="field span2">
              <label className="lbl" htmlFor="qb_terms">เงื่อนไขที่จะพิมพ์ในใบ</label>
              <textarea
                className="txa"
                id="qb_terms"
                rows={3}
                value={quoteBox.terms}
                onChange={(e) => setQuoteBox({ ...quoteBox, terms: e.target.value })}
              />
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
