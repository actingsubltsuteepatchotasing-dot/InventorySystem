"use client";

// หน้าจอซื้อสินค้าและบริการ — ด้านกลับของหน้าขายสินค้าและบริการ
//
//   ขายสินค้าและบริการ  เลือกลูกค้า  ตัดสต็อกออก  ออกใบกำกับภาษีให้ลูกค้า
//   หน้านี้             เลือกเจ้าหนี้ รับของเข้า   เก็บใบกำกับภาษีที่เจ้าหนี้ออกให้เรา
//
// จงใจให้หน้าตาและวิธีกรอกเหมือนกันทุกอย่าง ต่างกันแค่ทิศทางของของและเงิน
//
// ต่างจากหน้าขายสองเรื่อง:
//   1. ไม่ต้องตรวจว่าของพอไหม เพราะเป็นการรับเข้า ไม่ใช่หยิบออก
//   2. มีช่อง "เลขที่ใบกำกับภาษีของเจ้าหนี้" ซึ่งเป็นคนละเลขกับเลขที่เอกสารของเรา
//      ต้องเก็บไว้เพราะเป็นตัวที่ใช้อ้างตอนยื่นภาษีซื้อ

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { VAT_PERCENT } from "@/lib/constants";
import {
  defaultBinOf,
  firstLocOf,
  invoiceTotals,
  lineAmount,
  nextDocNo,
  supplierAddress,
} from "@/lib/db";
import { num, thDate, todayISO, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { IcPlus, IcTrash } from "../Icons";
import { Badge, Card, Empty, LocationSelect, ProductSelect, QtyInput, SearchSelect, TableWrap, WarehouseSelect } from "../ui";
import SetupNotice from "../SetupNotice";
import { PurchaseBody } from "./printBodies";

export default function PurchaseInvoice() {
  const inv = useInv();

  /*
   * สิทธิของหน้าจอนี้ — ไม่ติ๊ก "แก้ไข" แล้วปุ่มบันทึกถูกปิด เข้ามาดูได้อย่างเดียว
   * ไม่ติ๊ก "เปลี่ยนวันที่" แล้วช่องวันที่ล็อกไว้ (ดูหน้ากำหนดสิทธิการใช้งาน)
   */
  const perm = inv.perm("purchase");
  const { db } = inv;
  const { user } = useAuth();
  const toast = useToast();
  const print = usePrint();

  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(todayISO);
  const [supId, setSupId] = useState("");
  const [refNo, setRefNo] = useState("");
  const [vatRate, setVatRate] = useState(String(VAT_PERCENT));
  const [billDiscount, setBillDiscount] = useState("");
  const [note, setNote] = useState("");

  const suppliers = useMemo(
    () => (db.suppliers || []).slice().sort((a, b) => a.code.localeCompare(b.code)),
    [db.suppliers]
  );

  const sup = suppliers.find((c) => c.id === supId) || null;

  /** หนึ่งบรรทัด = สินค้าหนึ่งรายการที่ซื้อเข้ามา */
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
      // ราคาซื้อไม่ใช่ราคาขาย จึงไม่ดึงราคาสินค้ามาให้ ต้องกรอกจากใบของเจ้าหนี้
      price: p ? "" : "",
      discPct: "",
      discAmt: "",
    };
  }

  const [rows, setRows] = useState(() => [blankRow()]);

  const isFilled = (r) => !!r.productId && parseFloat(r.qty) > 0;

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

  /** เลือกสินค้าแล้วย้ายคลัง/ที่เก็บไปตามค่าประจำ แต่ไม่แตะราคา (ราคาซื้อมาจากใบเจ้าหนี้) */
  function pickProduct(key, id) {
    const def = defaultBinOf(db, id);
    setRow(key, def ? { productId: id, whId: def.whId, locId: def.locId } : { productId: id });
  }

  const docNo = nextDocNo(db, "PURCHASE", date);
  const filled = rows.filter(isFilled);

  const totals = invoiceTotals(
    filled.map((r) => ({
      qty: parseFloat(r.qty) || 0,
      price: parseFloat(r.price) || 0,
      discPct: parseFloat(r.discPct) || 0,
      discAmt: parseFloat(r.discAmt) || 0,
    })),
    parseFloat(billDiscount) || 0,
    parseFloat(vatRate) || 0
  );

  function clearAll() {
    setRows([blankRow()]);
    setRefNo("");
    setBillDiscount("");
    setNote("");
  }

  async function saveDoc() {
    if (saving) return;
    if (!sup) return toast("กรุณาเลือกรหัสเจ้าหนี้ก่อน", "err");
    if (!filled.length) {
      return toast("ยังไม่มีบรรทัดที่กรอกครบ — เลือกสินค้าและใส่จำนวนก่อน", "warn");
    }

    // รับของเข้าไม่ต้องตรวจว่าของพอไหม เหลือแค่ตรวจว่าคลังกับที่เก็บเข้าคู่กันจริง
    const problems = [];
    filled.forEach((r) => {
      const at = "บรรทัดที่ " + (rows.indexOf(r) + 1);
      const err = inv.checkWhLoc(r.whId, r.locId, "คลังสินค้า");
      if (err) return problems.push(at + ": " + err);
      if (!(parseFloat(r.price) >= 0)) problems.push(at + ": กรุณาใส่ราคาต่อหน่วย");
    });
    if (problems.length) return toast(problems[0], "err");

    const id = uid();
    const ts = new Date(date + "T09:00:00").getTime();

    const purchase = {
      id,
      docNo,
      date,
      supplierId: sup.id,
      supCode: sup.code,
      supName: sup.name,
      supAddress: supplierAddress(sup),
      supProvince: sup.province || "",
      supTaxId: sup.taxId || "",
      supBranch: sup.branch || "",
      refNo: refNo.trim(),
      vatRate: totals.rate,
      itemsTotal: totals.itemsTotal,
      billDiscount: totals.discount,
      base: totals.base,
      vat: totals.vat,
      total: totals.total,
      note: note.trim(),
      user: user && user.email ? user.email : "",
      ts,
    };

    const items = filled.map((r, i) => ({
      id: uid(),
      txnId: uid(),
      // id ของแถวในผังที่เก็บ เผื่อกรณีที่สินค้านี้ยังไม่เคยอยู่ในช่องนั้นมาก่อน
      plId: uid(),
      purchaseId: id,
      productId: r.productId,
      whId: r.whId,
      locId: r.locId,
      qty: parseFloat(r.qty),
      price: parseFloat(r.price) || 0,
      discPct: parseFloat(r.discPct) || 0,
      discAmt: parseFloat(r.discAmt) || 0,
      amount: lineAmount(r),
      seq: i + 1,
    }));

    setSaving(true);
    try {
      await inv.addPurchase(purchase, items);
      toast("บันทึกใบซื้อ " + docNo + " (" + items.length + " รายการ) เรียบร้อย");
      clearAll();
      printDoc(purchase, items);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setSaving(false);
    }
  }

  function printDoc(purchase, items) {
    print({
      bare: true,
      body: <PurchaseBody inv={inv} company={db.company} purchase={purchase} items={items} />,
    });
  }

  const recent = useMemo(
    () => (db.purchases || []).slice().sort((a, b) => b.ts - a.ts).slice(0, 12),
    [db.purchases]
  );

  if (!inv.purchasesReady) {
    return (
      <SetupNotice
        feature="หน้าจอซื้อสินค้าและบริการ"
        tables={["purchases", "purchase_items", "suppliers"]}
      />
    );
  }

  if (!suppliers.length) {
    return (
      <Card title="ซื้อสินค้าและบริการ">
        <Empty>
          ยังไม่มีข้อมูลเจ้าหนี้ — ใบซื้อต้องระบุว่าซื้อจากใคร
          ให้ไปเพิ่มที่เมนู “รายละเอียดเจ้าหนี้” ก่อน
        </Empty>
      </Card>
    );
  }

  return (
    <div className="stack">
      <Card
        title="บันทึกการซื้อสินค้าและบริการ"
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
            <label className="lbl" htmlFor="pc_date">วันที่เอกสาร</label>
            <input
              className="inp"
              type="date"
              id="pc_date"
              value={date}
              disabled={!perm.date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="pc_doc">เลขที่เอกสาร</label>
            <input className="inp" id="pc_doc" value={docNo} readOnly />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="pc_sup">รหัสเจ้าหนี้</label>
            {/* พิมพ์ค้นได้จากรหัส ชื่อ จังหวัด หรือเลขผู้เสียภาษี */}
            <SearchSelect
              id="pc_sup"
              value={supId}
              onChange={setSupId}
              options={suppliers.map((c) => ({
                value: c.id,
                code: c.code,
                label: c.name,
                meta: c.province,
                search: c.taxId + " " + c.phone,
              }))}
              placeholder="— เลือกรหัสเจ้าหนี้ —"
              notFound="ไม่พบเจ้าหนี้ที่ตรงกับ"
            />
          </div>
          <div className="field">
            {/* ชื่อมาจากรหัสที่เลือกเสมอ พิมพ์ทับเองไม่ได้ ไม่งั้นชื่อกับรหัสจะไม่ตรงกัน */}
            <label className="lbl" htmlFor="pc_sname">ชื่อเจ้าหนี้</label>
            <input className="inp" id="pc_sname" value={sup ? sup.name : ""} readOnly />
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="pc_saddr">ที่อยู่ผู้ขาย</label>
            <input
              className="inp"
              id="pc_saddr"
              value={sup ? supplierAddress(sup) : ""}
              readOnly
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="pc_stax">เลขประจำตัวผู้เสียภาษีผู้ขาย</label>
            <input
              className="inp"
              id="pc_stax"
              value={sup ? sup.taxId || "" : ""}
              readOnly
              placeholder={sup ? "ยังไม่ได้กรอกในทะเบียนเจ้าหนี้" : ""}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="pc_ref">เลขที่ใบกำกับภาษีของเจ้าหนี้</label>
            <input
              className="inp"
              id="pc_ref"
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              placeholder="เลขบนใบที่เจ้าหนี้ออกให้ ใช้อ้างตอนยื่นภาษีซื้อ"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="pc_vat">อัตราภาษีมูลค่าเพิ่ม (%)</label>
            <input
              className="inp num"
              id="pc_vat"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="pc_note">หมายเหตุ</label>
            <input
              className="inp"
              id="pc_note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น เครดิต 30 วัน"
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
              return (
                <tr key={r.key}>
                  <td>{i + 1}</td>

                  <td>
                    <ProductSelect
                      db={db}
                      id={"pc_prod_" + r.key}
                      value={r.productId}
                      onChange={(v) => pickProduct(r.key, v)}
                    />
                  </td>

                  <td>
                    <WarehouseSelect
                      db={db}
                      id={"pc_wh_" + r.key}
                      value={r.whId}
                      onChange={(w) => setRow(r.key, { whId: w, locId: firstLocOf(db, w) })}
                    />
                  </td>

                  <td>
                    <LocationSelect
                      db={db}
                      whId={r.whId}
                      id={"pc_loc_" + r.key}
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
                    <div style={{ fontSize: 11.5, color: "var(--fg-faint)" }}>
                      {p ? "รับเข้า · " + p.unit : ""}
                    </div>
                  </td>

                  <td className="num">
                    <input
                      className="inp num"
                      type="number"
                      min={0}
                      step="0.01"
                      value={r.price}
                      placeholder="0"
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
                    <b>{isFilled(r) ? num(lineAmount(r), 2) : "—"}</b>
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

        <div className="inv-sum">
          <div className="inv-sum-row">
            <span>รวมเงิน</span>
            <b>{num(totals.itemsTotal, 2)}</b>
          </div>
          <div className="inv-sum-row">
            <label className="lbl" htmlFor="pc_bdisc">ส่วนลดท้ายบิล</label>
            <input
              className="inp num"
              id="pc_bdisc"
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
            <span>ภาษีซื้อ {num(totals.rate, 2)}%</span>
            <b>{num(totals.vat, 2)}</b>
          </div>
          <div className="inv-sum-row grand">
            <span>ยอดสุทธิ</span>
            <b>฿{num(totals.total, 2)}</b>
          </div>
        </div>
      </Card>

      <Card title="ใบซื้อล่าสุด" actions={<Badge>{(db.purchases || []).length} ใบ</Badge>}>
        {recent.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>เลขที่เอกสาร</th>
                <th style={{ width: 120 }}>วันที่</th>
                <th style={{ width: 90 }}>รหัสเจ้าหนี้</th>
                <th style={{ minWidth: 200 }}>ชื่อเจ้าหนี้</th>
                <th style={{ minWidth: 140 }}>เลขที่ใบของเจ้าหนี้</th>
                <th className="num" style={{ width: 110 }}>ยอดสุทธิ</th>
                <th style={{ width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {recent.map((v) => (
                <tr key={v.id}>
                  <td className="code-cell">{v.docNo}</td>
                  <td>{thDate(v.date)}</td>
                  <td>{v.supCode}</td>
                  <td>{v.supName}</td>
                  <td>{v.refNo || "—"}</td>
                  <td className="num">
                    <b>{num(v.total, 2)}</b>
                  </td>
                  <td>
                    <button
                      className="btn btn-o btn-sm"
                      onClick={() => printDoc(v, inv.itemsOfPurchase(v.id))}
                    >
                      พิมพ์ซ้ำ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>ยังไม่มีใบซื้อ — กรอกตารางด้านบนแล้วกด “บันทึกและพิมพ์”</Empty>
        )}
      </Card>
    </div>
  );
}
