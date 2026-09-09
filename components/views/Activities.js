"use client";

// บันทึกกิจกรรม — โทร / เข้าพบ / อีเมล / Line ที่คุยกับลูกค้าหรือผู้สนใจ
//
// หนึ่งแถวคือ "ติดต่อกันหนึ่งครั้ง" เก็บเป็นประวัติ ไม่เขียนทับของเดิม
// ด้วยเหตุผลเดียวกับบันทึกการเดินสถานะจัดส่ง (ship_events):
// สิ่งที่อยากรู้คือ "ทำอะไรไปแล้วบ้าง" ไม่ใช่แค่ "สถานะล่าสุดคืออะไร"
//
// นัดครั้งถัดไปเก็บอยู่ในแถวเดียวกับการติดต่อครั้งนี้ ไม่ได้แยกตารางนัดหมาย
//   เพราะนัดเกิดจากการคุยครั้งก่อนเสมอ แยกตารางแล้วต้องคอยผูกกันเอง
//   และจะมีนัดที่ลอยอยู่โดยไม่รู้ว่ามาจากการคุยครั้งไหน
//
// หน้าจอออกแบบให้ใช้บนมือถือได้ เพราะพนักงานขายบันทึกตอนเพิ่งออกจากร้านลูกค้า

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import {
  ACT_KINDS,
  actKindOf,
  activityProblems,
  dueList,
  filterActivities,
  partyNameOf,
} from "@/lib/crm";
import { monthsAgoISO, num, thDate, todayISO, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { Badge, Card, Empty, ExportPair, SearchSelect, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

const BLANK = {
  id: "",
  kind: "CALL",
  date: "",
  customerId: "",
  leadId: "",
  dealId: "",
  partyName: "",
  subject: "",
  result: "",
  nextDate: "",
  nextNote: "",
  salesId: "",
  note: "",
};

export default function Activities() {
  const inv = useInv();
  const perm = inv.perm("activities");
  const { db } = inv;
  const toast = useToast();
  const { user } = useAuth();

  const [form, setForm] = useState(() => ({ ...BLANK, date: todayISO() }));
  const [busy, setBusy] = useState("");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [salesId, setSalesId] = useState("");
  const [from, setFrom] = useState(() => monthsAgoISO(0));
  const [to, setTo] = useState(todayISO);

  const list = useMemo(
    () => filterActivities(db, { q, kind, salesId, from, to }),
    [db, q, kind, salesId, from, to]
  );
  const due = useMemo(() => dueList(db, todayISO()), [db]);

  const sellers = useMemo(
    () => (db.salespersons || []).filter((p) => p.active !== false),
    [db.salespersons]
  );
  const custOptions = useMemo(
    () => (db.customers || []).map((c) => ({ value: c.id, label: c.name, code: c.code })),
    [db.customers]
  );
  const leadOptions = useMemo(
    () =>
      (db.crmLeads || [])
        .filter((l) => l.status !== "DROPPED")
        .map((l) => ({ value: l.id, label: l.name, code: l.code })),
    [db.crmLeads]
  );
  const dealOptions = useMemo(
    () => (db.crmDeals || []).map((d) => ({ value: d.id, label: d.name, code: d.code })),
    [db.crmDeals]
  );

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const problems = activityProblems(form);
  const editing = !!form.id;

  function startNew() {
    setForm({ ...BLANK, date: todayISO() });
  }

  /**
   * เลือกดีลแล้วเติมคู่ค้าให้เอง
   * คนบันทึกมักคิดจากดีลก่อน ("ตามงานเรื่องนั้น") ไม่ได้คิดจากชื่อบริษัท
   * เติมให้จึงลดการกรอกผิดคู่ ซึ่งทำให้รายงานรายลูกค้าเพี้ยน
   */
  function pickDeal(id) {
    const d = (db.crmDeals || []).find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      dealId: id,
      customerId: d && d.customerId ? d.customerId : f.customerId,
      leadId: d && d.leadId ? d.leadId : f.leadId,
      salesId: f.salesId || (d ? d.salesId : ""),
    }));
  }

  async function save() {
    if (busy) return;
    if (problems.length) return toast("ยังกรอกไม่ครบ: " + problems.join(" · "), "err");

    const a = {
      ...form,
      id: form.id || uid(),
      subject: form.subject.trim(),
      result: (form.result || "").trim(),
      // ชื่อคู่ค้าคัดลอกไว้ในแถว เพื่อให้ประวัติยังอ่านออกแม้คู่ค้าถูกลบไปแล้ว
      partyName: partyNameOf(db, form),
      user: user && user.email ? user.email : "",
      ts: Date.now(),
    };

    setBusy("save");
    try {
      await inv.saveActivity(a);
      toast("บันทึกกิจกรรมแล้ว" + (a.nextDate ? " · นัดครั้งถัดไป " + thDate(a.nextDate) : ""), "ok");
      startNew();
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  async function drop(a) {
    if (busy) return;
    if (!window.confirm("ลบบันทึกกิจกรรมวันที่ " + thDate(a.date) + " (" + a.subject + ")?")) return;

    setBusy(a.id);
    try {
      await inv.removeActivity(a.id);
      if (form.id === a.id) startNew();
      toast("ลบบันทึกกิจกรรมแล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  const HEAD = ["วันที่", "ชนิด", "คู่ค้า", "เรื่องที่คุย", "ผลลัพธ์", "นัดครั้งถัดไป", "พนักงานขาย"];
  const rows = () =>
    list.map((a) => [
      a.date,
      actKindOf(a.kind).name,
      partyNameOf(db, a),
      a.subject,
      a.result,
      a.nextDate,
      sellerName(db, a.salesId),
    ]);

  if (!inv.crmReady) {
    return (
      <SetupNotice
        feature="งานลูกค้าสัมพันธ์"
        tables={["crm_leads", "crm_deals", "crm_activities"]}
      />
    );
  }

  return (
    <div className="stack">
      {due.length ? (
        <Card
          title="ต้องตามวันนี้"
          actions={<Badge kind="warn">{due.length} รายการ</Badge>}
        >
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 130 }}>นัดวันที่</th>
                <th style={{ minWidth: 180 }}>คู่ค้า</th>
                <th style={{ minWidth: 220 }}>เรื่องที่นัดไว้</th>
                <th style={{ minWidth: 140 }}>พนักงานขาย</th>
                <th style={{ width: 120 }}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {due.map((a) => (
                <tr key={a.id}>
                  <td>{thDate(a.nextDate)}</td>
                  <td>{partyNameOf(db, a)}</td>
                  <td>{a.nextNote || a.subject}</td>
                  <td>{sellerName(db, a.salesId) || "—"}</td>
                  <td>
                    {a.overdue ? (
                      <Badge kind="err">เลย {num(a.lateDays, 0)} วัน</Badge>
                    ) : (
                      <Badge kind="warn">ถึงกำหนดวันนี้</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <p className="muted" style={{ marginBottom: 0, fontSize: 12.5 }}>
            รายการนี้มาจากช่อง “นัดครั้งถัดไป” ของกิจกรรมที่บันทึกไว้ ·
            ตามแล้วให้บันทึกกิจกรรมครั้งใหม่ แล้วตั้งนัดถัดไปต่อได้เลย
          </p>
        </Card>
      ) : null}

      <Card
        title={editing ? "แก้ไขบันทึกกิจกรรม" : "บันทึกกิจกรรมใหม่"}
        actions={
          <>
            {editing ? (
              <button className="btn btn-g btn-sm" onClick={startNew}>
                บันทึกรายการใหม่
              </button>
            ) : null}
            <button
              className="btn btn-p btn-sm"
              onClick={save}
              disabled={!!busy || !perm.edit || !!problems.length}
              title={problems.length ? "ยังกรอกไม่ครบ: " + problems.join(", ") : ""}
            >
              {busy === "save" ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </>
        }
      >
        <div className="cs-tabs" style={{ marginBottom: 12 }}>
          {ACT_KINDS.map((k) => (
            <button
              key={k.id}
              className={"cs-tab" + (form.kind === k.id ? " on" : "")}
              onClick={() => set("kind", k.id)}
              disabled={!perm.edit}
            >
              {k.name}
            </button>
          ))}
        </div>

        <div className="form-grid">
          <div className="field">
            <label className="lbl" htmlFor="ac_date">วันที่ติดต่อ *</label>
            <input
              className="inp"
              id="ac_date"
              type="date"
              value={form.date}
              disabled={!perm.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ac_cust">ลูกค้า</label>
            <SearchSelect
              id="ac_cust"
              value={form.customerId}
              onChange={(v) => set("customerId", v)}
              options={custOptions}
              emptyLabel="— ไม่ระบุ —"
              notFound="ไม่พบลูกค้าที่ตรงกับ"
              disabled={!perm.edit}
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ac_lead">หรือผู้สนใจ</label>
            <SearchSelect
              id="ac_lead"
              value={form.leadId}
              onChange={(v) => set("leadId", v)}
              options={leadOptions}
              emptyLabel="— ไม่ระบุ —"
              notFound="ไม่พบผู้สนใจที่ตรงกับ"
              disabled={!perm.edit}
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ac_deal">โอกาสการขายที่เกี่ยวข้อง</label>
            <SearchSelect
              id="ac_deal"
              value={form.dealId}
              onChange={pickDeal}
              options={dealOptions}
              emptyLabel="— ไม่ระบุ —"
              notFound="ไม่พบโอกาสการขายที่ตรงกับ"
              disabled={!perm.edit}
            />
            <span className="hint">เลือกดีลแล้วระบบเติมคู่ค้าและพนักงานขายให้เอง</span>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="ac_sub">เรื่องที่คุย *</label>
            <input
              className="inp"
              id="ac_sub"
              value={form.subject}
              onChange={(e) => set("subject", e.target.value)}
              placeholder="เช่น สอบถามราคาสินค้ากลุ่มวัสดุ"
            />
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="ac_res">ผลลัพธ์</label>
            <input
              className="inp"
              id="ac_res"
              value={form.result}
              onChange={(e) => set("result", e.target.value)}
              placeholder="เช่น ขอใบเสนอราคา ส่งภายในสัปดาห์นี้"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ac_next">นัดครั้งถัดไป</label>
            <input
              className="inp"
              id="ac_next"
              type="date"
              value={form.nextDate}
              min={form.date || undefined}
              disabled={!perm.date}
              onChange={(e) => set("nextDate", e.target.value)}
            />
            <span className="hint">ใส่ไว้แล้วจะขึ้นในการ์ด “ต้องตามวันนี้” เมื่อถึงกำหนด</span>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="ac_nnote">เรื่องที่จะตามครั้งหน้า</label>
            <input
              className="inp"
              id="ac_nnote"
              value={form.nextNote}
              onChange={(e) => set("nextNote", e.target.value)}
              placeholder="เช่น โทรถามผลการพิจารณาใบเสนอราคา"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ac_sp">พนักงานขาย</label>
            <SearchSelect
              id="ac_sp"
              value={form.salesId}
              onChange={(v) => set("salesId", v)}
              options={sellers.map((p) => ({ value: p.id, label: p.name, code: p.code }))}
              emptyLabel="— ยังไม่ระบุ —"
              notFound="ไม่พบพนักงานขายที่ตรงกับ"
              disabled={!perm.edit}
            />
          </div>
        </div>
      </Card>

      <Card
        title="ประวัติการติดต่อ"
        actions={
          <>
            <Badge kind={list.length ? "info" : "gray"}>{list.length} ครั้ง</Badge>
            <ExportPair
              onExport={(save2) => save2(HEAD, rows(), "บันทึกกิจกรรม.csv")}
              disabled={!list.length}
              toast={toast}
            />
          </>
        }
      >
        <div className="doc-find" style={{ marginBottom: 12 }}>
          <input
            className="inp"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นจากชื่อคู่ค้า เรื่องที่คุย หรือผลลัพธ์"
            aria-label="ค้นหากิจกรรม"
          />
          <div className="doc-find-date">
            <input
              className="inp"
              type="date"
              value={from}
              max={to || undefined}
              disabled={!perm.date}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="ตั้งแต่วันที่"
            />
            <span className="muted">ถึง</span>
            <input
              className="inp"
              type="date"
              value={to}
              min={from || undefined}
              disabled={!perm.date}
              onChange={(e) => setTo(e.target.value)}
              aria-label="ถึงวันที่"
            />
          </div>
          <select
            className="sel"
            style={{ width: 160 }}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            aria-label="กรองตามชนิดการติดต่อ"
          >
            <option value="">ทุกชนิด</option>
            {ACT_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
          <SearchSelect
            id="ac_spf"
            value={salesId}
            onChange={setSalesId}
            options={sellers.map((p) => ({ value: p.id, label: p.name, code: p.code }))}
            emptyLabel="ทุกพนักงานขาย"
            notFound="ไม่พบพนักงานขายที่ตรงกับ"
          />
        </div>

        {list.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 120 }}>วันที่</th>
                <th style={{ width: 130 }}>ชนิด</th>
                <th style={{ minWidth: 170 }}>คู่ค้า</th>
                <th style={{ minWidth: 200 }}>เรื่องที่คุย</th>
                <th style={{ minWidth: 200 }}>ผลลัพธ์</th>
                <th style={{ width: 130 }}>นัดครั้งถัดไป</th>
                <th style={{ minWidth: 140 }}>พนักงานขาย</th>
                <th style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td>{thDate(a.date)}</td>
                  <td>
                    <Badge>{actKindOf(a.kind).name}</Badge>
                  </td>
                  <td>{partyNameOf(db, a)}</td>
                  <td>{a.subject}</td>
                  <td className="muted">{a.result || "—"}</td>
                  <td>{a.nextDate ? thDate(a.nextDate) : "—"}</td>
                  <td>{sellerName(db, a.salesId) || "—"}</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <button
                        className="btn btn-o btn-sm"
                        onClick={() => setForm({ ...a })}
                        disabled={!perm.edit}
                      >
                        แก้ไข
                      </button>
                      <button
                        className="btn btn-d btn-sm"
                        onClick={() => drop(a)}
                        disabled={!!busy || !perm.edit}
                      >
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>ยังไม่มีบันทึกกิจกรรมในช่วงที่เลือก</Empty>
        )}
      </Card>
    </div>
  );
}

/** ชื่อพนักงานขายจากรหัสอ้างอิง — คนที่ถูกลบไปแล้วคืนค่าว่าง ไม่พัง */
function sellerName(db, id) {
  const p = (db.salespersons || []).find((x) => x.id === id);
  return p ? p.code + " " + p.name : "";
}
