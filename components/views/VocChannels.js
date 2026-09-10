"use client";

// หน้าจอช่องทางการรับฟังลูกค้า (SE-AM หมวด 3 ข้อ 3.1)
//
// ช่องทางคือฐานของทั้งหมวด — เกณฑ์ระดับ 2 บังคับว่าช่องทางต้องครอบคลุม
// "ครบถ้วนทุกกลุ่มลูกค้า" และ "ทั้งลูกค้าปัจจุบัน อดีตลูกค้า ลูกค้าคู่แข่ง
// และผู้ที่อาจจะเป็นลูกค้าในอนาคต" หน้านี้จึงไม่ได้เป็นแค่ทะเบียน
// แต่บอกด้วยว่าตอนนี้ยังขาดความครอบคลุมตรงไหน
//
// ทำไมช่องทางลบไม่ได้ถ้ามีเสียงลูกค้าอ้างอยู่:
//   เสียงลูกค้าที่ไม่รู้ว่ามาจากช่องทางไหน เอาไปตรวจความครอบคลุมไม่ได้เลย
//   ช่องทางที่เลิกใช้ให้ปิดใช้งานแทน ของเก่ายังอยู่ครบและยังตรวจย้อนหลังได้

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { num, uid } from "@/lib/format";
import {
  CHANNEL_KINDS,
  CUST_GROUPS,
  DIMENSIONS,
  FREQUENCIES,
  LIFECYCLE,
  REQUIRED_LIFECYCLE,
  channelKindOf,
  freqOf,
  groupOf,
  lifecycleOf,
} from "@/lib/voc";
import { useToast } from "../Toast";
import { Badge, Card, Empty, ExportPair, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";
import { VOC_TABLES } from "./vocShared";

/** ความยาวสูงสุดที่ฐานข้อมูลยอมรับ — ต้องตรงกับ constraint ใน schema.sql */
export const CODE_MAX = 50;
export const NAME_MAX = 200;

const BLANK = {
  id: "",
  code: "",
  name: "",
  kind: "WEB",
  groups: [],
  lifecycle: [],
  dimension: "",
  freq: "MONTHLY",
  owner: "",
  practice: "",
  note: "",
  active: true,
};

/**
 * ตรวจว่ากรอกครบและใช้ได้จริงหรือยัง
 *
 * บังคับให้เลือกกลุ่มลูกค้าและช่วงวงจรชีวิตอย่างน้อยอย่างละหนึ่ง
 * เพราะช่องทางที่ไม่ระบุว่ารับฟังใคร ใช้ตรวจความครอบคลุมตามเกณฑ์ไม่ได้
 * ซึ่งเป็นเหตุผลเดียวที่หน้านี้มีอยู่
 */
export function problemsOf(c, list) {
  const out = [];
  const code = String(c.code || "").trim();
  const name = String(c.name || "").trim();

  if (!code) out.push("รหัสช่องทาง");
  else if (code.length > CODE_MAX) out.push("รหัสยาวเกิน " + CODE_MAX + " ตัวอักษร");
  else if ((list || []).some((x) => x.id !== c.id && x.code.toLowerCase() === code.toLowerCase())) {
    out.push("รหัสนี้มีอยู่แล้ว");
  }

  if (!name) out.push("ชื่อช่องทาง");
  else if (name.length > NAME_MAX) out.push("ชื่อยาวเกิน " + NAME_MAX + " ตัวอักษร");

  if (!(c.groups || []).length) out.push("กลุ่มลูกค้าที่รับฟัง (อย่างน้อย 1 กลุ่ม)");
  if (!(c.lifecycle || []).length) out.push("ช่วงวงจรชีวิตที่รับฟัง (อย่างน้อย 1 ช่วง)");
  if (!String(c.owner || "").trim()) out.push("ผู้รับผิดชอบ");
  if (!String(c.practice || "").trim()) out.push("แนวทางปฏิบัติ");

  return out;
}

export default function VocChannels() {
  const inv = useInv();
  const perm = inv.perm("vocchan");
  const { db } = inv;
  const toast = useToast();
  const { user } = useAuth();

  const list = useMemo(
    () => (db.vocChannels || []).slice().sort((a, b) => a.code.localeCompare(b.code, "th")),
    [db.vocChannels]
  );

  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k, v) =>
    setForm((f) => {
      const cur = f[k] || [];
      return { ...f, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });

  const problems = problemsOf(form, list);
  const editing = !!form.id;

  /** จำนวนเสียงลูกค้าที่เข้ามาทางช่องทางนี้ */
  const usedBy = (id) => (db.vocRecords || []).filter((r) => r.channelId === id).length;

  /* ความครอบคลุมตามเกณฑ์ — คิดจากช่องทางที่เปิดใช้งานเท่านั้น */
  const coverage = useMemo(() => {
    const on = list.filter((c) => c.active);
    const g = [...new Set(on.flatMap((c) => c.groups || []))];
    const l = [...new Set(on.flatMap((c) => c.lifecycle || []))];
    const digital = on.filter((c) => channelKindOf(c.kind).digital);
    return {
      groups: CUST_GROUPS.map((x) => ({ ...x, have: g.includes(x.id) })),
      lifecycle: LIFECYCLE.map((x) => ({ ...x, have: l.includes(x.id) })),
      social: digital.some((c) => c.kind === "SOCIAL"),
      web: digital.some((c) => c.kind === "WEB" || c.kind === "APP"),
      active: on.length,
    };
  }, [list]);

  async function save() {
    if (busy) return;
    if (problems.length) return toast("ยังกรอกไม่ครบ: " + problems.join(" · "), "err");

    const c = {
      ...form,
      id: form.id || uid(),
      code: form.code.trim(),
      name: form.name.trim(),
      owner: form.owner.trim(),
      practice: form.practice.trim(),
      note: form.note.trim(),
      user: user && user.email ? user.email : "",
      ts: Date.now(),
    };

    setBusy("save");
    try {
      await inv.saveVocChannel(c);
      toast("บันทึกช่องทาง " + c.code + " " + c.name + " แล้ว", "ok");
      setForm(BLANK);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  async function drop(c) {
    if (busy) return;
    const used = usedBy(c.id);
    if (used) {
      return toast(
        "ลบไม่ได้ — มีเสียงลูกค้าอ้างช่องทางนี้อยู่ " + used + " เรื่อง ถ้าเลิกใช้ให้ปิดใช้งานแทน",
        "err"
      );
    }
    if (!window.confirm("ลบช่องทาง " + c.code + " " + c.name + " ออกจากระบบ?")) return;

    setBusy(c.id);
    try {
      await inv.removeVocChannel(c.id);
      if (form.id === c.id) setForm(BLANK);
      toast("ลบช่องทาง " + c.code + " แล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  const HEAD = [
    "รหัส",
    "ชื่อช่องทาง",
    "ชนิด",
    "กลุ่มลูกค้า",
    "วงจรชีวิต",
    "ความถี่",
    "ผู้รับผิดชอบ",
    "เสียงที่รับมา",
    "สถานะ",
  ];
  const rows = () =>
    list.map((c) => [
      c.code,
      c.name,
      channelKindOf(c.kind).name,
      (c.groups || []).map((g) => groupOf(g).short).join(", "),
      (c.lifecycle || []).map((l) => (lifecycleOf(l) || {}).name || l).join(", "),
      freqOf(c.freq).name,
      c.owner,
      usedBy(c.id),
      c.active ? "ใช้งาน" : "ปิดใช้งาน",
    ]);

  if (!inv.vocReady) {
    return <SetupNotice feature="หน้าจอช่องทางการรับฟังลูกค้า" tables={VOC_TABLES} />;
  }

  return (
    <div className="stack">
      <Card title="ความครอบคลุมตามเกณฑ์ระดับ 2">
        <div className="voc-cover">
          <div>
            <div className="lbl">กลุ่มลูกค้า</div>
            <div className="sp">
              {coverage.groups.map((g) => (
                <Badge key={g.id} kind={g.have ? "ok" : "err"}>
                  {g.have ? "✓ " : "✗ "}
                  {g.name}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <div className="lbl">วงจรชีวิตของการเป็นลูกค้า</div>
            <div className="sp">
              {coverage.lifecycle.map((l) => (
                <Badge key={l.id} kind={l.have ? "ok" : l.required ? "err" : "gray"}>
                  {l.have ? "✓ " : l.required ? "✗ " : "– "}
                  {l.name}
                </Badge>
              ))}
            </div>
            <span className="hint">
              ที่ขึ้นสีแดงคือช่วงที่เกณฑ์บังคับว่าต้องมี ส่วนลูกค้าใหม่เป็นช่วงเสริม ไม่มีก็ไม่ตกเกณฑ์
            </span>
          </div>

          <div>
            <div className="lbl">ช่องทางดิจิทัล (เกณฑ์บังคับ)</div>
            <div className="sp">
              <Badge kind={coverage.social ? "ok" : "err"}>
                {coverage.social ? "✓ " : "✗ "}สื่อสังคมออนไลน์
              </Badge>
              <Badge kind={coverage.web ? "ok" : "err"}>
                {coverage.web ? "✓ " : "✗ "}เว็บไซต์ / แอปพลิเคชัน
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      <Card
        title={editing ? "แก้ไขช่องทางการรับฟัง" : "เพิ่มช่องทางการรับฟัง"}
        actions={
          <>
            {editing ? (
              <button className="btn btn-g btn-sm" onClick={() => setForm(BLANK)}>
                เพิ่มช่องทางใหม่
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
            <label className="lbl" htmlFor="vc_code">รหัสช่องทาง *</label>
            <input
              className="inp"
              id="vc_code"
              maxLength={CODE_MAX}
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="เช่น CH01"
            />
            <span className="hint">ไม่เกิน {CODE_MAX} ตัวอักษร · ห้ามซ้ำ</span>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="vc_name">ชื่อช่องทาง *</label>
            <input
              className="inp"
              id="vc_name"
              maxLength={NAME_MAX}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="เช่น เพจเฟซบุ๊กของหน่วยงาน"
            />
            <span className="hint">ใช้ {num(form.name.length, 0)} ตัวอักษร</span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="vc_kind">ชนิดช่องทาง</label>
            <select className="inp" id="vc_kind" value={form.kind} onChange={(e) => set("kind", e.target.value)}>
              {CHANNEL_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                  {k.digital ? " (ดิจิทัล)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="vc_freq">ความถี่ในการรับฟัง</label>
            <select className="inp" id="vc_freq" value={form.freq} onChange={(e) => set("freq", e.target.value)}>
              {FREQUENCIES.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="vc_dim">มิติที่เน้น</label>
            <select
              className="inp"
              id="vc_dim"
              value={form.dimension}
              onChange={(e) => set("dimension", e.target.value)}
            >
              <option value="">ทุกมิติ</option>
              {DIMENSIONS.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="field span2">
            <div className="lbl">กลุ่มลูกค้าที่รับฟังผ่านช่องทางนี้ *</div>
            <div className="row">
              {CUST_GROUPS.map((g) => (
                <label key={g.id} className="chk-line">
                  <input
                    className="chk"
                    type="checkbox"
                    checked={(form.groups || []).includes(g.id)}
                    onChange={() => toggle("groups", g.id)}
                  />
                  {g.name}
                </label>
              ))}
            </div>
          </div>

          <div className="field span2">
            <div className="lbl">ช่วงวงจรชีวิตที่รับฟัง *</div>
            <div className="row">
              {LIFECYCLE.map((l) => (
                <label key={l.id} className="chk-line">
                  <input
                    className="chk"
                    type="checkbox"
                    checked={(form.lifecycle || []).includes(l.id)}
                    onChange={() => toggle("lifecycle", l.id)}
                  />
                  {l.name}
                  {l.required ? " *" : ""}
                </label>
              ))}
            </div>
            <span className="hint">
              ที่มีดอกจันคือช่วงที่เกณฑ์บังคับว่าต้องมีช่องทางรับฟังครอบคลุมถึง
            </span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="vc_owner">ผู้รับผิดชอบ *</label>
            <input
              className="inp"
              id="vc_owner"
              value={form.owner}
              onChange={(e) => set("owner", e.target.value)}
              placeholder="เช่น ฝ่ายลูกค้าสัมพันธ์"
            />
          </div>

          <div className="field span4">
            <label className="lbl" htmlFor="vc_practice">แนวทางปฏิบัติ *</label>
            <textarea
              className="inp"
              id="vc_practice"
              rows={2}
              value={form.practice}
              onChange={(e) => set("practice", e.target.value)}
              placeholder="เช่น ตรวจข้อความทุกวันทำการ บันทึกลงระบบภายใน 1 วัน ตอบกลับภายใน 3 วันทำการ"
            />
            <span className="hint">
              เกณฑ์ระดับ 2 บังคับให้สื่อสารแนวทางนี้ให้บุคลากรที่เกี่ยวข้องรับทราบอย่างทั่วถึง
            </span>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="vc_note">หมายเหตุ</label>
            <input
              className="inp"
              id="vc_note"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </div>

          <div className="field">
            <div className="lbl">สถานะ</div>
            <label className="chk-line">
              <input className="chk" type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
              เปิดใช้งาน
            </label>
          </div>
        </div>
      </Card>

      <Card
        title={"ช่องทางทั้งหมด " + list.length + " ช่องทาง (เปิดใช้งาน " + coverage.active + ")"}
        actions={
          <ExportPair
            disabled={!list.length}
            toast={toast}
            onExport={(save) => save(HEAD, rows(), "ช่องทางการรับฟังลูกค้า")}
          />
        }
      >
        {!list.length ? (
          <Empty>ยังไม่มีช่องทาง — เพิ่มช่องทางแรกจากแบบฟอร์มด้านบน</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                {HEAD.map((h) => (
                  <th key={h}>{h}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className={c.active ? "" : "muted"}>
                  <td>{c.code}</td>
                  <td>{c.name}</td>
                  <td>
                    {channelKindOf(c.kind).name}
                    {channelKindOf(c.kind).digital ? <Badge kind="info">ดิจิทัล</Badge> : null}
                  </td>
                  <td>{(c.groups || []).map((g) => groupOf(g).short).join(", ")}</td>
                  <td>
                    {(c.lifecycle || []).map((l) => (lifecycleOf(l) || {}).name || l).join(", ")}
                  </td>
                  <td>{freqOf(c.freq).name}</td>
                  <td>{c.owner}</td>
                  <td className="num">{num(usedBy(c.id), 0)}</td>
                  <td>
                    {c.active ? <Badge kind="ok">ใช้งาน</Badge> : <Badge kind="gray">ปิดใช้งาน</Badge>}
                  </td>
                  <td className="num">
                    <button className="btn btn-g btn-sm" onClick={() => setForm(c)} disabled={!perm.edit}>
                      แก้ไข
                    </button>
                    <button
                      className="btn btn-d btn-sm"
                      onClick={() => drop(c)}
                      disabled={!!busy || !perm.edit}
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <span className="hint">
          วงจรชีวิตที่เกณฑ์บังคับ: {REQUIRED_LIFECYCLE.map((l) => (lifecycleOf(l) || {}).name).join(" · ")}
        </span>
      </Card>
    </div>
  );
}
