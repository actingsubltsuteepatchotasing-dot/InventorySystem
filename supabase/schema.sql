-- ============================================================================
-- ระบบควบคุมสินค้าคงคลัง การยางแห่งประเทศไทย
-- Schema สำหรับ Supabase — รันไฟล์นี้ใน SQL Editor ของโปรเจกต์ Supabase
--
-- ไฟล์เดียวจบทุกขั้นตอน — ไม่ต้องรันไฟล์อื่นอีก
--
-- วิธีใช้: Supabase Dashboard > SQL Editor > New query > วางทั้งไฟล์ > Run
--
-- ไฟล์นี้ทำให้ครบทุกอย่าง:
--   1. สร้างตารางทั้ง 7 ตาราง (ข้ามตารางที่มีอยู่แล้ว ไม่แตะข้อมูลเดิม)
--   2. ขยาย constraint ของ txns ให้รองรับประเภท SALE
--   3. สร้างฟังก์ชัน stock_of() และ create_sale()
--   4. GRANT สิทธิ์ระดับตารางให้ role authenticated
--   5. เปิด RLS และสร้าง policy ครบทุกตาราง
--   6. สั่ง PostgREST รีเฟรช schema cache
--   7. แสดงตารางสรุปผลว่าครบหรือไม่
--
-- รันซ้ำกี่ครั้งก็ได้ ปลอดภัย ไม่ลบข้อมูลเดิม
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

-- ------------------------------------------- ที่เก็บสินค้าบนรายการเคลื่อนไหว
-- กติกาของระบบ: ระบุคลังที่ไหน ต้องระบุที่เก็บที่นั่นด้วยเสมอ
--
-- คอลัมน์เป็น null ได้เพื่อให้ฐานข้อมูลเดิมที่มีข้อมูลอยู่แล้วอัปเกรดผ่าน
-- และให้กู้คืนไฟล์สำรองรุ่นเก่าที่ยังไม่มีที่เก็บได้ ส่วนการบังคับกรอกอยู่ที่หน้าจอ
alter table public.txns add column if not exists loc_id text;
alter table public.txns add column if not exists loc_to text;

-- ต้องมี unique (id, wh_id) ก่อน ถึงจะอ้างเป็น foreign key คู่ได้
create unique index if not exists locations_id_wh_key on public.locations (id, wh_id);

-- foreign key คู่ (ที่เก็บ, คลัง) บังคับว่าที่เก็บที่ระบุต้องอยู่ในคลังนั้นจริง
-- MATCH SIMPLE: ถ้าคอลัมน์ใดเป็น null จะข้ามการตรวจ
-- แถวเก่าที่ loc_id เป็น null จึงผ่านได้ แต่แถวใหม่ที่ระบุที่เก็บจะถูกตรวจเสมอ
do $$
begin
  alter table public.txns drop constraint if exists txns_loc_in_wh;
  alter table public.txns add constraint txns_loc_in_wh
    foreign key (loc_id, wh_id) references public.locations (id, wh_id) on delete restrict;

  alter table public.txns drop constraint if exists txns_loc_to_in_wh_to;
  alter table public.txns add constraint txns_loc_to_in_wh_to
    foreign key (loc_to, wh_to) references public.locations (id, wh_id) on delete restrict;

  -- ที่เก็บปลายทางใช้ได้เฉพาะการโอนเท่านั้น
  alter table public.txns drop constraint if exists txns_loc_to_transfer_only;
  alter table public.txns add constraint txns_loc_to_transfer_only
    check (loc_to is null or type = 'TRANSFER');

  raise notice 'เพิ่มที่เก็บสินค้าบนรายการเคลื่อนไหวเรียบร้อย';
end
$$;

create index if not exists txns_loc_idx on public.txns (loc_id);

-- ------------------------------------------- คลังและที่เก็บประจำของสินค้า
-- ใช้เป็นค่าตั้งต้นบนหน้าจอ ไม่ได้บังคับว่าสินค้าต้องอยู่ที่นั่นเท่านั้น
-- ต้องอยู่หลังตาราง locations เหมือนกัน เพราะอ้าง foreign key คู่แบบเดียวกัน
alter table public.products add column if not exists def_wh_id  text;
alter table public.products add column if not exists def_loc_id text;

do $$
begin
  -- ที่เก็บประจำต้องอยู่ในคลังประจำจริง กติกาเดียวกับรายการเคลื่อนไหว
  -- on delete set null: ถ้าช่องเก็บถูกลบ จะล้างทั้งคู่ให้เอง
  -- (foreign key คู่ตั้งค่า null ให้ทุกคอลัมน์ของมัน จึงยังผ่าน check ด้านล่าง)
  alter table public.products drop constraint if exists products_def_loc_in_wh;
  alter table public.products add constraint products_def_loc_in_wh
    foreign key (def_loc_id, def_wh_id) references public.locations (id, wh_id) on delete set null;

  -- คลังกับที่เก็บต้องมาเป็นคู่: ตั้งทั้งคู่ หรือไม่ตั้งเลย
  -- ห้ามมีคลังประจำโดยไม่มีที่เก็บประจำ
  alter table public.products drop constraint if exists products_def_pair;
  alter table public.products add constraint products_def_pair
    check ((def_wh_id is null) = (def_loc_id is null));

  raise notice 'เพิ่มคลังและที่เก็บประจำของสินค้าเรียบร้อย';
end
$$;

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

-- ที่เก็บที่หยิบของไปขาย — เหตุผลเดียวกับ txns ข้างบน
alter table public.sales add column if not exists loc_id text;

do $$
begin
  alter table public.sales drop constraint if exists sales_loc_in_wh;
  alter table public.sales add constraint sales_loc_in_wh
    foreign key (loc_id, wh_id) references public.locations (id, wh_id) on delete restrict;
end
$$;

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

-- คำนวณยอดคงเหลือของสินค้าหนึ่งในคลังหนึ่ง ณ ปัจจุบัน
-- ใช้กติกาเดียวกับฝั่งแอป (lib/db.js stockMap) เพื่อให้ผลตรงกันเสมอ
create or replace function public.stock_of(p_product text, p_wh text)
returns numeric
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(sum(
    case
      when t.type = 'RECEIVE'              and t.wh_id = p_wh then  t.qty
      when t.type in ('ISSUE', 'SALE')     and t.wh_id = p_wh then -t.qty
      when t.type = 'ADJUST'               and t.wh_id = p_wh then  t.qty
      when t.type = 'TRANSFER'             and t.wh_id = p_wh then -t.qty
      when t.type = 'TRANSFER'             and t.wh_to = p_wh then  t.qty
      else 0
    end
  ), 0)
  from public.txns t
  where t.product_id = p_product
    and (t.wh_id = p_wh or t.wh_to = p_wh);
$$;

create or replace function public.create_sale(p_sale jsonb, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  it        jsonb;
  v_wh      text := p_sale ->> 'wh_id';
  v_pid     text;
  v_qty     numeric;
  v_have    numeric;
  v_name    text;
  v_loc     text;
  v_bin     numeric;
  v_bincode text;
begin
  insert into public.sales (
    id, doc_no, date, wh_id, loc_id, customer,
    subtotal, discount, vat, total, paid, change_amt,
    pay_method, user_name, note, ts
  )
  values (
    p_sale ->> 'id',
    p_sale ->> 'doc_no',
    (p_sale ->> 'date')::date,
    p_sale ->> 'wh_id',
    nullif(p_sale ->> 'loc_id', ''),
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
    v_pid := it ->> 'product_id';
    v_qty := (it ->> 'qty')::numeric;
    v_loc := nullif(it ->> 'loc_id', '');

    -- ทุกรายการที่ขายต้องบอกว่าหยิบมาจากช่องเก็บไหน
    if v_loc is null then
      raise exception 'ไม่ได้ระบุที่เก็บของสินค้า %', v_pid using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.locations where id = v_loc and wh_id = v_wh) then
      raise exception 'ที่เก็บ % ไม่ได้อยู่ในคลังที่ขาย', v_loc using errcode = 'P0001';
    end if;

    -- ล็อกเฉพาะคู่ (สินค้า, คลัง) นี้จนจบ transaction
    -- กันกรณีแคชเชียร์สองเครื่องขายชิ้นสุดท้ายพร้อมกันแล้วสต็อกติดลบ
    perform pg_advisory_xact_lock(hashtext(v_pid || '|' || v_wh));

    v_have := public.stock_of(v_pid, v_wh);
    if v_have < v_qty then
      select name into v_name from public.products where id = v_pid;
      raise exception 'สต็อกไม่พอ: % คงเหลือ % แต่ต้องการ %',
        coalesce(v_name, v_pid), v_have, v_qty
        using errcode = 'P0001';
    end if;

    -- ตัดของออกจากช่องเก็บด้วย ไม่ใช่แค่ยอดรวมของคลัง
    -- for update กันสองเครื่องหยิบของช่องเดียวกันพร้อมกัน
    select qty into v_bin
    from public.product_locations
    where product_id = v_pid and location_id = v_loc
    for update;

    if v_bin is null or v_bin < v_qty then
      select code into v_bincode from public.locations where id = v_loc;
      select name into v_name  from public.products  where id = v_pid;
      raise exception 'ของในช่องเก็บ % ไม่พอ: % มีอยู่ % แต่ต้องการ %',
        coalesce(v_bincode, v_loc), coalesce(v_name, v_pid), coalesce(v_bin, 0), v_qty
        using errcode = 'P0001';
    end if;

    if v_bin = v_qty then
      delete from public.product_locations
      where product_id = v_pid and location_id = v_loc;
    else
      update public.product_locations
      set qty = qty - v_qty
      where product_id = v_pid and location_id = v_loc;
    end if;

    insert into public.sale_items (id, sale_id, product_id, qty, price, amount)
    values (
      it ->> 'id',
      p_sale ->> 'id',
      v_pid,
      v_qty,
      (it ->> 'price')::numeric,
      (it ->> 'amount')::numeric
    );

    -- ตัดสต็อกด้วยรายการชนิด SALE เพื่อให้ยอดคงเหลือคำนวณจากที่เดียวเสมอ
    insert into public.txns (
      id, type, doc_no, date, product_id, qty, wh_id, wh_to,
      loc_id, loc_to, note, ref, user_name, ts
    )
    values (
      it ->> 'txn_id',
      'SALE',
      p_sale ->> 'doc_no',
      (p_sale ->> 'date')::date,
      v_pid,
      v_qty,
      v_wh,
      null,
      v_loc,
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
grant execute on function public.stock_of(text, text)        to authenticated;

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

    -- ชื่อ policy เป็น identifier ต้องใช้ %I (ครอบด้วย " )
    -- ถ้าใช้ %L จะได้ string literal ' ' ซึ่ง Postgres ปฏิเสธด้วย error 42601
    nm := t || ': authenticated full access';
    execute format('drop policy if exists %I on public.%I', nm, t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
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
