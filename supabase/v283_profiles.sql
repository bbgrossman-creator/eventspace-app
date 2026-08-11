-- ═══════════════════════════════════════════════════════════════════════════
-- v283 — COMPONENT OPERATIONAL PROFILE FOUNDATION  [MIGRATION]
-- Implements exactly the approved architecture: tenant-local library
-- component identity (venue-registry philosophy: uuid identity, advisory
-- duplicates, no auto-merge); APPEND-ONLY atomic profile revisions (current
-- derived by monotonic seq — the v281 lesson baked in); immutable requirement
-- rows on the approved hybrid scaffold (family + server kind vocabulary +
-- bounded units + declarative scaling + aggregation/temporal metadata + one
-- bounded condition); a pure deterministic resolution function. NOTHING here
-- computes aggregation, touches proposals, staffing, equipment, release, or
-- any shipped consumer.
--
-- Invariants: I-L1 tenant isolation; I-L2 identity is uuid (names advisory);
-- I-L3 revisions append-only, atomic, seq-derived current; I-L4 requirement
-- rows immutable; I-L5 family/kind/unit/basis/aggregation/temporal/condition
-- all server-bounded (immutable check functions — no client vocabulary);
-- I-L6 resolution is a pure function (same inputs ⇒ same output; missing
-- parameter ⇒ explicit 'unresolved', never a guess); I-L7 no mutable
-- completeness/readiness/feasibility column exists anywhere; I-L8 no
-- executable formulas (payloads refusing formula-bearing keys).
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto;

-- ── server vocabularies (immutable functions = the bounded law) ─────────────
create or replace function public.profile_family_valid(f text) returns boolean
language sql immutable as $$
  select f in ('space','utility','equipment','labor','time','production','access','environment','consumable') $$;

create or replace function public.profile_kind_valid(f text, k text) returns boolean
language sql immutable as $$
  select case f
    when 'space'       then k in ('footprint','frontage','clearance','staging','storage','circulation','queue_area')
    when 'utility'     then k in ('circuit','amperage','voltage','water','drainage','gas','ventilation','data')
    when 'equipment'   then k in ('equipment_item','smallwares','serviceware','transport_container','safety_equipment')
    when 'labor'       then k in ('role_headcount','skill','setup_labor','service_labor','breakdown_labor','supervisor')
    when 'time'        then k in ('lead_time','setup_duration','service_duration','replenishment_interval','breakdown_duration','reset_time')
    when 'production'  then k in ('kitchen_access','commissary','refrigeration','freezer','hot_holding','finishing','plating','dishwashing','sanitation')
    when 'access'      then k in ('loading_access','freight_elevator','stairs','travel_path','vehicle_access','delivery_window','security_checkin','dock_reservation')
    when 'environment' then k in ('indoor_outdoor','weather_protection','fire_restriction','open_flame','noise','floor_loading','food_safety','allergen_separation')
    when 'consumable'  then k in ('fuel','ice','disposables','linens','serving_pieces','replacement_stock','replenishment_qty')
    else false end $$;

create or replace function public.profile_unit_valid(f text, u text) returns boolean
language sql immutable as $$
  select case f
    when 'space'       then u in ('ft','sqft','in')
    when 'utility'     then u in ('amps','volts','circuits','gpm','cfm','mbps')
    when 'equipment'   then u in ('count')
    when 'labor'       then u in ('people','hours')
    when 'time'        then u in ('minutes','hours','days')
    when 'production'  then u in ('cuft','pans','count','sqft','covers_per_hour')
    when 'access'      then u in ('count','ft','lbs','minutes')
    when 'environment' then u in ('count','db','lbs_per_sqft')
    when 'consumable'  then u in ('count','lbs','gal','bags')
    else false end $$;

create or replace function public.profile_param_valid(p text) returns boolean
language sql immutable as $$
  select p in ('guest_count','duration_hours','service_points','table_count','location_class',
               'service_style','ware_class','kosher_class','floor_level','travel_class') $$;

-- ── library component (reference data; venue-registry mold) ─────────────────
create table if not exists public.library_component (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  name       text not null,
  kind       text not null default 'general',
  notes      text,
  active     boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists library_component_idx on public.library_component (tenant_id, name);

-- ── append-only atomic revisions (current = max seq per component) ──────────
create table if not exists public.component_profile_revision (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null,
  library_component_id   uuid not null references public.library_component(id),
  revision_no            int not null,
  reason                 text,
  supersedes_revision_id uuid references public.component_profile_revision(id),
  authored_by            text not null,
  seq                    bigint generated always as identity,
  created_at             timestamptz not null default clock_timestamp(),
  constraint profile_revision_no_unique unique (library_component_id, revision_no)
);

-- ── immutable requirement rows (the hybrid scaffold) ────────────────────────
create table if not exists public.profile_requirement (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  revision_id      uuid not null references public.component_profile_revision(id),
  family           text not null check (public.profile_family_valid(family)),
  kind             text not null,
  label            text not null,
  capability       boolean not null default false,   -- capability vs discrete item
  provision_source text not null default 'company' check (provision_source in ('company','rented','venue','any')),
  -- declarative scaling (no expressions)
  basis            text not null check (basis in
                     ('fixed','per_instance','per_service_point','per_guest','per_guest_band',
                      'per_table','per_hour','per_shift','per_batch')),
  rate             numeric not null,
  band_size        int,
  min_qty          numeric,
  max_qty          numeric,
  rounding         text not null default 'ceil' check (rounding in ('ceil','floor','nearest')),
  unit             text not null,
  payload          jsonb not null default '{}'::jsonb,
  aggregation      text not null check (aggregation in ('additive','shareable','capacity','exclusive')),
  temporal         text not null check (temporal in ('concurrent','phase_reusable','consumed')),
  condition_param  text check (condition_param is null or public.profile_param_valid(condition_param)),
  condition_value  text,
  position         int not null default 0,
  created_at       timestamptz not null default now(),
  constraint profile_req_kind_valid  check (public.profile_kind_valid(family, kind)),
  constraint profile_req_unit_valid  check (public.profile_unit_valid(family, unit)),
  constraint profile_req_band        check (basis <> 'per_guest_band' or (band_size is not null and band_size > 0)),
  constraint profile_req_condition   check ((condition_param is null) = (condition_value is null)),
  constraint profile_req_no_formulas check (not (payload ?| array['formula','expr','expression','code','script','eval']))
);
create index if not exists profile_requirement_rev_idx on public.profile_requirement (tenant_id, revision_id, family, position);

-- ── RLS: select + insert only (append-only backstop) ────────────────────────
do $$
declare t text;
begin
  foreach t in array array['library_component','component_profile_revision','profile_requirement'] loop
    execute format('alter table public.%I enable row level security', t);
    begin execute format('create policy %I_sel on public.%I for select using (tenant_id = public.current_tenant_id())', t, t);
    exception when duplicate_object then null; end;
    begin execute format('create policy %I_ins on public.%I for insert with check (tenant_id = public.current_tenant_id())', t, t);
    exception when duplicate_object then null; end;
    -- deliberately NO update/delete policies
  end loop;
end $$;
do $$ begin
  if exists (select 1 from pg_roles where rolname='authenticated') then
    grant select, insert on public.library_component, public.component_profile_revision, public.profile_requirement to authenticated; end if;
  if exists (select 1 from pg_roles where rolname='app_user') then
    grant select, insert on public.library_component, public.component_profile_revision, public.profile_requirement to authenticated; end if;
end $$;

-- ── the pure resolution function (I-L6) ─────────────────────────────────────
-- context: jsonb of resolved parameter values. Returns:
--   {status:'resolved', quantity, basis_count}  |  {status:'unresolved', missing}
create or replace function public.resolve_quantity(
  p_basis text, p_rate numeric, p_band int, p_min numeric, p_max numeric,
  p_rounding text, p_context jsonb
) returns jsonb language plpgsql immutable
as $$
declare needed text; cnt numeric; q numeric;
begin
  needed := case p_basis
    when 'per_guest' then 'guest_count' when 'per_guest_band' then 'guest_count'
    when 'per_service_point' then 'service_points' when 'per_table' then 'table_count'
    when 'per_hour' then 'duration_hours' when 'per_shift' then 'shift_count'
    when 'per_batch' then 'batch_count' else null end;
  if p_basis in ('fixed','per_instance') then cnt := 1;
  else
    if p_context is null or p_context->>needed is null then
      return jsonb_build_object('status','unresolved','missing',needed);
    end if;
    cnt := (p_context->>needed)::numeric;
    if p_basis = 'per_guest_band' then cnt := ceil(cnt / p_band); end if;
  end if;
  q := p_rate * cnt;
  q := case p_rounding when 'floor' then floor(q) when 'nearest' then round(q) else ceil(q) end;
  if p_min is not null then q := greatest(q, p_min); end if;
  if p_max is not null then q := least(q, p_max); end if;
  return jsonb_build_object('status','resolved','quantity',q,'basis_count',cnt);
end $$;
