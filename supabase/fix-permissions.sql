-- ============================================================================
-- แก้ปัญหา "ไม่มีสิทธิ์เข้าถึงข้อมูล" / HTTP 403 / SQLSTATE 42501
--
-- รันไฟล์นี้ใน Supabase Dashboard > SQL Editor
-- ปลอดภัยที่จะรันซ้ำกี่ครั้งก็ได้ และไม่แตะข้อมูลที่มีอยู่
--
-- ไฟล์นี้ทำ 2 อย่างที่ schema.sql รุ่นแรกตกไป:
--   1. GRANT สิทธิ์ระดับตารางให้ role authenticated
--   2. สร้าง RLS policy ใหม่ (เผื่อรอบแรกรันไม่ผ่าน)
-- ============================================================================

-- ---------------------------------------------------- 1. สิทธิ์ระดับตาราง
grant usage on schema public to anon, authenticated;

grant all privileges on table public.warehouses to authenticated;
grant all privileges on table public.products   to authenticated;
grant all privileges on table public.txns       to authenticated;

-- เผื่อสร้างตารางเพิ่มในอนาคต ให้ได้สิทธิ์อัตโนมัติ
alter default privileges in schema public
  grant all on tables to authenticated;

-- ---------------------------------------------------- 2. RLS policy
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
-- ตรวจผลลัพธ์ — ผลที่ควรได้อยู่ในคอมเมนต์ใต้แต่ละ query
-- ============================================================================

-- (ก) ตารางครบ 3 ตาราง และ RLS เปิดทั้งหมด (rowsecurity ต้องเป็น true)
select tablename, rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
  and tablename in ('products', 'warehouses', 'txns')
order by tablename;

-- (ข) ต้องได้ policy 3 แถว roles = {authenticated} และ cmd = ALL
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename;

-- (ค) ต้องเห็น authenticated มีสิทธิ์ SELECT/INSERT/UPDATE/DELETE ครบทั้ง 3 ตาราง
--     ถ้าตารางไหนไม่ขึ้นเลย แปลว่า GRANT ยังไม่ผ่าน
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('products', 'warehouses', 'txns')
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;
