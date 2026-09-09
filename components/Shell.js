"use client";

import { useEffect, useState } from "react";
import { useInv } from "@/lib/store";
import { APP_BUILD, PERMS_SCREEN } from "@/lib/constants";
import { useAuth } from "@/lib/auth";
import { useToast } from "./Toast";
import {
  IcAdjust, IcBox, IcCart, IcChart, IcChevron, IcDash, IcData, IcDownload, IcGrid, IcIn,
  IcMap, IcMenu, IcMove, IcOut, IcPin, IcPrint, IcReport, Logo,
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
import ShipStatus from "./views/ShipStatus";
import Permissions from "./views/Permissions";
import Suppliers from "./views/Suppliers";
import PurchaseInvoice from "./views/PurchaseInvoice";
import PurchaseReturn from "./views/PurchaseReturn";
import ReportBuilder from "./views/ReportBuilder";
import BillImport from "./views/BillImport";
import Password from "./views/Password";
import Users from "./views/Users";
import SqlServer from "./views/SqlServer";
import DataImport from "./views/DataImport";
import Salespersons from "./views/Salespersons";
import ProductTerms from "./views/ProductTerms";
import CustomerKinds from "./views/CustomerKinds";
import PrintForms from "./views/PrintForms";
import Targets from "./views/Targets";
import QuickView from "./views/QuickView";
import Guide from "./views/Guide";
import Leads from "./views/Leads";
import Deals from "./views/Deals";
import Activities from "./views/Activities";
import Customer360 from "./views/Customer360";
import CountPrep from "./views/CountPrep";
import CountScan from "./views/CountScan";
import ShipScan from "./views/ShipScan";
import Backup from "./views/Backup";

const NAV = [
  {
    group: "ภาพรวม",
    items: [
      { id: "guide", Icon: IcReport, title: "วิธีการใช้งาน", sub: "แต่ละหน้าจอทำงานยังไง เชื่อมกันตรงไหน" },
      { id: "quick", Icon: IcChart, title: "Quick View (มือถือ)", sub: "ยอดขายเทียบเป้า ดูเร็วบนมือถือ" },
      { id: "dash", Icon: IcDash, title: "แดชบอร์ด", sub: "ภาพรวมสินค้าคงคลัง" },
    ],
  },
  {
    group: "ทำรายการ",
    items: [
      { id: "receive", Icon: IcIn, title: "รับสินค้า", sub: "บันทึกการรับสินค้าเข้าคลัง" },
      { id: "issue", Icon: IcOut, title: "เบิกสินค้า", sub: "บันทึกการเบิก-จ่ายสินค้า" },
      { id: "transfer", Icon: IcMove, title: "โอนสินค้า", sub: "โอนย้ายระหว่างคลัง" },
      { id: "adjust", Icon: IcAdjust, title: "ปรับปรุงสินค้า", sub: "ปรับยอดตามผลการตรวจนับ" },
      { id: "countprep", Icon: IcGrid, title: "เตรียมใบตรวจนับ", sub: "สร้างใบและพิมพ์ออกไปนับ" },
      { id: "countscan", Icon: IcBox, title: "นับสินค้า (มือถือ)", sub: "สแกนบาร์โค๊ดแล้วกรอกจำนวน" },
    ],
  },
  {
    group: "งานซื้อ",
    items: [
      { id: "purchase", Icon: IcIn, title: "ซื้อสินค้าและบริการ", sub: "รับของเข้าและบันทึกภาษีซื้อ" },
      { id: "purret", Icon: IcOut, title: "ส่งคืนสินค้าและบริการ", sub: "คืนของให้เจ้าหนี้ตามใบซื้อ" },
      { id: "suppliers", Icon: IcPin, title: "รายละเอียดเจ้าหนี้", sub: "ทะเบียนเจ้าหนี้และที่อยู่" },
    ],
  },
  {
    group: "งานขาย",
    items: [
      { id: "pos", Icon: IcCart, title: "ขายสินค้า (POS)", sub: "ยิงบาร์โค๊ด ขาย และออกใบเสร็จ" },
      { id: "invoice", Icon: IcReport, title: "ขายสินค้าและบริการ", sub: "ออกใบกำกับภาษีเต็มรูปแบบ" },
      { id: "targets", Icon: IcChart, title: "กำหนดเป้าขาย", sub: "ตั้งเป้าและเทียบกับยอดจริง" },
    ],
  },
  {
    group: "งานลูกค้าสัมพันธ์",
    items: [
      { id: "deals", Icon: IcChart, title: "โอกาสการขาย", sub: "กรวยการขายและดีลที่ไล่ปิดอยู่" },
      { id: "activities", Icon: IcReport, title: "บันทึกกิจกรรม", sub: "โทร เข้าพบ และนัดครั้งถัดไป" },
      { id: "leads", Icon: IcPin, title: "ลูกค้าเป้าหมาย", sub: "ผู้สนใจที่ยังไม่เป็นลูกค้า" },
      { id: "cust360", Icon: IcData, title: "ภาพรวมลูกค้า", sub: "ทุกอย่างของลูกค้าหนึ่งรายในหน้าเดียว" },
    ],
  },
  {
    group: "งานจัดส่ง",
    items: [
      { id: "shipscan", Icon: IcGrid, title: "สถานีสแกนจัดส่ง", sub: "ยิงบาร์โค๊ดเดินสถานะทีละใบ" },
      { id: "shipping", Icon: IcMap, title: "การจัดส่งสินค้า", sub: "เส้นทางและสถานะการส่งของ" },
      { id: "shipstatus", Icon: IcChart, title: "สถานะการจัดส่ง", sub: "ค้นหา ติดตาม และเวลาแต่ละขั้น" },
      { id: "billimport", Icon: IcDownload, title: "การดึงบิลอัตโนมัติ", sub: "ดึงบิลจากไฟล์ Excel เข้ามาติดตาม" },
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
      { id: "printforms", Icon: IcPrint, title: "ออกแบบฟอร์มพิมพ์", sub: "เลือกส่วนที่จะแสดงบนเอกสาร" },
      { id: "docgroups", Icon: IcReport, title: "การกำหนดกลุ่มเอกสาร", sub: "รูปแบบเลขที่เอกสารแบบรันนิ่ง" },
      { id: "whsetup", Icon: IcData, title: "กำหนดคลังและที่เก็บ", sub: "เพิ่ม แก้ไข และลบคลังกับช่องเก็บ" },
      { id: "company", Icon: IcBox, title: "ข้อมูลกิจการ", sub: "ผู้ออกใบกำกับภาษี" },
      { id: "users", Icon: IcPin, title: "เพิ่มผู้ใช้งาน", sub: "สร้างบัญชีเข้าระบบด้วยอีเมล" },
      { id: "sqlserver", Icon: IcData, title: "เชื่อมต่อฐานข้อมูลภายนอก", sub: "SQL Server / MySQL / Access" },
      { id: "dataimport", Icon: IcDownload, title: "นำเข้าข้อมูลจาก Excel", sub: "เลือกหน้าจอแล้วโหลดไฟล์เข้ามา" },
      { id: "salespersons", Icon: IcPin, title: "กำหนดพนักงานขาย", sub: "รหัสและชื่อพนักงานขาย" },
      { id: "terms", Icon: IcBox, title: "กลุ่ม ยี่ห้อ ประเภทสินค้า", sub: "ทะเบียนรหัสและชื่อของสามมิติ" },
      { id: "custkinds", Icon: IcPin, title: "กำหนดประเภทลูกค้า", sub: "ทะเบียนรหัสและชื่อประเภทลูกค้า" },
      { id: "password", Icon: IcPin, title: "เปลี่ยนรหัสผ่าน", sub: "ตั้งรหัสผ่านใหม่ของบัญชีตัวเอง" },
      { id: "backup", Icon: IcData, title: "สำรองข้อมูล", sub: "สำรองทั้งหมดและกู้คืนกลับมา" },
      { id: "perms", Icon: IcData, title: "กำหนดสิทธิการใช้งาน", sub: "เลือกว่าหน้าจอไหนแสดงและแก้ไขได้" },
    ],
  },
  {
    group: "รายงาน",
    items: [
      { id: "reports", Icon: IcReport, title: "รายงาน", sub: "รายงานสรุปและการตรวจนับ" },
      { id: "graphs", Icon: IcChart, title: "กราฟสรุป", sub: "ปริมาณขึ้น-ลง และยอดคงเหลือ" },
      { id: "builder", Icon: IcData, title: "สร้างรายงาน", sub: "เลือกคอลัมน์และจัดรูปแบบเอง" },
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
  const inv = useInv();
  const { db, ready, error, seeded, reload } = inv;
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
  // ชุดข้อมูลตั้งต้นของหน้านำเข้าข้อมูล มาจากปุ่มทางลัดของหน้าอื่น
  const [importSet, setImportSet] = useState("");

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

  /*
   * เมนูที่แสดงจริง = เฉพาะหน้าจอที่ติ๊ก "แสดงหน้าจอ" ไว้ที่หน้ากำหนดสิทธิ
   *
   * หน้ากำหนดสิทธิเองต้องอยู่เสมอ ปิดตัวเองไม่ได้
   * ไม่งั้นคนตั้งค่าจะล็อกตัวเองออกถาวร แก้กลับได้ทางเดียวคือแก้ในฐานข้อมูลตรง ๆ
   */
  const nav = NAV.map((g) => ({
    ...g,
    items: g.items.filter((it) => it.id === PERMS_SCREEN || inv.perm(it.id).view),
  })).filter((g) => g.items.length);

  const shown = nav.flatMap((g) => g.items);

  /*
   * หน้าที่เปิดอยู่ถูกปิดสิทธิไประหว่างใช้งาน ให้เด้งไปหน้าแรกที่ยังเปิดอยู่
   * คำนวณสด ไม่ใช้ effect เพราะ effect จะวาดหน้าที่ไม่มีสิทธิให้เห็นแวบหนึ่งก่อน
   */
  const current = shown.find((i) => i.id === view) || shown[0] || ALL_ITEMS[0];
  const activeView = current.id;
  const email = user && user.email ? user.email : "ผู้ใช้";
  const initials = email.slice(0, 2).toUpperCase();

  /**
   * เปลี่ยนหน้าจอ
   *
   * arg = ค่าเริ่มต้นที่ส่งต่อให้หน้าปลายทาง (ตอนนี้ใช้กับหน้านำเข้าข้อมูลเท่านั้น)
   * เพื่อให้ปุ่ม "โหลดจาก Excel" ที่หน้าอื่นพามาถึงชุดข้อมูลที่ต้องการได้เลย
   * ไม่ต้องให้คนใช้มาเลือกชุดเองอีกที ซึ่งเลือกผิดชุดได้ง่าย
   */
  function navigate(id, arg) {
    setView(id);
    setImportSet(arg || "");
    setMenuOpen(false);
    window.scrollTo(0, 0);

    // ไปหน้าที่อยู่ในกลุ่มที่หุบไว้ (เช่นกดทางลัดจากแดชบอร์ด) ให้กางกลุ่มนั้นออก
    // ไม่งั้นเมนูจะไม่มีอะไรไฮไลต์เลย คนใช้จะงงว่าตัวเองอยู่ตรงไหน
    const g = nav.find((x) => x.items.some((i) => i.id === id));
    if (g) setFolded((prev) => prev.filter((x) => x !== g.group));
  }

  return (
    <div className="app">
      <aside className={"sidebar" + (menuOpen ? " open" : "")}>
        <div className="brand">
          <Logo size={36} ring="rgba(255,255,255,.16)" vein="var(--brand-d)" />
          <div className="brand-txt">
            <strong>One for All Ultra</strong>
            <span>OFAU · หนึ่งเดียวเพื่อทุกสิ่ง</span>
          </div>
        </div>

        <nav className="side-nav">
          {nav.map((g) => {
            const open = !folded.includes(g.group);
            const id = "nav-" + g.group;
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
                  {/*
                   * กลุ่มที่หุบอยู่ต้องบอกว่าซ่อนกี่หน้าไว้
                   *
                   * การหุบกลุ่มจำไว้ในเครื่องผู้ใช้ พอเพิ่มเมนูใหม่เข้าไปในกลุ่มที่หุบอยู่
                   * หน้าใหม่จะไม่โผล่มาให้เห็นเลย จนเข้าใจว่ายังไม่ได้ทำ
                   * ตัวเลขนี้ทำให้เห็นว่ายังมีของอยู่ข้างใน แค่ยังไม่ได้กางออก
                   */}
                  {open ? null : <b className="nav-count">{g.items.length}</b>}
                  <IcChevron size={14} />
                </button>
                <div id={id} hidden={!open}>
                  {g.items.map((it) => (
                    <button
                      key={it.id}
                      className={"nav-item" + (it.id === activeView ? " active" : "")}
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
              เวอร์ชัน {APP_BUILD}
            </div>
            <div className="side-meta" style={{ marginTop: 2, opacity: 0.75 }}>
              ข้อมูลอยู่บน Supabase
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
          {activeView === "guide" && <Guide onNavigate={navigate} />}
          {activeView === "quick" && <QuickView onNavigate={navigate} />}
          {activeView === "deals" && <Deals onNavigate={navigate} />}
          {activeView === "activities" && <Activities />}
          {activeView === "leads" && <Leads onNavigate={navigate} />}
          {activeView === "cust360" && <Customer360 onNavigate={navigate} />}
          {activeView === "dash" && <Dashboard onNavigate={navigate} />}
          {activeView === "receive" && <TxnScreen key="receive" type="RECEIVE" />}
          {activeView === "issue" && <TxnScreen key="issue" type="ISSUE" />}
          {activeView === "transfer" && <TxnScreen key="transfer" type="TRANSFER" />}
          {activeView === "adjust" && <AdjustScreen />}
          {activeView === "pos" && <POS />}
          {activeView === "locations" && <Locations />}
          {activeView === "products" && <Products />}
          {activeView === "provinces" && <Provinces />}
          {activeView === "reports" && <Reports />}
          {activeView === "graphs" && <Graphs />}
          {activeView === "invoice" && <SalesInvoice />}
          {activeView === "shipstatus" && <ShipStatus />}
          {activeView === "purchase" && <PurchaseInvoice />}
          {activeView === "purret" && <PurchaseReturn />}
          {activeView === "suppliers" && <Suppliers />}
          {activeView === "shipscan" && <ShipScan />}
          {activeView === "users" && <Users />}
          {activeView === "sqlserver" && <SqlServer />}
          {activeView === "dataimport" && <DataImport startSet={importSet} />}
          {activeView === "salespersons" && <Salespersons />}
          {activeView === "terms" && <ProductTerms />}
          {activeView === "custkinds" && <CustomerKinds />}
          {activeView === "printforms" && <PrintForms />}
          {activeView === "targets" && <Targets onNavigate={navigate} />}
          {activeView === "password" && <Password />}
          {activeView === "billimport" && <BillImport />}
          {activeView === "countprep" && <CountPrep />}
          {activeView === "countscan" && <CountScan />}
          {activeView === "builder" && <ReportBuilder />}
          {activeView === "backup" && <Backup />}
          {activeView === "perms" && <Permissions />}
          {activeView === "shipping" && <Shipping />}
          {activeView === "company" && <Company />}
          {activeView === "customers" && <Customers />}
          {activeView === "docgroups" && <DocGroups />}
          {activeView === "whsetup" && <WarehouseSetup />}
        </div>
      </main>

      {backup ? <BackupModal onClose={() => setBackup(false)} /> : null}

      {/* แถบผู้ใช้ลอยมุมขวาล่าง — ซ้อนอยู่เหนือปุ่มผู้ช่วย AI */}
      <ChatWidget />
    </div>
  );
}
