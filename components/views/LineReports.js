"use client";

// รายงานงานผ่านไลน์ — ปริมาณงาน อัตราปิดการขาย และของที่ลูกค้าถามหา
//
// ตอบสามคำถามที่หน้าอื่นตอบไม่ได้:
//   1. งานจากไลน์มีเท่าไร และค้างอยู่กี่ใบ
//   2. ที่คุยไปแล้ว ปิดได้กี่เปอร์เซ็นต์ และใช้เวลาเฉลี่ยกี่ชั่วโมงกว่าจะออกเอกสาร
//   3. ลูกค้าถามหาอะไรทางไลน์ (รวมของที่สุดท้ายไม่ได้ขาย ซึ่งสำคัญที่สุด)
//
// ตัวเลขทุกตัวมาจาก lib/lineOrders.js ที่เดียว หน้าจอนี้มีหน้าที่แค่วาด

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import {
  LINE_ORDER_STATUS,
  lineSummary,
  orderStatusOf,
  topLineParties,
  topLineProducts,
  unmatchedWords,
} from "@/lib/lineOrders";
import { localISO, num, thDate, todayISO } from "@/lib/format";
import { HBarChart } from "../Charts";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { IcCart, IcChart, IcDownload, IcReport } from "../Icons";
import { Badge, Card, Empty, ExportPair, Kpi, PrintPair, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";
import { LINE_TABLES } from "./lineShared";

/** วันแรกของเดือนที่ย้อนไป n เดือน */
function monthsAgo(n) {
  const d = new Date();
  return localISO(new Date(d.getFullYear(), d.getMonth() - (n - 1), 1));
}

export default function LineReports({ onNavigate }) {
  const inv = useInv();

  // หน้านี้อ่านอย่างเดียว มีแค่สิทธิเปลี่ยนช่วงวันที่
  const perm = inv.perm("linereport");
  const { db } = inv;
  const toast = useToast();
  const print = usePrint();

  const [from, setFrom] = useState(() => monthsAgo(6));
  const [to, setTo] = useState(todayISO);

  const sum = useMemo(() => lineSummary(db, from, to), [db, from, to]);
  const products = useMemo(() => topLineProducts(db, from, to, 10), [db, from, to]);
  const parties = useMemo(() => topLineParties(db, from, to, 10), [db, from, to]);
  const words = useMemo(() => unmatchedWords(db, from, to, 10), [db, from, to]);

  const bad = from && to && from > to;

  function printSummary() {
    print({
      title: "รายงานงานผ่านไลน์",
      subtitle: thDate(from) + " – " + thDate(to),
      body: (
        <>
          <table style={{ marginBottom: 14 }}>
            <tbody>
              <tr><td>ข้อความที่รับเข้ามา</td><td style={{ textAlign: "right" }}>{num(sum.messages, 0)}</td></tr>
              <tr><td>คำสั่งซื้อทั้งหมด</td><td style={{ textAlign: "right" }}>{num(sum.orders, 0)}</td></tr>
              <tr><td>ยังค้างอยู่</td><td style={{ textAlign: "right" }}>{num(sum.open, 0)}</td></tr>
              <tr><td>ปิดงานแล้ว</td><td style={{ textAlign: "right" }}>{num(sum.closed, 0)}</td></tr>
              <tr><td>ปิดได้ (ออกเอกสาร)</td><td style={{ textAlign: "right" }}>{num(sum.won, 0)}</td></tr>
              <tr><td>อัตราปิดการขาย</td><td style={{ textAlign: "right" }}>{num(sum.winRate, 1)}%</td></tr>
              <tr><td>ใบเสนอราคาที่ออก</td><td style={{ textAlign: "right" }}>{num(sum.quotes, 0)}</td></tr>
              <tr><td>มูลค่าใบเสนอราคา</td><td style={{ textAlign: "right" }}>{num(sum.quoteValue, 2)}</td></tr>
              <tr><td>ใบขายที่มาจากไลน์</td><td style={{ textAlign: "right" }}>{num(sum.invoices, 0)}</td></tr>
              <tr><td>มูลค่าใบขาย</td><td style={{ textAlign: "right" }}>{num(sum.invValue, 2)}</td></tr>
            </tbody>
          </table>

          <h3>สินค้าที่ถูกถามมากที่สุด</h3>
          <table>
            <thead>
              <tr>
                <th>ลำดับ</th><th>สินค้า</th>
                <th style={{ textAlign: "right" }}>จำนวนที่ถูกสั่ง</th>
                <th style={{ textAlign: "right" }}>กี่ครั้ง</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={p.productId}>
                  <td>{i + 1}</td>
                  <td>{inv.prodName(p.productId)}</td>
                  <td style={{ textAlign: "right" }}>{num(p.qty, 0)}</td>
                  <td style={{ textAlign: "right" }}>{num(p.times, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ),
    });
  }

  if (!inv.lineReady) {
    return <SetupNotice feature="รายงานงานผ่านไลน์" tables={LINE_TABLES} />;
  }

  return (
    <div className="stack">
      <Card
        title="รายงานงานผ่านไลน์"
        actions={
          <>
            <ExportPair
              disabled={!sum.orders}
              toast={toast}
              onExport={(save) =>
                save(
                  ["รหัส", "วันที่", "ผู้ส่ง", "สถานะ", "จำนวนรายการ", "ใบเสนอราคา", "ใบขาย"],
                  (db.lineOrders || [])
                    .filter((o) => (!from || o.date >= from) && (!to || o.date <= to))
                    .map((o) => {
                      const qt = (db.quotes || []).find((x) => x.id === o.quoteId);
                      const iv = (db.invoices || []).find((x) => x.id === o.invoiceId);
                      return [
                        o.code, o.date, o.partyName, orderStatusOf(o.status).name,
                        (db.lineOrderItems || []).filter((x) => x.orderId === o.id).length,
                        qt ? qt.docNo : "", iv ? iv.docNo : "",
                      ];
                    }),
                  "งานผ่านไลน์.csv"
                )
              }
            />
            <PrintPair onPrint={printSummary} disabled={!sum.orders} toast={toast} />
          </>
        }
      >
        <div className="row" style={{ alignItems: "flex-end", marginBottom: 14 }}>
          <div style={{ minWidth: 150 }}>
            <label className="lbl" htmlFor="lr_from">ตั้งแต่วันที่</label>
            <input
              className="inp"
              type="date"
              id="lr_from"
              value={from}
              max={to || undefined}
              disabled={!perm.date}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div style={{ minWidth: 150 }}>
            <label className="lbl" htmlFor="lr_to">ถึงวันที่</label>
            <input
              className="inp"
              type="date"
              id="lr_to"
              value={to}
              min={from || undefined}
              disabled={!perm.date}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="row" style={{ gap: 6 }}>
            {[1, 3, 6, 12].map((n) => (
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
          {bad ? <Badge kind="warn">วันเริ่มอยู่หลังวันจบ — สลับวันที่ก่อน</Badge> : null}
        </div>

        <div className="grid g4" style={{ marginBottom: 14 }}>
          <Kpi
            icon={<IcDownload size={20} />}
            label="ข้อความที่รับเข้ามา"
            value={num(sum.messages, 0) + " ข้อความ"}
            sub={num(sum.orders, 0) + " คำสั่งซื้อ"}
          />
          <Kpi
            icon={<IcCart size={20} />}
            kind={sum.open ? "warn" : "ok"}
            label="ค้างอยู่"
            value={num(sum.open, 0) + " ใบ"}
            sub={"ปิดงานแล้ว " + num(sum.closed, 0) + " ใบ"}
          />
          <Kpi
            icon={<IcChart size={20} />}
            kind="info"
            label="อัตราปิดการขาย"
            value={num(sum.winRate, 1) + "%"}
            sub={"ปิดได้ " + num(sum.won, 0) + " จาก " + num(sum.closed, 0) + " ใบที่จบแล้ว"}
          />
          <Kpi
            icon={<IcReport size={20} />}
            kind="ok"
            label="มูลค่าที่ออกเอกสาร"
            value={"฿" + num(sum.quoteValue + sum.invValue, 0)}
            sub={
              "ใบเสนอราคา " + num(sum.quotes, 0) + " ใบ · ใบขาย " + num(sum.invoices, 0) + " ใบ"
            }
          />
        </div>

        <p className="hint" style={{ marginTop: 0 }}>
          อัตราปิดการขายนับจากใบที่จบแล้วเท่านั้น (ออกเอกสารหรือยกเลิก)
          ใบที่ยังคุยกันอยู่ไม่ถูกนับเป็นตัวหาร ไม่งั้นวันที่งานใหม่เข้ามาเยอะ ตัวเลขจะดิ่งลงทั้งที่ยังไม่มีใครแพ้งาน
          {sum.leadHours !== null ? (
            <>
              {" "}· เวลาเฉลี่ยจากลูกค้าทักมาจนออกเอกสาร <b>{num(sum.leadHours, 1)} ชั่วโมง</b>
            </>
          ) : null}
        </p>

        <TableWrap>
          <thead>
            <tr>
              <th style={{ minWidth: 200 }}>สถานะของคำสั่งซื้อ</th>
              <th className="num" style={{ width: 120 }}>จำนวนใบ</th>
              <th style={{ minWidth: 220 }}>สัดส่วน</th>
            </tr>
          </thead>
          <tbody>
            {LINE_ORDER_STATUS.map((s) => {
              const n = sum.byStatus[s.id] || 0;
              const pct = sum.orders ? Math.round((n / sum.orders) * 100) : 0;
              return (
                <tr key={s.id}>
                  <td>
                    <span className={"bdg " + s.badge}>{s.name}</span>
                  </td>
                  <td className="num">{num(n, 0)}</td>
                  <td>
                    <div className="bar-mini">
                      <div
                        style={{ width: pct + "%", height: "100%", background: "var(--brand-l)" }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </Card>

      <div className="grid g2">
        <Card title="สินค้าที่ลูกค้าถามหามากที่สุดทางไลน์">
          <p className="hint" style={{ marginTop: 0 }}>
            นับจากรายการในคำสั่งซื้อ ไม่ใช่จากใบขาย จึงรวมของที่สุดท้ายไม่ได้ขายด้วย
            ของที่ถูกถามบ่อยแต่ปิดไม่ได้ คือสิ่งที่ต้องรู้มากที่สุด
          </p>
          {products.length ? (
            <HBarChart
              items={products.map((p) => ({
                label: inv.prodName(p.productId),
                value: p.qty,
                color: "var(--brand-l)",
              }))}
            />
          ) : (
            <Empty>ยังไม่มีรายการสินค้าจากไลน์ในช่วงนี้</Empty>
          )}
        </Card>

        <Card title="คู่สนทนาที่สั่งของบ่อยที่สุด">
          {parties.length ? (
            <TableWrap>
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>ชื่อในไลน์</th>
                  <th className="num" style={{ width: 110 }}>คำสั่งซื้อ</th>
                  <th className="num" style={{ width: 110 }}>ปิดได้</th>
                  <th className="num" style={{ width: 110 }}>อัตราปิด</th>
                </tr>
              </thead>
              <tbody>
                {parties.map((p) => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    <td className="num">{num(p.orders, 0)}</td>
                    <td className="num">{num(p.won, 0)}</td>
                    <td className="num">
                      {p.orders ? num(Math.round((p.won / p.orders) * 1000) / 10, 1) + "%" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <Empty>ยังไม่มีคำสั่งซื้อในช่วงนี้</Empty>
          )}
        </Card>
      </div>

      <Card
        title="คำที่ระบบยังอ่านไม่ออก"
        actions={
          <button className="btn btn-o btn-sm" onClick={() => onNavigate && onNavigate("linealias")}>
            ไปสอนคำเรียกสินค้า
          </button>
        }
      >
        <p className="hint" style={{ marginTop: 0 }}>
          ทุกคำในนี้คือครั้งที่คนต้องมานั่งเลือกสินค้าเอง ยิ่งสอนไว้มาก งานต่อใบยิ่งน้อยลง
        </p>
        {words.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ minWidth: 300 }}>ข้อความที่อ่านไม่ออก</th>
                <th className="num" style={{ width: 120 }}>พบกี่ครั้ง</th>
              </tr>
            </thead>
            <tbody>
              {words.map((w) => (
                <tr key={w.word}>
                  <td style={{ fontSize: 13 }}>{w.word}</td>
                  <td className="num">{num(w.times, 0)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>ไม่มีคำที่อ่านไม่ออกในช่วงนี้ — ระบบอ่านได้ครบทุกบรรทัด</Empty>
        )}
      </Card>
    </div>
  );
}
