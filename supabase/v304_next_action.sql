-- ============================================================================
-- v304 · CANONICAL NEXT ACTION  (F-6)
--
-- Realises Operational Constitution Freeze F-6 as a selection over the grounds
-- occurrence_readiness already carries. Strictly additive: it retires nothing,
-- modifies no existing function, migrates no consumer, and stores nothing.
--
-- Governing:
--   F-6            one action, carrying the ground that selected it; never a
--                  list; authors no truth; unactionable grounds excluded
--   A9 doctrine    the ruled priority order, stated here in exactly ONE place
--   F-5            impeding outranks non-impeding; total and strict; readiness
--                  verdicts byte-identical before and after
--   PC-7.4         exactly one next action
--   PC-9.12        never stored as a fact; derived and re-derivable
--   PC-9.7         decomposes to the ground that produced it
--   E-III.2        release_fact_missing excluded - acceptance is the
--                  counterparty's act, which the institution cannot perform
--   R-13           truth in SQL; the INSTRUCTION WORDING stays in the client
--
-- Calls occurrence_readiness only. No legacy dependency.
-- ============================================================================

begin;

do $preflight$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'v304_next_action') then
    raise exception 'V304_ALREADY_APPLIED';
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'
         and p.proname = 'occurrence_readiness') <> 1 then
    raise exception 'V304_PREFLIGHT_FAILED: occurrence_readiness absent or overloaded';
  end if;

  if to_regprocedure('public.occurrence_readiness(uuid, timestamp with time zone)') is null then
    raise exception 'V304_PREFLIGHT_FAILED: occurrence_readiness NOT at the captured identity';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'occurrence_next_action') then
    raise exception 'V304_PREFLIGHT_FAILED: occurrence_next_action already exists';
  end if;
end
$preflight$;

-- ── the projection ──────────────────────────────────────────────────────────
create or replace function public.occurrence_next_action(
  p_occurrence uuid,
  p_now        timestamptz default now()
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_readiness jsonb;
  v_rank      int;
  v_code      text;
  v_subject   uuid;
  v_ground    jsonb;
begin
  v_readiness := public.occurrence_readiness(p_occurrence, p_now);
  if v_readiness is null then return null; end if;   -- I-40, no existence leak

  with cand as (
    -- occurrence-grain blockers
    select b as g, b->>'code' as code, null::text as fact
      from jsonb_array_elements(coalesce(v_readiness->'blockers', '[]'::jsonb)) b
    union all
    -- informational missing promise facts
    select r as g, r->>'code' as code, r->>'fact' as fact
      from jsonb_array_elements(coalesce(v_readiness->'reasons', '[]'::jsonb)) r
    union all
    -- department-grain grounds
    select gb as g, gb->>'code' as code, null::text as fact
      from jsonb_array_elements(coalesce(v_readiness->'by_department', '[]'::jsonb)) d,
           jsonb_array_elements(coalesce(d->'blockers', '[]'::jsonb)) gb
  ),
  ranked as (
    -- A9 PRIORITY DOCTRINE. Stated in exactly one place (F-5).
    select c.g, c.code, c.fact,
           case
             when c.code = 'overdue'                                      then 1
             when c.code = 'dependency_unmet'                             then 2
             when c.code = 'fact_missing' and c.fact = 'operating_date'   then 3
             when c.code = 'fact_missing' and c.fact = 'client'           then 4
             when c.code = 'fact_missing' and c.fact = 'venue'            then 5
             when c.code = 'fact_missing' and c.fact = 'contracted'       then 6
             when c.code = 'fact_missing' and c.fact = 'supervision'      then 7
             when c.code = 'fact_missing' and c.fact = 'milestones'       then 8
             when c.code = 'fact_missing' and c.fact = 'attendance'       then 9
             when c.code = 'fact_missing' and c.fact = 'display_name'     then 10
             when c.code = 'workable'                                     then 11
           end as rank
      from cand c
     -- EXCLUSIONS. not_due cannot yet be acted upon (F-6); release_fact_missing
     -- is the counterparty's act (E-III.2).
     where c.code not in ('not_due', 'release_fact_missing')
  ),
  resolved as (
    select r.g, r.code, r.rank,
           -- dependency_unmet returns the BLOCKING responsibility where one
           -- resolves; where none does, the WAITING responsibility carrying its
           -- unmet natural keys (A9 Case 11 clause).
           case
             when r.code = 'dependency_unmet'
              and jsonb_array_length(coalesce(r.g->'detail'->'blocking', '[]'::jsonb)) > 0
             -- T2 over the blockers, by exact uuid order. min() has no uuid
             -- aggregate, and a text cast would order by spelling.
             then (select (b->>'responsibility')::uuid
                     from jsonb_array_elements(r.g->'detail'->'blocking') b
                    order by 1 limit 1)
             else nullif(r.g->>'subject', '')::uuid
           end as action_subject,
           -- T1 operates only where the subject exposes a comparable window.
           -- Blocking rows carry no timing, so they fall through to T2.
           case
             when r.code = 'dependency_unmet'
              and jsonb_array_length(coalesce(r.g->'detail'->'blocking', '[]'::jsonb)) > 0
             then null::timestamptz
             else coalesce(nullif(r.g->'timing'->>'window_end', '')::timestamptz,
                           nullif(r.g->'timing'->>'due', '')::timestamptz)
           end as window_close
      from ranked r
     where r.rank is not null
  )
  select x.rank, x.code, x.action_subject, x.g
    into v_rank, v_code, v_subject, v_ground
    from resolved x
   order by x.rank asc,                          -- A9
            x.window_close asc nulls last,        -- T1
            x.action_subject asc                  -- T2, terminal
   limit 1;                                       -- PC-7.4, never a list

  if v_rank is null then return null; end if;

  return jsonb_build_object(
    'grain',          'occurrence',
    'subject',        p_occurrence,
    'rank',           v_rank,
    'code',           v_code,
    'action_subject', v_subject,
    'ground',         v_ground);   -- PC-9.7, decomposes to its ground
end
$function$;

-- ── the deployed marker ─────────────────────────────────────────────────────
create or replace function public.v304_next_action() returns text
language sql immutable as $marker$ select 'v304'::text $marker$;

commit;

-- NO GRANT. create or replace preserves existing privileges.
