"use client";

// กล่องข้อความจากไลน์ — ข้อความดิบที่รับเข้ามา และจุดเริ่มของคำสั่งซื้อ
//
// ข้อความเข้ามาได้สามทาง (ดู LINE_SOURCES ใน lib/lineOrders.js):
//   รับอัตโนมัติ  ระบบรับจากไลน์เองตอนลูกค้าพิมพ์ (ตั้งค่าที่หน้าตั้งค่าการเชื่อมต่อไลน์)
//   นำเข้าไฟล์    เอาไฟล์แชทที่ส่งออกจากแอปมาโหลด — ใช้ได้ทันทีโดยไม่ต้องตั้งค่าอะไร
//   พิมพ์เข้าเอง   วางข้อความที่คัดลอกมาจากไลน์
//
// ข้อความในหน้านี้แก้ไม่ได้โดยตั้งใจ เป็นหลักฐานว่าลูกค้าพิมพ์มาว่าอะไร
// เวลามีข้อโต้แย้งเรื่องจำนวนหรือราคา ต้องย้อนกลับมาดูของจริงได้เสมอ
// การแก้ไขทั้งหมดไปทำที่หน้าคำสั่งซื้อ ซึ่งเป็น "สิ่งที่เราตีความ" คนละชั้นกับ "สิ่งที่เขาพิมพ์"

import { useMemo, useRef, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { nextLineCode, parseChatExport, sourceOf } from "@/lib/lineOrders";
import { mergeItems, parseOrderText } from "@/lib/lineParse";
import { num, thDate, thDateTime, todayISO, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { IcDownload, IcPlus, IcTrash } from "../Icons";
import Modal from "../Modal";
import { Badge, Card, Empty, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";
import { LINE_TABLES } from "./lineShared";

/**
 * รหัสข้อความที่คิดจากเนื้อหา ไม่ใช่สุ่มใหม่ทุกครั้ง
 *
 * ทำให้โหลดไฟล์แชทไฟล์เดิมซ้ำแล้วไม่ได้ข้อความซ้ำ ซึ่งเกิดบ่อยมาก
 * เพราะคนไม่แน่ใจว่าโหลดไปแล้วหรือยัง แล้วก็โหลดอีกรอบ
 * ถ้าไม่กันไว้ ข้อความเดียวจะกลายเป็นคำสั่งซื้อหลายใบ
 */
function msgKey(m) {
  const raw = [m.date, m.time || "", m.sender || "", m.text || ""].join("|");
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h * 33) ^ raw.charCodeAt(i)) >>> 0;
  return "LM" + h.toString(36) + raw.length.toString(36);
}

export default function LineInbox({ onNavigate }) {
  const inv = useInv();

  // สิทธิของหน้าจอนี้ — ไม่ติ๊ก "แก้ไข" แล้วนำเข้าและสร้างคำสั่งซื้อไม่ได้ ดูได้อย่างเดียว
  const perm = inv.perm("lineinbox");
  const { db } = inv;
  const { user } = useAuth();
  const toast = useToast();
  const fileRef = useRef(null);

  const [q, setQ] = useState("");
  const [only, setOnly] = useState("open");
  const [picked, setPicked] = useState([]);
  const [paste, setPaste] = useState(null);
  const [busy, setBusy] = useState(false);

  const msgs = db.lineMessages || [];

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return msgs
      .filter((m) => {
        if (only === "open" && m.orderId) return false;
        if (only === "done" && !m.orderId) return false;
        if (!s) return true;
        return (m.text + " " + m.senderName + " " + m.sourceId).toLowerCase().includes(s);
      })
      .slice()
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 300);
  }, [msgs, q, only]);

  const openCount = msgs.filter((m) => !m.orderId).length;
  const toggle = (id) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  /* ------------------------------------------------- นำเข้าไฟล์แชท */

  async function importFile(file) {
    if (!file || busy) return;
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = parseChatExport(text);
      if (!parsed.length) {
        return toast(
          "อ่านไฟล์นี้ไม่ออก — ต้องเป็นไฟล์แชทที่ส่งออกจากแอปไลน์ (.txt) ไม่ใช่ภาพหน้าจอ",
          "err"
        );
      }

      const list = parsed.map((m) => ({
        id: msgKey(m),
        msgId: "",
        source: "IMPORT",
        sourceKind: "user",
        sourceId: file.name,
        senderId: "",
        senderName: m.sender,
        kind: "TEXT",
        text: m.text,
        fileUrl: "",
        date: m.date,
        orderId: "",
        note: "",
        user: (user && user.email) || "",
        ts: new Date(m.date + "T" + (m.time || "00:00") + ":00").getTime() || Date.now(),
      }));

      const already = new Set(msgs.map((m) => m.id));
      const fresh = list.filter((m) => !already.has(m.id));

      await inv.saveLineMessages(list);
      toast(
        "โหลด " + num(list.length, 0) + " ข้อความ (ใหม่ " + num(fresh.length, 0) + " ข้อความ)",
        "ok"
      );
    } catch (e) {
      toast("นำเข้าไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /* --------------------------------------------------- วางข้อความเอง */

  async function savePaste() {
    if (busy) return;
    const text = String(paste.text || "").trim();
    if (!text) return toast("ยังไม่ได้วางข้อความ", "err");

    setBusy(true);
    try {
      const m = {
        id: uid(),
        msgId: "",
        source: "MANUAL",
        sourceKind: "user",
        sourceId: "",
        senderId: "",
        senderName: String(paste.sender || "").trim(),
        kind: "TEXT",
        text,
        fileUrl: "",
        date: paste.date || todayISO(),
        orderId: "",
        note: "",
        user: (user && user.email) || "",
        ts: Date.now(),
      };
      await inv.saveLineMessages([m]);
      toast("บันทึกข้อความแล้ว", "ok");
      setPaste(null);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------- สร้างคำสั่งซื้อจากข้อความ */

  /**
   * รวมข้อความที่เลือกไว้เป็นคำสั่งซื้อหนึ่งใบ แล้วอ่านเป็นรายการสินค้าให้เลย
   *
   * รวมหลายข้อความได้เพราะลูกค้าไม่ได้พิมพ์รวดเดียวจบ เขาทักมาทีละอย่าง
   * แล้วเติมทีหลัง การบังคับให้หนึ่งข้อความเป็นหนึ่งใบจะได้ใบเสนอราคาหลายใบ
   * ที่ต้องเอามารวมกันเองอยู่ดี
   */
  async function makeOrder() {
    if (!picked.length || busy) return;

    const chosen = msgs.filter((m) => picked.includes(m.id)).sort((a, b) => a.ts - b.ts);
    const raw = chosen.map((m) => m.text).join("\n");
    const parsed = parseOrderText(raw, db.products, db.lineAliases);
    const items = mergeItems(parsed.items);

    const orderId = uid();
    const order = {
      id: orderId,
      code: nextLineCode(db.lineOrders || [], "LN"),
      date: chosen[0].date || todayISO(),
      source: chosen[0].source || "MANUAL",
      sourceId: chosen[0].sourceId || "",
      partyName: chosen[0].senderName || "",
      customerId: "",
      status: items.length ? "REVIEW" : "NEW",
      rawText: raw,
      note: parsed.note,
      owner: (user && user.email) || "",
      quoteId: "",
      invoiceId: "",
      user: (user && user.email) || "",
      ts: Date.now(),
    };

    // บรรทัดที่อ่านไม่ออกก็เก็บไว้ด้วย ให้คนไปเลือกสินค้าเองที่หน้าคำสั่งซื้อ
    // ทิ้งไปเงียบ ๆ แล้วของหายจากใบเสนอราคา โดยไม่มีใครรู้ว่าเคยมี
    const lines = [
      ...items.map((it, i) => ({
        id: uid(),
        orderId,
        seq: i + 1,
        raw: it.raw,
        productId: it.productId,
        qty: it.qty,
        unit: it.unit,
        price: it.price,
        matchedBy: it.how,
        score: it.score,
        note: it.qtyWeak ? "ระบบเดาจำนวนมา ควรตรวจก่อนออกเอกสาร" : "",
      })),
      ...parsed.unmatched.map((u, i) => ({
        id: uid(),
        orderId,
        seq: items.length + i + 1,
        raw: u.raw,
        productId: "",
        qty: u.qty,
        unit: "",
        price: null,
        matchedBy: "",
        score: 0,
        note: "ยังไม่รู้ว่าเป็นสินค้าตัวไหน",
      })),
    ];

    setBusy(true);
    try {
      await inv.saveLineOrder(order, lines);
      await inv.linkLineMessages(picked, orderId);
      setPicked([]);
      toast(
        "สร้างคำสั่งซื้อ " + order.code + " จาก " + picked.length + " ข้อความ · อ่านได้ " +
          lines.filter((l) => l.productId).length + " จาก " + lines.length + " รายการ",
        "ok"
      );
      if (onNavigate) onNavigate("lineorder");
    } catch (e) {
      toast("สร้างคำสั่งซื้อไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function removeMsg(m) {
    if (busy) return;
    if (m.orderId) {
      return toast("ข้อความนี้ผูกกับคำสั่งซื้ออยู่ ให้ลบคำสั่งซื้อก่อน", "err");
    }
    if (!window.confirm("ยืนยันการลบข้อความนี้?")) return;
    setBusy(true);
    try {
      await inv.removeLineMessage(m.id);
      toast("ลบข้อความแล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (!inv.lineReady) {
    return <SetupNotice feature="กล่องข้อความจากไลน์" tables={LINE_TABLES} />;
  }

  return (
    <div className="stack">
      <Card
        title="กล่องข้อความจากไลน์"
        actions={
          <>
            <Badge kind={openCount ? "warn" : "ok"}>
              {openCount ? "ยังไม่ได้จัดการ " + num(openCount, 0) + " ข้อความ" : "จัดการครบแล้ว"}
            </Badge>
            <button
              className="btn btn-g btn-sm"
              disabled={!perm.edit || busy}
              onClick={() => fileRef.current && fileRef.current.click()}
            >
              <IcDownload size={15} />
              นำเข้าไฟล์แชท
            </button>
            <button
              className="btn btn-g btn-sm"
              disabled={!perm.edit || busy}
              onClick={() => setPaste({ date: todayISO(), sender: "", text: "" })}
            >
              <IcPlus size={15} />
              วางข้อความ
            </button>
            <button
              className="btn btn-p btn-sm"
              disabled={!perm.edit || busy || !picked.length}
              onClick={makeOrder}
            >
              สร้างคำสั่งซื้อ ({picked.length})
            </button>
          </>
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept=".txt,text/plain"
          hidden
          onChange={(e) => importFile(e.target.files[0])}
        />

        <div className="row" style={{ marginBottom: 12 }}>
          <input
            className="inp"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาข้อความ ชื่อผู้ส่ง หรือที่มา…"
            aria-label="ค้นหาข้อความ"
            style={{ maxWidth: 320 }}
          />
          <select
            className="sel"
            style={{ maxWidth: 220 }}
            value={only}
            onChange={(e) => setOnly(e.target.value)}
            aria-label="กรองสถานะข้อความ"
          >
            <option value="open">ยังไม่ได้จัดการ</option>
            <option value="done">แปลงเป็นคำสั่งซื้อแล้ว</option>
            <option value="">ทั้งหมด</option>
          </select>
          {picked.length ? (
            <button className="btn btn-g btn-sm" onClick={() => setPicked([])}>
              ล้างที่เลือก
            </button>
          ) : null}
        </div>

        <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
          ติ๊กข้อความที่เป็นการสั่งของ (เลือกหลายข้อความรวมเป็นใบเดียวได้)
          แล้วกด <b>สร้างคำสั่งซื้อ</b> ระบบจะอ่านเป็นรายการสินค้าให้ แล้วพาไปหน้าตรวจ
        </p>

        {rows.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 40 }} />
                <th style={{ width: 150 }}>เวลา</th>
                <th style={{ width: 140 }}>ผู้ส่ง</th>
                <th style={{ minWidth: 300 }}>ข้อความ</th>
                <th style={{ width: 130 }}>ที่มา</th>
                <th style={{ width: 150 }}>สถานะ</th>
                <th style={{ width: 50 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const src = sourceOf(m.source);
                const order = (db.lineOrders || []).find((o) => o.id === m.orderId);
                return (
                  <tr key={m.id} className={picked.includes(m.id) ? "sel" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        checked={picked.includes(m.id)}
                        disabled={!perm.edit || !!m.orderId}
                        onChange={() => toggle(m.id)}
                        aria-label={"เลือกข้อความของ " + (m.senderName || "ไม่ระบุ")}
                      />
                    </td>
                    <td style={{ fontSize: 12.5 }}>{thDateTime(m.ts)}</td>
                    <td>{m.senderName || "—"}</td>
                    <td style={{ whiteSpace: "pre-wrap", fontSize: 13.5 }}>{m.text}</td>
                    <td>
                      <span className={"bdg " + src.badge}>{src.name}</span>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {order ? (
                        <Badge kind="ok">{order.code}</Badge>
                      ) : (
                        <span style={{ color: "var(--fg-faint)" }}>ยังไม่ได้จัดการ</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-d btn-icon"
                        onClick={() => removeMsg(m)}
                        disabled={busy || !perm.edit || !!m.orderId}
                        title={m.orderId ? "ผูกกับคำสั่งซื้ออยู่ ลบไม่ได้" : "ลบข้อความ"}
                      >
                        <IcTrash size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>
            {msgs.length
              ? "ไม่พบข้อความที่ตรงกับเงื่อนไข"
              : "ยังไม่มีข้อความ — กด “นำเข้าไฟล์แชท” หรือ “วางข้อความ” เพื่อเริ่มต้น"}
          </Empty>
        )}
      </Card>

      {paste ? (
        <Modal
          title="วางข้อความจากไลน์"
          onClose={() => setPaste(null)}
          maxWidth={640}
          footer={
            <>
              <button className="btn btn-g" onClick={() => setPaste(null)} disabled={busy}>
                ยกเลิก
              </button>
              <button className="btn btn-p" onClick={savePaste} disabled={busy || !perm.edit}>
                บันทึกข้อความ
              </button>
            </>
          }
        >
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
            <div className="field">
              <label className="lbl" htmlFor="lp_date">วันที่ลูกค้าทักมา</label>
              <input
                className="inp"
                type="date"
                id="lp_date"
                value={paste.date}
                disabled={!perm.date}
                onChange={(e) => setPaste({ ...paste, date: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="lp_from">ชื่อผู้ส่ง</label>
              <input
                className="inp"
                id="lp_from"
                value={paste.sender}
                onChange={(e) => setPaste({ ...paste, sender: e.target.value })}
                placeholder="ชื่อที่แสดงในไลน์"
              />
            </div>
            <div className="field span2">
              <label className="lbl" htmlFor="lp_text">ข้อความ</label>
              <textarea
                className="txa"
                id="lp_text"
                rows={7}
                value={paste.text}
                onChange={(e) => setPaste({ ...paste, text: e.target.value })}
                placeholder={"เช่น\nเอาหมอนยางพารา 10 ใบ\nยางก้อนถ้วย 500 กก.\nส่งที่เดิมนะครับ"}
              />
              <span className="hint">
                คัดลอกจากแชทมาวางได้ทั้งก้อน ระบบจะอ่านเป็นรายการสินค้าให้ตอนสร้างคำสั่งซื้อ
              </span>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
