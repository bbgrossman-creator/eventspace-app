-- ============================================================================
-- v310 · event_stage COMPATIBILITY / CANONICAL OPERATIONAL TRUTH
-- File: supabase/v310_stage_compatibility.sql        min_release v309
--
-- One authority underneath, the legacy stage vocabulary preserved above it.
--
-- event_stage stops being an independent business authority and becomes a
-- COMPATIBILITY PROJECTION over canonical operational truth. It keeps its name,
-- its signature, its five values and its NULL — nothing above it changes, and
-- no application file is touched.
--
-- ── WHAT WAS WRONG (v310 recon, proven live against the certified database) ──
-- event_stage still carried `v_pre_total > 0` in its readiness test: an event
-- with ZERO pre-service obligations could never reach 'ready'. That is the very
-- clause v308 removed from availability as correction F3, because the ceremony
-- never had it. The result, reproduced on a clone:
--
--   event_stage              = released
--   canonical start_service  = AVAILABLE
--   stage_detail.why         = "…preparation has not begun."
--   stage_detail.next_action = "Begin preparation…"
--
-- An enabled Start Service button beside prose telling the operator to begin
-- preparing. The control was right; the narrative was wrong.
--
-- ── OWNER RULING E-1 (Option A, approved) ───────────────────────────────────
-- Zero pre-service obligations + canonical start_service ADMISSIBLE ⇒ 'ready',
-- not 'released'. An authorized CHANGE to that edge-case classification. No
-- stage is removed or renamed: released → in_prep → ready → in_service → closed
-- all survive, plus NULL for a non-visible subject. A zero-obligation event may
-- now legitimately progress released → ready → in_service, because there is no
-- preparation obligation requiring an in_prep state.
--
-- ── HOW READINESS IS NOW DERIVED ────────────────────────────────────────────
-- Not by re-deriving the rule, but by ASKING the authority that owns it:
-- admissibility_evaluate('start_service', event) — the declared rungs 4
-- (obligation_count over the declared kinds) and 5 (staffing_covered). Because
-- 'closed' and 'in_service' are decided first, rungs 2 and 3 are already
-- satisfied when we reach that question, so admissible ⇔ canonically ready.
-- The obsolete v_pre_total > 0 condition does not survive in any form.
--
-- Class-U is deliberately NOT consulted: a stage describes the EVENT, not the
-- actor looking at it, so the projection stays actor-independent exactly as
-- before. admissibility_evaluate evaluates Class-S/Class-A only, which is
-- precisely the right authority for this question.
--
-- `in_prep` is PRESERVED as a presentation classification for "work has begun".
-- The recon established it has no canonical one-to-one equivalent, and the
-- ruling is explicit that no new canonical doctrine may be invented merely to
-- eliminate the label.
--
-- ── L20 · the stage-keyed blocker selector retires ──────────────────────────
-- Both projections chose their blocker set by branching on the stage string.
-- That selector is an internal duplicate authority; it now tests canonical
-- execution facts directly. The externally observable blocker contract is
-- unchanged — same shapes, same entries, same wording.
--
-- ── L21 · PRESERVED, deliberately ───────────────────────────────────────────
-- action_evaluate's single remaining event_stage call, on the non-ladder
-- record_execution_evidence path, is NOT converged. v308's frozen one-shot
-- US-5 asserts that call survives exactly once; changing it would make v308's
-- own certification fail forever after. The ruling directs preservation where
-- convergence would disturb frozen authority. action_evaluate is untouched.
--
-- ── LEGACY PRESERVATION (Amendment Five) ────────────────────────────────────
-- PRESERVE  L16 the five-stage rail · L17 .stage on both ceremony payloads ·
--           L22 the EventStage union and getEventStage() · L23 the rail,
--           data-lifecycle-stage, data-ws-stage and the header chip
-- CHANGE    L18 why · L19 next_action — both now incapable of contradicting
--           canonical truth; E-1 applied
-- RETIRE INTERNAL DUPLICATE ONLY  L20 the stage-keyed blocker selector
-- Nothing externally observable is removed. DATABASE-ONLY: no application file
-- is changed, so the v309 deployment-ordering finding is not exercised.
--
-- Successor migration: CREATE OR REPLACE of three projections plus one helper
-- and the marker. No ceremony, no v306/v307a/v307b/v308/v309 authority object,
-- no table, index, trigger, policy or grant is touched.
-- ============================================================================

begin;

do $preflight$
begin
  if to_regprocedure('public.v309_preview_consolidation()') is null then
    raise exception 'V310_PREFLIGHT_FAILED: v309 absent — v310 declares min_release v309';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='v310_stage_compatibility') then
    raise exception 'V310_ALREADY_APPLIED';
  end if;
  if to_regprocedure('public.admissibility_evaluate(text, uuid, jsonb)') is null
     or to_regprocedure('public.admissibility_execution_fact(text, uuid, text)') is null then
    raise exception 'V310_PREFLIGHT_FAILED: the canonical fact authority is absent';
  end if;
  if to_regprocedure('public.event_stage(uuid)') is null
     or to_regprocedure('public.event_stage_detail(uuid)') is null
     or to_regprocedure('public.event_workspace(uuid)') is null
     or to_regprocedure('public.availability_lifecycle_actions(uuid)') is null then
    raise exception 'V310_PREFLIGHT_FAILED: a surface this release projects is absent';
  end if;
end
$preflight$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1 · ASK THE AUTHORITY — one canonical admissibility read, shared
-- Class-S/Class-A only (admissibility_evaluate never evaluates Class-U), so the
-- answer describes the EVENT and never the actor.
-- ════════════════════════════════════════════════════════════════════════════
create function public.stage_action_admissible(p_action_key text, p_event uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select e.admissible
                     from public.admissibility_evaluate(p_action_key, p_event, null) e
                    limit 1), false);
$$;

comment on function public.stage_action_admissible(text, uuid) is
  'v310 · the canonical readiness question, asked rather than re-derived. Returns the declared Class-S/Class-A verdict for an action against an event. Class-U is not consulted: a stage describes the event, not the actor reading it.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2 · event_stage — a COMPATIBILITY PROJECTION over canonical facts
-- Same name, same signature, same five values, same NULL. The obsolete
-- v_pre_total > 0 readiness condition does not survive in any form.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.event_stage(p_event uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_tenant uuid := public.current_tenant_id();
begin
  perform 1 from public.event where id = p_event and tenant_id = v_tenant;
  if not found then return null; end if;                      -- invisible subject

  -- terminal facts, from the canonical execution-fact authority (v306)
  if public.admissibility_execution_fact('event', p_event, 'event_closed')  then return 'closed';     end if;
  if public.admissibility_execution_fact('event', p_event, 'service_start') then return 'in_service'; end if;

  -- READY is the authority's own verdict on start_service, not a second
  -- derivation of it. Rungs 2 and 3 are already satisfied here, so an
  -- admissible verdict means exactly "nothing remains before service".
  -- E-1: an event with zero pre-service obligations reaches this and is READY.
  if public.stage_action_admissible('start_service', p_event) then return 'ready'; end if;

  -- IN_PREP is a preserved PRESENTATION classification — "work has begun".
  -- The recon established it has no canonical one-to-one equivalent, and no new
  -- doctrine is invented here merely to remove the label.
  if exists (select 1 from public.obligation o
              where o.event_ref = p_event and o.tenant_id = v_tenant
                and public.obligation_state(o.id) in ('active','complete'))
     or exists (select 1 from public.execution_evidence
                 where event_ref = p_event and tenant_id = v_tenant
                   and kind in ('assignment','scan','inspection','completion')) then
    return 'in_prep';
  end if;

  return 'released';
end $function$;

comment on function public.event_stage(uuid) is
  'v310 · COMPATIBILITY PROJECTION, not an authority. closed/in_service come from the canonical execution-fact authority; ready is admissibility_evaluate''s own verdict on start_service (owner ruling E-1 — zero pre-service obligations no longer block readiness); in_prep is a preserved presentation classification for work-has-begun; released is the base state; NULL for a non-visible subject. The vocabulary and callable contract are unchanged.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3 · event_stage_detail — narrative that cannot contradict the authority
-- L18/L19 CHANGE: why and next_action are selected from canonical truth.
-- L20 RETIRE INTERNAL DUPLICATE: blockers are chosen by canonical fact, not by
-- branching on the stage string. Shapes, keys and types are unchanged.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.event_stage_detail(p_event uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_tenant uuid := public.current_tenant_id();
  v_stage  text := public.event_stage(p_event);
  v_closed boolean; v_started boolean; v_ready boolean; v_close_ok boolean;
  v_blockers jsonb;
  v_facts   jsonb;
  v_why text; v_next text;
begin
  if v_stage is null then return null; end if;

  v_closed   := public.admissibility_execution_fact('event', p_event, 'event_closed');
  v_started  := public.admissibility_execution_fact('event', p_event, 'service_start');
  v_ready    := public.stage_action_admissible('start_service', p_event);
  v_close_ok := public.stage_action_admissible('close_event',  p_event);

  -- ── L20 · blockers selected by CANONICAL FACT, never by the stage string ──
  if v_closed then
    v_blockers := '[]'::jsonb;
  elsif v_started then
    select coalesce(jsonb_agg(required_outcome order by kind), '[]'::jsonb) into v_blockers
      from public.obligation o
     where o.event_ref=p_event and o.tenant_id=v_tenant
       and o.kind = any (public.availability_obligation_kinds('close_event'))
       and public.obligation_state(o.id) not in ('complete','invalidated');
    v_blockers := v_blockers || jsonb_build_array(
      public.availability_declared_ground('close_event','closeout_override_supplied'));
  else
    select coalesce(jsonb_agg(required_outcome order by kind), '[]'::jsonb) into v_blockers
      from public.obligation o
     where o.event_ref=p_event and o.tenant_id=v_tenant
       and o.kind = any (public.availability_obligation_kinds('start_service'))
       and public.obligation_state(o.id) not in ('complete','invalidated');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'actor',actor,'moment',moment) order by moment), '[]'::jsonb)
    into v_facts
    from public.execution_evidence
   where event_ref=p_event and tenant_id=v_tenant
     and kind in ('released','service_start','event_closed');

  -- ── L18 · why, selected from canonical truth ─────────────────────────────
  -- It can no longer say preparation has not begun while service is available.
  v_why := case
    when v_closed  then 'An authorized closeout has been recorded.'
    when v_started then 'An authorized service-start fact has been recorded.'
    when v_ready   then 'Every pre-service obligation is resolved with no open exception; awaiting service start.'
    when v_stage = 'in_prep' then 'Preparation has begun; not all pre-service obligations are resolved.'
    else 'Materialized by Operational Release; preparation has not begun.'
  end;

  -- ── L19 · next_action, derived from the canonical verdict ────────────────
  -- It never recommends an action the authority refuses, and never omits an
  -- immediately available one because of an obsolete stage inference.
  v_next := case
    when v_closed  then '—'
    when v_ready   then 'Start service (start_service).'
    when v_started and v_close_ok
                   then 'Close with an authorized closeout (close_event).'
    when v_started then 'Complete breakdown, then close with authorized closeout (close_event).'
    when v_stage = 'in_prep' then 'Resolve the remaining pre-service obligations.'
    else 'Begin preparation (assign or complete a pre-service obligation).'
  end;

  return jsonb_build_object(
    'event_id', p_event, 'stage', v_stage, 'why', v_why,
    'established_by', v_facts, 'blockers', v_blockers, 'next_action', v_next,
    'next_actions', public.availability_lifecycle_actions(p_event),
    'readiness', public.event_readiness(p_event));
end $function$;

comment on function public.event_stage_detail(uuid) is
  'v310 · lifecycle detail. why and next_action are selected from canonical truth and cannot contradict it — in particular next_action never tells an operator to begin preparation while start_service is admissible. Blockers are chosen by canonical execution fact; the stage-keyed selector is retired. Every key, type and external shape is unchanged.';

-- ════════════════════════════════════════════════════════════════════════════
-- 4 · event_workspace — the same selector retires here
-- Only the closeout-blocker condition changes: canonical facts replace the
-- stage-string test. header.stage still carries the compatibility projection.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.event_workspace(p_event uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_tenant uuid := public.current_tenant_id();
  v_ev record;
  v_stage text;
  v_exc int;
  result jsonb;
begin
  select * into v_ev from public.event where id = p_event and tenant_id = v_tenant;
  if not found then return null; end if;          -- I-40: cross-tenant → not-found
  v_stage := public.event_stage(p_event);
  select count(*) into v_exc from public.obligation o
    where o.event_ref=p_event and o.tenant_id=v_tenant and public.obligation_state(o.id)='exception';
  with obl as (
    select o.id, o.kind, o.department, o.required_outcome, o.dependencies,
           public.obligation_state(o.id) as st,
           (o.required_outcome like 'unresolved:%') as debt,
           (o.kind = any (public.availability_obligation_kinds('start_service'))) as pre_service
      from public.obligation o
     where o.event_ref=p_event and o.tenant_id=v_tenant
  ),
  live as (select * from obl where st <> 'invalidated'),
  latest_ev as (
    select distinct on (obligation_ref) obligation_ref, kind, actor, moment
      from public.execution_evidence
     where event_ref=p_event and tenant_id=v_tenant and obligation_ref is not null
     order by obligation_ref, moment desc
  ),
  cats as (
    select department,
           count(*) as total,
           count(*) filter (where st in ('complete','invalidated')) as resolved,
           count(*) filter (where st='exception') as exceptions,
           coalesce(jsonb_agg(required_outcome) filter (where st not in ('complete','invalidated')), '[]'::jsonb) as blocking
      from live group by department
  )
  select jsonb_build_object(
    'header', jsonb_build_object(
      'event_id', v_ev.id,
      'engagement_ref', v_ev.engagement_ref,
      'origin_commitment_ref', v_ev.origin_commitment_ref,
      'released_at', v_ev.released_at,
      'released_by', v_ev.released_by,
      'stage', v_stage,
      'readiness', (select jsonb_build_object(
                      'resolved', coalesce(sum(resolved),0),
                      'total', coalesce(sum(total),0)) from cats),
      'blocker_count', (select count(*) from live
                          where (pre_service and st not in ('complete','invalidated'))),
      'exception_count', v_exc,
      'last_activity', (select max(moment) from public.execution_evidence
                          where event_ref=p_event and tenant_id=v_tenant),
      'can_manage_staffing', public.can_manage_staffing()
    ),
    'lifecycle', public.event_stage_detail(p_event),
    'staffing', public.event_staffing_summary(p_event),
    'actions', public.event_available_actions(p_event),
    'readiness_by_category', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'department', department, 'resolved', resolved, 'total', total,
        'exceptions', exceptions, 'blocking', blocking,
        'state', case when exceptions>0 then 'exception'
                      when total>0 and resolved=total then 'complete'
                      when resolved>0 then 'in_progress' else 'pending' end
      ) order by department), '[]'::jsonb) from cats),
    'workboard', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'kind', kind, 'department', department, 'title', required_outcome,
        'state', st, 'decision_debt', debt, 'exception', (st='exception'),
        'dependencies', dependencies,
        'latest_evidence', (select jsonb_build_object('kind',le.kind,'actor',le.actor,'moment',le.moment)
                              from latest_ev le where le.obligation_ref=live.id),
        'actions', case st when 'ready' then '["assign"]'::jsonb
                           when 'active' then '["complete"]'::jsonb else '[]'::jsonb end
      ) order by department, kind), '[]'::jsonb) from live),
    'blockers', (
      -- unresolved pre-service obligations + open exceptions + the declared
      -- closeout seam (selected by CANONICAL FACT, not by the stage string)
      -- + uncovered staffing requirements
      select coalesce(jsonb_agg(b), '[]'::jsonb) from (
        select jsonb_build_object(
          'what', required_outcome, 'cause_ref', id,
          'why', case when st='exception' then 'open exception'
                      when debt then 'decision-debt (knowledge not yet modeled)'
                      when st='blocked' then 'blocked by an unmet dependency'
                      else 'obligation not yet resolved' end,
          'next_action', case when st='exception' then 'Resolve the exception'
                              when debt then 'Record an authorized resolution'
                              else 'Complete this obligation' end) as b
          from live
         where (pre_service and st not in ('complete','invalidated')) or st='exception'
        union all
        select jsonb_build_object(
          'what','Final closeout (return / inspection / financial)',
          'cause_ref', null,
          'why', public.availability_declared_ground('close_event','closeout_override_supplied'),
          'next_action','Close with an authorized closeout override')
          from (select 1) s
         where public.admissibility_execution_fact('event', p_event, 'service_start')
           and not public.admissibility_execution_fact('event', p_event, 'event_closed')
        union all
        select jsonb_build_object(
          'what', r.role||' staffing', 'cause_ref', r.id,
          'why', public.requirement_coverage(r.id)->>'blocker',
          'next_action', 'Assign staff to this role')
          from public.staffing_requirement r
         where r.event_ref=p_event and r.tenant_id=v_tenant
           and (public.requirement_coverage(r.id)->>'blocker') is not null
      ) z),
    'next_actions', public.availability_lifecycle_actions(p_event),
    'recent_activity', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'kind', kind, 'obligation_ref', obligation_ref, 'actor', actor,
        'moment', moment, 'note', payload, 'correction_of', prior_ref) order by moment desc), '[]'::jsonb)
      from (select * from public.execution_evidence
             where event_ref=p_event and tenant_id=v_tenant
             order by moment desc limit 12) r)
  ) into result;
  return result;
end $function$;

comment on function public.event_workspace(uuid) is
  'v310 · the operational workspace projection. header.stage carries the compatibility projection; the closeout blocker is selected by canonical execution fact rather than by branching on the stage string. Availability remains the v309 canonical projection. No external shape changes.';

-- ── the deployed marker ─────────────────────────────────────────────────────
-- NO GRANT. New functions inherit the schema default, matching v306/v308/v309;
-- the replaced projections keep the grants their original migrations gave them.
create function public.v310_stage_compatibility() returns text
language sql immutable as $$ select 'v310 · event_stage is a compatibility projection over canonical truth'::text $$;

commit;
