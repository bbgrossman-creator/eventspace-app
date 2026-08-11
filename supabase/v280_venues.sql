-- ═══════════════════════════════════════════════════════════════════════════
-- v280 — VENUE KNOWLEDGE FOUNDATION · RELATIONS  [MIGRATION]
-- Implements the frozen Venue Registry & Walkthrough Architecture, foundation
-- slice only. Two entities (venue, venue_space + contended flag); walkthroughs,
-- coverage, observations, supersessions, and evidence are APPEND-ONLY facts
-- (select+insert RLS, no update/delete = the immutability backstop, per the
-- shipped staffing_release / execution_evidence convention). All authoritative
-- writes flow through the v280 ceremonies (SECURITY DEFINER).
--
-- Invariants implemented here:
--   I-V1 tenant isolation on every table (RLS by current_tenant_id)
--   I-V2 venue identity is tenant-local; no cross-tenant structure exists
--   I-V3 spaces belong to exactly one venue; a parent space must belong to the
--        SAME venue (no cross-venue nesting); no self-parent; bounded depth
--   I-V4 walkthroughs, coverage, observations, supersessions, evidence are
--        append-only (no client update/delete path exists)
--   I-V5 evidence is immutable and fingerprinted; replacement is a new item
--        referencing the old (no destructive replacement)
--   I-V6 source classes are the closed frozen set (check constraint)
--   I-V7 observation scope is valid (scope spaces belong to the observation's
--        venue — trigger)
--   I-V8 supersession is one-shot per observation (UNIQUE) and same-tenant
--        (trigger); history is never removed
--   I-V9 venue redirect (merge) is additive metadata settable only by ceremony;
--        clients hold no update path to it
--   I-V10 nothing here references public.rooms or any scheduling object
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto;

-- ── venue: tenant-local durable reference entity (staff-roster mold) ─────────
create table if not exists public.venue (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  name          text not null,
  venue_type    text not null check (venue_type in
                  ('fixed_facility','private_home','outdoor_property','temporary_structure')),
  address       text,
  geo_lat       numeric,
  geo_lng       numeric,
  contacts      jsonb not null default '[]'::jsonb,
  management    text,
  notes         text,
  redirect_to   uuid references public.venue(id),   -- merge redirect; ceremony-only
  created_by    text not null,
  created_at    timestamptz not null default now()
);
create index if not exists venue_tenant_idx on public.venue (tenant_id, name);

-- ── venue_space: typed, optionally nested; contended flag = resource ─────────
create table if not exists public.venue_space (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  venue_id        uuid not null references public.venue(id),
  parent_space_id uuid references public.venue_space(id),
  kind            text not null check (kind in
                    ('building','room','ballroom','ceremony_space','kitchen','temporary_kitchen_area',
                     'prep_area','plating_area','refrigeration_area','storage','staging','loading_zone',
                     'dock','driveway','elevator','corridor','stair','waste_area','dish_return_area',
                     'outdoor_area','tent_site')),
  name            text not null,
  contended       boolean not null default false,
  sort_order      int not null default 0,
  created_by      text not null,
  created_at      timestamptz not null default now()
);
create index if not exists venue_space_venue_idx on public.venue_space (tenant_id, venue_id);

-- I-V3: parent must be same venue + same tenant; no self-parent; depth <= 6
create or replace function public.venue_space_nesting_guard() returns trigger
language plpgsql as $$
declare p record; d int := 0; cur uuid;
begin
  if new.parent_space_id is not null then
    if new.parent_space_id = new.id then raise exception 'VENUE_SPACE_INVALID_PARENT'; end if;
    select * into p from public.venue_space where id = new.parent_space_id;
    if not found or p.venue_id <> new.venue_id or p.tenant_id <> new.tenant_id then
      raise exception 'VENUE_SPACE_INVALID_PARENT';
    end if;
    cur := new.parent_space_id;
    while cur is not null loop
      d := d + 1;
      if d > 6 then raise exception 'VENUE_SPACE_DEPTH'; end if;
      select parent_space_id into cur from public.venue_space where id = cur;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists venue_space_nesting on public.venue_space;
create trigger venue_space_nesting before insert or update on public.venue_space
  for each row execute function public.venue_space_nesting_guard();

-- ── venue_walkthrough: one visit, append-only ────────────────────────────────
create table if not exists public.venue_walkthrough (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  venue_id        uuid not null references public.venue(id),
  engagement_ref  uuid,                                -- optional booking context
  purpose         text not null check (purpose in
                    ('initial_survey','pre_event_verification','post_renovation','dispute_resolution','general')),
  conducted_at    timestamptz not null,
  participants    jsonb not null default '[]'::jsonb,  -- names/roles; observations attribute individually
  rep_involvement text not null default 'none' check (rep_involvement in ('none','supplied','approved')),
  notes           text,
  created_by      text not null,
  created_at      timestamptz not null default now()
);
create index if not exists venue_walkthrough_idx on public.venue_walkthrough (tenant_id, venue_id, conducted_at desc);

-- ── walkthrough_coverage: what was (not) seen — powers three-valued honesty ──
create table if not exists public.walkthrough_coverage (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  walkthrough_id uuid not null references public.venue_walkthrough(id),
  space_id       uuid references public.venue_space(id),   -- null = venue overall
  status         text not null check (status in ('visited','partial','inaccessible')),
  note           text,
  created_at     timestamptz not null default now()
);

-- ── venue_evidence: immutable, fingerprinted (artifact_hash mold, I-V5) ──────
create table if not exists public.venue_evidence (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null,
  venue_id             uuid not null references public.venue(id),
  walkthrough_id       uuid references public.venue_walkthrough(id),
  kind                 text not null check (kind in
                         ('photograph','annotated_photograph','measurement_record','floor_plan',
                          'utility_diagram','rulebook','insurance_requirement','equipment_inventory',
                          'correspondence','permit','fire_documentation','other')),
  label                text not null,
  content_bytes        bytea,                       -- optional inline payload
  content_hash         text not null,               -- REQUIRED fingerprint
  meta                 jsonb not null default '{}'::jsonb,
  replaces_evidence_id uuid references public.venue_evidence(id),   -- additive replacement
  uploaded_by          text not null,
  created_at           timestamptz not null default now()
);

-- ── venue_observation: the append-only knowledge fact ────────────────────────
create table if not exists public.venue_observation (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  venue_id        uuid not null references public.venue(id),
  walkthrough_id  uuid references public.venue_walkthrough(id),
  scope_space_id  uuid references public.venue_space(id),   -- null = venue-level
  scope_space2_id uuid references public.venue_space(id),   -- pair scope (route compat only)
  attribute_key   text not null,
  value_kind      text not null check (value_kind in
                    ('quantity','range','boolean','enum','text','document','absent')),
  value           jsonb not null,
  narrative       text,                                     -- may accompany, never replace
  observer        text not null,
  observed_at     timestamptz not null,
  source_class    text not null check (source_class in
                    ('measurement','direct_observation','venue_document','venue_rep_statement','prior_knowledge')),
  method          text,
  confidence      text,
  effective_at    timestamptz,
  expires_at      timestamptz,
  condition_key   text,
  evidence_refs   uuid[] not null default '{}',
  created_by      text not null,
  created_at      timestamptz not null default now()
);
create index if not exists venue_observation_idx on public.venue_observation (tenant_id, venue_id, attribute_key);

-- I-V7: scope spaces (and walkthrough, and cited evidence) must belong to the venue
create or replace function public.venue_observation_scope_guard() returns trigger
language plpgsql as $$
declare e uuid;
begin
  if new.scope_space_id is not null and not exists
     (select 1 from public.venue_space s where s.id=new.scope_space_id and s.venue_id=new.venue_id and s.tenant_id=new.tenant_id)
    then raise exception 'OBSERVATION_INVALID_SCOPE'; end if;
  if new.scope_space2_id is not null and not exists
     (select 1 from public.venue_space s where s.id=new.scope_space2_id and s.venue_id=new.venue_id and s.tenant_id=new.tenant_id)
    then raise exception 'OBSERVATION_INVALID_SCOPE'; end if;
  if new.walkthrough_id is not null and not exists
     (select 1 from public.venue_walkthrough w where w.id=new.walkthrough_id and w.venue_id=new.venue_id and w.tenant_id=new.tenant_id)
    then raise exception 'OBSERVATION_INVALID_SCOPE'; end if;
  foreach e in array new.evidence_refs loop
    if not exists (select 1 from public.venue_evidence v where v.id=e and v.venue_id=new.venue_id and v.tenant_id=new.tenant_id)
      then raise exception 'OBSERVATION_INVALID_EVIDENCE'; end if;
  end loop;
  return new;
end $$;
drop trigger if exists venue_observation_scope on public.venue_observation;
create trigger venue_observation_scope before insert on public.venue_observation
  for each row execute function public.venue_observation_scope_guard();

-- ── venue_observation_supersession: explicit, attributed, one-shot (I-V8) ────
create table if not exists public.venue_observation_supersession (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  observation_id uuid not null references public.venue_observation(id),
  actor          text not null,
  reason         text not null,
  moment         timestamptz not null default now(),
  constraint supersession_one_shot unique (observation_id)
);
create or replace function public.supersession_tenant_guard() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.venue_observation o
                  where o.id=new.observation_id and o.tenant_id=new.tenant_id)
    then raise exception 'CEREMONY_NOT_FOUND'; end if;   -- cross-tenant/unknown: no leak
  return new;
end $$;
drop trigger if exists supersession_tenant on public.venue_observation_supersession;
create trigger supersession_tenant before insert on public.venue_observation_supersession
  for each row execute function public.supersession_tenant_guard();

-- ── RLS: select + insert only (append-only backstop, I-V4) ───────────────────
do $$
declare t text;
begin
  foreach t in array array['venue','venue_space','venue_walkthrough','walkthrough_coverage',
                           'venue_evidence','venue_observation','venue_observation_supersession'] loop
    execute format('alter table public.%I enable row level security', t);
    begin execute format('create policy %I_sel on public.%I for select using (tenant_id = public.current_tenant_id())', t, t);
    exception when duplicate_object then null; end;
    begin execute format('create policy %I_ins on public.%I for insert with check (tenant_id = public.current_tenant_id())', t, t);
    exception when duplicate_object then null; end;
    -- deliberately NO update/delete policies on any v280 table
  end loop;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname='authenticated') then
    grant select, insert on public.venue, public.venue_space, public.venue_walkthrough,
      public.walkthrough_coverage, public.venue_evidence, public.venue_observation,
      public.venue_observation_supersession to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname='app_user') then
    grant select, insert on public.venue, public.venue_space, public.venue_walkthrough,
      public.walkthrough_coverage, public.venue_evidence, public.venue_observation,
      public.venue_observation_supersession to app_user;
  end if;
end $$;
