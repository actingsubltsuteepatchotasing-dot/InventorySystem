"use client";

// หน้าจอรายละเอียดลูกค้า — ทะเบียนลูกค้าพร้อมที่อยู่แบบแยกช่อง
//
// ที่อยู่แยกเป็น ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์ คนละคอลัมน์
// เพราะต้องเอาไปกรองและออกรายงานรายจังหวัด ถ้าเก็บรวมเป็นก้อนเดียวจะแยกไม่ออกทีหลัง
//
// จังหวัด/อำเภอ/ตำบล เลือกจากรายการเขตปกครองจริง (lib/thaiAddress.js)
// เลือกไล่ลงมาทีละชั้น และรหัสไปรษณีย์เติมให้เองจากตำบลที่เลือก
// พิมพ์เองไม่ได้ เพราะรหัสที่ไม่ตรงกับตำบลคือที่อยู่ที่ส่งของไม่ถึง

import { useEffect, useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { BRANCH_KINDS } from "@/lib/constants";
import { filterValues, optionsFor } from "@/lib/customerKinds";
import { nextCustCode, posCustomerOf } from "@/lib/db";
import { uid } from "@/lib/format";
import { useToast } from "../Toast";
import { IcPlus, IcTrash } from "../Icons";
import Modal from "../Modal";
import { Badge, Card, Empty, SearchSelect, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";

const blank = (code) => ({
  id: uid(),
  code,
  name: "",
  address: "",
  subdistrict: "",
  district: "",
  province: "",
  postcode: "",
  phone: "",
  // ลูกค้าใหม่ยังไม่ระบุประเภท ให้คนเลือกเองจากทะเบียน
  // เดิมตั้งค่าตั้งต้นเป็นค่าแรกของรายการคงที่ ซึ่งทำให้ลูกค้าจำนวนมาก
  // ถูกบันทึกเป็น "ลูกค้าทั่วไป" ทั้งที่ไม่มีใครตั้งใจเลือก แล้วรายงานแยกตามประเภทก็ไร้ความหมาย
  kind: "",
  taxId: "",
  branch: "",
  // ลูกค้าใหม่ไม่ได้เป็นค่าเริ่มต้นของหน้าขายสินค้า (POS) จนกว่าจะกดตั้งเอง
  posDefault: false,
});

export default function Customers() {
  const inv = useInv();

  // สิทธิของหน้าจอนี้ — ไม่ติ๊ก "แก้ไข" แล้วปุ่มที่เขียนข้อมูลถูกปิด ดูได้อย่างเดียว
  const perm = inv.perm("customers");
  const { db } = inv;
  const toast = useToast();

  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  /*
   * ตารางเขตปกครองไทยมี 7,452 ตำบล ไฟล์จึงใหญ่ (~200 KB)
   * โหลดแบบ dynamic เฉพาะตอนเปิดหน้านี้ ไม่ให้ติดไปกับทุกหน้าจอ
   * โหลดไม่สำเร็จ (เน็ตหลุดกลางทาง) ให้ตกกลับไปพิมพ์เองได้ ดีกว่ากรอกที่อยู่ไม่ได้เลย
   */
  const [addr, setAddr] = useState(null);

  useEffect(() => {
    let alive = true;
    import("@/lib/thaiAddress")
      .then((m) => alive && setAddr(m))
      .catch(() => alive && setAddr(false));
    return () => {
      alive = false;
    };
  }, []);

  const all = db.customers || [];

  /** รายที่ถูกตั้งเป็นลูกค้าเริ่มต้นของหน้าขายสินค้า (POS) อยู่ตอนนี้ */
  const posDefault = posCustomerOf(db);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((c) => {
      if (kind && c.kind !== kind) return false;
      if (!s) return true;
      // ค้นได้ทั้งรหัส ชื่อ เบอร์โทร และที่อยู่ทุกส่วน เพราะคนจำคนละอย่างกัน
      return [c.code, c.name, c.phone, c.address, c.subdistrict, c.district, c.province, c.postcode]
        .join(" ")
        .toLowerCase()
        .includes(s);
    });
  }, [all, q, kind]);

  const isNew = form ? !all.some((c) => c.id === form.id) : false;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  /* ------------------------------------------- ที่อยู่ตามเขตปกครองจริง */

  // กรุงเทพฯ เรียก เขต/แขวง จังหวัดอื่นเรียก อำเภอ/ตำบล ป้ายต้องเปลี่ยนตาม
  const words = addr && form ? addr.addressWords(form.province) : null;
  const provinceList = addr ? addr.provinces() : [];
  const districtList = addr && form ? addr.districtsOf(form.province) : [];
  const subList = addr && form ? addr.subdistrictsOf(form.province, form.district) : [];

  /** รหัสไปรษณีย์ที่ตรงกับตำบลที่เลือก — "" คือเลือกยังไม่ครบ หรือเป็นชื่อที่ไม่รู้จัก */
  const autoPost =
    addr && form ? addr.postcodeOf(form.province, form.district, form.subdistrict) : "";

  /*
   * ค่าเดิมที่ไม่มีในรายการ (นำเข้าไฟล์สำรองเก่า หรือชื่อเขตถูกเปลี่ยนภายหลัง)
   * ต้องใส่กลับเข้าไปในตัวเลือกด้วย ไม่งั้นแค่เปิดฟอร์มมาแก้เบอร์โทร
   * ที่อยู่เดิมก็หายไปเงียบ ๆ ตอนกดบันทึก
   */
  const withCurrent = (list, v) => (v && !list.includes(v) ? [v, ...list] : list);

  /*
   * ตำบลถูกแต่รหัสไปรษณีย์ผิด = ข้อมูลเก่าที่กรอกมือไว้ แก้ให้ตรงตั้งแต่เปิดฟอร์ม
   * ไม่รอให้ผู้ใช้ไปแตะตำบลก่อน เพราะเขาไม่มีทางรู้ว่ารหัสเดิมผิด
   */
  useEffect(() => {
    if (!autoPost) return;
    setForm((f) => (f && f.postcode !== autoPost ? { ...f, postcode: autoPost } : f));
  }, [autoPost]);

  // เลือกชั้นบนแล้วต้องล้างชั้นล่างเสมอ ไม่งั้นจะเหลืออำเภอของจังหวัดเดิมค้างอยู่
  const pickProvince = (v) =>
    setForm((f) => ({ ...f, province: v, district: "", subdistrict: "", postcode: "" }));
  const pickDistrict = (v) =>
    setForm((f) => ({ ...f, district: v, subdistrict: "", postcode: "" }));
  const pickSub = (v) =>
    setForm((f) => ({
      ...f,
      subdistrict: v,
      postcode: addr ? addr.postcodeOf(f.province, f.district, v) : f.postcode,
    }));

  async function save() {
    if (busy) return;
    const code = String(form.code || "").trim().toUpperCase();
    const name = String(form.name || "").trim();

    if (!code) return toast("กรุณากรอกรหัสลูกค้า", "err");
    if (!name) return toast("กรุณากรอกชื่อลูกค้า", "err");

    // รหัสลูกค้าเป็นตัวที่คนใช้อ้างถึงกันในเอกสาร ฐานข้อมูลก็มี unique index กันไว้
    // แต่ตรวจตรงนี้ก่อนเพื่อให้ข้อความบอกได้ว่าซ้ำกับใคร
    const dup = all.find((c) => c.id !== form.id && c.code.toUpperCase() === code);
    if (dup) return toast("รหัสลูกค้า " + code + " ถูกใช้โดย " + dup.name + " แล้ว", "err");

    const postcode = String(form.postcode || "").trim();
    if (postcode && !/^\d{5}$/.test(postcode)) return toast("รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก", "err");

    // เลขผู้เสียภาษีไทยมี 13 หลักเสมอ เว้นว่างได้ (ลูกค้าทั่วไป) แต่กรอกแล้วต้องครบ
    // ใบกำกับภาษีที่เลขไม่ครบใช้ไม่ได้ และกว่าจะรู้ก็ตอนลูกค้าตีเอกสารกลับ
    const taxId = String(form.taxId || "").replace(/\D/g, "");
    if (taxId && taxId.length !== 13) {
      return toast("เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก", "err");
    }

    setBusy(true);
    try {
      await inv.saveCustomer({
        id: form.id,
        code,
        name,
        address: String(form.address || "").trim(),
        subdistrict: String(form.subdistrict || "").trim(),
        district: String(form.district || "").trim(),
        province: String(form.province || "").trim(),
        postcode,
        phone: String(form.phone || "").trim(),
        kind: form.kind || "",
        taxId,
        branch: String(form.branch || "").trim(),
        salesId: form.salesId || "",
        // ตั้งเป็นค่าเริ่มต้นของหน้า POS ได้ทีละรายเดียว รายอื่นถูกปลดให้เองตอนบันทึก
        posDefault: !!form.posDefault,
      });
      toast("บันทึกลูกค้า " + name + " แล้ว", "ok");
      setForm(null);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove(c) {
    if (busy) return;
    if (!window.confirm("ยืนยันการลบลูกค้า " + c.name + " ?")) return;
    setBusy(true);
    try {
      await inv.removeCustomer(c.id);
      toast("ลบลูกค้า " + c.name + " แล้ว", "ok");
    } catch (e) {
      toast("ลบไม่สำเร็จ: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (!inv.customersReady) {
    return <SetupNotice feature="หน้าจอรายละเอียดลูกค้า" tables={["customers"]} />;
  }

  return (
    <div className="stack">
      <Card
        title="รายละเอียดลูกค้า"
        actions={
          <>
            <Badge kind="info">
              {rows.length === all.length
                ? all.length + " ราย"
                : rows.length + " จาก " + all.length + " ราย"}
            </Badge>
            <button
              className="btn btn-p btn-sm"
              onClick={() => setForm(blank(nextCustCode(db)))}
              disabled={!perm.edit}
            >
              <IcPlus size={15} />
              เพิ่มลูกค้า
            </button>
          </>
        }
      >
        <div className="row" style={{ marginBottom: 12 }}>
          <input
            className="inp"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา รหัส ชื่อ เบอร์โทร หรือที่อยู่…"
            aria-label="ค้นหาลูกค้า"
            style={{ maxWidth: 320 }}
          />
          <select
            className="sel"
            style={{ maxWidth: 210 }}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            aria-label="กรองตามประเภทลูกค้า"
          >
            <option value="">ทุกประเภท</option>
            {filterValues(db).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </div>

        {rows.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 90 }}>รหัสลูกค้า</th>
                <th style={{ minWidth: 200 }}>ชื่อลูกค้า</th>
                <th style={{ minWidth: 200 }}>ที่อยู่</th>
                <th style={{ minWidth: 130 }}>ตำบล / แขวง</th>
                <th style={{ minWidth: 130 }}>อำเภอ / เขต</th>
                <th style={{ minWidth: 140 }}>จังหวัด</th>
                <th style={{ width: 110 }}>รหัสไปรษณีย์</th>
                <th style={{ minWidth: 130 }}>เลขผู้เสียภาษี</th>
                <th style={{ minWidth: 130 }}>เบอร์โทร</th>
                <th style={{ minWidth: 140 }}>ประเภทลูกค้า</th>
                <th style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <code>{c.code}</code>
                  </td>
                  <td>
                    <b>{c.name}</b>
                    {/* เห็นได้จากตารางเลยว่ารายไหนเป็นค่าเริ่มต้นของหน้า POS
                        ไม่ต้องเปิดทีละรายไปหา */}
                    {c.posDefault ? (
                      <>
                        {" "}
                        <Badge kind="ok">ค่าเริ่มต้น POS</Badge>
                      </>
                    ) : null}
                  </td>
                  <td>{c.address || "—"}</td>
                  <td>{c.subdistrict || "—"}</td>
                  <td>{c.district || "—"}</td>
                  <td>{c.province || "—"}</td>
                  <td>{c.postcode || "—"}</td>
                  <td>{c.taxId || "—"}</td>
                  <td>{c.phone || "—"}</td>
                  <td>{c.kind || "—"}</td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <button className="btn btn-o btn-sm" onClick={() => setForm({ ...c })}>
                        แก้ไข
                      </button>
                      <button
                        className="btn btn-d btn-icon"
                        onClick={() => remove(c)}
                        disabled={busy || !perm.edit}
                        title="ลบลูกค้า"
                      >
                        <IcTrash size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Empty>
            {all.length ? "ไม่พบลูกค้าที่ตรงกับที่ค้นหา" : "ยังไม่มีข้อมูลลูกค้า กดปุ่ม “เพิ่มลูกค้า” เพื่อเริ่มต้น"}
          </Empty>
        )}
      </Card>

      {form ? (
        <Modal
          title={isNew ? "เพิ่มลูกค้า" : "แก้ไขลูกค้า " + form.code}
          onClose={() => setForm(null)}
          maxWidth={720}
          footer={
            <>
              <button className="btn btn-g" onClick={() => setForm(null)} disabled={busy}>
                ยกเลิก
              </button>
              <button className="btn btn-p" onClick={save} disabled={busy || !perm.edit}>
                บันทึก
              </button>
            </>
          }
        >
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
            <div className="field">
              <label className="lbl" htmlFor="cf_code">รหัสลูกค้า</label>
              <input
                className="inp"
                id="cf_code"
                value={form.code}
                maxLength={20}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="cf_sales">พนักงานขายประจำ</label>
              {/* ตั้งไว้แล้วหน้าขายจะเติมให้เองตอนเลือกลูกค้ารายนี้ */}
              <SearchSelect
                id="cf_sales"
                value={form.salesId || ""}
                onChange={(v) => set("salesId", v)}
                options={(db.salespersons || [])
                  .filter((p) => p.active)
                  .map((p) => ({ value: p.id, code: p.code, label: p.name }))}
                emptyLabel="— ไม่ระบุ —"
                notFound="ไม่พบพนักงานขายที่ตรงกับ"
              />
            </div>

            <div className="field">
              <label className="lbl" htmlFor="cf_kind">ประเภทลูกค้า</label>
              {/* รายการมาจากทะเบียนที่ตั้งไว้ที่หน้า "กำหนดประเภทลูกค้า"
                  บวกค่าที่ลูกค้ารายอื่นใช้อยู่แล้วแต่ยังไม่ได้จดทะเบียน
                  ค่าที่ลูกค้ารายนี้ใช้อยู่จะอยู่ในรายการเสมอ แม้ถูกลบจากทะเบียนไปแล้ว */}
              <SearchSelect
                id="cf_kind"
                value={form.kind}
                onChange={(v) => set("kind", v)}
                options={optionsFor(db, form.kind)}
                emptyLabel="— ไม่ระบุประเภท —"
                notFound="ไม่พบประเภทลูกค้าที่ตรงกับ"
                disabled={!perm.edit}
              />
              <span className="hint">
                ตั้งรหัสและชื่อประเภทได้ที่เมนู <b>กำหนดประเภทลูกค้า</b>
              </span>
            </div>

            <div className="field span2">
              <label className="lbl" htmlFor="cf_name">ชื่อลูกค้า</label>
              <input
                className="inp"
                id="cf_name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="ชื่อบุคคล ร้านค้า หรือหน่วยงาน"
              />
            </div>

            <div className="field span2">
              <label className="lbl" htmlFor="cf_addr">ที่อยู่ (บ้านเลขที่ หมู่ ถนน)</label>
              <input
                className="inp"
                id="cf_addr"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="เช่น 128/4 หมู่ 3 ถนนบางขุนนนท์"
              />
            </div>

            {addr ? (
              <>
                {/* เลือกไล่ลงมา: จังหวัด -> อำเภอ/เขต -> ตำบล/แขวง -> รหัสไปรษณีย์เติมให้เอง */}
                <div className="field">
                  <label className="lbl" htmlFor="cf_prov">จังหวัด</label>
                  <SearchSelect
                    id="cf_prov"
                    value={form.province}
                    onChange={pickProvince}
                    options={withCurrent(provinceList, form.province).map((v) => ({
                      value: v,
                      label: v,
                    }))}
                    placeholder="— เลือกจังหวัด —"
                    notFound="ไม่พบจังหวัดที่ตรงกับ"
                  />
                </div>

                <div className="field">
                  <label className="lbl" htmlFor="cf_dis">{words.district}</label>
                  <SearchSelect
                    id="cf_dis"
                    value={form.district}
                    onChange={pickDistrict}
                    disabled={!form.province}
                    options={withCurrent(districtList, form.district).map((v) => ({
                      value: v,
                      label: v,
                    }))}
                    placeholder={
                      form.province ? "— เลือก" + words.district + " —" : "เลือกจังหวัดก่อน"
                    }
                    notFound={"ไม่พบ" + words.district + "ที่ตรงกับ"}
                  />
                </div>

                <div className="field">
                  <label className="lbl" htmlFor="cf_sub">{words.subdistrict}</label>
                  <SearchSelect
                    id="cf_sub"
                    value={form.subdistrict}
                    onChange={pickSub}
                    disabled={!form.district}
                    options={withCurrent(subList, form.subdistrict).map((v) => ({
                      value: v,
                      label: v,
                    }))}
                    placeholder={
                      form.district
                        ? "— เลือก" + words.subdistrict + " —"
                        : "เลือก" + words.district + "ก่อน"
                    }
                    notFound={"ไม่พบ" + words.subdistrict + "ที่ตรงกับ"}
                  />
                </div>

                <div className="field">
                  <label className="lbl" htmlFor="cf_post">รหัสไปรษณีย์</label>
                  {autoPost ? (
                    /* ตรงกับตำบลที่เลือกแล้ว แก้เองไม่ได้ รหัสที่ไม่ตรงคือของส่งไม่ถึง */
                    <input className="inp" id="cf_post" value={form.postcode} readOnly />
                  ) : (
                    <input
                      className="inp"
                      id="cf_post"
                      value={form.postcode}
                      inputMode="numeric"
                      maxLength={5}
                      placeholder={form.subdistrict ? "" : "เลือก" + words.subdistrict + "แล้วเติมให้เอง"}
                      onChange={(e) => set("postcode", e.target.value.replace(/\D/g, ""))}
                    />
                  )}
                </div>
              </>
            ) : (
              <>
                {/* โหลดตารางเขตปกครองไม่ได้ ให้พิมพ์เองไปก่อน ดีกว่ากรอกที่อยู่ไม่ได้เลย */}
                <div className="field">
                  <label className="lbl" htmlFor="cf_prov">จังหวัด</label>
                  <input
                    className="inp"
                    id="cf_prov"
                    value={form.province}
                    onChange={(e) => set("province", e.target.value)}
                    placeholder={addr === false ? "" : "กำลังโหลดรายชื่อจังหวัด…"}
                  />
                </div>
                <div className="field">
                  <label className="lbl" htmlFor="cf_dis">อำเภอ / เขต</label>
                  <input
                    className="inp"
                    id="cf_dis"
                    value={form.district}
                    onChange={(e) => set("district", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="lbl" htmlFor="cf_sub">ตำบล / แขวง</label>
                  <input
                    className="inp"
                    id="cf_sub"
                    value={form.subdistrict}
                    onChange={(e) => set("subdistrict", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="lbl" htmlFor="cf_post">รหัสไปรษณีย์</label>
                  <input
                    className="inp"
                    id="cf_post"
                    value={form.postcode}
                    inputMode="numeric"
                    maxLength={5}
                    onChange={(e) => set("postcode", e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </>
            )}
            <div className="field">
              <label className="lbl" htmlFor="cf_tax">เลขประจำตัวผู้เสียภาษี (13 หลัก)</label>
              <input
                className="inp"
                id="cf_tax"
                value={form.taxId || ""}
                inputMode="numeric"
                maxLength={13}
                onChange={(e) => set("taxId", e.target.value.replace(/\D/g, ""))}
                placeholder="ลูกค้าทั่วไปเว้นว่างได้"
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="cf_branch">สำนักงานใหญ่ / สาขา</label>
              <input
                className="inp"
                id="cf_branch"
                list="cf_branch_list"
                value={form.branch || ""}
                onChange={(e) => set("branch", e.target.value)}
                placeholder="เช่น สำนักงานใหญ่ หรือ สาขาที่ 00002"
              />
              {/* พิมพ์เลขสาขาเองก็ได้ รายการนี้เป็นแค่ตัวช่วยกรอกที่พบบ่อย */}
              <datalist id="cf_branch_list">
                {BRANCH_KINDS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            <div className="field span2">
              <label className="lbl" htmlFor="cf_phone">เบอร์โทร</label>
              <input
                className="inp"
                id="cf_phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="เช่น 081-234-5678"
              />
            </div>

            {/* ลูกค้าเริ่มต้นของหน้าขายสินค้า (POS)
                ติ๊กไว้ที่รายไหน หน้า POS จะเลือกรายนั้นให้เองทุกบิล ไม่ต้องเลือกซ้ำทั้งวัน
                มีผลหลังกดบันทึก เหมือนช่องอื่นในฟอร์มนี้ ไม่ใช่กดแล้วเปลี่ยนทันที
                ซึ่งจะกลายเป็นปุ่มเดียวในหน้าที่ไม่ต้องบันทึก และคนกดยกเลิกจะงงว่าทำไมยังเปลี่ยน */}
            <div className="field span2">
              <label className="lbl">ค่าเริ่มต้นของหน้าขายสินค้า (POS)</label>
              <div className="row" style={{ gap: 10 }}>
                <button
                  type="button"
                  className={form.posDefault ? "btn btn-p btn-sm" : "btn btn-o btn-sm"}
                  onClick={() => set("posDefault", !form.posDefault)}
                  disabled={!perm.edit}
                  aria-pressed={form.posDefault ? "true" : "false"}
                >
                  {form.posDefault
                    ? "เป็นลูกค้าเริ่มต้นของหน้า POS"
                    : "ตั้งเป็นลูกค้าเริ่มต้นของหน้า POS"}
                </button>
                {form.posDefault && posDefault && posDefault.id !== form.id ? (
                  <span className="hint">
                    บันทึกแล้วจะแทนที่ <b>{posDefault.code} · {posDefault.name}</b> ที่ตั้งไว้เดิม
                  </span>
                ) : (
                  <span className="hint">
                    {form.posDefault
                      ? "กดอีกครั้งเพื่อเลิกเป็นค่าเริ่มต้น แล้วหน้า POS จะกลับไปเริ่มที่ลูกค้าทั่วไป"
                      : "ตั้งได้ทีละรายเดียว หน้า POS จะเลือกรายนี้ให้เองทุกบิล"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
