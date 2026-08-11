-- ═══════════════════════════════════════════════════════════════════════════
-- v279 — AUTHORITATIVE ACTION ROUTING · AVAILABILITY PROJECTION  [MIGRATION]
-- Derived, never stored. Answers: for THIS actor, against THIS target, right now,
-- which registered actions are visible and invocable — with DISTINCT reason codes
-- (not_applicable / unauthorized / blocked / already_completed / available /
-- stale_target). Advisory for the UI; the dispatcher re-evaluates at execution.
-- Reuses the certified derivations (event_stage, requirement_coverage,
-- staffing_assignment_active) — it computes no new domain law.
-- ═══════════════════════════════════════════════════════════════════════════

-- resolve a target under the current tenant → (found, event_ref, released)
create or replace function public.action_target_status(p_target_type text, p_target_id uuid)
returns table(found boolean, event_ref uuid, released boolean)
language plpgsql stable security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id();
begin
  found := false; event_ref := null; released := false;
  if p_target_type = 'booking' then
    if exists (select 1 from public.bookings where id=p_target_id and tenant_id=v_tenant) then
      found := true; select e.id into event_ref from public.event e where e.engagement_ref=p_target_id and e.tenant_id=v_tenant;
    end if;
  elsif p_target_type = 'event' then
    if exists (select 1 from public.event where id=p_target_id and tenant_id=v_tenant) then found := true; event_ref := p_target_id; end if;
  elsif p_target_type = 'staffing_requirement' then
    select true, r.event_ref into found, event_ref from public.staffing_requirement r where r.id=p_target_id and r.tenant_id=v_tenant;
  elsif p_target_type = 'staffing_assignment' then
    select true, a.event_ref, exists(select 1 from public.staffing_release rel where rel.assignment_ref=a.id)
      into found, event_ref, released from public.staffing_assignment a where a.id=p_target_id and a.tenant_id=v_tenant;
  end if;
  found := coalesce(found,false); released := coalesce(released,false);
  return next;
end $$;

-- evaluate one action against one target → {available, authorized, reason_code, reason_detail}
create or replace function public.action_evaluate(p_action_key text, p_target_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  reg record; ts record; v_auth boolean; v_stage text; base text; detail text := null; cov jsonb;
begin
  select * into reg from public.action_registry() where action_key=p_action_key;
  if not found then return jsonb_build_object('available',false,'authorized',false,'reason_code','unknown_action','reason_detail',null); end if;
  v_auth := public.action_authorized(p_action_key);
  select * into ts from public.action_target_status(reg.target_type, p_target_id);

  if not ts.found then
    return jsonb_build_object('available',false,'authorized',v_auth,'reason_code','stale_target','reason_detail','target not found in tenant');
  end if;

  -- base applicability/availability (ignores authority; folded in afterwards)
  base := 'available';
  if p_action_key = 'release_event' then
    if ts.event_ref is not null then base := 'already_completed';
    elsif not exists (select 1 from public.offer_acceptances a where a.booking_id=p_target_id and a.tenant_id=public.current_tenant_id()
                        and not exists (select 1 from public.acceptance_rescissions r where r.acceptance_id=a.id))
      then base := 'blocked'; detail := 'no unrescinded commitment to release'; end if;

  elsif p_action_key = 'start_service' then
    v_stage := public.event_stage(ts.event_ref);
    if v_stage in ('in_service','closed') then base := 'already_completed';
    elsif v_stage = 'ready' then base := 'available';
    else base := 'blocked';
      detail := case when not public.event_staffing_ready(ts.event_ref) then 'required staffing coverage not met'
                     else 'pre-service obligations unresolved' end; end if;

  elsif p_action_key = 'close_event' then
    v_stage := public.event_stage(ts.event_ref);
    if v_stage = 'closed' then base := 'already_completed';
    elsif v_stage <> 'in_service' then base := 'blocked'; detail := 'service has not started';
    elsif exists (select 1 from public.obligation o where o.event_ref=ts.event_ref and o.tenant_id=public.current_tenant_id()
                    and o.kind='venue_breakdown' and public.obligation_state(o.id) not in ('complete','invalidated'))
      then base := 'blocked'; detail := 'breakdown not complete';
    elsif exists (select 1 from public.obligation o where o.event_ref=ts.event_ref and o.tenant_id=public.current_tenant_id()
                    and public.obligation_state(o.id)='exception')
      then base := 'blocked'; detail := 'open exception';
    end if;

  elsif p_action_key = 'record_execution_evidence' then
    if public.event_stage(ts.event_ref) = 'closed' then base := 'blocked'; detail := 'event is closed'; end if;

  elsif p_action_key = 'assign_staff' then
    if public.event_stage(ts.event_ref) = 'closed' then base := 'blocked'; detail := 'event is closed';
    else cov := public.requirement_coverage(p_target_id);
         if cov is not null and (cov->>'covered')::boolean then detail := 'requirement already covered (further assignments over-staff)'; end if; end if;

  elsif p_action_key in ('correct_staffing_assignment','release_staffing_assignment') then
    if ts.released then base := 'already_completed';
    elsif public.event_stage(ts.event_ref) = 'closed' then base := 'blocked'; detail := 'event is closed'; end if;
  end if;

  -- fold authority in with distinct precedence
  return jsonb_build_object(
    'available',  (base='available' and v_auth),
    'authorized', v_auth,
    'reason_code', case when not v_auth then 'unauthorized' else base end,
    'reason_detail', case when not v_auth then 'actor not authorized for this action' else detail end);
end $$;

-- all registered actions applicable to a single target, with availability + metadata
create or replace function public.available_actions(p_target_type text, p_target_id uuid)
returns jsonb language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'action_key', r.action_key, 'label', r.label, 'domain', r.domain,
    'target_type', r.target_type, 'target_id', p_target_id,
    'group_key', r.group_key, 'sort_order', r.sort_order,
    'idempotency_mode', r.idempotency_mode, 'workspace_visible', r.workspace_visible,
    'required_fields', to_jsonb(public.action_required_fields(r.action_key)),
    'available', (ev->>'available')::boolean, 'authorized', (ev->>'authorized')::boolean,
    'reason_code', ev->>'reason_code', 'reason_detail', ev->>'reason_detail'
  ) order by r.sort_order), '[]'::jsonb)
  from public.action_registry() r
  cross join lateral public.action_evaluate(r.action_key, p_target_id) ev
  where r.target_type = p_target_type;
$$;

-- workspace aggregate: event-level + per-requirement + per-assignment actions
create or replace function public.event_available_actions(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); result jsonb;
begin
  perform 1 from public.event where id=p_event and tenant_id=v_tenant;
  if not found then return '[]'::jsonb; end if;
  select jsonb_build_object(
    'event', public.available_actions('event', p_event),
    'requirements', (select coalesce(jsonb_object_agg(r.id, public.available_actions('staffing_requirement', r.id)), '{}'::jsonb)
                       from public.staffing_requirement r where r.event_ref=p_event and r.tenant_id=v_tenant),
    'assignments', (select coalesce(jsonb_object_agg(a.id, public.available_actions('staffing_assignment', a.id)), '{}'::jsonb)
                       from public.staffing_assignment a where a.event_ref=p_event and a.tenant_id=v_tenant
                         and not exists (select 1 from public.staffing_release rel where rel.assignment_ref=a.id))
  ) into result;
  return result;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname='authenticated') then
    grant execute on function public.action_target_status(text,uuid), public.action_evaluate(text,uuid),
      public.available_actions(text,uuid), public.event_available_actions(uuid) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname='app_user') then
    grant execute on function public.action_target_status(text,uuid), public.action_evaluate(text,uuid),
      public.available_actions(text,uuid), public.event_available_actions(uuid) to app_user;
  end if;
end $$;
