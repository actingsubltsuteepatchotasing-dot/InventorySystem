"use client";

// หน้ารายละเอียดสินค้า — ข้อมูล บาร์โค๊ด ยอดคงเหลือรายคลัง และประวัติการเคลื่อนไหว

import { useMemo } from "react";
import { useInv } from "@/lib/store";
import { TYPES } from "@/lib/constants";
import { num, thDate } from "@/lib/format";
import Modal from "../Modal";
import { usePrint } from "../Print";
import { IcBox } from "../Icons";
import { Barcode, Empty, Row2, TableWrap } from "../ui";
import StockBins from "./StockBins";
import { LabelSheetBody } from "./printBodies";

export default function ProductDetail({ productId, onClose, onEdit }) {
  const inv = useInv();
  const perm = inv.perm("products");
  const { db } = inv;
  const print = usePrint();
  const p = inv.prod(productId);

  // ยอดคงเหลือแยกรายคลังและรายช่องเก็บ — คิดที่เดียวกับฟอร์มแก้ไขสินค้า
  const byWh = useMemo(
    () => inv.stockByBin(productId),
    [db.warehouses, db.locations, db.placements, db.txns, inv, productId]
  );

  const history = useMemo(
    () => db.txns.filter((t) => t.productId === productId).sort((a, b) => b.ts - a.ts).slice(0, 12),
    [db.txns, productId]
  );

  if (!p) return null;
  const total = inv.stockTotal(p.id);

  return (
    <Modal
      title={p.name}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-g"
            onClick={() =>
              print({
                title: "ป้ายบาร์โค๊ดสินค้า",
                subtitle: p.code + " · " + p.name,
                signers: false,
                body: <LabelSheetBody items={Array(12).fill(p)} />,
              })
            }
          >
            พิมพ์บาร์โค๊ด
          </button>
          <button className="btn btn-p" onClick={onEdit} disabled={!perm.edit}>
            แก้ไขข้อมูล
          </button>
        </>
      }
    >
      <div className="grid g2" style={{ gap: 18 }}>
        <div>
          {p.img ? (
            <img
              src={p.img}
              alt=""
              style={{ width: "100%", borderRadius: 11, border: "1px solid var(--border)" }}
            />
          ) : (
            <div
              style={{
                height: 170,
                background: "var(--brand-50)",
                borderRadius: 11,
                display: "grid",
                placeItems: "center",
                color: "var(--brand)",
                opacity: 0.4,
              }}
            >
              <IcBox size={52} stroke={1.5} />
            </div>
          )}
          <div className="bc-box" style={{ marginTop: 12 }}>
            <Barcode value={p.barcode} module={2} height={46} />
          </div>
        </div>

        <div>
          <table className="tbl" style={{ fontSize: 13.5 }}>
            <tbody>
              <Row2 k="รหัสสินค้า">{p.code}</Row2>
              <Row2 k="หมวดหมู่">{p.cat}</Row2>
              <Row2 k="หน่วยนับ">{p.unit}</Row2>
              <Row2 k="ราคาต่อหน่วย">฿{num(p.price)}</Row2>
              <Row2 k="จุดสั่งซื้อต่ำสุด">{num(p.min, 0)}</Row2>
              <Row2 k="บาร์โค๊ด">{p.barcode || "—"}</Row2>
              <Row2 k="คลัง / ที่เก็บประจำ">
                {p.defWhId && p.defLocId ? (
                  inv.whLocName(p.defWhId, p.defLocId)
                ) : (
                  <span style={{ color: "var(--fg-faint)" }}>ยังไม่กำหนด</span>
                )}
              </Row2>
              <Row2 k="คงเหลือรวมทุกคลัง">
                <b>
                  {num(total, 0)} {p.unit}
                </b>
              </Row2>
              <Row2 k="มูลค่าคงเหลือ">฿{num(total * p.price)}</Row2>
            </tbody>
          </table>
          {p.note ? (
            <p style={{ marginTop: 12, fontSize: 13.5, color: "var(--fg-muted)" }}>{p.note}</p>
          ) : null}
        </div>
      </div>

      <h4 style={{ margin: "20px 0 9px", fontSize: 14.5 }}>ยอดคงเหลือแยกตามคลังและที่เก็บ</h4>
      <StockBins rows={byWh} unit={p.unit} />

      <h4 style={{ margin: "20px 0 9px", fontSize: 14.5 }}>ประวัติการเคลื่อนไหวล่าสุด</h4>
      {history.length ? (
        <TableWrap>
          <thead>
            <tr>
              <th>วันที่</th>
              <th>เลขที่</th>
              <th>ประเภท</th>
              <th>คลัง · ที่เก็บ</th>
              <th className="num">จำนวน</th>
            </tr>
          </thead>
          <tbody>
            {history.map((t) => (
              <tr key={t.id}>
                <td>{thDate(t.date)}</td>
                <td className="code-cell">{t.docNo}</td>
                <td>
                  <span className={"bdg " + TYPES[t.type].badge}>{TYPES[t.type].name}</span>
                </td>
                <td style={{ fontSize: 13 }}>{inv.whLocName(t.whId, t.locId)}</td>
                <td className="num">{(t.qty > 0 ? "+" : "") + num(t.qty, 0)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : (
        <Empty>ยังไม่มีประวัติ</Empty>
      )}
    </Modal>
  );
}
