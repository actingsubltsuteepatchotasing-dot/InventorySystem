"use client";

// โอกาสการขาย (Pipeline) — ดีลที่กำลังไล่ปิด อยู่ขั้นไหน มูลค่าเท่าไร
//
// แสดงเป็นแถบสรุปรายขั้น + ตารางรายการ ไม่ทำเป็นบอร์ดลากวาง
//   ลากวางใช้บนมือถือแทบไม่ได้ (พนักงานขายอยู่นอกออฟฟิศเป็นหลัก)
//   และการเปลี่ยนขั้นควรถามเหตุผลตอนแพ้ ซึ่งการลากทำไม่ได้
//   กดปุ่มเปลี่ยนขั้นจึงทั้งเร็วกว่าและบังคับข้อมูลที่ต้องมีได้
//
// ปิดว่าชนะแล้วไม่สร้างใบขายให้เอง — ใบขายตัดสต็อกจริง ต้องให้คนตรวจก่อนเสมอ
// หน้าจอแค่พาไปหน้าขายสินค้าและบริการให้ (ดูปุ่ม "ไปออกใบขาย")

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import {
  LOST_REASONS,
  SOURCES,
  STAGES,
  crmSummary,
  dealProblems,
  filterDeals,
  isOpen,
  partyNameOf,
  pipelineOf,
  stageOf,
} from "@/lib/crm";
import { num, thDate, todayISO, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { IcChart } from "../Icons";
import { Badge, Card, Empty, ExportPair, Kpi, SearchSelect, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

const BLANK = {
  id: "",
  code: "",
  name: "",
  customerId: "",
  leadId: "",
  partyName: "",
  amount: 0,
  stage: "NEW",
  probability: 10,
  openDate: "",
  expectDate: "",
  closeDate: "",
  salesId: "",
  source: "",
  lostReason: "",
  note: "",
};

/** รหัสถัดไปแบบ D0001 — นับจากรหัสที่มีอยู่จริง ไม่เก็บตัวนับไว้ที่ไหน */
export function nextDealCode(deals) {
  const nums = (deals || [])
    .map((d) => /^D(\d+)$/i.exec(String(d.code || "")))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return "D" + String(next).padStart(4, "0");
}

export default function Deals({ onNavigate }) {
  const inv = useInv();
  const perm = inv.perm("deals");
  const { db } = inv;
  const toast = useToast();
  const { user } = useAuth();

  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState("");
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const [salesId, setSalesId] = useState("");

  const filter = { q, stage, openOnly, salesId };
  const all = db.crmDeals || [];
  const list = useMemo(() => filterDeals(db, filter), [db, q, stage, openOnly, salesId]); // eslint-disable-line react-hooks/exhaustive-deps
  const pipe = useMemo(() => pipelineOf(db, { salesId }), [db, salesId]);
  const sum = useMemo(() => crmSummary(db, { salesId }), [db, salesId]);

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

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const problems = dealProblems(form, all);
  const editing = !!form.id;

  function startNew() {
    setForm({ ...BLANK, code: nextDealCode(all), openDate: todayISO() });
  }

  /** เปลี่ยนขั้นแล้วเลื่อนโอกาสปิดได้ให้ตามค่าตั้งต้นของขั้นนั้น แก้ทับเองได้ */
  function pickStage(id) {
    setForm((f) => ({
      ...f,
      stage: id,
      probability: stageOf(id).prob,
      closeDate: id === "WON" || id === "LOST" ? f.closeDate || todayISO() : "",
      lostReason: id === "LOST" ? f.lostReason : "",
    }));
  }

  async function save() {
    if (busy) return;
    if (problems.length) return toast("ยังกรอกไม่ครบ: " + problems.join(" · "), "err");

    const d = {
      ...form,
      id: form.id || uid(),
      code: form.code.trim(),
      name: form.name.trim(),
      amount: Number(form.amount) || 0,
      probability: Number(form.probability) || 0,
      // เก็บชื่อคู่ค้าไว้ในตัวดีลด้วย (snapshot) เหตุผลเดียวกับเอกสารการค้า
      // ลูกค้าหรือผู้สนใจถูกลบไปแล้ว ดีลเก่าต้องยังบอกได้ว่าคุยกับใคร
      partyName: partyNameOf(db, form),
      user: user && user.email ? user.email : "",
      ts: Date.now(),
    };

    setBusy("save");
    try {
      await inv.saveDeal(d);
      toast("บันทึกโอกาสการขาย " + d.code + " แล้ว", "ok");
      setForm(BLANK);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  /** เปลี่ยนขั้นจากในตารางโดยไม่ต้องเปิดฟอร์ม — ปิดดีลต้องกรอกเพิ่ม จึงส่งไปที่ฟอร์ม */
  async function moveStage(d, id) {
    if (busy) return;
    if (id === "LOST" || id === "WON") {
      setForm({ ...d, stage: id, probability: stageOf(id).prob, closeDate: todayISO() });
      toast("กรอกวันที่ปิด" + (id === "LOST" ? "และเหตุผลที่เสียโอกาส" : "") + " แล้วกดบันทึก", "ok");
      return;
    }

    setBusy(d.id);
    try {
      await inv.saveDeal({
        ...d,
        stage: id,
        probability: stageOf(id).prob,
        user: user && user.email ? user.email : "",
        ts: Date.now(),
      });
      toast("ย้าย " + d.code + " ไปขั้น " + stageOf(id).name + " แล้ว", "ok");
    } catch (e) {
      toast("เปลี่ยนขั้นไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  async function drop(d) {
    if (busy) return;
    const acts = (db.crmActivities || []).filter((a) => a.dealId === d.id).length;
    const ok = window.confirm(
      "ลบโอกาสการขาย " + d.code + " " + d.name + "?\n\n" +
        (acts ? "มีบันทึกกิจกรรมอ้างอยู่ " + acts + " รายการ (จะไม่ถูกลบตาม)\n" : "") +
        "\nถ้าดีลนี้จบไปแล้ว แนะนำให้ปิดเป็น “เสียโอกาส” พร้อมเหตุผลแทนการลบ\n" +
        "เพราะรายงานแพ้-ชนะใช้ข้อมูลนี้ทั้งหมด"
    );
    if (!ok) return;

    setBusy(d.id);
    try {
      await inv.removeDeal(d.id);
      if (form.id === d.id) setForm(BLANK);
      toast("ลบโอกาสการขาย " + d.code + " แล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  const HEAD = [
    "รหัส", "ชื่อโอกาส", "คู่ค้า", "มูลค่า", "ขั้นตอน", "โอกาสปิดได้ (%)",
    "วันที่เปิด", "คาดปิด", "วันที่ปิดจริง", "พนักงานขาย", "เหตุผลที่เสีย",
  ];
  const rows = () =>
    list.map((d) => [
      d.code,
      d.name,
      partyNameOf(db, d),
      d.amount,
      stageOf(d.stage).name,
      d.probability,
      d.openDate,
      d.expectDate,
      d.closeDate,
      sellerName(db, d.salesId),
      d.lostReason,
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
      <Card
        title="ภาพรวมกรวยการขาย"
        actions={
          <SearchSelect
            id="dl_spf"
            value={salesId}
            onChange={setSalesId}
            options={sellers.map((p) => ({ value: p.id, label: p.name, code: p.code }))}
            emptyLabel="ทุกพนักงานขาย"
            notFound="ไม่พบพนักงานขายที่ตรงกับ"
          />
        }
      >
        <div className="grid g4" style={{ marginBottom: 14 }}>
          <Kpi
            icon={<IcChart size={18} stroke={1.9} />}
            label="ดีลที่ยังไล่ปิดอยู่"
            value={num(sum.open, 0)}
            sub={"มูลค่ารวม ฿" + num(sum.openAmount, 0)}
          />
          <Kpi
            icon={<IcChart size={18} stroke={1.9} />}
            label="มูลค่าถ่วงน้ำหนัก"
            value={"฿" + num(sum.weighted, 0)}
            sub="มูลค่า x โอกาสปิดได้ของแต่ละดีล"
          />
          <Kpi
            icon={<IcChart size={18} stroke={1.9} />}
            label="อัตราชนะ"
            value={sum.winRate === null ? "—" : num(sum.winRate, 1) + "%"}
            sub={"ชนะ " + num(sum.won, 0) + " · เสีย " + num(sum.lost, 0)}
            kind={sum.winRate !== null && sum.winRate < 30 ? "warn" : ""}
          />
          <Kpi
            icon={<IcChart size={18} stroke={1.9} />}
            label="เวลาเฉลี่ยที่ใช้ปิด"
            value={sum.avgDays === null ? "—" : num(sum.avgDays, 0) + " วัน"}
            sub="นับเฉพาะดีลที่ปิดแล้ว"
          />
        </div>

        <TableWrap>
          <thead>
            <tr>
              <th style={{ minWidth: 150 }}>ขั้นตอน</th>
              <th className="num" style={{ width: 100 }}>จำนวนดีล</th>
              <th className="num" style={{ width: 150 }}>มูลค่ารวม</th>
              <th className="num" style={{ width: 150 }}>ถ่วงน้ำหนัก</th>
              <th style={{ minWidth: 160 }}>สัดส่วน</th>
            </tr>
          </thead>
          <tbody>
            {pipe.map((s) => {
              const top = Math.max(...pipe.map((x) => x.amount), 1);
              return (
                <tr key={s.id}>
                  <td>
                    <Badge kind={s.kind}>{s.name}</Badge>
                  </td>
                  <td className="num">{num(s.count, 0)}</td>
                  <td className="num">{num(s.amount, 0)}</td>
                  <td className="num">{num(s.weighted, 0)}</td>
                  <td>
                    {/* แถบสัดส่วนแบบง่าย ไม่ต้องพึ่งกราฟ เพราะอ่านคู่กับตัวเลขในแถวเดียวกัน */}
                    <div className="bar-mini">
                      <span style={{ width: Math.round((s.amount / top) * 100) + "%" }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </Card>

      <Card
        title={editing ? "แก้ไขโอกาสการขาย " + form.code : "เปิดโอกาสการขายใหม่"}
        actions={
          <>
            <button className="btn btn-g btn-sm" onClick={startNew} disabled={!perm.edit}>
              รายการใหม่
            </button>
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
          {STAGES.map((s) => (
            <button
              key={s.id}
              className={"cs-tab" + (form.stage === s.id ? " on" : "")}
              onClick={() => pickStage(s.id)}
              disabled={!perm.edit}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="form-grid">
          <div className="field">
            <label className="lbl" htmlFor="dl_code">รหัส *</label>
            <input
              className="inp"
              id="dl_code"
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="เช่น D0001"
            />
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="dl_name">ชื่อโอกาสการขาย *</label>
            <input
              className="inp"
              id="dl_name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="เช่น สั่งซื้อประจำไตรมาส 4"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="dl_cust">ลูกค้าในทะเบียน</label>
            <SearchSelect
              id="dl_cust"
              value={form.customerId}
              onChange={(v) => setForm((f) => ({ ...f, customerId: v, leadId: v ? "" : f.leadId }))}
              options={custOptions}
              emptyLabel="— ไม่ระบุ —"
              notFound="ไม่พบลูกค้าที่ตรงกับ"
              disabled={!perm.edit}
            />
            <span className="hint">เลือกอย่างใดอย่างหนึ่งระหว่างลูกค้ากับผู้สนใจ</span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="dl_lead">หรือผู้สนใจ</label>
            <SearchSelect
              id="dl_lead"
              value={form.leadId}
              onChange={(v) =>
                setForm((f) => ({ ...f, leadId: v, customerId: v ? "" : f.customerId }))
              }
              options={leadOptions}
              emptyLabel="— ไม่ระบุ —"
              notFound="ไม่พบผู้สนใจที่ตรงกับ"
              disabled={!perm.edit}
            />
            <span className="hint">ยังไม่เป็นลูกค้าก็เปิดโอกาสการขายได้</span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="dl_amt">มูลค่าที่คาด (บาท)</label>
            <input
              className="inp num"
              id="dl_amt"
              type="number"
              min={0}
              step="0.01"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
            <span className="hint">ยอดขายจริงมาจากใบขาย ช่องนี้ใช้ประมาณการเท่านั้น</span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="dl_prob">โอกาสปิดได้ (%)</label>
            <input
              className="inp num"
              id="dl_prob"
              type="number"
              min={0}
              max={100}
              value={form.probability}
              onChange={(e) => set("probability", e.target.value)}
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="dl_open">วันที่เปิดโอกาส *</label>
            <input
              className="inp"
              id="dl_open"
              type="date"
              value={form.openDate}
              disabled={!perm.date}
              onChange={(e) => set("openDate", e.target.value)}
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="dl_exp">คาดว่าจะปิดวันที่</label>
            <input
              className="inp"
              id="dl_exp"
              type="date"
              value={form.expectDate}
              disabled={!perm.date}
              onChange={(e) => set("expectDate", e.target.value)}
            />
          </div>

          {form.stage === "WON" || form.stage === "LOST" ? (
            <div className="field">
              <label className="lbl" htmlFor="dl_close">วันที่ปิดจริง *</label>
              <input
                className="inp"
                id="dl_close"
                type="date"
                value={form.closeDate}
                disabled={!perm.date}
                onChange={(e) => set("closeDate", e.target.value)}
              />
            </div>
          ) : null}

          {form.stage === "LOST" ? (
            <div className="field span2">
              <label className="lbl" htmlFor="dl_lost">เหตุผลที่เสียโอกาส *</label>
              <input
                className="inp"
                id="dl_lost"
                list="dlLostList"
                value={form.lostReason}
                onChange={(e) => set("lostReason", e.target.value)}
                placeholder="เลือกหรือพิมพ์เอง"
              />
              <datalist id="dlLostList">
                {LOST_REASONS.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
              <span className="hint">รายงานแพ้-ชนะใช้ช่องนี้ทั้งหมด จึงบังคับให้กรอก</span>
            </div>
          ) : null}

          <div className="field">
            <label className="lbl" htmlFor="dl_sp">พนักงานขาย</label>
            <SearchSelect
              id="dl_sp"
              value={form.salesId}
              onChange={(v) => set("salesId", v)}
              options={sellers.map((p) => ({ value: p.id, label: p.name, code: p.code }))}
              emptyLabel="— ยังไม่ระบุ —"
              notFound="ไม่พบพนักงานขายที่ตรงกับ"
              disabled={!perm.edit}
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="dl_src">แหล่งที่มา</label>
            <input
              className="inp"
              id="dl_src"
              list="dlSrcList"
              value={form.source}
              onChange={(e) => set("source", e.target.value)}
            />
            <datalist id="dlSrcList">
              {SOURCES.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="dl_note">หมายเหตุ</label>
            <input
              className="inp"
              id="dl_note"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card
        title="รายการโอกาสการขาย"
        actions={
          <>
            <Badge kind={list.length ? "info" : "gray"}>
              {list.length} / {all.length} รายการ
            </Badge>
            <ExportPair
              onExport={(save2) => save2(HEAD, rows(), "โอกาสการขาย.csv")}
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
            placeholder="ค้นจากรหัส ชื่อโอกาส ชื่อคู่ค้า หรือแหล่งที่มา"
            aria-label="ค้นหาโอกาสการขาย"
          />
          <select
            className="sel"
            style={{ width: 180 }}
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            aria-label="กรองตามขั้นตอน"
          >
            <option value="">ทุกขั้นตอน</option>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="chk-line" htmlFor="dl_open_only">
            <input
              id="dl_open_only"
              className="chk"
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
            />
            <span>เฉพาะที่ยังไม่ปิด</span>
          </label>
        </div>

        {list.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 90 }}>รหัส</th>
                <th style={{ minWidth: 180 }}>ชื่อโอกาส</th>
                <th style={{ minWidth: 170 }}>คู่ค้า</th>
                <th className="num" style={{ width: 130 }}>มูลค่า</th>
                <th style={{ width: 150 }}>ขั้นตอน</th>
                <th className="num" style={{ width: 80 }}>%</th>
                <th style={{ width: 120 }}>คาดปิด</th>
                <th style={{ minWidth: 140 }}>พนักงานขาย</th>
                <th style={{ width: 260 }} />
              </tr>
            </thead>
            <tbody>
              {list.map((d) => {
                const s = stageOf(d.stage);
                const next = nextStageOf(d.stage);
                return (
                  <tr key={d.id}>
                    <td className="code-cell">{d.code}</td>
                    <td>{d.name}</td>
                    <td>{partyNameOf(db, d)}</td>
                    <td className="num">
                      <b>{num(d.amount, 0)}</b>
                    </td>
                    <td>
                      <Badge kind={s.kind}>{s.name}</Badge>
                    </td>
                    <td className="num">{num(d.probability, 0)}</td>
                    <td>{d.expectDate ? thDate(d.expectDate) : "—"}</td>
                    <td>{sellerName(db, d.salesId) || "—"}</td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        {next ? (
                          <button
                            className="btn btn-o btn-sm"
                            onClick={() => moveStage(d, next.id)}
                            disabled={!!busy || !perm.edit}
                            title={"ย้ายไปขั้น " + next.name}
                          >
                            → {next.name}
                          </button>
                        ) : null}
                        {isOpen(d) ? (
                          <button
                            className="btn btn-g btn-sm"
                            onClick={() => moveStage(d, "LOST")}
                            disabled={!!busy || !perm.edit}
                          >
                            เสียโอกาส
                          </button>
                        ) : null}
                        {d.stage === "WON" && d.customerId ? (
                          <button
                            className="btn btn-o btn-sm"
                            onClick={() => onNavigate && onNavigate("invoice")}
                            title="ไปออกใบขายสินค้าและบริการ (ระบบไม่ออกให้เอง เพราะใบขายตัดสต็อกจริง)"
                          >
                            ไปออกใบขาย
                          </button>
                        ) : null}
                        <button
                          className="btn btn-o btn-sm"
                          onClick={() => setForm({ ...d })}
                          disabled={!perm.edit}
                        >
                          แก้ไข
                        </button>
                        <button
                          className="btn btn-d btn-sm"
                          onClick={() => drop(d)}
                          disabled={!!busy || !perm.edit}
                        >
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>
            {all.length
              ? "ไม่พบรายการที่ตรงกับที่ค้น"
              : "ยังไม่มีโอกาสการขาย — กด “รายการใหม่” แล้วกรอกด้านบนได้เลย"}
          </Empty>
        )}
      </Card>
    </div>
  );
}

/** ขั้นถัดไปของขั้นปัจจุบัน — ขั้นที่ปิดไปแล้วไม่มีขั้นถัดไป */
function nextStageOf(id) {
  const open = STAGES.filter((s) => s.id !== "WON" && s.id !== "LOST");
  const i = open.findIndex((s) => s.id === id);
  if (i < 0) return null;
  return i + 1 < open.length ? open[i + 1] : STAGES.find((s) => s.id === "WON");
}

/** ชื่อพนักงานขายจากรหัสอ้างอิง — คนที่ถูกลบไปแล้วคืนค่าว่าง ไม่พัง */
function sellerName(db, id) {
  const p = (db.salespersons || []).find((x) => x.id === id);
  return p ? p.code + " " + p.name : "";
}
