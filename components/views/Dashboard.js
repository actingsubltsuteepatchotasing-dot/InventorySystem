"use client";

import { useMemo } from "react";
import { useInv } from "@/lib/store";
import { TYPES } from "@/lib/constants";
import { num, thDate, todayISO } from "@/lib/format";
import { BarChart, HBarChart, Legend } from "../Charts";
import { IcAdjust, IcBox, IcChart, IcReport } from "../Icons";
import { Badge, Card, Empty, Kpi, TableWrap } from "../ui";

export default function Dashboard({ onNavigate }) {
  const inv = useInv();
  const { db } = inv;

  const data = useMemo(() => {
    const totalQty = db.products.reduce((s, p) => s + inv.stockTotal(p.id), 0);
    const totalVal = db.products.reduce((s, p) => s + inv.stockTotal(p.id) * (p.price || 0), 0);
    const low = db.products.filter((p) => inv.stockTotal(p.id) < p.min);
    const today = todayISO();
    const todayTx = db.txns.filter((t) => t.date === today).length;

    // 6 เดือนล่าสุด
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: d.toISOString().slice(0, 7),
        label: d.toLocaleDateString("th-TH", { month: "short" }),
      });
    }
    const inD = [];
    const outD = [];
    months.forEach((mo) => {
      let i = 0;
      let o = 0;
      db.txns.forEach((t) => {
        if (t.date.slice(0, 7) !== mo.key) return;
        if (t.type === "RECEIVE") i += t.qty;
        else if (t.type === "ISSUE") o += t.qty;
        else if (t.type === "ADJUST") {
          if (t.qty > 0) i += t.qty;
          else o += -t.qty;
        }
      });
      inD.push(i);
      outD.push(o);
    });

    const recent = [...db.txns].sort((a, b) => b.ts - a.ts).slice(0, 10);
    const byProvince = db.warehouses
      .map((w) => ({ label: w.province, value: inv.whTotal(w.id), color: "#0F8A4D" }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    return { totalQty, totalVal, low, today, todayTx, months, inD, outD, recent, byProvince };
  }, [db, inv]);

  return (
    <div className="stack">
      <div className="grid g4">
        <Kpi
          icon={<IcBox size={18} stroke={1.9} />}
          label="รายการสินค้าทั้งหมด"
          value={num(db.products.length, 0) + " รายการ"}
          sub={db.warehouses.length + " คลังสินค้า"}
        />
        <Kpi
          icon={<IcChart size={18} stroke={1.9} />}
          label="ยอดคงเหลือรวม"
          value={num(data.totalQty, 0) + " หน่วย"}
          sub={"มูลค่า ฿" + num(data.totalVal, 0)}
          kind="info"
        />
        <Kpi
          icon={<IcAdjust size={18} stroke={1.9} />}
          label="สินค้าต่ำกว่าจุดสั่งซื้อ"
          value={num(data.low.length, 0) + " รายการ"}
          sub={data.low.length ? "ควรดำเนินการจัดหา" : "อยู่ในเกณฑ์ปกติ"}
          kind={data.low.length ? "warn" : ""}
        />
        <Kpi
          icon={<IcReport size={18} stroke={1.9} />}
          label="รายการวันนี้"
          value={num(data.todayTx, 0) + " รายการ"}
          sub={thDate(data.today)}
        />
      </div>

      <div className="grid g2">
        <Card title="ปริมาณรับเข้า–จ่ายออก ย้อนหลัง 6 เดือน">
          <div className="chart">
            <BarChart
              labels={data.months.map((m) => m.label)}
              series={[
                { name: "รับเข้า", color: "#0F8A4D", data: data.inD },
                { name: "จ่ายออก", color: "#B3261E", data: data.outD },
              ]}
            />
          </div>
          <Legend
            items={[
              { name: "รับเข้า", color: "#0F8A4D" },
              { name: "จ่ายออก", color: "#B3261E" },
            ]}
          />
        </Card>

        <Card title="ยอดคงเหลือแยกตามจังหวัด">
          <div className="chart">
            <HBarChart items={data.byProvince} />
          </div>
        </Card>
      </div>

      <div className="grid g2">
        <Card
          title="รายการเคลื่อนไหวล่าสุด"
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
                {data.low.slice(0, 10).map((p) => (
                  <tr key={p.id}>
                    <td className="code-cell">{p.code}</td>
                    <td>{p.name}</td>
                    <td className="num" style={{ color: "var(--err)", fontWeight: 700 }}>
                      {num(inv.stockTotal(p.id), 0)}
                    </td>
                    <td className="num">{num(p.min, 0)}</td>
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
