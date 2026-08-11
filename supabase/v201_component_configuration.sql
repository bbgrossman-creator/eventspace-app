-- ═══════════════════════════════════════════════════════════════════════════
-- v201 — COMPONENT CONFIGURATION (schema + atomic persistence)
-- Implements SPEC-002 Rev C as amended by Rev D
--   (docs/SPEC-002-component-instantiation-configuration.md)
--
-- What this file enforces, not merely intends:
--   · One requirements truth (Rev D): consequences live in the EXISTING
--     component_requirements, extended additively. No second table.
--   · Append-only move log: configuration_moves has SELECT and INSERT
--     policies and DELIBERATELY NO update/delete policies. The absence is
--     the design (Time); the harness proves refusal, not just omission.
--   · Atomicity (SPEC-002 §1.2): apply_move_batch() persists state writes,
--     requirement recompute effects, and move records in ONE transaction —
--     any failure rolls back everything. SECURITY INVOKER: RLS applies
--     through the caller; the function grants nothing.
--   · Derived identity is the logical key: partial unique
--     (component_id, layer_key, logical_key) — suppressions survive
--     recomputation because identity is the key, not the row.
--
-- Additive-only. Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Definition configuration (the seed: option sets, schemes, defaults) ──
create table if not exists public.component_definition_config (
  id             uuid primary key default gen_random_uuid(),
  definition_id  uuid not null references public.component_definitions(id),
  schema_version int  not null,
  data           jsonb not null,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  superseded_by  uuid references public.component_definition_config(id)
                 deferrable initially deferred,
  archived_at    timestamptz
);
create unique index if not exists idx_cdc_live
  on public.component_definition_config (definition_id)
  where superseded_by is null and archived_at is null;
create index if not exists idx_cdc_definition
  on public.component_definition_config (definition_id);

alter table public.component_definition_config enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='component_definition_config' and policyname='cdc_select') then
    create policy cdc_select on public.component_definition_config for select
      using (exists (select 1 from public.component_definitions d
                     where d.id = definition_id
                       and (d.tenant_id is null or d.tenant_id = public.current_tenant_id())));
  end if;
  if not exists (select 1 from pg_policies where tablename='component_definition_config' and policyname='cdc_write') then
    create policy cdc_write on public.component_definition_config for all
      using (exists (select 1 from public.component_definitions d
                     where d.id = definition_id and d.tenant_id = public.current_tenant_id()))
      with check (exists (select 1 from public.component_definitions d
                          where d.id = definition_id and d.tenant_id = public.current_tenant_id()));
  end if;
end $$;

-- ── 2. Instance configuration (the choices; platform-owned stratum) ─────────
create table if not exists public.event_component_config (
  component_id         uuid primary key references public.event_components(id) on delete cascade,
  schema_version       int  not null,
  data                 jsonb not null,
  seed_config_revision uuid references public.component_definition_config(id),
  updated_at           timestamptz not null default now()
);

alter table public.event_component_config enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='event_component_config' and policyname='ecc_all') then
    create policy ecc_all on public.event_component_config for all
      using (exists (select 1 from public.event_components ec
                     where ec.id = component_id and ec.tenant_id = public.current_tenant_id()))
      with check (exists (select 1 from public.event_components ec
                          where ec.id = component_id and ec.tenant_id = public.current_tenant_id()));
  end if;
end $$;

-- ── 3. The move log — APPEND-ONLY (SPEC-002 §3.3, incl. Rev C `before`) ─────
create table if not exists public.configuration_moves (
  id             uuid primary key default gen_random_uuid(),
  component_id   uuid not null references public.event_components(id) on delete cascade,
  kind           text not null check (btrim(kind) <> ''),
  payload        jsonb not null,
  before         jsonb,                  -- prior values, only where invert needs them
  origin         text not null check (origin in
                   ('facet','canvas','scheme','intent.deterministic','intent.model','intent.replay')),
  parent_move_id uuid references public.configuration_moves(id) deferrable initially deferred,
  cause          text,
  actor          uuid,
  created_at     timestamptz not null default now()
);
create index if not exists idx_cm_component on public.configuration_moves (component_id, created_at);

alter table public.configuration_moves enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='configuration_moves' and policyname='cm_select') then
    create policy cm_select on public.configuration_moves for select
      using (exists (select 1 from public.event_components ec
                     where ec.id = component_id and ec.tenant_id = public.current_tenant_id()));
  end if;
  if not exists (select 1 from pg_policies where tablename='configuration_moves' and policyname='cm_insert') then
    create policy cm_insert on public.configuration_moves for insert
      with check (exists (select 1 from public.event_components ec
                          where ec.id = component_id and ec.tenant_id = public.current_tenant_id()));
  end if;
  -- NO update policy. NO delete policy. History is never overwritten.
end $$;

-- ── 4. Requirements extension (Rev D: one truth, derived + manual) ──────────
alter table public.component_requirements
  add column if not exists layer_key    text,
  add column if not exists logical_key  text,
  add column if not exists derived      boolean not null default false,
  add column if not exists suppressed_at timestamptz;

-- Derived identity IS the logical key: one live derived row per key.
create unique index if not exists idx_cr_logical
  on public.component_requirements (component_id, layer_key, logical_key)
  where logical_key is not null;

-- ── 5. Instantiation grouping (SPEC-002 §1.4; KA §7 atomic-removal group) ───
alter table public.event_components add column if not exists instantiation_id uuid;
alter table public.component_items  add column if not exists instantiation_id uuid;
-- (spec text said event_items; the table's real name is component_items)

-- ── 6. THE ATOMIC BATCH (SPEC-002 §1.2 invariant, at the tier that can keep it)
-- The TS engine validates and PLANS (pure); this function PERSISTS the plan.
-- One transaction: config write, derived-requirement replacement, suppressions,
-- manual requirement ops, and move records. Any exception rolls back all of it.
-- SECURITY INVOKER: every statement runs under the caller's RLS.
create or replace function public.apply_move_batch(
  p_component uuid,
  p_expected_updated_at timestamptz,   -- optimistic concurrency on config
  p_config jsonb,                       -- null = config unchanged
  p_config_schema_version int,
  p_derived jsonb,                      -- [{layer_key, logical_key, name, category, notes}] full replacement set
  p_suppress jsonb,                     -- [{layer_key, logical_key}]
  p_restore jsonb,                      -- [{layer_key, logical_key}]
  p_manual_add jsonb,                   -- [{layer_key, name, category, notes}]
  p_moves jsonb                         -- [{kind, payload, before, origin, parent_ix, cause}]
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_ids uuid[] := '{}';
  v_move jsonb; v_id uuid; v_parent uuid; n int;
begin
  -- concurrency gate: the batch was planned against a config snapshot
  if p_config is not null then
    update public.event_component_config
       set data = p_config, schema_version = p_config_schema_version, updated_at = v_now
     where component_id = p_component
       and (p_expected_updated_at is null or updated_at = p_expected_updated_at);
    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'CONFIG_CONFLICT: configuration changed since the batch was planned';
    end if;
  end if;

  -- derived requirements: replace wholesale; identity = logical key.
  if p_derived is not null then
    -- remove derived rows whose keys are no longer emitted (suppressed rows
    -- KEEP their suppression — identity survives recomputation)
    delete from public.component_requirements r
     where r.component_id = p_component and r.derived
       and r.suppressed_at is null
       and not exists (select 1 from jsonb_array_elements(p_derived) d
                       where d->>'layer_key' = r.layer_key and d->>'logical_key' = r.logical_key);
    insert into public.component_requirements (component_id, layer_key, logical_key, derived, name, category, notes)
      select p_component, d->>'layer_key', d->>'logical_key', true, d->>'name', d->>'category', d->>'notes'
      from jsonb_array_elements(p_derived) d
      on conflict (component_id, layer_key, logical_key) where logical_key is not null
      do update set name = excluded.name, category = excluded.category, notes = excluded.notes;
  end if;

  update public.component_requirements set suppressed_at = v_now
   where component_id = p_component and suppressed_at is null
     and (layer_key, logical_key) in
         (select s->>'layer_key', s->>'logical_key' from jsonb_array_elements(coalesce(p_suppress,'[]'::jsonb)) s);

  update public.component_requirements set suppressed_at = null
   where component_id = p_component and suppressed_at is not null
     and (layer_key, logical_key) in
         (select s->>'layer_key', s->>'logical_key' from jsonb_array_elements(coalesce(p_restore,'[]'::jsonb)) s);

  insert into public.component_requirements (component_id, layer_key, derived, name, category, notes)
    select p_component, m->>'layer_key', false, m->>'name', m->>'category', m->>'notes'
    from jsonb_array_elements(coalesce(p_manual_add,'[]'::jsonb)) m;

  -- the records, last, in order; parent_ix resolves compound children
  for v_move in select * from jsonb_array_elements(coalesce(p_moves,'[]'::jsonb)) loop
    v_parent := case when (v_move->>'parent_ix') is not null
                     then v_ids[(v_move->>'parent_ix')::int + 1] end;
    insert into public.configuration_moves (component_id, kind, payload, before, origin, parent_move_id, cause, actor)
      values (p_component, v_move->>'kind', v_move->'payload', v_move->'before',
              v_move->>'origin', v_parent, v_move->>'cause', auth.uid())
      returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  return jsonb_build_object('applied', coalesce(jsonb_array_length(p_moves),0), 'at', v_now);
end $$;

-- ── V. VERIFY MATRIX ADDITIONS (proven in supabase/tests, v200 pattern) ──────
-- V2-1  cross-tenant: A sees zero of B's config, moves, definition config
-- V2-2  append-only: UPDATE a move as the OWNING tenant → refused
-- V2-3  append-only: DELETE a move as the OWNING tenant → refused
-- V2-4  atomicity: a batch whose final op violates a constraint persists NOTHING
-- V2-5  logical-key identity: suppression survives a full derived recompute
-- V2-6  concurrency: stale p_expected_updated_at → CONFIG_CONFLICT, nothing applied
