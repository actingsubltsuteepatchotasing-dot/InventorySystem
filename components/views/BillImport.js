"use client";

// การดึงบิลอัตโนมัติ — ดึงรายการบิลจากไฟล์ Excel/CSV เข้ามาติดตามการจัดส่ง
//
// ใช้เมื่อบิลถูกออกจากที่อื่น (ระบบบัญชีเดิม หรือไฟล์ที่ฝ่ายขายทำส่งมา)
// แต่ต้องการเอามาเดินสถานะจัดส่งในระบบนี้ จะได้ไม่ต้องคีย์ซ้ำทีละใบ
//
// ข้อสำคัญที่ตั้งใจให้เป็นแบบนี้: ใบที่ดึงเข้ามา "ไม่ตัดสต็อก"
//   ยอดคงเหลือของระบบนี้มาจากรายการเคลื่อนไหว (txns) ที่เดียวเสมอ
//   ไฟล์ Excel ไม่ได้บอกว่าหยิบของจากคลังไหนช่องไหน ถ้าเดาให้แล้วตัดสต็อกไปด้วย
//   ยอดคงเหลือจะเพี้ยนโดยไม่มีใครตามได้ว่าเพี้ยนจากตรงไหน
//   ใบที่ดึงเข้ามาจึงเป็น "ใบสำหรับติดตามการจัดส่ง" ล้วน ๆ และบอกไว้บนหน้าจอชัด ๆ
//   ถ้าต้องการให้ตัดสต็อกด้วย ต้องคีย์ที่หน้าขายสินค้าและบริการซึ่งเลือกคลังและช่องเก็บได้
//
// อ่านไฟล์ทั้ง .xlsx และ .csv ด้วย lib/xlsxRead.js ที่เขียนเอง ไม่ได้ลงไลบรารีเพิ่ม

import { useMemo, useRef, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { SHIP_START, SHIP_STATUS } from "@/lib/constants";
import { localISO, num, thDate, uid } from "@/lib/format";
import { readTable } from "@/lib/xlsxRead";
import { downloadCSV } from "@/lib/csv";
import { downloadXLSX } from "@/lib/xlsx";
import { useToast } from "../Toast";
import Modal from "../Modal";
import { Badge, Card, Empty, SearchSelect, TableWrap, WarehouseSelect } from "../ui";
import SetupNotice from "../SetupNotice";

/**
 * ฟิลด์ที่ดึงเข้ามาได้ พร้อมชื่อหัวคอลัมน์ที่พบบ่อยไว้เดาให้อัตโนมัติ
 *
 * เดาให้ก่อนแล้วให้แก้ทีหลังได้ ดีกว่าบังคับให้จับคู่เองทุกคอลัมน์ทุกครั้ง
 * เพราะไฟล์ที่ดึงเข้ามาส่วนใหญ่หน้าตาเหมือนเดิมทุกเดือน
 */
const FIELDS = [
  {
    id: "docNo",
    name: "เลขที่เอกสาร",
    need: true,
    example: "IV-202609-0001",
    note: "ห้ามซ้ำกัน ใช้เป็นตัวยิงบาร์โค๊ดที่สถานีสแกน",
    hints: ["เลขที่เอกสาร", "เลขที่", "เลขที่บิล", "docno", "doc no", "invoice", "invoice no", "bill"],
  },
  {
    id: "date",
    name: "วันที่เอกสาร",
    need: true,
    example: "06/09/2026",
    note: "ใส่ได้ทั้ง 2026-09-06 · 06/09/2026 · 06/09/2569 (พ.ศ.) หรือรูปแบบวันที่ของ Excel",
    hints: ["วันที่เอกสาร", "วันที่", "date", "invoice date"],
  },
  {
    id: "custCode",
    name: "รหัสลูกค้า",
    need: true,
    example: "C0001",
    note: "ถ้าตรงกับรหัสในทะเบียนลูกค้า ระบบจะผูกให้เอง",
    hints: ["รหัสลูกค้า", "รหัส", "custcode", "customer code", "code"],
  },
  {
    id: "custName",
    name: "ชื่อลูกค้า",
    need: true,
    example: "บริษัท สยามยาง จำกัด",
    note: "ชื่อที่จะแสดงบนกระดานสถานะจัดส่ง",
    hints: ["ชื่อลูกค้า", "ลูกค้า", "custname", "customer", "customer name", "name"],
  },
  {
    id: "custAddress",
    name: "ที่อยู่จัดส่ง",
    need: true,
    example: "99/1 ถนนมิตรภาพ ต.ในเมือง",
    note: "ใช้หาเส้นทางและระยะทางบนแผนที่ที่หน้าการจัดส่งสินค้า",
    hints: ["ที่อยู่", "ที่อยู่จัดส่ง", "สถานที่ส่ง", "address"],
  },
  {
    id: "custProvince",
    name: "จังหวัด",
    need: true,
    example: "ขอนแก่น",
    note: "แยกช่องจากที่อยู่ เพราะกระดานสถานะกรองรายจังหวัด",
    hints: ["จังหวัด", "จังหวัดปลายทาง", "province"],
  },
  {
    id: "total",
    name: "ยอดเงิน",
    need: true,
    example: "10700.00",
    note: "ใส่เป็นตัวเลข มีลูกน้ำหรือสัญลักษณ์เงินก็ได้ ระบบตัดให้เอง",
    hints: ["ยอดเงิน", "ยอดสุทธิ", "ยอดรวม", "จำนวนเงิน", "total", "amount", "net"],
  },
];

/** แถวตัวอย่างที่ใช้ทั้งในตารางบนหน้าจอและในไฟล์แบบฟอร์มที่ดาวน์โหลดไป */
const SAMPLE = [
  ["IV-202609-0001", "06/09/2026", "C0001", "บริษัท สยามยาง จำกัด", "99/1 ถนนมิตรภาพ ต.ในเมือง", "ขอนแก่น", "10700.00"],
  ["IV-202609-0002", "06/09/2026", "C0002", "ร้านไทยรุ่งเรือง", "45 หมู่ 3 ต.บ้านเป็ด", "ขอนแก่น", "5350.00"],
];

const norm = (s) =>
  String(s || "").trim().toLowerCase().replace(/[\s_\-.()]/g, "");

/**
 * แปลงวันที่จากไฟล์ให้เป็น YYYY-MM-DD
 *
 * รองรับสามแบบที่เจอจริง:
 *   1. ข้อความ 2026-09-06 อยู่แล้ว
 *   2. 06/09/2026 หรือ 6-9-2569 (พ.ศ. ก็เจอบ่อยในไฟล์ไทย)
 *   3. ตัวเลขวันที่ของ Excel (จำนวนวันนับจาก 30 ธ.ค. 1899)
 * คืนค่าว่างเมื่อแปลงไม่ได้ เพื่อให้แถวนั้นขึ้นเป็นแถวที่มีปัญหา ไม่ใช่เดามั่ว
 */
export function parseDate(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // ตัวเลขล้วน = รูปแบบวันที่ของ Excel
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) {
      const ms = Math.round((n - 25569) * 86400000);
      return localISO(new Date(ms + new Date().getTimezoneOffset() * 60000));
    }
    return "";
  }

  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    // ปี พ.ศ. — เกิน 2400 แน่นอนว่าไม่ใช่ ค.ศ.
    if (y > 2400) y -= 543;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
    return y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }

  const t = Date.parse(s);
  return Number.isNaN(t) ? "" : localISO(new Date(t));
}

/** ตัดสัญลักษณ์เงินและลูกน้ำออกจากตัวเลข */
export function parseAmount(raw) {
  const n = parseFloat(String(raw == null ? "" : raw).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function BillImport() {
  const inv = useInv();
  const perm = inv.perm("billimport");
  const { db } = inv;
  const toast = useToast();
  const { user } = useAuth();

  const [rows, setRows] = useState([]); // ตารางดิบจากไฟล์
  const [fileName, setFileName] = useState("");
  const [headRow, setHeadRow] = useState(0);
  const [map, setMap] = useState({});
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  // ถามยืนยันด้วยกล่องของระบบเอง ไม่ใช่ window.confirm
  // เพราะต้องแสดงจำนวนใบและเงื่อนไขที่เลือกไว้ให้อ่านก่อนตัดสินใจ
  const [asking, setAsking] = useState(false);
  const [showRaw, setShowRaw] = useState(true);
  const fileRef = useRef(null);

  /* ------------------------------------------------ เงื่อนไขการดึง */
  const [onDup, setOnDup] = useState("skip"); // skip | status
  const [startStatus, setStartStatus] = useState(SHIP_START);
  const [shipFrom, setShipFrom] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [needProvince, setNeedProvince] = useState(false);

  const header = rows[headRow] || [];
  const body = useMemo(() => rows.slice(headRow + 1), [rows, headRow]);

  const columns = header.map((h, i) => ({
    value: String(i),
    code: colLabel(i),
    label: String(h || "").trim() || "(ไม่มีหัวคอลัมน์)",
  }));

  async function pickFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;

    setBusy("read");
    try {
      const table = await readTable(file);
      if (!table.length) throw new Error("ไฟล์นี้ไม่มีข้อมูล");

      // หาแถวหัวตาราง — แถวแรกที่จับคู่กับชื่อฟิลด์ที่รู้จักได้มากที่สุด
      let best = 0;
      let bestScore = -1;
      table.slice(0, 10).forEach((r, i) => {
        const score = FIELDS.filter((f) =>
          r.some((c) => f.hints.some((h) => norm(c) === norm(h)))
        ).length;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });

      setRows(table);
      setHeadRow(best);
      setMap(guessMap(table[best] || []));
      setFileName(file.name);
      setResult(null);
      toast("อ่านไฟล์ " + file.name + " แล้ว " + (table.length - best - 1) + " แถว", "ok");
    } catch (err) {
      toast("อ่านไฟล์ไม่สำเร็จ: " + err.message, "err");
    } finally {
      setBusy("");
    }
  }

  /** เดาว่าคอลัมน์ไหนคือฟิลด์ไหนจากชื่อหัวตาราง */
  function guessMap(head) {
    const out = {};
    FIELDS.forEach((f) => {
      const at = head.findIndex((c) => f.hints.some((h) => norm(c) === norm(h)));
      const loose =
        at >= 0 ? at : head.findIndex((c) => norm(c) && f.hints.some((h) => norm(c).includes(norm(h))));
      if (loose >= 0) out[f.id] = String(loose);
    });
    return out;
  }

  /* ------------------------------------------- แปลงเป็นใบพร้อมตรวจ */

  const parsed = useMemo(() => {
    if (!rows.length) return [];

    const pick = (r, id) => {
      const at = map[id];
      return at === undefined || at === "" ? "" : String(r[Number(at)] == null ? "" : r[Number(at)]).trim();
    };

    const existing = new Map((db.invoices || []).map((v) => [v.docNo.toLowerCase(), v]));
    const seen = new Set();

    return body
      .filter((r) => r.some((c) => String(c || "").trim()))
      .map((r, n) => {
        const docNo = pick(r, "docNo");
        const date = parseDate(pick(r, "date"));
        const custName = pick(r, "custName");
        const province = pick(r, "custProvince");

        const dup = docNo ? existing.get(docNo.toLowerCase()) : null;
        let status = "new";
        let why = "";

        if (!docNo) {
          status = "bad";
          why = "ไม่มีเลขที่เอกสาร";
        } else if (seen.has(docNo.toLowerCase())) {
          status = "bad";
          why = "เลขที่ซ้ำกับแถวก่อนหน้าในไฟล์เดียวกัน";
        } else if (!date) {
          status = "bad";
          why = "วันที่อ่านไม่ออก: " + pick(r, "date");
        } else if (!custName) {
          status = "bad";
          why = "ไม่มีชื่อลูกค้า";
        } else if (fromDate && date < fromDate) {
          status = "skip";
          why = "อยู่นอกช่วงวันที่ที่เลือก";
        } else if (toDate && date > toDate) {
          status = "skip";
          why = "อยู่นอกช่วงวันที่ที่เลือก";
        } else if (needProvince && !province) {
          status = "skip";
          why = "ไม่มีจังหวัดปลายทาง";
        } else if (dup) {
          status = onDup === "skip" ? "skip" : "update";
          why =
            onDup === "skip"
              ? "มีใบนี้อยู่แล้ว"
              : "มีอยู่แล้ว — จะตั้งสถานะจัดส่งใหม่ (ไม่แก้ที่อยู่หรือยอดเงินของใบเดิม)";
        }

        if (docNo) seen.add(docNo.toLowerCase());

        return {
          key: "r" + n,
          docNo,
          date,
          custCode: pick(r, "custCode"),
          custName,
          custProvince: province,
          custAddress: pick(r, "custAddress"),
          total: parseAmount(pick(r, "total")),
          status,
          why,
          dupId: dup ? dup.id : "",
        };
      });
  }, [rows, body, map, db.invoices, onDup, fromDate, toDate, needProvince]);

  /**
   * คอลัมน์บังคับที่ยังไม่ได้จับคู่
   *
   * บล็อกการอัพโหลดไว้ก่อนถ้ายังไม่ครบ แทนที่จะปล่อยให้ดึงเข้าไปแล้วได้ใบที่ข้อมูลแหว่ง
   * ใบที่ไม่มีจังหวัดจะหายไปจากการกรองรายจังหวัดบนกระดานสถานะโดยไม่มีใครสังเกต
   */
  const missingCols = FIELDS.filter(
    (f) => f.need && (map[f.id] === undefined || map[f.id] === "")
  ).map((f) => f.name);

  const counts = {
    new: parsed.filter((r) => r.status === "new").length,
    update: parsed.filter((r) => r.status === "update").length,
    skip: parsed.filter((r) => r.status === "skip").length,
    bad: parsed.filter((r) => r.status === "bad").length,
  };

  /* ---------------------------------------------------- อัพโหลดเข้าระบบ */

  /** กดปุ่มอัพโหลด = เปิดกล่องถามก่อน ยังไม่เขียนอะไรลงฐานข้อมูล */
  function askUpload() {
    if (busy) return;
    if (missingCols.length) {
      return toast("ยังจับคู่คอลัมน์ไม่ครบ: " + missingCols.join(", "), "err");
    }
    const todo = parsed.filter((r) => r.status === "new" || r.status === "update");
    if (!todo.length) return toast("ไม่มีแถวที่จะอัพโหลด", "warn");
    setAsking(true);
  }

  async function run() {
    if (busy) return;
    const todo = parsed.filter((r) => r.status === "new" || r.status === "update");
    if (!todo.length) return toast("ไม่มีแถวที่จะอัพโหลด", "warn");

    setAsking(false);
    setBusy("import");
    const done = [];
    const failed = [];

    for (const r of todo) {
      try {
        if (r.status === "update") {
          await inv.setInvoiceShip(r.dupId, {
            shipStatus: startStatus,
            shipFrom: shipFrom,
            shipNote: "ดึงจากไฟล์ " + fileName,
            shipTs: Date.now(),
          }, { docNo: r.docNo, station: "ดึงบิลอัตโนมัติ", user: user && user.email ? user.email : "" });
        } else {
          const ts = new Date(r.date + "T09:00:00").getTime();
          await inv.addInvoice(
            {
              id: uid(),
              docNo: r.docNo,
              date: r.date,
              customerId: matchCustomer(db, r) || "",
              custCode: r.custCode,
              custName: r.custName,
              custAddress: r.custAddress,
              custProvince: r.custProvince,
              custTaxId: "",
              custBranch: "",
              vatRate: 0,
              itemsTotal: r.total,
              billDiscount: 0,
              base: r.total,
              vat: 0,
              total: r.total,
              note: "ดึงจากไฟล์ " + fileName + " — ใบติดตามการจัดส่ง ไม่ตัดสต็อก",
              shipStatus: startStatus,
              shipFrom: shipFrom,
              shipNote: "",
              shipTs: 0,
              custLat: null,
              custLng: null,
              shipKm: null,
              shipKmAt: 0,
              user: user && user.email ? user.email : "",
              ts,
            },
            []
          );
        }
        done.push(r.docNo);
      } catch (e) {
        failed.push(r.docNo + ": " + e.message);
      }
    }

    setBusy("");
    setResult({ done, failed, at: Date.now(), file: fileName });
    toast(
      failed.length
        ? "อัพโหลดแล้ว " + done.length + " ใบ · ไม่สำเร็จ " + failed.length + " ใบ"
        : "อัพโหลดครบ " + done.length + " ใบแล้ว",
      failed.length ? "warn" : "ok"
    );
  }

  /**
   * แบบฟอร์มเปล่าให้เอาไปกรอกแล้วส่งกลับเข้ามา
   *
   * ให้โหลดได้ทั้ง .xlsx และ .csv เพราะคนที่ทำไฟล์ส่งมามักถนัดคนละอย่างกัน
   * และไฟล์ที่ได้จากตรงนี้มีหัวคอลัมน์ตรงกับที่ระบบรู้จักอยู่แล้ว
   * ระบบจึงจับคู่คอลัมน์ให้เองได้ทันทีโดยไม่ต้องมาเลือกเอง
   */
  function template(kind) {
    const head = FIELDS.map((f) => f.name);
    const rows = SAMPLE.map((r) => r.slice());
    // แถวตัวอย่างใช้วันที่ของวันนี้ จะได้เห็นรูปแบบวันที่ที่ถูกต้องทันที
    rows.forEach((r) => {
      r[1] = localISO(new Date());
    });

    if (kind === "xlsx") downloadXLSX(head, rows, "แบบฟอร์มดึงบิล.xlsx");
    else downloadCSV(head, rows, "แบบฟอร์มดึงบิล.csv");

    toast(
      "ดาวน์โหลดแบบฟอร์มแล้ว — ลบสองแถวตัวอย่างออกแล้วกรอกข้อมูลจริงลงไป",
      "ok"
    );
  }

  if (!inv.invoicesReady) {
    return <SetupNotice feature="การดึงบิลอัตโนมัติ" tables={["invoices", "invoice_items"]} />;
  }

  return (
    <div className="stack">
      <Card
        title="รูปแบบไฟล์ที่ต้องใช้"
        actions={
          <>
            <button className="btn btn-g btn-sm" onClick={() => template("xlsx")}>
              โหลดแบบฟอร์ม Excel
            </button>
            <button className="btn btn-g btn-sm" onClick={() => template("csv")}>
              โหลดแบบฟอร์ม CSV
            </button>
          </>
        }
      >
        <p className="muted" style={{ marginTop: 0 }}>
          รองรับไฟล์ <b>Excel (.xlsx)</b> และ <b>CSV (.csv)</b> เท่านั้น
          — ไฟล์ <b>.xls</b> รุ่นเก่าให้เปิดใน Excel แล้วสั่ง <b>Save As</b> เป็น <b>.xlsx</b> ก่อน
        </p>

        <ol className="note-list">
          <li>เปิด Excel แล้วสร้างไฟล์ใหม่ ใช้ <b>ชีตแรกชีตเดียว</b> (ระบบอ่านเฉพาะชีตแรก)</li>
          <li>
            <b>แถวที่ 1 เป็นหัวคอลัมน์</b> พิมพ์ชื่อหัวคอลัมน์ให้ตรงตามตารางข้างล่างนี้
            เรียงจากคอลัมน์ A ถึง G
          </li>
          <li>แถวที่ 2 เป็นต้นไปคือข้อมูลบิล หนึ่งแถวคือหนึ่งบิล ห้ามเว้นแถวว่างคั่นกลาง</li>
          <li>บันทึกเป็น <b>.xlsx</b> แล้วกลับมากดปุ่ม “เลือกไฟล์” ด้านล่าง</li>
        </ol>

        <p className="muted" style={{ fontSize: 12.5 }}>
          กดปุ่ม <b>โหลดแบบฟอร์ม</b> มุมขวาบนจะได้ไฟล์ที่มีหัวคอลัมน์ครบพร้อมแถวตัวอย่าง
          เอาไปกรอกต่อได้เลย ไม่ต้องพิมพ์หัวคอลัมน์เอง
        </p>

        <TableWrap>
          <thead>
            <tr>
              <th style={{ width: 60 }}>คอลัมน์</th>
              <th style={{ minWidth: 130 }}>ชื่อหัวคอลัมน์</th>
              <th style={{ minWidth: 190 }}>ตัวอย่างข้อมูล</th>
              <th>คำอธิบาย</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map((f, i) => (
              <tr key={f.id}>
                <td className="code-cell">{colLabel(i)}</td>
                <td>
                  <b>{f.name}</b>
                </td>
                <td className="muted">{f.example}</td>
                <td className="muted">{f.note}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>

        <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          ถ้าหัวคอลัมน์ในไฟล์ตั้งชื่อไว้ต่างจากนี้ ก็ยังใช้ได้
          ระบบจะเดาให้ก่อนแล้วให้เลือกใหม่เองได้ที่หัวข้อ “จับคู่คอลัมน์” หลังเลือกไฟล์
        </p>
      </Card>

      <Card
        title="เลือกไฟล์บิล"
        actions={
          <button
            className="btn btn-p btn-sm"
            onClick={() => fileRef.current && fileRef.current.click()}
            disabled={!!busy || !perm.edit}
          >
            {busy === "read" ? "กำลังอ่าน…" : rows.length ? "เลือกไฟล์อื่น" : "เลือกไฟล์ Excel / CSV"}
          </button>
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv,.txt"
          onChange={pickFile}
          style={{ display: "none" }}
        />
        <p className="muted" style={{ marginTop: 0 }}>
          {fileName
            ? "ไฟล์ที่เลือกไว้: "
            : "ยังไม่ได้เลือกไฟล์ — กดปุ่มมุมขวาบนเพื่อเลือกไฟล์จากเครื่อง"}
          {fileName ? <b>{fileName}</b> : null}
          {rows.length ? " · อ่านได้ " + num(rows.length, 0) + " แถว" : ""}
        </p>
        <p className="muted" style={{ marginTop: 0, fontSize: 12.5, marginBottom: 0 }}>
          เลือกไฟล์แล้ว <b>ยังไม่มีอะไรถูกบันทึก</b> — ระบบจะให้ตรวจดูข้อมูลก่อน
          แล้วค่อยถามยืนยันอีกครั้งก่อนอัพโหลดจริง
        </p>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          ใบที่อัพโหลดเข้ามาเป็น <b>ใบสำหรับติดตามการจัดส่งเท่านั้น ไม่ตัดสต็อก</b>
          เพราะไฟล์ไม่ได้บอกว่าหยิบของจากคลังไหนช่องไหน
          ถ้าต้องการให้ตัดสต็อกด้วย ต้องคีย์ที่หน้าขายสินค้าและบริการ
        </p>
      </Card>

      {rows.length ? (
        <>
          <Card
            title="ดูข้อมูลในไฟล์ก่อนอัพโหลด"
            actions={
              <>
                <Badge kind="info">{num(rows.length, 0)} แถวในไฟล์</Badge>
                <button className="btn btn-g btn-sm" onClick={() => setShowRaw(!showRaw)}>
                  {showRaw ? "ซ่อนตาราง" : "แสดงตาราง"}
                </button>
              </>
            }
          >
            <p className="muted" style={{ marginTop: 0 }}>
              นี่คือข้อมูลที่อ่านได้จากไฟล์ตรง ๆ ยังไม่ได้แปลงอะไร
              ใช้ดูว่าเลือกไฟล์ถูกไฟล์และหัวคอลัมน์อยู่แถวที่ถูกต้องหรือไม่
              {rows.length > 30 ? " · แสดง 30 แถวแรก" : ""}
            </p>
            {showRaw ? (
              <div className="doc-scroll" style={{ maxHeight: 340 }}>
                <TableWrap>
                  <thead>
                    <tr>
                      <th style={{ width: 56 }}>แถว</th>
                      {(rows[headRow] || []).map((c, i) => (
                        <th key={i} style={{ minWidth: 120 }}>
                          {colLabel(i)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 30).map((r, i) => (
                      /* แถวที่ระบบถือว่าเป็นหัวตารางทำให้เด่นไว้ จะได้เห็นทันทีว่าเดาถูกไหม */
                      <tr key={i} className={i === headRow ? "row-head" : ""}>
                        <td className="code-cell">{i + 1}</td>
                        {(rows[headRow] || []).map((c, j) => (
                          <td key={j}>{r[j] === undefined ? "" : String(r[j])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
            ) : null}
          </Card>

          <Card title="จับคู่คอลัมน์">
            <p className="muted" style={{ marginTop: 0 }}>
              ระบบเดาให้จากชื่อหัวคอลัมน์แล้ว ถ้าเดาผิดให้เลือกใหม่ตรงนี้ได้
            </p>
            <div className="form-grid">
              <div className="field">
                <label className="lbl" htmlFor="bi_head">แถวที่เป็นหัวตาราง</label>
                <SearchSelect
                  id="bi_head"
                  value={String(headRow)}
                  onChange={(v) => {
                    setHeadRow(Number(v));
                    setMap(guessMap(rows[Number(v)] || []));
                  }}
                  options={rows.slice(0, 10).map((r, i) => ({
                    value: String(i),
                    code: "แถว " + (i + 1),
                    label: r.filter(Boolean).slice(0, 4).join(" · ") || "(แถวว่าง)",
                  }))}
                />
              </div>

              {FIELDS.map((f) => (
                <div className="field" key={f.id}>
                  <label className="lbl" htmlFor={"bi_" + f.id}>
                    {f.name}
                    {f.need ? " *" : ""}
                  </label>
                  <SearchSelect
                    id={"bi_" + f.id}
                    value={map[f.id] === undefined ? "" : map[f.id]}
                    onChange={(v) => setMap((m) => ({ ...m, [f.id]: v }))}
                    options={columns}
                    emptyLabel="— ไม่ใช้ —"
                    notFound="ไม่พบคอลัมน์ที่ตรงกับ"
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card title="เงื่อนไขการดึง">
            <div className="form-grid">
              <div className="field">
                <label className="lbl" htmlFor="bi_dup">ใบที่มีอยู่แล้วในระบบ</label>
                <SearchSelect
                  id="bi_dup"
                  value={onDup}
                  onChange={setOnDup}
                  options={[
                    { value: "skip", code: "ข้าม", label: "ไม่แตะใบเดิม" },
                    {
                      value: "status",
                      code: "อัปเดต",
                      label: "ตั้งสถานะจัดส่งใหม่ตามที่เลือกด้านล่าง (ไม่แก้ที่อยู่หรือยอดเงินของใบเดิม)",
                    },
                  ]}
                />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="bi_status">สถานะตั้งต้นของใบที่ดึงเข้ามา</label>
                <SearchSelect
                  id="bi_status"
                  value={startStatus}
                  onChange={setStartStatus}
                  options={SHIP_STATUS.map((s) => ({ value: s.id, label: s.name }))}
                />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="bi_wh">คลังต้นทางที่จะตั้งให้</label>
                <WarehouseSelect
                  db={db}
                  id="bi_wh"
                  value={shipFrom}
                  onChange={setShipFrom}
                  includeAll
                  allLabel="— ยังไม่ระบุ —"
                />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="bi_from">ดึงเฉพาะวันที่ตั้งแต่</label>
                <input
                  className="inp"
                  type="date"
                  id="bi_from"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="bi_to">ถึงวันที่</label>
                <input
                  className="inp"
                  type="date"
                  id="bi_to"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="bi_prov">ข้ามแถวที่ไม่มีจังหวัด</label>
                <label className="chk-line" htmlFor="bi_prov">
                  <input
                    id="bi_prov"
                    className="chk"
                    type="checkbox"
                    checked={needProvince}
                    onChange={(e) => setNeedProvince(e.target.checked)}
                  />
                  <span>ดึงเฉพาะแถวที่ระบุจังหวัดปลายทางไว้</span>
                </label>
              </div>
            </div>
          </Card>

          <Card
            title="ตรวจข้อมูลก่อนอัพโหลด"
            actions={
              <>
                <Badge kind="ok">ใหม่ {num(counts.new, 0)}</Badge>
                {counts.update ? <Badge kind="info">อัปเดต {num(counts.update, 0)}</Badge> : null}
                {counts.skip ? <Badge kind="gray">ข้าม {num(counts.skip, 0)}</Badge> : null}
                {counts.bad ? <Badge kind="err">มีปัญหา {num(counts.bad, 0)}</Badge> : null}
                <button
                  className="btn btn-p btn-sm"
                  onClick={askUpload}
                  disabled={
                    !!busy || !perm.edit || !!missingCols.length || !(counts.new + counts.update)
                  }
                  title={missingCols.length ? "ยังจับคู่คอลัมน์ไม่ครบ" : ""}
                >
                  {busy === "import" ? "กำลังอัพโหลด…" : "อัพโหลด"}
                </button>
              </>
            }
          >
            {missingCols.length ? (
              <p className="muted" style={{ marginTop: 0, color: "var(--err)" }}>
                ยังจับคู่คอลัมน์ไม่ครบ — ขาด <b>{missingCols.join(" · ")}</b>
                {" "}ให้กลับไปเลือกที่หัวข้อ “จับคู่คอลัมน์” ก่อนจึงจะอัพโหลดได้
              </p>
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>
                ตรวจดูให้เรียบร้อยก่อน แล้วกดปุ่ม <b>อัพโหลด</b> มุมขวาบน
                ระบบจะถามยืนยันอีกครั้งก่อนบันทึกจริง
              </p>
            )}
            {parsed.length ? (
              <div className="doc-scroll" style={{ maxHeight: 420 }}>
                <TableWrap>
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>ผล</th>
                      <th>เลขที่เอกสาร</th>
                      <th style={{ width: 110 }}>วันที่</th>
                      <th style={{ width: 100 }}>รหัสลูกค้า</th>
                      <th>ชื่อลูกค้า</th>
                      <th style={{ width: 140 }}>จังหวัด</th>
                      <th className="num" style={{ width: 110 }}>ยอดสุทธิ</th>
                      <th>หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((r) => (
                      <tr key={r.key} className={r.status === "bad" ? "row-bad" : ""}>
                        <td>
                          <Badge
                            kind={
                              r.status === "new"
                                ? "ok"
                                : r.status === "update"
                                  ? "info"
                                  : r.status === "skip"
                                    ? "gray"
                                    : "err"
                            }
                          >
                            {r.status === "new"
                              ? "ใหม่"
                              : r.status === "update"
                                ? "อัปเดต"
                                : r.status === "skip"
                                  ? "ข้าม"
                                  : "ปัญหา"}
                          </Badge>
                        </td>
                        <td>{r.docNo || "—"}</td>
                        <td>{r.date ? thDate(r.date) : "—"}</td>
                        <td>{r.custCode || "—"}</td>
                        <td>{r.custName || "—"}</td>
                        <td>{r.custProvince || "—"}</td>
                        <td className="num">{r.total ? num(r.total) : "—"}</td>
                        <td className="muted">{r.why}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
            ) : (
              <Empty>ไม่มีแถวข้อมูลใต้แถวหัวตารางที่เลือก</Empty>
            )}
          </Card>
        </>
      ) : null}

      {/*
        ถามยืนยันด้วยกล่องของระบบเอง ไม่ใช่ window.confirm
        เพราะต้องอ่านให้ครบก่อนตัดสินใจว่าจะเขียนอะไรลงไปกี่ใบ ด้วยเงื่อนไขอะไร
        ซึ่งข้อความยาวขนาดนี้ใน window.confirm อ่านไม่ไหวและจัดรูปแบบไม่ได้
      */}
      {asking ? (
        <Modal
          title="ยืนยันการอัพโหลด"
          onClose={() => setAsking(false)}
          maxWidth={560}
          footer={
            <>
              <button className="btn btn-g" onClick={() => setAsking(false)}>
                ยกเลิก
              </button>
              <button className="btn btn-p" onClick={run} disabled={!!busy}>
                ตกลง อัพโหลดเลย
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0, fontSize: 15.5 }}>
            ท่านต้องการอัพโหลดข้อมูลจากไฟล์นี้เข้าระบบหรือไม่?
          </p>
          <ul className="note-list">
            <li>
              ไฟล์: <b>{fileName}</b>
            </li>
            <li>
              เพิ่มใบใหม่ <b>{num(counts.new, 0)}</b> ใบ
              {counts.update
                ? " · ตั้งสถานะจัดส่งใหม่ให้ใบเดิมอีก " + num(counts.update, 0) + " ใบ"
                : ""}
            </li>
            {counts.skip || counts.bad ? (
              <li>
                ข้ามไป <b>{num(counts.skip + counts.bad, 0)}</b> แถว
                (ไม่เข้าเงื่อนไขหรือข้อมูลไม่ครบ)
              </li>
            ) : null}
            <li>
              สถานะตั้งต้น: <b>{(SHIP_STATUS.find((x) => x.id === startStatus) || {}).name}</b>
              {shipFrom ? " · คลังต้นทาง " + inv.whName(shipFrom) : " · ยังไม่ระบุคลังต้นทาง"}
            </li>
            <li>ใบที่อัพโหลดเข้ามา <b>ไม่ตัดสต็อก</b> เป็นใบสำหรับติดตามการจัดส่งเท่านั้น</li>
          </ul>
        </Modal>
      ) : null}

      {result ? (
        <Card title="ผลการอัพโหลดล่าสุด">
          <p className="muted" style={{ marginTop: 0 }}>
            ไฟล์ {result.file} · อัพโหลดสำเร็จ {num(result.done.length, 0)} ใบ
            {result.failed.length ? " · ไม่สำเร็จ " + num(result.failed.length, 0) + " ใบ" : ""}
          </p>
          {result.failed.length ? (
            <ul className="cs-left">
              {result.failed.map((f, i) => (
                <li key={i}>
                  <span style={{ color: "var(--err)" }}>{f}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              ไปดูใบที่ดึงเข้ามาได้ที่เมนู <b>สถานะการจัดส่ง</b> และเดินสถานะต่อที่ <b>สถานีสแกนจัดส่ง</b>
            </p>
          )}
        </Card>
      ) : null}
    </div>
  );
}

/** ชื่อคอลัมน์แบบ Excel: 0 -> A, 25 -> Z, 26 -> AA */
function colLabel(n) {
  let s = "";
  let i = n;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

/** จับคู่ลูกค้าในทะเบียนจากรหัสก่อน ถ้าไม่มีค่อยลองชื่อ */
function matchCustomer(db, r) {
  const list = db.customers || [];
  if (r.custCode) {
    const byCode = list.find((c) => c.code.toLowerCase() === r.custCode.toLowerCase());
    if (byCode) return byCode.id;
  }
  const byName = list.find((c) => c.name.trim() === r.custName.trim());
  return byName ? byName.id : "";
}
