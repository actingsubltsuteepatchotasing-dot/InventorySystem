"use client";

// หน้าจอภาพรวมของหมวดการรับฟังลูกค้า
//
// หน้าแรกของหมวด — ตอบสามอย่างในหน้าเดียว:
//   1. ตอนนี้อยู่ระดับไหนของเกณฑ์ และคะแนนเท่าไร
//   2. เสียงลูกค้าที่รับฟังมามีเท่าไร มาจากไหน ครบทุกกลุ่มหรือยัง
//   3. งานที่ค้างอยู่คืออะไร และจะไปทำต่อที่หน้าไหน
//
// ตัวเลขทุกตัวคำนวณสดจากข้อมูลจริง ไม่มีตัวไหนที่คนพิมพ์ใส่เอง

import { useMemo } from "react";
import { useInv } from "@/lib/store";
import { num, thDate, todayISO } from "@/lib/format";
import {
  CUST_GROUPS,
  actionStatusOf,
  assessAll,
  avgResponseRate,
  surveyStatusOf,
  surveySummary,
  vocStatusOf,
  vocSummary,
} from "@/lib/voc";
import { executiveSummary, levelText } from "@/lib/vocReport";
import { Badge, Card, Empty, Kpi, TableWrap } from "../ui";
import { IcChart, IcData, IcPin, IcReport } from "../Icons";
import SetupNotice from "../SetupNotice";
import { VOC_TABLES } from "./vocShared";

export default function VocDash({ onNavigate }) {
  const inv = useInv();
  const { db } = inv;

  const assessment = useMemo(() => (inv.vocReady ? assessAll(db) : null), [db, inv.vocReady]);
  const summary = useMemo(() => (inv.vocReady ? executiveSummary(db) : null), [db, inv.vocReady]);
  const voc = useMemo(() => (inv.vocReady ? vocSummary(db) : null), [db, inv.vocReady]);
  const surveys = useMemo(() => (inv.vocReady ? surveySummary(db) : []), [db, inv.vocReady]);

  if (!inv.vocReady) {
    return <SetupNotice feature="หมวดการรับฟังลูกค้า" tables={VOC_TABLES} />;
  }

  const records = db.vocRecords || [];
  const actions = db.vocActions || [];
  const rounds = db.vocSurveys || [];
  const overdue = actions.filter(
    (a) => a.dueDate && a.dueDate < todayISO() && !actionStatusOf(a.status).done
  );
  const openHigh = records.filter((r) => r.priority === "HIGH" && !vocStatusOf(r.status).closed);
  const doneRounds = rounds.filter((s) => surveyStatusOf(s.status).done);

  const go = (id) => () => (onNavigate ? onNavigate(id) : undefined);

  return (
    <div className="stack">
      <Card title="ระดับตามเกณฑ์ประเมินรัฐวิสาหกิจ หมวด 3 (น้ำหนัก 10%)">
        <div className="voc-exec">
          <div className={"voc-lv lv" + assessment.level}>{levelText(assessment.level)}</div>
          <div>
            <b>{summary.headline}</b>
            <p>{summary.weakest}</p>
            <p>{summary.next}</p>
          </div>
        </div>

        <div className="voc-cover">
          {assessment.items.map((it) => (
            <div key={it.id}>
              <div className="lbl">
                ข้อ {it.id} {it.name}
              </div>
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
              <span className="hint">
                {levelText(it.level)} · ผ่าน {num(it.totalPassed, 0)}/{num(it.totalChecks, 0)} จุดตรวจ ·
                คะแนน {num(it.score, 2)}/{num(it.weight, 0)}
              </span>
            </div>
          ))}
        </div>

        <div className="row">
          <button className="btn btn-p btn-sm" onClick={go("voclevel")}>
            ดูรายละเอียดจุดตรวจทุกข้อ
          </button>
          <button className="btn btn-g btn-sm" onClick={go("vocreport")}>
            รายงานและไฟล์นำเสนอ
          </button>
        </div>
      </Card>

      <div className="grid g4" style={{ marginBottom: 12 }}>
        <Kpi
          icon={<IcReport size={18} />}
          label="เสียงของลูกค้า"
          value={num(voc.total, 0)}
          sub={"วิเคราะห์แล้ว " + num(voc.analyzed, 0) + " · ปิดแล้ว " + num(voc.closed, 0)}
        />
        <Kpi
          icon={<IcPin size={18} />}
          label="ช่องทางที่เปิดใช้งาน"
          value={num((db.vocChannels || []).filter((c) => c.active).length, 0)}
          sub={"จากทั้งหมด " + num((db.vocChannels || []).length, 0) + " ช่องทาง"}
        />
        <Kpi
          icon={<IcChart size={18} />}
          label="รอบประเมินที่รายงานผลแล้ว"
          value={num(doneRounds.length, 0)}
          sub={"ตอบกลับเฉลี่ย " + num(avgResponseRate(doneRounds), 1) + "%"}
          kind={doneRounds.length ? "" : "warn"}
        />
        <Kpi
          icon={<IcData size={18} />}
          label="แผนงานที่ยังไม่เสร็จ"
          value={num(actions.filter((a) => !actionStatusOf(a.status).done).length, 0)}
          sub={overdue.length ? "เลยกำหนดแล้ว " + num(overdue.length, 0) + " รายการ" : "ไม่มีรายการเลยกำหนด"}
          kind={overdue.length ? "warn" : ""}
        />
      </div>

      <div className="grid-2">
        <Card
          title="เสียงลูกค้าแยกตามกลุ่มและช่วงวงจรชีวิต"
          actions={
            <button className="btn btn-g btn-sm" onClick={go("vocrec")}>
              บันทึกเสียงลูกค้า
            </button>
          }
        >
          {!voc.total ? (
            <Empty>ยังไม่มีการบันทึกเสียงของลูกค้า</Empty>
          ) : (
            <>
              <div className="lbl">กลุ่มลูกค้า</div>
              {voc.byGroup.map((g) => (
                <Bar key={g.id} label={g.name} value={g.count} max={voc.total} />
              ))}

              <div className="lbl" style={{ marginTop: 10 }}>
                ช่วงวงจรชีวิต (ที่มีดอกจันคือเกณฑ์บังคับ)
              </div>
              {voc.byLifecycle.map((l) => (
                <Bar
                  key={l.id}
                  label={l.name + (l.required ? " *" : "")}
                  value={l.count}
                  max={voc.total}
                  warn={l.required && !l.count}
                />
              ))}
            </>
          )}
        </Card>

        <Card
          title="ความครอบคลุมตามมิติที่เกณฑ์กำหนด"
          actions={
            <button className="btn btn-g btn-sm" onClick={go("vocchan")}>
              ช่องทางการรับฟัง
            </button>
          }
        >
          {!voc.total ? (
            <Empty>ยังไม่มีข้อมูลให้สรุป</Empty>
          ) : (
            voc.byDimension.map((d) => (
              <Bar key={d.id} label={d.name} value={d.count} max={voc.total} warn={!d.count} />
            ))
          )}

          <div className="lbl" style={{ marginTop: 10 }}>
            ผลิตภัณฑ์ที่ถูกพูดถึงมากที่สุด
          </div>
          {voc.byProduct
            .slice()
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
            .map((p) => (
              <Bar key={p.id} label={p.name} value={p.count} max={voc.total} />
            ))}
        </Card>
      </div>

      <Card
        title="ผลการประเมินความพึงพอใจ ความไม่พึงพอใจ และความผูกพัน"
        actions={
          <button className="btn btn-g btn-sm" onClick={go("vocsurvey")}>
            จัดการรอบประเมิน
          </button>
        }
      >
        {!rounds.length ? (
          <Empty>ยังไม่มีรอบการประเมิน — เกณฑ์ข้อ 3.2 ต้องมีครบทั้งความพึงพอใจ ความไม่พึงพอใจ และความผูกพัน</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th>ประเมินเรื่อง</th>
                <th className="num">จำนวนรอบ</th>
                <th className="num">รายงานผลแล้ว</th>
                {CUST_GROUPS.map((g) => (
                  <th key={g.id} className="num">{g.short}</th>
                ))}
                <th className="num">ภาพรวม</th>
                <th>ผลตามเกณฑ์</th>
              </tr>
            </thead>
            <tbody>
              {surveys.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="num">{num(s.rounds, 0)}</td>
                  <td className="num">{num(s.done, 0)}</td>
                  {s.byGroup.map((g) => (
                    <td key={g.id} className="num">
                      {g.count ? num(g.percent, 1) + "%" : "-"}
                    </td>
                  ))}
                  <td className="num">{s.overall.count ? num(s.overall.percent, 1) + "%" : "-"}</td>
                  <td>
                    {!s.core ? (
                      <Badge kind="gray">ไม่บังคับ</Badge>
                    ) : s.rounds ? (
                      <Badge kind="ok">มีรอบประเมินแล้ว</Badge>
                    ) : (
                      <Badge kind="err">ยังไม่มีรอบประเมิน</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {openHigh.length || overdue.length ? (
        <Card title="งานที่ต้องตามวันนี้">
          <ul className="note-list">
            {openHigh.slice(0, 5).map((r) => (
              <li key={r.id}>
                เสียงลูกค้าความสำคัญสูงที่ยังไม่ปิด: <b>{r.code}</b> {r.subject}
                {r.dueDate ? " (กำหนด " + thDate(r.dueDate) + ")" : ""}
              </li>
            ))}
            {overdue.slice(0, 5).map((a) => (
              <li key={a.id}>
                แผนงานเลยกำหนด: <b>{a.code}</b> {a.title} (กำหนด {thDate(a.dueDate)})
              </li>
            ))}
          </ul>
          <div className="row">
            <button className="btn btn-g btn-sm" onClick={go("vocrec")}>
              ไปหน้าเสียงของลูกค้า
            </button>
            <button className="btn btn-g btn-sm" onClick={go("vocaction")}>
              ไปหน้าแผนปรับปรุง
            </button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/** แถบสัดส่วนหนึ่งแถว — วาดเองด้วย div ไม่ใช้ไลบรารีกราฟ */
function Bar({ label, value, max, warn }) {
  const pct = max ? (value / max) * 100 : 0;
  return (
    <div className="voc-bar">
      <span title={label}>{label}</span>
      <div className="voc-bar-track">
        {/* ค่าที่ไม่ใช่ศูนย์ให้กว้างอย่างน้อย 2% ไม่งั้นแถบบางจนมองไม่เห็นว่ามีข้อมูล */}
        <i
          className={"voc-bar-fill" + (warn ? " warn" : "")}
          style={{ width: Math.max(pct, value ? 2 : 0) + "%" }}
        />
      </div>
      <b>{num(value, 0)}</b>
    </div>
  );
}
