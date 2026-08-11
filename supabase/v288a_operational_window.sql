-- ════════════════════════════════════════════════════════════════════════════
-- v288a — SQL-OWNED CANONICAL OPERATIONAL WINDOW
--
-- Registered correction from v288: the Changed band was empty because
-- projection_operations_today had no SQL-side default for p_since, and both
-- alternatives (persisting a last-viewed marker; deriving a window in React)
-- were forbidden. The window is therefore given to the PROJECTION, which owns
-- it, derives it from the tenant's operational day and the envelope's own
-- as_of, and never stores anything.
--
-- BINDING CONSTRAINTS HONOURED
--   · No persistence. No last-viewed table, column, or write of any kind.
--   · No client-derived time. Callers still send nothing; SQL resolves it.
--   · Envelope shape frozen — the resolved window rides in the existing
--     data.since field. No new top-level field.
--   · Filter grammar frozen — no new keys.
--   · Composition law intact: scope stays {} and contents still equal
--     responsibility_feed(scope, as_of). Changed is a BAND over the same
--     membership, never a membership filter.
--
-- The two configuration columns added below are CONFIGURATION, not state:
-- they describe how a tenant's day is shaped, are nullable with documented
-- defaults, and are never written by a projection.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · TENANT OPERATIONAL CONFIGURATION (additive, nullable) ───────────────
alter table public.tenants add column if not exists operational_timezone text;
alter table public.tenants add column if not exists operational_day_start_hour int;

comment on column public.tenants.operational_timezone is
  'IANA zone defining this tenant''s operating day. NULL ⇒ the documented '
  'default (America/New_York — EventCore''s first domain). Configuration only.';
comment on column public.tenants.operational_day_start_hour is
  'Local hour at which the operating day begins (0–23). NULL ⇒ 0. A caterer '
  'finishing at 01:00 may set 4 so the small hours belong to the prior day.';

-- ── 1a · VALIDATION AT THE DATABASE BOUNDARY ───────────────────────────────
-- Operating configuration is read on EVERY Operations Today render, so an
-- invalid value is not a cosmetic problem: an unrecognised timezone makes
-- timezone() raise inside canonical_operational_window(), which would take the
-- production surface down for that tenant at READ time — long after the typo.
-- Validation is therefore enforced where it is cheapest to fix (the write) and
-- again where it is most costly to fail (the read).

-- (i) Range: the start hour is a clock hour or nothing at all.
alter table public.tenants drop constraint if exists tenants_operational_day_start_hour_check;
alter table public.tenants add constraint tenants_operational_day_start_hour_check
  check (operational_day_start_hour is null
         or (operational_day_start_hour >= 0 and operational_day_start_hour <= 23));

-- (ii) Timezone: refuse anything Postgres cannot actually resolve. This must be
-- a trigger, not a CHECK: pg_timezone_names is a catalogue view, so it is not
-- legal inside a check constraint.
create or replace function public.tenants_operational_config_guard()
returns trigger language plpgsql as $$
begin
  if new.operational_timezone is not null then
    if btrim(new.operational_timezone) = '' then
      raise exception 'TENANT_TIMEZONE_INVALID: operational_timezone may not be blank; leave it NULL to use the default';
    end if;
    if not exists (select 1 from pg_timezone_names z where z.name = new.operational_timezone) then
      raise exception 'TENANT_TIMEZONE_INVALID: % is not a time zone this database can resolve', new.operational_timezone;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tenants_operational_config on public.tenants;
create trigger tenants_operational_config
  before insert or update on public.tenants
  for each row execute function public.tenants_operational_config_guard();

-- (iii) Read-time fallback (defence in depth). Even a value that predates these
-- guards, or one written by a superuser path that bypasses them, must never be
-- able to break a projection: an unusable setting silently resolves to the
-- documented default instead of raising.
create or replace function public.tenant_operational_timezone(p_tenant uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select t.operational_timezone
       from public.tenants t
      where t.id = p_tenant
        and t.operational_timezone is not null
        and exists (select 1 from pg_timezone_names z where z.name = t.operational_timezone)),
    'America/New_York');
$$;

create or replace function public.tenant_operational_day_start_hour(p_tenant uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(
    (select t.operational_day_start_hour
       from public.tenants t
      where t.id = p_tenant
        and t.operational_day_start_hour between 0 and 23),
    0);
$$;

-- ── 2 · BLACKOUT DAYS (Shabbos) ────────────────────────────────────────────
-- RULING: Shabbos is an operational blackout, not a short day. Saturday in the
-- tenant's own timezone carries no operational work. Sunset precision is
-- deliberately NOT modelled: it would make the window depend on astronomical
-- data for a value whose only job is to bound a "what changed" read, and a
-- whole-day blackout is the conservative direction (it widens the window
-- rather than hiding change).
create or replace function public.is_blackout_day(p_day date)
returns boolean language sql immutable as $$
  select extract(isodow from p_day) = 6;   -- ISO 6 = Saturday
$$;

-- ── 3 · THE OPERATING DAY ──────────────────────────────────────────────────
-- Start of the operating day identified by a local date.
create or replace function public.operational_day_start(p_day date, p_tz text, p_hour int)
returns timestamptz language sql stable as $$
  select timezone(p_tz, (p_day::timestamp + make_interval(hours => p_hour)));
$$;

-- The local operating date containing an instant (respecting the start hour:
-- with a start hour of 4, local 02:00 still belongs to the previous day).
create or replace function public.operational_day_of(p_at timestamptz, p_tz text, p_hour int)
returns date language sql stable as $$
  select case when extract(hour from timezone(p_tz, p_at)) < p_hour
              then (timezone(p_tz, p_at))::date - 1
              else (timezone(p_tz, p_at))::date end;
$$;

-- ── 4 · THE CANONICAL OPERATIONAL WINDOW ───────────────────────────────────
-- RULING: the window begins at the start of the current operating day; when a
-- blackout intervenes, it reaches back ACROSS the blackout to the start of the
-- last day on which work actually happened.
--
--   Monday          → Monday 00:00        (previous day was an operating day)
--   Sunday          → FRIDAY 00:00        (crosses Shabbos; Friday is the last
--                                          day work happened, so Sunday morning
--                                          shows what changed since Friday)
--   Saturday        → FRIDAY 00:00        (inside the blackout, the operating
--                                          context is still Friday)
--
-- Without the reach-back, a Sunday console would silently omit everything that
-- changed on Friday — the single most likely day for late changes before a
-- Sunday event. That omission is precisely the failure the Changed band exists
-- to prevent.
create or replace function public.canonical_operational_window(p_at timestamptz default now())
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_tz     text := public.tenant_operational_timezone(v_tenant);
  v_hour   int  := public.tenant_operational_day_start_hour(v_tenant);
  d        date := public.operational_day_of(p_at, v_tz, v_hour);
  guard    int  := 0;
begin
  if public.is_blackout_day(d) then
    -- inside a blackout: fall back to the last operating day
    while public.is_blackout_day(d) and guard < 14 loop
      d := d - 1; guard := guard + 1;
    end loop;
  elsif public.is_blackout_day(d - 1) then
    -- preceded by a blackout: reach back across it to the last operating day
    d := d - 1;
    while public.is_blackout_day(d) and guard < 14 loop
      d := d - 1; guard := guard + 1;
    end loop;
  end if;
  return public.operational_day_start(d, v_tz, v_hour);
end $$;

-- ── 5 · OPERATIONS TODAY, with the window resolved in SQL ──────────────────
-- RULING on the meaning of CHANGED: a responsibility is "changed" when it
-- APPEARED or was WITHDRAWN within the window — that is, derived since the
-- window opened, or superseded since it opened.
--
-- Rationale: Changed answers "what moved while I wasn't looking", and the
-- operationally dangerous half is work that vanished — a pull you believed you
-- had, superseded by an amendment. Discharge is deliberately EXCLUDED: it
-- alters whether something is done, not what is owed, and the state column
-- already reports it in every other band. Including discharge would make
-- Changed approximate "everything that happened today" on a busy day, which
-- is not a signal.
create or replace function public.projection_operations_today(
  p_viewer text default null,
  p_since  timestamptz default null,
  p_now    timestamptz default now()
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_scope jsonb := '{}'::jsonb;
  v_since timestamptz;
  v_out   jsonb;
begin
  -- The projection owns the window. A caller may still pass an explicit
  -- p_since (the proofs do, to pin a boundary), but nothing needs to: absent
  -- one, the canonical operational window is resolved here, from the tenant's
  -- operating day and this envelope's own as_of. Nothing is read from or
  -- written to storage.
  v_since := coalesce(p_since, public.canonical_operational_window(p_now));

  v_out := (
    with f as (select * from public.responsibility_feed(v_scope, p_now)),
         r as (select * from public.risk_findings(v_scope, p_now)),
         ids as (select coalesce(jsonb_agg(to_jsonb(f) order by f.ordering_key),'[]'::jsonb) d,
                        count(*) n from f),
         -- CHANGED = appeared since the window, or withdrawn since the window
         chg as (
           select f.responsibility, f.ordering_key
             from f join public.obligation o on o.id = f.responsibility
            where o.created_at >= v_since
               or exists (select 1 from public.execution_evidence e
                           where e.obligation_ref = o.id
                             and e.kind = 'superseded'
                             and e.moment >= v_since)
         )
    select public.projection_envelope(
      'operations_today', 1, p_now, v_scope,
      jsonb_build_object(
        'viewer', p_viewer,
        'since',  v_since,
        'responsibilities', (select d from ids),
        'bands', jsonb_build_object(
          'mine',      coalesce((select jsonb_agg(f.responsibility order by f.ordering_key)
                                   from f where p_viewer is not null and f.owner = p_viewer),'[]'::jsonb),
          'ownerless', coalesce((select jsonb_agg(f.responsibility order by f.ordering_key)
                                   from f where f.owner is null),'[]'::jsonb),
          'at_risk',   coalesce((select jsonb_agg(distinct r.responsibility)
                                   from r where r.responsibility is not null),'[]'::jsonb),
          'changed',   coalesce((select jsonb_agg(chg.responsibility order by chg.ordering_key)
                                   from chg),'[]'::jsonb)),
        'events_today', coalesce((select jsonb_agg(distinct f.event_ref)
                                    from f where f.event_ref is not null),'[]'::jsonb),
        'risk', coalesce((select jsonb_agg(to_jsonb(r)) from r),'[]'::jsonb)),
      jsonb_build_object(
        'total',     (select n from ids),
        'mine',      (select count(*) from f where p_viewer is not null and f.owner = p_viewer),
        'ownerless', (select count(*) from f where f.owner is null),
        'at_risk',   (select count(distinct r.responsibility) from r where r.responsibility is not null),
        'changed',   (select count(*) from chg),
        'by_state',  coalesce((select jsonb_object_agg(s.state, s.c)
                                 from (select f.state, count(*) c from f group by f.state) s),'{}'::jsonb))));
  return v_out;
end $$;

-- ── 6 · GRANTS (authenticated only) ────────────────────────────────────────
grant execute on function public.tenant_operational_timezone(uuid) to authenticated;
grant execute on function public.tenants_operational_config_guard() to authenticated;
grant execute on function public.tenant_operational_day_start_hour(uuid) to authenticated;
grant execute on function public.is_blackout_day(date) to authenticated;
grant execute on function public.operational_day_start(date, text, int) to authenticated;
grant execute on function public.operational_day_of(timestamptz, text, int) to authenticated;
grant execute on function public.canonical_operational_window(timestamptz) to authenticated;
grant execute on function public.projection_operations_today(text, timestamptz, timestamptz) to authenticated;
