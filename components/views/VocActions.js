"use client";

// หน้าจอแผนปรับปรุง ความรู้ และนวัตกรรม (SE-AM หมวด 3)
//
// ตารางนี้คือหลักฐานของเกณฑ์ระดับ 3-5 เกือบทั้งหมด
//   ระดับ 3 ต้องมีกลไกกำกับ ติดตาม ควบคุม และการวิเคราะห์เรื่องเทคโนโลยีดิจิทัล
//   ระดับ 4 ต้องรายงานผู้บริหารรายไตรมาส และนำสารสนเทศไปใช้จริง
//   ระดับ 5 ต้องประเมินประสิทธิผล จัดการความรู้ ทำนวัตกรรม และเก็บลงระบบดิจิทัล
//
// ทำไมต้องแยกชนิดของงาน ไม่ใช่กองรวมเป็น "แผนงาน":
//   แต่ละชนิดผูกกับข้อกำหนดของเกณฑ์คนละข้อ ถ้ากองรวมกัน ระบบจะบอกไม่ได้ว่า
//   ที่ทำไปแล้วนั้นตอบเกณฑ์ข้อไหน แล้วรายงานความครบถ้วนก็จะเป็นแค่การเดา
//
// ทำไม "นำผลไปใช้" ต้องอ้างรอบประเมินหรือเรื่องที่รับฟังมา:
//   เกณฑ์ระดับ 4 บังคับให้ "แสดงให้เห็นถึงการนำสารสนเทศไปใช้"
//   แผนที่ลอย ๆ ไม่ได้อ้างอะไรเลย พิสูจน์ข้อนี้ไม่ได้ ระบบจึงไม่นับให้

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { num, thDate, todayISO, uid } from "@/lib/format";
import {
  ACTION_KINDS,
  ACTION_STATUS,
  CRITERIA,
  actionKindOf,
  actionStatusOf,
  lastQuarters,
  quarterKeyOf,
} from "@/lib/voc";
import { useToast } from "../Toast";
import { Badge, Card, Empty, ExportPair, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";
import { VOC_TABLES, nextCode } from "./vocShared";

const BLANK = {
  id: "",
  code: "",
  kind: "IMPROVE",
  crit: "",
  title: "",
  detail: "",
  recordId: "",
  surveyId: "",
  owner: "",
  dueDate: "",
  doneDate: "",
  status: "PLAN",
  result: "",
  storeUrl: "",
};

/** ตรวจว่ากรอกครบหรือยัง */
export function problemsOf(a, list) {
  const out = [];
  const code = String(a.code || "").trim();

  if (!code) out.push("รหัสแผนงาน");
  else if ((list || []).some((x) => x.id !== a.id && x.code.toLowerCase() === code.toLowerCase())) {
    out.push("รหัสนี้มีอยู่แล้ว");
  }

  if (!String(a.title || "").trim()) out.push("ชื่อแผนงาน");
  if (!String(a.owner || "").trim()) out.push("ผู้รับผิดชอบ");

  const done = actionStatusOf(a.status).done;

  // ดำเนินการแล้วต้องมีผลลัพธ์ ไม่งั้นรายงานจะบอกว่าเสร็จแล้วโดยไม่รู้ว่าได้อะไร
  if (done && !String(a.result || "").trim()) out.push("ผลลัพธ์ที่ได้ (จำเป็นเมื่อดำเนินการแล้ว)");
  if (done && !a.doneDate) out.push("วันที่ดำเนินการแล้วเสร็จ");

  // เกณฑ์ระดับ 5 บังคับให้จัดเก็บความรู้และนวัตกรรมลงระบบดิจิทัล
  if (done && (a.kind === "KM" || a.kind === "INNOVATION") && !String(a.storeUrl || "").trim()) {
    out.push("ที่จัดเก็บในระบบดิจิทัล (เกณฑ์ระดับ 5 บังคับ)");
  }

  // การนำผลไปใช้ต้องพิสูจน์ได้ว่ามาจากสารสนเทศจริง
  if ((a.kind === "STRATEGY" || a.kind === "IMPROVE") && !a.surveyId && !a.recordId) {
    out.push("ต้องอ้างรอบประเมินหรือเรื่องที่รับฟังมา อย่างน้อยหนึ่งอย่าง");
  }

  return out;
}

export default function VocActions() {
  const inv = useInv();
  const perm = inv.perm("vocaction");
  const { db } = inv;
  const toast = useToast();
  const { user } = useAuth();

  const list = useMemo(
    () => (db.vocActions || []).slice().sort((a, b) => a.code.localeCompare(b.code, "th")),
    [db.vocActions]
  );
  const records = useMemo(() => db.vocRecords || [], [db.vocRecords]);
  const surveys = useMemo(() => db.vocSurveys || [], [db.vocSurveys]);

  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState("");
  const [fKind, setFKind] = useState("");
  const [fStatus, setFStatus] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const problems = problemsOf(form, list);
  const editing = !!form.id;

  const shown = list.filter(
    (a) => (!fKind || a.kind === fKind) && (!fStatus || a.status === fStatus)
  );

  /* รายงานผู้บริหารรายไตรมาส — เกณฑ์ 3.1 ระดับ 4 บังคับ */
  const quarters = useMemo(() => {
    const done = list.filter((a) => a.kind === "REPORT" && actionStatusOf(a.status).done);
    const have = new Set(done.map((a) => quarterKeyOf(a.doneDate || a.dueDate)).filter(Boolean));
    return lastQuarters(4).map((q) => ({ q, have: have.has(q) }));
  }, [list]);

  /* จำนวนงานแต่ละชนิดที่เสร็จแล้ว ใช้ดูว่าเกณฑ์ข้อไหนยังไม่มีหลักฐาน */
  const byKind = useMemo(
    () =>
      ACTION_KINDS.map((k) => ({
        ...k,
        total: list.filter((a) => a.kind === k.id).length,
        done: list.filter((a) => a.kind === k.id && actionStatusOf(a.status).done).length,
      })),
    [list]
  );

  function startNew() {
    setForm({ ...BLANK, code: nextCode(list, "ACT") });
  }

  async function save() {
    if (busy) return;
    if (problems.length) return toast("ยังกรอกไม่ครบ: " + problems.join(" · "), "err");

    const a = {
      ...form,
      id: form.id || uid(),
      code: form.code.trim(),
      title: form.title.trim(),
      detail: form.detail.trim(),
      result: form.result.trim(),
      owner: form.owner.trim(),
      storeUrl: form.storeUrl.trim(),
      user: user && user.email ? user.email : "",
      ts: Date.now(),
    };

    setBusy("save");
    try {
      await inv.saveVocAction(a);
      toast("บันทึกแผนงาน " + a.code + " แล้ว", "ok");
      setForm(BLANK);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  async function drop(a) {
    if (busy) return;
    if (!window.confirm("ลบแผนงาน " + a.code + " " + a.title + " ?")) return;
    setBusy(a.id);
    try {
      await inv.removeVocAction(a.id);
      if (form.id === a.id) setForm(BLANK);
      toast("ลบแผนงาน " + a.code + " แล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  const refName = (a) => {
    if (a.surveyId) {
      const s = surveys.find((x) => x.id === a.surveyId);
      return s ? "รอบ " + s.code + " " + s.name : "(รอบที่ถูกลบ)";
    }
    if (a.recordId) {
      const r = records.find((x) => x.id === a.recordId);
      return r ? "เรื่อง " + r.code + " " + r.subject : "(เรื่องที่ถูกลบ)";
    }
    return "";
  };

  const HEAD = [
    "รหัส", "ชนิดงาน", "เกณฑ์ข้อ", "ชื่อแผนงาน", "อ้างอิงจาก", "ผู้รับผิดชอบ",
    "กำหนดเสร็จ", "วันที่เสร็จ", "สถานะ", "ผลลัพธ์", "ที่จัดเก็บดิจิทัล",
  ];
  const rows = () =>
    shown.map((a) => [
      a.code,
      actionKindOf(a.kind).name,
      a.crit || "ทั้งสองข้อ",
      a.title,
      refName(a),
      a.owner,
      a.dueDate,
      a.doneDate,
      actionStatusOf(a.status).name,
      a.result,
      a.storeUrl,
    ]);

  if (!inv.vocReady) {
    return <SetupNotice feature="หน้าจอแผนปรับปรุงและนวัตกรรม" tables={VOC_TABLES} />;
  }

  return (
    <div className="stack">
      <Card title="หลักฐานตามเกณฑ์ที่มีอยู่ตอนนี้">
        <div className="voc-cover">
          <div>
            <div className="lbl">รายงานต่อผู้บริหาร 4 ไตรมาสล่าสุด (เกณฑ์ 3.1 ระดับ 4)</div>
            <div className="sp">
              {quarters.map((q) => (
                <Badge key={q.q} kind={q.have ? "ok" : "err"}>
                  {q.have ? "✓ " : "✗ "}
                  {q.q}
                </Badge>
              ))}
            </div>
            <span className="hint">
              นับจากแผนงานชนิด &quot;รายงานต่อผู้บริหาร&quot; ที่ดำเนินการแล้ว โดยดูจากวันที่เสร็จ
            </span>
          </div>

          <div>
            <div className="lbl">งานแต่ละชนิดที่ดำเนินการแล้ว</div>
            <div className="sp">
              {byKind.map((k) => (
                <Badge key={k.id} kind={k.done ? "ok" : k.total ? "warn" : "gray"}>
                  {k.name} {k.done}/{k.total}
                </Badge>
              ))}
            </div>
            <span className="hint">
              สีเทา = ยังไม่มีแผนเลย · สีเหลือง = มีแผนแต่ยังไม่เสร็จ · สีเขียว = มีที่เสร็จแล้ว
            </span>
          </div>
        </div>
      </Card>

      <Card
        title={editing ? "แก้ไขแผนงาน " + form.code : "เพิ่มแผนงาน"}
        actions={
          <>
            <button className="btn btn-g btn-sm" onClick={startNew}>
              แผนใหม่
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
            <label className="lbl" htmlFor="ac_code">รหัสแผนงาน *</label>
            <input className="inp" id="ac_code" value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="ACT-0001" />
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="ac_kind">ชนิดของงาน *</label>
            <select className="inp" id="ac_kind" value={form.kind} onChange={(e) => set("kind", e.target.value)}>
              {ACTION_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} — ใช้ตอบเกณฑ์ {k.forLevel}
                </option>
              ))}
            </select>
            <span className="hint">ชนิดของงานคือสิ่งที่บอกว่าแผนนี้ตอบเกณฑ์ข้อไหน</span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ac_crit">ผูกกับเกณฑ์ข้อ</label>
            <select className="inp" id="ac_crit" value={form.crit} onChange={(e) => set("crit", e.target.value)}>
              <option value="">ทั้งสองข้อ</option>
              {CRITERIA.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field span4">
            <label className="lbl" htmlFor="ac_title">ชื่อแผนงาน *</label>
            <input
              className="inp"
              id="ac_title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="เช่น ปรับปรุงกระบวนการรับซื้อยางก้อนถ้วยให้เร็วขึ้น"
            />
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="ac_survey">อ้างอิงรอบการประเมิน</label>
            <select
              className="inp"
              id="ac_survey"
              value={form.surveyId}
              onChange={(e) => setForm((f) => ({ ...f, surveyId: e.target.value, recordId: "" }))}
            >
              <option value="">ไม่อ้างรอบประเมิน</option>
              {surveys.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="ac_record">อ้างอิงเสียงของลูกค้า</label>
            <select
              className="inp"
              id="ac_record"
              value={form.recordId}
              onChange={(e) => setForm((f) => ({ ...f, recordId: e.target.value, surveyId: "" }))}
            >
              <option value="">ไม่อ้างเรื่องที่รับฟังมา</option>
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} {r.subject}
                </option>
              ))}
            </select>
            <span className="hint">
              งานชนิด &quot;ยุทธศาสตร์&quot; และ &quot;ปรับปรุง&quot; ต้องอ้างอย่างใดอย่างหนึ่ง
              เพื่อพิสูจน์ว่านำสารสนเทศไปใช้จริง
            </span>
          </div>

          <div className="field span4">
            <label className="lbl" htmlFor="ac_detail">รายละเอียด</label>
            <textarea className="inp" id="ac_detail" rows={2} value={form.detail} onChange={(e) => set("detail", e.target.value)} />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ac_owner">ผู้รับผิดชอบ *</label>
            <input className="inp" id="ac_owner" value={form.owner} onChange={(e) => set("owner", e.target.value)} />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ac_due">กำหนดเสร็จ</label>
            <input className="inp" id="ac_due" type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ac_status">สถานะ *</label>
            <select
              className="inp"
              id="ac_status"
              value={form.status}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({
                  ...f,
                  status: v,
                  // เสร็จแล้วยังไม่ได้ใส่วันที่ ให้ลงวันนี้ให้ ไม่ต้องมานั่งกรอกซ้ำ
                  doneDate: actionStatusOf(v).done && !f.doneDate ? todayISO() : f.doneDate,
                }));
              }}
            >
              {ACTION_STATUS.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ac_done">วันที่เสร็จ</label>
            <input className="inp" id="ac_done" type="date" value={form.doneDate} onChange={(e) => set("doneDate", e.target.value)} />
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="ac_result">ผลลัพธ์ที่ได้</label>
            <textarea className="inp" id="ac_result" rows={2} value={form.result} onChange={(e) => set("result", e.target.value)} />
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="ac_store">ที่จัดเก็บในระบบดิจิทัล</label>
            <input
              className="inp"
              id="ac_store"
              value={form.storeUrl}
              onChange={(e) => set("storeUrl", e.target.value)}
              placeholder="ลิงก์คลังความรู้ / ที่เก็บไฟล์ / รหัสเอกสารในระบบ"
            />
            <span className="hint">
              งานจัดการความรู้และนวัตกรรมต้องระบุที่จัดเก็บเสมอเมื่อดำเนินการแล้ว (เกณฑ์ระดับ 5)
            </span>
          </div>
        </div>
      </Card>

      <Card
        title={"แผนงานทั้งหมด " + shown.length + " รายการ (ทั้งหมด " + list.length + ")"}
        actions={
          <ExportPair
            disabled={!shown.length}
            toast={toast}
            onExport={(save2) => save2(HEAD, rows(), "แผนปรับปรุงและนวัตกรรม")}
          />
        }
      >
        <div className="row">
          <select className="inp" value={fKind} onChange={(e) => setFKind(e.target.value)} aria-label="กรองตามชนิดงาน">
            <option value="">ทุกชนิดงาน</option>
            {ACTION_KINDS.map((k) => (
              <option key={k.id} value={k.id}>{k.name}</option>
            ))}
          </select>
          <select className="inp" value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="กรองตามสถานะ">
            <option value="">ทุกสถานะ</option>
            {ACTION_STATUS.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {!shown.length ? (
          <Empty>ยังไม่มีแผนงานตามเงื่อนไขที่เลือก</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ชนิดงาน</th>
                <th>เกณฑ์</th>
                <th>ชื่อแผนงาน</th>
                <th>อ้างอิงจาก</th>
                <th>ผู้รับผิดชอบ</th>
                <th>กำหนดเสร็จ</th>
                <th>สถานะ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id}>
                  <td>{a.code}</td>
                  <td>{actionKindOf(a.kind).name}</td>
                  <td>{a.crit || "ทั้งสองข้อ"}</td>
                  <td>{a.title}</td>
                  <td>{refName(a)}</td>
                  <td>{a.owner}</td>
                  <td>{a.dueDate ? thDate(a.dueDate) : "-"}</td>
                  <td>
                    <Badge kind={actionStatusOf(a.status).kind}>{actionStatusOf(a.status).name}</Badge>
                  </td>
                  <td className="num">
                    <button className="btn btn-g btn-sm" onClick={() => setForm(a)} disabled={!perm.edit}>
                      แก้ไข
                    </button>
                    <button className="btn btn-d btn-sm" onClick={() => drop(a)} disabled={!!busy || !perm.edit}>
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}

        <span className="hint">
          ดำเนินการแล้ว {num(list.filter((a) => actionStatusOf(a.status).done).length, 0)} รายการ ·
          กำลังทำ {num(list.filter((a) => a.status === "DOING").length, 0)} รายการ ·
          เลยกำหนดแล้วยังไม่เสร็จ{" "}
          {num(
            list.filter((a) => a.dueDate && a.dueDate < todayISO() && !actionStatusOf(a.status).done).length,
            0
          )}{" "}
          รายการ
        </span>
      </Card>
    </div>
  );
}
