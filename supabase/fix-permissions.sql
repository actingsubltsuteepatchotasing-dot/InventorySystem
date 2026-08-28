-- ============================================================================
-- แก้ปัญหา "ไม่มีสิทธิ์เข้าถึงข้อมูล" / HTTP 403 / SQLSTATE 42501
--
-- รันไฟล์นี้ใน Supabase Dashboard > SQL Editor  (วางทั้งไฟล์ แล้วกด Run)
--
-- ปลอดภัย: รันซ้ำกี่ครั้งก็ได้ ไม่แตะข้อมูลที่มีอยู่
-- และออกแบบให้ "ล้มไม่ได้" — ถ้าตารางใดยังไม่มี จะข้ามไปพร้อมแจ้งเตือน
-- แทนที่จะ error แล้ว rollback ทั้งไฟล์ (SQL Editor รันเป็น transaction เดียว)
--
-- ดูผลที่แท็บ Results ด้านล่าง และที่ Messages (บรรทัด NOTICE)
-- ============================================================================

do $$
declare
  t          text;
  tables     text[] := array['warehouses', 'products', 'txns'];
  missing    text[] := '{}';
  policy_nm  text;
begin
  -- สิทธิ์ใช้งาน schema (ต้องมีก่อน ไม่งั้นแตะตารางไม่ได้เลย)
  execute 'grant usage on schema public to anon, authenticated';

  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      missing := missing || t;
      raise notice 'ข้าม "%": ยังไม่มีตารางนี้ — ต้องรัน schema.sql ก่อน', t;
      continue;
    end if;

    -- ด่านที่ 1: สิทธิ์ระดับตาราง (ไม่มี = 42501 permission denied for table)
    execute format('grant all privileges on table public.%I to authenticated', t);

    -- ด่านที่ 2: RLS + policy
    execute format('alter table public.%I enable row level security', t);

    policy_nm := t || ': authenticated full access';
    execute format('drop policy if exists %L on public.%I', policy_nm, t);
    execute format(
      'create policy %L on public.%I for all to authenticated using (true) with check (true)',
      policy_nm, t
    );

    raise notice 'ตั้งค่า "%" เรียบร้อย (grant + rls + policy)', t;
  end loop;

  -- เผื่อสร้างตารางเพิ่มในอนาคต ให้ได้สิทธิ์อัตโนมัติ
  execute 'alter default privileges in schema public grant all on tables to authenticated';

  if array_length(missing, 1) is not null then
    raise notice '--------------------------------------------------------';
    raise notice 'ยังขาดตาราง: %', array_to_string(missing, ', ');
    raise notice 'ให้รัน supabase/schema.sql ทั้งไฟล์ก่อน แล้วค่อยรันไฟล์นี้ซ้ำ';
    raise notice '--------------------------------------------------------';
  end if;
end
$$;


-- ============================================================================
-- สรุปผล — ดูตารางนี้ตารางเดียวพอ
--
-- ทุกแถวต้องเป็น:  ตาราง=มี   rls=true   policies>=1   grants=4   ผล=ผ่าน
-- ถ้าแถวไหนขึ้น "ไม่ผ่าน" ให้คัดลอกผลทั้งตารางไปแจ้งได้เลย
-- ============================================================================

select
  x.name                                        as "ตาราง",
  (to_regclass('public.' || x.name) is not null) as "มีตาราง",
  coalesce((
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = x.name
  ), false)                                      as "rls_เปิด",
  (
    select count(*)
    from pg_policies p
    where p.schemaname = 'public' and p.tablename = x.name
  )                                              as "จำนวน_policy",
  (
    select count(*)
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.table_name = x.name
      and g.grantee = 'authenticated'
      and g.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  )                                              as "สิทธิ์_authenticated",
  case
    when to_regclass('public.' || x.name) is null then 'ไม่ผ่าน — ยังไม่มีตาราง ให้รัน schema.sql'
    when (
      select count(*)
      from information_schema.role_table_grants g
      where g.table_schema = 'public' and g.table_name = x.name
        and g.grantee = 'authenticated'
        and g.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    ) < 4 then 'ไม่ผ่าน — GRANT ไม่ครบ'
    when (
      select count(*) from pg_policies p
      where p.schemaname = 'public' and p.tablename = x.name
    ) = 0 then 'ไม่ผ่าน — ไม่มี RLS policy'
    else 'ผ่าน'
  end                                            as "ผล"
from (values ('warehouses'), ('products'), ('txns')) as x(name)
order by x.name;
