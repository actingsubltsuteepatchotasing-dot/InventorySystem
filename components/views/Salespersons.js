"use client";

// หน้าจอกำหนดพนักงานขาย
//
// ใช้ผูกกับใบขายและกับลูกค้า เพื่อดูยอดขายรายคนและตั้งเป้าขายรายคน
//
// ความยาวจำกัดตามที่ตกลงไว้: รหัสไม่เกิน 50 ตัวอักษร ชื่อไม่เกิน 200
//   บังคับทั้งที่หน้าจอและที่ฐานข้อมูล ไม่ใช่บังคับแค่ที่เดียว
//   เพราะข้อมูลเข้ามาได้หลายทาง (หน้าจอนี้ · นำเข้าจาก Excel · กู้คืนไฟล์สำรอง)
//   บังคับแค่หน้าจอเดียว ทางอื่นจะเล็ดลอดเข้ามาได้
//
// พนักงานที่ลาออกให้ปิดใช้งานแทนการลบ
//   ลบแล้วใบขายเก่ายังเก็บรหัสและชื่อไว้ในตัวเอกสารก็จริง แต่เป้าขายของคนนั้นจะหายไปด้วย
//   (เป้าผูกกับรหัสพนักงานแบบ cascade) และรายงานย้อนหลังจะเทียบเป้าไม่ได้อีก
//   ปิดใช้งานแล้วจะไม่ขึ้นในช่องเลือกที่หน้าขาย แต่ของเก่ายังอยู่ครบ

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { num, thDateTime, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { Badge, Card, Empty, ExportPair, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

/** ความยาวสูงสุดที่ฐานข้อมูลยอมรับ — ต้องตรงกับ constraint ใน schema.sql */
export const CODE_MAX = 50;
export const NAME_MAX = 200;

const BLANK = { id: "", code: "", name: "", phone: "", note: "", active: true };

/**
 * ตรวจว่ากรอกครบและอยู่ในความยาวที่กำหนดหรือยัง
 * @param {object} p ค่าที่กรอก
 * @param {Array} list พนักงานทั้งหมด ใช้เช็ครหัสซ้ำ
 */
export function problemsOf(p, list) {
  const out = [];
  const code = String(p.code || "").trim();
  const name = String(p.name || "").trim();

  if (!code) out.push("รหัสพนักงานขาย");
  else if (code.length > CODE_MAX) out.push("รหัสยาวเกิน " + CODE_MAX + " ตัวอักษร");
  else if (
    (list || []).some((x) => x.id !== p.id && x.code.toLowerCase() === code.toLowerCase())
  ) {
    out.push("รหัสนี้มีอยู่แล้ว");
  }

  if (!name) out.push("ชื่อพนักงานขาย");
  else if (name.length > NAME_MAX) out.push("ชื่อยาวเกิน " + NAME_MAX + " ตัวอักษร");

  return out;
}

export default function Salespersons() {
  const inv = useInv();
  const perm = inv.perm("salespersons");
  const { db } = inv;
  const toast = useToast();
  const { user } = useAuth();

  const list = useMemo(
    () => (db.salespersons || []).slice().sort((a, b) => a.code.localeCompare(b.code, "th")),
    [db.salespersons]
  );

  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const problems = problemsOf(form, list);
  const editing = !!form.id;

  /** จำนวนใบขายที่ผูกกับพนักงานคนนี้ ใช้เตือนก่อนลบ */
  const usedBy = (id) => (db.invoices || []).filter((v) => v.salesId === id).length;

  async function save() {
    if (busy) return;
    if (problems.length) return toast("ยังกรอกไม่ครบ: " + problems.join(" · "), "err");

    const p = {
      ...form,
      id: form.id || uid(),
      code: form.code.trim(),
      name: form.name.trim(),
      phone: form.phone.trim(),
      note: form.note.trim(),
      user: user && user.email ? user.email : "",
      ts: Date.now(),
    };

    setBusy("save");
    try {
      await inv.saveSalesperson(p);
      toast("บันทึกพนักงานขาย " + p.code + " " + p.name + " แล้ว", "ok");
      setForm(BLANK);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  async function drop(p) {
    if (busy) return;
    const used = usedBy(p.id);
    const targets = (db.salesTargets || []).filter((t) => t.salesId === p.id).length;

    const ok = window.confirm(
      "ลบพนักงานขาย " + p.code + " " + p.name + " ออกจากระบบ?\n\n" +
        (used ? "มีใบขายอ้างถึงอยู่ " + used + " ใบ — ใบเก่ายังเก็บรหัสและชื่อไว้ในตัวเอกสาร\n" : "") +
        (targets ? "เป้าขายของคนนี้ " + targets + " รายการจะถูกลบไปด้วย\n" : "") +
        "\nถ้าแค่ลาออก แนะนำให้ปิดใช้งานแทนการลบ"
    );
    if (!ok) return;

    setBusy(p.id);
    try {
      await inv.removeSalesperson(p.id);
      if (form.id === p.id) setForm(BLANK);
      toast("ลบพนักงานขาย " + p.code + " แล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  const HEAD = ["รหัสพนักงานขาย", "ชื่อพนักงานขาย", "เบอร์โทร", "สถานะ", "จำนวนใบขาย", "หมายเหตุ"];
  const rows = () =>
    list.map((p) => [
      p.code,
      p.name,
      p.phone,
      p.active ? "ใช้งาน" : "ปิดใช้งาน",
      usedBy(p.id),
      p.note,
    ]);

  if (!inv.salespersonsReady) {
    return <SetupNotice feature="หน้าจอกำหนดพนักงานขาย" tables={["salespersons"]} />;
  }

  return (
    <div className="stack">
      <Card
        title={editing ? "แก้ไขพนักงานขาย" : "เพิ่มพนักงานขาย"}
        actions={
          <>
            {editing ? (
              <button className="btn btn-g btn-sm" onClick={() => setForm(BLANK)}>
                เพิ่มคนใหม่
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
            <label className="lbl" htmlFor="sp_code">รหัสพนักงานขาย *</label>
            <input
              className="inp"
              id="sp_code"
              maxLength={CODE_MAX}
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="เช่น SP001"
            />
            <span className="hint">
              ไม่เกิน {CODE_MAX} ตัวอักษร · ห้ามซ้ำ · ใช้ {num(form.code.length, 0)} แล้ว
            </span>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="sp_name">ชื่อพนักงานขาย *</label>
            <input
              className="inp"
              id="sp_name"
              maxLength={NAME_MAX}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="เช่น สมชาย ใจดี"
            />
            <span className="hint">
              ไม่เกิน {NAME_MAX} ตัวอักษร · ใช้ {num(form.name.length, 0)} แล้ว
            </span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="sp_phone">เบอร์โทร</label>
            <input
              className="inp"
              id="sp_phone"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="sp_act">สถานะ</label>
            <label className="chk-line" htmlFor="sp_act">
              <input
                id="sp_act"
                className="chk"
                type="checkbox"
                checked={form.active}
                onChange={(e) => set("active", e.target.checked)}
              />
              <span>ใช้งานอยู่ (ขึ้นให้เลือกที่หน้าขาย)</span>
            </label>
            <span className="hint">ลาออกแล้วให้ปิดใช้งานแทนการลบ ของเก่าจะได้ยังอยู่ครบ</span>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="sp_note">หมายเหตุ</label>
            <input
              className="inp"
              id="sp_note"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="เช่น ดูแลเขตภาคอีสาน"
            />
          </div>
        </div>
      </Card>

      <Card
        title="รายชื่อพนักงานขาย"
        actions={
          <>
            <Badge kind={list.length ? "info" : "gray"}>{list.length} คน</Badge>
            <ExportPair
              onExport={(save2) => save2(HEAD, rows(), "พนักงานขาย.csv")}
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
                <th style={{ minWidth: 200 }}>ชื่อพนักงานขาย</th>
                <th style={{ minWidth: 130 }}>เบอร์โทร</th>
                <th style={{ width: 120 }}>สถานะ</th>
                <th className="num" style={{ width: 110 }}>ใบขาย</th>
                <th style={{ minWidth: 160 }}>หมายเหตุ</th>
                <th style={{ width: 150 }}></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={p.active ? "" : "perm-off"}>
                  <td className="code-cell">{p.code}</td>
                  <td>{p.name}</td>
                  <td>{p.phone || "—"}</td>
                  <td>
                    <Badge kind={p.active ? "ok" : "gray"}>
                      {p.active ? "ใช้งาน" : "ปิดใช้งาน"}
                    </Badge>
                  </td>
                  <td className="num">{num(usedBy(p.id), 0)}</td>
                  <td className="muted">{p.note || "—"}</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <button
                        className="btn btn-o btn-sm"
                        onClick={() => setForm({ ...p })}
                        disabled={!perm.edit}
                      >
                        แก้ไข
                      </button>
                      <button
                        className="btn btn-d btn-sm"
                        onClick={() => drop(p)}
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
          <Empty>ยังไม่มีพนักงานขาย — กรอกด้านบนแล้วกดบันทึกได้เลย</Empty>
        )}
        <p className="muted" style={{ marginBottom: 0, fontSize: 12.5 }}>
          รหัสพนักงานขายเลือกได้ที่หน้า <b>ขายสินค้าและบริการ</b> และตั้งเป็นคนประจำของลูกค้าได้ที่
          <b> รายละเอียดลูกค้า</b> · ใช้ตั้งเป้าขายรายคนได้ที่ <b>กำหนดเป้าขาย</b>
          {list.length ? " · แก้ไขล่าสุด " + thDateTime(Math.max(...list.map((p) => p.ts))) : ""}
        </p>
      </Card>
    </div>
  );
}
