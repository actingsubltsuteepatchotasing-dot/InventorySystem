"use client";

// หน้าจอสร้างรายงาน — ตารางสรุปแบบ pivot ที่ผู้ใช้จัดเอง
//
// เลือกชุดข้อมูล (= หน้าจอที่มีในระบบ) แล้วลากฟิลด์ไปวางเป็น
//   แถว    = จัดกลุ่มลงมาตามแนวตั้ง
//   คอลัมน์ = แตกออกไปตามแนวนอน
//   ค่า    = ตัวเลขที่จะรวม (ผลรวม / นับ / เฉลี่ย / ต่ำสุด / สูงสุด)
// เหมือน PivotTable ใน Excel
//
// ทำไมไม่ทำเป็นรายงานสำเร็จรูปเพิ่มอีกสิบหน้า:
//   ทุกครั้งที่มีคนอยากได้มุมมองใหม่ ต้องรอโปรแกรมเมอร์เขียนให้
//   หน้านี้ย้ายอำนาจนั้นไปอยู่กับคนใช้ เขาจัดเองได้โดยไม่ต้องรอใคร
//
// ไม่ต้องเลือกคอลัมน์ก็ได้ ถ้าเลือกแค่แถวกับค่า จะได้ตารางสรุปธรรมดา
// ไม่เลือกแถวและคอลัมน์เลย จะได้ยอดรวมทั้งชุดข้อมูลบรรทัดเดียว

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { PAY_METHODS, SHIP_STATUS } from "@/lib/constants";
import { AGGS, DATASETS, aggregate, labelOf } from "@/lib/reportData";
import { num, thDate, todayISO } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { IcPlus, IcTrash } from "../Icons";
import { Badge, Card, Empty, ExportPair, PrintPair, SearchSelect, TableWrap } from "../ui";

/** ค่าที่ส่งให้ตัวแปลงข้อมูล เผื่อบางชุดต้องแปลงรหัสเป็นชื่อ */
const EXTRA = {
  payName: (id) => (PAY_METHODS.find((m) => m.id === id) || { name: id }).name,
  shipName: (id) => (SHIP_STATUS.find((s) => s.id === id) || { name: id }).name,
};

/**
 * ตัวคั่นคีย์ของกลุ่ม — ใช้อักขระควบคุมที่พิมพ์ไม่ได้
 *
 * ห้ามใช้อักขระธรรมดาอย่างขีดหรือขีดตั้ง เพราะข้อมูลจริงมีอยู่แล้ว
 * (ชื่อสินค้า เลขที่เอกสาร) สองกลุ่มที่ไม่เกี่ยวกันจะกลายเป็นกลุ่มเดียวกันเงียบ ๆ
 * และห้ามเป็นสตริงว่าง เพราะ "ab" + "c" จะชนกับ "a" + "bc"
 */
const KEY_SEP = String.fromCharCode(1);

export default function ReportBuilder() {
  const inv = useInv();
  const perm = inv.perm("builder");
  const { db } = inv;
  const toast = useToast();
  const print = usePrint();

  const [setId, setSetId] = useState(DATASETS[0].id);
  const [rowFields, setRowFields] = useState(["month"]);
  const [colFields, setColFields] = useState([]);
  const [values, setValues] = useState([{ field: "qty", agg: "sum" }]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const ds = DATASETS.find((d) => d.id === setId) || DATASETS[0];
  const dims = ds.fields.filter((f) => f.type === "dim");
  const nums = ds.fields.filter((f) => f.type === "num");
  const fieldName = (id) => (ds.fields.find((f) => f.id === id) || { name: id }).name;

  /** เปลี่ยนชุดข้อมูลแล้วต้องล้างการจัดเดิม เพราะชื่อฟิลด์คนละชุดกัน */
  function pickSet(id) {
    const next = DATASETS.find((d) => d.id === id) || DATASETS[0];
    const d = next.fields.filter((f) => f.type === "dim");
    const n = next.fields.filter((f) => f.type === "num");
    setSetId(id);
    setRowFields(d.length ? [d[0].id] : []);
    setColFields([]);
    setValues(n.length ? [{ field: n[0].id, agg: "sum" }] : []);
  }

  const rows = useMemo(() => {
    const all = ds.rows(db, inv, EXTRA);
    if (ds.noDate) return all;
    return all.filter((r) => {
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      return true;
    });
  }, [ds, db, inv, from, to]);

  /**
   * หมุนข้อมูลเป็นตาราง
   *
   * คีย์ของกลุ่มคือค่าของทุกฟิลด์ที่เลือกต่อกันด้วยอักขระที่พิมพ์ไม่ได้
   * ไม่ใช้ "|" หรือ "-" เพราะข้อมูลจริงมีอักขระพวกนั้นอยู่ (ชื่อสินค้า เลขที่เอกสาร)
   * แล้วกลุ่มคนละกลุ่มจะกลายเป็นกลุ่มเดียวกันโดยไม่มีใครสังเกต
   */
  const pivot = useMemo(() => {
    const rowKeys = new Map();
    const colKeys = new Map();
    const cells = new Map();

    const keyOf = (r, fields) => fields.map((f) => String(r[f] ?? "")).join(KEY_SEP);

    rows.forEach((r) => {
      const rk = keyOf(r, rowFields);
      const ck = keyOf(r, colFields);
      if (!rowKeys.has(rk)) rowKeys.set(rk, rowFields.map((f) => r[f]));
      if (!colKeys.has(ck)) colKeys.set(ck, colFields.map((f) => r[f]));

      const cell = rk + KEY_SEP + KEY_SEP + ck;
      if (!cells.has(cell)) cells.set(cell, []);
      cells.get(cell).push(r);
    });

    const sortKeys = (map, fields) =>
      [...map.entries()].sort((a, b) => {
        for (let i = 0; i < fields.length; i++) {
          const x = String(a[1][i] ?? "");
          const y = String(b[1][i] ?? "");
          if (x !== y) return x.localeCompare(y, "th", { numeric: true });
        }
        return 0;
      });

    return {
      rowKeys: sortKeys(rowKeys, rowFields),
      colKeys: sortKeys(colKeys, colFields),
      /** ค่าของช่องหนึ่ง — ไม่มีแถวเข้าเงื่อนไขคืน null (ต่างจาก 0) */
      at: (rk, ck, v) => {
        const list = cells.get(rk + KEY_SEP + KEY_SEP + ck) || [];
        return aggregate(
          list.map((r) => Number(r[v.field]) || 0),
          v.agg
        );
      },
      /** ยอดรวมของทั้งแถว หรือทั้งคอลัมน์ */
      total: (filterFn, v) => {
        const list = rows.filter(filterFn);
        return aggregate(
          list.map((r) => Number(r[v.field]) || 0),
          v.agg
        );
      },
    };
  }, [rows, rowFields, colFields]);

  const cell = (n) => (n === null ? "" : num(n, Number.isInteger(n) ? 0 : 2));

  /* --------------------------------------------------- จัดฟิลด์ */

  const addTo = (list, set, id) => {
    if (!id || list.includes(id)) return;
    set([...list, id]);
  };
  const dropFrom = (list, set, id) => set(list.filter((x) => x !== id));

  function FieldBox({ title, hint, list, set }) {
    const left = dims.filter((f) => !list.includes(f.id));
    return (
      <div className="pv-box">
        <div className="pv-head">
          <b>{title}</b>
          <span>{hint}</span>
        </div>
        <div className="pv-chips">
          {list.length ? (
            list.map((id) => (
              <span className="pv-chip" key={id}>
                {fieldName(id)}
                <button
                  type="button"
                  onClick={() => dropFrom(list, set, id)}
                  aria-label={"เอา " + fieldName(id) + " ออก"}
                >
                  ×
                </button>
              </span>
            ))
          ) : (
            <span className="muted" style={{ fontSize: 12.5 }}>ยังไม่ได้เลือก</span>
          )}
        </div>
        {/* ฟิลด์บางชุดมีสิบกว่าอัน พิมพ์ค้นเร็วกว่าเลื่อนหา */}
        <SearchSelect
          value=""
          onChange={(v) => addTo(list, set, v)}
          disabled={!left.length}
          options={left.map((f) => ({ value: f.id, label: f.name }))}
          placeholder={left.length ? "+ เพิ่มฟิลด์…" : "เลือกครบแล้ว"}
          notFound="ไม่พบฟิลด์ที่ตรงกับ"
        />
      </div>
    );
  }

  /* ------------------------------------------------ ส่งออก / พิมพ์ */

  function flatTable() {
    const head = [
      ...rowFields.map(fieldName),
      ...(colFields.length
        ? pivot.colKeys.flatMap(([, cv]) =>
            values.map(
              (v) =>
                cv.map((x, i) => labelOf(colFields[i], x)).join(" / ") +
                " · " +
                fieldName(v.field)
            )
          )
        : values.map((v) => fieldName(v.field))),
      ...values.map((v) => "รวม " + fieldName(v.field)),
    ];

    const body = pivot.rowKeys.map(([rk, rv]) => [
      ...rv.map((x, i) => labelOf(rowFields[i], x)),
      ...(colFields.length
        ? pivot.colKeys.flatMap(([ck]) => values.map((v) => cell(pivot.at(rk, ck, v))))
        : values.map((v) => cell(pivot.at(rk, "", v)))),
      ...values.map((v) =>
        cell(
          pivot.total(
            (r) => rowFields.map((f) => String(r[f] ?? "")).join(KEY_SEP) === rk,
            v
          )
        )
      ),
    ]);

    return { head, body };
  }

  function exportFile(save) {
    const { head, body } = flatTable();
    save(head, body, "รายงาน-" + ds.name + ".csv");
  }

  function printReport() {
    if (!pivot.rowKeys.length) return toast("ไม่มีข้อมูลสำหรับพิมพ์", "warn");
    const { head, body } = flatTable();
    print({
      title: "รายงาน " + ds.name,
      subtitle:
        (rowFields.length ? "แถว: " + rowFields.map(fieldName).join(", ") : "") +
        (colFields.length ? " · คอลัมน์: " + colFields.map(fieldName).join(", ") : "") +
        (ds.noDate || (!from && !to)
          ? ""
          : " · ช่วง " + (from ? thDate(from) : "เริ่มแรก") + " ถึง " + (to ? thDate(to) : "ล่าสุด")),
      body: (
        <table>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i} style={i >= rowFields.length ? { textAlign: "right" } : undefined}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} style={j >= rowFields.length ? { textAlign: "right" } : undefined}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ),
    });
  }

  /* ------------------------------------------------------- แสดงผล */

  return (
    <div className="stack">
      <Card
        title="สร้างรายงาน"
        actions={
          <>
            <Badge kind="info">{num(rows.length, 0)} แถวข้อมูล</Badge>
            <PrintPair onPrint={printReport} toast={toast} label="พิมพ์" />
            <ExportPair onExport={exportFile} disabled={!pivot.rowKeys.length} toast={toast} />
          </>
        }
      >
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <div className="field span2">
            <label className="lbl" htmlFor="rb_set">ชุดข้อมูล (มาจากหน้าจอไหน)</label>
            <SearchSelect
              id="rb_set"
              value={setId}
              onChange={pickSet}
              options={DATASETS.map((d) => ({ value: d.id, label: d.name, meta: d.hint }))}
              notFound="ไม่พบชุดข้อมูลที่ตรงกับ"
            />
            <span className="hint">{ds.hint}</span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="rb_from">ตั้งแต่วันที่</label>
            <input
              className="inp"
              type="date"
              id="rb_from"
              value={from}
              disabled={ds.noDate || !perm.date}
              title={ds.noDate ? "ชุดข้อมูลนี้ไม่มีวันที่" : ""}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="rb_to">ถึงวันที่</label>
            <input
              className="inp"
              type="date"
              id="rb_to"
              value={to}
              disabled={ds.noDate || !perm.date}
              max={todayISO()}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        <div className="pv-grid">
          <FieldBox
            title="แถว"
            hint="จัดกลุ่มลงมาตามแนวตั้ง"
            list={rowFields}
            set={setRowFields}
          />
          <FieldBox
            title="คอลัมน์"
            hint="แตกออกไปตามแนวนอน (ไม่เลือกก็ได้)"
            list={colFields}
            set={setColFields}
          />

          <div className="pv-box">
            <div className="pv-head">
              <b>ค่าที่จะรวม</b>
              <span>ตัวเลขในช่องกลางตาราง</span>
            </div>
            {values.map((v, i) => (
              <div className="row" key={i} style={{ gap: 6, flexWrap: "nowrap", marginBottom: 6 }}>
                <select
                  className="sel"
                  value={v.field}
                  onChange={(e) =>
                    setValues(values.map((x, k) => (k === i ? { ...x, field: e.target.value } : x)))
                  }
                  aria-label={"ฟิลด์ของค่าที่ " + (i + 1)}
                >
                  {nums.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <select
                  className="sel"
                  style={{ maxWidth: 130 }}
                  value={v.agg}
                  onChange={(e) =>
                    setValues(values.map((x, k) => (k === i ? { ...x, agg: e.target.value } : x)))
                  }
                  aria-label={"วิธีรวมของค่าที่ " + (i + 1)}
                >
                  {AGGS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-d btn-icon"
                  onClick={() => setValues(values.filter((x, k) => k !== i))}
                  disabled={values.length <= 1}
                  title="เอาค่านี้ออก"
                >
                  <IcTrash size={14} />
                </button>
              </div>
            ))}
            <button
              className="btn btn-o btn-sm"
              onClick={() => setValues([...values, { field: nums[0].id, agg: "sum" }])}
              disabled={!nums.length}
            >
              <IcPlus size={14} />
              เพิ่มค่า
            </button>
          </div>
        </div>
      </Card>

      <Card
        title={"ผลลัพธ์ — " + ds.name}
        actions={
          <Badge>
            {pivot.rowKeys.length} แถว
            {colFields.length ? " × " + pivot.colKeys.length + " คอลัมน์" : ""}
          </Badge>
        }
      >
        {!values.length ? (
          <Empty>เลือก “ค่าที่จะรวม” อย่างน้อยหนึ่งอย่างก่อน</Empty>
        ) : !pivot.rowKeys.length ? (
          <Empty>ไม่มีข้อมูลตามเงื่อนไขที่เลือก</Empty>
        ) : (
          <TableWrap>
            <thead>
              {colFields.length ? (
                <tr>
                  <th rowSpan={2} colSpan={rowFields.length || 1}>
                    {rowFields.map(fieldName).join(" / ") || "ทั้งหมด"}
                  </th>
                  {pivot.colKeys.map(([ck, cv]) => (
                    <th key={ck} colSpan={values.length} style={{ textAlign: "center" }}>
                      {cv.map((x, i) => labelOf(colFields[i], x)).join(" / ")}
                    </th>
                  ))}
                  <th colSpan={values.length} style={{ textAlign: "center" }}>
                    รวมทั้งแถว
                  </th>
                </tr>
              ) : null}
              <tr>
                {colFields.length
                  ? null
                  : (rowFields.length ? rowFields : ["ทั้งหมด"]).map((f) => (
                      <th key={f} style={{ minWidth: 150 }}>
                        {rowFields.length ? fieldName(f) : "ทั้งหมด"}
                      </th>
                    ))}
                {colFields.length
                  ? pivot.colKeys.flatMap(([ck]) =>
                      values.map((v, i) => (
                        <th key={ck + i} className="num">
                          {fieldName(v.field)}
                        </th>
                      ))
                    )
                  : values.map((v, i) => (
                      <th key={i} className="num">
                        {fieldName(v.field)}
                      </th>
                    ))}
                {colFields.length
                  ? values.map((v, i) => (
                      <th key={"t" + i} className="num">
                        {fieldName(v.field)}
                      </th>
                    ))
                  : null}
              </tr>
            </thead>
            <tbody>
              {pivot.rowKeys.map(([rk, rv]) => (
                <tr key={rk}>
                  {rowFields.length ? (
                    rv.map((x, i) => <td key={i}>{labelOf(rowFields[i], x)}</td>)
                  ) : (
                    <td>ทั้งหมด</td>
                  )}
                  {colFields.length
                    ? pivot.colKeys.flatMap(([ck]) =>
                        values.map((v, i) => (
                          <td key={ck + i} className="num">
                            {cell(pivot.at(rk, ck, v))}
                          </td>
                        ))
                      )
                    : values.map((v, i) => (
                        <td key={i} className="num">
                          <b>{cell(pivot.at(rk, "", v))}</b>
                        </td>
                      ))}
                  {colFields.length
                    ? values.map((v, i) => (
                        <td key={"t" + i} className="num">
                          <b>
                            {cell(
                              pivot.total(
                                (r) =>
                                  rowFields.map((f) => String(r[f] ?? "")).join(KEY_SEP) === rk,
                                v
                              )
                            )}
                          </b>
                        </td>
                      ))
                    : null}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={rowFields.length || 1}>รวมทั้งหมด</td>
                {colFields.length
                  ? pivot.colKeys.flatMap(([ck]) =>
                      values.map((v, i) => (
                        <td key={ck + i} className="num">
                          {cell(
                            pivot.total(
                              (r) => colFields.map((f) => String(r[f] ?? "")).join(KEY_SEP) === ck,
                              v
                            )
                          )}
                        </td>
                      ))
                    )
                  : values.map((v, i) => (
                      <td key={i} className="num">
                        {cell(pivot.total(() => true, v))}
                      </td>
                    ))}
                {colFields.length
                  ? values.map((v, i) => (
                      <td key={"t" + i} className="num">
                        {cell(pivot.total(() => true, v))}
                      </td>
                    ))
                  : null}
              </tr>
            </tfoot>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
