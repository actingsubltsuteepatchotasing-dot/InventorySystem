"use client";

// Quick View — หน้าดูยอดขายเร็ว ๆ เน้นเปิดบนโทรศัพท์
//
// ต่างจากแดชบอร์ดตรงเจตนา:
//   แดชบอร์ด  เปิดค้างบนจอคอมพิวเตอร์ เลือกได้ละเอียด การ์ดเยอะ
//   หน้านี้    เปิดบนมือถือระหว่างเดินทาง ตอบคำถามเดียวให้เร็วที่สุด —
//              "ตอนนี้ขายได้เท่าไร เทียบเป้าแล้วเป็นยังไง"
//
// จึงออกแบบให้:
//   ตัวเลขใหญ่อ่านจากระยะแขน ไม่ต้องซูม
//   ตัวกรองสามอัน (ช่วงเวลา · พนักงานขาย · ยี่ห้อ) วางเรียงลงมา กดด้วยนิ้วโป้งได้
//   กราฟหนึ่งอันพอ ไม่ยัดหลายอันจนต้องเลื่อนหา
//   ตารางลูกค้าเรียงจากมากไปน้อย เพราะคำถามถัดไปมักเป็น "ใครซื้อเยอะสุด"
//
// เทียบเป้าด้วยยอดก่อนภาษี ให้ตรงกับกติกาที่หน้ากำหนดเป้าขายใช้ (ดู lib/targets.js)

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { compare, valuesOf } from "@/lib/targets";
import { monthsAgoISO, num, thDate, todayISO } from "@/lib/format";
import { BarChart, DonutChart, HBarChart, Legend } from "../Charts";
import { Badge, Card, Empty, SearchSelect, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

/** ช่วงเวลาที่ใช้บ่อยตอนดูบนมือถือ */
const QUICK = [
  { id: "today", name: "วันนี้", from: () => todayISO() },
  { id: "m1", name: "เดือนนี้", from: () => monthsAgoISO(0) },
  { id: "m3", name: "3 เดือน", from: () => monthsAgoISO(2) },
  { id: "m6", name: "6 เดือน", from: () => monthsAgoISO(5) },
  { id: "m12", name: "12 เดือน", from: () => monthsAgoISO(11) },
];

const CHARTS = [
  { id: "bar", name: "กราฟแท่ง" },
  { id: "hbar", name: "แท่งนอน" },
  { id: "donut", name: "กราฟโดนัท" },
];

export default function QuickView({ onNavigate }) {
  const inv = useInv();
  const perm = inv.perm("quick");
  const { db } = inv;

  const [from, setFrom] = useState(() => monthsAgoISO(0));
  const [to, setTo] = useState(todayISO);
  const [salesId, setSalesId] = useState("");
  const [brand, setBrand] = useState("");
  const [chart, setChart] = useState("bar");

  const people = useMemo(
    () => (db.salespersons || []).slice().sort((a, b) => a.code.localeCompare(b.code, "th")),
    [db.salespersons]
  );

  const data = useMemo(() => {
    const byId = new Map((db.products || []).map((p) => [p.id, p]));

    const invoices = (db.invoices || []).filter((v) => {
      if (from && v.date < from) return false;
      if (to && v.date > to) return false;
      if (salesId && v.salesId !== salesId) return false;
      return true;
    });

    /*
     * เลือกยี่ห้อแล้วต้องนับเฉพาะบรรทัดของยี่ห้อนั้น ไม่ใช่ทั้งใบ
     * เพราะใบเดียวมีหลายยี่ห้อได้ ถ้านับทั้งใบ ยอดของยี่ห้ออื่นจะถูกนับซ้ำเข้ามา
     */
    const items = (db.invoiceItems || []).filter((i) => {
      const v = invoices.find((x) => x.id === i.invoiceId);
      if (!v) return false;
      if (!brand) return true;
      const p = byId.get(i.productId);
      return p && p.brand === brand;
    });

    const ids = new Set(items.map((i) => i.invoiceId));
    const docs = brand ? invoices.filter((v) => ids.has(v.id)) : invoices;

    const amount = brand
      ? items.reduce((s, i) => s + (Number(i.amount) || 0), 0)
      : invoices.reduce((s, v) => s + (Number(v.base) || 0), 0);
    const qty = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);

    // ยอดรายลูกค้า เรียงมากไปน้อย
    const custMap = {};
    docs.forEach((v) => {
      const key = (v.custCode ? v.custCode + " " : "") + (v.custName || "(ไม่ระบุลูกค้า)");
      const add = brand
        ? items.filter((i) => i.invoiceId === v.id).reduce((s, i) => s + (Number(i.amount) || 0), 0)
        : Number(v.base) || 0;
      custMap[key] = (custMap[key] || 0) + add;
    });
    const byCust = Object.keys(custMap)
      .map((k) => ({ label: k, value: custMap[k], color: "var(--brand)" }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);

    // ยอดรายพนักงานขาย
    const spMap = {};
    docs.forEach((v) => {
      const key = v.salesName || v.salesCode || "(ไม่ระบุพนักงานขาย)";
      const add = brand
        ? items.filter((i) => i.invoiceId === v.id).reduce((s, i) => s + (Number(i.amount) || 0), 0)
        : Number(v.base) || 0;
      spMap[key] = (spMap[key] || 0) + add;
    });
    const bySales = Object.keys(spMap)
      .map((k) => ({ label: k, value: spMap[k], color: "#6D28D9" }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);

    // ยอดรายยี่ห้อ (ตอนไม่ได้กรองยี่ห้อ จึงเห็นภาพรวมว่ายี่ห้อไหนขายดี)
    const brMap = {};
    (db.invoiceItems || []).forEach((i) => {
      if (!invoices.some((v) => v.id === i.invoiceId)) return;
      const p = byId.get(i.productId);
      const k = (p && p.brand) || "(ไม่ระบุยี่ห้อ)";
      brMap[k] = (brMap[k] || 0) + (Number(i.amount) || 0);
    });
    const byBrand = Object.keys(brMap)
      .map((k) => ({ label: k, value: brMap[k], color: "var(--brand-l)" }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);

    /*
     * เป้าที่เข้าเกณฑ์ของสิ่งที่กรองอยู่
     * เอาเป้าที่ "ครอบคลุมสิ่งที่ดูอยู่" มารวมกัน — เป้าที่ระบุพนักงานคนอื่น
     * หรือยี่ห้ออื่นไม่นับ ส่วนเป้าที่เว้นว่างไว้ถือว่าครอบคลุมทุกอย่าง
     */
    const years = [...new Set([from, to].filter(Boolean).map((d) => Number(d.slice(0, 4))))];
    const goals = (db.salesTargets || []).filter((t) => {
      if (!years.includes(Number(t.year))) return false;
      if (salesId && t.salesId && t.salesId !== salesId) return false;
      if (brand && t.brand && t.brand !== brand) return false;
      return true;
    });
    const goal = goals.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const goalRows = goals.map((t) => compare(db, t));

    return { docs, amount, qty, byCust, bySales, byBrand, goal, goalRows };
  }, [db, from, to, salesId, brand]);

  const pct = data.goal > 0 ? (data.amount / data.goal) * 100 : null;

  /** ข้อมูลของกราฟหลัก — เปลี่ยนตามสิ่งที่กำลังกรองอยู่ */
  const mainItems = brand ? data.bySales : data.byBrand;
  const mainTitle = brand ? "ยอดขายแยกตามพนักงานขาย" : "ยอดขายแยกตามยี่ห้อสินค้า";

  /*
   * ฐานข้อมูลยังไม่มีตารางของฟีเจอร์นี้ = บอกให้ชัดว่าต้องทำอะไร
   *
   * เดิมหน้านี้แสดงตัวเลขศูนย์เฉย ๆ ซึ่งดูไม่ออกว่าเป็นเพราะยังไม่มีข้อมูล
   * หรือเพราะระบบยังไม่พร้อม คนใช้จึงเข้าใจว่าหน้าจอนี้ยังไม่ได้ทำ
   */
  if (!inv.targetsReady) {
    return <SetupNotice feature="หน้าจอ Quick View" tables={["sales_targets", "salespersons"]} />;
  }

  return (
    <div className="stack quick">
      <Card
        title="ดูยอดขาย"
        actions={
          onNavigate ? (
            <button
              className="btn btn-o btn-sm"
              onClick={() => onNavigate("targets")}
              title="ไปหน้ากำหนดเป้าขาย"
            >
              ตั้งเป้าขาย
            </button>
          ) : null
        }
      >
        <div className="quick-filters">
          <div className="field">
            <label className="lbl" htmlFor="q_from">ตั้งแต่วันที่</label>
            <input
              className="inp"
              type="date"
              id="q_from"
              value={from}
              disabled={!perm.date}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="q_to">ถึงวันที่</label>
            <input
              className="inp"
              type="date"
              id="q_to"
              value={to}
              disabled={!perm.date}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="q_sp">พนักงานขาย</label>
            <SearchSelect
              id="q_sp"
              value={salesId}
              onChange={setSalesId}
              options={people.map((p) => ({ value: p.id, code: p.code, label: p.name }))}
              emptyLabel="ทุกคน"
              notFound="ไม่พบพนักงานขายที่ตรงกับ"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="q_br">ยี่ห้อสินค้า</label>
            <SearchSelect
              id="q_br"
              value={brand}
              onChange={setBrand}
              options={valuesOf(db, "brand").map((x) => ({ value: x, label: x }))}
              emptyLabel="ทุกยี่ห้อ"
              notFound="ไม่พบยี่ห้อที่ตรงกับ"
            />
          </div>
        </div>

        <div className="cs-tabs" style={{ marginTop: 10, marginBottom: 0 }}>
          {QUICK.map((q) => (
            <button
              key={q.id}
              className="cs-tab"
              disabled={!perm.date}
              onClick={() => {
                setFrom(q.from());
                setTo(todayISO());
              }}
            >
              {q.name}
            </button>
          ))}
        </div>
      </Card>

      {/* ตัวเลขใหญ่ ตอบคำถามหลักในหน้าจอเดียวโดยไม่ต้องเลื่อน */}
      <Card title="ยอดขายในช่วงที่เลือก">
        <div className="quick-big">
          <div className="qb">
            <span>ยอดขาย (ก่อนภาษี)</span>
            <b>฿{num(data.amount, 0)}</b>
            <em>
              {num(data.docs.length, 0)} ใบ
              {data.qty ? " · " + num(data.qty, 0) + " หน่วย" : ""}
            </em>
          </div>

          <div className="qb">
            <span>เป้าขาย</span>
            <b>{data.goal ? "฿" + num(data.goal, 0) : "ยังไม่ได้ตั้งเป้า"}</b>
            <em>
              {data.goal
                ? "จาก " + num(data.goalRows.length, 0) + " เป้าที่เข้าเกณฑ์"
                : "ตั้งได้ที่เมนู กำหนดเป้าขาย"}
            </em>
          </div>

          <div className={"qb " + (pct === null ? "" : pct >= 100 ? "ok" : "warn")}>
            <span>ทำได้เทียบเป้า</span>
            <b>{pct === null ? "—" : num(pct, 0) + "%"}</b>
            <em>
              {pct === null
                ? "ไม่มีเป้าให้เทียบ"
                : data.amount >= data.goal
                  ? "เกินเป้า ฿" + num(data.amount - data.goal, 0)
                  : "ขาดอีก ฿" + num(data.goal - data.amount, 0)}
            </em>
          </div>
        </div>

        {pct !== null ? (
          <span className="tg-bar" style={{ marginTop: 12 }} title={num(pct, 0) + "%"}>
            <i style={{ width: Math.min(100, pct) + "%" }} className={pct >= 100 ? "on" : ""} />
            <b>{num(pct, 0)}%</b>
          </span>
        ) : null}

        <p className="muted" style={{ marginBottom: 0, fontSize: 12.5 }}>
          {thDate(from)} – {thDate(to)}
          {salesId ? " · เฉพาะพนักงานที่เลือก" : ""}
          {brand ? " · เฉพาะยี่ห้อ " + brand : ""}
          {" · เทียบด้วยยอดก่อนภาษี ให้ตรงกับกติกาของหน้ากำหนดเป้าขาย"}
        </p>
      </Card>

      <Card
        title={mainTitle}
        actions={
          <div className="cs-tabs" style={{ marginBottom: 0 }}>
            {CHARTS.map((c) => (
              <button
                key={c.id}
                className={"cs-tab" + (chart === c.id ? " on" : "")}
                onClick={() => setChart(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        }
      >
        {mainItems.length ? (
          <div className="chart">
            {chart === "donut" ? (
              <DonutChart items={mainItems} />
            ) : chart === "hbar" ? (
              <HBarChart items={mainItems} />
            ) : (
              <>
                <BarChart
                  labels={mainItems.slice(0, 12).map((x) => x.label)}
                  series={[
                    {
                      name: "ยอดขาย (บาท)",
                      color: "var(--brand-l)",
                      data: mainItems.slice(0, 12).map((x) => x.value),
                    },
                  ]}
                />
                <Legend items={[{ name: "ยอดขาย (บาท)", color: "var(--brand-l)" }]} />
              </>
            )}
          </div>
        ) : (
          <Empty>ยังไม่มียอดขายในช่วงที่เลือก</Empty>
        )}
      </Card>

      <Card
        title="ยอดขายรายลูกค้า (มากไปน้อย)"
        actions={<Badge kind={data.byCust.length ? "info" : "gray"}>{data.byCust.length} ราย</Badge>}
      >
        {data.byCust.length ? (
          <div className="doc-scroll" style={{ maxHeight: 420 }}>
            <TableWrap>
              <thead>
                <tr>
                  <th style={{ width: 52 }}>ที่</th>
                  <th style={{ minWidth: 200 }}>ลูกค้า</th>
                  <th className="num" style={{ width: 130 }}>ยอดขาย</th>
                  <th className="num" style={{ width: 90 }}>สัดส่วน</th>
                </tr>
              </thead>
              <tbody>
                {data.byCust.map((c, i) => (
                  <tr key={c.label}>
                    <td className="num">{i + 1}</td>
                    <td>{c.label}</td>
                    <td className="num">
                      <b>{num(c.value, 0)}</b>
                    </td>
                    <td className="num muted">
                      {data.amount ? num((c.value / data.amount) * 100, 1) + "%" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        ) : (
          <Empty>ยังไม่มียอดขายในช่วงที่เลือก</Empty>
        )}
      </Card>

      {data.goalRows.length ? (
        <Card title="เป้าที่เข้าเกณฑ์">
          <TableWrap>
            <thead>
              <tr>
                <th style={{ minWidth: 170 }}>เป้า</th>
                <th className="num" style={{ width: 120 }}>ยอดเป้า</th>
                <th className="num" style={{ width: 120 }}>ทำได้</th>
                <th className="num" style={{ width: 90 }}>%</th>
              </tr>
            </thead>
            <tbody>
              {data.goalRows.map((r) => (
                <tr key={r.target.id}>
                  <td>
                    {[
                      r.target.month ? "เดือน " + r.target.month : "ทั้งปี",
                      r.target.brand && "ยี่ห้อ " + r.target.brand,
                      r.target.grp && "กลุ่ม " + r.target.grp,
                      r.target.kind && "ประเภท " + r.target.kind,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </td>
                  <td className="num">{num(r.target.amount, 0)}</td>
                  <td className="num">{num(r.actual.amount, 0)}</td>
                  <td
                    className="num"
                    style={{ color: r.done ? "var(--ok)" : "var(--warn)", fontWeight: 700 }}
                  >
                    {r.pct === null ? "—" : num(r.pct, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      ) : null}
    </div>
  );
}
