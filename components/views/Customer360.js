"use client";

// Customer 360 — เปิดลูกค้าหนึ่งราย เห็นทุกอย่างของรายนั้นในหน้าเดียว
//
// รวมของที่กระจายอยู่สี่ที่: ยอดซื้อจากใบขาย · โอกาสการขาย · ประวัติการติดต่อ
// และวันที่ซื้อครั้งล่าสุด ตอบคำถามที่พนักงานขายถามก่อนโทรหาลูกค้าเสมอ —
// "รายนี้ซื้ออะไรไปบ้าง ค้างอะไรอยู่ ครั้งล่าสุดคุยกันเรื่องอะไร"
//
// ตัวเลขทุกตัวคำนวณสดจากข้อมูลจริง ไม่มีการเก็บยอดสรุปไว้ในตารางไหน
// กติกาเดียวกับยอดคงเหลือที่มาจาก txns เท่านั้น

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { actKindOf, customerSummary, stageOf } from "@/lib/crm";
import { num, thDate, todayISO } from "@/lib/format";
import { useToast } from "../Toast";
import { IcChart } from "../Icons";
import { Badge, Card, Empty, ExportPair, Kpi, SearchSelect, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

export default function Customer360({ onNavigate }) {
  const inv = useInv();
  const { db } = inv;
  const toast = useToast();

  const [custId, setCustId] = useState("");

  const options = useMemo(
    () =>
      (db.customers || [])
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code, "th"))
        .map((c) => ({ value: c.id, label: c.name, code: c.code, meta: c.province })),
    [db.customers]
  );

  const cust = (db.customers || []).find((c) => c.id === custId) || null;
  const sum = useMemo(
    () => (custId ? customerSummary(db, custId, todayISO()) : null),
    [db, custId]
  );

  if (!inv.crmReady) {
    return (
      <SetupNotice
        feature="งานลูกค้าสัมพันธ์"
        tables={["crm_leads", "crm_deals", "crm_activities"]}
      />
    );
  }

  const HEAD = ["เลขที่เอกสาร", "วันที่", "ยอดก่อนภาษี", "ยอดสุทธิ", "พนักงานขาย"];
  const rows = () =>
    (sum ? sum.invoices : []).map((v) => [v.docNo, v.date, v.base, v.total, v.salesName || ""]);

  return (
    <div className="stack">
      <Card title="เลือกลูกค้า">
        <div className="form-grid">
          <div className="field span2">
            <label className="lbl" htmlFor="c3_cust">ลูกค้า</label>
            <SearchSelect
              id="c3_cust"
              value={custId}
              onChange={setCustId}
              options={options}
              emptyLabel="— ยังไม่เลือก —"
              notFound="ไม่พบลูกค้าที่ตรงกับ"
            />
            <span className="hint">พิมพ์บางส่วนของรหัส ชื่อ หรือจังหวัดเพื่อค้นหา</span>
          </div>
        </div>
      </Card>

      {!cust || !sum ? (
        <Card title="ภาพรวมลูกค้า">
          <Empty>เลือกลูกค้าด้านบนเพื่อดูภาพรวมทั้งหมดของรายนั้น</Empty>
        </Card>
      ) : (
        <>
          <Card
            title={"ภาพรวม " + cust.code + " " + cust.name}
            actions={
              <>
                {cust.province ? <Badge>{cust.province}</Badge> : null}
                <button
                  className="btn btn-o btn-sm"
                  onClick={() => onNavigate && onNavigate("activities")}
                  title="ไปบันทึกกิจกรรมของลูกค้ารายนี้"
                >
                  บันทึกการติดต่อ
                </button>
                <button
                  className="btn btn-o btn-sm"
                  onClick={() => onNavigate && onNavigate("invoice")}
                  title="ไปออกใบขายสินค้าและบริการ"
                >
                  ออกใบขาย
                </button>
              </>
            }
          >
            <div className="grid g4" style={{ marginBottom: 14 }}>
              <Kpi
                icon={<IcChart size={18} stroke={1.9} />}
                label="ยอดซื้อสะสม (ก่อนภาษี)"
                value={"฿" + num(sum.base, 0)}
                sub={num(sum.bills, 0) + " ใบ · เฉลี่ยใบละ ฿" + num(sum.avgBill, 0)}
              />
              <Kpi
                icon={<IcChart size={18} stroke={1.9} />}
                label="ซื้อครั้งล่าสุด"
                value={sum.lastBuy ? thDate(sum.lastBuy) : "ยังไม่เคยซื้อ"}
                sub={
                  sum.quietDays === null
                    ? "ยังไม่มีใบขาย"
                    : "เงียบมาแล้ว " + num(sum.quietDays, 0) + " วัน"
                }
                kind={sum.quietDays !== null && sum.quietDays >= 90 ? "warn" : ""}
              />
              <Kpi
                icon={<IcChart size={18} stroke={1.9} />}
                label="โอกาสการขายที่เปิดอยู่"
                value={num(sum.openDeals.length, 0)}
                sub={
                  "มูลค่ารวม ฿" +
                  num(
                    sum.openDeals.reduce((n, d) => n + (Number(d.amount) || 0), 0),
                    0
                  )
                }
              />
              <Kpi
                icon={<IcChart size={18} stroke={1.9} />}
                label="อัตราชนะของรายนี้"
                value={sum.winRate === null ? "—" : num(sum.winRate, 0) + "%"}
                sub={
                  "ชนะ " + num(sum.wonDeals.length, 0) + " · ดีลทั้งหมด " + num(sum.deals.length, 0)
                }
              />
            </div>

            <div className="grid g2">
              <div className="field">
                <span className="lbl">ติดต่อครั้งล่าสุด</span>
                <b>{sum.lastContact ? thDate(sum.lastContact) : "ยังไม่มีบันทึก"}</b>
              </div>
              <div className="field">
                <span className="lbl">นัดครั้งถัดไป</span>
                <b>{sum.nextDate ? thDate(sum.nextDate) : "ยังไม่มีนัด"}</b>
              </div>
            </div>
          </Card>

          <Card
            title="โอกาสการขาย"
            actions={<Badge kind={sum.deals.length ? "info" : "gray"}>{sum.deals.length} รายการ</Badge>}
          >
            {sum.deals.length ? (
              <TableWrap>
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>รหัส</th>
                    <th style={{ minWidth: 200 }}>ชื่อโอกาส</th>
                    <th className="num" style={{ width: 130 }}>มูลค่า</th>
                    <th style={{ width: 150 }}>ขั้นตอน</th>
                    <th style={{ width: 120 }}>คาดปิด</th>
                    <th style={{ minWidth: 160 }}>เหตุผลที่เสีย</th>
                  </tr>
                </thead>
                <tbody>
                  {sum.deals
                    .slice()
                    .sort((a, b) => b.ts - a.ts)
                    .map((d) => {
                      const s = stageOf(d.stage);
                      return (
                        <tr key={d.id}>
                          <td className="code-cell">{d.code}</td>
                          <td>{d.name}</td>
                          <td className="num">{num(d.amount, 0)}</td>
                          <td>
                            <Badge kind={s.kind}>{s.name}</Badge>
                          </td>
                          <td>{d.expectDate ? thDate(d.expectDate) : "—"}</td>
                          <td className="muted">{d.lostReason || "—"}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </TableWrap>
            ) : (
              <Empty>ยังไม่มีโอกาสการขายของลูกค้ารายนี้</Empty>
            )}
          </Card>

          <Card
            title="ประวัติการติดต่อล่าสุด"
            actions={
              <Badge kind={sum.activities.length ? "info" : "gray"}>
                {sum.activities.length} ครั้ง
              </Badge>
            }
          >
            {sum.activities.length ? (
              <TableWrap>
                <thead>
                  <tr>
                    <th style={{ width: 120 }}>วันที่</th>
                    <th style={{ width: 130 }}>ชนิด</th>
                    <th style={{ minWidth: 200 }}>เรื่องที่คุย</th>
                    <th style={{ minWidth: 200 }}>ผลลัพธ์</th>
                    <th style={{ width: 130 }}>นัดครั้งถัดไป</th>
                  </tr>
                </thead>
                <tbody>
                  {sum.activities.slice(0, 20).map((a) => (
                    <tr key={a.id}>
                      <td>{thDate(a.date)}</td>
                      <td>
                        <Badge>{actKindOf(a.kind).name}</Badge>
                      </td>
                      <td>{a.subject}</td>
                      <td className="muted">{a.result || "—"}</td>
                      <td>{a.nextDate ? thDate(a.nextDate) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            ) : (
              <Empty>ยังไม่มีบันทึกการติดต่อของลูกค้ารายนี้</Empty>
            )}
          </Card>

          <Card
            title="ใบขายของลูกค้ารายนี้"
            actions={
              <>
                <Badge kind={sum.bills ? "info" : "gray"}>{sum.bills} ใบ</Badge>
                <ExportPair
                  onExport={(save2) => save2(HEAD, rows(), "ใบขาย-" + cust.code + ".csv")}
                  disabled={!sum.bills}
                  toast={toast}
                />
              </>
            }
          >
            {sum.invoices.length ? (
              <div className="doc-scroll" style={{ maxHeight: 380 }}>
                <TableWrap>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 150 }}>เลขที่เอกสาร</th>
                      <th style={{ width: 120 }}>วันที่</th>
                      <th className="num" style={{ width: 140 }}>ยอดก่อนภาษี</th>
                      <th className="num" style={{ width: 140 }}>ยอดสุทธิ</th>
                      <th style={{ minWidth: 150 }}>พนักงานขาย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sum.invoices.map((v) => (
                      <tr key={v.id}>
                        <td className="code-cell">{v.docNo}</td>
                        <td>{thDate(v.date)}</td>
                        <td className="num">{num(v.base, 2)}</td>
                        <td className="num">
                          <b>{num(v.total, 2)}</b>
                        </td>
                        <td>{v.salesName || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
            ) : (
              <Empty>ลูกค้ารายนี้ยังไม่เคยมีใบขาย</Empty>
            )}
            <p className="muted" style={{ marginBottom: 0, fontSize: 12.5 }}>
              ยอดซื้อสะสมใช้ยอดก่อนภาษี ให้ตรงกับกติกาที่หน้ากำหนดเป้าขายใช้ ·
              ภาษีมูลค่าเพิ่มเป็นเงินที่เก็บแทนรัฐ ไม่ใช่ยอดขายของกิจการ
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
