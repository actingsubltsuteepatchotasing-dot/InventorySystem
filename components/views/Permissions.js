"use client";

// หน้าจอกำหนดสิทธิการใช้งานแต่ละหน้าจอ
//
// สิทธิ 3 อย่างต่อหนึ่งหน้าจอ:
//   แสดงหน้าจอ    ไม่ติ๊ก = หายไปจากเมนูเลย ไม่ใช่แค่กดแล้วขึ้นว่าไม่มีสิทธิ
//                 การเห็นเมนูที่กดไม่ได้ทำให้คนใช้สับสนกว่าไม่เห็นเลย
//   แก้ไข/บันทึก  ไม่ติ๊ก = เข้าไปดูได้แต่ปุ่มบันทึก/ลบถูกปิด
//   เปลี่ยนวันที่  ไม่ติ๊ก = ช่องวันที่ล็อกไว้ที่วันปัจจุบัน กันย้อนวันเอกสาร
//
// สิทธิชุดนี้เป็นของทั้งระบบ ยังไม่ได้แยกรายผู้ใช้ เพราะระบบยังไม่มีตารางบทบาทผู้ใช้

import { Fragment, useEffect, useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { PERM_CAPS, SCREENS } from "@/lib/constants";
import { useToast } from "../Toast";
import { Badge, Card, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

/** จัดหน้าจอเป็นกลุ่มตามลำดับที่ประกาศไว้ ไม่เรียงใหม่ ให้ตรงกับเมนูจริง */
function byGroup() {
  const out = [];
  SCREENS.forEach((sc) => {
    const last = out[out.length - 1];
    if (last && last.group === sc.group) last.items.push(sc);
    else out.push({ group: sc.group, items: [sc] });
  });
  return out;
}

export default function Permissions() {
  const inv = useInv();
  const toast = useToast();

  /** ร่างที่กำลังแก้ — เก็บเป็น map ของ id -> {view, edit, date} */
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(byGroup, []);

  // ข้อมูลมาทีหลังตอนโหลดเสร็จ จึงเติมร่างใน effect ไม่ใช่ตอนสร้าง state
  useEffect(() => {
    const next = {};
    SCREENS.forEach((sc) => {
      const p = inv.perm(sc.id);
      next[sc.id] = { view: p.view, edit: p.edit, date: p.date };
    });
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv.db.perms]);

  if (!inv.permsReady) {
    return <SetupNotice feature="หน้าจอกำหนดสิทธิการใช้งาน" tables={["screen_perms"]} />;
  }
  if (!draft) return null;

  const saved = new Map((inv.db.perms || []).map((p) => [p.id, p]));

  /** ร่างต่างจากที่บันทึกไว้ตรงไหนบ้าง — บันทึกเฉพาะที่เปลี่ยนจริง */
  const changed = SCREENS.filter((sc) => {
    const d = draft[sc.id];
    const p = saved.get(sc.id) || { view: true, edit: true, date: true };
    return d.view !== p.view || d.edit !== p.edit || d.date !== p.date;
  });

  const hiddenCount = SCREENS.filter((sc) => !draft[sc.id].view).length;

  const toggle = (id, cap) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], [cap]: !d[id][cap] } }));

  /** เปิด/ปิดทุกหน้าจอพร้อมกัน สำหรับเริ่มจากศูนย์แล้วค่อยติ๊กเฉพาะที่ต้องการ */
  function setAll(on) {
    setDraft((d) => {
      const next = { ...d };
      SCREENS.forEach((sc) => {
        next[sc.id] = { view: on, edit: on, date: on };
      });
      return next;
    });
  }

  async function save() {
    if (busy || !changed.length) return;

    if (hiddenCount) {
      const names = SCREENS.filter((sc) => !draft[sc.id].view).map((sc) => sc.name);
      const ok = window.confirm(
        "หน้าจอ " + hiddenCount + " หน้าจะหายไปจากเมนูของทุกคน:\n\n" +
          names.join(", ") +
          "\n\nหน้า “กำหนดสิทธิการใช้งาน” ยังอยู่เสมอ จึงกลับมาเปิดคืนได้\n\nยืนยันหรือไม่?"
      );
      if (!ok) return;
    }

    setBusy(true);
    try {
      await inv.savePerms(changed.map((sc) => ({ id: sc.id, ...draft[sc.id] })));
      toast("บันทึกสิทธิการใช้งาน " + changed.length + " หน้าจอแล้ว", "ok");
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Card
        title="กำหนดสิทธิการใช้งาน"
        actions={
          <>
            <Badge kind={hiddenCount ? "warn" : "ok"}>
              แสดง {SCREENS.length - hiddenCount} / {SCREENS.length} หน้าจอ
            </Badge>
            <button className="btn btn-g btn-sm" onClick={() => setAll(true)} disabled={busy}>
              ติ๊กทั้งหมด
            </button>
            <button className="btn btn-g btn-sm" onClick={() => setAll(false)} disabled={busy}>
              ล้างทั้งหมด
            </button>
            <button
              className="btn btn-p btn-sm"
              onClick={save}
              disabled={busy || !changed.length}
            >
              {busy ? "กำลังบันทึก…" : changed.length ? "บันทึก (" + changed.length + ")" : "บันทึก"}
            </button>
          </>
        }
      >
        <p className="muted" style={{ marginTop: 0 }}>
          หน้าจอที่ไม่ติ๊ก <b>แสดงหน้าจอ</b> จะหายไปจากเมนูของทุกคน ไม่ใช่แค่กดไม่ได้ ·
          สิทธิชุดนี้ใช้กับทุกคนที่เข้าระบบ ยังไม่ได้แยกรายผู้ใช้
        </p>

        <TableWrap>
          <thead>
            <tr>
              <th style={{ minWidth: 220 }}>หน้าจอ</th>
              {PERM_CAPS.map((c) => (
                <th key={c.id} style={{ width: 150, textAlign: "center" }}>
                  {c.name}
                  <div style={{ fontWeight: 400, fontSize: 11, opacity: 0.75 }}>{c.hint}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.group}>
                <tr className="perm-group">
                  <td colSpan={PERM_CAPS.length + 1}>{g.group}</td>
                </tr>
                {g.items.map((sc) => (
                  <tr key={sc.id} className={draft[sc.id].view ? "" : "perm-off"}>
                    <td>{sc.name}</td>
                    {PERM_CAPS.map((c) => {
                      // หน้าจอที่ไม่มีสิทธินั้นให้เว้นว่าง ไม่ใส่ช่องติ๊กที่ติ๊กแล้วไม่เกิดอะไร
                      const has = c.id === "view" || sc.caps.includes(c.id);
                      if (!has) {
                        return (
                          <td key={c.id} style={{ textAlign: "center", opacity: 0.35 }}>
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={c.id} style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            className="chk"
                            checked={draft[sc.id][c.id]}
                            onChange={() => toggle(sc.id, c.id)}
                            disabled={busy}
                            aria-label={c.name + "ของหน้าจอ" + sc.name}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <Card title="ข้อควรรู้">
        <ul className="note-list">
          <li>
            หน้า <b>กำหนดสิทธิการใช้งาน</b> (หน้านี้) ไม่มีในตารางและปิดไม่ได้ —
            ถ้าปิดตัวเองได้ คนตั้งค่าจะล็อกตัวเองออกถาวร แก้กลับได้ทางเดียวคือ
            เข้าไปลบแถวในฐานข้อมูลตรง ๆ ซึ่งคนใช้ทั่วไปทำไม่ได้
          </li>
          <li>
            ยังไม่ได้ตั้งค่า = <b>เปิดหมด</b> ไม่ใช่ปิดหมด ระบบที่เพิ่งติดตั้งจะได้ไม่เปิดมาว่างเปล่า
            จนคนใช้คิดว่าโปรแกรมพัง
          </li>
          <li>
            สิทธินี้เป็นการ<b>จัดหน้าจอให้เหมาะกับงาน</b> ไม่ใช่ระบบความปลอดภัย —
            คนที่ล็อกอินได้ยังยิง API ตรงได้อยู่ ถ้าต้องการกันจริงต้องทำที่ RLS ของฐานข้อมูล
          </li>
          <li>
            ปิด <b>เปลี่ยนวันที่</b> แล้วช่องวันที่จะล็อกไว้ที่วันปัจจุบัน
            ใช้กันคนย้อนวันเอกสารหลังปิดงวดแล้ว
          </li>
        </ul>
      </Card>
    </div>
  );
}
