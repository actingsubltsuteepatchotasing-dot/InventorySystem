"use client";

// หน้าจอกำหนดคลังสินค้าและที่เก็บสินค้า
//
// รวมสองอย่างไว้หน้าจอเดียวเพราะที่เก็บอยู่ลอย ๆ ไม่ได้ ต้องสังกัดคลังเสมอ
// เลือกคลังทางซ้าย แล้วจัดการช่องเก็บของคลังนั้นทางขวา
// (ต่างจากหน้า "ผังที่เก็บสินค้า" ที่เน้นดูเป็นภาพและจัดวางสินค้าลงช่อง)

import { useEffect, useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { LOCATION_KINDS } from "@/lib/constants";
import { num, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { IcPlus, IcTrash } from "../Icons";
import Modal from "../Modal";
import { Badge, Card, Empty, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

const kindOf = (id) => LOCATION_KINDS.find((k) => k.id === id) || LOCATION_KINDS[0];

const blankWh = () => ({
  id: uid(),
  code: "",
  name: "",
  province: "",
  lat: 13.7563,
  lng: 100.5018,
});

const blankLoc = (whId) => ({
  id: uid(),
  whId,
  code: "",
  name: "",
  zone: "A",
  row: 1,
  col: 1,
  kind: "shelf",
  capacity: 2000,
  note: "",
});

export default function WarehouseSetup() {
  const inv = useInv();
  const { db } = inv;
  const toast = useToast();

  const [whId, setWhId] = useState("");
  const [whForm, setWhForm] = useState(null); // คลังที่กำลังเพิ่ม/แก้
  const [locForm, setLocForm] = useState(null); // ช่องเก็บที่กำลังเพิ่ม/แก้
  const [busy, setBusy] = useState(false);

  // คลังแรกเป็นค่าเริ่มต้น และถ้าคลังที่เลือกอยู่ถูกลบไปก็ให้เด้งกลับมาคลังแรก
  useEffect(() => {
    if (!db.warehouses.length) return;
    if (!db.warehouses.some((w) => w.id === whId)) setWhId(db.warehouses[0].id);
  }, [db.warehouses, whId]);

  const wh = db.warehouses.find((w) => w.id === whId) || null;
  const bins = useMemo(
    () => db.locations.filter((l) => l.whId === whId),
    [db.locations, whId]
  );

  /** ยอดคงเหลือและจำนวนรายการของแต่ละคลัง ใช้ตัดสินว่าลบได้หรือไม่ */
  const whStats = useMemo(() => {
    const m = {};
    db.warehouses.forEach((w) => {
      m[w.id] = {
        stock: inv.whTotal(w.id),
        bins: db.locations.filter((l) => l.whId === w.id).length,
        txns: db.txns.filter((t) => t.whId === w.id || t.whTo === w.id).length,
      };
    });
    return m;
  }, [db.warehouses, db.locations, db.txns, inv]);

  /* ------------------------------------------------------------ คลัง */

  async function saveWh() {
    if (busy) return;
    const f = whForm;
    const code = String(f.code || "").trim().toUpperCase();
    const name = String(f.name || "").trim();

    if (!code) return toast("กรุณากรอกรหัสคลัง", "err");
    if (!name) return toast("กรุณากรอกชื่อคลัง", "err");
    if (!String(f.province || "").trim()) return toast("กรุณากรอกจังหวัด", "err");

    // รหัสคลังถูกใช้เป็นตัวอ้างถึงในเอกสารและรายงาน ซ้ำกันแล้วแยกไม่ออก
    if (db.warehouses.some((w) => w.id !== f.id && w.code.toUpperCase() === code)) {
      return toast("รหัสคลัง " + code + " ถูกใช้ไปแล้ว", "err");
    }

    const lat = Number(f.lat);
    const lng = Number(f.lng);
    // พิกัดเอาไปปักหมุดบนแผนที่หน้าสินค้าตามจังหวัด ผิดช่วงแล้วหมุดจะหลุดไปนอกแผนที่
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return toast("ละติจูดต้องอยู่ระหว่าง -90 ถึง 90", "err");
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return toast("ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180", "err");
    }

    setBusy(true);
    try {
      await inv.saveWarehouse({
        id: f.id,
        code,
        name,
        province: String(f.province).trim(),
        lat,
        lng,
      });
      toast("บันทึกคลัง " + name + " แล้ว", "ok");
      setWhId(f.id);
      setWhForm(null);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function removeWh(w) {
    if (busy) return;
    const st = whStats[w.id] || { stock: 0, txns: 0, bins: 0 };

    /*
     * กันลบคลังที่ยังมีของหรือเคยมีรายการ
     *
     * txns อ้าง warehouses แบบ on delete restrict ฐานข้อมูลจะปฏิเสธเองอยู่แล้ว
     * แต่ข้อความที่ได้กลับมาเป็นภาษาของ Postgres ซึ่งอ่านไม่รู้เรื่อง
     * จึงกันไว้ตรงนี้ก่อนเพื่อบอกสาเหตุที่แท้จริงให้ชัด
     */
    if (st.stock > 0) {
      return toast(
        "ลบไม่ได้ — คลัง " + w.name + " ยังมีสินค้าคงเหลือ " + num(st.stock, 0) + " หน่วย",
        "err"
      );
    }
    if (st.txns > 0) {
      return toast(
        "ลบไม่ได้ — คลัง " + w.name + " มีประวัติการเคลื่อนไหว " + num(st.txns, 0) +
          " รายการ ซึ่งต้องเก็บไว้ตรวจสอบย้อนหลัง",
        "err"
      );
    }

    const msg = st.bins
      ? "คลังนี้มีช่องเก็บอยู่ " + st.bins + " ช่อง จะถูกลบไปด้วย\n\nยืนยันการลบ?"
      : "ยืนยันการลบคลัง " + w.name + " ?";
    if (!window.confirm(msg)) return;

    setBusy(true);
    try {
      await inv.removeWarehouse(w.id);
      toast("ลบคลัง " + w.name + " แล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------- ช่องเก็บ */

  async function saveLoc() {
    if (busy) return;
    const f = locForm;
    const code = String(f.code || "").trim().toUpperCase();
    if (!code) return toast("กรุณากรอกรหัสช่องเก็บ", "err");
    if (!String(f.zone || "").trim()) return toast("กรุณากรอกโซน", "err");

    // รหัสช่องซ้ำได้ข้ามคลัง แต่ห้ามซ้ำภายในคลังเดียวกัน ไม่งั้นเลือกผิดช่อง
    if (bins.some((l) => l.id !== f.id && l.code.toUpperCase() === code)) {
      return toast("รหัสช่องเก็บ " + code + " มีอยู่แล้วในคลังนี้", "err");
    }

    const row = parseInt(f.row, 10) || 1;
    const col = parseInt(f.col, 10) || 1;
    if (row < 1 || col < 1) return toast("แถวและช่องที่ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป", "err");

    setBusy(true);
    try {
      await inv.saveLocation({
        id: f.id,
        whId: f.whId,
        code,
        name: String(f.name || "").trim(),
        zone: String(f.zone).trim().toUpperCase(),
        row,
        col,
        kind: f.kind,
        capacity: Math.max(0, parseFloat(f.capacity) || 0),
        note: String(f.note || "").trim(),
      });
      toast("บันทึกช่องเก็บ " + code + " แล้ว", "ok");
      setLocForm(null);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function removeLoc(l) {
    if (busy) return;
    const left = inv.binQty(l.id);

    // ลบช่องที่ยังมีของ = ยอดรวมของทุกช่องจะไม่เท่ากับยอดคงเหลือของคลังอีกต่อไป
    // ซึ่งเป็นกติกาที่ทั้งระบบยึดไว้ ต้องย้ายของออกก่อน
    if (left > 0) {
      return toast(
        "ลบไม่ได้ — ช่อง " + l.code + " ยังมีสินค้าอยู่ " + num(left, 0) + " หน่วย",
        "err"
      );
    }
    if (!window.confirm("ยืนยันการลบช่องเก็บ " + l.code + " ?")) return;

    setBusy(true);
    try {
      await inv.removeLocation(l.id);
      toast("ลบช่องเก็บ " + l.code + " แล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (!inv.locationsReady) {
    return (
      <SetupNotice
        feature="การกำหนดคลังสินค้าและที่เก็บสินค้า"
        tables={["locations", "product_locations"]}
      />
    );
  }

  const setW = (k, v) => setWhForm((f) => ({ ...f, [k]: v }));
  const setL = (k, v) => setLocForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="stack">
      <Card
        title="คลังสินค้า"
        actions={
          <button className="btn btn-p btn-sm" onClick={() => setWhForm(blankWh())}>
            <IcPlus size={15} />
            เพิ่มคลัง
          </button>
        }
      >
        {db.warehouses.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 90 }}>รหัส</th>
                <th style={{ minWidth: 200 }}>ชื่อคลัง</th>
                <th style={{ minWidth: 140 }}>จังหวัด</th>
                <th style={{ minWidth: 150 }}>พิกัด</th>
                <th className="num" style={{ width: 90 }}>ช่องเก็บ</th>
                <th className="num" style={{ width: 110 }}>คงเหลือ</th>
                <th style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {db.warehouses.map((w) => {
                const st = whStats[w.id] || { stock: 0, bins: 0, txns: 0 };
                const locked = st.stock > 0 || st.txns > 0;
                return (
                  <tr
                    key={w.id}
                    className={w.id === whId ? "row-active" : ""}
                    onClick={() => setWhId(w.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      <code>{w.code}</code>
                    </td>
                    <td>
                      <b>{w.name}</b>
                    </td>
                    <td>{w.province}</td>
                    <td style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                      {Number(w.lat).toFixed(4)}, {Number(w.lng).toFixed(4)}
                    </td>
                    <td className="num">{num(st.bins, 0)}</td>
                    <td className="num">{num(st.stock, 0)}</td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <button
                          className="btn btn-o btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setWhForm({ ...w });
                          }}
                        >
                          แก้ไข
                        </button>
                        <button
                          className="btn btn-d btn-icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeWh(w);
                          }}
                          disabled={busy || locked}
                          title={
                            locked
                              ? "ลบไม่ได้ — คลังนี้มีสินค้าหรือมีประวัติการเคลื่อนไหวแล้ว"
                              : "ลบคลัง"
                          }
                        >
                          <IcTrash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>ยังไม่มีคลังสินค้า กดปุ่ม “เพิ่มคลัง” เพื่อเริ่มต้น</Empty>
        )}
      </Card>

      <Card
        title={"ที่เก็บสินค้า" + (wh ? " — " + wh.name : "")}
        actions={
          <>
            <Badge kind="info">{bins.length} ช่อง</Badge>
            <button
              className="btn btn-p btn-sm"
              onClick={() => setLocForm(blankLoc(whId))}
              disabled={!wh}
            >
              <IcPlus size={15} />
              เพิ่มที่เก็บ
            </button>
          </>
        }
      >
        {!wh ? (
          <Empty>เลือกคลังจากตารางด้านบนก่อน</Empty>
        ) : bins.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 110 }}>รหัสช่อง</th>
                <th style={{ minWidth: 180 }}>ชื่อที่เก็บ</th>
                <th style={{ width: 80 }}>โซน</th>
                <th className="num" style={{ width: 70 }}>แถว</th>
                <th className="num" style={{ width: 80 }}>ช่องที่</th>
                <th style={{ minWidth: 130 }}>ประเภท</th>
                <th className="num" style={{ width: 100 }}>ความจุ</th>
                <th className="num" style={{ width: 100 }}>มีของอยู่</th>
                <th style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {bins.map((l) => {
                const left = inv.binQty(l.id);
                const k = kindOf(l.kind);
                return (
                  <tr key={l.id}>
                    <td>
                      <code>{l.code}</code>
                    </td>
                    <td>{l.name || "—"}</td>
                    <td>{l.zone}</td>
                    <td className="num">{l.row}</td>
                    <td className="num">{l.col}</td>
                    <td>
                      <span style={{ color: k.color, fontWeight: 600 }}>{k.name}</span>
                    </td>
                    <td className="num">{l.capacity ? num(l.capacity, 0) : "—"}</td>
                    <td className="num">{num(left, 0)}</td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <button
                          className="btn btn-o btn-sm"
                          onClick={() => setLocForm({ ...l })}
                        >
                          แก้ไข
                        </button>
                        <button
                          className="btn btn-d btn-icon"
                          onClick={() => removeLoc(l)}
                          disabled={busy || left > 0}
                          title={
                            left > 0
                              ? "ลบไม่ได้ — ยังมีสินค้าในช่องนี้ " + num(left, 0) + " หน่วย"
                              : "ลบช่องเก็บ"
                          }
                        >
                          <IcTrash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>คลังนี้ยังไม่มีที่เก็บสินค้า กดปุ่ม “เพิ่มที่เก็บ” เพื่อเริ่มต้น</Empty>
        )}
      </Card>

      {/* ----------------------------------------------- กล่องแก้ไขคลัง */}
      {whForm ? (
        <Modal
          title={db.warehouses.some((w) => w.id === whForm.id) ? "แก้ไขคลังสินค้า" : "เพิ่มคลังสินค้า"}
          onClose={() => setWhForm(null)}
          maxWidth={640}
          footer={
            <>
              <button className="btn btn-g" onClick={() => setWhForm(null)} disabled={busy}>
                ยกเลิก
              </button>
              <button className="btn btn-p" onClick={saveWh} disabled={busy}>
                บันทึก
              </button>
            </>
          }
        >
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
            <div className="field">
              <label className="lbl" htmlFor="wf_code">รหัสคลัง</label>
              <input
                className="inp"
                id="wf_code"
                value={whForm.code}
                maxLength={10}
                onChange={(e) => setW("code", e.target.value.toUpperCase())}
                placeholder="เช่น BKK"
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="wf_prov">จังหวัด</label>
              <input
                className="inp"
                id="wf_prov"
                value={whForm.province}
                onChange={(e) => setW("province", e.target.value)}
                placeholder="เช่น กรุงเทพมหานคร"
              />
            </div>
            <div className="field span2">
              <label className="lbl" htmlFor="wf_name">ชื่อคลัง</label>
              <input
                className="inp"
                id="wf_name"
                value={whForm.name}
                onChange={(e) => setW("name", e.target.value)}
                placeholder="เช่น คลังสำนักงานใหญ่"
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="wf_lat">ละติจูด</label>
              <input
                className="inp num"
                id="wf_lat"
                value={whForm.lat}
                onChange={(e) => setW("lat", e.target.value)}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="wf_lng">ลองจิจูด</label>
              <input
                className="inp num"
                id="wf_lng"
                value={whForm.lng}
                onChange={(e) => setW("lng", e.target.value)}
              />
            </div>
            <div className="field span2">
              <span className="muted" style={{ fontSize: 12.5 }}>
                พิกัดใช้ปักหมุดในหน้า “สินค้าตามจังหวัด” ถ้ายังไม่ทราบ ปล่อยค่าเดิมไว้ก่อนได้
              </span>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* -------------------------------------------- กล่องแก้ไขช่องเก็บ */}
      {locForm ? (
        <Modal
          title={db.locations.some((l) => l.id === locForm.id) ? "แก้ไขที่เก็บสินค้า" : "เพิ่มที่เก็บสินค้า"}
          onClose={() => setLocForm(null)}
          maxWidth={640}
          footer={
            <>
              <button className="btn btn-g" onClick={() => setLocForm(null)} disabled={busy}>
                ยกเลิก
              </button>
              <button className="btn btn-p" onClick={saveLoc} disabled={busy}>
                บันทึก
              </button>
            </>
          }
        >
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
            <div className="field span2">
              <label className="lbl">คลังสินค้า</label>
              <input className="inp" readOnly value={wh ? wh.code + " · " + wh.name : ""} />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="wl_code">รหัสช่องเก็บ</label>
              <input
                className="inp"
                id="wl_code"
                value={locForm.code}
                onChange={(e) => setL("code", e.target.value.toUpperCase())}
                placeholder="เช่น A-01"
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="wl_name">ชื่อที่เก็บ</label>
              <input
                className="inp"
                id="wl_name"
                value={locForm.name}
                onChange={(e) => setL("name", e.target.value)}
                placeholder="เช่น ชั้นวาง A ช่อง 1"
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="wl_zone">โซน (แถวบนผัง)</label>
              <input
                className="inp"
                id="wl_zone"
                value={locForm.zone}
                maxLength={4}
                onChange={(e) => setL("zone", e.target.value.toUpperCase())}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="wl_row">แถวบนผัง</label>
              <input
                className="inp num"
                id="wl_row"
                type="number"
                min={1}
                value={locForm.row}
                onChange={(e) => setL("row", e.target.value)}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="wl_col">ช่องที่ (คอลัมน์บนผัง)</label>
              <input
                className="inp num"
                id="wl_col"
                type="number"
                min={1}
                value={locForm.col}
                onChange={(e) => setL("col", e.target.value)}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="wl_kind">ประเภทที่เก็บ</label>
              <select
                className="sel"
                id="wl_kind"
                value={locForm.kind}
                onChange={(e) => setL("kind", e.target.value)}
              >
                {LOCATION_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="lbl" htmlFor="wl_cap">ความจุ (0 = ไม่จำกัด)</label>
              <input
                className="inp num"
                id="wl_cap"
                type="number"
                min={0}
                value={locForm.capacity}
                onChange={(e) => setL("capacity", e.target.value)}
              />
            </div>
            <div className="field span2">
              <label className="lbl" htmlFor="wl_note">หมายเหตุ</label>
              <input
                className="inp"
                id="wl_note"
                value={locForm.note}
                onChange={(e) => setL("note", e.target.value)}
              />
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
