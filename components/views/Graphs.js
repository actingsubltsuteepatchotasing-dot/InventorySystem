"use client";

// หน้าจอกราฟสรุป — เลือกดูได้ตามชื่อรายงาน (ยอดคงเหลือ / รับ / เบิก / โอน / ปรับปรุง / ขาย)

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { movement, movementInBin } from "@/lib/db";
import { localISO, monthsBetween, num, todayISO } from "@/lib/format";
import { BarChart, HBarChart, Legend, LineChart } from "../Charts";
import { Badge, Card, Empty, ProductSelect, WhLocFields } from "../ui";

/** ปุ่มลัดช่วงเวลา — ตั้งช่วงวันที่ให้ ไม่ได้เป็นค่ากรองแยกอีกตัว */
const QUICK = [3, 6, 12, 18, 24];

/** วันแรกของเดือนที่ย้อนไป n เดือน (ใช้กับปุ่มลัด) */
function monthsAgo(n) {
  const d = new Date();
  return localISO(new Date(d.getFullYear(), d.getMonth() - (n - 1), 1));
}

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

  // กราฟระดับ "เอกสาร" ไม่ใช่ระดับรายการเคลื่อนไหว
  // จึงอ่านจากตารางเอกสารโดยตรงและวัดเป็นมูลค่า ไม่ใช่จำนวนชิ้น
  { id: "docINVOICE", label: "กราฟใบขายสินค้าและบริการ", doc: "INVOICE" },
  { id: "docPURCHASE", label: "กราฟใบซื้อสินค้าและบริการ", doc: "PURCHASE" },
  { id: "docPURRET", label: "กราฟใบส่งคืนสินค้า", doc: "PURRET" },
];

/** เอกสารแต่ละชนิดอ่านจากตารางไหน และเรียกคู่ค้าว่าอะไร */
const DOC_SRC = {
  INVOICE: { rows: (db) => db.invoices || [], party: (v) => v.custName, label: "ลูกค้า" },
  PURCHASE: { rows: (db) => db.purchases || [], party: (v) => v.supName, label: "เจ้าหนี้" },
  PURRET: { rows: (db) => db.purchaseReturns || [], party: (v) => v.supName, label: "เจ้าหนี้" },
};

export default function Graphs() {
  const inv = useInv();
  const { db } = inv;

  const [tab, setTab] = useState("stock");
  /*
   * ช่วงเวลาเป็นช่วงวันที่จริง ไม่ใช่ "ย้อนหลัง n เดือน" อย่างเดียวเหมือนเดิม
   * เพราะเวลาปิดงบหรือดูย้อนหลังเฉพาะไตรมาส คนต้องระบุวันเริ่มกับวันจบเอง
   * ปุ่มลัดยังอยู่ แค่เปลี่ยนเป็นตัวตั้งช่วงวันที่ให้แทนที่จะเป็นค่ากรองแยกอีกตัว
   */
  const [from, setFrom] = useState(() => monthsAgo(12));
  const [to, setTo] = useState(todayISO);
  const [productId, setProductId] = useState("");
  const [whId, setWhId] = useState("");
  const [locId, setLocId] = useState("");

  const current = TABS.find((t) => t.id === tab) || TABS[0];
  const kind = current.type;
  const docKind = current.doc || null;

  const data = useMemo(() => {
    // แกนเดือนมาจากช่วงวันที่ที่เลือก จำกัดไว้ 36 เดือนกันกราฟถี่จนอ่านไม่ออก
    const list = monthsBetween(from, to, 36);

    // ช่วงวันที่ที่กลับหัว (เริ่มหลังจบ) ทำให้ไม่มีเดือนสักเดือน ต้องกันไว้ก่อน
    // ไม่งั้นบรรทัดที่อ่าน list[0] ข้างล่างจะพัง ทั้งที่แค่กรอกวันสลับกัน
    if (!list.length) {
      return {
        labels: [],
        inD: [],
        outD: [],
        balD: [],
        catItems: [],
        topProd: [],
        count: 0,
        kindQty: [],
        kindUp: [],
        kindDown: [],
        kindTop: [],
        kindByWh: [],
        kindValue: [],
      };
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
  }, [db, from, to, productId, whId, locId, kind, inv]);

  const sum = (a) => a.reduce((x, y) => x + y, 0);

  /**
   * ยอดรายเดือนของเอกสาร — มูลค่าสุทธิและจำนวนใบ
   * ตัวกรองสินค้า/คลัง/ที่เก็บใช้ไม่ได้กับกราฟชุดนี้ เพราะเป็นยอดระดับใบ ไม่ใช่ระดับบรรทัด
   */
  const docData = useMemo(() => {
    if (!docKind) return null;
    const src = DOC_SRC[docKind];
    const keys = monthsBetween(from, to, 36);

    const money = new Map(keys.map((k) => [k.key, 0]));
    const count = new Map(keys.map((k) => [k.key, 0]));
    const byParty = new Map();
    let total = 0;
    let docs = 0;

    src.rows(db).forEach((v) => {
      const k = String(v.date || "").slice(0, 7);
      if (!money.has(k)) return;
      money.set(k, money.get(k) + (Number(v.total) || 0));
      count.set(k, count.get(k) + 1);
      const name = src.party(v) || "(ไม่ระบุ)";
      byParty.set(name, (byParty.get(name) || 0) + (Number(v.total) || 0));
      total += Number(v.total) || 0;
      docs++;
    });

    return {
      label: src.label,
      total,
      docs,
      money: keys.map((k) => ({ label: k.label, value: money.get(k.key) })),
      count: keys.map((k) => ({ label: k.label, value: count.get(k.key) })),
      top: [...byParty.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
    };
  }, [db, from, to, docKind]);

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
            <div style={{ minWidth: 150 }}>
              <label className="lbl" htmlFor="g_from">ตั้งแต่วันที่</label>
              <input
                className="inp"
                type="date"
                id="g_from"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div style={{ minWidth: 150 }}>
              <label className="lbl" htmlFor="g_to">ถึงวันที่</label>
              <input
                className="inp"
                type="date"
                id="g_to"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="row" style={{ gap: 6 }}>
              {QUICK.map((n) => (
                <button
                  key={n}
                  className={"btn btn-sm " + (from === monthsAgo(n) && to === todayISO() ? "btn-p" : "btn-g")}
                  onClick={() => {
                    setFrom(monthsAgo(n));
                    setTo(todayISO());
                  }}
                >
                  {n} เดือน
                </button>
              ))}
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
        {!kind && !docKind ? (
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

        {/* ---------------- กราฟระดับเอกสาร ---------------- */}
        {docData && !docData.docs ? (
          <Card title={current.label}>
            <Empty>ไม่มีเอกสารในช่วงเวลาที่เลือก</Empty>
          </Card>
        ) : null}

        {docData && docData.docs > 0 ? (
          <>
            <Card
              title={current.label + " รายเดือน (มูลค่า)"}
              actions={
                <>
                  <Badge kind="info">{num(docData.docs, 0)} ใบ</Badge>
                  <Badge>รวม ฿{num(docData.total, 2)}</Badge>
                </>
              }
            >
              <BarChart data={docData.money} />
            </Card>

            <div className="grid g2">
              <Card title="จำนวนใบรายเดือน">
                <BarChart data={docData.count} />
              </Card>
              <Card title={"10 อันดับ" + docData.label + " (มูลค่า)"}>
                <HBarChart data={docData.top} />
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
