# InventorySystem

ระบบควบคุมสินค้าคงคลัง — การยางแห่งประเทศไทย (Rubber Authority of Thailand)

สร้างด้วย **Next.js 15 (App Router) + React 19 + Supabase**
ไม่มี dependency อื่นนอกจาก `next` / `react` / `react-dom` — ตัวเชื่อม Supabase เขียนเองด้วย `fetch`

## ตั้งค่าก่อนใช้งาน

ต้องทำ 3 ขั้นนี้ก่อน ไม่งั้นเข้าระบบไม่ได้

**1. สร้างตาราง** — Supabase Dashboard > SQL Editor > วางไฟล์ [`supabase/schema.sql`](supabase/schema.sql) ทั้งไฟล์ > Run

**2. สร้างผู้ใช้** — Authentication > Users > Add user
ติ๊ก **Auto Confirm User** ด้วย ไม่งั้นจะติด "Email not confirmed"

**3. ใส่ค่า environment** — หาที่ Project Settings > API

| ตัวแปร | ค่าที่ใช้ |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |

ตอน deploy ใส่ที่ Vercel > Project Settings > Environment Variables แล้ว **Redeploy หนึ่งครั้ง**
(ตัวแปร `NEXT_PUBLIC_` ถูกฝังตอน build) ตอนรันในเครื่องให้คัดลอก `.env.local.example` เป็น `.env.local`

> anon key เป็น public key เปิดเผยได้ ความปลอดภัยมาจาก RLS policy ที่อนุญาตเฉพาะผู้ที่ล็อกอินแล้ว
> **ห้ามใช้ service_role key ในฝั่ง client เด็ดขาด**

เข้าระบบครั้งแรกและฐานข้อมูลยังว่าง ระบบจะสร้างข้อมูลตัวอย่างให้อัตโนมัติ

## ความสามารถ

- **ทำรายการ** — รับสินค้า / เบิกสินค้า / โอนสินค้าระหว่างคลัง / ปรับปรุงยอดตามผลตรวจนับ
- **ข้อมูลสินค้า** — เพิ่ม-แก้ไข-ลบ พร้อมอัปโหลดรูปภาพ (ย่ออัตโนมัติ) และบาร์โค๊ด Code 128-B
- **สินค้าตามจังหวัด** — คลัง 10 แห่งทั่วประเทศ แสดงตำแหน่งบน Google Maps
- **รายงาน 7 แท็บ** — สรุปยอดคงเหลือ, รายงานแยกตามประเภทรายการ, ใบตรวจนับ, บัตรสินค้า (Stock Card)
  ทุกแท็บกรองด้วยช่วงวันที่ / คลัง / สินค้า และพิมพ์หรือส่งออก CSV ได้
- **กราฟสรุป** — แนวโน้มยอดคงเหลือ, รับเข้าเทียบจ่ายออก, แยกหมวดหมู่, 10 อันดับสูงสุด

ไอคอน บาร์โค๊ด และกราฟทั้งหมดเขียนเองเป็น inline SVG — ไม่ใช้ Tailwind, Chart.js หรือ icon library

## การเก็บข้อมูล

ข้อมูลทั้งหมดอยู่บน **Supabase (Postgres)** แชร์กับผู้ใช้ทุกคนที่เข้าระบบ
เปิด Row Level Security ทั้ง 3 ตาราง อนุญาตเฉพาะผู้ที่ล็อกอินแล้ว

ปุ่ม **"ข้อมูล"** มุมขวาบนใช้ส่งออก/นำเข้าไฟล์สำรอง `.json`, โหลดข้อมูลใหม่ และรีเซ็ต
— การนำเข้าและรีเซ็ตมีผลกับฐานข้อมูลจริง จึงกระทบผู้ใช้ทุกคน

## Deploy

Deploy บน **Vercel** — ไม่ต้องตั้งค่าอะไรเพิ่ม Vercel ตรวจจับ Next.js จาก `package.json`
แล้วรัน `npm install` + `next build` ให้เองบนคลาวด์

## รันในเครื่อง (ถ้าต้องการ)

```bash
npm install
npm run dev     # เปิด http://localhost:3000
```

## เอกสาร

รายละเอียดสเปก โครงสร้างไฟล์ ผลการทดสอบ และบันทึกการแก้ไข อยู่ที่ [`Docs/ProjectPlan.txt`](Docs/ProjectPlan.txt)
