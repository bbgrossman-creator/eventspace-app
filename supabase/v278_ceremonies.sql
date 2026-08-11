-- ═══════════════════════════════════════════════════════════════════════════
-- v278 — STAFFING CEREMONIES. Same pattern as release_event/start_service/
-- close_event: SECURITY DEFINER, authorization by current_tenant_id(), thread-
-- first lock, non-disclosing CEREMONY_NOT_FOUND cross-tenant, named default-deny
-- refusals. No bespoke action framework — the UI routes directly to these.
-- ═══════════════════════════════════════════════════════════════════════════

-- default-deny staffing authority (I-47): an active tenant member in a managing role
create or replace function public.can_manage_staffing()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = public.current_tenant_id()
       and tu.active
       and tu.role in ('admin','owner','manager','ops')
       and tu.user_id = coalesce(
             nullif(current_setting('app.user_id', true), ''),
             nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid
  );
$$;

-- generate_staffing_requirements: DERIVE requirements from the event's released
-- staffing obligations (I-42). Deterministic, idempotent (natural_key), tenant-safe.
-- Quantity is read from the FROZEN accepted model where present (default 1) — never
-- from editable proposal content or UI text.
create or replace function public.generate_staffing_requirements(p_event uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_acc uuid; v_model jsonb; o record; v_role text; v_qty int; v_nk text; v_count int;
begin
  select origin_commitment_ref into v_acc from public.event where id=p_event and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  select s.model into v_model from public.offer_acceptances a join public.offer_snapshots s on s.id=a.snapshot_id
    where a.id=v_acc and a.tenant_id=v_tenant;

  for o in select id, resource_role, timing from public.obligation
             where event_ref=p_event and tenant_id=v_tenant and kind='staffing_assign'
  loop
    v_role := coalesce(o.resource_role, 'staff');
    -- quantity from the frozen model's matching staff requirement, else 1
    select coalesce(max((req->>'quantity')::int), 1) into v_qty
      from jsonb_array_elements(coalesce(v_model->'components','[]'::jsonb)) comp,
           jsonb_array_elements(coalesce(comp->'requirements','[]'::jsonb)) req
     where req->>'category'='staff' and coalesce(req->>'role','attendant')=v_role;
    v_qty := coalesce(v_qty, 1);
    v_nk := encode(extensions.digest(p_event::text||o.id::text||v_role,'sha256'),'hex');
    insert into public.staffing_requirement
        (tenant_id,event_ref,origin_obligation_ref,role,quantity,department,window_start,window_end,natural_key)
      values (v_tenant,p_event,o.id,v_role,v_qty,'staffing',
              nullif(o.timing->>'window_start','')::timestamptz, nullif(o.timing->>'window_end','')::timestamptz, v_nk)
      on conflict (tenant_id,natural_key) do nothing;
  end loop;

  select count(*) into v_count from public.staffing_requirement where event_ref=p_event and tenant_id=v_tenant;
  return v_count;
end $$;

-- assign_staff: default-deny (I-47). Validates event/requirement/tenant/staff/
-- window/duplicate/closed. Thread-first lock on the requirement serializes the
-- final-position and duplicate races.
create or replace function public.assign_staff(
  p_requirement uuid, p_staff uuid, p_window_start timestamptz, p_window_end timestamptz, p_actor text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); v_event uuid; v_role text; v_id uuid;
begin
  if not public.can_manage_staffing() then raise exception 'STAFFING_NOT_AUTHORIZED'; end if;
  select event_ref, role into v_event, v_role from public.staffing_requirement
    where id=p_requirement and tenant_id=v_tenant for update;                    -- resolve + lock
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if exists (select 1 from public.execution_evidence where event_ref=v_event and tenant_id=v_tenant and kind='event_closed')
    then raise exception 'STAFFING_EVENT_CLOSED'; end if;
  if not exists (select 1 from public.staff where id=p_staff and tenant_id=v_tenant and active)
    then raise exception 'STAFFING_STAFF_INVALID'; end if;
  if p_window_end is null or p_window_start is null or p_window_end <= p_window_start
    then raise exception 'STAFFING_WINDOW_INVALID'; end if;
  if exists (select 1 from public.staffing_assignment a
              where a.requirement_ref=p_requirement and a.staff_ref=p_staff and a.tenant_id=v_tenant
                and not exists (select 1 from public.staffing_release r where r.assignment_ref=a.id))
    then raise exception 'STAFFING_DUPLICATE_ASSIGNMENT'; end if;

  insert into public.staffing_assignment
      (tenant_id,event_ref,requirement_ref,staff_ref,role,window_start,window_end,assigned_by)
    values (v_tenant,v_event,p_requirement,p_staff,v_role,p_window_start,p_window_end,p_actor)
    returning id into v_id;
  return jsonb_build_object('assignment_id', v_id, 'coverage', public.requirement_coverage(p_requirement));
end $$;

-- correct_staffing_assignment: release the old + assign anew, preserving history (I-44).
create or replace function public.correct_staffing_assignment(
  p_assignment uuid, p_new_staff uuid, p_window_start timestamptz, p_window_end timestamptz, p_actor text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); v_req uuid; v_event uuid; v_role text; v_new uuid;
begin
  if not public.can_manage_staffing() then raise exception 'STAFFING_NOT_AUTHORIZED'; end if;
  select requirement_ref, event_ref, role into v_req, v_event, v_role from public.staffing_assignment
    where id=p_assignment and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.staffing_requirement where id=v_req and tenant_id=v_tenant for update;   -- lock
  if exists (select 1 from public.staffing_release where assignment_ref=p_assignment)
    then raise exception 'STAFFING_ALREADY_RELEASED'; end if;
  if exists (select 1 from public.execution_evidence where event_ref=v_event and tenant_id=v_tenant and kind='event_closed')
    then raise exception 'STAFFING_EVENT_CLOSED'; end if;
  if not exists (select 1 from public.staff where id=p_new_staff and tenant_id=v_tenant and active)
    then raise exception 'STAFFING_STAFF_INVALID'; end if;
  if p_window_end is null or p_window_start is null or p_window_end <= p_window_start
    then raise exception 'STAFFING_WINDOW_INVALID'; end if;

  insert into public.staffing_release (tenant_id,assignment_ref,actor,reason)
    values (v_tenant,p_assignment,p_actor,coalesce('corrected: '||p_reason,'corrected'));
  insert into public.staffing_assignment
      (tenant_id,event_ref,requirement_ref,staff_ref,role,window_start,window_end,assigned_by)
    values (v_tenant,v_event,v_req,p_new_staff,v_role,p_window_start,p_window_end,p_actor)
    returning id into v_new;
  return jsonb_build_object('released', p_assignment, 'assignment_id', v_new, 'coverage', public.requirement_coverage(v_req));
end $$;

-- release_staffing_assignment: append-only UNASSIGN (I-44). No hard delete.
create or replace function public.release_staffing_assignment(p_assignment uuid, p_actor text, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); v_req uuid;
begin
  if not public.can_manage_staffing() then raise exception 'STAFFING_NOT_AUTHORIZED'; end if;
  select requirement_ref into v_req from public.staffing_assignment where id=p_assignment and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.staffing_requirement where id=v_req and tenant_id=v_tenant for update;
  if exists (select 1 from public.staffing_release where assignment_ref=p_assignment)
    then raise exception 'STAFFING_ALREADY_RELEASED'; end if;
  insert into public.staffing_release (tenant_id,assignment_ref,actor,reason) values (v_tenant,p_assignment,p_actor,p_reason);
  return jsonb_build_object('released', p_assignment, 'coverage', public.requirement_coverage(v_req));
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname='authenticated') then
    grant execute on function public.can_manage_staffing(), public.generate_staffing_requirements(uuid),
      public.assign_staff(uuid,uuid,timestamptz,timestamptz,text),
      public.correct_staffing_assignment(uuid,uuid,timestamptz,timestamptz,text,text),
      public.release_staffing_assignment(uuid,text,text) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname='app_user') then
    grant execute on function public.can_manage_staffing(), public.generate_staffing_requirements(uuid),
      public.assign_staff(uuid,uuid,timestamptz,timestamptz,text),
      public.correct_staffing_assignment(uuid,uuid,timestamptz,timestamptz,text,text),
      public.release_staffing_assignment(uuid,text,text) to app_user;
  end if;
end $$;
