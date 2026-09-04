"use client";

// หน้าจอปรับปรุงสินค้า — เทียบยอดตามบัญชีกับยอดที่นับได้จริง แล้วบันทึกผลต่าง

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { ADJUST_REASONS } from "@/lib/constants";
import { defaultBinOf, firstLocOf, nextDocNo } from "@/lib/db";
import { num, thDate, todayISO, uid } from "@/lib/format";
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
import { CountSheetBody } from "./printBodies";

export default function AdjustScreen() {
  const inv = useInv();
  const { db } = inv;
  const { user } = useAuth();
  const toast = useToast();
  const print = usePrint();
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(todayISO);

  /**
   * หนึ่งบรรทัด = สินค้าหนึ่งรายการในช่องเก็บหนึ่งช่อง
   *
   * เก็บเฉพาะสิ่งที่ผู้ใช้กรอกเอง ส่วนยอดตามบัญชี / ผลต่าง คำนวณสด ๆ ตอนแสดงผล
   * ถ้าเก็บยอดตามบัญชีไว้ในแถวด้วย พอมีคนอื่นบันทึกรายการเข้ามาระหว่างนี้
   * ตัวเลขในตารางจะค้างอยู่กับของเก่าโดยไม่รู้ตัว
   */
  function blankRow(from) {
    const pid = db.products[0] ? db.products[0].id : "";
    const def = defaultBinOf(db, pid);
    return {
      key: uid(),
      productId: pid,
      // แถวใหม่ใช้คลัง/ที่เก็บต่อจากแถวก่อนหน้า เพราะปกตินับทีละช่องจนจบ
      whId: from ? from.whId : def ? def.whId : db.warehouses[0].id,
      locId: from ? from.locId : def ? def.locId : firstLocOf(db, db.warehouses[0].id),
      counted: "",
      reason: ADJUST_REASONS[0],
    };
  }

  const [rows, setRows] = useState(() => [blankRow()]);

  const setRow = (key, patch) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((prev) => [...prev, blankRow(prev.length ? prev[prev.length - 1] : null)]);

  const dropRow = (key) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : [blankRow()]));

  /** เลือกสินค้าในแถวไหน ให้ย้ายคลัง+ที่เก็บของแถวนั้นไปตามค่าประจำของสินค้า */
  function pickProduct(key, id) {
    const def = defaultBinOf(db, id);
    setRow(key, def ? { productId: id, whId: def.whId, locId: def.locId } : { productId: id });
  }

  const docNo = nextDocNo(db, "ADJUST", date);

  /**
   * ตัวเลขของแถวหนึ่ง
   *
   * ตรวจนับกันทีละช่องเก็บ ยอดตามบัญชีจึงเป็นยอดในช่องนั้น ไม่ใช่ทั้งคลัง
   * ทำแบบนี้ผลต่างจะไม่มีทางทำให้ของในช่องติดลบ เพราะยอดใหม่คือยอดที่นับได้จริง
   */
  function calc(r) {
    const book = inv.placedIn(r.productId, r.locId);
    const whBalance = inv.stockOf(r.productId, r.whId);
    const countedNum = parseFloat(r.counted);
    const hasCount = r.counted !== "" && !isNaN(countedNum) && countedNum >= 0;
    const diff = hasCount ? countedNum - book : 0;
    return { book, whBalance, countedNum, hasCount, diff };
  }

  const filled = rows.filter((r) => calc(r).hasCount && calc(r).diff !== 0);
  const netDiff = filled.reduce((sum, r) => sum + calc(r).diff, 0);

  async function saveDoc() {
    if (saving) return;

    // ตรวจทุกแถวก่อน แล้วค่อยบอกทีเดียว จะได้ไม่ต้องกดแล้วโดนเตือนทีละข้อ
    const problems = [];
    const seen = new Set();

    rows.forEach((r, i) => {
      const at = "บรรทัดที่ " + (i + 1);
      const { hasCount } = calc(r);

      if (!r.productId) return problems.push(at + ": ยังไม่ได้เลือกสินค้า");

      const err = inv.checkWhLoc(r.whId, r.locId);
      if (err) return problems.push(at + ": " + err);

      if (r.counted !== "" && !hasCount) {
        return problems.push(at + ": ยอดนับได้จริงต้องเป็นตัวเลขไม่ติดลบ");
      }

      const k = r.productId + "|" + r.locId;
      if (seen.has(k)) {
        return problems.push(at + ": สินค้านี้ในที่เก็บนี้ซ้ำกับบรรทัดก่อนหน้า");
      }
      seen.add(k);
    });

    if (problems.length) return toast(problems[0], "err");

    if (!filled.length) {
      return toast("ยังไม่มีบรรทัดที่ต้องปรับปรุง — กรอกยอดนับได้จริงที่ต่างจากบัญชีก่อน", "warn");
    }

    const doc = nextDocNo(db, "ADJUST", date);
    const ts = new Date(date + "T09:00:00").getTime();
    const txnRows = filled.map((r) => {
      const c = calc(r);
      return {
        id: uid(),
        type: "ADJUST",
        docNo: doc,
        date,
        productId: r.productId,
        qty: c.diff,
        whId: r.whId,
        whTo: "",
        locId: r.locId,
        locTo: "",
        note: r.reason,
        ref: "นับได้ " + c.countedNum + " / บัญชี " + c.book,
        user: user && user.email ? user.email : "",
        ts,
      };
    });

    const skipped = rows.length - filled.length;

    setSaving(true);
    try {
      await inv.addTxns(txnRows);
      toast(
        "บันทึกเอกสารปรับปรุง " + doc + " (" + filled.length + " รายการ) เรียบร้อย" +
          (skipped > 0 ? " · ข้าม " + skipped + " บรรทัดที่ยอดตรงกับบัญชี" : "")
      );
      setRows([blankRow()]);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setSaving(false);
    }
  }

  const recent = useMemo(
    () => db.txns.filter((t) => t.type === "ADJUST").sort((a, b) => b.ts - a.ts).slice(0, 15),
    [db.txns]
  );

  function printAdjustReport() {
    const list = db.txns.filter((t) => t.type === "ADJUST").sort((a, b) => a.ts - b.ts);
    if (!list.length) return toast("ไม่มีข้อมูลสำหรับพิมพ์", "warn");

    print({
      title: "รายงานการปรับปรุงสินค้า",
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
              <th>คลัง · ที่เก็บ</th>
              <th style={{ textAlign: "right" }}>ผลต่าง</th>
              <th>สาเหตุ</th>
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
                  <td>{inv.whLocName(t.whId, t.locId)}</td>
                  <td style={{ textAlign: "right" }}>
                    {(t.qty > 0 ? "+" : "") + num(t.qty, 0)}
                  </td>
                  <td>{t.note || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ),
    });
  }

  function printSheet() {
    const sheetWh = rows.length ? rows[0].whId : db.warehouses[0].id;
    const w = inv.wh(sheetWh);
    print({
      title: "ใบตรวจนับสินค้าคงคลัง",
      subtitle: (w ? w.name + " · จังหวัด" + w.province : "ทุกคลัง") + " · ณ วันที่ " + thDate(todayISO()),
      body: <CountSheetBody db={db} inv={inv} whId={sheetWh} />,
    });
  }

  if (!inv.locationsReady) {
    return (
      <SetupNotice feature="หน้าจอปรับปรุงสินค้า" tables={["locations", "product_locations"]} />
    );
  }

  return (
    <div className="stack">
      <Card
        title="บันทึกการปรับปรุงสินค้า (จากผลการตรวจนับ)"
        actions={
          <>
            <Badge>เลขที่เอกสาร {docNo}</Badge>
            <Badge kind={filled.length ? "info" : "gray"}>
              {filled.length} บรรทัดที่ต้องปรับปรุง
            </Badge>
            <button className="btn btn-o btn-sm" onClick={addRow} disabled={saving}>
              <IcPlus size={15} />
              เพิ่มบรรทัด
            </button>
            <button
              className="btn btn-p btn-sm"
              onClick={saveDoc}
              disabled={saving || !filled.length}
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
            <label className="lbl" htmlFor="a_date">วันที่ตรวจนับ</label>
            <input
              className="inp"
              type="date"
              id="a_date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="a_doc">เลขที่เอกสาร</label>
            <input className="inp" id="a_doc" value={docNo} readOnly />
          </div>
          <div className="field span2" style={{ display: "flex", alignItems: "flex-end" }}>
            <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
              กรอกยอดที่นับได้จริงของแต่ละช่องเก็บ บรรทัดที่ยอดตรงกับบัญชีจะถูกข้ามตอนบันทึก
            </span>
          </div>
        </div>

        <TableWrap>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th style={{ minWidth: 210 }}>สินค้า</th>
              <th style={{ minWidth: 170 }}>คลัง · ที่เก็บ</th>
              <th className="num" style={{ width: 104 }}>ตามบัญชี</th>
              <th className="num" style={{ width: 164 }}>นับได้จริง</th>
              <th className="num" style={{ width: 96 }}>ผลต่าง</th>
              <th style={{ minWidth: 170 }}>สาเหตุ</th>
              <th style={{ width: 48 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const c = calc(r);
              const p = inv.prod(r.productId);
              return (
                <tr key={r.key}>
                  <td>{i + 1}</td>

                  <td>
                    <ProductSelect
                      db={db}
                      id={"a_prod_" + r.key}
                      value={r.productId}
                      onChange={(v) => pickProduct(r.key, v)}
                    />
                  </td>

                  <td>
                    {/* คลังกับที่เก็บของแถวนี้ เปลี่ยนคลังแล้วที่เก็บเด้งเป็นช่องแรกให้ */}
                    <WarehouseSelect
                      db={db}
                      id={"a_wh_" + r.key}
                      value={r.whId}
                      onChange={(w) => setRow(r.key, { whId: w, locId: firstLocOf(db, w) })}
                    />
                    <div style={{ marginTop: 5 }}>
                      <LocationSelect
                        db={db}
                        whId={r.whId}
                        id={"a_loc_" + r.key}
                        value={r.locId}
                        onChange={(l) => setRow(r.key, { locId: l })}
                      />
                    </div>
                  </td>

                  <td className="num">
                    <b>{num(c.book, 0)}</b>
                    <div style={{ fontSize: 11.5, color: "var(--fg-faint)" }}>
                      ทั้งคลัง {num(c.whBalance, 0)}
                    </div>
                  </td>

                  <td className="num">
                    <QtyInput
                      value={r.counted}
                      onChange={(v) => setRow(r.key, { counted: v })}
                      disabled={saving}
                      ariaLabel={"ยอดนับได้จริงของบรรทัดที่ " + (i + 1)}
                    />
                    {p ? (
                      <div style={{ fontSize: 11.5, color: "var(--fg-faint)" }}>{p.unit}</div>
                    ) : null}
                  </td>

                  <td className="num">
                    <b
                      style={{
                        color:
                          !c.hasCount || c.diff === 0
                            ? "var(--fg-faint)"
                            : c.diff > 0
                              ? "var(--ok)"
                              : "var(--err)",
                      }}
                    >
                      {c.hasCount ? (c.diff > 0 ? "+" : "") + num(c.diff, 0) : "—"}
                    </b>
                  </td>

                  <td>
                    <select
                      className="sel"
                      value={r.reason}
                      onChange={(e) => setRow(r.key, { reason: e.target.value })}
                      aria-label={"สาเหตุของบรรทัดที่ " + (i + 1)}
                    >
                      {ADJUST_REASONS.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
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
              <td colSpan={5}>
                รวม {rows.length} บรรทัด · ต้องปรับปรุง {filled.length} บรรทัด
              </td>
              <td className="num">
                <b>{(netDiff > 0 ? "+" : "") + num(netDiff, 0)}</b>
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </TableWrap>
      </Card>

      <Card
        title="รายงานการปรับปรุงล่าสุด"
        actions={
          <>
            <button className="btn btn-o btn-sm" onClick={printAdjustReport}>พิมพ์รายงาน</button>
            <button className="btn btn-g btn-sm" onClick={printSheet}>พิมพ์ใบตรวจนับ</button>
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
                <th>คลัง · ที่เก็บ</th>
                <th className="num">ผลต่าง</th>
                <th>สาเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id}>
                  <td>{thDate(t.date)}</td>
                  <td className="code-cell">{t.docNo}</td>
                  <td>{inv.prodName(t.productId)}</td>
                  <td style={{ fontSize: 13 }}>{inv.whLocName(t.whId, t.locId)}</td>
                  <td className="num">
                    <b style={{ color: t.qty > 0 ? "var(--ok)" : "var(--err)" }}>
                      {(t.qty > 0 ? "+" : "") + num(t.qty, 0)}
                    </b>
                  </td>
                  <td style={{ fontSize: 13 }}>{t.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>ยังไม่มีรายการปรับปรุง</Empty>
        )}
      </Card>
    </div>
  );
}
