-- ═══════════════════════════════════════════════════════════════════════════
-- v200 — COMPONENT KNOWLEDGE FOUNDATION
-- Implements SPEC-001 Rev C (docs/SPEC-001-component-knowledge-foundation.md)
--
-- The identity grows into the definition (SPEC-001 §1.1): component_identities
-- is RENAMED to component_definitions — not duplicated. Instances already
-- point here; galleries already key here; the graph node keeps its ids.
--
-- Constitutional constraints enforced below, not merely intended:
--   · No manufactured curation: every migrated/auto row is status='implicit'
--     (§1.2). Nothing in this file writes 'curated'.
--   · Versioning lives on LAYERS, never definitions (§1.4): definitions
--     archive; layers supersede-and-chain; history is never overwritten.
--   · Forks are permanently independent (§1.5): source_definition_id records
--     the family; nothing propagates.
--   · Layer payloads are opaque (§1.6): this schema knows layer_key + jsonb
--     and nothing else. No layer names appear anywhere in this file.
--
-- Additive-only: nothing dropped, no data rewritten. Idempotent; safe to re-run.
-- Deploy order: this file first (invisible to the running app via the
-- compatibility view), app rename second, view removed one release later.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. The rename: identity → definition ────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_class where relname = 'component_identities' and relkind = 'r')
     and not exists (select 1 from pg_class where relname = 'component_definitions' and relkind = 'r') then
    alter table public.component_identities rename to component_definitions;
    create temp table v200_did_rename (yes bool);   -- session marker for the backfill stamp
  end if;
end $$;

alter index if exists idx_component_identities_tenant_name
  rename to idx_component_definitions_tenant_name;

-- Compatibility view under the OLD name, one release only.
-- security_invoker is MANDATORY (SPEC-001 §3.1): a default-privilege view
-- executes as its owner and would BYPASS RLS — the exact leak the verify
-- matrix exists to catch. Verified below in Part V-A4.
drop view if exists public.component_identities;
create view public.component_identities
  with (security_invoker = true)
  as select id, tenant_id, name, created_at from public.component_definitions;

-- ── 2. Grow the definition (SPEC-001 §3.2) ───────────────────────────────────
alter table public.component_definitions
  add column if not exists status text not null default 'implicit',
  add column if not exists description text,
  add column if not exists archived_at timestamptz,
  add column if not exists promoted_by uuid,
  add column if not exists promoted_at timestamptz,
  add column if not exists created_by_process text not null default 'authored',
  add column if not exists source_definition_id uuid references public.component_definitions(id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'component_definitions_status_chk') then
    alter table public.component_definitions
      add constraint component_definitions_status_chk check (status in ('implicit','curated'));
  end if;
end $$;

-- Backfill the mechanism stamp: exactly the rows that existed at rename time.
-- The rename DO-block above created a session-temp marker only when it
-- actually renamed; the stamp is therefore coupled to the one-time event and
-- cannot restamp rows on a re-run.
do $$
begin
  if to_regclass('pg_temp.v200_did_rename') is not null then
    update public.component_definitions
       set created_by_process = 'v200_migration'
     where created_by_process = 'authored';
  end if;
end $$;

-- Global scope: tenant_id NULL = EventCore global starter (SPEC-001 §1.5).
alter table public.component_definitions alter column tenant_id drop not null;

-- NULLs are distinct under the tenant-scoped unique index, so global names
-- need their own uniqueness:
create unique index if not exists idx_component_definitions_global_name
  on public.component_definitions (lower(btrim(name)))
  where tenant_id is null;

-- RLS: replace the v192 tenant-only SELECT with global-or-mine; writes stay
-- tenant-only (global rows are service-role territory; tenants FORK, §1.5).
drop policy if exists ci_select on public.component_definitions;
drop policy if exists cd_select on public.component_definitions;
create policy cd_select on public.component_definitions for select
  using (tenant_id is null or tenant_id = public.current_tenant_id());

do $$
begin
  -- v192's insert/update/delete policies survive the rename and already say
  -- tenant_id = current_tenant_id(), which correctly REFUSES writes to global
  -- rows (NULL never equals a uuid). Recreate under stable names if absent.
  if not exists (select 1 from pg_policies where tablename='component_definitions' and cmd='INSERT') then
    create policy cd_insert on public.component_definitions for insert
      with check (tenant_id = public.current_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where tablename='component_definitions' and cmd='UPDATE') then
    create policy cd_update on public.component_definitions for update
      using (tenant_id = public.current_tenant_id())
      with check (tenant_id = public.current_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where tablename='component_definitions' and cmd='DELETE') then
    create policy cd_delete on public.component_definitions for delete
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- ── 3. The pointer rename on instances (SPEC-001 §3.3) ──────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name='event_components' and column_name='identity_id')
     and not exists (select 1 from information_schema.columns
             where table_name='event_components' and column_name='definition_id') then
    alter table public.event_components rename column identity_id to definition_id;
  end if;
end $$;

alter index if exists idx_event_components_identity
  rename to idx_event_components_definition;

-- The v192 safety-net trigger, retained verbatim in behavior, renamed in
-- vocabulary, and now stamping its creations 'auto_title' so inferred nodes
-- are forever distinguishable from authored ones (SPEC-001 §3.2).
create or replace function public.assign_component_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if new.definition_id is not null then return new; end if;
  if new.title is null or btrim(new.title) = '' then return new; end if;
  if new.tenant_id is null then return new; end if;
  insert into public.component_definitions (tenant_id, name, created_by_process)
    values (new.tenant_id, btrim(new.title), 'auto_title')
    on conflict (tenant_id, lower(btrim(name))) do nothing;
  select id into v_id from public.component_definitions
   where tenant_id = new.tenant_id
     and lower(btrim(name)) = lower(btrim(new.title));
  new.definition_id := v_id;
  return new;
end $$;
-- (trigger trg_ec_identity already bound to this function name; unchanged)

-- ── 4. Definition layers — REVISIONED curated knowledge (SPEC-001 §3.4) ─────
create table if not exists public.component_layers (
  id             uuid primary key default gen_random_uuid(),
  definition_id  uuid not null references public.component_definitions(id),
  layer_key      text not null check (btrim(layer_key) <> ''),
  schema_version int  not null,
  data           jsonb not null,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  -- DEFERRABLE: the supersede write path is one transaction that stamps the
  -- old revision with the NEW revision's id and then inserts it — impossible
  -- with an immediate FK (the id doesn't exist yet) and impossible in the
  -- other order (the live-unique index blocks a second live row). Found by
  -- the executed matrix (V-B9b), not by review.
  superseded_by  uuid references public.component_layers(id)
                 deferrable initially deferred,
  archived_at    timestamptz
);

-- Uniqueness over LIVE rows only. A full unique constraint would make archive
-- a delete in disguise and forbid ever re-attaching a layer (SPEC-001 §3.4).
create unique index if not exists idx_component_layers_live
  on public.component_layers (definition_id, layer_key)
  where superseded_by is null and archived_at is null;

create index if not exists idx_component_layers_definition
  on public.component_layers (definition_id);

alter table public.component_layers enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='component_layers' and policyname='cl_select') then
    create policy cl_select on public.component_layers for select
      using (exists (select 1 from public.component_definitions d
                     where d.id = definition_id
                       and (d.tenant_id is null or d.tenant_id = public.current_tenant_id())));
  end if;
  if not exists (select 1 from pg_policies where tablename='component_layers' and policyname='cl_insert') then
    create policy cl_insert on public.component_layers for insert
      with check (exists (select 1 from public.component_definitions d
                          where d.id = definition_id
                            and d.tenant_id = public.current_tenant_id()));
  end if;
  if not exists (select 1 from pg_policies where tablename='component_layers' and policyname='cl_update') then
    create policy cl_update on public.component_layers for update
      using (exists (select 1 from public.component_definitions d
                     where d.id = definition_id and d.tenant_id = public.current_tenant_id()))
      with check (exists (select 1 from public.component_definitions d
                          where d.id = definition_id and d.tenant_id = public.current_tenant_id()));
  end if;
  if not exists (select 1 from pg_policies where tablename='component_layers' and policyname='cl_delete') then
    create policy cl_delete on public.component_layers for delete
      using (exists (select 1 from public.component_definitions d
                     where d.id = definition_id and d.tenant_id = public.current_tenant_id()));
  end if;
end $$;

-- ── 5. Instance layers — live work (SPEC-001 §3.5) ──────────────────────────
create table if not exists public.component_instance_layers (
  id             uuid primary key default gen_random_uuid(),
  component_id   uuid not null references public.event_components(id) on delete cascade,
  layer_key      text not null check (btrim(layer_key) <> ''),
  schema_version int  not null,
  data           jsonb not null,
  copied_from    uuid references public.component_layers(id),  -- lossless-reuse stamp
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists idx_component_instance_layers_one
  on public.component_instance_layers (component_id, layer_key);

create index if not exists idx_component_instance_layers_component
  on public.component_instance_layers (component_id);

alter table public.component_instance_layers enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='component_instance_layers' and policyname='cil_select') then
    create policy cil_select on public.component_instance_layers for select
      using (exists (select 1 from public.event_components ec
                     where ec.id = component_id and ec.tenant_id = public.current_tenant_id()));
  end if;
  if not exists (select 1 from pg_policies where tablename='component_instance_layers' and policyname='cil_insert') then
    create policy cil_insert on public.component_instance_layers for insert
      with check (exists (select 1 from public.event_components ec
                          where ec.id = component_id and ec.tenant_id = public.current_tenant_id()));
  end if;
  if not exists (select 1 from pg_policies where tablename='component_instance_layers' and policyname='cil_update') then
    create policy cil_update on public.component_instance_layers for update
      using (exists (select 1 from public.event_components ec
                     where ec.id = component_id and ec.tenant_id = public.current_tenant_id()))
      with check (exists (select 1 from public.event_components ec
                          where ec.id = component_id and ec.tenant_id = public.current_tenant_id()));
  end if;
  if not exists (select 1 from pg_policies where tablename='component_instance_layers' and policyname='cil_delete') then
    create policy cil_delete on public.component_instance_layers for delete
      using (exists (select 1 from public.event_components ec
                     where ec.id = component_id and ec.tenant_id = public.current_tenant_id()));
  end if;
end $$;

-- ── V. VERIFY MATRIX ADDITIONS (extends v189_verify_matrix.sql) ──────────────
-- Part V-A: structural, safe in SQL editor. Part V-B REQUIRES tenant-JWT
-- sessions (the editor bypasses RLS and gives false PASSes).

-- V-A1. RLS enabled on the new tables.
select 'V_A1_rls' as check, relname, relrowsecurity as enabled
from pg_class where relnamespace='public'::regnamespace and relkind='r'
  and relname in ('component_definitions','component_layers','component_instance_layers');

-- V-A2. No wide-open policies on the new tables.
select 'V_A2_open' as check, tablename, policyname
from pg_policies where schemaname='public'
  and tablename in ('component_definitions','component_layers','component_instance_layers')
  and (qual='true' or with_check='true');
-- Expect ZERO rows.

-- V-A3. Live-uniqueness index is partial (archive must not be delete-in-disguise).
select 'V_A3_partial_unique' as check, indexname,
       (indexdef like '%WHERE%') as is_partial
from pg_indexes where indexname='idx_component_layers_live';

-- V-A4. The compatibility view runs as INVOKER (else it bypasses RLS).
select 'V_A4_view_invoker' as check, c.relname,
       coalesce((select option_value from pg_options_to_table(c.reloptions)
                 where option_name='security_invoker'), 'false') as security_invoker
from pg_class c where c.relname='component_identities' and c.relkind='v';
-- Expect security_invoker = true.

-- V-A5. No manufactured curation: zero 'curated' rows may exist post-migration
-- unless a human ceremony wrote them.
select 'V_A5_no_manufactured_curation' as check, count(*) as curated_rows
from public.component_definitions where status='curated';
-- Expect 0 immediately after migration.

-- V-B (run as Tenant-A JWT, then Tenant-B JWT; expect zero rows / errors):
--   V-B1. select * from component_definitions where tenant_id = '<TENANT_B_UUID>';   → 0 rows
--   V-B2. select * from component_definitions where tenant_id is null;               → global rows visible to BOTH
--   V-B3. insert into component_definitions (tenant_id,name) values (null,'X');      → REFUSED
--   V-B4. update component_definitions set name='X' where tenant_id is null;         → 0 rows affected
--   V-B5. insert into component_layers (definition_id,…) for a GLOBAL definition;    → REFUSED (fork is the only door)
--   V-B6. select * from component_layers l where l.definition_id in (B's defs);      → 0 rows
--   V-B7. select * from component_instance_layers for B's components;                → 0 rows
--   V-B8. select * from component_identities (THE VIEW) as Tenant A;                 → identical rows to the base table, nothing more
