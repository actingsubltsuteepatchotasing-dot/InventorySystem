"use client";

// ชิ้นส่วน UI ที่ใช้ซ้ำทั่วระบบ

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { encode128 } from "@/lib/barcode";
import { firstLocOf, locsOf } from "@/lib/db";
import { num } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import { downloadXLSX } from "@/lib/xlsx";

/** การ์ดพร้อมหัวข้อและปุ่มด้านขวา */
export function Card({ title, actions, children, style }) {
  return (
    <div className="card" style={style}>
      {title || actions ? (
        <div className="card-h">
          {title ? <h3>{title}</h3> : null}
          {actions ? <div className="sp">{actions}</div> : null}
        </div>
      ) : null}
      <div className="card-b">{children}</div>
    </div>
  );
}

/** ป้ายสถานะ */
export function Badge({ kind = "gray", children }) {
  return <span className={"bdg bdg-" + kind}>{children}</span>;
}

/** ตัวเลขสรุปบนแดชบอร์ด */
export function Kpi({ icon, label, value, sub, kind = "" }) {
  return (
    <div className={"kpi " + kind}>
      <div className="top">
        <div className="ic">{icon}</div>
        <div className="lb">{label}</div>
      </div>
      <b>{value}</b>
      <div className="sub">{sub}</div>
    </div>
  );
}

/** ข้อความเมื่อไม่มีข้อมูล */
export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

/** ตารางที่เลื่อนแนวนอนได้บนจอเล็ก */
export function TableWrap({ children }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">{children}</table>
    </div>
  );
}

/** ช่องกรอกพร้อม label */
export function Field({ label, htmlFor, span, children }) {
  const cls = "field" + (span === 2 ? " span2" : span === 4 ? " span4" : "");
  return (
    <div className={cls}>
      {label ? (
        <label className="lbl" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
    </div>
  );
}

/** บาร์โค๊ด Code 128-B แสดงเป็น SVG */
export function Barcode({ value, module = 2, height = 54, showText = true }) {
  const enc = encode128(value, module);
  if (!enc) {
    return <div style={{ color: "var(--fg-faint)", fontSize: 13, padding: 12 }}>— ยังไม่กำหนดบาร์โค๊ด —</div>;
  }
  const textH = showText ? 16 : 0;
  const total = enc.width;
  return (
    <svg
      viewBox={`0 0 ${total} ${height + textH}`}
      width={total}
      height={height + textH}
      role="img"
      aria-label={"บาร์โค๊ด " + enc.text}
      style={{ maxWidth: "100%", height: "auto" }}
    >
      <rect width={total} height={height + textH} fill="#fff" />
      <g fill="#111">
        {enc.bars.map((b, i) => (
          <rect key={i} x={b.x} y={0} width={b.w} height={height} />
        ))}
      </g>
      {showText ? (
        <text
          x={total / 2}
          y={height + 13}
          textAnchor="middle"
          fontFamily="monospace"
          fontSize="13"
          letterSpacing="2"
          fill="#111"
        >
          {enc.text}
        </text>
      ) : null}
    </svg>
  );
}

/**
 * ช่องเลือกที่พิมพ์ค้นหาได้ — ตัวกลางที่ทุกช่อง "เลือกอะไรสักอย่าง" ในระบบใช้ร่วมกัน
 *
 * ทำเป็น input + รายการเอง ไม่ใช้ <select> ของเบราว์เซอร์
 * เพราะ <select> พิมพ์ค้นหาไม่ได้จริง (พิมพ์ได้แค่กระโดดตามตัวอักษรแรก)
 * พอรายการเยอะขึ้นจะเลื่อนหาทีละบรรทัดไม่ไหว
 *
 * ค้นแบบ "เจอส่วนไหนก็ได้" และพิมพ์หลายคำได้ ทุกคำต้องเจอแต่อยู่คนละช่องกันได้
 * เช่นพิมพ์ "ยาง สงขลา" เจอรายการที่มีทั้งสองคำ ไม่ต้องพิมพ์เรียงให้ตรง
 *
 * options = [{ value, code, label, meta, search }]
 *   code  ขึ้นคอลัมน์ซ้าย (รหัส) — ไม่มีก็ได้
 *   meta  ขึ้นคอลัมน์ขวาแบบจาง (หน่วยนับ จังหวัด ยอดเงิน)
 *   search ข้อความเพิ่มที่ให้ค้นเจอแต่ไม่ได้แสดง
 *
 * รายการเรนเดอร์ผ่าน portal ไปที่ body และวางตำแหน่งแบบ fixed
 * ถ้าเรนเดอร์ในที่เดิมจะถูก overflow ของตาราง (.tbl-wrap) หรือของ modal ตัดหาย
 */
export function SearchSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "— เลือก —",
  emptyLabel,
  disabled,
  notFound = "ไม่พบรายการที่ตรงกับ",
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [box, setBox] = useState(null);

  const inputRef = useRef(null);
  const listRef = useRef(null);

  /** ตัวเลือกว่าง (เช่น "ทุกรายการ") ใส่ไว้หัวรายการเมื่อผู้เรียกกำหนดมา */
  const all = emptyLabel ? [{ value: "", label: emptyLabel }] : [];

  const selected = options.find((o) => o.value === value) || null;
  const shown = selected
    ? (selected.code ? selected.code + " · " : "") + selected.label
    : emptyLabel || placeholder;

  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [...all, ...options];
    const hit = options.filter((o) => {
      const hay = [o.code, o.label, o.meta, o.search].filter(Boolean).join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    return [...all, ...hit];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, q, emptyLabel]);

  /** วางรายการให้ตรงกับช่องกรอก และพลิกขึ้นบนถ้าที่ด้านล่างไม่พอ */
  const place = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 200 && above > below;
    setBox({
      left: r.left,
      width: r.width,
      top: up ? undefined : r.bottom + 4,
      bottom: up ? window.innerHeight - r.top + 4 : undefined,
      maxHeight: Math.min(288, Math.max(140, up ? above : below)),
    });
  }, []);

  // ตำแหน่งแบบ fixed ไม่ขยับตามการเลื่อนหน้า ต้องคำนวณใหม่เอง
  // ใช้ capture = true เพื่อจับการเลื่อนของกล่องชั้นในด้วย ไม่ใช่แค่ของหน้าต่าง
  useEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  // คลิกนอกทั้งช่องกรอกและรายการแล้วปิด
  // ต้องเช็ครายการด้วยเพราะมันอยู่คนละที่ในหน้าเว็บแล้ว (portal)
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const inInput = inputRef.current && inputRef.current.contains(e.target);
      const inList = listRef.current && listRef.current.contains(e.target);
      if (!inInput && !inList) {
        setOpen(false);
        setQ("");
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // เลื่อนรายการที่ไฮไลต์ให้อยู่ในสายตาเสมอตอนกดลูกศร
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[hi];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  function close() {
    setOpen(false);
    setQ("");
  }

  function pick(o) {
    onChange(o ? o.value : "");
    close();
  }

  function onKey(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHi((n) => Math.max(0, Math.min(list.length - 1, n + step)));
      return;
    }
    if (e.key === "Enter" && open) {
      e.preventDefault();
      if (list.length) pick(list[hi]);
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    }
  }

  const listId = id ? id + "_list" : undefined;

  const dropdown =
    open && box ? (
      <ul
        className="combo-list"
        id={listId}
        role="listbox"
        ref={listRef}
        style={{
          left: box.left,
          width: box.width,
          top: box.top,
          bottom: box.bottom,
          maxHeight: box.maxHeight,
        }}
      >
        {list.length ? (
          list.map((o, i) => {
            const cur = o.value === value;
            return (
              <li
                key={o.value || "__all"}
                role="option"
                aria-selected={cur}
                className={"combo-opt" + (i === hi ? " hi" : "") + (cur ? " cur" : "")}
                onMouseEnter={() => setHi(i)}
                // pointerdown + preventDefault กันไม่ให้ input เสียโฟกัสก่อนเลือกติด
                onPointerDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
              >
                {o.code ? <span className="c">{o.code}</span> : null}
                <span className="n">{o.label}</span>
                {o.meta ? <span className="m">{o.meta}</span> : null}
              </li>
            );
          })
        ) : (
          <li className="combo-empty">
            {notFound} “{q.trim()}”
          </li>
        )}
      </ul>
    ) : null;

  return (
    <div className="combo">
      <input
        ref={inputRef}
        id={id}
        className="inp combo-inp"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={open ? q : shown}
        placeholder={open ? shown : placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setHi(0);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      <span className="combo-caret" aria-hidden="true">
        ▾
      </span>
      {/* เรนเดอร์ที่ body เพื่อไม่ให้ถูก overflow ของตารางหรือ modal ตัด */}
      {dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}

/** เลือกสินค้า — ค้นได้จาก รหัส / ชื่อ / บาร์โค๊ด / หมวดหมู่ */
export function ProductSelect({ db, value, onChange, id, includeAll, allLabel = "ทุกรายการ" }) {
  const options = useMemo(
    () =>
      db.products.map((p) => ({
        value: p.id,
        code: p.code,
        label: p.name,
        meta: p.unit,
        search: (p.barcode || "") + " " + (p.cat || ""),
      })),
    [db.products]
  );

  return (
    <SearchSelect
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      placeholder="— เลือกสินค้า —"
      emptyLabel={includeAll ? allLabel : undefined}
      notFound="ไม่พบสินค้าที่ตรงกับ"
    />
  );
}

/** เลือกคลังสินค้า — ค้นได้จาก รหัส / ชื่อ / จังหวัด */
export function WarehouseSelect({ db, value, onChange, id, includeAll, allLabel = "ทุกคลัง" }) {
  const options = useMemo(
    () =>
      db.warehouses.map((w) => ({
        value: w.id,
        code: w.code,
        label: w.name,
        meta: w.province,
      })),
    [db.warehouses]
  );

  return (
    <SearchSelect
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      placeholder="— เลือกคลัง —"
      emptyLabel={includeAll ? allLabel : undefined}
      notFound="ไม่พบคลังที่ตรงกับ"
    />
  );
}

/**
 * เลือกที่เก็บสินค้าภายในคลังที่เลือกไว้
 *
 * รายการที่เก็บขึ้นกับคลังเสมอ จึงต้องส่ง whId เข้ามาด้วยทุกครั้ง
 * ถ้าคลังนั้นยังไม่มีช่องเก็บ จะขึ้นข้อความบอกแทนที่จะปล่อยให้เลือกค่าว่างเงียบ ๆ
 */
export function LocationSelect({
  db,
  whId,
  value,
  onChange,
  id,
  includeAll,
  allLabel = "ทุกที่เก็บ",
  disabled,
}) {
  const bins = whId ? locsOf(db, whId) : [];
  const empty = !!whId && bins.length === 0;

  const options = useMemo(
    () =>
      bins.map((l) => ({
        value: l.id,
        code: l.code,
        label: l.name || l.code,
        meta: l.zone,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.locations, whId]
  );

  return (
    <SearchSelect
      id={id}
      value={value || ""}
      onChange={onChange}
      options={options}
      placeholder={
        !whId ? "— เลือกคลังก่อน —" : empty ? "— คลังนี้ยังไม่มีที่เก็บ —" : "— เลือกที่เก็บ —"
      }
      emptyLabel={includeAll ? allLabel : undefined}
      disabled={disabled || empty || (!whId && !includeAll)}
      notFound="ไม่พบที่เก็บที่ตรงกับ"
    />
  );
}

/**
 * คู่ "คลังสินค้า + ที่เก็บ" ที่ต้องไปด้วยกันเสมอ
 *
 * เปลี่ยนคลังเมื่อไร ที่เก็บจะถูกตั้งเป็นช่องแรกของคลังใหม่ให้ทันที
 * ไม่งั้นจะเหลือที่เก็บของคลังเดิมค้างไว้ ซึ่งเป็นคู่ที่ใช้ไม่ได้
 * (ในโหมดตัวกรอง includeAll จะรีเซ็ตเป็น "ทุกที่เก็บ" แทน)
 */
export function WhLocFields({
  db,
  idPrefix,
  whId,
  locId,
  onChange,
  whLabel = "คลังสินค้า",
  locLabel = "ที่เก็บสินค้า",
  includeAll,
  whAllLabel,
  locAllLabel,
  span,
}) {
  return (
    <>
      <Field label={whLabel} htmlFor={idPrefix + "_wh"} span={span}>
        <WarehouseSelect
          db={db}
          id={idPrefix + "_wh"}
          value={whId}
          includeAll={includeAll}
          allLabel={whAllLabel}
          onChange={(w) => onChange(w, includeAll ? "" : firstLocOf(db, w))}
        />
      </Field>
      <Field label={locLabel} htmlFor={idPrefix + "_loc"} span={span}>
        <LocationSelect
          db={db}
          whId={whId}
          id={idPrefix + "_loc"}
          value={locId}
          includeAll={includeAll}
          allLabel={locAllLabel}
          onChange={(l) => onChange(whId, l)}
        />
      </Field>
    </>
  );
}

/**
 * ช่องกรอกจำนวน พร้อมปุ่มลบ/บวก
 *
 * onChange คืนค่าเป็นสตริง (ไม่ใช่ event) เพราะปุ่มกับการพิมพ์ต้องคืนแบบเดียวกัน
 * ปล่อยให้ค่าว่างได้ระหว่างพิมพ์ ผู้ใช้จะได้ลบทิ้งแล้วพิมพ์ใหม่ได้
 * แต่ตอนกดปุ่มจะนับค่าว่างเป็น 0
 *
 * @param {number} [step]  ก้าวละเท่าไร ค่าเริ่มต้น 1
 * @param {number} [min]   ต่ำสุด ค่าเริ่มต้น 0 ใส่ null ถ้าต้องการให้ติดลบได้
 * @param {number} [max]   สูงสุด ไม่ใส่ = ไม่จำกัด
 */
export function QtyInput({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  id,
  disabled,
  placeholder = "0",
  ariaLabel,
  onKeyDown,
}) {
  const n = parseFloat(value);
  const cur = Number.isFinite(n) ? n : 0;

  const atMin = min !== null && min !== undefined && cur <= min;
  const atMax = max !== null && max !== undefined && cur >= max;

  function bump(dir) {
    let next = cur + dir * step;
    if (min !== null && min !== undefined && next < min) next = min;
    if (max !== null && max !== undefined && next > max) next = max;
    // ปัดเศษกันปัญหาทศนิยมลอยตัว เช่น 0.1 + 0.2 ได้ 0.30000000000000004
    next = Math.round(next * 1e6) / 1e6;
    onChange(String(next));
  }

  return (
    <div className="qty-box">
      <button
        type="button"
        className="qty-btn"
        onClick={() => bump(-1)}
        disabled={disabled || atMin}
        aria-label={"ลด" + (ariaLabel ? " " + ariaLabel : "จำนวน")}
        tabIndex={-1}
      >
        −
      </button>
      <input
        className="inp num qty-mid"
        type="number"
        step="any"
        id={id}
        value={value}
        min={min === null ? undefined : min}
        max={max === null ? undefined : max}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="qty-btn"
        onClick={() => bump(1)}
        disabled={disabled || atMax}
        aria-label={"เพิ่ม" + (ariaLabel ? " " + ariaLabel : "จำนวน")}
        tabIndex={-1}
      >
        +
      </button>
    </div>
  );
}

/** แถวสรุปคีย์-ค่า ในหน้ารายละเอียดสินค้า */
export function Row2({ k, children }) {
  return (
    <tr>
      <td style={{ color: "var(--fg-muted)", width: "44%" }}>{k}</td>
      <td>{children}</td>
    </tr>
  );
}

/** ตัวเลขจัดชิดขวาแบบ tabular */
export function N({ v, d = 0, bold, color }) {
  return <b style={{ fontWeight: bold ? 700 : 400, color }}>{num(v, d)}</b>;
}

/**
 * ปุ่มส่งออก Excel + CSV คู่กัน
 *
 * ผู้เรียกส่ง onExport มาเป็นฟังก์ชันที่รับ "ตัวบันทึกไฟล์" แล้วเรียกมันด้วย
 * (หัวตาราง, ข้อมูล, ชื่อไฟล์) — คอมโพเนนต์นี้เป็นคนเลือกว่าจะส่ง downloadCSV
 * หรือ downloadXLSX เข้าไป ข้อมูลชุดเดียวจึงออกได้ทั้งสองแบบโดยไม่ต้องเขียนซ้ำ
 *
 * เขียนแบบนี้เพราะแต่ละหน้าประกอบหัวตารางกับข้อมูลคนละแบบ
 * ถ้าให้ส่งข้อมูลสำเร็จรูปเข้ามา ทุกหน้าจะต้องคำนวณตารางทิ้งไว้ตลอดเวลา
 * ทั้งที่ใช้จริงตอนกดปุ่มเท่านั้น
 */
export function ExportPair({ onExport, disabled, toast }) {
  const run = (save, what) => {
    if (disabled) return toast ? toast("ไม่มีข้อมูลสำหรับส่งออก", "warn") : undefined;
    onExport(save);
    if (toast) toast("ส่งออกไฟล์ " + what + " แล้ว");
  };

  return (
    <>
      <button className="btn btn-g btn-sm" onClick={() => run(downloadXLSX, "Excel")}>
        Excel
      </button>
      <button className="btn btn-g btn-sm" onClick={() => run(downloadCSV, "CSV")}>
        CSV
      </button>
    </>
  );
}

/**
 * ปุ่มพิมพ์ + PDF คู่กัน
 *
 * PDF ใช้หน้าต่างพิมพ์ของเบราว์เซอร์แล้วเลือกปลายทางเป็น "บันทึกเป็น PDF"
 * ไม่ได้สร้างไฟล์ PDF เอง เพราะ PDF ที่มีข้อความไทยต้องฝังฟอนต์ไทยลงในไฟล์
 * ซึ่งต้องมีตัวตัดฟอนต์ (subset) และตาราง CID ที่ใหญ่กว่าตัวโปรแกรมทั้งระบบ
 * ทางนี้ได้ PDF ที่ตัวอักษรไทยถูกต้องแน่นอน เพราะเบราว์เซอร์วาดด้วยฟอนต์ในเครื่อง
 */
export function PrintPair({ onPrint, disabled, toast, label = "พิมพ์" }) {
  return (
    <>
      <button className="btn btn-o btn-sm" onClick={onPrint} disabled={disabled}>
        {label}
      </button>
      <button
        className="btn btn-g btn-sm"
        title="เปิดหน้าต่างพิมพ์แล้วเลือกปลายทางเป็น บันทึกเป็น PDF"
        disabled={disabled}
        onClick={() => {
          if (toast) toast("ในหน้าต่างพิมพ์ ให้เลือกปลายทางเป็น “บันทึกเป็น PDF”", "info");
          onPrint();
        }}
      >
        PDF
      </button>
    </>
  );
}
