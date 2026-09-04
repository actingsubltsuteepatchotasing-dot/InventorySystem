"use client";

// เนื้อหาเอกสารที่ใช้พิมพ์ร่วมกันหลายหน้าจอ

import { PAY_METHODS, VAT_RATE } from "@/lib/constants";
import { bahtText, num, thDate, thDateTime } from "@/lib/format";
import { Barcode } from "../ui";

/**
 * ใบตรวจนับสินค้า — พิมพ์ยอดตามบัญชีมาให้ เว้นช่องสำหรับกรอกยอดนับจริง
 *
 * แยกบรรทัดตามช่องเก็บ เพราะคนเดินนับของนับทีละช่อง ไม่ได้นับรวมทั้งคลัง
 * สินค้าที่มีของในคลังแต่ยังไม่ได้ระบุที่เก็บจะขึ้นท้ายตารางไว้ให้ตามหา
 */
export function CountSheetBody({ db, inv, whId }) {
  const rows = [];

  inv.locsOf(whId).forEach((l) => {
    inv
      .placementsIn(l.id)
      .slice()
      .sort((a, b) => {
        const pa = inv.prod(a.productId);
        const pb = inv.prod(b.productId);
        return (pa ? pa.code : "").localeCompare(pb ? pb.code : "");
      })
      .forEach((pl) => {
        const p = inv.prod(pl.productId);
        if (p) rows.push({ loc: l, p, qty: pl.qty });
      });
  });

  db.products.forEach((p) => {
    const rest = inv.stockOf(p.id, whId) - inv.placedQty(p.id, whId);
    if (rest > 0) rows.push({ loc: null, p, qty: rest });
  });

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>ลำดับ</th>
            <th>ที่เก็บ</th>
            <th>รหัสสินค้า</th>
            <th>รายการสินค้า</th>
            <th>หน่วยนับ</th>
            <th style={{ textAlign: "right" }}>ยอดตามบัญชี</th>
            <th style={{ width: 70 }}>นับได้จริง</th>
            <th style={{ width: 70 }}>ผลต่าง</th>
            <th style={{ width: 110 }}>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={(r.loc ? r.loc.id : "none") + "|" + r.p.id}>
              <td>{i + 1}</td>
              <td>{r.loc ? r.loc.code : "ยังไม่ระบุที่เก็บ"}</td>
              <td>{r.p.code}</td>
              <td>{r.p.name}</td>
              <td>{r.p.unit}</td>
              <td style={{ textAlign: "right" }}>{num(r.qty, 0)}</td>
              <td />
              <td />
              <td />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>รวม {rows.length} บรรทัด</td>
            <td style={{ textAlign: "right" }}>
              {num(rows.reduce((s, r) => s + r.qty, 0), 0)}
            </td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
      <div className="pr-note">
        หมายเหตุ: กรอกยอดที่นับได้จริงลงในช่อง “นับได้จริง” แล้วนำผลต่างไปบันทึกในหน้าจอปรับปรุงสินค้า
        โดยเลือกที่เก็บให้ตรงกับบรรทัดที่นับ
      </div>
    </>
  );
}

/**
 * ใบเสร็จรับเงิน — จัดหน้าแบบใบเสร็จแคบ พิมพ์ได้ทั้งกระดาษความร้อนและ A4
 * ใช้ร่วมกันระหว่างการพิมพ์ตอนจบการขาย และการพิมพ์ซ้ำจากรายงาน
 */
export function ReceiptBody({ inv, sale, items }) {
  const wh = inv.wh(sale.whId);
  const binLabel = sale.locId ? inv.locName(sale.locId) : "";
  const pay = PAY_METHODS.find((m) => m.id === sale.payMethod);

  return (
    <div className="receipt">
      <div className="rc-head">
        <b>Ultra ERP</b>
        <span>ระบบควบคุมสินค้าคงคลัง</span>
        {wh ? (
          <span>
            {wh.name} · จังหวัด{wh.province}
          </span>
        ) : null}
        <span>โทร. 0-2433-2222</span>
      </div>

      <div className="rc-title">ใบเสร็จรับเงิน / RECEIPT</div>

      <div className="rc-meta">
        <div>
          <span>เลขที่</span>
          <b>{sale.docNo}</b>
        </div>
        <div>
          <span>วันที่</span>
          <b>{thDateTime(sale.ts)}</b>
        </div>
        <div>
          <span>ลูกค้า</span>
          <b>{sale.customer || "ลูกค้าทั่วไป"}</b>
        </div>
        <div>
          <span>ผู้ขาย</span>
          <b>{sale.user || "-"}</b>
        </div>
        {binLabel ? (
          <div>
            <span>ที่เก็บ</span>
            <b>{binLabel}</b>
          </div>
        ) : null}
      </div>

      <table className="rc-items">
        <thead>
          <tr>
            <th>รายการ</th>
            <th style={{ textAlign: "right" }}>จำนวน</th>
            <th style={{ textAlign: "right" }}>ราคา</th>
            <th style={{ textAlign: "right" }}>รวม</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const p = inv.prod(it.productId);
            return (
              <tr key={it.id}>
                <td>
                  {inv.prodName(it.productId)}
                  <br />
                  <span className="rc-code">{p ? p.code + " · " + p.unit : ""}</span>
                </td>
                <td style={{ textAlign: "right" }}>{num(it.qty, 0)}</td>
                <td style={{ textAlign: "right" }}>{num(it.price, 2)}</td>
                <td style={{ textAlign: "right" }}>{num(it.amount, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="rc-sum">
        <div>
          <span>ยอดรวมสินค้า</span>
          <b>{num(sale.subtotal, 2)}</b>
        </div>
        {sale.discount > 0 ? (
          <div>
            <span>ส่วนลด</span>
            <b>-{num(sale.discount, 2)}</b>
          </div>
        ) : null}
        <div>
          <span>ภาษีมูลค่าเพิ่ม {Math.round(VAT_RATE * 100)}%</span>
          <b>{num(sale.vat, 2)}</b>
        </div>
        <div className="rc-total">
          <span>ยอดสุทธิ</span>
          <b>{num(sale.total, 2)}</b>
        </div>
        <div>
          <span>รับเงิน ({pay ? pay.name : sale.payMethod})</span>
          <b>{num(sale.paid, 2)}</b>
        </div>
        <div>
          <span>เงินทอน</span>
          <b>{num(sale.change, 2)}</b>
        </div>
      </div>

      <div className="rc-foot">
        <div>ขอบคุณที่ใช้บริการ</div>
        <div>เอกสารออกโดยระบบควบคุมสินค้าคงคลัง</div>
        <div className="rc-sign">
          <div className="line" />
          ผู้รับเงิน
        </div>
      </div>
    </div>
  );
}

/** ป้ายบาร์โค๊ดสำหรับติดสินค้า */
export function LabelSheetBody({ items }) {
  return (
    <div className="lbl-grid">
      {items.map((p, i) => (
        <div className="lbl-card" key={p.id + "-" + i}>
          <div style={{ fontSize: "9pt", fontWeight: 700 }}>{p.name}</div>
          <div style={{ fontSize: "8pt", color: "#555" }}>
            {p.code} · {p.unit}
          </div>
          <Barcode value={p.barcode} module={1.4} height={34} />
        </div>
      ))}
    </div>
  );
}

/**
 * ใบกำกับภาษีเต็มรูปแบบ / ใบส่งของ
 *
 * หัวกระดาษต้องเป็นชื่อกิจการผู้ออก ไม่ใช่ชื่อโปรแกรม จึงพิมพ์ด้วยโหมด bare
 * (กฎหมายบังคับว่าต้องมีชื่อ ที่อยู่ และเลขประจำตัวผู้เสียภาษีของผู้ขายบนเอกสาร
 *  พร้อมข้อมูลเดียวกันของผู้ซื้อ เลขที่ วันที่ รายการ มูลค่า และภาษีที่แยกออกมา)
 *
 * ชื่อ/ที่อยู่ผู้ซื้ออ่านจากตัวใบ ไม่ได้อ่านสดจากทะเบียนลูกค้า
 * เพราะเอกสารภาษีต้องคงข้อความเดิม ณ วันที่ออก
 */
export function TaxInvoiceBody({ inv, company, invoice, items }) {
  const co = company || {};
  const lines = items || [];

  return (
    <div className="tinv">
      <div className="ti-head">
        <div className="ti-seller">
          <b>{co.name || "(ยังไม่ได้ตั้งค่าข้อมูลกิจการ)"}</b>
          <div>{co.address}</div>
          <div>
            เลขประจำตัวผู้เสียภาษี {co.taxId || "-"}
            {co.branch ? " · " + co.branch : ""}
          </div>
          {co.phone ? <div>โทร. {co.phone}</div> : null}
          {co.email ? <div>{co.email}</div> : null}
        </div>
        <div className="ti-kind">
          <div className="ti-title">ใบกำกับภาษี / ใบส่งของ</div>
          <div className="ti-orig">ต้นฉบับ (เอกสารออกเป็นชุด)</div>
          <Barcode value={invoice.docNo} module={1.5} height={34} />
        </div>
      </div>

      <div className="ti-parties">
        <div className="ti-box">
          <span className="ti-lbl">ผู้ซื้อ</span>
          <b>{invoice.custName}</b>
          <div>{invoice.custAddress || "-"}</div>
          <div>
            เลขประจำตัวผู้เสียภาษี {invoice.custTaxId || "-"}
            {invoice.custBranch ? " · " + invoice.custBranch : ""}
          </div>
          <div>รหัสลูกค้า {invoice.custCode || "-"}</div>
        </div>
        <div className="ti-box">
          <div className="ti-kv">
            <span>เลขที่เอกสาร</span>
            <b>{invoice.docNo}</b>
          </div>
          <div className="ti-kv">
            <span>วันที่</span>
            <b>{thDate(invoice.date)}</b>
          </div>
          <div className="ti-kv">
            <span>ผู้ออกเอกสาร</span>
            <b>{invoice.user || "-"}</b>
          </div>
          <div className="ti-kv">
            <span>พิมพ์เมื่อ</span>
            <b>{thDateTime(Date.now())}</b>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: 34 }}>ลำดับ</th>
            <th style={{ width: 78 }}>รหัส</th>
            <th>รายการสินค้า / บริการ</th>
            <th style={{ width: 60 }}>หน่วย</th>
            <th style={{ width: 58, textAlign: "right" }}>จำนวน</th>
            <th style={{ width: 74, textAlign: "right" }}>ราคา/หน่วย</th>
            <th style={{ width: 74, textAlign: "right" }}>ส่วนลด</th>
            <th style={{ width: 86, textAlign: "right" }}>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((it, i) => {
            const p = inv.prod(it.productId);
            const gross = (Number(it.qty) || 0) * (Number(it.price) || 0);
            const disc = gross - (Number(it.amount) || 0);
            return (
              <tr key={it.id}>
                <td>{i + 1}</td>
                <td>{p ? p.code : ""}</td>
                <td>
                  {inv.prodName(it.productId)}
                  {it.discPct ? " (ลด " + num(it.discPct, 2) + "%)" : ""}
                </td>
                <td>{p ? p.unit : ""}</td>
                <td style={{ textAlign: "right" }}>{num(it.qty, 0)}</td>
                <td style={{ textAlign: "right" }}>{num(it.price, 2)}</td>
                <td style={{ textAlign: "right" }}>{disc > 0 ? num(disc, 2) : "-"}</td>
                <td style={{ textAlign: "right" }}>{num(it.amount, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="ti-foot">
        <div className="ti-words">
          <span className="ti-lbl">จำนวนเงินรวมทั้งสิ้น (ตัวอักษร)</span>
          <b>{bahtText(invoice.total)}</b>
          {invoice.note ? <div className="ti-note">หมายเหตุ: {invoice.note}</div> : null}
        </div>

        <table className="ti-total">
          <tbody>
            <tr>
              <td>รวมเงิน</td>
              <td>{num(invoice.itemsTotal, 2)}</td>
            </tr>
            <tr>
              <td>ส่วนลดท้ายบิล</td>
              <td>{num(invoice.billDiscount, 2)}</td>
            </tr>
            <tr>
              <td>มูลค่าก่อนภาษี</td>
              <td>{num(invoice.base, 2)}</td>
            </tr>
            <tr>
              <td>ภาษีมูลค่าเพิ่ม {num(invoice.vatRate, 2)}%</td>
              <td>{num(invoice.vat, 2)}</td>
            </tr>
            <tr className="grand">
              <td>จำนวนเงินรวมทั้งสิ้น</td>
              <td>{num(invoice.total, 2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="pr-sign">
        <div>
          <div className="line" />
          ผู้รับสินค้า / วันที่
        </div>
        <div>
          <div className="line" />
          ผู้ส่งสินค้า / วันที่
        </div>
        <div>
          <div className="line" />
          ผู้มีอำนาจลงนาม
        </div>
      </div>
    </div>
  );
}
