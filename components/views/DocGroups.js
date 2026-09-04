"use client";

// หน้าจอกำหนดกลุ่มเอกสาร — ตั้งรูปแบบเลขที่เอกสารแบบรันนิ่งของแต่ละหน้าจอทำรายการ
//
// ตารางนี้เก็บเฉพาะ "รูปแบบ" ไม่เก็บตัวนับ เลขถัดไปยังหาจากเอกสารที่มีอยู่จริงเสมอ
// (ดู nextDocNo ใน lib/db.js) เพราะฐานข้อมูลใช้ร่วมกันหลายเครื่อง
// ถ้าเก็บตัวนับไว้แล้วสองเครื่องอ่านพร้อมกัน จะได้เลขซ้ำกัน

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { DOC_PERIODS, SEED_DOC_GROUPS, TYPES } from "@/lib/constants";
import { docPrefixOf, docSample, nextDocNo } from "@/lib/db";
import { num, todayISO } from "@/lib/format";
import { useToast } from "../Toast";
import { Badge, Card, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

const periodName = (id) => (DOC_PERIODS.find((p) => p.id === id) || DOC_PERIODS[2]).name;

export default function DocGroups() {
  const inv = useInv();
  const { db } = inv;
  const toast = useToast();

  const [editing, setEditing] = useState(null); // id ของกลุ่มที่กำลังแก้
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const today = todayISO();

  /**
   * รายการที่แสดง = ทุกชนิดรายการที่ระบบมี
   *
   * ตั้งใจไม่ให้เพิ่ม/ลบกลุ่มเองได้ เพราะกลุ่มต้องผูกกับหน้าจอทำรายการหนึ่งต่อหนึ่ง
   * กลุ่มที่ไม่มีหน้าจอใช้ก็ไม่มีประโยชน์ ส่วนหน้าจอที่ไม่มีกลุ่มจะออกเลขไม่ได้
   * ชนิดที่ยังไม่เคยบันทึกจะโชว์ค่าเริ่มต้นเดิมของระบบ พร้อมป้ายว่ายังไม่ได้ตั้งค่า
   */
  const rows = useMemo(
    () =>
      Object.keys(TYPES).map((type) => {
        const saved = (db.docGroups || []).find((g) => g.id === type);
        const base = saved || SEED_DOC_GROUPS.find((g) => g.id === type);
        const group = { ...base, id: type };
        return {
          type,
          group,
          saved: !!saved,
          used: db.txns.filter((t) => t.type === type && t.docNo).length,
          next: nextDocNo(db, type, today),
        };
      }),
    [db, today]
  );

  function startEdit(r) {
    setEditing(r.type);
    setForm({ ...r.group, name: r.group.name || TYPES[r.type].name });
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  /** ตรวจก่อนบันทึก คืนข้อความผิดพลาด หรือ "" ถ้าผ่าน */
  function validate() {
    const prefix = String(form.prefix || "").trim();
    if (!prefix) return "กรุณากรอกอักษรนำหน้า";
    // อนุญาตแค่ A-Z 0-9 เพราะเลขที่เอกสารถูกเอาไปใส่ในชื่อไฟล์และ URL ด้วย
    if (!/^[A-Z0-9]{1,6}$/.test(prefix)) {
      return "อักษรนำหน้าใช้ได้เฉพาะ A-Z และ 0-9 ยาวไม่เกิน 6 ตัว";
    }
    const digits = Number(form.digits);
    if (!Number.isInteger(digits) || digits < 2 || digits > 8) {
      return "จำนวนหลักต้องอยู่ระหว่าง 2 ถึง 8";
    }
    // อักษรนำหน้าซ้ำกับกลุ่มอื่นที่ใช้รอบเดียวกัน จะทำให้สองชนิดรายการ
    // นับเลขปนกัน แล้วเลขจะกระโดดข้ามโดยไม่มีสาเหตุที่มองเห็น
    const clash = rows.find(
      (r) =>
        r.type !== editing &&
        String(r.group.prefix).toUpperCase() === prefix &&
        r.group.period === form.period
    );
    if (clash) {
      return "อักษรนำหน้า " + prefix + " ซ้ำกับกลุ่ม " + TYPES[clash.type].name + " ที่ใช้รอบเดียวกัน";
    }
    return "";
  }

  async function save() {
    if (busy) return;
    const err = validate();
    if (err) return toast(err, "err");

    const next = {
      id: editing,
      name: String(form.name || "").trim() || TYPES[editing].name,
      prefix: String(form.prefix).trim().toUpperCase(),
      period: form.period,
      digits: Number(form.digits),
    };

    const before = rows.find((r) => r.type === editing);
    const changed =
      docPrefixOf(before.group, today) !== docPrefixOf(next, today) ||
      before.group.digits !== next.digits;

    /*
     * เปลี่ยนรูปแบบแล้วเลขจะเริ่มนับหนึ่งใหม่
     *
     * ไม่ใช่บั๊ก แต่เป็นผลโดยตรงจากวิธีนับ: เลขถัดไปดูจากเอกสารที่ขึ้นต้นด้วย
     * prefix เดียวกันเท่านั้น พอ prefix เปลี่ยน เอกสารเก่าก็ไม่ถูกนับด้วย
     * ต้องบอกให้รู้ก่อน เพราะบางที่นับเลขเอกสารต่อเนื่องเป็นเรื่องของการตรวจสอบ
     */
    if (changed && before.used > 0) {
      const ok = window.confirm(
        "กลุ่มนี้มีเอกสารอยู่แล้ว " + num(before.used, 0) + " ฉบับ\n\n" +
          "เมื่อเปลี่ยนรูปแบบ เอกสารใหม่จะเริ่มนับหนึ่งใหม่ในชุดเลขชุดใหม่ " +
          "(เอกสารเดิมไม่ถูกแก้ไข ยังค้นหาได้ตามปกติ)\n\n" +
          "เลขถัดไปจะเป็น " + docSample(next, today) + "\n\nยืนยันการเปลี่ยน?"
      );
      if (!ok) return;
    }

    setBusy(true);
    try {
      await inv.saveDocGroup(next);
      toast("บันทึกกลุ่มเอกสาร " + next.name + " แล้ว", "ok");
      setEditing(null);
      setForm(null);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (!inv.docGroupsReady) {
    return <SetupNotice feature="การกำหนดกลุ่มเอกสาร" tables={["doc_groups"]} />;
  }

  return (
    <div className="stack">
      <Card
        title="การกำหนดกลุ่มเอกสาร"
        actions={<Badge kind="info">{rows.filter((r) => r.saved).length} / {rows.length} ตั้งค่าแล้ว</Badge>}
      >
        <p className="muted" style={{ marginTop: 0 }}>
          กำหนดรูปแบบเลขที่เอกสารของแต่ละหน้าจอทำรายการ เลขจะรันต่อเนื่องให้อัตโนมัติ
          โดยนับจากเอกสารที่บันทึกไว้จริง จึงไม่ซ้ำกันแม้ทำรายการพร้อมกันหลายเครื่อง
        </p>

        <TableWrap>
          <thead>
            <tr>
              <th style={{ minWidth: 150 }}>หน้าจอ</th>
              <th style={{ minWidth: 150 }}>ชื่อกลุ่มเอกสาร</th>
              <th style={{ width: 120 }}>อักษรนำหน้า</th>
              <th style={{ minWidth: 140 }}>การขึ้นเลขใหม่</th>
              <th className="num" style={{ width: 90 }}>จำนวนหลัก</th>
              <th style={{ minWidth: 170 }}>เลขที่ถัดไป</th>
              <th className="num" style={{ width: 90 }}>ออกแล้ว</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isEdit = editing === r.type;
              return (
                <tr key={r.type}>
                  <td>
                    <b>{TYPES[r.type].name}</b>
                    {!r.saved ? (
                      <div style={{ fontSize: 11.5, color: "var(--fg-faint)" }}>
                        ยังไม่ได้ตั้งค่า — ใช้ค่าเริ่มต้น
                      </div>
                    ) : null}
                  </td>

                  <td>
                    {isEdit ? (
                      <input
                        className="inp"
                        value={form.name}
                        onChange={(e) => set("name", e.target.value)}
                        aria-label={"ชื่อกลุ่มเอกสารของ " + TYPES[r.type].name}
                      />
                    ) : (
                      r.group.name
                    )}
                  </td>

                  <td>
                    {isEdit ? (
                      <input
                        className="inp"
                        value={form.prefix}
                        maxLength={6}
                        onChange={(e) => set("prefix", e.target.value.toUpperCase())}
                        placeholder="เช่น RC"
                        aria-label={"อักษรนำหน้าของ " + TYPES[r.type].name}
                      />
                    ) : (
                      <code>{r.group.prefix}</code>
                    )}
                  </td>

                  <td>
                    {isEdit ? (
                      <select
                        className="sel"
                        value={form.period}
                        onChange={(e) => set("period", e.target.value)}
                        aria-label={"รอบการขึ้นเลขใหม่ของ " + TYPES[r.type].name}
                      >
                        {DOC_PERIODS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      periodName(r.group.period)
                    )}
                  </td>

                  <td className="num">
                    {isEdit ? (
                      <input
                        className="inp num"
                        type="number"
                        min={2}
                        max={8}
                        value={form.digits}
                        onChange={(e) => set("digits", e.target.value)}
                        aria-label={"จำนวนหลักของ " + TYPES[r.type].name}
                      />
                    ) : (
                      r.group.digits
                    )}
                  </td>

                  <td>
                    {/* ตอนแก้ไขให้เห็นผลทันทีว่าเลขจะออกมาหน้าตาแบบไหน */}
                    <code>{isEdit ? docSample(form, today) : r.next}</code>
                  </td>

                  <td className="num">{num(r.used, 0)}</td>

                  <td>
                    {isEdit ? (
                      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <button className="btn btn-p btn-sm" onClick={save} disabled={busy}>
                          บันทึก
                        </button>
                        <button
                          className="btn btn-g btn-sm"
                          onClick={() => {
                            setEditing(null);
                            setForm(null);
                          }}
                          disabled={busy}
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-o btn-sm"
                        onClick={() => startEdit(r)}
                        disabled={!!editing}
                      >
                        แก้ไข
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </Card>

      <Card title="รอบการขึ้นเลขใหม่">
        <TableWrap>
          <thead>
            <tr>
              <th style={{ minWidth: 150 }}>รูปแบบ</th>
              <th style={{ minWidth: 240 }}>ความหมาย</th>
              <th style={{ minWidth: 180 }}>ตัวอย่าง</th>
            </tr>
          </thead>
          <tbody>
            {DOC_PERIODS.map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.name}</b>
                </td>
                <td>{p.hint}</td>
                <td>
                  <code>{docSample({ prefix: "RC", period: p.id, digits: 4 }, today)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </div>
  );
}
