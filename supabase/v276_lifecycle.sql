-- ═══════════════════════════════════════════════════════════════════════════
-- v276 — EVENT LIFECYCLE & STAGE PROJECTION. Additive over the certified v275
-- spine. The governing law holds: THE RELATION IS AUTHORITATIVE, STATUS IS A
-- PROJECTION. There is NO mutable event.stage / event.status / booking status of
-- record. Event stage is DERIVED (I-34) from immutable evidence + obligation
-- state + dependencies + two authorized lifecycle ceremonies.
--
-- LIFECYCLE PREDICATE SPECIFICATION (derived, most-advanced-first):
--
--   closed      ← an `event_closed` fact exists (written only by close_event,
--                 which refuses while a required closeout predicate is unresolved)
--   in_service  ← a `service_start` fact exists (written only by start_service,
--                 which refuses unless the event is ready) and not closed
--   ready       ← every PRE-SERVICE obligation (culinary_prepare, equipment_pull,
--                 staffing_assign, venue_setup) is resolved (complete|invalidated),
--                 with no pre-service exception; and not yet in_service/closed
--   in_prep     ← at least one preparation action has begun (an obligation is
--                 active|complete, or any assignment/scan/inspection/completion
--                 evidence exists) and not yet ready
--   released    ← the event was materialized by a valid Operational Release and
--                 no preparation evidence exists yet
--
-- Pre-service = obligations required before service. Post-service (venue_breakdown)
-- and the closeout seam are evaluated by close_event, not by `ready`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── extend the evidence vocabulary with two AUTHORIZED LIFECYCLE FACTS. These
--    are one-time ceremony facts (service began; event closed), not mutable
--    statuses: they are append-only, provenance-bearing, and the STAGE remains a
--    projection over them. Additive (extends the allowed set only).
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
    where conrelid='public.execution_evidence'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%kind%';
  if v_name is not null then execute format('alter table public.execution_evidence drop constraint %I', v_name); end if;
  alter table public.execution_evidence add constraint execution_evidence_kind_check
    check (kind in ('released','clearance','sign_off','assignment','scan','inspection',
                    'completion','exception','invalidated','superseded','cancelled',
                    'service_start','event_closed'));   -- v276 additions
end $$;

-- ── event_stage: the authoritative derivation (I-34). One derivation, many
--    renderings — DailyOps and the event surface both call this.
create or replace function public.event_stage(p_event uuid)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_pre_total int; v_pre_resolved int; v_pre_exc int;
begin
  perform 1 from public.event where id = p_event and tenant_id = v_tenant;
  if not found then return null; end if;                 -- not ours / not visible

  if exists (select 1 from public.execution_evidence
              where event_ref=p_event and tenant_id=v_tenant and kind='event_closed') then
    return 'closed';
  end if;
  if exists (select 1 from public.execution_evidence
              where event_ref=p_event and tenant_id=v_tenant and kind='service_start') then
    return 'in_service';
  end if;

  -- pre-service resolution (the `ready` predicate)
  select count(*),
         count(*) filter (where st in ('complete','invalidated')),
         count(*) filter (where st = 'exception')
    into v_pre_total, v_pre_resolved, v_pre_exc
    from (select public.obligation_state(o.id) st
            from public.obligation o
           where o.event_ref=p_event and o.tenant_id=v_tenant
             and o.kind in ('culinary_prepare','equipment_pull','staffing_assign','venue_setup')) q;
  if v_pre_total > 0 and v_pre_resolved = v_pre_total and v_pre_exc = 0 then
    return 'ready';
  end if;

  -- in_prep: any preparation action has begun
  if exists (select 1 from public.obligation o
              where o.event_ref=p_event and o.tenant_id=v_tenant
                and public.obligation_state(o.id) in ('active','complete'))
     or exists (select 1 from public.execution_evidence
                 where event_ref=p_event and tenant_id=v_tenant
                   and kind in ('assignment','scan','inspection','completion')) then
    return 'in_prep';
  end if;

  return 'released';
end $$;

-- ── event_stage_detail: the EXPLANATORY projection (never an unexplained badge).
--    stage · why · established_by (facts) · blockers (named) · next authorized action.
create or replace function public.event_stage_detail(p_event uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_stage  text := public.event_stage(p_event);
  v_blockers jsonb;
  v_facts   jsonb;
  v_why text; v_next text;
begin
  if v_stage is null then return null; end if;

  -- named blockers appropriate to the stage
  if v_stage in ('released','in_prep') then
    select coalesce(jsonb_agg(required_outcome order by kind), '[]'::jsonb) into v_blockers
      from public.obligation o
     where o.event_ref=p_event and o.tenant_id=v_tenant
       and o.kind in ('culinary_prepare','equipment_pull','staffing_assign','venue_setup')
       and public.obligation_state(o.id) not in ('complete','invalidated');
  elsif v_stage = 'in_service' then
    select coalesce(jsonb_agg(required_outcome order by kind), '[]'::jsonb) into v_blockers
      from public.obligation o
     where o.event_ref=p_event and o.tenant_id=v_tenant and o.kind='venue_breakdown'
       and public.obligation_state(o.id) not in ('complete','invalidated');
    v_blockers := v_blockers || jsonb_build_array(
      'unresolved: return/inspection/financial closeout not modeled until v285+ (authorized override required to close)');
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
    'readiness', public.event_readiness(p_event));
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname='authenticated') then
    grant execute on function public.event_stage(uuid), public.event_stage_detail(uuid) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname='app_user') then
    grant execute on function public.event_stage(uuid), public.event_stage_detail(uuid) to authenticated;
  end if;
end $$;
