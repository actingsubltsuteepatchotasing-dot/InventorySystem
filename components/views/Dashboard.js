"use client";

// แดชบอร์ดที่เลือกได้ว่าจะดูอะไร
//
// เลือกสองชั้น:
//   1. ดรอปดาวน์เลือกหน้าจอที่จะดูข้อมูล (ภาพรวมคลัง / ขายสินค้าและบริการ / POS /
//      ซื้อสินค้าและบริการ / งานจัดส่ง / ทำรายการคลังสินค้า)
//   2. ติ๊กเลือกว่าจะเอาการ์ดหรือกราฟใบไหนมาแสดง
// แล้วระบบจัดตำแหน่งให้เอง ไม่ต้องลากวาง
//
// ทำไมจัดตำแหน่งให้เองแทนการลากวาง:
//   คนใช้ต้องการ "เลือกแล้วสวยเลย" ไม่ได้ต้องการมานั่งจัดหน้าจอ
//   และการลากวางบนมือถือใช้แทบไม่ได้เลย
//   การ์ดแต่ละใบบอกความกว้างของตัวเองมา (เล็ก / ครึ่ง / เต็ม) แล้วจัดเป็นแถวให้ตามนั้น
//
// สิ่งที่จะวาดมาจาก lib/dashWidgets.js เป็น "คำอธิบายสิ่งที่จะวาด" ไม่ใช่ JSX
//   หน้านี้จึงวาดตามชนิดที่ได้มา (kpi / bar / hbar / line / table)
//   เพิ่มการ์ดใหม่ในไฟล์นั้นแล้วใช้ได้ทันที ไม่ต้องมาเขียนตัววาดเพิ่มที่นี่
//   ตัดปัญหา "ประกาศไว้แต่ติ๊กแล้วไม่มีอะไรขึ้น" ไปในตัว
//
// สิ่งที่เลือกไว้เก็บในเครื่องนี้ (localStorage) ไม่ขึ้นฐานข้อมูล
//   เพราะเป็นความชอบส่วนตัวของแต่ละคน ไม่ใช่ข้อมูลของกิจการ
//   คนบัญชีกับคนคลังเปิดเครื่องตัวเองแล้วควรเห็นของที่ตัวเองเลือกไว้ ไม่ใช่ของคนอื่น

import { useEffect, useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { stockMap } from "@/lib/db";
import { DASH_SOURCES, buildWidgets, layoutRows, sourceOf } from "@/lib/dashWidgets";
import { monthsAgoISO, num, thDate, todayISO } from "@/lib/format";
import { BarChart, HBarChart, LineChart, Legend } from "../Charts";
import { IcAdjust, IcBox, IcCart, IcChart, IcMap, IcReport } from "../Icons";
import { Badge, Card, Empty, Kpi, SearchSelect, TableWrap } from "../ui";

/** ช่วงเวลาสำเร็จรูปให้กดเลือกเร็ว ๆ */
const QUICK = [
  { id: "today", name: "วันนี้", from: () => todayISO() },
  { id: "m1", name: "เดือนนี้", from: () => monthsAgoISO(0) },
  { id: "m3", name: "3 เดือน", from: () => monthsAgoISO(2) },
  { id: "m6", name: "6 เดือน", from: () => monthsAgoISO(5) },
  { id: "m12", name: "12 เดือน", from: () => monthsAgoISO(11) },
];

/** ไอคอนของการ์ดตัวเลข — การ์ดบอกมาเป็นชื่อ ไม่ได้ส่ง component มาเอง */
const ICONS = {
  box: IcBox,
  chart: IcChart,
  adjust: IcAdjust,
  report: IcReport,
  cart: IcCart,
  map: IcMap,
};

const KEY = "ultraerp.dash.";

const readPick = (sourceId, fallback) => {
  try {
    const raw = localStorage.getItem(KEY + sourceId);
    if (!raw) return fallback;
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : fallback;
  } catch (e) {
    return fallback; // เบราว์เซอร์ปิด storage — ใช้ค่าตั้งต้นไปก่อน ยังใช้งานได้ปกติ
  }
};

const writePick = (sourceId, list) => {
  try {
    localStorage.setItem(KEY + sourceId, JSON.stringify(list));
  } catch (e) {
    // เก็บไม่ได้ก็ไม่เป็นไร แค่เปิดใหม่แล้วกลับไปเป็นค่าตั้งต้น
  }
};

const readSource = () => {
  try {
    const id = localStorage.getItem(KEY + "source");
    return sourceOf(id) ? id : DASH_SOURCES[0].id;
  } catch (e) {
    return DASH_SOURCES[0].id;
  }
};

/** ค่าตั้งต้น: เปิดมาครั้งแรกให้ติ๊กไว้ทั้งหมด จะได้เห็นว่ามีอะไรให้ดูบ้าง */
const allIds = (s) => s.widgets.map((w) => w.id);

export default function Dashboard({ onNavigate }) {
  const inv = useInv();

  /*
   * สิทธิของหน้าจอนี้ — ไม่ติ๊ก "เปลี่ยนวันที่" แล้วช่องวันที่ล็อกไว้
   * (ดูหน้ากำหนดสิทธิการใช้งาน)
   */
  const perm = inv.perm("dash");
  const { db } = inv;

  const [sourceId, setSourceId] = useState(DASH_SOURCES[0].id);
  const [picked, setPicked] = useState(() => allIds(DASH_SOURCES[0]));
  const [setup, setSetup] = useState(false);

  // ค่าเริ่มต้น 6 เดือนล่าสุด เท่ากับกราฟที่เคยแสดงไว้เดิม
  const [from, setFrom] = useState(() => monthsAgoISO(5));
  const [to, setTo] = useState(todayISO);

  // อ่านของที่เลือกไว้หลัง mount เท่านั้น — localStorage ไม่มีตอน render ฝั่งเซิร์ฟเวอร์
  // ถ้าอ่านตอน render จะได้ HTML สองฝั่งไม่ตรงกัน
  useEffect(() => {
    const id = readSource();
    const s = sourceOf(id) || DASH_SOURCES[0];
    setSourceId(id);
    setPicked(readPick(id, allIds(s)));
  }, []);

  const source = sourceOf(sourceId) || DASH_SOURCES[0];
  const badRange = !!from && !!to && from > to;

  function pickSource(id) {
    const s = sourceOf(id) || DASH_SOURCES[0];
    setSourceId(id);
    setPicked(readPick(id, allIds(s)));
    try {
      localStorage.setItem(KEY + "source", id);
    } catch (e) {
      // เก็บไม่ได้ก็ใช้งานต่อได้ แค่เปิดใหม่แล้วกลับไปหน้าตั้งต้น
    }
  }

  function toggle(id) {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    setPicked(next);
    writePick(sourceId, next);
  }

  function pickAll(on) {
    const next = on ? allIds(source) : [];
    setPicked(next);
    writePick(sourceId, next);
  }

  /*
   * คำนวณเฉพาะการ์ดที่ติ๊กไว้ ไม่ได้คำนวณทุกใบแล้วค่อยซ่อน
   * เพราะบางใบต้องไล่ทั้งตารางเคลื่อนไหว ถ้าคำนวณทิ้งไว้ทุกใบจะช้าโดยไม่ได้ใช้
   */
  const widgets = useMemo(() => {
    if (badRange) return [];
    const ctx = { db, inv, from, to, asOf: stockMap(db, to) };
    return buildWidgets(source, picked, ctx);
  }, [db, inv, from, to, source, picked, badRange]);

  const rows = useMemo(() => layoutRows(widgets), [widgets]);

  return (
    <div className="stack">
      <Card
        title="เลือกสิ่งที่จะแสดงบนแดชบอร์ด"
        actions={
          <>
            <Badge kind={picked.length ? "info" : "gray"}>
              เลือกไว้ {picked.length} จาก {source.widgets.length}
            </Badge>
            <button className="btn btn-g btn-sm" onClick={() => setSetup(!setup)}>
              {setup ? "ซ่อนตัวเลือก" : "เลือกการ์ดที่จะแสดง"}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field span2">
            <label className="lbl" htmlFor="d_src">หน้าจอที่จะดูข้อมูล</label>
            <SearchSelect
              id="d_src"
              value={sourceId}
              onChange={pickSource}
              options={DASH_SOURCES.map((s) => ({ value: s.id, label: s.name, meta: s.hint }))}
              notFound="ไม่พบหน้าจอที่ตรงกับ"
            />
            <span className="hint">{source.hint}</span>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="d_from">ตั้งแต่วันที่</label>
            <input
              className="inp"
              type="date"
              id="d_from"
              value={from}
              disabled={!perm.date}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="d_to">ถึงวันที่</label>
            <input
              className="inp"
              type="date"
              id="d_to"
              value={to}
              disabled={!perm.date}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          <div className="field span2">
            <label className="lbl">ช่วงเวลาที่ใช้บ่อย</label>
            <div className="cs-tabs" style={{ marginBottom: 0 }}>
              {QUICK.map((q) => (
                <button
                  key={q.id}
                  className="cs-tab"
                  onClick={() => {
                    setFrom(q.from());
                    setTo(todayISO());
                  }}
                  disabled={!perm.date}
                >
                  {q.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {badRange ? (
          <div className="hint" style={{ color: "var(--err)" }}>
            วันที่เริ่มต้นอยู่หลังวันสิ้นสุด — กรุณาแก้ก่อน
          </div>
        ) : null}

        {/* รายการติ๊กเลือก ซ่อนไว้ตอนปกติ เพราะตั้งครั้งเดียวแล้วไม่ค่อยเปลี่ยน */}
        {setup ? (
          <>
            <div className="row" style={{ gap: 8, margin: "12px 0 4px" }}>
              <button className="btn btn-g btn-sm" onClick={() => pickAll(true)}>
                เลือกทั้งหมด
              </button>
              <button className="btn btn-g btn-sm" onClick={() => pickAll(false)}>
                ไม่เลือกเลย
              </button>
              <span className="hint" style={{ alignSelf: "center" }}>
                สิ่งที่เลือกไว้จำไว้ในเครื่องนี้ แยกตามหน้าจอที่เลือก
              </span>
            </div>

            <div className="dash-pick">
              {source.widgets.map((w) => (
                <label className="dash-opt" key={w.id} htmlFor={"w_" + w.id}>
                  <input
                    id={"w_" + w.id}
                    className="chk"
                    type="checkbox"
                    checked={picked.includes(w.id)}
                    onChange={() => toggle(w.id)}
                  />
                  <span>
                    <b>{w.name}</b>
                    <i>
                      {w.size === "kpi"
                        ? "การ์ดตัวเลข"
                        : w.size === "half"
                          ? "ครึ่งความกว้าง"
                          : "เต็มความกว้าง"}
                    </i>
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : null}
      </Card>

      {badRange ? null : widgets.length ? (
        rows.map((row, i) => (
          <div
            key={i}
            className={row.per === 4 ? "grid g4" : row.per === 2 ? "grid g2" : "stack"}
          >
            {row.items.map((w) => (
              <Widget key={w.id} widget={w} onNavigate={onNavigate} />
            ))}
          </div>
        ))
      ) : (
        <Card title="ยังไม่ได้เลือกอะไรมาแสดง">
          <Empty>
            กดปุ่ม “เลือกการ์ดที่จะแสดง” ด้านบน แล้วติ๊กสิ่งที่อยากเห็นบนแดชบอร์ด
          </Empty>
        </Card>
      )}
    </div>
  );
}

/** วาดการ์ดหนึ่งใบตามชนิดที่ได้มา */
function Widget({ widget, onNavigate }) {
  const d = widget.data;

  if (d.kind === "kpi") {
    const Icon = ICONS[d.icon] || IcChart;
    return (
      <Kpi
        icon={<Icon size={18} stroke={1.9} />}
        label={d.label}
        value={d.value}
        sub={d.sub}
        kind={d.tone || ""}
      />
    );
  }

  if (d.kind === "bar") {
    return (
      <Card title={widget.name} actions={<Badge>{d.labels.length} เดือน</Badge>}>
        {d.labels.length ? (
          <>
            <div className="chart">
              <BarChart labels={d.labels} series={d.series} />
            </div>
            <Legend items={d.series.map((s) => ({ name: s.name, color: s.color }))} />
          </>
        ) : (
          <Empty>ช่วงเวลาที่เลือกไม่มีเดือนให้แสดง</Empty>
        )}
      </Card>
    );
  }

  if (d.kind === "line") {
    return (
      <Card title={widget.name}>
        {d.labels.length ? (
          <div className="chart">
            <LineChart labels={d.labels} data={d.data} color={d.color} />
          </div>
        ) : (
          <Empty>ยังไม่มีข้อมูลในช่วงนี้</Empty>
        )}
      </Card>
    );
  }

  if (d.kind === "hbar") {
    return (
      <Card title={widget.name} actions={<Badge>{d.items.length} รายการ</Badge>}>
        {d.items.length ? (
          <div className="chart">
            <HBarChart items={d.items} />
          </div>
        ) : (
          <Empty>ยังไม่มีข้อมูลในช่วงนี้</Empty>
        )}
      </Card>
    );
  }

  if (d.kind === "table") {
    return (
      <Card
        title={widget.name}
        actions={
          onNavigate ? (
            <button className="btn btn-o btn-sm" onClick={() => onNavigate("reports")}>
              ดูรายงานทั้งหมด
            </button>
          ) : null
        }
      >
        {d.rows.length ? (
          <div className="doc-scroll" style={{ maxHeight: 360 }}>
            <TableWrap>
              <thead>
                <tr>
                  {d.head.map((h, i) => (
                    <th key={h} className={d.align && d.align[i] ? "num" : ""}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((cell, j) => (
                      <td key={j} className={d.align && d.align[j] ? "num" : ""}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        ) : (
          <Empty>{d.empty || "ยังไม่มีข้อมูล"}</Empty>
        )}
      </Card>
    );
  }

  // ชนิดที่หน้าจอยังไม่รู้จัก — บอกให้เห็น ไม่ปล่อยให้เป็นช่องว่างเงียบ ๆ
  return (
    <Card title={widget.name}>
      <Empty>ยังแสดงชนิด “{String(d.kind)}” ไม่ได้</Empty>
    </Card>
  );
}
