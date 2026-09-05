"use client";

// หน้าจอ รับสินค้า / เบิกสินค้า / โอนสินค้า — ใช้โครงเดียวกัน ต่างกันที่ชนิดรายการ

import { useEffect, useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { TYPES } from "@/lib/constants";
import { defaultBinOf, firstLocOf, nextDocNo } from "@/lib/db";
import { num, thDate, todayISO, uid } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { IcPlus, IcTrash } from "../Icons";
import {
  Badge,
  Card,
  Empty,
  LocationSelect,
  ProductSelect,
  QtyInput,
  TableWrap,
  WarehouseSelect,
} from "../ui";
import SetupNotice from "../SetupNotice";

export default function TxnScreen({ type }) {
  const inv = useInv();

  /*
   * สิทธิของหน้าจอนี้ — ไม่ติ๊ก "แก้ไข" แล้วปุ่มบันทึกถูกปิด เข้ามาดูได้อย่างเดียว
   * ไม่ติ๊ก "เปลี่ยนวันที่" แล้วช่องวันที่ล็อกไว้ (ดูหน้ากำหนดสิทธิการใช้งาน)
   */
  // หน้าจอนี้ใช้ร่วมกันสามหน้า id ของสิทธิจึงมาจากชนิดรายการ (RECEIVE -> receive)
  const perm = inv.perm(type.toLowerCase());
  const { db } = inv;
  const { user } = useAuth();
  const toast = useToast();
  const print = usePrint();
  const [saving, setSaving] = useState(false);

  const T = TYPES[type];
  const isTransfer = type === "TRANSFER";

  const [date, setDate] = useState(todayISO);
  const [ref, setRef] = useState("");

  /**
   * หนึ่งบรรทัด = สินค้าหนึ่งรายการที่จะทำรายการ
   *
   * เก็บเฉพาะสิ่งที่ผู้ใช้กรอก ส่วนยอดคงเหลือคำนวณสดตอนแสดงผล
   * ถ้าเก็บไว้ในแถว พอมีคนอื่นบันทึกรายการเข้ามาระหว่างนี้ ตัวเลขจะค้างกับของเก่า
   */
  function blankRow(from) {
    const pid = db.products[0] ? db.products[0].id : "";
    const def = defaultBinOf(db, pid);

    const whId = from ? from.whId : def ? def.whId : db.warehouses[0].id;
    const other = db.warehouses.find((w) => w.id !== whId) || db.warehouses[0];
    const whTo = from && from.whTo ? from.whTo : other.id;

    return {
      key: uid(),
      productId: pid,
      // บรรทัดใหม่ใช้คลัง/ที่เก็บต่อจากบรรทัดก่อนหน้า เพราะปกติทำเอกสารเดียวคลังเดียว
      whId,
      locId: from ? from.locId : def ? def.locId : firstLocOf(db, whId),
      whTo: isTransfer ? whTo : "",
      locTo: isTransfer ? (from && from.locTo ? from.locTo : firstLocOf(db, whTo)) : "",
      qty: "",
      note: "",
    };
  }

  const [rows, setRows] = useState(() => [blankRow()]);

  // เปลี่ยนชนิดรายการ (รับ/เบิก/โอน) แล้วเริ่มใหม่ทั้งตาราง
  useEffect(() => {
    setRows([blankRow()]);
    setRef("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  /** บรรทัดนี้กรอกครบพอจะบันทึกได้แล้วหรือยัง */
  const isFilled = (r) => !!r.productId && parseFloat(r.qty) > 0;

  /**
   * แก้ค่าในบรรทัด แล้วถ้าบรรทัดสุดท้ายกรอกครบก็ต่อบรรทัดใหม่ให้เลย
   * ผู้ใช้จะได้กรอกไหลลงไปเรื่อย ๆ ไม่ต้องหยุดกดปุ่มเพิ่มบรรทัดทุกครั้ง
   */
  function setRow(key, patch) {
    setRows((prev) => {
      const next = prev.map((r) => (r.key === key ? { ...r, ...patch } : r));
      const last = next[next.length - 1];
      if (isFilled(last)) next.push(blankRow(last));
      return next;
    });
  }

  const addRow = () =>
    setRows((prev) => [...prev, blankRow(prev.length ? prev[prev.length - 1] : null)]);

  const dropRow = (key) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : [blankRow()]));

  /** เลือกสินค้าแล้วย้ายคลัง+ที่เก็บของบรรทัดนั้นไปตามค่าประจำของสินค้า */
  function pickProduct(key, id) {
    const def = defaultBinOf(db, id);
    setRow(key, def ? { productId: id, whId: def.whId, locId: def.locId } : { productId: id });
  }

  const docNo = nextDocNo(db, type, date);
  const filled = rows.filter(isFilled);
  const totalQty = filled.reduce((sum, r) => sum + parseFloat(r.qty), 0);

  /**
   * ของในช่องเก็บที่ยังหยิบได้ สำหรับบรรทัดนี้
   *
   * ต้องหักของที่บรรทัดอื่นในตารางเดียวกันจองไว้ด้วย
   * ไม่งั้นกรอกสองบรรทัดหยิบจากช่องเดียวกันจะดูเหมือนพอทั้งคู่ แล้วไปพังตอนบันทึก
   */
  function availableFor(r) {
    const inBin = inv.placedIn(r.productId, r.locId);
    const takenByOthers = rows
      .filter((x) => x.key !== r.key && x.productId === r.productId && x.locId === r.locId)
      .reduce((sum, x) => sum + (parseFloat(x.qty) || 0), 0);
    return inBin - takenByOthers;
  }

  async function saveDoc() {
    if (saving) return;

    if (!filled.length) {
      return toast("ยังไม่มีบรรทัดที่กรอกครบ — เลือกสินค้าและใส่จำนวนก่อน", "warn");
    }

    // ตรวจทั้งตารางก่อน แล้วค่อยบอกข้อแรกที่เจอ
    const problems = [];
    const seen = new Set();

    filled.forEach((r) => {
      const i = rows.indexOf(r) + 1;
      const at = "บรรทัดที่ " + i;

      const errFrom = inv.checkWhLoc(r.whId, r.locId, isTransfer ? "คลังต้นทาง" : "คลังสินค้า");
      if (errFrom) return problems.push(at + ": " + errFrom);

      if (isTransfer) {
        const errTo = inv.checkWhLoc(r.whTo, r.locTo, "คลังปลายทาง");
        if (errTo) return problems.push(at + ": " + errTo);
        if (r.whId === r.whTo) {
          return problems.push(at + ": คลังต้นทางและปลายทางต้องไม่ใช่คลังเดียวกัน");
        }
        if (r.locId === r.locTo) {
          return problems.push(at + ": ที่เก็บต้นทางและปลายทางต้องไม่ใช่ช่องเดียวกัน");
        }
      }

      const k = r.productId + "|" + r.locId + "|" + r.locTo;
      if (seen.has(k)) return problems.push(at + ": ซ้ำกับบรรทัดก่อนหน้า");
      seen.add(k);
    });

    // ของไม่พอ ตรวจรวมทั้งตารางต่อคู่ (สินค้า, ที่เก็บ)
    if (type !== "RECEIVE") {
      const wanted = new Map();
      filled.forEach((r) => {
        const k = r.productId + "|" + r.locId;
        wanted.set(k, (wanted.get(k) || 0) + parseFloat(r.qty));
      });
      wanted.forEach((need, k) => {
        const cut = k.indexOf("|");
        const pid = k.slice(0, cut);
        const lid = k.slice(cut + 1);
        const have = inv.placedIn(pid, lid);
        if (need > have) {
          problems.push(
            "ของใน " + inv.locName(lid) + " ไม่พอสำหรับ " + inv.prodName(pid) +
              " (มี " + num(have, 0) + " ต้องการ " + num(need, 0) + ")"
          );
        }
      });
    }

    if (problems.length) return toast(problems[0], "err");

    const doc = nextDocNo(db, type, date);
    const ts = new Date(date + "T09:00:00").getTime();
    const txnRows = filled.map((r) => ({
      id: uid(),
      type,
      docNo: doc,
      date,
      productId: r.productId,
      qty: parseFloat(r.qty),
      whId: r.whId,
      whTo: isTransfer ? r.whTo : "",
      locId: r.locId,
      locTo: isTransfer ? r.locTo : "",
      note: r.note.trim(),
      ref: isTransfer ? "" : ref.trim(),
      user: user && user.email ? user.email : "",
      ts,
    }));

    setSaving(true);
    try {
      await inv.addTxns(txnRows);
      toast("บันทึกเอกสาร " + doc + " (" + txnRows.length + " รายการ) เรียบร้อย");
      setRows([blankRow()]);
      setRef("");
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setSaving(false);
    }
  }

  const recent = useMemo(
    () => db.txns.filter((t) => t.type === type).sort((a, b) => b.ts - a.ts).slice(0, 15),
    [db.txns, type]
  );

  function printReport() {
    const list = db.txns.filter((t) => t.type === type).sort((a, b) => a.ts - b.ts);
    if (!list.length) return toast("ไม่มีข้อมูลสำหรับพิมพ์", "warn");

    print({
      title: "รายงาน" + T.name,
      subtitle: "ข้อมูลทั้งหมด " + list.length + " รายการ",
      body: (
        <table>
          <thead>
            <tr>
              <th>ลำดับ</th>
              <th>วันที่</th>
              <th>เลขที่เอกสาร</th>
              <th>รหัส</th>
              <th>รายการสินค้า</th>
              <th>หน่วย</th>
              <th>{isTransfer ? "ต้นทาง → ปลายทาง" : "คลัง · ที่เก็บ"}</th>
              <th style={{ textAlign: "right" }}>จำนวน</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t, i) => {
              const p = inv.prod(t.productId);
              return (
                <tr key={t.id}>
                  <td>{i + 1}</td>
                  <td>{thDate(t.date)}</td>
                  <td>{t.docNo}</td>
                  <td>{p ? p.code : ""}</td>
                  <td>{inv.prodName(t.productId)}</td>
                  <td>{p ? p.unit : ""}</td>
                  <td>
                    {inv.whLocName(t.whId, t.locId) +
                      (isTransfer ? " → " + inv.whLocName(t.whTo, t.locTo) : "")}
                  </td>
                  <td style={{ textAlign: "right" }}>{num(Math.abs(t.qty), 0)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7}>รวมทั้งสิ้น {list.length} รายการ</td>
              <td style={{ textAlign: "right" }}>
                {num(list.reduce((s, t) => s + Math.abs(t.qty), 0), 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      ),
    });
  }

  function exportCSV() {
    const list = db.txns.filter((t) => t.type === type).sort((a, b) => b.ts - a.ts);
    if (!list.length) return toast("ไม่มีข้อมูลสำหรับส่งออก", "warn");
    downloadCSV(
      ["วันที่", "เลขที่เอกสาร", "รหัสสินค้า", "ชื่อสินค้า", "จำนวน", "คลัง", "ที่เก็บ",
        "คลังปลายทาง", "ที่เก็บปลายทาง", "ผู้ทำรายการ", "หมายเหตุ"],
      list.map((t) => {
        const p = inv.prod(t.productId);
        return [t.date, t.docNo, p ? p.code : "", inv.prodName(t.productId), t.qty,
          inv.whName(t.whId), t.locId ? inv.locName(t.locId) : "",
          t.whTo ? inv.whName(t.whTo) : "", t.locTo ? inv.locName(t.locTo) : "",
          t.user, t.note || ""];
      }),
      "รายงาน" + T.name + ".csv"
    );
    toast("ส่งออกไฟล์ CSV แล้ว");
  }

  // ทุกรายการต้องระบุที่เก็บ ถ้ายังไม่มีตารางผังคลังก็บันทึกอะไรไม่ได้
  if (!inv.locationsReady) {
    return <SetupNotice feature={"หน้าจอ" + T.name} tables={["locations", "product_locations"]} />;
  }

  return (
    <div className="stack">
      <Card
        title={"บันทึก" + T.name}
        actions={
          <>
            <Badge>เลขที่เอกสาร {docNo}</Badge>
            <Badge kind={filled.length ? "info" : "gray"}>
              {filled.length} รายการ · {num(totalQty, 0)} หน่วย
            </Badge>
            <button className="btn btn-o btn-sm" onClick={addRow} disabled={saving}>
              <IcPlus size={15} />
              เพิ่มบรรทัด
            </button>
            <button
              className="btn btn-p btn-sm"
              onClick={saveDoc}
              disabled={saving || !filled.length || !perm.edit}
            >
              {saving ? "กำลังบันทึก…" : "บันทึกเอกสาร"}
            </button>
            <button
              className="btn btn-g btn-sm"
              onClick={() => setRows([blankRow()])}
              disabled={saving}
            >
              ล้างตาราง
            </button>
          </>
        }
      >
        <div className="form-grid" style={{ marginBottom: 16 }}>
          <div className="field">
            <label className="lbl" htmlFor="f_date">วันที่ทำรายการ</label>
            <input
              className="inp"
              type="date"
              id="f_date"
              value={date}
              disabled={!perm.date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="f_doc">เลขที่เอกสาร</label>
            <input className="inp" id="f_doc" value={docNo} readOnly />
          </div>
          {isTransfer ? (
            <div className="field span2" style={{ display: "flex", alignItems: "flex-end" }}>
              <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
                เลือกสินค้าและใส่จำนวน แล้วบรรทัดใหม่จะขึ้นให้เอง
              </span>
            </div>
          ) : (
            <div className="field span2">
              <label className="lbl" htmlFor="f_ref">
                {type === "RECEIVE" ? "เลขที่ใบส่งของ / ผู้ขาย" : "หน่วยงานผู้เบิก"}
              </label>
              <input
                className="inp"
                id="f_ref"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder={type === "RECEIVE" ? "เช่น INV-2569-0142" : "เช่น ฝ่ายวิจัยและพัฒนา"}
              />
            </div>
          )}
        </div>

        <TableWrap>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th style={{ minWidth: 210 }}>สินค้า</th>
              <th style={{ minWidth: 165 }}>{isTransfer ? "คลังต้นทาง" : "คลังสินค้า"}</th>
              <th style={{ minWidth: 165 }}>{isTransfer ? "ที่เก็บต้นทาง" : "ที่เก็บสินค้า"}</th>
              <th className="num" style={{ width: 164 }}>จำนวน</th>
              {isTransfer ? <th style={{ minWidth: 165 }}>คลังปลายทาง</th> : null}
              {isTransfer ? <th style={{ minWidth: 165 }}>ที่เก็บปลายทาง</th> : null}
              <th style={{ minWidth: 150 }}>หมายเหตุ</th>
              <th style={{ width: 48 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const p = inv.prod(r.productId);
              const avail = availableFor(r);
              const over = type !== "RECEIVE" && parseFloat(r.qty) > avail;
              return (
                <tr key={r.key}>
                  <td>{i + 1}</td>

                  <td>
                    <ProductSelect
                      db={db}
                      id={"f_prod_" + r.key}
                      value={r.productId}
                      onChange={(v) => pickProduct(r.key, v)}
                    />
                  </td>

                  <td>
                    <WarehouseSelect
                      db={db}
                      id={"f_wh_" + r.key}
                      value={r.whId}
                      onChange={(w) => setRow(r.key, { whId: w, locId: firstLocOf(db, w) })}
                    />
                  </td>

                  <td>
                    <LocationSelect
                      db={db}
                      whId={r.whId}
                      id={"f_loc_" + r.key}
                      value={r.locId}
                      onChange={(l) => setRow(r.key, { locId: l })}
                    />
                  </td>

                  <td className="num">
                    <QtyInput
                      value={r.qty}
                      onChange={(v) => setRow(r.key, { qty: v })}
                      disabled={saving}
                      ariaLabel={"จำนวนของบรรทัดที่ " + (i + 1)}
                    />
                    <div
                      style={{
                        fontSize: 11.5,
                        color: over ? "var(--err)" : "var(--fg-faint)",
                        fontWeight: over ? 700 : 400,
                      }}
                    >
                      {type === "RECEIVE"
                        ? p
                          ? p.unit
                          : ""
                        : "หยิบได้ " + num(avail, 0) + (p ? " " + p.unit : "")}
                    </div>
                  </td>

                  {isTransfer ? (
                    <td>
                      <WarehouseSelect
                        db={db}
                        id={"f_whto_" + r.key}
                        value={r.whTo}
                        onChange={(w) => setRow(r.key, { whTo: w, locTo: firstLocOf(db, w) })}
                      />
                    </td>
                  ) : null}

                  {isTransfer ? (
                    <td>
                      <LocationSelect
                        db={db}
                        whId={r.whTo}
                        id={"f_locto_" + r.key}
                        value={r.locTo}
                        onChange={(l) => setRow(r.key, { locTo: l })}
                      />
                    </td>
                  ) : null}

                  <td>
                    <input
                      className="inp"
                      value={r.note}
                      onChange={(e) => setRow(r.key, { note: e.target.value })}
                      placeholder="ถ้ามี"
                      aria-label={"หมายเหตุของบรรทัดที่ " + (i + 1)}
                    />
                  </td>

                  <td>
                    <button
                      className="btn btn-d btn-icon"
                      title="ลบบรรทัด"
                      onClick={() => dropRow(r.key)}
                      disabled={saving}
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
              <td colSpan={4}>
                กรอก {filled.length} บรรทัด จากทั้งหมด {rows.length}
              </td>
              <td className="num">
                <b>{num(totalQty, 0)}</b>
              </td>
              <td colSpan={isTransfer ? 4 : 2} />
            </tr>
          </tfoot>
        </TableWrap>
      </Card>

      <Card
        title={"รายงาน" + T.name + " ล่าสุด"}
        actions={
          <>
            <button className="btn btn-o btn-sm" onClick={printReport}>พิมพ์รายงาน</button>
            <button className="btn btn-g btn-sm" onClick={exportCSV}>ส่งออก CSV</button>
          </>
        }
      >
        {recent.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>เลขที่เอกสาร</th>
                <th>สินค้า</th>
                <th>{isTransfer ? "ต้นทาง → ปลายทาง" : "คลัง · ที่เก็บ"}</th>
                <th className="num">จำนวน</th>
                <th>ผู้ทำรายการ</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id}>
                  <td>{thDate(t.date)}</td>
                  <td className="code-cell">{t.docNo}</td>
                  <td>{inv.prodName(t.productId)}</td>
                  <td style={{ fontSize: 13 }}>
                    {inv.whLocName(t.whId, t.locId)}
                    {isTransfer ? <b> → {inv.whLocName(t.whTo, t.locTo)}</b> : null}
                  </td>
                  <td className="num">{num(Math.abs(t.qty), 0)}</td>
                  <td>{t.user}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>ยังไม่มีรายการ{T.name}</Empty>
        )}
      </Card>
    </div>
  );
}
