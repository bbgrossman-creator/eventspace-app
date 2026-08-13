-- ============================================================================
-- v309 · THE DUPLICATE PREVIEWS RETIRE                    min_release v308
-- File: supabase/v309_preview_consolidation.sql  ·  apply after v308
--
-- v308 made ONE availability authority true. v309 makes it the ONLY one the
-- application can see. Nothing a user could do before, they cannot do now:
-- every surface keeps its shape and its vocabulary; only the derivation moves.
--
-- ── WHAT WAS WRONG (found by v309 recon, live in production) ────────────────
-- event_workspace.next_actions computed availability INLINE and independently:
--
--   start_service available iff event_stage(...) = 'ready'
--   close_event  available iff stage='in_service' and breakdown=0 and exc=0
--
-- That second authority disagreed with the first. It still carried the
-- pre-service requirement v308 removed as correction F3 (the ceremony never had
-- it); it ignored the close_event closeout override (correction 4); and it
-- performed NO Class-U check whatsoever, so it would report available:true to
-- an actor with no membership at all. EventWorkspace.tsx rendered that
-- duplicate while ALSO rendering the canonical ActionPanel — two answers to one
-- question on one screen. This release ends that.
--
-- ── WHAT REPLACES IT ────────────────────────────────────────────────────────
-- One projection, availability_lifecycle_actions(), reads the canonical
-- available_actions('event', …) — hence action_evaluate, hence
-- availability_class_u + admissibility_evaluate — and both event_workspace and
-- event_stage_detail now render THAT. The two lifecycle entries are selected by
-- the registry's DECLARED group_key='lifecycle' and ordered by its declared
-- sort_order, so the legacy array (start_service then close_event) is
-- reproduced from declared data rather than hardcoded.
--
-- Blocker vocabulary converges the same way. The obligation kinds that used to
-- be literal lists in both functions now come from the ladder's own declared
-- subject_path on the obligation_count rungs, and the hand-written closeout
-- sentence is replaced by close_event rung 6's declared ground.
--
-- ── LEGACY PRESERVATION (Amendment Five) ────────────────────────────────────
-- KEEP SHAPE: next_actions stays an array of {action,label,available,reason};
--   event_stage_detail keeps next_action (string) and blockers (string[]);
--   event_workspace keeps blockers as {what,cause_ref,why,next_action};
--   available_actions and event_available_actions are untouched; the six legacy
--   reason codes are untouched.
-- ADD: each next_actions entry gains `reason_code` so the interface can render
--   the v308 unavailable_pending_argument state instead of guessing; and
--   event_stage_detail gains `next_actions` so the lifecycle surface can render
--   canonical availability rather than deciding from `stage`.
-- RETIRE INTERNAL DUPLICATE ONLY: the inline availability booleans and the
--   literal obligation-kind lists. Neither had an externally observable form of
--   its own.
-- Nothing is removed.
--
-- Successor migration: CREATE OR REPLACE of two v276/v279-era projections plus
-- three new read-only helpers and the marker. No ceremony, no v306/v307a/v307b/
-- v308 object, no table, index, trigger, policy or grant is touched.
-- ============================================================================

begin;

do $preflight$
begin
  if to_regprocedure('public.v308_availability()') is null then
    raise exception 'V309_PREFLIGHT_FAILED: v308 absent — v309 declares min_release v308';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='v309_preview_consolidation') then
    raise exception 'V309_ALREADY_APPLIED';
  end if;
  if to_regprocedure('public.available_actions(text, uuid)') is null
     or to_regprocedure('public.action_evaluate(text, uuid)') is null
     or to_regprocedure('public.admissibility_ladder()') is null
     or to_regprocedure('public.event_workspace(uuid)') is null
     or to_regprocedure('public.event_stage_detail(uuid)') is null then
    raise exception 'V309_PREFLIGHT_FAILED: a surface this release converges is absent';
  end if;
end
$preflight$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1 · THE ONE PROJECTION
-- Selection and order come from the registry's declared group_key/sort_order,
-- so the legacy two-entry lifecycle array is reproduced from declared data.
-- ════════════════════════════════════════════════════════════════════════════
create function public.availability_lifecycle_actions(p_event uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'action',      a->>'action_key',
           'label',       a->>'label',
           'available',   (a->>'available')::boolean,
           'reason',      case when (a->>'available')::boolean then null
                               else a->>'reason_detail' end,
           'reason_code', a->>'reason_code'
         ) order by (a->>'sort_order')::int), '[]'::jsonb)
    from jsonb_array_elements(public.available_actions('event', p_event)) a
   where a->>'group_key' = 'lifecycle';
$$;

comment on function public.availability_lifecycle_actions(uuid) is
  'v309 · the single lifecycle availability projection. Reads canonical available_actions (hence action_evaluate, hence Class-U + the declared S/A authority) and reshapes it into the legacy next_actions contract. Selection and order come from the registry''s declared group_key and sort_order. It decides nothing.';

-- ── declared obligation kinds, read from the ladder ─────────────────────────
create function public.availability_obligation_kinds(p_action_key text)
returns text[]
language sql
stable
set search_path to 'public'
as $$
  select coalesce(
    (select string_to_array(l.subject_path, ',')
       from public.admissibility_ladder() l
      where l.action_key = p_action_key
        and l.evaluator = 'obligation_count'
        and l.subject_path not like '*%'
      order by l.ordinal
      limit 1),
    array[]::text[]);
$$;

comment on function public.availability_obligation_kinds(text) is
  'v309 · the obligation kinds an action''s declared obligation_count rung actually counts, read from the ladder''s subject_path. Replaces the literal kind lists that were duplicated inside event_workspace and event_stage_detail.';

-- ── a rung's declared ground, for blocker wording ───────────────────────────
create function public.availability_declared_ground(p_action_key text, p_condition text)
returns text
language sql
stable
set search_path to 'public'
as $$
  select public.admissibility_render_ground(l.ground_template, null)
    from public.admissibility_ladder() l
   where l.action_key = p_action_key and l.condition = p_condition
   limit 1;
$$;

comment on function public.availability_declared_ground(text, text) is
  'v309 · a declared rung ground, for blocker wording. Replaces hand-written sentences that restated a declared condition in different words.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2 · event_stage_detail — blockers and next_action become wording over
--     declared grounds; next_actions carries canonical availability.
--     stage / why / established_by / readiness are unchanged.
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
  v_blockers jsonb;
  v_facts   jsonb;
  v_why text; v_next text;
begin
  if v_stage is null then return null; end if;
  -- named blockers, over the kinds the DECLARED rung actually counts
  if v_stage in ('released','in_prep') then
    select coalesce(jsonb_agg(required_outcome order by kind), '[]'::jsonb) into v_blockers
      from public.obligation o
     where o.event_ref=p_event and o.tenant_id=v_tenant
       and o.kind = any (public.availability_obligation_kinds('start_service'))
       and public.obligation_state(o.id) not in ('complete','invalidated');
  elsif v_stage = 'in_service' then
    select coalesce(jsonb_agg(required_outcome order by kind), '[]'::jsonb) into v_blockers
      from public.obligation o
     where o.event_ref=p_event and o.tenant_id=v_tenant
       and o.kind = any (public.availability_obligation_kinds('close_event'))
       and public.obligation_state(o.id) not in ('complete','invalidated');
    -- the closeout seam, in the authority's own declared words
    v_blockers := v_blockers || jsonb_build_array(
      public.availability_declared_ground('close_event','closeout_override_supplied'));
  else
    v_blockers := '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'actor',actor,'moment',moment) order by moment), '[]'::jsonb)
    into v_facts
    from public.execution_evidence
   where event_ref=p_event and tenant_id=v_tenant
     and kind in ('released','service_start','event_closed');
  v_why := case v_stage
    when 'released'  then 'Materialized by Operational Release; preparation has not begun.'
    when 'in_prep'   then 'Preparation has begun; not all pre-service obligations are resolved.'
    when 'ready'     then 'Every pre-service obligation is resolved with no open exception; awaiting service start.'
    when 'in_service'then 'An authorized service-start fact has been recorded.'
    when 'closed'    then 'An authorized closeout has been recorded.'
  end;
  v_next := case v_stage
    when 'released'  then 'Begin preparation (assign or complete a pre-service obligation).'
    when 'in_prep'   then 'Resolve the remaining pre-service obligations.'
    when 'ready'     then 'Start service (start_service).'
    when 'in_service'then 'Complete breakdown, then close with authorized closeout (close_event).'
    when 'closed'    then '—'
  end;
  return jsonb_build_object(
    'event_id', p_event, 'stage', v_stage, 'why', v_why,
    'established_by', v_facts, 'blockers', v_blockers, 'next_action', v_next,
    'next_actions', public.availability_lifecycle_actions(p_event),
    'readiness', public.event_readiness(p_event));
end $function$;

comment on function public.event_stage_detail(uuid) is
  'v309 · lifecycle detail. blockers are wording over the kinds the declared rungs count and over close_event rung 6''s declared ground; next_actions is the canonical availability projection. This function decides no availability of its own.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3 · event_workspace — next_actions becomes the projection; the pre-service
--     kind list and the closeout blocker come from declared data. Header,
--     readiness, workboard, staffing, actions and recent activity unchanged.
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
      -- closeout seam + uncovered staffing requirements
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
          from (select 1) s where v_stage='in_service'
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
  'v309 · the operational workspace projection. next_actions is the canonical availability projection, not a second computation; the pre-service kind set and the closeout blocker come from declared ladder data. This function decides no availability of its own.';

-- ── the deployed marker ─────────────────────────────────────────────────────
-- NO GRANT. New functions inherit the schema default, matching v306/v308;
-- the replaced projections keep the grants their original migrations gave them.
create function public.v309_preview_consolidation() returns text
language sql immutable as $$ select 'v309 · the duplicate previews retire'::text $$;

commit;
