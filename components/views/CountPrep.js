"use client";

// หน้าจอเตรียมใบตรวจนับ — ทำที่โต๊ะก่อนออกไปนับ
//
// แยกจากหน้านับด้วยมือถือ เพราะเป็นคนละจังหวะและคนละอุปกรณ์:
//   หน้านี้        เตรียมที่คอมพิวเตอร์ เลือกคลัง ขอบเขต และผู้ตรวจนับ แล้วพิมพ์ใบออกไป
//   นับสินค้า      ถือมือถือเดินไปตามชั้น สแกนบาร์โค๊ดแล้วกรอกจำนวน
//
// เอกสารจึงต้องอยู่บนฐานข้อมูล ไม่ใช่ในหน่วยความจำของหน้าจอเดียวเหมือนเดิม
// ไม่งั้นเตรียมที่คอมแล้วเปิดมือถือจะไม่เห็นอะไรเลย
//
// ยอดในระบบถูกบันทึกไว้ในใบตอนเตรียม (sys_qty) ไม่ได้อ่านสดตอนนับ
// เพราะการนับคือการเทียบของจริงกับยอด ณ เวลาที่เริ่มนับ
// ถ้าอ่านสดแล้วมีคนเบิกของระหว่างเดินนับ ผลต่างจะเพี้ยนโดยไม่มีใครรู้

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { nextDocNo } from "@/lib/db";
import { num, thDate, thDateTime, todayISO, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { IcTrash } from "../Icons";
import {
  Badge,
  Card,
  DocBrowser,
  Empty,
  ExportPair,
  PrintPair,
  TableWrap,
  WarehouseSelect,
} from "../ui";
import SetupNotice from "../SetupNotice";

/** ขอบเขตของการนับ */
const SCOPES = [
  { id: "stock", name: "เฉพาะรายการที่มีสินค้าคงเหลือ", hint: "นับของที่ระบบบอกว่ามีอยู่" },
  { id: "all", name: "สินค้าทั้งหมดในคลังนี้", hint: "รวมของที่ระบบบอกว่าไม่มี เผื่อนับแล้วเจอ" },
];

export default function CountPrep() {
  const inv = useInv();
  const perm = inv.perm("countprep");
  const { db } = inv;
  const { user } = useAuth();
  const toast = useToast();
  const print = usePrint();

  const [busy, setBusy] = useState("");
  const [date, setDate] = useState(todayISO);
  const [whId, setWhId] = useState(() => (db.warehouses[0] ? db.warehouses[0].id : ""));
  const [scope, setScope] = useState("stock");
  const [by1, setBy1] = useState("");
  const [by2, setBy2] = useState("");
  const [note, setNote] = useState("");

  const docNo = nextDocNo(db, "COUNT", date);

  /**
   * รายการที่จะเข้าไปอยู่ในใบ — หนึ่งบรรทัดคือสินค้าหนึ่งตัวในช่องเก็บหนึ่งช่อง
   *
   * นับเป็นรายช่องเก็บ ไม่ใช่รายคลัง เพราะคนเดินนับนับทีละชั้น
   * โหมด "ทั้งหมด" จะเพิ่มสินค้าที่ยังไม่มีของไว้ที่ช่องแรกของคลังให้ด้วย
   * เพราะ "นับแล้วเจอของทั้งที่ระบบว่าไม่มี" คือผลต่างที่ต้องบันทึกเหมือนกัน
   */
  const plan = useMemo(() => {
    const bins = inv.locsOf(whId);
    if (!bins.length) return [];

    const out = [];
    db.products.forEach((p) => {
      const placed = bins
        .map((l) => ({ loc: l, qty: inv.placedIn(p.id, l.id) }))
        .filter((x) => x.qty > 0);

      if (placed.length) {
        placed.forEach((x) => out.push({ p, loc: x.loc, sysQty: x.qty }));
      } else if (scope === "all") {
        out.push({ p, loc: bins[0], sysQty: 0 });
      }
    });
    return out;
  }, [db.products, whId, scope, inv]);

  const counts = useMemo(
    () => (db.stockCounts || []).slice().sort((a, b) => b.ts - a.ts),
    [db.stockCounts]
  );

  async function create() {
    if (busy) return;
    if (!whId) return toast("กรุณาเลือกคลังสินค้าที่จะนับ", "err");
    if (!by1.trim()) return toast("กรุณาใส่ชื่อผู้ตรวจนับที่ 1", "err");
    if (!plan.length) {
      return toast("ไม่มีรายการตามขอบเขตที่เลือก — ลองเปลี่ยนเป็นสินค้าทั้งหมด", "warn");
    }

    const id = uid();
    const ts = new Date(date + "T09:00:00").getTime();

    const count = {
      id,
      docNo,
      date,
      whId,
      by1: by1.trim(),
      by2: by2.trim(),
      status: "OPEN",
      note: note.trim(),
      user: user && user.email ? user.email : "",
      ts,
      postedDoc: "",
    };

    const items = plan.map((r, i) => ({
      id: uid(),
      countId: id,
      productId: r.p.id,
      whId,
      locId: r.loc.id,
      sysQty: r.sysQty,
      counted: null,
      countedAt: 0,
      seq: i + 1,
    }));

    setBusy("create");
    try {
      await inv.addCount(count, items);
      toast("สร้างใบตรวจนับ " + docNo + " (" + items.length + " รายการ) แล้ว", "ok");
      setBy1("");
      setBy2("");
      setNote("");
    } catch (e) {
      toast("สร้างใบตรวจนับไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  /** สรุปความคืบหน้าของใบหนึ่ง */
  function progress(c) {
    const items = inv.itemsOfCount(c.id);
    const done = items.filter((i) => i.counted !== null);
    const diff = done.filter((i) => i.counted !== i.sysQty);
    return { items, done: done.length, total: items.length, diff };
  }

  /**
   * บันทึกผลต่างเป็นเอกสารปรับปรุง แล้วปิดใบ
   *
   * เก็บเป็นรายการปรับปรุงที่มีจำนวนเป็น "ผลต่าง" ไม่ใช่ "ยอดที่นับได้"
   * เพราะยอดคงเหลือคำนวณจากผลรวมของ txns ถ้าเก็บยอดที่นับได้ ยอดจะบวกซ้ำเข้าไปอีก
   */
  async function post(c) {
    if (busy) return;
    const { items, done, total, diff } = progress(c);

    if (done < total) {
      const ok = window.confirm(
        "ใบนี้ยังนับไม่ครบ (" + done + " จาก " + total + " รายการ)\n\n" +
          "รายการที่ยังไม่ได้นับจะถูกข้ามไป ไม่ถือว่าเป็นศูนย์\n\nปิดใบและบันทึกผลต่างเลยหรือไม่?"
      );
      if (!ok) return;
    }
    if (!diff.length) {
      const ok = window.confirm(
        "ไม่มีรายการที่ผลต่างไม่เป็นศูนย์ — ไม่ต้องปรับปรุงอะไร\n\nปิดใบนี้เลยหรือไม่?"
      );
      if (!ok) return;
      setBusy(c.id);
      try {
        await inv.closeCount(c.id, "");
        toast("ปิดใบตรวจนับ " + c.docNo + " แล้ว (ไม่มีผลต่าง)", "ok");
      } catch (e) {
        toast("ปิดใบไม่สำเร็จ: " + e.message, "err");
      } finally {
        setBusy("");
      }
      return;
    }

    const adjNo = nextDocNo(db, "ADJUST", c.date);
    const who = [c.by1, c.by2].filter(Boolean).join(" / ");
    const ts = new Date(c.date + "T09:00:00").getTime();

    const txns = diff.map((i) => ({
      id: uid(),
      type: "ADJUST",
      docNo: adjNo,
      date: c.date,
      productId: i.productId,
      qty: i.counted - i.sysQty,
      whId: i.whId,
      whTo: "",
      locId: i.locId,
      locTo: "",
      note: "ตรวจนับ " + c.docNo + " โดย " + who,
      ref: c.docNo,
      user: user && user.email ? user.email : "",
      ts,
    }));

    setBusy(c.id);
    try {
      await inv.addTxns(txns);
      await inv.closeCount(c.id, adjNo);
      toast("บันทึกผลต่าง " + txns.length + " รายการเป็นเอกสาร " + adjNo + " แล้ว", "ok");
    } catch (e) {
      toast("บันทึกผลต่างไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  async function drop(c) {
    if (busy) return;
    if (c.status === "DONE") return toast("ใบที่ปิดแล้วลบไม่ได้ เก็บไว้ตรวจสอบย้อนหลัง", "warn");
    if (!window.confirm("ลบใบตรวจนับ " + c.docNo + " และรายการทั้งหมดในใบ?")) return;
    setBusy(c.id);
    try {
      await inv.removeCount(c.id);
      toast("ลบใบตรวจนับ " + c.docNo + " แล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  function sheetRows(c) {
    return inv.itemsOfCount(c.id).map((i, n) => {
      const p = inv.prod(i.productId);
      return [
        n + 1,
        p ? p.code : "",
        inv.prodName(i.productId),
        p ? p.unit : "",
        inv.locName(i.locId),
        i.sysQty,
        i.counted === null ? "" : i.counted,
        i.counted === null ? "" : i.counted - i.sysQty,
      ];
    });
  }

  const SHEET_HEAD = ["ลำดับ", "รหัสสินค้า", "รายการสินค้า", "หน่วย", "ที่เก็บ",
    "ยอดในระบบ", "นับได้จริง", "ผลต่าง"];

  function printSheet(c) {
    print({
      title: "ใบตรวจนับสินค้า " + c.docNo,
      subtitle:
        inv.whName(c.whId) + " · วันที่ " + thDate(c.date) +
        " · ผู้ตรวจนับ " + (c.by1 || "-") + (c.by2 ? " และ " + c.by2 : ""),
      body: (
        <table>
          <thead>
            <tr>
              {SHEET_HEAD.map((h, i) => (
                <th key={h} style={i >= 5 ? { textAlign: "right" } : undefined}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheetRows(c).map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j} style={j >= 5 ? { textAlign: "right" } : undefined}>
                    {typeof v === "number" ? num(v, 0) : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ),
    });
  }

  if (!inv.countsReady) {
    return (
      <SetupNotice
        feature="หน้าจอเตรียมใบตรวจนับ"
        tables={["stock_counts", "stock_count_items"]}
      />
    );
  }

  return (
    <div className="stack">
      <Card
        title="เตรียมใบตรวจนับ"
        actions={
          <>
            <Badge>เลขที่ {docNo}</Badge>
            <Badge kind={plan.length ? "info" : "gray"}>{num(plan.length, 0)} รายการที่จะนับ</Badge>
            <button
              className="btn btn-p btn-sm"
              onClick={create}
              disabled={!!busy || !plan.length || !perm.edit}
            >
              {busy === "create" ? "กำลังสร้าง…" : "สร้างใบตรวจนับ"}
            </button>
          </>
        }
      >
        <p className="muted" style={{ marginTop: 0 }}>
          เตรียมใบที่นี่ แล้วเปิดเมนู <b>นับสินค้า (มือถือ)</b> บนโทรศัพท์เพื่อเดินสแกนนับ
          · ยอดในระบบจะถูกบันทึกไว้ในใบตั้งแต่ตอนสร้าง ไม่ได้อ่านใหม่ตอนนับ
        </p>

        <div className="form-grid">
          <div className="field">
            <label className="lbl" htmlFor="cp_date">วันที่ตรวจนับ</label>
            <input
              className="inp"
              type="date"
              id="cp_date"
              value={date}
              disabled={!perm.date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="cp_wh">คลังสินค้าที่นับ</label>
            <WarehouseSelect db={db} id="cp_wh" value={whId} onChange={setWhId} />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="cp_by1">ผู้ตรวจนับที่ 1</label>
            <input
              className="inp"
              id="cp_by1"
              value={by1}
              onChange={(e) => setBy1(e.target.value)}
              placeholder="ชื่อผู้นับคนที่หนึ่ง"
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="cp_by2">ผู้ตรวจนับที่ 2</label>
            <input
              className="inp"
              id="cp_by2"
              value={by2}
              onChange={(e) => setBy2(e.target.value)}
              placeholder="ชื่อผู้นับคนที่สอง (พยาน)"
            />
          </div>

          <div className="field span2">
            <label className="lbl">ขอบเขตการนับ</label>
            <div className="row">
              {SCOPES.map((sc) => (
                <label className="chk-line" key={sc.id} title={sc.hint}>
                  <input
                    type="radio"
                    className="chk"
                    name="cp_scope"
                    checked={scope === sc.id}
                    onChange={() => setScope(sc.id)}
                  />
                  {sc.name}
                </label>
              ))}
            </div>
            <span className="hint">
              {(SCOPES.find((x) => x.id === scope) || SCOPES[0]).hint} ·
              นับเป็นรายช่องเก็บ สินค้าที่อยู่สามช่องจะขึ้นมาสามบรรทัด
            </span>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="cp_note">หมายเหตุ</label>
            <input
              className="inp"
              id="cp_note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ตรวจนับประจำงวดสิ้นเดือน"
            />
          </div>
        </div>
      </Card>

      <Card title="ใบตรวจนับ" actions={<Badge>{counts.length} ใบ</Badge>}>
        <DocBrowser
          rows={counts}
          empty="ยังไม่มีใบตรวจนับ — กรอกด้านบนแล้วกด “สร้างใบตรวจนับ”"
          placeholder="ค้นหาเลขที่เอกสาร คลัง หรือชื่อผู้ตรวจนับ…"
        >
          {(list) => (
            <TableWrap>
              <thead>
                <tr>
                  <th style={{ minWidth: 140 }}>เลขที่เอกสาร</th>
                  <th style={{ width: 118 }}>วันที่</th>
                  <th style={{ minWidth: 160 }}>คลังสินค้า</th>
                  <th style={{ minWidth: 170 }}>ผู้ตรวจนับ</th>
                  <th className="num" style={{ width: 120 }}>นับแล้ว</th>
                  <th className="num" style={{ width: 90 }}>ผลต่าง</th>
                  <th style={{ width: 130 }}>สถานะ</th>
                  <th style={{ width: 210 }} />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const pg = progress(c);
                  const open = c.status === "OPEN";
                  return (
                    <tr key={c.id}>
                      <td className="code-cell">{c.docNo}</td>
                      <td>{thDate(c.date)}</td>
                      <td>{inv.whName(c.whId)}</td>
                      <td style={{ fontSize: 12.5 }}>
                        {c.by1}
                        {c.by2 ? " / " + c.by2 : ""}
                      </td>
                      <td className="num">
                        {pg.done} / {pg.total}
                      </td>
                      <td className="num">
                        <b style={{ color: pg.diff.length ? "var(--err)" : "var(--fg-faint)" }}>
                          {pg.diff.length || "—"}
                        </b>
                      </td>
                      <td>
                        {open ? (
                          <Badge kind={pg.done === pg.total ? "info" : "warn"}>
                            {pg.done === pg.total ? "นับครบแล้ว" : "กำลังนับ"}
                          </Badge>
                        ) : (
                          <Badge kind="ok">ปิดแล้ว{c.postedDoc ? " · " + c.postedDoc : ""}</Badge>
                        )}
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                          <PrintPair
                            onPrint={() => printSheet(c)}
                            toast={toast}
                            label="พิมพ์"
                          />
                          <ExportPair
                            onExport={(save) =>
                              save(SHEET_HEAD, sheetRows(c), "ใบตรวจนับ-" + c.docNo + ".csv")
                            }
                            disabled={!pg.total}
                            toast={toast}
                          />
                          {open ? (
                            <>
                              <button
                                className="btn btn-p btn-sm"
                                onClick={() => post(c)}
                                disabled={!!busy || !perm.edit}
                                title="บันทึกผลต่างเป็นเอกสารปรับปรุงแล้วปิดใบ"
                              >
                                ปิดใบ
                              </button>
                              <button
                                className="btn btn-d btn-icon"
                                onClick={() => drop(c)}
                                disabled={!!busy || !perm.edit}
                                title="ลบใบตรวจนับ"
                              >
                                <IcTrash size={14} />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </DocBrowser>
      </Card>
    </div>
  );
}
