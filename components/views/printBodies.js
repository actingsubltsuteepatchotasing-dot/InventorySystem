"use client";

// เนื้อหาเอกสารที่ใช้พิมพ์ร่วมกันหลายหน้าจอ

import { PAY_METHODS, VAT_RATE } from "@/lib/constants";
import { num, thDateTime } from "@/lib/format";
import { Barcode } from "../ui";

/** ใบตรวจนับสินค้า — พิมพ์ยอดตามบัญชีมาให้ เว้นช่องสำหรับกรอกยอดนับจริง */
export function CountSheetBody({ db, inv, whId }) {
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>ลำดับ</th>
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
          {db.products.map((p, i) => (
            <tr key={p.id}>
              <td>{i + 1}</td>
              <td>{p.code}</td>
              <td>{p.name}</td>
              <td>{p.unit}</td>
              <td style={{ textAlign: "right" }}>{num(inv.stockOf(p.id, whId), 0)}</td>
              <td />
              <td />
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pr-note">
        หมายเหตุ: กรอกยอดที่นับได้จริงลงในช่อง “นับได้จริง” แล้วนำผลต่างไปบันทึกในหน้าจอปรับปรุงสินค้า
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
  const pay = PAY_METHODS.find((m) => m.id === sale.payMethod);

  return (
    <div className="receipt">
      <div className="rc-head">
        <b>การยางแห่งประเทศไทย</b>
        <span>Rubber Authority of Thailand</span>
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
