-- ============================================================================
-- ระบบควบคุมสินค้าคงคลัง การยางแห่งประเทศไทย
-- Schema สำหรับ Supabase — รันไฟล์นี้ใน SQL Editor ของโปรเจกต์ Supabase
--
-- วิธีใช้: Supabase Dashboard > SQL Editor > New query > วางทั้งไฟล์ > Run
--
-- รันซ้ำได้ปลอดภัย ไม่ลบข้อมูลเดิม
-- ถ้ามีฐานข้อมูลเดิมอยู่แล้ว การรันไฟล์นี้ซ้ำจะเพิ่มตารางใหม่ให้เอง
-- (locations / product_locations / sales / sale_items) และขยาย constraint
-- ของ txns ให้รองรับประเภท SALE
-- ============================================================================

-- ---------------------------------------------------------------- ตารางหลัก

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

create unique index if not exists products_code_key on public.products (lower(code));

-- ค้นหาด้วยบาร์โค๊ดตอนยิงที่หน้า POS ต้องเร็ว
create index if not exists products_barcode_idx on public.products (barcode) where barcode <> '';

create table if not exists public.txns (
  id         text primary key,
  type       text not null,
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

  constraint txns_transfer_target check (
    (type = 'TRANSFER' and wh_to is not null and wh_to <> wh_id)
    or (type <> 'TRANSFER')
  )
);

-- ขยายชนิดรายการให้รองรับ SALE (ฐานข้อมูลเดิมมีแค่ 4 ชนิด)
do $$
begin
  alter table public.txns drop constraint if exists txns_type_check;
  alter table public.txns add constraint txns_type_check
    check (type in ('RECEIVE', 'ISSUE', 'TRANSFER', 'ADJUST', 'SALE'));
  raise notice 'ปรับ constraint ชนิดรายการเรียบร้อย (รองรับ SALE แล้ว)';
end
$$;

create index if not exists txns_ts_idx        on public.txns (ts);
create index if not exists txns_product_idx   on public.txns (product_id);
create index if not exists txns_wh_idx        on public.txns (wh_id);
create index if not exists txns_type_date_idx on public.txns (type, date);

-- ------------------------------------------------- ผังที่เก็บสินค้า (Locations)
-- แต่ละคลังมีช่องเก็บหลายช่อง วางเป็นผังด้วย zone (แถว) และ col_no (คอลัมน์)

create table if not exists public.locations (
  id         text primary key,
  wh_id      text not null references public.warehouses (id) on delete cascade,
  code       text not null,
  name       text not null default '',
  zone       text not null default 'A',
  row_no     int  not null default 1,
  col_no     int  not null default 1,
  kind       text not null default 'shelf',
  capacity   numeric not null default 0,
  note       text not null default '',
  created_at timestamptz not null default now()
);

-- รหัสช่องเก็บห้ามซ้ำภายในคลังเดียวกัน
create unique index if not exists locations_wh_code_key
  on public.locations (wh_id, lower(code));

create index if not exists locations_wh_idx on public.locations (wh_id);

-- สินค้าถูกจัดเก็บไว้ที่ช่องไหน จำนวนเท่าไร
create table if not exists public.product_locations (
  id          text primary key,
  product_id  text not null references public.products (id)  on delete cascade,
  location_id text not null references public.locations (id) on delete cascade,
  qty         numeric not null default 0,
  note        text not null default '',
  created_at  timestamptz not null default now(),

  constraint product_locations_qty_positive check (qty >= 0)
);

create unique index if not exists product_locations_unique
  on public.product_locations (product_id, location_id);

create index if not exists product_locations_loc_idx  on public.product_locations (location_id);
create index if not exists product_locations_prod_idx on public.product_locations (product_id);

-- ------------------------------------------------------- การขายหน้าร้าน (POS)

create table if not exists public.sales (
  id         text primary key,
  doc_no     text not null,
  date       date not null,
  wh_id      text not null references public.warehouses (id) on delete restrict,
  customer   text not null default '',
  subtotal   numeric not null default 0,
  discount   numeric not null default 0,
  vat        numeric not null default 0,
  total      numeric not null default 0,
  paid       numeric not null default 0,
  change_amt numeric not null default 0,
  pay_method text not null default 'CASH',
  user_name  text not null default '',
  note       text not null default '',
  ts         bigint not null,
  created_at timestamptz not null default now(),

  constraint sales_pay_method_check check (pay_method in ('CASH', 'TRANSFER', 'CARD'))
);

create unique index if not exists sales_doc_no_key on public.sales (doc_no);
create index if not exists sales_ts_idx  on public.sales (ts);
create index if not exists sales_date_idx on public.sales (date);

create table if not exists public.sale_items (
  id         text primary key,
  sale_id    text not null references public.sales (id) on delete cascade,
  product_id text not null references public.products (id) on delete restrict,
  qty        numeric not null,
  price      numeric not null default 0,
  amount     numeric not null default 0,
  created_at timestamptz not null default now(),

  constraint sale_items_qty_positive check (qty > 0)
);

create index if not exists sale_items_sale_idx on public.sale_items (sale_id);

-- ============================================================================
-- บันทึกการขายแบบ atomic
--
-- การขาย 1 ครั้งต้องเขียน 3 ที่พร้อมกัน: sales, sale_items และ txns (ตัดสต็อก)
-- ถ้าเขียนทีละตารางจากฝั่ง client แล้วพลาดกลางทาง จะได้ข้อมูลไม่ครบ
-- จึงรวมไว้ในฟังก์ชันเดียว ทำงานใน transaction เดียว สำเร็จหมดหรือไม่สำเร็จเลย
--
-- security invoker = RLS ยังทำงานตามปกติ ผู้เรียกต้องล็อกอินแล้วเท่านั้น
-- ============================================================================

create or replace function public.create_sale(p_sale jsonb, p_items jsonb)
returns void
language plpgsql
security invoker
as $$
declare
  it jsonb;
begin
  insert into public.sales (
    id, doc_no, date, wh_id, customer,
    subtotal, discount, vat, total, paid, change_amt,
    pay_method, user_name, note, ts
  )
  values (
    p_sale ->> 'id',
    p_sale ->> 'doc_no',
    (p_sale ->> 'date')::date,
    p_sale ->> 'wh_id',
    coalesce(p_sale ->> 'customer', ''),
    (p_sale ->> 'subtotal')::numeric,
    (p_sale ->> 'discount')::numeric,
    (p_sale ->> 'vat')::numeric,
    (p_sale ->> 'total')::numeric,
    (p_sale ->> 'paid')::numeric,
    (p_sale ->> 'change_amt')::numeric,
    coalesce(p_sale ->> 'pay_method', 'CASH'),
    coalesce(p_sale ->> 'user_name', ''),
    coalesce(p_sale ->> 'note', ''),
    (p_sale ->> 'ts')::bigint
  );

  for it in select * from jsonb_array_elements(p_items)
  loop
    insert into public.sale_items (id, sale_id, product_id, qty, price, amount)
    values (
      it ->> 'id',
      p_sale ->> 'id',
      it ->> 'product_id',
      (it ->> 'qty')::numeric,
      (it ->> 'price')::numeric,
      (it ->> 'amount')::numeric
    );

    -- ตัดสต็อกด้วยรายการชนิด SALE เพื่อให้ยอดคงเหลือคำนวณจากที่เดียวเสมอ
    insert into public.txns (
      id, type, doc_no, date, product_id, qty, wh_id, wh_to, note, ref, user_name, ts
    )
    values (
      it ->> 'txn_id',
      'SALE',
      p_sale ->> 'doc_no',
      (p_sale ->> 'date')::date,
      it ->> 'product_id',
      (it ->> 'qty')::numeric,
      p_sale ->> 'wh_id',
      null,
      'ขายหน้าร้าน',
      p_sale ->> 'doc_no',
      coalesce(p_sale ->> 'user_name', ''),
      (p_sale ->> 'ts')::bigint
    );
  end loop;
end;
$$;

-- ------------------------------------------------------------ สิทธิ์ระดับตาราง
-- สำคัญ: การเข้าถึงตารางต้องผ่าน 2 ด่าน
--   ด่าน 1  GRANT ระดับตาราง  -> ไม่ผ่านจะได้ HTTP 403 / SQLSTATE 42501
--                                "permission denied for table ..."
--   ด่าน 2  RLS policy         -> ไม่ผ่านจะอ่านได้ผลลัพธ์ว่าง หรือเขียนไม่ได้

grant usage on schema public to anon, authenticated;

grant all privileges on table public.warehouses        to authenticated;
grant all privileges on table public.products          to authenticated;
grant all privileges on table public.txns              to authenticated;
grant all privileges on table public.locations         to authenticated;
grant all privileges on table public.product_locations to authenticated;
grant all privileges on table public.sales             to authenticated;
grant all privileges on table public.sale_items        to authenticated;

grant execute on function public.create_sale(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------- Row Level Security
-- อนุญาตเฉพาะผู้ใช้ที่ล็อกอินแล้วเท่านั้น (role = authenticated)
-- anon key เพียงอย่างเดียวจะอ่าน/เขียนไม่ได้ ต้องมี JWT จากการ login ก่อน

do $$
declare
  t   text;
  nm  text;
begin
  foreach t in array array[
    'warehouses', 'products', 'txns',
    'locations', 'product_locations', 'sales', 'sale_items'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    nm := t || ': authenticated full access';
    execute format('drop policy if exists %L on public.%I', nm, t);
    execute format(
      'create policy %L on public.%I for all to authenticated using (true) with check (true)',
      nm, t
    );
  end loop;

  raise notice 'ตั้งค่า RLS ครบ 7 ตารางแล้ว';
end
$$;

-- ============================================================================
-- สร้างผู้ใช้สำหรับเข้าระบบ
-- ----------------------------------------------------------------------------
-- ระบบนี้ไม่มีหน้าสมัครสมาชิก ให้สร้างผู้ใช้จาก Dashboard แทน:
--
--   Supabase Dashboard > Authentication > Users > Add user
--     Email:          admin@raot.local        (หรืออีเมลจริงที่ต้องการ)
--     Password:       ตั้งรหัสที่ปลอดภัย
--     ☑ Auto Confirm User   <- ต้องติ๊ก ไม่งั้นจะ login ไม่ได้จนกว่าจะยืนยันอีเมล
-- ============================================================================

-- ------------------------------------------------- รีเฟรช schema cache
-- PostgREST (ตัวที่ให้บริการ REST API) เก็บโครงสร้างตารางไว้ใน cache
-- หลังสร้างตารางใหม่ต้องบอกให้โหลดใหม่ ไม่งั้นจะได้ error
--   PGRST205 "Could not find the table 'public.xxx' in the schema cache"
-- ปกติ Supabase สั่งให้เองอยู่แล้ว แต่สั่งซ้ำตรงนี้เพื่อความแน่นอน

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------- ตรวจผลลัพธ์
-- ทุกแถวต้องขึ้น "ผ่าน"

select
  x.name                                          as "ตาราง",
  (to_regclass('public.' || x.name) is not null)  as "มีตาราง",
  coalesce((
    select c.relrowsecurity from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = x.name
  ), false)                                       as "rls_เปิด",
  (
    select count(*) from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name = x.name
      and g.grantee = 'authenticated'
      and g.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  )                                               as "สิทธิ์",
  case
    when to_regclass('public.' || x.name) is null then 'ไม่ผ่าน — ไม่มีตาราง'
    when (
      select count(*) from information_schema.role_table_grants g
      where g.table_schema = 'public' and g.table_name = x.name
        and g.grantee = 'authenticated'
        and g.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    ) < 4 then 'ไม่ผ่าน — GRANT ไม่ครบ'
    when (
      select count(*) from pg_policies p
      where p.schemaname = 'public' and p.tablename = x.name
    ) = 0 then 'ไม่ผ่าน — ไม่มี RLS policy'
    else 'ผ่าน'
  end                                             as "ผล"
from (values
  ('warehouses'), ('products'), ('txns'),
  ('locations'), ('product_locations'), ('sales'), ('sale_items')
) as x(name)
order by x.name;
