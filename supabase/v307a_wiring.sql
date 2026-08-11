-- ============================================================================
-- v307a · CEREMONY WIRING — consume the frozen v306 admissibility authority
-- File:  supabase/v307a_wiring.sql   ·   min_release v306   ·   apply after v306
--
-- INTEGRATION / EQUIVALENCE SLICE — NOT a semantic-authority change.
-- Each of the seven ceremonies is CREATE OR REPLACE'd to source its S/A refusal
-- from public.admissibility_evaluate (the frozen v306 authority, 6225a34)
-- instead of its own inline conditions. Externally observable behavior — success
-- results, refusal codes, rendered grounds, first-failure precedence, tenant
-- isolation — is preserved. No Class-U closure (that is v307b); the existing
-- inline can_manage_staffing checks are kept verbatim. No occurrence-resolution
-- authority is pulled backward.
--
-- LOCKING_AND_CONCURRENCY_CONTRACT (frozen, binding) — preserved exactly:
--   1. Evaluators take no locks; they run AFTER the ceremony's lock is held.
--   2. CEREMONY_NOT_FOUND still arises from the ceremony's own `for update`
--      (start_service, close_event, release_event, release_occurrence,
--      assign_staff). The authority's rung 1 is a preview only; it does NOT
--      replace the locked lookup — the lock is taken first, then evaluate runs.
--   3. correct/release_staffing: existence stays UNLOCKED; the `for update` stays
--      on the derived staffing_requirement, in position (after existence, before
--      the authority read).
--   4. Y3: the staffing_requirement lock is unmoved — it is still the only guard
--      behind STAFFING_ALREADY_RELEASED (no unique index).
--   5. R1: RELEASE_ALREADY_RELEASED stays the write-time on-conflict, evaluated
--      by neither the authority nor a pre-check.
--   6. Full race set re-run.
--
-- The authority read observes the SAME relations the inline checks observed, at
-- the SAME point (after the lock), so no new stale-authority window is opened.
-- ============================================================================

begin;

do $preflight$
begin
  if to_regprocedure('public.v306_admissibility()') is null then
    raise exception 'V307A_PREFLIGHT_FAILED: v306 authority absent — v307a declares min_release v306';
  end if;
  if to_regprocedure('public.admissibility_evaluate(text, uuid, jsonb)') is null then
    raise exception 'V307A_PREFLIGHT_FAILED: admissibility_evaluate absent';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='v307a_wiring') then
    raise exception 'V307A_ALREADY_APPLIED';
  end if;
  -- the seven ceremonies must already exist (this release replaces them)
  if to_regprocedure('public.start_service(uuid, text)') is null
     or to_regprocedure('public.close_event(uuid, text, text)') is null
     or to_regprocedure('public.release_event(uuid, text, text, text, text)') is null
     or to_regprocedure('public.release_occurrence(uuid, text, text, text, text)') is null
     or to_regprocedure('public.assign_staff(uuid, uuid, timestamp with time zone, timestamp with time zone, text)') is null
     or to_regprocedure('public.correct_staffing_assignment(uuid, uuid, timestamp with time zone, timestamp with time zone, text, text)') is null
     or to_regprocedure('public.release_staffing_assignment(uuid, text, text)') is null then
    raise exception 'V307A_PREFLIGHT_FAILED: a target ceremony is absent';
  end if;
end
$preflight$;

-- ── start_service · event · lock owns CEREMONY_NOT_FOUND ────────────────────
create or replace function public.start_service(p_event uuid, p_actor text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_tenant uuid := public.current_tenant_id(); v_adm record;
begin
  perform 1 from public.event where id=p_event and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  select * into v_adm from public.admissibility_evaluate('start_service', p_event, null);
  if not v_adm.admissible then raise exception '%', v_adm.rendered_ground; end if;
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, p_event, 'service_start', p_actor, '{}'::jsonb);
  return jsonb_build_object('event_id', p_event, 'stage', public.event_stage(p_event));
end $function$;

-- ── close_event · event · Class-A closeout via supplied args ────────────────
create or replace function public.close_event(p_event uuid, p_actor text, p_closeout_override text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_tenant uuid := public.current_tenant_id(); v_adm record;
begin
  perform 1 from public.event where id=p_event and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  select * into v_adm from public.admissibility_evaluate('close_event', p_event,
           jsonb_build_object('p_closeout_override', p_closeout_override));
  if not v_adm.admissible then raise exception '%', v_adm.rendered_ground; end if;
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, p_event, 'event_closed', p_actor,
            jsonb_build_object('closeout_override', p_closeout_override,
              'seam','return/inspection/financial closeout enforced from v285+'));
  return jsonb_build_object('event_id', p_event, 'stage', public.event_stage(p_event));
end $function$;

-- ── release_event · bookings · ladder ends at the seam, then delegates ──────
create or replace function public.release_event(p_booking uuid, p_actor text,
    p_signoff_ref text default null, p_clearance_ref text default null, p_waiver_ref text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_tenant uuid := public.current_tenant_id(); v_adm record; v_occ uuid; v_n int; v_ord int;
begin
  perform 1 from public.bookings where id = p_booking and tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  -- authority owns rung 1 (exists, preview) + rung 2 (RELEASE_OCCURRENCE_AMBIGUOUS)
  select * into v_adm from public.admissibility_evaluate('release_event', p_booking);
  if not v_adm.admissible then raise exception '%', v_adm.rendered_ground; end if;
  -- admissible-so-far (evaluation_complete=false): resolve or declare the single
  -- occurrence and delegate the occurrence-level authority to release_occurrence.
  select count(*) into v_n from public.engagement_occurrence
   where booking_id = p_booking and tenant_id = v_tenant;
  if v_n = 1 then
    select id into v_occ from public.engagement_occurrence
     where booking_id = p_booking and tenant_id = v_tenant;
  else
    select coalesce(max(ordinal), 0) + 1 into v_ord from public.engagement_occurrence
     where booking_id = p_booking and tenant_id = v_tenant;
    insert into public.engagement_occurrence
        (tenant_id, booking_id, ordinal, open_basis, opened_by)
      values (v_tenant, p_booking, v_ord, 'release_implied', p_actor)
      returning id into v_occ;
  end if;
  return public.release_occurrence(v_occ, p_actor, p_signoff_ref, p_clearance_ref, p_waiver_ref);
end $function$;

-- ── release_occurrence · engagement_occurrence · W guard stays write-time ───
create or replace function public.release_occurrence(p_occurrence uuid, p_actor text,
    p_signoff_ref text default null, p_clearance_ref text default null, p_waiver_ref text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_tenant uuid := public.current_tenant_id();
  v_adm record; v_occ record; v_acc uuid; v_event uuid; v_gen integer;
begin
  select * into v_occ from public.engagement_occurrence
   where id = p_occurrence and tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  -- authority owns rungs 2..5 (active, commitment, clearance, sign_off) in order
  select * into v_adm from public.admissibility_evaluate('release_occurrence', p_occurrence,
           jsonb_build_object('p_signoff_ref', p_signoff_ref,
                              'p_clearance_ref', p_clearance_ref,
                              'p_waiver_ref', p_waiver_ref));
  if not v_adm.admissible then raise exception '%', v_adm.rendered_ground; end if;
  -- the acceptance the authority confirmed (rung 3) anchors the materialisation
  select a.id into v_acc
    from public.offer_acceptances a
    left join public.acceptance_rescissions r on r.acceptance_id = a.id
   where a.booking_id = v_occ.booking_id and a.tenant_id = v_tenant and r.id is null
   order by a.created_at limit 1;
  -- M-A guard (Fable v307a audit): rescind_acceptance shares no lock with this
  -- ceremony, so a rescission can commit between admissibility_evaluate's read
  -- and this re-select. Without this guard that window escaped as a raw 23502
  -- (origin_commitment_ref is NOT NULL) instead of the ceremony's vocabulary.
  -- This preserves the pre-v307a behavior at the re-read; it is NOT a second
  -- admissibility authority — the S/A predicate remains the evaluator's.
  if v_acc is null then
    raise exception 'RELEASE_PREDICATE_UNSATISFIED: commitment (no unrescinded acceptance)';
  end if;
  -- MATERIALIZE once per OCCURRENCE (I-31′); W guard is the write-time conflict (R1)
  insert into public.event (tenant_id, engagement_ref, occurrence_ref,
                            origin_commitment_ref, released_by)
    values (v_tenant, v_occ.booking_id, p_occurrence, v_acc, p_actor)
    on conflict (tenant_id, occurrence_ref) do nothing
    returning id into v_event;
  if v_event is null then raise exception 'RELEASE_ALREADY_RELEASED'; end if;
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_event, 'released', p_actor, jsonb_build_object('acceptance', v_acc));
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_event, 'sign_off', p_actor, jsonb_build_object('signoff_ref', p_signoff_ref));
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_event, 'clearance', p_actor,
            case when p_waiver_ref is not null
                 then jsonb_build_object('waiver_ref', p_waiver_ref)
                 else jsonb_build_object('clearance_ref', p_clearance_ref) end);
  v_gen := public.generate_obligations(v_event);
  return jsonb_build_object('event_id', v_event, 'occurrence_id', p_occurrence,
                            'generated_count', v_gen);
end $function$;

-- ── assign_staff · staffing_requirement · U kept inline; rung-1 lock ────────
create or replace function public.assign_staff(p_requirement uuid, p_staff uuid,
    p_window_start timestamp with time zone, p_window_end timestamp with time zone, p_actor text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_tenant uuid := public.current_tenant_id(); v_event uuid; v_role text; v_id uuid; v_adm record;
begin
  if not public.can_manage_staffing() then raise exception 'STAFFING_NOT_AUTHORIZED'; end if;  -- Class-U (v307b)
  select event_ref, role into v_event, v_role from public.staffing_requirement
    where id=p_requirement and tenant_id=v_tenant for update;                                  -- resolve + lock
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  select * into v_adm from public.admissibility_evaluate('assign_staff', p_requirement,
           jsonb_build_object('p_staff', p_staff,
                              'p_window_start', p_window_start::text,
                              'p_window_end', p_window_end::text));
  if not v_adm.admissible then raise exception '%', v_adm.rendered_ground; end if;
  insert into public.staffing_assignment
      (tenant_id,event_ref,requirement_ref,staff_ref,role,window_start,window_end,assigned_by)
    values (v_tenant,v_event,p_requirement,p_staff,v_role,p_window_start,p_window_end,p_actor)
    returning id into v_id;
  return jsonb_build_object('assignment_id', v_id, 'coverage', public.requirement_coverage(p_requirement));
end $function$;

-- ── correct_staffing_assignment · unlocked existence, derived lock (Y2/Y3) ──
create or replace function public.correct_staffing_assignment(p_assignment uuid, p_new_staff uuid,
    p_window_start timestamp with time zone, p_window_end timestamp with time zone, p_actor text, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_tenant uuid := public.current_tenant_id(); v_req uuid; v_event uuid; v_role text; v_new uuid; v_adm record;
begin
  if not public.can_manage_staffing() then raise exception 'STAFFING_NOT_AUTHORIZED'; end if;  -- Class-U (v307b)
  select requirement_ref, event_ref, role into v_req, v_event, v_role from public.staffing_assignment
    where id=p_assignment and tenant_id=v_tenant;                                              -- UNLOCKED existence
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.staffing_requirement where id=v_req and tenant_id=v_tenant for update;  -- derived lock (Y3)
  select * into v_adm from public.admissibility_evaluate('correct_staffing_assignment', p_assignment,
           jsonb_build_object('p_new_staff', p_new_staff,
                              'p_window_start', p_window_start::text,
                              'p_window_end', p_window_end::text));
  if not v_adm.admissible then raise exception '%', v_adm.rendered_ground; end if;
  insert into public.staffing_release (tenant_id,assignment_ref,actor,reason)
    values (v_tenant,p_assignment,p_actor,coalesce('corrected: '||p_reason,'corrected'));
  insert into public.staffing_assignment
      (tenant_id,event_ref,requirement_ref,staff_ref,role,window_start,window_end,assigned_by)
    values (v_tenant,v_event,v_req,p_new_staff,v_role,p_window_start,p_window_end,p_actor)
    returning id into v_new;
  return jsonb_build_object('released', p_assignment, 'assignment_id', v_new, 'coverage', public.requirement_coverage(v_req));
end $function$;

-- ── release_staffing_assignment · unlocked existence, derived lock (Y2/Y3) ──
create or replace function public.release_staffing_assignment(p_assignment uuid, p_actor text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_tenant uuid := public.current_tenant_id(); v_req uuid; v_adm record;
begin
  if not public.can_manage_staffing() then raise exception 'STAFFING_NOT_AUTHORIZED'; end if;  -- Class-U (v307b)
  select requirement_ref into v_req from public.staffing_assignment where id=p_assignment and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;                               -- UNLOCKED existence
  perform 1 from public.staffing_requirement where id=v_req and tenant_id=v_tenant for update;  -- derived lock (Y3)
  select * into v_adm from public.admissibility_evaluate('release_staffing_assignment', p_assignment);
  if not v_adm.admissible then raise exception '%', v_adm.rendered_ground; end if;
  insert into public.staffing_release (tenant_id,assignment_ref,actor,reason) values (v_tenant,p_assignment,p_actor,p_reason);
  return jsonb_build_object('released', p_assignment, 'coverage', public.requirement_coverage(v_req));
end $function$;

-- ── deployed marker ─────────────────────────────────────────────────────────
create function public.v307a_wiring() returns text
language sql immutable as $$ select 'v307a' $$;

commit;
