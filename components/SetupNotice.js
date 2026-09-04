"use client";

// แจ้งเตือนเมื่อฟีเจอร์ใหม่ยังใช้ไม่ได้เพราะฐานข้อมูลยังไม่มีตารางของฟีเจอร์นั้น
// ระบบส่วนอื่นยังทำงานได้ตามปกติ

import { useInv } from "@/lib/store";

/** การ์ดเต็มหน้าจอ ใช้แทนหน้าจอที่ยังใช้ไม่ได้ */
export default function SetupNotice({ feature, tables }) {
  const { missingTables, reload } = useInv();
  const need = tables.filter((t) => missingTables.includes(t));

  return (
    <div className="setup-card">
      <h3>{feature} ยังใช้งานไม่ได้</h3>
      <p>
        ฐานข้อมูลยังไม่มีตาราง{" "}
        {need.map((t, i) => (
          <span key={t}>
            {i > 0 ? ", " : ""}
            <code>{t}</code>
          </span>
        ))}{" "}
        ซึ่งเป็นตารางที่เพิ่มเข้ามาพร้อมฟีเจอร์นี้ ส่วนอื่นของระบบยังใช้งานได้ตามปกติ
      </p>

      <ol>
        <li>
          เปิด <b>Supabase Dashboard &gt; SQL Editor &gt; New query</b>
        </li>
        <li>
          วางเนื้อหาไฟล์ <code>supabase/schema.sql</code> ทั้งไฟล์ แล้วกด <b>Run</b>
          <br />
          <span className="muted">
            รันซ้ำได้ปลอดภัย ตารางเดิมและข้อมูลเดิมไม่ถูกแตะ จะเพิ่มเฉพาะส่วนที่ยังไม่มี
          </span>
        </li>
        <li>
          ดูตารางสรุปท้ายไฟล์ คอลัมน์ <code>ผล</code> ต้องขึ้น <code>ผ่าน</code> ครบทุกแถว
        </li>
        <li>กลับมาที่หน้านี้แล้วกดปุ่มด้านล่าง</li>
      </ol>

      <div className="setup-tip">
        <b>ถ้ารัน schema.sql แล้วแต่ยังขึ้นข้อความนี้</b>
        <p>
          แปลว่า PostgREST ยังไม่รีเฟรช schema cache — ให้รันคำสั่งนี้ใน SQL Editor แล้วรอ 5 วินาที
        </p>
        <pre>notify pgrst, &#39;reload schema&#39;;</pre>
        <p className="muted">
          หรือรอสักครู่แล้วกดโหลดใหม่ ปกติ Supabase จะรีเฟรชให้เองภายในไม่กี่วินาที
        </p>
      </div>

      <button className="btn btn-p" onClick={reload}>
        โหลดข้อมูลใหม่
      </button>
    </div>
  );
}

/** แถบเตือนแบบบาง ใช้แสดงบนหัวหน้าจออื่น ๆ */
export function SetupBanner() {
  const { missingTables, reload } = useInv();
  if (!missingTables.length) return null;

  return (
    <div className="setup-banner no-print">
      <div>
        <b>ฟีเจอร์ใหม่ยังใช้งานไม่ได้</b> — ฐานข้อมูลยังไม่มีตาราง{" "}
        <code>{missingTables.join(", ")}</code> ให้รัน <code>supabase/schema.sql</code> ซ้ำอีกครั้ง
        (รันซ้ำได้ ไม่ลบข้อมูลเดิม)
      </div>
      <button className="btn btn-g btn-sm" onClick={reload}>
        โหลดใหม่
      </button>
    </div>
  );
}
