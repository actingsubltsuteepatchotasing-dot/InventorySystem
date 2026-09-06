"use client";

// หน้าจอกำหนดกลุ่มสินค้า · ยี่ห้อสินค้า · ประเภทสินค้า
//
// รูปแบบเดียวกับหน้ากำหนดพนักงานขาย: มีรหัสกับชื่อ เพิ่ม แก้ไข ลบได้
//
// ทำไมสามมิติรวมอยู่หน้าจอเดียวแล้วสลับด้วยแท็บ ไม่แยกเป็นสามเมนู:
//   ทั้งสามใช้ตารางเดียวกัน หน้าตาเหมือนกันทุกช่อง ต่างกันแค่ความหมาย
//   แยกสามเมนูคือเมนูยาวขึ้นสามรายการเพื่อฟอร์มที่เหมือนกันเป๊ะ
//   และคนที่ตั้งกลุ่มเสร็จมักตั้งยี่ห้อต่อทันที การสลับแท็บเร็วกว่าย้อนไปหาเมนูใหม่
//
// สิ่งที่บันทึกลงในตัวสินค้าคือ "ชื่อ" ไม่ใช่รหัส (ดูเหตุผลใน lib/productTerms.js)
// หน้านี้จึงกันชื่อซ้ำในมิติเดียวกันด้วย ไม่ใช่กันแค่รหัสซ้ำ

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import {
  CODE_MAX,
  NAME_MAX,
  TERM_DIMS,
  dimOf,
  problemsOf,
  termsOf,
  unregistered,
  usedBy,
} from "@/lib/productTerms";
import { num, thDateTime, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { Badge, Card, Empty, ExportPair, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

const BLANK = { id: "", code: "", name: "", note: "", active: true };

export default function ProductTerms() {
  const inv = useInv();
  const perm = inv.perm("terms");
  const { db } = inv;
  const toast = useToast();
  const { user } = useAuth();

  const [tab, setTab] = useState(TERM_DIMS[0].id);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState("");

  const d = dimOf(tab);
  const list = useMemo(() => termsOf(db, tab), [db, tab]);
  const loose = useMemo(() => unregistered(db, tab), [db, tab]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const problems = problemsOf(form, list);
  const editing = !!form.id;

  /** สลับแท็บแล้วล้างฟอร์ม ไม่งั้นค่าที่กรอกค้างจะถูกบันทึกลงมิติผิด */
  function goTab(id) {
    setTab(id);
    setForm(BLANK);
  }

  async function save() {
    if (busy) return;
    if (problems.length) return toast("ยังกรอกไม่ครบ: " + problems.join(" · "), "err");

    const t = {
      ...form,
      id: form.id || uid(),
      dim: d.dim,
      code: form.code.trim(),
      name: form.name.trim(),
      note: (form.note || "").trim(),
      user: user && user.email ? user.email : "",
      ts: Date.now(),
    };

    setBusy("save");
    try {
      await inv.saveProductTerm(t);
      toast("บันทึก" + d.name + " " + t.code + " " + t.name + " แล้ว", "ok");
      setForm(BLANK);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  async function drop(t) {
    if (busy) return;
    const used = usedBy(db, tab, t.name);

    const ok = window.confirm(
      "ลบ" + d.name + " " + t.code + " " + t.name + " ออกจากทะเบียน?\n\n" +
        (used
          ? "มีสินค้าใช้ชื่อนี้อยู่ " + used + " รายการ — สินค้าจะยังมีค่าเดิมครบ\n" +
            "เพราะสินค้าเก็บชื่อไว้ในตัวเอง ไม่ได้อ้างถึงทะเบียน\n" +
            "แต่ค่านั้นจะกลายเป็น “ยังไม่ได้จดทะเบียน” ในช่องเลือก\n"
          : "") +
        "\nถ้าแค่เลิกใช้ แนะนำให้ปิดใช้งานแทนการลบ"
    );
    if (!ok) return;

    setBusy(t.id);
    try {
      await inv.removeProductTerm(t.id);
      if (form.id === t.id) setForm(BLANK);
      toast("ลบ" + d.name + " " + t.code + " แล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  /** จดทะเบียนค่าที่สินค้าใช้อยู่แล้วให้เร็ว ๆ โดยไม่ต้องพิมพ์ชื่อซ้ำ */
  function fillFrom(name) {
    setForm({ ...BLANK, name });
    toast("ใส่ชื่อให้แล้ว — กรอกรหัสแล้วกดบันทึกได้เลย", "ok");
  }

  const HEAD = ["รหัส", "ชื่อ" + d.name, "สถานะ", "จำนวนสินค้า", "หมายเหตุ"];
  const rows = () =>
    list.map((t) => [
      t.code,
      t.name,
      t.active ? "ใช้งาน" : "ปิดใช้งาน",
      usedBy(db, tab, t.name),
      t.note,
    ]);

  if (!inv.termsReady) {
    return <SetupNotice feature="หน้าจอกำหนดกลุ่ม ยี่ห้อ ประเภทสินค้า" tables={["product_terms"]} />;
  }

  return (
    <div className="stack">
      <div className="cs-tabs">
        {TERM_DIMS.map((x) => (
          <button
            key={x.id}
            className={"cs-tab" + (x.id === tab ? " on" : "")}
            onClick={() => goTab(x.id)}
          >
            {x.name}
            <b>{termsOf(db, x.id).length}</b>
          </button>
        ))}
      </div>

      <Card
        title={(editing ? "แก้ไข" : "เพิ่ม") + d.name}
        actions={
          <>
            {editing ? (
              <button className="btn btn-g btn-sm" onClick={() => setForm(BLANK)}>
                เพิ่มรายการใหม่
              </button>
            ) : null}
            <button
              className="btn btn-p btn-sm"
              onClick={save}
              disabled={!!busy || !perm.edit || !!problems.length}
              title={problems.length ? "ยังกรอกไม่ครบ: " + problems.join(", ") : ""}
            >
              {busy === "save" ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field">
            <label className="lbl" htmlFor="pt_code">รหัส{d.name} *</label>
            <input
              className="inp"
              id="pt_code"
              maxLength={CODE_MAX}
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="เช่น B01"
            />
            <span className="hint">
              ไม่เกิน {CODE_MAX} ตัวอักษร · ห้ามซ้ำใน{d.name} · ใช้ {num(form.code.length, 0)} แล้ว
            </span>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="pt_name">ชื่อ{d.name} *</label>
            <input
              className="inp"
              id="pt_name"
              maxLength={NAME_MAX}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={"เช่น " + d.sample}
            />
            <span className="hint">
              ชื่อนี้คือค่าที่จะถูกบันทึกลงในตัวสินค้า · ห้ามซ้ำ · ใช้ {num(form.name.length, 0)} แล้ว
            </span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="pt_act">สถานะ</label>
            <label className="chk-line" htmlFor="pt_act">
              <input
                id="pt_act"
                className="chk"
                type="checkbox"
                checked={form.active}
                onChange={(e) => set("active", e.target.checked)}
              />
              <span>ใช้งานอยู่</span>
            </label>
            <span className="hint">เลิกใช้แล้วให้ปิดใช้งานแทนการลบ ของเก่าจะได้ยังอยู่ครบ</span>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="pt_note">หมายเหตุ</label>
            <input
              className="inp"
              id="pt_note"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="เช่น ใช้กับสินค้านำเข้าเท่านั้น"
            />
          </div>
        </div>
      </Card>

      {loose.length ? (
        <Card title={"ค่าที่สินค้าใช้อยู่แต่ยังไม่ได้จดทะเบียน (" + loose.length + ")"}>
          <p className="muted" style={{ marginTop: 0 }}>
            ค่าพวกนี้ถูกพิมพ์ไว้ในตัวสินค้าก่อนมีหน้าจอนี้ ยังเลือกใช้ได้ตามปกติ
            แต่ยังไม่มีรหัสประจำตัว กดเพื่อใส่ชื่อลงในฟอร์มด้านบน แล้วกรอกรหัสให้เรียบร้อย
          </p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {loose.map((v) => (
              <button
                key={v}
                className="btn btn-o btn-sm"
                onClick={() => fillFrom(v)}
                disabled={!perm.edit}
                title={"จดทะเบียน " + v}
              >
                {v}
                <span className="muted"> · {num(usedBy(db, tab, v), 0)} รายการ</span>
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      <Card
        title={"ทะเบียน" + d.name}
        actions={
          <>
            <Badge kind={list.length ? "info" : "gray"}>{list.length} รายการ</Badge>
            <ExportPair
              onExport={(save2) => save2(HEAD, rows(), d.name + ".csv")}
              disabled={!list.length}
              toast={toast}
            />
          </>
        }
      >
        {list.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 150 }}>รหัส</th>
                <th style={{ minWidth: 220 }}>ชื่อ{d.name}</th>
                <th style={{ width: 120 }}>สถานะ</th>
                <th className="num" style={{ width: 120 }}>สินค้าที่ใช้</th>
                <th style={{ minWidth: 160 }}>หมายเหตุ</th>
                <th style={{ width: 150 }}></th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className={t.active ? "" : "perm-off"}>
                  <td className="code-cell">{t.code}</td>
                  <td>{t.name}</td>
                  <td>
                    <Badge kind={t.active ? "ok" : "gray"}>
                      {t.active ? "ใช้งาน" : "ปิดใช้งาน"}
                    </Badge>
                  </td>
                  <td className="num">{num(usedBy(db, tab, t.name), 0)}</td>
                  <td className="muted">{t.note || "—"}</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <button
                        className="btn btn-o btn-sm"
                        onClick={() => setForm({ ...t })}
                        disabled={!perm.edit}
                      >
                        แก้ไข
                      </button>
                      <button
                        className="btn btn-d btn-sm"
                        onClick={() => drop(t)}
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
          <Empty>ยังไม่มี{d.name}ในทะเบียน — กรอกด้านบนแล้วกดบันทึกได้เลย</Empty>
        )}
        <p className="muted" style={{ marginBottom: 0, fontSize: 12.5 }}>
          {d.hint} · เลือกใช้ได้ที่หน้า <b>ข้อมูลสินค้า</b> ตอนเพิ่มหรือแก้ไขสินค้า
          {list.length ? " · แก้ไขล่าสุด " + thDateTime(Math.max(...list.map((t) => t.ts))) : ""}
        </p>
      </Card>
    </div>
  );
}
