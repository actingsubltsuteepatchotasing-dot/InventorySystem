"use client";

// หน้าจอขายสินค้าและบริการ (ออกใบกำกับภาษีเต็มรูปแบบ)
//
// ต่างจากหน้า POS ตรงที่:
//   POS  = ขายหน้าร้าน จบที่เคาน์เตอร์ รับเงินทันที ใบเสร็จอย่างย่อ
//   หน้านี้ = ขายเป็นเอกสาร เลือกลูกค้าจากทะเบียน มีส่วนลดรายบรรทัดและท้ายบิล
//            อัตราภาษีปรับได้ ออกใบกำกับภาษีเต็มรูปแบบ และส่งต่อไปหน้าจัดส่ง
//
// ตารางสินค้าใช้โครงเดียวกับหน้ารับ/เบิก/โอน (เลือกสินค้า คลัง ที่เก็บ จำนวน)
// เพิ่มมาสามคอลัมน์คือ ราคาต่อหน่วย ส่วนลดการค้า และรวมเงิน

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { SHIP_STATUS, VAT_PERCENT } from "@/lib/constants";
import {
  customerAddress,
  defaultBinOf,
  firstLocOf,
  invoiceTotals,
  lineAmount,
  nextDocNo,
} from "@/lib/db";
import { num, thDate, todayISO, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { IcPlus, IcTrash } from "../Icons";
import {
  Badge,
  Card,
  Empty,
  LocationSelect,
  ProductSelect,
  QtyInput,
  TableWrap,
  WarehouseSelect,
} from "../ui";
import SetupNotice from "../SetupNotice";
import { TaxInvoiceBody } from "./printBodies";

const shipOf = (id) => SHIP_STATUS.find((s) => s.id === id) || SHIP_STATUS[0];

export default function SalesInvoice() {
  const inv = useInv();

  /*
   * สิทธิของหน้าจอนี้ — ไม่ติ๊ก "แก้ไข" แล้วปุ่มบันทึกถูกปิด เข้ามาดูได้อย่างเดียว
   * ไม่ติ๊ก "เปลี่ยนวันที่" แล้วช่องวันที่ล็อกไว้ (ดูหน้ากำหนดสิทธิการใช้งาน)
   */
  const perm = inv.perm("invoice");
  const { db } = inv;
  const { user } = useAuth();
  const toast = useToast();
  const print = usePrint();

  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(todayISO);
  const [custId, setCustId] = useState("");
  const [vatRate, setVatRate] = useState(String(VAT_PERCENT));
  const [billDiscount, setBillDiscount] = useState("");
  const [note, setNote] = useState("");

  const customers = useMemo(
    () => (db.customers || []).slice().sort((a, b) => a.code.localeCompare(b.code)),
    [db.customers]
  );

  const cust = customers.find((c) => c.id === custId) || null;

  /**
   * หนึ่งบรรทัด = สินค้าหนึ่งรายการที่ขาย
   * เก็บเฉพาะสิ่งที่ผู้ใช้กรอก ส่วนรวมเงินคำนวณสดตอนแสดงผลจาก lineAmount
   */
  function blankRow(from) {
    const pid = db.products[0] ? db.products[0].id : "";
    const def = defaultBinOf(db, pid);
    const whId = from ? from.whId : def ? def.whId : db.warehouses[0].id;
    const p = db.products.find((x) => x.id === pid);

    return {
      key: uid(),
      productId: pid,
      whId,
      locId: from ? from.locId : def ? def.locId : firstLocOf(db, whId),
      qty: "",
      price: p ? String(p.price) : "",
      discPct: "",
      discAmt: "",
    };
  }

  const [rows, setRows] = useState(() => [blankRow()]);

  const isFilled = (r) => !!r.productId && parseFloat(r.qty) > 0;

  /** แก้ค่าในบรรทัด แล้วต่อบรรทัดใหม่ให้เองเมื่อบรรทัดสุดท้ายกรอกครบ */
  function setRow(key, patch) {
    setRows((prev) => {
      const next = prev.map((r) => (r.key === key ? { ...r, ...patch } : r));
      const last = next[next.length - 1];
      if (isFilled(last)) next.push(blankRow(last));
      return next;
    });
  }

  const addRow = () =>
    setRows((prev) => [...prev, blankRow(prev.length ? prev[prev.length - 1] : null)]);

  const dropRow = (key) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : [blankRow()]));

  /** เลือกสินค้าแล้วดึงราคาขายกับคลัง/ที่เก็บประจำของสินค้ามาให้ */
  function pickProduct(key, id) {
    const p = db.products.find((x) => x.id === id);
    const def = defaultBinOf(db, id);
    setRow(key, {
      productId: id,
      price: p ? String(p.price) : "",
      ...(def ? { whId: def.whId, locId: def.locId } : {}),
    });
  }

  const docNo = nextDocNo(db, "INVOICE", date);
  const filled = rows.filter(isFilled);

  const lines = filled.map((r) => ({
    qty: parseFloat(r.qty) || 0,
    price: parseFloat(r.price) || 0,
    discPct: parseFloat(r.discPct) || 0,
    discAmt: parseFloat(r.discAmt) || 0,
  }));

  const totals = invoiceTotals(lines, parseFloat(billDiscount) || 0, parseFloat(vatRate) || 0);

  /**
   * ของในช่องเก็บที่ยังหยิบได้สำหรับบรรทัดนี้
   * หักของที่บรรทัดอื่นในตารางเดียวกันจองไว้แล้ว ไม่งั้นสองบรรทัดจะดูเหมือนพอทั้งคู่
   */
  function availableFor(r) {
    const inBin = inv.placedIn(r.productId, r.locId);
    const taken = rows
      .filter((x) => x.key !== r.key && x.productId === r.productId && x.locId === r.locId)
      .reduce((sum, x) => sum + (parseFloat(x.qty) || 0), 0);
    return inBin - taken;
  }

  function clearAll() {
    setRows([blankRow()]);
    setBillDiscount("");
    setNote("");
  }

  async function saveDoc() {
    if (saving) return;
    if (!cust) return toast("กรุณาเลือกรหัสลูกค้าก่อน", "err");
    if (!filled.length) {
      return toast("ยังไม่มีบรรทัดที่กรอกครบ — เลือกสินค้าและใส่จำนวนก่อน", "warn");
    }

    // ตรวจทั้งตารางก่อน แล้วค่อยบอกข้อแรกที่เจอ
    const problems = [];
    filled.forEach((r) => {
      const at = "บรรทัดที่ " + (rows.indexOf(r) + 1);
      const err = inv.checkWhLoc(r.whId, r.locId, "คลังสินค้า");
      if (err) return problems.push(at + ": " + err);
      if (!(parseFloat(r.price) >= 0)) problems.push(at + ": กรุณาใส่ราคาต่อหน่วย");
    });

    // ของไม่พอ ตรวจรวมทั้งตารางต่อคู่ (สินค้า, ที่เก็บ)
    const wanted = new Map();
    filled.forEach((r) => {
      const k = r.productId + "|" + r.locId;
      wanted.set(k, (wanted.get(k) || 0) + parseFloat(r.qty));
    });
    wanted.forEach((need, k) => {
      const cut = k.indexOf("|");
      const pid = k.slice(0, cut);
      const lid = k.slice(cut + 1);
      const have = inv.placedIn(pid, lid);
      if (need > have) {
        problems.push(
          "ของใน " + inv.locName(lid) + " ไม่พอสำหรับ " + inv.prodName(pid) +
            " (มี " + num(have, 0) + " ต้องการ " + num(need, 0) + ")"
        );
      }
    });

    if (problems.length) return toast(problems[0], "err");

    const id = uid();
    const ts = new Date(date + "T09:00:00").getTime();

    /*
     * คัดลอกชื่อ/ที่อยู่/เลขผู้เสียภาษีของลูกค้ามาเก็บในใบ
     * เอกสารภาษีต้องคงข้อความเดิม ณ วันที่ออก ถ้าอ่านสดจากทะเบียน
     * วันหนึ่งลูกค้าย้ายที่อยู่ ใบเก่าทั้งหมดจะเปลี่ยนตามไปด้วย
     */
    const invoice = {
      id,
      docNo,
      date,
      customerId: cust.id,
      custCode: cust.code,
      custName: cust.name,
      custAddress: customerAddress(cust),
      // จังหวัดเก็บแยกด้วย เพราะหน้าสถานะการจัดส่งกรองรายจังหวัด
      // แกะจากสตริงที่อยู่ทีหลังไม่ได้ ชื่อจังหวัดมีเว้นวรรคและคำนำหน้าไม่คงที่
      custProvince: cust.province || "",
      custTaxId: cust.taxId || "",
      custBranch: cust.branch || "",
      vatRate: totals.rate,
      itemsTotal: totals.itemsTotal,
      billDiscount: totals.discount,
      base: totals.base,
      vat: totals.vat,
      total: totals.total,
      note: note.trim(),
      shipStatus: "PACKING",
      shipFrom: filled[0].whId,
      shipNote: "",
      shipTs: 0,
      user: user && user.email ? user.email : "",
      ts,
    };

    const items = filled.map((r, i) => ({
      id: uid(),
      txnId: uid(),
      invoiceId: id,
      productId: r.productId,
      whId: r.whId,
      locId: r.locId,
      qty: parseFloat(r.qty),
      price: parseFloat(r.price) || 0,
      discPct: parseFloat(r.discPct) || 0,
      discAmt: parseFloat(r.discAmt) || 0,
      amount: lineAmount({
        qty: r.qty,
        price: r.price,
        discPct: r.discPct,
        discAmt: r.discAmt,
      }),
      seq: i + 1,
    }));

    setSaving(true);
    try {
      await inv.addInvoice(invoice, items);
      toast("บันทึกใบขาย " + docNo + " (" + items.length + " รายการ) เรียบร้อย");
      clearAll();
      printInvoice(invoice, items);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setSaving(false);
    }
  }

  function printInvoice(invoice, items) {
    // bare = ไม่ใส่หัวกระดาษมาตรฐานของโปรแกรม เพราะใบกำกับภาษีต้องขึ้นชื่อกิจการผู้ออก
    print({
      bare: true,
      body: <TaxInvoiceBody inv={inv} company={db.company} invoice={invoice} items={items} />,
    });
  }

  const recent = useMemo(
    () => (db.invoices || []).slice().sort((a, b) => b.ts - a.ts).slice(0, 12),
    [db.invoices]
  );

  if (!inv.invoicesReady) {
    return (
      <SetupNotice
        feature="หน้าจอขายสินค้าและบริการ"
        tables={["invoices", "invoice_items", "company", "customers"]}
      />
    );
  }

  if (!customers.length) {
    return (
      <Card title="ขายสินค้าและบริการ">
        <Empty>
          ยังไม่มีข้อมูลลูกค้า — ใบกำกับภาษีต้องระบุผู้ซื้อ
          ให้ไปเพิ่มลูกค้าที่เมนู “รายละเอียดลูกค้า” ก่อน
        </Empty>
      </Card>
    );
  }

  return (
    <div className="stack">
      <Card
        title="บันทึกการขายสินค้าและบริการ"
        actions={
          <>
            <Badge>เลขที่ {docNo}</Badge>
            <Badge kind={filled.length ? "info" : "gray"}>
              {filled.length} รายการ · สุทธิ ฿{num(totals.total, 2)}
            </Badge>
            <button className="btn btn-o btn-sm" onClick={addRow} disabled={saving}>
              <IcPlus size={15} />
              เพิ่มบรรทัด
            </button>
            <button
              className="btn btn-p btn-sm"
              onClick={saveDoc}
              disabled={saving || !filled.length || !perm.edit}
            >
              {saving ? "กำลังบันทึก…" : "บันทึกและพิมพ์"}
            </button>
            <button className="btn btn-g btn-sm" onClick={clearAll} disabled={saving}>
              ล้างตาราง
            </button>
          </>
        }
      >
        <div className="form-grid" style={{ marginBottom: 16 }}>
          <div className="field">
            <label className="lbl" htmlFor="iv_date">วันที่เอกสาร</label>
            <input
              className="inp"
              type="date"
              id="iv_date"
              value={date}
              disabled={!perm.date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="iv_doc">เลขที่เอกสาร</label>
            <input className="inp" id="iv_doc" value={docNo} readOnly />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="iv_cust">รหัสลูกค้า</label>
            <select
              className="sel"
              id="iv_cust"
              value={custId}
              onChange={(e) => setCustId(e.target.value)}
            >
              <option value="">— เลือกรหัสลูกค้า —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            {/* ชื่อมาจากรหัสที่เลือกเสมอ พิมพ์ทับเองไม่ได้ ไม่งั้นชื่อกับรหัสจะไม่ตรงกัน */}
            <label className="lbl" htmlFor="iv_cname">ชื่อลูกค้า</label>
            <input className="inp" id="iv_cname" value={cust ? cust.name : ""} readOnly />
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="iv_caddr">ที่อยู่ผู้ซื้อ</label>
            <input
              className="inp"
              id="iv_caddr"
              value={cust ? customerAddress(cust) : ""}
              readOnly
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="iv_ctax">เลขประจำตัวผู้เสียภาษีผู้ซื้อ</label>
            <input
              className="inp"
              id="iv_ctax"
              value={cust ? cust.taxId || "" : ""}
              readOnly
              placeholder={cust ? "ยังไม่ได้กรอกในทะเบียนลูกค้า" : ""}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="iv_vat">อัตราภาษีมูลค่าเพิ่ม (%)</label>
            <input
              className="inp num"
              id="iv_vat"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
            />
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="iv_note">หมายเหตุ</label>
            <input
              className="inp"
              id="iv_note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น เงื่อนไขการชำระเงิน 30 วัน"
            />
          </div>
        </div>

        <TableWrap>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th style={{ minWidth: 200 }}>สินค้า</th>
              <th style={{ minWidth: 160 }}>คลังสินค้า</th>
              <th style={{ minWidth: 160 }}>ที่เก็บสินค้า</th>
              <th className="num" style={{ width: 160 }}>จำนวน</th>
              <th className="num" style={{ width: 108 }}>ราคา/หน่วย</th>
              <th className="num" style={{ width: 84 }}>ส่วนลด %</th>
              <th className="num" style={{ width: 100 }}>ส่วนลด บาท</th>
              <th className="num" style={{ width: 116 }}>รวมเงิน</th>
              <th style={{ width: 48 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const p = inv.prod(r.productId);
              const avail = availableFor(r);
              const over = parseFloat(r.qty) > avail;
              const amount = lineAmount(r);
              return (
                <tr key={r.key}>
                  <td>{i + 1}</td>

                  <td>
                    <ProductSelect
                      db={db}
                      id={"iv_prod_" + r.key}
                      value={r.productId}
                      onChange={(v) => pickProduct(r.key, v)}
                    />
                  </td>

                  <td>
                    <WarehouseSelect
                      db={db}
                      id={"iv_wh_" + r.key}
                      value={r.whId}
                      onChange={(w) => setRow(r.key, { whId: w, locId: firstLocOf(db, w) })}
                    />
                  </td>

                  <td>
                    <LocationSelect
                      db={db}
                      whId={r.whId}
                      id={"iv_loc_" + r.key}
                      value={r.locId}
                      onChange={(l) => setRow(r.key, { locId: l })}
                    />
                  </td>

                  <td className="num">
                    <QtyInput
                      value={r.qty}
                      onChange={(v) => setRow(r.key, { qty: v })}
                      disabled={saving}
                      ariaLabel={"จำนวนของบรรทัดที่ " + (i + 1)}
                    />
                    <div
                      style={{
                        fontSize: 11.5,
                        color: over ? "var(--err)" : "var(--fg-faint)",
                        fontWeight: over ? 700 : 400,
                      }}
                    >
                      {r.productId
                        ? "หยิบได้ " + num(avail, 0) + (p ? " " + p.unit : "")
                        : ""}
                    </div>
                  </td>

                  <td className="num">
                    {/* ช่องจำนวนเงินไม่มีปุ่มลบ/บวก เพราะกดทีละบาทไม่ได้ช่วยอะไร */}
                    <input
                      className="inp num"
                      type="number"
                      min={0}
                      step="0.01"
                      value={r.price}
                      onChange={(e) => setRow(r.key, { price: e.target.value })}
                      aria-label={"ราคาต่อหน่วยของบรรทัดที่ " + (i + 1)}
                    />
                  </td>

                  <td className="num">
                    <input
                      className="inp num"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={r.discPct}
                      placeholder="0"
                      onChange={(e) => setRow(r.key, { discPct: e.target.value })}
                      aria-label={"ส่วนลดเปอร์เซ็นต์ของบรรทัดที่ " + (i + 1)}
                    />
                  </td>

                  <td className="num">
                    <input
                      className="inp num"
                      type="number"
                      min={0}
                      step="0.01"
                      value={r.discAmt}
                      placeholder="0"
                      onChange={(e) => setRow(r.key, { discAmt: e.target.value })}
                      aria-label={"ส่วนลดเป็นจำนวนเงินของบรรทัดที่ " + (i + 1)}
                    />
                  </td>

                  <td className="num">
                    <b>{isFilled(r) ? num(amount, 2) : "—"}</b>
                  </td>

                  <td>
                    <button
                      className="btn btn-d btn-icon"
                      onClick={() => dropRow(r.key)}
                      disabled={saving}
                      title="ลบบรรทัดนี้"
                      aria-label={"ลบบรรทัดที่ " + (i + 1)}
                    >
                      <IcTrash size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>

        {/* ---------------------------------------------------- ยอดท้ายบิล */}
        <div className="inv-sum">
          <div className="inv-sum-row">
            <span>รวมเงิน</span>
            <b>{num(totals.itemsTotal, 2)}</b>
          </div>
          <div className="inv-sum-row">
            <label className="lbl" htmlFor="iv_bdisc">ส่วนลดท้ายบิล</label>
            <input
              className="inp num"
              id="iv_bdisc"
              type="number"
              min={0}
              step="0.01"
              value={billDiscount}
              placeholder="0"
              onChange={(e) => setBillDiscount(e.target.value)}
            />
          </div>
          <div className="inv-sum-row">
            <span>ยอดก่อนภาษี</span>
            <b>{num(totals.base, 2)}</b>
          </div>
          <div className="inv-sum-row">
            <span>ภาษีมูลค่าเพิ่ม {num(totals.rate, 2)}%</span>
            <b>{num(totals.vat, 2)}</b>
          </div>
          <div className="inv-sum-row grand">
            <span>ยอดสุทธิ</span>
            <b>฿{num(totals.total, 2)}</b>
          </div>
        </div>
      </Card>

      <Card
        title="ใบขายล่าสุด"
        actions={<Badge>{(db.invoices || []).length} ใบ</Badge>}
      >
        {recent.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>เลขที่เอกสาร</th>
                <th style={{ width: 120 }}>วันที่</th>
                <th style={{ width: 90 }}>รหัสลูกค้า</th>
                <th style={{ minWidth: 200 }}>ชื่อลูกค้า</th>
                <th className="num" style={{ width: 110 }}>ยอดสุทธิ</th>
                <th style={{ width: 140 }}>สถานะจัดส่ง</th>
                <th style={{ width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {recent.map((v) => {
                const st = shipOf(v.shipStatus);
                return (
                  <tr key={v.id}>
                    <td className="code-cell">{v.docNo}</td>
                    <td>{thDate(v.date)}</td>
                    <td>{v.custCode}</td>
                    <td>{v.custName}</td>
                    <td className="num">
                      <b>{num(v.total, 2)}</b>
                    </td>
                    <td>
                      <Badge kind={st.kind}>{st.name}</Badge>
                    </td>
                    <td>
                      <button
                        className="btn btn-o btn-sm"
                        onClick={() => printInvoice(v, inv.itemsOfInvoice(v.id))}
                      >
                        พิมพ์ซ้ำ
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>ยังไม่มีใบขาย — กรอกตารางด้านบนแล้วกด “บันทึกและพิมพ์”</Empty>
        )}
      </Card>
    </div>
  );
}
