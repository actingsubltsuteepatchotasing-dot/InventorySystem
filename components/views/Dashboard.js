"use client";

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { TYPES } from "@/lib/constants";
import { stockMap, stockTotal, whTotal } from "@/lib/db";
import { monthsAgoISO, monthsBetween, num, thDate, todayISO } from "@/lib/format";
import { BarChart, HBarChart, Legend } from "../Charts";
import { IcAdjust, IcBox, IcChart, IcReport } from "../Icons";
import { Badge, Card, Empty, Kpi, TableWrap } from "../ui";

/** ช่วงเวลาสำเร็จรูปให้กดเลือกเร็ว ๆ */
const QUICK = [
  { id: "today", name: "วันนี้", from: () => todayISO() },
  { id: "m1", name: "เดือนนี้", from: () => monthsAgoISO(0) },
  { id: "m3", name: "3 เดือน", from: () => monthsAgoISO(2) },
  { id: "m6", name: "6 เดือน", from: () => monthsAgoISO(5) },
  { id: "m12", name: "12 เดือน", from: () => monthsAgoISO(11) },
];

export default function Dashboard({ onNavigate }) {
  const inv = useInv();
  const { db } = inv;

  // ค่าเริ่มต้น 6 เดือนล่าสุด เท่ากับกราฟที่เคยแสดงไว้เดิม
  const [from, setFrom] = useState(() => monthsAgoISO(5));
  const [to, setTo] = useState(todayISO);

  const bad = !!from && !!to && from > to;

  const data = useMemo(() => {
    if (bad) return null;

    // ยอดคงเหลือคิด ณ วันสิ้นสุดของช่วง ไม่ใช่ ณ วันนี้เสมอไป
    // เลือกช่วงย้อนหลังแล้วจะได้เห็นภาพ ณ ตอนนั้นจริง ๆ
    const asOf = stockMap(db, to);
    const totalOf = (pid) => stockTotal(db, asOf, pid);

    const totalQty = db.products.reduce((sum, p) => sum + totalOf(p.id), 0);
    const totalVal = db.products.reduce((sum, p) => sum + totalOf(p.id) * (p.price || 0), 0);
    const low = db.products
      .map((p) => ({ p, qty: totalOf(p.id) }))
      .filter((x) => x.qty < x.p.min);

    const inRange = (t) => (!from || t.date >= from) && (!to || t.date <= to);
    const ranged = db.txns.filter(inRange);

    const months = monthsBetween(from, to);
    const inD = [];
    const outD = [];
    months.forEach((mo) => {
      let i = 0;
      let o = 0;
      ranged.forEach((t) => {
        if (t.date.slice(0, 7) !== mo.key) return;
        if (t.type === "RECEIVE") i += t.qty;
        else if (t.type === "ISSUE" || t.type === "SALE") o += t.qty;
        else if (t.type === "ADJUST") {
          if (t.qty > 0) i += t.qty;
          else o += -t.qty;
        }
      });
      inD.push(i);
      outD.push(o);
    });

    const recent = [...ranged].sort((a, b) => b.ts - a.ts).slice(0, 10);
    const byProvince = db.warehouses
      .map((w) => ({ label: w.province, value: whTotal(db, asOf, w.id), color: "var(--brand-l)" }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    return {
      totalQty,
      totalVal,
      low,
      rangeTx: ranged.length,
      months,
      inD,
      outD,
      recent,
      byProvince,
    };
  }, [db, from, to, bad]);

  function applyQuick(q) {
    setFrom(q.from());
    setTo(todayISO());
  }

  const FilterBar = (
    <Card title="ช่วงเวลาที่ดู" actions={<Badge>{data ? num(data.rangeTx, 0) + " รายการในช่วง" : "ช่วงวันที่ไม่ถูกต้อง"}</Badge>}>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div style={{ minWidth: 160 }}>
          <label className="lbl" htmlFor="d_from">ตั้งแต่วันที่</label>
          <input
            className="inp"
            type="date"
            id="d_from"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div style={{ minWidth: 160 }}>
          <label className="lbl" htmlFor="d_to">ถึงวันที่</label>
          <input
            className="inp"
            type="date"
            id="d_to"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="row" style={{ gap: 6 }}>
          {QUICK.map((q) => (
            <button key={q.id} className="btn btn-g btn-sm" onClick={() => applyQuick(q)}>
              {q.name}
            </button>
          ))}
        </div>
      </div>
      {bad ? (
        <div className="hint" style={{ marginTop: 10, color: "var(--err)" }}>
          วันที่เริ่มต้นอยู่หลังวันสิ้นสุด — กรุณาแก้ก่อน
        </div>
      ) : null}
    </Card>
  );

  if (!data) {
    return <div className="stack">{FilterBar}</div>;
  }

  return (
    <div className="stack">
      {FilterBar}

      <div className="grid g4">
        <Kpi
          icon={<IcBox size={18} stroke={1.9} />}
          label="รายการสินค้าทั้งหมด"
          value={num(db.products.length, 0) + " รายการ"}
          sub={db.warehouses.length + " คลังสินค้า · " + db.locations.length + " ที่เก็บ"}
        />
        <Kpi
          icon={<IcChart size={18} stroke={1.9} />}
          label="ยอดคงเหลือรวม"
          value={num(data.totalQty, 0) + " หน่วย"}
          sub={"มูลค่า ฿" + num(data.totalVal, 0) + " · ณ " + thDate(to)}
          kind="info"
        />
        <Kpi
          icon={<IcAdjust size={18} stroke={1.9} />}
          label="สินค้าต่ำกว่าจุดสั่งซื้อ"
          value={num(data.low.length, 0) + " รายการ"}
          sub={(data.low.length ? "ควรดำเนินการจัดหา" : "อยู่ในเกณฑ์ปกติ") + " · ณ " + thDate(to)}
          kind={data.low.length ? "warn" : ""}
        />
        <Kpi
          icon={<IcReport size={18} stroke={1.9} />}
          label="รายการเคลื่อนไหวในช่วง"
          value={num(data.rangeTx, 0) + " รายการ"}
          sub={thDate(from) + " – " + thDate(to)}
        />
      </div>

      <div className="grid g2">
        <Card
          title="ปริมาณรับเข้า–จ่ายออก"
          actions={<Badge>{data.months.length} เดือน</Badge>}
        >
          <div className="chart">
            <BarChart
              labels={data.months.map((m) => m.label)}
              series={[
                { name: "รับเข้า", color: "var(--brand-l)", data: data.inD },
                { name: "จ่ายออก", color: "#B3261E", data: data.outD },
              ]}
            />
          </div>
          <Legend
            items={[
              { name: "รับเข้า", color: "var(--brand-l)" },
              { name: "จ่ายออก", color: "#B3261E" },
            ]}
          />
        </Card>

        <Card title="ยอดคงเหลือแยกตามจังหวัด" actions={<Badge>ณ {thDate(to)}</Badge>}>
          <div className="chart">
            <HBarChart items={data.byProvince} />
          </div>
        </Card>
      </div>

      <div className="grid g2">
        <Card
          title="รายการเคลื่อนไหวล่าสุดในช่วง"
          actions={
            <button className="btn btn-o btn-sm" onClick={() => onNavigate("reports")}>
              ดูรายงานทั้งหมด
            </button>
          }
        >
          {data.recent.length ? (
            <TableWrap>
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>เลขที่</th>
                  <th>ประเภท</th>
                  <th>สินค้า</th>
                  <th>คลัง · ที่เก็บ</th>
                  <th className="num">จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((t) => (
                  <tr key={t.id}>
                    <td>{thDate(t.date)}</td>
                    <td className="code-cell">{t.docNo}</td>
                    <td>
                      <span className={"bdg " + TYPES[t.type].badge}>{TYPES[t.type].name}</span>
                    </td>
                    <td>{inv.prodName(t.productId)}</td>
                    <td style={{ fontSize: 13 }}>
                      {inv.whLocName(t.whId, t.locId)}
                      {t.whTo ? <b> → {inv.whLocName(t.whTo, t.locTo)}</b> : null}
                    </td>
                    <td className="num">{num(Math.abs(t.qty), 0)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <Empty>ยังไม่มีรายการ</Empty>
          )}
        </Card>

        <Card
          title="สินค้าต่ำกว่าจุดสั่งซื้อ"
          actions={<Badge kind={data.low.length ? "warn" : "ok"}>{data.low.length} รายการ</Badge>}
        >
          {data.low.length ? (
            <TableWrap>
              <thead>
                <tr>
                  <th>รหัส</th>
                  <th>สินค้า</th>
                  <th className="num">คงเหลือ</th>
                  <th className="num">จุดสั่งซื้อ</th>
                </tr>
              </thead>
              <tbody>
                {data.low.slice(0, 10).map((x) => (
                  <tr key={x.p.id}>
                    <td className="code-cell">{x.p.code}</td>
                    <td>{x.p.name}</td>
                    <td className="num" style={{ color: "var(--err)", fontWeight: 700 }}>
                      {num(x.qty, 0)}
                    </td>
                    <td className="num">{num(x.p.min, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <Empty>ทุกรายการมียอดคงเหลือเพียงพอ</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}
