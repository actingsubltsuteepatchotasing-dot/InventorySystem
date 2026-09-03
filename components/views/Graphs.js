"use client";

// หน้าจอกราฟสรุป — ปริมาณขึ้น-ลง และยอดคงเหลือ

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { movement, movementInBin } from "@/lib/db";
import { num } from "@/lib/format";
import { BarChart, HBarChart, Legend, LineChart } from "../Charts";
import { Badge, Card, ProductSelect, WhLocFields } from "../ui";

const RANGES = [6, 12, 18, 24];

export default function Graphs() {
  const inv = useInv();
  const { db } = inv;

  const [months, setMonths] = useState(12);
  const [productId, setProductId] = useState("");
  const [whId, setWhId] = useState("");
  const [locId, setLocId] = useState("");

  const data = useMemo(() => {
    const now = new Date();
    const list = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      list.push({
        key: d.toISOString().slice(0, 7),
        label:
          d.toLocaleDateString("th-TH", { month: "short" }) +
          (months > 6 ? " " + String((d.getFullYear() + 543) % 100) : ""),
      });
    }

    const match = (t) =>
      (!productId || t.productId === productId) &&
      (!whId || t.whId === whId || t.whTo === whId) &&
      (!locId || t.locId === locId || t.locTo === locId);

    // เลือกที่เก็บแล้วให้ดูการขึ้นลงของช่องนั้น ไม่ใช่ของทั้งคลัง
    const mvOf = (t) => (locId ? movementInBin(t, locId) : movement(t, whId));

    // ยอดสะสมก่อนช่วงแรกที่แสดง
    let running = 0;
    db.txns.forEach((t) => {
      if (!match(t)) return;
      if (t.date.slice(0, 7) < list[0].key) running += mvOf(t);
    });

    const inD = [];
    const outD = [];
    const balD = [];
    list.forEach((mo) => {
      let i = 0;
      let o = 0;
      let net = 0;
      db.txns.forEach((t) => {
        if (!match(t) || t.date.slice(0, 7) !== mo.key) return;
        const mv = mvOf(t);
        if (mv > 0) i += mv;
        else if (mv < 0) o += -mv;
        net += mv;
      });
      running += net;
      inD.push(i);
      outD.push(o);
      balD.push(running);
    });

    // ยอดคงเหลือแยกตามหมวดหมู่
    const byCat = {};
    db.products.forEach((p) => {
      const q = whId ? inv.stockOf(p.id, whId) : inv.stockTotal(p.id);
      byCat[p.cat] = (byCat[p.cat] || 0) + q;
    });
    const catItems = Object.keys(byCat)
      .map((k) => ({ label: k, value: byCat[k], color: "#0F8A4D" }))
      .sort((a, b) => b.value - a.value);

    const topProd = db.products
      .map((p) => ({
        label: p.name,
        value: whId ? inv.stockOf(p.id, whId) : inv.stockTotal(p.id),
        color: "#00693C",
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return { labels: list.map((x) => x.label), inD, outD, balD, catItems, topProd };
  }, [db, months, productId, whId, locId, inv]);

  return (
    <div className="stack">
      <Card title="ตัวกรองกราฟ">
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ minWidth: 160 }}>
            <label className="lbl" htmlFor="g_m">ช่วงเวลา</label>
            <select className="sel" id="g_m" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {RANGES.map((n) => (
                <option key={n} value={n}>
                  {n} เดือนล่าสุด
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 220 }}>
            <label className="lbl" htmlFor="g_p">สินค้า</label>
            <ProductSelect db={db} id="g_p" value={productId} onChange={setProductId} includeAll />
          </div>
          <div className="form-grid" style={{ margin: 0, minWidth: 400, flex: "1 1 400px" }}>
            <WhLocFields
              db={db}
              idPrefix="g"
              whId={whId}
              locId={locId}
              includeAll
              whAllLabel="ทุกคลัง"
              locAllLabel="ทุกที่เก็บ"
              onChange={(w, l) => {
                setWhId(w);
                setLocId(l);
              }}
            />
          </div>
        </div>
      </Card>

      <Card title="ปริมาณคงเหลือ (แนวโน้มขึ้น-ลง)" actions={<Badge>ยอดสะสมปลายเดือน</Badge>}>
        <div className="chart">
          <LineChart data={data.balD} labels={data.labels} color="#00693C" height={260} />
        </div>
      </Card>

      <Card title="ปริมาณรับเข้า เทียบกับ จ่ายออก">
        <div className="chart">
          <BarChart
            labels={data.labels}
            height={270}
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
        <div className="row" style={{ marginTop: 12 }}>
          <Badge kind="ok">รับเข้ารวม {num(data.inD.reduce((a, b) => a + b, 0), 0)}</Badge>
          <Badge kind="err">จ่ายออกรวม {num(data.outD.reduce((a, b) => a + b, 0), 0)}</Badge>
          <Badge kind="info">คงเหลือปัจจุบัน {num(data.balD[data.balD.length - 1] || 0, 0)}</Badge>
        </div>
      </Card>

      <div className="grid g2">
        <Card title="ยอดคงเหลือแยกตามหมวดหมู่">
          <div className="chart">
            <HBarChart items={data.catItems} />
          </div>
        </Card>
        <Card title="10 อันดับสินค้าคงเหลือสูงสุด">
          <div className="chart">
            <HBarChart items={data.topProd} />
          </div>
        </Card>
      </div>
    </div>
  );
}
