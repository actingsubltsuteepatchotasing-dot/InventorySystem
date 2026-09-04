"use client";

// หน้าจอกำหนดที่เก็บสินค้าแบบเป็นภาพ
// แสดงผังช่องเก็บของแต่ละคลังเป็นตาราง คลิกช่องเพื่อดู/จัดวางสินค้าในช่องนั้น

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { LOCATION_KINDS } from "@/lib/constants";
import { num, thDate, todayISO, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { IcBox, IcPin, IcPlus, IcTrash } from "../Icons";
import Modal from "../Modal";
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

const kindOf = (id) => LOCATION_KINDS.find((k) => k.id === id) || LOCATION_KINDS[0];

export default function Locations() {
  const inv = useInv();
  const { db } = inv;
  const toast = useToast();
  const print = usePrint();

  const [whId, setWhId] = useState(db.warehouses[0] ? db.warehouses[0].id : "");
  const [selected, setSelected] = useState(null); // location id
  const [editing, setEditing] = useState(null); // {location} หรือ {location:null} = สร้างใหม่
  const [busy, setBusy] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const zones = inv.zonesOf(whId);
  const bins = db.locations.filter((l) => l.whId === whId);
  const bin = bins.find((l) => l.id === selected) || null;

  // สินค้าที่ยังมีของในคลังนี้แต่ยังไม่ถูกระบุตำแหน่ง
  const unplaced = useMemo(
    () =>
      db.products
        .map((p) => ({
          p,
          stock: inv.stockOf(p.id, whId),
          placed: inv.placedQty(p.id, whId),
        }))
        .filter((x) => x.stock > 0 && x.placed < x.stock),
    [db.products, db.placements, db.locations, db.txns, inv, whId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const totalPlaced = bins.reduce((s, l) => s + inv.binQty(l.id), 0);
  const totalStock = db.products.reduce((s, p) => s + inv.stockOf(p.id, whId), 0);

  /**
   * คำนวณผังที่เก็บใหม่ทั้งหมดจากรายการเคลื่อนไหว
   *
   * ใช้ตอนอัปเกรดจากรุ่นก่อนที่รายการยังไม่มีที่เก็บ หรือเมื่อผังหลุดจากยอดจริง
   * (เช่นบันทึกรายการสำเร็จแต่การปรับผังพลาดกลางทาง)
   * รายการเก่าที่ไม่มีที่เก็บจะไม่ถูกนับ ของส่วนนั้นจึงกลับไปเป็น "ยังไม่ระบุตำแหน่ง"
   * แล้วค่อยจัดวางเองจากแผงด้านล่าง
   */
  async function repairLayout() {
    if (
      !window.confirm(
        "คำนวณผังที่เก็บใหม่จากรายการเคลื่อนไหวทั้งหมดของทุกคลัง\n" +
          "การจัดวางที่เคยกรอกเองจะถูกเขียนทับ ดำเนินการต่อหรือไม่?"
      )
    ) {
      return;
    }
    setRepairing(true);
    try {
      const n = await inv.rebuildPlacements();
      toast("ซ่อมผังเรียบร้อย — จัดวางใหม่ " + num(n, 0) + " รายการ");
      setSelected(null);
    } catch (e) {
      toast("ซ่อมผังไม่สำเร็จ: " + e.message, "err");
    } finally {
      setRepairing(false);
    }
  }

  function printLayout() {
    const w = inv.wh(whId);
    print({
      title: "ผังที่เก็บสินค้า",
      subtitle: (w ? w.name + " · จังหวัด" + w.province : "") + " · ณ วันที่ " + thDate(todayISO()),
      body: (
        <table>
          <thead>
            <tr>
              <th>คลังสินค้า</th>
              <th>ช่องเก็บ</th>
              <th>ชื่อเรียก</th>
              <th>ประเภท</th>
              <th>รหัสสินค้า</th>
              <th>รายการสินค้า</th>
              <th style={{ textAlign: "right" }}>จำนวนที่จัดเก็บ</th>
            </tr>
          </thead>
          <tbody>
            {bins.flatMap((l) => {
              const items = inv.placementsIn(l.id);
              if (!items.length) {
                return [
                  <tr key={l.id}>
                    <td>{inv.whName(l.whId)}</td>
                    <td>{l.code}</td>
                    <td>{l.name}</td>
                    <td>{kindOf(l.kind).name}</td>
                    <td colSpan={2} style={{ color: "#777" }}>— ว่าง —</td>
                    <td style={{ textAlign: "right" }}>0</td>
                  </tr>,
                ];
              }
              return items.map((pl, i) => {
                const p = inv.prod(pl.productId);
                return (
                  <tr key={pl.id}>
                    <td>{i === 0 ? inv.whName(l.whId) : ""}</td>
                    <td>{i === 0 ? l.code : ""}</td>
                    <td>{i === 0 ? l.name : ""}</td>
                    <td>{i === 0 ? kindOf(l.kind).name : ""}</td>
                    <td>{p ? p.code : ""}</td>
                    <td>{inv.prodName(pl.productId)}</td>
                    <td style={{ textAlign: "right" }}>{num(pl.qty, 0)}</td>
                  </tr>
                );
              });
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>รวมที่จัดเก็บทั้งคลัง ({bins.length} ช่อง)</td>
              <td style={{ textAlign: "right" }}>{num(totalPlaced, 0)}</td>
            </tr>
          </tfoot>
        </table>
      ),
    });
  }

  if (!inv.locationsReady) {
    return (
      <SetupNotice
        feature="หน้าจอผังที่เก็บสินค้า"
        tables={["locations", "product_locations"]}
      />
    );
  }

  return (
    <div className="stack">
      <Card
        title="ผังที่เก็บสินค้า"
        actions={
          <>
            <button className="btn btn-p btn-sm" onClick={() => setEditing({ location: null })}>
              <IcPlus size={15} />
              เพิ่มช่องเก็บ
            </button>
            <button className="btn btn-g btn-sm" onClick={printLayout} disabled={!bins.length}>
              พิมพ์ผัง
            </button>
            <button
              className="btn btn-o btn-sm"
              onClick={repairLayout}
              disabled={repairing}
              title="คำนวณผังใหม่จากรายการเคลื่อนไหวทั้งหมด"
            >
              {repairing ? "กำลังซ่อม…" : "ซ่อมผังให้ตรงกับรายการ"}
            </button>
          </>
        }
      >
        <div className="row" style={{ marginBottom: 16, alignItems: "flex-end" }}>
          <div style={{ minWidth: 240 }}>
            <label className="lbl" htmlFor="loc_wh">คลังสินค้า</label>
            <WarehouseSelect
              db={db}
              id="loc_wh"
              value={whId}
              onChange={(v) => {
                setWhId(v);
                setSelected(null);
              }}
            />
          </div>
          {/* เลือกที่เก็บจากรายการได้ด้วย ไม่ต้องหาช่องบนผังอย่างเดียว
              คลังกับที่เก็บจึงถูกระบุเป็นคู่เสมอเหมือนหน้าจออื่น */}
          <div style={{ minWidth: 240 }}>
            <label className="lbl" htmlFor="loc_bin">ที่เก็บสินค้า</label>
            <LocationSelect
              db={db}
              whId={whId}
              id="loc_bin"
              value={selected || ""}
              includeAll
              allLabel="— ยังไม่เลือกช่อง —"
              onChange={(v) => setSelected(v || null)}
            />
          </div>
          <Badge>{bins.length} ช่องเก็บ</Badge>
          <Badge kind="ok">จัดเก็บแล้ว {num(totalPlaced, 0)}</Badge>
          <Badge kind={totalPlaced === totalStock ? "gray" : "warn"}>
            ยอดคงเหลือ {num(totalStock, 0)}
          </Badge>
        </div>

        {zones.length ? (
          <>
            <div className="warehouse-map">
              {zones.map((z) => (
                <div className="map-zone" key={z.zone}>
                  <div className="map-zone-label">โซน {z.zone}</div>
                  <div className="map-row">
                    {z.items.map((l) => {
                      const qty = inv.binQty(l.id);
                      const kinds = inv.placementsIn(l.id).length;
                      const pct = l.capacity > 0 ? Math.min(100, (qty / l.capacity) * 100) : 0;
                      const k = kindOf(l.kind);
                      return (
                        <button
                          key={l.id}
                          className={"map-bin" + (l.id === selected ? " active" : "")}
                          onClick={() => setSelected(l.id)}
                          title={l.name + " · " + k.name}
                        >
                          <span className="bin-code">{l.code}</span>
                          <span className="bin-kind" style={{ background: k.color }} />
                          <span className="bin-fill">
                            <span style={{ width: pct + "%", background: k.color }} />
                          </span>
                          <span className="bin-qty">{qty > 0 ? num(qty, 0) : "ว่าง"}</span>
                          <span className="bin-items">{kinds > 0 ? kinds + " รายการ" : " "}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="legend" style={{ marginTop: 14 }}>
              {LOCATION_KINDS.map((k) => (
                <span key={k.id}>
                  <i style={{ background: k.color }} />
                  {k.name}
                </span>
              ))}
            </div>
          </>
        ) : (
          <Empty>คลังนี้ยังไม่มีช่องเก็บ — กด “เพิ่มช่องเก็บ” เพื่อสร้างผัง</Empty>
        )}
      </Card>

      {bin ? (
        <BinPanel
          bin={bin}
          onClose={() => setSelected(null)}
          onEdit={() => setEditing({ location: bin })}
          busy={busy}
          setBusy={setBusy}
        />
      ) : null}

      <Card
        title="สินค้าที่ยังไม่ได้ระบุตำแหน่งครบ"
        actions={<Badge kind={unplaced.length ? "warn" : "ok"}>{unplaced.length} รายการ</Badge>}
      >
        {unplaced.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>รายการสินค้า</th>
                <th className="num">คงเหลือในคลัง</th>
                <th className="num">ระบุตำแหน่งแล้ว</th>
                <th className="num">ยังไม่ระบุ</th>
              </tr>
            </thead>
            <tbody>
              {unplaced.map((x) => (
                <tr key={x.p.id}>
                  <td className="code-cell">{x.p.code}</td>
                  <td>{x.p.name}</td>
                  <td className="num">{num(x.stock, 0)}</td>
                  <td className="num">{num(x.placed, 0)}</td>
                  <td className="num">
                    <b style={{ color: "var(--warn)" }}>{num(x.stock - x.placed, 0)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>สินค้าทุกรายการในคลังนี้ถูกระบุตำแหน่งครบแล้ว</Empty>
        )}
        {unplaced.length ? (
          <div className="hint" style={{ marginTop: 12 }}>
            รายการที่ค้างมักมาจากข้อมูลเก่าที่บันทึกไว้ก่อนระบบจะบังคับให้ระบุที่เก็บ
            กด “ซ่อมผังให้ตรงกับรายการ” ด้านบนเพื่อคำนวณใหม่ หรือจัดวางเองโดยเลือกช่องเก็บจากผัง
          </div>
        ) : null}
      </Card>

      {editing ? (
        <LocationForm
          location={editing.location}
          whId={whId}
          onClose={() => setEditing(null)}
          onDeleted={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------- แผงจัดการสินค้าในช่องเก็บ */

function BinPanel({ bin, onClose, onEdit, busy, setBusy }) {
  const inv = useInv();
  const { db } = inv;
  const toast = useToast();

  const items = inv.placementsIn(bin.id);
  const qty = inv.binQty(bin.id);
  const k = kindOf(bin.kind);

  const [productId, setProductId] = useState(db.products[0] ? db.products[0].id : "");
  const [addQty, setAddQty] = useState("");

  const stockHere = inv.stockOf(productId, bin.whId);
  const placedHere = inv.placedQty(productId, bin.whId);
  const room = Math.max(0, stockHere - placedHere);

  async function addItem() {
    const n = parseFloat(addQty);
    if (!(n > 0)) return toast("กรุณาระบุจำนวนให้มากกว่า 0", "err");

    const existing = items.find((pl) => pl.productId === productId);
    const alreadyHere = existing ? existing.qty : 0;

    if (n > room + alreadyHere) {
      return toast(
        "จำนวนเกินยอดคงเหลือในคลัง — วางได้อีกไม่เกิน " + num(room + alreadyHere, 0),
        "err"
      );
    }
    if (bin.capacity > 0 && qty - alreadyHere + n > bin.capacity) {
      return toast("เกินความจุของช่องเก็บ (" + num(bin.capacity, 0) + ")", "err");
    }

    setBusy(true);
    try {
      await inv.savePlacement({
        id: existing ? existing.id : uid(),
        productId,
        locationId: bin.id,
        qty: n,
        note: "",
      });
      setAddQty("");
      toast(existing ? "แก้ไขจำนวนเรียบร้อย" : "วางสินค้าลงช่อง " + bin.code + " แล้ว");
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(pl) {
    if (!window.confirm("ถอด " + inv.prodName(pl.productId) + " ออกจากช่อง " + bin.code + " ?")) return;
    setBusy(true);
    try {
      await inv.removePlacement(pl.id);
      toast("ถอดสินค้าออกจากช่องแล้ว");
    } catch (e) {
      toast("ถอดไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={
        inv.whName(bin.whId) + " · ช่องเก็บ " + bin.code + (bin.name ? " — " + bin.name : "")
      }
      actions={
        <>
          <Badge kind="info">{k.name}</Badge>
          {bin.capacity > 0 ? (
            <Badge>
              {num(qty, 0)} / {num(bin.capacity, 0)}
            </Badge>
          ) : (
            <Badge>{num(qty, 0)} หน่วย</Badge>
          )}
          <button className="btn btn-o btn-sm" onClick={onEdit}>
            แก้ไขช่อง
          </button>
          <button className="btn btn-g btn-sm" onClick={onClose}>
            ปิด
          </button>
        </>
      }
    >
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div className="field span2">
          <label className="lbl" htmlFor="bin_prod">สินค้าที่จะวางในช่องนี้</label>
          <ProductSelect db={db} id="bin_prod" value={productId} onChange={setProductId} />
        </div>
        <div className="field">
          <label className="lbl" htmlFor="bin_qty">จำนวน</label>
          <QtyInput
            id="bin_qty"
            value={addQty}
            onChange={setAddQty}
            disabled={busy}
            ariaLabel="จำนวนที่จะวางในช่องนี้"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
          />
        </div>
        <div className="field">
          <label className="lbl">วางได้อีก</label>
          <input className="inp num" readOnly value={num(room, 0)} />
        </div>
        <div className="field span2" style={{ display: "flex", alignItems: "flex-end" }}>
          <button className="btn btn-o" onClick={addItem} disabled={busy} style={{ width: "100%" }}>
            <IcPin size={15} />
            วางลงช่องนี้
          </button>
        </div>
      </div>

      {items.length ? (
        <TableWrap>
          <thead>
            <tr>
              <th>รหัส</th>
              <th>รายการสินค้า</th>
              <th>หน่วย</th>
              <th className="num">จำนวนที่วาง</th>
              <th style={{ width: 52 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((pl) => {
              const p = inv.prod(pl.productId);
              return (
                <tr key={pl.id}>
                  <td className="code-cell">{p ? p.code : ""}</td>
                  <td>{inv.prodName(pl.productId)}</td>
                  <td>{p ? p.unit : ""}</td>
                  <td className="num">
                    <b>{num(pl.qty, 0)}</b>
                  </td>
                  <td>
                    <button
                      className="btn btn-d btn-icon"
                      onClick={() => removeItem(pl)}
                      disabled={busy}
                      title="ถอดออกจากช่อง"
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
        <Empty>ช่องนี้ยังว่าง — เลือกสินค้าด้านบนแล้วกด “วางลงช่องนี้”</Empty>
      )}
    </Card>
  );
}

/* ----------------------------------------------- ฟอร์มเพิ่ม/แก้ไขช่องเก็บ */

function LocationForm({ location, whId, onClose, onDeleted }) {
  const inv = useInv();
  const { db } = inv;
  const toast = useToast();
  const isNew = !location;

  const [form, setForm] = useState(() =>
    location
      ? { ...location }
      : {
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
        }
  );
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    const code = String(form.code).trim();
    if (!code) return toast("กรุณาระบุรหัสช่องเก็บ", "err");

    const dup = db.locations.some(
      (l) => l.whId === form.whId && l.code.toLowerCase() === code.toLowerCase() && l.id !== form.id
    );
    if (dup) return toast("รหัสช่องเก็บนี้ถูกใช้แล้วในคลังนี้", "err");

    setBusy(true);
    try {
      await inv.saveLocation({
        ...form,
        code,
        name: String(form.name).trim(),
        zone: String(form.zone).trim().toUpperCase() || "A",
        row: parseInt(form.row, 10) || 1,
        col: parseInt(form.col, 10) || 1,
        capacity: parseFloat(form.capacity) || 0,
        note: String(form.note).trim(),
      });
      toast(isNew ? "เพิ่มช่องเก็บเรียบร้อย" : "บันทึกการแก้ไขเรียบร้อย");
      onClose();
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const n = inv.placementsIn(form.id).length;
    const msg = n
      ? "ช่องนี้มีสินค้าวางอยู่ " + n + " รายการ หากลบ ข้อมูลการจัดวางจะหายไปด้วย\n\nยืนยันการลบ?"
      : "ยืนยันการลบช่องเก็บ " + form.code + " ?";
    if (!window.confirm(msg)) return;

    setBusy(true);
    try {
      await inv.removeLocation(form.id);
      toast("ลบช่องเก็บเรียบร้อย");
      onDeleted();
      onClose();
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isNew ? "เพิ่มช่องเก็บ" : "แก้ไขช่องเก็บ " + form.code}
      onClose={onClose}
      maxWidth={620}
      footer={
        <>
          {!isNew ? (
            <button className="btn btn-d" onClick={remove} disabled={busy}>
              ลบช่องเก็บ
            </button>
          ) : null}
          <button className="btn btn-p" onClick={save} disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </>
      }
    >
      <div className="form-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
        <div className="field">
          <label className="lbl" htmlFor="lf_code">รหัสช่องเก็บ</label>
          <input
            className="inp"
            id="lf_code"
            value={form.code}
            onChange={(e) => set("code", e.target.value)}
            placeholder="เช่น A-01"
          />
        </div>
        <div className="field">
          <label className="lbl" htmlFor="lf_zone">โซน (แถวบนผัง)</label>
          <input
            className="inp"
            id="lf_zone"
            value={form.zone}
            onChange={(e) => set("zone", e.target.value)}
            placeholder="A"
            maxLength={4}
          />
        </div>
        <div className="field span2">
          <label className="lbl" htmlFor="lf_name">ชื่อเรียก</label>
          <input
            className="inp"
            id="lf_name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="เช่น ชั้นวาง A ช่อง 1"
          />
        </div>
        <div className="field">
          <label className="lbl" htmlFor="lf_col">ลำดับในโซน</label>
          <QtyInput
            id="lf_col"
            value={form.col}
            onChange={(v) => set("col", v)}
            min={1}
            ariaLabel="ลำดับในโซน"
          />
        </div>
        <div className="field">
          <label className="lbl" htmlFor="lf_kind">ประเภทช่องเก็บ</label>
          <select
            className="sel"
            id="lf_kind"
            value={form.kind}
            onChange={(e) => set("kind", e.target.value)}
          >
            {LOCATION_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field span2">
          <label className="lbl" htmlFor="lf_cap">ความจุ (0 = ไม่จำกัด)</label>
          <QtyInput
            id="lf_cap"
            value={form.capacity}
            onChange={(v) => set("capacity", v)}
            step={100}
            ariaLabel="ความจุของช่องเก็บ"
          />
        </div>
        <div className="field span2">
          <label className="lbl" htmlFor="lf_note">หมายเหตุ</label>
          <input
            className="inp"
            id="lf_note"
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
