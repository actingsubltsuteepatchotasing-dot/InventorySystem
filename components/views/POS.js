"use client";

// หน้าจอขายสินค้าแบบ POS
// เพิ่มสินค้าได้ 3 ทาง: ยิงบาร์โค๊ด / คีย์รหัสเอง / กดเลือกจากการ์ดสินค้า
// บันทึกแล้วตัดสต็อกทันที และพิมพ์ใบเสร็จรับเงินได้

import { useEffect, useMemo, useRef, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { PAY_METHODS, VAT_RATE } from "@/lib/constants";
import { bestBinFor, findByScan, firstLocOf, nextDocNo, saleTotals } from "@/lib/db";
import { resizeImage } from "@/lib/image";
import { num, thDate, todayISO, uid } from "@/lib/format";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { IcBox, IcPlus, IcPrint, IcTrash } from "../Icons";
import { Badge, Card, Empty, LocationSelect, TableWrap, WhLocFields } from "../ui";
import { ReceiptBody } from "./printBodies";
import SetupNotice from "../SetupNotice";

/* ------------------------------------------- ความกว้างแผงบิลที่ลากปรับได้ */

const BILL_MIN = 320;
const BILL_MAX = 760;
const BILL_DEFAULT = 430;
/** เหลือพื้นที่ให้แคตตาล็อกสินค้าอย่างน้อยเท่านี้ ไม่งั้นการ์ดสินค้าจะบีบจนอ่านไม่ออก */
const CATALOG_MIN = 360;
const BILL_KEY = "raot-pos-bill-width";

const clampBill = (n, max = BILL_MAX) =>
  Math.round(Math.max(BILL_MIN, Math.min(max, n)));

export default function POS() {
  const inv = useInv();
  const { db } = inv;
  const { user } = useAuth();
  const toast = useToast();
  const print = usePrint();

  const scanRef = useRef(null);
  const imgRef = useRef(null);
  const imgTargetRef = useRef(null);

  const [whId, setWhId] = useState(db.warehouses[0] ? db.warehouses[0].id : "");
  const [locId, setLocId] = useState(() =>
    db.warehouses[0] ? firstLocOf(db, db.warehouses[0].id) : ""
  );
  const [scan, setScan] = useState("");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState([]);
  const [customer, setCustomer] = useState("");
  const [discount, setDiscount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [paid, setPaid] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [billWidth, setBillWidth] = useState(BILL_DEFAULT);

  // อ่านค่าที่เคยปรับไว้หลัง mount เท่านั้น
  // แตะ localStorage ตอน render จะพังตอน server render
  useEffect(() => {
    try {
      const saved = parseInt(window.localStorage.getItem(BILL_KEY), 10);
      if (Number.isFinite(saved)) setBillWidth(clampBill(saved));
    } catch (e) {
      // โหมดส่วนตัวหรือเบราว์เซอร์ที่ปิด storage — ใช้ค่าเริ่มต้นไป
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(BILL_KEY, String(billWidth));
    } catch (e) {
      // เก็บไม่ได้ก็ไม่เป็นไร แค่จำค่าข้ามครั้งไม่ได้
    }
  }, [billWidth]);

  const cashierName = user && user.email ? user.email : "";
  const totals = saleTotals(lines, discount, VAT_RATE);
  const paidNum = parseFloat(paid);
  const change = Number.isFinite(paidNum) ? paidNum - totals.total : 0;
  const docNo = nextDocNo(db, "SALE", todayISO());

  // โฟกัสช่องยิงบาร์โค๊ดไว้เสมอ เครื่องสแกนจะพิมพ์เข้าช่องนี้ได้ทันที
  useEffect(() => {
    if (scanRef.current) scanRef.current.focus();
  }, [whId]);

  // เปลี่ยนคลังเมื่อไร ต้องล้างบิล เพราะทุกบรรทัดผูกกับช่องเก็บของคลังเดิม
  // ถ้าปล่อยไว้จะได้บิลที่หยิบของจากช่องของคนละคลัง
  useEffect(() => {
    setLines([]);
  }, [whId]);

  const catalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.products
      .filter((p) => !q || (p.name + p.code + p.barcode + p.cat).toLowerCase().includes(q))
      .slice(0, 60);
  }, [db.products, search]);

  /* ------------------------------------------------------- ตะกร้า */

  function addProduct(p, qty = 1) {
    if (!p) return;

    const errWh = inv.checkWhLoc(whId, locId, "คลังที่ขาย");
    if (errWh) return toast(errWh, "err");

    // หยิบจากช่องที่มีของรายการนี้มากที่สุด ถ้าไม่มีเลยก็ใช้ช่องเริ่มต้นของบิล
    const bin = bestBinFor(db, p.id, whId) || locId;
    const inBin = inv.placedIn(p.id, bin);
    const inCart = lines
      .filter((l) => l.productId === p.id && l.locId === bin)
      .reduce((s, l) => s + l.qty, 0);

    if (inCart + qty > inBin) {
      toast(
        "ของในช่อง " + inv.locName(bin) + " ไม่พอ — " + p.name +
          " มีอยู่ " + num(inBin, 0) + " " + p.unit,
        "err"
      );
      return;
    }

    setLines((prev) => {
      const i = prev.findIndex((l) => l.productId === p.id && l.locId === bin);
      if (i >= 0) {
        return prev.map((l, k) => (k === i ? { ...l, qty: l.qty + qty } : l));
      }
      return [...prev, { key: uid(), productId: p.id, locId: bin, qty, price: p.price }];
    });
    toast("เพิ่ม " + p.name + " จาก " + inv.locName(bin));
  }

  /** ย้ายบรรทัดหนึ่งไปหยิบจากอีกช่องเก็บ */
  function setLineLoc(key, newLoc) {
    const line = lines.find((l) => l.key === key);
    if (!line) return;
    const inBin = inv.placedIn(line.productId, newLoc);
    const otherInCart = lines
      .filter((l) => l.key !== key && l.productId === line.productId && l.locId === newLoc)
      .reduce((s, l) => s + l.qty, 0);

    if (line.qty + otherInCart > inBin) {
      return toast(
        "ของในช่อง " + inv.locName(newLoc) + " มีเพียง " + num(inBin, 0) + " หน่วย",
        "err"
      );
    }
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, locId: newLoc } : l)));
  }

  /** รับค่าจากเครื่องสแกน หรือจากการพิมพ์รหัสเอง แล้วกด Enter */
  function handleScan(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const text = scan.trim();
    if (!text) return;

    const p = findByScan(db, text);
    if (!p) {
      toast("ไม่พบสินค้าที่มีบาร์โค๊ดหรือรหัส “" + text + "”", "err");
    } else {
      addProduct(p, 1);
    }
    setScan("");
  }

  function setQty(key, qty) {
    const n = parseFloat(qty);
    if (!Number.isFinite(n) || n <= 0) return;

    const line = lines.find((l) => l.key === key);
    if (line) {
      const inBin = inv.placedIn(line.productId, line.locId);
      const otherInCart = lines
        .filter((l) => l.key !== key && l.productId === line.productId && l.locId === line.locId)
        .reduce((s, l) => s + l.qty, 0);
      if (n + otherInCart > inBin) {
        return toast(
          "ของในช่อง " + inv.locName(line.locId) + " มีเพียง " + num(inBin, 0) + " หน่วย",
          "err"
        );
      }
    }

    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty: n } : l)));
  }

  function clearAll() {
    setLines([]);
    setCustomer("");
    setDiscount("");
    setPaid("");
    setPayMethod("CASH");
    if (scanRef.current) scanRef.current.focus();
  }

  /* ------------------------------------------------ เพิ่มรูปสินค้าจาก POS */

  async function onPickImage(e) {
    const file = e.target.files[0];
    const productId = imgTargetRef.current;
    e.target.value = "";
    if (!file || !productId) return;

    try {
      const img = await resizeImage(file);
      const p = inv.prod(productId);
      await inv.saveProduct({ ...p, img });
      toast("เพิ่มรูป " + p.name + " แล้ว");
    } catch (err) {
      toast("เพิ่มรูปไม่สำเร็จ: " + err.message, "err");
    }
  }

  /* --------------------------------------------------------- บันทึกบิล */

  async function checkout() {
    if (!lines.length || saving) return;
    const errWh = inv.checkWhLoc(whId, locId, "คลังที่ขาย");
    if (errWh) return toast(errWh, "err");

    if (!Number.isFinite(paidNum) || paidNum < totals.total) {
      return toast("รับเงินไม่ครบ — ต้องรับอย่างน้อย ฿" + num(totals.total, 2), "err");
    }

    // ตรวจของในช่องเก็บอีกครั้งก่อนตัดจริง (ฝั่งฐานข้อมูลตรวจซ้ำอีกชั้น)
    for (const l of lines) {
      const p = inv.prod(l.productId);
      if (!inv.locInWh(l.locId, whId)) {
        return toast("ที่เก็บของ " + (p ? p.name : "") + " ไม่ได้อยู่ในคลังที่ขาย", "err");
      }
      if (l.qty > inv.placedIn(l.productId, l.locId)) {
        return toast(
          "ของในช่อง " + inv.locName(l.locId) + " ไม่พอสำหรับ " + (p ? p.name : ""),
          "err"
        );
      }
    }

    const date = todayISO();
    const ts = Date.now();
    const saleId = uid();

    const sale = {
      id: saleId,
      docNo: nextDocNo(db, "SALE", date),
      date,
      whId,
      locId,
      customer: customer.trim(),
      subtotal: totals.subtotal,
      discount: totals.discount,
      vat: totals.vat,
      total: totals.total,
      paid: paidNum,
      change: Math.round((paidNum - totals.total) * 100) / 100,
      payMethod,
      user: cashierName,
      note: "",
      ts,
    };

    const items = lines.map((l) => ({
      id: uid(),
      txnId: uid(),
      saleId,
      productId: l.productId,
      locId: l.locId,
      qty: l.qty,
      price: l.price,
      amount: Math.round(l.qty * l.price * 100) / 100,
    }));

    setSaving(true);
    try {
      await inv.addSale(sale, items);
      toast("บันทึกการขาย " + sale.docNo + " เรียบร้อย");
      setLastSale({ sale, items });
      clearAll();
      printReceipt(sale, items);
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    } finally {
      setSaving(false);
    }
  }

  function printReceipt(sale, items) {
    print({
      receipt: true,
      title: "ใบเสร็จรับเงิน",
      body: <ReceiptBody inv={inv} sale={sale} items={items} />,
    });
  }

  /* -------------------------------------------------------------- UI */

  if (!inv.salesReady || !inv.locationsReady) {
    return (
      <SetupNotice
        feature="หน้าจอขายสินค้า (POS)"
        tables={["sales", "sale_items", "locations", "product_locations"]}
      />
    );
  }

  return (
    <div className="pos" style={{ "--pos-w": billWidth + "px" }}>
      {/* ---------------- ซ้าย: ค้นหา + แคตตาล็อกสินค้า ---------------- */}
      <div className="pos-left">
        <Card
          title="ขายสินค้า"
          actions={<Badge>เลขที่บิล {docNo}</Badge>}
        >
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
            <WhLocFields
              db={db}
              idPrefix="pos"
              whId={whId}
              locId={locId}
              whLabel="คลังที่ขาย"
              locLabel="ที่เก็บเริ่มต้น"
              onChange={(w, l) => {
                setWhId(w);
                setLocId(l);
              }}
            />
            <div className="field">
              <label className="lbl" htmlFor="pos_cust">ชื่อลูกค้า (ไม่บังคับ)</label>
              <input
                className="inp"
                id="pos_cust"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="ลูกค้าทั่วไป"
              />
            </div>
          </div>

          <div className="scan-box">
            <label className="lbl" htmlFor="pos_scan">
              ยิงบาร์โค๊ด หรือพิมพ์รหัสสินค้า แล้วกด Enter
            </label>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input
                ref={scanRef}
                className="inp scan-input"
                id="pos_scan"
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={handleScan}
                placeholder="8850001000017 หรือ P001"
                autoComplete="off"
              />
              <button
                className="btn btn-o"
                onClick={() => handleScan({ key: "Enter", preventDefault() {} })}
                style={{ whiteSpace: "nowrap" }}
              >
                เพิ่ม
              </button>
            </div>
            <p className="scan-hint">
              เครื่องสแกนบาร์โค๊ดทั่วไปทำงานเหมือนแป้นพิมพ์ — เพียงให้เคอร์เซอร์อยู่ในช่องนี้
              แล้วยิงได้เลย ระบบจะเพิ่มสินค้าลงบิลทันที
            </p>
          </div>
        </Card>

        <Card
          title="เลือกสินค้า"
          actions={<Badge>{catalog.length} รายการ</Badge>}
        >
          <input
            className="inp"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ / รหัส / บาร์โค๊ด…"
            style={{ marginBottom: 14 }}
          />

          {catalog.length ? (
            <div className="pos-grid">
              {catalog.map((p) => {
                const stock = inv.stockOf(p.id, whId);
                return (
                  <div className={"pos-card" + (stock <= 0 ? " out" : "")} key={p.id}>
                    <button
                      className="pos-card-btn"
                      onClick={() => addProduct(p, 1)}
                      disabled={stock <= 0}
                      title={stock <= 0 ? "สินค้าหมดในคลังนี้" : "กดเพื่อเพิ่มลงบิล"}
                    >
                      <span className="pos-ph">
                        {p.img ? (
                          <img src={p.img} alt={p.name} />
                        ) : (
                          <IcBox size={30} stroke={1.5} />
                        )}
                      </span>
                      <span className="pos-nm">{p.name}</span>
                      <span className="pos-meta">
                        {p.code} · คงเหลือ {num(stock, 0)} {p.unit}
                      </span>
                      <span className="pos-price">฿{num(p.price, 2)}</span>
                    </button>

                    {!p.img ? (
                      <button
                        className="pos-addimg"
                        onClick={() => {
                          imgTargetRef.current = p.id;
                          if (imgRef.current) imgRef.current.click();
                        }}
                        title="เพิ่มรูปสินค้า"
                      >
                        <IcPlus size={12} /> เพิ่มรูป
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty>ไม่พบสินค้าที่ตรงกับคำค้น</Empty>
          )}

          <input ref={imgRef} type="file" accept="image/*" hidden onChange={onPickImage} />
        </Card>
      </div>

      <PosSplitter width={billWidth} onChange={setBillWidth} />

      {/* ---------------- ขวา: บิลปัจจุบัน ---------------- */}
      <div className="pos-right">
        <Card
          title="รายการในบิล"
          actions={
            <>
              <Badge kind={lines.length ? "info" : "gray"}>{lines.length} รายการ</Badge>
              <button className="btn btn-g btn-sm" onClick={clearAll} disabled={saving || !lines.length}>
                ล้างบิล
              </button>
            </>
          }
        >
          {lines.length ? (
            <TableWrap>
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th style={{ width: 132 }}>ที่เก็บ</th>
                  <th className="num" style={{ width: 92 }}>จำนวน</th>
                  <th className="num">ราคา</th>
                  <th className="num">รวม</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const p = inv.prod(l.productId);
                  return (
                    <tr key={l.key}>
                      <td>
                        <b>{p ? p.name : ""}</b>
                        <br />
                        <span className="code-cell" style={{ color: "var(--fg-faint)" }}>
                          {p ? p.code : ""}
                        </span>
                      </td>
                      <td>
                        <LocationSelect
                          db={db}
                          whId={whId}
                          value={l.locId}
                          onChange={(v) => setLineLoc(l.key, v)}
                        />
                        <span className="pos-meta">
                          มีอยู่ {num(inv.placedIn(l.productId, l.locId), 0)}
                        </span>
                      </td>
                      <td className="num">
                        <input
                          className="inp num qty-input"
                          type="number"
                          min="1"
                          step="any"
                          value={l.qty}
                          onChange={(e) => setQty(l.key, e.target.value)}
                        />
                      </td>
                      <td className="num">{num(l.price, 2)}</td>
                      <td className="num">
                        <b>{num(l.qty * l.price, 2)}</b>
                      </td>
                      <td>
                        <button
                          className="btn btn-d btn-icon"
                          onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
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
            <Empty>ยังไม่มีสินค้าในบิล — ยิงบาร์โค๊ดหรือกดเลือกสินค้าทางซ้าย</Empty>
          )}

          <div className="pos-sum">
            <div className="sum-row">
              <span>ยอดรวมสินค้า</span>
              <b>{num(totals.subtotal, 2)}</b>
            </div>
            <div className="sum-row">
              <span>ส่วนลด</span>
              <input
                className="inp num sum-input"
                type="number"
                min="0"
                step="any"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="sum-row">
              <span>ภาษีมูลค่าเพิ่ม {Math.round(VAT_RATE * 100)}%</span>
              <b>{num(totals.vat, 2)}</b>
            </div>
            <div className="sum-row total">
              <span>ยอดสุทธิ</span>
              <b>฿{num(totals.total, 2)}</b>
            </div>

            <div className="sum-row">
              <span>วิธีชำระ</span>
              <select
                className="sel sum-input"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                {PAY_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sum-row">
              <span>รับเงิน</span>
              <input
                className="inp num sum-input"
                type="number"
                min="0"
                step="any"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="sum-row change">
              <span>เงินทอน</span>
              <b style={{ color: change < 0 ? "var(--err)" : "var(--ok)" }}>
                {num(Math.max(0, change), 2)}
              </b>
            </div>

            <div className="row" style={{ marginTop: 6 }}>
              {[100, 500, 1000].map((v) => (
                <button
                  key={v}
                  className="btn btn-g btn-sm"
                  onClick={() => setPaid(String((parseFloat(paid) || 0) + v))}
                >
                  +{v}
                </button>
              ))}
              <button
                className="btn btn-g btn-sm"
                onClick={() => setPaid(String(Math.ceil(totals.total)))}
              >
                พอดี
              </button>
            </div>

            <button
              className="btn btn-p"
              style={{ width: "100%", padding: 13, fontSize: 16, marginTop: 12 }}
              onClick={checkout}
              disabled={!lines.length || saving}
            >
              {saving ? "กำลังบันทึก…" : "ชำระเงินและพิมพ์ใบเสร็จ"}
            </button>

            {lastSale ? (
              <button
                className="btn btn-o"
                style={{ width: "100%", marginTop: 8 }}
                onClick={() => printReceipt(lastSale.sale, lastSale.items)}
              >
                <IcPrint size={15} />
                พิมพ์ใบเสร็จล่าสุดซ้ำ ({lastSale.sale.docNo})
              </button>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

/**
 * แถบคั่นกลางหน้า POS — ลากด้วยเมาส์เพื่อปรับความกว้างแผงบิล
 *
 * ใช้ pointer event ตัวเดียวจบ รองรับทั้งเมาส์ ปากกา และนิ้ว
 * setPointerCapture ทำให้ลากออกนอกตัวแถบแล้วยังตามต่อได้
 * ไม่ต้องไปผูก listener ที่ window เอง และไม่ค้างเมื่อปล่อยนอกหน้าต่าง
 *
 * รองรับคีย์บอร์ดด้วย เพราะเป็น role="separator" ที่โฟกัสได้
 */
function PosSplitter({ width, onChange }) {
  const ref = useRef(null);
  // จำสถานะลากเอง ตรงไปตรงมากว่าการถาม hasPointerCapture ทุกครั้งที่เมาส์ขยับ
  const dragging = useRef(false);

  /** ความกว้างสูงสุดที่ยังเหลือที่ให้แคตตาล็อกพอแสดงการ์ดสินค้า */
  function maxWidth() {
    const box = ref.current && ref.current.parentElement;
    if (!box) return BILL_MAX;
    // หักช่องไฟสองช่อง (10px x 2) กับตัวแถบคั่นเอง (16px) ออกก่อน
    return Math.min(BILL_MAX, box.getBoundingClientRect().width - CATALOG_MIN - 36);
  }

  function resizeTo(clientX) {
    const box = ref.current && ref.current.parentElement;
    if (!box) return;
    const r = box.getBoundingClientRect();
    // ลากไปทางซ้าย = แผงบิลกว้างขึ้น จึงวัดจากขอบขวาของกริด
    onChange(clampBill(r.right - clientX, maxWidth()));
  }

  function down(e) {
    e.preventDefault();
    dragging.current = true;
    // capture ทำให้ลากออกนอกตัวแถบแล้วยังได้รับ event ต่อ
    // ห่อ try ไว้เพราะบางเบราว์เซอร์โยนถ้า pointer หลุดไปแล้ว
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      // ไม่ได้ก็ยังลากได้ แค่หลุดง่ายขึ้นเวลาเมาส์ออกนอกแถบ
    }
    document.body.classList.add("col-resizing");
  }

  function move(e) {
    if (!dragging.current) return;
    resizeTo(e.clientX);
  }

  function up(e) {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {
      // ปล่อยไม่ได้ก็ไม่เป็นไร เบราว์เซอร์ปล่อยให้เองตอน pointer หาย
    }
    document.body.classList.remove("col-resizing");
  }

  function key(e) {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onChange(clampBill(width + step, maxWidth()));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onChange(clampBill(width - step, maxWidth()));
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(clampBill(BILL_DEFAULT, maxWidth()));
    }
  }

  return (
    <div
      ref={ref}
      className="pos-split no-print"
      role="separator"
      aria-orientation="vertical"
      aria-label="ปรับความกว้างแผงบิล"
      aria-valuenow={width}
      aria-valuemin={BILL_MIN}
      aria-valuemax={BILL_MAX}
      tabIndex={0}
      title="ลากเพื่อปรับความกว้างแผงบิล · ดับเบิลคลิกเพื่อคืนค่าเดิม"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onDoubleClick={() => onChange(BILL_DEFAULT)}
      onKeyDown={key}
    >
      <span />
    </div>
  );
}
