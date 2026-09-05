-- ============================================================================
-- Ultra ERP — ระบบควบคุมสินค้าคงคลัง
-- Schema สำหรับ Supabase — รันไฟล์นี้ใน SQL Editor ของโปรเจกต์ Supabase
--
-- ไฟล์เดียวจบทุกขั้นตอน — ไม่ต้องรันไฟล์อื่นอีก
--
-- วิธีใช้: Supabase Dashboard > SQL Editor > New query > วางทั้งไฟล์ > Run
--
-- ไฟล์นี้ทำให้ครบทุกอย่าง:
--   1. สร้างตารางทั้ง 13 ตาราง (ข้ามตารางที่มีอยู่แล้ว ไม่แตะข้อมูลเดิม)
--   2. ขยาย constraint ของ txns ให้รองรับประเภท SALE
--   3. สร้างฟังก์ชัน stock_of() create_sale() และ create_invoice()
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

-- ============================================================================
-- ลูกค้า
-- ----------------------------------------------------------------------------
-- ที่อยู่แยกเป็น ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ คนละคอลัมน์
-- เพราะต้องเอาไปกรองและออกรายงานรายจังหวัด ถ้าเก็บรวมเป็นก้อนเดียวจะแยกไม่ออก
create table if not exists public.customers (
  id          text primary key,
  code        text not null,
  name        text not null,
  address     text not null default '',
  subdistrict text not null default '',
  district    text not null default '',
  province    text not null default '',
  postcode    text not null default '',
  phone       text not null default '',
  kind        text not null default '',
  created_at  timestamptz not null default now()
);

-- รหัสลูกค้าต้องไม่ซ้ำ เพราะเป็นตัวที่คนใช้อ้างถึงกันในเอกสาร
create unique index if not exists customers_code_uniq on public.customers (code);

-- ============================================================================
-- กลุ่มเอกสาร (การกำหนดเลขที่เอกสารแบบรันนิ่ง)
-- ----------------------------------------------------------------------------
-- หนึ่งแถวคือหนึ่งชนิดรายการ (RECEIVE / ISSUE / TRANSFER / ADJUST / SALE)
-- เก็บเฉพาะ "รูปแบบ" ของเลขที่ ไม่เก็บตัวนับ
--
-- ทำไมไม่เก็บตัวนับไว้ในตารางนี้:
--   ฐานข้อมูลใช้ร่วมกันหลายเครื่อง ถ้าเก็บตัวนับแล้วสองเครื่องอ่านพร้อมกัน
--   จะได้เลขซ้ำกัน ระบบจึงหาเลขถัดไปจากเลขสูงสุดที่มีอยู่จริงใน txns เสมอ
--   (ดู nextDocNo ใน lib/db.js) ตารางนี้บอกแค่ว่า prefix หน้าตาเป็นอย่างไร
create table if not exists public.doc_groups (
  id         text primary key,
  name       text not null,
  prefix     text not null,
  period     text not null default 'month',
  digits     integer not null default 4,
  created_at timestamptz not null default now(),

  -- ต่อเนื่องตลอด / ขึ้นเลข 1 ใหม่ทุกปี / ขึ้นเลข 1 ใหม่ทุกเดือน
  constraint doc_groups_period check (period in ('none', 'year', 'month')),
  -- 1 หลักสั้นเกินจนชนกันง่าย เกิน 8 หลักก็เกินความจำเป็น
  constraint doc_groups_digits check (digits between 2 and 8)
);

-- ============================================================================
-- ข้อมูลกิจการผู้ออกใบกำกับภาษี
-- ----------------------------------------------------------------------------
-- แถวเดียวเสมอ (id = 'main') ใช้พิมพ์หัวใบกำกับภาษี
-- ใบกำกับภาษีเต็มรูปแบบต้องมีชื่อ ที่อยู่ และเลขประจำตัวผู้เสียภาษีของผู้ขาย
-- ถ้าเก็บเป็นค่าคงที่ในโค้ด คนใช้จะแก้เองไม่ได้ ต้องรอ deploy ใหม่ทุกครั้งที่ย้ายที่อยู่
create table if not exists public.company (
  id         text primary key default 'main',
  name       text not null default '',
  branch     text not null default 'สำนักงานใหญ่',
  tax_id     text not null default '',
  address    text not null default '',
  phone      text not null default '',
  email      text not null default '',
  created_at timestamptz not null default now(),

  constraint company_single_row check (id = 'main')
);

-- ลูกค้า: ข้อมูลฝั่งผู้ซื้อที่ใบกำกับภาษีเต็มรูปแบบบังคับให้มี
alter table public.customers add column if not exists tax_id text not null default '';
alter table public.customers add column if not exists branch text not null default '';

-- ============================================================================
-- การขายสินค้าและบริการ (ใบกำกับภาษีเต็มรูปแบบ)
-- ----------------------------------------------------------------------------
-- คนละเรื่องกับ sales ของหน้า POS:
--   POS      = ขายหน้าร้าน จบที่เคาน์เตอร์ ใบเสร็จอย่างย่อ ไม่มีการจัดส่ง
--   invoices = ขายเป็นเอกสาร มีลูกค้าในทะเบียน ส่วนลดรายบรรทัด ส่วนลดท้ายบิล
--              อัตราภาษีปรับได้ ออกใบกำกับภาษีเต็มรูปแบบ และมีสถานะการจัดส่ง
--
-- ชื่อ/ที่อยู่/เลขผู้เสียภาษีของลูกค้าถูกคัดลอกมาเก็บในใบด้วย (snapshot)
-- เพราะเอกสารภาษีต้องคงข้อความเดิม ณ วันที่ออก
-- ถ้าอ่านสดจากทะเบียนลูกค้า วันหนึ่งลูกค้าย้ายที่อยู่ ใบเก่าจะเปลี่ยนตามไปหมด
create table if not exists public.invoices (
  id            text primary key,
  doc_no        text not null,
  date          date not null,
  customer_id   text references public.customers (id) on delete restrict,
  cust_code     text not null default '',
  cust_name     text not null default '',
  cust_address  text not null default '',
  cust_tax_id   text not null default '',
  cust_branch   text not null default '',

  vat_rate      numeric not null default 7,
  items_total   numeric not null default 0,
  bill_discount numeric not null default 0,
  base          numeric not null default 0,
  vat           numeric not null default 0,
  total         numeric not null default 0,
  note          text not null default '',

  ship_status   text not null default 'PACKING',
  ship_from     text references public.warehouses (id) on delete set null,
  ship_note     text not null default '',
  ship_ts       bigint,

  user_name     text not null default '',
  ts            bigint not null,
  created_at    timestamptz not null default now(),

  constraint invoices_vat_rate check (vat_rate >= 0 and vat_rate <= 100)
);

-- จังหวัดปลายทาง เก็บแยกจากที่อยู่เต็มเพราะหน้าสถานะการจัดส่งกรองรายจังหวัด
-- แกะจากสตริงที่อยู่ทีหลังไม่ได้ ชื่อจังหวัดมีเว้นวรรคและคำนำหน้าไม่คงที่
alter table public.invoices add column if not exists cust_province text not null default '';

-- ระยะทางจัดส่งและพิกัดปลายทาง
-- ----------------------------------------------------------------------------
-- เก็บผลลัพธ์ไว้ ไม่ได้คำนวณสดทุกครั้งที่เปิดหน้าจอ เพราะ:
--   1. ต้องยิงบริการภายนอกสองตัว (แปลงที่อยู่เป็นพิกัด แล้วหาเส้นทาง)
--      ตารางที่มี 50 ใบจะกลายเป็น 100 คำขอทุกครั้งที่เปิดหน้า ซึ่งเกินโควตาที่เขาให้ใช้ฟรี
--   2. ระยะทางจากคลังเดิมไปที่อยู่เดิมไม่เปลี่ยน คำนวณซ้ำก็ได้เลขเดิม
-- ship_km_at บอกว่าคำนวณเมื่อไร ไว้ดูว่าเลขเก่าไปหรือยัง
alter table public.invoices add column if not exists cust_lat    double precision;
alter table public.invoices add column if not exists cust_lng    double precision;
alter table public.invoices add column if not exists ship_km     numeric;
alter table public.invoices add column if not exists ship_km_at  bigint;

-- สถานะจัดส่งเพิ่ม PACKED (จัดสินค้าเสร็จแล้ว) คั่นระหว่างกำลังจัดกับส่งแล้ว
-- ประกาศเป็น do block เพราะฐานข้อมูลเดิมมี constraint ชุดสามสถานะอยู่แล้ว
do $ship_status$
begin
  alter table public.invoices drop constraint if exists invoices_ship_status;
  alter table public.invoices add constraint invoices_ship_status
    check (ship_status in ('PACKING', 'PACKED', 'SHIPPED', 'DELIVERED'));
end
$ship_status$;

-- เลขที่เอกสารห้ามซ้ำ เพราะเป็นตัวที่ยิงบาร์โค๊ดค้นหาที่หน้าจัดส่ง
create unique index if not exists invoices_doc_no_key on public.invoices (doc_no);
create index if not exists invoices_ts_idx   on public.invoices (ts);
create index if not exists invoices_ship_idx on public.invoices (ship_status);

create table if not exists public.invoice_items (
  id         text primary key,
  invoice_id text not null references public.invoices (id) on delete cascade,
  product_id text not null references public.products (id) on delete restrict,
  wh_id      text not null references public.warehouses (id) on delete restrict,
  loc_id     text,
  qty        numeric not null,
  price      numeric not null default 0,
  -- ส่วนลดการค้าใส่ได้ทั้งเปอร์เซ็นต์และจำนวนเงิน หัก % ก่อนแล้วค่อยหักจำนวนเงิน
  disc_pct   numeric not null default 0,
  disc_amt   numeric not null default 0,
  amount     numeric not null default 0,
  seq        int not null default 0,
  created_at timestamptz not null default now(),

  constraint invoice_items_qty_positive check (qty > 0),
  constraint invoice_items_disc_pct check (disc_pct >= 0 and disc_pct <= 100),
  constraint invoice_items_disc_amt check (disc_amt >= 0)
);

create index if not exists invoice_items_inv_idx on public.invoice_items (invoice_id);

-- ที่เก็บที่ระบุต้องอยู่ในคลังของบรรทัดนั้นจริง กติกาเดียวกับ txns
do $inv_loc$
begin
  alter table public.invoice_items drop constraint if exists invoice_items_loc_in_wh;
  alter table public.invoice_items add constraint invoice_items_loc_in_wh
    foreign key (loc_id, wh_id) references public.locations (id, wh_id) on delete restrict;
end
$inv_loc$;

-- ----------------------------------------------------------------------------
-- บันทึกใบขายแบบ atomic — เหตุผลเดียวกับ create_sale ของหน้า POS
-- ต่างกันตรงที่แต่ละบรรทัดมีคลังและที่เก็บของตัวเอง ไม่ได้ผูกคลังเดียวทั้งใบ
create or replace function public.create_invoice(p_inv jsonb, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $create_invoice$
declare
  it        jsonb;
  v_pid     text;
  v_qty     numeric;
  v_wh      text;
  v_loc     text;
  v_have    numeric;
  v_bin     numeric;
  v_name    text;
  v_bincode text;
begin
  insert into public.invoices (
    id, doc_no, date, customer_id,
    cust_code, cust_name, cust_address, cust_province, cust_tax_id, cust_branch,
    vat_rate, items_total, bill_discount, base, vat, total, note,
    ship_status, ship_from, ship_note, user_name, ts
  )
  values (
    p_inv ->> 'id',
    p_inv ->> 'doc_no',
    (p_inv ->> 'date')::date,
    nullif(p_inv ->> 'customer_id', ''),
    coalesce(p_inv ->> 'cust_code', ''),
    coalesce(p_inv ->> 'cust_name', ''),
    coalesce(p_inv ->> 'cust_address', ''),
    coalesce(p_inv ->> 'cust_province', ''),
    coalesce(p_inv ->> 'cust_tax_id', ''),
    coalesce(p_inv ->> 'cust_branch', ''),
    (p_inv ->> 'vat_rate')::numeric,
    (p_inv ->> 'items_total')::numeric,
    (p_inv ->> 'bill_discount')::numeric,
    (p_inv ->> 'base')::numeric,
    (p_inv ->> 'vat')::numeric,
    (p_inv ->> 'total')::numeric,
    coalesce(p_inv ->> 'note', ''),
    coalesce(p_inv ->> 'ship_status', 'PACKING'),
    nullif(p_inv ->> 'ship_from', ''),
    coalesce(p_inv ->> 'ship_note', ''),
    coalesce(p_inv ->> 'user_name', ''),
    (p_inv ->> 'ts')::bigint
  );

  for it in select * from jsonb_array_elements(p_items)
  loop
    v_pid := it ->> 'product_id';
    v_qty := (it ->> 'qty')::numeric;
    v_wh  := it ->> 'wh_id';
    v_loc := nullif(it ->> 'loc_id', '');

    if v_loc is null then
      raise exception 'ไม่ได้ระบุที่เก็บของสินค้า %', v_pid using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.locations where id = v_loc and wh_id = v_wh) then
      raise exception 'ที่เก็บ % ไม่ได้อยู่ในคลังที่ขาย', v_loc using errcode = 'P0001';
    end if;

    -- ล็อกคู่ (สินค้า, คลัง) จนจบ transaction กันสองเครื่องขายชิ้นสุดท้ายพร้อมกัน
    perform pg_advisory_xact_lock(hashtext(v_pid || '|' || v_wh));

    v_have := public.stock_of(v_pid, v_wh);
    if v_have < v_qty then
      select name into v_name from public.products where id = v_pid;
      raise exception 'สต็อกไม่พอ: % คงเหลือ % แต่ต้องการ %',
        coalesce(v_name, v_pid), v_have, v_qty
        using errcode = 'P0001';
    end if;

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

    insert into public.invoice_items (
      id, invoice_id, product_id, wh_id, loc_id, qty, price, disc_pct, disc_amt, amount, seq
    )
    values (
      it ->> 'id',
      p_inv ->> 'id',
      v_pid,
      v_wh,
      v_loc,
      v_qty,
      (it ->> 'price')::numeric,
      (it ->> 'disc_pct')::numeric,
      (it ->> 'disc_amt')::numeric,
      (it ->> 'amount')::numeric,
      (it ->> 'seq')::int
    );

    -- ตัดสต็อกด้วยรายการชนิด SALE เหมือน POS เพื่อให้ยอดคงเหลือมาจากที่เดียวเสมอ
    insert into public.txns (
      id, type, doc_no, date, product_id, qty, wh_id, wh_to,
      loc_id, loc_to, note, ref, user_name, ts
    )
    values (
      it ->> 'txn_id',
      'SALE',
      p_inv ->> 'doc_no',
      (p_inv ->> 'date')::date,
      v_pid,
      v_qty,
      v_wh,
      null,
      v_loc,
      null,
      'ขายสินค้าและบริการ',
      p_inv ->> 'doc_no',
      coalesce(p_inv ->> 'user_name', ''),
      (p_inv ->> 'ts')::bigint
    );
  end loop;
end;
$create_invoice$;

-- ============================================================================
-- สิทธิการใช้งานหน้าจอ
-- ----------------------------------------------------------------------------
-- หนึ่งแถวคือหนึ่งหน้าจอ ไม่มีแถว = ยังไม่ได้จำกัดสิทธิ ใช้ได้เต็มทุกอย่าง
-- (ค่าเริ่มต้นต้องเป็น "เปิดหมด" ไม่ใช่ "ปิดหมด" ไม่งั้นระบบที่ยังไม่ตั้งค่า
--  จะเปิดมาแล้วว่างเปล่าจนคนใช้คิดว่าโปรแกรมพัง)
--
-- สิทธินี้เป็นของทั้งระบบ ไม่ได้แยกรายผู้ใช้ — ระบบยังไม่มีตารางบทบาทผู้ใช้
create table if not exists public.screen_perms (
  id         text primary key,
  can_view   boolean not null default true,
  can_edit   boolean not null default true,
  can_date   boolean not null default true,
  created_at timestamptz not null default now()
);

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
grant all privileges on table public.doc_groups        to authenticated;
grant all privileges on table public.customers         to authenticated;
grant all privileges on table public.company           to authenticated;
grant all privileges on table public.invoices          to authenticated;
grant all privileges on table public.invoice_items     to authenticated;
grant all privileges on table public.screen_perms      to authenticated;

grant execute on function public.create_sale(jsonb, jsonb)    to authenticated;
grant execute on function public.create_invoice(jsonb, jsonb) to authenticated;
grant execute on function public.stock_of(text, text)         to authenticated;

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
    'locations', 'product_locations', 'sales', 'sale_items',
    'doc_groups', 'customers', 'company', 'invoices', 'invoice_items',
    'screen_perms'
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

  raise notice 'ตั้งค่า RLS ครบ 13 ตารางแล้ว';
end
$$;

-- ============================================================================
-- สร้างผู้ใช้สำหรับเข้าระบบ
-- ----------------------------------------------------------------------------
-- ระบบนี้ไม่มีหน้าสมัครสมาชิก ให้สร้างผู้ใช้จาก Dashboard แทน:
--
--   Supabase Dashboard > Authentication > Users > Add user
--     Email:          admin@example.com       (หรืออีเมลจริงที่ต้องการ)
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
  ('locations'), ('product_locations'), ('sales'), ('sale_items'),
  ('doc_groups'), ('customers'), ('company'), ('invoices'), ('invoice_items'),
  ('screen_perms')
) as x(name)
order by x.name;
