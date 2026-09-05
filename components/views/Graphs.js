"use client";

// หน้าจอกราฟสรุป — เลือกดูได้ตามชื่อรายงาน (ยอดคงเหลือ / รับ / เบิก / โอน / ปรับปรุง / ขาย)

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { movement, movementInBin } from "@/lib/db";
import { num } from "@/lib/format";
import { BarChart, HBarChart, Legend, LineChart } from "../Charts";
import { Badge, Card, Empty, ProductSelect, WhLocFields } from "../ui";

const RANGES = [6, 12, 18, 24];

/**
 * แท็บกราฟ ล้อชื่อเดียวกับหน้ารายงาน จะได้นึกออกว่ากราฟไหนคู่กับรายงานไหน
 *
 * type = ชนิดรายการที่จะกรอง ถ้าเป็น null คือดูภาพรวมยอดคงเหลือ
 * ส่วนแท็บของหน้ารายงานที่เป็นเอกสาร (บิล / ใบตรวจนับ / บัตรสินค้า)
 * ไม่ได้เอามาด้วย เพราะเป็นการพิมพ์เอกสาร ไม่ใช่ตัวเลขที่เอามาเขียนกราฟได้
 */
const TABS = [
  { id: "stock", label: "กราฟสรุปยอดคงเหลือ", type: null },
  { id: "RECEIVE", label: "กราฟรับสินค้า", type: "RECEIVE" },
  { id: "ISSUE", label: "กราฟเบิกสินค้า", type: "ISSUE" },
  { id: "TRANSFER", label: "กราฟโอนสินค้า", type: "TRANSFER" },
  { id: "ADJUST", label: "กราฟปรับปรุง", type: "ADJUST" },
  { id: "SALE", label: "กราฟการขาย", type: "SALE" },
];

export default function Graphs() {
  const inv = useInv();
  const { db } = inv;

  const [tab, setTab] = useState("stock");
  const [months, setMonths] = useState(12);
  const [productId, setProductId] = useState("");
  const [whId, setWhId] = useState("");
  const [locId, setLocId] = useState("");

  const current = TABS.find((t) => t.id === tab) || TABS[0];
  const kind = current.type;

  const data = useMemo(() => {
    const now = new Date();
    const list = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      list.push({
        // เดือนตามเครื่องผู้ใช้ ไม่ใช่ UTC ไม่งั้นต้นเดือนจะเพี้ยนไปเดือนก่อนหน้า
        key: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"),
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
      .map((k) => ({ label: k, value: byCat[k], color: "var(--brand-l)" }))
      .sort((a, b) => b.value - a.value);

    const topProd = db.products
      .map((p) => ({
        label: p.name,
        value: whId ? inv.stockOf(p.id, whId) : inv.stockTotal(p.id),
        color: "var(--brand)",
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    /* ------------------------------------- ตัวเลขเฉพาะชนิดรายการที่เลือก */
    const rows = kind ? db.txns.filter((t) => t.type === kind && match(t)) : [];

    // ปริมาณรายเดือน ใช้ค่าสัมบูรณ์เพราะกราฟนี้ดู "ทำไปเท่าไร" ไม่ใช่ทิศทาง
    // ยกเว้นการปรับปรุงที่ต้องแยกบวกกับลบ เพราะสองอย่างนี้คนละความหมายกัน
    const kindQty = [];
    const kindUp = [];
    const kindDown = [];
    list.forEach((mo) => {
      let q = 0;
      let up = 0;
      let down = 0;
      rows.forEach((t) => {
        if (t.date.slice(0, 7) !== mo.key) return;
        q += Math.abs(t.qty);
        if (t.qty >= 0) up += t.qty;
        else down += -t.qty;
      });
      kindQty.push(q);
      kindUp.push(up);
      kindDown.push(down);
    });

    // 10 อันดับสินค้าของชนิดรายการนี้
    const perProduct = {};
    rows.forEach((t) => {
      perProduct[t.productId] = (perProduct[t.productId] || 0) + Math.abs(t.qty);
    });
    const kindTop = Object.keys(perProduct)
      .map((id) => ({ label: inv.prodName(id), value: perProduct[id], color: "var(--brand)" }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // แยกตามคลัง ดูว่าที่ไหนเคลื่อนไหวเยอะ
    const perWh = {};
    rows.forEach((t) => {
      perWh[t.whId] = (perWh[t.whId] || 0) + Math.abs(t.qty);
    });
    const kindByWh = Object.keys(perWh)
      .map((id) => ({ label: inv.whName(id), value: perWh[id], color: "var(--brand-l)" }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // มูลค่ารายเดือน ใช้เฉพาะกราฟการขาย
    const kindValue = list.map((mo) =>
      rows
        .filter((t) => t.date.slice(0, 7) === mo.key)
        .reduce((sum, t) => {
          const pr = inv.prod(t.productId);
          return sum + Math.abs(t.qty) * (pr ? pr.price : 0);
        }, 0)
    );

    return {
      labels: list.map((x) => x.label),
      inD,
      outD,
      balD,
      catItems,
      topProd,
      count: rows.length,
      kindQty,
      kindUp,
      kindDown,
      kindTop,
      kindByWh,
      kindValue,
    };
  }, [db, months, productId, whId, locId, kind, inv]);

  const sum = (a) => a.reduce((x, y) => x + y, 0);

  return (
    <>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            className="tab"
            role="tab"
            aria-selected={t.id === tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="stack">
        <Card title="ตัวกรองกราฟ">
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div style={{ minWidth: 160 }}>
              <label className="lbl" htmlFor="g_m">ช่วงเวลา</label>
              <select
                className="sel"
                id="g_m"
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
              >
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

        {/* ---------------- ภาพรวมยอดคงเหลือ ---------------- */}
        {!kind ? (
          <>
            <Card title="ปริมาณคงเหลือ (แนวโน้มขึ้น-ลง)" actions={<Badge>ยอดสะสมปลายเดือน</Badge>}>
              <div className="chart">
                <LineChart data={data.balD} labels={data.labels} color="var(--brand)" height={260} />
              </div>
            </Card>

            <Card title="ปริมาณรับเข้า เทียบกับ จ่ายออก">
              <div className="chart">
                <BarChart
                  labels={data.labels}
                  height={270}
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
              <div className="row" style={{ marginTop: 12 }}>
                <Badge kind="ok">รับเข้ารวม {num(sum(data.inD), 0)}</Badge>
                <Badge kind="err">จ่ายออกรวม {num(sum(data.outD), 0)}</Badge>
                <Badge kind="info">
                  คงเหลือปัจจุบัน {num(data.balD[data.balD.length - 1] || 0, 0)}
                </Badge>
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
          </>
        ) : null}

        {/* ---------------- กราฟเฉพาะชนิดรายการ ---------------- */}
        {kind && data.count === 0 ? (
          <Card title={current.label}>
            <Empty>ไม่มีรายการในช่วงเวลาและตัวกรองที่เลือก</Empty>
          </Card>
        ) : null}

        {kind && data.count > 0 ? (
          <>
            <Card
              title={current.label + " รายเดือน"}
              actions={
                <>
                  <Badge kind="info">{num(data.count, 0)} รายการ</Badge>
                  <Badge>รวม {num(sum(data.kindQty), 0)} หน่วย</Badge>
                </>
              }
            >
              <div className="chart">
                {kind === "ADJUST" ? (
                  /* ปรับปรุงต้องแยกบวกกับลบ เพราะรวมกันแล้วหักล้างจนดูเหมือนไม่มีอะไรเกิดขึ้น */
                  <BarChart
                    labels={data.labels}
                    height={270}
                    series={[
                      { name: "ปรับเพิ่ม", color: "var(--brand-l)", data: data.kindUp },
                      { name: "ปรับลด", color: "#B3261E", data: data.kindDown },
                    ]}
                  />
                ) : (
                  <BarChart
                    labels={data.labels}
                    height={270}
                    series={[{ name: current.label, color: "var(--brand)", data: data.kindQty }]}
                  />
                )}
              </div>
              {kind === "ADJUST" ? (
                <Legend
                  items={[
                    { name: "ปรับเพิ่ม", color: "var(--brand-l)" },
                    { name: "ปรับลด", color: "#B3261E" },
                  ]}
                />
              ) : null}
            </Card>

            {kind === "SALE" ? (
              <Card
                title="มูลค่าการขายรายเดือน"
                actions={<Badge kind="ok">รวม ฿{num(sum(data.kindValue), 0)}</Badge>}
              >
                <div className="chart">
                  <LineChart
                    data={data.kindValue}
                    labels={data.labels}
                    color="var(--brand)"
                    height={250}
                  />
                </div>
              </Card>
            ) : null}

            <div className="grid g2">
              <Card title={"10 อันดับสินค้า — " + current.label}>
                <div className="chart">
                  <HBarChart items={data.kindTop} />
                </div>
              </Card>
              <Card title={"แยกตามคลัง — " + current.label}>
                <div className="chart">
                  <HBarChart items={data.kindByWh} />
                </div>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
