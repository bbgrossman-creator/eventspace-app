-- ═══════════════════════════════════════════════════════════════════════════
-- v189 — TENANT ISOLATION, STEP 1: DISCOVERY (run this, paste results back)
--
-- RLS against an unverified schema is dangerous: a wrong policy locks users
-- out, a missing one silently returns zero rows, an un-enabled table stays a
-- leak. This read-only script inventories the ACTUAL database so the RLS
-- migration (step 2) is written against facts, not assumptions. It changes
-- nothing.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Every table, and whether it currently has a tenant_id column.
select
  t.table_name,
  (exists (
     select 1 from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = t.table_name
       and c.column_name = 'tenant_id'
  )) as has_tenant_id,
  (select count(*) from information_schema.columns c
     where c.table_schema='public' and c.table_name=t.table_name) as column_count
from information_schema.tables t
where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
order by has_tenant_id desc, t.table_name;

-- 2. Current RLS status per table (should be all false right now).
select relname as table_name, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relname;

-- 3. Existing policies (expect none).
select schemaname, tablename, policyname, cmd, roles
from pg_policies where schemaname = 'public' order by tablename;

-- 4. How many tenants exist, and row counts per tenant on the tables that
--    DO have tenant_id (sanity: confirms Burger Bar vs Demo separation holds).
select id, slug, name from tenants order by slug;

-- 5. Foreign-key map: which tables point at bookings / event_components /
--    proposal_versions — i.e. can DERIVE tenancy through a parent instead of
--    needing their own column.
select
  tc.table_name as child_table,
  kcu.column_name as fk_column,
  ccu.table_name as parent_table
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
  and ccu.table_name in ('bookings','event_components','proposal_versions','proposals','tenants')
order by parent_table, child_table;

-- 6. Does the auth→tenant bridge exist as expected?
select column_name, data_type, is_nullable from information_schema.columns
where table_schema='public' and table_name='tenant_users' order by ordinal_position;

-- 7. Existing indexes (so step 2 adds only what's missing for policy paths).
select tablename, indexname, indexdef
from pg_indexes where schemaname = 'public'
  and tablename in ('tenant_users','bookings','proposals','proposal_versions',
                    'event_components','component_items','charges','payments',
                    'catalog_items','blueprints')
order by tablename, indexname;

-- 8. Constraints on tenant_users (is one-active-membership already enforced?).
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.tenant_users'::regclass;

-- 9. event_components parent nullability (settles the DUAL-PARENT policy shape).
select column_name, is_nullable
from information_schema.columns
where table_schema='public' and table_name='event_components'
  and column_name in ('booking_id','proposal_version_id','tenant_id');

-- 10. Function ownership / risky grants on schema public (keystone hardening).
select p.proname, pg_get_userbyid(p.proowner) as owner
from pg_proc p join pg_namespace n on p.pronamespace = n.oid
where n.nspname = 'public' and p.proname in ('current_tenant_id');
select nspname, has_schema_privilege('public','create') as public_can_create
from pg_namespace where nspname = 'public';
