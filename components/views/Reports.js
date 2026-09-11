"use client";

// หน้าจอรายงาน — หนึ่งแท็บต่อหนึ่งงานที่มีการบันทึกข้อมูลลงระบบ
//
// ทุกแท็บพิมพ์และส่งออก CSV/Excel ได้ และค้นหาได้จากข้อมูลที่มีในแท็บนั้นจริง ๆ
// แถบตัวกรองเปลี่ยนตามแท็บที่เปิดอยู่ ไม่ได้แสดงทุกช่องตลอดเวลา
// เพราะช่องที่กรองอะไรไม่ได้ทำให้คนใช้เข้าใจผิดว่าไม่มีข้อมูล ทั้งที่ช่องนั้นไม่มีผลกับแท็บนี้

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { PAY_METHODS, SHIP_STATUS, TYPES } from "@/lib/constants";
import { customerAddress, movement } from "@/lib/db";
import { fmtDuration, localISO, num, thDate, thDateTime, thTime, todayISO } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { IcChart } from "../Icons";
import {
  Badge, Card, Empty, ExportPair, Kpi, PrintPair, ProductSelect, SearchSelect, TableWrap, WhLocFields,
} from "../ui";
import {
  ACT_KINDS,
  STAGES,
  actKindOf,
  avgCloseDays,
  filterActivities,
  filterDeals,
  isOpen,
  partyNameOf,
  silentCustomers,
  stageOf,
  winRate,
} from "@/lib/crm";
import { CountSheetBody, ReceiptBody } from "./printBodies";

/**
 * แท็บรายงานทั้งหมด — หนึ่งแท็บคือหนึ่งงานที่มีการบันทึกข้อมูลลงระบบ
 *
 * needs บอกว่าแท็บนั้นใช้ตัวกรองอะไรบ้าง แถบตัวกรองจะแสดงเฉพาะช่องที่แท็บนั้นใช้จริง
 * ที่ทำแบบนี้เพราะช่องกรองที่กรองอะไรไม่ได้ทำให้คนใช้เข้าใจผิดว่าไม่มีข้อมูล
 * ทั้งที่จริงคือช่องนั้นไม่มีผลกับแท็บที่เปิดอยู่
 *
 *   date     ช่วงวันที่
 *   wh       คลังและที่เก็บ
 *   product  สินค้า
 *   customer ลูกค้า
 *   supplier เจ้าหนี้
 *   text     ช่องค้นหาอิสระ (เลขที่เอกสาร รหัส ชื่อ หรือส่วนใดส่วนหนึ่งก็ได้)
 */
/** ชนิดกิจกรรมที่ทำเป็นคอลัมน์ในตารางสรุปรายคน — ตัดชนิด "อื่น ๆ" ออกเพื่อไม่ให้ตารางยาวเกิน */
const ACT_KIND_COLS = ACT_KINDS.filter((k) => k.id !== "OTHER");

const TABS = [
  { id: "stock", label: "สรุปยอดคงเหลือ", group: "ภาพรวม", needs: ["wh", "product", "text"] },
  { id: "card", label: "บัตรสินค้า (Stock Card)", group: "ภาพรวม", needs: ["date", "wh", "product"] },

  { id: "RECEIVE", label: "รับสินค้า", group: "ทำรายการ", needs: ["date", "wh", "product", "text"] },
  { id: "ISSUE", label: "เบิกสินค้า", group: "ทำรายการ", needs: ["date", "wh", "product", "text"] },
  { id: "TRANSFER", label: "โอนสินค้า", group: "ทำรายการ", needs: ["date", "wh", "product", "text"] },
  { id: "ADJUST", label: "ปรับปรุงสินค้า", group: "ทำรายการ", needs: ["date", "wh", "product", "text"] },
  { id: "counts", label: "ใบตรวจนับที่บันทึกไว้", group: "ทำรายการ", needs: ["date", "wh", "text"] },
  { id: "count", label: "ใบตรวจนับเปล่า (พิมพ์)", group: "ทำรายการ", needs: ["wh"] },

  { id: "docPURCHASE", label: "ใบซื้อสินค้าและบริการ", group: "งานซื้อ", needs: ["date", "supplier", "text"] },
  { id: "docPURRET", label: "ใบส่งคืนสินค้า", group: "งานซื้อ", needs: ["date", "supplier", "text"] },

  { id: "SALE", label: "รายการขาย", group: "งานขาย", needs: ["date", "wh", "product", "text"] },
  { id: "bills", label: "บิลขาย / ใบเสร็จ", group: "งานขาย", needs: ["date", "wh", "product", "text"] },
  { id: "docINVOICE", label: "ใบขายสินค้าและบริการ", group: "งานขาย", needs: ["date", "customer", "text"] },

  { id: "ship", label: "การจัดส่งและเวลาแต่ละขั้น", group: "งานจัดส่ง", needs: ["date", "customer", "text"] },

  { id: "crmpipe", label: "กรวยการขาย (Pipeline)", group: "งานลูกค้าสัมพันธ์", needs: ["date", "text"] },
  { id: "crmact", label: "กิจกรรมการติดต่อ", group: "งานลูกค้าสัมพันธ์", needs: ["date", "customer", "text"] },
  { id: "crmwin", label: "ชนะ-แพ้ และเหตุผล", group: "งานลูกค้าสัมพันธ์", needs: ["date", "text"] },
  { id: "crmquiet", label: "ลูกค้าเงียบที่ต้องตามกลับ", group: "งานลูกค้าสัมพันธ์", needs: ["customer", "text"] },

  { id: "products", label: "ทะเบียนสินค้า", group: "ข้อมูลหลัก", needs: ["product", "text"] },
  { id: "customers", label: "ทะเบียนลูกค้า", group: "ข้อมูลหลัก", needs: ["customer", "text"] },
  { id: "suppliers", label: "ทะเบียนเจ้าหนี้", group: "ข้อมูลหลัก", needs: ["supplier", "text"] },
  { id: "bins", label: "คลังและช่องเก็บ", group: "ข้อมูลหลัก", needs: ["wh", "text"] },
];

function threeMonthsAgo() {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  // localISO ไม่ใช่ toISOString เพราะ UTC จะย้อนวันให้ในช่วงเช้ามืดของไทย
  return localISO(d);
}

/**
 * ตัดตัวคั่นออกให้เทียบกันได้
 *
 * คนพิมพ์เลขที่เอกสารกันคนละแบบ: IV-202609-0001 / iv2026090001 / IV 202609 0001
 * ถ้าเทียบตรง ๆ จะหาไม่เจอทั้งที่พิมพ์ถูก ใช้กติกาเดียวกับช่องยิงบาร์โค๊ดที่หน้าจัดส่ง
 */
const squash = (v) => String(v == null ? "" : v).toLowerCase().replace(/[\s\-\/.,]/g, "");

/**
 * สร้างตัวเทียบข้อความจากคำค้น
 *
 * พิมพ์หลายคำได้ ต้องเจอครบทุกคำ แต่อยู่คนละช่องกันได้
 * (เช่น "ic001 ก.ย." เจอใบที่มีทั้งรหัสสินค้านั้นและเดือนกันยายน)
 * และเจอจากส่วนใดส่วนหนึ่งของค่าก็พอ ไม่ต้องพิมพ์เต็ม
 */
function makeMatch(term) {
  const words = String(term || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return () => true;

  return (...values) => {
    const hay = values.filter((v) => v !== null && v !== undefined && v !== "").join(" ").toLowerCase();
    const tight = squash(hay);
    return words.every((w) => hay.includes(w) || tight.includes(squash(w)));
  };
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
  const [custId, setCustId] = useState("");
  const [supId, setSupId] = useState("");
  const [term, setTerm] = useState("");

  const cur = TABS.find((t) => t.id === tab) || TABS[0];
  const uses = (k) => cur.needs.includes(k);

  /*
   * ตัวกรองที่ "ไม่มีในแท็บนี้" ต้องไม่ถูกนำไปใช้กรอง
   *
   * ไม่งั้นคนเลือกลูกค้าไว้ที่แท็บใบขาย แล้วสลับไปแท็บรับสินค้า
   * จะเห็นรายการว่างเปล่าโดยไม่มีช่องไหนบนจอบอกว่าถูกกรองด้วยลูกค้าอยู่
   */
  const filter = {
    from: uses("date") ? from : "",
    to: uses("date") ? to : "",
    whId: uses("wh") ? whId : "",
    locId: uses("wh") ? locId : "",
    productId: uses("product") ? productId : "",
    custId: uses("customer") ? custId : "",
    supId: uses("supplier") ? supId : "",
    term: uses("text") ? term : "",
    match: makeMatch(uses("text") ? term : ""),
  };

  const inRange = (t) => {
    if (filter.from && t.date < filter.from) return false;
    if (filter.to && t.date > filter.to) return false;
    if (filter.productId && t.productId !== filter.productId) return false;
    if (filter.whId && t.whId !== filter.whId && t.whTo !== filter.whId) return false;
    // กรองที่เก็บ: นับทั้งขาออกจากช่องนั้นและขาเข้าช่องนั้น (การโอน)
    if (filter.locId && t.locId !== filter.locId && t.locTo !== filter.locId) return false;
    return true;
  };

  const custOpts = (db.customers || []).map((c) => ({
    value: c.id,
    code: c.code,
    label: c.name,
    meta: c.province,
    search: c.phone + " " + c.taxId,
  }));

  const supOpts = (db.suppliers || []).map((c) => ({
    value: c.id,
    code: c.code,
    label: c.name,
    meta: c.province,
    search: c.phone + " " + c.taxId,
  }));

  /** ตัวกรองที่ตั้งไว้อยู่ตอนนี้ ใช้บอกจำนวนและปุ่มล้าง */
  const active =
    (uses("text") && term ? 1 : 0) +
    (filter.whId ? 1 : 0) +
    (filter.locId ? 1 : 0) +
    (filter.productId ? 1 : 0) +
    (filter.custId ? 1 : 0) +
    (filter.supId ? 1 : 0);

  function clearAll() {
    setTerm("");
    setWhId("");
    setLocId("");
    setProductId("");
    setCustId("");
    setSupId("");
  }

  const FilterBar = (
    <div className="rep-filter">
      {uses("text") ? (
        <div className="field span2">
          <label className="lbl" htmlFor="r_q">ค้นหา</label>
          <input
            className="inp"
            id="r_q"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={cur.searchHint || "เลขที่เอกสาร รหัส ชื่อ หรือพิมพ์แค่ส่วนใดส่วนหนึ่ง"}
          />
          <span className="hint">
            พิมพ์หลายคำได้ ระบบหาแถวที่มีครบทุกคำ · เลขที่เอกสารมีขีดหรือไม่มีขีดก็เจอเหมือนกัน
          </span>
        </div>
      ) : null}

      {uses("date") ? (
        <>
          <div className="field">
            <label className="lbl" htmlFor="r_from">ตั้งแต่วันที่</label>
            <input
              className="inp"
              type="date"
              id="r_from"
              value={from}
              disabled={!perm.date}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="r_to">ถึงวันที่</label>
            <input
              className="inp"
              type="date"
              id="r_to"
              value={to}
              disabled={!perm.date}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </>
      ) : null}

      {uses("wh") ? (
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
      ) : null}

      {uses("product") ? (
        <div className="field">
          <label className="lbl" htmlFor="r_prod">สินค้า</label>
          <ProductSelect db={db} id="r_prod" value={productId} onChange={setProductId} includeAll />
        </div>
      ) : null}

      {uses("customer") ? (
        <div className="field">
          <label className="lbl" htmlFor="r_cust">ลูกค้า</label>
          <SearchSelect
            id="r_cust"
            value={custId}
            onChange={setCustId}
            options={custOpts}
            emptyLabel="ทุกลูกค้า"
            notFound="ไม่พบลูกค้าที่ตรงกับ"
          />
        </div>
      ) : null}

      {uses("supplier") ? (
        <div className="field">
          <label className="lbl" htmlFor="r_sup">เจ้าหนี้</label>
          <SearchSelect
            id="r_sup"
            value={supId}
            onChange={setSupId}
            options={supOpts}
            emptyLabel="ทุกเจ้าหนี้"
            notFound="ไม่พบเจ้าหนี้ที่ตรงกับ"
          />
        </div>
      ) : null}

      {active ? (
        <div className="field rep-clear">
          <button className="btn btn-g btn-sm" onClick={clearAll}>
            ล้างตัวกรอง ({active})
          </button>
        </div>
      ) : null}
    </div>
  );

  const groups = [];
  TABS.forEach((t) => {
    const g = groups.find((x) => x.name === t.group);
    if (g) g.items.push(t);
    else groups.push({ name: t.group, items: [t] });
  });

  return (
    <>
      <div className="tabs" role="tablist">
        {groups.map((g) => (
          <span key={g.name} className="tab-set">
            <i className="tab-group">{g.name}</i>
            {g.items.map((t) => (
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
          </span>
        ))}
      </div>

      {tab === "stock" && <StockReport {...{ inv, db, filter, FilterBar, print, toast }} />}
      {tab === "count" && <CountReport {...{ inv, db, filter, FilterBar, print, toast }} />}
      {tab === "counts" && <CountDocsReport {...{ inv, db, filter, FilterBar, print, toast }} />}
      {tab === "card" && <StockCard {...{ inv, db, filter, FilterBar, print, toast }} />}
      {tab === "bills" && <BillsReport {...{ inv, db, filter, FilterBar, print, toast }} />}
      {tab === "ship" && <ShipReport {...{ inv, db, filter, FilterBar, print, toast }} />}
      {tab === "products" && <ProductsReport {...{ inv, db, filter, FilterBar, print, toast }} />}
      {tab === "bins" && <BinsReport {...{ inv, db, filter, FilterBar, print, toast }} />}
      {tab === "crmpipe" && (
        <PipelineReport key="cp" {...{ inv, db, filter, FilterBar, print, toast }} />
      )}
      {tab === "crmact" && (
        <ActivityReport key="ca" {...{ inv, db, filter, FilterBar, print, toast }} />
      )}
      {tab === "crmwin" && (
        <WinLossReport key="cw" {...{ inv, db, filter, FilterBar, print, toast }} />
      )}
      {tab === "crmquiet" && (
        <QuietReport key="cq" {...{ inv, db, filter, FilterBar, print, toast }} />
      )}
      {tab === "customers" && (
        <PartyReport key="c" kind="customers" {...{ inv, db, filter, FilterBar, print, toast }} />
      )}
      {tab === "suppliers" && (
        <PartyReport key="s" kind="suppliers" {...{ inv, db, filter, FilterBar, print, toast }} />
      )}
      {tab.startsWith("doc") && (
        <DocReport key={tab} kind={tab.slice(3)} {...{ inv, db, filter, FilterBar, print, toast }} />
      )}
      {["RECEIVE", "ISSUE", "TRANSFER", "ADJUST", "SALE"].includes(tab) && (
        <TxnReport key={tab} type={tab} {...{ inv, db, inRange, filter, FilterBar, print, toast }} />
      )}
    </>
  );
}

/* ------------------------------------------------ งานลูกค้าสัมพันธ์ */

/**
 * สรุปรายขั้นจากรายการดีลที่กรองมาแล้ว
 * แยกจาก pipelineOf ใน lib เพราะที่นี่กรองด้วย filter.match ของหน้ารายงานไปก่อนแล้ว
 * ส่งเข้า lib อีกทีจะกรองซ้ำสองชั้นด้วยกติกาคนละแบบ
 */
function summarizeStages(deals) {
  return STAGES.map((s) => {
    const rows = deals.filter((d) => d.stage === s.id);
    const amount = rows.reduce((n, d) => n + (Number(d.amount) || 0), 0);
    const weighted = rows.reduce(
      (n, d) => n + ((Number(d.amount) || 0) * (Number(d.probability) || 0)) / 100,
      0
    );
    return { ...s, count: rows.length, amount, weighted };
  });
}

/** ตัวเลขสรุปของชุดดีลที่กรองมาแล้ว — ใช้กติกาเดียวกับ lib/crm.js */
function summarizeDeals(deals) {
  const open = deals.filter(isOpen);
  return {
    deals: deals.length,
    open: open.length,
    openAmount: open.reduce((n, d) => n + (Number(d.amount) || 0), 0),
    weighted: open.reduce(
      (n, d) => n + ((Number(d.amount) || 0) * (Number(d.probability) || 0)) / 100,
      0
    ),
    won: deals.filter((d) => d.stage === "WON").length,
    lost: deals.filter((d) => d.stage === "LOST").length,
    winRate: winRate(deals),
    avgDays: avgCloseDays(deals),
  };
}

/**
 * กรวยการขาย — ดีลค้างอยู่ที่ขั้นไหนบ้าง มูลค่าเท่าไร
 *
 * ช่วงวันที่กรองด้วย "วันที่เปิดโอกาส" ไม่ใช่วันที่ปิด
 * เพราะคำถามของรายงานนี้คือ "งานที่รับเข้ามาในช่วงนี้ ตอนนี้ไปถึงไหนแล้ว"
 */
function PipelineReport({ db, filter, FilterBar, print, toast }) {
  /*
   * กรองข้อความด้วย filter.match ตัวเดียวกับแท็บอื่นทั้งหมด
   * ไม่ได้ส่งคำค้นเข้าไปให้ lib กรองเอง เพราะ match รองรับหลายคำที่อยู่คนละช่อง
   * และตัดตัวคั่นของเลขที่เอกสารให้ด้วย ถ้าเขียนวิธีค้นแยกอีกชุด
   * ผลการค้นของแท็บนี้จะไม่เหมือนแท็บอื่นโดยที่คนใช้ไม่รู้ว่าทำไม
   */
  const deals = useMemo(
    () =>
      filterDeals(db, { from: filter.from, to: filter.to }).filter((d) =>
        filter.match(d.code, d.name, partyNameOf(db, d), d.source, d.note)
      ),
    [db, filter]
  );
  const pipe = useMemo(() => summarizeStages(deals), [deals]);
  const sum = useMemo(() => summarizeDeals(deals), [deals]);
  const rowsAll = pipe.filter((s) => s.count);

  const HEAD = ["ขั้นตอน", "จำนวนดีล", "มูลค่ารวม", "มูลค่าถ่วงน้ำหนัก"];
  const rows = () => rowsAll.map((s) => [s.name, s.count, s.amount, s.weighted]);

  return (
    <Card
      title="กรวยการขาย (Pipeline)"
      actions={
        <>
          <Badge kind={sum.deals ? "info" : "gray"}>{sum.deals} ดีล</Badge>
          <PrintPair
            onPrint={() => {
              if (!rowsAll.length) return toast("ไม่มีข้อมูลสำหรับพิมพ์", "warn");
              print({
                title: "กรวยการขาย (Pipeline)",
                subtitle:
                  "ช่วง " + thDate(filter.from) + " ถึง " + thDate(filter.to) +
                  " · ดีลทั้งหมด " + sum.deals + " รายการ",
                body: (
                  <table>
                    <thead>
                      <tr>
                        <th>ขั้นตอน</th>
                        <th>จำนวนดีล</th>
                        <th>มูลค่ารวม</th>
                        <th>ถ่วงน้ำหนัก</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowsAll.map((s) => (
                        <tr key={s.id}>
                          <td>{s.name}</td>
                          <td>{num(s.count, 0)}</td>
                          <td>{num(s.amount, 2)}</td>
                          <td>{num(s.weighted, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
              });
            }}
            toast={toast}
          />
          <ExportPair
            onExport={(save) => save(HEAD, rows(), "กรวยการขาย.csv")}
            disabled={!rowsAll.length}
            toast={toast}
          />
        </>
      }
    >
      {FilterBar}
      {sum.deals ? (
        <>
          <div className="grid g4" style={{ marginBottom: 14 }}>
            <Kpi
              icon={<IcChart size={18} stroke={1.9} />}
              label="ยังไล่ปิดอยู่"
              value={num(sum.open, 0)}
              sub={"มูลค่า ฿" + num(sum.openAmount, 0)}
            />
            <Kpi
              icon={<IcChart size={18} stroke={1.9} />}
              label="ถ่วงน้ำหนัก"
              value={"฿" + num(sum.weighted, 0)}
              sub="มูลค่า x โอกาสปิดได้"
            />
            <Kpi
              icon={<IcChart size={18} stroke={1.9} />}
              label="อัตราชนะ"
              value={sum.winRate === null ? "—" : num(sum.winRate, 1) + "%"}
              sub={"ชนะ " + num(sum.won, 0) + " · เสีย " + num(sum.lost, 0)}
            />
            <Kpi
              icon={<IcChart size={18} stroke={1.9} />}
              label="เวลาเฉลี่ยที่ใช้ปิด"
              value={sum.avgDays === null ? "—" : num(sum.avgDays, 0) + " วัน"}
              sub="เฉพาะดีลที่ปิดแล้ว"
            />
          </div>

          <TableWrap>
            <thead>
              <tr>
                <th style={{ minWidth: 160 }}>ขั้นตอน</th>
                <th className="num" style={{ width: 110 }}>จำนวนดีล</th>
                <th className="num" style={{ width: 160 }}>มูลค่ารวม</th>
                <th className="num" style={{ width: 160 }}>ถ่วงน้ำหนัก</th>
              </tr>
            </thead>
            <tbody>
              {pipe.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Badge kind={s.kind}>{s.name}</Badge>
                  </td>
                  <td className="num">{num(s.count, 0)}</td>
                  <td className="num">{num(s.amount, 2)}</td>
                  <td className="num">{num(s.weighted, 2)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </>
      ) : (
        <Empty>ไม่พบโอกาสการขายในช่วงที่เลือก</Empty>
      )}
    </Card>
  );
}

/** กิจกรรมการติดต่อ — ใครติดต่อไปกี่ครั้ง และแยกเป็นชนิดไหนบ้าง */
function ActivityReport({ db, filter, FilterBar, print, toast }) {
  const list = useMemo(
    () =>
      filterActivities(db, {
        from: filter.from,
        to: filter.to,
        customerId: filter.custId,
      }).filter((a) => filter.match(partyNameOf(db, a), a.subject, a.result, a.note)),
    [db, filter]
  );

  /** สรุปรายคนคำนวณจากรายการที่กรองแล้ว ตัวเลขในสองตารางจึงตรงกันเสมอ */
  const byPerson = useMemo(() => {
    const map = new Map();
    list.forEach((a) => {
      const sp = (db.salespersons || []).find((x) => x.id === a.salesId);
      const key = sp ? sp.code + " " + sp.name : "(ไม่ระบุพนักงานขาย)";
      const cur = map.get(key) || { name: key, total: 0, kinds: {} };
      cur.total += 1;
      cur.kinds[a.kind] = (cur.kinds[a.kind] || 0) + 1;
      map.set(key, cur);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [db, list]);

  const HEAD = ["วันที่", "ชนิด", "คู่ค้า", "เรื่องที่คุย", "ผลลัพธ์", "นัดครั้งถัดไป"];
  const rows = () =>
    list.map((a) => [
      a.date,
      actKindOf(a.kind).name,
      partyNameOf(db, a),
      a.subject,
      a.result,
      a.nextDate,
    ]);

  return (
    <Card
      title="กิจกรรมการติดต่อ"
      actions={
        <>
          <Badge kind={list.length ? "info" : "gray"}>{list.length} ครั้ง</Badge>
          <PrintPair
            onPrint={() => {
              if (!list.length) return toast("ไม่มีข้อมูลสำหรับพิมพ์", "warn");
              print({
                title: "กิจกรรมการติดต่อ",
                subtitle:
                  "ช่วง " + thDate(filter.from) + " ถึง " + thDate(filter.to) +
                  " · ทั้งหมด " + list.length + " ครั้ง",
                body: (
                  <table>
                    <thead>
                      <tr>
                        <th>วันที่</th>
                        <th>ชนิด</th>
                        <th>คู่ค้า</th>
                        <th>เรื่องที่คุย</th>
                        <th>ผลลัพธ์</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((a) => (
                        <tr key={a.id}>
                          <td>{thDate(a.date)}</td>
                          <td>{actKindOf(a.kind).name}</td>
                          <td>{partyNameOf(db, a)}</td>
                          <td>{a.subject}</td>
                          <td>{a.result}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
              });
            }}
            toast={toast}
          />
          <ExportPair
            onExport={(save) => save(HEAD, rows(), "กิจกรรมการติดต่อ.csv")}
            disabled={!list.length}
            toast={toast}
          />
        </>
      }
    >
      {FilterBar}
      {list.length ? (
        <>
          <TableWrap>
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>พนักงานขาย</th>
                <th className="num" style={{ width: 110 }}>รวมทุกชนิด</th>
                {ACT_KIND_COLS.map((k) => (
                  <th key={k.id} className="num" style={{ width: 100 }}>
                    {k.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byPerson.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td className="num">
                    <b>{num(p.total, 0)}</b>
                  </td>
                  {ACT_KIND_COLS.map((k) => (
                    <td key={k.id} className="num">
                      {num(p.kinds[k.id] || 0, 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableWrap>

          <div className="doc-scroll" style={{ maxHeight: 460, marginTop: 14 }}>
            <TableWrap>
              <thead>
                <tr>
                  <th style={{ width: 120 }}>วันที่</th>
                  <th style={{ width: 120 }}>ชนิด</th>
                  <th style={{ minWidth: 180 }}>คู่ค้า</th>
                  <th style={{ minWidth: 200 }}>เรื่องที่คุย</th>
                  <th style={{ minWidth: 200 }}>ผลลัพธ์</th>
                  <th style={{ width: 130 }}>นัดครั้งถัดไป</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id}>
                    <td>{thDate(a.date)}</td>
                    <td>{actKindOf(a.kind).name}</td>
                    <td>{partyNameOf(db, a)}</td>
                    <td>{a.subject}</td>
                    <td className="muted">{a.result || "—"}</td>
                    <td>{a.nextDate ? thDate(a.nextDate) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        </>
      ) : (
        <Empty>ไม่พบกิจกรรมในช่วงที่เลือก</Empty>
      )}
    </Card>
  );
}

/**
 * ชนะ-แพ้ และเหตุผล
 *
 * กรองด้วยวันที่ปิดจริง ไม่ใช่วันที่เปิด เพราะคำถามคือ
 * "ช่วงนี้ปิดงานได้เท่าไร และที่เสียไปเสียเพราะอะไร"
 */
function WinLossReport({ db, filter, FilterBar, print, toast }) {
  const closed = useMemo(() => {
    return filterDeals(db, {})
      .filter((d) => d.stage === "WON" || d.stage === "LOST")
      .filter((d) => {
        if (filter.from && (!d.closeDate || d.closeDate < filter.from)) return false;
        if (filter.to && (!d.closeDate || d.closeDate > filter.to)) return false;
        return filter.match(d.code, d.name, partyNameOf(db, d), d.lostReason, d.note);
      });
  }, [db, filter]);

  const won = closed.filter((d) => d.stage === "WON");
  const lost = closed.filter((d) => d.stage === "LOST");

  /** จัดกลุ่มเหตุผลที่เสีย เรียงจากที่เจอบ่อยที่สุด — เป็นสิ่งที่เอาไปแก้ได้จริง */
  const reasons = useMemo(() => {
    const map = new Map();
    lost.forEach((d) => {
      const key = d.lostReason || "(ไม่ระบุเหตุผล)";
      const cur = map.get(key) || { name: key, count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += Number(d.amount) || 0;
      map.set(key, cur);
    });
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [lost]);

  const HEAD = ["รหัส", "ชื่อโอกาส", "คู่ค้า", "ผล", "มูลค่า", "วันที่ปิด", "เหตุผลที่เสีย"];
  const rows = () =>
    closed.map((d) => [
      d.code,
      d.name,
      partyNameOf(db, d),
      stageOf(d.stage).name,
      d.amount,
      d.closeDate,
      d.lostReason,
    ]);

  return (
    <Card
      title="ชนะ-แพ้ และเหตุผล"
      actions={
        <>
          <Badge kind={closed.length ? "info" : "gray"}>{closed.length} ดีลที่ปิดแล้ว</Badge>
          <PrintPair
            onPrint={() => {
              if (!closed.length) return toast("ไม่มีข้อมูลสำหรับพิมพ์", "warn");
              print({
                title: "สรุปชนะ-แพ้ และเหตุผล",
                subtitle:
                  "ปิดระหว่าง " + thDate(filter.from) + " ถึง " + thDate(filter.to) +
                  " · ชนะ " + won.length + " · เสีย " + lost.length,
                body: (
                  <table>
                    <thead>
                      <tr>
                        <th>รหัส</th>
                        <th>ชื่อโอกาส</th>
                        <th>คู่ค้า</th>
                        <th>ผล</th>
                        <th>มูลค่า</th>
                        <th>เหตุผลที่เสีย</th>
                      </tr>
                    </thead>
                    <tbody>
                      {closed.map((d) => (
                        <tr key={d.id}>
                          <td>{d.code}</td>
                          <td>{d.name}</td>
                          <td>{partyNameOf(db, d)}</td>
                          <td>{stageOf(d.stage).name}</td>
                          <td>{num(d.amount, 2)}</td>
                          <td>{d.lostReason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
              });
            }}
            toast={toast}
          />
          <ExportPair
            onExport={(save) => save(HEAD, rows(), "ชนะ-แพ้.csv")}
            disabled={!closed.length}
            toast={toast}
          />
        </>
      }
    >
      {FilterBar}
      {closed.length ? (
        <>
          <div className="grid g4" style={{ marginBottom: 14 }}>
            <Kpi
              icon={<IcChart size={18} stroke={1.9} />}
              label="ปิดได้"
              value={num(won.length, 0)}
              sub={"มูลค่า ฿" + num(won.reduce((n, d) => n + (Number(d.amount) || 0), 0), 0)}
            />
            <Kpi
              icon={<IcChart size={18} stroke={1.9} />}
              label="เสียโอกาส"
              value={num(lost.length, 0)}
              sub={"มูลค่า ฿" + num(lost.reduce((n, d) => n + (Number(d.amount) || 0), 0), 0)}
              kind={lost.length > won.length ? "warn" : ""}
            />
            <Kpi
              icon={<IcChart size={18} stroke={1.9} />}
              label="อัตราชนะ"
              value={num((won.length * 100) / closed.length, 1) + "%"}
              sub={"จากดีลที่ปิดแล้ว " + closed.length + " รายการ"}
            />
            <Kpi
              icon={<IcChart size={18} stroke={1.9} />}
              label="เหตุผลที่เสียบ่อยที่สุด"
              value={reasons[0] ? reasons[0].name : "—"}
              sub={reasons[0] ? reasons[0].count + " ครั้ง" : "ยังไม่มีดีลที่เสีย"}
            />
          </div>

          {reasons.length ? (
            <TableWrap>
              <thead>
                <tr>
                  <th style={{ minWidth: 240 }}>เหตุผลที่เสียโอกาส</th>
                  <th className="num" style={{ width: 110 }}>จำนวนครั้ง</th>
                  <th className="num" style={{ width: 160 }}>มูลค่าที่เสียไป</th>
                </tr>
              </thead>
              <tbody>
                {reasons.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td className="num">{num(r.count, 0)}</td>
                    <td className="num">{num(r.amount, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : null}

          <div className="doc-scroll" style={{ maxHeight: 420, marginTop: 14 }}>
            <TableWrap>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>รหัส</th>
                  <th style={{ minWidth: 190 }}>ชื่อโอกาส</th>
                  <th style={{ minWidth: 170 }}>คู่ค้า</th>
                  <th style={{ width: 140 }}>ผล</th>
                  <th className="num" style={{ width: 130 }}>มูลค่า</th>
                  <th style={{ width: 120 }}>วันที่ปิด</th>
                  <th style={{ minWidth: 180 }}>เหตุผลที่เสีย</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((d) => (
                  <tr key={d.id}>
                    <td className="code-cell">{d.code}</td>
                    <td>{d.name}</td>
                    <td>{partyNameOf(db, d)}</td>
                    <td>
                      <Badge kind={stageOf(d.stage).kind}>{stageOf(d.stage).name}</Badge>
                    </td>
                    <td className="num">{num(d.amount, 2)}</td>
                    <td>{d.closeDate ? thDate(d.closeDate) : "—"}</td>
                    <td className="muted">{d.lostReason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        </>
      ) : (
        <Empty>ไม่มีดีลที่ปิดในช่วงที่เลือก</Empty>
      )}
    </Card>
  );
}

/**
 * ลูกค้าเงียบ — เคยซื้อแล้วแต่หายไปนาน
 *
 * ไม่ใช้ช่วงวันที่ของตัวกรอง แต่ใช้ "จำนวนวันที่เงียบ" ที่ตั้งเองได้
 * เพราะคำถามคือ "ตอนนี้ใครหายไปนานแล้วบ้าง" ไม่ใช่ "ช่วงนั้นใครเงียบ"
 */
function QuietReport({ db, filter, FilterBar, print, toast }) {
  const [days, setDays] = useState(90);

  const list = useMemo(() => {
    const rows = silentCustomers(db, days, todayISO());
    return rows.filter((c) => {
      if (filter.custId && c.id !== filter.custId) return false;
      return filter.match(c.code, c.name, c.province);
    });
  }, [db, days, filter]);

  const HEAD = ["รหัส", "ชื่อลูกค้า", "จังหวัด", "ซื้อครั้งล่าสุด", "เงียบมาแล้ว (วัน)", "จำนวนใบ", "ยอดซื้อสะสม"];
  const rows = () =>
    list.map((c) => [c.code, c.name, c.province, c.lastBuy, c.quietDays, c.bills, c.base]);

  return (
    <Card
      title="ลูกค้าเงียบที่ต้องตามกลับ"
      actions={
        <>
          <Badge kind={list.length ? "warn" : "gray"}>{list.length} ราย</Badge>
          <PrintPair
            onPrint={() => {
              if (!list.length) return toast("ไม่มีข้อมูลสำหรับพิมพ์", "warn");
              print({
                title: "ลูกค้าเงียบที่ต้องตามกลับ",
                subtitle:
                  "ไม่ซื้อเกิน " + days + " วัน · ทั้งหมด " + list.length +
                  " ราย · ณ วันที่ " + thDate(todayISO()),
                body: (
                  <table>
                    <thead>
                      <tr>
                        <th>ลำดับ</th>
                        <th>รหัส</th>
                        <th>ชื่อลูกค้า</th>
                        <th>จังหวัด</th>
                        <th>ซื้อครั้งล่าสุด</th>
                        <th>เงียบ (วัน)</th>
                        <th>ยอดซื้อสะสม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((c, i) => (
                        <tr key={c.id}>
                          <td>{i + 1}</td>
                          <td>{c.code}</td>
                          <td>{c.name}</td>
                          <td>{c.province}</td>
                          <td>{thDate(c.lastBuy)}</td>
                          <td>{num(c.quietDays, 0)}</td>
                          <td>{num(c.base, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
              });
            }}
            toast={toast}
          />
          <ExportPair
            onExport={(save) => save(HEAD, rows(), "ลูกค้าเงียบ.csv")}
            disabled={!list.length}
            toast={toast}
          />
        </>
      }
    >
      {FilterBar}
      <div className="row" style={{ marginBottom: 12, gap: 10 }}>
        <label className="lbl" htmlFor="cq_days" style={{ margin: 0 }}>
          นับว่าเงียบเมื่อไม่ซื้อเกิน
        </label>
        <input
          className="inp num"
          id="cq_days"
          type="number"
          min={1}
          max={3650}
          value={days}
          onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
          style={{ width: 110 }}
        />
        <span className="muted">วัน</span>
      </div>

      {list.length ? (
        <div className="doc-scroll" style={{ maxHeight: 520 }}>
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 100 }}>รหัส</th>
                <th style={{ minWidth: 220 }}>ชื่อลูกค้า</th>
                <th style={{ minWidth: 130 }}>จังหวัด</th>
                <th style={{ width: 130 }}>ซื้อครั้งล่าสุด</th>
                <th className="num" style={{ width: 130 }}>เงียบ (วัน)</th>
                <th className="num" style={{ width: 100 }}>จำนวนใบ</th>
                <th className="num" style={{ width: 150 }}>ยอดซื้อสะสม</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="code-cell">{c.code}</td>
                  <td>{c.name}</td>
                  <td>{c.province || "—"}</td>
                  <td>{thDate(c.lastBuy)}</td>
                  <td className="num">
                    <b>{num(c.quietDays, 0)}</b>
                  </td>
                  <td className="num">{num(c.bills, 0)}</td>
                  <td className="num">{num(c.base, 2)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      ) : (
        <Empty>ไม่มีลูกค้าที่เงียบเกิน {days} วัน</Empty>
      )}
    </Card>
  );
}

/* ------------------------------------------ ใบตรวจนับที่บันทึกไว้ */

/**
 * รายงานใบตรวจนับที่ทำไปแล้ว — คนละอย่างกับแท็บ "ใบตรวจนับเปล่า"
 *   ใบเปล่า      = กระดาษที่พิมพ์ไปกรอกมือ ยังไม่มีข้อมูลอะไร
 *   ใบที่บันทึกไว้ = เอกสารจริงที่สร้างจากหน้าเตรียมใบตรวจนับ พร้อมผลที่นับได้
 */
function CountDocsReport({ inv, db, filter, FilterBar, print, toast }) {
  const list = useMemo(() => {
    return (db.stockCounts || [])
      .filter((c) => {
        if (filter.from && c.date < filter.from) return false;
        if (filter.to && c.date > filter.to) return false;
        if (filter.whId && c.whId !== filter.whId) return false;
        return filter.match(
          c.docNo,
          c.postedDoc,
          c.by1,
          c.by2,
          c.note,
          c.date,
          thDate(c.date),
          inv.whName(c.whId),
          c.status === "DONE" ? "ปิดแล้ว" : "กำลังนับ"
        );
      })
      .slice()
      .sort((a, b) => b.ts - a.ts);
  }, [db.stockCounts, filter, inv]);

  /** สรุปความคืบหน้าและผลต่างของใบหนึ่ง */
  const sumOf = (c) => {
    const items = inv.itemsOfCount(c.id);
    const done = items.filter((i) => i.counted !== null);
    const diff = done.filter((i) => i.counted !== i.sysQty);
    const net = diff.reduce((n, i) => n + (i.counted - i.sysQty), 0);
    return { total: items.length, done: done.length, diff: diff.length, net };
  };

  const HEAD = ["เลขที่ใบ", "วันที่", "คลัง", "ผู้ตรวจนับ 1", "ผู้ตรวจนับ 2",
    "รายการทั้งหมด", "นับแล้ว", "มีผลต่าง", "ผลต่างสุทธิ", "สถานะ", "เอกสารปรับปรุง"];

  const rows = () =>
    list.map((c) => {
      const g = sumOf(c);
      return [
        c.docNo, c.date, inv.whName(c.whId), c.by1, c.by2,
        g.total, g.done, g.diff, g.net,
        c.status === "DONE" ? "ปิดแล้ว" : "กำลังนับ",
        c.postedDoc,
      ];
    });

  return (
    <Card
      title="ใบตรวจนับที่บันทึกไว้"
      actions={
        <>
          <Badge kind={list.length ? "info" : "gray"}>{list.length} ใบ</Badge>
          <PrintPair
            onPrint={() => {
              if (!list.length) return toast("ไม่มีข้อมูลสำหรับพิมพ์", "warn");
              print({
                title: "รายงานใบตรวจนับสินค้า",
                subtitle: thDate(filter.from) + " ถึง " + thDate(filter.to) + " · " + list.length + " ใบ",
                body: (
                  <table>
                    <thead>
                      <tr>
                        {HEAD.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows().map((r, i) => (
                        <tr key={i}>
                          {r.map((c, j) => (
                            <td key={j}>{typeof c === "number" ? num(c, 0) : c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
              });
            }}
            toast={toast}
          />
          <ExportPair
            onExport={(save) => save(HEAD, rows(), "ใบตรวจนับที่บันทึกไว้.csv")}
            disabled={!list.length}
            toast={toast}
          />
        </>
      }
    >
      {FilterBar}
      {list.length ? (
        <div className="doc-scroll" style={{ maxHeight: 520 }}>
          <TableWrap>
            <thead>
              <tr>
                <th style={{ minWidth: 140 }}>เลขที่ใบ</th>
                <th style={{ width: 112 }}>วันที่</th>
                <th style={{ minWidth: 150 }}>คลัง</th>
                <th style={{ minWidth: 150 }}>ผู้ตรวจนับ</th>
                <th className="num" style={{ width: 110 }}>นับแล้ว</th>
                <th className="num" style={{ width: 96 }}>มีผลต่าง</th>
                <th className="num" style={{ width: 110 }}>ผลต่างสุทธิ</th>
                <th style={{ minWidth: 150 }}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const g = sumOf(c);
                return (
                  <tr key={c.id}>
                    <td className="code-cell">{c.docNo}</td>
                    <td>{thDate(c.date)}</td>
                    <td>{inv.whName(c.whId)}</td>
                    <td>{[c.by1, c.by2].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="num">
                      {num(g.done, 0)} / {num(g.total, 0)}
                    </td>
                    <td className="num">{g.diff ? num(g.diff, 0) : "—"}</td>
                    <td className="num" style={{ color: g.net > 0 ? "var(--ok)" : g.net < 0 ? "var(--err)" : undefined }}>
                      {g.net ? (g.net > 0 ? "+" : "") + num(g.net, 0) : "—"}
                    </td>
                    <td>
                      <Badge kind={c.status === "DONE" ? "ok" : "warn"}>
                        {c.status === "DONE" ? "ปิดแล้ว" : "กำลังนับ"}
                      </Badge>
                      {c.postedDoc ? <span className="muted"> · {c.postedDoc}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </div>
      ) : (
        <Empty>
          {(db.stockCounts || []).length
            ? "ไม่พบใบตรวจนับที่ตรงกับเงื่อนไขที่กรอง"
            : "ยังไม่มีใบตรวจนับ — สร้างได้ที่เมนู “เตรียมใบตรวจนับ”"}
        </Empty>
      )}
    </Card>
  );
}

/* ------------------------------------------------- รายงานการจัดส่ง */

/** รายงานใบขายพร้อมเวลาที่ใช้ในแต่ละขั้นของการจัดส่ง */
function ShipReport({ inv, db, filter, FilterBar, print, toast }) {
  const list = useMemo(() => {
    return (db.invoices || [])
      .filter((v) => {
        if (filter.from && v.date < filter.from) return false;
        if (filter.to && v.date > filter.to) return false;
        if (filter.custId && v.customerId !== filter.custId) return false;
        const st = SHIP_STATUS.find((x) => x.id === v.shipStatus);
        return filter.match(
          v.docNo,
          v.custCode,
          v.custName,
          v.custProvince,
          v.custAddress,
          v.date,
          thDate(v.date),
          st ? st.name : v.shipStatus,
          v.shipFrom ? inv.whName(v.shipFrom) : ""
        );
      })
      .map((v) => ({ v, tl: inv.shipTimeline(v) }))
      .sort((a, b) => b.v.ts - a.v.ts);
  }, [db.invoices, db.shipEvents, filter, inv]);

  const HEAD = [
    "เลขที่เอกสาร", "วันที่", "รหัสลูกค้า", "ชื่อลูกค้า", "จังหวัดที่ส่ง", "คลังต้นทาง",
    "สถานะปัจจุบัน", "ระยะทาง (กม.)",
    ...SHIP_STATUS.map((x) => "เวลา " + x.short),
    ...SHIP_STATUS.slice(1).map((x) => "ใช้เวลาถึง " + x.short),
    "รวมทั้งกระบวนการ",
  ];

  const rows = () =>
    list.map(({ v, tl }) => [
      v.docNo, v.date, v.custCode, v.custName, v.custProvince,
      v.shipFrom ? inv.whName(v.shipFrom) : "",
      (SHIP_STATUS.find((x) => x.id === v.shipStatus) || {}).name || v.shipStatus,
      v.shipKm === null ? "" : v.shipKm,
      ...tl.steps.map((x) => (x.ts ? thDateTime(x.ts) : "")),
      ...tl.steps.slice(1).map((x) => (x.ms ? fmtDuration(x.ms) : "")),
      tl.totalMs ? fmtDuration(tl.totalMs) : "",
    ]);

  // ค่าเฉลี่ยของแต่ละช่วง คิดเฉพาะใบที่มีเวลาจริง
  // ถ้านับใบที่ยังไม่ถึงขั้นนั้นเป็นศูนย์ด้วย ค่าเฉลี่ยจะต่ำกว่าความจริงเสมอ
  const avgOf = (i) => {
    const vals = list.map((r) => r.tl.steps[i].ms).filter((ms) => ms > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  return (
    <Card
      title="การจัดส่งและเวลาแต่ละขั้น"
      actions={
        <>
          <Badge kind={list.length ? "info" : "gray"}>{list.length} ใบ</Badge>
          <PrintPair
            onPrint={() => {
              if (!list.length) return toast("ไม่มีข้อมูลสำหรับพิมพ์", "warn");
              print({
                title: "รายงานการจัดส่งและเวลาแต่ละขั้น",
                subtitle: thDate(filter.from) + " ถึง " + thDate(filter.to) + " · " + list.length + " ใบ",
                body: (
                  <table>
                    <thead>
                      <tr>
                        {HEAD.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows().map((r, i) => (
                        <tr key={i}>
                          {r.map((c, j) => (
                            <td key={j}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
              });
            }}
            toast={toast}
          />
          <ExportPair
            onExport={(save) => save(HEAD, rows(), "การจัดส่งและเวลาแต่ละขั้น.csv")}
            disabled={!list.length}
            toast={toast}
          />
        </>
      }
    >
      {FilterBar}

      {list.length ? (
        <>
          <div className="ship-legend" style={{ marginBottom: 12 }}>
            {SHIP_STATUS.slice(1).map((st, i) => (
              <span key={st.id}>
                <i className="dot" style={{ background: st.color }} />
                เฉลี่ยถึง{st.short} {fmtDuration(avgOf(i + 1))}
              </span>
            ))}
          </div>

          <div className="doc-scroll" style={{ maxHeight: 520 }}>
            <TableWrap>
              <thead>
                <tr>
                  <th style={{ minWidth: 150 }}>เลขที่เอกสาร</th>
                  <th style={{ width: 110 }}>วันที่</th>
                  <th style={{ minWidth: 180 }}>ลูกค้า</th>
                  <th style={{ minWidth: 130 }}>จังหวัดที่ส่ง</th>
                  {SHIP_STATUS.map((st) => (
                    <th key={st.id} style={{ minWidth: 128 }}>
                      {st.name}
                    </th>
                  ))}
                  <th style={{ minWidth: 120 }}>รวมทั้งกระบวนการ</th>
                </tr>
              </thead>
              <tbody>
                {list.map(({ v, tl }) => (
                  <tr key={v.id}>
                    <td className="code-cell">{v.docNo}</td>
                    <td>{thDate(v.date)}</td>
                    <td>
                      {v.custCode ? v.custCode + " " : ""}
                      {v.custName}
                    </td>
                    <td>{v.custProvince || "—"}</td>
                    {tl.steps.map((st) => (
                      <td key={st.id} className={st.ts ? "" : "muted"}>
                        {st.ts ? (
                          <span className="tl-cell">
                            <b>{thTime(st.ts)}</b>
                            {st.ms ? <em>+{fmtDuration(st.ms)}</em> : null}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    ))}
                    <td>
                      <b>{tl.totalMs ? fmtDuration(tl.totalMs) : "—"}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        </>
      ) : (
        <Empty>
          {(db.invoices || []).length
            ? "ไม่พบเอกสารที่ตรงกับเงื่อนไขที่กรอง"
            : "ยังไม่มีใบขาย — ออกเอกสารที่เมนู “ขายสินค้าและบริการ” ก่อน"}
        </Empty>
      )}
    </Card>
  );
}

/* --------------------------------------------------- ทะเบียนสินค้า */

function ProductsReport({ inv, db, filter, FilterBar, print, toast }) {
  const list = useMemo(
    () =>
      db.products
        .filter((p) => {
          if (filter.productId && p.id !== filter.productId) return false;
          return filter.match(p.code, p.name, p.unit, p.cat, p.barcode, p.note);
        })
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code, "th")),
    [db.products, filter]
  );

  const HEAD = ["รหัสสินค้า", "ชื่อสินค้า", "หน่วย", "หมวดหมู่", "ราคา", "จุดสั่งซื้อ",
    "คงเหลือรวม", "บาร์โค๊ด", "คลังประจำ", "ที่เก็บประจำ"];

  const rows = () =>
    list.map((p) => [
      p.code, p.name, p.unit, p.cat, p.price, p.min,
      inv.stockTotal(p.id), p.barcode,
      p.defWhId ? inv.whName(p.defWhId) : "",
      p.defLocId ? inv.locName(p.defLocId) : "",
    ]);

  return (
    <Card
      title="ทะเบียนสินค้า"
      actions={
        <>
          <Badge kind={list.length ? "info" : "gray"}>{list.length} รายการ</Badge>
          <PrintPair
            onPrint={() => {
              if (!list.length) return toast("ไม่มีข้อมูลสำหรับพิมพ์", "warn");
              print({
                title: "ทะเบียนสินค้า",
                subtitle: "ทั้งหมด " + list.length + " รายการ · ณ วันที่ " + thDate(todayISO()),
                body: (
                  <table>
                    <thead>
                      <tr>
                        <th>ลำดับ</th>
                        {HEAD.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows().map((r, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          {r.map((c, j) => (
                            <td key={j}>{typeof c === "number" ? num(c) : c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
              });
            }}
            toast={toast}
          />
          <ExportPair
            onExport={(save) => save(HEAD, rows(), "ทะเบียนสินค้า.csv")}
            disabled={!list.length}
            toast={toast}
          />
        </>
      }
    >
      {FilterBar}
      {list.length ? (
        <div className="doc-scroll" style={{ maxHeight: 520 }}>
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 110 }}>รหัสสินค้า</th>
                <th style={{ minWidth: 200 }}>ชื่อสินค้า</th>
                <th style={{ width: 80 }}>หน่วย</th>
                <th style={{ minWidth: 120 }}>หมวดหมู่</th>
                <th className="num" style={{ width: 100 }}>ราคา</th>
                <th className="num" style={{ width: 100 }}>จุดสั่งซื้อ</th>
                <th className="num" style={{ width: 110 }}>คงเหลือรวม</th>
                <th style={{ minWidth: 140 }}>บาร์โค๊ด</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const q = inv.stockTotal(p.id);
                return (
                  <tr key={p.id}>
                    <td className="code-cell">{p.code}</td>
                    <td>{p.name}</td>
                    <td>{p.unit}</td>
                    <td>{p.cat}</td>
                    <td className="num">{num(p.price, 2)}</td>
                    <td className="num">{num(p.min, 0)}</td>
                    {/* ต่ำกว่าจุดสั่งซื้อให้เห็นทันทีในตารางเดียวกัน ไม่ต้องไปเปิดอีกหน้า */}
                    <td className="num" style={q < p.min ? { color: "var(--err)", fontWeight: 700 } : undefined}>
                      {num(q, 0)}
                    </td>
                    <td>{p.barcode || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </div>
      ) : (
        <Empty>ไม่พบสินค้าที่ตรงกับเงื่อนไขที่กรอง</Empty>
      )}
    </Card>
  );
}

/* ------------------------------------------------ คลังและช่องเก็บ */

/**
 * ผังคลังและช่องเก็บแบบเป็นตาราง พร้อมของที่วางอยู่จริงในแต่ละช่อง
 *
 * หน้าผังที่เก็บสินค้าดูเป็นภาพได้ทีละคลัง หน้านี้ดูรวมทุกคลังและพิมพ์ออกไปได้
 * ใช้ตอนไปเดินตรวจของหน้างานว่าช่องไหนควรมีอะไรอยู่บ้าง
 */
function BinsReport({ inv, db, filter, FilterBar, print, toast }) {
  const list = useMemo(() => {
    const out = [];
    db.warehouses.forEach((w) => {
      if (filter.whId && w.id !== filter.whId) return;
      inv.locsOf(w.id).forEach((l) => {
        if (filter.locId && l.id !== filter.locId) return;

        const items = inv.placementsIn(l.id);
        const names = items.map((x) => inv.prodName(x.productId));
        if (!filter.match(w.code, w.name, w.province, l.code, l.name, l.zone, l.note, ...names)) {
          return;
        }
        out.push({
          w,
          l,
          items: items.length,
          qty: items.reduce((n, x) => n + x.qty, 0),
          names,
        });
      });
    });
    return out;
  }, [db.warehouses, db.locations, db.placements, filter, inv]);

  const HEAD = ["รหัสคลัง", "ชื่อคลัง", "จังหวัด", "รหัสช่องเก็บ", "ชื่อช่องเก็บ",
    "โซน", "แถว", "คอลัมน์", "ความจุ", "จำนวนสินค้า", "รวมจำนวนของ", "สินค้าที่วางอยู่"];

  const rows = () =>
    list.map((r) => [
      r.w.code, r.w.name, r.w.province,
      r.l.code, r.l.name, r.l.zone, r.l.row, r.l.col, r.l.capacity,
      r.items, r.qty, r.names.join(", "),
    ]);

  return (
    <Card
      title="คลังและช่องเก็บ"
      actions={
        <>
          <Badge kind={list.length ? "info" : "gray"}>{list.length} ช่อง</Badge>
          <PrintPair
            onPrint={() => {
              if (!list.length) return toast("ไม่มีข้อมูลสำหรับพิมพ์", "warn");
              print({
                title: "รายงานคลังและช่องเก็บสินค้า",
                subtitle:
                  (filter.whId ? inv.whName(filter.whId) : "ทุกคลัง") +
                  " · " + list.length + " ช่อง · ณ วันที่ " + thDate(todayISO()),
                body: (
                  <table>
                    <thead>
                      <tr>
                        <th>ลำดับ</th>
                        <th>คลัง</th>
                        <th>ช่องเก็บ</th>
                        <th>โซน</th>
                        <th style={{ textAlign: "right" }}>จำนวนสินค้า</th>
                        <th style={{ textAlign: "right" }}>รวมจำนวนของ</th>
                        <th>สินค้าที่วางอยู่</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r, i) => (
                        <tr key={r.l.id}>
                          <td>{i + 1}</td>
                          <td>{r.w.name}</td>
                          <td>{r.l.code}{r.l.name ? " — " + r.l.name : ""}</td>
                          <td>{r.l.zone}</td>
                          <td style={{ textAlign: "right" }}>{num(r.items, 0)}</td>
                          <td style={{ textAlign: "right" }}>{num(r.qty, 0)}</td>
                          <td>{r.names.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
              });
            }}
            toast={toast}
          />
          <ExportPair
            onExport={(save) => save(HEAD, rows(), "คลังและช่องเก็บ.csv")}
            disabled={!list.length}
            toast={toast}
          />
        </>
      }
    >
      {FilterBar}
      {list.length ? (
        <div className="doc-scroll" style={{ maxHeight: 520 }}>
          <TableWrap>
            <thead>
              <tr>
                <th style={{ minWidth: 160 }}>คลัง</th>
                <th style={{ width: 110 }}>รหัสช่องเก็บ</th>
                <th style={{ minWidth: 150 }}>ชื่อช่องเก็บ</th>
                <th style={{ width: 70 }}>โซน</th>
                <th className="num" style={{ width: 100 }}>ความจุ</th>
                <th className="num" style={{ width: 110 }}>จำนวนสินค้า</th>
                <th className="num" style={{ width: 120 }}>รวมจำนวนของ</th>
                <th style={{ minWidth: 220 }}>สินค้าที่วางอยู่</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.l.id}>
                  <td>{r.w.name}</td>
                  <td className="code-cell">{r.l.code}</td>
                  <td>{r.l.name || "—"}</td>
                  <td>{r.l.zone}</td>
                  <td className="num">{r.l.capacity ? num(r.l.capacity, 0) : "—"}</td>
                  <td className="num">{r.items ? num(r.items, 0) : "—"}</td>
                  {/* ของเกินความจุที่ตั้งไว้ ต้องเห็นทันทีตอนกวาดตา ไม่ใช่ต้องมานั่งเทียบเอง */}
                  <td
                    className="num"
                    style={
                      r.l.capacity && r.qty > r.l.capacity
                        ? { color: "var(--err)", fontWeight: 700 }
                        : undefined
                    }
                  >
                    {r.qty ? num(r.qty, 0) : "—"}
                  </td>
                  <td className="muted">{r.names.join(", ") || "ว่าง"}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      ) : (
        <Empty>ไม่พบช่องเก็บที่ตรงกับเงื่อนไขที่กรอง</Empty>
      )}
    </Card>
  );
}

/* -------------------------------------- ทะเบียนลูกค้า / เจ้าหนี้ */

const PARTY_CFG = {
  customers: { name: "ทะเบียนลูกค้า", who: "ลูกค้า", key: "customers", idKey: "custId" },
  suppliers: { name: "ทะเบียนเจ้าหนี้", who: "เจ้าหนี้", key: "suppliers", idKey: "supId" },
};

/**
 * ทะเบียนคู่ค้า — โครงเดียวกันทั้งลูกค้าและเจ้าหนี้
 * เพราะสองตารางนี้มีคอลัมน์เหมือนกันทุกช่อง ต่างกันแค่ทิศทางของการค้า
 */
function PartyReport({ inv, db, kind, filter, FilterBar, print, toast }) {
  const cfg = PARTY_CFG[kind];

  const list = useMemo(() => {
    const only = filter[cfg.idKey];
    return (db[cfg.key] || [])
      .filter((c) => {
        if (only && c.id !== only) return false;
        return filter.match(
          c.code, c.name, c.phone, c.taxId, c.kind, c.branch,
          c.address, c.subdistrict, c.district, c.province, c.postcode
        );
      })
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code, "th"));
  }, [db, cfg, filter]);

  const HEAD = ["รหัส", "ชื่อ" + cfg.who, "ประเภท", "เลขผู้เสียภาษี", "สาขา",
    "ที่อยู่", "ตำบล / แขวง", "อำเภอ / เขต", "จังหวัด", "รหัสไปรษณีย์", "เบอร์โทร"];

  const rows = () =>
    list.map((c) => [
      c.code, c.name, c.kind, c.taxId, c.branch,
      c.address, c.subdistrict, c.district, c.province, c.postcode, c.phone,
    ]);

  return (
    <Card
      title={cfg.name}
      actions={
        <>
          <Badge kind={list.length ? "info" : "gray"}>{list.length} ราย</Badge>
          <PrintPair
            onPrint={() => {
              if (!list.length) return toast("ไม่มีข้อมูลสำหรับพิมพ์", "warn");
              print({
                title: cfg.name,
                subtitle: "ทั้งหมด " + list.length + " ราย · ณ วันที่ " + thDate(todayISO()),
                body: (
                  <table>
                    <thead>
                      <tr>
                        <th>ลำดับ</th>
                        <th>รหัส</th>
                        <th>ชื่อ{cfg.who}</th>
                        <th>ที่อยู่</th>
                        <th>จังหวัด</th>
                        <th>เบอร์โทร</th>
                        <th>เลขผู้เสียภาษี</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((c, i) => (
                        <tr key={c.id}>
                          <td>{i + 1}</td>
                          <td>{c.code}</td>
                          <td>{c.name}</td>
                          <td>{customerAddress(c)}</td>
                          <td>{c.province}</td>
                          <td>{c.phone}</td>
                          <td>{c.taxId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
              });
            }}
            toast={toast}
          />
          <ExportPair
            onExport={(save) => save(HEAD, rows(), cfg.name + ".csv")}
            disabled={!list.length}
            toast={toast}
          />
        </>
      }
    >
      {FilterBar}
      {list.length ? (
        <div className="doc-scroll" style={{ maxHeight: 520 }}>
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 100 }}>รหัส</th>
                <th style={{ minWidth: 200 }}>ชื่อ{cfg.who}</th>
                <th style={{ minWidth: 120 }}>ประเภท</th>
                <th style={{ minWidth: 240 }}>ที่อยู่</th>
                <th style={{ minWidth: 130 }}>จังหวัด</th>
                <th style={{ minWidth: 120 }}>เบอร์โทร</th>
                <th style={{ minWidth: 140 }}>เลขผู้เสียภาษี</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="code-cell">{c.code}</td>
                  <td>{c.name}</td>
                  <td>{c.kind || "—"}</td>
                  <td>{customerAddress(c) || "—"}</td>
                  <td>{c.province || "—"}</td>
                  <td>{c.phone || "—"}</td>
                  <td>{c.taxId || "—"}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      ) : (
        <Empty>
          {(db[cfg.key] || []).length
            ? "ไม่พบ" + cfg.who + "ที่ตรงกับเงื่อนไขที่กรอง"
            : "ยังไม่มีข้อมูล" + cfg.who}
        </Empty>
      )}
    </Card>
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
            if (!inv.itemsOfSale(s.id).some((i) => i.productId === filter.productId)) return false;
          }
          // ค้นจากค่าที่อยู่บนหน้าจอนี้จริง ๆ รวมชื่อสินค้าในบิลด้วย
          // เพราะคนมักจำได้ว่า "บิลที่ขายน้ำยางข้น" มากกว่าจำเลขที่บิล
          return filter.match(
            s.docNo,
            s.custCode,
            s.customer,
            s.date,
            thDate(s.date),
            inv.whName(s.whId),
            ...inv.itemsOfSale(s.id).map((i) => inv.prodName(i.productId))
          );
        })
        .sort((a, b) => b.ts - a.ts),
    [db.sales, db.saleItems, filter, inv]
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
        <ExportPair
          disabled={!bills.length}
          toast={toast}
          onExport={(save) => save(["วันที่", "เลขที่บิล", "คลัง", "รหัสลูกค้า", "ลูกค้า", "ยอดรวม", "ส่วนลด", "VAT", "ยอดสุทธิ", "วิธีชำระ", "ผู้ขาย"],
              bills.map((b) => [
                b.date, b.docNo, inv.whLocName(b.whId, b.locId),
                b.custCode || "", b.customer || "ลูกค้าทั่วไป",
                b.subtotal, b.discount, b.vat, b.total, payName(b.payMethod), b.user,
              ]),
              "บิลขาย.csv")}
        />
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
                  <td>
                    {/* บิลที่เลือกรหัสลูกค้าไว้ ให้เห็นรหัสด้วย จะได้ตามกลับไปหาทะเบียนได้ */}
                    {b.custCode ? <code>{b.custCode}</code> : null}
                    {b.custCode ? " " : ""}
                    {b.customer || "ลูกค้าทั่วไป"}
                  </td>
                  <td className="num">{items.length}</td>
                  <td className="num">
                    <b>{num(b.total, 2)}</b>
                  </td>
                  <td>{payName(b.payMethod)}</td>
                  <td style={{ fontSize: 12.5 }}>{b.user}</td>
                  <td>
                    <PrintPair
                      onPrint={() =>
                        print({
                          receipt: true,
                          title: "ใบเสร็จรับเงิน",
                          body: <ReceiptBody inv={inv} sale={b} items={items} />,
                        })}
                      toast={toast}
                      label="พิมพ์ใบเสร็จ"
                    />
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
        .filter((p) => {
          if (filter.productId && p.id !== filter.productId) return false;
          // ค้นจากค่าที่แสดงบนตารางนี้: รหัส ชื่อ หน่วย หมวด และบาร์โค๊ด
          return filter.match(p.code, p.name, p.unit, p.cat, p.barcode);
        })
        .map((p) => {
          const q = filter.locId
            ? inv.placedIn(p.id, filter.locId)
            : filter.whId
              ? inv.stockOf(p.id, filter.whId)
              : inv.stockTotal(p.id);
          return { p, q, v: q * p.price };
        }),
    [db.products, filter, db.placements, inv]
  );

  const totalQty = rows.reduce((s, r) => s + r.q, 0);
  const totalVal = rows.reduce((s, r) => s + r.v, 0);

  return (
    <Card
      title="สรุปยอดคงเหลือ"
      actions={
        <>
          <PrintPair
            onPrint={() =>
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
              })}
            toast={toast}
            label="พิมพ์"
          />
          <ExportPair
            disabled={!rows.length}
            toast={toast}
            onExport={(save) => save(["รหัส", "รายการสินค้า", "หมวดหมู่", "หน่วย", "คงเหลือ", "จุดสั่งซื้อ", "มูลค่า"],
                rows.map((r) => [r.p.code, r.p.name, r.p.cat, r.p.unit, r.q, r.p.min, r.v]),
                "สรุปยอดคงเหลือ.csv")}
          />
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
function CountReport({ inv, db, filter, FilterBar, print, toast }) {
  const whId = filter.whId || db.warehouses[0].id;
  const w = inv.wh(whId);

  return (
    <Card
      title="ใบตรวจนับสินค้าคงคลัง"
      actions={
        <PrintPair
          onPrint={() =>
            print({
              title: "ใบตรวจนับสินค้าคงคลัง",
              subtitle:
                (w ? w.name + " · จังหวัด" + w.province : "ทุกคลัง") + " · ณ วันที่ " + thDate(todayISO()),
              body: <CountSheetBody db={db} inv={inv} whId={whId} />,
            })}
          toast={toast}
          label="พิมพ์ใบตรวจนับ"
        />
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
          <PrintPair
            onPrint={() =>
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
              })}
            toast={toast}
            label="พิมพ์"
          />
          <ExportPair
            disabled={!rows.length}
            toast={toast}
            onExport={(save) => save(["วันที่", "เลขที่เอกสาร", "ประเภท", "คลัง", "รับ", "จ่าย", "คงเหลือ"],
                rows.map((r) => [
                  r.t.date, r.t.docNo, TYPES[r.t.type].name, inv.whLocName(r.t.whId, r.t.locId),
                  r.mv > 0 ? r.mv : "", r.mv < 0 ? -r.mv : "", r.bal,
                ]),
                "บัตรสินค้า.csv")}
          />
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
    () =>
      db.txns
        .filter((t) => {
          if (t.type !== type || !inRange(t)) return false;
          const p = inv.prod(t.productId);
          return filter.match(
            t.docNo,
            t.ref,
            t.note,
            p ? p.code : "",
            inv.prodName(t.productId),
            t.date,
            thDate(t.date),
            inv.whName(t.whId),
            t.whTo ? inv.whName(t.whTo) : "",
            t.user
          );
        })
        .sort((a, b) => a.ts - b.ts),
    [db.txns, type, filter, inv] // eslint-disable-line react-hooks/exhaustive-deps
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
          <PrintPair
            onPrint={() => {
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
            toast={toast}
            label="พิมพ์"
          />
          <ExportPair
            disabled={!list.length}
            toast={toast}
            onExport={(save) => save(["วันที่", "เลขที่เอกสาร", "รหัสสินค้า", "รายการสินค้า", "หน่วย", "คลัง", "ที่เก็บ",
                  "คลังปลายทาง", "ที่เก็บปลายทาง", "จำนวน", "ผู้ทำรายการ", "หมายเหตุ"],
                list.map((t) => {
                  const p = inv.prod(t.productId);
                  return [t.date, t.docNo, p ? p.code : "", inv.prodName(t.productId), p ? p.unit : "",
                    inv.whName(t.whId), t.locId ? inv.locName(t.locId) : "",
                    t.whTo ? inv.whName(t.whTo) : "", t.locTo ? inv.locName(t.locTo) : "",
                    t.qty, t.user, t.note || t.ref || ""];
                }),
                "รายงาน" + T.name + ".csv")}
          />
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

/* ------------------------------------- รายงานเอกสารการค้า (ขาย/ซื้อ/ส่งคืน) */

/**
 * เอกสารทั้งสามชนิดมีโครงเหมือนกัน (เลขที่ วันที่ คู่ค้า ยอดก่อนภาษี ภาษี สุทธิ)
 * จึงใช้รายงานตัวเดียวกัน ต่างแค่ว่าอ่านจากตารางไหนและเรียกคู่ค้าว่าอะไร
 * ถ้าเขียนแยกสามชุด เวลาจะเพิ่มคอลัมน์ทีต้องไปแก้สามที่แล้วมักลืมที่ใดที่หนึ่ง
 */
const DOC_KINDS_REPORT = {
  INVOICE: {
    name: "ใบขายสินค้าและบริการ",
    party: "ลูกค้า",
    rows: (db) => db.invoices || [],
    code: (v) => v.custCode,
    partyName: (v) => v.custName,
    partyId: (v) => v.customerId,
  },
  PURCHASE: {
    name: "ใบซื้อสินค้าและบริการ",
    party: "เจ้าหนี้",
    rows: (db) => db.purchases || [],
    code: (v) => v.supCode,
    partyName: (v) => v.supName,
    partyId: (v) => v.supplierId,
  },
  PURRET: {
    name: "ใบส่งคืนสินค้า",
    party: "เจ้าหนี้",
    rows: (db) => db.purchaseReturns || [],
    code: (v) => v.supCode,
    partyName: (v) => v.supName,
    partyId: (v) => v.supplierId,
  },
};

function DocReport({ inv, db, kind, filter, FilterBar, print, toast }) {
  const cfg = DOC_KINDS_REPORT[kind];

  const list = useMemo(() => {
    const partyId = cfg.party === "ลูกค้า" ? filter.custId : filter.supId;

    return cfg
      .rows(db)
      .filter((v) => {
        if (filter.from && v.date < filter.from) return false;
        if (filter.to && v.date > filter.to) return false;
        // กดเลือกคู่ค้าจากรายการ = กรองด้วยรหัสจริง ไม่ใช่เทียบชื่อที่พิมพ์มา
        if (partyId && cfg.partyId(v) !== partyId) return false;
        return filter.match(
          v.docNo,
          v.refNo,
          v.purDocNo,
          cfg.code(v),
          cfg.partyName(v),
          v.date,
          thDate(v.date),
          v.note,
          v.user,
          v.total
        );
      })
      .slice()
      .sort((a, b) => b.ts - a.ts);
  }, [db, cfg, filter]);

  const sum = (f) => list.reduce((s, v) => s + (Number(v[f]) || 0), 0);

  /*
   * เฉพาะใบขายที่คัดลอกประเภทลูกค้าไว้ในตัวเอกสาร
   * ใบซื้อและใบส่งคืนเป็นฝั่งเจ้าหนี้ ไม่มีประเภทลูกค้าให้แสดง
   * แสดงค่าที่เก็บไว้ในใบ ไม่ได้อ่านสดจากทะเบียน รายงานย้อนหลังจึงไม่เปลี่ยน
   * เมื่อมีคนแก้ประเภทของลูกค้าทีหลัง
   */
  const isSale = kind === "INVOICE";

  function printReport() {
    if (!list.length) return toast("ไม่มีข้อมูลสำหรับพิมพ์", "warn");
    print({
      title: "รายงาน" + cfg.name,
      subtitle: "ทั้งหมด " + list.length + " ใบ",
      body: (
        <table>
          <thead>
            <tr>
              <th>ลำดับ</th>
              <th>วันที่</th>
              <th>เลขที่เอกสาร</th>
              <th>รหัส{cfg.party}</th>
              <th>ชื่อ{cfg.party}</th>
              {isSale ? <th>ประเภทลูกค้า</th> : null}
              <th style={{ textAlign: "right" }}>ก่อนภาษี</th>
              <th style={{ textAlign: "right" }}>ภาษี</th>
              <th style={{ textAlign: "right" }}>สุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {list.map((v, i) => (
              <tr key={v.id}>
                <td>{i + 1}</td>
                <td>{thDate(v.date)}</td>
                <td>{v.docNo}</td>
                <td>{cfg.code(v)}</td>
                <td>{cfg.partyName(v)}</td>
                {isSale ? <td>{v.custKind}</td> : null}
                <td style={{ textAlign: "right" }}>{num(v.base, 2)}</td>
                <td style={{ textAlign: "right" }}>{num(v.vat, 2)}</td>
                <td style={{ textAlign: "right" }}>{num(v.total, 2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>รวม {list.length} ใบ</td>
              <td style={{ textAlign: "right" }}>{num(sum("base"), 2)}</td>
              <td style={{ textAlign: "right" }}>{num(sum("vat"), 2)}</td>
              <td style={{ textAlign: "right" }}>{num(sum("total"), 2)}</td>
            </tr>
          </tfoot>
        </table>
      ),
    });
  }

  function exportFile(save) {
    save(
      ["วันที่", "เลขที่เอกสาร", "รหัส" + cfg.party, "ชื่อ" + cfg.party,
        ...(isSale ? ["ประเภทลูกค้า"] : []),
        "รวมเงิน", "ส่วนลดท้ายบิล", "ก่อนภาษี", "อัตราภาษี", "ภาษี", "สุทธิ", "ผู้บันทึก"],
      list.map((v) => [
        v.date, v.docNo, cfg.code(v), cfg.partyName(v),
        ...(isSale ? [v.custKind || ""] : []),
        v.itemsTotal, v.billDiscount, v.base, v.vatRate, v.vat, v.total, v.user,
      ]),
      "รายงาน" + cfg.name + ".csv"
    );
  }

  return (
    <Card
      title={"รายงาน" + cfg.name}
      actions={
        <>
          <Badge kind="info">{list.length} ใบ</Badge>
          <Badge>สุทธิ ฿{num(sum("total"), 2)}</Badge>
          <PrintPair onPrint={printReport} toast={toast} label="พิมพ์" />
          <ExportPair onExport={exportFile} disabled={!list.length} toast={toast} />
        </>
      }
    >
      <FilterBar />
      {list.length ? (
        <TableWrap>
          <thead>
            <tr>
              <th style={{ width: 118 }}>วันที่</th>
              <th style={{ minWidth: 150 }}>เลขที่เอกสาร</th>
              <th style={{ width: 90 }}>รหัส{cfg.party}</th>
              <th style={{ minWidth: 200 }}>ชื่อ{cfg.party}</th>
              {isSale ? <th style={{ minWidth: 130 }}>ประเภทลูกค้า</th> : null}
              <th className="num" style={{ width: 110 }}>ก่อนภาษี</th>
              <th className="num" style={{ width: 100 }}>ภาษี</th>
              <th className="num" style={{ width: 120 }}>สุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.id}>
                <td>{thDate(v.date)}</td>
                <td className="code-cell">{v.docNo}</td>
                <td>{cfg.code(v)}</td>
                <td>{cfg.partyName(v)}</td>
                {isSale ? <td className="muted">{v.custKind || "—"}</td> : null}
                <td className="num">{num(v.base, 2)}</td>
                <td className="num">{num(v.vat, 2)}</td>
                <td className="num">
                  <b>{num(v.total, 2)}</b>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={isSale ? 5 : 4}>รวม {list.length} ใบ</td>
              <td className="num">{num(sum("base"), 2)}</td>
              <td className="num">{num(sum("vat"), 2)}</td>
              <td className="num">{num(sum("total"), 2)}</td>
            </tr>
          </tfoot>
        </TableWrap>
      ) : (
        <Empty>ไม่มีเอกสารในช่วงวันที่ที่เลือก</Empty>
      )}
    </Card>
  );
}
