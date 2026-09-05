"use client";

// หน้าจอแสดงสถานะการจัดส่ง
//
// ทำงานบนข้อมูลชุดเดียวกับหน้า "การจัดส่งสินค้า" แต่คนละงาน:
//   การจัดส่งสินค้า  = ทำงานทีละใบ ดูเส้นทางบนแผนที่ แล้วเดินสถานะ
//   หน้านี้          = กวาดดูทั้งกองว่าใบไหนค้างอยู่ขั้นไหน ค้นและกรองได้ละเอียดกว่า
//
// จึงเน้นตารางกับตัวกรอง ไม่มีแผนที่ และเปลี่ยนสถานะได้จากในตารางเลย
// ไม่ต้องเปิดเข้าไปทีละใบ

import { useMemo, useRef, useState } from "react";
import { useInv } from "@/lib/store";
import { SHIP_STATUS } from "@/lib/constants";
import { num, thDate, thDateTime } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import { useToast } from "../Toast";
import { Badge, Card, Empty, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

const statusOf = (id) => SHIP_STATUS.find((s) => s.id === id) || SHIP_STATUS[0];

export default function ShipStatus() {
  const inv = useInv();
  const { db } = inv;
  const toast = useToast();

  const canEdit = inv.perm("shipstatus").edit;

  const scanRef = useRef(null);
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("");
  const [province, setProvince] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState("");

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

  async function move(v, next) {
    if (busy || !canEdit) return;
    setBusy(v.id);
    try {
      await inv.setInvoiceShip(v.id, {
        shipStatus: next,
        shipFrom: v.shipFrom,
        shipNote: v.shipNote,
        shipTs: Date.now(),
      });
    } catch (e) {
      toast("เปลี่ยนสถานะไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  function clearFilters() {
    setTerm("");
    setStatus("");
    setProvince("");
    setFrom("");
    setTo("");
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

  const filtering = !!(term || status || province || from || to);

  return (
    <div className="stack">
      <Card
        title="สถานะการจัดส่ง"
        actions={
          <>
            <Badge kind={filtering ? "info" : "gray"}>
              {filtering ? rows.length + " จาก " + invoices.length : invoices.length} ใบ
            </Badge>
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
              {rows.map((v) => {
                const st = statusOf(v.shipStatus);
                return (
                  <tr key={v.id}>
                    <td className="code-cell">{v.docNo}</td>
                    <td>{thDate(v.date)}</td>
                    <td>{v.custCode}</td>
                    <td>{v.custName}</td>
                    <td>{v.custProvince || "—"}</td>
                    <td className="num">{num(v.total, 2)}</td>
                    <td>
                      {canEdit ? (
                        /* เปลี่ยนสถานะได้จากในตารางเลย ไม่ต้องเปิดเข้าไปทีละใบ */
                        <span className="ship-cell">
                          <i className="dot" style={{ background: st.color }} />
                          <select
                            className="sel sel-sm"
                            value={v.shipStatus}
                            onChange={(e) => move(v, e.target.value)}
                            disabled={busy === v.id}
                            aria-label={"สถานะการจัดส่งของ " + v.docNo}
                          >
                            {SHIP_STATUS.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </span>
                      ) : (
                        <Badge kind={st.kind}>
                          <i className="dot" style={{ background: st.color }} />
                          {st.name}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
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
