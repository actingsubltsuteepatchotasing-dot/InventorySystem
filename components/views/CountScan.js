"use client";

// หน้าจอนับสินค้าด้วยมือถือ — ถือเครื่องเดินไปตามชั้น สแกนบาร์โค๊ดแล้วกรอกจำนวน
//
// ออกแบบให้ใช้มือเดียวได้ ปุ่มใหญ่ ตัวหนังสือใหญ่ ข้อมูลบนจอน้อยที่สุด
// เพราะอีกมือถือของอยู่ และคลังมักมืดกว่าออฟฟิศ
//
// จังหวะการทำงานที่ตั้งใจ:
//   สแกน -> เห็นรหัสกับชื่อสินค้าตัวโต -> กรอกจำนวน -> กดตกลง -> กลับไปสแกนตัวถัดไปทันที
// ไม่มีขั้นตอนคั่นกลาง ไม่ต้องกดปุ่ม "สแกนต่อ" เพราะคนนับของเป็นร้อยตัวจะกดจนเบื่อ
//
// การอ่านบาร์โค๊ดใช้ BarcodeDetector ที่มีมากับเบราว์เซอร์ (Chrome บน Android)
// ไม่ได้ลงไลบรารีอ่านบาร์โค๊ดเพิ่ม ตามข้อกำหนดของโปรเจกต์
// เครื่องที่ไม่มีให้ใช้ช่องพิมพ์รหัสแทน ซึ่งใช้กับเครื่องยิงบาร์โค๊ดแบบต่อสายได้ด้วย
//
// บันทึกทีละรายการทันทีที่กดตกลง ไม่รอจนนับครบแล้วส่งทีเดียว
// เพราะสัญญาณในคลังมักหลุด ถ้าเก็บไว้ในเครื่องแล้วแอปถูกปิด งานหายทั้งกะ

import { useEffect, useMemo, useRef, useState } from "react";
import { useInv } from "@/lib/store";
import { findByScan } from "@/lib/db";
import { num, thDate } from "@/lib/format";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { IcClose } from "../Icons";
import { Badge, Card, Empty, ExportPair, PrintPair, SearchSelect } from "../ui";
import SetupNotice from "../SetupNotice";

/**
 * ตัวกรองรายการในใบ
 *
 * ตั้งต้นที่ "ทั้งหมด" เพื่อให้เห็นรายการทั้งใบตามที่เตรียมไว้
 * ของที่ยังไม่ได้นับมีขอบกะพริบอยู่แล้ว จึงหาเจอได้โดยไม่ต้องกรองก่อน
 * ส่วนตัวกรองอื่นไว้ใช้ตอนไล่เก็บของที่เหลือ หรือตอนทวนเฉพาะบรรทัดที่ผลต่างไม่เป็นศูนย์
 */
const FILTERS = [
  { id: "all", name: "ทั้งหมด" },
  { id: "todo", name: "ยังไม่ได้นับ" },
  { id: "done", name: "นับแล้ว" },
  { id: "diff", name: "มีผลต่าง" },
];

export default function CountScan() {
  const inv = useInv();
  const perm = inv.perm("countscan");
  const { db } = inv;
  const toast = useToast();
  const print = usePrint();

  const [filter, setFilter] = useState("all");
  const [countId, setCountId] = useState("");
  const [code, setCode] = useState("");
  const [target, setTarget] = useState(null); // รายการที่กำลังกรอกจำนวน
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [cam, setCam] = useState(false);
  const [camErr, setCamErr] = useState("");

  // กล่องกรอกจำนวนถูกเปิดมาจากการสแกนหรือจากการกดในรายการ
  // ถ้ามาจากการสแกน พอกดตกลงต้องเปิดกล้องต่อทันที (คนกำลังไล่นับอยู่)
  // ถ้ามาจากการกดในรายการ ห้ามเปิดกล้องใส่ เพราะเขากำลังไล่ดูรายการอยู่
  const fromScan = useRef(false);

  // ตัวรับรหัสตัวล่าสุด ให้ลูปกล้องเรียกผ่าน ref ไม่ใช่ closure ที่จับไว้ตอน effect เริ่ม
  // ไม่งั้นถ้ารายการในใบเปลี่ยนระหว่างที่กล้องเปิดอยู่ ตัวสแกนจะยังใช้รายการชุดเก่า
  const acceptRef = useRef(null);

  const codeRef = useRef(null);
  const qtyRef = useRef(null);
  const videoRef = useRef(null);
  const stopRef = useRef(null);

  /** ใบที่ยังนับไม่จบ — ใบที่ปิดแล้วไม่ให้เลือก จะได้ไม่นับทับของที่ปรับปรุงไปแล้ว */
  const open = useMemo(
    () => (db.stockCounts || []).filter((c) => c.status === "OPEN").sort((a, b) => b.ts - a.ts),
    [db.stockCounts]
  );

  const sheet = open.find((c) => c.id === countId) || null;
  const items = useMemo(
    () => (sheet ? inv.itemsOfCount(sheet.id) : []),
    [sheet, inv]
  );

  const done = items.filter((i) => i.counted !== null).length;
  const left = items.length - done;
  const diffCount = items.filter((i) => i.counted !== null && i.counted !== i.sysQty).length;

  /** รายการที่จะแสดงตามตัวกรองที่เลือก */
  const shown = useMemo(() => {
    if (filter === "todo") return items.filter((i) => i.counted === null);
    if (filter === "done") return items.filter((i) => i.counted !== null);
    if (filter === "diff") return items.filter((i) => i.counted !== null && i.counted !== i.sysQty);
    return items;
  }, [items, filter]);

  // เหลือใบเดียวก็เลือกให้เลย คนถือมือถือจะได้ไม่ต้องกดอะไรก่อนเริ่มนับ
  useEffect(() => {
    if (!countId && open.length === 1) setCountId(open[0].id);
  }, [open, countId]);

  /* ------------------------------------------------------- กล้อง */

  /** เบราว์เซอร์นี้อ่านบาร์โค๊ดจากกล้องได้ไหม */
  const [canScan, setCanScan] = useState(false);
  useEffect(() => {
    setCanScan(typeof window !== "undefined" && "BarcodeDetector" in window);
  }, []);

  useEffect(() => {
    if (!cam) return;
    let alive = true;
    let stream = null;
    let timer = null;

    (async () => {
      try {
        // facingMode: environment = กล้องหลัง ซึ่งเป็นตัวที่เอาไปจ่อสินค้า
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
              if (value) {
                acceptRef.current(value);
                return; // เจอแล้วหยุดวน กล้องจะถูกปิดใน accept
              }
            }
          } catch (e) {
            // อ่านไม่ออกเฟรมนี้ก็ลองเฟรมถัดไป ไม่ต้องรบกวนคนใช้
          }
          timer = setTimeout(tick, 250);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam]);

  acceptRef.current = accept;

  function stopCam() {
    if (stopRef.current) stopRef.current();
    setCam(false);
  }

  /* --------------------------------------------------- การรับรหัส */

  /**
   * รับรหัสที่สแกนหรือพิมพ์มา แล้วเปิดช่องกรอกจำนวน
   *
   * สินค้าตัวเดียวอาจอยู่หลายช่องเก็บในใบเดียวกัน ถ้าเจอมากกว่าหนึ่งบรรทัด
   * จะเลือกบรรทัดที่ "ยังไม่ได้นับ" ก่อน เพราะคนเดินนับไล่ไปทีละช่องอยู่แล้ว
   * ถ้านับครบทุกช่องแล้วค่อยให้แก้บรรทัดแรก
   */
  function accept(value) {
    const p = findByScan(db, value);
    if (!p) {
      toast("ไม่พบสินค้ารหัส " + value, "err");
      setCode("");
      return;
    }

    const mine = items.filter((i) => i.productId === p.id);
    if (!mine.length) {
      toast(p.name + " ไม่อยู่ในใบตรวจนับนี้", "warn");
      setCode("");
      return;
    }

    const pick = mine.find((i) => i.counted === null) || mine[0];
    fromScan.current = true;
    stopCam();
    setTarget(pick);
    setQty(pick.counted === null ? "" : String(pick.counted));
    setCode("");
    // รอให้กล่องขึ้นก่อนแล้วค่อยโฟกัส ไม่งั้นคีย์บอร์ดมือถือไม่เด้ง
    setTimeout(() => qtyRef.current && qtyRef.current.focus(), 60);
  }

  async function confirm() {
    if (!target || busy) return;
    const n = parseFloat(qty);
    if (!Number.isFinite(n) || n < 0) return toast("กรอกจำนวนที่นับได้ก่อน", "err");

    setBusy(true);
    try {
      await inv.setCounted(target.id, n);
      const diff = n - target.sysQty;
      toast(
        inv.prodName(target.productId) + " · นับได้ " + num(n, 0) +
          (diff ? " · ผลต่าง " + (diff > 0 ? "+" : "") + num(diff, 0) : " · ตรงกับระบบ"),
        diff ? "warn" : "ok"
      );
      setTarget(null);
      setQty("");
      // กลับไปสแกนตัวถัดไปทันที ไม่ต้องกดปุ่มอะไรอีก
      backToScan();
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  /** ปิดกล่องกรอกจำนวนแล้วพาไปสแกนตัวถัดไป ถ้าเข้ามาทางการสแกน */
  function backToScan() {
    if (!fromScan.current) return;
    if (canScan) setCam(true);
    else setTimeout(() => codeRef.current && codeRef.current.focus(), 60);
  }

  function skip() {
    setTarget(null);
    setQty("");
    backToScan();
  }

  if (!inv.countsReady) {
    return (
      <SetupNotice feature="หน้าจอนับสินค้า" tables={["stock_counts", "stock_count_items"]} />
    );
  }

  if (!open.length) {
    return (
      <Card title="นับสินค้า">
        <Empty>
          ยังไม่มีใบตรวจนับที่เปิดอยู่ — ให้ไปสร้างที่เมนู “เตรียมใบตรวจนับ” ก่อน
        </Empty>
      </Card>
    );
  }

  const p = target ? inv.prod(target.productId) : null;

  /** ชื่อช่องเก็บแบบที่คนเดินนับอ่านแล้วรู้ว่าต้องไปยืนตรงไหน */
  const binName = (locId) => (locId ? inv.locName(locId) : "ไม่ระบุที่เก็บ");

  /* ------------------------------------------------- รายงานผลการนับ */

  const REPORT_HEAD = [
    "ลำดับ", "รหัสสินค้า", "รายการสินค้า", "หน่วย", "คลังสินค้า", "ที่เก็บ",
    "ยอดในระบบ", "นับได้จริง", "ผลต่าง", "สถานะ",
  ];

  /**
   * แถวของรายงาน — ใช้ทั้งพิมพ์และส่งออก ไฟล์กับกระดาษจะได้ตรงกันเสมอ
   *
   * รายการที่ยังไม่ได้นับเว้นช่องจำนวนกับผลต่างไว้ว่าง ไม่ใส่ 0
   * เพราะ 0 แปลว่า "นับแล้วไม่เจอของ" ซึ่งคนละความหมายกับ "ยังไม่ได้นับ"
   */
  const reportRows = (list) =>
    list.map((i, n) => {
      const pp = inv.prod(i.productId);
      const counted = i.counted !== null;
      return [
        n + 1,
        pp ? pp.code : "",
        inv.prodName(i.productId),
        pp ? pp.unit : "",
        inv.whName(i.whId),
        binName(i.locId),
        i.sysQty,
        counted ? i.counted : "",
        counted ? i.counted - i.sysQty : "",
        counted ? (i.counted === i.sysQty ? "ตรวจนับแล้ว" : "ตรวจนับแล้ว (มีผลต่าง)") : "ยังไม่ได้นับ",
      ];
    });

  const reportName = () =>
    "ผลการตรวจนับ-" + (sheet ? sheet.docNo : "") +
    (filter === "all" ? "" : "-" + (FILTERS.find((f) => f.id === filter) || {}).name);

  function printReport() {
    if (!sheet) return;
    print({
      title: "รายงานผลการตรวจนับสินค้า " + sheet.docNo,
      subtitle:
        inv.whName(sheet.whId) + " · วันที่ " + thDate(sheet.date) +
        " · ผู้ตรวจนับ " + (sheet.by1 || "-") + (sheet.by2 ? " และ " + sheet.by2 : "") +
        " · นับแล้ว " + num(done, 0) + " จาก " + num(items.length, 0) + " รายการ" +
        " · มีผลต่าง " + num(diffCount, 0) + " รายการ" +
        (filter === "all" ? "" : " · แสดงเฉพาะ " + (FILTERS.find((f) => f.id === filter) || {}).name),
      body: (
        <table>
          <thead>
            <tr>
              {REPORT_HEAD.map((h, i) => (
                <th key={h} style={i >= 6 && i <= 8 ? { textAlign: "right" } : undefined}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reportRows(shown).map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j} style={j >= 6 && j <= 8 ? { textAlign: "right" } : undefined}>
                    {typeof v === "number" ? num(v, 0) : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ),
    });
  }

  return (
    <div className="stack count-scan">
      <Card
        title="นับสินค้า"
        actions={
          sheet ? (
            <Badge kind={left ? "warn" : "ok"}>
              เหลือ {num(left, 0)} จาก {num(items.length, 0)}
            </Badge>
          ) : null
        }
      >
        <div className="field">
          <label className="lbl" htmlFor="cs_sheet">ใบตรวจนับ</label>
          <SearchSelect
            id="cs_sheet"
            value={countId}
            onChange={(v) => {
              stopCam();
              setTarget(null);
              setCountId(v);
            }}
            options={open.map((c) => ({
              value: c.id,
              code: c.docNo,
              label: inv.whName(c.whId),
              meta: thDate(c.date),
              search: c.by1 + " " + c.by2,
            }))}
            placeholder="— เลือกใบตรวจนับ —"
            notFound="ไม่พบใบตรวจนับที่ตรงกับ"
          />
        </div>

        {sheet ? (
          <>
            <div className="cs-progress" aria-hidden="true">
              <span style={{ width: (items.length ? (done / items.length) * 100 : 0) + "%" }} />
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
              {inv.whName(sheet.whId)} · {thDate(sheet.date)} · ผู้ตรวจนับ {sheet.by1}
              {sheet.by2 ? " / " + sheet.by2 : ""}
            </p>
          </>
        ) : null}
      </Card>

      {sheet ? (
        <Card title="สแกนสินค้า">
          {cam ? (
            <div className="cs-cam">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} playsInline muted />
              <div className="cs-aim" aria-hidden="true" />
              <button className="btn btn-g btn-icon cs-stop" onClick={stopCam} aria-label="ปิดกล้อง">
                <IcClose size={16} />
              </button>
              <div className="cs-hint">จ่อกล้องที่บาร์โค๊ดบนตัวสินค้า</div>
            </div>
          ) : (
            <button
              className="btn btn-p cs-big"
              onClick={() => {
                setCamErr("");
                if (canScan) setCam(true);
                else if (codeRef.current) codeRef.current.focus();
              }}
              disabled={!perm.edit}
            >
              {canScan ? "เปิดกล้องสแกนบาร์โค๊ด" : "พิมพ์รหัสสินค้าด้านล่าง"}
            </button>
          )}

          {camErr ? (
            <p className="muted" style={{ color: "var(--err)", fontSize: 12.5 }}>
              เปิดกล้องไม่ได้: {camErr} — ใช้ช่องพิมพ์รหัสด้านล่างแทนได้
            </p>
          ) : null}

          <div className="field" style={{ marginTop: 10 }}>
            <label className="lbl" htmlFor="cs_code">
              {canScan ? "หรือพิมพ์รหัส / ยิงด้วยเครื่องอ่านบาร์โค๊ด" : "รหัสสินค้า หรือบาร์โค๊ด"}
            </label>
            <input
              className="inp cs-code"
              id="cs_code"
              ref={codeRef}
              value={code}
              inputMode="search"
              autoComplete="off"
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  accept(code);
                }
              }}
              placeholder="สแกนหรือพิมพ์แล้วกด Enter"
            />
          </div>

          {!canScan ? (
            <p className="muted" style={{ fontSize: 12.5 }}>
              เบราว์เซอร์นี้อ่านบาร์โค๊ดจากกล้องไม่ได้ (รองรับบน Chrome ของ Android)
              ใช้เครื่องยิงบาร์โค๊ดหรือพิมพ์รหัสเองได้ตามปกติ
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* กล่องกรอกจำนวน — เต็มจอบนมือถือ ปุ่มใหญ่ กดด้วยนิ้วโป้งข้างเดียวได้ */}
      {target ? (
        <div className="cs-sheet" role="dialog" aria-modal="true">
          <div className="cs-card">
            <div className="cs-code-line">{p ? p.code : ""}</div>
            <div className="cs-name">{inv.prodName(target.productId)}</div>
            <div className="cs-meta">
              {binName(target.locId)} · ยอดในระบบ {num(target.sysQty, 0)}
              {p ? " " + p.unit : ""}
            </div>

            <label className="lbl" htmlFor="cs_qty">จำนวนที่นับได้</label>
            <input
              className="inp cs-qty"
              id="cs_qty"
              ref={qtyRef}
              type="number"
              inputMode="decimal"
              min={0}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirm();
                }
              }}
            />

            {qty !== "" && Number.isFinite(parseFloat(qty)) ? (
              <div
                className="cs-diff"
                style={{
                  color:
                    parseFloat(qty) - target.sysQty > 0
                      ? "var(--ok)"
                      : parseFloat(qty) - target.sysQty < 0
                        ? "var(--err)"
                        : "var(--fg-faint)",
                }}
              >
                ผลต่าง {parseFloat(qty) - target.sysQty > 0 ? "+" : ""}
                {num(parseFloat(qty) - target.sysQty, 0)}
              </div>
            ) : (
              <div className="cs-diff" style={{ color: "var(--fg-faint)" }}>
                กรอกจำนวนแล้วจะแสดงผลต่างให้
              </div>
            )}

            <div className="cs-actions">
              <button className="btn btn-g cs-big" onClick={skip} disabled={busy}>
                ข้าม
              </button>
              <button className="btn btn-p cs-big" onClick={confirm} disabled={busy || !perm.edit}>
                {busy ? "กำลังบันทึก…" : "ตกลง"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* รายการทั้งใบ พร้อมสถานะการนับ — เป็นทั้งหน้าจอทำงานและตัวรายงาน */}
      {sheet && !target ? (
        <Card
          title="รายการในใบตรวจนับ"
          actions={
            <>
              <Badge kind="ok">นับแล้ว {num(done, 0)}</Badge>
              <Badge kind={left ? "warn" : "gray"}>ยังไม่นับ {num(left, 0)}</Badge>
              <Badge kind={diffCount ? "err" : "gray"}>ผลต่าง {num(diffCount, 0)}</Badge>
              <PrintPair
                onPrint={printReport}
                toast={toast}
                disabled={!shown.length}
                label="พิมพ์รายงาน"
              />
              <ExportPair
                onExport={(save) =>
                  save(REPORT_HEAD, reportRows(shown), reportName() + ".csv")
                }
                disabled={!shown.length}
                toast={toast}
              />
            </>
          }
        >
          <div className="cs-tabs">
            {FILTERS.map((f) => {
              const n =
                f.id === "todo" ? left : f.id === "done" ? done : f.id === "diff" ? diffCount : items.length;
              return (
                <button
                  key={f.id}
                  className={"cs-tab" + (filter === f.id ? " on" : "")}
                  onClick={() => setFilter(f.id)}
                >
                  {f.name} <b>{num(n, 0)}</b>
                </button>
              );
            })}
          </div>

          {shown.length ? (
            <ul className="cs-list">
              {shown.map((i) => {
                const pp = inv.prod(i.productId);
                const counted = i.counted !== null;
                const diff = counted ? i.counted - i.sysQty : 0;
                return (
                  <li
                    key={i.id}
                    className={"cs-item" + (counted ? (diff ? " diff" : " done") : " todo")}
                  >
                    {/* กดที่รายการเพื่อนับหรือแก้ตัวเลข ไม่ต้องเดินกลับไปสแกนใหม่
                        เผื่อกรณีบาร์โค๊ดที่ตัวสินค้าฉีกจนอ่านไม่ออก */}
                    <button
                      className="cs-item-btn"
                      onClick={() => {
                        fromScan.current = false;
                        stopCam();
                        setTarget(i);
                        setQty(counted ? String(i.counted) : "");
                        setTimeout(() => qtyRef.current && qtyRef.current.focus(), 60);
                      }}
                      disabled={!perm.edit}
                    >
                      <div className="cs-item-top">
                        <b>{pp ? pp.code : ""}</b>
                        <span className="cs-item-name">{inv.prodName(i.productId)}</span>
                        <Badge kind={counted ? (diff ? "err" : "ok") : "warn"}>
                          {counted ? (diff ? "มีผลต่าง" : "ตรวจนับแล้ว") : "ยังไม่ได้นับ"}
                        </Badge>
                      </div>
                      <div className="cs-item-where">
                        {inv.whName(i.whId)} · {binName(i.locId)}
                      </div>
                      <div className="cs-item-nums">
                        <span>
                          ในระบบ <b>{num(i.sysQty, 0)}</b>
                        </span>
                        <span>
                          นับได้ <b>{counted ? num(i.counted, 0) : "—"}</b>
                        </span>
                        <span className={diff > 0 ? "up" : diff < 0 ? "down" : ""}>
                          ผลต่าง <b>{counted ? (diff > 0 ? "+" : "") + num(diff, 0) : "—"}</b>
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>
              {filter === "todo"
                ? "นับครบทุกรายการแล้ว — กลับไปปิดใบที่หน้า “เตรียมใบตรวจนับ”"
                : filter === "diff"
                  ? "ยังไม่มีรายการที่นับได้ไม่ตรงกับยอดในระบบ"
                  : "ไม่มีรายการในกลุ่มนี้"}
            </Empty>
          )}
        </Card>
      ) : null}
    </div>
  );
}
