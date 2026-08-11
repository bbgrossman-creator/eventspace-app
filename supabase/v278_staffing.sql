-- ═══════════════════════════════════════════════════════════════════════════
-- v278 — STAFFING ASSIGNMENT & COVERAGE · RELATIONS. Additive over v277. Explicit
-- relations (never JSON), append-only, tenant-scoped. Coverage is DERIVED, never
-- stored (no staffed/covered/confirmed column anywhere). Introduces staffing
-- invariants I-42…I-47:
--   I-42 staffing requirements DERIVE from released operational truth (deterministic,
--        natural-keyed from released staffing obligations; editable proposal content
--        cannot alter a released requirement)
--   I-43 staffing assignments are EXPLICIT authoritative relations (not JSON)
--   I-44 staffing history is PERMANENT (correction/removal are append-only facts;
--        no hard delete; the original assignment always survives)
--   I-45 staffing coverage is DERIVED (required/assigned/shortage/conflict projected)
--   I-46 scheduling conflicts are PROJECTED with defined half-open overlap semantics
--   I-47 staffing authority is TENANT-SCOPED and DEFAULT-DENY
--
-- The person assigned resolves to the EXISTING authoritative tenant staff roster
-- (public.staff) — v278 invents no second employee directory. The guard below
-- ensures that roster exists on a fresh deploy; where it already exists
-- (production, v189) it is a no-op and its columns are left untouched.
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto;

-- compatibility guard for the existing authoritative staff roster (no-op in prod)
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  active boolean not null default true,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

-- ── staffing_requirement: an event-scoped operational need, DERIVED from a
--    released staffing obligation (I-42). Append-only; regeneration is idempotent.
create table if not exists public.staffing_requirement (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  event_ref             uuid not null references public.event(id),
  origin_obligation_ref uuid not null references public.obligation(id),   -- provenance
  role                  text not null,
  quantity              int  not null default 1 check (quantity >= 1),
  department            text not null default 'staffing',
  window_start          timestamptz,                                      -- informational (nullable)
  window_end            timestamptz,
  natural_key           text not null,                                    -- sha256(event·origin·role)
  created_at            timestamptz not null default now(),
  constraint staffing_requirement_natural_key_unique unique (tenant_id, natural_key)
);
create index if not exists staffing_requirement_event_idx on public.staffing_requirement (tenant_id, event_ref);

-- ── staffing_assignment: THIS person is assigned to THIS requirement (I-43).
--    Explicit relation, append-only. Validity is derived (an assignment is active
--    unless a staffing_release cites it). No mutable status column.
create table if not exists public.staffing_assignment (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  event_ref       uuid not null references public.event(id),
  requirement_ref uuid not null references public.staffing_requirement(id),
  staff_ref       uuid not null,                                          -- → public.staff(id) (validated in ceremony)
  role            text not null,
  window_start    timestamptz not null,
  window_end      timestamptz not null,
  assigned_by     text not null,
  assigned_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  constraint staffing_assignment_window_valid check (window_end > window_start)
);
create index if not exists staffing_assignment_req_idx   on public.staffing_assignment (tenant_id, requirement_ref);
create index if not exists staffing_assignment_staff_idx on public.staffing_assignment (tenant_id, staff_ref);

-- ── staffing_release: the append-only UNASSIGN / invalidation fact (I-44). A
--    correction is a release + a new assignment; the original row always survives.
create table if not exists public.staffing_release (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  assignment_ref uuid not null references public.staffing_assignment(id),
  actor          text not null,
  reason         text,
  moment         timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index if not exists staffing_release_assignment_idx on public.staffing_release (tenant_id, assignment_ref);

-- ── RLS: insert+select-only, tenant-scoped (I-47). No update/delete policy ⇒
--    the append-only / no-hard-delete backstop (I-44).
alter table public.staffing_requirement enable row level security;
alter table public.staffing_assignment  enable row level security;
alter table public.staffing_release      enable row level security;
do $$ begin
  begin create policy sreq_select on public.staffing_requirement for select using (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy sreq_insert on public.staffing_requirement for insert with check (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy sasg_select on public.staffing_assignment for select using (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy sasg_insert on public.staffing_assignment for insert with check (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy srel_select on public.staffing_release for select using (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy srel_insert on public.staffing_release for insert with check (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname='authenticated') then
    grant select, insert on public.staffing_requirement, public.staffing_assignment, public.staffing_release to authenticated;
    grant select on public.staff to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname='app_user') then
    grant select, insert on public.staffing_requirement, public.staffing_assignment, public.staffing_release to authenticated;
    grant select on public.staff to authenticated;
  end if;
end $$;
