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
import { IcClose } from "../Icons";
import { Badge, Card, Empty, SearchSelect } from "../ui";
import SetupNotice from "../SetupNotice";

export default function CountScan() {
  const inv = useInv();
  const perm = inv.perm("countscan");
  const { db } = inv;
  const toast = useToast();

  const [countId, setCountId] = useState("");
  const [code, setCode] = useState("");
  const [target, setTarget] = useState(null); // รายการที่กำลังกรอกจำนวน
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [cam, setCam] = useState(false);
  const [camErr, setCamErr] = useState("");

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
                accept(value);
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
      if (canScan) setCam(true);
      else setTimeout(() => codeRef.current && codeRef.current.focus(), 60);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  function skip() {
    setTarget(null);
    setQty("");
    if (canScan) setCam(true);
    else setTimeout(() => codeRef.current && codeRef.current.focus(), 60);
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

      {sheet && !target ? (
        <Card title="ที่ยังไม่ได้นับ" actions={<Badge>{num(left, 0)} รายการ</Badge>}>
          {left ? (
            <ul className="cs-left">
              {items
                .filter((i) => i.counted === null)
                .slice(0, 40)
                .map((i) => {
                  const pp = inv.prod(i.productId);
                  return (
                    <li key={i.id}>
                      <b>{pp ? pp.code : ""}</b>
                      <span>{inv.prodName(i.productId)}</span>
                      <em>{binName(i.locId)}</em>
                    </li>
                  );
                })}
              {left > 40 ? (
                <li>
                  <span className="muted">
                    …และอีก {num(left - 40, 0)} รายการ — สแกนไปเรื่อย ๆ รายการจะสั้นลงเอง
                  </span>
                </li>
              ) : null}
            </ul>
          ) : (
            <Empty>นับครบทุกรายการแล้ว — กลับไปปิดใบที่หน้า “เตรียมใบตรวจนับ”</Empty>
          )}
        </Card>
      ) : null}
    </div>
  );
}
