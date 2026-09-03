"use client";

// ชิ้นส่วน UI ที่ใช้ซ้ำทั่วระบบ

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

/** เลือกสินค้า */
export function ProductSelect({ db, value, onChange, id, includeAll, allLabel = "ทุกรายการ" }) {
  return (
    <select className="sel" id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {includeAll ? <option value="">{allLabel}</option> : null}
      {db.products.map((p) => (
        <option key={p.id} value={p.id}>
          {p.code} · {p.name}
        </option>
      ))}
    </select>
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
