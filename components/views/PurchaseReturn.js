"use client";

// หน้าจอส่งคืนสินค้าและบริการ — คืนของให้เจ้าหนี้
//
// ต้องอ้างใบซื้อเสมอ เลือกใบซื้อก่อนแล้วค่อยเลือกว่าจะคืนบรรทัดไหน จำนวนเท่าไร
// คืนของที่ไม่เคยซื้อไม่ได้ และคืนเกินจำนวนที่ซื้อมาก็ไม่ได้
//
// ที่ทำแบบนี้เพราะถ้าปล่อยให้คืนลอย ๆ ยอดภาษีซื้อกับของจริงจะไม่ตรงกัน
// แล้วตามกลับไม่ได้ว่าคืนของใบไหน เวลาสรรพากรขอดูจะอธิบายไม่ได้
//
// ราคาและส่วนลดถูกดึงมาจากบรรทัดของใบซื้อ แก้ไม่ได้
// เพราะคืนของต้องคืนที่ราคาที่ซื้อมา ไม่ใช่ราคาที่มาตกลงกันใหม่ทีหลัง

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { RETURN_REASONS } from "@/lib/constants";
import { invoiceTotals, lineAmount, nextDocNo } from "@/lib/db";
import { num, thDate, todayISO, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { Badge, Card, Empty, QtyInput, SearchSelect, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";
import { ReturnBody } from "./printBodies";

export default function PurchaseReturn() {
  const inv = useInv();
  const perm = inv.perm("purret");
  const { db } = inv;
  const { user } = useAuth();
  const toast = useToast();
  const print = usePrint();

  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(todayISO);
  const [purId, setPurId] = useState("");
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [billDiscount, setBillDiscount] = useState("");
  const [note, setNote] = useState("");

  /** จำนวนที่จะคืนของแต่ละบรรทัด เก็บเป็น map ของ itemId -> ข้อความที่กรอก */
  const [qty, setQty] = useState({});

  const purchases = useMemo(
    () => (db.purchases || []).slice().sort((a, b) => b.ts - a.ts),
    [db.purchases]
  );

  const pur = purchases.find((p) => p.id === purId) || null;

  /**
   * บรรทัดของใบซื้อที่เลือก พร้อมจำนวนที่ยังคืนได้
   *
   * คืนได้ = ซื้อมา - คืนไปแล้ว และต้องไม่เกินของที่ยังอยู่ในช่องเก็บนั้นจริง
   * เพราะของอาจถูกเบิกหรือขายออกไปแล้วหลังรับเข้ามา
   */
  const lines = useMemo(() => {
    if (!pur) return [];
    return inv.itemsOfPurchase(pur.id).map((it) => {
      const back = inv.returnedQty(pur.id, it.id);
      const left = Math.max(0, it.qty - back);
      const inBin = inv.placedIn(it.productId, it.locId);
      return { it, back, left, inBin, max: Math.min(left, inBin) };
    });
  }, [pur, inv]);

  /** บรรทัดที่กรอกจำนวนคืนแล้ว */
  const picked = lines
    .map((l) => ({ ...l, want: parseFloat(qty[l.it.id]) || 0 }))
    .filter((l) => l.want > 0);

  const totals = invoiceTotals(
    picked.map((l) => ({
      qty: l.want,
      price: l.it.price,
      discPct: l.it.discPct,
      discAmt: 0,
    })),
    parseFloat(billDiscount) || 0,
    pur ? pur.vatRate : 0
  );

  const docNo = nextDocNo(db, "PURRET", date);

  function pickPurchase(id) {
    setPurId(id);
    setQty({});
    setBillDiscount("");
  }

  /** เติมจำนวนคืนให้เต็มทุกบรรทัดที่ยังคืนได้ — ใช้ตอนคืนทั้งใบ */
  function fillAll() {
    const next = {};
    lines.forEach((l) => {
      if (l.max > 0) next[l.it.id] = String(l.max);
    });
    setQty(next);
  }

  async function saveDoc() {
    if (saving) return;
    if (!pur) return toast("กรุณาเลือกใบซื้อที่จะคืนก่อน", "err");
    if (!picked.length) return toast("ยังไม่ได้ใส่จำนวนที่จะคืนสักบรรทัด", "warn");

    const problems = [];
    picked.forEach((l) => {
      const name = inv.prodName(l.it.productId);
      if (l.want > l.left) {
        problems.push(
          name + ": คืนได้อีกแค่ " + num(l.left, 0) + " (ซื้อ " + num(l.it.qty, 0) +
            " คืนไปแล้ว " + num(l.back, 0) + ")"
        );
      } else if (l.want > l.inBin) {
        problems.push(
          name + ": ของใน " + inv.locName(l.it.locId) + " เหลือ " + num(l.inBin, 0) +
            " ไม่พอคืน " + num(l.want, 0)
        );
      }
    });
    if (problems.length) return toast(problems[0], "err");

    const id = uid();
    const ts = new Date(date + "T09:00:00").getTime();

    const ret = {
      id,
      docNo,
      date,
      purchaseId: pur.id,
      purDocNo: pur.docNo,
      supplierId: pur.supplierId,
      supCode: pur.supCode,
      supName: pur.supName,
      supAddress: pur.supAddress,
      supProvince: pur.supProvince,
      supTaxId: pur.supTaxId,
      supBranch: pur.supBranch,
      reason,
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

    const items = picked.map((l, i) => ({
      id: uid(),
      txnId: uid(),
      returnId: id,
      // ผูกกลับไปที่บรรทัดของใบซื้อ ใช้นับว่าคืนไปแล้วเท่าไรตอนคืนรอบถัดไป
      itemId: l.it.id,
      productId: l.it.productId,
      whId: l.it.whId,
      locId: l.it.locId,
      qty: l.want,
      price: l.it.price,
      discPct: l.it.discPct,
      discAmt: 0,
      amount: lineAmount({ qty: l.want, price: l.it.price, discPct: l.it.discPct, discAmt: 0 }),
      seq: i + 1,
    }));

    setSaving(true);
    try {
      await inv.addPurchaseReturn(ret, items);
      toast("บันทึกใบส่งคืน " + docNo + " (" + items.length + " รายการ) เรียบร้อย");
      setQty({});
      setBillDiscount("");
      setNote("");
      printDoc(ret, items);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setSaving(false);
    }
  }

  function printDoc(ret, items) {
    print({
      bare: true,
      body: <ReturnBody inv={inv} company={db.company} ret={ret} items={items} />,
    });
  }

  const recent = useMemo(
    () => (db.purchaseReturns || []).slice().sort((a, b) => b.ts - a.ts).slice(0, 12),
    [db.purchaseReturns]
  );

  if (!inv.returnsReady) {
    return (
      <SetupNotice
        feature="หน้าจอส่งคืนสินค้าและบริการ"
        tables={["purchase_returns", "purchase_return_items", "purchases"]}
      />
    );
  }

  if (!purchases.length) {
    return (
      <Card title="ส่งคืนสินค้าและบริการ">
        <Empty>
          ยังไม่มีใบซื้อในระบบ — การส่งคืนต้องอ้างใบซื้อเสมอ
          ให้ไปบันทึกที่เมนู “ซื้อสินค้าและบริการ” ก่อน
        </Empty>
      </Card>
    );
  }

  return (
    <div className="stack">
      <Card
        title="บันทึกการส่งคืนสินค้าและบริการ"
        actions={
          <>
            <Badge>เลขที่ {docNo}</Badge>
            <Badge kind={picked.length ? "info" : "gray"}>
              {picked.length} รายการ · สุทธิ ฿{num(totals.total, 2)}
            </Badge>
            {pur ? (
              <button className="btn btn-o btn-sm" onClick={fillAll} disabled={saving}>
                คืนทั้งใบ
              </button>
            ) : null}
            <button
              className="btn btn-p btn-sm"
              onClick={saveDoc}
              disabled={saving || !picked.length || !perm.edit}
            >
              {saving ? "กำลังบันทึก…" : "บันทึกและพิมพ์"}
            </button>
          </>
        }
      >
        <div className="form-grid" style={{ marginBottom: 16 }}>
          <div className="field">
            <label className="lbl" htmlFor="pr_date">วันที่เอกสาร</label>
            <input
              className="inp"
              type="date"
              id="pr_date"
              value={date}
              disabled={!perm.date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="pr_doc">เลขที่เอกสาร</label>
            <input className="inp" id="pr_doc" value={docNo} readOnly />
          </div>

          <div className="field span2">
            {/* อ้างใบซื้อเสมอ คืนของที่ไม่เคยซื้อไม่ได้ */}
            <label className="lbl" htmlFor="pr_pur">ใบซื้อที่อ้างถึง</label>
            {/* ยิงบาร์โค๊ดเลขที่ใบซื้อหรือพิมพ์ชื่อเจ้าหนี้ก็หาเจอ ไม่ต้องเลื่อนหาทีละใบ */}
            <SearchSelect
              id="pr_pur"
              value={purId}
              onChange={pickPurchase}
              options={purchases.map((p) => ({
                value: p.id,
                code: p.docNo,
                label: p.supName,
                meta: thDate(p.date) + " · ฿" + num(p.total, 2),
                search: p.refNo + " " + p.supCode,
              }))}
              placeholder="— เลือกเลขที่ใบซื้อ —"
              notFound="ไม่พบใบซื้อที่ตรงกับ"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="pr_sup">เจ้าหนี้</label>
            <input className="inp" id="pr_sup" value={pur ? pur.supName : ""} readOnly />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="pr_reason">เหตุผลที่ส่งคืน</label>
            <select
              className="sel"
              id="pr_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {RETURN_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="pr_note">หมายเหตุ</label>
            <input
              className="inp"
              id="pr_note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น เจ้าหนี้รับคืนแล้วออกใบลดหนี้ให้"
            />
          </div>
        </div>

        {pur ? (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th style={{ minWidth: 200 }}>สินค้า</th>
                  <th style={{ minWidth: 180 }}>คลัง · ที่เก็บ</th>
                  <th className="num" style={{ width: 84 }}>ซื้อไว้</th>
                  <th className="num" style={{ width: 90 }}>คืนไปแล้ว</th>
                  <th className="num" style={{ width: 90 }}>คืนได้</th>
                  <th className="num" style={{ width: 160 }}>จำนวนที่คืน</th>
                  <th className="num" style={{ width: 100 }}>ราคา/หน่วย</th>
                  <th className="num" style={{ width: 116 }}>รวมเงิน</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const want = parseFloat(qty[l.it.id]) || 0;
                  const over = want > l.max;
                  return (
                    <tr key={l.it.id}>
                      <td>{i + 1}</td>
                      <td>{inv.prodName(l.it.productId)}</td>
                      <td style={{ fontSize: 12.5 }}>
                        {inv.whLocName(l.it.whId, l.it.locId)}
                      </td>
                      <td className="num">{num(l.it.qty, 0)}</td>
                      <td className="num">{l.back ? num(l.back, 0) : "—"}</td>
                      <td className="num">
                        <b>{num(l.max, 0)}</b>
                      </td>
                      <td className="num">
                        <QtyInput
                          value={qty[l.it.id] || ""}
                          onChange={(v) => setQty((q) => ({ ...q, [l.it.id]: v }))}
                          disabled={saving || l.max <= 0}
                          ariaLabel={"จำนวนที่คืนของบรรทัดที่ " + (i + 1)}
                        />
                        {over ? (
                          <div style={{ fontSize: 11.5, color: "var(--err)", fontWeight: 700 }}>
                            {l.left < l.inBin
                              ? "คืนได้อีกแค่ " + num(l.left, 0)
                              : "ของในช่องเหลือ " + num(l.inBin, 0)}
                          </div>
                        ) : null}
                      </td>
                      <td className="num">{num(l.it.price, 2)}</td>
                      <td className="num">
                        <b>
                          {want > 0
                            ? num(
                                lineAmount({
                                  qty: want,
                                  price: l.it.price,
                                  discPct: l.it.discPct,
                                  discAmt: 0,
                                }),
                                2
                              )
                            : "—"}
                        </b>
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
                <label className="lbl" htmlFor="pr_bdisc">ส่วนลดท้ายบิล</label>
                <input
                  className="inp num"
                  id="pr_bdisc"
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
                <span>ภาษีซื้อที่ต้องคืน {num(totals.rate, 2)}%</span>
                <b>{num(totals.vat, 2)}</b>
              </div>
              <div className="inv-sum-row grand">
                <span>ยอดสุทธิ</span>
                <b>฿{num(totals.total, 2)}</b>
              </div>
            </div>
          </>
        ) : (
          <Empty>เลือกใบซื้อด้านบนก่อน แล้วรายการที่คืนได้จะขึ้นให้เลือก</Empty>
        )}
      </Card>

      <Card
        title="ใบส่งคืนล่าสุด"
        actions={<Badge>{(db.purchaseReturns || []).length} ใบ</Badge>}
      >
        {recent.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>เลขที่เอกสาร</th>
                <th style={{ width: 120 }}>วันที่</th>
                <th style={{ minWidth: 150 }}>อ้างใบซื้อ</th>
                <th style={{ minWidth: 190 }}>เจ้าหนี้</th>
                <th style={{ minWidth: 170 }}>เหตุผล</th>
                <th className="num" style={{ width: 110 }}>ยอดสุทธิ</th>
                <th style={{ width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {recent.map((v) => (
                <tr key={v.id}>
                  <td className="code-cell">{v.docNo}</td>
                  <td>{thDate(v.date)}</td>
                  <td className="code-cell">{v.purDocNo}</td>
                  <td>{v.supName}</td>
                  <td style={{ fontSize: 12.5 }}>{v.reason || "—"}</td>
                  <td className="num">
                    <b>{num(v.total, 2)}</b>
                  </td>
                  <td>
                    <button
                      className="btn btn-o btn-sm"
                      onClick={() => printDoc(v, inv.itemsOfReturn(v.id))}
                    >
                      พิมพ์ซ้ำ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>ยังไม่มีใบส่งคืน</Empty>
        )}
      </Card>
    </div>
  );
}
