"use client";

// ใบเสนอราคา — เสนอราคาก่อน ลูกค้าตอบรับแล้วค่อยออกใบขาย
//
// ต่างจากใบขายตรงที่ไม่ขยับสต็อกเลย จึงไม่มีคลัง ไม่มีช่องเก็บ ไม่มีการตัดของ
//   การเสนอราคาคือคำสัญญาเรื่องราคา ไม่ใช่การส่งมอบของ
//   ถ้าใบเสนอราคาจองของไว้ ของที่ยังไม่มีใครซื้อจะถูกล็อกจนขายไม่ได้
//   และใบที่ลูกค้าเงียบหายไปจะล็อกของค้างตลอดกาลโดยไม่มีใครรู้
//
// ตอนแปลงเป็นใบขาย จึงส่ง "ร่าง" ไปหน้าขายสินค้าและบริการให้เลือกคลังและช่องเก็บเอง
// ไม่ได้สร้างใบขายให้เงียบ ๆ เพราะนั่นแปลว่าตัดสต็อกจากช่องที่ไม่มีใครยืนยัน

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { VAT_PERCENT } from "@/lib/constants";
import { customerAddress, lineAmount, nextQuoteNo } from "@/lib/db";
import { putDraft } from "@/lib/handoff";
import { QUOTE_STATUS, isExpired, quoteStatusOf, quoteTotals, validUntil } from "@/lib/lineOrders";
import { num, thDate, todayISO, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { IcPlus, IcTrash } from "../Icons";
import { Badge, Card, Empty, ExportPair, PrintPair, ProductSelect, QtyInput, SearchSelect, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";
import { QUOTE_TABLES } from "./lineShared";

const blankRow = (db) => {
  const p = db.products[0];
  return {
    key: uid(),
    productId: p ? p.id : "",
    qty: "",
    price: p ? String(p.price) : "",
    discPct: "",
    discAmt: "",
    note: "",
  };
};

export default function Quotes({ onNavigate }) {
  const inv = useInv();

  // สิทธิของหน้าจอนี้ — ไม่ติ๊ก "แก้ไข" แล้วปุ่มบันทึกถูกปิด เข้ามาดูได้อย่างเดียว
  const perm = inv.perm("quote");
  const { db } = inv;
  const { user } = useAuth();
  const toast = useToast();
  const print = usePrint();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(null);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

  const quotes = db.quotes || [];
  const today = todayISO();

  const customers = useMemo(
    () => (db.customers || []).slice().sort((a, b) => a.code.localeCompare(b.code)),
    [db.customers]
  );
  const sellers = useMemo(
    () => (db.salespersons || []).filter((p) => p.active),
    [db.salespersons]
  );

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return quotes
      .filter((x) => {
        if (status && x.status !== status) return false;
        if (!s) return true;
        return (x.docNo + " " + x.custCode + " " + x.custName).toLowerCase().includes(s);
      })
      .slice()
      .sort((a, b) => b.ts - a.ts);
  }, [quotes, q, status]);

  /* ------------------------------------------------------------ ฟอร์ม */

  const cust = form ? customers.find((c) => c.id === form.customerId) || null : null;
  const filled = rows.filter((r) => r.productId && parseFloat(r.qty) > 0);
  const priced = filled.map((r) => ({ ...r, amount: lineAmount(r) }));
  const totals = form
    ? quoteTotals(priced, form.billDiscount, form.vatRate)
    : { itemsTotal: 0, billDiscount: 0, base: 0, vat: 0, total: 0 };

  function openNew() {
    setForm({
      id: uid(),
      docNo: nextQuoteNo(db, todayISO()),
      date: todayISO(),
      customerId: "",
      salesId: "",
      validDays: 30,
      vatRate: String(VAT_PERCENT),
      billDiscount: "",
      terms: "ยืนราคาตามวันที่ระบุ · ราคานี้รวมภาษีมูลค่าเพิ่มแล้ว",
      note: "",
      status: "DRAFT",
      isNew: true,
    });
    setRows([blankRow(db)]);
  }

  function openEdit(qt) {
    setForm({
      id: qt.id,
      docNo: qt.docNo,
      date: qt.date,
      customerId: qt.customerId,
      salesId: qt.salesId,
      validDays: qt.validDays,
      vatRate: String(qt.vatRate),
      billDiscount: qt.billDiscount ? String(qt.billDiscount) : "",
      terms: qt.terms,
      note: qt.note,
      status: qt.status,
      isNew: false,
    });
    setRows(
      (db.quoteItems || [])
        .filter((i) => i.quoteId === qt.id)
        .sort((a, b) => a.seq - b.seq)
        .map((i) => ({
          key: uid(),
          productId: i.productId,
          qty: String(i.qty),
          price: String(i.price),
          discPct: i.discPct ? String(i.discPct) : "",
          discAmt: i.discAmt ? String(i.discAmt) : "",
          note: i.note,
        }))
    );
  }

  const setRow = (key, patch) =>
    setRows((prev) => {
      const next = prev.map((r) => (r.key === key ? { ...r, ...patch } : r));
      const last = next[next.length - 1];
      // ต่อบรรทัดใหม่ให้เองเมื่อบรรทัดสุดท้ายกรอกครบ กติกาเดียวกับหน้าขาย
      if (last.productId && parseFloat(last.qty) > 0) next.push(blankRow(db));
      return next;
    });

  /** เลือกสินค้าแล้วเติมราคาจากทะเบียนให้ ถ้ายังไม่ได้กรอกราคาเอง */
  const pickProduct = (key, productId) => {
    const p = inv.prod(productId);
    setRows((prev) =>
      prev.map((r) =>
        r.key === key
          ? { ...r, productId, price: r.price && parseFloat(r.price) > 0 ? r.price : String(p ? p.price : 0) }
          : r
      )
    );
  };

  async function save() {
    if (busy || !form) return;
    if (!priced.length) return toast("ยังไม่มีรายการสินค้าในใบนี้", "err");
    if (!form.date) return toast("กรุณาเลือกวันที่", "err");

    const dup = quotes.find((x) => x.id !== form.id && x.docNo === form.docNo);
    if (dup) return toast("เลขที่ " + form.docNo + " ถูกใช้ไปแล้ว", "err");

    const seller = sellers.find((p) => p.id === form.salesId) || null;
    const quote = {
      id: form.id,
      docNo: form.docNo,
      date: form.date,
      customerId: form.customerId || "",
      custCode: cust ? cust.code : "",
      custName: cust ? cust.name : "",
      custAddress: cust ? customerAddress(cust) : "",
      custProvince: cust ? cust.province : "",
      custTaxId: cust ? cust.taxId || "" : "",
      custBranch: cust ? cust.branch || "" : "",
      custKind: cust ? cust.kind || "" : "",
      salesId: form.salesId || "",
      salesCode: seller ? seller.code : "",
      salesName: seller ? seller.name : "",
      validDays: Number(form.validDays) || 0,
      validTo: validUntil(form.date, form.validDays),
      terms: form.terms || "",
      vatRate: Number(form.vatRate) || 0,
      itemsTotal: totals.itemsTotal,
      billDiscount: totals.billDiscount,
      base: totals.base,
      vat: totals.vat,
      total: totals.total,
      note: form.note || "",
      status: form.status || "DRAFT",
      invoiceId: "",
      user: (user && user.email) || "",
      ts: Date.now(),
    };

    const items = priced.map((r, i) => ({
      id: uid(),
      quoteId: form.id,
      productId: r.productId,
      qty: Number(r.qty) || 0,
      price: Number(r.price) || 0,
      discPct: Number(r.discPct) || 0,
      discAmt: Number(r.discAmt) || 0,
      amount: r.amount,
      note: r.note || "",
      seq: i + 1,
    }));

    setBusy(true);
    try {
      await inv.saveQuote(quote, items);
      toast("บันทึกใบเสนอราคา " + quote.docNo + " แล้ว", "ok");
      setForm(null);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function setStatusOf(qt, next) {
    if (busy) return;
    setBusy(true);
    try {
      const items = (db.quoteItems || []).filter((i) => i.quoteId === qt.id);
      await inv.saveQuote({ ...qt, status: next }, items);
      toast("เปลี่ยนสถานะเป็น " + quoteStatusOf(next).name + " แล้ว", "ok");
    } catch (e) {
      toast("เปลี่ยนสถานะไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove(qt) {
    if (busy) return;
    if (qt.invoiceId) return toast("ใบนี้ออกใบขายไปแล้ว ลบไม่ได้", "err");
    if (!window.confirm("ยืนยันการลบใบเสนอราคา " + qt.docNo + " ?")) return;
    setBusy(true);
    try {
      await inv.removeQuote(qt.id);
      toast("ลบใบเสนอราคาแล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  /** ส่งร่างไปหน้าขาย — ไม่สร้างใบขายเอง เพราะต้องเลือกคลังและช่องเก็บก่อน */
  function toInvoice(qt) {
    const items = (db.quoteItems || []).filter((i) => i.quoteId === qt.id).sort((a, b) => a.seq - b.seq);
    if (!items.length) return toast("ใบนี้ไม่มีรายการสินค้า", "err");

    putDraft("invoice", {
      from: "quote",
      code: qt.docNo,
      customerId: qt.customerId || "",
      note: "อ้างถึงใบเสนอราคา " + qt.docNo,
      lines: items.map((i) => ({
        productId: i.productId,
        qty: i.qty,
        price: i.price,
        discPct: i.discPct,
        discAmt: i.discAmt,
      })),
    });
    toast("ส่งรายการไปหน้าขายแล้ว — เลือกคลังและช่องเก็บให้ครบก่อนบันทึก", "info");
    if (onNavigate) onNavigate("invoice");
  }

  function printQuote(qt) {
    const items = (db.quoteItems || []).filter((i) => i.quoteId === qt.id).sort((a, b) => a.seq - b.seq);
    print({
      title: "ใบเสนอราคา / QUOTATION",
      subtitle: qt.docNo + " · " + thDate(qt.date),
      body: (
        <>
          <table style={{ marginBottom: 14 }}>
            <tbody>
              <tr>
                <td style={{ width: "50%", verticalAlign: "top" }}>
                  <b>เรียน</b>
                  <div>{qt.custName || "—"}</div>
                  <div>{qt.custAddress}</div>
                  {qt.custTaxId ? <div>เลขประจำตัวผู้เสียภาษี {qt.custTaxId}</div> : null}
                </td>
                <td style={{ verticalAlign: "top" }}>
                  <div>เลขที่ {qt.docNo}</div>
                  <div>วันที่ {thDate(qt.date)}</div>
                  {qt.validTo ? <div>ยืนราคาถึง {thDate(qt.validTo)}</div> : null}
                  {qt.salesName ? <div>พนักงานขาย {qt.salesName}</div> : null}
                </td>
              </tr>
            </tbody>
          </table>

          <table>
            <thead>
              <tr>
                <th>ลำดับ</th>
                <th>รายการ</th>
                <th style={{ textAlign: "right" }}>จำนวน</th>
                <th style={{ textAlign: "right" }}>ราคา/หน่วย</th>
                <th style={{ textAlign: "right" }}>จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i, n) => (
                <tr key={i.id}>
                  <td>{n + 1}</td>
                  <td>{inv.prodName(i.productId)}</td>
                  <td style={{ textAlign: "right" }}>{num(i.qty, 0)}</td>
                  <td style={{ textAlign: "right" }}>{num(i.price, 2)}</td>
                  <td style={{ textAlign: "right" }}>{num(i.amount, 2)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} style={{ textAlign: "right" }}>รวมเป็นเงิน</td>
                <td style={{ textAlign: "right" }}>{num(qt.itemsTotal, 2)}</td>
              </tr>
              {qt.billDiscount ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "right" }}>ส่วนลดท้ายบิล</td>
                  <td style={{ textAlign: "right" }}>{num(qt.billDiscount, 2)}</td>
                </tr>
              ) : null}
              <tr>
                <td colSpan={4} style={{ textAlign: "right" }}>ภาษีมูลค่าเพิ่ม {num(qt.vatRate, 0)}%</td>
                <td style={{ textAlign: "right" }}>{num(qt.vat, 2)}</td>
              </tr>
              <tr>
                <td colSpan={4} style={{ textAlign: "right" }}><b>จำนวนเงินรวมทั้งสิ้น</b></td>
                <td style={{ textAlign: "right" }}><b>{num(qt.total, 2)}</b></td>
              </tr>
            </tbody>
          </table>

          {qt.terms ? <p style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{qt.terms}</p> : null}
          {qt.note ? <p style={{ whiteSpace: "pre-wrap" }}>หมายเหตุ: {qt.note}</p> : null}
        </>
      ),
    });
  }

  if (!inv.quotesReady) {
    return <SetupNotice feature="ใบเสนอราคา" tables={QUOTE_TABLES} />;
  }

  return (
    <div className="stack">
      <Card
        title="ใบเสนอราคา"
        actions={
          <>
            <Badge kind="info">{num(list.length, 0)} ใบ</Badge>
            <ExportPair
              disabled={!list.length}
              toast={toast}
              onExport={(save2) =>
                save2(
                  ["เลขที่", "วันที่", "รหัสลูกค้า", "ลูกค้า", "ยืนราคาถึง", "ก่อนภาษี", "ภาษี", "รวมทั้งสิ้น", "สถานะ"],
                  list.map((x) => [
                    x.docNo, x.date, x.custCode, x.custName, x.validTo,
                    x.base, x.vat, x.total, quoteStatusOf(x.status).name,
                  ]),
                  "ใบเสนอราคา.csv"
                )
              }
            />
            <button className="btn btn-p btn-sm" onClick={openNew} disabled={!perm.edit}>
              <IcPlus size={15} />
              ออกใบเสนอราคา
            </button>
          </>
        }
      >
        <div className="row" style={{ marginBottom: 12 }}>
          <input
            className="inp"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาเลขที่ รหัสลูกค้า หรือชื่อลูกค้า…"
            aria-label="ค้นหาใบเสนอราคา"
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
            {QUOTE_STATUS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {list.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 130 }}>เลขที่</th>
                <th style={{ width: 110 }}>วันที่</th>
                <th style={{ minWidth: 190 }}>ลูกค้า</th>
                <th style={{ width: 120 }}>ยืนราคาถึง</th>
                <th className="num">รวมทั้งสิ้น</th>
                <th style={{ width: 150 }}>สถานะ</th>
                <th style={{ width: 260 }} />
              </tr>
            </thead>
            <tbody>
              {list.map((x) => {
                const st = quoteStatusOf(x.status);
                const expired = isExpired(x, today);
                return (
                  <tr key={x.id}>
                    <td className="code-cell">{x.docNo}</td>
                    <td>{thDate(x.date)}</td>
                    <td>
                      <b>{x.custName || "—"}</b>
                      {x.custCode ? (
                        <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>{x.custCode}</div>
                      ) : null}
                    </td>
                    <td style={{ color: expired ? "var(--err)" : "" }}>
                      {x.validTo ? thDate(x.validTo) : "—"}
                      {expired ? <div style={{ fontSize: 11.5 }}>หมดอายุแล้ว</div> : null}
                    </td>
                    <td className="num">
                      <b>{num(x.total, 2)}</b>
                    </td>
                    <td>
                      <span className={"bdg " + st.badge}>{st.name}</span>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <button className="btn btn-o btn-sm" onClick={() => openEdit(x)}>
                          แก้ไข
                        </button>
                        <PrintPair onPrint={() => printQuote(x)} toast={toast} label="พิมพ์" />
                        <button
                          className="btn btn-p btn-sm"
                          onClick={() => toInvoice(x)}
                          disabled={!perm.edit || x.status === "REJECTED"}
                          title="ส่งรายการไปหน้าขายสินค้าและบริการ"
                        >
                          ออกใบขาย
                        </button>
                        <select
                          className="sel"
                          style={{ maxWidth: 130 }}
                          value={x.status}
                          disabled={busy || !perm.edit}
                          onChange={(e) => setStatusOf(x, e.target.value)}
                          aria-label={"เปลี่ยนสถานะของ " + x.docNo}
                        >
                          {QUOTE_STATUS.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn btn-d btn-icon"
                          onClick={() => remove(x)}
                          disabled={busy || !perm.edit || !!x.invoiceId}
                          title="ลบใบเสนอราคา"
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
            {quotes.length
              ? "ไม่พบใบเสนอราคาที่ตรงกับเงื่อนไข"
              : "ยังไม่มีใบเสนอราคา กดปุ่ม “ออกใบเสนอราคา” เพื่อเริ่มต้น"}
          </Empty>
        )}
      </Card>

      {/* ---------------------------- ฟอร์มออก/แก้ใบ ---------------------------- */}
      {form ? (
        <Card
          title={(form.isNew ? "ออกใบเสนอราคา " : "แก้ไขใบเสนอราคา ") + form.docNo}
          actions={
            <>
              <button className="btn btn-g btn-sm" onClick={() => setForm(null)} disabled={busy}>
                ยกเลิก
              </button>
              <button className="btn btn-p btn-sm" onClick={save} disabled={busy || !perm.edit}>
                {busy ? "กำลังบันทึก…" : "บันทึกใบเสนอราคา"}
              </button>
            </>
          }
        >
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label className="lbl" htmlFor="qf_date">วันที่</label>
              <input
                className="inp"
                type="date"
                id="qf_date"
                value={form.date}
                disabled={!perm.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="qf_doc">เลขที่</label>
              <input className="inp" id="qf_doc" value={form.docNo} readOnly />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="qf_cust">รหัสลูกค้า</label>
              <SearchSelect
                id="qf_cust"
                value={form.customerId}
                onChange={(v) => setForm({ ...form, customerId: v })}
                options={customers.map((c) => ({
                  value: c.id,
                  code: c.code,
                  label: c.name,
                  meta: c.province,
                  search: c.taxId + " " + c.phone,
                }))}
                emptyLabel="— ยังไม่ระบุ —"
                notFound="ไม่พบลูกค้าที่ตรงกับ"
                disabled={!perm.edit}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="qf_sales">พนักงานขาย</label>
              <SearchSelect
                id="qf_sales"
                value={form.salesId}
                onChange={(v) => setForm({ ...form, salesId: v })}
                options={sellers.map((p) => ({ value: p.id, code: p.code, label: p.name }))}
                emptyLabel="— ไม่ระบุ —"
                notFound="ไม่พบพนักงานขายที่ตรงกับ"
                disabled={!perm.edit}
              />
            </div>

            <div className="field">
              <label className="lbl" htmlFor="qf_valid">ยืนราคา (วัน)</label>
              <QtyInput
                id="qf_valid"
                value={form.validDays}
                disabled={!perm.edit}
                onChange={(v) => setForm({ ...form, validDays: v })}
                ariaLabel="จำนวนวันที่ยืนราคา"
              />
              <span className="hint">
                {validUntil(form.date, form.validDays)
                  ? "ถึง " + thDate(validUntil(form.date, form.validDays))
                  : "ไม่กำหนดวันหมดอายุ"}
              </span>
            </div>
            <div className="field">
              <label className="lbl" htmlFor="qf_vat">อัตราภาษี (%)</label>
              <input
                className="inp num"
                type="number"
                step="any"
                id="qf_vat"
                value={form.vatRate}
                disabled={!perm.edit}
                onChange={(e) => setForm({ ...form, vatRate: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="qf_disc">ส่วนลดท้ายบิล (บาท)</label>
              <input
                className="inp num"
                type="number"
                step="any"
                min="0"
                id="qf_disc"
                value={form.billDiscount}
                disabled={!perm.edit}
                onChange={(e) => setForm({ ...form, billDiscount: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="qf_status">สถานะ</label>
              <select
                className="sel"
                id="qf_status"
                value={form.status}
                disabled={!perm.edit}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {QUOTE_STATUS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field span2">
              <label className="lbl" htmlFor="qf_terms">เงื่อนไขที่จะพิมพ์ในใบ</label>
              <textarea
                className="txa"
                id="qf_terms"
                rows={2}
                value={form.terms}
                disabled={!perm.edit}
                onChange={(e) => setForm({ ...form, terms: e.target.value })}
              />
            </div>
            <div className="field span2">
              <label className="lbl" htmlFor="qf_note">หมายเหตุ</label>
              <textarea
                className="txa"
                id="qf_note"
                rows={2}
                value={form.note}
                disabled={!perm.edit}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
          </div>

          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th style={{ minWidth: 230 }}>สินค้า</th>
                <th style={{ width: 120 }}>จำนวน</th>
                <th style={{ width: 120 }}>ราคา/หน่วย</th>
                <th style={{ width: 90 }}>ลด %</th>
                <th style={{ width: 110 }}>ลดบาท</th>
                <th className="num" style={{ width: 120 }}>จำนวนเงิน</th>
                <th style={{ width: 50 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key}>
                  <td>{i + 1}</td>
                  <td>
                    <ProductSelect
                      db={db}
                      id={"qf_p_" + r.key}
                      value={r.productId}
                      onChange={(v) => pickProduct(r.key, v)}
                    />
                  </td>
                  <td>
                    <QtyInput
                      id={"qf_q_" + r.key}
                      value={r.qty}
                      disabled={!perm.edit}
                      onChange={(v) => setRow(r.key, { qty: v })}
                      ariaLabel="จำนวน"
                    />
                  </td>
                  <td>
                    <input
                      className="inp num"
                      type="number"
                      step="any"
                      min="0"
                      value={r.price}
                      disabled={!perm.edit}
                      onChange={(e) => setRow(r.key, { price: e.target.value })}
                      aria-label="ราคาต่อหน่วย"
                    />
                  </td>
                  <td>
                    <input
                      className="inp num"
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      value={r.discPct}
                      disabled={!perm.edit}
                      onChange={(e) => setRow(r.key, { discPct: e.target.value })}
                      aria-label="ส่วนลดเป็นเปอร์เซ็นต์"
                    />
                  </td>
                  <td>
                    <input
                      className="inp num"
                      type="number"
                      step="any"
                      min="0"
                      value={r.discAmt}
                      disabled={!perm.edit}
                      onChange={(e) => setRow(r.key, { discAmt: e.target.value })}
                      aria-label="ส่วนลดเป็นจำนวนเงิน"
                    />
                  </td>
                  <td className="num">{num(lineAmount(r), 2)}</td>
                  <td>
                    <button
                      className="btn btn-d btn-icon"
                      onClick={() => setRows((p) => (p.length > 1 ? p.filter((x) => x.key !== r.key) : p))}
                      disabled={!perm.edit}
                      title="ลบบรรทัด"
                    >
                      <IcTrash size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}>
                  <b>รวมทั้งสิ้น (รวมภาษี {num(Number(form.vatRate) || 0, 0)}%)</b>
                </td>
                <td className="num">
                  <b>{num(totals.total, 2)}</b>
                </td>
                <td />
              </tr>
            </tfoot>
          </TableWrap>

          <p className="hint" style={{ marginBottom: 0 }}>
            ก่อนภาษี ฿{num(totals.base, 2)} · ภาษี ฿{num(totals.vat, 2)} ·
            ใบเสนอราคาไม่ตัดสต็อก การตัดของเกิดตอนออกใบขายเท่านั้น
          </p>
        </Card>
      ) : null}
    </div>
  );
}
