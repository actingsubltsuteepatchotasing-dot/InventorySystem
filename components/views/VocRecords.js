"use client";

// หน้าจอบันทึกเสียงของลูกค้า (VOC)
//
// หนึ่งแถวคือหนึ่งเรื่องที่ได้ยินมาจากลูกค้าหนึ่งราย ผ่านหนึ่งช่องทาง
//
// ทำไมต้องบังคับกรอกกลุ่มลูกค้า วงจรชีวิต มิติ และระดับความสำคัญ:
//   เกณฑ์ระดับ 4 บังคับให้ "บูรณาการ วิเคราะห์ จัดลำดับความสำคัญ และสรุปเป็น
//   ความต้องการความคาดหวังได้ครบถ้วนในทุกมิติ" ซึ่งทำไม่ได้เลยถ้าตอนบันทึก
//   ไม่ได้จำแนกไว้ ปล่อยให้กรอกทีหลังก็คือไม่มีวันได้กรอก
//
// สถานะเดินหน้าอย่างเดียว: รับเรื่อง -> วิเคราะห์ -> ส่งต่อ -> ดำเนินการ -> ปิด
//   ระบบไม่บังคับลำดับ เพราะของจริงมีเรื่องที่ปิดได้ทันทีหน้างาน
//   แต่รายงานจะนับเฉพาะที่ผ่านการวิเคราะห์แล้วว่าเข้าเกณฑ์ระดับ 4

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { num, thDate, todayISO, uid } from "@/lib/format";
import {
  CUST_GROUPS,
  DIMENSIONS,
  LIFECYCLE,
  PRIORITIES,
  VOC_KINDS,
  VOC_PRODUCTS,
  VOC_STATUS,
  groupOf,
  lifecycleOf,
  priorityOf,
  productName,
  vocKindOf,
  vocStatusOf,
} from "@/lib/voc";
import { useToast } from "../Toast";
import { Badge, Card, Empty, ExportPair, SearchSelect, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";
import { VOC_TABLES, nextCode } from "./vocShared";

const BLANK = {
  id: "",
  code: "",
  date: "",
  channelId: "",
  groupId: "COMM",
  lifecycle: "CURRENT",
  dimension: "PRODUCT",
  productId: "",
  kind: "NEED",
  priority: "MED",
  status: "NEW",
  customerId: "",
  partyName: "",
  province: "",
  subject: "",
  detail: "",
  response: "",
  owner: "",
  dueDate: "",
  closedDate: "",
};

/** ตรวจว่ากรอกครบหรือยัง */
export function problemsOf(r, list) {
  const out = [];
  const code = String(r.code || "").trim();

  if (!code) out.push("รหัสเรื่อง");
  else if ((list || []).some((x) => x.id !== r.id && x.code.toLowerCase() === code.toLowerCase())) {
    out.push("รหัสนี้มีอยู่แล้ว");
  }

  if (!r.date) out.push("วันที่รับฟัง");
  if (!r.channelId) out.push("ช่องทางที่รับฟังมา");
  if (!String(r.subject || "").trim()) out.push("เรื่อง");
  if (!String(r.partyName || "").trim()) out.push("ชื่อผู้ให้ข้อมูล");

  // ปิดเรื่องแล้วต้องมีคำตอบเสมอ ไม่งั้นรายงานจะบอกว่าปิดแล้วโดยไม่รู้ว่าทำอะไรไป
  if (vocStatusOf(r.status).closed && !String(r.response || "").trim()) {
    out.push("การตอบสนอง (จำเป็นเมื่อปิดเรื่องแล้ว)");
  }

  return out;
}

export default function VocRecords() {
  const inv = useInv();
  const perm = inv.perm("vocrec");
  const { db } = inv;
  const toast = useToast();
  const { user } = useAuth();

  const channels = useMemo(
    () => (db.vocChannels || []).slice().sort((a, b) => a.code.localeCompare(b.code, "th")),
    [db.vocChannels]
  );

  const list = useMemo(
    () => (db.vocRecords || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [db.vocRecords]
  );

  const [form, setForm] = useState({ ...BLANK, date: todayISO() });
  const [busy, setBusy] = useState("");
  const [fGroup, setFGroup] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fKind, setFKind] = useState("");
  const [q, setQ] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const problems = problemsOf(form, list);
  const editing = !!form.id;

  const shown = useMemo(
    () =>
      list.filter((r) => {
        if (fGroup && r.groupId !== fGroup) return false;
        if (fStatus && r.status !== fStatus) return false;
        if (fKind && r.kind !== fKind) return false;
        if (q) {
          const hay = (r.code + " " + r.subject + " " + r.partyName + " " + r.detail).toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [list, fGroup, fStatus, fKind, q]
  );

  const channelName = (id) => {
    const c = channels.find((x) => x.id === id);
    return c ? c.code + " " + c.name : "(ช่องทางถูกลบ)";
  };

  function startNew() {
    setForm({ ...BLANK, date: todayISO(), code: nextCode(list, "VOC") });
  }

  async function save() {
    if (busy) return;
    if (problems.length) return toast("ยังกรอกไม่ครบ: " + problems.join(" · "), "err");

    const r = {
      ...form,
      id: form.id || uid(),
      code: form.code.trim(),
      subject: form.subject.trim(),
      detail: form.detail.trim(),
      response: form.response.trim(),
      partyName: form.partyName.trim(),
      owner: form.owner.trim(),
      // ปิดเรื่องแล้วยังไม่ได้ใส่วันปิด ให้ลงวันนี้ให้ ไม่ต้องมานั่งกรอกซ้ำ
      closedDate:
        vocStatusOf(form.status).closed && !form.closedDate ? todayISO() : form.closedDate || "",
      user: user && user.email ? user.email : "",
      ts: Date.now(),
    };

    setBusy("save");
    try {
      await inv.saveVocRecord(r);
      toast("บันทึกเสียงลูกค้า " + r.code + " แล้ว", "ok");
      setForm({ ...BLANK, date: todayISO() });
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  async function drop(r) {
    if (busy) return;
    const acts = (db.vocActions || []).filter((a) => a.recordId === r.id).length;
    const ok = window.confirm(
      "ลบเรื่อง " + r.code + " " + r.subject + " ?\n\n" +
        (acts ? "มีแผนงานอ้างถึงอยู่ " + acts + " รายการ — แผนจะยังอยู่แต่จะไม่ผูกกับเรื่องนี้อีก\n" : "")
    );
    if (!ok) return;

    setBusy(r.id);
    try {
      await inv.removeVocRecord(r.id);
      if (form.id === r.id) setForm({ ...BLANK, date: todayISO() });
      toast("ลบเรื่อง " + r.code + " แล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  const HEAD = [
    "รหัส", "วันที่", "ช่องทาง", "กลุ่มลูกค้า", "วงจรชีวิต", "มิติ", "ผลิตภัณฑ์",
    "ประเภท", "ความสำคัญ", "เรื่อง", "ผู้ให้ข้อมูล", "สถานะ", "ผู้รับผิดชอบ", "การตอบสนอง",
  ];
  const rows = () =>
    shown.map((r) => [
      r.code,
      r.date,
      channelName(r.channelId),
      groupOf(r.groupId).name,
      (lifecycleOf(r.lifecycle) || {}).name || r.lifecycle,
      (DIMENSIONS.find((d) => d.id === r.dimension) || {}).name || r.dimension,
      r.productId ? productName(r.productId) : "",
      vocKindOf(r.kind).name,
      priorityOf(r.priority).name,
      r.subject,
      r.partyName,
      vocStatusOf(r.status).name,
      r.owner,
      r.response,
    ]);

  if (!inv.vocReady) {
    return <SetupNotice feature="หน้าจอบันทึกเสียงของลูกค้า" tables={VOC_TABLES} />;
  }

  if (!channels.length) {
    return (
      <div className="stack">
        <Card title="ยังบันทึกเสียงลูกค้าไม่ได้">
          <Empty>
            ต้องมีช่องทางการรับฟังอย่างน้อยหนึ่งช่องทางก่อน
            เพราะทุกเรื่องต้องบอกได้ว่ารับฟังมาจากช่องทางไหน
            ไปที่หน้า &quot;ช่องทางการรับฟัง&quot; แล้วเพิ่มช่องทางแรกก่อน
          </Empty>
        </Card>
      </div>
    );
  }

  return (
    <div className="stack">
      <Card
        title={editing ? "แก้ไขเสียงลูกค้า " + form.code : "บันทึกเสียงลูกค้าใหม่"}
        actions={
          <>
            <button className="btn btn-g btn-sm" onClick={startNew}>
              เรื่องใหม่
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
            <label className="lbl" htmlFor="vr_code">รหัสเรื่อง *</label>
            <input className="inp" id="vr_code" value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="VOC-0001" />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="vr_date">วันที่รับฟัง *</label>
            <input className="inp" id="vr_date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="vr_chan">ช่องทางที่รับฟังมา *</label>
            <select className="inp" id="vr_chan" value={form.channelId} onChange={(e) => set("channelId", e.target.value)}>
              <option value="">— เลือกช่องทาง —</option>
              {channels.filter((c) => c.active || c.id === form.channelId).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="vr_group">กลุ่มลูกค้า *</label>
            <select className="inp" id="vr_group" value={form.groupId} onChange={(e) => set("groupId", e.target.value)}>
              {CUST_GROUPS.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="vr_life">ช่วงวงจรชีวิต *</label>
            <select className="inp" id="vr_life" value={form.lifecycle} onChange={(e) => set("lifecycle", e.target.value)}>
              {LIFECYCLE.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="vr_dim">มิติของความต้องการ *</label>
            <select className="inp" id="vr_dim" value={form.dimension} onChange={(e) => set("dimension", e.target.value)}>
              {DIMENSIONS.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="vr_prod">ผลิตภัณฑ์ที่เกี่ยวข้อง</label>
            <select className="inp" id="vr_prod" value={form.productId} onChange={(e) => set("productId", e.target.value)}>
              <option value="">ไม่เจาะจงผลิตภัณฑ์</option>
              {VOC_PRODUCTS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="vr_kind">ประเภทของเสียง *</label>
            <select className="inp" id="vr_kind" value={form.kind} onChange={(e) => set("kind", e.target.value)}>
              {VOC_KINDS.map((k) => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="vr_pri">ระดับความสำคัญ *</label>
            <select className="inp" id="vr_pri" value={form.priority} onChange={(e) => set("priority", e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <span className="hint">เกณฑ์ระดับ 4 บังคับให้จัดลำดับความสำคัญทุกเรื่อง</span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="vr_status">สถานะ *</label>
            <select className="inp" id="vr_status" value={form.status} onChange={(e) => set("status", e.target.value)}>
              {VOC_STATUS.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="vr_party">ชื่อผู้ให้ข้อมูล *</label>
            <input
              className="inp"
              id="vr_party"
              value={form.partyName}
              onChange={(e) => set("partyName", e.target.value)}
              placeholder="ชื่อลูกค้า กลุ่มเกษตรกร หรือหน่วยงาน"
            />
            <span className="hint">
              คนที่ไม่อยู่ในทะเบียนลูกค้า (อดีตลูกค้า ลูกค้าคู่แข่ง ผู้ที่อาจเป็นลูกค้า) ก็บันทึกชื่อไว้ตรงนี้ได้
            </span>
          </div>

          <div className="field span2">
            <div className="lbl">ผูกกับทะเบียนลูกค้า (ถ้ามี)</div>
            <SearchSelect
              id="vr_cust"
              value={form.customerId}
              onChange={(v) => {
                const c = (db.customers || []).find((x) => x.id === v);
                setForm((f) => ({
                  ...f,
                  customerId: v,
                  partyName: c ? c.name : f.partyName,
                  province: c && c.province ? c.province : f.province,
                }));
              }}
              options={(db.customers || []).map((c) => ({
                value: c.id,
                label: c.code + " " + c.name,
                meta: c.province || "",
              }))}
              placeholder="ค้นหาจากรหัสหรือชื่อลูกค้า"
              emptyLabel="ไม่ผูกกับทะเบียนลูกค้า"
            />
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="vr_subject">เรื่อง *</label>
            <input
              className="inp"
              id="vr_subject"
              value={form.subject}
              onChange={(e) => set("subject", e.target.value)}
              placeholder="สรุปสั้น ๆ ว่าลูกค้าพูดถึงเรื่องอะไร"
            />
          </div>

          <div className="field span4">
            <label className="lbl" htmlFor="vr_detail">รายละเอียด</label>
            <textarea className="inp" id="vr_detail" rows={2} value={form.detail} onChange={(e) => set("detail", e.target.value)} />
          </div>

          <div className="field span4">
            <label className="lbl" htmlFor="vr_resp">การตอบสนอง / สิ่งที่ดำเนินการ</label>
            <textarea className="inp" id="vr_resp" rows={2} value={form.response} onChange={(e) => set("response", e.target.value)} />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="vr_owner">ผู้รับผิดชอบ</label>
            <input className="inp" id="vr_owner" value={form.owner} onChange={(e) => set("owner", e.target.value)} />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="vr_due">กำหนดแล้วเสร็จ</label>
            <input className="inp" id="vr_due" type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="vr_closed">วันที่ปิดเรื่อง</label>
            <input className="inp" id="vr_closed" type="date" value={form.closedDate} onChange={(e) => set("closedDate", e.target.value)} />
          </div>
        </div>
      </Card>

      <Card
        title={"เสียงของลูกค้า " + shown.length + " เรื่อง (ทั้งหมด " + list.length + ")"}
        actions={
          <ExportPair
            disabled={!shown.length}
            toast={toast}
            onExport={(save) => save(HEAD, rows(), "เสียงของลูกค้า")}
          />
        }
      >
        <div className="row">
          <select className="inp" value={fGroup} onChange={(e) => setFGroup(e.target.value)} aria-label="กรองตามกลุ่มลูกค้า">
            <option value="">ทุกกลุ่มลูกค้า</option>
            {CUST_GROUPS.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <select className="inp" value={fKind} onChange={(e) => setFKind(e.target.value)} aria-label="กรองตามประเภท">
            <option value="">ทุกประเภท</option>
            {VOC_KINDS.map((k) => (
              <option key={k.id} value={k.id}>{k.name}</option>
            ))}
          </select>
          <select className="inp" value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="กรองตามสถานะ">
            <option value="">ทุกสถานะ</option>
            {VOC_STATUS.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input
            className="inp"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาจากรหัส เรื่อง หรือชื่อผู้ให้ข้อมูล"
            aria-label="ค้นหา"
          />
        </div>

        {!shown.length ? (
          <Empty>ไม่พบเรื่องตามเงื่อนไขที่เลือก</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>วันที่</th>
                <th>ช่องทาง</th>
                <th>กลุ่ม</th>
                <th>วงจรชีวิต</th>
                <th>ประเภท</th>
                <th>ความสำคัญ</th>
                <th>เรื่อง</th>
                <th>ผู้ให้ข้อมูล</th>
                <th>สถานะ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>{r.code}</td>
                  <td>{thDate(r.date)}</td>
                  <td>{channelName(r.channelId)}</td>
                  <td>{groupOf(r.groupId).short}</td>
                  <td>{(lifecycleOf(r.lifecycle) || {}).name || r.lifecycle}</td>
                  <td>
                    <Badge kind={vocKindOf(r.kind).kind}>{vocKindOf(r.kind).name}</Badge>
                  </td>
                  <td>
                    <Badge kind={priorityOf(r.priority).kind}>{priorityOf(r.priority).name}</Badge>
                  </td>
                  <td>{r.subject}</td>
                  <td>{r.partyName}</td>
                  <td>
                    <Badge kind={vocStatusOf(r.status).kind}>{vocStatusOf(r.status).name}</Badge>
                  </td>
                  <td className="num">
                    <button className="btn btn-g btn-sm" onClick={() => setForm(r)} disabled={!perm.edit}>
                      แก้ไข
                    </button>
                    <button className="btn btn-d btn-sm" onClick={() => drop(r)} disabled={!!busy || !perm.edit}>
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}

        <span className="hint">
          วิเคราะห์แล้ว {num(list.filter((r) => vocStatusOf(r.status).analyzed).length, 0)} เรื่อง ·
          ปิดแล้ว {num(list.filter((r) => vocStatusOf(r.status).closed).length, 0)} เรื่อง ·
          ความสำคัญสูงที่ยังไม่ปิด{" "}
          {num(list.filter((r) => r.priority === "HIGH" && !vocStatusOf(r.status).closed).length, 0)} เรื่อง
        </span>
      </Card>
    </div>
  );
}
