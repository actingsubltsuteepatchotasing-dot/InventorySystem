"use client";

// หน้าจอออกแบบฟอร์มพิมพ์
//
// ออกแบบด้วยการ "ประกอบจากชิ้นส่วน" ไม่ใช่ลากวางอิสระบนผืนผ้าใบ
//   ลากวางฟังดูยืดหยุ่นกว่า แต่ของจริงจะได้ฟอร์มที่ข้อความล้นกรอบเมื่อชื่อสินค้ายาว
//   และเพี้ยนเมื่อจำนวนบรรทัดเปลี่ยน ซึ่งเป็นสิ่งที่เกิดทุกใบในงานจริง
//   เอกสารการค้าเป็นตารางที่มีโครงตายตัวอยู่แล้ว สิ่งที่คนอยากเปลี่ยนจริง ๆ คือ
//   หัวเอกสารเขียนว่าอะไร · เอาคอลัมน์ไหนบ้างเรียงยังไง · ช่องลงนามมีกี่ช่องเขียนว่าอะไร
//   ให้เลือกสิ่งเหล่านั้นได้ ก็ครอบคลุมงานจริงเกือบทั้งหมดโดยไม่มีทางออกแบบให้พัง
//
// มีตัวอย่างจริงอยู่ข้าง ๆ ตลอดเวลา ไม่ต้องกดพิมพ์ออกมาดูว่าหน้าตาเป็นยังไง
//   ตัวอย่างใช้โค้ดวาดตัวเดียวกับตอนพิมพ์จริง (components/views/printBodies.js)
//   จึงไม่มีทางที่ตัวอย่างสวยแต่พิมพ์ออกมาคนละอย่าง
//
// ฟอร์มผูกกับ "ชนิดเอกสาร" ไม่ใช่ผูกกับหน้าจอ
//   เพราะใบขายพิมพ์ได้จากหลายที่ ถ้าผูกกับหน้าจอจะต้องตั้งซ้ำทุกที่ที่พิมพ์ได้

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { uid } from "@/lib/format";
import {
  FORM_COLUMNS,
  FORM_KINDS,
  SIGN_PRESETS,
  defaultForm,
  formsOf,
  kindOf,
  problemsOf,
} from "@/lib/printForms";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { Badge, Card, Empty, SearchSelect, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";
import { TradeDocBody } from "./printBodies";

/** เอกสารตัวอย่างที่ใช้ดูหน้าตา — ไม่แตะข้อมูลจริง */
const SAMPLE_DOC = {
  id: "preview",
  docNo: "IV-202609-0001",
  date: "2026-09-06",
  custCode: "C0001",
  custName: "บริษัท สยามยาง จำกัด",
  custAddress: "99/1 ถนนมิตรภาพ ต.ในเมือง อ.เมืองขอนแก่น จ.ขอนแก่น 40000",
  custTaxId: "0105512345678",
  custBranch: "สำนักงานใหญ่",
  supCode: "S0001",
  supName: "หจก. วัสดุภัณฑ์",
  supAddress: "12 ถนนศรีจันทร์ ต.ในเมือง อ.เมืองขอนแก่น จ.ขอนแก่น 40000",
  supTaxId: "0403512345678",
  supBranch: "สำนักงานใหญ่",
  vatRate: 7,
  itemsTotal: 12000,
  billDiscount: 1000,
  base: 11000,
  vat: 770,
  total: 11770,
  note: "ส่งของภายใน 3 วันทำการ",
  user: "demo@example.com",
};

const SAMPLE_ITEMS = [
  { id: "s1", productId: "__a", qty: 10, price: 800, discPct: 0, discAmt: 0, amount: 8000, whId: "", locId: "" },
  { id: "s2", productId: "__b", qty: 4, price: 1000, discPct: 0, discAmt: 0, amount: 4000, whId: "", locId: "" },
];

/** ตัวช่วยหาชื่อสินค้าของเอกสารตัวอย่าง ไม่ต้องมีสินค้าจริงในระบบ */
const SAMPLE_INV = {
  prod: (id) =>
    id === "__a"
      ? { code: "IC0001", unit: "ถัง", brand: "ตราช้าง" }
      : { code: "IC0002", unit: "กล่อง", brand: "ตราสิงห์" },
  prodName: (id) => (id === "__a" ? "น้ำยางข้น 60%" : "ถุงมือยางอเนกประสงค์"),
  whLocName: () => "คลังขอนแก่น · A-01",
};

export default function PrintForms() {
  const inv = useInv();
  const perm = inv.perm("printforms");
  const { db } = inv;
  const toast = useToast();
  const print = usePrint();
  const { user } = useAuth();

  const [kindId, setKindId] = useState(FORM_KINDS[0].id);
  const [form, setForm] = useState(() => defaultForm(FORM_KINDS[0].id));
  const [busy, setBusy] = useState("");

  const kind = kindOf(kindId);
  const list = useMemo(() => formsOf(db, kindId), [db, kindId]);
  const problems = problemsOf(form);
  const editing = !!form.id;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function pickKind(id) {
    setKindId(id);
    setForm(defaultForm(id));
  }

  function newForm() {
    setForm({ ...defaultForm(kindId), name: "" });
  }

  /* ---------------------------------------------- คอลัมน์ในตาราง */

  const toggleCol = (id) =>
    set("columns", form.columns.includes(id)
      ? form.columns.filter((c) => c !== id)
      : [...form.columns, id]);

  /** เลื่อนคอลัมน์ขึ้นหรือลง — ลำดับในรายการคือลำดับบนกระดาษ */
  function moveCol(id, dir) {
    const at = form.columns.indexOf(id);
    const to = at + dir;
    if (at < 0 || to < 0 || to >= form.columns.length) return;
    const next = form.columns.slice();
    next.splice(to, 0, next.splice(at, 1)[0]);
    set("columns", next);
  }

  /* ------------------------------------------------- ช่องลงนาม */

  const addSign = (label) => {
    if (!label || form.signs.includes(label)) return;
    // เกินสี่ช่องจะเบียดกันจนเซ็นไม่ลง กระดาษ A4 กว้างเท่าเดิม
    if (form.signs.length >= 4) return toast("ใส่ช่องลงนามได้มากสุด 4 ช่อง", "warn");
    set("signs", [...form.signs, label]);
  };

  const dropSign = (i) => set("signs", form.signs.filter((_, n) => n !== i));

  /* ------------------------------------------------------ บันทึก */

  async function save() {
    if (busy) return;
    if (problems.length) return toast("ยังไม่ครบ: " + problems.join(" · "), "err");

    const f = {
      ...form,
      id: form.id || uid(),
      docKind: kindId,
      name: form.name.trim(),
      title: form.title.trim(),
      user: user && user.email ? user.email : "",
      ts: Date.now(),
    };

    setBusy("save");
    try {
      await inv.savePrintForm(f);
      setForm(f);
      toast("บันทึกฟอร์ม " + f.name + " แล้ว", "ok");
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  async function drop(f) {
    if (busy) return;
    const used = (db.docGroups || []).filter((g) => g.formId === f.id).length;
    const ok = window.confirm(
      "ลบฟอร์ม " + f.name + "?\n\n" +
        (used ? "มีกลุ่มเอกสารเลือกฟอร์มนี้อยู่ " + used + " กลุ่ม — จะกลับไปใช้ฟอร์มมาตรฐาน\n" : "") +
        "เอกสารที่พิมพ์ไปแล้วไม่ได้รับผลกระทบ"
    );
    if (!ok) return;

    setBusy(f.id);
    try {
      await inv.removePrintForm(f.id);
      if (form.id === f.id) newForm();
      toast("ลบฟอร์ม " + f.name + " แล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  /** พิมพ์ตัวอย่างออกกระดาษจริง ไว้เช็คขอบและขนาดก่อนใช้งานจริง */
  function printSample() {
    print({
      bare: true,
      body: (
        <TradeDocBody
          inv={SAMPLE_INV}
          company={db.company}
          doc={SAMPLE_DOC}
          items={SAMPLE_ITEMS}
          form={form}
          party={kind.party}
        />
      ),
    });
  }

  if (!inv.formsReady) {
    return <SetupNotice feature="หน้าจอออกแบบฟอร์มพิมพ์" tables={["print_forms"]} />;
  }

  return (
    <div className="stack">
      <Card
        title={editing ? "แก้ไขฟอร์ม" : "ออกแบบฟอร์มใหม่"}
        actions={
          <>
            {editing ? (
              <button className="btn btn-g btn-sm" onClick={newForm}>
                สร้างฟอร์มใหม่
              </button>
            ) : null}
            <button className="btn btn-g btn-sm" onClick={printSample}>
              พิมพ์ตัวอย่าง
            </button>
            <button
              className="btn btn-p btn-sm"
              onClick={save}
              disabled={!!busy || !perm.edit || !!problems.length}
              title={problems.length ? "ยังไม่ครบ: " + problems.join(", ") : ""}
            >
              {busy === "save" ? "กำลังบันทึก…" : "บันทึกฟอร์ม"}
            </button>
          </>
        }
      >
        <p className="muted" style={{ marginTop: 0 }}>
          เลือกชนิดเอกสารก่อน แล้วติ๊กว่าจะเอาส่วนไหนบ้าง ตัวอย่างด้านล่างเปลี่ยนตามทันที
          · ตัวอย่างใช้ตัววาดเดียวกับตอนพิมพ์จริง หน้าตาที่เห็นคือหน้าตาที่จะได้
        </p>

        <div className="form-grid">
          <div className="field">
            <label className="lbl" htmlFor="pf_kind">ชนิดเอกสาร</label>
            <SearchSelect
              id="pf_kind"
              value={kindId}
              onChange={pickKind}
              options={FORM_KINDS.map((k) => ({ value: k.id, label: k.name }))}
            />
            <span className="hint">ฟอร์มผูกกับชนิดเอกสาร ใช้ได้ทุกที่ที่พิมพ์เอกสารชนิดนี้</span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="pf_name">ชื่อฟอร์ม *</label>
            <input
              className="inp"
              id="pf_name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="เช่น ใบกำกับภาษีแบบมีโลโก้"
            />
            <span className="hint">ชื่อที่จะขึ้นให้เลือกตอนสั่งพิมพ์</span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="pf_title">หัวเอกสาร *</label>
            <input
              className="inp"
              id="pf_title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={kind.defTitle}
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="pf_copy">บรรทัดใต้หัวเอกสาร</label>
            <input
              className="inp"
              id="pf_copy"
              value={form.copyLabel}
              onChange={(e) => set("copyLabel", e.target.value)}
              placeholder="เช่น ต้นฉบับ (เอกสารออกเป็นชุด)"
            />
            <span className="hint">ใช้บอกว่าเป็นต้นฉบับหรือสำเนา</span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="pf_paper">ขนาดกระดาษ</label>
            <SearchSelect
              id="pf_paper"
              value={form.paper}
              onChange={(v) => set("paper", v)}
              options={[
                { value: "A4", label: "A4 (มาตรฐาน)" },
                { value: "A5", label: "A5 (ครึ่งแผ่น)" },
              ]}
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="pf_def">ค่าเริ่มต้น</label>
            <label className="chk-line" htmlFor="pf_def">
              <input
                id="pf_def"
                className="chk"
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => set("isDefault", e.target.checked)}
              />
              <span>ใช้ฟอร์มนี้เป็นค่าเริ่มต้นของ{kind.name}</span>
            </label>
            <span className="hint">ตั้งได้ทีละฟอร์มต่อชนิดเอกสาร ตั้งอันใหม่แล้วอันเดิมถูกปลดเอง</span>
          </div>

          <div className="field span2">
            <label className="lbl">ส่วนที่จะแสดงบนเอกสาร</label>
            <div className="pf-toggles">
              {[
                ["showCompany", "ข้อมูลกิจการผู้ออก"],
                ["showLogo", "โลโก้"],
                ["showBarcode", "บาร์โค๊ดเลขที่เอกสาร"],
                ["showTotals", "ตารางสรุปยอดและภาษี"],
                ["showWords", "จำนวนเงินเป็นตัวอักษร"],
                ["showNote", "หมายเหตุของเอกสาร"],
              ].map(([k, label]) => (
                <label className="chk-line" key={k} htmlFor={"pf_" + k}>
                  <input
                    id={"pf_" + k}
                    className="chk"
                    type="checkbox"
                    checked={!!form[k]}
                    onChange={(e) => set(k, e.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <span className="hint">
              ใบกำกับภาษีเต็มรูปแบบต้องมีข้อมูลกิจการผู้ออกตามกฎหมาย ปิดเฉพาะเอกสารภายใน
            </span>
          </div>
        </div>
      </Card>

      <div className="grid g2">
        <Card title="คอลัมน์ในตารางรายการ" actions={<Badge>{form.columns.length} คอลัมน์</Badge>}>
          <p className="muted" style={{ marginTop: 0 }}>
            ติ๊กเพื่อใส่ในเอกสาร · ลำดับในรายการคือลำดับจากซ้ายไปขวาบนกระดาษ
          </p>

          {/* คอลัมน์ที่เลือกแล้ว เรียงลำดับได้ด้วยปุ่มขึ้นลง ไม่ใช้ลากวาง
              เพราะลากวางบนมือถือใช้ยาก และปุ่มขึ้นลงกดพลาดแล้วกดกลับได้ทันที */}
          <ol className="pf-cols">
            {form.columns.map((id, i) => {
              const c = FORM_COLUMNS.find((x) => x.id === id);
              return (
                <li key={id}>
                  <b>{c ? c.name : id}</b>
                  <span className="muted">{c && c.align === "right" ? "ชิดขวา" : "ชิดซ้าย"}</span>
                  <span className="row" style={{ gap: 4 }}>
                    <button
                      className="btn btn-g btn-sm"
                      onClick={() => moveCol(id, -1)}
                      disabled={i === 0}
                      aria-label="เลื่อนขึ้น"
                    >
                      ↑
                    </button>
                    <button
                      className="btn btn-g btn-sm"
                      onClick={() => moveCol(id, 1)}
                      disabled={i === form.columns.length - 1}
                      aria-label="เลื่อนลง"
                    >
                      ↓
                    </button>
                    <button className="btn btn-d btn-sm" onClick={() => toggleCol(id)}>
                      เอาออก
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>

          <label className="lbl" style={{ marginTop: 12 }}>คอลัมน์ที่ยังไม่ได้ใส่</label>
          <div className="pf-toggles">
            {FORM_COLUMNS.filter((c) => !form.columns.includes(c.id)).map((c) => (
              <button key={c.id} className="btn btn-g btn-sm" onClick={() => toggleCol(c.id)}>
                + {c.name}
              </button>
            ))}
            {FORM_COLUMNS.every((c) => form.columns.includes(c.id)) ? (
              <span className="muted">ใส่ครบทุกคอลัมน์แล้ว</span>
            ) : null}
          </div>
        </Card>

        <Card title="ช่องลงนามท้ายเอกสาร" actions={<Badge>{form.signs.length} ช่อง</Badge>}>
          <p className="muted" style={{ marginTop: 0 }}>
            ใส่ได้มากสุด 4 ช่อง มากกว่านั้นจะเบียดกันจนเซ็นไม่ลงบนกระดาษ A4
          </p>

          <ol className="pf-cols">
            {form.signs.map((s, i) => (
              <li key={s + i}>
                <b>{s}</b>
                <span />
                <button className="btn btn-d btn-sm" onClick={() => dropSign(i)}>
                  เอาออก
                </button>
              </li>
            ))}
          </ol>
          {!form.signs.length ? <Empty>ยังไม่มีช่องลงนาม</Empty> : null}

          <label className="lbl" style={{ marginTop: 12 }}>เพิ่มช่องที่ใช้บ่อย</label>
          <div className="pf-toggles">
            {SIGN_PRESETS.filter((s) => !form.signs.includes(s)).map((s) => (
              <button key={s} className="btn btn-g btn-sm" onClick={() => addSign(s)}>
                + {s}
              </button>
            ))}
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label className="lbl" htmlFor="pf_sign">หรือพิมพ์ข้อความเอง</label>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="inp"
                id="pf_sign"
                placeholder="เช่น ผู้ควบคุมคลัง / วันที่"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  addSign(e.target.value.trim());
                  e.target.value = "";
                }}
              />
              <span className="hint" style={{ alignSelf: "center" }}>กด Enter เพื่อเพิ่ม</span>
            </div>
          </div>
        </Card>
      </div>

      {/* ตัวอย่างจริง ใช้ตัววาดเดียวกับตอนพิมพ์ */}
      <Card title="ตัวอย่างเอกสาร" actions={<Badge kind="info">อัปเดตตามที่เลือกทันที</Badge>}>
        <div className="pf-preview">
          <div className={"pf-paper " + (form.paper === "A5" ? "a5" : "a4")}>
            <TradeDocBody
              inv={SAMPLE_INV}
              company={db.company}
              doc={SAMPLE_DOC}
              items={SAMPLE_ITEMS}
              form={form}
              party={kind.party}
            />
          </div>
        </div>
        <p className="muted" style={{ marginBottom: 0, fontSize: 12.5 }}>
          ข้อมูลในตัวอย่างเป็นข้อมูลสมมติ ไม่ได้มาจากเอกสารจริงในระบบ
          · กด “พิมพ์ตัวอย่าง” มุมบนเพื่อลองพิมพ์ลงกระดาษจริงก่อนใช้งาน
        </p>
      </Card>

      <Card
        title={"ฟอร์มของ" + kind.name}
        actions={<Badge kind={list.length ? "info" : "gray"}>{list.length} ฟอร์ม</Badge>}
      >
        {list.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ minWidth: 190 }}>ชื่อฟอร์ม</th>
                <th style={{ minWidth: 200 }}>หัวเอกสาร</th>
                <th style={{ width: 90 }}>กระดาษ</th>
                <th className="num" style={{ width: 100 }}>คอลัมน์</th>
                <th className="num" style={{ width: 100 }}>ช่องลงนาม</th>
                <th style={{ width: 150 }}></th>
              </tr>
            </thead>
            <tbody>
              {list.map((f) => (
                <tr key={f.id}>
                  <td>
                    {f.name}
                    {f.isDefault ? (
                      <>
                        {" "}
                        <Badge kind="ok">ค่าเริ่มต้น</Badge>
                      </>
                    ) : null}
                  </td>
                  <td className="muted">{f.title}</td>
                  <td>{f.paper}</td>
                  <td className="num">{f.columns.length}</td>
                  <td className="num">{f.signs.length}</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <button className="btn btn-o btn-sm" onClick={() => setForm({ ...f })}>
                        แก้ไข
                      </button>
                      <button
                        className="btn btn-d btn-sm"
                        onClick={() => drop(f)}
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
        ) : (
          <Empty>
            ยังไม่มีฟอร์มของเอกสารชนิดนี้ — ระบบจะใช้ฟอร์มมาตรฐานไปก่อน
            ออกแบบด้านบนแล้วกดบันทึกได้เลย
          </Empty>
        )}
        <p className="muted" style={{ marginBottom: 0, fontSize: 12.5 }}>
          เลือกฟอร์มที่จะใช้เป็นค่าเริ่มต้นของแต่ละกลุ่มเอกสารได้ที่เมนู
          <b> การกำหนดกลุ่มเอกสาร</b> · ตอนสั่งพิมพ์ก็ยังเปลี่ยนฟอร์มเฉพาะครั้งนั้นได้
        </p>
      </Card>
    </div>
  );
}
