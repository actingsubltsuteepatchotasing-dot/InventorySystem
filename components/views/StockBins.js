"use client";

// ตารางยอดคงเหลือของสินค้าหนึ่ง แยกรายคลังและรายช่องเก็บ
//
// อยู่ไฟล์เดียวเพราะทั้งหน้ารายละเอียดสินค้าและฟอร์มแก้ไขสินค้าต้องแสดงตารางนี้
// เขียนซ้ำสองที่เมื่อไร วันที่แก้กติกาการนับจะมีที่หนึ่งที่ลืมแก้
// แล้วสองหน้าจะบอกยอดไม่ตรงกันทั้งที่เป็นสินค้าตัวเดียวกัน
//
// หนึ่งแถวคือ "ของกี่ชิ้น อยู่ช่องไหน ของคลังไหน" ไม่ได้ยัดทุกช่องไว้ในเซลล์เดียว
// เพราะรายการนี้ถูกเอาไปใช้เดินหยิบของจริง ต้องอ่านทีละบรรทัดได้
// และคลังหนึ่งมีของกระจายหลายช่องเป็นเรื่องปกติ

import { num } from "@/lib/format";
import { Empty, TableWrap } from "../ui";

/**
 * @param rows ผลจาก inv.stockByBin(productId)
 * @param unit หน่วยนับของสินค้า ใช้ต่อท้ายยอดรวม
 */
export default function StockBins({ rows, unit = "" }) {
  if (!rows.length) return <Empty>ยังไม่มีสินค้าคงเหลือในคลังใด</Empty>;

  const total = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <TableWrap>
      <thead>
        <tr>
          <th style={{ minWidth: 150 }}>คลัง</th>
          <th style={{ minWidth: 110 }}>จังหวัด</th>
          <th style={{ minWidth: 130 }}>ที่เก็บ</th>
          <th style={{ minWidth: 120 }}>โซน · ช่อง</th>
          <th className="num">คงเหลือ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          /*
           * แถวย่อยของคลังนี้: ทุกช่องที่มีของ บวกแถว "ไม่ได้ระบุที่เก็บ" ถ้ามีส่วนต่าง
           * ส่วนต่างเกิดกับข้อมูลเก่าที่บันทึกไว้ก่อนระบบบังคับให้ระบุช่อง
           * ต้องโชว์ ไม่ใช่ซ่อน ไม่งั้นผลรวมของช่องจะไม่เท่ากับยอดรวมของคลัง
           */
          const lines = r.bins.map((b) => ({
            key: b.loc.id,
            code: b.loc.code,
            name: b.loc.name || "",
            zone: b.loc.zone + " · ช่อง " + b.loc.col,
            qty: b.qty,
          }));
          if (r.loose !== 0) {
            lines.push({
              key: r.wh.id + ":loose",
              code: "",
              name: "ไม่ได้ระบุที่เก็บ",
              zone: "",
              qty: r.loose,
              loose: true,
            });
          }
          if (!lines.length) {
            lines.push({ key: r.wh.id + ":none", code: "", name: "—", zone: "", qty: 0 });
          }

          return lines.map((l, i) => (
            <tr key={l.key}>
              {/* ชื่อคลังเขียนครั้งเดียวต่อคลัง แถวถัดไปของคลังเดิมเว้นไว้
                  จะได้เห็นว่าของกองไหนอยู่คลังเดียวกัน โดยไม่ต้องอ่านชื่อซ้ำทุกบรรทัด */}
              {i === 0 ? (
                <>
                  <td rowSpan={lines.length}>
                    <b>{r.wh.name}</b>
                    <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>{r.wh.code}</div>
                  </td>
                  <td rowSpan={lines.length}>{r.wh.province}</td>
                </>
              ) : null}
              <td className="code-cell">{l.code || "—"}</td>
              <td style={{ fontSize: 13, color: l.loose ? "var(--warn)" : "var(--fg-muted)" }}>
                {l.zone || l.name || "—"}
                {l.zone && l.name ? " · " + l.name : ""}
              </td>
              <td className="num">{num(l.qty, 0)}</td>
            </tr>
          ));
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={4}>
            <b>รวมทุกคลัง</b>
          </td>
          <td className="num">
            <b>
              {num(total, 0)} {unit}
            </b>
          </td>
        </tr>
      </tfoot>
    </TableWrap>
  );
}
