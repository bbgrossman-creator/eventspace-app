-- ═══════════════════════════════════════════════════════════════════════════
-- v276 — LIFECYCLE CEREMONIES. Two authorized, default-deny write paths that
-- record immutable lifecycle facts (never mutate a status). SECURITY DEFINER,
-- authorization by current_tenant_id(), thread-first lock on the event row,
-- non-disclosing CEREMONY_NOT_FOUND cross-tenant. The projected stage is derived
-- from the facts these write — the ceremonies GATE at write time; event_stage
-- READS. Stage is never inferred from wall-clock time or a UI selection.
-- ═══════════════════════════════════════════════════════════════════════════

-- start_service: records that service has begun. Default-deny — refuses unless the
-- event is READY (every pre-service obligation resolved). The ready gate is
-- load-bearing: without it, service could start over unmet pre-service obligations.
create or replace function public.start_service(p_event uuid, p_actor text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_pending int;
begin
  perform 1 from public.event where id=p_event and tenant_id=v_tenant for update;  -- resolve + lock
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;

  if exists (select 1 from public.execution_evidence
              where event_ref=p_event and tenant_id=v_tenant and kind='event_closed') then
    raise exception 'START_SERVICE_EVENT_CLOSED';
  end if;
  if exists (select 1 from public.execution_evidence
              where event_ref=p_event and tenant_id=v_tenant and kind='service_start') then
    raise exception 'SERVICE_ALREADY_STARTED';
  end if;

  -- READY predicate (load-bearing): all pre-service obligations resolved
  select count(*) into v_pending
    from public.obligation o
   where o.event_ref=p_event and o.tenant_id=v_tenant
     and o.kind in ('culinary_prepare','equipment_pull','staffing_assign','venue_setup')
     and public.obligation_state(o.id) not in ('complete','invalidated');
  if v_pending > 0 then
    raise exception 'SERVICE_NOT_READY: % pre-service obligation(s) unresolved', v_pending;
  end if;

  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, p_event, 'service_start', p_actor, '{}'::jsonb);
  return jsonb_build_object('event_id', p_event, 'stage', public.event_stage(p_event));
end $$;

-- close_event: records authorized closeout. Default-deny — refuses while a required
-- closeout predicate is unresolved, and NEVER silently treats breakdown / open
-- exceptions / the unmodeled closeout domains as complete. The return / inspection
-- / financial-settlement domains are not modeled until v285+/v288; that missing
-- requirement is represented EXPLICITLY: close requires an authorized closeout
-- override, recorded verbatim as evidence (an operator attestation, not a fabricated
-- completion). Without it, close refuses.
create or replace function public.close_event(p_event uuid, p_actor text, p_closeout_override text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_bd_pending int; v_exc int;
begin
  perform 1 from public.event where id=p_event and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;

  if exists (select 1 from public.execution_evidence
              where event_ref=p_event and tenant_id=v_tenant and kind='event_closed') then
    raise exception 'CLOSE_ALREADY_CLOSED';
  end if;
  if not exists (select 1 from public.execution_evidence
                  where event_ref=p_event and tenant_id=v_tenant and kind='service_start') then
    raise exception 'CLOSE_NOT_IN_SERVICE';
  end if;

  -- post-service breakdown must be resolved
  select count(*) into v_bd_pending
    from public.obligation o
   where o.event_ref=p_event and o.tenant_id=v_tenant and o.kind='venue_breakdown'
     and public.obligation_state(o.id) not in ('complete','invalidated');
  if v_bd_pending > 0 then raise exception 'CLOSE_BREAKDOWN_PENDING: % breakdown obligation(s) unresolved', v_bd_pending; end if;

  -- no open exception anywhere on the event
  select count(*) into v_exc
    from public.obligation o
   where o.event_ref=p_event and o.tenant_id=v_tenant and public.obligation_state(o.id)='exception';
  if v_exc > 0 then raise exception 'CLOSE_EXCEPTION_OPEN: % unresolved exception(s)', v_exc; end if;

  -- explicit closeout seam (return/inspection/financial not modeled until v285+)
  if p_closeout_override is null then
    raise exception 'CLOSE_CLOSEOUT_UNRESOLVED: return/inspection/financial closeout not modeled until v285+; authorized override required';
  end if;

  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, p_event, 'event_closed', p_actor,
            jsonb_build_object('closeout_override', p_closeout_override,
              'seam','return/inspection/financial closeout enforced from v285+'));
  return jsonb_build_object('event_id', p_event, 'stage', public.event_stage(p_event));
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname='authenticated') then
    grant execute on function public.start_service(uuid,text), public.close_event(uuid,text,text) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname='app_user') then
    grant execute on function public.start_service(uuid,text), public.close_event(uuid,text,text) to authenticated;
  end if;
end $$;
