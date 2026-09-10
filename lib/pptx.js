// ส่งออกเป็นไฟล์นำเสนอ PowerPoint (.pptx) จริง — เขียน XML เอง ไม่ใช้ไลบรารี
//
// ทำไมต้องเป็น .pptx จริง ไม่ใช่ PDF หรือหน้าเว็บที่พิมพ์ออกมา:
//   ไฟล์นำเสนอถูกเอาไปแก้ต่อเสมอ — เพิ่มสไลด์ ปรับถ้อยคำ ใส่โลโก้หน่วยงาน
//   ไฟล์ที่แก้ไม่ได้จะถูกพิมพ์ใหม่ด้วยมือทุกครั้ง แล้วตัวเลขในสไลด์จะไม่ตรงกับระบบ
//
// .pptx คือไฟล์ zip ที่ข้างในเป็น XML หลายไฟล์ (Open XML) เหมือน .xlsx
// จึงใช้ตัวประกอบ zip ตัวเดียวกันที่ lib/zip.js
//
// สิ่งที่ PowerPoint บังคับว่าต้องมี ขาดไม่ได้แม้แต่ไฟล์เดียว:
//   [Content_Types].xml        บอกชนิดของทุกไฟล์ในซิป
//   _rels/.rels                ชี้ว่าไฟล์หลักคืออันไหน
//   ppt/presentation.xml       รายการสไลด์และขนาดหน้า
//   ppt/slideMasters/          แม่แบบ (ต้องมีอย่างน้อยหนึ่ง)
//   ppt/slideLayouts/          เค้าโครง (ต้องมีอย่างน้อยหนึ่ง)
//   ppt/theme/theme1.xml       ชุดสีและฟอนต์ (ต้องครบทุกส่วนย่อย ไม่งั้นเปิดไม่ขึ้น)
//   ไฟล์ .rels ของแต่ละส่วนที่อ้างถึงกัน
//
// วางตำแหน่งทุกอย่างเองเป็นพิกัดตรง ๆ ไม่ใช้ placeholder ของเค้าโครง
//   placeholder ต้องพึ่งเค้าโครงและแม่แบบให้ตรงกันเป๊ะ ผิดนิดเดียว PowerPoint
//   จะซ่อนข้อความทิ้งเงียบ ๆ โดยไม่ฟ้อง กล่องข้อความธรรมดาควบคุมได้แน่นอนกว่า

import { xmlEsc, zip } from "./zip.js";

/* ------------------------------------------------------------- หน่วยและสี */

/** EMU — หน่วยของ Open XML: 1 นิ้ว = 914400 EMU */
const IN = 914400;
/** 1 พอยต์ = 12700 EMU */
const PT = 12700;

/** ขนาดสไลด์ 16:9 มาตรฐาน (13.333 x 7.5 นิ้ว) */
const SLIDE_W = 12192000;
const SLIDE_H = 6858000;

/** ชุดสีของเอกสาร — ใช้โทนเดียวกับตราสัญลักษณ์ */
export const THEME = {
  brand: "00693C", // เขียวหลัก
  brandDark: "004E2C",
  brandLight: "E8F1EC",
  accent: "F26A21", // ส้มของเปลวไฟ
  ink: "1B2B22",
  muted: "5B6B62",
  line: "D6E0DA",
  paper: "FFFFFF",
  ok: "0F8A4D",
  warn: "B26A00",
  err: "C0392B",
};

/**
 * ฟอนต์ที่ใช้ทั้งไฟล์
 *
 * Tahoma เพราะมีทั้งบน Windows และใน Office for Mac และแสดงภาษาไทยได้ครบ
 * ข้อความไทยถูกจัดเป็น "complex script" ต้องตั้งที่ a:cs ด้วย ไม่ใช่แค่ a:latin
 * (ตั้งแต่ a:latin อย่างเดียว ตัวไทยจะตกไปใช้ฟอนต์เริ่มต้นแล้วสระลอย)
 */
const FONT = "Tahoma";

/* ------------------------------------------------------------ ตัวช่วย XML */

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const NS_A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const NS_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const NS_P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

/**
 * ย่อหน้าหนึ่งย่อหน้าใน DrawingML
 * @param {object} o รูปแบบของย่อหน้า
 */
function para(o) {
  const size = Math.round((o.size || 18) * 100);
  const color = o.color || THEME.ink;
  const align = o.align ? ' algn="' + o.align + '"' : "";
  const indent = o.indent ? ' marL="' + o.indent * IN + '" lvl="' + Math.min(8, o.level || 1) + '"' : "";
  const bullet = o.bullet
    ? '<a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="•"/>'
    : "<a:buNone/>";
  const space = o.space ? '<a:spcBef><a:spcPts val="' + Math.round(o.space * 100) + '"/></a:spcBef>' : "";

  const runs = (Array.isArray(o.runs) ? o.runs : [{ text: o.text || "" }])
    .map((r) => {
      const rs = Math.round((r.size || o.size || 18) * 100);
      const rc = r.color || color;
      const b = r.bold || o.bold ? ' b="1"' : "";
      const i = r.italic ? ' i="1"' : "";
      return (
        '<a:r><a:rPr lang="th-TH" sz="' + rs + '"' + b + i + ' dirty="0">' +
        '<a:solidFill><a:srgbClr val="' + rc + '"/></a:solidFill>' +
        '<a:latin typeface="' + FONT + '"/><a:cs typeface="' + FONT + '"/>' +
        "</a:rPr><a:t>" + xmlEsc(r.text) + "</a:t></a:r>"
      );
    })
    .join("");

  return (
    "<a:p><a:pPr" + align + indent + ">" + space + bullet + "</a:pPr>" + runs +
    '<a:endParaRPr lang="th-TH" sz="' + size + '"/></a:p>'
  );
}

/** กล่องข้อความหนึ่งกล่อง */
function textBox(id, x, y, w, h, paras, opts = {}) {
  const anchor = opts.anchor || "t";
  const fill = opts.fill
    ? '<a:solidFill><a:srgbClr val="' + opts.fill + '"/></a:solidFill>'
    : "<a:noFill/>";
  const line = opts.line
    ? '<a:ln w="' + Math.round((opts.lineWidth || 1) * PT) + '"><a:solidFill><a:srgbClr val="' +
      opts.line + '"/></a:solidFill></a:ln>'
    : "<a:ln><a:noFill/></a:ln>";
  const inset =
    ' lIns="' + Math.round((opts.pad === undefined ? 0.12 : opts.pad) * IN) + '"' +
    ' tIns="' + Math.round((opts.padY === undefined ? 0.06 : opts.padY) * IN) + '"' +
    ' rIns="' + Math.round((opts.pad === undefined ? 0.12 : opts.pad) * IN) + '"' +
    ' bIns="' + Math.round((opts.padY === undefined ? 0.06 : opts.padY) * IN) + '"';

  return (
    '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="tx' + id + '"/>' +
    "<p:cNvSpPr txBox=\"1\"/><p:nvPr/></p:nvSpPr>" +
    '<p:spPr><a:xfrm><a:off x="' + Math.round(x) + '" y="' + Math.round(y) + '"/>' +
    '<a:ext cx="' + Math.round(w) + '" cy="' + Math.round(h) + '"/></a:xfrm>' +
    '<a:prstGeom prst="' + (opts.shape || "rect") + '"><a:avLst/></a:prstGeom>' +
    fill + line + "</p:spPr>" +
    '<p:txBody><a:bodyPr wrap="square" anchor="' + anchor + '"' + inset +
    '><a:normAutofit/></a:bodyPr><a:lstStyle/>' + paras.join("") + "</p:txBody></p:sp>"
  );
}

/** สี่เหลี่ยมทึบ ใช้ทำแถบหัวสไลด์และแท่งกราฟ */
function rect(id, x, y, w, h, fill, opts = {}) {
  const line = opts.line
    ? '<a:ln w="' + Math.round((opts.lineWidth || 1) * PT) + '"><a:solidFill><a:srgbClr val="' +
      opts.line + '"/></a:solidFill></a:ln>'
    : "<a:ln><a:noFill/></a:ln>";
  return (
    '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="rc' + id + '"/>' +
    "<p:cNvSpPr/><p:nvPr/></p:nvSpPr>" +
    '<p:spPr><a:xfrm><a:off x="' + Math.round(x) + '" y="' + Math.round(y) + '"/>' +
    '<a:ext cx="' + Math.round(Math.max(0, w)) + '" cy="' + Math.round(h) + '"/></a:xfrm>' +
    '<a:prstGeom prst="' + (opts.shape || "rect") + '"><a:avLst/></a:prstGeom>' +
    '<a:solidFill><a:srgbClr val="' + fill + '"/></a:solidFill>' + line +
    '</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="th-TH"/></a:p></p:txBody></p:sp>'
  );
}

/** ตารางจริงของ PowerPoint (แก้ไขต่อได้ ไม่ใช่ภาพ) */
function table(id, x, y, w, head, rows, widths, opts = {}) {
  const cols = head.length;
  const wsum = (widths && widths.length === cols ? widths : head.map(() => 1)).reduce((a, b) => a + b, 0);
  const colW = (widths && widths.length === cols ? widths : head.map(() => 1)).map((v) =>
    Math.round((v / wsum) * w)
  );
  const rowH = Math.round((opts.rowHeight || 0.32) * IN);
  const size = opts.size || 11;

  const cell = (text, cellOpts) => {
    const align = cellOpts.align || "l";
    const fill = cellOpts.fill || THEME.paper;
    const color = cellOpts.color || THEME.ink;
    return (
      "<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>" +
      para({ text: String(text), size, color, align, bold: cellOpts.bold }) +
      "</a:txBody><a:tcPr marL=\"" + Math.round(0.06 * IN) + "\" marR=\"" + Math.round(0.06 * IN) +
      "\" marT=\"" + Math.round(0.03 * IN) + "\" marB=\"" + Math.round(0.03 * IN) +
      "\" anchor=\"ctr\">" +
      '<a:lnB w="' + PT + '" cap="flat"><a:solidFill><a:srgbClr val="' + THEME.line +
      '"/></a:solidFill></a:lnB>' +
      '<a:solidFill><a:srgbClr val="' + fill + '"/></a:solidFill></a:tcPr></a:tc>'
    );
  };

  const headRow =
    '<a:tr h="' + rowH + '">' +
    head.map((h, i) =>
      cell(h, {
        bold: true,
        fill: THEME.brand,
        color: "FFFFFF",
        align: opts.align && opts.align[i] === "r" ? "r" : "l",
      })
    ).join("") +
    "</a:tr>";

  const bodyRows = rows
    .map(
      (r, ri) =>
        '<a:tr h="' + rowH + '">' +
        r.map((v, i) =>
          cell(v, {
            fill: ri % 2 ? THEME.brandLight : THEME.paper,
            align: opts.align && opts.align[i] === "r" ? "r" : "l",
            color: opts.colorOf ? opts.colorOf(ri, i, v) : THEME.ink,
          })
        ).join("") +
        "</a:tr>"
    )
    .join("");

  return (
    '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="' + id + '" name="tb' + id + '"/>' +
    "<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp=\"1\"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>" +
    '<p:xfrm><a:off x="' + Math.round(x) + '" y="' + Math.round(y) + '"/>' +
    '<a:ext cx="' + Math.round(w) + '" cy="' + (rowH * (rows.length + 1)) + '"/></p:xfrm>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' +
    '<a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>' +
    colW.map((c) => '<a:gridCol w="' + c + '"/>').join("") +
    "</a:tblGrid>" + headRow + bodyRows +
    "</a:tbl></a:graphicData></a:graphic></p:graphicFrame>"
  );
}

/* ------------------------------------------------------- โครงของแต่ละสไลด์ */

const MARGIN = 0.62 * IN;
const BODY_W = SLIDE_W - MARGIN * 2;

/** หัวสไลด์: แถบสีบาง ๆ ด้านบน + ชื่อเรื่อง + คำโปรย */
function slideHeader(idBase, title, kicker) {
  const out = [rect(idBase, 0, 0, SLIDE_W, 0.14 * IN, THEME.brand)];
  let y = 0.44 * IN;

  if (kicker) {
    out.push(
      textBox(idBase + 1, MARGIN, y, BODY_W, 0.28 * IN, [
        para({ text: kicker, size: 12, color: THEME.accent, bold: true }),
      ])
    );
    y += 0.3 * IN;
  }

  out.push(
    textBox(idBase + 2, MARGIN, y, BODY_W, 0.55 * IN, [
      para({ text: title, size: 26, color: THEME.brandDark, bold: true }),
    ])
  );

  return { shapes: out, y: y + 0.72 * IN };
}

/** เส้นคั่นท้ายสไลด์ + เลขหน้า */
function slideFooter(idBase, no, total, note) {
  const y = SLIDE_H - 0.52 * IN;
  const out = [rect(idBase, MARGIN, y, BODY_W, PT, THEME.line)];

  if (note) {
    out.push(
      textBox(idBase + 1, MARGIN, y + 0.06 * IN, BODY_W - 1.2 * IN, 0.34 * IN, [
        para({ text: note, size: 10, color: THEME.muted }),
      ])
    );
  }

  out.push(
    textBox(idBase + 2, SLIDE_W - MARGIN - 1.2 * IN, y + 0.06 * IN, 1.2 * IN, 0.34 * IN, [
      para({ text: no + " / " + total, size: 10, color: THEME.muted, align: "r" }),
    ])
  );

  return out;
}

/** สไลด์ปก */
function coverSlide(s) {
  const shapes = [
    rect(10, 0, 0, SLIDE_W, SLIDE_H, THEME.brand),
    rect(11, 0, SLIDE_H - 0.9 * IN, SLIDE_W, 0.9 * IN, THEME.brandDark),
    rect(12, MARGIN, 1.5 * IN, 1.1 * IN, 0.1 * IN, THEME.accent),
  ];

  shapes.push(
    textBox(13, MARGIN, 1.9 * IN, BODY_W, 1.5 * IN, [
      para({ text: s.title, size: 40, color: "FFFFFF", bold: true }),
    ])
  );

  if (s.subtitle) {
    shapes.push(
      textBox(14, MARGIN, 3.5 * IN, BODY_W, 0.7 * IN, [
        para({ text: s.subtitle, size: 18, color: "DCEBE2" }),
      ])
    );
  }

  (s.meta || []).forEach((m, i) => {
    shapes.push(
      textBox(20 + i, MARGIN + i * (BODY_W / Math.max(1, (s.meta || []).length)), 4.5 * IN,
        BODY_W / Math.max(1, (s.meta || []).length), 0.8 * IN, [
        para({ text: m.label, size: 11, color: "9FC7B2" }),
        para({ text: m.value, size: 16, color: "FFFFFF", bold: true, space: 3 }),
      ])
    );
  });

  return shapes;
}

/** สไลด์หัวข้อย่อย */
function bulletSlide(s, no, total) {
  const head = slideHeader(10, s.title, s.kicker);
  const shapes = head.shapes;
  let y = head.y;
  let id = 30;

  (s.bullets || []).forEach((b) => {
    const text = typeof b === "string" ? b : b.text;
    const sub = typeof b === "string" ? "" : b.sub;
    const paras = [para({ text, size: 15, color: THEME.ink, bullet: true, indent: 0.22 })];
    if (sub) paras.push(para({ text: sub, size: 12, color: THEME.muted, indent: 0.34, space: 2 }));

    const h = sub ? 0.72 * IN : 0.42 * IN;
    shapes.push(textBox(id++, MARGIN, y, BODY_W, h, paras));
    y += h;
  });

  return shapes.concat(slideFooter(80, no, total, s.note));
}

/** สไลด์ตาราง */
function tableSlide(s, no, total) {
  const head = slideHeader(10, s.title, s.kicker);
  const shapes = head.shapes;
  shapes.push(
    table(30, MARGIN, head.y, BODY_W, s.head, s.rows, s.widths, {
      align: s.align,
      size: s.size || 11,
      rowHeight: s.rowHeight,
    })
  );
  return shapes.concat(slideFooter(80, no, total, s.note));
}

/** สไลด์กราฟแท่งนอน — วาดเป็นสี่เหลี่ยม ไม่ใช้กราฟของ PowerPoint */
function barSlide(s, no, total) {
  const head = slideHeader(10, s.title, s.kicker);
  const shapes = head.shapes;
  let y = head.y;
  let id = 30;

  const labelW = 3.1 * IN;
  const valueW = 1.5 * IN;
  const trackW = BODY_W - labelW - valueW;
  const rowH = 0.46 * IN;
  const barH = 0.2 * IN;
  const max = Math.max(1, ...(s.bars || []).map((b) => Number(b.max) || Number(b.value) || 0));

  (s.bars || []).forEach((b) => {
    const v = Number(b.value) || 0;
    const w = Math.max(PT, (v / max) * trackW);

    shapes.push(
      textBox(id++, MARGIN, y, labelW, rowH, [para({ text: b.label, size: 12, color: THEME.ink })], {
        anchor: "ctr",
      })
    );
    shapes.push(rect(id++, MARGIN + labelW, y + (rowH - barH) / 2, trackW, barH, THEME.brandLight));
    shapes.push(rect(id++, MARGIN + labelW, y + (rowH - barH) / 2, w, barH, b.color || THEME.brand));
    shapes.push(
      textBox(id++, MARGIN + labelW + trackW, y, valueW, rowH, [
        para({ text: b.text || String(v), size: 12, color: THEME.brandDark, bold: true, align: "r" }),
      ], { anchor: "ctr" })
    );
    y += rowH;
  });

  return shapes.concat(slideFooter(80, no, total, s.note));
}

/** เลือกตัววาดตามชนิดของสไลด์ */
function slideShapes(s, no, total) {
  if (s.kind === "cover") return coverSlide(s);
  if (s.kind === "table") return tableSlide(s, no, total);
  if (s.kind === "bars") return barSlide(s, no, total);
  return bulletSlide(s, no, total);
}

function slideXML(s, no, total) {
  return (
    XML_HEAD +
    "<p:sld " + NS_A + " " + NS_R + " " + NS_P + "><p:cSld><p:spTree>" +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    "<p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/>" +
    "<a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr>" +
    slideShapes(s, no, total).join("") +
    "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>"
  );
}

/* ------------------------------------------------- ส่วนที่ PowerPoint บังคับ */

/**
 * ชุดสี ฟอนต์ และรูปแบบของธีม
 *
 * ส่วนนี้ยาวและดูเหมือนไม่จำเป็น แต่ตัดออกไม่ได้เลย
 * PowerPoint ตรวจว่า fmtScheme ต้องมี fillStyleLst 3 แบบ lnStyleLst 3 แบบ
 * effectStyleLst 3 แบบ และ bgFillStyleLst 3 แบบเป๊ะ ๆ ขาดอันใดอันหนึ่ง
 * จะฟ้องว่า "ไฟล์เสียหาย" โดยไม่บอกว่าเสียตรงไหน
 */
function themeXML() {
  const fill =
    "<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>" +
    "<a:gradFill rotWithShape=\"1\"><a:gsLst>" +
    "<a:gs pos=\"0\"><a:schemeClr val=\"phClr\"><a:tint val=\"60000\"/></a:schemeClr></a:gs>" +
    "<a:gs pos=\"100000\"><a:schemeClr val=\"phClr\"><a:shade val=\"80000\"/></a:schemeClr></a:gs>" +
    "</a:gsLst><a:lin ang=\"5400000\" scaled=\"0\"/></a:gradFill>" +
    "<a:solidFill><a:schemeClr val=\"phClr\"><a:tint val=\"90000\"/></a:schemeClr></a:solidFill>";

  const lines = [9525, 25400, 38100]
    .map(
      (w) =>
        '<a:ln w="' + w + '" cap="flat" cmpd="sng" algn="ctr">' +
        "<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>" +
        "<a:prstDash val=\"solid\"/></a:ln>"
    )
    .join("");

  const effects =
    "<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(2) +
    "<a:effectStyle><a:effectLst>" +
    "<a:outerShdw blurRad=\"40000\" dist=\"23000\" dir=\"5400000\" rotWithShape=\"0\">" +
    "<a:srgbClr val=\"000000\"><a:alpha val=\"20000\"/></a:srgbClr></a:outerShdw>" +
    "</a:effectLst></a:effectStyle>";

  const font = (tag) =>
    "<a:" + tag + '><a:latin typeface="' + FONT + '"/><a:ea typeface=""/>' +
    '<a:cs typeface="' + FONT + '"/></a:' + tag + ">";

  return (
    XML_HEAD +
    '<a:theme ' + NS_A + ' name="OFAU">' +
    "<a:themeElements><a:clrScheme name=\"OFAU\">" +
    '<a:dk1><a:srgbClr val="' + THEME.ink + '"/></a:dk1>' +
    '<a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>' +
    '<a:dk2><a:srgbClr val="' + THEME.brandDark + '"/></a:dk2>' +
    '<a:lt2><a:srgbClr val="' + THEME.brandLight + '"/></a:lt2>' +
    '<a:accent1><a:srgbClr val="' + THEME.brand + '"/></a:accent1>' +
    '<a:accent2><a:srgbClr val="' + THEME.accent + '"/></a:accent2>' +
    '<a:accent3><a:srgbClr val="' + THEME.ok + '"/></a:accent3>' +
    '<a:accent4><a:srgbClr val="' + THEME.warn + '"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="' + THEME.err + '"/></a:accent5>' +
    '<a:accent6><a:srgbClr val="' + THEME.muted + '"/></a:accent6>' +
    '<a:hlink><a:srgbClr val="0B5FA5"/></a:hlink>' +
    '<a:folHlink><a:srgbClr val="7A4EA8"/></a:folHlink>' +
    "</a:clrScheme>" +
    '<a:fontScheme name="OFAU">' + font("majorFont") + font("minorFont") + "</a:fontScheme>" +
    '<a:fmtScheme name="OFAU">' +
    "<a:fillStyleLst>" + fill + "</a:fillStyleLst>" +
    "<a:lnStyleLst>" + lines + "</a:lnStyleLst>" +
    "<a:effectStyleLst>" + effects + "</a:effectStyleLst>" +
    "<a:bgFillStyleLst>" + fill + "</a:bgFillStyleLst>" +
    "</a:fmtScheme></a:themeElements>" +
    "<a:objectDefaults/><a:extraClrSchemeLst/></a:theme>"
  );
}

function masterXML() {
  return (
    XML_HEAD +
    "<p:sldMaster " + NS_A + " " + NS_R + " " + NS_P + "><p:cSld><p:bg>" +
    '<p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr>' +
    "</p:bg><p:spTree>" +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    "<p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/>" +
    "<a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr>" +
    "</p:spTree></p:cSld>" +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2"' +
    ' accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6"' +
    ' hlink="hlink" folHlink="folHlink"/>' +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
    "</p:sldMaster>"
  );
}

function layoutXML() {
  return (
    XML_HEAD +
    "<p:sldLayout " + NS_A + " " + NS_R + " " + NS_P + ' type="blank" preserve="1"><p:cSld name="ว่าง"><p:spTree>' +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    "<p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/>" +
    "<a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr>" +
    "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>"
  );
}

const REL = (id, type, target) =>
  '<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/' + type +
  '" Target="' + target + '"/>';

const RELS = (body) =>
  XML_HEAD +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  body + "</Relationships>";

/* ------------------------------------------------------------ ประกอบไฟล์ */

/**
 * สร้างไฟล์ .pptx จากรายการสไลด์
 *
 * @param {object} deck ข้อมูลไฟล์นำเสนอ
 * @param {string} deck.title ชื่อเรื่อง (ไปอยู่ในคุณสมบัติของไฟล์)
 * @param {string} deck.author ผู้จัดทำ
 * @param {Array} deck.slides รายการสไลด์ (kind = cover | bullets | table | bars)
 * @returns {Uint8Array} เนื้อไฟล์ .pptx
 */
export function buildPPTX(deck) {
  const slides = (deck.slides || []).filter(Boolean);
  if (!slides.length) throw new Error("ไม่มีสไลด์ให้สร้าง");

  const total = slides.length;
  const files = [];

  /* ---------- ชนิดของไฟล์ ---------- */
  const OD = "officeDocument/2006/";
  const PML = "application/vnd.openxmlformats-officedocument.presentationml.";
  files.push({
    name: "[Content_Types].xml",
    data:
      XML_HEAD +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="' + PML + 'presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="' + PML + 'slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="' + PML + 'slideLayout+xml"/>' +
      slides
        .map(
          (s, i) =>
            '<Override PartName="/ppt/slides/slide' + (i + 1) + '.xml" ContentType="' + PML + 'slide+xml"/>'
        )
        .join("") +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="' + PML + 'extended-properties+xml"/>' +
      "</Types>",
  });

  /* ---------- ความสัมพันธ์ระดับบนสุด ---------- */
  files.push({
    name: "_rels/.rels",
    data: RELS(
      REL("rId1", OD + "relationships/officeDocument", "ppt/presentation.xml") +
        REL("rId2", "package/2006/relationships/metadata/core-properties", "docProps/core.xml") +
        REL("rId3", OD + "relationships/extended-properties", "docProps/app.xml")
    ),
  });

  /* ---------- คุณสมบัติของไฟล์ ---------- */
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  files.push({
    name: "docProps/core.xml",
    data:
      XML_HEAD +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"' +
      ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"' +
      ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      "<dc:title>" + xmlEsc(deck.title || "การนำเสนอ") + "</dc:title>" +
      "<dc:creator>" + xmlEsc(deck.author || "One for All Ultra") + "</dc:creator>" +
      "<cp:lastModifiedBy>" + xmlEsc(deck.author || "One for All Ultra") + "</cp:lastModifiedBy>" +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + "</dcterms:created>" +
      '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + "</dcterms:modified>" +
      "</cp:coreProperties>",
  });

  files.push({
    name: "docProps/app.xml",
    data:
      XML_HEAD +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"' +
      ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      "<Application>One for All Ultra</Application>" +
      "<Slides>" + total + "</Slides>" +
      "<Company>" + xmlEsc(deck.company || "") + "</Company>" +
      "</Properties>",
  });

  /* ---------- ตัวไฟล์นำเสนอ ---------- */
  files.push({
    name: "ppt/presentation.xml",
    data:
      XML_HEAD +
      "<p:presentation " + NS_A + " " + NS_R + " " + NS_P + ' saveSubsetFonts="1">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      "<p:sldIdLst>" +
      slides.map((s, i) => '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 2) + '"/>').join("") +
      "</p:sldIdLst>" +
      '<p:sldSz cx="' + SLIDE_W + '" cy="' + SLIDE_H + '"/>' +
      '<p:notesSz cx="' + SLIDE_H + '" cy="' + SLIDE_W + '"/>' +
      "</p:presentation>",
  });

  files.push({
    name: "ppt/_rels/presentation.xml.rels",
    data: RELS(
      REL("rId1", OD + "relationships/slideMaster", "slideMasters/slideMaster1.xml") +
        slides
          .map((s, i) => REL("rId" + (i + 2), OD + "relationships/slide", "slides/slide" + (i + 1) + ".xml"))
          .join("") +
        REL("rId" + (total + 2), OD + "relationships/theme", "theme/theme1.xml")
    ),
  });

  /* ---------- แม่แบบ เค้าโครง ธีม ---------- */
  files.push({ name: "ppt/slideMasters/slideMaster1.xml", data: masterXML() });
  files.push({
    name: "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    data: RELS(
      REL("rId1", OD + "relationships/slideLayout", "../slideLayouts/slideLayout1.xml") +
        REL("rId2", OD + "relationships/theme", "../theme/theme1.xml")
    ),
  });

  files.push({ name: "ppt/slideLayouts/slideLayout1.xml", data: layoutXML() });
  files.push({
    name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    data: RELS(REL("rId1", OD + "relationships/slideMaster", "../slideMasters/slideMaster1.xml")),
  });

  files.push({ name: "ppt/theme/theme1.xml", data: themeXML() });

  /* ---------- สไลด์ ---------- */
  slides.forEach((s, i) => {
    files.push({ name: "ppt/slides/slide" + (i + 1) + ".xml", data: slideXML(s, i + 1, total) });
    files.push({
      name: "ppt/slides/_rels/slide" + (i + 1) + ".xml.rels",
      data: RELS(REL("rId1", OD + "relationships/slideLayout", "../slideLayouts/slideLayout1.xml")),
    });
  });

  return zip(files);
}

/**
 * สร้างไฟล์นำเสนอแล้วสั่งดาวน์โหลด
 * @param {object} deck ข้อมูลไฟล์นำเสนอ
 * @param {string} filename ชื่อไฟล์ (ต่อ .pptx ให้เองถ้าไม่ได้ใส่)
 */
export function downloadPPTX(deck, filename) {
  const blob = new Blob([buildPPTX(deck)], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pptx") ? filename : filename.replace(/\.[^.]*$/, "") + ".pptx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
