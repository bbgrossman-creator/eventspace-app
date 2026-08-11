-- ═══════════════════════════════════════════════════════════════════════════
-- v279 — ACTION ROUTING · WORKSPACE INTEGRATION  [MIGRATION]
-- Additive: event_workspace gains an 'actions' key = event_available_actions(event),
-- the routed available-actions projection (derived, not stored). The UI renders
-- action buttons from this metadata instead of hand-authoring stage logic. No prior
-- workspace field changes; v277/v278 workspace consumers are unaffected.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.event_workspace(p_event uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_ev record;
  v_stage text;
  v_bd_pending int;
  v_exc int;
  result jsonb;
begin
  select * into v_ev from public.event where id = p_event and tenant_id = v_tenant;
  if not found then return null; end if;          -- I-40: cross-tenant → not-found
  v_stage := public.event_stage(p_event);

  select count(*) into v_bd_pending from public.obligation o
    where o.event_ref=p_event and o.tenant_id=v_tenant and o.kind='venue_breakdown'
      and public.obligation_state(o.id) not in ('complete','invalidated');
  select count(*) into v_exc from public.obligation o
    where o.event_ref=p_event and o.tenant_id=v_tenant and public.obligation_state(o.id)='exception';

  with obl as (
    select o.id, o.kind, o.department, o.required_outcome, o.dependencies,
           public.obligation_state(o.id) as st,
           (o.required_outcome like 'unresolved:%') as debt,
           (o.kind in ('culinary_prepare','equipment_pull','staffing_assign','venue_setup')) as pre_service
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
      -- unresolved pre-service obligations + open exceptions + closeout seam
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
          'why','closeout domains not modeled until v285+ (authorized override required)',
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
    'next_actions', jsonb_build_array(
      jsonb_build_object('action','start_service','label','Start service',
        'available', (v_stage='ready'),
        'reason', case when v_stage='ready' then null else 'Available once every pre-service obligation is resolved' end),
      jsonb_build_object('action','close_event','label','Close event',
        'available', (v_stage='in_service' and v_bd_pending=0 and v_exc=0),
        'reason', case when v_stage<>'in_service' then 'Available once service has started'
                       when v_bd_pending>0 then 'Breakdown must be completed first'
                       when v_exc>0 then 'Open exceptions must be resolved first'
                       else null end)
    ),
    'recent_activity', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'kind', kind, 'obligation_ref', obligation_ref, 'actor', actor,
        'moment', moment, 'note', payload, 'correction_of', prior_ref) order by moment desc), '[]'::jsonb)
      from (select * from public.execution_evidence
             where event_ref=p_event and tenant_id=v_tenant
             order by moment desc limit 12) r)
  ) into result;

  return result;
end $$;


grant execute on function public.event_workspace(uuid) to authenticated;
