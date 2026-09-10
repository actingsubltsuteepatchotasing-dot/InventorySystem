"use client";

// หน้าจอรายงานและนำเสนอของหมวดการรับฟังลูกค้า
//
// รายงานทุกชุดในหน้านี้มาจาก lib/vocReport.js ชุดเดียวกัน
// ที่แสดงบนจอ ที่ส่งออก Excel และที่อยู่ในไฟล์ PowerPoint จึงเป็นตัวเลขเดียวกันเสมอ
// ไม่มีทางที่สามทางนี้จะไม่ตรงกัน เพราะไม่มีใครคำนวณเองเลยสักทาง
//
// ไฟล์นำเสนอเป็น .pptx จริง (แก้ต่อได้) ไม่ใช่ภาพหรือ PDF
//   ไฟล์นำเสนอถูกเอาไปแก้ต่อเสมอ — เพิ่มสไลด์ ปรับถ้อยคำ ใส่ตราหน่วยงาน
//   ไฟล์ที่แก้ไม่ได้จะถูกพิมพ์ใหม่ด้วยมือทุกครั้ง แล้วตัวเลขจะไม่ตรงกับระบบ

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { downloadWorkbook } from "@/lib/xlsx";
import { downloadPPTX } from "@/lib/pptx";
import { num, thDate, todayISO } from "@/lib/format";
import { buildDeck, executiveSummary, levelText, reportSheets } from "@/lib/vocReport";
import { usePrint } from "../Print";
import { useToast } from "../Toast";
import { Badge, Card, Empty, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";
import { VOC_TABLES } from "./vocShared";

export default function VocReports({ onNavigate }) {
  const inv = useInv();
  const { db } = inv;
  const toast = useToast();
  const print = usePrint();

  const sheets = useMemo(() => (inv.vocReady ? reportSheets(db) : []), [db, inv.vocReady]);
  const summary = useMemo(() => (inv.vocReady ? executiveSummary(db) : null), [db, inv.vocReady]);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);

  const org = (db.company && db.company.name) || "";
  const stamp = todayISO();

  function exportExcel() {
    try {
      downloadWorkbook(sheets, "รายงานการรับฟังลูกค้า-หมวด3-" + stamp);
      toast("ส่งออกไฟล์ Excel " + sheets.length + " ชีตแล้ว", "ok");
    } catch (e) {
      toast("ส่งออกไม่สำเร็จ: " + e.message, "err");
    }
  }

  function exportPPT() {
    if (busy) return;
    setBusy(true);
    try {
      const deck = buildDeck(db, { org });
      downloadPPTX(deck, "นำเสนอการรับฟังลูกค้า-หมวด3-" + stamp);
      toast("ส่งออกไฟล์นำเสนอ " + deck.slides.length + " สไลด์แล้ว", "ok");
    } catch (e) {
      toast("ส่งออกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  /*
   * พิมพ์ผ่านระบบพิมพ์ของโปรแกรม ไม่ใช่ window.print() ตรง ๆ
   * ทั้งแอปถูกครอบด้วย .no-print อยู่ ถ้าสั่งพิมพ์ตรง ๆ จะได้กระดาษเปล่า
   * ต้องส่งเนื้อหาเข้า #printRoot ก่อน (ดู components/Print.js)
   */
  function printReport() {
    const s = sheets[tab] || sheets[0];
    if (!s || !s.rows.length) return toast("ไม่มีข้อมูลให้พิมพ์", "warn");

    print({
      title: "หมวด 3 การรับฟังลูกค้า — " + s.name,
      subtitle:
        summary.headline + " · ข้อมูล ณ วันที่ " + thDate(stamp) + (org ? " · " + org : ""),
      body: (
        <table>
          <thead>
            <tr>
              {s.head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.rows.map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j} className={typeof v === "number" ? "num" : ""}>
                    {typeof v === "number" ? num(v, Number.isInteger(v) ? 0 : 1) : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ),
    });
  }

  if (!inv.vocReady) {
    return <SetupNotice feature="หน้าจอรายงานการรับฟังลูกค้า" tables={VOC_TABLES} />;
  }

  const sheet = sheets[tab] || sheets[0];

  return (
    <div className="stack">
      <Card
        title="สรุปสำหรับผู้บริหาร"
        actions={
          <>
            <button className="btn btn-g btn-sm" onClick={exportExcel}>
              Excel ({sheets.length} ชีต)
            </button>
            <button className="btn btn-p btn-sm" onClick={exportPPT} disabled={busy}>
              {busy ? "กำลังสร้าง…" : "PowerPoint"}
            </button>
            <button className="btn btn-o btn-sm" onClick={printReport}>
              พิมพ์ / PDF
            </button>
          </>
        }
      >
        <div className="voc-exec">
          <div className={"voc-lv lv" + summary.level}>{levelText(summary.level)}</div>
          <div>
            <b>{summary.headline}</b>
            <p>{summary.weakest}</p>
            <p>{summary.next}</p>
          </div>
        </div>

        <div className="voc-cover">
          {summary.items.map((it) => (
            <div key={it.id}>
              <div className="lbl">
                ข้อ {it.id} {it.name}
              </div>
              <div className="sp">
                <Badge kind={it.level >= 3 ? "ok" : it.level >= 1 ? "warn" : "err"}>
                  {levelText(it.level)}
                </Badge>
                <Badge kind="gray">
                  ผ่าน {it.totalPassed}/{it.totalChecks} จุดตรวจ
                </Badge>
                <Badge kind="info">
                  คะแนน {num(it.score, 2)}/{num(it.weight, 0)}
                </Badge>
              </div>
            </div>
          ))}
        </div>

        <span className="hint">
          ข้อมูล ณ วันที่ {thDate(stamp)}
          {org ? " · " + org : ""} · ไฟล์นำเสนอเป็น .pptx จริงที่เปิดแก้ต่อใน PowerPoint ได้
        </span>
      </Card>

      {summary.blocking.length ? (
        <Card title={"ต้องทำก่อนเพื่อขึ้นระดับถัดไป (" + summary.blocking.length + " จุดตรวจ)"}>
          <ol className="note-list">
            {summary.blocking.map((g) => (
              <li key={g.checkId}>
                <b>
                  [ข้อ {g.crit} ระดับ {g.level}] {g.label}
                </b>
                <br />
                <span className="hint">{g.detail}</span>
              </li>
            ))}
          </ol>
          {onNavigate ? (
            <div className="row">
              <button className="btn btn-g btn-sm" onClick={() => onNavigate("voclevel")}>
                ไปหน้าประเมินระดับตามเกณฑ์
              </button>
              <button className="btn btn-g btn-sm" onClick={() => onNavigate("vocaction")}>
                ไปหน้าแผนปรับปรุงและนวัตกรรม
              </button>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card
        title="รายงานทั้งหมด"
        actions={
          <>
            {sheets.map((s, i) => (
              <button
                key={s.name}
                className={"btn btn-sm " + (tab === i ? "btn-p" : "btn-g")}
                onClick={() => setTab(i)}
              >
                {s.name}
              </button>
            ))}
          </>
        }
      >
        {!sheet || !sheet.rows.length ? (
          <Empty>ยังไม่มีข้อมูลในรายงานชุดนี้</Empty>
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  {sheet.head.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((v, j) => (
                      <td key={j} className={typeof v === "number" ? "num" : ""}>
                        {typeof v === "number" ? num(v, Number.isInteger(v) ? 0 : 1) : v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <span className="hint">
              {sheet.name} · {num(sheet.rows.length, 0)} แถว ·
              ส่งออกทั้ง {sheets.length} ชีตพร้อมกันได้จากปุ่ม Excel ด้านบน
            </span>
          </>
        )}
      </Card>
    </div>
  );
}
