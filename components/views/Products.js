"use client";

// หน้าจอข้อมูลสินค้า — ค้นหา กรองหมวดหมู่ ดูรายละเอียด แก้ไข และพิมพ์ป้ายบาร์โค๊ด

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { num, thDate, todayISO } from "@/lib/format";
import { usePrint } from "../Print";
import { IcBox, IcPlus } from "../Icons";
import { Badge, Card, Empty } from "../ui";
import ProductForm from "./ProductForm";
import ProductDetail from "./ProductDetail";
import { LabelSheetBody } from "./printBodies";

export default function Products() {
  const inv = useInv();

  // สิทธิของหน้าจอนี้ — ไม่ติ๊ก "แก้ไข" แล้วปุ่มที่เขียนข้อมูลถูกปิด ดูได้อย่างเดียว
  const perm = inv.perm("products");
  const { db } = inv;
  const print = usePrint();

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [editing, setEditing] = useState(null); // { id } หรือ { id: null } = เพิ่มใหม่
  const [viewing, setViewing] = useState(null);

  const cats = useMemo(() => Array.from(new Set(db.products.map((p) => p.cat))), [db.products]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return db.products.filter((p) => {
      const hay = (p.name + p.code + p.barcode + p.cat).toLowerCase();
      return (!needle || hay.includes(needle)) && (!cat || p.cat === cat);
    });
  }, [db.products, q, cat]);

  function printProductList() {
    print({
      title: "ทะเบียนข้อมูลสินค้า",
      subtitle: "ณ วันที่ " + thDate(todayISO()),
      body: (
        <table>
          <thead>
            <tr>
              <th>ลำดับ</th>
              <th>รหัส</th>
              <th>รายการสินค้า</th>
              <th>หมวดหมู่</th>
              <th>หน่วย</th>
              <th style={{ textAlign: "right" }}>ราคา/หน่วย</th>
              <th style={{ textAlign: "right" }}>จุดสั่งซื้อ</th>
              <th style={{ textAlign: "right" }}>คงเหลือ</th>
            </tr>
          </thead>
          <tbody>
            {db.products.map((p, i) => (
              <tr key={p.id}>
                <td>{i + 1}</td>
                <td>{p.code}</td>
                <td>{p.name}</td>
                <td>{p.cat}</td>
                <td>{p.unit}</td>
                <td style={{ textAlign: "right" }}>{num(p.price)}</td>
                <td style={{ textAlign: "right" }}>{num(p.min, 0)}</td>
                <td style={{ textAlign: "right" }}>{num(inv.stockTotal(p.id), 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    });
  }

  return (
    <>
      <Card
        title="ข้อมูลสินค้า"
        actions={
          <>
            <button
              className="btn btn-p btn-sm"
              onClick={() => setEditing({ id: null })}
              disabled={!perm.edit}
            >
              <IcPlus size={15} />
              เพิ่มสินค้าใหม่
            </button>
            <button
              className="btn btn-o btn-sm"
              onClick={() =>
                print({
                  title: "ป้ายบาร์โค๊ดสินค้า",
                  subtitle: "ทั้งหมด " + db.products.length + " รายการ",
                  signers: false,
                  body: <LabelSheetBody items={db.products} />,
                })
              }
            >
              พิมพ์ป้ายบาร์โค๊ด
            </button>
            <button className="btn btn-g btn-sm" onClick={printProductList}>
              พิมพ์ทะเบียนสินค้า
            </button>
          </>
        }
      >
        <div className="row" style={{ marginBottom: 16 }}>
          <input
            className="inp"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ / รหัส / บาร์โค๊ด…"
            style={{ maxWidth: 320 }}
          />
          <select className="sel" value={cat} onChange={(e) => setCat(e.target.value)} style={{ maxWidth: 210 }}>
            <option value="">ทุกหมวดหมู่</option>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <Badge>{list.length} รายการ</Badge>
        </div>

        {list.length ? (
          <div className="prod-grid">
            {list.map((p) => {
              const st = inv.stockTotal(p.id);
              const low = st < p.min;
              return (
                <div className="prod" key={p.id}>
                  <div className="ph">
                    {p.img ? (
                      <img src={p.img} alt={p.name} />
                    ) : (
                      <IcBox className="noimg" size={46} stroke={1.6} />
                    )}
                  </div>
                  <div className="bd">
                    <div className="code">
                      {p.code} · {p.cat}
                    </div>
                    <div className="nm">{p.name}</div>
                    <div className="meta">
                      หน่วย: {p.unit} · ฿{num(p.price)}
                    </div>
                    <div style={{ marginTop: "auto", paddingTop: 7, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Badge kind={low ? "warn" : "ok"}>คงเหลือ {num(st, 0)}</Badge>
                      <Badge>ต่ำสุด {num(p.min, 0)}</Badge>
                    </div>
                  </div>
                  <div className="ft">
                    <button className="btn btn-g btn-sm" onClick={() => setViewing(p.id)}>
                      รายละเอียด
                    </button>
                    <button className="btn btn-o btn-sm" onClick={() => setEditing({ id: p.id })}>
                      แก้ไข
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty>ไม่พบสินค้าที่ตรงกับเงื่อนไข</Empty>
        )}
      </Card>

      {editing ? <ProductForm productId={editing.id} onClose={() => setEditing(null)} /> : null}

      {viewing ? (
        <ProductDetail
          productId={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            const id = viewing;
            setViewing(null);
            setEditing({ id });
          }}
        />
      ) : null}
    </>
  );
}
