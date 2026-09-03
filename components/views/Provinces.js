"use client";

// หน้าจอแสดงสินค้าที่อยู่ในแต่ละจังหวัด พร้อมแผนที่จาก Google Maps

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { num, thDate, todayISO } from "@/lib/format";
import { usePrint } from "../Print";
import { IcPin } from "../Icons";
import { Badge, Card, Empty, TableWrap } from "../ui";
import { CountSheetBody } from "./printBodies";

export default function Provinces() {
  const inv = useInv();
  const { db } = inv;
  const print = usePrint();
  const [selected, setSelected] = useState(db.warehouses[0].id);

  const w = inv.wh(selected) || db.warehouses[0];

  const items = useMemo(
    () =>
      db.products
        .map((p) => ({
          p,
          q: inv.stockOf(p.id, w.id),
          // ของรายการหนึ่งอาจกระจายอยู่หลายช่องในคลังเดียวกัน จึงต้องรวบมาแสดงทั้งหมด
          bins: inv
            .locsOf(w.id)
            .map((l) => ({ loc: l, qty: inv.placedIn(p.id, l.id) }))
            .filter((b) => b.qty > 0),
        }))
        .filter((x) => x.q !== 0)
        .sort((a, b) => b.q - a.q),
    [db.products, db.placements, db.locations, inv, w.id]
  );

  const totalQty = items.reduce((s, x) => s + x.q, 0);
  const totalValue = items.reduce((s, x) => s + x.q * x.p.price, 0);

  const mapURL = `https://www.google.com/maps?q=${w.lat},${w.lng}&hl=th&z=11&output=embed`;
  const linkURL = `https://www.google.com/maps/search/?api=1&query=${w.lat},${w.lng}`;

  function printWarehouseReport() {
    print({
      title: "รายงานสินค้าคงเหลือรายคลัง",
      subtitle: w.name + " · จังหวัด" + w.province + " · ณ " + thDate(todayISO()),
      body: (
        <table>
          <thead>
            <tr>
              <th>ลำดับ</th>
              <th>รหัส</th>
              <th>รายการสินค้า</th>
              <th>ที่เก็บ</th>
              <th>หน่วย</th>
              <th style={{ textAlign: "right" }}>คงเหลือ</th>
              <th style={{ textAlign: "right" }}>มูลค่า (บาท)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((x, i) => (
              <tr key={x.p.id}>
                <td>{i + 1}</td>
                <td>{x.p.code}</td>
                <td>{x.p.name}</td>
                <td>
                  {x.bins.length
                    ? x.bins.map((b) => b.loc.code + " (" + num(b.qty, 0) + ")").join(", ")
                    : "ยังไม่ระบุที่เก็บ"}
                </td>
                <td>{x.p.unit}</td>
                <td style={{ textAlign: "right" }}>{num(x.q, 0)}</td>
                <td style={{ textAlign: "right" }}>{num(x.q * x.p.price, 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>รวม {items.length} รายการ</td>
              <td style={{ textAlign: "right" }}>{num(totalQty, 0)}</td>
              <td style={{ textAlign: "right" }}>{num(totalValue, 0)}</td>
            </tr>
          </tfoot>
        </table>
      ),
    });
  }

  return (
    <div className="stack">
      <div className="grid pipe-2col" style={{ gridTemplateColumns: "340px 1fr" }}>
        <Card title="คลังสินค้ารายจังหวัด" actions={<Badge>{db.warehouses.length} คลัง</Badge>}>
          <div className="prov-list">
            {db.warehouses.map((x) => (
              <button
                key={x.id}
                className={"prov" + (x.id === selected ? " active" : "")}
                onClick={() => setSelected(x.id)}
              >
                <span className="pin">
                  <IcPin size={16} />
                </span>
                <span className="info">
                  <b>{x.province}</b>
                  <span>
                    {x.name} · {inv.locsOf(x.id).length} ที่เก็บ
                  </span>
                </span>
                <span className="qty">
                  <b>{num(inv.whTotal(x.id), 0)}</b>
                  <span>หน่วย</span>
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card
          title={"แผนที่ตั้งคลัง — " + w.name}
          actions={
            <a className="btn btn-o btn-sm" href={linkURL} target="_blank" rel="noopener noreferrer">
              เปิดใน Google Maps
            </a>
          }
        >
          <div className="map-wrap">
            <iframe
              key={w.id}
              src={mapURL}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={"แผนที่ " + w.name}
              allowFullScreen
            />
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <Badge kind="info">จังหวัด{w.province}</Badge>
            <Badge>
              พิกัด {w.lat}, {w.lng}
            </Badge>
            <Badge kind="ok">คงเหลือรวม {num(inv.whTotal(w.id), 0)} หน่วย</Badge>
            <Badge>มูลค่า ฿{num(totalValue, 0)}</Badge>
          </div>
          <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--fg-faint)" }}>
            แผนที่แสดงผลผ่าน Google Maps Embed — ต้องเชื่อมต่ออินเทอร์เน็ตจึงจะเห็นภาพแผนที่
          </p>
        </Card>
      </div>

      <Card
        title={"รายการสินค้าคงเหลือ — " + w.name}
        actions={
          <>
            <button className="btn btn-o btn-sm" onClick={printWarehouseReport}>
              พิมพ์รายงาน
            </button>
            <button
              className="btn btn-g btn-sm"
              onClick={() =>
                print({
                  title: "ใบตรวจนับสินค้าคงคลัง",
                  subtitle: w.name + " · จังหวัด" + w.province + " · ณ วันที่ " + thDate(todayISO()),
                  body: <CountSheetBody db={db} inv={inv} whId={w.id} />,
                })
              }
            >
              พิมพ์ใบตรวจนับ
            </button>
          </>
        }
      >
        {items.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>รายการสินค้า</th>
                <th>ที่เก็บ</th>
                <th>หมวดหมู่</th>
                <th>หน่วย</th>
                <th className="num">คงเหลือ</th>
                <th className="num">มูลค่า (บาท)</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.p.id}>
                  <td className="code-cell">{x.p.code}</td>
                  <td>{x.p.name}</td>
                  <td style={{ fontSize: 13 }}>
                    {x.bins.length
                      ? x.bins.map((b) => b.loc.code + " (" + num(b.qty, 0) + ")").join(", ")
                      : "ยังไม่ระบุที่เก็บ"}
                  </td>
                  <td>{x.p.cat}</td>
                  <td>{x.p.unit}</td>
                  <td className="num">
                    <b>{num(x.q, 0)}</b>
                  </td>
                  <td className="num">{num(x.q * x.p.price, 0)}</td>
                  <td>
                    <Badge kind={x.q < x.p.min ? "warn" : "ok"}>
                      {x.q < x.p.min ? "ต่ำกว่าเกณฑ์" : "ปกติ"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>รวม {items.length} รายการ</td>
                <td className="num">{num(totalQty, 0)}</td>
                <td className="num">{num(totalValue, 0)}</td>
                <td />
              </tr>
            </tfoot>
          </TableWrap>
        ) : (
          <Empty>คลังนี้ยังไม่มีสินค้าคงเหลือ</Empty>
        )}
      </Card>
    </div>
  );
}
