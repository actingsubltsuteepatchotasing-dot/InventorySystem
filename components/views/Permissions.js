"use client";

// หน้าจอกำหนดสิทธิการใช้งาน — แอดมินกำหนดได้ทั้งค่าเริ่มต้นของทุกคน และรายคน
//
// สิทธิ 3 อย่างต่อหนึ่งหน้าจอ:
//   แสดงหน้าจอ    ไม่ติ๊ก = หายไปจากเมนูเลย ไม่ใช่แค่กดแล้วขึ้นว่าไม่มีสิทธิ
//                 การเห็นเมนูที่กดไม่ได้ทำให้คนใช้สับสนกว่าไม่เห็นเลย
//   แก้ไข/บันทึก  ไม่ติ๊ก = เข้าไปดูได้แต่ปุ่มบันทึก/ลบถูกปิด
//   เปลี่ยนวันที่  ไม่ติ๊ก = ช่องวันที่ล็อกไว้ที่วันปัจจุบัน กันย้อนวันเอกสาร
//
// ลำดับการตัดสินสิทธิ (ดู permOf ใน lib/db.js):
//   1. สิทธิเฉพาะตัวของคนนั้น
//   2. ค่าเริ่มต้นของทุกคน
//   3. ไม่มีทั้งคู่ = เปิดหมด
//
// ทำไมตั้งสิทธิรายคนแล้วเขียนครบทุกหน้าจอ ไม่ใช่เขียนเฉพาะที่ต่างจากค่าเริ่มต้น:
//   ถ้าเขียนเฉพาะบางหน้า หน้าที่เหลือจะยังวิ่งไปตามค่าเริ่มต้น วันที่แอดมินแก้
//   ค่าเริ่มต้นทีหลัง สิทธิของคนที่ตั้งเฉพาะตัวไว้จะขยับตามไปด้วยโดยไม่มีใครตั้งใจ
//   เขียนครบทุกหน้าไปเลย คนนั้นจึงถูกกำหนดไว้ชัดเจน และ "ใช้ค่าเริ่มต้น" กลายเป็น
//   สถานะที่ชัดเจนอีกอันหนึ่ง (ไม่มีแถวของตัวเองเลย) ซึ่งกดกลับได้ด้วยปุ่มเดียว
//
// ทำไมฐานข้อมูลต้องบังคับด้วย ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ:
//   ถ้าบังคับแค่ที่หน้าจอ ใครก็ยิง API ตรง ๆ เพื่อยกสิทธิให้ตัวเองได้
//   สามตารางที่คุมสิทธิจึงมี policy ว่า "อ่านได้ทุกคน เขียนได้เฉพาะแอดมิน"
//   หน้าจอนี้จึงเป็นแค่หน้าตาให้ใช้ง่าย ไม่ใช่ตัวที่บังคับกติกา

import { Fragment, useEffect, useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { PERM_CAPS, SCREENS } from "@/lib/constants";
import { useToast } from "../Toast";
import { Badge, Card, Empty, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

/** ค่าที่ใช้แทน "ค่าเริ่มต้นของทุกคน" ในช่องเลือกเป้าหมาย */
const DEFAULT_TARGET = "";

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

/** สิทธิเต็มทุกอย่าง */
const FULL = { view: true, edit: true, date: true };

export default function Permissions() {
  const inv = useInv();
  const toast = useToast();
  const { user } = useAuth();

  const groups = useMemo(byGroup, []);

  /** ตั้งสิทธิให้ใคร — ว่าง = ค่าเริ่มต้นของทุกคน */
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState("");

  const users = useMemo(
    () => (inv.db.appUsers || []).slice().sort((a, b) => a.email.localeCompare(b.email, "th")),
    [inv.db.appUsers]
  );
  const userPerms = inv.db.userPerms || [];
  const globalPerms = inv.db.perms || [];

  /** สิทธิที่บันทึกไว้ของเป้าหมายที่เลือกอยู่ (map: รหัสหน้าจอ -> สิทธิ) */
  const savedOf = useMemo(() => {
    const map = new Map();
    if (target === DEFAULT_TARGET) {
      globalPerms.forEach((p) => map.set(p.id, { view: p.view, edit: p.edit, date: p.date }));
      return map;
    }
    userPerms
      .filter((p) => p.userId === target)
      .forEach((p) => map.set(p.screenId, { view: p.view, edit: p.edit, date: p.date }));
    return map;
  }, [target, globalPerms, userPerms]);

  /** เป้าหมายนี้ยังไม่เคยตั้งสิทธิเฉพาะตัวเลย */
  const usingDefault = target !== DEFAULT_TARGET && savedOf.size === 0;

  /** ค่าเริ่มต้นของทุกคน ใช้เป็นค่าตั้งต้นตอนเริ่มตั้งสิทธิให้คนที่ยังไม่เคยตั้ง */
  const defaultOf = (id) => {
    const g = globalPerms.find((p) => p.id === id);
    return g ? { view: g.view, edit: g.edit, date: g.date } : FULL;
  };

  // ข้อมูลมาทีหลังตอนโหลดเสร็จ และเปลี่ยนเมื่อสลับเป้าหมาย จึงเติมร่างใน effect
  useEffect(() => {
    const next = {};
    SCREENS.forEach((sc) => {
      const own = savedOf.get(sc.id);
      next[sc.id] = own || defaultOf(sc.id);
    });
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, savedOf]);

  if (!inv.permsReady) {
    return <SetupNotice feature="หน้าจอกำหนดสิทธิการใช้งาน" tables={["screen_perms"]} />;
  }
  if (!draft) return null;

  /* ------------------------------------------------ คนที่ไม่ใช่แอดมิน */
  if (!inv.isAdmin) {
    return (
      <div className="stack">
        <Card title="กำหนดสิทธิการใช้งาน">
          <p className="muted" style={{ marginTop: 0 }}>
            หน้านี้เปิดให้เฉพาะผู้ดูแลระบบ (แอดมิน) เป็นคนกำหนด
            บัญชีของคุณ ({(user && user.email) || "-"}) เป็นผู้ใช้ทั่วไป
            ถ้าต้องการสิทธิเพิ่ม ให้แจ้งแอดมินของระบบ
          </p>
          <p className="muted">
            ฐานข้อมูลบังคับกติกานี้ด้วย ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ —
            ต่อให้ยิงคำสั่งเข้าไปตรง ๆ ก็แก้สิทธิไม่ได้
          </p>
        </Card>

        <Card title="สิทธิที่คุณมีอยู่ตอนนี้">
          <TableWrap>
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>หน้าจอ</th>
                {PERM_CAPS.map((c) => (
                  <th key={c.id} style={{ width: 130, textAlign: "center" }}>
                    {c.name}
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
                  {g.items.map((sc) => {
                    const p = inv.perm(sc.id);
                    return (
                      <tr key={sc.id} className={p.view ? "" : "perm-off"}>
                        <td>{sc.name}</td>
                        {PERM_CAPS.map((c) => {
                          const has = c.id === "view" || sc.caps.includes(c.id);
                          return (
                            <td key={c.id} style={{ textAlign: "center" }}>
                              {!has ? (
                                <span style={{ opacity: 0.35 }}>—</span>
                              ) : p[c.id] ? (
                                <span style={{ color: "var(--ok)" }}>✓</span>
                              ) : (
                                <span style={{ color: "var(--err)" }}>✗</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      </div>
    );
  }

  /* ---------------------------------------------------------- แอดมิน */

  const targetUser = users.find((u) => u.id === target) || null;
  const targetName = targetUser
    ? targetUser.name || targetUser.email
    : "ค่าเริ่มต้นของทุกคน";

  /** ร่างต่างจากที่บันทึกไว้ตรงไหนบ้าง — บันทึกเฉพาะที่เปลี่ยนจริง */
  const changed = SCREENS.filter((sc) => {
    const d = draft[sc.id];
    const p = savedOf.get(sc.id) || (target === DEFAULT_TARGET ? FULL : defaultOf(sc.id));
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

  /** คัดลอกค่าเริ่มต้นของทุกคนมาเป็นจุดตั้งต้น */
  function copyDefault() {
    setDraft(() => {
      const next = {};
      SCREENS.forEach((sc) => {
        next[sc.id] = defaultOf(sc.id);
      });
      return next;
    });
  }

  async function save() {
    if (busy || !changed.length) return;

    if (hiddenCount) {
      const names = SCREENS.filter((sc) => !draft[sc.id].view).map((sc) => sc.name);
      const who = target === DEFAULT_TARGET ? "ของทุกคนที่ยังไม่ได้ตั้งสิทธิเฉพาะตัว" : "ของ " + targetName;
      const ok = window.confirm(
        "หน้าจอ " + hiddenCount + " หน้าจะหายไปจากเมนู" + who + ":\n\n" +
          names.join(", ") +
          "\n\nหน้า “กำหนดสิทธิการใช้งาน” ยังอยู่กับแอดมินเสมอ จึงกลับมาเปิดคืนได้\n\nยืนยันหรือไม่?"
      );
      if (!ok) return;
    }

    setBusy("save");
    try {
      if (target === DEFAULT_TARGET) {
        await inv.savePerms(changed.map((sc) => ({ id: sc.id, ...draft[sc.id] })));
        toast("บันทึกค่าเริ่มต้นของทุกคน " + changed.length + " หน้าจอแล้ว", "ok");
      } else {
        // เขียนครบทุกหน้าจอ ไม่ใช่เฉพาะที่เปลี่ยน — ดูเหตุผลในหัวไฟล์
        const rows = SCREENS.map((sc) => ({
          id: target + ":" + sc.id,
          userId: target,
          screenId: sc.id,
          ...draft[sc.id],
          ts: Date.now(),
        }));
        await inv.saveUserPerms(rows);
        toast("บันทึกสิทธิของ " + targetName + " แล้ว (" + rows.length + " หน้าจอ)", "ok");
      }
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  /** ล้างสิทธิเฉพาะตัว กลับไปใช้ค่าเริ่มต้นของทุกคน */
  async function resetToDefault() {
    if (busy || target === DEFAULT_TARGET) return;
    if (!window.confirm("ล้างสิทธิเฉพาะตัวของ " + targetName + " แล้วกลับไปใช้ค่าเริ่มต้นของทุกคน?")) {
      return;
    }
    setBusy("reset");
    try {
      await inv.clearUserPerms(target);
      toast("ล้างสิทธิเฉพาะตัวของ " + targetName + " แล้ว", "ok");
    } catch (e) {
      toast("ล้างไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  /** เปลี่ยนบทบาทหรือสถานะของผู้ใช้ */
  async function saveUser(u, patch) {
    if (busy) return;

    // กันแอดมินคนสุดท้ายหายไป ไม่งั้นจะไม่มีใครตั้งสิทธิให้ใครได้อีก
    const admins = users.filter((x) => x.role === "admin" && x.active);
    const losingAdmin =
      u.role === "admin" && u.active && (patch.role === "user" || patch.active === false);
    if (losingAdmin && admins.length <= 1) {
      return toast("ถอดแอดมินคนสุดท้ายไม่ได้ — ต้องมีแอดมินอย่างน้อยหนึ่งคนเสมอ", "err");
    }

    setBusy(u.id);
    try {
      await inv.saveAppUser({ ...u, ...patch, ts: Date.now() });
      toast("บันทึกผู้ใช้ " + (u.name || u.email) + " แล้ว", "ok");
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy("");
    }
  }

  const customCount = (id) => userPerms.filter((p) => p.userId === id).length;

  return (
    <div className="stack">
      <Card
        title="ผู้ใช้ในระบบ"
        actions={
          <Badge kind="info">
            แอดมิน {users.filter((u) => u.role === "admin" && u.active).length} คน · ทั้งหมด{" "}
            {users.length} คน
          </Badge>
        }
      >
        {!inv.usersReady ? (
          <p className="muted" style={{ marginTop: 0 }}>
            ยังไม่มีตารางผู้ใช้ในฐานข้อมูล จึงตั้งสิทธิรายคนไม่ได้
            ให้รัน <code>supabase/schema.sql</code> ทั้งไฟล์อีกครั้งใน Supabase SQL Editor
            แล้วเข้าระบบใหม่ ระหว่างนี้ยังตั้งค่าเริ่มต้นของทุกคนได้ตามปกติ
          </p>
        ) : !users.length ? (
          <Empty>ยังไม่มีผู้ใช้ในทะเบียน — ผู้ใช้จะถูกเพิ่มเองเมื่อเข้าระบบครั้งแรก</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th>อีเมล</th>
                <th>ชื่อที่แสดง</th>
                <th style={{ width: 120 }}>บทบาท</th>
                <th style={{ width: 110, textAlign: "center" }}>เปิดใช้งาน</th>
                <th style={{ width: 150 }}>สิทธิที่ใช้อยู่</th>
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const n = customCount(u.id);
                const isMe = user && user.id === u.id;
                return (
                  <tr key={u.id} className={u.active ? "" : "perm-off"}>
                    <td>
                      {u.email}
                      {isMe ? <Badge kind="info">คุณ</Badge> : null}
                    </td>
                    <td>
                      <input
                        className="inp"
                        value={u.name}
                        onChange={(e) => saveUser(u, { name: e.target.value })}
                        placeholder="ชื่อ-นามสกุล"
                        aria-label={"ชื่อที่แสดงของ " + u.email}
                      />
                    </td>
                    <td>
                      <select
                        className="inp"
                        value={u.role}
                        onChange={(e) => saveUser(u, { role: e.target.value })}
                        disabled={!!busy}
                        aria-label={"บทบาทของ " + u.email}
                      >
                        <option value="user">ผู้ใช้ทั่วไป</option>
                        <option value="admin">แอดมิน</option>
                      </select>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        className="chk"
                        checked={u.active}
                        onChange={() => saveUser(u, { active: !u.active })}
                        disabled={!!busy}
                        aria-label={"เปิดใช้งาน " + u.email}
                      />
                    </td>
                    <td>
                      {n ? (
                        <Badge kind="warn">ตั้งเฉพาะตัวไว้</Badge>
                      ) : (
                        <Badge kind="gray">ใช้ค่าเริ่มต้น</Badge>
                      )}
                    </td>
                    <td className="num">
                      <button
                        className="btn btn-g btn-sm"
                        onClick={() => setTarget(u.id)}
                        disabled={!!busy}
                      >
                        ตั้งสิทธิ
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}

        <span className="hint">
          บทบาท <b>แอดมิน</b> คือคนที่แก้สิทธิของคนอื่นได้ ·
          ปิดใช้งานแล้วบัญชียังล็อกอินได้ แต่จะไม่ถูกนับเป็นแอดมินอีก
          (การปิดบัญชีจริงต้องทำที่ Supabase) ·
          ระบบที่ยังไม่มีแอดมินเลย ทุกคนถือเป็นแอดมินชั่วคราว จนกว่าจะตั้งคนแรก
        </span>
      </Card>

      <Card
        title={"กำหนดสิทธิของ: " + targetName}
        actions={
          <>
            <Badge kind={hiddenCount ? "warn" : "ok"}>
              แสดง {SCREENS.length - hiddenCount} / {SCREENS.length} หน้าจอ
            </Badge>
            <button className="btn btn-g btn-sm" onClick={() => setAll(true)} disabled={!!busy}>
              ติ๊กทั้งหมด
            </button>
            <button className="btn btn-g btn-sm" onClick={() => setAll(false)} disabled={!!busy}>
              ล้างทั้งหมด
            </button>
            {target !== DEFAULT_TARGET ? (
              <button className="btn btn-g btn-sm" onClick={copyDefault} disabled={!!busy}>
                คัดลอกค่าเริ่มต้น
              </button>
            ) : null}
            <button className="btn btn-p btn-sm" onClick={save} disabled={!!busy || !changed.length}>
              {busy === "save" ? "กำลังบันทึก…" : changed.length ? "บันทึก (" + changed.length + ")" : "บันทึก"}
            </button>
          </>
        }
      >
        <div className="row" style={{ marginBottom: 12 }}>
          <select
            className="inp"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={!!busy}
            aria-label="เลือกว่าจะตั้งสิทธิให้ใคร"
            style={{ maxWidth: 360 }}
          >
            <option value={DEFAULT_TARGET}>ค่าเริ่มต้นของทุกคน</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ? u.name + " (" + u.email + ")" : u.email}
                {customCount(u.id) ? " — ตั้งเฉพาะตัวไว้" : ""}
              </option>
            ))}
          </select>

          {target !== DEFAULT_TARGET ? (
            <button
              className="btn btn-d btn-sm"
              onClick={resetToDefault}
              disabled={!!busy || usingDefault}
              title={usingDefault ? "คนนี้ใช้ค่าเริ่มต้นอยู่แล้ว" : ""}
            >
              {busy === "reset" ? "กำลังล้าง…" : "กลับไปใช้ค่าเริ่มต้น"}
            </button>
          ) : null}
        </div>

        {target === DEFAULT_TARGET ? (
          <p className="muted" style={{ marginTop: 0 }}>
            ค่าชุดนี้ใช้กับ <b>ทุกคนที่ยังไม่ได้ตั้งสิทธิเฉพาะตัว</b> ·
            คนที่ตั้งเฉพาะตัวไว้แล้วจะไม่ได้รับผลจากการแก้ตรงนี้
          </p>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>
            {usingDefault ? (
              <>
                ตอนนี้ <b>{targetName}</b> ใช้ค่าเริ่มต้นของทุกคนอยู่ ·
                ติ๊กแล้วกดบันทึก จะกลายเป็นสิทธิเฉพาะตัวของคนนี้ทันที
                และจะไม่ขยับตามค่าเริ่มต้นอีก
              </>
            ) : (
              <>
                <b>{targetName}</b> มีสิทธิเฉพาะตัวอยู่แล้ว ·
                แก้ค่าเริ่มต้นของทุกคนจะไม่มีผลกับคนนี้
              </>
            )}
          </p>
        )}

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
                            disabled={!!busy}
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
            <b>ลำดับการตัดสินสิทธิ</b> — สิทธิเฉพาะตัวของคนนั้นมาก่อน
            ถ้าไม่มีจึงใช้ค่าเริ่มต้นของทุกคน ถ้าไม่มีทั้งคู่ถือว่าเปิดหมด
            ไม่ได้เอาสองชั้นมารวมกัน เพราะสิทธิที่ต้องเดาว่าชั้นไหนชนะ คนตั้งค่าอ่านไม่ออก
          </li>
          <li>
            ตั้งสิทธิให้คนหนึ่งแล้ว ระบบจะเขียนครบทุกหน้าจอของคนนั้น
            ไม่ใช่เฉพาะที่ต่างจากค่าเริ่มต้น — วันที่แก้ค่าเริ่มต้นทีหลัง
            สิทธิของคนนั้นจะได้ไม่ขยับตามไปโดยไม่มีใครตั้งใจ
          </li>
          <li>
            หน้า <b>กำหนดสิทธิการใช้งาน</b> (หน้านี้) ไม่มีในตารางและปิดไม่ได้ —
            แต่คนที่ไม่ใช่แอดมินเปิดเข้ามาจะเห็นแค่สิทธิของตัวเอง แก้อะไรไม่ได้
          </li>
          <li>
            <b>ฐานข้อมูลบังคับกติกานี้ด้วย</b> ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ —
            ตารางผู้ใช้ สิทธิรายคน และค่าเริ่มต้น ตั้ง policy ไว้ว่า
            อ่านได้ทุกคนที่ล็อกอินแล้ว แต่เขียนได้เฉพาะแอดมิน
          </li>
          <li>
            ระบบที่ยังไม่มีแอดมินเลยสักคน จะถือว่าทุกคนเป็นแอดมินชั่วคราว
            ไม่งั้นระบบที่เพิ่งติดตั้งจะไม่มีใครตั้งสิทธิให้ใครได้เลย
            พอตั้งแอดมินคนแรกแล้วประตูนี้ปิดเองทันที
          </li>
          <li>
            สิทธิชุดนี้คุม <b>การใช้งานผ่านหน้าจอ</b> — ไม่ได้แบ่งสิทธิระดับตารางข้อมูล
            ผู้ใช้ที่ล็อกอินแล้วยังอ่านและแก้ตารางข้อมูลผ่าน API ได้เหมือนเดิม
            ถ้าต้องการแบ่งถึงระดับนั้นต้องเขียน policy ตามบทบาทให้ทุกตาราง ซึ่งเป็นงานอีกก้อน
          </li>
        </ul>
      </Card>
    </div>
  );
}
