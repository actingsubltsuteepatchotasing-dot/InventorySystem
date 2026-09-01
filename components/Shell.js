"use client";

import { useEffect, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useToast } from "./Toast";
import {
  IcAdjust, IcBox, IcCart, IcChart, IcDash, IcData, IcGrid, IcIn, IcMap, IcMenu, IcMove,
  IcOut, IcReport, Logo,
} from "./Icons";
import BackupModal from "./BackupModal";
import { SetupBanner } from "./SetupNotice";
import Dashboard from "./views/Dashboard";
import TxnScreen from "./views/TxnScreen";
import AdjustScreen from "./views/AdjustScreen";
import Products from "./views/Products";
import Provinces from "./views/Provinces";
import Locations from "./views/Locations";
import POS from "./views/POS";
import Reports from "./views/Reports";
import Graphs from "./views/Graphs";

const NAV = [
  {
    group: "ภาพรวม",
    items: [{ id: "dash", Icon: IcDash, title: "แดชบอร์ด", sub: "ภาพรวมสินค้าคงคลัง" }],
  },
  {
    group: "ทำรายการ",
    items: [
      { id: "receive", Icon: IcIn, title: "รับสินค้า", sub: "บันทึกการรับสินค้าเข้าคลัง" },
      { id: "issue", Icon: IcOut, title: "เบิกสินค้า", sub: "บันทึกการเบิก-จ่ายสินค้า" },
      { id: "transfer", Icon: IcMove, title: "โอนสินค้า", sub: "โอนย้ายระหว่างคลัง" },
      { id: "adjust", Icon: IcAdjust, title: "ปรับปรุงสินค้า", sub: "ปรับยอดตามผลการตรวจนับ" },
    ],
  },
  {
    group: "ขายหน้าร้าน",
    items: [
      { id: "pos", Icon: IcCart, title: "ขายสินค้า (POS)", sub: "ยิงบาร์โค๊ด ขาย และออกใบเสร็จ" },
    ],
  },
  {
    group: "ข้อมูลหลัก",
    items: [
      { id: "products", Icon: IcBox, title: "ข้อมูลสินค้า", sub: "รายละเอียด รูปภาพ และบาร์โค๊ด" },
      { id: "provinces", Icon: IcMap, title: "สินค้าตามจังหวัด", sub: "แผนที่และยอดคงเหลือรายจังหวัด" },
      { id: "locations", Icon: IcGrid, title: "ผังที่เก็บสินค้า", sub: "กำหนดตำแหน่งจัดเก็บแบบเป็นภาพ" },
    ],
  },
  {
    group: "รายงาน",
    items: [
      { id: "reports", Icon: IcReport, title: "รายงาน", sub: "รายงานสรุปและการตรวจนับ" },
      { id: "graphs", Icon: IcChart, title: "กราฟสรุป", sub: "ปริมาณขึ้น-ลง และยอดคงเหลือ" },
    ],
  },
];

const ALL_ITEMS = NAV.flatMap((g) => g.items);

export default function Shell() {
  const { db, ready, error, seeded, reload } = useInv();
  const { user, signOut } = useAuth();
  const toast = useToast();
  const [view, setView] = useState("dash");
  const [menuOpen, setMenuOpen] = useState(false);
  const [backup, setBackup] = useState(false);

  // แจ้งเมื่อระบบสร้างข้อมูลตัวอย่างให้อัตโนมัติเพราะฐานข้อมูลยังว่าง
  useEffect(() => {
    if (seeded) toast("ฐานข้อมูลยังว่าง — สร้างข้อมูลตัวอย่างให้เรียบร้อยแล้ว");
  }, [seeded, toast]);

  if (error) {
    return (
      <div className="boot">
        <div className="boot-err">
          <b>เชื่อมต่อฐานข้อมูลไม่สำเร็จ</b>
          <p>{error}</p>
        </div>

        <div className="boot-help">
          <b>วิธีแก้ตามลำดับ</b>
          <ol>
            <li>
              เปิด Supabase Dashboard &gt; SQL Editor &gt; New query
            </li>
            <li>
              วางไฟล์ <code>supabase/schema.sql</code> ทั้งไฟล์ แล้วกด Run
              — ไฟล์เดียวจบ ทั้งสร้างตาราง ให้สิทธิ์ และตั้ง RLS
              (รันซ้ำได้ ไม่ลบข้อมูลเดิม)
            </li>
            <li>
              ดูตารางสรุปท้ายไฟล์ คอลัมน์ <code>ผล</code> ต้องขึ้น <code>ผ่าน</code> ครบทั้ง 7 แถว
            </li>
            <li>กลับมาที่หน้านี้แล้วกด “ลองใหม่” (ไม่ต้อง deploy ใหม่)</li>
          </ol>
        </div>

        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn btn-p" onClick={reload}>
            ลองใหม่
          </button>
          <button className="btn btn-g" onClick={signOut}>
            ออกจากระบบ
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="boot">
        <div className="spinner" />
        <span>กำลังโหลดข้อมูลจาก Supabase…</span>
      </div>
    );
  }

  const current = ALL_ITEMS.find((i) => i.id === view) || ALL_ITEMS[0];
  const email = user && user.email ? user.email : "ผู้ใช้";
  const initials = email.slice(0, 2).toUpperCase();

  function navigate(id) {
    setView(id);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }

  return (
    <div className="app">
      <aside className={"sidebar" + (menuOpen ? " open" : "")}>
        <div className="brand">
          <Logo size={36} ring="rgba(255,255,255,.16)" vein="#00512F" />
          <div className="brand-txt">
            <strong>สินค้าคงคลัง กยท.</strong>
            <span>Inventory Control</span>
          </div>
        </div>

        <nav className="side-nav">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="nav-group">{g.group}</div>
              {g.items.map(({ id, Icon, title }) => (
                <button
                  key={id}
                  className={"nav-item" + (id === view ? " active" : "")}
                  onClick={() => navigate(id)}
                >
                  <Icon size={18} stroke={1.9} />
                  {title}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <div>
            คลังที่ใช้งาน: <b>{db.warehouses.length} คลังทั่วประเทศ</b>
          </div>
          <div style={{ marginTop: 4, opacity: 0.75 }}>เวอร์ชัน 2.0 · ข้อมูลอยู่บน Supabase</div>
        </div>
      </aside>

      {menuOpen ? <div className="scrim" onClick={() => setMenuOpen(false)} /> : null}

      <main className="main">
        <div className="topbar">
          <button className="btn btn-g btn-icon burger" onClick={() => setMenuOpen(true)} aria-label="เปิดเมนู">
            <IcMenu size={18} />
          </button>
          <div>
            <h2>{current.title}</h2>
            <div className="sub">{current.sub}</div>
          </div>
          <div className="topbar-right">
            <button className="btn btn-g btn-sm" onClick={() => setBackup(true)} title="สำรอง / กู้คืนข้อมูล">
              <IcData size={15} />
              ข้อมูล
            </button>
            <div className="user-chip" title={email}>
              <span className="avatar">{initials}</span>
              <span className="uname">{email}</span>
            </div>
            <button className="btn btn-g btn-sm" onClick={signOut}>
              ออกจากระบบ
            </button>
          </div>
        </div>

        <div className="content">
          <SetupBanner />
          {view === "dash" && <Dashboard onNavigate={navigate} />}
          {view === "receive" && <TxnScreen key="receive" type="RECEIVE" />}
          {view === "issue" && <TxnScreen key="issue" type="ISSUE" />}
          {view === "transfer" && <TxnScreen key="transfer" type="TRANSFER" />}
          {view === "adjust" && <AdjustScreen />}
          {view === "pos" && <POS />}
          {view === "locations" && <Locations />}
          {view === "products" && <Products />}
          {view === "provinces" && <Provinces />}
          {view === "reports" && <Reports />}
          {view === "graphs" && <Graphs />}
        </div>
      </main>

      {backup ? <BackupModal onClose={() => setBackup(false)} /> : null}
    </div>
  );
}
