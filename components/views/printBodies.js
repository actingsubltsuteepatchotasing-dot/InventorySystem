"use client";

// เนื้อหาเอกสารที่ใช้พิมพ์ร่วมกันหลายหน้าจอ

import { num } from "@/lib/format";
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
