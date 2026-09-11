"use client";

// ตั้งค่าการเชื่อมต่อไลน์ — บอกวิธีต่อ และบอกว่าตอนนี้ต่อได้แล้วหรือยัง
//
// ---------------------------------------------------------------------------
// ทำไมต้องมีหน้านี้
//
// การรับข้อความอัตโนมัติต้องตั้งค่าสองฝั่งให้ตรงกัน (ฝั่งไลน์กับฝั่ง Vercel)
// ถ้าไม่มีหน้านี้ คนตั้งค่าต้องเปิดเอกสารสลับไปมาแล้วเดาว่าพลาดตรงไหน
// หน้านี้บอกตรง ๆ ว่า "ฝั่งเซิร์ฟเวอร์พร้อมแล้วหรือยัง" และคัดลอกที่อยู่ webhook ให้เลย
//
// ค่าที่เป็นความลับ (channel secret, service role key) ไม่ได้เก็บในฐานข้อมูล
// แต่อยู่ใน Environment Variables ของ Vercel เพราะ:
//   1. ทุกคนที่ล็อกอินระบบนี้อ่านฐานข้อมูลได้หมด ความลับจึงไม่ควรอยู่ในนั้น
//   2. ค่าในฐานข้อมูลจะติดไปกับไฟล์สำรองข้อมูลด้วย
//   3. ตัวรับข้อความรันฝั่งเซิร์ฟเวอร์ อ่าน env ได้อยู่แล้ว ไม่ต้องผ่านฐานข้อมูล
// หน้านี้จึงเป็นหน้า "อ่านและทำตาม" ไม่ใช่หน้ากรอกความลับ

import { useCallback, useEffect, useState } from "react";
import { useInv } from "@/lib/store";
import { getAccessToken } from "@/lib/supabase";
import { useToast } from "../Toast";
import { Badge, Card, Empty, TableWrap } from "../ui";
import SetupNotice from "../SetupNotice";
import { LINE_TABLES } from "./lineShared";

/** ค่าที่ต้องตั้งใน Vercel — ชื่อและเหตุผลที่ต้องมี */
const ENV_ROWS = [
  {
    key: "LINE_CHANNEL_SECRET",
    what: "ความลับของช่องทาง (Channel secret) จากหน้า Messaging API",
    why: "ใช้ตรวจว่าคำขอที่เข้ามาเป็นของไลน์จริง ไม่ใช่ใครก็ได้ที่เดา URL ถูก",
    field: "channelSecret",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    what: "กุญแจ service_role จาก Supabase > Settings > API",
    why: "คำขอจากไลน์ไม่มีผู้ใช้ล็อกอินอยู่ จึงเขียนฐานข้อมูลด้วยกุญแจปกติไม่ได้",
    field: "serviceKey",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    what: "ที่อยู่โปรเจกต์ Supabase (ตั้งไว้แล้วตั้งแต่ติดตั้งระบบ)",
    why: "บอกว่าจะเขียนข้อความลงฐานข้อมูลไหน",
    field: "url",
  },
];

const STEPS = [
  {
    t: "สร้างบัญชีทางการ (LINE Official Account)",
    d: "ที่ manager.line.biz — บัญชีส่วนตัวใช้ไม่ได้ เพราะไลน์ไม่เปิด API ให้บัญชีบุคคล",
  },
  {
    t: "เปิด Messaging API ให้บัญชีนั้น",
    d: "ในหน้าจัดการบัญชีทางการ เลือก Settings > Messaging API แล้วกดเปิดใช้",
  },
  {
    t: "คัดลอก Channel secret",
    d: "ที่ developers.line.biz เลือกช่องทางของคุณ แท็บ Basic settings",
  },
  {
    t: "ใส่ค่าใน Vercel แล้ว Redeploy หนึ่งครั้ง",
    d: "Vercel > Settings > Environment Variables — ค่าที่เพิ่งใส่จะมีผลหลัง deploy รอบถัดไปเท่านั้น",
  },
  {
    t: "วางที่อยู่ webhook ในหน้า Messaging API แล้วกด Verify",
    d: "ต้องขึ้น Success — ถ้าไม่ขึ้น แปลว่าค่าใน Vercel ยังไม่ครบหรือยังไม่ได้ redeploy",
  },
  {
    t: "เปิด Use webhook และปิดการตอบกลับอัตโนมัติ",
    d: "ปิด Auto-reply messages และ Greeting messages ไม่งั้นลูกค้าจะได้ข้อความตอบกลับอัตโนมัติทับการคุยจริง",
  },
];

export default function LineSetup({ onNavigate }) {
  const inv = useInv();
  const toast = useToast();

  const [status, setStatus] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("");

  // ที่อยู่เว็บรู้ได้หลัง mount เท่านั้น แตะ window ตอน render จะพังตอน server render
  useEffect(() => {
    try {
      setOrigin(window.location.origin);
    } catch (e) {
      setOrigin("");
    }
  }, []);

  const check = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/line/webhook", {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body && body.error ? body.error : "ตรวจสถานะไม่ได้");
      setStatus(body);
    } catch (e) {
      setErr(e.message || "ตรวจสถานะไม่ได้");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const hookUrl = origin ? origin + "/api/line/webhook" : "/api/line/webhook";

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(hookUrl);
      toast("คัดลอกที่อยู่ webhook แล้ว", "ok");
    } catch (e) {
      toast("คัดลอกไม่ได้ — กรุณาเลือกข้อความแล้วคัดลอกเอง", "warn");
    }
  }

  if (!inv.lineReady) {
    return <SetupNotice feature="งานผ่านไลน์" tables={LINE_TABLES} />;
  }

  const ok = status && status.ready;

  return (
    <div className="stack">
      <Card
        title="ตั้งค่าการเชื่อมต่อไลน์"
        actions={
          <>
            {loading ? (
              <Badge>กำลังตรวจ…</Badge>
            ) : ok ? (
              <Badge kind="ok">พร้อมรับข้อความอัตโนมัติ</Badge>
            ) : (
              <Badge kind="warn">ยังตั้งค่าไม่ครบ</Badge>
            )}
            <button className="btn btn-g btn-sm" onClick={check} disabled={loading}>
              ตรวจใหม่
            </button>
          </>
        }
      >
        {/* ใช้งานได้ทันทีโดยไม่ต้องตั้งค่าอะไรเลย ต้องบอกไว้ตั้งแต่บรรทัดแรก
            ไม่งั้นคนจะคิดว่าต้องมีบัญชีทางการก่อนถึงจะเริ่มใช้หมวดนี้ได้ */}
        <div className="note" style={{ marginBottom: 14 }}>
          <b>ยังไม่มีบัญชีทางการก็ใช้งานได้</b> — ที่หน้า
          <button
            className="btn btn-g btn-sm"
            style={{ margin: "0 6px" }}
            onClick={() => onNavigate && onNavigate("lineinbox")}
          >
            กล่องข้อความจากไลน์
          </button>
          เลือก “นำเข้าไฟล์แชท” (ไฟล์ .txt ที่ส่งออกจากแอปไลน์) หรือ “วางข้อความ”
          ได้เลย ทำเอกสารได้ครบเหมือนกันทุกอย่าง การตั้งค่าในหน้านี้ทำให้ข้อความ
          <b> ไหลเข้ามาเองตอนลูกค้าพิมพ์</b> เท่านั้น
        </div>

        <h4 style={{ margin: "0 0 9px", fontSize: 14.5 }}>ที่อยู่ webhook ของระบบนี้</h4>
        <div className="row" style={{ flexWrap: "nowrap", marginBottom: 6 }}>
          <input className="inp" value={hookUrl} readOnly aria-label="ที่อยู่ webhook" />
          <button className="btn btn-o btn-sm" style={{ whiteSpace: "nowrap" }} onClick={copyUrl}>
            คัดลอก
          </button>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          วางค่านี้ในช่อง Webhook URL ที่ developers.line.biz แท็บ Messaging API
        </p>

        {err ? (
          <div className="note err" style={{ marginTop: 12 }}>
            ตรวจสถานะไม่ได้: {err}
          </div>
        ) : null}
      </Card>

      <Card title="ค่าที่ต้องตั้งใน Vercel">
        <p className="hint" style={{ marginTop: 0 }}>
          ระบบบอกได้แค่ว่า <b>ตั้งไว้แล้วหรือยัง</b> ไม่เคยแสดงค่าจริงออกมา
          และค่าเหล่านี้ไม่ได้เก็บในฐานข้อมูล จึงไม่ติดไปกับไฟล์สำรองข้อมูล
        </p>
        <TableWrap>
          <thead>
            <tr>
              <th style={{ minWidth: 230 }}>ชื่อค่า</th>
              <th style={{ minWidth: 240 }}>เอาค่ามาจากไหน</th>
              <th style={{ minWidth: 260 }}>ทำไมต้องมี</th>
              <th style={{ width: 120 }}>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {ENV_ROWS.map((r) => {
              const set = status && status.configured && status.configured[r.field];
              return (
                <tr key={r.key}>
                  <td className="code-cell">{r.key}</td>
                  <td style={{ fontSize: 13 }}>{r.what}</td>
                  <td style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>{r.why}</td>
                  <td>
                    {loading ? (
                      <Badge>กำลังตรวจ</Badge>
                    ) : set ? (
                      <Badge kind="ok">ตั้งแล้ว</Badge>
                    ) : (
                      <Badge kind="err">ยังไม่ได้ตั้ง</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </Card>

      <Card title="ขั้นตอนการเชื่อมต่อ">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          {STEPS.map((s, i) => (
            <li key={i} style={{ marginBottom: 8 }}>
              <b>{s.t}</b>
              <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>{s.d}</div>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="ข้อควรรู้">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, fontSize: 13.5 }}>
          <li>
            ระบบ <b>รับอย่างเดียว ไม่ตอบกลับลูกค้า</b> — การตอบยังทำในแอปไลน์ตามปกติ
            เพราะข้อความที่ระบบตอบเองจะไปโผล่ในแชทจริงของลูกค้า ซึ่งพลาดแล้วแก้ไม่ได้
          </li>
          <li>
            ข้อความที่รับมาจะไปอยู่ที่กล่องข้อความ <b>ยังไม่เป็นเอกสารอะไรทั้งนั้น</b>
            ต้องมีคนกดตรวจและยืนยันที่หน้าคำสั่งซื้อก่อนเสมอ
          </li>
          <li>
            รูปภาพ สติกเกอร์ และไฟล์ ถูกบันทึกว่ามีเข้ามา แต่แปลงเป็นรายการสินค้าไม่ได้
            ถ้าลูกค้าส่งรูปรายการสั่งของมา ต้องพิมพ์เองที่หน้าคำสั่งซื้อ
          </li>
          <li>
            ไลน์ไม่ได้ส่งชื่อผู้ส่งมากับข้อความ ระบบจึงเว้นช่องชื่อไว้ให้เติมตอนตรวจ
            ถ้าจับคู่กับลูกค้าในทะเบียนแล้ว เอกสารจะได้ที่อยู่และเลขผู้เสียภาษีครบเอง
          </li>
          <li>
            เปลี่ยนค่าใน Vercel แล้วต้อง <b>Redeploy หนึ่งครั้ง</b> ค่าใหม่ถึงจะมีผล
          </li>
        </ul>
      </Card>
    </div>
  );
}
