-- ════════════════════════════════════════════════════════════════════════════
-- v292a1 — ENGAGEMENT OCCURRENCE AND PROMISE CAPTURE RE-ANCHOR
--
-- Corrects the cardinality simplification: one engagement may contain many
-- operational occurrences, each of which may release at most one execution
-- event. A sheva brachos week, wedding weekend or conference stays ONE
-- commercial engagement containing separately operable meals.
--
--   bookings (engagement root)   1 : N   engagement_occurrence
--   engagement_occurrence        0 : 1   event
--   event                        1 : N   obligation
--
-- I-31  (superseded) one event per ENGAGEMENT
-- I-31′ (this slice)  one event per OCCURRENCE
--
-- ── OPENING AN OCCURRENCE IS AN EXPLICIT CEREMONY ───────────────────────────
-- open_occurrence() is the only declared path, and release_occurrence() — the
-- canonical release — NEVER creates one. It takes an occurrence that must
-- already exist.
--
-- One compatibility affordance, confined and visible: the LEGACY shim
-- release_event(p_booking, …) must resolve exactly one occurrence, and six
-- certified proof/race files plus the production action dispatcher
-- (v279_action_dispatch.sql:149) call it against bookings created at runtime
-- with no occurrence. Rather than break certified behaviour or silently fabricate
-- a declaration, the shim opens one and MARKS it: open_basis = 'release_implied'.
-- Every such occurrence is therefore inspectable as "nobody declared this; a
-- release implied it." New code cannot reach this path, because new code calls
-- release_occurrence().
--
-- ── VENUE AND SUPERVISION: SPECIFIC OVER GENERAL, RESOLVED ONCE ─────────────
-- Occurrence binding if present, else the engagement binding. The rule lives in
-- exactly one resolver per fact, and the resolver REPORTS which level answered
-- (source = 'occurrence' | 'engagement') so a surface can say "inherited from
-- the engagement" rather than passing an inherited fact off as a specific one.
-- Nothing is copied at open time: copying would let a later engagement-level
-- rebinding silently disagree with the copy.
--
-- NOT IN THIS SLICE: projection_occurrence_brief, capture UI, Day Sheet, Event
-- Command, resource model, milestone→obligation derivation, a true engagement
-- root (registered separately), typed offer-content structure.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · AUTHORITY ───────────────────────────────────────────────────────────
create or replace function public.can_open_occurrence()
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

-- ── 2 · THE OCCURRENCE ANCHOR ───────────────────────────────────────────────
-- A bare identity row. Every amendable fact lives in an append-only record
-- pointing at it, exactly as event carries no facts of its own.
--
-- `ordinal` is the stable handle, NOT the date: the date is an amendable fact,
-- so it cannot identify the thing whose date it is. "Occurrence 2" survives the
-- brunch moving from Sunday to Monday.
create table if not exists public.engagement_occurrence (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  booking_id uuid not null references public.bookings(id),
  ordinal    integer not null check (ordinal >= 1),
  open_basis text not null default 'declared'
               check (open_basis in ('declared','release_implied')),
  opened_by  text not null,
  opened_at  timestamptz not null default now(),
  constraint occurrence_ordinal_unique unique (tenant_id, booking_id, ordinal)
);

-- Cancellation is a FACT, not a column — state is derived here as everywhere.
create table if not exists public.occurrence_status (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  occurrence_id uuid not null references public.engagement_occurrence(id),
  status        text not null check (status in ('cancelled','reinstated')),
  reason        text not null,
  recorded_by   text not null,
  recorded_at   timestamptz not null default now(),
  seq           bigint generated always as identity
);

-- ── 3 · OCCURRENCE-SCOPED PROMISE FACTS ─────────────────────────────────────

-- 3.1 · occurrence identity. occasion_kind lives HERE, not on the engagement:
--       a wedding weekend is not one occasion — Friday is a Shabbos meal,
--       Sunday is a brunch.
create table if not exists public.occurrence_profile (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  occurrence_id uuid not null references public.engagement_occurrence(id),
  display_name  text,
  occasion_kind text,
  replaces_id   uuid references public.occurrence_profile(id),
  reason        text,
  recorded_by   text not null,
  recorded_at   timestamptz not null default now(),
  seq           bigint generated always as identity,
  constraint occurrence_profile_not_empty check (
    display_name is not null or occasion_kind is not null)
);

-- 3.2 · occurrence venue. Takes precedence over engagement_venue_binding.
create table if not exists public.occurrence_venue_binding (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null,
  occurrence_id          uuid not null references public.engagement_occurrence(id),
  venue_id               uuid not null references public.venue(id),
  venue_name_snapshot    text not null,
  venue_address_snapshot text,
  replaces_id            uuid references public.occurrence_venue_binding(id),
  reason                 text,
  recorded_by            text not null,
  recorded_at            timestamptz not null default now(),
  seq                    bigint generated always as identity
);

-- 3.3 · occurrence supervision. Takes precedence over engagement_supervision.
create table if not exists public.occurrence_supervision (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  occurrence_id   uuid not null references public.engagement_occurrence(id),
  authority_org   text,
  window_start    timestamptz,
  window_end      timestamptz,
  certificate_ref text,
  contact         text,
  cleared         boolean not null default false,
  replaces_id     uuid references public.occurrence_supervision(id),
  reason          text,
  recorded_by     text not null,
  recorded_at     timestamptz not null default now(),
  seq             bigint generated always as identity,
  constraint occ_supervision_cleared_shape check (
    (cleared and authority_org is null and window_start is null
       and window_end is null and certificate_ref is null and contact is null)
    or (not cleared and coalesce(trim(authority_org),'') <> '')),
  constraint occ_supervision_window_forward check (
    window_start is null or window_end is null or window_end >= window_start)
);

-- ── 4 · MIGRATION · DEFAULT OCCURRENCES ─────────────────────────────────────
-- One default occurrence per engagement that has an event OR carries any v292a
-- promise fact. A booking that has sold nothing operational gets none: creating
-- an occurrence for a lost lead would manufacture a happening.
-- Idempotent — CHAIN.txt is replayed to build ec and eczr.
do $$
begin
  insert into public.engagement_occurrence
      (tenant_id, booking_id, ordinal, open_basis, opened_by, opened_at)
  select b.tenant_id, b.id, 1, 'declared', 'v292a1_migration',
         coalesce(e.released_at, b.created_at)
    from public.bookings b
    left join public.event e on e.engagement_ref = b.id and e.tenant_id = b.tenant_id
   where (e.id is not null
          or exists (select 1 from public.attendance_commitment a where a.booking_id = b.id)
          or exists (select 1 from public.engagement_schedule_milestone m where m.booking_id = b.id)
          or exists (select 1 from public.engagement_supervision s where s.booking_id = b.id)
          or exists (select 1 from public.engagement_profile p where p.booking_id = b.id))
     and not exists (select 1 from public.engagement_occurrence o
                      where o.booking_id = b.id and o.tenant_id = b.tenant_id);
end $$;

-- ── 5 · I-31′ · EVENT RE-POINTED AT THE OCCURRENCE ──────────────────────────
alter table public.event
  add column if not exists occurrence_ref uuid references public.engagement_occurrence(id);

update public.event e
   set occurrence_ref = o.id
  from public.engagement_occurrence o
 where o.booking_id = e.engagement_ref
   and o.tenant_id  = e.tenant_id
   and o.ordinal    = 1
   and e.occurrence_ref is null;

do $$
begin
  if exists (select 1 from public.event where occurrence_ref is null) then
    raise exception 'V292A1_MIGRATION_INCOMPLETE: % event(s) without an occurrence',
      (select count(*) from public.event where occurrence_ref is null);
  end if;
  begin
    alter table public.event alter column occurrence_ref set not null;
  exception when others then null; end;
  -- swap the invariant: one event per OCCURRENCE, not per engagement
  begin
    alter table public.event drop constraint if exists event_one_per_engagement;
  exception when others then null; end;
  begin
    alter table public.event
      add constraint event_one_per_occurrence unique (tenant_id, occurrence_ref);
  exception when duplicate_table or duplicate_object then null; end;
end $$;

-- ── 6 · RE-ANCHOR THE v292a FACTS ───────────────────────────────────────────

-- 6.1 · attendance: booking → occurrence. Name unchanged; attendance is still
--       attendance, only its anchor was wrong.
alter table public.attendance_commitment
  add column if not exists occurrence_id uuid references public.engagement_occurrence(id);
update public.attendance_commitment a
   set occurrence_id = o.id
  from public.engagement_occurrence o
 where o.booking_id = a.booking_id and o.tenant_id = a.tenant_id and o.ordinal = 1
   and a.occurrence_id is null;
do $$
begin
  if exists (select 1 from public.attendance_commitment where occurrence_id is null) then
    raise exception 'V292A1_MIGRATION_INCOMPLETE: attendance rows without an occurrence';
  end if;
  begin alter table public.attendance_commitment alter column occurrence_id set not null;
  exception when others then null; end;
  begin alter table public.attendance_commitment drop column if exists booking_id;
  exception when others then null; end;
end $$;

-- 6.2 · milestones: renamed AND re-anchored. The old name asserted a scope that
--       is now wrong, and leaving it would mislead every future reader.
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema='public' and table_name='engagement_schedule_milestone')
     and not exists (select 1 from information_schema.tables
              where table_schema='public' and table_name='occurrence_schedule_milestone') then
    alter table public.engagement_schedule_milestone rename to occurrence_schedule_milestone;
  end if;
end $$;
alter table public.occurrence_schedule_milestone
  add column if not exists occurrence_id uuid references public.engagement_occurrence(id);
update public.occurrence_schedule_milestone m
   set occurrence_id = o.id
  from public.engagement_occurrence o
 where o.booking_id = m.booking_id and o.tenant_id = m.tenant_id and o.ordinal = 1
   and m.occurrence_id is null;
do $$
begin
  if exists (select 1 from public.occurrence_schedule_milestone where occurrence_id is null) then
    raise exception 'V292A1_MIGRATION_INCOMPLETE: milestone rows without an occurrence';
  end if;
  begin alter table public.occurrence_schedule_milestone alter column occurrence_id set not null;
  exception when others then null; end;
  begin alter table public.occurrence_schedule_milestone drop column if exists booking_id;
  exception when others then null; end;
end $$;

-- 6.3 · engagement_profile narrows: occasion_kind moves to the occurrence.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='engagement_profile'
                and column_name='occasion_kind') then
    insert into public.occurrence_profile
        (tenant_id, occurrence_id, occasion_kind, reason, recorded_by, recorded_at)
    select p.tenant_id, o.id, p.occasion_kind, 'v292a1 re-anchor', p.recorded_by, p.recorded_at
      from public.engagement_profile p
      join public.engagement_occurrence o
        on o.booking_id = p.booking_id and o.tenant_id = p.tenant_id and o.ordinal = 1
     where p.occasion_kind is not null
       and not exists (select 1 from public.occurrence_profile q where q.occurrence_id = o.id);
    alter table public.engagement_profile drop constraint if exists engagement_profile_not_empty;
    alter table public.engagement_profile drop column occasion_kind;
    alter table public.engagement_profile add constraint engagement_profile_not_empty
      check (display_name is not null or client_display_name is not null);
  end if;
end $$;

create index if not exists idx_occurrence_booking
  on public.engagement_occurrence (booking_id, ordinal);
create index if not exists idx_occ_status_occurrence
  on public.occurrence_status (occurrence_id, seq desc);
create index if not exists idx_occ_profile_occurrence
  on public.occurrence_profile (occurrence_id, seq desc);
create index if not exists idx_attendance_occurrence
  on public.attendance_commitment (occurrence_id, effective_moment desc, seq desc);
create index if not exists idx_milestone_occurrence
  on public.occurrence_schedule_milestone (occurrence_id, milestone_key, seq desc);
create index if not exists idx_occ_venue_occurrence
  on public.occurrence_venue_binding (occurrence_id, seq desc);
create index if not exists idx_occ_supervision_occurrence
  on public.occurrence_supervision (occurrence_id, seq desc);

-- ── 7 · APPEND-ONLY GUARDS AND RLS ON THE NEW TABLES ────────────────────────
do $$
declare t text;
begin
  foreach t in array array['occurrence_status','occurrence_profile',
                           'occurrence_venue_binding','occurrence_supervision'] loop
    execute format('drop trigger if exists %I_append_only on public.%I', t, t);
    execute format(
      'create trigger %I_append_only before update or delete on public.%I '
      'for each row execute function public.promise_append_only_guard()', t, t);
  end loop;
  -- the occurrence anchor itself is immutable once opened
  execute 'drop trigger if exists engagement_occurrence_append_only on public.engagement_occurrence';
  execute 'create trigger engagement_occurrence_append_only before update or delete '
          'on public.engagement_occurrence for each row '
          'execute function public.promise_append_only_guard()';

  foreach t in array array['engagement_occurrence','occurrence_status','occurrence_profile',
                           'occurrence_venue_binding','occurrence_supervision'] loop
    execute format('alter table public.%I enable row level security', t);
    begin execute format('create policy %I_select on public.%I for select '
      'using (tenant_id = public.current_tenant_id())', t, t);
    exception when duplicate_object then null; end;
    begin execute format('create policy %I_insert on public.%I for insert '
      'with check (tenant_id = public.current_tenant_id())', t, t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- ── 7.5 · DROP THE BOOKING-ANCHORED SIGNATURES ──────────────────────────────
-- `create or replace` cannot rename an input parameter, and these functions'
-- anchor argument changes from p_booking to p_occurrence. Dropping first is
-- required and is also honest: the booking-anchored contract is gone, not
-- quietly overloaded alongside the new one.
drop function if exists public.promise_current_attendance(uuid, timestamptz);
drop function if exists public.promise_scheduled_attendance(uuid, timestamptz);
drop function if exists public.promise_current_milestones(uuid, timestamptz);
drop function if exists public.promise_current_profile(uuid, timestamptz);
drop function if exists public.commit_attendance(uuid, integer, text, timestamptz, text);
drop function if exists public.set_schedule_milestone(uuid, text, date, timestamptz, timestamptz, text, text);
drop function if exists public.clear_schedule_milestone(uuid, text, text, text);
drop function if exists public.set_engagement_profile(uuid, text, text, text, text);

-- ── 8 · RESOLVERS ───────────────────────────────────────────────────────────

-- 8.1 · is the occurrence operationally live?
create or replace function public.occurrence_is_active(
  p_occurrence uuid, p_now timestamptz default now())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select s.status = 'reinstated'
      from public.occurrence_status s
     where s.occurrence_id = p_occurrence
       and s.tenant_id = public.current_tenant_id()
       and s.recorded_at <= p_now
     order by s.seq desc limit 1), true);
$$;

-- 8.2 · the occurrences of an engagement
create or replace function public.engagement_occurrences(
  p_booking uuid, p_now timestamptz default now())
returns table (id uuid, ordinal integer, open_basis text, opened_at timestamptz,
               active boolean, event_ref uuid)
language sql stable security definer set search_path = public as $$
  select o.id, o.ordinal, o.open_basis, o.opened_at,
         public.occurrence_is_active(o.id, p_now),
         (select e.id from public.event e where e.occurrence_ref = o.id)
    from public.engagement_occurrence o
   where o.booking_id = p_booking
     and o.tenant_id = public.current_tenant_id()
     and o.opened_at <= p_now
   order by o.ordinal;
$$;

-- 8.3 · occurrence identity
create or replace function public.promise_current_occurrence_profile(
  p_occurrence uuid, p_now timestamptz default now())
returns table (id uuid, display_name text, occasion_kind text,
               recorded_at timestamptz, seq bigint)
language sql stable security definer set search_path = public as $$
  with eligible as (
    select p.* from public.occurrence_profile p
     where p.occurrence_id = p_occurrence
       and p.tenant_id = public.current_tenant_id()
       and p.recorded_at <= p_now)
  select e.id, e.display_name, e.occasion_kind, e.recorded_at, e.seq
    from eligible e
   where not exists (select 1 from eligible s where s.replaces_id = e.id)
   order by e.seq desc limit 1;
$$;

-- 8.4 · attendance — BITEMPORAL, re-anchored. Rule unchanged from v292a:
--       eligible (recorded_at <= p_now) → live (not superseded within the
--       eligible set) → effective (effective_moment <= p_now) → latest.
create or replace function public.promise_current_attendance(
  p_occurrence uuid, p_now timestamptz default now())
returns table (id uuid, head_count integer, basis text,
               effective_moment timestamptz, recorded_at timestamptz, seq bigint)
language sql stable security definer set search_path = public as $$
  with eligible as (
    select a.* from public.attendance_commitment a
     where a.occurrence_id = p_occurrence
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

create or replace function public.promise_scheduled_attendance(
  p_occurrence uuid, p_now timestamptz default now())
returns table (id uuid, head_count integer, basis text,
               effective_moment timestamptz, recorded_at timestamptz, seq bigint)
language sql stable security definer set search_path = public as $$
  with eligible as (
    select a.* from public.attendance_commitment a
     where a.occurrence_id = p_occurrence
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

create or replace function public.promise_current_milestones(
  p_occurrence uuid, p_now timestamptz default now())
returns table (id uuid, milestone_key text, label text, at_date date,
               at_moment timestamptz, window_end timestamptz, seq bigint)
language sql stable security definer set search_path = public as $$
  with eligible as (
    select m.* from public.occurrence_schedule_milestone m
     where m.occurrence_id = p_occurrence
       and m.tenant_id = public.current_tenant_id()
       and m.recorded_at <= p_now),
  live as (
    select e.* from eligible e
     where not exists (select 1 from eligible s where s.replaces_id = e.id)),
  latest as (
    select distinct on (l.milestone_key, coalesce(l.label,'')) l.*
      from live l order by l.milestone_key, coalesce(l.label,''), l.seq desc)
  select x.id, x.milestone_key, x.label, x.at_date, x.at_moment, x.window_end, x.seq
    from latest x where not x.cleared
   order by coalesce(x.at_moment, x.at_date::timestamptz), x.milestone_key;
$$;

-- 8.5 · venue — SPECIFIC OVER GENERAL, resolved once, source reported.
create or replace function public.occurrence_current_venue(
  p_occurrence uuid, p_now timestamptz default now())
returns table (source text, venue_id uuid, venue_name text, venue_address text,
               binding_id uuid)
language sql stable security definer set search_path = public as $$
  with occ as (
    select 'occurrence'::text as source, v.venue_id, v.venue_name_snapshot,
           v.venue_address_snapshot, v.id, v.seq
      from public.occurrence_venue_binding v
     where v.occurrence_id = p_occurrence
       and v.tenant_id = public.current_tenant_id()
       and v.recorded_at <= p_now
       and not exists (select 1 from public.occurrence_venue_binding s
                        where s.replaces_id = v.id and s.recorded_at <= p_now)
     order by v.seq desc limit 1),
  eng as (
    select 'engagement'::text as source, b.venue_id, b.venue_name_snapshot,
           b.venue_address_snapshot, b.id, b.seq
      from public.engagement_venue_binding b
      join public.engagement_occurrence o on o.booking_id = b.booking_id
     where o.id = p_occurrence
       and b.tenant_id = public.current_tenant_id()
       and not exists (select 1 from public.engagement_venue_binding s
                        where s.replaces_binding_id = b.id)
     order by b.seq desc limit 1)
  select source, venue_id, venue_name_snapshot, venue_address_snapshot, id
    from (select * from occ union all select * from eng) u
   order by case when u.source = 'occurrence' then 0 else 1 end
   limit 1;
$$;

-- 8.6 · supervision — same precedence, same single rule.
create or replace function public.occurrence_current_supervision(
  p_occurrence uuid, p_now timestamptz default now())
returns table (source text, authority_org text, window_start timestamptz,
               window_end timestamptz, certificate_ref text, contact text,
               record_id uuid)
language sql stable security definer set search_path = public as $$
  with occ as (
    select 'occurrence'::text as source, s.authority_org, s.window_start, s.window_end,
           s.certificate_ref, s.contact, s.id, s.seq
      from public.occurrence_supervision s
     where s.occurrence_id = p_occurrence
       and s.tenant_id = public.current_tenant_id()
       and s.recorded_at <= p_now and not s.cleared
       and not exists (select 1 from public.occurrence_supervision x
                        where x.replaces_id = s.id and x.recorded_at <= p_now)
     order by s.seq desc limit 1),
  eng as (
    select 'engagement'::text as source, g.authority_org, g.window_start, g.window_end,
           g.certificate_ref, g.contact, g.id, g.seq
      from public.engagement_supervision g
      join public.engagement_occurrence o on o.booking_id = g.booking_id
     where o.id = p_occurrence
       and g.tenant_id = public.current_tenant_id()
       and g.recorded_at <= p_now and not g.cleared
       and not exists (select 1 from public.engagement_supervision x
                        where x.replaces_id = g.id and x.recorded_at <= p_now)
     order by g.seq desc limit 1)
  select source, authority_org, window_start, window_end, certificate_ref, contact, id
    from (select * from occ union all select * from eng) u
   order by case when u.source = 'occurrence' then 0 else 1 end
   limit 1;
$$;

-- ── 9 · CEREMONIES ──────────────────────────────────────────────────────────

create or replace function public.open_occurrence(
  p_booking uuid, p_display_name text default null,
  p_occasion_kind text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_ord int; v_id uuid;
begin
  if not public.can_open_occurrence() then
    raise exception 'PROMISE_NOT_AUTHORIZED: occurrence';
  end if;
  perform 1 from public.bookings where id = p_booking and tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;

  select coalesce(max(ordinal), 0) + 1 into v_ord
    from public.engagement_occurrence
   where booking_id = p_booking and tenant_id = v_tenant;

  insert into public.engagement_occurrence
      (tenant_id, booking_id, ordinal, open_basis, opened_by)
    values (v_tenant, p_booking, v_ord, 'declared', public.action_actor())
    returning id into v_id;

  if coalesce(trim(p_display_name),'') <> '' or coalesce(trim(p_occasion_kind),'') <> '' then
    insert into public.occurrence_profile
        (tenant_id, occurrence_id, display_name, occasion_kind, recorded_by)
      values (v_tenant, v_id, nullif(trim(p_display_name),''),
              nullif(trim(p_occasion_kind),''), public.action_actor());
  end if;
  return jsonb_build_object('occurrence_id', v_id, 'ordinal', v_ord);
end $$;

create or replace function public.cancel_occurrence(
  p_occurrence uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_book uuid; v_id uuid;
begin
  if not public.can_open_occurrence() then
    raise exception 'PROMISE_NOT_AUTHORIZED: occurrence';
  end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  select booking_id into v_book from public.engagement_occurrence
   where id = p_occurrence and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.bookings where id = v_book and tenant_id = v_tenant for update;
  if exists (select 1 from public.event where occurrence_ref = p_occurrence) then
    raise exception 'OCCURRENCE_RELEASED: cannot cancel an occurrence that has released an event';
  end if;
  if not public.occurrence_is_active(p_occurrence, now()) then
    raise exception 'PROMISE_UNCHANGED';
  end if;
  insert into public.occurrence_status
      (tenant_id, occurrence_id, status, reason, recorded_by)
    values (v_tenant, p_occurrence, 'cancelled', trim(p_reason), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('status_id', v_id, 'cancelled', true);
end $$;

create or replace function public.set_occurrence_profile(
  p_occurrence uuid, p_display_name text default null,
  p_occasion_kind text default null, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_book uuid; v_cur record; v_id uuid;
begin
  if not public.can_edit_engagement_profile() then
    raise exception 'PROMISE_NOT_AUTHORIZED: occurrence profile';
  end if;
  select booking_id into v_book from public.engagement_occurrence
   where id = p_occurrence and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.bookings where id = v_book and tenant_id = v_tenant for update;
  if coalesce(trim(p_display_name),'') = '' and coalesce(trim(p_occasion_kind),'') = '' then
    raise exception 'PROMISE_EMPTY: a profile record must carry at least one fact';
  end if;

  select * into v_cur from public.promise_current_occurrence_profile(p_occurrence, now());
  if found then
    if coalesce(v_cur.display_name,'') is not distinct from coalesce(nullif(trim(p_display_name),''),'')
       and coalesce(v_cur.occasion_kind,'') is not distinct from coalesce(nullif(trim(p_occasion_kind),''),'') then
      raise exception 'PROMISE_UNCHANGED';
    end if;
    if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  end if;

  insert into public.occurrence_profile
      (tenant_id, occurrence_id, display_name, occasion_kind, replaces_id, reason, recorded_by)
    values (v_tenant, p_occurrence, nullif(trim(p_display_name),''),
            nullif(trim(p_occasion_kind),''), v_cur.id,
            nullif(trim(p_reason),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('profile_id', v_id, 'replaced', v_cur.id is not null);
end $$;

create or replace function public.bind_occurrence_venue(
  p_occurrence uuid, p_venue uuid, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_book uuid;
        v_ven record; v_cur record; v_id uuid;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  select booking_id into v_book from public.engagement_occurrence
   where id = p_occurrence and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.bookings where id = v_book and tenant_id = v_tenant for update;
  select * into v_ven from public.venue where id = p_venue and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_ven.redirect_to is not null then raise exception 'VENUE_REDIRECTED'; end if;

  select * into v_cur from public.occurrence_venue_binding v
   where v.occurrence_id = p_occurrence and v.tenant_id = v_tenant
     and not exists (select 1 from public.occurrence_venue_binding s where s.replaces_id = v.id)
   order by v.seq desc limit 1;
  if found and v_cur.venue_id = p_venue then raise exception 'BINDING_UNCHANGED'; end if;
  if found and coalesce(trim(p_reason),'') = '' then raise exception 'BINDING_REASON_REQUIRED'; end if;

  insert into public.occurrence_venue_binding
      (tenant_id, occurrence_id, venue_id, venue_name_snapshot,
       venue_address_snapshot, replaces_id, reason, recorded_by)
    values (v_tenant, p_occurrence, p_venue, v_ven.name, v_ven.address,
            v_cur.id, nullif(trim(p_reason),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('binding_id', v_id, 'replaced', v_cur.id is not null);
end $$;

create or replace function public.bind_occurrence_supervision(
  p_occurrence uuid, p_authority_org text, p_window_start timestamptz default null,
  p_window_end timestamptz default null, p_certificate_ref text default null,
  p_contact text default null, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_book uuid; v_cur record; v_id uuid;
begin
  if not public.can_bind_supervision() then
    raise exception 'PROMISE_NOT_AUTHORIZED: supervision is compliance-bearing';
  end if;
  select booking_id into v_book from public.engagement_occurrence
   where id = p_occurrence and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.bookings where id = v_book and tenant_id = v_tenant for update;
  if coalesce(trim(p_authority_org),'') = '' then raise exception 'SUPERVISION_ORG_REQUIRED'; end if;

  select * into v_cur from public.occurrence_supervision s
   where s.occurrence_id = p_occurrence and s.tenant_id = v_tenant
     and not exists (select 1 from public.occurrence_supervision x where x.replaces_id = s.id)
   order by s.seq desc limit 1;
  if found and not v_cur.cleared
     and v_cur.authority_org is not distinct from trim(p_authority_org)
     and v_cur.window_start is not distinct from p_window_start
     and v_cur.window_end is not distinct from p_window_end then
    raise exception 'PROMISE_UNCHANGED';
  end if;
  if found and coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;

  insert into public.occurrence_supervision
      (tenant_id, occurrence_id, authority_org, window_start, window_end,
       certificate_ref, contact, cleared, replaces_id, reason, recorded_by)
    values (v_tenant, p_occurrence, trim(p_authority_org), p_window_start, p_window_end,
            nullif(trim(p_certificate_ref),''), nullif(trim(p_contact),''), false,
            v_cur.id, nullif(trim(p_reason),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('supervision_id', v_id, 'replaced', v_cur.id is not null);
end $$;

-- 9.x · attendance and milestone ceremonies, re-anchored to the occurrence
create or replace function public.commit_attendance(
  p_occurrence uuid, p_head_count integer, p_basis text,
  p_effective_moment timestamptz default null, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_book uuid; v_cur record; v_id uuid;
        v_eff timestamptz := coalesce(p_effective_moment, now());
begin
  if not public.can_commit_attendance() then
    raise exception 'PROMISE_NOT_AUTHORIZED: attendance is a billable commitment';
  end if;
  select booking_id into v_book from public.engagement_occurrence
   where id = p_occurrence and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.bookings where id = v_book and tenant_id = v_tenant for update;
  if p_head_count is null or p_head_count < 0 then raise exception 'ATTENDANCE_INVALID_COUNT'; end if;
  if p_basis not in ('estimated','contracted','guaranteed','final') then
    raise exception 'ATTENDANCE_INVALID_BASIS: %', p_basis;
  end if;

  select * into v_cur from public.promise_current_attendance(p_occurrence, greatest(v_eff, now()));
  if found then
    if v_cur.head_count = p_head_count and v_cur.basis = p_basis then
      raise exception 'PROMISE_UNCHANGED';
    end if;
    if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  end if;

  insert into public.attendance_commitment
      (tenant_id, occurrence_id, head_count, basis, effective_moment,
       replaces_id, reason, recorded_by)
    values (v_tenant, p_occurrence, p_head_count, p_basis, v_eff, null,
            nullif(trim(p_reason),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('attendance_id', v_id, 'basis', p_basis, 'effective_moment', v_eff);
end $$;

create or replace function public.correct_attendance(
  p_attendance uuid, p_head_count integer, p_basis text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_prior record; v_book uuid; v_id uuid;
begin
  if not public.can_commit_attendance() then
    raise exception 'PROMISE_NOT_AUTHORIZED: attendance is a billable commitment';
  end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  select * into v_prior from public.attendance_commitment
   where id = p_attendance and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  select booking_id into v_book from public.engagement_occurrence where id = v_prior.occurrence_id;
  perform 1 from public.bookings where id = v_book and tenant_id = v_tenant for update;
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
      (tenant_id, occurrence_id, head_count, basis, effective_moment,
       replaces_id, reason, recorded_by)
    values (v_tenant, v_prior.occurrence_id, p_head_count, p_basis,
            v_prior.effective_moment, p_attendance, trim(p_reason), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('attendance_id', v_id, 'corrected', p_attendance);
end $$;

create or replace function public.set_schedule_milestone(
  p_occurrence uuid, p_milestone_key text, p_at_date date default null,
  p_at_moment timestamptz default null, p_window_end timestamptz default null,
  p_label text default null, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_book uuid; v_cur record; v_id uuid;
begin
  if not public.can_set_schedule() then raise exception 'PROMISE_NOT_AUTHORIZED: schedule'; end if;
  select booking_id into v_book from public.engagement_occurrence
   where id = p_occurrence and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.bookings where id = v_book and tenant_id = v_tenant for update;
  if p_milestone_key = 'supervision_start' then
    raise exception 'MILESTONE_DUAL_CAPTURE: supervision is owned by occurrence_supervision';
  end if;
  if p_milestone_key = 'operating_date' then
    if p_at_date is null then raise exception 'MILESTONE_DATE_REQUIRED'; end if;
  elsif p_at_moment is null then
    raise exception 'MILESTONE_MOMENT_REQUIRED';
  end if;

  select * into v_cur from public.occurrence_schedule_milestone m
   where m.occurrence_id = p_occurrence and m.tenant_id = v_tenant
     and m.milestone_key = p_milestone_key
     and coalesce(m.label,'') = coalesce(nullif(trim(p_label),''),'')
     and not exists (select 1 from public.occurrence_schedule_milestone s
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

  insert into public.occurrence_schedule_milestone
      (tenant_id, occurrence_id, milestone_key, label, at_date, at_moment,
       window_end, cleared, replaces_id, reason, recorded_by)
    values (v_tenant, p_occurrence, p_milestone_key, nullif(trim(p_label),''),
            p_at_date, p_at_moment, p_window_end, false,
            v_cur.id, nullif(trim(p_reason),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('milestone_id', v_id, 'key', p_milestone_key,
                            'replaced', v_cur.id is not null);
end $$;

create or replace function public.clear_schedule_milestone(
  p_occurrence uuid, p_milestone_key text, p_label text default null,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_book uuid; v_cur record; v_id uuid;
begin
  if not public.can_set_schedule() then raise exception 'PROMISE_NOT_AUTHORIZED: schedule'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  select booking_id into v_book from public.engagement_occurrence
   where id = p_occurrence and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.bookings where id = v_book and tenant_id = v_tenant for update;

  select * into v_cur from public.occurrence_schedule_milestone m
   where m.occurrence_id = p_occurrence and m.tenant_id = v_tenant
     and m.milestone_key = p_milestone_key
     and coalesce(m.label,'') = coalesce(nullif(trim(p_label),''),'')
     and not exists (select 1 from public.occurrence_schedule_milestone s
                      where s.replaces_id = m.id and s.tenant_id = v_tenant)
   order by m.seq desc limit 1;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_cur.cleared then raise exception 'PROMISE_UNCHANGED'; end if;

  insert into public.occurrence_schedule_milestone
      (tenant_id, occurrence_id, milestone_key, label, cleared,
       replaces_id, reason, recorded_by)
    values (v_tenant, p_occurrence, p_milestone_key, nullif(trim(p_label),''), true,
            v_cur.id, trim(p_reason), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('milestone_id', v_id, 'cleared', true);
end $$;

-- engagement-level identity, narrowed: client and engagement name only
create or replace function public.promise_current_engagement_profile(
  p_booking uuid, p_now timestamptz default now())
returns table (id uuid, display_name text, client_display_name text,
               recorded_at timestamptz, seq bigint)
language sql stable security definer set search_path = public as $$
  with eligible as (
    select p.* from public.engagement_profile p
     where p.booking_id = p_booking
       and p.tenant_id = public.current_tenant_id()
       and p.recorded_at <= p_now)
  select e.id, e.display_name, e.client_display_name, e.recorded_at, e.seq
    from eligible e
   where not exists (select 1 from eligible s where s.replaces_id = e.id)
   order by e.seq desc limit 1;
$$;

create or replace function public.set_engagement_profile(
  p_booking uuid, p_display_name text default null,
  p_client_display_name text default null, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_cur record; v_id uuid;
begin
  if not public.can_edit_engagement_profile() then
    raise exception 'PROMISE_NOT_AUTHORIZED: engagement profile';
  end if;
  perform 1 from public.bookings where id = p_booking and tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if coalesce(trim(p_display_name),'') = '' and coalesce(trim(p_client_display_name),'') = '' then
    raise exception 'PROMISE_EMPTY: a profile record must carry at least one fact';
  end if;
  select * into v_cur from public.promise_current_engagement_profile(p_booking, now());
  if found then
    if coalesce(v_cur.display_name,'') is not distinct from coalesce(nullif(trim(p_display_name),''),'')
       and coalesce(v_cur.client_display_name,'') is not distinct from coalesce(nullif(trim(p_client_display_name),''),'') then
      raise exception 'PROMISE_UNCHANGED';
    end if;
    if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  end if;
  insert into public.engagement_profile
      (tenant_id, booking_id, display_name, client_display_name,
       replaces_id, reason, recorded_by)
    values (v_tenant, p_booking, nullif(trim(p_display_name),''),
            nullif(trim(p_client_display_name),''), v_cur.id,
            nullif(trim(p_reason),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('profile_id', v_id, 'replaced', v_cur.id is not null);
end $$;

-- ── 10 · RELEASE ────────────────────────────────────────────────────────────
-- release_occurrence is canonical and NEVER creates an occurrence.
-- Serialisation moves from the booking to the OCCURRENCE, so two meals of one
-- wedding weekend are releasable concurrently; locking the booking would
-- serialise the whole weekend behind Friday dinner.
create or replace function public.release_occurrence(
  p_occurrence   uuid,
  p_actor        text,
  p_signoff_ref  text default null,
  p_clearance_ref text default null,
  p_waiver_ref   text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_occ record; v_acc uuid; v_event uuid; v_gen integer;
begin
  select * into v_occ from public.engagement_occurrence
   where id = p_occurrence and tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if not public.occurrence_is_active(p_occurrence, now()) then
    raise exception 'OCCURRENCE_CANCELLED';
  end if;

  -- PREDICATE (default-deny, layered) over IMMUTABLE facts — unchanged from v275
  select a.id into v_acc
    from public.offer_acceptances a
    left join public.acceptance_rescissions r on r.acceptance_id = a.id
   where a.booking_id = v_occ.booking_id and a.tenant_id = v_tenant and r.id is null
   order by a.created_at limit 1;
  if not found then
    raise exception 'RELEASE_PREDICATE_UNSATISFIED: commitment (no unrescinded acceptance)';
  end if;
  if p_clearance_ref is null and p_waiver_ref is null then
    raise exception 'RELEASE_PREDICATE_UNSATISFIED: clearance (no deposit/credit/waiver evidence)';
  end if;
  if p_signoff_ref is null then
    raise exception 'RELEASE_PREDICATE_UNSATISFIED: sign_off (no operator release attestation)';
  end if;

  -- MATERIALIZE the event exactly once per OCCURRENCE (I-31′)
  insert into public.event (tenant_id, engagement_ref, occurrence_ref,
                            origin_commitment_ref, released_by)
    values (v_tenant, v_occ.booking_id, p_occurrence, v_acc, p_actor)
    on conflict (tenant_id, occurrence_ref) do nothing
    returning id into v_event;
  if v_event is null then raise exception 'RELEASE_ALREADY_RELEASED'; end if;

  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_event, 'released', p_actor, jsonb_build_object('acceptance', v_acc));
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_event, 'sign_off', p_actor, jsonb_build_object('signoff_ref', p_signoff_ref));
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_event, 'clearance', p_actor,
            case when p_waiver_ref is not null
                 then jsonb_build_object('waiver_ref', p_waiver_ref)
                 else jsonb_build_object('clearance_ref', p_clearance_ref) end);

  v_gen := public.generate_obligations(v_event);
  return jsonb_build_object('event_id', v_event, 'occurrence_id', p_occurrence,
                            'generated_count', v_gen);
end $$;

-- LEGACY shim. Exact v275 signature, exact v275 refusals. The only path that may
-- imply an occurrence, and it marks what it did.
create or replace function public.release_event(
  p_booking      uuid,
  p_actor        text,
  p_signoff_ref  text default null,
  p_clearance_ref text default null,
  p_waiver_ref   text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id(); v_occ uuid; v_n int; v_ord int;
begin
  perform 1 from public.bookings where id = p_booking and tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;

  select count(*) into v_n from public.engagement_occurrence
   where booking_id = p_booking and tenant_id = v_tenant;

  if v_n > 1 then
    raise exception 'RELEASE_OCCURRENCE_AMBIGUOUS: engagement holds % occurrences (%); call release_occurrence',
      v_n, (select string_agg(ordinal::text, ',' order by ordinal)
              from public.engagement_occurrence
             where booking_id = p_booking and tenant_id = v_tenant);
  elsif v_n = 1 then
    select id into v_occ from public.engagement_occurrence
     where booking_id = p_booking and tenant_id = v_tenant;
  else
    -- COMPATIBILITY AFFORDANCE, marked and inspectable. Nobody declared this
    -- occurrence; a legacy release implied it.
    select coalesce(max(ordinal), 0) + 1 into v_ord from public.engagement_occurrence
     where booking_id = p_booking and tenant_id = v_tenant;
    insert into public.engagement_occurrence
        (tenant_id, booking_id, ordinal, open_basis, opened_by)
      values (v_tenant, p_booking, v_ord, 'release_implied', p_actor)
      returning id into v_occ;
  end if;

  return public.release_occurrence(v_occ, p_actor, p_signoff_ref, p_clearance_ref, p_waiver_ref);
end $$;

-- ── 11 · GRANTS ─────────────────────────────────────────────────────────────
grant select on public.engagement_occurrence        to authenticated;
grant select on public.occurrence_status            to authenticated;
grant select on public.occurrence_profile           to authenticated;
grant select on public.occurrence_venue_binding     to authenticated;
grant select on public.occurrence_supervision       to authenticated;
grant select on public.occurrence_schedule_milestone to authenticated;

grant execute on function public.can_open_occurrence()                                to authenticated;
grant execute on function public.occurrence_is_active(uuid, timestamptz)               to authenticated;
grant execute on function public.engagement_occurrences(uuid, timestamptz)             to authenticated;
grant execute on function public.promise_current_occurrence_profile(uuid, timestamptz) to authenticated;
grant execute on function public.promise_current_engagement_profile(uuid, timestamptz) to authenticated;
grant execute on function public.occurrence_current_venue(uuid, timestamptz)           to authenticated;
grant execute on function public.occurrence_current_supervision(uuid, timestamptz)     to authenticated;
grant execute on function public.open_occurrence(uuid, text, text)                     to authenticated;
grant execute on function public.cancel_occurrence(uuid, text)                         to authenticated;
grant execute on function public.set_occurrence_profile(uuid, text, text, text)        to authenticated;
grant execute on function public.bind_occurrence_venue(uuid, uuid, text)               to authenticated;
grant execute on function public.bind_occurrence_supervision(uuid, text, timestamptz, timestamptz, text, text, text) to authenticated;
grant execute on function public.set_engagement_profile(uuid, text, text, text)        to authenticated;
grant execute on function public.release_occurrence(uuid, text, text, text, text)      to authenticated;
