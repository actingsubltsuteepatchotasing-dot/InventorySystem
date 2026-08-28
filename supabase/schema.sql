-- ============================================================================
-- ระบบควบคุมสินค้าคงคลัง การยางแห่งประเทศไทย
-- Schema สำหรับ Supabase — รันไฟล์นี้ใน SQL Editor ของโปรเจกต์ Supabase
--
-- วิธีใช้: Supabase Dashboard > SQL Editor > New query > วางทั้งไฟล์ > Run
-- รันซ้ำได้ปลอดภัย (ใช้ if not exists / drop policy if exists)
-- ============================================================================

-- ---------------------------------------------------------------- ตาราง

create table if not exists public.warehouses (
  id         text primary key,
  code       text not null,
  name       text not null,
  province   text not null,
  lat        double precision,
  lng        double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id         text primary key,
  code       text not null,
  name       text not null,
  unit       text not null,
  cat        text not null default 'ทั่วไป',
  price      numeric not null default 0,
  min_qty    numeric not null default 0,
  barcode    text not null default '',
  img        text not null default '',
  note       text not null default '',
  created_at timestamptz not null default now()
);

-- รหัสสินค้าต้องไม่ซ้ำ
create unique index if not exists products_code_key on public.products (lower(code));

create table if not exists public.txns (
  id         text primary key,
  type       text not null check (type in ('RECEIVE', 'ISSUE', 'TRANSFER', 'ADJUST')),
  doc_no     text not null,
  date       date not null,
  product_id text not null references public.products (id) on delete cascade,
  qty        numeric not null,
  wh_id      text not null references public.warehouses (id) on delete restrict,
  wh_to      text references public.warehouses (id) on delete restrict,
  note       text not null default '',
  ref        text not null default '',
  user_name  text not null default '',
  ts         bigint not null,
  created_at timestamptz not null default now(),

  -- รายการโอนต้องมีปลายทาง และห้ามโอนเข้าคลังตัวเอง
  constraint txns_transfer_target check (
    (type = 'TRANSFER' and wh_to is not null and wh_to <> wh_id)
    or (type <> 'TRANSFER')
  )
);

create index if not exists txns_ts_idx         on public.txns (ts);
create index if not exists txns_product_idx    on public.txns (product_id);
create index if not exists txns_wh_idx         on public.txns (wh_id);
create index if not exists txns_type_date_idx  on public.txns (type, date);

-- ------------------------------------------------------------ สิทธิ์ระดับตาราง
-- สำคัญ: การเข้าถึงตารางต้องผ่าน 2 ด่าน
--   ด่าน 1  GRANT ระดับตาราง  -> ไม่ผ่านจะได้ HTTP 403 / SQLSTATE 42501
--                                "permission denied for table ..."
--   ด่าน 2  RLS policy         -> ไม่ผ่านจะอ่านได้ผลลัพธ์ว่าง หรือเขียนไม่ได้
--
-- ปกติ Supabase ตั้ง default privileges ให้ anon/authenticated อยู่แล้ว
-- แต่บางโปรเจกต์ (หรือถ้าสร้างตารางด้วย role อื่น) จะไม่ได้สิทธิ์นี้
-- จึงสั่งให้ชัดเจนตรงนี้ รันซ้ำได้ปลอดภัย

grant usage on schema public to anon, authenticated;

grant all privileges on table public.warehouses to authenticated;
grant all privileges on table public.products   to authenticated;
grant all privileges on table public.txns       to authenticated;

-- ---------------------------------------------------------- Row Level Security
-- อนุญาตเฉพาะผู้ใช้ที่ล็อกอินแล้วเท่านั้น (role = authenticated)
-- anon key เพียงอย่างเดียวจะอ่าน/เขียนไม่ได้ ต้องมี JWT จากการ login ก่อน

alter table public.warehouses enable row level security;
alter table public.products   enable row level security;
alter table public.txns       enable row level security;

drop policy if exists "warehouses: authenticated full access" on public.warehouses;
create policy "warehouses: authenticated full access"
  on public.warehouses for all
  to authenticated
  using (true) with check (true);

drop policy if exists "products: authenticated full access" on public.products;
create policy "products: authenticated full access"
  on public.products for all
  to authenticated
  using (true) with check (true);

drop policy if exists "txns: authenticated full access" on public.txns;
create policy "txns: authenticated full access"
  on public.txns for all
  to authenticated
  using (true) with check (true);

-- ============================================================================
-- สร้างผู้ใช้สำหรับเข้าระบบ
-- ----------------------------------------------------------------------------
-- ระบบนี้ไม่มีหน้าสมัครสมาชิก ให้สร้างผู้ใช้จาก Dashboard แทน:
--
--   Supabase Dashboard > Authentication > Users > Add user
--     Email:          admin@raot.local        (หรืออีเมลจริงที่ต้องการ)
--     Password:       ตั้งรหัสที่ปลอดภัย
--     ☑ Auto Confirm User   ← ต้องติ๊ก ไม่งั้นจะ login ไม่ได้จนกว่าจะยืนยันอีเมล
--
-- ถ้าใช้อีเมลปลอม (เช่น @raot.local) ต้องติ๊ก Auto Confirm User เสมอ
-- เพราะจะไม่มีอีเมลยืนยันส่งไปถึง
-- ============================================================================

-- ---------------------------------------------------------------- ตรวจสอบ
-- รันเพื่อดูว่าตารางถูกสร้างและ RLS เปิดอยู่
--
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename in ('products','warehouses','txns');
