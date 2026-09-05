"use client";

// หน้าจอรายงาน 9 แท็บ — กรองด้วยช่วงวันที่ / คลัง / สินค้า พิมพ์และส่งออก CSV ได้ทุกแท็บ

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { TYPES } from "@/lib/constants";
import { movement } from "@/lib/db";
import { localISO, num, thDate, todayISO } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { Badge, Card, Empty, ProductSelect, TableWrap, WhLocFields } from "../ui";
import { PAY_METHODS } from "@/lib/constants";
import { CountSheetBody, ReceiptBody } from "./printBodies";

const TABS = [
  { id: "stock", label: "สรุปยอดคงเหลือ" },
  { id: "RECEIVE", label: "รายงานรับสินค้า" },
  { id: "ISSUE", label: "รายงานเบิกสินค้า" },
  { id: "TRANSFER", label: "รายงานโอนสินค้า" },
  { id: "ADJUST", label: "รายงานปรับปรุง" },
  { id: "SALE", label: "รายงานการขาย" },
  { id: "bills", label: "บิลขาย / ใบเสร็จ" },
  { id: "count", label: "ใบตรวจนับสินค้า" },
  { id: "card", label: "บัตรสินค้า (Stock Card)" },
];

function threeMonthsAgo() {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  // localISO ไม่ใช่ toISOString เพราะ UTC จะย้อนวันให้ในช่วงเช้ามืดของไทย
  return localISO(d);
}

export default function Reports() {
  const inv = useInv();

  /*
   * สิทธิของหน้าจอนี้ — ไม่ติ๊ก "แก้ไข" แล้วปุ่มบันทึกถูกปิด เข้ามาดูได้อย่างเดียว
   * ไม่ติ๊ก "เปลี่ยนวันที่" แล้วช่องวันที่ล็อกไว้ (ดูหน้ากำหนดสิทธิการใช้งาน)
   */
  const perm = inv.perm("reports");
  const { db } = inv;
  const toast = useToast();
  const print = usePrint();

  const [tab, setTab] = useState("stock");
  const [from, setFrom] = useState(threeMonthsAgo);
  const [to, setTo] = useState(todayISO);
  const [whId, setWhId] = useState("");
  const [locId, setLocId] = useState("");
  const [productId, setProductId] = useState("");

  const filter = { from, to, whId, locId, productId };

  const inRange = (t) => {
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (productId && t.productId !== productId) return false;
    if (whId && t.whId !== whId && t.whTo !== whId) return false;
    // กรองที่เก็บ: นับทั้งขาออกจากช่องนั้นและขาเข้าช่องนั้น (การโอน)
    if (locId && t.locId !== locId && t.locTo !== locId) return false;
    return true;
  };

  const FilterBar = (
    <div className="row" style={{ marginBottom: 15, alignItems: "flex-end" }}>
      <div style={{ minWidth: 150 }}>
        <label className="lbl" htmlFor="r_from">ตั้งแต่วันที่</label>
        <input className="inp" type="date" id="r_from" value={from} disabled={!perm.date} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div style={{ minWidth: 150 }}>
        <label className="lbl" htmlFor="r_to">ถึงวันที่</label>
        <input className="inp" type="date" id="r_to" value={to} disabled={!perm.date} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="form-grid" style={{ margin: 0, minWidth: 420, flex: "1 1 420px" }}>
        <WhLocFields
          db={db}
          idPrefix="r"
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
      <div style={{ minWidth: 220 }}>
        <label className="lbl" htmlFor="r_prod">สินค้า</label>
        <ProductSelect db={db} id="r_prod" value={productId} onChange={setProductId} includeAll />
      </div>
    </div>
  );

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

      {tab === "stock" && <StockReport {...{ inv, db, filter, FilterBar, print, toast }} />}
      {tab === "count" && <CountReport {...{ inv, db, filter, FilterBar, print }} />}
      {tab === "card" && <StockCard {...{ inv, db, filter, FilterBar, print, toast }} />}
      {tab === "bills" && <BillsReport {...{ inv, db, filter, FilterBar, print, toast }} />}
      {["RECEIVE", "ISSUE", "TRANSFER", "ADJUST", "SALE"].includes(tab) && (
        <TxnReport key={tab} type={tab} {...{ inv, db, inRange, filter, FilterBar, print, toast }} />
      )}
    </>
  );
}

/* ------------------------------------------- บิลขาย / พิมพ์ใบเสร็จซ้ำ */
function BillsReport({ inv, db, filter, FilterBar, print, toast }) {
  const bills = useMemo(
    () =>
      db.sales
        .filter((s) => {
          if (filter.from && s.date < filter.from) return false;
          if (filter.to && s.date > filter.to) return false;
          if (filter.whId && s.whId !== filter.whId) return false;
          if (filter.locId && s.locId !== filter.locId) return false;
          if (filter.productId) {
            return inv.itemsOfSale(s.id).some((i) => i.productId === filter.productId);
          }
          return true;
        })
        .sort((a, b) => b.ts - a.ts),
    [db.sales, db.saleItems, filter.from, filter.to, filter.whId, filter.locId, filter.productId, inv]
  );

  const totalSales = bills.reduce((s, b) => s + b.total, 0);
  const totalVat = bills.reduce((s, b) => s + b.vat, 0);
  const payName = (id) => {
    const m = PAY_METHODS.find((x) => x.id === id);
    return m ? m.name : id;
  };

  return (
    <Card
      title="บิลขาย / ใบเสร็จรับเงิน"
      actions={
        <button
          className="btn btn-g btn-sm"
          onClick={() => {
            if (!bills.length) return toast("ไม่มีข้อมูลสำหรับส่งออก", "warn");
            downloadCSV(
              ["วันที่", "เลขที่บิล", "คลัง", "ลูกค้า", "ยอดรวม", "ส่วนลด", "VAT", "ยอดสุทธิ", "วิธีชำระ", "ผู้ขาย"],
              bills.map((b) => [
                b.date, b.docNo, inv.whLocName(b.whId, b.locId), b.customer || "ลูกค้าทั่วไป",
                b.subtotal, b.discount, b.vat, b.total, payName(b.payMethod), b.user,
              ]),
              "บิลขาย.csv"
            );
            toast("ส่งออกไฟล์ CSV แล้ว");
          }}
        >
          ส่งออก CSV
        </button>
      }
    >
      {FilterBar}

      <div className="row" style={{ marginBottom: 13 }}>
        <Badge kind="info">{bills.length} บิล</Badge>
        <Badge kind="ok">ยอดขายรวม ฿{num(totalSales, 2)}</Badge>
        <Badge>VAT รวม ฿{num(totalVat, 2)}</Badge>
      </div>

      {bills.length ? (
        <TableWrap>
          <thead>
            <tr>
              <th>วันที่</th>
              <th>เลขที่บิล</th>
              <th>คลัง · ที่เก็บ</th>
              <th>ลูกค้า</th>
              <th className="num">รายการ</th>
              <th className="num">ยอดสุทธิ</th>
              <th>วิธีชำระ</th>
              <th>ผู้ขาย</th>
              <th style={{ width: 110 }} />
            </tr>
          </thead>
          <tbody>
            {bills.map((b) => {
              const items = inv.itemsOfSale(b.id);
              return (
                <tr key={b.id}>
                  <td>{thDate(b.date)}</td>
                  <td className="code-cell">{b.docNo}</td>
                  <td style={{ fontSize: 13 }}>{inv.whLocName(b.whId, b.locId)}</td>
                  <td>{b.customer || "ลูกค้าทั่วไป"}</td>
                  <td className="num">{items.length}</td>
                  <td className="num">
                    <b>{num(b.total, 2)}</b>
                  </td>
                  <td>{payName(b.payMethod)}</td>
                  <td style={{ fontSize: 12.5 }}>{b.user}</td>
                  <td>
                    <button
                      className="btn btn-o btn-sm"
                      onClick={() =>
                        print({
                          receipt: true,
                          title: "ใบเสร็จรับเงิน",
                          body: <ReceiptBody inv={inv} sale={b} items={items} />,
                        })
                      }
                    >
                      พิมพ์ใบเสร็จ
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>รวม {bills.length} บิล</td>
              <td className="num">{num(totalSales, 2)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </TableWrap>
      ) : (
        <Empty>ไม่พบบิลขายในช่วงเวลาที่เลือก</Empty>
      )}
    </Card>
  );
}

/* ------------------------------------------------ สรุปยอดคงเหลือ */
function StockReport({ inv, db, filter, FilterBar, print, toast }) {
  const rows = useMemo(
    () =>
      db.products
        .filter((p) => !filter.productId || p.id === filter.productId)
        .map((p) => {
          const q = filter.locId
            ? inv.placedIn(p.id, filter.locId)
            : filter.whId
              ? inv.stockOf(p.id, filter.whId)
              : inv.stockTotal(p.id);
          return { p, q, v: q * p.price };
        }),
    [db.products, filter.productId, filter.whId, filter.locId, db.placements, inv]
  );

  const totalQty = rows.reduce((s, r) => s + r.q, 0);
  const totalVal = rows.reduce((s, r) => s + r.v, 0);

  return (
    <Card
      title="สรุปยอดคงเหลือ"
      actions={
        <>
          <button
            className="btn btn-o btn-sm"
            onClick={() =>
              print({
                title: "รายงานสรุปยอดคงเหลือ",
                subtitle:
                  (filter.whId ? inv.whLocName(filter.whId, filter.locId) : "ทุกคลัง") +
                  " · ณ วันที่ " + thDate(todayISO()),
                body: (
                  <table>
                    <thead>
                      <tr>
                        <th>ลำดับ</th>
                        <th>รหัส</th>
                        <th>รายการสินค้า</th>
                        <th>หน่วย</th>
                        <th style={{ textAlign: "right" }}>คงเหลือ</th>
                        <th style={{ textAlign: "right" }}>มูลค่า (บาท)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={r.p.id}>
                          <td>{i + 1}</td>
                          <td>{r.p.code}</td>
                          <td>{r.p.name}</td>
                          <td>{r.p.unit}</td>
                          <td style={{ textAlign: "right" }}>{num(r.q, 0)}</td>
                          <td style={{ textAlign: "right" }}>{num(r.v, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4}>รวม</td>
                        <td style={{ textAlign: "right" }}>{num(totalQty, 0)}</td>
                        <td style={{ textAlign: "right" }}>{num(totalVal, 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                ),
              })
            }
          >
            พิมพ์
          </button>
          <button
            className="btn btn-g btn-sm"
            onClick={() => {
              downloadCSV(
                ["รหัส", "รายการสินค้า", "หมวดหมู่", "หน่วย", "คงเหลือ", "จุดสั่งซื้อ", "มูลค่า"],
                rows.map((r) => [r.p.code, r.p.name, r.p.cat, r.p.unit, r.q, r.p.min, r.v]),
                "สรุปยอดคงเหลือ.csv"
              );
              toast("ส่งออกไฟล์ CSV แล้ว");
            }}
          >
            ส่งออก CSV
          </button>
        </>
      }
    >
      {FilterBar}
      <TableWrap>
        <thead>
          <tr>
            <th>รหัส</th>
            <th>รายการสินค้า</th>
            <th>หมวดหมู่</th>
            <th>หน่วย</th>
            <th className="num">คงเหลือ</th>
            <th className="num">จุดสั่งซื้อ</th>
            <th className="num">มูลค่า (บาท)</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.p.id}>
              <td className="code-cell">{r.p.code}</td>
              <td>{r.p.name}</td>
              <td>{r.p.cat}</td>
              <td>{r.p.unit}</td>
              <td className="num">
                <b>{num(r.q, 0)}</b>
              </td>
              <td className="num">{num(r.p.min, 0)}</td>
              <td className="num">{num(r.v, 0)}</td>
              <td>
                <Badge kind={r.q < r.p.min ? "warn" : "ok"}>
                  {r.q < r.p.min ? "ต่ำกว่าเกณฑ์" : "ปกติ"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>รวม {rows.length} รายการ</td>
            <td className="num">{num(totalQty, 0)}</td>
            <td />
            <td className="num">{num(totalVal, 0)}</td>
            <td />
          </tr>
        </tfoot>
      </TableWrap>
    </Card>
  );
}

/* ------------------------------------------------- ใบตรวจนับสินค้า */
function CountReport({ inv, db, filter, FilterBar, print }) {
  const whId = filter.whId || db.warehouses[0].id;
  const w = inv.wh(whId);

  return (
    <Card
      title="ใบตรวจนับสินค้าคงคลัง"
      actions={
        <button
          className="btn btn-p btn-sm"
          onClick={() =>
            print({
              title: "ใบตรวจนับสินค้าคงคลัง",
              subtitle:
                (w ? w.name + " · จังหวัด" + w.province : "ทุกคลัง") + " · ณ วันที่ " + thDate(todayISO()),
              body: <CountSheetBody db={db} inv={inv} whId={whId} />,
            })
          }
        >
          พิมพ์ใบตรวจนับ
        </button>
      }
    >
      {FilterBar}
      <p style={{ marginBottom: 13, fontSize: 13.5, color: "var(--fg-muted)" }}>
        ใบตรวจนับจะพิมพ์ยอดตามบัญชีมาให้ พร้อมเว้นช่องสำหรับกรอกยอดที่นับได้จริง ผลต่าง และหมายเหตุ
        เมื่อตรวจนับเสร็จให้นำผลต่างไปบันทึกที่หน้าจอ “ปรับปรุงสินค้า”
      </p>
      <TableWrap>
        <thead>
          <tr>
            <th>ลำดับ</th>
            <th>รหัส</th>
            <th>รายการสินค้า</th>
            <th>หน่วย</th>
            <th className="num">ยอดตามบัญชี</th>
            <th>นับได้จริง</th>
            <th>ผลต่าง</th>
          </tr>
        </thead>
        <tbody>
          {db.products.map((p, i) => (
            <tr key={p.id}>
              <td>{i + 1}</td>
              <td className="code-cell">{p.code}</td>
              <td>{p.name}</td>
              <td>{p.unit}</td>
              <td className="num">{num(inv.stockOf(p.id, whId), 0)}</td>
              <td style={{ color: "var(--fg-faint)" }}>……………</td>
              <td style={{ color: "var(--fg-faint)" }}>……………</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </Card>
  );
}

/* --------------------------------------------------- บัตรสินค้า */
function StockCard({ inv, db, filter, FilterBar, print, toast }) {
  const pid = filter.productId || db.products[0].id;
  const p = inv.prod(pid);
  const wid = filter.whId;

  const { opening, rows, closing } = useMemo(() => {
    // ยอดยกมาก่อนช่วงที่เลือก
    let bal = 0;
    db.txns.forEach((t) => {
      if (t.productId !== pid) return;
      if (filter.from && t.date >= filter.from) return;
      bal += movement(t, wid);
    });
    const open = bal;

    const list = db.txns
      .filter((t) => {
        if (t.productId !== pid) return false;
        if (filter.from && t.date < filter.from) return false;
        if (filter.to && t.date > filter.to) return false;
        return true;
      })
      .sort((a, b) => a.ts - b.ts);

    const out = list.map((t) => {
      const mv = movement(t, wid);
      bal += mv;
      return { t, mv, bal };
    });

    return { opening: open, rows: out, closing: bal };
  }, [db.txns, pid, wid, filter.from, filter.to]);

  return (
    <Card
      title="บัตรสินค้า (Stock Card)"
      actions={
        <>
          <button
            className="btn btn-o btn-sm"
            onClick={() =>
              print({
                title: "บัตรสินค้า (Stock Card)",
                subtitle:
                  (p ? p.code + " · " + p.name : "") +
                  " · " +
                  (wid ? inv.whLocName(wid, filter.locId) : "ทุกคลัง") +
                  " · " +
                  thDate(filter.from) +
                  " ถึง " +
                  thDate(filter.to),
                body: (
                  <table>
                    <thead>
                      <tr>
                        <th>วันที่</th>
                        <th>เลขที่เอกสาร</th>
                        <th>ประเภท</th>
                        <th>คลัง · ที่เก็บ</th>
                        <th style={{ textAlign: "right" }}>รับ</th>
                        <th style={{ textAlign: "right" }}>จ่าย</th>
                        <th style={{ textAlign: "right" }}>คงเหลือ</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan={6}>
                          <b>ยอดยกมา</b>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <b>{num(opening, 0)}</b>
                        </td>
                      </tr>
                      {rows.map((r) => (
                        <tr key={r.t.id}>
                          <td>{thDate(r.t.date)}</td>
                          <td>{r.t.docNo}</td>
                          <td>{TYPES[r.t.type].name}</td>
                          <td>{inv.whLocName(r.t.whId, r.t.locId)}</td>
                          <td style={{ textAlign: "right" }}>{r.mv > 0 ? num(r.mv, 0) : ""}</td>
                          <td style={{ textAlign: "right" }}>{r.mv < 0 ? num(-r.mv, 0) : ""}</td>
                          <td style={{ textAlign: "right" }}>{num(r.bal, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
              })
            }
          >
            พิมพ์
          </button>
          <button
            className="btn btn-g btn-sm"
            onClick={() => {
              downloadCSV(
                ["วันที่", "เลขที่เอกสาร", "ประเภท", "คลัง", "รับ", "จ่าย", "คงเหลือ"],
                rows.map((r) => [
                  r.t.date, r.t.docNo, TYPES[r.t.type].name, inv.whLocName(r.t.whId, r.t.locId),
                  r.mv > 0 ? r.mv : "", r.mv < 0 ? -r.mv : "", r.bal,
                ]),
                "บัตรสินค้า.csv"
              );
              toast("ส่งออกไฟล์ CSV แล้ว");
            }}
          >
            ส่งออก CSV
          </button>
        </>
      }
    >
      {FilterBar}
      <div className="row" style={{ marginBottom: 13 }}>
        <Badge kind="info">{p ? p.code + " · " + p.name : ""}</Badge>
        <Badge>{wid ? inv.whLocName(wid, filter.locId) : "ทุกคลัง"}</Badge>
        <Badge kind="ok">ยอดยกมา {num(opening, 0)}</Badge>
        <Badge kind="ok">ยอดคงเหลือ {num(closing, 0)}</Badge>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <th>วันที่</th>
            <th>เลขที่เอกสาร</th>
            <th>ประเภท</th>
            <th>คลัง · ที่เก็บ</th>
            <th className="num">รับ</th>
            <th className="num">จ่าย</th>
            <th className="num">คงเหลือ</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ background: "var(--brand-50)" }}>
            <td colSpan={6}>
              <b>ยอดยกมา</b>
            </td>
            <td className="num">
              <b>{num(opening, 0)}</b>
            </td>
          </tr>
          {rows.length ? (
            rows.map((r) => (
              <tr key={r.t.id}>
                <td>{thDate(r.t.date)}</td>
                <td className="code-cell">{r.t.docNo}</td>
                <td>
                  <span className={"bdg " + TYPES[r.t.type].badge}>{TYPES[r.t.type].name}</span>
                </td>
                <td style={{ fontSize: 13 }}>
                  {inv.whLocName(r.t.whId, r.t.locId)}
                  {r.t.whTo ? " → " + inv.whLocName(r.t.whTo, r.t.locTo) : ""}
                </td>
                <td className="num">{r.mv > 0 ? num(r.mv, 0) : ""}</td>
                <td className="num">{r.mv < 0 ? num(-r.mv, 0) : ""}</td>
                <td className="num">
                  <b>{num(r.bal, 0)}</b>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7}>
                <Empty>ไม่มีรายการในช่วงเวลาที่เลือก</Empty>
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>
    </Card>
  );
}

/* ------------------------------------- รายงานตามประเภทรายการ */
function TxnReport({ type, inv, db, inRange, filter, FilterBar, print, toast }) {
  const T = TYPES[type];
  const isTransfer = type === "TRANSFER";

  const list = useMemo(
    () => db.txns.filter((t) => t.type === type && inRange(t)).sort((a, b) => a.ts - b.ts),
    [db.txns, type, filter.from, filter.to, filter.whId, filter.productId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const totalQty = list.reduce((s, t) => s + Math.abs(t.qty), 0);
  const totalVal = list.reduce((s, t) => {
    const p = inv.prod(t.productId);
    return s + Math.abs(t.qty) * (p ? p.price : 0);
  }, 0);

  return (
    <Card
      title={type === "ADJUST" ? "รายงานการปรับปรุงสินค้า" : "รายงาน" + T.name}
      actions={
        <>
          <button
            className="btn btn-o btn-sm"
            onClick={() => {
              if (!list.length) return toast("ไม่มีข้อมูลสำหรับพิมพ์", "warn");
              print({
                title: "รายงาน" + T.name,
                subtitle:
                  (filter.whId ? inv.whLocName(filter.whId, filter.locId) + " · " : "") +
                  thDate(filter.from) + " ถึง " + thDate(filter.to),
                body: (
                  <table>
                    <thead>
                      <tr>
                        <th>ลำดับ</th>
                        <th>วันที่</th>
                        <th>เลขที่เอกสาร</th>
                        <th>รหัส</th>
                        <th>รายการสินค้า</th>
                        <th>หน่วย</th>
                        <th>{isTransfer ? "ต้นทาง → ปลายทาง" : "คลัง"}</th>
                        <th style={{ textAlign: "right" }}>จำนวน</th>
                        <th style={{ textAlign: "right" }}>มูลค่า</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((t, i) => {
                        const p = inv.prod(t.productId);
                        return (
                          <tr key={t.id}>
                            <td>{i + 1}</td>
                            <td>{thDate(t.date)}</td>
                            <td>{t.docNo}</td>
                            <td>{p ? p.code : ""}</td>
                            <td>{inv.prodName(t.productId)}</td>
                            <td>{p ? p.unit : ""}</td>
                            <td>
                              {inv.whLocName(t.whId, t.locId) +
                                (isTransfer ? " → " + inv.whLocName(t.whTo, t.locTo) : "")}
                            </td>
                            <td style={{ textAlign: "right" }}>{num(t.qty, 0)}</td>
                            <td style={{ textAlign: "right" }}>
                              {num(Math.abs(t.qty) * (p ? p.price : 0), 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={7}>รวมทั้งสิ้น {list.length} รายการ</td>
                        <td style={{ textAlign: "right" }}>{num(totalQty, 0)}</td>
                        <td style={{ textAlign: "right" }}>{num(totalVal, 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                ),
              });
            }}
          >
            พิมพ์
          </button>
          <button
            className="btn btn-g btn-sm"
            onClick={() => {
              if (!list.length) return toast("ไม่มีข้อมูลสำหรับส่งออก", "warn");
              downloadCSV(
                ["วันที่", "เลขที่เอกสาร", "รหัสสินค้า", "รายการสินค้า", "หน่วย", "คลัง", "ที่เก็บ",
                  "คลังปลายทาง", "ที่เก็บปลายทาง", "จำนวน", "ผู้ทำรายการ", "หมายเหตุ"],
                list.map((t) => {
                  const p = inv.prod(t.productId);
                  return [t.date, t.docNo, p ? p.code : "", inv.prodName(t.productId), p ? p.unit : "",
                    inv.whName(t.whId), t.locId ? inv.locName(t.locId) : "",
                    t.whTo ? inv.whName(t.whTo) : "", t.locTo ? inv.locName(t.locTo) : "",
                    t.qty, t.user, t.note || t.ref || ""];
                }),
                "รายงาน" + T.name + ".csv"
              );
              toast("ส่งออกไฟล์ CSV แล้ว");
            }}
          >
            ส่งออก CSV
          </button>
        </>
      }
    >
      {FilterBar}
      <div className="row" style={{ marginBottom: 13 }}>
        <span className={"bdg " + T.badge}>{list.length} รายการ</span>
        <Badge>รวม {num(totalQty, 0)} หน่วย</Badge>
        <Badge>มูลค่ารวม ฿{num(totalVal, 0)}</Badge>
      </div>

      {list.length ? (
        <TableWrap>
          <thead>
            <tr>
              <th>วันที่</th>
              <th>เลขที่เอกสาร</th>
              <th>รหัส</th>
              <th>รายการสินค้า</th>
              <th>หน่วย</th>
              <th>{isTransfer ? "ต้นทาง → ปลายทาง" : "คลัง"}</th>
              <th className="num">{type === "ADJUST" ? "ผลต่าง" : "จำนวน"}</th>
              <th className="num">มูลค่า</th>
              <th>ผู้ทำรายการ</th>
              <th>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => {
              const p = inv.prod(t.productId);
              return (
                <tr key={t.id}>
                  <td>{thDate(t.date)}</td>
                  <td className="code-cell">{t.docNo}</td>
                  <td className="code-cell">{p ? p.code : ""}</td>
                  <td>{inv.prodName(t.productId)}</td>
                  <td>{p ? p.unit : ""}</td>
                  <td style={{ fontSize: 13 }}>
                    {inv.whLocName(t.whId, t.locId)}
                    {isTransfer ? <b> → {inv.whLocName(t.whTo, t.locTo)}</b> : null}
                  </td>
                  <td className="num">
                    <b style={type === "ADJUST" ? { color: t.qty > 0 ? "var(--ok)" : "var(--err)" } : undefined}>
                      {(type === "ADJUST" && t.qty > 0 ? "+" : "") + num(t.qty, 0)}
                    </b>
                  </td>
                  <td className="num">{num(Math.abs(t.qty) * (p ? p.price : 0), 0)}</td>
                  <td>{t.user}</td>
                  <td style={{ fontSize: 12.5 }}>{t.note || t.ref || "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>รวมทั้งสิ้น {list.length} รายการ</td>
              <td className="num">{num(totalQty, 0)}</td>
              <td className="num">{num(totalVal, 0)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </TableWrap>
      ) : (
        <Empty>ไม่พบรายการในช่วงเวลาที่เลือก</Empty>
      )}
    </Card>
  );
}
