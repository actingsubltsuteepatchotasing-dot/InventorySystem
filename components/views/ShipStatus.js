"use client";

// หน้าจอแสดงสถานะการจัดส่ง
//
// ทำงานบนข้อมูลชุดเดียวกับหน้า "การจัดส่งสินค้า" แต่คนละงาน:
//   การจัดส่งสินค้า  = ที่ทำงานจริง ยิงบาร์โค๊ดแล้วเปลี่ยนสถานะ
//   หน้านี้          = กระดานแสดงผล กวาดดูทั้งกองว่าใบไหนค้างอยู่ขั้นไหน
//
// หน้านี้ตั้งใจให้ "ดูอย่างเดียว" เปลี่ยนสถานะไม่ได้
// สถานะต้องเกิดจากคนที่จับของจริงที่หน้าจัดส่งสินค้า ไม่ใช่จากคนที่นั่งดูกระดาน
// ไม่งั้นสองที่แก้ชนกันแล้วไม่มีใครรู้ว่าของอยู่ไหนจริง ๆ
//
// แลกมาด้วยการทำให้ "อ่านง่ายจากระยะไกล": แถบไล่ขั้น จุดสี และหัวใบที่ยังไม่จบกะพริบ

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInv } from "@/lib/store";
import { SHIP_STATUS } from "@/lib/constants";
import { num, thDate, thDateTime, todayISO } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import { useToast } from "../Toast";
import { Badge, Card, Empty, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

const statusOf = (id) => SHIP_STATUS.find((s) => s.id === id) || SHIP_STATUS[0];
const stepOf = (id) => Math.max(0, SHIP_STATUS.findIndex((s) => s.id === id));

/**
 * รอบการดึงข้อมูลใหม่เอง (10 นาที)
 *
 * หน้านี้มักถูกเปิดค้างไว้เป็นกระดานให้คนทั้งแผนกดู ไม่มีใครคอยกดรีเฟรช
 * 10 นาทีถี่พอให้ทันงานจัดส่ง แต่ไม่ถี่จนกินโควตาฐานข้อมูลโดยเปล่าประโยชน์
 */
const AUTO_MS = 10 * 60 * 1000;

/** เวลาแบบสั้น ใช้บอกว่าอัปเดตล่าสุดเมื่อไร */
const clock = (ts) =>
  new Date(ts).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

/** ขั้นสุดท้ายคืองานที่จบแล้ว ที่เหลือคือของที่ยังอยู่ระหว่างทาง */
const LAST_STEP = SHIP_STATUS.length - 1;

/**
 * แถบไล่ขั้นของใบหนึ่ง — ดูจากระยะไกลก็รู้ว่าไปถึงไหนแล้ว
 * ขั้นที่ยังไม่จบจะกะพริบเบา ๆ ให้สะดุดตากว่าใบที่ส่งถึงแล้ว
 */
function ShipTrack({ status }) {
  const at = stepOf(status);
  const st = statusOf(status);
  const done = at >= LAST_STEP;

  return (
    <span className="ship-pill" title={st.name}>
      <span className="ship-track" aria-hidden="true">
        {SHIP_STATUS.map((s, i) => (
          <i
            key={s.id}
            className={"tick" + (i <= at ? " on" : "") + (i === at && !done ? " live" : "")}
            style={{ background: i <= at ? st.color : undefined }}
          />
        ))}
      </span>
      <b style={{ color: st.color }}>{st.name}</b>
    </span>
  );
}

export default function ShipStatus() {
  const inv = useInv();
  const { db } = inv;
  const toast = useToast();

  const scanRef = useRef(null);
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("");
  const [province, setProvince] = useState("");
  /*
   * ช่วงวันที่เริ่มที่ "วันนี้" เสมอ เพราะกระดานนี้ใช้ดูงานของวันนี้เป็นหลัก
   * ไม่ใช่ดูย้อนหลังทั้งหมด เปิดมาแล้วเห็นทั้งกองตั้งแต่เปิดร้านจะหาของวันนี้ไม่เจอ
   */
  const [from, setFrom] = useState(todayISO);
  const [to, setTo] = useState(todayISO);

  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState(() => Date.now());

  const invoices = useMemo(
    () => (db.invoices || []).slice().sort((a, b) => b.ts - a.ts),
    [db.invoices]
  );

  /** จังหวัดที่มีใบขายจริงเท่านั้น ไม่เอา 77 จังหวัดมาใส่ให้เลื่อนหา */
  const provinces = useMemo(() => {
    const set = new Set();
    invoices.forEach((v) => {
      if (v.custProvince) set.add(v.custProvince);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "th"));
  }, [invoices]);

  const rows = useMemo(() => {
    const s = term.trim().toLowerCase();
    return invoices.filter((v) => {
      if (status && v.shipStatus !== status) return false;
      if (province && v.custProvince !== province) return false;
      // วันที่เป็นรูปแบบ YYYY-MM-DD จึงเทียบเป็นสตริงได้ตรง ๆ ไม่ต้องแปลงเป็น Date
      if (from && v.date < from) return false;
      if (to && v.date > to) return false;
      if (!s) return true;
      return [v.docNo, v.custCode, v.custName, v.custProvince, v.custAddress, thDate(v.date)]
        .join(" ")
        .toLowerCase()
        .includes(s);
    });
  }, [invoices, term, status, province, from, to]);

  /* ------------------------------------------------- ดึงข้อมูลใหม่ */

  /**
   * ใช้ refresh ไม่ใช่ reload — reload จะล้างหน้าจอเป็นหน้า error เมื่อโหลดไม่สำเร็จ
   * กระดานที่เปิดค้างไว้ทั้งวันจะพังทันทีที่เน็ตกระตุกครั้งเดียว
   */
  const pull = useCallback(
    async (silent) => {
      try {
        await inv.refresh();
        setLastSync(Date.now());
        if (!silent) toast("อัพเดทข้อมูลแล้ว", "ok");
      } catch (e) {
        // เงียบไว้ตอนดึงเอง ข้อมูลเดิมยังอยู่บนจอและอีก 10 นาทีจะลองใหม่
        if (!silent) toast("อัพเดทไม่สำเร็จ: " + e.message, "err");
      }
    },
    [inv, toast]
  );

  async function manualPull() {
    if (refreshing) return;
    setRefreshing(true);
    await pull(false);
    setRefreshing(false);
  }

  /*
   * วันที่ตั้งต้นต้องเลื่อนตามวันจริงด้วย
   * กระดานที่เปิดค้างข้ามเที่ยงคืนจะได้ไม่ค้างอยู่ที่ข้อมูลของเมื่อวาน
   * ขยับให้เฉพาะตอนที่ผู้ใช้ยังไม่ได้แตะช่องวันที่เอง
   */
  const baseDay = useRef(todayISO());

  const onTick = useRef(null);

  // เขียนทับทุกรอบ render เพื่อให้ตัวจับเวลาเรียกโค้ดที่เห็นค่าล่าสุดเสมอ
  // ถ้าผูกฟังก์ชันไว้กับ setInterval ตรง ๆ มันจะค้างอยู่กับค่าตอนตั้งจับเวลาครั้งแรก
  useEffect(() => {
    onTick.current = () => {
      const now = todayISO();
      if (baseDay.current !== now) {
        if (from === baseDay.current && to === baseDay.current) {
          setFrom(now);
          setTo(now);
        }
        baseDay.current = now;
      }
      pull(true);
    };
  });

  useEffect(() => {
    // แท็บที่ซ่อนอยู่ไม่ต้องดึง ไม่มีใครดู แล้วค่อยดึงตอนกลับมาเปิด
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      onTick.current();
    }, AUTO_MS);

    const onShow = () => {
      if (!document.hidden && Date.now() - lastSync >= AUTO_MS) onTick.current();
    };
    document.addEventListener("visibilitychange", onShow);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSync]);

  /** ยิงบาร์โค๊ดหรือกด Enter = กรองเหลือใบนั้นใบเดียว */
  function submitScan() {
    const s = term.trim();
    if (!s) return;
    const hit = invoices.find((v) => v.docNo.toLowerCase() === s.toLowerCase());
    if (!hit) {
      return toast(rows.length ? "ไม่พบเลขที่ตรงเป๊ะ — แสดงผลใกล้เคียงแทน" : "ไม่พบเอกสารเลขที่ " + s,
        rows.length ? "warn" : "err");
    }
    // เลขตรงเป๊ะแล้วให้ล้างตัวกรองอื่น ไม่งั้นใบที่ยิงมาอาจถูกกรองทิ้งจนไม่เห็น
    setStatus("");
    setProvince("");
    setFrom("");
    setTo("");
  }

  /** ล้างกลับไปที่ค่าตั้งต้น ซึ่งคือ "งานของวันนี้" ไม่ใช่ "ทุกวัน" */
  function clearFilters() {
    setTerm("");
    setStatus("");
    setProvince("");
    setFrom(todayISO());
    setTo(todayISO());
    if (scanRef.current) scanRef.current.focus();
  }

  function exportCSV() {
    if (!rows.length) return toast("ไม่มีข้อมูลสำหรับส่งออก", "warn");
    downloadCSV(
      ["เลขที่เอกสาร", "วันที่เอกสาร", "รหัสลูกค้า", "ชื่อลูกค้า", "จังหวัดที่ส่ง",
        "สถานะการจัดส่ง", "ยอดสุทธิ", "ต้นทาง", "แก้สถานะล่าสุด"],
      rows.map((v) => [
        v.docNo, v.date, v.custCode, v.custName, v.custProvince,
        statusOf(v.shipStatus).name, v.total,
        v.shipFrom ? inv.whName(v.shipFrom) : "",
        v.shipTs ? thDateTime(v.shipTs) : "",
      ]),
      "สถานะการจัดส่ง.csv"
    );
    toast("ส่งออกไฟล์ CSV แล้ว");
  }

  if (!inv.invoicesReady) {
    return <SetupNotice feature="หน้าจอสถานะการจัดส่ง" tables={["invoices", "invoice_items"]} />;
  }

  // ค่าตั้งต้น (วันนี้) ไม่นับว่ากรองอยู่ ไม่งั้นปุ่มล้างตัวกรองจะขึ้นค้างตลอดเวลา
  const today = todayISO();
  const filtering = !!(
    term || status || province || from !== today || to !== today
  );

  return (
    <div className="stack">
      <Card
        title="สถานะการจัดส่ง"
        actions={
          <>
            <Badge kind={filtering ? "info" : "gray"}>
              {filtering ? rows.length + " จาก " + invoices.length : invoices.length} ใบ
            </Badge>
            <span className="sync-at" title={"อัพเดทล่าสุด " + thDateTime(lastSync)}>
              อัพเดท {clock(lastSync)}
            </span>
            <button className="btn btn-p btn-sm" onClick={manualPull} disabled={refreshing}>
              {refreshing ? "กำลังอัพเดท…" : "อัพเดทข้อมูล"}
            </button>
            <button className="btn btn-o btn-sm" onClick={exportCSV}>
              ส่งออก CSV
            </button>
            {filtering ? (
              <button className="btn btn-g btn-sm" onClick={clearFilters}>
                ล้างตัวกรอง
              </button>
            ) : null}
          </>
        }
      >
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <div className="field span2">
            <label className="lbl" htmlFor="ss_q">ค้นหา</label>
            <input
              className="inp"
              id="ss_q"
              ref={scanRef}
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitScan();
                }
              }}
              placeholder="ยิงบาร์โค๊ด หรือพิมพ์ เลขที่เอกสาร / รหัสลูกค้า / ชื่อลูกค้า / จังหวัด / วันที่"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ss_st">สถานะการจัดส่ง</label>
            <select
              className="sel"
              id="ss_st"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">ทุกสถานะ</option>
              {SHIP_STATUS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ss_pv">จังหวัดที่ส่ง</label>
            <select
              className="sel"
              id="ss_pv"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
            >
              <option value="">ทุกจังหวัด</option>
              {provinces.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ss_from">ตั้งแต่วันที่</label>
            <input
              className="inp"
              type="date"
              id="ss_from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="ss_to">ถึงวันที่</label>
            <input
              className="inp"
              type="date"
              id="ss_to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        {/* สีของแต่ละสถานะ บอกไว้ครั้งเดียว ในตารางจะได้ดูแค่จุดสีก็รู้ */}
        <div className="ship-legend" style={{ marginBottom: 12 }}>
          {SHIP_STATUS.map((s) => (
            <span key={s.id}>
              <i className="dot" style={{ background: s.color }} />
              {s.name} · {invoices.filter((v) => v.shipStatus === s.id).length} ใบ
            </span>
          ))}
        </div>

        {rows.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>เลขที่เอกสาร</th>
                <th style={{ width: 118 }}>วันที่เอกสาร</th>
                <th style={{ width: 90 }}>รหัสลูกค้า</th>
                <th style={{ minWidth: 190 }}>ชื่อลูกค้า</th>
                <th style={{ minWidth: 140 }}>จังหวัดที่ส่ง</th>
                <th className="num" style={{ width: 110 }}>ยอดสุทธิ</th>
                <th style={{ minWidth: 175 }}>สถานะการจัดส่ง</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v, i) => (
                  /* แถวไล่กันโผล่ทีละนิด ทำให้ตอนเปลี่ยนตัวกรองแล้วตารางไม่กระโดดใส่หน้า */
                  <tr
                    key={v.id}
                    className="row-in"
                    style={{ animationDelay: Math.min(i, 12) * 22 + "ms" }}
                  >
                    <td className="code-cell">{v.docNo}</td>
                    <td>{thDate(v.date)}</td>
                    <td>{v.custCode}</td>
                    <td>{v.custName}</td>
                    <td>{v.custProvince || "—"}</td>
                    <td className="num">{num(v.total, 2)}</td>
                    <td>
                      <ShipTrack status={v.shipStatus} />
                    </td>
                  </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>
            {invoices.length
              ? "ไม่พบเอกสารที่ตรงกับเงื่อนไขที่กรอง"
              : "ยังไม่มีใบขาย — ออกเอกสารที่เมนู “ขายสินค้าและบริการ” ก่อน"}
          </Empty>
        )}
      </Card>
    </div>
  );
}
