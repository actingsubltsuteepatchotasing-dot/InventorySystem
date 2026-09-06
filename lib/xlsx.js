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

/* ------------------------------------------------------------------ CRC32 */

/** ตารางค่า CRC32 สร้างครั้งเดียวตอนใช้ครั้งแรก */
let CRC_TABLE = null;

function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[i] = c >>> 0;
  }
  return CRC_TABLE;
}

function crc32(bytes) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* -------------------------------------------------------------------- zip */

const utf8 = (s) => new TextEncoder().encode(s);

/**
 * ประกอบไฟล์ zip จากรายการ { name, data }
 *
 * โครงของ zip: [ส่วนหัว+ข้อมูลของแต่ละไฟล์] แล้วตามด้วย [สารบัญ] และ [ท้ายสารบัญ]
 * สารบัญต้องรู้ว่าไฟล์แต่ละอันเริ่มที่ไบต์ที่เท่าไร จึงต้องเดินสองรอบ
 */
function zip(files) {
  const parts = [];
  const dir = [];
  let offset = 0;

  const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

  files.forEach((f) => {
    const name = utf8(f.name);
    const data = utf8(f.data);
    const sum = crc32(data);

    // เวลาแก้ไขไฟล์ ตั้งเป็นค่าคงที่ไปเลย ไฟล์เดิมจะได้ไบต์เดิมทุกครั้ง
    // (เทียบไฟล์สองครั้งแล้วต่างกันเพราะนาฬิกา เป็นเรื่องที่ตามหาสาเหตุยาก)
    const time = 0;
    const date = (2020 - 1980) * 512 + 1 * 32 + 1;

    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0),
      ...u16(time), ...u16(date),
      ...u32(sum), ...u32(data.length), ...u32(data.length),
      ...u16(name.length), ...u16(0),
    ];
    parts.push(new Uint8Array(local), name, data);

    dir.push({ name, sum, size: data.length, offset });
    offset += local.length + name.length + data.length;
  });

  const central = [];
  dir.forEach((e) => {
    central.push(
      new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
        ...u16(0), ...u16((2020 - 1980) * 512 + 1 * 32 + 1),
        ...u32(e.sum), ...u32(e.size), ...u32(e.size),
        ...u16(e.name.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0),
        ...u32(e.offset),
      ]),
      e.name
    );
  });

  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(dir.length), ...u16(dir.length),
    ...u32(cdSize), ...u32(offset), ...u16(0),
  ]);

  const all = [...parts, ...central, end];
  const total = all.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  all.forEach((b) => {
    out.set(b, at);
    at += b.length;
  });
  return out;
}

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

function sheetXML(head, rows) {
  const cell = (v, r, c) => {
    const ref = colName(c) + r;
    if (v === null || v === undefined || v === "") return "";
    if (isNum(v)) return '<c r="' + ref + '"><v>' + v + "</v></c>";
    return '<c r="' + ref + '" t="inlineStr"><is><t>' + esc(v) + "</t></is></c>";
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

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    "<sheetData>" + lines.join("") + "</sheetData>" +
    "</worksheet>"
  );
}

/**
 * ส่งออกตารางเป็นไฟล์ Excel แล้วสั่งดาวน์โหลด
 * @param {string[]} head หัวตาราง
 * @param {Array<Array<string|number>>} rows ข้อมูล
 * @param {string} filename ชื่อไฟล์ (ต่อ .xlsx ให้เองถ้าไม่ได้ใส่)
 */
export function downloadXLSX(head, rows, filename) {
  const files = [
    {
      name: "[Content_Types].xml",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
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
        '<sheets><sheet name="รายงาน" sheetId="1" r:id="rId1"/></sheets>' +
        "</workbook>",
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        "</Relationships>",
    },
    {
      // สไตล์ชุดเล็กที่สุดที่ใช้ได้: ปกติหนึ่งแบบ กับตัวหนาสำหรับหัวตารางหนึ่งแบบ
      name: "xl/styles.xml",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font>' +
        '<font><b/><sz val="11"/><name val="Tahoma"/></font></fonts>' +
        '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
        '<borders count="1"><border/></borders>' +
        '<cellStyleXfs count="1"><xf/></cellStyleXfs>' +
        '<cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" applyFont="1"/></cellXfs>' +
        "</styleSheet>",
    },
    { name: "xl/worksheets/sheet1.xml", data: sheetXML(head, rows) },
  ];

  const blob = new Blob([zip(files)], {
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
