"use client";

// ชิ้นส่วน UI ที่ใช้ซ้ำทั่วระบบ

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { encode128 } from "@/lib/barcode";
import { firstLocOf, locsOf } from "@/lib/db";
import { num } from "@/lib/format";

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
 * เลือกสินค้า — กดเลือกจากรายการ หรือพิมพ์ค้นหาก็ได้
 *
 * ทำเป็น input + รายการเอง ไม่ใช้ <select> ของเบราว์เซอร์
 * เพราะ <select> พิมพ์ค้นหาไม่ได้จริง (พิมพ์ได้แค่กระโดดตามตัวอักษรแรก)
 * พอสินค้าเยอะขึ้นจะเลื่อนหาทีละรายการไม่ไหว
 *
 * ค้นได้จาก รหัส / ชื่อ / บาร์โค๊ด / หมวดหมู่
 * ใช้อินเทอร์เฟซเดิมทุกอย่าง หน้าจอที่เรียกอยู่แล้วจึงไม่ต้องแก้
 *
 * รายการเรนเดอร์ผ่าน portal ไปที่ body และวางตำแหน่งแบบ fixed
 * ถ้าเรนเดอร์ในที่เดิมจะถูก overflow ของตาราง (.tbl-wrap) หรือของ modal ตัดหาย
 */
export function ProductSelect({ db, value, onChange, id, includeAll, allLabel = "ทุกรายการ" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [box, setBox] = useState(null);

  const inputRef = useRef(null);
  const listRef = useRef(null);

  const emptyLabel = includeAll ? allLabel : "— เลือกสินค้า —";
  const selected = db.products.find((p) => p.id === value) || null;
  const labelOf = (p) => (p ? p.code + " · " + p.name : emptyLabel);

  // null ในรายการ = ตัวเลือก "ทุกรายการ" ของโหมดตัวกรอง
  const options = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t
      ? db.products.filter((p) =>
          (p.code + " " + p.name + " " + (p.barcode || "") + " " + (p.cat || ""))
            .toLowerCase()
            .includes(t)
        )
      : db.products;
    return includeAll ? [null, ...list] : list;
  }, [db.products, q, includeAll]);

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

  function pick(p) {
    onChange(p ? p.id : "");
    close();
  }

  function onKey(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHi((n) => Math.max(0, Math.min(options.length - 1, n + step)));
      return;
    }
    if (e.key === "Enter" && open) {
      e.preventDefault();
      if (options.length) pick(options[hi]);
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    }
  }

  const listId = id ? id + "_list" : undefined;

  const list =
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
        {options.length ? (
          options.map((p, i) => {
            const cur = p ? p.id === value : !value;
            return (
              <li
                key={p ? p.id : "__all"}
                role="option"
                aria-selected={cur}
                className={"combo-opt" + (i === hi ? " hi" : "") + (cur ? " cur" : "")}
                onMouseEnter={() => setHi(i)}
                // pointerdown + preventDefault กันไม่ให้ input เสียโฟกัสก่อนเลือกติด
                onPointerDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
              >
                {p ? (
                  <>
                    <span className="c">{p.code}</span>
                    <span className="n">{p.name}</span>
                    <span className="m">{p.unit}</span>
                  </>
                ) : (
                  <span className="n">{allLabel}</span>
                )}
              </li>
            );
          })
        ) : (
          <li className="combo-empty">ไม่พบสินค้าที่ตรงกับ “{q.trim()}”</li>
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
        value={open ? q : labelOf(selected)}
        placeholder={open ? labelOf(selected) : ""}
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
      {list ? createPortal(list, document.body) : null}
    </div>
  );
}

/** เลือกคลังสินค้า */
export function WarehouseSelect({ db, value, onChange, id, includeAll, allLabel = "ทุกคลัง" }) {
  return (
    <select className="sel" id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {includeAll ? <option value="">{allLabel}</option> : null}
      {db.warehouses.map((w) => (
        <option key={w.id} value={w.id}>
          {w.code} · {w.name}
        </option>
      ))}
    </select>
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

  return (
    <select
      className="sel"
      id={id}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || empty || (!whId && !includeAll)}
    >
      {includeAll ? <option value="">{allLabel}</option> : null}
      {empty ? <option value="">— คลังนี้ยังไม่มีที่เก็บ —</option> : null}
      {!whId && !includeAll ? <option value="">— เลือกคลังก่อน —</option> : null}
      {bins.map((l) => (
        <option key={l.id} value={l.id}>
          {l.code}
          {l.name ? " · " + l.name : ""}
        </option>
      ))}
    </select>
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
