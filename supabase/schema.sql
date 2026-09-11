-- ============================================================================
-- One for All Ultra — ระบบควบคุมสินค้าคงคลัง
-- Schema สำหรับ Supabase — รันไฟล์นี้ใน SQL Editor ของโปรเจกต์ Supabase
--
-- ไฟล์เดียวจบทุกขั้นตอน — ไม่ต้องรันไฟล์อื่นอีก
--
-- วิธีใช้: Supabase Dashboard > SQL Editor > New query > วางทั้งไฟล์ > Run
--
-- ไฟล์นี้ทำให้ครบทุกอย่าง:
--   1. สร้างตารางทั้ง 30 ตาราง (ข้ามตารางที่มีอยู่แล้ว ไม่แตะข้อมูลเดิม)
--   2. ขยาย constraint ของ txns ให้รองรับประเภท SALE
--   3. สร้างฟังก์ชัน stock_of() create_sale() create_invoice()
--      create_purchase() และ create_purchase_return()
--   4. เพิ่มเลขลำดับแถว (row_order) ให้ทุกตาราง พร้อมเติมเลขให้แถวเดิม
--   5. GRANT สิทธิ์ระดับตารางให้ role authenticated
--   6. เปิด RLS และสร้าง policy ครบทุกตาราง
--   7. สั่ง PostgREST รีเฟรช schema cache
--   8. แสดงตารางสรุปผลว่าครบหรือไม่
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

-- ------------------------------------------- การจัดกลุ่มสินค้า
-- กลุ่ม / ยี่ห้อ / ประเภท แยกกันสามช่อง ไม่ยัดรวมเป็นช่องเดียว
-- เพราะเป้าขายกำหนดแยกรายมิติได้ (เป้าของยี่ห้อหนึ่ง คนละอันกับเป้าของกลุ่มหนึ่ง)
-- ถ้าเก็บรวมกันจะแยกไม่ออกว่าคำไหนคือมิติไหน
--
-- เป็นข้อความอิสระ ไม่ทำเป็นตารางอ้างอิง เพราะรายชื่อพวกนี้เปลี่ยนบ่อยตามสินค้าที่เข้ามา
-- และหน้าจอเลือกจากค่าที่เคยใช้ได้อยู่แล้ว (datalist) จึงไม่ต้องมีหน้าจัดการอีกหน้า
alter table public.products add column if not exists grp   text not null default '';
alter table public.products add column if not exists brand text not null default '';
alter table public.products add column if not exists kind  text not null default '';

create index if not exists products_brand_idx on public.products (brand) where brand <> '';
create index if not exists products_grp_idx   on public.products (grp)   where grp   <> '';

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
    id, doc_no, date, wh_id, loc_id, customer_id, cust_code, customer,
    subtotal, discount, vat, total, paid, change_amt,
    pay_method, user_name, note, ts
  )
  values (
    p_sale ->> 'id',
    p_sale ->> 'doc_no',
    (p_sale ->> 'date')::date,
    p_sale ->> 'wh_id',
    nullif(p_sale ->> 'loc_id', ''),
    -- เลือกรหัสลูกค้าจากทะเบียนหรือไม่เลือกก็ได้ ขายให้คนเดินเข้าร้านยังต้องขายได้
    nullif(p_sale ->> 'customer_id', ''),
    coalesce(p_sale ->> 'cust_code', ''),
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

-- ลูกค้าเริ่มต้นของหน้าขายสินค้า (POS)
-- ----------------------------------------------------------------------------
-- ร้านส่วนใหญ่ขายให้ "ลูกค้าทั่วไป" เป็นหลัก แต่บางที่ขายให้ลูกค้าประจำรายเดียวเกือบทั้งวัน
-- ติ๊กไว้ที่ลูกค้ารายนั้นแล้วหน้า POS จะเลือกให้เองทุกบิล ไม่ต้องมานั่งเลือกซ้ำทุกครั้ง
--
-- เก็บเป็นธงบนตัวลูกค้า ไม่ได้เก็บเป็นค่าตั้งค่าแยกตาราง เพราะเป็นคุณสมบัติของลูกค้ารายนั้น
-- และปุ่มที่คนกดก็อยู่ในหน้าลูกค้ารายนั้นอยู่แล้ว
--
-- จงใจไม่ทำ unique index ให้ติ๊กได้แค่รายเดียว ด้วยเหตุผลเดียวกับ print_forms.is_default:
--   ตัวโปรแกรมปลดของรายอื่นให้เองตอนกดตั้ง (ดู upsertCustomer ใน lib/api.js)
--   ถ้าบังคับที่ฐานข้อมูล วันที่กู้คืนไฟล์สำรองที่มีสองรายติ๊กไว้จะกู้ไม่ขึ้นทั้งไฟล์
--   พร้อม error ที่ไม่มีใครเดาได้ว่าเกี่ยวกับหน้า POS
--   ฝั่งอ่านเลือกรายที่รหัสน้อยสุดเสมอ (posCustomerOf ใน lib/db.js) ผลจึงไม่แกว่ง
alter table public.customers add column if not exists pos_default boolean not null default false;

create index if not exists customers_pos_default_idx
  on public.customers (pos_default) where pos_default;

-- ลูกค้าที่ผูกกับบิลขายหน้าร้าน
-- ----------------------------------------------------------------------------
-- เดิมบิล POS เก็บแค่ "ชื่อลูกค้า" เป็นข้อความอิสระ ซึ่งพิมพ์ผิดได้ ซ้ำได้ และเทียบกับ
-- ทะเบียนลูกค้าไม่ได้เลย รายงานยอดขายรายลูกค้าจึงรวมชื่อที่สะกดต่างกันไม่ติด
--
-- cust_code เก็บรหัส ณ วันที่ขาย (snapshot) เหตุผลเดียวกับใบกำกับภาษี
-- เอกสารต้องคงข้อความเดิม ต่อให้ทะเบียนลูกค้าถูกแก้รหัสทีหลัง
-- ส่วน customer_id ไว้ตามกลับไปหาทะเบียน เป็น set null เพราะลบลูกค้าแล้วบิลเก่าต้องยังอยู่
--
-- ยังเก็บ customer (ชื่อ) ไว้เหมือนเดิม เพราะขายให้คนเดินเข้าร้านที่ไม่มีในทะเบียนก็ยังต้องได้
alter table public.sales add column if not exists customer_id text;
alter table public.sales add column if not exists cust_code   text not null default '';

do $sale_cust$
begin
  alter table public.sales drop constraint if exists sales_customer_fk;
  alter table public.sales add constraint sales_customer_fk
    foreign key (customer_id) references public.customers (id) on delete set null;
end
$sale_cust$;

create index if not exists sales_customer_idx on public.sales (customer_id);

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

  ship_status   text not null default 'WAIT',
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

-- สถานะจัดส่ง 5 ขั้น — หนึ่งขั้นคือหนึ่งจุดที่มีคนรับช่วงต่อ
--   WAIT      ใบเพิ่งออกจากหน้าขาย ยังไม่ถึงมือคลัง
--   PACKING   ใบถึงจุดจัดสินค้าแล้ว
--   PACKED    คลังหยิบของครบแล้ว รอขนส่ง
--   SHIPPED   ของออกจากคลังไปกับขนส่ง
--   DELIVERED ลูกค้ารับของแล้ว
-- ประกาศเป็น do block เพราะฐานข้อมูลเดิมมี constraint ชุดเก่าอยู่แล้ว
do $ship_status$
begin
  alter table public.invoices drop constraint if exists invoices_ship_status;
  alter table public.invoices add constraint invoices_ship_status
    check (ship_status in ('WAIT', 'PACKING', 'PACKED', 'SHIPPED', 'DELIVERED'));

  -- ใบใหม่เริ่มที่ "รอส่งจัดสินค้า" ไม่ใช่ "รอจัดสินค้า"
  -- เพราะช่วงที่ใบยังไม่ถึงคลังก็เป็นเวลาที่ต้องวัดเหมือนกัน
  alter table public.invoices alter column ship_status set default 'WAIT';
end
$ship_status$;

-- ============================================================================
-- บันทึกการเดินสถานะจัดส่ง (ship_events)
-- ----------------------------------------------------------------------------
-- หนึ่งแถวคือ "ใบนี้เข้าสถานะนี้ เมื่อเวลานี้ ที่จุดนี้ โดยคนนี้"
--
-- ทำไมไม่เก็บเวลาเป็นคอลัมน์ในตาราง invoices (packed_at, shipped_at, ...):
--   1. ของตีกลับหรือยิงผิดจุดแล้วย้อนสถานะเกิดขึ้นจริงในงาน
--      ถ้าเป็นคอลัมน์เดียวจะถูกเขียนทับ ประวัติหายไปเงียบ ๆ
--   2. เพิ่มขั้นตอนใหม่ทีหลังต้องไปเพิ่มคอลัมน์ ซึ่งต้องแก้ทั้งสาย
--   3. อยากรู้ว่า "ใครยิง" กับ "ยิงที่จุดไหน" ด้วย ไม่ใช่แค่เวลา
-- เก็บเป็นเหตุการณ์จึงคำนวณเวลาแต่ละขั้นย้อนหลังได้ และตรวจสอบได้ว่าใครทำ
--
-- invoices.ship_status ยังเก็บสถานะปัจจุบันไว้เหมือนเดิม
-- เพราะกระดานสถานะกรองด้วยสถานะปัจจุบันตลอด ถ้าต้องไล่หาจากเหตุการณ์ทุกครั้งจะช้า
create table if not exists public.ship_events (
  id         text primary key,
  invoice_id text not null references public.invoices (id) on delete cascade,
  doc_no     text not null default '',
  status     text not null,
  station    text not null default '',
  note       text not null default '',
  user_name  text not null default '',
  ts         bigint not null,
  created_at timestamptz not null default now(),

  constraint ship_events_status
    check (status in ('WAIT', 'PACKING', 'PACKED', 'SHIPPED', 'DELIVERED'))
);

create index if not exists ship_events_inv_idx on public.ship_events (invoice_id);
create index if not exists ship_events_ts_idx  on public.ship_events (ts);

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
    cust_kind,
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
    coalesce(p_inv ->> 'cust_kind', ''),
    (p_inv ->> 'vat_rate')::numeric,
    (p_inv ->> 'items_total')::numeric,
    (p_inv ->> 'bill_discount')::numeric,
    (p_inv ->> 'base')::numeric,
    (p_inv ->> 'vat')::numeric,
    (p_inv ->> 'total')::numeric,
    coalesce(p_inv ->> 'note', ''),
    coalesce(p_inv ->> 'ship_status', 'WAIT'),
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
-- เจ้าหนี้ (ผู้ขายสินค้าให้เรา)
-- ----------------------------------------------------------------------------
-- โครงเดียวกับตารางลูกค้าทุกประการ เพราะเป็น "คู่ค้า" เหมือนกัน
-- แค่คนละทิศทางของการค้า จึงตั้งใจให้หน้าจอและข้อมูลเหมือนกันด้วย
-- คนที่ใช้หน้าลูกค้าเป็นแล้วจะใช้หน้านี้ได้ทันทีโดยไม่ต้องเรียนใหม่
--
-- ไม่รวมกับ customers เป็นตารางเดียวแล้วใส่ธง เพราะคู่ค้าบางรายเป็นทั้งลูกค้า
-- และเจ้าหนี้ แต่มีรหัส เงื่อนไข และที่อยู่ส่งของคนละชุดกัน
create table if not exists public.suppliers (
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
  tax_id      text not null default '',
  branch      text not null default '',
  created_at  timestamptz not null default now()
);

create unique index if not exists suppliers_code_uniq on public.suppliers (code);

-- ============================================================================
-- การซื้อสินค้าและบริการ
-- ----------------------------------------------------------------------------
-- ด้านกลับของ invoices: invoices คือเราขายให้ลูกค้า purchases คือเราซื้อจากเจ้าหนี้
-- โครงเหมือนกันเป๊ะ (ส่วนลดรายบรรทัด ส่วนลดท้ายบิล อัตราภาษี) ต่างกันที่:
--   invoices  ตัดสต็อกออก  ด้วยรายการชนิด SALE
--   purchases เพิ่มสต็อกเข้า ด้วยรายการชนิด RECEIVE
--
-- ชื่อ/ที่อยู่/เลขผู้เสียภาษีของเจ้าหนี้ถูกคัดลอกมาเก็บในใบ (snapshot)
-- เหตุผลเดียวกับใบขาย เอกสารภาษีต้องคงข้อความเดิม ณ วันที่ออก
create table if not exists public.purchases (
  id            text primary key,
  doc_no        text not null,
  date          date not null,
  supplier_id   text references public.suppliers (id) on delete restrict,
  sup_code      text not null default '',
  sup_name      text not null default '',
  sup_address   text not null default '',
  sup_province  text not null default '',
  sup_tax_id    text not null default '',
  sup_branch    text not null default '',

  -- เลขที่ใบกำกับภาษีของเจ้าหนี้ คนละเลขกับเลขที่เอกสารของเรา
  -- ต้องเก็บไว้เพราะเป็นตัวที่ใช้อ้างตอนยื่นภาษีซื้อ
  ref_no        text not null default '',

  vat_rate      numeric not null default 7,
  items_total   numeric not null default 0,
  bill_discount numeric not null default 0,
  base          numeric not null default 0,
  vat           numeric not null default 0,
  total         numeric not null default 0,
  note          text not null default '',

  user_name     text not null default '',
  ts            bigint not null,
  created_at    timestamptz not null default now(),

  constraint purchases_vat_rate check (vat_rate >= 0 and vat_rate <= 100)
);

create unique index if not exists purchases_doc_no_key on public.purchases (doc_no);
create index if not exists purchases_ts_idx on public.purchases (ts);

create table if not exists public.purchase_items (
  id          text primary key,
  purchase_id text not null references public.purchases (id) on delete cascade,
  product_id  text not null references public.products (id) on delete restrict,
  wh_id       text not null references public.warehouses (id) on delete restrict,
  loc_id      text,
  qty         numeric not null,
  price       numeric not null default 0,
  disc_pct    numeric not null default 0,
  disc_amt    numeric not null default 0,
  amount      numeric not null default 0,
  seq         int not null default 0,
  created_at  timestamptz not null default now(),

  constraint purchase_items_qty_positive check (qty > 0),
  constraint purchase_items_disc_pct check (disc_pct >= 0 and disc_pct <= 100),
  constraint purchase_items_disc_amt check (disc_amt >= 0)
);

create index if not exists purchase_items_pur_idx on public.purchase_items (purchase_id);

do $pur_loc$
begin
  alter table public.purchase_items drop constraint if exists purchase_items_loc_in_wh;
  alter table public.purchase_items add constraint purchase_items_loc_in_wh
    foreign key (loc_id, wh_id) references public.locations (id, wh_id) on delete restrict;
end
$pur_loc$;

-- ============================================================================
-- การส่งคืนสินค้าและบริการ (คืนของให้เจ้าหนี้)
-- ----------------------------------------------------------------------------
-- ต้องอ้างใบซื้อเสมอ (purchase_id บังคับ ไม่ใช่ null ได้)
-- คืนของที่ไม่เคยซื้อไม่ได้ และคืนเกินจำนวนที่ซื้อมาก็ไม่ได้
-- ถ้าปล่อยให้คืนลอย ๆ ยอดภาษีซื้อกับของจริงจะไม่ตรงกันแล้วตามกลับไม่ได้ว่าคืนของใบไหน
create table if not exists public.purchase_returns (
  id            text primary key,
  doc_no        text not null,
  date          date not null,
  purchase_id   text not null references public.purchases (id) on delete restrict,
  pur_doc_no    text not null default '',
  supplier_id   text references public.suppliers (id) on delete restrict,
  sup_code      text not null default '',
  sup_name      text not null default '',
  sup_address   text not null default '',
  sup_province  text not null default '',
  sup_tax_id    text not null default '',
  sup_branch    text not null default '',

  reason        text not null default '',
  vat_rate      numeric not null default 7,
  items_total   numeric not null default 0,
  bill_discount numeric not null default 0,
  base          numeric not null default 0,
  vat           numeric not null default 0,
  total         numeric not null default 0,
  note          text not null default '',

  user_name     text not null default '',
  ts            bigint not null,
  created_at    timestamptz not null default now(),

  constraint purchase_returns_vat_rate check (vat_rate >= 0 and vat_rate <= 100)
);

create unique index if not exists purchase_returns_doc_no_key on public.purchase_returns (doc_no);
create index if not exists purchase_returns_pur_idx on public.purchase_returns (purchase_id);
create index if not exists purchase_returns_ts_idx  on public.purchase_returns (ts);

create table if not exists public.purchase_return_items (
  id        text primary key,
  return_id text not null references public.purchase_returns (id) on delete cascade,
  item_id   text not null default '',
  product_id text not null references public.products (id) on delete restrict,
  wh_id     text not null references public.warehouses (id) on delete restrict,
  loc_id    text,
  qty       numeric not null,
  price     numeric not null default 0,
  disc_pct  numeric not null default 0,
  disc_amt  numeric not null default 0,
  amount    numeric not null default 0,
  seq       int not null default 0,
  created_at timestamptz not null default now(),

  constraint purchase_return_items_qty_positive check (qty > 0)
);

create index if not exists purchase_return_items_ret_idx
  on public.purchase_return_items (return_id);

do $ret_loc$
begin
  alter table public.purchase_return_items drop constraint if exists purchase_return_items_loc_in_wh;
  alter table public.purchase_return_items add constraint purchase_return_items_loc_in_wh
    foreign key (loc_id, wh_id) references public.locations (id, wh_id) on delete restrict;
end
$ret_loc$;

-- ----------------------------------------------------------------------------
-- บันทึกใบซื้อแบบ atomic — ด้านกลับของ create_invoice
-- เพิ่มของเข้าช่องเก็บ ไม่ใช่ตัดออก จึงไม่ต้องตรวจว่าของพอไหม
create or replace function public.create_purchase(p_pur jsonb, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $create_purchase$
declare
  it    jsonb;
  v_pid text;
  v_qty numeric;
  v_wh  text;
  v_loc text;
begin
  insert into public.purchases (
    id, doc_no, date, supplier_id,
    sup_code, sup_name, sup_address, sup_province, sup_tax_id, sup_branch,
    ref_no, vat_rate, items_total, bill_discount, base, vat, total, note,
    user_name, ts
  )
  values (
    p_pur ->> 'id',
    p_pur ->> 'doc_no',
    (p_pur ->> 'date')::date,
    nullif(p_pur ->> 'supplier_id', ''),
    coalesce(p_pur ->> 'sup_code', ''),
    coalesce(p_pur ->> 'sup_name', ''),
    coalesce(p_pur ->> 'sup_address', ''),
    coalesce(p_pur ->> 'sup_province', ''),
    coalesce(p_pur ->> 'sup_tax_id', ''),
    coalesce(p_pur ->> 'sup_branch', ''),
    coalesce(p_pur ->> 'ref_no', ''),
    (p_pur ->> 'vat_rate')::numeric,
    (p_pur ->> 'items_total')::numeric,
    (p_pur ->> 'bill_discount')::numeric,
    (p_pur ->> 'base')::numeric,
    (p_pur ->> 'vat')::numeric,
    (p_pur ->> 'total')::numeric,
    coalesce(p_pur ->> 'note', ''),
    coalesce(p_pur ->> 'user_name', ''),
    (p_pur ->> 'ts')::bigint
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
      raise exception 'ที่เก็บ % ไม่ได้อยู่ในคลังที่รับ', v_loc using errcode = 'P0001';
    end if;

    insert into public.purchase_items (
      id, purchase_id, product_id, wh_id, loc_id, qty, price, disc_pct, disc_amt, amount, seq
    )
    values (
      it ->> 'id',
      p_pur ->> 'id',
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

    -- เพิ่มของเข้าช่องเก็บ มีแถวอยู่แล้วก็บวกทับ
    insert into public.product_locations (id, product_id, location_id, qty)
    values (it ->> 'pl_id', v_pid, v_loc, v_qty)
    on conflict (product_id, location_id)
    do update set qty = public.product_locations.qty + excluded.qty;

    -- ยอดคงเหลือมาจาก txns ที่เดียวเสมอ ใบซื้อจึงต้องสร้างรายการรับด้วย
    insert into public.txns (
      id, type, doc_no, date, product_id, qty, wh_id, wh_to,
      loc_id, loc_to, note, ref, user_name, ts
    )
    values (
      it ->> 'txn_id',
      'RECEIVE',
      p_pur ->> 'doc_no',
      (p_pur ->> 'date')::date,
      v_pid,
      v_qty,
      v_wh,
      null,
      v_loc,
      null,
      'ซื้อสินค้าและบริการ',
      coalesce(nullif(p_pur ->> 'ref_no', ''), p_pur ->> 'doc_no'),
      coalesce(p_pur ->> 'user_name', ''),
      (p_pur ->> 'ts')::bigint
    );
  end loop;
end;
$create_purchase$;

-- ----------------------------------------------------------------------------
-- บันทึกใบส่งคืนแบบ atomic — ตัดของออกเหมือนการขาย
-- ตรวจสองชั้น: ของในช่องเก็บต้องพอ และคืนรวมกันต้องไม่เกินที่ซื้อมาในใบนั้น
create or replace function public.create_purchase_return(p_ret jsonb, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $create_return$
declare
  it        jsonb;
  v_pid     text;
  v_qty     numeric;
  v_wh      text;
  v_loc     text;
  v_item    text;
  v_bought  numeric;
  v_back    numeric;
  v_bin     numeric;
  v_name    text;
  v_bincode text;
begin
  insert into public.purchase_returns (
    id, doc_no, date, purchase_id, pur_doc_no, supplier_id,
    sup_code, sup_name, sup_address, sup_province, sup_tax_id, sup_branch,
    reason, vat_rate, items_total, bill_discount, base, vat, total, note,
    user_name, ts
  )
  values (
    p_ret ->> 'id',
    p_ret ->> 'doc_no',
    (p_ret ->> 'date')::date,
    p_ret ->> 'purchase_id',
    coalesce(p_ret ->> 'pur_doc_no', ''),
    nullif(p_ret ->> 'supplier_id', ''),
    coalesce(p_ret ->> 'sup_code', ''),
    coalesce(p_ret ->> 'sup_name', ''),
    coalesce(p_ret ->> 'sup_address', ''),
    coalesce(p_ret ->> 'sup_province', ''),
    coalesce(p_ret ->> 'sup_tax_id', ''),
    coalesce(p_ret ->> 'sup_branch', ''),
    coalesce(p_ret ->> 'reason', ''),
    (p_ret ->> 'vat_rate')::numeric,
    (p_ret ->> 'items_total')::numeric,
    (p_ret ->> 'bill_discount')::numeric,
    (p_ret ->> 'base')::numeric,
    (p_ret ->> 'vat')::numeric,
    (p_ret ->> 'total')::numeric,
    coalesce(p_ret ->> 'note', ''),
    coalesce(p_ret ->> 'user_name', ''),
    (p_ret ->> 'ts')::bigint
  );

  for it in select * from jsonb_array_elements(p_items)
  loop
    v_pid  := it ->> 'product_id';
    v_qty  := (it ->> 'qty')::numeric;
    v_wh   := it ->> 'wh_id';
    v_loc  := nullif(it ->> 'loc_id', '');
    v_item := coalesce(it ->> 'item_id', '');

    if v_loc is null then
      raise exception 'ไม่ได้ระบุที่เก็บของสินค้า %', v_pid using errcode = 'P0001';
    end if;

    -- คืนเกินที่ซื้อมาไม่ได้ นับรวมใบคืนก่อนหน้าของบรรทัดเดียวกันด้วย
    select coalesce(sum(qty), 0) into v_bought
    from public.purchase_items
    where id = v_item and purchase_id = p_ret ->> 'purchase_id';

    select coalesce(sum(ri.qty), 0) into v_back
    from public.purchase_return_items ri
    join public.purchase_returns r on r.id = ri.return_id
    where ri.item_id = v_item
      and r.purchase_id = p_ret ->> 'purchase_id'
      and r.id <> p_ret ->> 'id';

    if v_bought = 0 then
      raise exception 'บรรทัดที่คืนไม่ได้อยู่ในใบซื้อที่อ้างถึง' using errcode = 'P0001';
    end if;
    if v_back + v_qty > v_bought then
      select name into v_name from public.products where id = v_pid;
      raise exception 'คืนเกินที่ซื้อมา: % ซื้อ % คืนไปแล้ว % คืนอีก %',
        coalesce(v_name, v_pid), v_bought, v_back, v_qty
        using errcode = 'P0001';
    end if;

    perform pg_advisory_xact_lock(hashtext(v_pid || '|' || v_wh));

    select qty into v_bin
    from public.product_locations
    where product_id = v_pid and location_id = v_loc
    for update;

    if v_bin is null or v_bin < v_qty then
      select code into v_bincode from public.locations where id = v_loc;
      select name into v_name  from public.products  where id = v_pid;
      raise exception 'ของในช่องเก็บ % ไม่พอคืน: % มีอยู่ % แต่จะคืน %',
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

    insert into public.purchase_return_items (
      id, return_id, item_id, product_id, wh_id, loc_id,
      qty, price, disc_pct, disc_amt, amount, seq
    )
    values (
      it ->> 'id',
      p_ret ->> 'id',
      v_item,
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

    -- ของออกจากคลังจริง จึงเป็นรายการชนิดเบิก
    insert into public.txns (
      id, type, doc_no, date, product_id, qty, wh_id, wh_to,
      loc_id, loc_to, note, ref, user_name, ts
    )
    values (
      it ->> 'txn_id',
      'ISSUE',
      p_ret ->> 'doc_no',
      (p_ret ->> 'date')::date,
      v_pid,
      v_qty,
      v_wh,
      null,
      v_loc,
      null,
      'ส่งคืนสินค้าและบริการ',
      coalesce(p_ret ->> 'pur_doc_no', ''),
      coalesce(p_ret ->> 'user_name', ''),
      (p_ret ->> 'ts')::bigint
    );
  end loop;
end;
$create_return$;

-- ============================================================================
-- ใบตรวจนับสินค้า
-- ----------------------------------------------------------------------------
-- แยกเป็นสองหน้าจอ: เตรียมเอกสารที่โต๊ะ แล้วเดินนับด้วยมือถือ
-- เอกสารจึงต้องอยู่บนฐานข้อมูล ไม่ใช่ในหน่วยความจำของหน้าจอเดียว
-- (เตรียมที่คอมพิวเตอร์แล้วไปนับด้วยมือถือ คนละเครื่องกัน)
--
-- sys_qty เก็บยอดในระบบ "ณ ตอนเตรียมเอกสาร" ไม่ได้อ่านสดตอนนับ
-- เพราะการนับคือการเทียบของจริงกับยอด ณ เวลาที่เริ่มนับ
-- ถ้าอ่านสดแล้วมีคนเบิกของระหว่างที่เดินนับอยู่ ผลต่างจะเพี้ยนโดยไม่มีใครรู้
create table if not exists public.stock_counts (
  id         text primary key,
  doc_no     text not null,
  date       date not null,
  wh_id      text not null references public.warehouses (id) on delete restrict,
  by1        text not null default '',
  by2        text not null default '',
  status     text not null default 'OPEN',
  note       text not null default '',
  user_name  text not null default '',
  ts         bigint not null,
  posted_doc text not null default '',
  created_at timestamptz not null default now(),

  -- OPEN = กำลังนับ · DONE = ปิดแล้ว (บันทึกผลต่างเป็นเอกสารปรับปรุงไปแล้ว)
  constraint stock_counts_status check (status in ('OPEN', 'DONE'))
);

create unique index if not exists stock_counts_doc_no_key on public.stock_counts (doc_no);
create index if not exists stock_counts_status_idx on public.stock_counts (status);

create table if not exists public.stock_count_items (
  id         text primary key,
  count_id   text not null references public.stock_counts (id) on delete cascade,
  product_id text not null references public.products (id) on delete restrict,
  wh_id      text not null references public.warehouses (id) on delete restrict,
  loc_id     text,
  sys_qty    numeric not null default 0,
  -- null = ยังไม่ได้นับ ต่างจาก 0 ที่แปลว่านับแล้วไม่เจอของเลย
  counted    numeric,
  counted_at bigint,
  seq        int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists stock_count_items_cnt_idx on public.stock_count_items (count_id);

do $cnt_loc$
begin
  alter table public.stock_count_items drop constraint if exists stock_count_items_loc_in_wh;
  alter table public.stock_count_items add constraint stock_count_items_loc_in_wh
    foreign key (loc_id, wh_id) references public.locations (id, wh_id) on delete restrict;
end
$cnt_loc$;

-- ============================================================================
-- ฟอร์มพิมพ์ที่ออกแบบเอง
-- ----------------------------------------------------------------------------
-- เก็บ "สิ่งที่เลือกไว้" ของฟอร์มหนึ่ง ไม่ได้เก็บตำแหน่งพิกัดของแต่ละชิ้น
--
-- ทำไมไม่เก็บเป็นผืนผ้าใบลากวาง:
--   ลากวางอิสระฟังดูยืดหยุ่นกว่า แต่ในทางปฏิบัติได้ฟอร์มที่ข้อความล้นกรอบ
--   เมื่อชื่อสินค้ายาว และเพี้ยนเมื่อจำนวนบรรทัดเปลี่ยน
--   เอกสารการค้าเป็นตารางที่มีโครงตายตัวอยู่แล้ว สิ่งที่คนอยากเปลี่ยนจริง ๆ คือ
--   หัวเอกสารเขียนว่าอะไร · เอาคอลัมน์ไหนบ้างเรียงยังไง · ช่องลงนามมีกี่ช่อง
--
-- columns กับ signs เก็บเป็น jsonb เพราะเป็นรายการที่ลำดับมีความหมาย
--   ถ้าแตกเป็นตารางลูก จะต้องมีคอลัมน์ลำดับและต้องเขียน join ทุกครั้งที่พิมพ์
--   ทั้งที่ข้อมูลชุดนี้อ่านทั้งก้อนเสมอ ไม่เคยอ่านทีละบรรทัด
create table if not exists public.print_forms (
  id           text primary key,
  name         text not null,
  doc_kind     text not null,
  title        text not null default '',
  copy_label   text not null default '',
  paper        text not null default 'A4',
  show_logo    boolean not null default false,
  show_company boolean not null default true,
  show_barcode boolean not null default true,
  show_words   boolean not null default true,
  show_note    boolean not null default true,
  show_totals  boolean not null default true,
  columns      jsonb not null default '[]'::jsonb,
  signs        jsonb not null default '[]'::jsonb,
  note         text not null default '',
  is_default   boolean not null default false,
  user_name    text not null default '',
  ts           bigint not null,
  created_at   timestamptz not null default now(),

  constraint print_forms_kind check (doc_kind in ('INVOICE', 'PURCHASE', 'PURRET')),
  constraint print_forms_paper check (paper in ('A4', 'A5'))
);

create index if not exists print_forms_kind_idx on public.print_forms (doc_kind);

-- กลุ่มเอกสารเลือกฟอร์มที่จะใช้เป็นค่าเริ่มต้นของเอกสารชนิดนั้นได้
-- on delete set null: ลบฟอร์มแล้วกลุ่มเอกสารกลับไปใช้ฟอร์มมาตรฐาน ไม่ใช่พิมพ์ไม่ออก
alter table public.doc_groups add column if not exists form_id text;

do $doc_form$
begin
  alter table public.doc_groups drop constraint if exists doc_groups_form_fk;
  alter table public.doc_groups add constraint doc_groups_form_fk
    foreign key (form_id) references public.print_forms (id) on delete set null;
end
$doc_form$;

-- ============================================================================
-- ทะเบียนประเภทลูกค้า
-- ----------------------------------------------------------------------------
-- เดิมประเภทลูกค้าเป็นรายการตายตัวในโค้ด เพิ่มประเภทใหม่ต้องรอ deploy
-- ซึ่งไม่สมเหตุสมผล เพราะเป็นเรื่องของกิจการ ไม่ใช่ของโปรแกรม
--
-- ตัวลูกค้ายังเก็บ "ชื่อประเภท" ไว้ที่ customers.kind เหมือนเดิม ไม่ได้เปลี่ยนไปเก็บรหัส
--   เพราะเก็บเป็นข้อความมาตั้งแต่ต้น และเอกสารที่คัดลอกค่านี้ไป (ใบขาย)
--   ก็เก็บเป็นข้อความเหมือนกัน เปลี่ยนไปเก็บรหัสเมื่อไร ลูกค้าและเอกสารเดิมทั้งหมด
--   จะอ่านประเภทไม่ออกทันที ตารางนี้จึงเป็น "รายการให้เลือก" ไม่ใช่กุญแจอ้างอิง
--   จงใจไม่ผูก foreign key ด้วยเหตุผลเดียวกับ product_terms
--
-- ไม่ยุบรวมกับ product_terms ทั้งที่โครงเหมือนกัน
--   เพราะคนละโดเมนกัน (ของสินค้า vs ของคู่ค้า) สิทธิการใช้งานคนละหน้าจอ
--   และวันหน้าประเภทลูกค้าอาจมีช่องเฉพาะของตัวเอง เช่น เครดิตเทอมหรือส่วนลดประจำ
--   ซึ่งใส่ในตารางที่ใช้ร่วมกับสินค้าไม่ได้
create table if not exists public.customer_kinds (
  id         text primary key,
  code       text not null,
  name       text not null,
  note       text not null default '',
  active     boolean not null default true,
  user_name  text not null default '',
  ts         bigint not null,
  created_at timestamptz not null default now(),

  constraint customer_kinds_code_len check (char_length(code) between 1 and 50),
  constraint customer_kinds_name_len check (char_length(name) between 1 and 200)
);

create unique index if not exists customer_kinds_code_key on public.customer_kinds (lower(code));

-- ชื่อห้ามซ้ำ เพราะตัวลูกค้าเก็บชื่อประเภทไว้ สองรหัสชื่อเดียวกันจะแยกไม่ออก
create unique index if not exists customer_kinds_name_key on public.customer_kinds (lower(name));

-- ใบขายคัดลอกประเภทลูกค้าไว้ในตัวเอกสารด้วย (snapshot)
-- เหตุผลเดียวกับชื่อและที่อยู่: ลูกค้าเปลี่ยนประเภททีหลัง (เช่น เลื่อนเป็นตัวแทนจำหน่าย)
-- ใบเก่าต้องยังบอกได้ว่า ณ วันที่ออกเอกสารนั้น ลูกค้าเป็นประเภทอะไร
-- ไม่งั้นรายงานยอดขายแยกตามประเภทลูกค้าย้อนหลังจะเปลี่ยนไปเองทุกครั้งที่มีคนแก้ทะเบียน
alter table public.invoices add column if not exists cust_kind text not null default '';

-- ============================================================================
-- ทะเบียนกลุ่ม / ยี่ห้อ / ประเภทสินค้า
-- ----------------------------------------------------------------------------
-- สามอย่างนี้โครงเหมือนกันเป๊ะ (รหัส + ชื่อ) ต่างกันแค่ความหมาย
-- จึงเก็บตารางเดียวแล้วแยกด้วยคอลัมน์ dim ไม่ได้ทำสามตาราง
--   แยกสามตาราง = ตัวแปลง หน้าจอ ตัวนำเข้า และการสำรองข้อมูลต้องเขียนซ้ำสามชุด
--   ทุกครั้งที่แก้กติกาต้องไล่แก้สามที่ แล้วจะมีที่หนึ่งที่ลืมเสมอ
--   และถ้าวันหน้าเพิ่มมิติที่สี่ (เช่น รุ่นสินค้า) เพิ่มค่า dim ค่าเดียวก็จบ
--
-- ตัวสินค้ายังเก็บ "ชื่อ" ไว้เหมือนเดิม ไม่ได้เปลี่ยนไปเก็บรหัส
--   เพราะระบบเก็บเป็นชื่อมาก่อนหน้านี้ และเป้าขายจับคู่ด้วยชื่อเหมือนกัน
--   เปลี่ยนไปเก็บรหัสเมื่อไร สินค้าและเป้าขายที่มีอยู่เดิมจะจับคู่กันไม่ติดทั้งหมดทันที
--   ตารางนี้จึงเป็น "ทะเบียนให้เลือก" ไม่ใช่กุญแจอ้างอิง — จงใจไม่ผูก foreign key
--
-- ความยาวจำกัดเท่าพนักงานขาย: รหัสไม่เกิน 50 ชื่อไม่เกิน 200 ตัวอักษร
create table if not exists public.product_terms (
  id         text primary key,
  dim        text not null,
  code       text not null,
  name       text not null,
  note       text not null default '',
  active     boolean not null default true,
  user_name  text not null default '',
  ts         bigint not null,
  created_at timestamptz not null default now(),

  constraint product_terms_dim check (dim in ('GRP', 'BRAND', 'KIND')),
  constraint product_terms_code_len check (char_length(code) between 1 and 50),
  constraint product_terms_name_len check (char_length(name) between 1 and 200)
);

-- รหัสห้ามซ้ำภายในมิติเดียวกัน แต่ข้ามมิติซ้ำได้
-- (รหัส A01 เป็นได้ทั้งกลุ่มสินค้าและยี่ห้อ โดยไม่เกี่ยวข้องกัน)
create unique index if not exists product_terms_dim_code_key
  on public.product_terms (dim, lower(code));

-- ชื่อก็ห้ามซ้ำในมิติเดียวกัน เพราะตัวสินค้าเก็บชื่อไว้
-- สองรหัสชื่อเดียวกันจะแยกไม่ออกว่าสินค้าหมายถึงรายการไหน และเป้าขายจะนับรวมกัน
create unique index if not exists product_terms_dim_name_key
  on public.product_terms (dim, lower(name));

create index if not exists product_terms_dim_idx on public.product_terms (dim);

-- ============================================================================
-- พนักงานขาย
-- ----------------------------------------------------------------------------
-- ใช้ผูกกับใบขายและกับลูกค้า เพื่อดูยอดขายรายคนและตั้งเป้าขายรายคน
--
-- ความยาวจำกัดตามที่ตกลงไว้: รหัสไม่เกิน 50 ตัวอักษร ชื่อไม่เกิน 200
-- บังคับที่ฐานข้อมูลด้วย ไม่ใช่บังคับแค่ที่หน้าจอ
-- เพราะข้อมูลเข้ามาได้หลายทาง (หน้าจอ · นำเข้าจาก Excel · กู้คืนไฟล์สำรอง)
-- ถ้าบังคับแค่หน้าจอเดียว ทางอื่นจะเล็ดลอดเข้ามาได้
create table if not exists public.salespersons (
  id         text primary key,
  code       text not null,
  name       text not null,
  phone      text not null default '',
  note       text not null default '',
  active     boolean not null default true,
  user_name  text not null default '',
  ts         bigint not null,
  created_at timestamptz not null default now(),

  constraint salespersons_code_len check (char_length(code) between 1 and 50),
  constraint salespersons_name_len check (char_length(name) between 1 and 200)
);

create unique index if not exists salespersons_code_uniq on public.salespersons (lower(code));

-- ผูกพนักงานขายกับใบขายและกับลูกค้า
-- ใบขายเก็บทั้ง id และรหัส/ชื่อแบบคัดลอกไว้ (snapshot) เหตุผลเดียวกับข้อมูลลูกค้า
-- เอกสารต้องคงข้อความเดิม ณ วันที่ออก ต่อให้พนักงานคนนั้นลาออกหรือเปลี่ยนชื่อทีหลัง
alter table public.invoices  add column if not exists sales_id   text;
alter table public.invoices  add column if not exists sales_code text not null default '';
alter table public.invoices  add column if not exists sales_name text not null default '';
alter table public.customers add column if not exists sales_id   text;

do $sales_fk$
begin
  alter table public.invoices drop constraint if exists invoices_sales_fk;
  alter table public.invoices add constraint invoices_sales_fk
    foreign key (sales_id) references public.salespersons (id) on delete set null;

  alter table public.customers drop constraint if exists customers_sales_fk;
  alter table public.customers add constraint customers_sales_fk
    foreign key (sales_id) references public.salespersons (id) on delete set null;
end
$sales_fk$;

create index if not exists invoices_sales_idx on public.invoices (sales_id);

-- ============================================================================
-- เป้าขาย (Target)
-- ----------------------------------------------------------------------------
-- หนึ่งแถวคือ "เป้าของงวดหนึ่ง ในมิติหนึ่ง"
--
-- มิติที่ระบุได้: พนักงานขาย · กลุ่มสินค้า · ยี่ห้อสินค้า · ประเภทสินค้า
-- ช่องไหนเว้นว่าง = ไม่จำกัดมิตินั้น (เป้ารวมของทุกคน / ทุกยี่ห้อ)
--
-- ทำไมไม่แยกเป็นตารางต่อมิติ:
--   เป้าจริงมักผสมกัน เช่น "เป้าของสมชาย เฉพาะยี่ห้อ A เดือนกันยายน"
--   ถ้าแยกตาราง จะรวมเงื่อนไขข้ามตารางไม่ได้โดยไม่เขียนโค้ดพิเศษทุกครั้ง
--
-- month = 0 หมายถึงเป้าทั้งปี ไม่ใช่เดือนศูนย์
--   เก็บเป็นเลขเดียวแทนที่จะมีคอลัมน์ "ชนิดงวด" แยก เพราะงวดมีแค่สองแบบ
--   และการเทียบ month = 0 อ่านง่ายกว่าการเช็คธงสองชั้น
create table if not exists public.sales_targets (
  id         text primary key,
  year       int not null,
  month      int not null default 0,
  sales_id   text references public.salespersons (id) on delete cascade,
  grp        text not null default '',
  brand      text not null default '',
  kind       text not null default '',
  amount     numeric not null default 0,
  qty        numeric not null default 0,
  note       text not null default '',
  user_name  text not null default '',
  ts         bigint not null,
  created_at timestamptz not null default now(),

  constraint sales_targets_year  check (year between 2000 and 2100),
  constraint sales_targets_month check (month between 0 and 12),
  constraint sales_targets_amount check (amount >= 0 and qty >= 0)
);

create index if not exists sales_targets_period_idx on public.sales_targets (year, month);

-- ============================================================================
-- การเชื่อมต่อ SQL Server ที่บันทึกไว้
-- ----------------------------------------------------------------------------
-- เก็บ "ค่าที่ใช้ต่อ" ไม่ใช่ตัวการเชื่อมต่อ — เว็บในเบราว์เซอร์ต่อ SQL Server ตรง ๆ ไม่ได้
-- เพราะ SQL Server พูดโปรโตคอล TDS บนพอร์ต 1433 ซึ่งเป็น TCP ดิบ
-- เบราว์เซอร์เปิด TCP ดิบไม่ได้ ทำได้แค่ HTTP/WebSocket เท่านั้น
-- ตัวที่ต่อจริงจึงต้องเป็นโปรแกรมฝั่งเครื่องที่อยู่ในวงเดียวกับเซิร์ฟเวอร์
-- (ดูหัวข้อ "ตัวเชื่อม" ในหน้าจอ) หน้านี้ทำหน้าที่เก็บค่าและส่งให้ตัวนั้น
--
-- รหัสผ่านเป็น null ได้ และเป็นค่าเริ่มต้นด้วย
--   ค่าเริ่มต้นคือเก็บรหัสผ่านไว้ในเครื่องที่กรอกเท่านั้น ไม่ขึ้นฐานข้อมูล
--   เพราะทุกคนที่ล็อกอินระบบนี้ได้ อ่านตารางนี้ได้หมด (สิทธิเป็นของทั้งระบบ ไม่แยกรายคน)
--   และรหัสผ่านที่อยู่ในตารางจะติดไปกับไฟล์สำรองข้อมูลด้วย
--   ใครที่ต้องการให้ทุกเครื่องใช้ร่วมกันจริง ๆ ต้องติ๊กเลือกเองบนหน้าจอ
create table if not exists public.sql_connections (
  id          text primary key,
  name        text not null,
  -- ชนิดฐานข้อมูล: SQL Server / MySQL / Access — แต่ละชนิดใช้ค่าคนละชุด
  kind        text not null default 'mssql',
  server      text not null default '',
  port        integer not null default 1433,
  file_path   text not null default '',
  db_name     text not null default '',
  login       text not null default '',
  password    text,
  encrypt     boolean not null default true,
  trust_cert  boolean not null default false,
  bridge_url  text not null default '',
  note        text not null default '',
  is_default  boolean not null default false,
  user_name   text not null default '',
  ts          bigint not null,
  created_at  timestamptz not null default now(),

  -- Access เป็นไฟล์ ไม่มีพอร์ต จึงยอมให้เป็น 0 ได้
  constraint sql_connections_port check (port between 0 and 65535)
);

create unique index if not exists sql_connections_name_key on public.sql_connections (lower(name));

-- ฐานข้อมูลเดิมที่สร้างไว้ก่อนรองรับหลายชนิด ต้องเพิ่มคอลัมน์และผ่อนกติกาให้
do $sql_kind$
begin
  alter table public.sql_connections add column if not exists kind text not null default 'mssql';
  alter table public.sql_connections add column if not exists file_path text not null default '';
  alter table public.sql_connections alter column server set default '';
  alter table public.sql_connections alter column server drop not null;

  alter table public.sql_connections drop constraint if exists sql_connections_port;
  alter table public.sql_connections add constraint sql_connections_port
    check (port between 0 and 65535);

  alter table public.sql_connections drop constraint if exists sql_connections_kind;
  alter table public.sql_connections add constraint sql_connections_kind
    check (kind in ('mssql', 'mysql', 'access'));
end
$sql_kind$;

-- ============================================================================
-- งานลูกค้าสัมพันธ์ (CRM) — เฟส 1
-- ----------------------------------------------------------------------------
-- สามตารางนี้ตอบคำถามคนละข้อกัน จึงไม่ยุบรวมกัน:
--   crm_leads      ใครที่ยังไม่ใช่ลูกค้า แต่สนใจอยู่
--   crm_deals      โอกาสการขายที่กำลังไล่ปิด อยู่ขั้นไหน มูลค่าเท่าไร
--   crm_activities คุยอะไรกันไปแล้วบ้าง และนัดครั้งถัดไปเมื่อไร
--
-- ไม่สร้างตารางลูกค้าใหม่ — ใช้ customers ที่มีอยู่
--   ลูกค้าที่ซื้อแล้วกับผู้สนใจที่ยังไม่ซื้อ ต้องอยู่คนละตาราง
--   เพราะ customers ถูกอ้างโดยใบขายแบบ restrict และมีรหัสลูกค้าที่ห้ามซ้ำ
--   ถ้าเอาผู้สนใจไปใส่ปนกัน ทะเบียนลูกค้าจริงจะเต็มไปด้วยรายชื่อที่ไม่เคยซื้อ
--   และรายงานทุกตัวที่นับ "จำนวนลูกค้า" จะเพี้ยนทันที
create table if not exists public.crm_leads (
  id          text primary key,
  code        text not null,
  name        text not null,
  contact     text not null default '',
  phone       text not null default '',
  email       text not null default '',
  province    text not null default '',
  source      text not null default '',
  status      text not null default 'NEW',
  sales_id    text references public.salespersons (id) on delete set null,
  -- แปลงเป็นลูกค้าแล้วชี้ไปที่ทะเบียนลูกค้า เพื่อตามรอยได้ว่ามาจากผู้สนใจรายไหน
  customer_id text references public.customers (id) on delete set null,
  note        text not null default '',
  user_name   text not null default '',
  ts          bigint not null,
  created_at  timestamptz not null default now(),

  constraint crm_leads_status
    check (status in ('NEW', 'WORKING', 'QUALIFIED', 'CONVERTED', 'DROPPED'))
);

create unique index if not exists crm_leads_code_key on public.crm_leads (lower(code));
create index if not exists crm_leads_status_idx on public.crm_leads (status);

-- โอกาสการขาย
-- ----------------------------------------------------------------------------
-- ผูกได้ทั้งกับลูกค้าในทะเบียนและกับผู้สนใจ เพราะของจริงคุยกันก่อนเปิดเป็นลูกค้าเสมอ
--
-- จงใจไม่ใส่ check ว่า "ต้องมีอย่างน้อยหนึ่งอย่าง"
--   ทั้งสองคอลัมน์เป็น on delete set null ถ้าใส่ check ไว้
--   วันที่ลบผู้สนใจทิ้ง ฐานข้อมูลจะพยายามตั้งค่า null แล้วชน check
--   ผลคือ "ลบผู้สนใจไม่ได้" พร้อม error ที่อ่านไม่รู้เรื่องว่าเกี่ยวอะไรกับดีล
--   การบังคับกรอกอยู่ที่หน้าจอแทน ซึ่งบอกสาเหตุได้ตรงกว่า
--
-- amount เก็บมูลค่าที่คาด ไม่ใช่ยอดขายจริง ยอดจริงอยู่ในใบขาย
-- ปิดดีลว่าชนะแล้วไม่สร้างใบขายให้เอง เพราะใบขายตัดสต็อกจริง
-- ต้องให้คนตรวจก่อนเสมอ หน้าจอจึงแค่พาไปหน้าขายพร้อมข้อมูล
create table if not exists public.crm_deals (
  id          text primary key,
  code        text not null,
  name        text not null,
  customer_id text references public.customers (id) on delete set null,
  lead_id     text references public.crm_leads (id) on delete set null,
  party_name  text not null default '',
  amount      numeric not null default 0,
  stage       text not null default 'NEW',
  probability numeric not null default 0,
  open_date   date not null,
  expect_date date,
  close_date  date,
  sales_id    text references public.salespersons (id) on delete set null,
  source      text not null default '',
  lost_reason text not null default '',
  note        text not null default '',
  user_name   text not null default '',
  ts          bigint not null,
  created_at  timestamptz not null default now(),

  constraint crm_deals_stage
    check (stage in ('NEW', 'QUALIFY', 'PROPOSAL', 'NEGOTIATE', 'WON', 'LOST')),
  constraint crm_deals_prob check (probability >= 0 and probability <= 100),
  constraint crm_deals_amount check (amount >= 0)
);

create unique index if not exists crm_deals_code_key on public.crm_deals (lower(code));
create index if not exists crm_deals_stage_idx on public.crm_deals (stage);
create index if not exists crm_deals_cust_idx  on public.crm_deals (customer_id);

-- บันทึกกิจกรรม (โทร / เข้าพบ / อีเมล / Line)
-- ----------------------------------------------------------------------------
-- หนึ่งแถวคือ "ติดต่อกันหนึ่งครั้ง" เก็บเป็นประวัติ ไม่เขียนทับของเดิม
-- ด้วยเหตุผลเดียวกับ ship_events: อยากรู้ว่าทำอะไรไปแล้วบ้าง ไม่ใช่แค่สถานะล่าสุด
--
-- next_date คือนัดครั้งถัดไป ใช้ทำรายการ "ต้องตามวันนี้"
-- ไม่ได้ทำเป็นตารางนัดหมายแยก เพราะนัดเกิดจากการติดต่อครั้งก่อนเสมอ
-- แยกตารางแล้วต้องคอยผูกกันเอง และจะมีนัดที่ลอยไม่รู้ว่ามาจากการคุยครั้งไหน
create table if not exists public.crm_activities (
  id          text primary key,
  kind        text not null default 'CALL',
  date        date not null,
  customer_id text references public.customers (id) on delete set null,
  lead_id     text references public.crm_leads (id) on delete set null,
  deal_id     text references public.crm_deals (id) on delete set null,
  party_name  text not null default '',
  subject     text not null default '',
  result      text not null default '',
  next_date   date,
  next_note   text not null default '',
  sales_id    text references public.salespersons (id) on delete set null,
  note        text not null default '',
  user_name   text not null default '',
  ts          bigint not null,
  created_at  timestamptz not null default now(),

  constraint crm_activities_kind
    check (kind in ('CALL', 'VISIT', 'EMAIL', 'LINE', 'QUOTE', 'OTHER'))
);

create index if not exists crm_activities_date_idx on public.crm_activities (date);
create index if not exists crm_activities_next_idx on public.crm_activities (next_date);
create index if not exists crm_activities_cust_idx on public.crm_activities (customer_id);
create index if not exists crm_activities_deal_idx on public.crm_activities (deal_id);

-- ============================================================================
-- การรับฟังลูกค้า (SE-AM หมวด 3) — 6 ตาราง
-- ----------------------------------------------------------------------------
-- หมวดนี้แยกจากงานส่วนอื่นของระบบโดยตั้งใจ
--   งานคลัง งานขาย งานลูกค้าสัมพันธ์ ตอบว่า "ขายอะไรไปเท่าไร"
--   หมวดนี้ตอบว่า "เราฟังลูกค้าอย่างเป็นระบบแค่ไหน และอยู่ระดับไหนของเกณฑ์"
--
--   voc_channels        ช่องทางการรับฟัง ครอบคลุมกลุ่มไหนและช่วงใดของวงจรชีวิต
--   voc_records         เสียงของลูกค้าที่รับฟังมาได้ทีละเรื่อง
--   voc_surveys         รอบการประเมินความพึงพอใจ/ไม่พึงพอใจ/ความผูกพัน
--   voc_survey_results  ผลของแต่ละรอบ แยกรายกลุ่มลูกค้า ผลิตภัณฑ์ และมิติ
--   voc_actions         แผนปรับปรุง รายงานผู้บริหาร ความรู้ และนวัตกรรมที่ทำต่อ
--   voc_levels          ผลการยืนยันจุดตรวจของเกณฑ์ที่ระบบตรวจเองไม่ได้
--
-- ทำไมไม่ใช้ตาราง customers ที่มีอยู่เป็นตัวตั้ง:
--   เกณฑ์บังคับให้รับฟัง "อดีตลูกค้า ลูกค้าคู่แข่ง และผู้ที่อาจเป็นลูกค้าในอนาคต" ด้วย
--   คนสามกลุ่มนี้ไม่มีอยู่ในทะเบียนลูกค้า และไม่ควรเอาไปใส่ปนกัน
--   เพราะรายงานทุกตัวที่นับ "จำนวนลูกค้า" จะเพี้ยนทันที (เหตุผลเดียวกับ crm_leads)
--   เสียงลูกค้าจึงผูกกับทะเบียนลูกค้าแบบไม่บังคับ ใครไม่อยู่ในทะเบียนก็บันทึกชื่อไว้ตรง ๆ ได้

-- ช่องทางการรับฟัง
-- ----------------------------------------------------------------------------
-- groups / lifecycle เก็บเป็น text[] เพราะหนึ่งช่องทางครอบคลุมได้หลายกลุ่มพร้อมกัน
-- (เช่น เพจเฟซบุ๊กรับฟังทั้งลูกค้าปัจจุบัน อดีตลูกค้า และผู้ที่อาจเป็นลูกค้า)
-- ถ้าแยกเป็นตารางลูกจะต้อง join ทุกครั้งที่ตรวจความครอบคลุม ซึ่งเป็นการตรวจที่ทำบ่อยที่สุดในหมวดนี้
create table if not exists public.voc_channels (
  id          text primary key,
  code        text not null,
  name        text not null,
  kind        text not null default 'WEB',
  groups      text[] not null default '{}',
  lifecycle   text[] not null default '{}',
  dimension   text not null default '',
  freq        text not null default 'MONTHLY',
  owner       text not null default '',
  practice    text not null default '',
  note        text not null default '',
  active      boolean not null default true,
  user_name   text not null default '',
  ts          bigint not null,
  created_at  timestamptz not null default now(),

  constraint voc_channels_kind
    check (kind in ('SOCIAL', 'WEB', 'APP', 'CALL', 'VISIT', 'EVENT', 'SURVEY', 'FRONT', 'DOC')),
  constraint voc_channels_freq
    check (freq in ('REALTIME', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'HALFYEAR', 'YEARLY')),
  constraint voc_channels_code_len check (char_length(code) <= 50),
  constraint voc_channels_name_len check (char_length(name) <= 200)
);

create unique index if not exists voc_channels_code_key on public.voc_channels (lower(code));
create index if not exists voc_channels_kind_idx on public.voc_channels (kind);

-- เสียงของลูกค้า
-- ----------------------------------------------------------------------------
-- หนึ่งแถวคือหนึ่งเรื่องที่ได้ยินมาจากลูกค้าหนึ่งราย ผ่านหนึ่งช่องทาง
--
-- ช่องทางเป็น restrict ไม่ใช่ set null — เสียงลูกค้าที่ไม่รู้ว่ามาจากช่องทางไหน
-- ใช้ตรวจความครอบคลุมของช่องทางไม่ได้เลย ซึ่งเป็นหัวใจของเกณฑ์ระดับ 2 และ 3
-- ช่องทางที่เลิกใช้ให้ปิดใช้งาน (active = false) แทนการลบ
create table if not exists public.voc_records (
  id          text primary key,
  code        text not null,
  date        date not null,
  channel_id  text not null references public.voc_channels (id) on delete restrict,
  group_id    text not null default 'COMM',
  lifecycle   text not null default 'CURRENT',
  dimension   text not null default 'PRODUCT',
  product_id  text not null default '',
  kind        text not null default 'NEED',
  priority    text not null default 'MED',
  status      text not null default 'NEW',
  customer_id text references public.customers (id) on delete set null,
  party_name  text not null default '',
  province    text not null default '',
  subject     text not null default '',
  detail      text not null default '',
  response    text not null default '',
  owner       text not null default '',
  due_date    date,
  closed_date date,
  user_name   text not null default '',
  ts          bigint not null,
  created_at  timestamptz not null default now(),

  constraint voc_records_group     check (group_id in ('COMM', 'PROMO')),
  constraint voc_records_lifecycle check (lifecycle in ('FUTURE', 'NEW', 'CURRENT', 'FORMER', 'RIVAL')),
  constraint voc_records_dimension check (dimension in ('PRODUCT', 'SUPPORT', 'TXN', 'RELATION', 'IMAGE')),
  constraint voc_records_kind      check (kind in ('NEED', 'COMPLAINT', 'SUGGEST', 'PRAISE', 'INQUIRY')),
  constraint voc_records_priority  check (priority in ('HIGH', 'MED', 'LOW')),
  constraint voc_records_status    check (status in ('NEW', 'ANALYZED', 'ASSIGNED', 'DONE', 'CLOSED'))
);

create unique index if not exists voc_records_code_key on public.voc_records (lower(code));
create index if not exists voc_records_date_idx    on public.voc_records (date);
create index if not exists voc_records_channel_idx on public.voc_records (channel_id);
create index if not exists voc_records_group_idx   on public.voc_records (group_id);
create index if not exists voc_records_status_idx  on public.voc_records (status);

-- รอบการประเมิน
-- ----------------------------------------------------------------------------
-- sample_size กับ responded ใช้คำนวณร้อยละการตอบกลับ ซึ่งเกณฑ์ระดับ 5 ระบุไว้ตรง ๆ
-- ว่าเป็นประเด็นหนึ่งของการประเมินประสิทธิผล จึงต้องเก็บเป็นตัวเลข ไม่ใช่เขียนไว้ในหมายเหตุ
create table if not exists public.voc_surveys (
  id           text primary key,
  code         text not null,
  name         text not null,
  kind         text not null default 'SAT',
  fiscal_year  integer not null,
  purpose      text not null default '',
  form         text not null default '',
  freq         text not null default 'YEARLY',
  method       text not null default '',
  sampling     text not null default '',
  sample_size  integer not null default 0,
  responded    integer not null default 0,
  start_date   date,
  end_date     date,
  status       text not null default 'PLAN',
  vendor       text not null default '',
  owner        text not null default '',
  note         text not null default '',
  user_name    text not null default '',
  ts           bigint not null,
  created_at   timestamptz not null default now(),

  constraint voc_surveys_kind   check (kind in ('SAT', 'DISSAT', 'ENGAGE', 'EFFECT')),
  constraint voc_surveys_freq   check (freq in ('REALTIME', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'HALFYEAR', 'YEARLY')),
  constraint voc_surveys_status check (status in ('PLAN', 'FIELD', 'ANALYZE', 'DONE', 'CANCEL')),
  constraint voc_surveys_sample check (sample_size >= 0 and responded >= 0),
  -- ตอบกลับมากกว่าที่ส่งไปไม่ได้ ถ้าปล่อยไว้ร้อยละการตอบกลับจะเกิน 100 แล้วรายงานจะดูตลก
  constraint voc_surveys_responded check (responded <= sample_size or sample_size = 0)
);

create unique index if not exists voc_surveys_code_key on public.voc_surveys (lower(code));
create index if not exists voc_surveys_kind_idx on public.voc_surveys (kind);
create index if not exists voc_surveys_year_idx on public.voc_surveys (fiscal_year);

-- ผลของแต่ละรอบ
-- ----------------------------------------------------------------------------
-- เก็บเป็นคะแนนดิบกับคะแนนเต็ม ไม่ใช่ร้อยละสำเร็จรูป
-- เพราะแบบสำรวจแต่ละรอบใช้สเกลไม่เท่ากัน (5 ระดับ / 10 ระดับ / 100 คะแนน)
-- เก็บร้อยละไว้เลยจะเทียบข้ามรอบไม่ได้ และย้อนกลับไปหาคะแนนดิบไม่ได้อีก
create table if not exists public.voc_survey_results (
  id          text primary key,
  survey_id   text not null references public.voc_surveys (id) on delete cascade,
  group_id    text not null default 'COMM',
  product_id  text not null default '',
  dimension   text not null default 'PRODUCT',
  score       numeric(10, 2) not null default 0,
  full_score  numeric(10, 2) not null default 5,
  respondents integer not null default 0,
  benchmark   numeric(10, 2) not null default 0,
  note        text not null default '',
  user_name   text not null default '',
  ts          bigint not null,
  created_at  timestamptz not null default now(),

  constraint voc_results_group     check (group_id in ('COMM', 'PROMO')),
  constraint voc_results_dimension check (dimension in ('PRODUCT', 'SUPPORT', 'TXN', 'RELATION', 'IMAGE')),
  constraint voc_results_full      check (full_score > 0),
  constraint voc_results_score     check (score >= 0 and score <= full_score),
  constraint voc_results_benchmark check (benchmark >= 0 and benchmark <= full_score)
);

create index if not exists voc_results_survey_idx on public.voc_survey_results (survey_id);
create index if not exists voc_results_group_idx  on public.voc_survey_results (group_id);

-- แผนปรับปรุง ความรู้ และนวัตกรรม
-- ----------------------------------------------------------------------------
-- ตารางนี้คือหลักฐานของเกณฑ์ระดับ 3-5 ทั้งหมด
-- แต่ละชนิดผูกกับข้อกำหนดคนละข้อ (ดู ACTION_KINDS ใน lib/voc.js) จึงต้องแยกชนิดให้ชัด
-- ไม่ใช่กองรวมกันเป็น "แผนงาน" แล้วรายงานว่าครบ
--
-- store_url = ที่จัดเก็บความรู้/นวัตกรรมในระบบดิจิทัล ซึ่งเกณฑ์ระดับ 5 บังคับไว้
create table if not exists public.voc_actions (
  id          text primary key,
  code        text not null,
  kind        text not null default 'IMPROVE',
  crit        text not null default '',
  title       text not null,
  detail      text not null default '',
  record_id   text references public.voc_records (id) on delete set null,
  survey_id   text references public.voc_surveys (id) on delete set null,
  owner       text not null default '',
  due_date    date,
  done_date   date,
  status      text not null default 'PLAN',
  result      text not null default '',
  store_url   text not null default '',
  user_name   text not null default '',
  ts          bigint not null,
  created_at  timestamptz not null default now(),

  constraint voc_actions_kind check (kind in
    ('REPORT', 'STRATEGY', 'IMPROVE', 'DIGITAL', 'COMMUNICATE', 'CONTROL', 'EVAL', 'KM', 'INNOVATION')),
  constraint voc_actions_crit   check (crit in ('', '3.1', '3.2')),
  constraint voc_actions_status check (status in ('PLAN', 'DOING', 'DONE', 'HOLD'))
);

create unique index if not exists voc_actions_code_key on public.voc_actions (lower(code));
create index if not exists voc_actions_kind_idx   on public.voc_actions (kind);
create index if not exists voc_actions_status_idx on public.voc_actions (status);

-- ผลการยืนยันจุดตรวจ
-- ----------------------------------------------------------------------------
-- เก็บเฉพาะจุดตรวจที่ระบบตรวจเองไม่ได้ (ต้องให้คนยืนยันพร้อมแนบหลักฐาน)
-- จุดตรวจที่ระบบตรวจได้จะคำนวณสดจากข้อมูลจริงเสมอ ไม่เก็บผลไว้ในตารางนี้
--   เก็บไว้เมื่อไรก็เพี้ยนเมื่อนั้น เพราะข้อมูลต้นทางเปลี่ยนได้ตลอด
--   แต่ยังให้แนบหลักฐานของจุดตรวจอัตโนมัติได้ เผื่อผู้ตรวจขอดูเอกสารประกอบ
--
-- check_id เป็นรหัสจุดตรวจที่ประกาศไว้ใน lib/voc.js (เช่น 31L2f)
-- ไม่ใส่ foreign key เพราะรายการจุดตรวจอยู่ในโค้ด ไม่ใช่ในฐานข้อมูล
create table if not exists public.voc_levels (
  id          text primary key,
  crit        text not null,
  level       integer not null,
  check_id    text not null,
  done        boolean not null default false,
  evidence    text not null default '',
  owner       text not null default '',
  done_date   date,
  note        text not null default '',
  user_name   text not null default '',
  ts          bigint not null,
  created_at  timestamptz not null default now(),

  constraint voc_levels_crit  check (crit in ('3.1', '3.2')),
  constraint voc_levels_level check (level between 1 and 5)
);

create unique index if not exists voc_levels_check_key on public.voc_levels (check_id);
create index if not exists voc_levels_crit_idx on public.voc_levels (crit, level);

-- ============================================================================
-- ผู้ใช้ในระบบ และสิทธิรายผู้ใช้
-- ----------------------------------------------------------------------------
-- เดิมสิทธิเป็นของ "ทั้งระบบ" — ตั้งครั้งเดียวมีผลกับทุกคนเหมือนกันหมด
-- ซึ่งใช้ไม่ได้จริงเมื่อมีหลายฝ่ายใช้ระบบเดียวกัน (คลังไม่ควรเห็นหน้าตั้งราคา
-- และฝ่ายขายไม่ควรแก้ผังคลัง) จึงเพิ่มสิทธิรายคน โดยมีแอดมินเป็นคนกำหนด
--
--   app_users   ทะเบียนผู้ใช้ในระบบ พร้อมบทบาท (แอดมิน / ผู้ใช้ทั่วไป)
--   user_perms  สิทธิรายคนรายหน้าจอ
--   screen_perms ของเดิม กลายเป็น "ค่าเริ่มต้นของทุกคน" ที่ใช้เมื่อคนนั้นไม่มีสิทธิเฉพาะตัว
--
-- ลำดับการตัดสินสิทธิ (ดู permOf ใน lib/db.js):
--   1. สิทธิเฉพาะตัวของคนนั้น (user_perms)
--   2. ค่าเริ่มต้นของทุกคน (screen_perms)
--   3. ไม่มีทั้งคู่ = เปิดหมด
--
-- ทำไมต้องมี app_users ทั้งที่ Supabase มี auth.users อยู่แล้ว:
--   auth.users อ่านจากฝั่งเว็บไม่ได้ ต้องใช้ service_role key ซึ่งข้ามทุกสิทธิ์
--   ถ้าฝังกุญแจนั้นไว้ในเว็บ ใครเปิดหน้าเว็บก็ลบข้อมูลทั้งระบบได้
--   จึงทำทะเบียนคู่ขนานไว้ใน public ที่อ่านได้ตามปกติ และเก็บเฉพาะสิ่งที่จำเป็น
--   (รหัสผ่านยังอยู่ใน auth.users ที่เดียว ไม่ได้คัดลอกมาไว้ที่นี่)

create table if not exists public.app_users (
  id         uuid primary key,
  email      text not null default '',
  name       text not null default '',
  role       text not null default 'user',
  active     boolean not null default true,
  note       text not null default '',
  ts         bigint not null default 0,
  created_at timestamptz not null default now(),

  constraint app_users_role check (role in ('admin', 'user'))
);

create unique index if not exists app_users_email_key on public.app_users (lower(email));
create index if not exists app_users_role_idx on public.app_users (role);

-- สิทธิรายคนรายหน้าจอ
-- ----------------------------------------------------------------------------
-- id ตั้งเป็น "<uuid ของคน>:<รหัสหน้าจอ>" เพื่อให้บันทึกทับของเดิมได้ตรง ๆ
-- ผ่าน primary key โดยไม่ต้องพึ่ง unique index ซ้อนอีกชั้น
--
-- ไม่มีแถว = คนนั้นใช้ค่าเริ่มต้นของทุกคน ไม่ใช่ "ห้ามทุกอย่าง"
--   ค่าเริ่มต้นต้องเป็นเปิด ไม่ใช่ปิด ไม่งั้นระบบที่ยังไม่ตั้งสิทธิจะเปิดมาแล้วว่างเปล่า
--   จนคนใช้คิดว่าโปรแกรมพัง (เหตุผลเดียวกับ screen_perms)
create table if not exists public.user_perms (
  id         text primary key,
  user_id    uuid not null references public.app_users (id) on delete cascade,
  screen_id  text not null,
  can_view   boolean not null default true,
  can_edit   boolean not null default true,
  can_date   boolean not null default true,
  ts         bigint not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists user_perms_pair_key on public.user_perms (user_id, screen_id);
create index if not exists user_perms_user_idx on public.user_perms (user_id);

-- ตัวตัดสินว่าเป็นแอดมินหรือไม่
-- ----------------------------------------------------------------------------
-- security definer เพราะต้องอ่าน app_users ได้แม้ policy ของตารางนั้นจะยังไม่อนุญาต
-- ไม่งั้นจะวนเป็นงูกินหาง (อ่าน app_users ต้องรู้ว่าเป็นแอดมิน ซึ่งต้องอ่าน app_users)
--
-- ข้อสำคัญ: ถ้าระบบยังไม่มีแอดมินเลยสักคน ให้ถือว่าทุกคนเป็นแอดมิน
--   ไม่งั้นระบบที่เพิ่งติดตั้งจะไม่มีใครตั้งสิทธิให้ใครได้เลย และแก้กลับไม่ได้
--   นอกจากเข้าไปแก้ในฐานข้อมูลตรง ๆ ซึ่งคนใช้ทั่วไปทำไม่ได้
--   พอมีแอดมินคนแรกแล้ว ประตูนี้จะปิดเองทันที
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    not exists (select 1 from public.app_users where role = 'admin' and active)
    or exists (
      select 1 from public.app_users
      where id = auth.uid() and role = 'admin' and active
    );
$$;

-- นำผู้ใช้ที่มีอยู่แล้วเข้าทะเบียน และตั้งแอดมินคนแรก
-- ----------------------------------------------------------------------------
-- รันซ้ำได้ ผู้ใช้ที่อยู่ในทะเบียนแล้วจะไม่ถูกแตะ
do $seed_users$
declare
  n_new int;
  n_all int;
begin
  insert into public.app_users (id, email, ts)
  select u.id, coalesce(u.email, ''), 0
  from auth.users u
  on conflict (id) do nothing;
  get diagnostics n_new = row_count;

  -- ยังไม่มีแอดมินเลย ให้คนที่สมัครเข้ามาก่อนสุดเป็นแอดมิน
  if not exists (select 1 from public.app_users where role = 'admin') then
    update public.app_users
    set role = 'admin'
    where id = (select id from public.app_users order by created_at, email limit 1);
  end if;

  select count(*) into n_all from public.app_users;
  raise notice 'ทะเบียนผู้ใช้: เพิ่มใหม่ % คน รวมทั้งหมด % คน', n_new, n_all;
end
$seed_users$;

-- ผู้ใช้ใหม่ที่สร้างทีหลังให้เข้าทะเบียนเอง
-- ----------------------------------------------------------------------------
-- ทำสองทางเพื่อไม่ให้พึ่งทางใดทางหนึ่งอย่างเดียว:
--   1. trigger บน auth.users — ได้ทันทีที่สร้างบัญชี
--   2. ตัวโปรแกรมลงทะเบียนตัวเองตอนล็อกอินครั้งแรก (ดู ensureAppUser ใน lib/api.js)
-- ถ้าสร้าง trigger ไม่สำเร็จ (บางโปรเจกต์จำกัดสิทธิ์บน schema auth)
-- ทางที่สองยังทำงานได้ จึงไม่ปล่อยให้ทั้งไฟล์ล้มเพราะเรื่องนี้
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.app_users (id, email, role)
  values (
    new.id,
    coalesce(new.email, ''),
    case when exists (select 1 from public.app_users) then 'user' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

do $auth_trigger$
begin
  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();
  raise notice 'ตั้ง trigger รับผู้ใช้ใหม่เข้าทะเบียนแล้ว';
exception
  when insufficient_privilege or undefined_table then
    raise notice 'สร้าง trigger บน auth.users ไม่ได้ — ตัวโปรแกรมจะลงทะเบียนผู้ใช้เองตอนล็อกอินแทน';
end
$auth_trigger$;

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

-- ============================================================================
-- เลขลำดับแถว (row_order) — ทุกตารางในระบบต้องมี
-- ----------------------------------------------------------------------------
-- เลขรันนิ่งต่อเนื่องประจำตาราง ฐานข้อมูลออกให้เองตอน insert ไม่ต้องส่งมาจากฝั่งแอป
--
-- ทำไมต้องมี:
--   id ของระบบนี้เป็นข้อความสุ่ม (uid) ซึ่งเรียงลำดับไม่ได้และอ่านไม่รู้เรื่อง
--   ส่วน created_at เป็นเวลา ซึ่งซ้ำกันได้เมื่อบันทึกพร้อมกันในวินาทีเดียว
--   row_order ให้ "ลำดับที่แน่นอน" ของทุกแถว ใช้เรียง ใช้อ้างอิง และใช้ไล่ดูว่าเข้ามาก่อนหลัง
--
-- ทำไมใช้ sequence ไม่ใช่นับเองในแอป:
--   ฐานข้อมูลใช้ร่วมกันหลายเครื่อง ถ้าให้แอปนับเองแล้วสองเครื่องอ่านเลขเดียวกัน
--   จะได้เลขซ้ำ sequence ของฐานข้อมูลรับประกันว่าไม่ซ้ำแม้เขียนพร้อมกัน
--
-- หมายเหตุ: sequence ไม่รับประกันว่าเลข "ติดกันไม่ขาด" — transaction ที่ถูกยกเลิก
--   จะกินเลขไปหนึ่งตัว เลขจึงอาจกระโดด แต่ยังเรียงจากน้อยไปมากตามลำดับที่เข้ามาเสมอ
--   ซึ่งเป็นสิ่งที่ต้องการจริง ๆ ถ้าต้องการเลขที่ห้ามขาดต้องใช้เลขที่เอกสาร (doc_no) แทน
do $row_order$
declare
  t   text;
  seq text;
  hi  bigint;
begin
  foreach t in array array[
    'warehouses', 'products', 'txns',
    'locations', 'product_locations', 'sales', 'sale_items',
    'doc_groups', 'customers', 'company', 'invoices', 'invoice_items',
    'screen_perms', 'suppliers', 'purchases', 'purchase_items',
    'purchase_returns', 'purchase_return_items',
    'stock_counts', 'stock_count_items', 'ship_events', 'sql_connections',
    'salespersons', 'sales_targets', 'print_forms', 'product_terms',
    'crm_leads', 'crm_deals', 'crm_activities', 'customer_kinds',
    'voc_channels', 'voc_records', 'voc_surveys', 'voc_survey_results',
    'voc_actions', 'voc_levels',
    'app_users', 'user_perms'
  ]
  loop
    seq := 'public.' || t || '_row_order_seq';

    execute format('alter table public.%I add column if not exists row_order bigint', t);
    execute format('create sequence if not exists %s owned by public.%I.row_order', seq, t);

    -- เติมเลขให้แถวเก่าที่ยังไม่มี เรียงตามเวลาที่สร้างจริง ไม่ใช่ตามลำดับที่ฐานข้อมูลคืนมา
    -- (UPDATE เฉย ๆ ไม่รับประกันลำดับ แถวเก่าจะได้เลขสลับกันมั่ว)
    execute format(
      'with ordered as (
         select id, row_number() over (order by created_at, id) as n
         from public.%I where row_order is null
       )
       update public.%I t set row_order = o.n from ordered o where t.id = o.id',
      t, t
    );

    -- ดันตัวนับให้เลยเลขสูงสุดที่มีอยู่ ไม่งั้นแถวใหม่จะได้เลขซ้ำกับแถวเก่า
    execute format('select coalesce(max(row_order), 0) from public.%I', t) into hi;
    perform setval(seq, greatest(hi, 1), hi > 0);

    execute format('alter table public.%I alter column row_order set default nextval(%L)', t, seq);
    execute format(
      'create index if not exists %I on public.%I (row_order)', t || '_row_order_idx', t
    );
  end loop;

  raise notice 'เพิ่มเลขลำดับแถว (row_order) ครบทุกตารางแล้ว';
end
$row_order$;

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
grant all privileges on table public.suppliers         to authenticated;
grant all privileges on table public.purchases         to authenticated;
grant all privileges on table public.purchase_items    to authenticated;
grant all privileges on table public.purchase_returns  to authenticated;
grant all privileges on table public.purchase_return_items to authenticated;
grant all privileges on table public.stock_counts      to authenticated;
grant all privileges on table public.stock_count_items to authenticated;
grant all privileges on table public.ship_events        to authenticated;
grant all privileges on table public.sql_connections    to authenticated;
grant all privileges on table public.salespersons       to authenticated;
grant all privileges on table public.sales_targets      to authenticated;
grant all privileges on table public.print_forms        to authenticated;
grant all privileges on table public.product_terms      to authenticated;
grant all privileges on table public.crm_leads          to authenticated;
grant all privileges on table public.voc_channels               to authenticated;
grant all privileges on table public.voc_records                to authenticated;
grant all privileges on table public.voc_surveys                to authenticated;
grant all privileges on table public.voc_survey_results         to authenticated;
grant all privileges on table public.voc_actions                to authenticated;
grant all privileges on table public.voc_levels                 to authenticated;
grant all privileges on table public.app_users                to authenticated;
grant all privileges on table public.user_perms               to authenticated;
grant all privileges on table public.crm_deals          to authenticated;
grant all privileges on table public.crm_activities     to authenticated;
grant all privileges on table public.customer_kinds     to authenticated;

-- ---------------------------------------------------------- สิทธิ์ของ sequence
-- ทุกตารางมีคอลัมน์ row_order ที่ตั้งค่าเริ่มต้นเป็น nextval(...)
-- ตอน insert Postgres จึงต้องเรียก nextval ซึ่งขอสิทธิ์บน "sequence" แยกอีกชั้น
--
-- grant all privileges on table ... ไม่ครอบคลุมถึง sequence
-- ขาดบรรทัดนี้แล้วจะ insert ไม่ได้เลย พร้อม error ที่ชี้ไปผิดที่:
--   42501 permission denied for sequence <ตาราง>_row_order_seq
-- ซึ่งอ่านแล้วนึกว่าเป็นเรื่องสิทธิ์ของตาราง ทั้งที่ตารางได้สิทธิ์ครบแล้ว
--
-- ต้องมาหลังบล็อก row_order เสมอ เพราะ "all sequences" นับเฉพาะที่มีอยู่ ณ ตอนรัน
grant usage, select on all sequences in schema public to authenticated;

-- ตารางที่เพิ่มทีหลังจะได้สิทธิ์นี้เองโดยไม่ต้องมารันซ้ำ
-- (มีผลกับ sequence ที่ถูกสร้างโดย role ที่รันคำสั่งนี้เท่านั้น จึงไม่ได้แทนบรรทัดบน)
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

grant execute on function public.create_sale(jsonb, jsonb)    to authenticated;
grant execute on function public.create_invoice(jsonb, jsonb) to authenticated;
grant execute on function public.create_purchase(jsonb, jsonb) to authenticated;
grant execute on function public.create_purchase_return(jsonb, jsonb) to authenticated;
grant execute on function public.stock_of(text, text)         to authenticated;
grant execute on function public.is_admin()                   to authenticated;

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
    'screen_perms', 'suppliers', 'purchases', 'purchase_items',
    'purchase_returns', 'purchase_return_items',
    'stock_counts', 'stock_count_items', 'ship_events', 'sql_connections',
    'salespersons', 'sales_targets', 'print_forms', 'product_terms',
    'crm_leads', 'crm_deals', 'crm_activities', 'customer_kinds',
    'voc_channels', 'voc_records', 'voc_surveys', 'voc_survey_results',
    'voc_actions', 'voc_levels',
    'app_users', 'user_perms'
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

  raise notice 'ตั้งค่า RLS ครบ 38 ตารางแล้ว';
end
$$;

-- ------------------------------------------------- สิทธิของตารางที่คุมสิทธิ
-- สามตารางนี้ใช้กติกาคนละแบบกับตารางข้อมูลทั่วไป
--   อ่าน  ทุกคนที่ล็อกอินแล้ว (ตัวโปรแกรมต้องรู้ว่าตัวเองมีสิทธิอะไรบ้าง
--         และหน้าจอกำหนดสิทธิต้องเห็นรายชื่อผู้ใช้)
--   เขียน เฉพาะแอดมิน ไม่งั้นใครก็ยกสิทธิให้ตัวเองได้ด้วยการยิง API ตรง ๆ
--         ซึ่งทำให้การกำหนดสิทธิไม่มีความหมายเลย
--
-- ยกเว้นข้อเดียว: ผู้ใช้ลงทะเบียนตัวเองเข้า app_users ได้ (แต่เป็นบทบาท user เท่านั้น)
-- เพื่อให้คนที่เพิ่งถูกสร้างบัญชีโผล่ในทะเบียนโดยไม่ต้องรอแอดมินมาเพิ่มให้
do $perm_rls$
declare
  t  text;
  nm text;
begin
  foreach t in array array['app_users', 'user_perms', 'screen_perms']
  loop
    execute format('alter table public.%I enable row level security', t);

    -- ลบ policy เปิดกว้างของเดิมออกก่อน ไม่งั้นจะยังเขียนได้ทุกคนอยู่
    nm := t || ': authenticated full access';
    execute format('drop policy if exists %I on public.%I', nm, t);

    nm := t || ': read';
    execute format('drop policy if exists %I on public.%I', nm, t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)', nm, t
    );

    nm := t || ': admin write';
    execute format('drop policy if exists %I on public.%I', nm, t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using (public.is_admin()) with check (public.is_admin())',
      nm, t
    );
  end loop;

  nm := 'app_users: register self';
  execute format('drop policy if exists %I on public.app_users', nm);
  execute format(
    'create policy %I on public.app_users for insert to authenticated '
    'with check (id = auth.uid() and role = ''user'')',
    nm
  );

  raise notice 'ตั้งค่าสิทธิของตารางที่คุมสิทธิแล้ว (อ่านได้ทุกคน เขียนได้เฉพาะแอดมิน)';
end
$perm_rls$;

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
    -- sequence ของ row_order ต้องได้สิทธิ์ด้วย ไม่งั้น insert ไม่ผ่านทั้งที่ตารางครบ
    when to_regclass('public.' || x.name || '_row_order_seq') is not null
      and not has_sequence_privilege('authenticated', 'public.' || x.name || '_row_order_seq', 'USAGE')
      then 'ไม่ผ่าน — sequence ยังไม่ได้ GRANT'
    else 'ผ่าน'
  end                                             as "ผล"
from (values
  ('warehouses'), ('products'), ('txns'),
  ('locations'), ('product_locations'), ('sales'), ('sale_items'),
  ('doc_groups'), ('customers'), ('company'), ('invoices'), ('invoice_items'),
  ('screen_perms'), ('suppliers'), ('purchases'), ('purchase_items'),
  ('purchase_returns'), ('purchase_return_items'),
  ('stock_counts'), ('stock_count_items'), ('ship_events'), ('sql_connections'),
  ('salespersons'), ('sales_targets'), ('print_forms'), ('product_terms'),
  ('crm_leads'), ('crm_deals'), ('crm_activities'), ('customer_kinds'),
  ('voc_channels'), ('voc_records'), ('voc_surveys'), ('voc_survey_results'),
  ('voc_actions'), ('voc_levels'),
  ('app_users'), ('user_perms')
) as x(name)
order by x.name;
