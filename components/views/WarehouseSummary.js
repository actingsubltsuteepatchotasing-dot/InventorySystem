"use client";

// หน้าจอสรุปยอดสินค้าคงเหลือแต่ละคลัง และการเคลื่อนไหวเข้า–ออก
//
// ตอบคำถามที่หน้าอื่นตอบไม่ได้ในหน้าเดียว:
//   คลังไหนมีของเท่าไร มูลค่าเท่าไร · งวดนี้เข้าออกไปเท่าไร · ของไปกองอยู่ที่ไหน
//
// ต่างจากหน้าที่มีอยู่แล้ว:
//   แดชบอร์ด      ภาพรวมทั้งระบบ ไม่ได้เทียบคลังต่อคลัง
//   กราฟสรุป      ดูแนวโน้มตามเวลา ไม่ได้ลงรายคลังพร้อมยอดยกมา
//   สินค้าตามจังหวัด  ดูบนแผนที่รายจังหวัด ไม่ได้บอกการเคลื่อนไหวในงวด
//
// ตารางบวกลงเสมอ: ยกมา + รับเข้า − จ่ายออก = คงเหลือ
// ตัวเลขทุกช่องมาจาก lib/whSummary.js ที่เดียว (ดูเหตุผลในไฟล์นั้น)

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { TYPES } from "@/lib/constants";
import { movement } from "@/lib/db";
import { whByMonth, whProducts, whSummary, whTotals } from "@/lib/whSummary";
import { localISO, monthsBetween, num, thDate, todayISO } from "@/lib/format";
import { BarChart, HBarChart, Legend } from "../Charts";
import { usePrint } from "../Print";
import { useToast } from "../Toast";
import { IcBox, IcChart, IcIn, IcOut } from "../Icons";
import { Badge, Card, Empty, ExportPair, Kpi, PrintPair, TableWrap } from "../ui";

/** ปุ่มลัดช่วงเวลา — ตั้งช่วงวันที่ให้ เหมือนหน้ากราฟสรุป */
const QUICK = [1, 3, 6, 12];

/** วันแรกของเดือนที่ย้อนไป n เดือน */
function monthsAgo(n) {
  const d = new Date();
  return localISO(new Date(d.getFullYear(), d.getMonth() - (n - 1), 1));
}

export default function WarehouseSummary() {
  const inv = useInv();

  // สิทธิของหน้าจอนี้ — ไม่ติ๊ก "เปลี่ยนวันที่" แล้วช่องช่วงวันที่ถูกล็อก
  // หน้านี้ไม่เขียนข้อมูลอะไรเลย จึงไม่มีสิทธิ "แก้ไข"
  const perm = inv.perm("whsum");
  const { db } = inv;
  const print = usePrint();
  const toast = useToast();

  const [from, setFrom] = useState(() => monthsAgo(6));
  const [to, setTo] = useState(todayISO);
  /** คลังที่กดดูรายละเอียดอยู่ — "" คือยังไม่ได้เลือก ดูภาพรวมทุกคลัง */
  const [pick, setPick] = useState("");

  const rows = useMemo(
    () => whSummary(db, from, to),
    [db.warehouses, db.products, db.txns, from, to] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const sum = useMemo(() => whTotals(rows), [rows]);

  const months = useMemo(() => monthsBetween(from, to, 24), [from, to]);
  const flow = useMemo(
    () => whByMonth(db, months, pick ? [pick] : []),
    [db, months, pick] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const detail = useMemo(
    () => (pick ? whProducts(db, from, to, pick) : []),
    [db, from, to, pick] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* รายการเคลื่อนไหวของคลังที่เลือก เอาไว้ดูว่าตัวเลขในตารางมาจากเอกสารใบไหน */
  const moves = useMemo(() => {
    if (!pick) return [];
    return (db.txns || [])
      .filter((t) => (!from || t.date >= from) && (!to || t.date <= to))
      .filter((t) => t.whId === pick || t.whTo === pick)
      .slice()
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 50);
  }, [db.txns, from, to, pick]);

  const picked = pick ? inv.wh(pick) : null;
  const bad = from && to && from > to;

  /* ------------------------------------------------------------ ส่งออก */

  const HEAD = [
    "รหัสคลัง", "คลังสินค้า", "จังหวัด", "ยกมา",
    "รับเข้า", "โอนเข้า", "ปรับขึ้น",
    "เบิก", "ขาย", "โอนออก", "ปรับลง",
    "รวมเข้า", "รวมออก", "คงเหลือ", "รายการสินค้า", "มูลค่า",
  ];
  const line = (r) => [
    r.wh.code, r.wh.name, r.wh.province, r.open,
    r.receive, r.transIn, r.adjUp,
    r.issue, r.sale, r.transOut, r.adjDown,
    r.inQty, r.outQty, r.close, r.items, r.value,
  ];

  function printSummary() {
    print({
      title: "สรุปยอดคงเหลือและการเคลื่อนไหวรายคลัง",
      subtitle: thDate(from) + " – " + thDate(to),
      body: (
        <table>
          <thead>
            <tr>
              <th>คลัง</th>
              <th>จังหวัด</th>
              <th style={{ textAlign: "right" }}>ยกมา</th>
              <th style={{ textAlign: "right" }}>รับเข้า</th>
              <th style={{ textAlign: "right" }}>จ่ายออก</th>
              <th style={{ textAlign: "right" }}>คงเหลือ</th>
              <th style={{ textAlign: "right" }}>มูลค่า</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.wh.id}>
                <td>{r.wh.code} · {r.wh.name}</td>
                <td>{r.wh.province}</td>
                <td style={{ textAlign: "right" }}>{num(r.open, 0)}</td>
                <td style={{ textAlign: "right" }}>{num(r.inQty, 0)}</td>
                <td style={{ textAlign: "right" }}>{num(r.outQty, 0)}</td>
                <td style={{ textAlign: "right" }}>{num(r.close, 0)}</td>
                <td style={{ textAlign: "right" }}>{num(r.value, 0)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={2}><b>รวมทุกคลัง</b></td>
              <td style={{ textAlign: "right" }}><b>{num(sum.open, 0)}</b></td>
              <td style={{ textAlign: "right" }}><b>{num(sum.inQty, 0)}</b></td>
              <td style={{ textAlign: "right" }}><b>{num(sum.outQty, 0)}</b></td>
              <td style={{ textAlign: "right" }}><b>{num(sum.close, 0)}</b></td>
              <td style={{ textAlign: "right" }}><b>{num(sum.value, 0)}</b></td>
            </tr>
          </tbody>
        </table>
      ),
    });
  }

  /* ---------------------------------------------------------------- UI */

  return (
    <div className="stack">
      <Card
        title="สรุปยอดคงเหลือรายคลัง"
        actions={
          <>
            <ExportPair
              disabled={!rows.length}
              toast={toast}
              onExport={(save) => save(HEAD, rows.map(line), "สรุปรายคลัง.csv")}
            />
            <PrintPair onPrint={printSummary} disabled={!rows.length} toast={toast} />
          </>
        }
      >
        <div className="row" style={{ alignItems: "flex-end", marginBottom: 14 }}>
          <div style={{ minWidth: 150 }}>
            <label className="lbl" htmlFor="ws_from">ตั้งแต่วันที่</label>
            <input
              className="inp"
              type="date"
              id="ws_from"
              value={from}
              max={to || undefined}
              disabled={!perm.date}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div style={{ minWidth: 150 }}>
            <label className="lbl" htmlFor="ws_to">ถึงวันที่</label>
            <input
              className="inp"
              type="date"
              id="ws_to"
              value={to}
              min={from || undefined}
              disabled={!perm.date}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="row" style={{ gap: 6 }}>
            {QUICK.map((n) => (
              <button
                key={n}
                className={
                  "btn btn-sm " + (from === monthsAgo(n) && to === todayISO() ? "btn-p" : "btn-g")
                }
                disabled={!perm.date}
                onClick={() => {
                  setFrom(monthsAgo(n));
                  setTo(todayISO());
                }}
              >
                {n === 1 ? "เดือนนี้" : n + " เดือน"}
              </button>
            ))}
          </div>
          {/* กรอกวันสลับกันแล้วทุกตัวเลขจะเป็นศูนย์หมด ต้องบอกสาเหตุ
              ไม่งั้นคนอ่านจะคิดว่าไม่มีข้อมูลในช่วงนั้นจริง ๆ */}
          {bad ? <Badge kind="warn">วันเริ่มอยู่หลังวันจบ — สลับวันที่ก่อน</Badge> : null}
        </div>

        {/* ยอดคงเหลือคิด ณ วันสุดท้ายของช่วงเสมอ ไม่ใช่ ณ วันนี้
            ไม่งั้นดูย้อนหลังแล้วจะได้ยอดของวันนี้ปนมากับการเคลื่อนไหวของเดือนก่อน */}
        <div className="grid g4" style={{ marginBottom: 14 }}>
          <Kpi
            icon={<IcBox size={20} />}
            label="คลังสินค้าทั้งหมด"
            value={num(rows.length, 0) + " คลัง"}
            sub={num(sum.items, 0) + " รายการสินค้าที่มีของ"}
          />
          <Kpi
            icon={<IcChart size={20} />}
            kind="info"
            label={"คงเหลือ ณ " + thDate(to)}
            value={num(sum.close, 0) + " หน่วย"}
            sub={"มูลค่า ฿" + num(sum.value, 0)}
          />
          <Kpi
            icon={<IcIn size={20} />}
            kind="ok"
            label="รับเข้าในช่วง"
            value={num(sum.inQty, 0) + " หน่วย"}
            sub={"รับ " + num(sum.receive, 0) + " · โอนเข้า " + num(sum.transIn, 0) + " · ปรับขึ้น " + num(sum.adjUp, 0)}
          />
          <Kpi
            icon={<IcOut size={20} />}
            kind="warn"
            label="จ่ายออกในช่วง"
            value={num(sum.outQty, 0) + " หน่วย"}
            sub={"เบิก " + num(sum.issue, 0) + " · ขาย " + num(sum.sale, 0) + " · โอนออก " + num(sum.transOut, 0)}
          />
        </div>

        {rows.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ minWidth: 170 }}>คลังสินค้า</th>
                <th style={{ minWidth: 110 }}>จังหวัด</th>
                <th className="num">ยกมา</th>
                <th className="num">รับเข้า</th>
                <th className="num">จ่ายออก</th>
                <th className="num">คงเหลือ</th>
                <th className="num">มูลค่า</th>
                <th style={{ width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.wh.id} className={r.wh.id === pick ? "sel" : ""}>
                  <td>
                    <b>{r.wh.name}</b>
                    <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>{r.wh.code}</div>
                  </td>
                  <td>{r.wh.province}</td>
                  <td className="num">{num(r.open, 0)}</td>
                  <td className="num" style={{ color: r.inQty ? "var(--ok)" : "" }}>
                    {r.inQty ? "+" + num(r.inQty, 0) : "—"}
                  </td>
                  <td className="num" style={{ color: r.outQty ? "var(--err)" : "" }}>
                    {r.outQty ? "−" + num(r.outQty, 0) : "—"}
                  </td>
                  <td className="num">
                    <b>{num(r.close, 0)}</b>
                  </td>
                  <td className="num">฿{num(r.value, 0)}</td>
                  <td>
                    <button
                      className="btn btn-o btn-sm"
                      onClick={() => setPick(r.wh.id === pick ? "" : r.wh.id)}
                    >
                      {r.wh.id === pick ? "ปิด" : "รายละเอียด"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>
                  <b>รวมทุกคลัง</b>
                </td>
                <td className="num">
                  <b>{num(sum.open, 0)}</b>
                </td>
                <td className="num">
                  <b>{num(sum.inQty, 0)}</b>
                </td>
                <td className="num">
                  <b>{num(sum.outQty, 0)}</b>
                </td>
                <td className="num">
                  <b>{num(sum.close, 0)}</b>
                </td>
                <td className="num">
                  <b>฿{num(sum.value, 0)}</b>
                </td>
                <td />
              </tr>
            </tfoot>
          </TableWrap>
        ) : (
          <Empty>ยังไม่มีคลังสินค้า กำหนดได้ที่เมนู “กำหนดคลังและที่เก็บ”</Empty>
        )}
      </Card>

      <div className="grid g2">
        <Card title={"การเคลื่อนไหวรายเดือน" + (picked ? " · " + picked.name : " (ทุกคลัง)")}>
          {flow.length ? (
            <>
              <BarChart
                labels={flow.map((m) => m.label)}
                series={[
                  { name: "รับเข้า", color: "var(--brand-l)", data: flow.map((m) => m.inQty) },
                  { name: "จ่ายออก", color: "#B3261E", data: flow.map((m) => m.outQty) },
                ]}
              />
              <Legend
                items={[
                  { name: "รับเข้า (รวมโอนเข้าและปรับขึ้น)", color: "var(--brand-l)" },
                  { name: "จ่ายออก (รวมโอนออกและปรับลง)", color: "#B3261E" },
                ]}
              />
            </>
          ) : (
            <Empty>เลือกช่วงวันที่ให้ครอบคลุมอย่างน้อยหนึ่งเดือน</Empty>
          )}
        </Card>

        <Card title="สัดส่วนยอดคงเหลือรายคลัง">
          {rows.some((r) => r.close > 0) ? (
            <HBarChart
              items={rows
                .filter((r) => r.close > 0)
                .sort((a, b) => b.close - a.close)
                .slice(0, 10)
                .map((r) => ({ label: r.wh.name, value: r.close, color: "var(--brand-l)" }))}
            />
          ) : (
            <Empty>ยังไม่มีคลังไหนมีของคงเหลือ</Empty>
          )}
        </Card>
      </div>

      {/* ---------------- รายละเอียดของคลังที่เลือก ---------------- */}
      {picked ? (
        <Card
          title={"รายละเอียดคลัง " + picked.name}
          actions={
            <>
              <Badge kind="info">{picked.code} · จังหวัด{picked.province}</Badge>
              <ExportPair
                disabled={!detail.length}
                toast={toast}
                onExport={(save) =>
                  save(
                    ["รหัสสินค้า", "สินค้า", "หน่วย", "ยกมา", "รับเข้า", "จ่ายออก", "คงเหลือ", "มูลค่า"],
                    detail.map((r) => [
                      r.product.code, r.product.name, r.product.unit,
                      r.open, r.inQty, r.outQty, r.close, r.value,
                    ]),
                    "สินค้าในคลัง-" + picked.code + ".csv"
                  )
                }
              />
              <button className="btn btn-g btn-sm" onClick={() => setPick("")}>
                ปิดรายละเอียด
              </button>
            </>
          }
        >
          <h4 style={{ margin: "0 0 9px", fontSize: 14.5 }}>สินค้าในคลังนี้</h4>
          {detail.length ? (
            <TableWrap>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>รหัส</th>
                  <th style={{ minWidth: 190 }}>สินค้า</th>
                  <th style={{ width: 80 }}>หน่วย</th>
                  <th className="num">ยกมา</th>
                  <th className="num">รับเข้า</th>
                  <th className="num">จ่ายออก</th>
                  <th className="num">คงเหลือ</th>
                  <th className="num">มูลค่า</th>
                </tr>
              </thead>
              <tbody>
                {detail.map((r) => (
                  <tr key={r.product.id}>
                    <td className="code-cell">{r.product.code}</td>
                    <td>{r.product.name}</td>
                    <td>{r.product.unit}</td>
                    <td className="num">{num(r.open, 0)}</td>
                    <td className="num" style={{ color: r.inQty ? "var(--ok)" : "" }}>
                      {r.inQty ? "+" + num(r.inQty, 0) : "—"}
                    </td>
                    <td className="num" style={{ color: r.outQty ? "var(--err)" : "" }}>
                      {r.outQty ? "−" + num(r.outQty, 0) : "—"}
                    </td>
                    <td className="num">
                      <b>{num(r.close, 0)}</b>
                    </td>
                    <td className="num">฿{num(r.value, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <Empty>คลังนี้ไม่มีสินค้าคงเหลือและไม่มีการเคลื่อนไหวในช่วงที่เลือก</Empty>
          )}

          <h4 style={{ margin: "20px 0 9px", fontSize: 14.5 }}>
            รายการเคลื่อนไหวล่าสุด {moves.length >= 50 ? "(50 รายการแรก)" : ""}
          </h4>
          {moves.length ? (
            <TableWrap>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>วันที่</th>
                  <th style={{ minWidth: 130 }}>เลขที่เอกสาร</th>
                  <th style={{ width: 110 }}>ประเภท</th>
                  <th style={{ minWidth: 180 }}>สินค้า</th>
                  <th style={{ minWidth: 150 }}>ที่เก็บ</th>
                  <th className="num">เข้า / ออก</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((t) => {
                  // เครื่องหมายคิดจากมุมของคลังที่เลือกเสมอ
                  // การโอนใบเดียวกันจึงเป็น "ออก" ที่ต้นทาง และ "เข้า" ที่ปลายทาง
                  const d = movement(t, pick);
                  return (
                    <tr key={t.id}>
                      <td>{thDate(t.date)}</td>
                      <td className="code-cell">{t.docNo}</td>
                      <td>
                        <span className={"bdg " + TYPES[t.type].badge}>{TYPES[t.type].name}</span>
                      </td>
                      <td>{inv.prodName(t.productId)}</td>
                      <td style={{ fontSize: 13 }}>
                        {t.whTo === pick ? inv.locName(t.locTo) : inv.locName(t.locId)}
                      </td>
                      <td className="num" style={{ color: d >= 0 ? "var(--ok)" : "var(--err)" }}>
                        {(d > 0 ? "+" : d < 0 ? "−" : "") + num(Math.abs(d), 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          ) : (
            <Empty>ไม่มีรายการเคลื่อนไหวของคลังนี้ในช่วงที่เลือก</Empty>
          )}
        </Card>
      ) : null}
    </div>
  );
}
