// การ์ดและกราฟที่เลือกมาแสดงบนแดชบอร์ดได้
//
// แยกจากหน้าจอเพราะเป็นตรรกะการคำนวณล้วน ๆ ไม่มี JSX เลย
// ทดสอบใน Node ได้ตรง ๆ และหน้าจอเหลือหน้าที่แค่วาดตามที่ได้มา
//
// แต่ละตัวคืน "คำอธิบายสิ่งที่จะวาด" ไม่ใช่ JSX:
//   { kind: "kpi",   label, value, sub, tone, icon }
//   { kind: "bar",   labels, series }
//   { kind: "hbar",  items }
//   { kind: "line",  labels, data, color }
//   { kind: "table", head, rows, empty, align }
//
// ทำแบบนี้เพื่อไม่ให้เกิด "ประกาศไว้แต่ไม่มีคนวาด"
//   ถ้าให้หน้าจอจับคู่ตัววาดทีละตัวตามรหัส วันหนึ่งเพิ่มตัวใหม่แล้วลืมเขียนตัววาด
//   จะได้การ์ดที่ติ๊กเลือกได้แต่พอเลือกแล้วไม่มีอะไรขึ้น
//   พอทุกตัวคืนชนิดที่หน้าจอรู้จักอยู่แล้ว ปัญหานั้นเกิดไม่ได้
//
// size บอกความกว้าง ใช้จัดตำแหน่งให้เองโดยไม่ต้องลากวาง:
//   kpi  = การ์ดตัวเลขเล็ก เรียงสี่ใบต่อแถว
//   half = ครึ่งความกว้าง เรียงสองใบต่อแถว
//   full = เต็มความกว้าง

import { SHIP_STATUS, TYPES } from "./constants";
import { movement, stockMap, stockTotal, whTotal } from "./db";
import { fmtDuration, monthsBetween, num, thDate } from "./format";

/** ผลรวมของฟิลด์หนึ่งในรายการ */
const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);

/** จัดอันดับจากมากไปน้อยแล้วตัดเอา n อันดับแรก */
const top = (map, n) =>
  Object.keys(map)
    .map((k) => ({ label: k, value: map[k] }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, n);

/** เอกสารที่อยู่ในช่วงวันที่ที่เลือก */
const inRange = (list, ctx) =>
  list.filter((v) => (!ctx.from || v.date >= ctx.from) && (!ctx.to || v.date <= ctx.to));

/** ยอดรายเดือนของชุดเอกสาร ใช้ทำกราฟแท่ง */
function byMonth(list, ctx, valueOf) {
  const months = monthsBetween(ctx.from, ctx.to);
  const data = months.map((mo) =>
    sum(list.filter((v) => String(v.date).slice(0, 7) === mo.key), valueOf)
  );
  return { labels: months.map((m) => m.label), data };
}

export const DASH_SOURCES = [
  /* ------------------------------------------------------ ภาพรวมคลัง */
  {
    id: "overview",
    name: "ภาพรวมคลังสินค้า",
    hint: "ยอดคงเหลือ มูลค่า และการเคลื่อนไหวของทั้งระบบ",
    widgets: [
      {
        id: "ov_products",
        name: "จำนวนรายการสินค้า",
        size: "kpi",
        build: (c) => ({
          kind: "kpi",
          icon: "box",
          label: "รายการสินค้าทั้งหมด",
          value: num(c.db.products.length, 0) + " รายการ",
          sub:
            c.db.warehouses.length + " คลังสินค้า · " + (c.db.locations || []).length + " ที่เก็บ",
        }),
      },
      {
        id: "ov_stock",
        name: "ยอดคงเหลือรวมและมูลค่า",
        size: "kpi",
        build: (c) => {
          const qty = sum(c.db.products, (p) => stockTotal(c.db, c.asOf, p.id));
          const val = sum(c.db.products, (p) => stockTotal(c.db, c.asOf, p.id) * (p.price || 0));
          return {
            kind: "kpi",
            icon: "chart",
            tone: "info",
            label: "ยอดคงเหลือรวม",
            value: num(qty, 0) + " หน่วย",
            sub: "มูลค่า ฿" + num(val, 0) + " · ณ " + thDate(c.to),
          };
        },
      },
      {
        id: "ov_low",
        name: "สินค้าต่ำกว่าจุดสั่งซื้อ (ตัวเลข)",
        size: "kpi",
        build: (c) => {
          const low = c.db.products.filter((p) => stockTotal(c.db, c.asOf, p.id) < p.min);
          return {
            kind: "kpi",
            icon: "adjust",
            tone: low.length ? "warn" : "",
            label: "สินค้าต่ำกว่าจุดสั่งซื้อ",
            value: num(low.length, 0) + " รายการ",
            sub: (low.length ? "ควรดำเนินการจัดหา" : "อยู่ในเกณฑ์ปกติ") + " · ณ " + thDate(c.to),
          };
        },
      },
      {
        id: "ov_txn",
        name: "จำนวนรายการเคลื่อนไหว",
        size: "kpi",
        build: (c) => ({
          kind: "kpi",
          icon: "report",
          label: "รายการเคลื่อนไหวในช่วง",
          value: num(inRange(c.db.txns, c).length, 0) + " รายการ",
          sub: thDate(c.from) + " – " + thDate(c.to),
        }),
      },
      {
        id: "ov_inout",
        name: "กราฟรับเข้า–จ่ายออกรายเดือน",
        size: "half",
        build: (c) => {
          const months = monthsBetween(c.from, c.to);
          const ranged = inRange(c.db.txns, c);
          const inD = [];
          const outD = [];
          months.forEach((mo) => {
            let i = 0;
            let o = 0;
            ranged.forEach((t) => {
              if (t.date.slice(0, 7) !== mo.key) return;
              if (t.type === "RECEIVE") i += t.qty;
              else if (t.type === "ISSUE" || t.type === "SALE") o += t.qty;
              else if (t.type === "ADJUST") {
                if (t.qty > 0) i += t.qty;
                else o += -t.qty;
              }
            });
            inD.push(i);
            outD.push(o);
          });
          return {
            kind: "bar",
            labels: months.map((m) => m.label),
            series: [
              { name: "รับเข้า", color: "var(--brand-l)", data: inD },
              { name: "จ่ายออก", color: "#B3261E", data: outD },
            ],
          };
        },
      },
      {
        id: "ov_province",
        name: "กราฟยอดคงเหลือแยกตามจังหวัด",
        size: "half",
        build: (c) => ({
          kind: "hbar",
          items: c.db.warehouses
            .map((w) => ({
              label: w.province,
              value: whTotal(c.db, c.asOf, w.id),
              color: "var(--brand-l)",
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8),
        }),
      },
      {
        id: "ov_recent",
        name: "ตารางรายการเคลื่อนไหวล่าสุด",
        size: "half",
        build: (c) => ({
          kind: "table",
          head: ["วันที่", "เลขที่", "ประเภท", "สินค้า", "คลัง · ที่เก็บ", "จำนวน"],
          align: [0, 0, 0, 0, 0, 1],
          empty: "ยังไม่มีรายการในช่วงนี้",
          rows: inRange(c.db.txns, c)
            .slice()
            .sort((a, b) => b.ts - a.ts)
            .slice(0, 10)
            .map((t) => [
              thDate(t.date),
              t.docNo,
              (TYPES[t.type] || { name: t.type }).name,
              c.inv.prodName(t.productId),
              c.inv.whLocName(t.whId, t.locId) + (t.whTo ? " → " + c.inv.whLocName(t.whTo, t.locTo) : ""),
              num(Math.abs(t.qty), 0),
            ]),
        }),
      },
      {
        id: "ov_lowlist",
        name: "ตารางสินค้าต่ำกว่าจุดสั่งซื้อ",
        size: "half",
        build: (c) => ({
          kind: "table",
          head: ["รหัส", "สินค้า", "คงเหลือ", "จุดสั่งซื้อ"],
          align: [0, 0, 1, 1],
          empty: "ทุกรายการมียอดคงเหลือเพียงพอ",
          rows: c.db.products
            .map((p) => ({ p, qty: stockTotal(c.db, c.asOf, p.id) }))
            .filter((x) => x.qty < x.p.min)
            .slice(0, 10)
            .map((x) => [x.p.code, x.p.name, num(x.qty, 0), num(x.p.min, 0)]),
        }),
      },
      {
        id: "ov_topmove",
        name: "กราฟ 10 อันดับสินค้าที่เคลื่อนไหวมากที่สุด",
        size: "half",
        build: (c) => {
          const m = {};
          inRange(c.db.txns, c).forEach((t) => {
            const k = c.inv.prodName(t.productId);
            m[k] = (m[k] || 0) + Math.abs(t.qty);
          });
          return { kind: "hbar", items: top(m, 10).map((x) => ({ ...x, color: "var(--brand)" })) };
        },
      },
    ],
  },

  /* --------------------------------------------- ขายสินค้าและบริการ */
  {
    id: "invoice",
    name: "ขายสินค้าและบริการ",
    hint: "ใบขายที่ออกเป็นเอกสาร ยอดขาย ภาษี และลูกค้า",
    widgets: [
      {
        id: "iv_count",
        name: "จำนวนใบขาย",
        size: "kpi",
        build: (c) => ({
          kind: "kpi",
          icon: "report",
          label: "ใบขายในช่วง",
          value: num(inRange(c.db.invoices || [], c).length, 0) + " ใบ",
          sub: thDate(c.from) + " – " + thDate(c.to),
        }),
      },
      {
        id: "iv_total",
        name: "ยอดขายรวม",
        size: "kpi",
        build: (c) => {
          const list = inRange(c.db.invoices || [], c);
          return {
            kind: "kpi",
            icon: "chart",
            tone: "info",
            label: "ยอดขายรวม (สุทธิ)",
            value: "฿" + num(sum(list, (v) => v.total), 0),
            sub: "ก่อนภาษี ฿" + num(sum(list, (v) => v.base), 0),
          };
        },
      },
      {
        id: "iv_vat",
        name: "ภาษีขาย",
        size: "kpi",
        build: (c) => ({
          kind: "kpi",
          icon: "report",
          label: "ภาษีขายในช่วง",
          value: "฿" + num(sum(inRange(c.db.invoices || [], c), (v) => v.vat), 0),
          sub: "จากใบขายสินค้าและบริการ",
        }),
      },
      {
        id: "iv_avg",
        name: "ยอดเฉลี่ยต่อใบ",
        size: "kpi",
        build: (c) => {
          const list = inRange(c.db.invoices || [], c);
          const avg = list.length ? sum(list, (v) => v.total) / list.length : 0;
          return {
            kind: "kpi",
            icon: "cart",
            label: "ยอดเฉลี่ยต่อใบ",
            value: "฿" + num(avg, 0),
            sub: list.length ? "จาก " + num(list.length, 0) + " ใบ" : "ยังไม่มีใบขายในช่วงนี้",
          };
        },
      },
      {
        id: "iv_month",
        name: "กราฟยอดขายรายเดือน",
        size: "half",
        build: (c) => {
          const g = byMonth(inRange(c.db.invoices || [], c), c, (v) => v.total);
          return {
            kind: "bar",
            labels: g.labels,
            series: [{ name: "ยอดขาย (บาท)", color: "var(--brand-l)", data: g.data }],
          };
        },
      },
      {
        id: "iv_cust",
        name: "กราฟ 10 อันดับลูกค้า",
        size: "half",
        build: (c) => {
          const m = {};
          inRange(c.db.invoices || [], c).forEach((v) => {
            const k = v.custName || v.custCode || "(ไม่ระบุ)";
            m[k] = (m[k] || 0) + v.total;
          });
          return { kind: "hbar", items: top(m, 10).map((x) => ({ ...x, color: "var(--brand)" })) };
        },
      },
      {
        id: "iv_province",
        name: "กราฟยอดขายแยกตามจังหวัด",
        size: "half",
        build: (c) => {
          const m = {};
          inRange(c.db.invoices || [], c).forEach((v) => {
            const k = v.custProvince || "(ไม่ระบุจังหวัด)";
            m[k] = (m[k] || 0) + v.total;
          });
          return { kind: "hbar", items: top(m, 10).map((x) => ({ ...x, color: "#6D28D9" })) };
        },
      },
      {
        id: "iv_prod",
        name: "กราฟ 10 อันดับสินค้าที่ขายดี",
        size: "half",
        build: (c) => {
          const ids = new Set(inRange(c.db.invoices || [], c).map((v) => v.id));
          const m = {};
          (c.db.invoiceItems || []).forEach((i) => {
            if (!ids.has(i.invoiceId)) return;
            const k = c.inv.prodName(i.productId);
            m[k] = (m[k] || 0) + i.qty;
          });
          return { kind: "hbar", items: top(m, 10).map((x) => ({ ...x, color: "var(--brand-l)" })) };
        },
      },
      {
        id: "iv_recent",
        name: "ตารางใบขายล่าสุด",
        size: "full",
        build: (c) => ({
          kind: "table",
          head: ["วันที่", "เลขที่เอกสาร", "รหัสลูกค้า", "ชื่อลูกค้า", "จังหวัด", "ก่อนภาษี", "ภาษี", "สุทธิ"],
          align: [0, 0, 0, 0, 0, 1, 1, 1],
          empty: "ยังไม่มีใบขายในช่วงนี้",
          rows: inRange(c.db.invoices || [], c)
            .slice()
            .sort((a, b) => b.ts - a.ts)
            .slice(0, 12)
            .map((v) => [
              thDate(v.date),
              v.docNo,
              v.custCode,
              v.custName,
              v.custProvince || "—",
              num(v.base, 2),
              num(v.vat, 2),
              num(v.total, 2),
            ]),
        }),
      },
    ],
  },

  /* ------------------------------------------------- ขายหน้าร้าน POS */
  {
    id: "pos",
    name: "ขายสินค้า (POS)",
    hint: "บิลขายหน้าร้าน ยอดขาย และวิธีชำระเงิน",
    widgets: [
      {
        id: "po_count",
        name: "จำนวนบิล",
        size: "kpi",
        build: (c) => ({
          kind: "kpi",
          icon: "cart",
          label: "บิลขายในช่วง",
          value: num(inRange(c.db.sales || [], c).length, 0) + " บิล",
          sub: thDate(c.from) + " – " + thDate(c.to),
        }),
      },
      {
        id: "po_total",
        name: "ยอดขายหน้าร้าน",
        size: "kpi",
        build: (c) => ({
          kind: "kpi",
          icon: "chart",
          tone: "info",
          label: "ยอดขายหน้าร้าน",
          value: "฿" + num(sum(inRange(c.db.sales || [], c), (s) => s.total), 0),
          sub: "รวมภาษีแล้ว",
        }),
      },
      {
        id: "po_avg",
        name: "ยอดเฉลี่ยต่อบิล",
        size: "kpi",
        build: (c) => {
          const list = inRange(c.db.sales || [], c);
          const avg = list.length ? sum(list, (s) => s.total) / list.length : 0;
          return {
            kind: "kpi",
            icon: "report",
            label: "ยอดเฉลี่ยต่อบิล",
            value: "฿" + num(avg, 0),
            sub: list.length ? "จาก " + num(list.length, 0) + " บิล" : "ยังไม่มีบิลในช่วงนี้",
          };
        },
      },
      {
        id: "po_month",
        name: "กราฟยอดขายหน้าร้านรายเดือน",
        size: "half",
        build: (c) => {
          const g = byMonth(inRange(c.db.sales || [], c), c, (s) => s.total);
          return {
            kind: "bar",
            labels: g.labels,
            series: [{ name: "ยอดขาย (บาท)", color: "#6D28D9", data: g.data }],
          };
        },
      },
      {
        id: "po_wh",
        name: "กราฟยอดขายแยกตามคลัง",
        size: "half",
        build: (c) => {
          const m = {};
          inRange(c.db.sales || [], c).forEach((s) => {
            const k = c.inv.whName(s.whId);
            m[k] = (m[k] || 0) + s.total;
          });
          return { kind: "hbar", items: top(m, 10).map((x) => ({ ...x, color: "var(--brand)" })) };
        },
      },
      {
        id: "po_recent",
        name: "ตารางบิลล่าสุด",
        size: "half",
        build: (c) => ({
          kind: "table",
          head: ["วันที่", "เลขที่บิล", "ลูกค้า", "คลัง", "สุทธิ"],
          align: [0, 0, 0, 0, 1],
          empty: "ยังไม่มีบิลในช่วงนี้",
          rows: inRange(c.db.sales || [], c)
            .slice()
            .sort((a, b) => b.ts - a.ts)
            .slice(0, 10)
            .map((s) => [
              thDate(s.date),
              s.docNo,
              s.customer || "—",
              c.inv.whName(s.whId),
              num(s.total, 2),
            ]),
        }),
      },
    ],
  },

  /* -------------------------------------------- ซื้อสินค้าและบริการ */
  {
    id: "purchase",
    name: "ซื้อสินค้าและบริการ",
    hint: "ใบซื้อ ยอดซื้อ ภาษีซื้อ และเจ้าหนี้",
    widgets: [
      {
        id: "pu_count",
        name: "จำนวนใบซื้อ",
        size: "kpi",
        build: (c) => ({
          kind: "kpi",
          icon: "report",
          label: "ใบซื้อในช่วง",
          value: num(inRange(c.db.purchases || [], c).length, 0) + " ใบ",
          sub: thDate(c.from) + " – " + thDate(c.to),
        }),
      },
      {
        id: "pu_total",
        name: "ยอดซื้อรวม",
        size: "kpi",
        build: (c) => {
          const list = inRange(c.db.purchases || [], c);
          return {
            kind: "kpi",
            icon: "chart",
            tone: "info",
            label: "ยอดซื้อรวม (สุทธิ)",
            value: "฿" + num(sum(list, (v) => v.total), 0),
            sub: "ก่อนภาษี ฿" + num(sum(list, (v) => v.base), 0),
          };
        },
      },
      {
        id: "pu_vat",
        name: "ภาษีซื้อ",
        size: "kpi",
        build: (c) => ({
          kind: "kpi",
          icon: "report",
          label: "ภาษีซื้อในช่วง",
          value: "฿" + num(sum(inRange(c.db.purchases || [], c), (v) => v.vat), 0),
          sub: "ใช้อ้างตอนยื่นภาษีซื้อ",
        }),
      },
      {
        id: "pu_return",
        name: "ยอดส่งคืน",
        size: "kpi",
        build: (c) => {
          const list = inRange(c.db.purchaseReturns || [], c);
          return {
            kind: "kpi",
            icon: "adjust",
            tone: list.length ? "warn" : "",
            label: "ส่งคืนเจ้าหนี้ในช่วง",
            value: num(list.length, 0) + " ใบ",
            sub: "มูลค่า ฿" + num(sum(list, (v) => v.total), 0),
          };
        },
      },
      {
        id: "pu_month",
        name: "กราฟยอดซื้อรายเดือน",
        size: "half",
        build: (c) => {
          const g = byMonth(inRange(c.db.purchases || [], c), c, (v) => v.total);
          return {
            kind: "bar",
            labels: g.labels,
            series: [{ name: "ยอดซื้อ (บาท)", color: "#0B5FA5", data: g.data }],
          };
        },
      },
      {
        id: "pu_sup",
        name: "กราฟ 10 อันดับเจ้าหนี้",
        size: "half",
        build: (c) => {
          const m = {};
          inRange(c.db.purchases || [], c).forEach((v) => {
            const k = v.supName || v.supCode || "(ไม่ระบุ)";
            m[k] = (m[k] || 0) + v.total;
          });
          return { kind: "hbar", items: top(m, 10).map((x) => ({ ...x, color: "#0B5FA5" })) };
        },
      },
      {
        id: "pu_recent",
        name: "ตารางใบซื้อล่าสุด",
        size: "full",
        build: (c) => ({
          kind: "table",
          head: ["วันที่", "เลขที่เอกสาร", "เลขที่ใบของเจ้าหนี้", "ชื่อเจ้าหนี้", "ก่อนภาษี", "ภาษี", "สุทธิ"],
          align: [0, 0, 0, 0, 1, 1, 1],
          empty: "ยังไม่มีใบซื้อในช่วงนี้",
          rows: inRange(c.db.purchases || [], c)
            .slice()
            .sort((a, b) => b.ts - a.ts)
            .slice(0, 12)
            .map((v) => [
              thDate(v.date),
              v.docNo,
              v.refNo || "—",
              v.supName,
              num(v.base, 2),
              num(v.vat, 2),
              num(v.total, 2),
            ]),
        }),
      },
    ],
  },

  /* ---------------------------------------------------------- จัดส่ง */
  {
    id: "ship",
    name: "งานจัดส่ง",
    hint: "สถานะการจัดส่ง เวลาที่ใช้แต่ละขั้น และปลายทาง",
    widgets: [
      {
        id: "sh_open",
        name: "ใบที่ยังส่งไม่ถึง",
        size: "kpi",
        build: (c) => {
          const list = inRange(c.db.invoices || [], c);
          const open = list.filter((v) => v.shipStatus !== "DELIVERED");
          return {
            kind: "kpi",
            icon: "map",
            tone: open.length ? "warn" : "ok",
            label: "ใบที่ยังส่งไม่ถึง",
            value: num(open.length, 0) + " ใบ",
            sub: "จากทั้งหมด " + num(list.length, 0) + " ใบในช่วง",
          };
        },
      },
      {
        id: "sh_done",
        name: "ใบที่ส่งถึงแล้ว",
        size: "kpi",
        build: (c) => {
          const list = inRange(c.db.invoices || [], c);
          const done = list.filter((v) => v.shipStatus === "DELIVERED");
          return {
            kind: "kpi",
            icon: "chart",
            tone: "ok",
            label: "ส่งถึงมือลูกค้าแล้ว",
            value: num(done.length, 0) + " ใบ",
            sub: list.length ? num((done.length / list.length) * 100, 0) + "% ของใบในช่วง" : "—",
          };
        },
      },
      {
        id: "sh_time",
        name: "เวลาเฉลี่ยทั้งกระบวนการ",
        size: "kpi",
        build: (c) => {
          const done = inRange(c.db.invoices || [], c)
            .map((v) => c.inv.shipTimeline(v))
            .filter((t) => t.totalMs > 0);
          const avg = done.length ? sum(done, (t) => t.totalMs) / done.length : 0;
          return {
            kind: "kpi",
            icon: "report",
            label: "เวลาเฉลี่ยทั้งกระบวนการ",
            value: fmtDuration(avg),
            sub: done.length ? "จาก " + num(done.length, 0) + " ใบที่มีเวลาบันทึกไว้" : "ยังไม่มีข้อมูลเวลา",
          };
        },
      },
      {
        id: "sh_km",
        name: "ระยะทางรวม",
        size: "kpi",
        build: (c) => {
          const list = inRange(c.db.invoices || [], c).filter((v) => v.shipKm !== null);
          return {
            kind: "kpi",
            icon: "map",
            label: "ระยะทางจัดส่งรวม",
            value: num(sum(list, (v) => v.shipKm), 0) + " กม.",
            sub: list.length ? "จาก " + num(list.length, 0) + " ใบที่คำนวณแล้ว" : "ยังไม่ได้คำนวณระยะทาง",
          };
        },
      },
      {
        id: "sh_status",
        name: "กราฟจำนวนใบแยกตามสถานะ",
        size: "half",
        build: (c) => {
          const list = inRange(c.db.invoices || [], c);
          return {
            kind: "hbar",
            items: SHIP_STATUS.map((st) => ({
              label: st.name,
              value: list.filter((v) => v.shipStatus === st.id).length,
              color: st.color,
            })).filter((x) => x.value > 0),
          };
        },
      },
      {
        id: "sh_steptime",
        name: "กราฟเวลาเฉลี่ยแต่ละขั้น (ชั่วโมง)",
        size: "half",
        build: (c) => {
          const tls = inRange(c.db.invoices || [], c).map((v) => c.inv.shipTimeline(v));
          return {
            kind: "hbar",
            items: SHIP_STATUS.slice(1).map((st, i) => {
              const vals = tls.map((t) => t.steps[i + 1].ms).filter((ms) => ms > 0);
              const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
              return {
                label: "ถึง" + st.short,
                value: Math.round((avg / 3600000) * 10) / 10,
                color: st.color,
              };
            }),
          };
        },
      },
      {
        id: "sh_province",
        name: "กราฟจำนวนใบแยกตามจังหวัดปลายทาง",
        size: "half",
        build: (c) => {
          const m = {};
          inRange(c.db.invoices || [], c).forEach((v) => {
            const k = v.custProvince || "(ไม่ระบุจังหวัด)";
            m[k] = (m[k] || 0) + 1;
          });
          return { kind: "hbar", items: top(m, 10).map((x) => ({ ...x, color: "var(--brand)" })) };
        },
      },
      {
        id: "sh_late",
        name: "ตารางใบที่ค้างนานที่สุด",
        size: "half",
        build: (c) => ({
          kind: "table",
          head: ["เลขที่เอกสาร", "ลูกค้า", "จังหวัด", "สถานะ", "ค้างมาแล้ว"],
          align: [0, 0, 0, 0, 0],
          empty: "ไม่มีใบที่ค้างอยู่",
          rows: inRange(c.db.invoices || [], c)
            .filter((v) => v.shipStatus !== "DELIVERED")
            .map((v) => ({ v, age: Date.now() - (v.shipTs || v.ts) }))
            .sort((a, b) => b.age - a.age)
            .slice(0, 10)
            .map((x) => [
              x.v.docNo,
              x.v.custName,
              x.v.custProvince || "—",
              (SHIP_STATUS.find((s) => s.id === x.v.shipStatus) || {}).name || x.v.shipStatus,
              fmtDuration(x.age),
            ]),
        }),
      },
    ],
  },

  /* ------------------------------------------------ ทำรายการคลังสินค้า */
  {
    id: "txn",
    name: "ทำรายการคลังสินค้า",
    hint: "รับ เบิก โอน ปรับปรุง แยกตามชนิดและคลัง",
    widgets: [
      {
        id: "tx_receive",
        name: "ปริมาณรับเข้า",
        size: "kpi",
        build: (c) => ({
          kind: "kpi",
          icon: "box",
          tone: "ok",
          label: "รับเข้าในช่วง",
          value: num(sum(inRange(c.db.txns, c).filter((t) => t.type === "RECEIVE"), (t) => t.qty), 0) + " หน่วย",
          sub: thDate(c.from) + " – " + thDate(c.to),
        }),
      },
      {
        id: "tx_issue",
        name: "ปริมาณเบิกออก",
        size: "kpi",
        build: (c) => ({
          kind: "kpi",
          icon: "adjust",
          label: "เบิกออกในช่วง",
          value: num(sum(inRange(c.db.txns, c).filter((t) => t.type === "ISSUE"), (t) => t.qty), 0) + " หน่วย",
          sub: "ไม่รวมการขาย",
        }),
      },
      {
        id: "tx_transfer",
        name: "จำนวนการโอน",
        size: "kpi",
        build: (c) => ({
          kind: "kpi",
          icon: "report",
          label: "การโอนระหว่างคลัง",
          value: num(inRange(c.db.txns, c).filter((t) => t.type === "TRANSFER").length, 0) + " รายการ",
          sub: "ยอดรวมทั้งระบบไม่เปลี่ยน",
        }),
      },
      {
        id: "tx_adjust",
        name: "ผลต่างจากการปรับปรุง",
        size: "kpi",
        build: (c) => {
          const adj = inRange(c.db.txns, c).filter((t) => t.type === "ADJUST");
          const net = sum(adj, (t) => t.qty);
          return {
            kind: "kpi",
            icon: "adjust",
            tone: net === 0 ? "" : net > 0 ? "ok" : "warn",
            label: "ผลต่างจากการปรับปรุง",
            value: (net > 0 ? "+" : "") + num(net, 0) + " หน่วย",
            sub: num(adj.length, 0) + " รายการปรับปรุง",
          };
        },
      },
      {
        id: "tx_kind",
        name: "กราฟจำนวนรายการแยกตามชนิด",
        size: "half",
        build: (c) => {
          const list = inRange(c.db.txns, c);
          return {
            kind: "hbar",
            items: Object.keys(TYPES)
              .map((k) => ({
                label: TYPES[k].name,
                value: list.filter((t) => t.type === k).length,
                color: "var(--brand)",
              }))
              .filter((x) => x.value > 0),
          };
        },
      },
      {
        id: "tx_wh",
        name: "กราฟปริมาณเคลื่อนไหวแยกตามคลัง",
        size: "half",
        build: (c) => {
          const m = {};
          c.db.warehouses.forEach((w) => {
            m[w.name] = sum(inRange(c.db.txns, c), (t) => Math.abs(movement(t, w.id)));
          });
          return { kind: "hbar", items: top(m, 10).map((x) => ({ ...x, color: "var(--brand-l)" })) };
        },
      },
    ],
  },
];

/** แหล่งข้อมูลจากรหัส ไม่รู้จักคืน null ให้ผู้เรียกจัดการเอง */
export const sourceOf = (id) => DASH_SOURCES.find((s) => s.id === id) || null;

/** การ์ดทุกใบของทุกแหล่ง ใช้ตรวจว่ารหัสไม่ซ้ำกันข้ามแหล่ง */
export const allWidgets = () => DASH_SOURCES.flatMap((s) => s.widgets);

/** ชนิดของสิ่งที่วาดได้ หน้าจอต้องรู้จักครบทุกตัวนี้ */
export const WIDGET_KINDS = ["kpi", "bar", "hbar", "line", "table"];

/** ความกว้างที่ใช้จัดตำแหน่ง */
export const WIDGET_SIZES = ["kpi", "half", "full"];

/**
 * คำนวณการ์ดที่เลือกไว้
 *
 * ตัวไหนคำนวณพลาดไม่ล้มทั้งหน้า — คืนการ์ดที่บอกว่าพลาดแทน
 * เพราะแดชบอร์ดรวมของหลายที่ไว้ด้วยกัน ข้อมูลเสียจุดเดียวไม่ควรทำให้ดูอย่างอื่นไม่ได้
 */
export function buildWidgets(source, picked, ctx) {
  return source.widgets
    .filter((w) => picked.includes(w.id))
    .map((w) => {
      try {
        return { ...w, data: w.build(ctx) };
      } catch (e) {
        return {
          ...w,
          data: {
            kind: "kpi",
            icon: "adjust",
            tone: "warn",
            label: w.name,
            value: "แสดงไม่ได้",
            sub: e.message,
          },
        };
      }
    });
}

/**
 * จัดการ์ดเป็นแถวตามความกว้าง
 *
 * การ์ดตัวเลขเรียงสี่ใบต่อแถว ครึ่งความกว้างสองใบต่อแถว เต็มความกว้างอยู่คนเดียว
 * จัดให้เองแบบนี้แทนการให้ลากวาง เพราะคนใช้ต้องการ "เลือกแล้วสวยเลย"
 * ไม่ได้ต้องการมานั่งจัดหน้าจอเอง และการลากวางบนมือถือก็ใช้แทบไม่ได้
 */
export function layoutRows(widgets) {
  const rows = [];
  let cur = null;

  widgets.forEach((w) => {
    const per = w.size === "kpi" ? 4 : w.size === "half" ? 2 : 1;
    if (!cur || cur.size !== w.size || cur.items.length >= per) {
      cur = { size: w.size, per, items: [] };
      rows.push(cur);
    }
    cur.items.push(w);
  });

  return rows;
}
