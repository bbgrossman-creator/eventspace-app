-- ============================================================================
-- v292d — Operational-Day Occurrence Projection
-- File:   supabase/v292d_occurrences_for_operational_day.sql
-- Apply:  after v292b_occurrence_brief.sql, directly to the live database.
--
-- SQL only. No table, no ceremony, no application change.
-- New object: public.projection_occurrences_for_operational_day(date, timestamptz)
--
-- Architecture (v292d_SPECIFICATION.md, frozen):
--   Projection over projection. projection_occurrence_brief is the sole
--   per-occurrence source. Day membership is pre-filtered on
--   promise_current_milestones — the same resolver the brief uses internally —
--   then each matched brief is narrowed to list grain. No business rule is
--   defined here.
--
-- NOTICE (registered): the operational day composed here is tenant-resolved via
-- operational_day_of/tenant helpers. The Work-side day_sheet functions resolve
-- days by session-TimeZone cast (finding C1). The two lenses do NOT share
-- operational-day semantics until C1 is resolved. Do not claim otherwise.
-- ============================================================================

-- ── Preflight ───────────────────────────────────────────────────────────────
-- This checkout cannot reconstruct the target schema (registered finding), so
-- the migration verifies its dependencies exist in the target before creating
-- anything, and raises with a named list of anything absent.
do $preflight$
declare
  v_missing text[] := '{}';
  r record;
begin
  for r in
    select * from (values
      ('function', 'projection_occurrence_brief'),
      ('function', 'projection_envelope'),
      ('function', 'promise_current_milestones'),
      ('function', 'operational_day_of'),
      ('function', 'tenant_operational_timezone'),
      ('function', 'tenant_operational_day_start_hour'),
      ('function', 'current_tenant_id'),
      ('function', 'occurrence_is_active')
    ) d(kind, name)
  loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = r.name
    ) then
      v_missing := v_missing || (r.kind || ' public.' || r.name);
    end if;
  end loop;

  if to_regclass('public.engagement_occurrence') is null then
    v_missing := v_missing || 'table public.engagement_occurrence';
  end if;

  if array_length(v_missing, 1) is not null then
    raise exception
      'V292D_PREFLIGHT_FAILED: target database is missing % — this checkout is a deployment copy and cannot rebuild the schema; apply against the live instance',
      array_to_string(v_missing, ', ');
  end if;
end $preflight$;

-- Raises on composed-envelope version mismatch. A separate function so the
-- guard is usable inside a SQL expression and testable in isolation (OD-20).
create or replace function public.v292d_version_mismatch(p_name text, p_version text)
returns jsonb
language plpgsql
immutable
as $function$
begin
  raise exception
    'V292D_COMPOSED_VERSION_MISMATCH: expected occurrence_brief v1, found % v%',
    coalesce(p_name, '<null>'), coalesce(p_version, '<null>');
end $function$;

-- ── Projection ──────────────────────────────────────────────────────────────
create or replace function public.projection_occurrences_for_operational_day(
  p_day date        default null,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_tenant uuid := public.current_tenant_id();
  v_tz     text;
  v_hour   int;
  v_day    date;
  v_out    jsonb;
begin
  if v_tenant is null then
    raise exception 'PROJECTION_SCOPE_REQUIRED: tenant';
  end if;

  v_tz   := public.tenant_operational_timezone(v_tenant);
  v_hour := public.tenant_operational_day_start_hour(v_tenant);

  -- The client is forbidden from computing the operational window. When p_day
  -- is null the projection resolves the current operational day itself and
  -- echoes it (with its inputs) in the scope, so the caller can hand the value
  -- to other day-scoped surfaces without deriving it.
  v_day := coalesce(p_day, public.operational_day_of(p_now, v_tz, v_hour));

  with
  -- Membership pre-filter: equality on operating_date, read through the same
  -- resolver the brief uses internally (promise_current_milestones). Ruled: no
  -- reach-back, no forward horizon; undated occurrences match no day.
  day_members as (
    select o.id
      from public.engagement_occurrence o
      cross join lateral (
        select m.at_date
          from public.promise_current_milestones(o.id, p_now) m
         where m.milestone_key = 'operating_date'
      ) d
     where o.tenant_id = v_tenant
       and d.at_date = v_day
  ),
  -- Sole per-occurrence source. One p_now across every composed brief is
  -- load-bearing: it fixes a single evaluation moment for all rows.
  briefs as (
    select dm.id,
           public.projection_occurrence_brief(dm.id, p_now) as b
      from day_members dm
  ),
  -- Version guard: a silent path relocation in a future brief version must
  -- fail loudly, not emit nulls (OD-20).
  checked as (
    select id,
           case
             when b is null then
               null  -- tenant-scope mismatch inside the brief; excluded below
             when b->>'projection' is distinct from 'occurrence_brief'
               or (b->>'version')::int is distinct from 1 then
               public.v292d_version_mismatch(b->>'projection', b->>'version')
             else b
           end as b
      from briefs
  ),
  rows_ as (
    select
      id,
      b,
      (b->'data'->'identity'->>'active')::boolean            as r_active,
      b->'data'->'identity'->>'display_name'                 as r_display_name,
      (b->'data'->'identity'->>'ordinal')::int               as r_ordinal,
      (b->'counts'->>'missing_promise_facts')::int           as r_missing_count
    from checked
    where b is not null
  )
  select public.projection_envelope(
    'occurrences_for_operational_day', 1, p_now,
    jsonb_build_object(
      'day',            v_day,
      'timezone',       v_tz,
      'day_start_hour', v_hour),
    jsonb_build_object(
      'day', v_day,
      'occurrences', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'occurrence',     r.b->'data'->'identity'->'occurrence',
                 'engagement',     r.b->'data'->'identity'->'engagement',
                 'ordinal',        r.b->'data'->'identity'->'ordinal',
                 'active',         r.b->'data'->'identity'->'active',
                 'display_name',   r.b->'data'->'identity'->'display_name',
                 'client',         r.b->'data'->'identity'->'client',
                 'client_source',  r.b->'data'->'identity'->'client_source',
                 'operating_date', r.b->'data'->'schedule'->'operating_date',
                 'venue',          r.b->'data'->'venue'->'name',
                 'attendance',     r.b->'data'->'attendance'->'current'->'head_count',
                 'contracted',     r.b->'data'->'attendance'->'contracted',
                 'delta',          r.b->'data'->'attendance'->'delta',
                 'has_event',      r.b->'data'->'has_event',
                 'event',          r.b->'data'->'event',
                 'missing',        r.b->'data'->'completeness'->'missing',
                 'missing_count',  r.b->'counts'->'missing_promise_facts')
               -- Ordering (frozen §7): cancelled last, then display name with
               -- nulls last, ordinal, id as the total-order guarantee.
               order by (not r.r_active),
                        r.r_display_name nulls last,
                        r.r_ordinal,
                        r.id)
          from rows_ r), '[]'::jsonb)),
    jsonb_build_object(
      -- released/preparing/cancelled partition total exactly; incomplete is
      -- cross-cutting over active rows only and is NOT part of the partition.
      'total',      (select count(*) from rows_),
      'released',   (select count(*) from rows_ r
                      where r.r_active and (r.b->'data'->>'has_event')::boolean),
      'preparing',  (select count(*) from rows_ r
                      where r.r_active and not (r.b->'data'->>'has_event')::boolean),
      'cancelled',  (select count(*) from rows_ r where not r.r_active),
      'incomplete', (select count(*) from rows_ r
                      where r.r_active and r.r_missing_count > 0)))
  into v_out;

  return v_out;
end $function$;
