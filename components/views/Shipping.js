"use client";

// หน้าจอการจัดส่งสินค้า — ตามใบขายที่ออกจากหน้า "ขายสินค้าและบริการ"
//
// ที่อยู่ปลายทางอ่านจาก "ที่อยู่ที่บันทึกไว้ในใบ" ไม่ใช่จากทะเบียนลูกค้าสด ๆ
// เพราะของต้องไปตามที่อยู่ที่ตกลงกันตอนออกใบ ไม่ใช่ที่อยู่ที่ลูกค้าเพิ่งย้ายไป
//
// ช่องเลขที่เอกสารรับได้ทั้งการยิงบาร์โค๊ดและการพิมพ์ค้นหา
// เครื่องอ่านบาร์โค๊ดทำงานเหมือนคีย์บอร์ด: พิมพ์รวดเดียวแล้วกด Enter
// จึงไม่ต้องต่ออุปกรณ์อะไรเป็นพิเศษ แค่ให้เคอร์เซอร์อยู่ในช่องนี้
//
// ยิงเจอแล้วเด้งกล่องให้เลือกสถานะทันที ไม่ใช่แค่เปิดใบขึ้นมาเฉย ๆ
// เพราะคนที่ยิงคือคนที่กำลังจับของอยู่ตรงนั้น เขายิงเพื่อจะบอกว่า "ของถึงขั้นนี้แล้ว"
// ถ้าให้ยิงเสร็จแล้วต้องเลื่อนหาปุ่มต่ออีก คือเพิ่มขั้นตอนให้คนที่มือไม่ว่าง
//
// สถานะทั้งระบบเปลี่ยนได้ที่นี่ที่เดียว หน้า "สถานะการจัดส่ง" เป็นกระดานดูอย่างเดียว

import { useEffect, useMemo, useRef, useState } from "react";
import { useInv } from "@/lib/store";
import { SHIP_STATUS } from "@/lib/constants";
import { num, thDate, thDateTime } from "@/lib/format";
import { geocodeAddress, roadDistance } from "@/lib/geo";
import { useToast } from "../Toast";
import { IcPin, IcReport } from "../Icons";
import Modal from "../Modal";
import { Badge, Card, Empty, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

const statusOf = (id) => SHIP_STATUS.find((s) => s.id === id) || SHIP_STATUS[0];

/** หน่วงเวลาแบบสั้น ใช้เว้นจังหวะไม่ให้ยิงบริการภายนอกรัวเกินที่เขาอนุญาต */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function Shipping() {
  const inv = useInv();

  // ไม่ติ๊ก "แก้ไข" แล้วดูได้อย่างเดียว เปลี่ยนสถานะและต้นทางไม่ได้
  const perm = inv.perm("shipping");
  const { db } = inv;
  const toast = useToast();

  const scanRef = useRef(null);
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);

  /** ใบที่เพิ่งยิงบาร์โค๊ดเจอ — ไม่ว่างเมื่อไรกล่องเลือกสถานะจะเด้งขึ้นมา */
  const [scanned, setScanned] = useState("");

  /** ข้อความบอกความคืบหน้าตอนคำนวณระยะทางเป็นชุด */
  const [calc, setCalc] = useState("");

  const invoices = useMemo(
    () => (db.invoices || []).slice().sort((a, b) => b.ts - a.ts),
    [db.invoices]
  );

  const rows = useMemo(() => {
    const s = term.trim().toLowerCase();
    return invoices.filter((v) => {
      if (filter && v.shipStatus !== filter) return false;
      if (!s) return true;
      return [v.docNo, v.custCode, v.custName, v.custAddress]
        .join(" ")
        .toLowerCase()
        .includes(s);
    });
  }, [invoices, term, filter]);

  const doc = invoices.find((v) => v.id === selected) || null;

  // เอกสารที่เลือกไว้ถูกกรองออกไปแล้ว ให้เลิกเลือก ไม่งั้นแผงล่างจะโชว์ใบที่ไม่อยู่ในตาราง
  useEffect(() => {
    if (selected && !rows.some((v) => v.id === selected)) setSelected("");
  }, [rows, selected]);

  /** ยิงบาร์โค๊ดหรือกด Enter = เปิดใบนั้นแล้วเด้งกล่องเลือกสถานะให้เลย */
  function submitScan() {
    const s = term.trim();
    if (!s) return;

    const hit = invoices.find((v) => v.docNo.toLowerCase() === s.toLowerCase());
    if (hit) {
      setSelected(hit.id);
      setFilter("");
      setTerm("");
      // เด้งกล่องเลือกสถานะทันที คนยิงจะได้กดขั้นที่ของไปถึงแล้วจบในจังหวะเดียว
      if (perm.edit) setScanned(hit.id);
      else if (scanRef.current) scanRef.current.focus();
      return;
    }

    const near = rows.length;
    toast(
      near
        ? "ไม่พบเลขที่ " + s + " ตรงเป๊ะ — แสดงผลที่ใกล้เคียง " + near + " รายการแทน"
        : "ไม่พบเอกสารเลขที่ " + s,
      near ? "warn" : "err"
    );
  }

  async function setStatus(id, status) {
    if (busy) return;
    const target = invoices.find((v) => v.id === id);
    if (!target) return;

    setBusy(true);
    try {
      await inv.setInvoiceShip(id, {
        shipStatus: status,
        shipFrom: target.shipFrom,
        shipNote: target.shipNote,
        shipTs: Date.now(),
      });
      toast(target.docNo + " → " + statusOf(status).name, "ok");
    } catch (e) {
      toast("เปลี่ยนสถานะไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  /** เลือกสถานะจากกล่องที่เด้งหลังยิงบาร์โค๊ด แล้วกลับไปรอยิงใบถัดไป */
  async function pickScanned(status) {
    await setStatus(scanned, status);
    setScanned("");
    if (scanRef.current) scanRef.current.focus();
  }

  /*
   * คำนวณระยะทางของใบหนึ่ง แล้วเก็บผลไว้
   *
   * ทำที่หน้านี้ ไม่ใช่ที่กระดานสถานะ เพราะระยะทางรู้ได้ก็ต่อเมื่อรู้คลังต้นทางแล้ว
   * ซึ่งเป็นค่าที่ตั้งกันที่หน้านี้ และกระดานเป็นหน้าดูอย่างเดียว
   *
   * พิกัดปลายทางถูกเก็บไว้ในใบด้วย ครั้งหน้าเปลี่ยนคลังต้นทางจะได้ไม่ต้องแปลงที่อยู่ใหม่
   * (การแปลงที่อยู่เป็นพิกัดจำกัด 1 คำขอต่อวินาที ส่วนการหาเส้นทางไม่จำกัด)
   */
  async function computeKm(v, whId) {
    const wh = inv.wh(whId || v.shipFrom);
    if (!wh) return { ok: false, why: "ยังไม่ได้เลือกคลังต้นทาง" };
    if (!v.custAddress) return { ok: false, why: "ใบนี้ไม่มีที่อยู่จัดส่ง" };

    let lat = v.custLat;
    let lng = v.custLng;
    let geocoded = false;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const hit = await geocodeAddress(v.custAddress);
      if (!hit) return { ok: false, why: "หาพิกัดจากที่อยู่ไม่ได้" };
      lat = hit.lat;
      lng = hit.lng;
      geocoded = true;
    }

    const route = await roadDistance({ lat: wh.lat, lng: wh.lng }, { lat, lng });
    if (!route) return { ok: false, why: "หาเส้นทางระหว่างสองจุดไม่ได้" };

    await inv.setInvoiceDistance(v.id, {
      custLat: lat,
      custLng: lng,
      shipKm: route.km,
      shipKmAt: Date.now(),
    });
    return { ok: true, km: route.km, geocoded };
  }

  async function calcOne(v) {
    if (calc) return;
    setCalc("กำลังคำนวณ…");
    try {
      const r = await computeKm(v);
      toast(r.ok ? v.docNo + " ระยะทาง " + num(r.km, 1) + " กม." : r.why, r.ok ? "ok" : "warn");
    } catch (e) {
      toast("คำนวณระยะทางไม่สำเร็จ: " + e.message, "err");
    } finally {
      setCalc("");
    }
  }

  /**
   * เติมระยะทางให้ใบที่ยังไม่มี ทีละใบ
   *
   * ต้องเว้นจังหวะระหว่างใบ เพราะบริการแปลงที่อยู่เป็นพิกัดอนุญาต 1 คำขอต่อวินาที
   * ยิงรัวจะโดนบล็อกทั้งชุดแล้วไม่ได้อะไรเลยสักใบ
   */
  async function calcMissing() {
    if (calc) return;
    const todo = invoices.filter((v) => v.shipKm === null && v.shipFrom && v.custAddress);
    if (!todo.length) return toast("ไม่มีใบที่ต้องคำนวณระยะทาง", "warn");

    let done = 0;
    let failed = 0;
    for (let i = 0; i < todo.length; i++) {
      setCalc("กำลังคำนวณ " + (i + 1) + "/" + todo.length + "…");
      try {
        const r = await computeKm(todo[i]);
        if (r.ok) done++;
        else failed++;
        // เว้นจังหวะเฉพาะตอนที่เพิ่งแปลงที่อยู่ไป ใบที่มีพิกัดอยู่แล้วไม่ต้องรอ
        if (r.geocoded && i < todo.length - 1) await sleep(1200);
      } catch (e) {
        failed++;
      }
    }
    setCalc("");
    toast(
      "คำนวณระยะทางแล้ว " + done + " ใบ" + (failed ? " · ไม่สำเร็จ " + failed + " ใบ" : ""),
      failed ? "warn" : "ok"
    );
  }

  async function setOrigin(whId) {
    if (busy || !doc) return;
    setBusy(true);
    try {
      await inv.setInvoiceShip(doc.id, {
        shipStatus: doc.shipStatus,
        shipFrom: whId,
        shipNote: doc.shipNote,
        shipTs: doc.shipTs,
      });
      // เปลี่ยนต้นทางแล้วระยะทางเดิมใช้ไม่ได้ คำนวณใหม่ให้เลยตรงนี้
      // เพราะเป็นจังหวะเดียวที่รู้แน่ว่าค่ามันเปลี่ยน
      if (whId) {
        setCalc("กำลังคำนวณระยะทาง…");
        try {
          await computeKm(doc, whId);
        } catch (e) {
          // คำนวณไม่ได้ก็ไม่เป็นไร ต้นทางบันทึกไปแล้ว กดปุ่มคำนวณเองทีหลังได้
        } finally {
          setCalc("");
        }
      }
    } catch (e) {
      toast("บันทึกต้นทางไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (!inv.invoicesReady) {
    return <SetupNotice feature="หน้าจอการจัดส่งสินค้า" tables={["invoices", "invoice_items"]} />;
  }

  const missingKm = invoices.filter(
    (v) => v.shipKm === null && v.shipFrom && v.custAddress
  ).length;

  const scanDoc = invoices.find((v) => v.id === scanned) || null;
  const origin = doc && doc.shipFrom ? inv.wh(doc.shipFrom) : null;
  const dest = doc ? doc.custAddress : "";

  /*
   * แผนที่เส้นทางแบบ saddr/daddr ใช้ได้โดยไม่ต้องมี API key
   * (Google เปลี่ยนให้เป็น /maps/embed?pb=... ให้เอง)
   * ยังไม่ได้เลือกต้นทางก็แสดงแค่หมุดปลายทางไปก่อน
   */
  const mapURL =
    doc && dest
      ? origin
        ? "https://www.google.com/maps?saddr=" +
          origin.lat + "," + origin.lng +
          "&daddr=" + encodeURIComponent(dest) +
          "&hl=th&output=embed"
        : "https://www.google.com/maps?q=" + encodeURIComponent(dest) + "&hl=th&z=13&output=embed"
      : "";

  const routeURL =
    doc && dest
      ? "https://www.google.com/maps/dir/?api=1" +
        (origin ? "&origin=" + origin.lat + "," + origin.lng : "") +
        "&destination=" + encodeURIComponent(dest)
      : "";

  return (
    <div className="stack">
      <Card
        title="การจัดส่งสินค้า"
        actions={
          <>
            {SHIP_STATUS.map((s) => (
              <Badge key={s.id} kind={s.kind}>
                {s.name} {invoices.filter((v) => v.shipStatus === s.id).length}
              </Badge>
            ))}
            {missingKm && perm.edit ? (
              <button className="btn btn-o btn-sm" onClick={calcMissing} disabled={!!calc}>
                {calc || "คำนวณระยะทาง (" + missingKm + ")"}
              </button>
            ) : null}
          </>
        }
      >
        <div className="row" style={{ marginBottom: 12 }}>
          <input
            className="inp"
            ref={scanRef}
            value={term}
            autoFocus
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitScan();
              }
            }}
            placeholder="ยิงบาร์โค๊ดเลขที่เอกสาร หรือพิมพ์ค้นหา เลขที่ / รหัสลูกค้า / ชื่อ / ที่อยู่…"
            aria-label="ยิงบาร์โค๊ดหรือค้นหาเลขที่เอกสาร"
            style={{ maxWidth: 420 }}
          />
          <button className="btn btn-p" onClick={submitScan}>
            ค้นหา
          </button>
          <select
            className="sel"
            style={{ maxWidth: 190 }}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="กรองตามสถานะการจัดส่ง"
          >
            <option value="">ทุกสถานะ</option>
            {SHIP_STATUS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {rows.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>เลขที่เอกสาร</th>
                <th style={{ width: 118 }}>วันที่เอกสาร</th>
                <th style={{ width: 90 }}>รหัสลูกค้า</th>
                <th style={{ minWidth: 180 }}>ชื่อลูกค้า</th>
                <th style={{ minWidth: 230 }}>ที่อยู่จัดส่ง</th>
                <th className="num" style={{ width: 110 }}>ยอดสุทธิ</th>
                <th className="num" style={{ width: 104 }}>ระยะทาง (กม.)</th>
                <th style={{ width: 140 }}>สถานะ</th>
                <th style={{ width: 96 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const st = statusOf(v.shipStatus);
                return (
                  <tr key={v.id} className={v.id === selected ? "row-active" : ""}>
                    <td className="code-cell">{v.docNo}</td>
                    <td>{thDate(v.date)}</td>
                    <td>{v.custCode}</td>
                    <td>{v.custName}</td>
                    <td style={{ fontSize: 12.5 }}>{v.custAddress || "—"}</td>
                    <td className="num">{num(v.total, 2)}</td>
                    <td className="num">{v.shipKm === null ? "—" : num(v.shipKm, 1)}</td>
                    <td>
                      <Badge kind={st.kind}>{st.name}</Badge>
                    </td>
                    <td>
                      <button className="btn btn-o btn-sm" onClick={() => setSelected(v.id)}>
                        เปิดดู
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>
            {invoices.length
              ? "ไม่พบเอกสารที่ตรงกับที่ค้นหา"
              : "ยังไม่มีใบขาย — ออกเอกสารที่เมนู “ขายสินค้าและบริการ” ก่อน"}
          </Empty>
        )}
      </Card>

      {doc ? (
        <div className="grid pipe-2col" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Card
            title={"เส้นทางจัดส่ง — " + doc.docNo}
            actions={
              routeURL ? (
                <a
                  className="btn btn-o btn-sm"
                  href={routeURL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  เปิดเส้นทางใน Google Maps
                </a>
              ) : null
            }
          >
            <div className="form-grid" style={{ marginBottom: 12 }}>
              <div className="field span2">
                <label className="lbl" htmlFor="sp_from">ต้นทางที่ส่งออก</label>
                <select
                  className="sel"
                  id="sp_from"
                  value={doc.shipFrom || ""}
                  onChange={(e) => setOrigin(e.target.value)}
                  disabled={busy || !perm.edit}
                >
                  <option value="">— ยังไม่ระบุต้นทาง —</option>
                  {db.warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} · จังหวัด{w.province}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="row" style={{ marginBottom: 10 }}>
              <Badge kind="info">
                <IcPin size={12} /> ต้นทาง: {origin ? origin.name : "ยังไม่ระบุ"}
              </Badge>
              <Badge>ปลายทาง: {doc.custName}</Badge>
              <Badge kind={doc.shipKm === null ? "gray" : "ok"}>
                ระยะทาง {doc.shipKm === null ? "—" : num(doc.shipKm, 1) + " กม."}
              </Badge>
              <button
                className="btn btn-g btn-sm"
                onClick={() => calcOne(doc)}
                disabled={!!calc || !perm.edit || !doc.shipFrom}
                title={doc.shipFrom ? "คำนวณระยะทางตามถนนจริง" : "เลือกคลังต้นทางก่อน"}
              >
                {calc || "คำนวณระยะทาง"}
              </button>
            </div>

            {dest ? (
              <div className="map-wrap">
                <iframe
                  key={mapURL}
                  src={mapURL}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={"แผนที่จัดส่ง " + doc.docNo}
                  allowFullScreen
                />
              </div>
            ) : (
              <Empty>
                ใบนี้ไม่มีที่อยู่จัดส่ง — ลูกค้ารายนี้ยังไม่ได้กรอกที่อยู่ตอนออกเอกสาร
              </Empty>
            )}

            <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--fg-faint)" }}>
              ที่อยู่: {doc.custAddress || "—"}
            </p>
          </Card>

          <Card
            title={"สถานะการจัดส่ง — " + doc.docNo}
            actions={
              <button
                className="btn btn-o btn-sm"
                onClick={() => setScanned(doc.id)}
                disabled={!perm.edit}
              >
                เลือกสถานะ
              </button>
            }
          >
            <div className="ship-steps">
              {SHIP_STATUS.map((s, i) => {
                const active = doc.shipStatus === s.id;
                const done = SHIP_STATUS.findIndex((x) => x.id === doc.shipStatus) >= i;
                return (
                  <button
                    key={s.id}
                    className={"ship-step" + (active ? " active" : done ? " done" : "")}
                    onClick={() => setStatus(doc.id, s.id)}
                    disabled={busy || !perm.edit}
                  >
                    <span className="no">{i + 1}</span>
                    <span className="nm">{s.name}</span>
                  </button>
                );
              })}
            </div>

            <p className="muted" style={{ fontSize: 12.5 }}>
              กดที่ขั้นตอนเพื่อเปลี่ยนสถานะ ย้อนกลับได้ถ้ากดผิดหรือของตีกลับ
              {doc.shipTs ? " · แก้ล่าสุด " + thDateTime(doc.shipTs) : ""}
            </p>

            <TableWrap>
              <thead>
                <tr>
                  <th>รายการสินค้า</th>
                  <th>คลัง · ที่เก็บ</th>
                  <th className="num" style={{ width: 90 }}>จำนวน</th>
                  <th className="num" style={{ width: 110 }}>จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {inv.itemsOfInvoice(doc.id).map((it) => (
                  <tr key={it.id}>
                    <td>{inv.prodName(it.productId)}</td>
                    <td style={{ fontSize: 12.5 }}>{inv.whLocName(it.whId, it.locId)}</td>
                    <td className="num">{num(it.qty, 0)}</td>
                    <td className="num">{num(it.amount, 2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>
                    <IcReport size={13} /> ยอดสุทธิรวมภาษี
                  </td>
                  <td className="num">
                    <b>{num(doc.total, 2)}</b>
                  </td>
                </tr>
              </tfoot>
            </TableWrap>
          </Card>
        </div>
      ) : null}

      {scanDoc ? (
        <Modal
          title={"เลือกสถานะ — " + scanDoc.docNo}
          onClose={() => {
            setScanned("");
            if (scanRef.current) scanRef.current.focus();
          }}
          maxWidth={620}
        >
          <div className="scan-head">
            <div>
              <b>{scanDoc.custName}</b>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {scanDoc.custCode} · {scanDoc.custProvince || "ไม่ระบุจังหวัด"} ·
                {" "}ยอดสุทธิ {num(scanDoc.total, 2)} บาท
              </div>
            </div>
            <Badge kind={statusOf(scanDoc.shipStatus).kind}>
              ตอนนี้: {statusOf(scanDoc.shipStatus).name}
            </Badge>
          </div>

          <p className="muted" style={{ fontSize: 12.5 }}>
            กดขั้นที่ของไปถึงแล้ว · เลือกเสร็จกล่องจะปิดเองและกลับไปรอยิงใบถัดไป
          </p>

          <div className="scan-pick">
            {SHIP_STATUS.map((st, i) => {
              const at = SHIP_STATUS.findIndex((x) => x.id === scanDoc.shipStatus);
              return (
                <button
                  key={st.id}
                  className={
                    "scan-opt" +
                    (st.id === scanDoc.shipStatus ? " now" : "") +
                    (i < at ? " past" : "")
                  }
                  style={{ "--c": st.color }}
                  onClick={() => pickScanned(st.id)}
                  disabled={busy}
                >
                  <span className="no">{i + 1}</span>
                  <span className="nm">{st.name}</span>
                  {st.id === scanDoc.shipStatus ? <span className="tag">สถานะปัจจุบัน</span> : null}
                </button>
              );
            })}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
