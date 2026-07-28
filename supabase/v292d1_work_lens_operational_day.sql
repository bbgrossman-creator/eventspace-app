-- ============================================================================
-- v292d1 — Work-Lens Operational Day Correction
-- File:  supabase/v292d1_work_lens_operational_day.sql
-- Apply: after v292d_occurrences_for_operational_day.sql
--
-- Brings projection_day_sheet under the tenant operational calendar already
-- used by the Promise lens. Composition only — no new helper, no new semantics.
--
-- The behavioral change is confined to one function. Tenant-calendar resolution
-- is added and the two existing window-boundary expressions are replaced.
-- Everything from `v_out := (` onward is unchanged from the deployed definition.
--
-- BEFORE (session-TimeZone dependent, tenant-calendar blind):
--   'from', (p_day::timestamptz)::text
--   'to',   ((p_day + 1)::timestamptz - interval '1 microsecond')::text
--
-- AFTER (tenant local wall-time anchored):
--   'from', operational_day_start(p_day,     v_tz, v_hour)
--   'to',   operational_day_start(p_day + 1, v_tz, v_hour) - interval '1 microsecond'
--
-- The upper bound is the NEXT OPERATIONAL DAY minus one microsecond, never the
-- lower bound plus 24 hours: across a DST transition the operational day spans
-- 23 or 25 hours and the next-day boundary is the only correct expression.
--
-- NOT changed: responsibility_feed, risk_findings, day_sheet, the closed filter
-- grammar, tenant defaults, or operational-day semantics.
--
-- NOTE (registered, not fixed): the window values remain serialised with
-- ::text, and timestamptz::text renders in the session TimeZone. After this
-- correction the same absolute instant still PRINTS differently across
-- sessions. That is expected. Proofs must compare parsed instants, never raw
-- scope strings.
-- ============================================================================

-- ── Preflight ───────────────────────────────────────────────────────────────
do $preflight$
declare
  v_missing text[] := '{}';
  r record;
  v_def text;
begin
  for r in
    select * from (values
      ('operational_day_start'),
      ('tenant_operational_timezone'),
      ('tenant_operational_day_start_hour'),
      ('current_tenant_id'),
      ('responsibility_feed'),
      ('risk_findings'),
      ('projection_envelope'),
      ('projection_group_key'),
      ('validate_projection_group_by')
    ) d(name)
  loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = r.name
    ) then
      v_missing := v_missing || ('function public.' || r.name);
    end if;
  end loop;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'projection_day_sheet'
     and p.proargtypes = '1082 25 1184'::oidvector;

  if v_def is null then
    v_missing := v_missing
      || 'function public.projection_day_sheet(date, text, timestamptz)';
  end if;

  if array_length(v_missing, 1) is not null then
    raise exception
      'V292D1_PREFLIGHT_FAILED: target is missing % — apply against the live instance, not a database rebuilt from the deployment checkout',
      array_to_string(v_missing, ', ');
  end if;

  -- Idempotence guard: refuse to reapply over an already-corrected function,
  -- so a second run cannot be mistaken for a fresh certified apply.
  if v_def ~ 'operational_day_start' then
    raise exception
      'V292D1_ALREADY_APPLIED: projection_day_sheet already composes operational_day_start';
  end if;

  if v_def !~ 'p_day::timestamptz' then
    raise exception
      'V292D1_UNEXPECTED_BASELINE: projection_day_sheet does not contain the expected bare cast; inspect before applying';
  end if;
end $preflight$;

-- ── Correction ──────────────────────────────────────────────────────────────
-- CREATE OR REPLACE against the existing function: the OID and every dependent
-- object are preserved. This is the shape the proof runner models.
create or replace function public.projection_day_sheet(
  p_day date,
  p_group_by text default 'department'::text,
  p_now timestamp with time zone default now())
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_scope  jsonb;
  v_g      text := public.validate_projection_group_by(p_group_by);
  v_out    jsonb;
  -- v292d1: tenant operational calendar resolution. Same pattern
  -- canonical_operational_window uses; current_tenant_id() is a new dependency
  -- edge for this function and is registered as such.
  v_tenant uuid := public.current_tenant_id();
  v_tz     text := public.tenant_operational_timezone(v_tenant);
  v_hour   int  := public.tenant_operational_day_start_hour(v_tenant);
begin
  -- v292d1: window anchored to the tenant operational day, not session midnight.
  v_scope := jsonb_build_object('window', jsonb_build_object(
               'from', (public.operational_day_start(p_day, v_tz, v_hour))::text,
               'to',   (public.operational_day_start(p_day + 1, v_tz, v_hour)
                        - interval '1 microsecond')::text));
  v_out := (
    with f as (select * from public.responsibility_feed(v_scope, p_now)),
         r as (select * from public.risk_findings(v_scope, p_now)),
         g as (select public.projection_group_key(v_g, f.department, f.event_ref, f.state,
                                                  f.owner, f.resource_role) gk,
                      f.responsibility, f.ordering_key from f)
    select public.projection_envelope(
      'day_sheet', 1, p_now, v_scope,
      jsonb_build_object(
        'day', p_day,
        'group_by', v_g,
        'responsibilities', coalesce((select jsonb_agg(to_jsonb(f) order by f.ordering_key) from f),'[]'::jsonb),
        'groups', coalesce((select jsonb_agg(jsonb_build_object('key', x.gk, 'members', x.ids)
                                             order by x.gk)
                              from (select g.gk, jsonb_agg(g.responsibility order by g.ordering_key) ids
                                      from g group by g.gk) x),'[]'::jsonb),
        'risk', coalesce((select jsonb_agg(to_jsonb(r)) from r),'[]'::jsonb)),
      jsonb_build_object(
        'total',     (select count(*) from f),
        'ownerless', (select count(*) from f where f.owner is null),
        'at_risk',   (select count(distinct r.responsibility) from r where r.responsibility is not null),
        'by_state',  coalesce((select jsonb_object_agg(s.state, s.c)
                                 from (select f.state, count(*) c from f group by f.state) s),'{}'::jsonb))));
  return v_out;
end $function$;
