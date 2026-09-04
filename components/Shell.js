"use client";

import { useEffect, useState } from "react";
import { useInv } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useToast } from "./Toast";
import {
  IcAdjust, IcBox, IcCart, IcChart, IcChevron, IcDash, IcData, IcGrid, IcIn, IcMap,
  IcMenu, IcMove, IcOut, IcPin, IcReport, Logo,
} from "./Icons";
import BackupModal from "./BackupModal";
import ChatWidget from "./ChatWidget";
import { InstallButton } from "./PWA";
import { ThemePicker } from "./Theme";
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
import Customers from "./views/Customers";
import DocGroups from "./views/DocGroups";
import WarehouseSetup from "./views/WarehouseSetup";
import SalesInvoice from "./views/SalesInvoice";
import Shipping from "./views/Shipping";
import Company from "./views/Company";

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
    group: "งานขาย",
    items: [
      { id: "pos", Icon: IcCart, title: "ขายสินค้า (POS)", sub: "ยิงบาร์โค๊ด ขาย และออกใบเสร็จ" },
      { id: "invoice", Icon: IcReport, title: "ขายสินค้าและบริการ", sub: "ออกใบกำกับภาษีเต็มรูปแบบ" },
      { id: "shipping", Icon: IcMap, title: "การจัดส่งสินค้า", sub: "เส้นทางและสถานะการส่งของ" },
    ],
  },
  {
    group: "ข้อมูลหลัก",
    items: [
      { id: "products", Icon: IcBox, title: "ข้อมูลสินค้า", sub: "รายละเอียด รูปภาพ และบาร์โค๊ด" },
      { id: "provinces", Icon: IcMap, title: "สินค้าตามจังหวัด", sub: "แผนที่และยอดคงเหลือรายจังหวัด" },
      { id: "locations", Icon: IcGrid, title: "ผังที่เก็บสินค้า", sub: "กำหนดตำแหน่งจัดเก็บแบบเป็นภาพ" },
      { id: "customers", Icon: IcPin, title: "รายละเอียดลูกค้า", sub: "ทะเบียนลูกค้าและที่อยู่" },
    ],
  },
  {
    group: "การจัดการระบบ",
    items: [
      { id: "docgroups", Icon: IcReport, title: "การกำหนดกลุ่มเอกสาร", sub: "รูปแบบเลขที่เอกสารแบบรันนิ่ง" },
      { id: "whsetup", Icon: IcData, title: "กำหนดคลังและที่เก็บ", sub: "เพิ่ม แก้ไข และลบคลังกับช่องเก็บ" },
      { id: "company", Icon: IcBox, title: "ข้อมูลกิจการ", sub: "ผู้ออกใบกำกับภาษี" },
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

const FOOT_KEY = "ultra-side-foot";
const NAV_KEY = "ultra-nav-folded";

/** ชื่อกลุ่มที่ถูกหุบอยู่ อ่านจากเครื่องผู้ใช้ ค่าเสียหายก็ถือว่าไม่มีกลุ่มไหนหุบ */
function readFolded() {
  try {
    const raw = window.localStorage.getItem(NAV_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch (e) {
    return [];
  }
}

export default function Shell() {
  const { db, ready, error, seeded, reload } = useInv();
  const { user, signOut } = useAuth();
  const toast = useToast();
  const [view, setView] = useState("dash");
  const [menuOpen, setMenuOpen] = useState(false);

  /**
   * แถบผู้ใช้ท้ายเมนู หุบไว้ได้เพื่อคืนพื้นที่ให้รายการเมนู
   * จำค่าไว้ในเครื่อง แต่ต้องอ่านใน useEffect ไม่งั้นพังตอน server render
   */
  const [footOpen, setFootOpen] = useState(true);

  /**
   * กลุ่มเมนูที่ถูกหุบไว้ เก็บเป็นรายชื่อกลุ่ม ไม่ใช่หมายเลขลำดับ
   * เพราะลำดับกลุ่มเปลี่ยนได้เมื่อเพิ่มเมนูใหม่ แล้วจะไปหุบผิดกลุ่ม
   */
  const [folded, setFolded] = useState([]);

  useEffect(() => {
    setFolded(readFolded());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(NAV_KEY, JSON.stringify(folded));
    } catch (e) {
      // เก็บไม่ได้ก็ยังใช้งานได้ แค่จำค่าข้ามครั้งไม่ได้
    }
  }, [folded]);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(FOOT_KEY) === "0") setFootOpen(false);
    } catch (e) {
      // เบราว์เซอร์ปิด storage — ใช้ค่าเริ่มต้นคือกางไว้
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(FOOT_KEY, footOpen ? "1" : "0");
    } catch (e) {
      // เก็บไม่ได้ก็ยังใช้งานได้ แค่จำค่าข้ามครั้งไม่ได้
    }
  }, [footOpen]);
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
              ดูตารางสรุปท้ายไฟล์ คอลัมน์ <code>ผล</code> ต้องขึ้น <code>ผ่าน</code> ครบทุกแถว
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

    // ไปหน้าที่อยู่ในกลุ่มที่หุบไว้ (เช่นกดทางลัดจากแดชบอร์ด) ให้กางกลุ่มนั้นออก
    // ไม่งั้นเมนูจะไม่มีอะไรไฮไลต์เลย คนใช้จะงงว่าตัวเองอยู่ตรงไหน
    const g = NAV.find((x) => x.items.some((i) => i.id === id));
    if (g) setFolded((prev) => prev.filter((x) => x !== g.group));
  }

  return (
    <div className="app">
      <aside className={"sidebar" + (menuOpen ? " open" : "")}>
        <div className="brand">
          <Logo size={36} ring="rgba(255,255,255,.16)" vein="var(--brand-d)" />
          <div className="brand-txt">
            <strong>Ultra ERP</strong>
            <span>Inventory Control</span>
          </div>
        </div>

        <nav className="side-nav">
          {NAV.map((g) => {
            const open = !folded.includes(g.group);
            const id = "nav-" + NAV.indexOf(g);
            return (
              <div key={g.group}>
                <button
                  type="button"
                  className={"nav-group" + (open ? "" : " folded")}
                  onClick={() =>
                    setFolded((prev) =>
                      prev.includes(g.group)
                        ? prev.filter((x) => x !== g.group)
                        : [...prev, g.group]
                    )
                  }
                  aria-expanded={open}
                  aria-controls={id}
                >
                  <span>{g.group}</span>
                  <IcChevron size={14} />
                </button>
                <div id={id} hidden={!open}>
                  {g.items.map((it) => (
                    <button
                      key={it.id}
                      className={"nav-item" + (it.id === view ? " active" : "")}
                      onClick={() => navigate(it.id)}
                    >
                      <it.Icon size={18} stroke={1.9} />
                      {it.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className={"side-foot" + (footOpen ? "" : " folded")}>
          <div className="side-user">
            <span className="avatar" aria-hidden="true">{initials}</span>
            {/* ตอนหุบ ซ่อนอีเมลอย่างเดียว ปุ่มออกจากระบบยังอยู่ให้กดได้เสมอ */}
            {footOpen ? (
              <span className="uname" title={email}>{email}</span>
            ) : null}
            <button className="btn btn-g btn-sm" onClick={signOut}>
              ออกจากระบบ
            </button>
            <button
              type="button"
              className="side-fold"
              onClick={() => setFootOpen((v) => !v)}
              aria-expanded={footOpen}
              aria-controls="side-foot-detail"
              title={footOpen ? "ย่อแถบนี้" : "ขยายแถบนี้"}
              aria-label={footOpen ? "ย่อแถบผู้ใช้" : "ขยายแถบผู้ใช้"}
            >
              <IcChevron size={16} />
            </button>
          </div>

          <div id="side-foot-detail" hidden={!footOpen}>
            <div className="side-meta">
              คลังที่ใช้งาน: <b>{db.warehouses.length} คลังทั่วประเทศ</b>
              {" · "}
              <b>{db.locations.length} ที่เก็บ</b>
            </div>
            <div className="side-meta" style={{ marginTop: 4, opacity: 0.75 }}>
              เวอร์ชัน 2.0 · ข้อมูลอยู่บน Supabase
            </div>
          </div>
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
            <ThemePicker />
            <InstallButton />
            <button className="btn btn-g btn-sm" onClick={() => setBackup(true)} title="สำรอง / กู้คืนข้อมูล">
              <IcData size={15} />
              ข้อมูล
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
          {view === "invoice" && <SalesInvoice />}
          {view === "shipping" && <Shipping />}
          {view === "company" && <Company />}
          {view === "customers" && <Customers />}
          {view === "docgroups" && <DocGroups />}
          {view === "whsetup" && <WarehouseSetup />}
        </div>
      </main>

      {backup ? <BackupModal onClose={() => setBackup(false)} /> : null}

      {/* แถบผู้ใช้ลอยมุมขวาล่าง — ซ้อนอยู่เหนือปุ่มผู้ช่วย AI */}
      <ChatWidget />
    </div>
  );
}
