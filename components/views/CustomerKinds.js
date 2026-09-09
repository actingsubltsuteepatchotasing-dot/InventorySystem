"use client";

// หน้าจอกำหนดประเภทลูกค้า
//
// รูปแบบเดียวกับหน้ากำหนดพนักงานขายและทะเบียนกลุ่ม/ยี่ห้อ/ประเภทสินค้า: รหัส + ชื่อ
//
// เดิมประเภทลูกค้าเป็นรายการตายตัว 5 ค่าในโค้ด เพิ่มประเภทใหม่ต้องรอ deploy
// ซึ่งไม่สมเหตุสมผล เพราะเป็นเรื่องของกิจการ ไม่ใช่ของโปรแกรม
// ค่าเดิมทั้งห้ายังใช้ได้ตามปกติ และมีปุ่มเติมเข้าทะเบียนให้ในคลิกเดียว
//
// ลบประเภทแล้วลูกค้าไม่ถูกแตะ เพราะลูกค้าเก็บชื่อประเภทเป็นข้อความของตัวเอง
// ใบขายเก่าที่คัดลอกค่าไว้ก็ไม่เปลี่ยนตาม (ดูเหตุผลใน lib/customerKinds.js)

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { CUSTOMER_KINDS } from "@/lib/constants";
import {
  CODE_MAX,
  NAME_MAX,
  kindsOf,
  problemsOf,
  unregistered,
  usedBy,
} from "@/lib/customerKinds";
import { num, thDateTime, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { Badge, Card, Empty, ExportPair, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

const BLANK = { id: "", code: "", name: "", note: "", active: true };

/** รหัสถัดไปแบบ CT01 — นับจากรหัสที่มีอยู่จริง ไม่เก็บตัวนับไว้ที่ไหน */
export function nextKindCode(list) {
  const nums = (list || [])
    .map((k) => /^CT(\d+)$/i.exec(String(k.code || "")))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return "CT" + String(next).padStart(2, "0");
}

export default function CustomerKinds() {
  const inv = useInv();
  const perm = inv.perm("custkinds");
  const { db } = inv;
  const toast = useToast();
  const { user } = useAuth();

  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState("");

  const list = useMemo(() => kindsOf(db), [db]);
  const loose = useMemo(() => unregistered(db), [db]);

  /** ค่าตั้งต้นเดิมของระบบที่ยังไม่มีในทะเบียน — กดเติมได้ทีเดียวทั้งชุด */
  const suggest = useMemo(
    () => CUSTOMER_KINDS.filter((n) => !list.some((k) => k.name === n) && !loose.includes(n)),
    [list, loose]
  );

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const problems = problemsOf(form, list);
  const editing = !!form.id;

  const stamp = () => ({ user: user && user.email ? user.email : "", ts: Date.now() });

  async function save() {
    if (busy) return;
    if (problems.length) return toast("ยังกรอกไม่ครบ: " + problems.join(" · "), "err");

    const k = {
      ...form,
      id: form.id || uid(),
      code: form.code.trim(),
      name: form.name.trim(),
      note: (form.note || "").trim(),
      ...stamp(),
    };

    setBusy("save");
    try {
      await inv.saveCustomerKind(k);
      toast("บันทึกประเภทลูกค้า " + k.code + " " + k.name + " แล้ว", "ok");
      setForm(BLANK);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  async function drop(k) {
    if (busy) return;
    const used = usedBy(db, k.name);

    const ok = window.confirm(
      "ลบประเภทลูกค้า " + k.code + " " + k.name + " ออกจากทะเบียน?\n\n" +
        (used
          ? "มีลูกค้าเป็นประเภทนี้อยู่ " + used + " ราย — ข้อมูลลูกค้าจะยังมีค่าเดิมครบ\n" +
            "เพราะลูกค้าเก็บชื่อประเภทไว้ในตัวเอง ไม่ได้อ้างถึงทะเบียน\n" +
            "และใบขายเก่าที่คัดลอกค่าไว้ก็ไม่เปลี่ยนตาม\n"
          : "") +
        "\nถ้าแค่เลิกใช้ แนะนำให้ปิดใช้งานแทนการลบ"
    );
    if (!ok) return;

    setBusy(k.id);
    try {
      await inv.removeCustomerKind(k.id);
      if (form.id === k.id) setForm(BLANK);
      toast("ลบประเภทลูกค้า " + k.code + " แล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  /** เติมชื่อที่มีอยู่แล้วลงฟอร์ม เหลือแค่กรอกรหัส */
  function fillFrom(name) {
    setForm({ ...BLANK, code: nextKindCode(list), name });
    toast("ใส่รหัสและชื่อให้แล้ว — ตรวจแล้วกดบันทึกได้เลย", "ok");
  }

  /** เติมค่าตั้งต้นเดิมของระบบทั้งชุดในครั้งเดียว */
  async function addSuggested() {
    if (busy) return;
    if (!window.confirm("เพิ่ม " + suggest.length + " ประเภทมาตรฐานเข้าทะเบียน?")) return;

    setBusy("seed");
    try {
      let n = list.length;
      for (const name of suggest) {
        n += 1;
        await inv.saveCustomerKind({
          id: uid(),
          code: "CT" + String(n).padStart(2, "0"),
          name,
          note: "",
          active: true,
          ...stamp(),
        });
      }
      toast("เพิ่มประเภทมาตรฐาน " + suggest.length + " รายการแล้ว", "ok");
    } catch (e) {
      toast("เพิ่มไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  const HEAD = ["รหัส", "ชื่อประเภทลูกค้า", "สถานะ", "จำนวนลูกค้า", "หมายเหตุ"];
  const rows = () =>
    list.map((k) => [
      k.code,
      k.name,
      k.active ? "ใช้งาน" : "ปิดใช้งาน",
      usedBy(db, k.name),
      k.note,
    ]);

  if (!inv.custKindsReady) {
    return <SetupNotice feature="หน้าจอกำหนดประเภทลูกค้า" tables={["customer_kinds"]} />;
  }

  return (
    <div className="stack">
      <Card
        title={editing ? "แก้ไขประเภทลูกค้า" : "เพิ่มประเภทลูกค้า"}
        actions={
          <>
            <button
              className="btn btn-g btn-sm"
              onClick={() => setForm({ ...BLANK, code: nextKindCode(list) })}
              disabled={!perm.edit}
            >
              รายการใหม่
            </button>
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
            <label className="lbl" htmlFor="ck_code">รหัสประเภทลูกค้า *</label>
            <input
              className="inp"
              id="ck_code"
              maxLength={CODE_MAX}
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="เช่น CT01"
            />
            <span className="hint">
              ไม่เกิน {CODE_MAX} ตัวอักษร · ห้ามซ้ำ · ใช้ {num(form.code.length, 0)} แล้ว
            </span>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="ck_name">ชื่อประเภทลูกค้า *</label>
            <input
              className="inp"
              id="ck_name"
              maxLength={NAME_MAX}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="เช่น ตัวแทนจำหน่าย"
            />
            <span className="hint">
              ชื่อนี้คือค่าที่จะถูกบันทึกลงในข้อมูลลูกค้าและคัดลอกไปในใบขาย · ห้ามซ้ำ
            </span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ck_act">สถานะ</label>
            <label className="chk-line" htmlFor="ck_act">
              <input
                id="ck_act"
                className="chk"
                type="checkbox"
                checked={form.active}
                onChange={(e) => set("active", e.target.checked)}
              />
              <span>ใช้งานอยู่ (ขึ้นให้เลือกที่หน้ารายละเอียดลูกค้า)</span>
            </label>
            <span className="hint">เลิกใช้แล้วให้ปิดใช้งานแทนการลบ ลูกค้าเก่าจะได้ยังอ่านออก</span>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="ck_note">หมายเหตุ</label>
            <input
              className="inp"
              id="ck_note"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="เช่น ได้ส่วนลดพิเศษ 5% ทุกใบ"
            />
          </div>
        </div>
      </Card>

      {suggest.length ? (
        <Card title={"ประเภทมาตรฐานที่ยังไม่ได้อยู่ในทะเบียน (" + suggest.length + ")"}>
          <p className="muted" style={{ marginTop: 0 }}>
            ค่าชุดนี้คือประเภทที่ระบบเคยมีให้เลือกไว้ตั้งแต่ต้น กดเพิ่มเข้าทะเบียนทีเดียวได้เลย
            หรือกดทีละอันเพื่อแก้ชื่อก่อนบันทึก
          </p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn btn-p btn-sm"
              onClick={addSuggested}
              disabled={!!busy || !perm.edit}
            >
              {busy === "seed" ? "กำลังเพิ่ม…" : "เพิ่มทั้งหมด " + suggest.length + " รายการ"}
            </button>
            {suggest.map((n) => (
              <button
                key={n}
                className="btn btn-o btn-sm"
                onClick={() => fillFrom(n)}
                disabled={!perm.edit}
              >
                {n}
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      {loose.length ? (
        <Card title={"ค่าที่ลูกค้าใช้อยู่แต่ยังไม่ได้จดทะเบียน (" + loose.length + ")"}>
          <p className="muted" style={{ marginTop: 0 }}>
            ค่าพวกนี้ถูกบันทึกไว้ในข้อมูลลูกค้าก่อนมีหน้าจอนี้ ยังเลือกใช้ได้ตามปกติ
            แต่ยังไม่มีรหัสประจำตัว กดเพื่อใส่ลงฟอร์มด้านบนแล้วบันทึกให้เรียบร้อย
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
                <span className="muted"> · {num(usedBy(db, v), 0)} ราย</span>
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      <Card
        title="ทะเบียนประเภทลูกค้า"
        actions={
          <>
            <Badge kind={list.length ? "info" : "gray"}>{list.length} ประเภท</Badge>
            <ExportPair
              onExport={(save2) => save2(HEAD, rows(), "ประเภทลูกค้า.csv")}
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
                <th style={{ width: 120 }}>รหัส</th>
                <th style={{ minWidth: 220 }}>ชื่อประเภทลูกค้า</th>
                <th style={{ width: 120 }}>สถานะ</th>
                <th className="num" style={{ width: 120 }}>จำนวนลูกค้า</th>
                <th style={{ minWidth: 180 }}>หมายเหตุ</th>
                <th style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {list.map((k) => (
                <tr key={k.id} className={k.active ? "" : "perm-off"}>
                  <td className="code-cell">{k.code}</td>
                  <td>{k.name}</td>
                  <td>
                    <Badge kind={k.active ? "ok" : "gray"}>
                      {k.active ? "ใช้งาน" : "ปิดใช้งาน"}
                    </Badge>
                  </td>
                  <td className="num">{num(usedBy(db, k.name), 0)}</td>
                  <td className="muted">{k.note || "—"}</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <button
                        className="btn btn-o btn-sm"
                        onClick={() => setForm({ ...k })}
                        disabled={!perm.edit}
                      >
                        แก้ไข
                      </button>
                      <button
                        className="btn btn-d btn-sm"
                        onClick={() => drop(k)}
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
          <Empty>ยังไม่มีประเภทลูกค้าในทะเบียน — กรอกด้านบนหรือกดเพิ่มประเภทมาตรฐานได้เลย</Empty>
        )}
        <p className="muted" style={{ marginBottom: 0, fontSize: 12.5 }}>
          เลือกใช้ได้ที่หน้า <b>รายละเอียดลูกค้า</b> · ใบขายจะคัดลอกประเภท ณ วันที่ออกเอกสาร
          เก็บไว้ในตัวใบด้วย รายงานย้อนหลังจึงไม่เปลี่ยนตามเมื่อมีคนแก้ประเภทของลูกค้าทีหลัง
          {list.length ? " · แก้ไขล่าสุด " + thDateTime(Math.max(...list.map((k) => k.ts))) : ""}
        </p>
      </Card>
    </div>
  );
}
