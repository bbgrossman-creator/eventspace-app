-- ════════════════════════════════════════════════════════════════════════════
-- v292a — PROMISE-SIDE CAPTURE FOUNDATION
--
-- The engagement's OPERATIONAL PROFILE: amendable promise truth about the event
-- as a thing that happens, sitting between immutable contract truth
-- (offer_snapshots / offer_acceptances) and execution work (obligation).
--
-- SCOPE. Schema, authority gates, ceremonies, append-only guards, RLS, and the
-- temporal resolvers required to prove the resolution rule. NOT in this slice:
-- projection_event_brief, capture UI, Day Sheet, Event Command, resource model,
-- milestone→obligation derivation, or any change to release_event().
--
-- ANCHORING. Every object attaches to the ENGAGEMENT ROOT (bookings.id), never
-- to event. The facts exist before release — you know the date and the headcount
-- when you sell the job — and one engagement materialises exactly one event
-- (I-31), so the event inherits by join through engagement_ref. `event` remains
-- a pure execution anchor, per ruling.
--
-- VENUE is deliberately absent: engagement_venue_binding already implements this
-- pattern and remains authoritative. Nothing here replaces it.
--
-- ── TEMPORAL MODEL (ruled) ─────────────────────────────────────────────────
-- Three distinct times, never conflated:
--   recorded_at       when the system learned the fact (system time; the
--                     TRANSACTION timestamp, not the wall clock — a fact is
--                     recorded as of the transaction that recorded it, so a
--                     reader in that same transaction can see it)
--   effective_moment  when the fact becomes operationally true (valid time)
--   p_now             the moment a reader is asking about (query time)
--
-- Only ATTENDANCE is bitemporal. A guarantee struck today and effective at the
-- 72-hour mark is a real commercial instrument, so attendance carries
-- effective_moment. Profile, schedule and supervision are UNI-TEMPORAL: renaming
-- an event or moving the ceremony takes effect when recorded. Giving them an
-- unused effectivity axis would add proof surface and no meaning.
--
-- RESOLUTION RULE, applied by the resolvers below and proven in v292a_proof:
--   1 ELIGIBLE      recorded_at <= p_now
--                   (a fact recorded after p_now is invisible — this is what
--                    makes historic reproduction honest)
--   2 LIVE          no ELIGIBLE record supersedes it via replaces_id
--                   (supersession is evaluated inside the eligible set, so a
--                    later correction does not retroactively alter history)
--   3 EFFECTIVE     effective_moment <= p_now          [attendance only]
--   4 CURRENT       among LIVE ∧ EFFECTIVE, latest effective_moment,
--                   tie-broken by seq desc
--   5 SCHEDULED     LIVE ∧ effective_moment > p_now, returned SEPARATELY and
--                   never presented as current
--
-- Consequence, stated so it cannot be mistaken: a guarantee recorded now but
-- effective tomorrow is SCHEDULED today and CURRENT tomorrow. It never silently
-- becomes the operative count on entry.
--
-- ── CONTRACTED COUNT: A PROVEN NEGATIVE ────────────────────────────────────
-- The specification was required to prove a constitutional path to a contracted
-- headcount inside accepted offer data before the projection could claim one.
-- There is none:
--   · offer_snapshots.model is copied by value from
--     staged_artifact_packages.model (v265_publish.sql:261);
--   · that column is written only by the application and carries NO schema —
--     its constraints are pkey, a status check, and a version FK;
--   · publish_offer reads exactly two keys from it, 'complete' and
--     'profile_satisfied' (v265_publish.sql:211,214);
--   · no covers / guests / headcount / pax key exists anywhere in the schema.
-- Therefore attendance_commitment is the AUTHORITATIVE TYPED SOURCE for every
-- attendance number INCLUDING the original contracted count, recorded with
-- basis 'contracted'. The projection must never infer a count from arbitrary
-- accepted JSON.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · AUTHORITY GATES ─────────────────────────────────────────────────────
-- Separate gates per fact class. Whoever may rename an event must not thereby
-- be able to change the guarantee that gets billed. Pattern follows
-- can_manage_venues().

create or replace function public.can_edit_engagement_profile()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = public.current_tenant_id() and tu.active
       and tu.role in ('admin','owner','manager','ops','coordinator')
       and tu.user_id = coalesce(
             nullif(current_setting('app.user_id', true), ''),
             nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid);
$$;

-- Elevated: this number is billed on.
create or replace function public.can_commit_attendance()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = public.current_tenant_id() and tu.active
       and tu.role in ('admin','owner','manager')
       and tu.user_id = coalesce(
             nullif(current_setting('app.user_id', true), ''),
             nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid);
$$;

create or replace function public.can_set_schedule()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = public.current_tenant_id() and tu.active
       and tu.role in ('admin','owner','manager','ops','coordinator')
       and tu.user_id = coalesce(
             nullif(current_setting('app.user_id', true), ''),
             nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid);
$$;

-- Compliance-bearing: who supervises the kitchen is not a scheduling decision.
create or replace function public.can_bind_supervision()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = public.current_tenant_id() and tu.active
       and tu.role in ('admin','owner','manager')
       and tu.user_id = coalesce(
             nullif(current_setting('app.user_id', true), ''),
             nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid);
$$;

-- ── 2 · TABLES ──────────────────────────────────────────────────────────────

-- 2.1 · engagement_profile — display identity. Low authority, no operational
--       consequence. Resolves the parked UUID/event-name decision: display_name
--       is the projected name, and no surface renders hex again.
create table if not exists public.engagement_profile (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  booking_id          uuid not null references public.bookings(id),
  display_name        text,
  occasion_kind       text,          -- open text: wedding, bar mitzvah, sheva
                                     -- brachos, bris, corporate … deliberately
                                     -- not a closed vocabulary
  client_display_name text,          -- overlays bookings.contact_name for
                                     -- operational display; does not replace it
  replaces_id         uuid references public.engagement_profile(id),
  reason              text,
  recorded_by         text not null,
  recorded_at         timestamptz not null default now(),
  seq                 bigint generated always as identity,
  constraint engagement_profile_not_empty check (
    display_name is not null or occasion_kind is not null
      or client_display_name is not null)
);

-- 2.2 · attendance_commitment — covers. THE BITEMPORAL OBJECT.
create table if not exists public.attendance_commitment (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  booking_id       uuid not null references public.bookings(id),
  head_count       integer not null check (head_count >= 0),
  basis            text not null check (basis in
                     ('estimated','contracted','guaranteed','final')),
  effective_moment timestamptz not null,
  replaces_id      uuid references public.attendance_commitment(id),
  reason           text,
  recorded_by      text not null,
  recorded_at      timestamptz not null default now(),
  seq              bigint generated always as identity
);
comment on column public.attendance_commitment.basis is
  'estimated = planning count before contractual commitment; '
  'contracted = count sold in the accepted agreement; '
  'guaranteed = client''s binding operational guarantee; '
  'final = final billable count established under the contract. '
  'Revision is expressed by the append-only supersession chain, never by basis. '
  'Observed attendance (actual) is execution evidence and is NOT in this slice.';

-- 2.3 · engagement_schedule_milestone — the shape of the day.
--       Closed keys so SQL can reason; open label so a licensee may call
--       service_start "the seudah" without a schema change.
--       operating_date is a DATE, not a moment: in a kosher operation the
--       operational day is not midnight-to-midnight (v288a Shabbos reach-back),
--       so the day an event BELONGS TO is a different fact from the hour
--       service begins.
create table if not exists public.engagement_schedule_milestone (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  booking_id    uuid not null references public.bookings(id),
  milestone_key text not null check (milestone_key in (
                  'operating_date','production_start','warehouse_departure',
                  'load_in_start','load_in_end','staff_call','vendor_arrival',
                  'ceremony','cocktail_start','service_start','service_end',
                  'dessert','breakdown_start','breakdown_end','venue_clear',
                  'custom')),
  label         text,
  at_date       date,          -- operating_date only
  at_moment     timestamptz,   -- every other key
  window_end    timestamptz,
  cleared       boolean not null default false,   -- tombstone, never a delete
  replaces_id   uuid references public.engagement_schedule_milestone(id),
  reason        text,
  recorded_by   text not null,
  recorded_at   timestamptz not null default now(),
  seq           bigint generated always as identity,
  -- operating_date carries a date and nothing else
  constraint milestone_operating_date_shape check (
    milestone_key <> 'operating_date'
      or (at_moment is null and window_end is null)),
  -- every other key carries a moment, never a date
  constraint milestone_moment_shape check (
    milestone_key = 'operating_date' or at_date is null),
  -- a custom milestone without a label is unreadable
  constraint milestone_custom_labelled check (
    milestone_key <> 'custom' or cleared or coalesce(trim(label),'') <> ''),
  -- a live milestone must say when; a tombstone must not
  constraint milestone_cleared_shape check (
    (cleared and at_date is null and at_moment is null and window_end is null)
    or (not cleared and (at_date is not null or at_moment is not null))),
  -- windows run forward
  constraint milestone_window_forward check (
    window_end is null or at_moment is null or window_end >= at_moment)
);
comment on table public.engagement_schedule_milestone is
  'Supervision has its own object. A supervision marker on a timeline must be '
  'DERIVED from engagement_supervision, never captured here — dual capture of '
  'the same fact is forbidden.';

-- 2.4 · engagement_supervision — kashrus authority. Compliance-bearing,
--       separate authority: who may move the ceremony must not thereby be able
--       to change who supervises the kitchen.
create table if not exists public.engagement_supervision (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  booking_id      uuid not null references public.bookings(id),
  authority_org   text,
  window_start    timestamptz,
  window_end      timestamptz,
  certificate_ref text,
  contact         text,
  cleared         boolean not null default false,
  replaces_id     uuid references public.engagement_supervision(id),
  reason          text,
  recorded_by     text not null,
  recorded_at     timestamptz not null default now(),
  seq             bigint generated always as identity,
  constraint supervision_cleared_shape check (
    (cleared and authority_org is null and window_start is null
       and window_end is null and certificate_ref is null and contact is null)
    or (not cleared and coalesce(trim(authority_org),'') <> '')),
  constraint supervision_window_forward check (
    window_start is null or window_end is null or window_end >= window_start)
);

create index if not exists idx_eng_profile_booking
  on public.engagement_profile (booking_id, seq desc);
create index if not exists idx_attendance_booking
  on public.attendance_commitment (booking_id, effective_moment desc, seq desc);
create index if not exists idx_milestone_booking
  on public.engagement_schedule_milestone (booking_id, milestone_key, seq desc);
create index if not exists idx_supervision_booking
  on public.engagement_supervision (booking_id, seq desc);

-- ── 3 · APPEND-ONLY GUARDS ──────────────────────────────────────────────────
-- Promise history is a ledger. Correction happens by appending a superseding
-- record with a reason, never by rewriting what was recorded. Pattern follows
-- the RESP_EDIT_REFUSED guard on obligation.

create or replace function public.promise_append_only_guard()
returns trigger language plpgsql as $$
begin
  raise exception 'PROMISE_EDIT_REFUSED: % is append-only; supersede with a new record and a reason',
    tg_table_name;
end $$;

do $$
declare t text;
begin
  foreach t in array array['engagement_profile','attendance_commitment',
                           'engagement_schedule_milestone','engagement_supervision'] loop
    execute format('drop trigger if exists %I_append_only on public.%I', t, t);
    execute format(
      'create trigger %I_append_only before update or delete on public.%I '
      'for each row execute function public.promise_append_only_guard()', t, t);
  end loop;
end $$;

-- ── 4 · RLS ─────────────────────────────────────────────────────────────────
-- Read within tenant; writes arrive through security-definer ceremonies.

do $$
declare t text;
begin
  foreach t in array array['engagement_profile','attendance_commitment',
                           'engagement_schedule_milestone','engagement_supervision'] loop
    execute format('alter table public.%I enable row level security', t);
    begin
      execute format(
        'create policy %I_select on public.%I for select '
        'using (tenant_id = public.current_tenant_id())', t, t);
    exception when duplicate_object then null; end;
    begin
      execute format(
        'create policy %I_insert on public.%I for insert '
        'with check (tenant_id = public.current_tenant_id())', t, t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- ── 5 · TEMPORAL RESOLVERS ──────────────────────────────────────────────────
-- These implement the resolution rule ONCE so that v292b's projection consumes
-- them rather than restating the rule in a second place. They are STABLE reads,
-- not a projection: no envelope, no counts, no scope grammar.

-- 5.1 · profile — uni-temporal
create or replace function public.promise_current_profile(
  p_booking uuid, p_now timestamptz default now())
returns table (id uuid, display_name text, occasion_kind text,
               client_display_name text, recorded_at timestamptz, seq bigint)
language sql stable security definer set search_path = public as $$
  with eligible as (
    select p.* from public.engagement_profile p
     where p.booking_id = p_booking
       and p.tenant_id = public.current_tenant_id()
       and p.recorded_at <= p_now)
  select e.id, e.display_name, e.occasion_kind, e.client_display_name,
         e.recorded_at, e.seq
    from eligible e
   where not exists (select 1 from eligible s where s.replaces_id = e.id)
   order by e.seq desc limit 1;
$$;

-- 5.2 · attendance — BITEMPORAL. Current = live ∧ effective.
create or replace function public.promise_current_attendance(
  p_booking uuid, p_now timestamptz default now())
returns table (id uuid, head_count integer, basis text,
               effective_moment timestamptz, recorded_at timestamptz, seq bigint)
language sql stable security definer set search_path = public as $$
  with eligible as (
    select a.* from public.attendance_commitment a
     where a.booking_id = p_booking
       and a.tenant_id = public.current_tenant_id()
       and a.recorded_at <= p_now),
  live as (
    select e.* from eligible e
     where not exists (select 1 from eligible s where s.replaces_id = e.id))
  select l.id, l.head_count, l.basis, l.effective_moment, l.recorded_at, l.seq
    from live l
   where l.effective_moment <= p_now
   order by l.effective_moment desc, l.seq desc limit 1;
$$;

-- 5.3 · attendance — future-effective, returned SEPARATELY and never as current.
create or replace function public.promise_scheduled_attendance(
  p_booking uuid, p_now timestamptz default now())
returns table (id uuid, head_count integer, basis text,
               effective_moment timestamptz, recorded_at timestamptz, seq bigint)
language sql stable security definer set search_path = public as $$
  with eligible as (
    select a.* from public.attendance_commitment a
     where a.booking_id = p_booking
       and a.tenant_id = public.current_tenant_id()
       and a.recorded_at <= p_now),
  live as (
    select e.* from eligible e
     where not exists (select 1 from eligible s where s.replaces_id = e.id))
  select l.id, l.head_count, l.basis, l.effective_moment, l.recorded_at, l.seq
    from live l
   where l.effective_moment > p_now
   order by l.effective_moment asc, l.seq asc;
$$;

-- 5.4 · milestones — uni-temporal, one live record per key, tombstones excluded
create or replace function public.promise_current_milestones(
  p_booking uuid, p_now timestamptz default now())
returns table (id uuid, milestone_key text, label text, at_date date,
               at_moment timestamptz, window_end timestamptz, seq bigint)
language sql stable security definer set search_path = public as $$
  with eligible as (
    select m.* from public.engagement_schedule_milestone m
     where m.booking_id = p_booking
       and m.tenant_id = public.current_tenant_id()
       and m.recorded_at <= p_now),
  live as (
    select e.* from eligible e
     where not exists (select 1 from eligible s where s.replaces_id = e.id)),
  latest as (
    select distinct on (l.milestone_key, coalesce(l.label,''))
           l.* from live l
     order by l.milestone_key, coalesce(l.label,''), l.seq desc)
  select x.id, x.milestone_key, x.label, x.at_date, x.at_moment, x.window_end, x.seq
    from latest x
   where not x.cleared
   order by coalesce(x.at_moment, x.at_date::timestamptz), x.milestone_key;
$$;

-- 5.5 · supervision — uni-temporal
create or replace function public.promise_current_supervision(
  p_booking uuid, p_now timestamptz default now())
returns table (id uuid, authority_org text, window_start timestamptz,
               window_end timestamptz, certificate_ref text, contact text,
               seq bigint)
language sql stable security definer set search_path = public as $$
  with eligible as (
    select s.* from public.engagement_supervision s
     where s.booking_id = p_booking
       and s.tenant_id = public.current_tenant_id()
       and s.recorded_at <= p_now),
  live as (
    select e.* from eligible e
     where not exists (select 1 from eligible x where x.replaces_id = e.id))
  select l.id, l.authority_org, l.window_start, l.window_end,
         l.certificate_ref, l.contact, l.seq
    from live l
   where not l.cleared
   order by l.seq desc limit 1;
$$;

-- ── 6 · CEREMONIES ──────────────────────────────────────────────────────────
-- Uniform rules, inherited from bind_engagement_venue:
--   · serialise on the engagement root (for update)
--   · append-only; supersede, never rewrite
--   · reason REQUIRED when superseding, optional on first record
--   · identical no-op REFUSED
--   · actor and tenant derived, never parameters
--   · CEREMONY_NOT_FOUND for absent or foreign booking — no existence leak
-- Amendment after release is legal and expected: guest counts change the
-- morning of. These ceremonies do not consult event state.

create or replace function public.set_engagement_profile(
  p_booking uuid, p_display_name text default null,
  p_occasion_kind text default null, p_client_display_name text default null,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_cur record; v_id uuid;
begin
  if not public.can_edit_engagement_profile() then
    raise exception 'PROMISE_NOT_AUTHORIZED: engagement profile';
  end if;
  perform 1 from public.bookings where id = p_booking and tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if coalesce(trim(p_display_name),'') = '' and coalesce(trim(p_occasion_kind),'') = ''
     and coalesce(trim(p_client_display_name),'') = '' then
    raise exception 'PROMISE_EMPTY: a profile record must carry at least one fact';
  end if;

  select * into v_cur from public.promise_current_profile(p_booking, now());
  if found then
    if coalesce(v_cur.display_name,'') is not distinct from coalesce(nullif(trim(p_display_name),''),'')
       and coalesce(v_cur.occasion_kind,'') is not distinct from coalesce(nullif(trim(p_occasion_kind),''),'')
       and coalesce(v_cur.client_display_name,'') is not distinct from coalesce(nullif(trim(p_client_display_name),''),'') then
      raise exception 'PROMISE_UNCHANGED';
    end if;
    if coalesce(trim(p_reason),'') = '' then
      raise exception 'PROMISE_REASON_REQUIRED';
    end if;
  end if;

  insert into public.engagement_profile
      (tenant_id, booking_id, display_name, occasion_kind, client_display_name,
       replaces_id, reason, recorded_by)
    values (v_tenant, p_booking, nullif(trim(p_display_name),''),
            nullif(trim(p_occasion_kind),''), nullif(trim(p_client_display_name),''),
            v_cur.id, nullif(trim(p_reason),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('profile_id', v_id, 'replaced', v_cur.id is not null);
end $$;

create or replace function public.commit_attendance(
  p_booking uuid, p_head_count integer, p_basis text,
  p_effective_moment timestamptz default null, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_cur record; v_id uuid;
        v_eff timestamptz := coalesce(p_effective_moment, now());
begin
  if not public.can_commit_attendance() then
    raise exception 'PROMISE_NOT_AUTHORIZED: attendance is a billable commitment';
  end if;
  perform 1 from public.bookings where id = p_booking and tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if p_head_count is null or p_head_count < 0 then
    raise exception 'ATTENDANCE_INVALID_COUNT';
  end if;
  if p_basis not in ('estimated','contracted','guaranteed','final') then
    raise exception 'ATTENDANCE_INVALID_BASIS: %', p_basis;
  end if;

  -- No-op is judged against the record current AT THE NEW EFFECTIVE MOMENT, not
  -- against today's: re-stating a count for a future moment is meaningful.
  select * into v_cur from public.promise_current_attendance(p_booking, greatest(v_eff, now()));
  if found then
    if v_cur.head_count = p_head_count and v_cur.basis = p_basis then
      raise exception 'PROMISE_UNCHANGED';
    end if;
    if coalesce(trim(p_reason),'') = '' then
      raise exception 'PROMISE_REASON_REQUIRED';
    end if;
  end if;

  insert into public.attendance_commitment
      (tenant_id, booking_id, head_count, basis, effective_moment,
       replaces_id, reason, recorded_by)
    values (v_tenant, p_booking, p_head_count, p_basis, v_eff,
            null,                        -- a new commitment, not a correction
            nullif(trim(p_reason),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('attendance_id', v_id, 'basis', p_basis,
                            'effective_moment', v_eff);
end $$;

-- Correction of a SPECIFIC prior record (a mis-entry), as distinct from a new
-- commitment. This is what replaces_id exists for.
create or replace function public.correct_attendance(
  p_attendance uuid, p_head_count integer, p_basis text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_prior record; v_id uuid;
begin
  if not public.can_commit_attendance() then
    raise exception 'PROMISE_NOT_AUTHORIZED: attendance is a billable commitment';
  end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  select * into v_prior from public.attendance_commitment
    where id = p_attendance and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.bookings where id = v_prior.booking_id and tenant_id = v_tenant for update;
  if exists (select 1 from public.attendance_commitment
              where replaces_id = p_attendance and tenant_id = v_tenant) then
    raise exception 'PROMISE_ALREADY_SUPERSEDED';
  end if;
  if p_basis not in ('estimated','contracted','guaranteed','final') then
    raise exception 'ATTENDANCE_INVALID_BASIS: %', p_basis;
  end if;
  if v_prior.head_count = p_head_count and v_prior.basis = p_basis then
    raise exception 'PROMISE_UNCHANGED';
  end if;

  insert into public.attendance_commitment
      (tenant_id, booking_id, head_count, basis, effective_moment,
       replaces_id, reason, recorded_by)
    values (v_tenant, v_prior.booking_id, p_head_count, p_basis,
            v_prior.effective_moment,    -- a correction inherits effectivity
            p_attendance, trim(p_reason), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('attendance_id', v_id, 'corrected', p_attendance);
end $$;

create or replace function public.set_schedule_milestone(
  p_booking uuid, p_milestone_key text, p_at_date date default null,
  p_at_moment timestamptz default null, p_window_end timestamptz default null,
  p_label text default null, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_cur record; v_id uuid;
begin
  if not public.can_set_schedule() then
    raise exception 'PROMISE_NOT_AUTHORIZED: schedule';
  end if;
  perform 1 from public.bookings where id = p_booking and tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if p_milestone_key = 'supervision_start' then
    raise exception 'MILESTONE_DUAL_CAPTURE: supervision is owned by engagement_supervision';
  end if;
  if p_milestone_key = 'operating_date' then
    if p_at_date is null then raise exception 'MILESTONE_DATE_REQUIRED'; end if;
  elsif p_at_moment is null then
    raise exception 'MILESTONE_MOMENT_REQUIRED';
  end if;

  select * into v_cur from public.engagement_schedule_milestone m
   where m.booking_id = p_booking and m.tenant_id = v_tenant
     and m.milestone_key = p_milestone_key
     and coalesce(m.label,'') = coalesce(nullif(trim(p_label),''),'')
     and not exists (select 1 from public.engagement_schedule_milestone s
                      where s.replaces_id = m.id and s.tenant_id = v_tenant)
   order by m.seq desc limit 1;

  if found then
    if not v_cur.cleared
       and v_cur.at_date is not distinct from p_at_date
       and v_cur.at_moment is not distinct from p_at_moment
       and v_cur.window_end is not distinct from p_window_end then
      raise exception 'PROMISE_UNCHANGED';
    end if;
    if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  end if;

  insert into public.engagement_schedule_milestone
      (tenant_id, booking_id, milestone_key, label, at_date, at_moment,
       window_end, cleared, replaces_id, reason, recorded_by)
    values (v_tenant, p_booking, p_milestone_key, nullif(trim(p_label),''),
            p_at_date, p_at_moment, p_window_end, false,
            v_cur.id, nullif(trim(p_reason),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('milestone_id', v_id, 'key', p_milestone_key,
                            'replaced', v_cur.id is not null);
end $$;

create or replace function public.clear_schedule_milestone(
  p_booking uuid, p_milestone_key text, p_label text default null,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_cur record; v_id uuid;
begin
  if not public.can_set_schedule() then
    raise exception 'PROMISE_NOT_AUTHORIZED: schedule';
  end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  perform 1 from public.bookings where id = p_booking and tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;

  select * into v_cur from public.engagement_schedule_milestone m
   where m.booking_id = p_booking and m.tenant_id = v_tenant
     and m.milestone_key = p_milestone_key
     and coalesce(m.label,'') = coalesce(nullif(trim(p_label),''),'')
     and not exists (select 1 from public.engagement_schedule_milestone s
                      where s.replaces_id = m.id and s.tenant_id = v_tenant)
   order by m.seq desc limit 1;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_cur.cleared then raise exception 'PROMISE_UNCHANGED'; end if;

  insert into public.engagement_schedule_milestone
      (tenant_id, booking_id, milestone_key, label, cleared,
       replaces_id, reason, recorded_by)
    values (v_tenant, p_booking, p_milestone_key, nullif(trim(p_label),''), true,
            v_cur.id, trim(p_reason), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('milestone_id', v_id, 'cleared', true);
end $$;

create or replace function public.bind_supervision(
  p_booking uuid, p_authority_org text, p_window_start timestamptz default null,
  p_window_end timestamptz default null, p_certificate_ref text default null,
  p_contact text default null, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_cur record; v_id uuid;
begin
  if not public.can_bind_supervision() then
    raise exception 'PROMISE_NOT_AUTHORIZED: supervision is compliance-bearing';
  end if;
  perform 1 from public.bookings where id = p_booking and tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if coalesce(trim(p_authority_org),'') = '' then
    raise exception 'SUPERVISION_ORG_REQUIRED';
  end if;

  select * into v_cur from public.promise_current_supervision(p_booking, now());
  if found then
    if v_cur.authority_org is not distinct from trim(p_authority_org)
       and v_cur.window_start is not distinct from p_window_start
       and v_cur.window_end is not distinct from p_window_end
       and coalesce(v_cur.certificate_ref,'') is not distinct from coalesce(nullif(trim(p_certificate_ref),''),'') then
      raise exception 'PROMISE_UNCHANGED';
    end if;
    if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  end if;

  insert into public.engagement_supervision
      (tenant_id, booking_id, authority_org, window_start, window_end,
       certificate_ref, contact, cleared, replaces_id, reason, recorded_by)
    values (v_tenant, p_booking, trim(p_authority_org), p_window_start, p_window_end,
            nullif(trim(p_certificate_ref),''), nullif(trim(p_contact),''), false,
            v_cur.id, nullif(trim(p_reason),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('supervision_id', v_id, 'replaced', v_cur.id is not null);
end $$;

-- ── 7 · GRANTS (authenticated only — SQL_RELEASE_CONVENTIONS Rule 2) ────────
grant select on public.engagement_profile             to authenticated;
grant select on public.attendance_commitment          to authenticated;
grant select on public.engagement_schedule_milestone  to authenticated;
grant select on public.engagement_supervision         to authenticated;

grant execute on function public.can_edit_engagement_profile()               to authenticated;
grant execute on function public.can_commit_attendance()                     to authenticated;
grant execute on function public.can_set_schedule()                          to authenticated;
grant execute on function public.can_bind_supervision()                      to authenticated;
grant execute on function public.promise_current_profile(uuid, timestamptz)      to authenticated;
grant execute on function public.promise_current_attendance(uuid, timestamptz)   to authenticated;
grant execute on function public.promise_scheduled_attendance(uuid, timestamptz) to authenticated;
grant execute on function public.promise_current_milestones(uuid, timestamptz)   to authenticated;
grant execute on function public.promise_current_supervision(uuid, timestamptz)  to authenticated;
grant execute on function public.set_engagement_profile(uuid, text, text, text, text) to authenticated;
grant execute on function public.commit_attendance(uuid, integer, text, timestamptz, text) to authenticated;
grant execute on function public.correct_attendance(uuid, integer, text, text)   to authenticated;
grant execute on function public.set_schedule_milestone(uuid, text, date, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.clear_schedule_milestone(uuid, text, text, text) to authenticated;
grant execute on function public.bind_supervision(uuid, text, timestamptz, timestamptz, text, text, text) to authenticated;
