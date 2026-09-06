"use client";

// หน้าจอนำเข้าข้อมูลจาก Excel — ใช้ได้กับหลายหน้าจอในที่เดียว
//
// ลำดับการทำงานที่ตั้งใจ ทุกขั้นต้องเห็นก่อนถึงขั้นถัดไป:
//   1. เลือกหน้าจอที่จะนำเข้า
//   2. เห็นตัวอย่างว่าไฟล์ต้องหน้าตาแบบไหน (คอลัมน์อะไร ตัวอย่างข้อมูล คำอธิบาย)
//   3. กดปุ่มสร้างแบบฟอร์ม ได้ไฟล์เปล่าที่มีหัวคอลัมน์ครบไปกรอก
//   4. เลือกไฟล์ที่กรอกแล้ว → เห็นข้อมูลดิบในไฟล์ก่อน ยังไม่มีอะไรถูกบันทึก
//   5. เห็นผลการตรวจรายแถว ว่าแถวไหนเพิ่มได้ แถวไหนซ้ำ แถวไหนข้อมูลไม่ครบ
//   6. กดอัพโหลด → ถามยืนยันพร้อมสรุป → ตกลงถึงจะบันทึกจริง
//
// เรื่องข้อมูลซ้ำ: ต้องบอกว่าซ้ำ "ตัวไหน" ไม่ใช่บอกแค่ว่ามีซ้ำกี่แถว
//   คนที่ทำไฟล์มาต้องกลับไปแก้ไฟล์ ถ้าไม่บอกเลขที่ที่ซ้ำ เขาต้องไล่หาเองทั้งไฟล์
//   หน้านี้จึงมีทั้งป้ายรายแถวและกล่องสรุปที่ลิสต์เลขที่ซ้ำทั้งหมดให้คัดลอกไปได้
//
// ต่างจากหน้า "การดึงบิลอัตโนมัติ" อย่างไร:
//   หน้านั้นทำงานเรื่องเดียวคือดึงบิลเข้ามาติดตามการจัดส่ง มีเงื่อนไขเฉพาะทางของมัน
//   (ช่วงวันที่ · คลังต้นทาง · จะทำอย่างไรกับใบที่มีอยู่แล้ว)
//   หน้านี้เป็นทางเข้าข้อมูลกลางสำหรับทะเบียนต่าง ๆ ที่ยังไม่มีทางนำเข้าเป็นชุด

import { useMemo, useRef, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { SHIP_START } from "@/lib/constants";
import { IMPORT_SETS, headOf, keyOf, sampleOf, setOf } from "@/lib/importSets";
import { localISO, num, thDate, uid } from "@/lib/format";
import { readTable } from "@/lib/xlsxRead";
import { downloadCSV } from "@/lib/csv";
import { downloadXLSX } from "@/lib/xlsx";
import { useToast } from "../Toast";
import Modal from "../Modal";
import { Badge, Card, Empty, SearchSelect, TableWrap } from "../ui";

const norm = (s) => String(s || "").trim().toLowerCase().replace(/[\s_\-.()]/g, "");

/** ชื่อคอลัมน์แบบ Excel: 0 -> A, 25 -> Z, 26 -> AA */
export function colLabel(n) {
  let s = "";
  let i = n;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

/**
 * แปลงวันที่จากไฟล์ให้เป็น YYYY-MM-DD
 * รับสามแบบที่เจอจริง: ข้อความสากล · วัน/เดือน/ปี (ค.ศ. หรือ พ.ศ.) · ตัวเลขของ Excel
 * แปลงไม่ได้คืนค่าว่าง เพื่อให้แถวนั้นขึ้นเป็นแถวที่มีปัญหา ไม่ใช่เดามั่ว
 */
export function parseDate(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

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
    if (y > 2400) y -= 543; // ปี พ.ศ.
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
    return y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }

  const t = Date.parse(s);
  return Number.isNaN(t) ? "" : localISO(new Date(t));
}

/** ตัดสัญลักษณ์เงินและลูกน้ำออกจากตัวเลข */
export function parseNum(raw) {
  const n = parseFloat(String(raw == null ? "" : raw).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function DataImport({ startSet }) {
  const inv = useInv();
  const perm = inv.perm("dataimport");
  const { db } = inv;
  const toast = useToast();
  const { user } = useAuth();

  // ชุดตั้งต้น: มาจากปุ่มของหน้าอื่น (เช่น "โหลดจาก Excel" ที่หน้ากำหนดเป้าขาย)
  // ถ้าส่งชื่อชุดที่ไม่มีอยู่จริงมา ให้ถอยไปใช้ชุดแรกแทนการขึ้นหน้าว่าง
  const [setId, setSetId] = useState(
    () => (IMPORT_SETS.some((s) => s.id === startSet) ? startSet : IMPORT_SETS[0].id)
  );
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [headRow, setHeadRow] = useState(0);
  const [map, setMap] = useState({});
  const [busy, setBusy] = useState("");
  const [asking, setAsking] = useState(false);
  const [showRaw, setShowRaw] = useState(true);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const set = setOf(setId) || IMPORT_SETS[0];
  const header = rows[headRow] || [];

  /** ค่าที่มีอยู่แล้วในระบบ ใช้เช็คซ้ำ */
  const existing = useMemo(() => {
    const pick = {
      products: (d) => (d.products || []).map((x) => x.code),
      salespersons: (d) => (d.salespersons || []).map((x) => x.code),
      // เป้าใช้ "งวด+มิติ" เป็นตัวกันซ้ำ เพราะเป้าไม่มีรหัสของตัวเอง
      // ตั้งเป้าซ้ำงวดและมิติเดิมคือความผิดพลาด ไม่ใช่การตั้งเป้าเพิ่ม
      targets: (d) =>
        (d.salesTargets || []).map((t) => {
          const sp = (d.salespersons || []).find((x) => x.id === t.salesId);
          return keyOf(set, {
            year: t.year,
            month: t.month,
            salesCode: sp ? sp.code : "",
            grp: t.grp,
            brand: t.brand,
            kind: t.kind,
          });
        }),
      customers: (d) => (d.customers || []).map((x) => x.code),
      suppliers: (d) => (d.suppliers || []).map((x) => x.code),
      warehouses: (d) => (d.warehouses || []).map((x) => x.code),
      bills: (d) => (d.invoices || []).map((x) => x.docNo),
    }[set.id];
    return new Set((pick ? pick(db) : []).map((v) => String(v).trim().toLowerCase()));
  }, [db, set.id]);

  function reset() {
    setRows([]);
    setFileName("");
    setHeadRow(0);
    setMap({});
    setResult(null);
  }

  function pickSet(id) {
    setSetId(id);
    reset();
  }

  /** เดาว่าคอลัมน์ไหนคือช่องไหนจากชื่อหัวตาราง */
  function guessMap(head, s) {
    const out = {};
    s.fields.forEach((f) => {
      const at = head.findIndex((c) => norm(c) === norm(f.name));
      const loose =
        at >= 0 ? at : head.findIndex((c) => norm(c) && norm(c).includes(norm(f.name)));
      if (loose >= 0) out[f.id] = String(loose);
    });
    return out;
  }

  async function pickFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;

    setBusy("read");
    try {
      const table = await readTable(file);
      if (!table.length) throw new Error("ไฟล์นี้ไม่มีข้อมูล");

      // หาแถวหัวตาราง — แถวที่จับคู่ชื่อช่องได้มากที่สุดใน 10 แถวแรก
      let best = 0;
      let bestScore = -1;
      table.slice(0, 10).forEach((r, i) => {
        const score = set.fields.filter((f) => r.some((c) => norm(c) === norm(f.name))).length;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });

      setRows(table);
      setHeadRow(best);
      setMap(guessMap(table[best] || [], set));
      setFileName(file.name);
      setResult(null);
      toast("อ่านไฟล์ " + file.name + " แล้ว " + table.length + " แถว", "ok");
    } catch (err) {
      toast("อ่านไฟล์ไม่สำเร็จ: " + err.message, "err");
    } finally {
      setBusy("");
    }
  }

  /** ช่องบังคับที่ยังจับคู่ไม่ได้ */
  const missingCols = set.fields
    .filter((f) => f.need && (map[f.id] === undefined || map[f.id] === ""))
    .map((f) => f.name);

  /* ------------------------------------------- แปลงและตรวจทีละแถว */

  const parsed = useMemo(() => {
    if (!rows.length) return [];

    const pick = (r, id) => {
      const at = map[id];
      if (at === undefined || at === "") return "";
      const v = r[Number(at)];
      return String(v == null ? "" : v).trim();
    };

    const seen = new Set();

    return rows
      .slice(headRow + 1)
      .filter((r) => r.some((c) => String(c || "").trim()))
      .map((r, n) => {
        const value = {};
        set.fields.forEach((f) => {
          const raw = pick(r, f.id);
          value[f.id] = f.type === "date" ? parseDate(raw) : f.type === "num" ? parseNum(raw) : raw;
        });

        // ชุดที่ใช้หลายช่องรวมกันเป็นกุญแจ ประกอบจากค่าที่แปลงแล้ว ไม่ใช่หยิบช่องเดียว
        const keyRaw = set.keyFields ? keyOf(set, value) : pick(r, set.key);
        const keyLow = keyRaw.trim().toLowerCase();

        // หาช่องบังคับที่ยังว่างหรือแปลงไม่ได้ บอกเป็นชื่อช่อง ไม่ใช่รหัสช่อง
        const blanks = set.fields
          .filter((f) => f.need)
          .filter((f) => (f.type === "num" ? false : !value[f.id]))
          .map((f) => f.name);

        let status = "new";
        let why = "";

        if (!keyRaw) {
          status = "bad";
          why = "ไม่มี" + set.keyName;
        } else if (blanks.length) {
          status = "bad";
          why = "ยังไม่ได้กรอก: " + blanks.join(" · ");
        } else if (seen.has(keyLow)) {
          status = "dupfile";
          why = set.keyName + " " + keyRaw + " ซ้ำกับแถวก่อนหน้าในไฟล์เดียวกัน";
        } else if (existing.has(keyLow)) {
          status = "dupdb";
          why = set.keyName + " " + keyRaw + " มีอยู่แล้วในระบบ";
        }

        if (keyRaw) seen.add(keyLow);

        return { key: "r" + n, rowNo: headRow + 2 + n, value, keyRaw, status, why };
      });
  }, [rows, headRow, map, set, existing]);

  const counts = {
    new: parsed.filter((r) => r.status === "new").length,
    dupdb: parsed.filter((r) => r.status === "dupdb").length,
    dupfile: parsed.filter((r) => r.status === "dupfile").length,
    bad: parsed.filter((r) => r.status === "bad").length,
  };

  /** รายการค่าที่ซ้ำ แยกเป็นซ้ำกับระบบ และซ้ำกันเองในไฟล์ */
  const dupList = {
    db: parsed.filter((r) => r.status === "dupdb").map((r) => r.keyRaw),
    file: parsed.filter((r) => r.status === "dupfile").map((r) => r.keyRaw),
  };

  /* ------------------------------------------------------- อัพโหลด */

  function askUpload() {
    if (busy) return;
    if (missingCols.length) {
      return toast("ยังจับคู่คอลัมน์ไม่ครบ: " + missingCols.join(", "), "err");
    }
    if (!counts.new) return toast("ไม่มีแถวใหม่ที่จะอัพโหลด", "warn");
    setAsking(true);
  }

  /** บันทึกหนึ่งแถวลงระบบ ตามชุดข้อมูลที่เลือก */
  async function saveRow(v) {
    const who = user && user.email ? user.email : "";

    if (set.id === "products") {
      return inv.saveProduct({
        id: uid(),
        code: v.code,
        name: v.name,
        unit: v.unit,
        cat: v.cat || "ทั่วไป",
        price: v.price,
        min: v.min,
        barcode: v.barcode,
        img: "",
        note: "",
        defWhId: "",
        defLocId: "",
      });
    }

    if (set.id === "customers" || set.id === "suppliers") {
      const party = {
        id: uid(),
        code: v.code,
        name: v.name,
        address: v.address,
        subdistrict: v.subdistrict,
        district: v.district,
        province: v.province,
        postcode: v.postcode,
        phone: v.phone,
        kind: v.kind,
        taxId: v.taxId,
        branch: v.branch,
      };
      return set.id === "customers" ? inv.saveCustomer(party) : inv.saveSupplier(party);
    }

    if (set.id === "salespersons") {
      return inv.saveSalesperson({
        id: uid(),
        code: v.code,
        name: v.name,
        phone: v.phone,
        note: v.note,
        active: true,
        user: who,
        ts: Date.now(),
      });
    }

    if (set.id === "targets") {
      // รหัสพนักงานต้องมีอยู่จริง ไม่งั้นเป้าจะลอยไม่ผูกกับใคร
      // และเป็นข้อผิดพลาดที่มองไม่เห็นจนกว่าจะไปดูรายงานแล้วตัวเลขไม่ตรง
      const sp = (db.salespersons || []).find(
        (x) => x.code.toLowerCase() === String(v.salesCode || "").trim().toLowerCase()
      );
      if (v.salesCode && !sp) {
        throw new Error("ไม่พบรหัสพนักงานขาย " + v.salesCode + " ในทะเบียน");
      }
      return inv.saveTarget({
        id: uid(),
        year: Number(v.year) || 0,
        month: Number(v.month) || 0,
        salesId: sp ? sp.id : "",
        grp: v.grp,
        brand: v.brand,
        kind: v.kind,
        amount: Number(v.amount) || 0,
        qty: Number(v.qty) || 0,
        note: "นำเข้าจากไฟล์ " + fileName,
        user: who,
        ts: Date.now(),
      });
    }

    if (set.id === "warehouses") {
      return inv.saveWarehouse({
        id: uid(),
        code: v.code,
        name: v.name,
        province: v.province,
        // ไม่ได้ใส่พิกัดมาก็เก็บเป็น null ไม่ใช่ 0 เพราะ 0,0 คือกลางมหาสมุทรแอตแลนติก
        lat: v.lat || null,
        lng: v.lng || null,
      });
    }

    if (set.id === "bills") {
      const cust = (db.customers || []).find(
        (c) => c.code.toLowerCase() === String(v.custCode).toLowerCase()
      );
      return inv.addInvoice(
        {
          id: uid(),
          docNo: v.docNo,
          date: v.date,
          customerId: cust ? cust.id : "",
          custCode: v.custCode,
          custName: v.custName,
          custAddress: v.custAddress,
          custProvince: v.custProvince,
          custTaxId: "",
          custBranch: "",
          vatRate: 0,
          itemsTotal: v.total,
          billDiscount: 0,
          base: v.total,
          vat: 0,
          total: v.total,
          note: "นำเข้าจากไฟล์ " + fileName + " — ใบติดตามการจัดส่ง ไม่ตัดสต็อก",
          shipStatus: SHIP_START,
          shipFrom: "",
          shipNote: "",
          shipTs: 0,
          custLat: null,
          custLng: null,
          shipKm: null,
          shipKmAt: 0,
          user: who,
          ts: new Date(v.date + "T09:00:00").getTime(),
        },
        []
      );
    }

    throw new Error("ยังไม่รองรับชุดข้อมูลนี้");
  }

  async function run() {
    if (busy) return;
    const todo = parsed.filter((r) => r.status === "new");
    if (!todo.length) return toast("ไม่มีแถวใหม่ที่จะอัพโหลด", "warn");

    setAsking(false);
    setBusy("import");
    const done = [];
    const failed = [];

    for (const r of todo) {
      try {
        await saveRow(r.value);
        done.push(r.keyRaw);
      } catch (e) {
        failed.push("แถวที่ " + r.rowNo + " (" + r.keyRaw + "): " + e.message);
      }
    }

    setBusy("");
    setResult({ done, failed, at: Date.now(), file: fileName, setName: set.name });
    toast(
      failed.length
        ? "อัพโหลดแล้ว " + done.length + " แถว · ไม่สำเร็จ " + failed.length + " แถว"
        : "อัพโหลดครบ " + done.length + " แถวแล้ว",
      failed.length ? "warn" : "ok"
    );
  }

  /** แบบฟอร์มเปล่าพร้อมหัวคอลัมน์และแถวตัวอย่าง */
  function template(kind) {
    const head = headOf(set);
    const sample = [sampleOf(set)];
    if (kind === "xlsx") downloadXLSX(head, sample, "แบบฟอร์ม-" + set.name + ".xlsx");
    else downloadCSV(head, sample, "แบบฟอร์ม-" + set.name + ".csv");
    toast("ดาวน์โหลดแบบฟอร์มแล้ว — ลบแถวตัวอย่างออกแล้วกรอกข้อมูลจริงลงไป", "ok");
  }

  const badgeOf = (s) =>
    s === "new" ? "ok" : s === "dupdb" ? "warn" : s === "dupfile" ? "warn" : "err";
  const labelOf = (s) =>
    s === "new" ? "เพิ่มได้" : s === "dupdb" ? "ซ้ำในระบบ" : s === "dupfile" ? "ซ้ำในไฟล์" : "ข้อมูลไม่ครบ";

  return (
    <div className="stack">
      <Card title="เลือกหน้าจอที่จะนำเข้าข้อมูล">
        <div className="cs-tabs">
          {IMPORT_SETS.map((s) => (
            <button
              key={s.id}
              className={"cs-tab" + (setId === s.id ? " on" : "")}
              onClick={() => pickSet(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>{set.hint}</p>
      </Card>

      <Card
        title={"รูปแบบไฟล์ของ " + set.name}
        actions={
          <>
            <button className="btn btn-g btn-sm" onClick={() => template("xlsx")}>
              สร้างแบบฟอร์ม Excel
            </button>
            <button className="btn btn-g btn-sm" onClick={() => template("csv")}>
              สร้างแบบฟอร์ม CSV
            </button>
          </>
        }
      >
        <p className="muted" style={{ marginTop: 0 }}>
          รองรับไฟล์ <b>Excel (.xlsx)</b> และ <b>CSV (.csv)</b> · ใช้ชีตแรกชีตเดียว ·
          แถวที่ 1 เป็นหัวคอลัมน์ แถวที่ 2 เป็นต้นไปคือข้อมูล หนึ่งแถวคือหนึ่งรายการ
          · ช่องที่มี <b>*</b> ต้องกรอก
        </p>

        <TableWrap>
          <thead>
            <tr>
              <th style={{ width: 60 }}>คอลัมน์</th>
              <th style={{ minWidth: 150 }}>ชื่อหัวคอลัมน์</th>
              <th style={{ minWidth: 170 }}>ตัวอย่างข้อมูล</th>
              <th>คำอธิบาย</th>
            </tr>
          </thead>
          <tbody>
            {set.fields.map((f, i) => (
              <tr key={f.id}>
                <td className="code-cell">{colLabel(i)}</td>
                <td>
                  <b>{f.name}</b>
                  {f.need ? " *" : ""}
                </td>
                <td className="muted">{f.example}</td>
                <td className="muted">{f.note}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>

        <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          กดปุ่ม <b>สร้างแบบฟอร์ม</b> มุมขวาบนจะได้ไฟล์ที่มีหัวคอลัมน์ครบพร้อมแถวตัวอย่างให้กรอกต่อ
          · หัวคอลัมน์ในไฟล์ตั้งชื่อต่างจากนี้ก็ยังใช้ได้ ระบบจะเดาให้แล้วแก้เองได้
        </p>
      </Card>

      <Card
        title="เลือกไฟล์"
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
        <p className="muted" style={{ marginTop: 0, marginBottom: 0 }}>
          {fileName ? "ไฟล์ที่เลือกไว้: " : "ยังไม่ได้เลือกไฟล์ — กดปุ่มมุมขวาบน"}
          {fileName ? <b>{fileName}</b> : null}
          {rows.length ? " · อ่านได้ " + num(rows.length, 0) + " แถว" : ""}
          {" · เลือกไฟล์แล้วยังไม่มีอะไรถูกบันทึก ระบบจะถามยืนยันก่อนเสมอ"}
        </p>
      </Card>

      {rows.length ? (
        <>
          <Card
            title="ข้อมูลที่มีอยู่ในไฟล์"
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
              ข้อมูลดิบจากไฟล์ ยังไม่ได้แปลงอะไร ใช้ดูว่าเลือกไฟล์ถูกและหัวคอลัมน์อยู่แถวที่ถูกต้อง
              {rows.length > 30 ? " · แสดง 30 แถวแรก" : ""}
            </p>
            {showRaw ? (
              <div className="doc-scroll" style={{ maxHeight: 320 }}>
                <TableWrap>
                  <thead>
                    <tr>
                      <th style={{ width: 56 }}>แถว</th>
                      {header.map((c, i) => (
                        <th key={i} style={{ minWidth: 120 }}>
                          {colLabel(i)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 30).map((r, i) => (
                      <tr key={i} className={i === headRow ? "row-head" : ""}>
                        <td className="code-cell">{i + 1}</td>
                        {header.map((c, j) => (
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
              ระบบเดาให้จากชื่อหัวคอลัมน์แล้ว ถ้าเดาผิดให้เลือกใหม่ตรงนี้
            </p>
            <div className="form-grid">
              <div className="field">
                <label className="lbl" htmlFor="di_head">แถวที่เป็นหัวตาราง</label>
                <SearchSelect
                  id="di_head"
                  value={String(headRow)}
                  onChange={(v) => {
                    setHeadRow(Number(v));
                    setMap(guessMap(rows[Number(v)] || [], set));
                  }}
                  options={rows.slice(0, 10).map((r, i) => ({
                    value: String(i),
                    code: "แถว " + (i + 1),
                    label: r.filter(Boolean).slice(0, 4).join(" · ") || "(แถวว่าง)",
                  }))}
                />
              </div>

              {set.fields.map((f) => (
                <div className="field" key={f.id}>
                  <label className="lbl" htmlFor={"di_" + f.id}>
                    {f.name}
                    {f.need ? " *" : ""}
                  </label>
                  <SearchSelect
                    id={"di_" + f.id}
                    value={map[f.id] === undefined ? "" : map[f.id]}
                    onChange={(v) => setMap((m) => ({ ...m, [f.id]: v }))}
                    options={header.map((h, i) => ({
                      value: String(i),
                      code: colLabel(i),
                      label: String(h || "").trim() || "(ไม่มีหัวคอลัมน์)",
                    }))}
                    emptyLabel="— ไม่ใช้ —"
                    notFound="ไม่พบคอลัมน์ที่ตรงกับ"
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* บอกให้ชัดว่าซ้ำ "ตัวไหน" ไม่ใช่บอกแค่จำนวน คนต้องเอาไปแก้ไฟล์ต่อ */}
          {dupList.db.length || dupList.file.length ? (
            <Card title={"พบ" + set.keyName + "ซ้ำ"}>
              {dupList.db.length ? (
                <p style={{ marginTop: 0 }}>
                  <b style={{ color: "var(--warn)" }}>
                    {set.keyName}ที่มีอยู่แล้วในระบบ {num(dupList.db.length, 0)} รายการ:
                  </b>
                  <br />
                  <span className="code-cell">{dupList.db.join(" · ")}</span>
                  <br />
                  <span className="muted">
                    แถวเหล่านี้จะถูกข้าม ไม่เขียนทับข้อมูลเดิม
                    ถ้าต้องการแก้ข้อมูลเดิมให้ไปแก้ที่หน้าจอนั้นโดยตรง
                  </span>
                </p>
              ) : null}

              {dupList.file.length ? (
                <p style={{ marginBottom: 0 }}>
                  <b style={{ color: "var(--warn)" }}>
                    {set.keyName}ที่ซ้ำกันเองในไฟล์ {num(dupList.file.length, 0)} รายการ:
                  </b>
                  <br />
                  <span className="code-cell">{dupList.file.join(" · ")}</span>
                  <br />
                  <span className="muted">
                    ระบบเก็บแถวแรกที่เจอ แถวที่ซ้ำถัดมาจะถูกข้าม —
                    ถ้าไม่ใช่ที่ต้องการ ให้กลับไปแก้ไฟล์แล้วเลือกใหม่
                  </span>
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card
            title="ตรวจข้อมูลก่อนอัพโหลด"
            actions={
              <>
                <Badge kind="ok">เพิ่มได้ {num(counts.new, 0)}</Badge>
                {counts.dupdb ? <Badge kind="warn">ซ้ำในระบบ {num(counts.dupdb, 0)}</Badge> : null}
                {counts.dupfile ? <Badge kind="warn">ซ้ำในไฟล์ {num(counts.dupfile, 0)}</Badge> : null}
                {counts.bad ? <Badge kind="err">ข้อมูลไม่ครบ {num(counts.bad, 0)}</Badge> : null}
                <button
                  className="btn btn-p btn-sm"
                  onClick={askUpload}
                  disabled={!!busy || !perm.edit || !!missingCols.length || !counts.new}
                >
                  {busy === "import" ? "กำลังอัพโหลด…" : "อัพโหลด"}
                </button>
              </>
            }
          >
            {missingCols.length ? (
              <p className="muted" style={{ marginTop: 0, color: "var(--err)" }}>
                ยังจับคู่คอลัมน์ไม่ครบ — ขาด <b>{missingCols.join(" · ")}</b>
              </p>
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>
                ตรวจดูให้เรียบร้อยแล้วกดปุ่ม <b>อัพโหลด</b> มุมขวาบน ระบบจะถามยืนยันอีกครั้ง
              </p>
            )}

            {parsed.length ? (
              <div className="doc-scroll" style={{ maxHeight: 420 }}>
                <TableWrap>
                  <thead>
                    <tr>
                      <th style={{ width: 56 }}>แถว</th>
                      <th style={{ width: 110 }}>ผล</th>
                      {set.fields.map((f) => (
                        <th key={f.id} style={{ minWidth: 130 }}>
                          {f.name}
                        </th>
                      ))}
                      <th style={{ minWidth: 200 }}>หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((r) => (
                      <tr key={r.key} className={r.status === "bad" ? "row-bad" : ""}>
                        <td className="code-cell">{r.rowNo}</td>
                        <td>
                          <Badge kind={badgeOf(r.status)}>{labelOf(r.status)}</Badge>
                        </td>
                        {set.fields.map((f) => (
                          <td key={f.id} className={f.type === "num" ? "num" : ""}>
                            {f.type === "date"
                              ? r.value[f.id]
                                ? thDate(r.value[f.id])
                                : "—"
                              : f.type === "num"
                                ? num(r.value[f.id])
                                : r.value[f.id] || "—"}
                          </td>
                        ))}
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
              นำเข้าที่: <b>{set.name}</b>
            </li>
            <li>
              ไฟล์: <b>{fileName}</b>
            </li>
            <li>
              เพิ่มใหม่ <b>{num(counts.new, 0)}</b> รายการ
            </li>
            {counts.dupdb || counts.dupfile ? (
              <li>
                ข้ามที่ซ้ำ <b>{num(counts.dupdb + counts.dupfile, 0)}</b> รายการ
                (ดูรายชื่อที่ซ้ำได้ในหัวข้อด้านบน)
              </li>
            ) : null}
            {counts.bad ? (
              <li>
                ข้ามที่ข้อมูลไม่ครบ <b>{num(counts.bad, 0)}</b> รายการ
              </li>
            ) : null}
            <li>ข้อมูลเดิมในระบบจะไม่ถูกเขียนทับ</li>
          </ul>
        </Modal>
      ) : null}

      {result ? (
        <Card title="ผลการอัพโหลดล่าสุด">
          <p className="muted" style={{ marginTop: 0 }}>
            {result.setName} · ไฟล์ {result.file} · สำเร็จ {num(result.done.length, 0)} รายการ
            {result.failed.length ? " · ไม่สำเร็จ " + num(result.failed.length, 0) + " รายการ" : ""}
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
            <p className="muted" style={{ marginBottom: 0 }}>
              ไปดูข้อมูลที่นำเข้าได้ที่หน้าจอ <b>{set.name}</b> ได้เลย
            </p>
          )}
        </Card>
      ) : null}
    </div>
  );
}
