"use client";

// ลูกค้าเป้าหมาย (Leads) — ผู้สนใจที่ยังไม่ได้เป็นลูกค้าในทะเบียน
//
// ทำไมไม่เก็บปนกับทะเบียนลูกค้า:
//   ทะเบียนลูกค้าถูกใบขายอ้างแบบ restrict และรหัสลูกค้าห้ามซ้ำ
//   ถ้าเอาผู้สนใจไปใส่ปนไว้ ทะเบียนจะเต็มไปด้วยรายชื่อที่ไม่เคยซื้อ
//   และรายงานทุกตัวที่นับ "จำนวนลูกค้า" จะเพี้ยนทันทีโดยไม่มีใครสังเกต
//
// แปลงเป็นลูกค้าได้ปุ่มเดียว — คัดลอกข้อมูลไปสร้างในทะเบียนลูกค้า
// แล้วผูกกลับมาที่ผู้สนใจรายนี้ เพื่อให้ตามรอยได้ว่าลูกค้ารายนี้มาจากไหน

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { LEAD_STATUS, SOURCES, leadProblems, leadStatusOf } from "@/lib/crm";
import { uid } from "@/lib/format";
import { useToast } from "../Toast";
import { Badge, Card, Empty, ExportPair, SearchSelect, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

const BLANK = {
  id: "",
  code: "",
  name: "",
  contact: "",
  phone: "",
  email: "",
  province: "",
  source: "",
  status: "NEW",
  salesId: "",
  customerId: "",
  note: "",
};

/** รหัสถัดไปแบบ L0001 — นับจากรหัสที่มีอยู่จริง ไม่เก็บตัวนับไว้ที่ไหน */
export function nextLeadCode(leads) {
  const nums = (leads || [])
    .map((l) => /^L(\d+)$/i.exec(String(l.code || "")))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return "L" + String(next).padStart(4, "0");
}

export default function Leads({ onNavigate }) {
  const inv = useInv();
  const perm = inv.perm("leads");
  const { db } = inv;
  const toast = useToast();
  const { user } = useAuth();

  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const all = useMemo(
    () => (db.crmLeads || []).slice().sort((a, b) => a.code.localeCompare(b.code, "th")),
    [db.crmLeads]
  );

  const sellers = useMemo(
    () => (db.salespersons || []).filter((p) => p.active !== false),
    [db.salespersons]
  );

  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((l) => {
      if (status && l.status !== status) return false;
      if (!words.length) return true;
      const hay = [l.code, l.name, l.contact, l.phone, l.email, l.province, l.source, l.note]
        .join(" ")
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [all, q, status]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const problems = leadProblems(form, all);
  const editing = !!form.id;

  function startNew() {
    setForm({ ...BLANK, code: nextLeadCode(all) });
  }

  async function save() {
    if (busy) return;
    if (problems.length) return toast("ยังกรอกไม่ครบ: " + problems.join(" · "), "err");

    const l = {
      ...form,
      id: form.id || uid(),
      code: form.code.trim(),
      name: form.name.trim(),
      user: user && user.email ? user.email : "",
      ts: Date.now(),
    };

    setBusy("save");
    try {
      await inv.saveLead(l);
      toast("บันทึกลูกค้าเป้าหมาย " + l.code + " " + l.name + " แล้ว", "ok");
      setForm(BLANK);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  async function drop(l) {
    if (busy) return;
    const deals = (db.crmDeals || []).filter((d) => d.leadId === l.id).length;
    const acts = (db.crmActivities || []).filter((a) => a.leadId === l.id).length;

    const ok = window.confirm(
      "ลบลูกค้าเป้าหมาย " + l.code + " " + l.name + "?\n\n" +
        (deals ? "มีโอกาสการขายอ้างอยู่ " + deals + " รายการ\n" : "") +
        (acts ? "มีบันทึกกิจกรรมอ้างอยู่ " + acts + " รายการ\n" : "") +
        (deals || acts
          ? "ของพวกนี้จะไม่ถูกลบตาม แต่จะกลายเป็นไม่ระบุคู่ค้า (ยังเห็นชื่อเดิมอยู่)\n"
          : "") +
        "\nถ้าแค่ไม่เอาแล้ว แนะนำให้เปลี่ยนสถานะเป็น “ยกเลิก” แทนการลบ"
    );
    if (!ok) return;

    setBusy(l.id);
    try {
      await inv.removeLead(l.id);
      if (form.id === l.id) setForm(BLANK);
      toast("ลบลูกค้าเป้าหมาย " + l.code + " แล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  /**
   * แปลงเป็นลูกค้าในทะเบียน
   *
   * สร้างลูกค้าใหม่แล้วผูกกลับมาที่ผู้สนใจรายนี้ ไม่ได้ย้ายข้อมูลแล้วลบทิ้ง
   * เพราะประวัติว่า "ลูกค้ารายนี้เคยเป็นผู้สนใจจากช่องทางไหน" คือสิ่งที่
   * รายงานอัตราการแปลงใช้ทั้งหมด ลบทิ้งเมื่อไรก็วัดผลการหาลูกค้าไม่ได้อีก
   */
  async function convert(l) {
    if (busy) return;
    if (l.customerId) return toast("ผู้สนใจรายนี้แปลงเป็นลูกค้าไปแล้ว", "err");

    const dup = (db.customers || []).find(
      (c) => c.name.trim().toLowerCase() === l.name.trim().toLowerCase()
    );
    const ok = window.confirm(
      "แปลง " + l.name + " เป็นลูกค้าในทะเบียน?\n\n" +
        (dup ? "⚠ มีลูกค้าชื่อนี้อยู่แล้ว: " + dup.code + " " + dup.name + "\n\n" : "") +
        "ระบบจะสร้างลูกค้าใหม่พร้อมคัดลอกชื่อ ที่อยู่ และเบอร์โทรไปให้\n" +
        "แล้วผูกกลับมาที่รายการนี้เพื่อให้ตามรอยที่มาได้"
    );
    if (!ok) return;

    setBusy(l.id);
    try {
      const code = nextCustCode(db);
      const cust = {
        id: uid(),
        code,
        name: l.name,
        address: "",
        subdistrict: "",
        district: "",
        province: l.province || "",
        postcode: "",
        phone: l.phone || "",
        kind: "",
        taxId: "",
        branch: "",
        salesId: l.salesId || "",
      };
      await inv.saveCustomer(cust);
      await inv.saveLead({
        ...l,
        status: "CONVERTED",
        customerId: cust.id,
        user: user && user.email ? user.email : "",
        ts: Date.now(),
      });
      toast("สร้างลูกค้า " + code + " " + cust.name + " แล้ว", "ok");
    } catch (e) {
      toast("แปลงไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  const HEAD = ["รหัส", "ชื่อผู้สนใจ", "ผู้ติดต่อ", "เบอร์โทร", "อีเมล", "จังหวัด", "แหล่งที่มา", "พนักงานขาย", "สถานะ"];
  const rows = () =>
    list.map((l) => [
      l.code,
      l.name,
      l.contact,
      l.phone,
      l.email,
      l.province,
      l.source,
      nameOfSeller(db, l.salesId),
      leadStatusOf(l.status).name,
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
        title={editing ? "แก้ไขลูกค้าเป้าหมาย" : "เพิ่มลูกค้าเป้าหมาย"}
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
        <div className="form-grid">
          <div className="field">
            <label className="lbl" htmlFor="ld_code">รหัส *</label>
            <input
              className="inp"
              id="ld_code"
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="เช่น L0001"
            />
            <span className="hint">กด “รายการใหม่” เพื่อให้ระบบออกรหัสถัดไปให้</span>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="ld_name">ชื่อผู้สนใจ / ชื่อบริษัท *</label>
            <input
              className="inp"
              id="ld_name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="เช่น ร้านวัสดุก่อสร้างรุ่งเรือง"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ld_contact">ชื่อผู้ติดต่อ</label>
            <input
              className="inp"
              id="ld_contact"
              value={form.contact}
              onChange={(e) => set("contact", e.target.value)}
              placeholder="เช่น คุณสมชาย"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ld_phone">เบอร์โทร *</label>
            <input
              className="inp"
              id="ld_phone"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="081-2345678"
            />
            <span className="hint">กรอกเบอร์โทรหรืออีเมลอย่างน้อยหนึ่งอย่าง</span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ld_email">อีเมล</label>
            <input
              className="inp"
              id="ld_email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ld_prov">จังหวัด</label>
            <input
              className="inp"
              id="ld_prov"
              value={form.province}
              onChange={(e) => set("province", e.target.value)}
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ld_src">แหล่งที่มา</label>
            <input
              className="inp"
              id="ld_src"
              list="ldSrcList"
              value={form.source}
              onChange={(e) => set("source", e.target.value)}
              placeholder="เลือกหรือพิมพ์เอง"
            />
            <datalist id="ldSrcList">
              {SOURCES.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
            <span className="hint">ใช้วัดว่าช่องทางไหนได้ลูกค้าจริงมากที่สุด</span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ld_sp">พนักงานขายที่ดูแล</label>
            <SearchSelect
              id="ld_sp"
              value={form.salesId}
              onChange={(v) => set("salesId", v)}
              options={sellers.map((p) => ({ value: p.id, label: p.name, code: p.code }))}
              emptyLabel="— ยังไม่ระบุ —"
              notFound="ไม่พบพนักงานขายที่ตรงกับ"
            />
          </div>

          <div className="field">
            <label className="lbl" htmlFor="ld_st">สถานะ</label>
            <select
              className="sel"
              id="ld_st"
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
            >
              {LEAD_STATUS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field span2">
            <label className="lbl" htmlFor="ld_note">หมายเหตุ</label>
            <input
              className="inp"
              id="ld_note"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="เช่น สนใจสินค้ากลุ่มวัสดุ ขอใบเสนอราคาเดือนหน้า"
            />
          </div>
        </div>
      </Card>

      <Card
        title="รายชื่อลูกค้าเป้าหมาย"
        actions={
          <>
            <Badge kind={list.length ? "info" : "gray"}>
              {list.length} / {all.length} ราย
            </Badge>
            <ExportPair
              onExport={(save2) => save2(HEAD, rows(), "ลูกค้าเป้าหมาย.csv")}
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
            placeholder="ค้นจากรหัส ชื่อ ผู้ติดต่อ เบอร์โทร จังหวัด หรือแหล่งที่มา"
            aria-label="ค้นหาลูกค้าเป้าหมาย"
          />
          <select
            className="sel"
            style={{ width: 190 }}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="กรองตามสถานะ"
          >
            <option value="">ทุกสถานะ</option>
            {LEAD_STATUS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {list.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 90 }}>รหัส</th>
                <th style={{ minWidth: 200 }}>ชื่อผู้สนใจ</th>
                <th style={{ minWidth: 140 }}>ผู้ติดต่อ</th>
                <th style={{ minWidth: 130 }}>เบอร์โทร</th>
                <th style={{ minWidth: 120 }}>จังหวัด</th>
                <th style={{ minWidth: 140 }}>แหล่งที่มา</th>
                <th style={{ minWidth: 140 }}>พนักงานขาย</th>
                <th style={{ width: 150 }}>สถานะ</th>
                <th style={{ width: 210 }} />
              </tr>
            </thead>
            <tbody>
              {list.map((l) => {
                const st = leadStatusOf(l.status);
                return (
                  <tr key={l.id}>
                    <td className="code-cell">{l.code}</td>
                    <td>{l.name}</td>
                    <td>{l.contact || "—"}</td>
                    <td>{l.phone || "—"}</td>
                    <td>{l.province || "—"}</td>
                    <td className="muted">{l.source || "—"}</td>
                    <td>{nameOfSeller(db, l.salesId) || "—"}</td>
                    <td>
                      <Badge kind={st.kind}>{st.name}</Badge>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        {l.customerId ? (
                          <button
                            className="btn btn-g btn-sm"
                            onClick={() => onNavigate && onNavigate("cust360")}
                            title="ดูภาพรวมลูกค้ารายนี้"
                          >
                            เป็นลูกค้าแล้ว
                          </button>
                        ) : (
                          <button
                            className="btn btn-o btn-sm"
                            onClick={() => convert(l)}
                            disabled={!!busy || !perm.edit}
                            title="สร้างลูกค้าในทะเบียนจากข้อมูลนี้"
                          >
                            แปลงเป็นลูกค้า
                          </button>
                        )}
                        <button
                          className="btn btn-o btn-sm"
                          onClick={() => setForm({ ...l })}
                          disabled={!perm.edit}
                        >
                          แก้ไข
                        </button>
                        <button
                          className="btn btn-d btn-sm"
                          onClick={() => drop(l)}
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
              : "ยังไม่มีลูกค้าเป้าหมาย — กด “รายการใหม่” แล้วกรอกด้านบนได้เลย"}
          </Empty>
        )}
        <p className="muted" style={{ marginBottom: 0, fontSize: 12.5 }}>
          แปลงเป็นลูกค้าแล้วจะยังเห็นรายการนี้อยู่ เพื่อให้ตามรอยได้ว่าลูกค้ารายนั้นมาจากช่องทางไหน
          · เปิดโอกาสการขายจากผู้สนใจได้ที่เมนู <b>โอกาสการขาย</b> โดยไม่ต้องแปลงเป็นลูกค้าก่อน
        </p>
      </Card>
    </div>
  );
}

/** ชื่อพนักงานขายจากรหัสอ้างอิง — คนที่ถูกลบไปแล้วคืนค่าว่าง ไม่พัง */
function nameOfSeller(db, id) {
  const p = (db.salespersons || []).find((x) => x.id === id);
  return p ? p.code + " " + p.name : "";
}

/** รหัสลูกค้าถัดไป — นับจากรหัสที่ขึ้นต้นด้วย C ที่มีอยู่จริง */
function nextCustCode(db) {
  const nums = (db.customers || [])
    .map((c) => /^C(\d+)$/i.exec(String(c.code || "")))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return "C" + String(next).padStart(4, "0");
}
