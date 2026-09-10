"use client";

// หน้าจอประเมินระดับตามเกณฑ์ (SE-AM หมวด 3)
//
// หน้านี้ตอบคำถามเดียวที่ผู้บริหารถามเสมอ: "ตอนนี้เราอยู่ระดับไหน และต้องทำอะไรต่อ"
//
// เกณฑ์เป็นแบบสะสม — ระดับ 3 จะได้ก็ต่อเมื่อผ่าน 1 และ 2 มาแล้ว
// จุดตรวจส่วนใหญ่ระบบตรวจให้เองจากข้อมูลจริง (ช่องทาง เสียงลูกค้า รอบประเมิน แผนงาน)
// จึงติ๊กเองไม่ได้ — เกณฑ์ที่ติ๊กเองได้ทั้งหมดไม่ต่างอะไรกับแบบฟอร์มกระดาษ
//
// จุดตรวจที่ระบบตรวจเองไม่ได้จริง ๆ (เช่น "สื่อสารให้บุคลากรรับทราบอย่างทั่วถึง")
// ให้คนยืนยัน แต่ต้องระบุหลักฐานเสมอ ติ๊กเปล่า ๆ ระบบไม่นับให้

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { num, thDate, todayISO, uid } from "@/lib/format";
import { CRITERIA, assessAll } from "@/lib/voc";
import { useToast } from "../Toast";
import { Badge, Card, Empty, ExportPair } from "../ui";
import SetupNotice from "../SetupNotice";
import { VOC_TABLES, levelLabel } from "./vocShared";

export default function VocLevels({ onNavigate }) {
  const inv = useInv();
  const perm = inv.perm("voclevel");
  const { db } = inv;
  const toast = useToast();
  const { user } = useAuth();

  const [busy, setBusy] = useState("");
  const [openCrit, setOpenCrit] = useState("3.1");
  const [edit, setEdit] = useState(null);

  const assessment = useMemo(() => assessAll(db), [db]);
  const rowOf = (checkId) => (db.vocLevels || []).find((r) => r.checkId === checkId);

  const crit = assessment.items.find((c) => c.id === openCrit) || assessment.items[0];
  const critDef = CRITERIA.find((c) => c.id === crit.id);

  async function confirmCheck(check, level, done) {
    if (busy) return;
    const old = rowOf(check.id);
    const evidence = String((edit && edit.id === check.id ? edit.evidence : old && old.evidence) || "").trim();

    if (done && !evidence) {
      return toast("ยืนยันไม่ได้ — ต้องระบุหลักฐานก่อน (ติ๊กเปล่า ๆ ระบบไม่นับให้)", "err");
    }

    const row = {
      id: (old && old.id) || uid(),
      crit: crit.id,
      level,
      checkId: check.id,
      done,
      evidence,
      owner: String((edit && edit.id === check.id ? edit.owner : old && old.owner) || "").trim(),
      doneDate: done ? (old && old.doneDate) || todayISO() : "",
      note: (old && old.note) || "",
      user: user && user.email ? user.email : "",
      ts: Date.now(),
    };

    setBusy(check.id);
    try {
      await inv.saveVocLevel(row);
      setEdit(null);
      toast(done ? "ยืนยันจุดตรวจแล้ว" : "ยกเลิกการยืนยันแล้ว", "ok");
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  const HEAD = ["เกณฑ์", "ระดับ", "จุดตรวจ", "ผล", "ตรวจโดย", "รายละเอียด", "หลักฐาน"];
  const rows = () =>
    assessment.items.flatMap((it) =>
      it.levels.flatMap((lv) =>
        lv.checks.map((ck) => [
          it.id + " " + it.name,
          lv.level,
          ck.label,
          ck.result.ok ? "ผ่าน" : "ยังไม่ผ่าน",
          ck.result.auto ? "ระบบตรวจอัตโนมัติ" : "ยืนยันโดยผู้รับผิดชอบ",
          ck.result.detail,
          ck.result.evidence,
        ])
      )
    );

  if (!inv.vocReady) {
    return <SetupNotice feature="หน้าจอประเมินระดับตามเกณฑ์" tables={VOC_TABLES} />;
  }

  return (
    <div className="stack">
      <Card
        title="ระดับที่ได้ตามเกณฑ์ หมวด 3 การรับฟังลูกค้า"
        actions={
          <ExportPair
            toast={toast}
            onExport={(save) => save(HEAD, rows(), "ผลการประเมินระดับ หมวด 3")}
          />
        }
      >
        <div className="voc-score">
          <div className="voc-score-big">
            <div className="lbl">ระดับของทั้งหมวด</div>
            <b className={"voc-lv lv" + assessment.level}>{levelLabel(assessment.level)}</b>
            <div className="hint">
              ตัดสินจากข้อย่อยที่อ่อนที่สุด — คะแนน {num(assessment.score, 2)} จาก {num(assessment.weight, 0)}
            </div>
          </div>

          {assessment.items.map((it) => (
            <div key={it.id} className="voc-score-item">
              <div className="lbl">
                ข้อ {it.id} {it.name}
              </div>
              <b className={"voc-lv lv" + it.level}>{levelLabel(it.level)}</b>
              <div className="voc-track" role="img" aria-label={"ผ่าน " + it.totalPassed + " จาก " + it.totalChecks + " จุดตรวจ"}>
                {it.levels.map((lv) => (
                  <span
                    key={lv.level}
                    className={"voc-step " + (lv.complete ? "done" : lv.passed ? "part" : "")}
                    title={"ระดับ " + lv.level + ": ผ่าน " + lv.passed + "/" + lv.total + " จุดตรวจ"}
                  >
                    {lv.level}
                  </span>
                ))}
              </div>
              <div className="hint">
                ผ่าน {num(it.totalPassed, 0)} จาก {num(it.totalChecks, 0)} จุดตรวจ ({num(it.percent, 0)}%) ·
                คะแนน {num(it.score, 2)} / {num(it.weight, 0)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="รายละเอียดรายข้อ"
        actions={
          <>
            {CRITERIA.map((c) => (
              <button
                key={c.id}
                className={"btn btn-sm " + (openCrit === c.id ? "btn-p" : "btn-g")}
                onClick={() => setOpenCrit(c.id)}
              >
                ข้อ {c.id}
              </button>
            ))}
          </>
        }
      >
        <div className="voc-intro">
          <b>
            {crit.id} {crit.name}
          </b>
          <p>{critDef.intro}</p>
        </div>

        {crit.levels.map((lv) => (
          <div key={lv.level} className={"voc-level " + (lv.complete ? "done" : "")}>
            <div className="voc-level-h">
              <Badge kind={lv.complete ? "ok" : lv.passed ? "warn" : "gray"}>ระดับ {lv.level}</Badge>
              <b>
                ผ่าน {lv.passed} / {lv.total} จุดตรวจ
              </b>
              {lv.complete ? <Badge kind="ok">ครบแล้ว</Badge> : null}
              {!lv.complete && crit.next && crit.next.level === lv.level ? (
                <Badge kind="warn">ระดับที่กำลังจะขึ้น</Badge>
              ) : null}
            </div>

            <p className="voc-level-text">{lv.text}</p>

            <ul className="voc-checks">
              {lv.checks.map((ck) => {
                const old = rowOf(ck.id);
                const editing = edit && edit.id === ck.id;
                return (
                  <li key={ck.id} className={ck.result.ok ? "ok" : ""}>
                    <div className="voc-check-h">
                      <span className={"voc-mark " + (ck.result.ok ? "ok" : "no")} aria-hidden="true">
                        {ck.result.ok ? "✓" : "✗"}
                      </span>
                      <span className="voc-check-label">{ck.label}</span>
                      <Badge kind={ck.result.auto ? "info" : "gray"}>
                        {ck.result.auto ? "ระบบตรวจให้" : "ต้องยืนยันเอง"}
                      </Badge>
                    </div>

                    <div className="voc-check-detail">{ck.result.detail}</div>

                    {ck.result.auto ? null : editing ? (
                      <div className="voc-check-edit">
                        <input
                          className="inp"
                          value={edit.evidence}
                          onChange={(e) => setEdit({ ...edit, evidence: e.target.value })}
                          placeholder="หลักฐาน เช่น เลขที่หนังสือเวียน / ลิงก์เอกสาร / วันที่ประชุม"
                          aria-label="หลักฐาน"
                        />
                        <input
                          className="inp"
                          value={edit.owner}
                          onChange={(e) => setEdit({ ...edit, owner: e.target.value })}
                          placeholder="ผู้รับผิดชอบ"
                          aria-label="ผู้รับผิดชอบ"
                        />
                        <button
                          className="btn btn-p btn-sm"
                          onClick={() => confirmCheck(ck, lv.level, true)}
                          disabled={!!busy || !perm.edit}
                        >
                          ยืนยันว่าทำแล้ว
                        </button>
                        <button className="btn btn-g btn-sm" onClick={() => setEdit(null)}>
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <div className="voc-check-edit">
                        {old && old.evidence ? (
                          <span className="hint">
                            หลักฐาน: {old.evidence}
                            {old.owner ? " · " + old.owner : ""}
                            {old.doneDate ? " · " + thDate(old.doneDate) : ""}
                          </span>
                        ) : null}
                        <button
                          className="btn btn-g btn-sm"
                          onClick={() =>
                            setEdit({
                              id: ck.id,
                              evidence: (old && old.evidence) || "",
                              owner: (old && old.owner) || "",
                            })
                          }
                          disabled={!perm.edit}
                        >
                          {ck.result.ok ? "แก้หลักฐาน" : "ยืนยันพร้อมหลักฐาน"}
                        </button>
                        {ck.result.ok ? (
                          <button
                            className="btn btn-d btn-sm"
                            onClick={() => confirmCheck(ck, lv.level, false)}
                            disabled={!!busy || !perm.edit}
                          >
                            ยกเลิกการยืนยัน
                          </button>
                        ) : null}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </Card>

      <Card title="สิ่งที่ต้องทำต่อเพื่อขึ้นระดับถัดไป">
        {(() => {
          const next = crit.next;
          if (!next) {
            return <Empty>ข้อ {crit.id} ผ่านครบทั้ง 5 ระดับแล้ว</Empty>;
          }
          const todo = next.checks.filter((c) => !c.result.ok);
          return (
            <>
              <p className="voc-intro">
                ข้อ {crit.id} อยู่{levelLabel(crit.level)} — เหลืออีก {todo.length} จุดตรวจจะขึ้นระดับ {next.level}
              </p>
              <ol className="note-list">
                {todo.map((c) => (
                  <li key={c.id}>
                    <b>{c.label}</b>
                    <br />
                    <span className="hint">{c.result.detail}</span>
                  </li>
                ))}
              </ol>
              {onNavigate ? (
                <div className="row">
                  <button className="btn btn-g btn-sm" onClick={() => onNavigate("vocchan")}>
                    ไปหน้าช่องทางการรับฟัง
                  </button>
                  <button className="btn btn-g btn-sm" onClick={() => onNavigate("vocrec")}>
                    ไปหน้าเสียงของลูกค้า
                  </button>
                  <button className="btn btn-g btn-sm" onClick={() => onNavigate("vocsurvey")}>
                    ไปหน้าการประเมินความพึงพอใจ
                  </button>
                  <button className="btn btn-g btn-sm" onClick={() => onNavigate("vocaction")}>
                    ไปหน้าแผนปรับปรุงและนวัตกรรม
                  </button>
                </div>
              ) : null}
            </>
          );
        })()}
      </Card>

      <Card title="อ่านแถบระดับอย่างไร">
        <span className="hint">
          แถบตัวเลข 1-5 ข้างบนคือระดับของเกณฑ์ · สีเข้ม = ผ่านครบทุกจุดตรวจ ·
          สีเหลือง = ผ่านบางจุด · สีจาง = ยังไม่เริ่ม ·
          ระดับที่ผ่านแบบข้ามขั้นจะยังแสดงให้เห็น แต่ไม่นับเป็นระดับที่ได้ เพราะเกณฑ์เป็นแบบสะสม
        </span>
      </Card>

    </div>
  );
}
