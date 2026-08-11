-- ═══════════════════════════════════════════════════════════════════════════
-- v278 — STAFFING COVERAGE & CONFLICT PROJECTIONS (I-45/I-46). Coverage and
-- conflicts are DERIVED, never stored. One derivation, many renderings — the
-- workspace, readiness, and blockers all read these.
--
-- OVERLAP SEMANTICS (half-open intervals [start, end)): two windows overlap iff
--   a.start < b.end AND b.start < a.end.
-- Adjacent windows ([10:00,12:00) and [12:00,14:00)) DO NOT overlap.
-- ═══════════════════════════════════════════════════════════════════════════

-- an assignment is ACTIVE unless a staffing_release cites it
create or replace function public.staffing_assignment_active(p_assignment uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.staffing_assignment a
                  where a.id=p_assignment and a.tenant_id=public.current_tenant_id())
     and not exists (select 1 from public.staffing_release r where r.assignment_ref=p_assignment);
$$;

-- count of OTHER active assignments for p_staff overlapping [p_ws,p_we) (double-booking)
create or replace function public.staff_overlap_count(p_staff uuid, p_ws timestamptz, p_we timestamptz, p_exclude uuid)
returns integer language sql stable security definer set search_path = public
as $$
  select count(*)::int from public.staffing_assignment a
   where a.tenant_id=public.current_tenant_id() and a.staff_ref=p_staff and a.id <> coalesce(p_exclude,'00000000-0000-0000-0000-000000000000'::uuid)
     and not exists (select 1 from public.staffing_release r where r.assignment_ref=a.id)
     and a.window_start < p_we and p_ws < a.window_end;                         -- half-open overlap
$$;

-- coverage for one requirement (I-45): required/assigned/shortage/over/conflicts/covered
create or replace function public.requirement_coverage(p_requirement uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); v_req record; v_assigned int; v_conf int;
begin
  select * into v_req from public.staffing_requirement where id=p_requirement and tenant_id=v_tenant;
  if not found then return null; end if;
  select count(*) into v_assigned from public.staffing_assignment a
    where a.requirement_ref=p_requirement and a.tenant_id=v_tenant
      and not exists (select 1 from public.staffing_release r where r.assignment_ref=a.id);
  select count(*) into v_conf from public.staffing_assignment a
    where a.requirement_ref=p_requirement and a.tenant_id=v_tenant
      and not exists (select 1 from public.staffing_release r where r.assignment_ref=a.id)
      and public.staff_overlap_count(a.staff_ref, a.window_start, a.window_end, a.id) > 0;
  return jsonb_build_object(
    'requirement_id', p_requirement, 'role', v_req.role,
    'required', v_req.quantity, 'assigned', v_assigned,
    'shortage', greatest(0, v_req.quantity - v_assigned),
    'over', greatest(0, v_assigned - v_req.quantity),
    'conflicts', v_conf,
    'covered', (v_assigned >= v_req.quantity and v_conf = 0),
    'blocker', case when v_conf > 0 then v_conf||' conflicting assignment(s) for '||v_req.role
                    when v_assigned < v_req.quantity then (v_req.quantity - v_assigned)||' of '||v_req.quantity||' '||v_req.role||' position(s) open'
                    else null end);
end $$;

-- every requirement covered (no shortage, no conflict); vacuously true if none
create or replace function public.event_staffing_ready(p_event uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select not exists (
    select 1 from public.staffing_requirement req
     where req.event_ref=p_event and req.tenant_id=public.current_tenant_id()
       and not (public.requirement_coverage(req.id)->>'covered')::boolean
  );
$$;

-- the event staffing summary + per-requirement detail + blockers
create or replace function public.event_staffing_summary(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); result jsonb;
begin
  perform 1 from public.event where id=p_event and tenant_id=v_tenant;
  if not found then return null; end if;

  with req as (
    select r.id, r.role, r.quantity, r.department, public.requirement_coverage(r.id) as cov
      from public.staffing_requirement r where r.event_ref=p_event and r.tenant_id=v_tenant
  )
  select jsonb_build_object(
    'total_requirements', (select count(*) from req),
    'covered',   (select count(*) from req where (cov->>'covered')::boolean),
    'partial',   (select count(*) from req where (cov->>'assigned')::int > 0 and not (cov->>'covered')::boolean),
    'uncovered', (select count(*) from req where (cov->>'assigned')::int = 0),
    'conflicts', (select coalesce(sum((cov->>'conflicts')::int),0) from req),
    'open_positions', (select coalesce(sum((cov->>'shortage')::int),0) from req),
    'readiness', case when (select count(*) from req)=0 then 'no_requirements'
                      when (select bool_and((cov->>'covered')::boolean) from req) then 'covered'
                      else 'incomplete' end,
    'requirements', (select coalesce(jsonb_agg(jsonb_build_object(
        'requirement_id', id, 'role', role, 'department', department, 'required', quantity,
        'assigned', (cov->>'assigned')::int, 'shortage', (cov->>'shortage')::int,
        'over', (cov->>'over')::int, 'conflicts', (cov->>'conflicts')::int,
        'covered', (cov->>'covered')::boolean,
        'assignees', (select coalesce(jsonb_agg(jsonb_build_object(
              'assignment_id', a.id, 'staff_ref', a.staff_ref,
              'staff_name', (select s.name from public.staff s where s.id=a.staff_ref),
              'window_start', a.window_start, 'window_end', a.window_end,
              'conflict', public.staff_overlap_count(a.staff_ref,a.window_start,a.window_end,a.id) > 0
            ) order by a.assigned_at), '[]'::jsonb)
          from public.staffing_assignment a
          where a.requirement_ref=req.id and a.tenant_id=v_tenant
            and not exists (select 1 from public.staffing_release r where r.assignment_ref=a.id))
      ) order by role), '[]'::jsonb) from req),
    'blockers', (select coalesce(jsonb_agg(jsonb_build_object(
        'what', role||' staffing', 'cause_ref', id, 'why', (cov->>'blocker'),
        'next_action', 'Assign staff to this role') order by role)
        filter (where (cov->>'blocker') is not null), '[]'::jsonb) from req)
  ) into result;
  return result;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname='authenticated') then
    grant execute on function public.staffing_assignment_active(uuid), public.staff_overlap_count(uuid,timestamptz,timestamptz,uuid),
      public.requirement_coverage(uuid), public.event_staffing_ready(uuid), public.event_staffing_summary(uuid) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname='app_user') then
    grant execute on function public.staffing_assignment_active(uuid), public.staff_overlap_count(uuid,timestamptz,timestamptz,uuid),
      public.requirement_coverage(uuid), public.event_staffing_ready(uuid), public.event_staffing_summary(uuid) to app_user;
  end if;
end $$;

-- eligible_staff: the tenant's active roster, for the assignment picker (tenant-scoped)
create or replace function public.eligible_staff(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id();
begin
  perform 1 from public.event where id=p_event and tenant_id=v_tenant;
  if not found then return null; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by sort_order, name), '[]'::jsonb)
            from public.staff where tenant_id=v_tenant and active);
end $$;
grant execute on function public.eligible_staff(uuid) to authenticated;
