// รายงานของหมวดการรับฟังลูกค้า — ประกอบตารางและไฟล์นำเสนอจากข้อมูลชุดเดียว
//
// ทำไมต้องแยกไฟล์นี้ออกจากหน้าจอ:
//   รายงานชุดเดียวกันออกได้สามทาง — บนหน้าจอ · ไฟล์ Excel · ไฟล์ PowerPoint
//   ถ้าแต่ละทางประกอบตัวเลขเอง วันหนึ่งจะมีทางหนึ่งที่ไม่ตรงกับอีกสองทาง
//   แล้วไม่มีใครรู้ว่าอันไหนถูก (เคยเกิดกับยอดขายเทียบเป้ามาแล้ว)
//   ที่นี่จึงประกอบเป็น "ตาราง" กลาง แล้วทั้งสามทางหยิบไปแสดงต่อ
//
// รูปแบบของตารางกลางคือ { name, head, rows } ซึ่งเป็นรูปแบบเดียวกับที่
// buildWorkbook ของ lib/xlsx.js รับอยู่แล้ว จึงส่งออก Excel ได้โดยไม่ต้องแปลงอะไรอีก

import { num, thDate, todayISO } from "./format.js";
import { THEME } from "./pptx.js";
import {
  CRITERIA,
  CUST_GROUPS,
  DIMENSIONS,
  LIFECYCLE,
  VOC_KINDS,
  actionKindOf,
  actionStatusOf,
  assessAll,
  avgResponseRate,
  freqOf,
  gapsOf,
  groupOf,
  lastQuarters,
  quarterKeyOf,
  surveyKindOf,
  surveyScore,
  surveyStatusOf,
  surveySummary,
  vocStatusOf,
  vocSummary,
} from "./voc.js";

/** ป้ายบอกระดับ ใช้ทั้งในตารางและในสไลด์ */
export const levelText = (n) => (n > 0 ? "ระดับ " + n : "ยังไม่ผ่านระดับ 1");

/* ========================================================================
 * ตารางของรายงาน
 * ====================================================================== */

/** 1. สรุประดับที่ได้รายข้อ */
export function levelSheet(assessment) {
  return {
    name: "ระดับที่ได้",
    head: ["เกณฑ์ข้อ", "ชื่อเกณฑ์", "ระดับที่ได้", "จุดตรวจที่ผ่าน", "จุดตรวจทั้งหมด", "ร้อยละ", "คะแนน", "น้ำหนัก"],
    rows: assessment.items.map((it) => [
      it.id,
      it.name,
      levelText(it.level),
      it.totalPassed,
      it.totalChecks,
      Number(it.percent.toFixed(1)),
      Number(it.score.toFixed(2)),
      it.weight,
    ]),
  };
}

/** 2. ความครบถ้วนของกระบวนการ — จุดตรวจทุกข้อ ผ่านหรือไม่ผ่าน เพราะอะไร */
export function processSheet(assessment) {
  return {
    name: "ความครบถ้วนของกระบวนการ",
    head: ["เกณฑ์ข้อ", "ระดับ", "จุดตรวจ", "ผล", "ผู้ตรวจ", "รายละเอียด", "หลักฐาน"],
    rows: assessment.items.flatMap((it) =>
      it.levels.flatMap((lv) =>
        lv.checks.map((ck) => [
          it.id,
          lv.level,
          ck.label,
          ck.result.ok ? "ผ่าน" : "ยังไม่ผ่าน",
          ck.result.auto ? "ระบบตรวจอัตโนมัติ" : "ยืนยันโดยผู้รับผิดชอบ",
          ck.result.detail,
          ck.result.evidence,
        ])
      )
    ),
  };
}

/** 3. สิ่งที่ยังขาด เรียงตามความเร่งด่วน */
export function gapSheet(assessment) {
  return {
    name: "สิ่งที่ยังต้องทำ",
    head: ["ลำดับ", "เกณฑ์ข้อ", "ระดับ", "สิ่งที่ยังขาด", "สถานะปัจจุบัน", "ผู้ตรวจ", "ความเร่งด่วน"],
    rows: gapsOf(assessment).map((g, i) => [
      i + 1,
      g.crit,
      g.level,
      g.label,
      g.detail,
      g.auto ? "ระบบตรวจอัตโนมัติ" : "ยืนยันโดยผู้รับผิดชอบ",
      g.blocking ? "ด่วน — ติดระดับที่กำลังจะขึ้น" : "รอได้",
    ]),
  };
}

/** 4. ช่องทางการรับฟังและความครอบคลุม */
export function channelSheet(db) {
  const records = db.vocRecords || [];
  return {
    name: "ช่องทางการรับฟัง",
    head: ["รหัส", "ชื่อช่องทาง", "ชนิด", "ดิจิทัล", "กลุ่มลูกค้า", "วงจรชีวิต", "ความถี่", "ผู้รับผิดชอบ", "เสียงที่รับมา", "สถานะ"],
    rows: (db.vocChannels || []).map((c) => [
      c.code,
      c.name,
      c.kind,
      c.kind === "SOCIAL" || c.kind === "WEB" || c.kind === "APP" ? "ใช่" : "ไม่ใช่",
      (c.groups || []).map((g) => groupOf(g).short).join(", "),
      (c.lifecycle || []).map((l) => (LIFECYCLE.find((x) => x.id === l) || {}).name || l).join(", "),
      freqOf(c.freq).name,
      c.owner,
      records.filter((r) => r.channelId === c.id).length,
      c.active ? "ใช้งาน" : "ปิดใช้งาน",
    ]),
  };
}

/** 5. สรุปเสียงลูกค้าทุกมิติ */
export function vocSheet(db) {
  const s = vocSummary(db);
  const rows = [];

  rows.push(["ภาพรวม", "จำนวนเรื่องทั้งหมด", s.total, ""]);
  rows.push(["ภาพรวม", "วิเคราะห์และจัดลำดับความสำคัญแล้ว", s.analyzed, pct(s.analyzed, s.total)]);
  rows.push(["ภาพรวม", "ปิดเรื่องแล้ว", s.closed, pct(s.closed, s.total)]);
  rows.push(["ภาพรวม", "ข้อร้องเรียน", s.complaints, pct(s.complaints, s.total)]);
  rows.push(["ภาพรวม", "ความสำคัญระดับสูง", s.highPriority, pct(s.highPriority, s.total)]);

  s.byGroup.forEach((g) => rows.push(["กลุ่มลูกค้า", g.name, g.count, pct(g.count, s.total)]));
  s.byLifecycle.forEach((l) =>
    rows.push(["วงจรชีวิต", l.name + (l.required ? " (เกณฑ์บังคับ)" : ""), l.count, pct(l.count, s.total)])
  );
  s.byDimension.forEach((d) => rows.push(["มิติ", d.name, d.count, pct(d.count, s.total)]));
  s.byProduct.forEach((p) => rows.push(["ผลิตภัณฑ์", p.name, p.count, pct(p.count, s.total)]));
  s.byKind.forEach((k) => rows.push(["ประเภทของเสียง", k.name, k.count, pct(k.count, s.total)]));
  s.byChannel.forEach((c) => rows.push(["ช่องทาง", c.name, c.count, pct(c.count, s.total)]));

  return { name: "สรุปเสียงของลูกค้า", head: ["มุมมอง", "รายการ", "จำนวนเรื่อง", "ร้อยละ"], rows };
}

/** 6. ผลการประเมินความพึงพอใจ ความไม่พึงพอใจ ความผูกพัน */
export function surveySheet(db) {
  const results = db.vocResults || [];
  return {
    name: "ผลการประเมิน",
    head: [
      "รหัสรอบ", "ชื่อรอบ", "ประเมินเรื่อง", "ปีงบ", "ความถี่", "ระเบียบวิธี", "วิธีสุ่ม",
      "กลุ่มตัวอย่าง", "ตอบกลับ", "ร้อยละตอบกลับ", "สถานะ", "คะแนนรวม (%)", "คู่เทียบ (%)",
    ],
    rows: (db.vocSurveys || []).map((s) => {
      const sc = surveyScore(results.filter((r) => r.surveyId === s.id));
      return [
        s.code,
        s.name,
        surveyKindOf(s.kind).name,
        s.year,
        freqOf(s.freq).name,
        s.method,
        s.sampling,
        s.sampleSize,
        s.responded,
        s.sampleSize ? Number(((s.responded / s.sampleSize) * 100).toFixed(1)) : 0,
        surveyStatusOf(s.status).name,
        sc.count ? Number(sc.percent.toFixed(1)) : "",
        sc.benchmark ? Number(sc.benchmark.toFixed(1)) : "",
      ];
    }),
  };
}

/** 7. ผลรายกลุ่มลูกค้า — ใช้ตอบเกณฑ์ 3.2 ระดับ 4 */
export function resultSheet(db) {
  const surveys = db.vocSurveys || [];
  return {
    name: "ผลรายกลุ่มลูกค้า",
    head: ["รอบ", "ประเมินเรื่อง", "กลุ่มลูกค้า", "ด้าน", "ผลิตภัณฑ์", "คะแนน", "คะแนนเต็ม", "ร้อยละ", "ผู้ตอบ", "คู่เทียบ (%)"],
    rows: (db.vocResults || []).map((r) => {
      const s = surveys.find((x) => x.id === r.surveyId);
      return [
        s ? s.code : "",
        s ? surveyKindOf(s.kind).name : "",
        groupOf(r.groupId).name,
        (DIMENSIONS.find((d) => d.id === r.dimension) || {}).name || r.dimension,
        r.productId || "ทุกผลิตภัณฑ์",
        Number(r.score),
        Number(r.full),
        Number(((r.score / r.full) * 100).toFixed(1)),
        r.respondents,
        r.benchmark ? Number(((r.benchmark / r.full) * 100).toFixed(1)) : "",
      ];
    }),
  };
}

/** 8. แผนงานและการนำสารสนเทศไปใช้ */
export function actionSheet(db) {
  const records = db.vocRecords || [];
  const surveys = db.vocSurveys || [];
  return {
    name: "แผนงานและการนำไปใช้",
    head: ["รหัส", "ชนิดงาน", "ตอบเกณฑ์", "ชื่อแผนงาน", "อ้างอิงจาก", "ผู้รับผิดชอบ", "กำหนดเสร็จ", "วันที่เสร็จ", "สถานะ", "ผลลัพธ์", "ที่จัดเก็บดิจิทัล"],
    rows: (db.vocActions || []).map((a) => {
      const s = a.surveyId ? surveys.find((x) => x.id === a.surveyId) : null;
      const r = a.recordId ? records.find((x) => x.id === a.recordId) : null;
      return [
        a.code,
        actionKindOf(a.kind).name,
        actionKindOf(a.kind).forLevel,
        a.title,
        s ? "รอบ " + s.code : r ? "เรื่อง " + r.code : "",
        a.owner,
        a.dueDate,
        a.doneDate,
        actionStatusOf(a.status).name,
        a.result,
        a.storeUrl,
      ];
    }),
  };
}

/** 9. รายการเสียงลูกค้าทั้งหมด (ข้อมูลดิบไว้ให้ตรวจย้อนหลัง) */
export function recordSheet(db) {
  const channels = db.vocChannels || [];
  return {
    name: "เสียงของลูกค้า",
    head: ["รหัส", "วันที่", "ช่องทาง", "กลุ่มลูกค้า", "วงจรชีวิต", "มิติ", "ผลิตภัณฑ์", "ประเภท", "ความสำคัญ", "เรื่อง", "ผู้ให้ข้อมูล", "สถานะ", "การตอบสนอง"],
    rows: (db.vocRecords || []).map((r) => {
      const c = channels.find((x) => x.id === r.channelId);
      return [
        r.code,
        r.date,
        c ? c.name : "",
        groupOf(r.groupId).name,
        (LIFECYCLE.find((l) => l.id === r.lifecycle) || {}).name || r.lifecycle,
        (DIMENSIONS.find((d) => d.id === r.dimension) || {}).name || r.dimension,
        r.productId,
        (VOC_KINDS.find((k) => k.id === r.kind) || {}).name || r.kind,
        r.priority,
        r.subject,
        r.partyName,
        vocStatusOf(r.status).name,
        r.response,
      ];
    }),
  };
}

const pct = (n, total) => (total ? Number(((n / total) * 100).toFixed(1)) : 0);

/**
 * ทุกชีตของรายงาน เรียงตามลำดับที่คนอ่านจริง:
 * สรุปก่อน แล้วค่อยลงรายละเอียด แล้วจบด้วยข้อมูลดิบ
 */
export function reportSheets(db) {
  const assessment = assessAll(db);
  return [
    levelSheet(assessment),
    gapSheet(assessment),
    processSheet(assessment),
    channelSheet(db),
    vocSheet(db),
    surveySheet(db),
    resultSheet(db),
    actionSheet(db),
    recordSheet(db),
  ];
}

/* ========================================================================
 * ไฟล์นำเสนอ
 * ====================================================================== */

/**
 * ประกอบสไลด์สำหรับรายงานผู้บริหาร
 *
 * ลำดับของสไลด์ตั้งใจให้ตอบสามคำถามของผู้บริหารตามลำดับ:
 *   1. ตอนนี้อยู่ระดับไหน (และคะแนนเท่าไร)
 *   2. ที่ทำไปแล้วมีอะไรบ้าง (หลักฐาน)
 *   3. ต้องทำอะไรต่อ ใครทำ เมื่อไร
 *
 * @param {object} db ข้อมูลทั้งกอง
 * @param {object} opts ตัวเลือก เช่น ชื่อหน่วยงาน
 */
export function buildDeck(db, opts = {}) {
  const org = opts.org || "";
  const assessment = assessAll(db);
  const voc = vocSummary(db);
  const surveys = surveySummary(db);
  const gaps = gapsOf(assessment);
  const blocking = gaps.filter((g) => g.blocking);
  const actions = db.vocActions || [];
  const doneActions = actions.filter((a) => actionStatusOf(a.status).done);

  const slides = [];

  /* ---------- ปก ---------- */
  slides.push({
    kind: "cover",
    title: "การรับฟังลูกค้า",
    subtitle: "รายงานความคืบหน้าตามเกณฑ์ประเมินรัฐวิสาหกิจ หมวด 3 (น้ำหนัก 10%)",
    meta: [
      { label: "ระดับของหมวด", value: levelText(assessment.level) },
      { label: "คะแนนที่ได้", value: num(assessment.score, 2) + " / " + num(assessment.weight, 0) },
      { label: "จุดตรวจที่ผ่าน", value: assessment.totalPassed + " / " + assessment.totalChecks },
      { label: "ข้อมูล ณ วันที่", value: thDate(todayISO()) },
    ],
  });

  /* ---------- สรุประดับ ---------- */
  slides.push({
    kind: "table",
    kicker: "สรุปผู้บริหาร",
    title: "ระดับที่ได้ของแต่ละข้อ",
    head: ["เกณฑ์", "ชื่อเกณฑ์", "ระดับที่ได้", "จุดตรวจที่ผ่าน", "คะแนน"],
    rows: assessment.items.map((it) => [
      it.id,
      it.name,
      levelText(it.level),
      it.totalPassed + " / " + it.totalChecks,
      num(it.score, 2) + " / " + num(it.weight, 0),
    ]),
    widths: [1, 5, 2, 2, 2],
    align: ["l", "l", "l", "r", "r"],
    note: "ระดับของทั้งหมวดตัดสินจากข้อย่อยที่อ่อนที่สุด และเกณฑ์เป็นแบบสะสม",
  });

  /* ---------- ความคืบหน้ารายระดับ ---------- */
  assessment.items.forEach((it) => {
    slides.push({
      kind: "bars",
      kicker: "ข้อ " + it.id + " " + it.name,
      title: "ความคืบหน้ารายระดับ",
      bars: it.levels.map((lv) => ({
        label: "ระดับ " + lv.level,
        value: lv.passed,
        max: lv.total,
        text: lv.passed + " / " + lv.total + (lv.complete ? "  ครบ" : ""),
        color: lv.complete ? THEME.ok : lv.passed ? THEME.warn : THEME.line,
      })),
      note: it.next
        ? "ระดับถัดไปคือระดับ " + it.next.level + " — เหลืออีก " +
          it.next.checks.filter((c) => !c.result.ok).length + " จุดตรวจ"
        : "ผ่านครบทั้ง 5 ระดับแล้ว",
    });
  });

  /* ---------- เสียงของลูกค้า ---------- */
  slides.push({
    kind: "bars",
    kicker: "ข้อ 3.1 การรับฟังลูกค้า",
    title: "เสียงของลูกค้าแยกตามกลุ่มและช่วงวงจรชีวิต",
    bars: [
      ...voc.byGroup.map((g) => ({ label: g.name, value: g.count, text: num(g.count, 0) + " เรื่อง" })),
      ...voc.byLifecycle
        .filter((l) => l.required)
        .map((l) => ({
          label: l.name,
          value: l.count,
          text: num(l.count, 0) + " เรื่อง",
          color: l.count ? THEME.accent : THEME.err,
        })),
    ],
    note:
      "รวม " + num(voc.total, 0) + " เรื่อง · วิเคราะห์แล้ว " + num(voc.analyzed, 0) +
      " เรื่อง · ปิดแล้ว " + num(voc.closed, 0) + " เรื่อง",
  });

  slides.push({
    kind: "table",
    kicker: "ข้อ 3.1 การรับฟังลูกค้า",
    title: "ความครอบคลุมตามมิติที่เกณฑ์กำหนด",
    head: ["มิติของความต้องการ", "จำนวนเรื่อง", "สัดส่วน", "ผล"],
    rows: voc.byDimension.map((d) => [
      d.name,
      num(d.count, 0),
      pct(d.count, voc.total) + "%",
      d.count ? "มีข้อมูล" : "ยังไม่มีข้อมูล",
    ]),
    widths: [5, 2, 2, 2],
    align: ["l", "r", "r", "l"],
  });

  /* ---------- ผลการประเมิน ---------- */
  const coreSurveys = surveys.filter((s) => s.core);
  slides.push({
    kind: "table",
    kicker: "ข้อ 3.2 การประเมินความพึงพอใจ",
    title: "ผลการประเมินแยกตามเรื่องและกลุ่มลูกค้า",
    head: ["ประเมินเรื่อง", "รอบ", "รายงานผลแล้ว", ...CUST_GROUPS.map((g) => g.short), "ภาพรวม"],
    rows: coreSurveys.map((s) => [
      s.name,
      num(s.rounds, 0),
      num(s.done, 0),
      ...s.byGroup.map((g) => (g.count ? num(g.percent, 1) + "%" : "-")),
      s.overall.count ? num(s.overall.percent, 1) + "%" : "-",
    ]),
    widths: [4, 1, 1, 2, 2, 2],
    align: ["l", "r", "r", "r", "r", "r"],
    note:
      "ร้อยละการตอบกลับเฉลี่ย " +
      num(avgResponseRate((db.vocSurveys || []).filter((s) => surveyStatusOf(s.status).done)), 1) +
      "% — เกณฑ์ระดับ 5 ใช้ตัวเลขนี้ประเมินประสิทธิผลของแนวทาง",
  });

  /* ---------- การนำไปใช้ ---------- */
  const quarters = lastQuarters(4);
  const reported = new Set(
    actions
      .filter((a) => a.kind === "REPORT" && actionStatusOf(a.status).done)
      .map((a) => quarterKeyOf(a.doneDate || a.dueDate))
  );
  slides.push({
    kind: "bullets",
    kicker: "การนำสารสนเทศไปใช้",
    title: "หลักฐานตามเกณฑ์ระดับ 4-5",
    bullets: [
      {
        text: "รายงานต่อผู้บริหารรายไตรมาส: " + quarters.filter((q) => reported.has(q)).length + " จาก 4 ไตรมาส",
        sub: quarters.map((q) => q + (reported.has(q) ? " (มี)" : " (ยังไม่มี)")).join(" · "),
      },
      {
        text: "แผนงานที่ดำเนินการแล้ว " + doneActions.length + " รายการ จากทั้งหมด " + actions.length + " รายการ",
        sub: summarizeKinds(doneActions),
      },
      {
        text:
          "ความรู้และนวัตกรรมที่จัดเก็บลงระบบดิจิทัล: " +
          doneActions.filter((a) => (a.kind === "KM" || a.kind === "INNOVATION") && a.storeUrl).length +
          " รายการ",
        sub: "เกณฑ์ระดับ 5 บังคับให้ระบุที่จัดเก็บทุกรายการ",
      },
    ],
  });

  /* ---------- สิ่งที่ต้องทำต่อ ---------- */
  const todo = (blocking.length ? blocking : gaps).slice(0, 7);
  slides.push({
    kind: "bullets",
    kicker: "แผนถัดไป",
    title: blocking.length ? "สิ่งที่ต้องทำเพื่อขึ้นระดับถัดไป" : "สิ่งที่ยังต้องทำ",
    bullets: todo.length
      ? todo.map((g) => ({ text: "[" + g.crit + " ระดับ " + g.level + "] " + g.label, sub: g.detail }))
      : [{ text: "ผ่านครบทุกจุดตรวจแล้ว", sub: "รักษาระดับและทบทวนตามรอบที่กำหนด" }],
    note: org ? "จัดทำโดย " + org : "",
  });

  return {
    title: "รายงานความคืบหน้า หมวด 3 การรับฟังลูกค้า",
    author: opts.author || "One for All Ultra",
    company: org,
    slides,
  };
}

/** สรุปว่าที่ทำเสร็จแล้วเป็นงานชนิดไหนบ้าง */
function summarizeKinds(list) {
  const map = new Map();
  list.forEach((a) => map.set(a.kind, (map.get(a.kind) || 0) + 1));
  const parts = [...map.entries()].map(([k, n]) => actionKindOf(k).name + " " + n);
  return parts.length ? parts.join(" · ") : "ยังไม่มีแผนงานที่ดำเนินการแล้ว";
}

/**
 * ข้อความสรุปสั้น ๆ สำหรับผู้บริหาร — ใช้บนหน้าจอและหัวรายงาน
 * เขียนเป็นประโยค ไม่ใช่ตัวเลขลอย ๆ เพราะผู้บริหารอ่านบรรทัดเดียวแล้วต้องเข้าใจ
 */
export function executiveSummary(db) {
  const a = assessAll(db);
  const gaps = gapsOf(a);
  const blocking = gaps.filter((g) => g.blocking);
  const weakest = a.items.slice().sort((x, y) => x.level - y.level)[0];

  return {
    level: a.level,
    score: a.score,
    weight: a.weight,
    headline:
      "หมวด 3 การรับฟังลูกค้าอยู่ที่" + levelText(a.level) +
      " คะแนน " + num(a.score, 2) + " จาก " + num(a.weight, 0) +
      " (ผ่าน " + a.totalPassed + " จาก " + a.totalChecks + " จุดตรวจ)",
    weakest: weakest
      ? "จุดที่อ่อนที่สุดคือข้อ " + weakest.id + " " + weakest.name + " ซึ่งอยู่ที่" + levelText(weakest.level)
      : "",
    next: blocking.length
      ? "เหลืออีก " + blocking.length + " จุดตรวจจะขึ้นระดับถัดไป"
      : gaps.length
      ? "เหลืออีก " + gaps.length + " จุดตรวจจะครบทุกระดับ"
      : "ผ่านครบทุกจุดตรวจแล้ว",
    gaps,
    blocking,
    items: a.items,
  };
}
