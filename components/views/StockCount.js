"use client";

// หน้าจอตรวจนับสินค้า — ยิงบาร์โค๊ดนับของจริง แล้วเทียบกับยอดในระบบ
//
// ต่างจากหน้า "ปรับปรุงสินค้า" ตรงที่หน้านั้นเริ่มจาก "รู้อยู่แล้วว่าจะปรับอะไร"
// แล้วเลือกสินค้าจากรายการ ส่วนหน้านี้เริ่มจาก "เดินนับของในคลัง"
// คนนับถือเครื่องยิงเดินไปตามชั้น ยิงเจออะไรก็ขึ้นมาให้กรอกจำนวนที่นับได้เลย
//
// นับเป็นราย "ช่องเก็บ" ไม่ใช่รายคลัง เพราะคนเดินนับนับทีละชั้น
// สินค้าตัวเดียวที่อยู่สามช่องจึงขึ้นมาสามบรรทัด ไม่ใช่บรรทัดเดียวรวมกัน
//
// นับเสร็จแล้วบันทึกผลต่างเป็นเอกสารปรับปรุงได้เลยจากหน้านี้
// ไม่ต้องจดใส่กระดาษแล้วไปคีย์ซ้ำที่หน้าปรับปรุง ซึ่งเป็นจุดที่เลขมักเพี้ยน

import { useMemo, useRef, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { findByScan, nextDocNo } from "@/lib/db";
import { num, thDate, todayISO, uid } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { IcTrash } from "../Icons";
import { Badge, Card, Empty, ExportPair, PrintPair, QtyInput, TableWrap, WarehouseSelect } from "../ui";
import SetupNotice from "../SetupNotice";

export default function StockCount() {
  const inv = useInv();
  const perm = inv.perm("stockcount");
  const { db } = inv;
  const { user } = useAuth();
  const toast = useToast();
  const print = usePrint();

  const scanRef = useRef(null);

  const [date, setDate] = useState(todayISO);
  const [whId, setWhId] = useState(() => (db.warehouses[0] ? db.warehouses[0].id : ""));
  const [onlyStock, setOnlyStock] = useState(true);
  const [by1, setBy1] = useState("");
  const [by2, setBy2] = useState("");
  const [term, setTerm] = useState("");
  const [saving, setSaving] = useState(false);

  /** หนึ่งแถว = สินค้าหนึ่งตัวในช่องเก็บหนึ่งช่อง พร้อมจำนวนที่นับได้ */
  const [rows, setRows] = useState([]);

  const bins = useMemo(() => inv.locsOf(whId), [inv, whId]);

  /** ยอดในระบบของแถวนั้น อ่านสดทุกครั้ง ไม่เก็บค้างไว้ในแถว */
  const sysQty = (r) => inv.placedIn(r.productId, r.locId);

  /**
   * เพิ่มสินค้าหนึ่งตัวลงตาราง
   *
   * ขึ้นมาทุกช่องที่มีของอยู่ในคลังนี้ เพราะคนนับต้องเดินไปนับทุกช่อง
   * ถ้าไม่มีของอยู่เลย ยังขึ้นให้หนึ่งบรรทัดที่ช่องแรก
   * เพราะ "นับแล้วเจอของทั้งที่ระบบบอกว่าไม่มี" คือผลต่างที่ต้องบันทึกเหมือนกัน
   */
  function addProduct(p) {
    if (!p) return 0;
    const placed = bins
      .map((l) => ({ loc: l, qty: inv.placedIn(p.id, l.id) }))
      .filter((x) => x.qty > 0);

    const targets = placed.length ? placed.map((x) => x.loc) : bins.slice(0, 1);
    if (!targets.length) {
      toast("คลังนี้ยังไม่มีช่องเก็บ ไปสร้างที่หน้าผังที่เก็บสินค้าก่อน", "warn");
      return 0;
    }

    let added = 0;
    setRows((prev) => {
      const next = [...prev];
      targets.forEach((l) => {
        // ยิงซ้ำตัวเดิมไม่เพิ่มแถวซ้ำ แค่เลื่อนไปที่แถวเดิม (คนนับมักยิงซ้ำโดยไม่ตั้งใจ)
        if (next.some((r) => r.productId === p.id && r.locId === l.id)) return;
        next.push({ key: uid(), productId: p.id, whId, locId: l.id, counted: "" });
        added++;
      });
      return next;
    });
    return added || targets.length;
  }

  /** ยิงบาร์โค๊ดหรือกด Enter — ค้นจากบาร์โค๊ดก่อน แล้วค่อยรหัส/ชื่อ */
  function submitScan() {
    const s = term.trim();
    if (!s) return;

    const hit = findByScan(db, s);
    if (hit) {
      const n = addProduct(hit);
      toast(n ? "เพิ่ม " + hit.name : hit.name + " อยู่ในตารางแล้ว", n ? "ok" : "warn");
      setTerm("");
      if (scanRef.current) scanRef.current.focus();
      return;
    }

    // ไม่ตรงเป๊ะ ลองหาจากชื่อแบบใกล้เคียง เผื่อคนพิมพ์ค้นแทนการยิง
    const q = s.toLowerCase();
    const near = db.products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.barcode || "").toLowerCase().includes(q)
    );
    if (near.length === 1) {
      addProduct(near[0]);
      toast("เพิ่ม " + near[0].name, "ok");
      setTerm("");
      if (scanRef.current) scanRef.current.focus();
      return;
    }
    if (near.length > 1) {
      return toast("พบ " + near.length + " รายการที่ใกล้เคียง — เลือกจากรายการด้านล่างแทน", "warn");
    }
    toast("ไม่พบสินค้า " + s, "err");
  }

  /** เพิ่มทั้งชุดตามโหมดที่เลือก */
  function addAll() {
    const list = onlyStock
      ? db.products.filter((p) => inv.stockOf(p.id, whId) > 0)
      : db.products;
    if (!list.length) return toast("ไม่มีสินค้าตามเงื่อนไขที่เลือก", "warn");
    list.forEach(addProduct);
    toast("เพิ่ม " + list.length + " รายการลงใบตรวจนับ", "ok");
  }

  const setCount = (key, v) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, counted: v } : r)));

  const dropRow = (key) => setRows((prev) => prev.filter((r) => r.key !== key));

  /** แถวที่กรอกจำนวนที่นับได้แล้ว (กรอก 0 ก็นับว่ากรอกแล้ว) */
  const filled = rows.filter((r) => r.counted !== "" && Number.isFinite(parseFloat(r.counted)));
  const diffRows = filled.filter((r) => parseFloat(r.counted) !== sysQty(r));

  const totalSys = rows.reduce((s, r) => s + sysQty(r), 0);
  const totalCount = filled.reduce((s, r) => s + parseFloat(r.counted), 0);

  const docNo = nextDocNo(db, "ADJUST", date);

  /**
   * บันทึกผลต่างเป็นเอกสารปรับปรุง
   *
   * ปรับปรุงเก็บเป็นรายการชนิด ADJUST ที่มีจำนวนเป็นผลต่าง (บวกหรือลบ)
   * ไม่ใช่จำนวนที่นับได้ เพราะยอดคงเหลือคำนวณจากผลรวมของ txns
   * ถ้าเก็บเป็นยอดที่นับได้ ยอดจะกลายเป็นบวกซ้ำเข้าไปอีก
   */
  async function saveAdjust() {
    if (saving) return;
    if (!diffRows.length) {
      return toast("ไม่มีบรรทัดที่ผลต่างไม่เป็นศูนย์ — ไม่ต้องปรับปรุงอะไร", "warn");
    }
    if (!by1.trim()) return toast("กรุณาใส่ชื่อผู้ตรวจนับที่ 1", "err");

    const ts = new Date(date + "T09:00:00").getTime();
    const who = [by1.trim(), by2.trim()].filter(Boolean).join(" / ");

    const txns = diffRows.map((r) => ({
      id: uid(),
      type: "ADJUST",
      docNo,
      date,
      productId: r.productId,
      qty: parseFloat(r.counted) - sysQty(r),
      whId: r.whId,
      whTo: "",
      locId: r.locId,
      locTo: "",
      note: "ตรวจนับโดย " + who,
      ref: "ตรวจนับสินค้า",
      user: user && user.email ? user.email : "",
      ts,
    }));

    setSaving(true);
    try {
      await inv.addTxns(txns);
      toast("บันทึกผลต่างเป็นเอกสารปรับปรุง " + docNo + " (" + txns.length + " รายการ)");
      setRows([]);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setSaving(false);
    }
  }

  function printSheet() {
    if (!rows.length) return toast("ยังไม่มีรายการในใบตรวจนับ", "warn");
    print({
      title: "ใบตรวจนับสินค้า",
      subtitle:
        inv.whName(whId) + " · วันที่ตรวจนับ " + thDate(date) +
        " · ผู้ตรวจนับ " + (by1.trim() || "-") + (by2.trim() ? " และ " + by2.trim() : ""),
      body: (
        <table>
          <thead>
            <tr>
              <th>ลำดับ</th>
              <th>รหัสสินค้า</th>
              <th>รายการสินค้า</th>
              <th>หน่วย</th>
              <th>ที่เก็บ</th>
              <th style={{ textAlign: "right" }}>ยอดในระบบ</th>
              <th style={{ textAlign: "right" }}>นับได้จริง</th>
              <th style={{ textAlign: "right" }}>ผลต่าง</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const p = inv.prod(r.productId);
              const sys = sysQty(r);
              const has = r.counted !== "";
              const got = parseFloat(r.counted);
              return (
                <tr key={r.key}>
                  <td>{i + 1}</td>
                  <td>{p ? p.code : ""}</td>
                  <td>{inv.prodName(r.productId)}</td>
                  <td>{p ? p.unit : ""}</td>
                  <td>{inv.locName(r.locId)}</td>
                  <td style={{ textAlign: "right" }}>{num(sys, 0)}</td>
                  <td style={{ textAlign: "right" }}>{has ? num(got, 0) : ""}</td>
                  <td style={{ textAlign: "right" }}>
                    {has ? (got - sys > 0 ? "+" : "") + num(got - sys, 0) : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>รวม {rows.length} รายการ</td>
              <td style={{ textAlign: "right" }}>{num(totalSys, 0)}</td>
              <td style={{ textAlign: "right" }}>{num(totalCount, 0)}</td>
              <td style={{ textAlign: "right" }}>{num(totalCount - totalSys, 0)}</td>
            </tr>
          </tfoot>
        </table>
      ),
      signers: false,
    });
  }

  function exportFile(save) {
    save(
      ["วันที่", "คลังสินค้า", "ที่เก็บ", "รหัสสินค้า", "ชื่อสินค้า", "หน่วย",
        "ยอดในระบบ", "นับได้จริง", "ผลต่าง", "ผู้ตรวจนับที่ 1", "ผู้ตรวจนับที่ 2"],
      rows.map((r) => {
        const p = inv.prod(r.productId);
        const sys = sysQty(r);
        const got = r.counted === "" ? "" : parseFloat(r.counted);
        return [
          date, inv.whName(r.whId), inv.locName(r.locId),
          p ? p.code : "", inv.prodName(r.productId), p ? p.unit : "",
          sys, got, got === "" ? "" : got - sys, by1, by2,
        ];
      }),
      "ใบตรวจนับสินค้า.csv"
    );
  }

  if (!inv.locationsReady) {
    return (
      <SetupNotice feature="หน้าจอตรวจนับสินค้า" tables={["locations", "product_locations"]} />
    );
  }

  return (
    <div className="stack">
      <Card
        title="ตรวจนับสินค้า"
        actions={
          <>
            <Badge kind={rows.length ? "info" : "gray"}>{rows.length} รายการ</Badge>
            <Badge kind={diffRows.length ? "warn" : "ok"}>
              ผลต่าง {diffRows.length} รายการ
            </Badge>
            <PrintPair onPrint={printSheet} toast={toast} label="พิมพ์ใบตรวจนับ" />
            <ExportPair onExport={exportFile} disabled={!rows.length} toast={toast} />
            <button
              className="btn btn-p btn-sm"
              onClick={saveAdjust}
              disabled={saving || !diffRows.length || !perm.edit}
              title={diffRows.length ? "บันทึกผลต่างเป็นเอกสารปรับปรุง" : "ยังไม่มีผลต่าง"}
            >
              {saving ? "กำลังบันทึก…" : "บันทึกผลต่าง (" + diffRows.length + ")"}
            </button>
          </>
        }
      >
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <div className="field">
            <label className="lbl" htmlFor="sc_date">วันที่ตรวจนับ</label>
            <input
              className="inp"
              type="date"
              id="sc_date"
              value={date}
              disabled={!perm.date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="sc_wh">คลังสินค้าที่นับ</label>
            <WarehouseSelect
              db={db}
              id="sc_wh"
              value={whId}
              onChange={(w) => {
                setWhId(w);
                // เปลี่ยนคลังแล้วรายการเดิมใช้ไม่ได้ เพราะช่องเก็บเป็นของคลังเดิม
                setRows([]);
              }}
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="sc_by1">ผู้ตรวจนับที่ 1</label>
            <input
              className="inp"
              id="sc_by1"
              value={by1}
              onChange={(e) => setBy1(e.target.value)}
              placeholder="ชื่อผู้นับคนที่หนึ่ง"
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="sc_by2">ผู้ตรวจนับที่ 2</label>
            <input
              className="inp"
              id="sc_by2"
              value={by2}
              onChange={(e) => setBy2(e.target.value)}
              placeholder="ชื่อผู้นับคนที่สอง (พยาน)"
            />
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="sc_scan">ยิงบาร์โค๊ด หรือค้นหาสินค้า</label>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input
                className="inp"
                id="sc_scan"
                ref={scanRef}
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitScan();
                  }
                }}
                placeholder="ยิงบาร์โค๊ด หรือพิมพ์รหัส / ชื่อสินค้า แล้วกด Enter"
              />
              <button className="btn btn-p" onClick={submitScan}>ค้นหา</button>
            </div>
            <span className="hint">
              ยิงแล้วขึ้นมาทุกช่องเก็บที่มีของอยู่ในคลังนี้ · ยิงซ้ำตัวเดิมไม่เพิ่มแถวซ้ำ
            </span>
          </div>

          <div className="field span2">
            <label className="lbl">เพิ่มทีเดียวทั้งชุด</label>
            <div className="row">
              <label className="chk-line">
                <input
                  type="radio"
                  className="chk"
                  name="sc_mode"
                  checked={onlyStock}
                  onChange={() => setOnlyStock(true)}
                />
                เฉพาะรายการที่มีสินค้าคงเหลือ
              </label>
              <label className="chk-line">
                <input
                  type="radio"
                  className="chk"
                  name="sc_mode"
                  checked={!onlyStock}
                  onChange={() => setOnlyStock(false)}
                />
                รายการสินค้าทั้งหมด
              </label>
              <button className="btn btn-o btn-sm" onClick={addAll}>
                เพิ่มลงใบตรวจนับ
              </button>
            </div>
          </div>
        </div>

        {rows.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th style={{ width: 100 }}>รหัสสินค้า</th>
                <th style={{ minWidth: 210 }}>ชื่อสินค้า</th>
                <th style={{ minWidth: 150 }}>คลังสินค้า</th>
                <th style={{ minWidth: 150 }}>ที่เก็บสินค้า</th>
                <th className="num" style={{ width: 104 }}>จำนวนในระบบ</th>
                <th className="num" style={{ width: 164 }}>นับได้จริง</th>
                <th className="num" style={{ width: 104 }}>ผลต่าง</th>
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const p = inv.prod(r.productId);
                const sys = sysQty(r);
                const has = r.counted !== "";
                const got = parseFloat(r.counted);
                const diff = has ? got - sys : 0;
                return (
                  <tr key={r.key}>
                    <td>{i + 1}</td>
                    <td className="code-cell">{p ? p.code : ""}</td>
                    <td>{inv.prodName(r.productId)}</td>
                    <td>{inv.whName(r.whId)}</td>
                    <td>{inv.locName(r.locId)}</td>
                    <td className="num">{num(sys, 0)}</td>
                    <td className="num">
                      <QtyInput
                        value={r.counted}
                        onChange={(v) => setCount(r.key, v)}
                        disabled={saving}
                        ariaLabel={"จำนวนที่นับได้ของบรรทัดที่ " + (i + 1)}
                      />
                      <div style={{ fontSize: 11.5, color: "var(--fg-faint)" }}>
                        {p ? p.unit : ""}
                      </div>
                    </td>
                    <td className="num">
                      {has ? (
                        /* บวกเขียว ลบแดง ศูนย์เทา ให้กวาดตาเจอเฉพาะบรรทัดที่ไม่ตรง */
                        <b
                          style={{
                            color:
                              diff > 0 ? "var(--ok)" : diff < 0 ? "var(--err)" : "var(--fg-faint)",
                          }}
                        >
                          {diff > 0 ? "+" : ""}
                          {num(diff, 0)}
                        </b>
                      ) : (
                        <span style={{ color: "var(--fg-faint)" }}>ยังไม่นับ</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-d btn-icon"
                        onClick={() => dropRow(r.key)}
                        disabled={saving}
                        title="เอาบรรทัดนี้ออก"
                      >
                        <IcTrash size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>
                  นับแล้ว {filled.length} จาก {rows.length} รายการ · เอกสารปรับปรุงที่จะออก {docNo}
                </td>
                <td className="num">{num(totalSys, 0)}</td>
                <td className="num">{num(totalCount, 0)}</td>
                <td className="num">
                  <b>{num(totalCount - totalSys, 0)}</b>
                </td>
                <td />
              </tr>
            </tfoot>
          </TableWrap>
        ) : (
          <Empty>
            ยังไม่มีรายการ — ยิงบาร์โค๊ดสินค้า หรือกด “เพิ่มลงใบตรวจนับ” เพื่อดึงทั้งชุดมาก่อน
          </Empty>
        )}
      </Card>
    </div>
  );
}
