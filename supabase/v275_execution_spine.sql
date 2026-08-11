-- ═══════════════════════════════════════════════════════════════════════════
-- v275 — EXECUTION OS SPINE (slice 1). Additive. The Proposal Lifecycle
-- (PL-1…PL-4, invariants I-15…I-30) is FROZEN and untouched: this migration reads
-- the commitment layer and never writes it. It introduces the three spine objects
-- the Execution OS constitutional boundary (I-31…I-41) requires:
--
--   event               the canonical operational record (I-31, I-39)
--   obligation          the executable obligation, immutable identity+provenance (I-33, I-36)
--   execution_evidence  the append-only operational evidence ledger (I-34, I-35)
--
-- LAW EMBODIED HERE:
--   · No spine table carries a mutable status/stage column. State is a PROJECTION
--     of evidence + dependencies (I-34); there is nothing to overwrite.
--   · `event` is UNIQUE over the released ENGAGEMENT (booking identity) — amendments
--     attach additively, never a duplicate (I-31). The originating acceptance is
--     recorded as PROVENANCE, not as the key.
--   · `obligation` is UNIQUE over its deterministic natural_key — regeneration is
--     idempotent (I-36); provenance (origin_ref) is NOT NULL and permanent (I-33).
--   · All three tables are insert+select-only under RLS (no update/delete policy):
--     the v269 immutability discipline (I-35, I-40). Correction is a new fact.
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto;

-- ── event ───────────────────────────────────────────────────────────────────
create table if not exists public.event (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null,
  engagement_ref         uuid not null,            -- the booking/engagement identity (singularity key)
  origin_commitment_ref  uuid not null,            -- provenance: the offer_acceptances.id that released it
  released_at            timestamptz not null default now(),
  released_by            text not null,
  created_at             timestamptz not null default now(),
  -- I-31: exactly one canonical event per released engagement. Amendments resolve
  -- THIS row; they never insert a second. The originating commitment is provenance.
  constraint event_one_per_engagement unique (tenant_id, engagement_ref)
);
-- NOTE: deliberately NO stage/status column. Event stage is projected (I-34).

-- ── obligation ──────────────────────────────────────────────────────────────
create table if not exists public.obligation (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  event_ref         uuid not null references public.event(id),        -- I-39 single event truth
  origin_ref        uuid not null,                                    -- I-33 provenance (acceptance/selection/release)
  origin_kind       text not null check (origin_kind in ('selection','release','manual_authorized')),
  kind              text not null,                                    -- outcome class (culinary_prepare, equipment_pull, …)
  department        text not null check (department in ('culinary','equipment','staffing','venue','logistics')),
  required_outcome  text not null,                                    -- imperative; 'unresolved: …' encodes decision-debt
  resource_role     text,                                             -- resource identity within the kind (station id, role)
  dependencies      jsonb not null default '[]'::jsonb,               -- predecessor natural_keys (structural)
  timing            jsonb,                                            -- {due, window_start, window_end}; null = untimed
  natural_key       text not null,                                    -- sha256(event·origin·kind·coalesce(resource_role,''))
  created_at        timestamptz not null default now(),
  -- I-36: deterministic idempotent generation. Regeneration upserts by this key.
  constraint obligation_natural_key_unique unique (tenant_id, natural_key)
);
-- NOTE: deliberately NO status/invalidated column. Obligation state (incl.
-- invalidation) is projected from execution_evidence + dependencies (I-34, I-35).
create index if not exists obligation_event_idx on public.obligation (tenant_id, event_ref);

-- ── execution_evidence ──────────────────────────────────────────────────────
create table if not exists public.execution_evidence (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  event_ref      uuid not null references public.event(id),
  obligation_ref uuid references public.obligation(id),               -- null for event-level facts (released/clearance/sign_off)
  kind           text not null check (kind in
                   ('released','clearance','sign_off',                -- event-level authority facts
                    'assignment','scan','inspection','completion','exception',  -- obligation progress
                    'invalidated','superseded','cancelled')),         -- correction outcomes (I-35, four distinct)
  actor          text not null,
  moment         timestamptz not null default now(),
  payload        jsonb not null default '{}'::jsonb,
  prior_ref      uuid references public.execution_evidence(id),       -- a correction cites the prior fact (I-35)
  created_at     timestamptz not null default now()
);
create index if not exists evidence_event_idx      on public.execution_evidence (tenant_id, event_ref);
create index if not exists evidence_obligation_idx on public.execution_evidence (tenant_id, obligation_ref);

-- ── RLS: insert+select-only, tenant-scoped (I-40). No update/delete policy ⇒
--    update/delete denied for non-bypass roles = the immutability backstop (I-35).
alter table public.event              enable row level security;
alter table public.obligation         enable row level security;
alter table public.execution_evidence enable row level security;
do $$ begin
  begin create policy event_select on public.event
    for select using (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy event_insert on public.event
    for insert with check (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy obl_select on public.obligation
    for select using (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy obl_insert on public.obligation
    for insert with check (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy ev_select on public.execution_evidence
    for select using (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy ev_insert on public.execution_evidence
    for insert with check (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
end $$;

-- ── grants: select+insert only (NO update/delete) + execute on the ceremonies.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert on public.event, public.obligation, public.execution_evidence to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant select, insert on public.event, public.obligation, public.execution_evidence to authenticated;
  end if;
end $$;
