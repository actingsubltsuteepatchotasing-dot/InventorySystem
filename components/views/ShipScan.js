"use client";

// สถานีสแกนจัดส่ง — หน้าจอที่ยืนประจำจุดแล้วยิงบาร์โค๊ดใบขายรัว ๆ
//
// แนวคิดหลัก: เลือก "จุด" ไว้ครั้งเดียวตอนเริ่มกะ แล้วยิงอย่างเดียวทั้งวัน
//   คนที่ยืนอยู่จุดจัดสินค้าทำงานเดิมซ้ำเป็นร้อยใบ ถ้าต้องเลือกสถานะทุกใบ
//   จะกดผิดจนเวลาที่บันทึกไว้เชื่อไม่ได้ ซึ่งทำให้รายงานทั้งหมดไร้ความหมาย
//   จุดจึงเป็นตัวกำหนดสถานะ ไม่ใช่ให้เลือกทีละใบ
//
// รองรับสองแบบในหน้าเดียว ไม่ได้แยกไฟล์:
//   คอมพิวเตอร์ — เครื่องยิงบาร์โค๊ดแบบต่อสาย ทำงานเหมือนคีย์บอร์ดแล้วกด Enter ให้เอง
//                 ช่องรับรหัสจึงต้องคงโฟกัสไว้ตลอด ไม่งั้นยิงแล้วตัวอักษรหายไปที่อื่น
//   โทรศัพท์    — เปิดกล้องหลังส่องบาร์โค๊ดบนใบ ด้วย BarcodeDetector ของเบราว์เซอร์
// เลย์เอาต์เป็น CSS ล้วน จอแคบจะเรียงลงมาเอง ไม่ต้องสลับหน้าจอ
//
// ยิงแล้วบันทึกทันทีทีละใบ ไม่รอสะสม เพราะสัญญาณในคลังหลุดบ่อย
// และแสดงผลลัพธ์ตัวโต ๆ เพราะคนยิงมองจอจากระยะหนึ่งเมตร ไม่ได้ก้มดูใกล้ ๆ

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { SHIP_STATIONS, SHIP_STATUS } from "@/lib/constants";
import { fmtDuration, thDate, thTime } from "@/lib/format";
import { useToast } from "../Toast";
import { IcClose } from "../Icons";
import { Badge, Card, Empty } from "../ui";
import SetupNotice from "../SetupNotice";

/** ตัวคั่นในเลขที่เอกสารไม่มีผล ยิงแบบมีขีดหรือไม่มีขีดก็ต้องเจอ */
const tight = (s) => String(s || "").replace(/[\s\-\/.,]/g, "").toLowerCase();

const statusOf = (id) => SHIP_STATUS.find((s) => s.id === id) || SHIP_STATUS[0];
const orderOf = (id) => SHIP_STATUS.findIndex((s) => s.id === id);

export default function ShipScan() {
  const inv = useInv();
  const perm = inv.perm("shipscan");
  const { db } = inv;
  const toast = useToast();
  const { user } = useAuth();

  const [station, setStation] = useState("PACKING");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]); // ใบที่ยิงไปแล้วในรอบนี้ ใหม่อยู่บนสุด
  const [last, setLast] = useState(null); // ผลของใบล่าสุด แสดงตัวโต
  const [cam, setCam] = useState(false);
  const [camErr, setCamErr] = useState("");

  const codeRef = useRef(null);
  const videoRef = useRef(null);
  const stopRef = useRef(null);
  // กันยิงซ้ำใบเดิมรัว ๆ จากกล้องที่อ่านได้หลายเฟรมติดกัน
  const lastScan = useRef({ value: "", at: 0 });

  const st = SHIP_STATIONS.find((s) => s.id === station) || SHIP_STATIONS[0];
  const target = statusOf(st.id);

  const invoices = useMemo(() => db.invoices || [], [db.invoices]);

  /** ใบที่ "รออยู่ที่จุดนี้" — คิวงานตรงหน้าของคนที่ยืนอยู่ตรงนี้ */
  const queue = useMemo(
    () =>
      invoices
        .filter((v) => st.from.includes(v.shipStatus))
        .sort((a, b) => a.ts - b.ts),
    [invoices, st]
  );

  /* ------------------------------------------------------- กล้อง */

  const [canScan, setCanScan] = useState(false);
  useEffect(() => {
    setCanScan(typeof window !== "undefined" && "BarcodeDetector" in window);
  }, []);

  function stopCam() {
    if (stopRef.current) stopRef.current();
    setCam(false);
  }

  /* --------------------------------------------------- การเดินสถานะ */

  /**
   * ยิงหนึ่งใบ — หาใบจากเลขที่ แล้วเดินสถานะเป็นของจุดนี้
   *
   * เป็น useCallback เพราะลูปอ่านภาพจากกล้องเรียกฟังก์ชันนี้
   * ถ้าไม่ตรึงไว้ ลูปจะจับค่าเก่าค้างแล้วยิงใบไปที่จุดที่เลิกเลือกไปแล้ว
   */
  const scan = useCallback(
    async (raw) => {
      const s = String(raw || "").trim();
      if (!s || busy) return;

      const hit =
        invoices.find((v) => tight(v.docNo) === tight(s)) ||
        invoices.find((v) => tight(v.docNo).endsWith(tight(s)) && tight(s).length >= 6);

      if (!hit) {
        setLast({ kind: "err", title: "ไม่พบเอกสาร", sub: "เลขที่ " + s });
        toast("ไม่พบเอกสารเลขที่ " + s, "err");
        setCode("");
        return;
      }

      // ยิงซ้ำจุดเดิมเป็นเรื่องปกติ (ไม่แน่ใจว่าติดไหม) จึงไม่ถือเป็นความผิดพลาด
      // แต่ก็ไม่บันทึกเวลาซ้ำ ไม่งั้นเวลาที่เข้าสถานะจะกลายเป็นครั้งหลังสุด
      if (hit.shipStatus === st.id) {
        setLast({
          kind: "warn",
          title: hit.docNo,
          sub: hit.custName,
          note: "ใบนี้ผ่านจุดนี้ไปแล้ว — ไม่บันทึกซ้ำ",
        });
        toast(hit.docNo + " ผ่านจุดนี้ไปแล้ว", "warn");
        setCode("");
        return;
      }

      // ข้ามขั้นหรือยิงย้อนได้ แต่ต้องเตือนให้รู้ตัว ไม่ใช่ทำเงียบ ๆ
      const back = orderOf(hit.shipStatus) > orderOf(st.id);
      const skipped = orderOf(st.id) - orderOf(hit.shipStatus) > 1;

      setBusy(true);
      try {
        await inv.setInvoiceShip(
          hit.id,
          {
            shipStatus: st.id,
            shipFrom: hit.shipFrom,
            shipNote: hit.shipNote,
            shipTs: Date.now(),
          },
          {
            docNo: hit.docNo,
            station: st.name,
            user: user && user.email ? user.email : "",
          }
        );

        const note = back
          ? "ย้อนกลับจาก " + statusOf(hit.shipStatus).name
          : skipped
            ? "ข้ามจาก " + statusOf(hit.shipStatus).name
            : "";

        setLast({
          kind: back || skipped ? "warn" : "ok",
          title: hit.docNo,
          sub: hit.custCode + " " + hit.custName,
          where: hit.custProvince,
          note,
        });
        setLog((prev) =>
          [{ id: hit.id, docNo: hit.docNo, name: hit.custName, ts: Date.now(), note }, ...prev].slice(0, 50)
        );
        toast(hit.docNo + " → " + target.name, back || skipped ? "warn" : "ok");
      } catch (e) {
        setLast({ kind: "err", title: hit.docNo, sub: "บันทึกไม่สำเร็จ", note: e.message });
        toast("บันทึกไม่สำเร็จ: " + e.message, "err");
      } finally {
        setBusy(false);
        setCode("");
      }
    },
    [busy, invoices, inv, st, target, user]
  );

  /*
   * เก็บ scan ตัวล่าสุดไว้ใน ref ให้ลูปกล้องเรียกผ่าน ref แทนการผูกเป็น dependency
   *
   * ถ้าให้ effect ของกล้องขึ้นกับ scan ตรง ๆ กล้องจะถูกปิดแล้วเปิดใหม่ทุกครั้งที่ยิงหนึ่งใบ
   * เพราะ scan เปลี่ยนตัวเมื่อ busy เปลี่ยน ซึ่งเกิดขึ้นทุกครั้งที่บันทึก
   * ผลคือภาพดับแล้วติดใหม่ทุกใบ และบางเครื่องขอกล้องใหม่ไม่ทันจนขึ้นว่าเปิดกล้องไม่ได้
   */
  const scanRef = useRef(scan);
  scanRef.current = scan;

  // ลูปอ่านภาพจากกล้อง — แยก effect ออกจากปุ่ม เพราะต้องปิดกล้องให้เรียบร้อยเสมอ
  useEffect(() => {
    if (!cam) return;
    let alive = true;
    let stream = null;
    let timer = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (!alive) return stream.getTracks().forEach((t) => t.stop());

        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play();
        }

        const det = new window.BarcodeDetector();
        const tick = async () => {
          if (!alive || !videoRef.current) return;
          try {
            const found = await det.detect(videoRef.current);
            if (found && found.length) {
              const value = String(found[0].rawValue || "").trim();
              const now = Date.now();
              // ใบเดิมภายใน 2 วินาทีถือว่าเป็นเฟรมซ้ำ ไม่ใช่การยิงครั้งใหม่
              const dup = value === lastScan.current.value && now - lastScan.current.at < 2000;
              if (value && !dup) {
                lastScan.current = { value, at: now };
                await scanRef.current(value);
              }
            }
          } catch (e) {
            // อ่านไม่ออกเฟรมนี้ก็ลองเฟรมถัดไป
          }
          if (alive) timer = setTimeout(tick, 400);
        };
        tick();
      } catch (e) {
        if (alive) {
          setCamErr(e && e.message ? e.message : "เปิดกล้องไม่ได้");
          setCam(false);
        }
      }
    })();

    stopRef.current = () => {
      alive = false;
      if (timer) clearTimeout(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    return stopRef.current;
    // ตั้งใจให้ขึ้นกับ cam อย่างเดียว — ตัวสแกนเรียกผ่าน ref ที่อัปเดตทุกรอบอยู่แล้ว
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam]);

  // เครื่องยิงบาร์โค๊ดแบบต่อสายพิมพ์ลงช่องที่มีโฟกัสอยู่
  // ถ้าโฟกัสหลุดไปที่อื่น ตัวอักษรจะหายไปทั้งชุดโดยคนยิงไม่รู้ตัว
  useEffect(() => {
    if (cam || busy) return;
    const t = setTimeout(() => codeRef.current && codeRef.current.focus(), 80);
    return () => clearTimeout(t);
  }, [cam, busy, station, last]);

  if (!inv.shipEventsReady) {
    return <SetupNotice feature="สถานีสแกนจัดส่ง" tables={["ship_events"]} />;
  }

  return (
    <div className="stack ship-scan">
      <Card title="เลือกจุดที่ยืนอยู่">
        <p className="muted" style={{ marginTop: 0 }}>
          เลือกจุดไว้ครั้งเดียวตอนเริ่มงาน แล้วยิงบาร์โค๊ดเลขที่เอกสารได้เลยทีละใบ
          ระบบจะเปลี่ยนสถานะเป็นของจุดนี้ให้เองพร้อมบันทึกเวลาไว้
        </p>
        <div className="station-pick">
          {SHIP_STATIONS.map((s) => {
            const sc = statusOf(s.id);
            const n = (db.invoices || []).filter((v) => s.from.includes(v.shipStatus)).length;
            return (
              <button
                key={s.id}
                className={"station-opt" + (station === s.id ? " on" : "")}
                style={{ "--c": sc.color }}
                onClick={() => {
                  setStation(s.id);
                  setLast(null);
                }}
              >
                <b>{s.name}</b>
                <span>{s.sub}</span>
                <em>→ {sc.name}</em>
                <i className="station-n">{n}</i>
              </button>
            );
          })}
        </div>
      </Card>

      <Card
        title={"ยิงบาร์โค๊ดที่จุด " + st.name}
        actions={
          <>
            <Badge kind={target.kind}>เปลี่ยนเป็น {target.name}</Badge>
            {canScan ? (
              cam ? (
                <button className="btn btn-g btn-sm" onClick={stopCam}>
                  ปิดกล้อง
                </button>
              ) : (
                <button
                  className="btn btn-o btn-sm"
                  onClick={() => {
                    setCamErr("");
                    setCam(true);
                  }}
                  disabled={!perm.edit}
                >
                  เปิดกล้องมือถือ
                </button>
              )
            ) : null}
          </>
        }
      >
        {cam ? (
          <div className="cs-cam" style={{ marginBottom: 12 }}>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} playsInline muted />
            <div className="cs-aim" aria-hidden="true" />
            <button className="btn btn-g btn-icon cs-stop" onClick={stopCam} aria-label="ปิดกล้อง">
              <IcClose size={16} />
            </button>
            <div className="cs-hint">จ่อกล้องที่บาร์โค๊ดเลขที่เอกสารบนใบ</div>
          </div>
        ) : null}

        <div className="field">
          <label className="lbl" htmlFor="ss_code">เลขที่เอกสาร</label>
          <input
            className="inp scan-box"
            id="ss_code"
            ref={codeRef}
            value={code}
            disabled={!perm.edit || busy}
            autoComplete="off"
            inputMode="search"
            placeholder={busy ? "กำลังบันทึก…" : "ยิงบาร์โค๊ด หรือพิมพ์เลขที่แล้วกด Enter"}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                scan(code);
              }
            }}
          />
        </div>

        {camErr ? (
          <p className="muted" style={{ color: "var(--err)", fontSize: 12.5 }}>
            เปิดกล้องไม่ได้: {camErr} — ใช้ช่องพิมพ์เลขที่ด้านบนแทนได้
          </p>
        ) : null}

        {/* ผลของใบล่าสุด ตัวโตพอให้มองเห็นจากระยะหนึ่งเมตร */}
        {last ? (
          <div className={"scan-result " + last.kind}>
            <b>{last.title}</b>
            {last.sub ? <span>{last.sub}</span> : null}
            {last.where ? <span>{last.where}</span> : null}
            {last.note ? <em>{last.note}</em> : null}
          </div>
        ) : (
          <div className="scan-result idle">
            <b>พร้อมรับการยิง</b>
            <span>ยิงใบแรกได้เลย</span>
          </div>
        )}
      </Card>

      <div className="grid-2">
        <Card
          title={"คิวที่รอเข้าจุดนี้"}
          actions={<Badge kind={queue.length ? "warn" : "ok"}>{queue.length} ใบ</Badge>}
        >
          {queue.length ? (
            <ul className="scan-queue">
              {queue.slice(0, 25).map((v) => {
                const sc = statusOf(v.shipStatus);
                return (
                  <li key={v.id} style={{ "--c": sc.color }}>
                    <b>{v.docNo}</b>
                    <span>{v.custName}</span>
                    <em>{v.custProvince || "—"}</em>
                    <i>{fmtDuration(Date.now() - v.ts)}</i>
                  </li>
                );
              })}
              {queue.length > 25 ? (
                <li className="more">…และอีก {queue.length - 25} ใบ</li>
              ) : null}
            </ul>
          ) : (
            <Empty>ไม่มีใบค้างที่จุดนี้ — ยิงใบที่เพิ่งมาถึงได้เลย</Empty>
          )}
        </Card>

        <Card
          title="ที่ยิงไปแล้วรอบนี้"
          actions={
            log.length ? (
              <button className="btn btn-g btn-sm" onClick={() => setLog([])}>
                ล้างรายการ
              </button>
            ) : null
          }
        >
          {log.length ? (
            <ul className="scan-queue">
              {log.map((r, i) => (
                <li key={r.ts + "-" + i} style={{ "--c": target.color }}>
                  <b>{r.docNo}</b>
                  <span>{r.name}</span>
                  <em>{r.note || ""}</em>
                  <i>{thTime(r.ts)}</i>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>ยังไม่ได้ยิงใบไหนในรอบนี้</Empty>
          )}
        </Card>
      </div>

      <Card title="เวลาที่บันทึกไว้ของใบล่าสุด">
        {last && last.title ? (
          <Timeline docNo={last.title} />
        ) : (
          <Empty>ยิงใบสักใบแล้วจะแสดงเวลาแต่ละขั้นตอนของใบนั้นตรงนี้</Empty>
        )}
      </Card>
    </div>
  );
}

/** เวลาแต่ละขั้นของใบหนึ่ง แสดงใต้ช่องยิงเพื่อยืนยันว่าบันทึกแล้วจริง */
function Timeline({ docNo }) {
  const inv = useInv();
  const doc = (inv.db.invoices || []).find((v) => v.docNo === docNo);
  if (!doc) return <Empty>ไม่พบเอกสาร {docNo}</Empty>;

  const tl = inv.shipTimeline(doc);

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        {doc.docNo} · {thDate(doc.date)} · {doc.custCode} {doc.custName}
        {doc.custProvince ? " · " + doc.custProvince : ""}
        {tl.totalMs ? " · รวมทั้งกระบวนการ " + fmtDuration(tl.totalMs) : ""}
      </p>
      <ol className="tl">
        {tl.steps.map((s) => (
          <li key={s.id} className={s.ts ? "on" : ""} style={{ "--c": s.color }}>
            <b>{s.name}</b>
            <span>{s.ts ? thTime(s.ts) : "ยังไม่ถึงขั้นนี้"}</span>
            <em>{s.ms ? "ใช้เวลา " + fmtDuration(s.ms) : ""}</em>
          </li>
        ))}
      </ol>
    </>
  );
}
