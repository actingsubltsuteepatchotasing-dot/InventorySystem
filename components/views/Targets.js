"use client";

// หน้าจอกำหนดเป้าขาย
//
// เป้าหนึ่งแถว = งวดหนึ่ง + มิติหนึ่ง + ยอดเป้า
//   มิติที่ระบุได้: พนักงานขาย · กลุ่มสินค้า · ยี่ห้อสินค้า · ประเภทสินค้า
//   เว้นว่าง = ไม่จำกัดมิตินั้น จึงตั้งได้ทั้งเป้ารวมบริษัทและเป้าย่อยรายคน/รายยี่ห้อ
//
// เทียบกับยอดจริงจากหน้าขายสินค้าและบริการ (ดูกติกาการจับคู่ใน lib/targets.js)
// ยอดที่ใช้เทียบเป็นยอดก่อนภาษี เพราะเป้าที่คนตั้งกันคือยอดขายจริง
// ไม่ได้รวมภาษีที่เก็บแทนรัฐ และอัตราภาษีปรับได้รายใบ
//
// โหลดจาก Excel ได้ที่หน้า "นำเข้าข้อมูลจาก Excel" ชุด "เป้าขาย"
// ไม่ทำตัวโหลดไฟล์ซ้ำในหน้านี้ เพราะจะมีสองที่ที่ต้องแก้ตามกันทุกครั้งที่เปลี่ยนรูปแบบไฟล์

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { num, uid } from "@/lib/format";
import { compare, periodName, scopeName, valuesOf } from "@/lib/targets";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { Badge, Card, Empty, ExportPair, PrintPair, SearchSelect, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

const MONTHS = [
  { id: 0, name: "ทั้งปี" },
  ...Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    name: "เดือน " + String(i + 1).padStart(2, "0"),
  })),
];

/** ปีที่เลือกได้ — ปีนี้บวกลบสองปี พอสำหรับการวางแผน */
function yearOptions() {
  const now = new Date().getFullYear();
  return [now - 2, now - 1, now, now + 1, now + 2];
}

export default function Targets() {
  const inv = useInv();
  const perm = inv.perm("targets");
  const { db } = inv;
  const toast = useToast();
  const print = usePrint();
  const { user } = useAuth();

  const thisYear = new Date().getFullYear();
  const BLANK = {
    id: "",
    year: thisYear,
    month: 0,
    salesId: "",
    grp: "",
    brand: "",
    kind: "",
    amount: 0,
    qty: 0,
    note: "",
  };

  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState("");
  const [year, setYear] = useState(thisYear);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const people = useMemo(
    () => (db.salespersons || []).slice().sort((a, b) => a.code.localeCompare(b.code, "th")),
    [db.salespersons]
  );
  const nameOf = (id) => {
    const p = people.find((x) => x.id === id);
    return p ? p.code + " " + p.name : "";
  };

  /** เป้าของปีที่เลือก พร้อมผลเทียบกับยอดจริง */
  const rows = useMemo(
    () =>
      (db.salesTargets || [])
        .filter((t) => Number(t.year) === Number(year))
        .map((t) => compare(db, t))
        .sort((a, b) => a.target.month - b.target.month || b.target.amount - a.target.amount),
    [db, year]
  );

  const totals = rows.reduce(
    (s, r) => ({
      goal: s.goal + (Number(r.target.amount) || 0),
      actual: s.actual + r.actual.amount,
    }),
    { goal: 0, actual: 0 }
  );

  const problems = [];
  if (!Number(form.amount) && !Number(form.qty)) problems.push("ยอดเป้า หรือจำนวนเป้า");
  if (!Number(form.year)) problems.push("ปี");

  async function save() {
    if (busy) return;
    if (problems.length) return toast("ยังกรอกไม่ครบ: " + problems.join(" · "), "err");

    const t = {
      ...form,
      id: form.id || uid(),
      year: Number(form.year),
      month: Number(form.month) || 0,
      amount: Number(form.amount) || 0,
      qty: Number(form.qty) || 0,
      note: form.note.trim(),
      user: user && user.email ? user.email : "",
      ts: Date.now(),
    };

    setBusy("save");
    try {
      await inv.saveTarget(t);
      toast("บันทึกเป้า " + periodName(t) + " · " + scopeName(t, nameOf(t.salesId)) + " แล้ว", "ok");
      setForm({ ...BLANK, year: t.year, month: t.month });
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  async function drop(t) {
    if (busy) return;
    if (!window.confirm("ลบเป้า " + periodName(t) + " · " + scopeName(t, nameOf(t.salesId)) + "?")) {
      return;
    }
    setBusy(t.id);
    try {
      await inv.removeTarget(t.id);
      if (form.id === t.id) setForm(BLANK);
      toast("ลบเป้าแล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  const HEAD = ["งวด", "พนักงานขาย", "กลุ่มสินค้า", "ยี่ห้อ", "ประเภท",
    "ยอดเป้า", "ยอดจริง", "ผลต่าง", "ทำได้ (%)", "หมายเหตุ"];

  const dataRows = () =>
    rows.map((r) => [
      periodName(r.target),
      nameOf(r.target.salesId) || "ทุกคน",
      r.target.grp || "ทุกกลุ่ม",
      r.target.brand || "ทุกยี่ห้อ",
      r.target.kind || "ทุกประเภท",
      r.target.amount,
      r.actual.amount,
      r.diff,
      r.pct === null ? "" : Math.round(r.pct),
      r.target.note,
    ]);

  function printReport() {
    if (!rows.length) return toast("ไม่มีเป้าในปีนี้สำหรับพิมพ์", "warn");
    print({
      title: "รายงานเป้าขายเทียบยอดจริง",
      subtitle:
        "ปี " + (Number(year) + 543) + " · " + rows.length + " เป้า · " +
        "เป้ารวม ฿" + num(totals.goal, 0) + " · ทำได้ ฿" + num(totals.actual, 0),
      body: (
        <table>
          <thead>
            <tr>
              {HEAD.map((h, i) => (
                <th key={h} style={i >= 5 ? { textAlign: "right" } : undefined}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows().map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} style={j >= 5 && j <= 8 ? { textAlign: "right" } : undefined}>
                    {typeof c === "number" ? num(c, 0) : c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ),
    });
  }

  if (!inv.targetsReady) {
    return <SetupNotice feature="หน้าจอกำหนดเป้าขาย" tables={["sales_targets", "salespersons"]} />;
  }

  return (
    <div className="stack">
      <Card
        title={form.id ? "แก้ไขเป้าขาย" : "ตั้งเป้าขายใหม่"}
        actions={
          <>
            {form.id ? (
              <button className="btn btn-g btn-sm" onClick={() => setForm(BLANK)}>
                ตั้งเป้าใหม่
              </button>
            ) : null}
            <button
              className="btn btn-p btn-sm"
              onClick={save}
              disabled={!!busy || !perm.edit || !!problems.length}
              title={problems.length ? "ยังกรอกไม่ครบ: " + problems.join(", ") : ""}
            >
              {busy === "save" ? "กำลังบันทึก…" : "บันทึกเป้า"}
            </button>
          </>
        }
      >
        <p className="muted" style={{ marginTop: 0 }}>
          ช่องมิติไหนเว้นว่าง = ไม่จำกัดมิตินั้น · ตั้งได้ทั้งเป้ารวมทั้งบริษัท
          และเป้าย่อยรายคน รายยี่ห้อ หรือผสมกัน เช่น “เป้าของสมชาย เฉพาะยี่ห้อ A เดือนกันยายน”
        </p>

        <div className="form-grid">
          <div className="field">
            <label className="lbl" htmlFor="tg_year">ปี (ค.ศ.)</label>
            <SearchSelect
              id="tg_year"
              value={String(form.year)}
              onChange={(v) => set("year", Number(v))}
              options={yearOptions().map((y) => ({
                value: String(y),
                code: String(y),
                label: "พ.ศ. " + (y + 543),
              }))}
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="tg_month">งวด</label>
            <SearchSelect
              id="tg_month"
              value={String(form.month)}
              onChange={(v) => set("month", Number(v))}
              options={MONTHS.map((m) => ({ value: String(m.id), label: m.name }))}
            />
            <span className="hint">เลือก “ทั้งปี” เมื่อตั้งเป้ารายปี ไม่ได้แยกเดือน</span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="tg_sales">พนักงานขาย</label>
            <SearchSelect
              id="tg_sales"
              value={form.salesId}
              onChange={(v) => set("salesId", v)}
              options={people.map((p) => ({ value: p.id, code: p.code, label: p.name }))}
              emptyLabel="ทุกคน (เป้ารวม)"
              notFound="ไม่พบพนักงานขายที่ตรงกับ"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="tg_grp">กลุ่มสินค้า</label>
            <SearchSelect
              id="tg_grp"
              value={form.grp}
              onChange={(v) => set("grp", v)}
              options={valuesOf(db, "grp").map((x) => ({ value: x, label: x }))}
              emptyLabel="ทุกกลุ่ม"
              notFound="ไม่พบกลุ่มที่ตรงกับ"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="tg_brand">ยี่ห้อสินค้า</label>
            <SearchSelect
              id="tg_brand"
              value={form.brand}
              onChange={(v) => set("brand", v)}
              options={valuesOf(db, "brand").map((x) => ({ value: x, label: x }))}
              emptyLabel="ทุกยี่ห้อ"
              notFound="ไม่พบยี่ห้อที่ตรงกับ"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="tg_kind">ประเภทสินค้า</label>
            <SearchSelect
              id="tg_kind"
              value={form.kind}
              onChange={(v) => set("kind", v)}
              options={valuesOf(db, "kind").map((x) => ({ value: x, label: x }))}
              emptyLabel="ทุกประเภท"
              notFound="ไม่พบประเภทที่ตรงกับ"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="tg_amount">ยอดเป้า (บาท ก่อนภาษี)</label>
            <input
              className="inp"
              id="tg_amount"
              type="number"
              min={0}
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
            <span className="hint">
              เทียบกับยอดก่อนภาษี เพราะภาษีเป็นเงินที่เก็บแทนรัฐ ไม่ใช่ยอดขายของเรา
            </span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="tg_qty">จำนวนเป้า (หน่วย)</label>
            <input
              className="inp"
              id="tg_qty"
              type="number"
              min={0}
              value={form.qty}
              onChange={(e) => set("qty", e.target.value)}
            />
            <span className="hint">ใส่เมื่อคุมเป็นจำนวนชิ้นด้วย · เว้นว่างได้</span>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="tg_note">หมายเหตุ</label>
            <input
              className="inp"
              id="tg_note"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card
        title="เป้าขายเทียบยอดจริง"
        actions={
          <>
            <Badge kind="info">เป้ารวม ฿{num(totals.goal, 0)}</Badge>
            <Badge kind={totals.actual >= totals.goal && totals.goal > 0 ? "ok" : "warn"}>
              ทำได้ ฿{num(totals.actual, 0)}
            </Badge>
            <PrintPair onPrint={printReport} toast={toast} disabled={!rows.length} label="พิมพ์" />
            <ExportPair
              onExport={(save2) => save2(HEAD, dataRows(), "เป้าขาย.csv")}
              disabled={!rows.length}
              toast={toast}
            />
          </>
        }
      >
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <div className="field">
            <label className="lbl" htmlFor="tg_yr">ดูเป้าของปี</label>
            <SearchSelect
              id="tg_yr"
              value={String(year)}
              onChange={(v) => setYear(Number(v))}
              options={yearOptions().map((y) => ({
                value: String(y),
                code: String(y),
                label: "พ.ศ. " + (y + 543),
              }))}
            />
          </div>
        </div>

        {rows.length ? (
          <div className="doc-scroll" style={{ maxHeight: 480 }}>
            <TableWrap>
              <thead>
                <tr>
                  <th style={{ minWidth: 120 }}>งวด</th>
                  <th style={{ minWidth: 150 }}>พนักงานขาย</th>
                  <th style={{ minWidth: 180 }}>ขอบเขตสินค้า</th>
                  <th className="num" style={{ width: 120 }}>ยอดเป้า</th>
                  <th className="num" style={{ width: 120 }}>ยอดจริง</th>
                  <th className="num" style={{ width: 120 }}>ผลต่าง</th>
                  <th style={{ minWidth: 170 }}>ทำได้</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.target.id}>
                    <td>{periodName(r.target)}</td>
                    <td>{nameOf(r.target.salesId) || "ทุกคน"}</td>
                    <td className="muted">
                      {[
                        r.target.grp && "กลุ่ม " + r.target.grp,
                        r.target.brand && "ยี่ห้อ " + r.target.brand,
                        r.target.kind && "ประเภท " + r.target.kind,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "ทุกสินค้า"}
                    </td>
                    <td className="num">{num(r.target.amount, 0)}</td>
                    <td className="num">{num(r.actual.amount, 0)}</td>
                    <td
                      className="num"
                      style={{ color: r.diff >= 0 ? "var(--ok)" : "var(--err)", fontWeight: 700 }}
                    >
                      {(r.diff > 0 ? "+" : "") + num(r.diff, 0)}
                    </td>
                    <td>
                      {r.pct === null ? (
                        <span className="muted">ยังไม่ได้ตั้งยอดเป้า</span>
                      ) : (
                        <span className="tg-bar" title={num(r.pct, 0) + "%"}>
                          <i style={{ width: Math.min(100, r.pct) + "%" }} className={r.done ? "on" : ""} />
                          <b>{num(r.pct, 0)}%</b>
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <button
                          className="btn btn-o btn-sm"
                          onClick={() => setForm({ ...r.target })}
                          disabled={!perm.edit}
                        >
                          แก้ไข
                        </button>
                        <button
                          className="btn btn-d btn-sm"
                          onClick={() => drop(r.target)}
                          disabled={!!busy || !perm.edit}
                        >
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        ) : (
          <Empty>
            ยังไม่มีเป้าของปี พ.ศ. {year + 543} — ตั้งด้านบน หรือโหลดจาก Excel ที่เมนู
            “นำเข้าข้อมูลจาก Excel”
          </Empty>
        )}
      </Card>
    </div>
  );
}
