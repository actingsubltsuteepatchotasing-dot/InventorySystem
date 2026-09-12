// ส่งออกเป็นไฟล์ Excel (.xlsx) จริง — เขียน zip กับ XML เอง ไม่ใช้ไลบรารี
//
// ทำไมไม่ส่งออกเป็น CSV แล้วตั้งชื่อ .xls ไปเลย:
//   Excel รุ่นใหม่ขึ้นกล่องเตือนว่า "นามสกุลไม่ตรงกับเนื้อไฟล์" ทุกครั้งที่เปิด
//   และ CSV ไม่มีชนิดข้อมูล ตัวเลขที่ขึ้นต้นด้วยศูนย์ (รหัสสินค้า) จะโดนกินศูนย์หน้าทิ้ง
//   ไฟล์ .xlsx จริงบอกได้ว่าช่องไหนเป็นตัวเลข ช่องไหนเป็นข้อความ
//
// .xlsx คือไฟล์ zip ที่ข้างในเป็น XML หลายไฟล์
// เขียน zip แบบ "ไม่บีบอัด" (stored) จึงไม่ต้องมีตัวบีบอัด ใช้แค่ CRC32 ที่เขียนเองได้
// ไฟล์ใหญ่กว่าแบบบีบอัดอยู่บ้าง แต่รายงานระดับหมื่นแถวก็ยังไม่กี่เมกะไบต์
//
// ใช้ inline string ในเซลล์ (ไม่มีตาราง sharedStrings แยก)
// ทำให้ไฟล์โตกว่านิดหน่อยแต่โครงง่ายกว่ามาก และไม่ต้องเดินข้อมูลสองรอบ

// ใส่นามสกุล .js ไว้ด้วย เพราะ tools/make-process-xlsx.mjs เรียกไฟล์นี้ด้วย Node ตรง ๆ
// ซึ่งต้องการนามสกุลเสมอ ส่วน webpack ของ Next รับได้ทั้งสองแบบ
import { zip } from "./zip.js";

/* -------------------------------------------------------------------- zip */

// ตัวประกอบ zip กับ CRC32 ย้ายไปอยู่ lib/zip.js แล้ว
// เพราะไฟล์นำเสนอ (.pptx) ก็เป็น zip ของ XML เหมือนกัน ถ้าเขียนคนละชุด
// วันที่แก้บั๊กของตัวประกอบ zip จะต้องไล่แก้หลายที่ แล้วจะมีที่หนึ่งที่ลืมแก้

/* ------------------------------------------------------------------- xlsx */

const esc = (v) =>
  String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** ชื่อคอลัมน์ของ Excel: 1 -> A, 27 -> AA */
function colName(n) {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * ค่าที่เป็น "ตัวเลขจริง" เท่านั้นที่เขียนเป็นตัวเลข
 *
 * รหัสสินค้า "0001" หรือเลขที่เอกสารต้องเป็นข้อความ ไม่งั้น Excel กินศูนย์หน้าทิ้ง
 * จึงยอมรับเฉพาะค่าที่เป็น number อยู่แล้ว ไม่แปลงสตริงให้เอง
 */
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function sheetXML(head, rows, widths, hasDrawing, noGrid) {
  const cell = (v, r, c) => {
    const ref = colName(c) + r;
    if (v === null || v === undefined || v === "") return "";
    if (isNum(v)) return '<c r="' + ref + '"><v>' + v + "</v></c>";
    // s="2" = ตัดบรรทัดในเซลล์และชิดบน ข้อความยาว ๆ จึงอ่านได้โดยไม่ต้องขยายแถวเอง
    return '<c r="' + ref + '" t="inlineStr" s="2"><is><t xml:space="preserve">' + esc(v) + "</t></is></c>";
  };

  const lines = [];
  lines.push(
    '<row r="1">' +
      head.map((h, i) => '<c r="' + colName(i + 1) + '1" t="inlineStr" s="1"><is><t>' + esc(h) + "</t></is></c>").join("") +
      "</row>"
  );
  rows.forEach((r, i) => {
    lines.push('<row r="' + (i + 2) + '">' + r.map((v, c) => cell(v, i + 2, c + 1)).join("") + "</row>");
  });

  // ความกว้างคอลัมน์ ถ้าไม่ได้บอกมาก็ปล่อยให้ Excel ใช้ค่าเริ่มต้น
  const cols = (widths || []).length
    ? "<cols>" +
      widths
        .map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>')
        .join("") +
      "</cols>"
    : "";

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    // ปิดเส้นตารางสำหรับชีตที่เป็นผังล้วน จะได้ดูเป็นผืนผ้าใบ ไม่ใช่ตารางที่มีรูปแปะอยู่
    (noGrid ? '<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>' : "") +
    cols +
    "<sheetData>" + lines.join("") + "</sheetData>" +
    // แท็ก drawing ต้องอยู่ท้ายสุดของ worksheet ตามลำดับที่ schema กำหนด
    // วางผิดที่แล้ว Excel จะบอกว่าไฟล์เสียหายและขอซ่อมก่อนเปิด
    (hasDrawing ? '<drawing r:id="rId1"/>' : "") +
    "</worksheet>"
  );
}

/**
 * สร้างเนื้อไฟล์ .xlsx เป็นไบต์
 *
 * แยกจากการสั่งดาวน์โหลด เพราะส่วนนี้เป็นตรรกะล้วน ไม่พึ่ง DOM
 * จึงเอาไปทดสอบได้ว่าไฟล์ที่เขียนออกไป อ่านกลับเข้ามาด้วย lib/xlsxRead.js แล้วได้ของเดิม
 *
 * @param {string[]} head หัวตาราง
 * @param {Array<Array<string|number>>} rows ข้อมูล
 * @returns {Uint8Array}
 */
export function buildXLSX(head, rows) {
  return buildWorkbook([{ name: "รายงาน", head, rows }]);
}

/** ชื่อชีตที่ Excel ยอมรับ: ไม่เกิน 31 ตัว และห้ามอักขระ : \ / ? * [ ] */
const BAD_SHEET_CHARS = ":/?*[]" + String.fromCharCode(92); // 92 = แบ็กสแลช
const sheetName = (name, i) =>
  String(name || "แผ่น" + (i + 1))
    .split("")
    .map((c) => (BAD_SHEET_CHARS.includes(c) ? " " : c))
    .join("")
    .slice(0, 31) || "แผ่น" + (i + 1);

/* ------------------------------------------------------------- รูปวาดในชีต */

/**
 * หนึ่งพิกเซลเท่ากับกี่ EMU (หน่วยวัดของ Office)
 * 914400 EMU ต่อนิ้ว หารด้วย 96 จุดต่อนิ้ว = 9525
 */
const EMU = 9525;

/**
 * แปลงรายการรูปทรงเป็นไฟล์รูปวาดของชีต
 *
 * ใช้ "รูปทรงของ Office" ไม่ใช่ภาพ bitmap เพราะ:
 *   1. ข้อความไทยในรูปทรงถูกวาดด้วยฟอนต์ของเครื่อง จึงคมทุกระดับการซูมและทุกเครื่อง
 *      ส่วน bitmap ต้องมีตัวเรนเดอร์ฟอนต์ไทยของตัวเอง ซึ่งใหญ่กว่าทั้งระบบรวมกัน
 *   2. คนที่เปิดไฟล์แก้กล่องและข้อความต่อเองได้ ไม่ต้องกลับมาขอให้สร้างใหม่
 *   3. พิมพ์ออกมาแล้วคมตามความละเอียดเครื่องพิมพ์ ไม่ใช่ตามความละเอียดของภาพ
 *
 * วางด้วยพิกัดสัมบูรณ์ (absoluteAnchor) ไม่ผูกกับเซลล์
 * เพราะถ้าผูกกับเซลล์ ความกว้างคอลัมน์ที่ต่างกันจะทำให้ผังบิดทั้งผัง
 *
 * รูปทรงที่รองรับ (kind):
 *   box    กล่องสี่เหลี่ยมมุมมน ใส่ข้อความได้
 *   arrow  ลูกศรชี้ลงหรือชี้ขวา
 *   label  ข้อความล้วน ไม่มีกรอบ ใช้เป็นหัวเรื่องและหมายเหตุข้าง ๆ
 */
function drawingXML(shapes) {
  const px = (n) => Math.round((Number(n) || 0) * EMU);

  const body = (sp, i) => {
    const id = i + 2; // id 1 สงวนไว้ ไม่ให้ชนกับตัวเอกสาร
    const geom =
      sp.kind === "arrow" ? (sp.dir === "right" ? "rightArrow" : "downArrow") : "roundRect";

    const fill =
      sp.kind === "label"
        ? "<a:noFill/>"
        : '<a:solidFill><a:srgbClr val="' + (sp.fill || "EAF5EF") + '"/></a:solidFill>';

    const line =
      sp.kind === "label"
        ? "<a:ln><a:noFill/></a:ln>"
        : '<a:ln w="12700"><a:solidFill><a:srgbClr val="' + (sp.stroke || "2E7D52") + '"/></a:solidFill></a:ln>';

    /*
     * ข้อความแยกเป็นหลายย่อหน้า
     * ต้องแตกเองเพราะ DrawingML ไม่มีอักขระขึ้นบรรทัดในข้อความ
     * ใส่ \n ดิบลงไปแล้ว Excel จะบอกว่าไฟล์เสียหาย
     *
     * รับได้สองแบบ:
     *   text   ข้อความก้อนเดียว ขึ้นบรรทัดด้วย \n ทุกบรรทัดหน้าตาเหมือนกัน
     *   lines  ระบุรูปแบบแยกรายบรรทัดได้ [{ t, bold, size, color, align }]
     * มีแบบที่สองเพราะกล่องในผังต้องมีหัวข้อตัวหนา แล้วตามด้วยรายละเอียดตัวเล็กกว่า
     * ถ้าทุกบรรทัดหน้าตาเหมือนกัน คนอ่านจะแยกไม่ออกว่าบรรทัดไหนคือชื่อขั้น
     */
    const list = sp.lines && sp.lines.length
      ? sp.lines
      : String(sp.text || "").split("\n").map((t) => ({ t }));

    const paras = list
      .map((ln) => {
        const t = typeof ln === "string" ? ln : ln.t;
        const f = typeof ln === "string" ? {} : ln;
        return (
          '<a:p><a:pPr algn="' + (f.align || sp.align || "ctr") + '"/>' +
          (t
            ? '<a:r><a:rPr lang="th-TH" sz="' + (f.size || sp.size || 1000) + '"' +
              (f.bold || (f.bold === undefined && sp.bold) ? ' b="1"' : "") +
              '><a:solidFill><a:srgbClr val="' + (f.color || sp.color || "1B3D2A") + '"/></a:solidFill>' +
              // ฟอนต์ความกว้างเท่ากันใช้กับบรรทัดที่เป็นคำสั่ง จะได้เห็นว่าต้องพิมพ์ตามตัวอักษร
              // ไม่ใช่ข้อความอธิบายที่เขียนใหม่ด้วยคำของตัวเองได้
              '<a:latin typeface="' + (f.font || "Tahoma") + '"/>' +
              '<a:cs typeface="' + (f.font || "Tahoma") + '"/></a:rPr>' +
              "<a:t>" + esc(t) + "</a:t></a:r>"
            : "") +
          "</a:p>"
        );
      })
      .join("");

    return (
      "<xdr:absoluteAnchor>" +
      '<xdr:pos x="' + px(sp.x) + '" y="' + px(sp.y) + '"/>' +
      '<xdr:ext cx="' + px(sp.w) + '" cy="' + px(sp.h) + '"/>' +
      '<xdr:sp macro="" textlink="">' +
      "<xdr:nvSpPr>" +
      '<xdr:cNvPr id="' + id + '" name="รูป ' + id + '"/>' +
      "<xdr:cNvSpPr/>" +
      "</xdr:nvSpPr>" +
      "<xdr:spPr>" +
      '<a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm>' +
      '<a:prstGeom prst="' + geom + '"><a:avLst/></a:prstGeom>' +
      fill +
      line +
      "</xdr:spPr>" +
      "<xdr:txBody>" +
      '<a:bodyPr wrap="square" lIns="45720" rIns="45720" tIns="27432" bIns="27432" anchor="ctr"/>' +
      "<a:lstStyle/>" +
      paras +
      "</xdr:txBody>" +
      "</xdr:sp>" +
      "<xdr:clientData/>" +
      "</xdr:absoluteAnchor>"
    );
  };

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    shapes.map(body).join("") +
    "</xdr:wsDr>"
  );
}

/**
 * สร้างสมุดงาน .xlsx ที่มีได้หลายชีต
 *
 * แยกจาก buildXLSX เพราะรายงานในระบบส่งออกทีละตาราง แต่เอกสารอธิบายงาน
 * (เช่น Docs/ProjectProcess.xlsx) ต้องแบ่งเป็นหลายหัวข้อในไฟล์เดียว
 * ถ้าแยกเป็นหลายไฟล์ คนอ่านต้องเปิดสลับไปมา และไฟล์หลุดหายจากกันได้ง่าย
 *
 * shapes = รูปทรงที่วาดทับบนชีต (ไม่ใส่ก็ได้) ดูรูปแบบที่ drawingXML
 *
 * @param {Array<{name: string, head: string[], rows: Array<Array<string|number>>, widths?: number[], shapes?: object[]}>} sheets
 * @returns {Uint8Array}
 */
export function buildWorkbook(sheets) {
  const list = (sheets || []).length ? sheets : [{ name: "รายงาน", head: [], rows: [] }];

  const files = [
    {
      name: "[Content_Types].xml",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        list
          .map(
            (_, i) =>
              '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
              '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
          )
          .join("") +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        list
          .map((sh, i) =>
            (sh.shapes || []).length
              ? '<Override PartName="/xl/drawings/drawing' + (i + 1) +
                '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
              : ""
          )
          .join("") +
        "</Types>",
    },
    {
      name: "_rels/.rels",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>",
    },
    {
      name: "xl/workbook.xml",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        "<sheets>" +
        list
          .map(
            (sh, i) =>
              '<sheet name="' + esc(sheetName(sh.name, i)) + '" sheetId="' + (i + 1) +
              '" r:id="rId' + (i + 1) + '"/>'
          )
          .join("") +
        "</sheets>" +
        "</workbook>",
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        list
          .map(
            (_, i) =>
              '<Relationship Id="rId' + (i + 1) +
              '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
              (i + 1) + '.xml"/>'
          )
          .join("") +
        '<Relationship Id="rId' + (list.length + 1) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        "</Relationships>",
    },
    {
      // สไตล์ชุดเล็กที่สุดที่ใช้ได้: ปกติ · ตัวหนาสำหรับหัวตาราง · ตัดบรรทัดสำหรับข้อความยาว
      name: "xl/styles.xml",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font>' +
        '<font><b/><sz val="11"/><name val="Tahoma"/></font></fonts>' +
        '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
        '<borders count="1"><border/></borders>' +
        '<cellStyleXfs count="1"><xf/></cellStyleXfs>' +
        '<cellXfs count="3"><xf xfId="0"/>' +
        '<xf xfId="0" fontId="1" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
        '<xf xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
        "</cellXfs>" +
        "</styleSheet>",
    },
  ];

  list.forEach((sh, i) => {
    const shapes = sh.shapes || [];
    files.push({
      name: "xl/worksheets/sheet" + (i + 1) + ".xml",
      data: sheetXML(sh.head || [], sh.rows || [], sh.widths, shapes.length > 0, sh.noGrid),
    });

    // ชีตที่มีรูปต้องมีไฟล์ความสัมพันธ์ของตัวเอง ชี้ไปที่ไฟล์รูปวาด
    if (!shapes.length) return;
    files.push({
      name: "xl/worksheets/_rels/sheet" + (i + 1) + ".xml.rels",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" ' +
        'Target="../drawings/drawing' + (i + 1) + '.xml"/>' +
        "</Relationships>",
    });
    files.push({
      name: "xl/drawings/drawing" + (i + 1) + ".xml",
      data: drawingXML(shapes),
    });
  });

  return zip(files);
}

/**
 * ส่งออกตารางเป็นไฟล์ Excel แล้วสั่งดาวน์โหลด
 * @param {string[]} head หัวตาราง
 * @param {Array<Array<string|number>>} rows ข้อมูล
 * @param {string} filename ชื่อไฟล์ (ต่อ .xlsx ให้เองถ้าไม่ได้ใส่)
 */
export function downloadXLSX(head, rows, filename) {
  saveXLSX(buildXLSX(head, rows), filename);
}

/**
 * ส่งออกหลายชีตในไฟล์เดียวแล้วสั่งดาวน์โหลด
 *
 * รายงานที่มีหลายมุมมอง (เช่น หมวดการรับฟังลูกค้า) ถ้าแยกเป็นหลายไฟล์
 * คนรับต้องเปิดทีละไฟล์แล้วเทียบเอง ซึ่งไม่มีใครทำ
 *
 * @param {Array<{name:string, head:string[], rows:Array, widths?:number[]}>} sheets ชีตทั้งหมด
 * @param {string} filename ชื่อไฟล์
 */
export function downloadWorkbook(sheets, filename) {
  saveXLSX(buildWorkbook(sheets), filename);
}

/** สั่งเบราว์เซอร์บันทึกไฟล์ .xlsx ที่ประกอบเสร็จแล้ว */
function saveXLSX(bytes, filename) {
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : filename.replace(/\.[^.]*$/, "") + ".xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
