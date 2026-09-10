// ส่งออกเป็นไฟล์เอกสาร Word (.docx) จริง — เขียน XML เอง ไม่ใช้ไลบรารี
//
// ทำไมต้องเป็น .docx จริง ไม่ใช่ PDF:
//   คู่มือถูกเอาไปแก้ต่อเสมอ — เติมชื่อหน่วยงาน แทรกภาพหน้าจอ ตัดหัวข้อที่ไม่ใช้
//   และเอาไปรวมเป็นเล่มกับเอกสารอื่น ไฟล์ที่แก้ไม่ได้จะถูกพิมพ์ใหม่ด้วยมือ
//   แล้ววันหนึ่งคู่มือกับระบบจริงจะไม่ตรงกัน
//
// .docx คือไฟล์ zip ที่ข้างในเป็น XML หลายไฟล์ (Open XML) เหมือน .xlsx และ .pptx
// จึงใช้ตัวประกอบ zip ตัวเดียวกันที่ lib/zip.js
//
// สิ่งที่ Word บังคับว่าต้องมี:
//   [Content_Types].xml   บอกชนิดของทุกไฟล์ในซิป
//   _rels/.rels           ชี้ว่าไฟล์หลักคืออันไหน
//   word/document.xml     ตัวเนื้อหา
//   word/styles.xml       ชุดรูปแบบ (ถ้าอ้าง pStyle ที่ไม่มี Word จะไม่จัดรูปแบบให้)
//   word/_rels/document.xml.rels
//
// ข้อควรรู้ที่ทำให้ไฟล์เสียได้ง่าย:
//   1. ทุกช่องตาราง (w:tc) ต้องมีย่อหน้า (w:p) อย่างน้อยหนึ่งย่อหน้า ว่างก็ต้องมี
//   2. หลังตารางต้องมีย่อหน้าคั่นเสมอ ไม่งั้นตารางสองตารางติดกันจะเชื่อมเป็นตารางเดียว
//   3. ข้อความที่มีช่องว่างหัวท้ายต้องใส่ xml:space="preserve" ไม่งั้นถูกตัดทิ้ง
//
// ไม่ใช้ numbering.xml ทำเลขข้ออัตโนมัติ
//   เลขอัตโนมัติต้องมีไฟล์นิยามลำดับแยกอีกไฟล์ และผูกกันด้วยรหัสสามชั้น
//   ผิดชั้นใดชั้นหนึ่ง Word จะฟ้องว่าไฟล์เสียโดยไม่บอกว่าเสียตรงไหน
//   คู่มือเล่มนี้ใส่เลขเป็นข้อความไปเลย ผลบนหน้ากระดาษเหมือนกัน และแก้ต่อได้ตามปกติ

import { xmlEsc, zip } from "./zip.js";

/* ------------------------------------------------------------- หน่วยและค่าคงที่ */

/** twip — หน่วยของ Word: 1 นิ้ว = 1440 twip */
const TWIP = 1440;

/** A4 แนวตั้ง (8.27 x 11.69 นิ้ว) */
const PAGE_W = 11906;
const PAGE_H = 16838;
/** ขอบกระดาษ 2 ซม. */
const MARGIN = 1134;
/** ความกว้างที่เหลือให้เนื้อหา ใช้คำนวณความกว้างคอลัมน์ตาราง */
const BODY_W = PAGE_W - MARGIN * 2;

/** สีของเอกสาร — โทนเดียวกับตราสัญลักษณ์ */
export const DOC_THEME = {
  brand: "00693C",
  brandDark: "004E2C",
  accent: "F26A21",
  ink: "1B2B22",
  muted: "5B6B62",
  line: "D6E0DA",
  headBg: "EAF5EF",
  noteBg: "FDF6EC",
};

/**
 * ฟอนต์ของทั้งเล่ม
 *
 * Tahoma เพราะมีทั้งบน Windows และใน Office for Mac และแสดงภาษาไทยได้ครบ
 * ข้อความไทยถูกจัดเป็น "complex script" จึงต้องตั้ง w:cs ด้วย ไม่ใช่แค่ ascii/hAnsi
 * (ตั้งแต่ ascii อย่างเดียว ตัวไทยจะตกไปใช้ฟอนต์เริ่มต้นแล้วสระลอย)
 *
 * เปลี่ยนเป็นฟอนต์อื่น (เช่น TH SarabunPSK) ได้ที่ Word: หน้าแรก > รูปแบบ > แก้ไข "Normal"
 */
const FONT = "Tahoma";

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/* ---------------------------------------------------------------- ตัวช่วย XML */

/** คุณสมบัติของตัวอักษรหนึ่งช่วง */
function runProps(o = {}) {
  const parts = [
    '<w:rFonts w:ascii="' + FONT + '" w:hAnsi="' + FONT + '" w:cs="' + FONT + '"/>',
  ];
  if (o.bold) parts.push("<w:b/><w:bCs/>");
  if (o.italic) parts.push("<w:i/><w:iCs/>");
  if (o.color) parts.push('<w:color w:val="' + o.color + '"/>');
  if (o.size) parts.push('<w:sz w:val="' + o.size * 2 + '"/><w:szCs w:val="' + o.size * 2 + '"/>');
  if (o.caps) parts.push("<w:caps/>");
  return "<w:rPr>" + parts.join("") + "</w:rPr>";
}

/**
 * ช่วงข้อความหนึ่งช่วง
 * ขึ้นบรรทัดใหม่ในข้อความเดียวกันใช้ w:br ไม่ใช่อักขระขึ้นบรรทัด (Word ไม่อ่านให้)
 */
function run(text, o = {}) {
  const lines = String(text === undefined || text === null ? "" : text).split("\n");
  return (
    "<w:r>" +
    runProps(o) +
    lines
      .map((l, i) => (i ? "<w:br/>" : "") + '<w:t xml:space="preserve">' + xmlEsc(l) + "</w:t>")
      .join("") +
    "</w:r>"
  );
}

/** ย่อหน้าหนึ่งย่อหน้า */
function para(runs, o = {}) {
  const pr = [];
  if (o.style) pr.push('<w:pStyle w:val="' + o.style + '"/>');
  if (o.align) pr.push('<w:jc w:val="' + o.align + '"/>');
  if (o.indent || o.hanging) {
    pr.push(
      '<w:ind w:left="' + (o.indent || 0) + '"' +
        (o.hanging ? ' w:hanging="' + o.hanging + '"' : "") + "/>"
    );
  }
  if (o.before || o.after) {
    pr.push(
      '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after || 0) + '"/>'
    );
  }
  if (o.shade) pr.push('<w:shd w:val="clear" w:color="auto" w:fill="' + o.shade + '"/>');
  if (o.border) {
    pr.push(
      "<w:pBdr>" +
        '<w:left w:val="single" w:sz="18" w:space="6" w:color="' + o.border + '"/>' +
        "</w:pBdr>"
    );
  }
  if (o.keepNext) pr.push("<w:keepNext/>");
  if (o.pageBreak) pr.push("<w:pageBreakBefore/>");

  const props = pr.length ? "<w:pPr>" + pr.join("") + "</w:pPr>" : "";
  return "<w:p>" + props + (Array.isArray(runs) ? runs.join("") : runs) + "</w:p>";
}

/** ย่อหน้าว่างหนึ่งบรรทัด */
const blank = (o = {}) => para("", o);

/* ------------------------------------------------------------------- ตาราง */

function tableCell(content, o = {}) {
  const pr = ['<w:tcW w:w="' + (o.width || 0) + '" w:type="dxa"/>'];
  if (o.fill) pr.push('<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>');
  pr.push('<w:vAlign w:val="center"/>');

  // ทุกช่องต้องมีย่อหน้าอย่างน้อยหนึ่งย่อหน้า ไม่งั้น Word ถือว่าไฟล์เสีย
  const body = content && content.length ? content : blank();
  return "<w:tc><w:tcPr>" + pr.join("") + "</w:tcPr>" + body + "</w:tc>";
}

/**
 * ตารางหนึ่งตาราง
 * @param {string[]} head หัวตาราง
 * @param {Array<Array>} rows ข้อมูล
 * @param {number[]} widths สัดส่วนความกว้างของแต่ละคอลัมน์
 */
function table(head, rows, widths, o = {}) {
  const cols = head.length;
  const ratio = widths && widths.length === cols ? widths : head.map(() => 1);
  const sum = ratio.reduce((a, b) => a + b, 0);
  const colW = ratio.map((v) => Math.round((v / sum) * BODY_W));
  const size = o.size || 10;

  const border = (side) =>
    "<w:" + side + ' w:val="single" w:sz="4" w:space="0" w:color="' + DOC_THEME.line + '"/>';

  const pr =
    "<w:tblPr>" +
    '<w:tblW w:w="' + BODY_W + '" w:type="dxa"/>' +
    "<w:tblBorders>" +
    ["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("") +
    "</w:tblBorders>" +
    '<w:tblCellMar>' +
    '<w:top w:w="60" w:type="dxa"/><w:left w:w="90" w:type="dxa"/>' +
    '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="90" w:type="dxa"/>' +
    "</w:tblCellMar>" +
    "</w:tblPr>";

  const grid = "<w:tblGrid>" + colW.map((w) => '<w:gridCol w:w="' + w + '"/>').join("") + "</w:tblGrid>";

  // ทำซ้ำหัวตารางเมื่อตารางยาวข้ามหน้า (w:tblHeader)
  const headRow =
    "<w:tr><w:trPr><w:tblHeader/></w:trPr>" +
    head
      .map((h, i) =>
        tableCell(para(run(h, { bold: true, size, color: DOC_THEME.brandDark }), { after: 0 }), {
          width: colW[i],
          fill: DOC_THEME.headBg,
        })
      )
      .join("") +
    "</w:tr>";

  const bodyRows = rows
    .map(
      (r) =>
        "<w:tr>" +
        r
          .map((v, i) =>
            tableCell(
              String(v === undefined || v === null ? "" : v)
                .split("\n")
                .map((line, li) =>
                  para(run(line, { size, bold: o.boldFirstCol && i === 0 }), {
                    after: 0,
                    before: li ? 20 : 0,
                  })
                )
                .join(""),
              { width: colW[i] }
            )
          )
          .join("") +
        "</w:tr>"
    )
    .join("");

  // ต้องมีย่อหน้าคั่นหลังตารางเสมอ ไม่งั้นตารางที่ติดกันจะเชื่อมเป็นตารางเดียว
  return "<w:tbl>" + pr + grid + headRow + bodyRows + "</w:tbl>" + blank({ after: 120 });
}

/* --------------------------------------------------------- แปลงบล็อกเป็น XML */

/**
 * แปลงบล็อกเนื้อหาหนึ่งอันเป็น XML ของ Word
 *
 * ชนิดของบล็อก:
 *   cover    ปกเอกสาร
 *   h1 h2 h3 หัวข้อสามระดับ
 *   p        ย่อหน้าปกติ
 *   lead     ย่อหน้านำ ตัวโตกว่าปกติเล็กน้อย
 *   bullet   ข้อย่อยมีจุดนำ
 *   step     ขั้นตอนมีเลขข้อ (ใส่เลขเอง ไม่ได้ใช้เลขอัตโนมัติของ Word)
 *   note     กล่องข้อควรรู้ มีแถบสีด้านซ้าย
 *   table    ตาราง
 *   spacer   บรรทัดว่าง
 *   break    ขึ้นหน้าใหม่
 */
function blockXML(b) {
  switch (b.kind) {
    case "cover":
      return (
        blank({ after: 1200 }) +
        para(run(b.org || "", { size: 13, color: DOC_THEME.muted }), { align: "center", after: 200 }) +
        para(run(b.title, { size: 26, bold: true, color: DOC_THEME.brandDark }), {
          align: "center",
          after: 160,
        }) +
        para(run(b.subtitle || "", { size: 14, color: DOC_THEME.ink }), {
          align: "center",
          after: 500,
        }) +
        (b.meta && b.meta.length
          ? table(
              ["รายการ", "รายละเอียด"],
              b.meta.map((m) => [m.label, m.value]),
              [1, 2],
              { size: 11, boldFirstCol: true }
            )
          : "") +
        para(run(b.footer || "", { size: 10, color: DOC_THEME.muted }), { align: "center" })
      );

    case "h1":
      return para(run(b.text, { size: 18, bold: true, color: DOC_THEME.brandDark }), {
        style: "Heading1",
        pageBreak: b.pageBreak !== false,
        before: 0,
        after: 160,
        keepNext: true,
      });

    case "h2":
      return para(run(b.text, { size: 14, bold: true, color: DOC_THEME.brand }), {
        style: "Heading2",
        before: 240,
        after: 100,
        keepNext: true,
      });

    case "h3":
      return para(run(b.text, { size: 12, bold: true, color: DOC_THEME.ink }), {
        style: "Heading3",
        before: 160,
        after: 60,
        keepNext: true,
      });

    case "lead":
      return para(run(b.text, { size: 12, color: DOC_THEME.ink }), { after: 140 });

    case "p":
      return para(run(b.text, { size: 11 }), { after: 100 });

    case "bullet":
      return para(
        [run("•  ", { size: 11, color: DOC_THEME.brand, bold: true }), run(b.text, { size: 11 })],
        { indent: 340 + (b.level || 0) * 280, hanging: 200, after: 60 }
      );

    case "step":
      return para(
        [
          run(b.no + ".  ", { size: 11, bold: true, color: DOC_THEME.brand }),
          run(b.text, { size: 11 }),
        ],
        { indent: 400, hanging: 260, after: 70 }
      );

    case "note":
      return (
        para(
          [
            run((b.label || "ข้อควรรู้") + " — ", { size: 10.5, bold: true, color: DOC_THEME.accent }),
            run(b.text, { size: 10.5, color: DOC_THEME.ink }),
          ],
          { shade: DOC_THEME.noteBg, border: DOC_THEME.accent, indent: 120, before: 80, after: 140 }
        )
      );

    case "table":
      return (
        (b.caption
          ? para(run(b.caption, { size: 10.5, bold: true, color: DOC_THEME.muted }), {
              after: 60,
              keepNext: true,
            })
          : "") + table(b.head, b.rows, b.widths, { size: b.size, boldFirstCol: b.boldFirstCol })
      );

    case "spacer":
      return blank({ after: b.after || 120 });

    case "break":
      return para("", { pageBreak: true });

    default:
      return para(run(String(b.text || ""), { size: 11 }), { after: 100 });
  }
}

/* ---------------------------------------------------- ส่วนที่ Word บังคับให้มี */

/**
 * ชุดรูปแบบของเอกสาร
 *
 * ต้องประกาศทุกรูปแบบที่เนื้อหาอ้างถึงด้วย pStyle
 * ถ้าอ้างรูปแบบที่ไม่มี Word จะไม่ฟ้อง แต่จะไม่จัดรูปแบบให้เลย
 * และบานหน้าต่างนำทาง (Navigation Pane) จะไม่เห็นหัวข้อ
 */
function stylesXML() {
  const heading = (id, name, level, size, color) =>
    '<w:style w:type="paragraph" w:styleId="' + id + '">' +
    '<w:name w:val="' + name + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    "<w:qFormat/>" +
    '<w:pPr><w:outlineLvl w:val="' + level + '"/>' +
    '<w:spacing w:before="240" w:after="120"/><w:keepNext/></w:pPr>' +
    "<w:rPr>" +
    '<w:rFonts w:ascii="' + FONT + '" w:hAnsi="' + FONT + '" w:cs="' + FONT + '"/>' +
    "<w:b/><w:bCs/>" +
    '<w:color w:val="' + color + '"/>' +
    '<w:sz w:val="' + size * 2 + '"/><w:szCs w:val="' + size * 2 + '"/>' +
    "</w:rPr></w:style>";

  return (
    XML_HEAD +
    "<w:styles " + NS_W + ">" +
    "<w:docDefaults><w:rPrDefault><w:rPr>" +
    '<w:rFonts w:ascii="' + FONT + '" w:hAnsi="' + FONT + '" w:cs="' + FONT + '"/>' +
    '<w:sz w:val="22"/><w:szCs w:val="22"/>' +
    '<w:lang w:val="th-TH" w:bidi="th-TH"/>' +
    "</w:rPr></w:rPrDefault>" +
    "<w:pPrDefault><w:pPr>" +
    '<w:spacing w:after="120" w:line="276" w:lineRule="auto"/>' +
    "</w:pPr></w:pPrDefault></w:docDefaults>" +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
    '<w:name w:val="Normal"/><w:qFormat/></w:style>' +
    heading("Heading1", "heading 1", 0, 18, DOC_THEME.brandDark) +
    heading("Heading2", "heading 2", 1, 14, DOC_THEME.brand) +
    heading("Heading3", "heading 3", 2, 12, DOC_THEME.ink) +
    "</w:styles>"
  );
}

const REL = (id, type, target) =>
  '<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/' + type +
  '" Target="' + target + '"/>';

const RELS = (body) =>
  XML_HEAD +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  body + "</Relationships>";

/* ------------------------------------------------------------------ ประกอบ */

/**
 * สร้างไฟล์ .docx จากรายการบล็อกเนื้อหา
 *
 * @param {object} doc ข้อมูลเอกสาร
 * @param {string} doc.title ชื่อเรื่อง (ไปอยู่ในคุณสมบัติของไฟล์)
 * @param {string} doc.author ผู้จัดทำ
 * @param {string} doc.company ชื่อหน่วยงาน
 * @param {Array} doc.blocks บล็อกเนื้อหาเรียงตามลำดับที่จะปรากฏบนกระดาษ
 * @returns {Uint8Array} เนื้อไฟล์ .docx
 */
export function buildDOCX(doc) {
  const blocks = (doc.blocks || []).filter(Boolean);
  if (!blocks.length) throw new Error("ไม่มีเนื้อหาให้สร้างเอกสาร");

  const WML = "application/vnd.openxmlformats-officedocument.wordprocessingml.";
  const OD = "officeDocument/2006/";
  const files = [];

  files.push({
    name: "[Content_Types].xml",
    data:
      XML_HEAD +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="' + WML + 'document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="' + WML + 'styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      "</Types>",
  });

  files.push({
    name: "_rels/.rels",
    data: RELS(
      REL("rId1", OD + "relationships/officeDocument", "word/document.xml") +
        REL("rId2", "package/2006/relationships/metadata/core-properties", "docProps/core.xml") +
        REL("rId3", OD + "relationships/extended-properties", "docProps/app.xml")
    ),
  });

  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  files.push({
    name: "docProps/core.xml",
    data:
      XML_HEAD +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"' +
      ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"' +
      ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      "<dc:title>" + xmlEsc(doc.title || "เอกสาร") + "</dc:title>" +
      "<dc:creator>" + xmlEsc(doc.author || "One for All Ultra") + "</dc:creator>" +
      "<cp:lastModifiedBy>" + xmlEsc(doc.author || "One for All Ultra") + "</cp:lastModifiedBy>" +
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
      "<Company>" + xmlEsc(doc.company || "") + "</Company>" +
      "</Properties>",
  });

  files.push({
    name: "word/_rels/document.xml.rels",
    data: RELS(REL("rId1", OD + "relationships/styles", "styles.xml")),
  });

  files.push({ name: "word/styles.xml", data: stylesXML() });

  // sectPr ปิดท้าย body เสมอ — บอกขนาดกระดาษและขอบ
  const sect =
    "<w:sectPr>" +
    '<w:pgSz w:w="' + PAGE_W + '" w:h="' + PAGE_H + '"/>' +
    '<w:pgMar w:top="' + MARGIN + '" w:right="' + MARGIN + '" w:bottom="' + MARGIN +
    '" w:left="' + MARGIN + '" w:header="708" w:footer="708" w:gutter="0"/>' +
    "</w:sectPr>";

  files.push({
    name: "word/document.xml",
    data:
      XML_HEAD +
      "<w:document " + NS_W + "><w:body>" +
      blocks.map(blockXML).join("") +
      sect +
      "</w:body></w:document>",
  });

  return zip(files);
}

/**
 * สร้างเอกสารแล้วสั่งดาวน์โหลด
 * @param {object} doc ข้อมูลเอกสาร
 * @param {string} filename ชื่อไฟล์ (ต่อ .docx ให้เองถ้าไม่ได้ใส่)
 */
export function downloadDOCX(doc, filename) {
  const blob = new Blob([buildDOCX(doc)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".docx") ? filename : filename.replace(/\.[^.]*$/, "") + ".docx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** หน่วยของ Word ที่ผู้เรียกอาจต้องใช้ (เช่น คำนวณระยะย่อหน้า) */
export const DOCX_TWIP = TWIP;
