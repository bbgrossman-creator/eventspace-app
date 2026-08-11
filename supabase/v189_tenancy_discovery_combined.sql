-- ═══════════════════════════════════════════════════════════════════════════
-- v189 — TENANT ISOLATION DISCOVERY (COMBINED, one-click, READ-ONLY)
--
-- HOW TO RUN:
--   1. Paste this entire file into the Supabase SQL Editor.
--   2. Click Run ONCE.
--   3. Use Export → CSV on the single result grid.
--   4. Send that CSV back.
--
-- Strictly read-only: only SELECTs against system catalogs. No functions,
-- no temp tables, no DDL, no writes. Every row is (section, table_name,
-- item, value, details) so the whole discovery report is ONE exportable grid.
-- Ordered by section, then table, then item.
-- ═══════════════════════════════════════════════════════════════════════════

with report as (

  -- 1. All public base tables + whether they carry tenant_id + column count
  select
    '1_tables'::text                                   as section,
    t.table_name::text                                 as table_name,
    'has_tenant_id'::text                              as item,
    (exists (
       select 1 from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = t.table_name
         and c.column_name = 'tenant_id'
    ))::text                                           as value,
    ('columns=' || (
       select count(*)::text from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = t.table_name
    ))                                                 as details
  from information_schema.tables t
  where t.table_schema = 'public' and t.table_type = 'BASE TABLE'

  union all

  -- 2. RLS enabled / forced status per table
  select
    '2_rls_status',
    c.relname::text,
    'rls_enabled',
    c.relrowsecurity::text,
    'forced=' || c.relforcerowsecurity::text
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'

  union all

  -- 3. Existing policies (expect none)
  select
    '3_policies',
    p.tablename::text,
    p.policyname::text,
    p.cmd::text,
    'roles=' || array_to_string(p.roles, ',')
  from pg_policies p
  where p.schemaname = 'public'

  union all

  -- 4. Tenants present (sanity: Burger Bar vs Demo separation)
  select
    '4_tenants',
    'tenants',
    coalesce(tn.slug, tn.id::text),
    coalesce(tn.name, ''),
    'id=' || tn.id::text
  from tenants tn

  union all

  -- 5. Foreign keys pointing at the tenancy-parent tables (derivation map)
  select
    '5_foreign_keys',
    tc.table_name::text,
    kcu.column_name::text || ' -> ' || ccu.table_name::text,
    ccu.table_name::text,
    'constraint=' || tc.constraint_name::text
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
  join information_schema.constraint_column_usage ccu
    on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
  where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
    and ccu.table_name in ('bookings','event_components','proposal_versions','proposals','tenants')

  union all

  -- 6. tenant_users full schema (columns, types, nullability)
  select
    '6_tenant_users_schema',
    'tenant_users',
    c.column_name::text,
    c.data_type::text,
    'nullable=' || c.is_nullable::text ||
      coalesce(', default=' || c.column_default, '')
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'tenant_users'

  union all

  -- 7. tenant_users constraints (is one-active-membership enforced?)
  select
    '7_tenant_users_constraints',
    'tenant_users',
    con.conname::text,
    con.contype::text,
    pg_get_constraintdef(con.oid)
  from pg_constraint con
  where con.conrelid = 'public.tenant_users'::regclass

  union all

  -- 8. event_components parent columns + nullability (DUAL-PARENT settle)
  select
    '8_event_components_parents',
    'event_components',
    c.column_name::text,
    c.data_type::text,
    'nullable=' || c.is_nullable::text
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'event_components'
    and c.column_name in ('booking_id','proposal_version_id','tenant_id')

  union all

  -- 9. Existing indexes on policy-path tables (add only what's missing)
  select
    '9_indexes',
    i.tablename::text,
    i.indexname::text,
    'index',
    i.indexdef::text
  from pg_indexes i
  where i.schemaname = 'public'
    and i.tablename in ('tenant_users','bookings','proposals','proposal_versions',
                        'event_components','component_items','charges','payments',
                        'catalog_items','blueprints','version_guests','version_sections',
                        'version_adjustments','choice_groups','component_requirements','photos')

  union all

  -- 10. Functions in public + owner (keystone hardening / existing helpers)
  select
    '10_functions',
    'public',
    pr.proname::text,
    pg_get_userbyid(pr.proowner)::text,
    'security_definer=' || pr.prosecdef::text
  from pg_proc pr
  join pg_namespace n on pr.pronamespace = n.oid
  where n.nspname = 'public'

  union all

  -- 11. Schema-level grants / risky privileges (can ordinary roles CREATE?)
  select
    '11_schema_grants',
    'public',
    'usage_' || rp.rolname::text,
    has_schema_privilege(rp.rolname, 'public', 'USAGE')::text,
    'create=' || has_schema_privilege(rp.rolname, 'public', 'CREATE')::text
  from pg_roles rp
  where rp.rolname in ('anon','authenticated','service_role','public')

  union all

  -- 12. Row counts per public table (live estimate from stats — no table scan)
  select
    '12_row_counts',
    st.relname::text,
    'row_estimate',
    st.n_live_tup::text,
    'analyzed=' || coalesce(to_char(greatest(st.last_analyze, st.last_autoanalyze), 'YYYY-MM-DD'), 'never')
  from pg_stat_user_tables st
  where st.schemaname = 'public'

  union all

  -- 13. Column nullability + type for EVERY column of tenant-relevant tables
  --     (so RLS WITH CHECK / NOT NULL assumptions are verified, not guessed)
  select
    '13_all_columns',
    c.table_name::text,
    c.column_name::text,
    c.data_type::text,
    'nullable=' || c.is_nullable::text
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name in ('bookings','proposals','proposal_versions','event_components',
                         'component_items','charges','payments','catalog_items','blueprints',
                         'vendors','staff','tasks','communications','rooms','tenant_settings',
                         'guest_categories','section_types')

)
select section, table_name, item, value, details
from report
order by section, table_name, item;
