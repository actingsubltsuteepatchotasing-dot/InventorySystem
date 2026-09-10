"use client";

// หน้าจอการประเมินความพึงพอใจ ความไม่พึงพอใจ และความผูกพัน (SE-AM หมวด 3 ข้อ 3.2)
//
// หน้านี้มีสองส่วนในหน้าเดียว เพราะของจริงทำต่อกันเสมอ:
//   1. รอบการประเมิน — วัตถุประสงค์ รูปแบบ ความถี่ ระเบียบวิธี ขนาดตัวอย่าง
//   2. ผลของรอบนั้น — แยกรายกลุ่มลูกค้า รายผลิตภัณฑ์ และรายมิติ
//
// เก็บคะแนนดิบกับคะแนนเต็ม ไม่ใช่ร้อยละสำเร็จรูป
//   แบบสำรวจแต่ละรอบใช้สเกลไม่เท่ากัน (5 ระดับ / 10 ระดับ / 100 คะแนน)
//   เก็บร้อยละไว้เลยจะเทียบข้ามรอบไม่ได้ และย้อนกลับไปหาคะแนนดิบไม่ได้อีก
//
// ร้อยละการตอบกลับเป็นตัวเลขบังคับ ไม่ใช่หมายเหตุ
//   เกณฑ์ระดับ 5 ระบุไว้ตรง ๆ ว่าเป็นประเด็นหนึ่งของการประเมินประสิทธิผล

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { num, thDate, uid } from "@/lib/format";
import {
  CUST_GROUPS,
  DIMENSIONS,
  FREQUENCIES,
  METHODS,
  SAMPLINGS,
  SURVEY_KINDS,
  SURVEY_STATUS,
  VOC_PRODUCTS,
  freqOf,
  groupOf,
  surveyKindOf,
  surveyScore,
  surveyStatusOf,
} from "@/lib/voc";
import { useToast } from "../Toast";
import { Badge, Card, Empty, ExportPair, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";
import { VOC_TABLES, nextCode } from "./vocShared";

const BLANK = {
  id: "",
  code: "",
  name: "",
  kind: "SAT",
  year: 0,
  purpose: "",
  form: "",
  freq: "YEARLY",
  method: "",
  sampling: "",
  sampleSize: 0,
  responded: 0,
  startDate: "",
  endDate: "",
  status: "PLAN",
  vendor: "",
  owner: "",
  note: "",
};

const BLANK_RESULT = {
  id: "",
  surveyId: "",
  groupId: "COMM",
  productId: "",
  dimension: "PRODUCT",
  score: 0,
  full: 5,
  respondents: 0,
  benchmark: 0,
  note: "",
};

/** ตรวจรอบการประเมิน */
export function surveyProblemsOf(s, list) {
  const out = [];
  const code = String(s.code || "").trim();

  if (!code) out.push("รหัสรอบ");
  else if ((list || []).some((x) => x.id !== s.id && x.code.toLowerCase() === code.toLowerCase())) {
    out.push("รหัสนี้มีอยู่แล้ว");
  }

  if (!String(s.name || "").trim()) out.push("ชื่อรอบการประเมิน");
  if (!(Number(s.year) > 2500 || Number(s.year) > 1900)) out.push("ปีงบประมาณ");
  if (!String(s.purpose || "").trim()) out.push("วัตถุประสงค์ (เกณฑ์ระดับ 2)");
  if (!String(s.form || "").trim()) out.push("รูปแบบการประเมิน (เกณฑ์ระดับ 2)");
  if (!String(s.method || "").trim()) out.push("ระเบียบวิธี (เกณฑ์ระดับ 1)");
  if (!String(s.sampling || "").trim()) out.push("วิธีสุ่มตัวอย่าง (เกณฑ์ระดับ 5)");
  if (!(Number(s.sampleSize) > 0)) out.push("ขนาดกลุ่มตัวอย่าง");

  // ตอบกลับมากกว่าที่ส่งไปไม่ได้ ฐานข้อมูลก็ปฏิเสธ แต่บอกที่หน้าจอก่อนจะชัดกว่า
  if (Number(s.responded) > Number(s.sampleSize)) out.push("จำนวนตอบกลับมากกว่าขนาดกลุ่มตัวอย่าง");

  // รายงานผลแล้วต้องมีจำนวนตอบกลับ ไม่งั้นคำนวณร้อยละการตอบกลับไม่ได้
  if (surveyStatusOf(s.status).done && !(Number(s.responded) > 0)) {
    out.push("จำนวนตอบกลับ (จำเป็นเมื่อรายงานผลแล้ว)");
  }

  if (s.startDate && s.endDate && s.endDate < s.startDate) out.push("วันสิ้นสุดก่อนวันเริ่ม");

  return out;
}

/** ตรวจผลการประเมินหนึ่งรายการ */
export function resultProblemsOf(r) {
  const out = [];
  if (!r.surveyId) out.push("รอบการประเมิน");
  if (!(Number(r.full) > 0)) out.push("คะแนนเต็มต้องมากกว่าศูนย์");
  if (Number(r.score) < 0 || Number(r.score) > Number(r.full)) out.push("คะแนนต้องอยู่ระหว่าง 0 ถึงคะแนนเต็ม");
  if (Number(r.benchmark) < 0 || Number(r.benchmark) > Number(r.full)) {
    out.push("คะแนนคู่เทียบต้องอยู่ระหว่าง 0 ถึงคะแนนเต็ม");
  }
  if (!(Number(r.respondents) >= 0)) out.push("จำนวนผู้ตอบ");
  return out;
}

export default function VocSurveys() {
  const inv = useInv();
  const perm = inv.perm("vocsurvey");
  const { db } = inv;
  const toast = useToast();
  const { user } = useAuth();

  const surveys = useMemo(
    () => (db.vocSurveys || []).slice().sort((a, b) => a.code.localeCompare(b.code, "th")),
    [db.vocSurveys]
  );
  const results = useMemo(() => db.vocResults || [], [db.vocResults]);

  const thisYear = new Date().getFullYear() + 543;
  const [form, setForm] = useState({ ...BLANK, year: thisYear });
  const [res, setRes] = useState(BLANK_RESULT);
  const [busy, setBusy] = useState("");
  const [pick, setPick] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setR = (k, v) => setRes((f) => ({ ...f, [k]: v }));

  const problems = surveyProblemsOf(form, surveys);
  const resProblems = resultProblemsOf(res);
  const editing = !!form.id;

  const current = surveys.find((s) => s.id === pick) || null;
  const myResults = results.filter((r) => r.surveyId === pick);

  const resultsOf = (id) => results.filter((r) => r.surveyId === id);
  const rate = (s) => (Number(s.sampleSize) ? (Number(s.responded) / Number(s.sampleSize)) * 100 : 0);

  function startNew() {
    setForm({ ...BLANK, year: thisYear, code: nextCode(surveys, "SUR") });
  }

  async function save() {
    if (busy) return;
    if (problems.length) return toast("ยังกรอกไม่ครบ: " + problems.join(" · "), "err");

    const s = {
      ...form,
      id: form.id || uid(),
      code: form.code.trim(),
      name: form.name.trim(),
      year: Number(form.year) || thisYear,
      sampleSize: Number(form.sampleSize) || 0,
      responded: Number(form.responded) || 0,
      user: user && user.email ? user.email : "",
      ts: Date.now(),
    };

    setBusy("save");
    try {
      await inv.saveVocSurvey(s);
      toast("บันทึกรอบการประเมิน " + s.code + " แล้ว", "ok");
      setForm({ ...BLANK, year: thisYear });
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  async function dropSurvey(s) {
    if (busy) return;
    const n = resultsOf(s.id).length;
    const ok = window.confirm(
      "ลบรอบ " + s.code + " " + s.name + " ?\n\n" +
        (n ? "ผลของรอบนี้ " + n + " รายการจะถูกลบไปด้วย\n" : "")
    );
    if (!ok) return;

    setBusy(s.id);
    try {
      await inv.removeVocSurvey(s.id);
      if (form.id === s.id) setForm({ ...BLANK, year: thisYear });
      if (pick === s.id) setPick("");
      toast("ลบรอบ " + s.code + " แล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  async function saveResult() {
    if (busy) return;
    const r = { ...res, surveyId: res.surveyId || pick };
    const probs = resultProblemsOf(r);
    if (probs.length) return toast("บันทึกผลไม่ได้: " + probs.join(" · "), "err");

    const row = {
      ...r,
      id: r.id || uid(),
      score: Number(r.score) || 0,
      full: Number(r.full) || 5,
      respondents: Number(r.respondents) || 0,
      benchmark: Number(r.benchmark) || 0,
      note: String(r.note || "").trim(),
      user: user && user.email ? user.email : "",
      ts: Date.now(),
    };

    setBusy("res");
    try {
      await inv.saveVocResult(row);
      toast("บันทึกผลการประเมินแล้ว", "ok");
      setRes({ ...BLANK_RESULT, surveyId: pick });
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  async function dropResult(r) {
    if (busy) return;
    if (!window.confirm("ลบผลการประเมินรายการนี้?")) return;
    setBusy(r.id);
    try {
      await inv.removeVocResult(r.id);
      if (res.id === r.id) setRes({ ...BLANK_RESULT, surveyId: pick });
      toast("ลบผลการประเมินแล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  const HEAD = [
    "รหัส", "ชื่อรอบ", "ประเมินเรื่อง", "ปีงบ", "ความถี่", "ระเบียบวิธี",
    "กลุ่มตัวอย่าง", "ตอบกลับ", "ร้อยละตอบกลับ", "ช่วงเวลา", "สถานะ", "ผลที่บันทึก", "คะแนนรวม",
  ];
  const rows = () =>
    surveys.map((s) => {
      const sc = surveyScore(resultsOf(s.id));
      return [
        s.code,
        s.name,
        surveyKindOf(s.kind).name,
        s.year,
        freqOf(s.freq).name,
        s.method,
        s.sampleSize,
        s.responded,
        Number(rate(s).toFixed(1)),
        (s.startDate || "-") + " ถึง " + (s.endDate || "-"),
        surveyStatusOf(s.status).name,
        resultsOf(s.id).length,
        sc.count ? Number(sc.percent.toFixed(1)) : "",
      ];
    });

  if (!inv.vocReady) {
    return <SetupNotice feature="หน้าจอการประเมินความพึงพอใจ" tables={VOC_TABLES} />;
  }

  return (
    <div className="stack">
      <Card
        title={editing ? "แก้ไขรอบการประเมิน " + form.code : "เพิ่มรอบการประเมิน"}
        actions={
          <>
            <button className="btn btn-g btn-sm" onClick={startNew}>
              รอบใหม่
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
            <label className="lbl" htmlFor="sv_code">รหัสรอบ *</label>
            <input className="inp" id="sv_code" value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="SUR-0001" />
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="sv_name">ชื่อรอบการประเมิน *</label>
            <input
              className="inp"
              id="sv_name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="เช่น สำรวจความพึงพอใจลูกค้า ปี 2569"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="sv_kind">ประเมินเรื่อง *</label>
            <select className="inp" id="sv_kind" value={form.kind} onChange={(e) => set("kind", e.target.value)}>
              {SURVEY_KINDS.map((k) => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
            <span className="hint">เกณฑ์ระดับ 2 บังคับให้ครบทั้งพึงพอใจ ไม่พึงพอใจ และผูกพัน</span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="sv_year">ปีงบประมาณ *</label>
            <input className="inp" id="sv_year" type="number" value={form.year} onChange={(e) => set("year", e.target.value)} />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="sv_freq">ความถี่ *</label>
            <select className="inp" id="sv_freq" value={form.freq} onChange={(e) => set("freq", e.target.value)}>
              {FREQUENCIES.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="sv_status">สถานะ *</label>
            <select className="inp" id="sv_status" value={form.status} onChange={(e) => set("status", e.target.value)}>
              {SURVEY_STATUS.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="sv_method">ระเบียบวิธี *</label>
            <input className="inp" id="sv_method" list="sv_methods" value={form.method} onChange={(e) => set("method", e.target.value)} />
            <datalist id="sv_methods">
              {METHODS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="sv_sampling">วิธีสุ่มตัวอย่าง *</label>
            <input className="inp" id="sv_sampling" list="sv_samplings" value={form.sampling} onChange={(e) => set("sampling", e.target.value)} />
            <datalist id="sv_samplings">
              {SAMPLINGS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="sv_size">ขนาดกลุ่มตัวอย่าง *</label>
            <input className="inp" id="sv_size" type="number" min={0} value={form.sampleSize} onChange={(e) => set("sampleSize", e.target.value)} />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="sv_resp">จำนวนตอบกลับ</label>
            <input className="inp" id="sv_resp" type="number" min={0} value={form.responded} onChange={(e) => set("responded", e.target.value)} />
            <span className="hint">
              ร้อยละการตอบกลับ {num(rate(form), 1)}% — เกณฑ์ระดับ 5 ใช้ตัวเลขนี้ประเมินประสิทธิผล
            </span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="sv_start">วันเริ่มเก็บข้อมูล</label>
            <input className="inp" id="sv_start" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="sv_end">วันสิ้นสุด</label>
            <input className="inp" id="sv_end" type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="sv_purpose">วัตถุประสงค์ *</label>
            <textarea
              className="inp"
              id="sv_purpose"
              rows={2}
              value={form.purpose}
              onChange={(e) => set("purpose", e.target.value)}
              placeholder="วิเคราะห์จากความจำเป็นระยะสั้นและระยะยาวของหน่วยงาน"
            />
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="sv_form">รูปแบบการประเมิน *</label>
            <textarea
              className="inp"
              id="sv_form"
              rows={2}
              value={form.form}
              onChange={(e) => set("form", e.target.value)}
              placeholder="เช่น แบบสอบถาม 5 ระดับ 4 ด้าน พร้อมคำถามปลายเปิด"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="sv_vendor">ผู้ดำเนินการสำรวจ</label>
            <input className="inp" id="sv_vendor" value={form.vendor} onChange={(e) => set("vendor", e.target.value)} placeholder="ภายใน / ชื่อผู้รับจ้าง" />
            <span className="hint">เกณฑ์ระดับ 3 ให้ติดตามการปฏิบัติงานทั้งภายในและภายนอก</span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="sv_owner">ผู้รับผิดชอบ</label>
            <input className="inp" id="sv_owner" value={form.owner} onChange={(e) => set("owner", e.target.value)} />
          </div>
        </div>
      </Card>

      <Card
        title={"รอบการประเมินทั้งหมด " + surveys.length + " รอบ"}
        actions={
          <ExportPair
            disabled={!surveys.length}
            toast={toast}
            onExport={(save2) => save2(HEAD, rows(), "รอบการประเมินความพึงพอใจ")}
          />
        }
      >
        {!surveys.length ? (
          <Empty>ยังไม่มีรอบการประเมิน — เพิ่มรอบแรกจากแบบฟอร์มด้านบน</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ชื่อรอบ</th>
                <th>ประเมินเรื่อง</th>
                <th>ปีงบ</th>
                <th className="num">กลุ่มตัวอย่าง</th>
                <th className="num">ตอบกลับ</th>
                <th className="num">ร้อยละ</th>
                <th>สถานะ</th>
                <th className="num">ผล</th>
                <th className="num">คะแนนรวม</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {surveys.map((s) => {
                const sc = surveyScore(resultsOf(s.id));
                return (
                  <tr key={s.id} className={pick === s.id ? "sel" : ""}>
                    <td>{s.code}</td>
                    <td>{s.name}</td>
                    <td>{surveyKindOf(s.kind).name}</td>
                    <td>{s.year}</td>
                    <td className="num">{num(s.sampleSize, 0)}</td>
                    <td className="num">{num(s.responded, 0)}</td>
                    <td className="num">{num(rate(s), 1)}%</td>
                    <td>
                      <Badge kind={surveyStatusOf(s.status).kind}>{surveyStatusOf(s.status).name}</Badge>
                    </td>
                    <td className="num">{num(resultsOf(s.id).length, 0)}</td>
                    <td className="num">{sc.count ? num(sc.percent, 1) + "%" : "-"}</td>
                    <td className="num">
                      <button
                        className="btn btn-g btn-sm"
                        onClick={() => {
                          setPick(s.id);
                          setRes({ ...BLANK_RESULT, surveyId: s.id });
                        }}
                      >
                        ผลของรอบนี้
                      </button>
                      <button className="btn btn-g btn-sm" onClick={() => setForm(s)} disabled={!perm.edit}>
                        แก้ไข
                      </button>
                      <button className="btn btn-d btn-sm" onClick={() => dropSurvey(s)} disabled={!!busy || !perm.edit}>
                        ลบ
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {current ? (
        <Card
          title={"ผลการประเมิน — " + current.code + " " + current.name}
          actions={
            <button className="btn btn-g btn-sm" onClick={() => setPick("")}>
              ปิด
            </button>
          }
        >
          <div className="form-grid">
            <div className="field">
              <label className="lbl" htmlFor="rs_group">กลุ่มลูกค้า *</label>
              <select className="inp" id="rs_group" value={res.groupId} onChange={(e) => setR("groupId", e.target.value)}>
                {CUST_GROUPS.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="lbl" htmlFor="rs_dim">ด้านที่ประเมิน *</label>
              <select className="inp" id="rs_dim" value={res.dimension} onChange={(e) => setR("dimension", e.target.value)}>
                {DIMENSIONS.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="lbl" htmlFor="rs_prod">ผลิตภัณฑ์</label>
              <select className="inp" id="rs_prod" value={res.productId} onChange={(e) => setR("productId", e.target.value)}>
                <option value="">ทุกผลิตภัณฑ์</option>
                {VOC_PRODUCTS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="lbl" htmlFor="rs_score">คะแนนที่ได้ *</label>
              <input className="inp" id="rs_score" type="number" step="0.01" min={0} value={res.score} onChange={(e) => setR("score", e.target.value)} />
            </div>

            <div className="field">
              <label className="lbl" htmlFor="rs_full">คะแนนเต็ม *</label>
              <input className="inp" id="rs_full" type="number" step="0.01" min={0.01} value={res.full} onChange={(e) => setR("full", e.target.value)} />
              <span className="hint">เก็บคะแนนดิบไว้ เพื่อให้เทียบข้ามรอบที่ใช้สเกลต่างกันได้</span>
            </div>

            <div className="field">
              <label className="lbl" htmlFor="rs_resp">จำนวนผู้ตอบ</label>
              <input className="inp" id="rs_resp" type="number" min={0} value={res.respondents} onChange={(e) => setR("respondents", e.target.value)} />
            </div>

            <div className="field">
              <label className="lbl" htmlFor="rs_bm">คะแนนคู่แข่ง / คู่เทียบ</label>
              <input className="inp" id="rs_bm" type="number" step="0.01" min={0} value={res.benchmark} onChange={(e) => setR("benchmark", e.target.value)} />
              <span className="hint">เกณฑ์ระดับ 2 บังคับให้มีผลเทียบกับคู่แข่งหรือคู่เทียบ</span>
            </div>

            <div className="field span2">
              <label className="lbl" htmlFor="rs_note">หมายเหตุ</label>
              <input className="inp" id="rs_note" value={res.note} onChange={(e) => setR("note", e.target.value)} />
            </div>

            <div className="field">
              <div className="lbl">&nbsp;</div>
              <button
                className="btn btn-p"
                onClick={saveResult}
                disabled={!!busy || !perm.edit || !!resProblems.length}
                title={resProblems.length ? resProblems.join(", ") : ""}
              >
                {busy === "res" ? "กำลังบันทึก…" : res.id ? "บันทึกการแก้ไข" : "เพิ่มผล"}
              </button>
            </div>
          </div>

          {!myResults.length ? (
            <Empty>ยังไม่มีผลของรอบนี้ — เพิ่มผลรายกลุ่มลูกค้าจากแบบฟอร์มด้านบน</Empty>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th>กลุ่มลูกค้า</th>
                  <th>ด้าน</th>
                  <th>ผลิตภัณฑ์</th>
                  <th className="num">คะแนน</th>
                  <th className="num">ร้อยละ</th>
                  <th className="num">ผู้ตอบ</th>
                  <th className="num">คู่เทียบ</th>
                  <th>หมายเหตุ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {myResults.map((r) => (
                  <tr key={r.id}>
                    <td>{groupOf(r.groupId).name}</td>
                    <td>{(DIMENSIONS.find((d) => d.id === r.dimension) || {}).name || r.dimension}</td>
                    <td>{r.productId ? (VOC_PRODUCTS.find((p) => p.id === r.productId) || {}).name : "ทุกผลิตภัณฑ์"}</td>
                    <td className="num">{num(r.score, 2)} / {num(r.full, 2)}</td>
                    <td className="num">{num((r.score / r.full) * 100, 1)}%</td>
                    <td className="num">{num(r.respondents, 0)}</td>
                    <td className="num">{r.benchmark ? num((r.benchmark / r.full) * 100, 1) + "%" : "-"}</td>
                    <td>{r.note}</td>
                    <td className="num">
                      <button className="btn btn-g btn-sm" onClick={() => setRes(r)} disabled={!perm.edit}>
                        แก้ไข
                      </button>
                      <button className="btn btn-d btn-sm" onClick={() => dropResult(r)} disabled={!!busy || !perm.edit}>
                        ลบ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}

          <span className="hint">
            คะแนนรวมของรอบนี้ {num(surveyScore(myResults).percent, 1)}% ·
            ผู้ตอบรวม {num(surveyScore(myResults).respondents, 0)} ราย ·
            เก็บข้อมูล {current.startDate ? thDate(current.startDate) : "-"} ถึง{" "}
            {current.endDate ? thDate(current.endDate) : "-"}
          </span>
        </Card>
      ) : null}
    </div>
  );
}
