"use client";

// หน้าวิธีการใช้งาน — อธิบายว่าแต่ละหน้าจอทำอะไร และเชื่อมโยงกับหน้าไหนบ้าง
//
// สองมุมมองในหน้าเดียว เพราะคนเข้ามาด้วยคำถามคนละแบบ:
//   "งานนี้เริ่มตรงไหน"     -> ดูสายงาน (Flow) ที่เรียงเป็นทอด ๆ
//   "หน้านี้ทำอะไร"          -> ค้นหาชื่อหน้าจอแล้วอ่านการ์ดของหน้านั้น
//
// ทุกชื่อหน้าจอในหน้านี้กดแล้วกระโดดไปหน้าจริงได้ ไม่ใช่ข้อความที่ต้องไปหาเอง
// เนื้อหาอยู่ใน lib/guide.js และมีตัวตรวจหมวด 18 คุมว่าครอบคลุมทุกหน้าจอ

import { useMemo, useState } from "react";
import { useInv } from "@/lib/store";
import { SCREENS } from "@/lib/constants";
import { FLOWS, GUIDES, flowsOf, guideOf, searchGuides } from "@/lib/guide";
import { useToast } from "../Toast";
import { usePrint } from "../Print";
import { Badge, Card, Empty, PrintPair } from "../ui";

/** ชื่อหน้าจอจากรหัส — หน้าที่ถูกลบไปแล้วคืนรหัสดิบ ไม่ทำให้คู่มือพัง */
const nameOf = (id) => {
  const s = SCREENS.find((x) => x.id === id);
  return s ? s.name : id;
};

export default function Guide({ onNavigate }) {
  const inv = useInv();
  const toast = useToast();
  const print = usePrint();

  const [q, setQ] = useState("");
  const [flowId, setFlowId] = useState(FLOWS[0].id);

  /** หน้าจอที่ผู้ใช้เห็นได้เท่านั้น — ปิดสิทธิหน้าไหนไว้ คู่มือก็ไม่ควรพาไป */
  const visible = useMemo(() => SCREENS.filter((s) => inv.perm(s.id).view), [inv]);
  const found = useMemo(() => searchGuides(visible, q), [visible, q]);
  const flow = FLOWS.find((f) => f.id === flowId) || FLOWS[0];

  /** กลุ่มเมนู -> รายการหน้าจอ เพื่อให้อ่านเรียงเป็นกลุ่มเหมือนเมนูจริง */
  const groups = useMemo(() => {
    const map = new Map();
    found.forEach((s) => {
      if (!map.has(s.group)) map.set(s.group, []);
      map.get(s.group).push(s);
    });
    return [...map.entries()];
  }, [found]);

  function go(id) {
    if (!onNavigate) return;
    if (!inv.perm(id).view) return toast("ไม่มีสิทธิเข้าหน้า " + nameOf(id), "err");
    onNavigate(id);
  }

  function printAll() {
    print({
      title: "คู่มือการใช้งาน",
      subtitle: "ทุกหน้าจอและความเชื่อมโยง · " + visible.length + " หน้าจอ",
      body: (
        <>
          {FLOWS.map((f) => (
            <div key={f.id} style={{ marginBottom: 14 }}>
              <h3>{f.name}</h3>
              <p>{f.goal}</p>
              <table>
                <thead>
                  <tr>
                    <th>ลำดับ</th>
                    <th>หน้าจอ</th>
                    <th>ทำอะไร</th>
                    <th>ได้อะไร</th>
                  </tr>
                </thead>
                <tbody>
                  {f.steps.map((s, i) => (
                    <tr key={s.screen}>
                      <td>{i + 1}</td>
                      <td>{nameOf(s.screen)}</td>
                      <td>{s.act}</td>
                      <td>{s.out}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <h3>รายละเอียดรายหน้าจอ</h3>
          <table>
            <thead>
              <tr>
                <th>หน้าจอ</th>
                <th>ทำอะไร</th>
                <th>ขั้นตอน</th>
                <th>รับข้อมูลจาก</th>
                <th>ส่งต่อไปที่</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const g = guideOf(s.id);
                if (!g) return null;
                return (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{g.what}</td>
                    <td>{(g.how || []).join(" → ")}</td>
                    <td>{(g.from || []).map(nameOf).join(", ") || "—"}</td>
                    <td>{(g.next || []).map(nameOf).join(", ") || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ),
    });
  }

  return (
    <div className="stack">
      <Card
        title="สายงาน — งานนี้เริ่มที่ไหน ไปจบที่ไหน"
        actions={<PrintPair onPrint={printAll} toast={toast} label="พิมพ์คู่มือทั้งเล่ม" />}
      >
        <div className="cs-tabs" style={{ marginBottom: 12 }}>
          {FLOWS.map((f) => (
            <button
              key={f.id}
              className={"cs-tab" + (f.id === flowId ? " on" : "")}
              onClick={() => setFlowId(f.id)}
            >
              {f.name.split(" — ")[0]}
            </button>
          ))}
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          <b>{flow.name}</b> — {flow.goal}
        </p>

        {/* สายงานเป็นลูกโซ่ กดที่ขั้นไหนก็กระโดดไปหน้านั้นได้เลย */}
        <ol className="flow-chain">
          {flow.steps.map((s, i) => (
            <li key={s.screen}>
              <button className="flow-step" onClick={() => go(s.screen)} title={"ไปที่ " + nameOf(s.screen)}>
                <span className="flow-n">{i + 1}</span>
                <span className="flow-name">{nameOf(s.screen)}</span>
                <span className="flow-act">{s.act}</span>
                <span className="flow-out">→ {s.out}</span>
              </button>
            </li>
          ))}
        </ol>
      </Card>

      <Card
        title="คู่มือรายหน้าจอ"
        actions={
          <Badge kind={found.length ? "info" : "gray"}>
            {found.length} / {visible.length} หน้าจอ
          </Badge>
        }
      >
        <input
          className="inp"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาชื่อหน้าจอ หรือสิ่งที่อยากทำ เช่น ตรวจนับ · เป้าขาย · พิมพ์ฟอร์ม"
          aria-label="ค้นหาในคู่มือ"
          style={{ marginBottom: 14 }}
        />

        {found.length ? (
          groups.map(([group, list]) => (
            <div key={group} style={{ marginBottom: 18 }}>
              <div className="lbl" style={{ marginBottom: 8 }}>
                {group}
              </div>
              <div className="grid g2">
                {list.map((s) => {
                  const g = guideOf(s.id);
                  const inFlows = flowsOf(s.id);
                  return (
                    <div key={s.id} className="guide-card">
                      <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                        <b>{s.name}</b>
                        {onNavigate ? (
                          <button className="btn btn-o btn-sm" onClick={() => go(s.id)}>
                            ไปที่หน้านี้
                          </button>
                        ) : null}
                      </div>
                      <p className="muted" style={{ margin: "6px 0 10px" }}>
                        {g.what}
                      </p>

                      <div className="lbl">ขั้นตอนการใช้งาน</div>
                      <ol className="guide-steps">
                        {g.how.map((h) => (
                          <li key={h}>{h}</li>
                        ))}
                      </ol>

                      {g.writes && g.writes.length ? (
                        <>
                          <div className="lbl">กดบันทึกแล้วเกิดอะไรขึ้น</div>
                          <ul className="guide-steps">
                            {g.writes.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <p className="muted" style={{ fontSize: 12.5 }}>
                          หน้านี้ดูอย่างเดียว ไม่ได้บันทึกข้อมูล
                        </p>
                      )}

                      {g.from && g.from.length ? (
                        <div className="guide-links">
                          <span className="lbl">รับข้อมูลจาก</span>
                          {g.from.map((id) => (
                            <button key={id} className="chip" onClick={() => go(id)}>
                              {nameOf(id)}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {g.next && g.next.length ? (
                        <div className="guide-links">
                          <span className="lbl">ส่งต่อไปที่</span>
                          {g.next.map((id) => (
                            <button key={id} className="chip" onClick={() => go(id)}>
                              {nameOf(id)}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {inFlows.length ? (
                        <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
                          อยู่ในสายงาน: {inFlows.map((f) => f.name.split(" — ")[0]).join(" · ")}
                        </p>
                      ) : null}

                      {g.tip ? <p className="guide-tip">⚠ {g.tip}</p> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <Empty>ไม่พบหน้าจอที่ตรงกับคำค้น</Empty>
        )}
      </Card>
    </div>
  );
}
