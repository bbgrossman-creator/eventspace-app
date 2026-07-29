-- ============================================================================
-- v294 — Engagement Preparation Queue
-- File:  supabase/v294_preparation_queue.sql
-- Apply: after v293_work_ceremonies.sql
--
-- THE LENS. The engagement-side view of the promise lifecycle before release.
-- Membership is the frozen ruling, verbatim:
--
--     occurrence_is_active(occurrence, p_now)  AND  NOT has_event
--
-- Not an "undated" queue. The operating date is presentation data — one of the
-- eight completeness facts — and here it is ordering, never membership. Release
-- is the boundary between the two frozen questions; this projection answers
-- "what have we promised that has not yet become work."
--
-- STRICT COMPOSITION (frozen constraint). Every row field is read from
-- projection_occurrence_brief's certified payload. This function does NOT call
-- promise_current_milestones, promise_scheduled_attendance, or any milestone
-- resolver, and must never grow such a call: membership was deliberately ruled
-- onto brief-exposed facts precisely so that supersession and clearing
-- semantics stay the brief's business. The pre-filter below reads one certified
-- predicate and one fact table; nothing is re-derived.
--
-- STABLE: read-only lens; the engine enforces it both ways.
-- ============================================================================

do $preflight$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='projection_occurrence_brief') or
     not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='occurrence_is_active') or
     not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='projection_envelope') then
    raise exception 'V294_PREFLIGHT_FAILED: a required certified function is absent — apply against the live instance';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='projection_preparation_queue') then
    raise exception 'V294_ALREADY_APPLIED';
  end if;
end $preflight$;

create or replace function public.projection_preparation_queue(
  p_now timestamptz default now())
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_tenant uuid := public.current_tenant_id();
  v_rows   jsonb;
  v_total  int;
  v_incomplete int;
  v_undated    int;
begin
  -- Composed rows. One brief per member; every field below is the brief's own.
  with members as (
    -- Membership: the frozen predicate. occurrence_is_active() is the certified
    -- activity predicate (the same one release_occurrence guards with); the
    -- event table carries one row per released occurrence under its certified
    -- (tenant_id, occurrence_ref) uniqueness. Nothing here interprets
    -- milestones, completeness, or lifecycle.
    select o.id
      from public.engagement_occurrence o
     where o.tenant_id = v_tenant
       and public.occurrence_is_active(o.id, p_now)
       and not exists (select 1 from public.event e
                        where e.occurrence_ref = o.id
                          and e.tenant_id = v_tenant)
  ),
  composed as (
    select m.id,
           public.projection_occurrence_brief(m.id, p_now)->'data' as d
      from members m
  ),
  rows_built as (
    select
      jsonb_build_object(
        'occurrence',     d->'identity'->>'occurrence',
        'engagement',     d->'identity'->>'engagement',
        'ordinal',        (d->'identity'->>'ordinal')::int,
        'active',         (d->'identity'->>'active')::boolean,
        'display_name',   d->'identity'->>'display_name',
        'client',         d->'identity'->>'client',
        'client_source',  d->'identity'->>'client_source',
        'operating_date', d->'schedule'->>'operating_date',
        'venue',          d->'venue'->>'name',
        'attendance',     (d->'attendance'->'current'->>'head_count')::int,
        'contracted',     (d->'attendance'->>'contracted')::int,
        'delta',          (d->'attendance'->>'delta')::int,
        'has_event',      (d->>'has_event')::boolean,
        'event',          d->>'event',
        'missing',        coalesce(d->'completeness'->'missing', '[]'::jsonb),
        'missing_count',  jsonb_array_length(coalesce(d->'completeness'->'missing','[]'::jsonb))
      ) as row_j,
      -- ordering inputs, read from the same composed payload
      (d->'schedule'->>'operating_date')::date as ord_date,
      d->'identity'->>'engagement'             as ord_eng,
      (d->'identity'->>'ordinal')::int         as ord_ordinal,
      d->'identity'->>'occurrence'             as ord_occ
    from composed
  )
  select
    coalesce(jsonb_agg(row_j
             -- The declared ordering, frozen: undated first, then chronological,
             -- then the deterministic triple. No recency, no additional joins.
             order by ord_date asc nulls first, ord_eng, ord_ordinal, ord_occ),
             '[]'::jsonb),
    count(*),
    count(*) filter (where (row_j->>'missing_count')::int > 0),
    count(*) filter (where row_j->>'operating_date' is null)
    into v_rows, v_total, v_incomplete, v_undated
  from rows_built;

  return public.projection_envelope(
    'preparation_queue', 1, p_now,
    jsonb_build_object('basis', 'unreleased'),
    jsonb_build_object('occurrences', v_rows),
    jsonb_build_object(
      'total',      v_total,
      'incomplete', v_incomplete,
      'undated',    v_undated));
end $function$;
