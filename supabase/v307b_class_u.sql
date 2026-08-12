-- ============================================================================
-- v307b · CLASS-U CLOSURE — authorization for the four unauthorized ceremonies
-- File:  supabase/v307b_class_u.sql   ·   min_release v307a   ·   apply after v307a
--
-- Ruling v307b-R1: one canonical refusal family. The refusal CODE is
-- EXECUTION_NOT_AUTHORIZED; the ceremony identifier is rendered ground/detail.
--
-- Closes the Class-U gap for start_service, close_event, release_event and
-- release_occurrence with the authorizer the recon derived from existing
-- canonical authority (action_authorized + the release_promise wrapper
-- precedent): public.is_active_member(). Ceremony-local, FIRST statement,
-- pre-lock, default-deny — the exact staffing-trio pattern, so ordinal 0
-- outranks rung 1 (existence) as the ladder requires.
--
-- admissibility_evaluate IS NOT TOUCHED. The four new U rungs are DECLARED in
-- the ladder at reserved ordinal 0 with in_scope_v306=false — the seat the
-- frozen v306 design explicitly kept for v307b ("ordinal 0 is simply unoccupied
-- and v307b fills it") — and are enforced inline by the ceremonies, exactly as
-- the three staffing U rungs always were. Class-U therefore remains "declared,
-- never evaluated" to the v306 S/A authority (Amendment Four C, AS-10), and the
-- v306 differential semantics are unchanged by construction.
--
-- Successor migration only: CREATE OR REPLACE of five runtime objects
-- (admissibility_ladder + the four ceremonies) + one marker. No frozen v306 or
-- v307a FILE is modified; this is the same succession mechanism v307a used on
-- the v295-era ceremonies. Locks, Class-S/A behavior, success shapes, R1/Y3,
-- the M-A guard, and tenant boundaries are preserved line-for-line.
--
-- The membership-deactivation window (member deactivated between the U read
-- and the write) is INHERITED existing behavior, byte-identical to the frozen
-- staffing trio's — declared here, not redesigned (per ruling).
-- ============================================================================

begin;

do $preflight$
begin
  if to_regprocedure('public.v307a_wiring()') is null then
    raise exception 'V307B_PREFLIGHT_FAILED: v307a absent — v307b declares min_release v307a';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='v307b_class_u') then
    raise exception 'V307B_ALREADY_APPLIED';
  end if;
  if to_regprocedure('public.is_active_member()') is null then
    raise exception 'V307B_PREFLIGHT_FAILED: is_active_member absent — the derived authorizer must exist';
  end if;
end
$preflight$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1 · THE LADDER — successor revision: the four reserved ordinal-0 seats filled
-- with DECLARED (in_scope_v306=false) Class-U rungs. Every pre-existing rung is
-- byte-identical to the frozen v306 authority (M-2 delegates_to and the M-4
-- staffing_covered probe included). No ordinal renumbers; no order proof moves.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.admissibility_ladder()
returns table(
  action_key                   text,
  ordinal                      int,
  condition                    text,
  condition_class              text,   -- S | A | U | W
  evaluator                    text,   -- one of the six families
  polarity                     boolean,-- expected evaluator result for the rung to PASS
  refusal_code                 text,
  reason_code                  text,
  ground_template              text,
  subject_type                 text,
  subject_path                 text,   -- how the evaluator reaches its relation
  argument_name                text,   -- Class-A only
  in_scope_v306                boolean,
  serialization_after_ordinal  int,
  serialization_relation       text,
  delegates_to                 text
)
language sql
immutable
set search_path to 'public'
as $$
  -- delegates_to declares the authority-topology fact that an action's ladder
  -- ends at a seam and the ceremony delegates the remaining authority to another
  -- ladder. Null = this ladder covers the ceremony's full authority at the v306
  -- contract level. release_event ends at rung 2 (single_occurrence) and the
  -- ceremony delegates the occurrence-level authority to release_occurrence, so
  -- an admissible-so-far release_event verdict is NOT a complete evaluation. The
  -- evaluator reads this to set evaluation_complete — it is a DECLARED property
  -- of the action (keyed by action_key exactly as every other ladder fact is),
  -- not evaluator logic. Added under the frozen-design addendum resolving
  -- Fable M-2: the original 9-column contract could not express this distinction.
  select t.*,
         case when t.action_key = 'release_event' then 'release_occurrence' end
    from (values
    -- ── start_service · subject event · lock at the rung-1 statement ───────
    -- v307b: ordinal 0 filled — Class-U, ceremony-enforced (is_active_member),
    -- declared here for preview mapping and registry totality; never evaluated
    -- by the S/A authority.
    ('start_service',0,'action_authorized','U',null,null,
     'EXECUTION_NOT_AUTHORIZED','unauthorized','EXECUTION_NOT_AUTHORIZED: start_service',
     'event',null,null,false,1,'event'),
    ('start_service',1,'subject_exists','S','visibility',true,
     'CEREMONY_NOT_FOUND','stale_target','CEREMONY_NOT_FOUND',
     'event',null,null,true,1,'event'),
    ('start_service',2,'event_not_closed','S','execution_fact',false,
     'START_SERVICE_EVENT_CLOSED','already_completed','START_SERVICE_EVENT_CLOSED',
     'event','event_closed',null,true,1,'event'),
    ('start_service',3,'service_not_started','S','execution_fact',false,
     'SERVICE_ALREADY_STARTED','already_completed','SERVICE_ALREADY_STARTED',
     'event','service_start',null,true,1,'event'),
    ('start_service',4,'pre_service_obligations_resolved','S','obligation_count',true,
     'SERVICE_NOT_READY','blocked','SERVICE_NOT_READY: %s pre-service obligation(s) unresolved',
     'event','culinary_prepare,equipment_pull,staffing_assign,venue_setup',null,true,1,'event'),
    -- M-4 (found by the M-3 all-pass requirement): the coverage probe was null,
    -- so admissibility_assignment_state fell through to its else-branch and this
    -- rung always evaluated false — the authority could NEVER admit start_service.
    -- The probe name 'staffing_covered' dispatches to event_staffing_ready, per
    -- the frozen object plan ("Serves staffing + staffing_covered").
    ('start_service',5,'staffing_covered','S','coverage',true,
     'SERVICE_STAFFING_UNCOVERED','blocked','SERVICE_STAFFING_UNCOVERED: required staffing coverage is not met',
     'event','staffing_covered',null,true,1,'event'),

    -- ── close_event · subject event · lock at the rung-1 statement ─────────
    ('close_event',0,'action_authorized','U',null,null,
     'EXECUTION_NOT_AUTHORIZED','unauthorized','EXECUTION_NOT_AUTHORIZED: close_event',
     'event',null,null,false,1,'event'),
    ('close_event',1,'subject_exists','S','visibility',true,
     'CEREMONY_NOT_FOUND','stale_target','CEREMONY_NOT_FOUND',
     'event',null,null,true,1,'event'),
    ('close_event',2,'event_not_closed','S','execution_fact',false,
     'CLOSE_ALREADY_CLOSED','already_completed','CLOSE_ALREADY_CLOSED',
     'event','event_closed',null,true,1,'event'),
    -- polarity TRUE: the fact must be PRESENT for this rung to pass
    ('close_event',3,'service_started','S','execution_fact',true,
     'CLOSE_NOT_IN_SERVICE','blocked','CLOSE_NOT_IN_SERVICE',
     'event','service_start',null,true,1,'event'),
    ('close_event',4,'breakdown_resolved','S','obligation_count',true,
     'CLOSE_BREAKDOWN_PENDING','blocked','CLOSE_BREAKDOWN_PENDING: %s breakdown obligation(s) unresolved',
     'event','venue_breakdown',null,true,1,'event'),
    ('close_event',5,'no_open_exception','S','obligation_count',true,
     'CLOSE_EXCEPTION_OPEN','blocked','CLOSE_EXCEPTION_OPEN: %s unresolved exception(s)',
     'event','*exception',null,true,1,'event'),
    ('close_event',6,'closeout_override_supplied','A','argument',true,
     'CLOSE_CLOSEOUT_UNRESOLVED','blocked',
     'CLOSE_CLOSEOUT_UNRESOLVED: return/inspection/financial closeout not modeled until v285+; authorized override required',
     'event',null,'p_closeout_override',true,1,'event'),

    -- ── release_event · subject bookings · ladder ends at the seam (R2) ────
    ('release_event',0,'action_authorized','U',null,null,
     'EXECUTION_NOT_AUTHORIZED','unauthorized','EXECUTION_NOT_AUTHORIZED: release_event',
     'bookings',null,null,false,1,'bookings'),
    ('release_event',1,'booking_exists','S','visibility',true,
     'CEREMONY_NOT_FOUND','stale_target','CEREMONY_NOT_FOUND',
     'bookings',null,null,true,1,'bookings'),
    ('release_event',2,'single_occurrence','S','commitment',true,
     'RELEASE_OCCURRENCE_AMBIGUOUS','blocked',
     'RELEASE_OCCURRENCE_AMBIGUOUS: engagement holds %s occurrences (%s); call release_occurrence',
     'bookings',null,null,true,1,'bookings'),

    -- ── release_occurrence · subject engagement_occurrence ─────────────────
    -- clearance precedes sign_off in the ceremony body; the order is load-bearing
    ('release_occurrence',0,'action_authorized','U',null,null,
     'EXECUTION_NOT_AUTHORIZED','unauthorized','EXECUTION_NOT_AUTHORIZED: release_occurrence',
     'engagement_occurrence',null,null,false,1,'engagement_occurrence'),
    ('release_occurrence',1,'occurrence_exists','S','visibility',true,
     'CEREMONY_NOT_FOUND','stale_target','CEREMONY_NOT_FOUND',
     'engagement_occurrence',null,null,true,1,'engagement_occurrence'),
    ('release_occurrence',2,'occurrence_active','S','commitment',true,
     'OCCURRENCE_CANCELLED','blocked','OCCURRENCE_CANCELLED',
     'engagement_occurrence',null,null,true,1,'engagement_occurrence'),
    ('release_occurrence',3,'unrescinded_acceptance','S','commitment',true,
     'RELEASE_PREDICATE_UNSATISFIED','blocked',
     'RELEASE_PREDICATE_UNSATISFIED: commitment (no unrescinded acceptance)',
     'engagement_occurrence',null,null,true,1,'engagement_occurrence'),
    ('release_occurrence',4,'clearance_supplied','A','argument',true,
     'RELEASE_PREDICATE_UNSATISFIED','blocked',
     'RELEASE_PREDICATE_UNSATISFIED: clearance (no deposit/credit/waiver evidence)',
     'engagement_occurrence',null,'p_clearance_ref|p_waiver_ref',true,1,'engagement_occurrence'),
    ('release_occurrence',5,'signoff_supplied','A','argument',true,
     'RELEASE_PREDICATE_UNSATISFIED','blocked',
     'RELEASE_PREDICATE_UNSATISFIED: sign_off (no operator release attestation)',
     'engagement_occurrence',null,'p_signoff_ref',true,1,'engagement_occurrence'),
    -- W · never evaluated. Authority is the write-time on-conflict (R1).
    ('release_occurrence',6,'not_already_materialised','W',null,null,
     'RELEASE_ALREADY_RELEASED','already_completed','RELEASE_ALREADY_RELEASED',
     'engagement_occurrence',null,null,false,1,'engagement_occurrence'),

    -- ── assign_staff · subject staffing_requirement · U already at 0 ───────
    ('assign_staff',0,'action_authorized','U',null,null,
     'STAFFING_NOT_AUTHORIZED','unauthorized','STAFFING_NOT_AUTHORIZED',
     'staffing_requirement',null,null,false,1,'staffing_requirement'),
    ('assign_staff',1,'subject_exists','S','visibility',true,
     'CEREMONY_NOT_FOUND','stale_target','CEREMONY_NOT_FOUND',
     'staffing_requirement',null,null,true,1,'staffing_requirement'),
    ('assign_staff',2,'event_not_closed','S','execution_fact',false,
     'STAFFING_EVENT_CLOSED','blocked','STAFFING_EVENT_CLOSED',
     'staffing_requirement','requirement->event:event_closed',null,true,1,'staffing_requirement'),
    ('assign_staff',3,'staff_valid','A','coverage',true,
     'STAFFING_STAFF_INVALID','blocked','STAFFING_STAFF_INVALID',
     'staffing_requirement','staff_active','p_staff',true,1,'staffing_requirement'),
    ('assign_staff',4,'window_wellformed','A','argument',true,
     'STAFFING_WINDOW_INVALID','blocked','STAFFING_WINDOW_INVALID',
     'staffing_requirement',null,'p_window_start|p_window_end',true,1,'staffing_requirement'),
    ('assign_staff',5,'no_duplicate_assignment','A','coverage',true,
     'STAFFING_DUPLICATE_ASSIGNMENT','blocked','STAFFING_DUPLICATE_ASSIGNMENT',
     'staffing_requirement','live_assignment','p_staff',true,1,'staffing_requirement'),

    -- ── correct_staffing_assignment · subject staffing_assignment ──────────
    -- Y2: existence is checked UNLOCKED; the lock is taken on the DERIVED
    -- requirement AFTER rung 1 and BEFORE rung 2, and its not-found is unchecked.
    ('correct_staffing_assignment',0,'action_authorized','U',null,null,
     'STAFFING_NOT_AUTHORIZED','unauthorized','STAFFING_NOT_AUTHORIZED',
     'staffing_assignment',null,null,false,1,'staffing_requirement'),
    ('correct_staffing_assignment',1,'subject_exists','S','visibility',true,
     'CEREMONY_NOT_FOUND','stale_target','CEREMONY_NOT_FOUND',
     'staffing_assignment',null,null,true,1,'staffing_requirement'),
    -- Y3: no unique index behind this; the requirement lock is its only guard.
    ('correct_staffing_assignment',2,'not_already_released','S','coverage',true,
     'STAFFING_ALREADY_RELEASED','already_completed','STAFFING_ALREADY_RELEASED',
     'staffing_assignment','assignment_released',null,true,1,'staffing_requirement'),
    ('correct_staffing_assignment',3,'event_not_closed','S','execution_fact',false,
     'STAFFING_EVENT_CLOSED','blocked','STAFFING_EVENT_CLOSED',
     'staffing_assignment','assignment->requirement->event:event_closed',null,true,1,'staffing_requirement'),
    ('correct_staffing_assignment',4,'staff_valid','A','coverage',true,
     'STAFFING_STAFF_INVALID','blocked','STAFFING_STAFF_INVALID',
     'staffing_assignment','staff_active','p_new_staff',true,1,'staffing_requirement'),
    ('correct_staffing_assignment',5,'window_wellformed','A','argument',true,
     'STAFFING_WINDOW_INVALID','blocked','STAFFING_WINDOW_INVALID',
     'staffing_assignment',null,'p_window_start|p_window_end',true,1,'staffing_requirement'),
    -- Y4 recorded, NOT fixed: correct_staffing_assignment enforces no
    -- STAFFING_DUPLICATE_ASSIGNMENT rung where assign_staff does. Observed
    -- asymmetry; not v306's to tidy.

    -- ── release_staffing_assignment · subject staffing_assignment ──────────
    -- Y1: the ceremony has NO event_closed check. The current preview blocks on
    -- a closed event; that is the preview introducing a condition the ceremony
    -- does not have (R-14.3 forbids it). No such rung is declared here. v308
    -- corrects the preview; v306 changes no behaviour.
    ('release_staffing_assignment',0,'action_authorized','U',null,null,
     'STAFFING_NOT_AUTHORIZED','unauthorized','STAFFING_NOT_AUTHORIZED',
     'staffing_assignment',null,null,false,1,'staffing_requirement'),
    ('release_staffing_assignment',1,'subject_exists','S','visibility',true,
     'CEREMONY_NOT_FOUND','stale_target','CEREMONY_NOT_FOUND',
     'staffing_assignment',null,null,true,1,'staffing_requirement'),
    ('release_staffing_assignment',2,'not_already_released','S','coverage',true,
     'STAFFING_ALREADY_RELEASED','already_completed','STAFFING_ALREADY_RELEASED',
     'staffing_assignment','assignment_released',null,true,1,'staffing_requirement')
  ) as t(action_key, ordinal, condition, condition_class, evaluator, polarity,
         refusal_code, reason_code, ground_template, subject_type, subject_path,
         argument_name, in_scope_v306, serialization_after_ordinal, serialization_relation)
  order by action_key, ordinal
$$;

comment on function public.admissibility_ladder() is
  'v306 authority, v307b revision: the four reserved ordinal-0 Class-U seats are filled (EXECUTION_NOT_AUTHORIZED, ceremony-enforced via is_active_member, in_scope_v306=false — declared, never evaluated by the S/A authority). Order still selects only the canonical reported failure; truth is the conjunction of in-scope rungs (R-14.6).';

-- ════════════════════════════════════════════════════════════════════════════
-- 2 · THE FOUR CEREMONIES — v307a bodies verbatim + ONE new first statement:
-- the Class-U guard, pre-lock, default-deny (the staffing-trio pattern).
-- ════════════════════════════════════════════════════════════════════════════

-- ── start_service · U first, then the v307a body unchanged ──────────────────
create or replace function public.start_service(p_event uuid, p_actor text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_tenant uuid := public.current_tenant_id(); v_adm record;
begin
  if not public.is_active_member() then
    raise exception 'EXECUTION_NOT_AUTHORIZED: start_service';           -- Class-U (v307b)
  end if;
  perform 1 from public.event where id=p_event and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  select * into v_adm from public.admissibility_evaluate('start_service', p_event, null);
  if not v_adm.admissible then raise exception '%', v_adm.rendered_ground; end if;
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, p_event, 'service_start', p_actor, '{}'::jsonb);
  return jsonb_build_object('event_id', p_event, 'stage', public.event_stage(p_event));
end $function$;

-- ── close_event · U first, then the v307a body unchanged ────────────────────
create or replace function public.close_event(p_event uuid, p_actor text, p_closeout_override text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_tenant uuid := public.current_tenant_id(); v_adm record;
begin
  if not public.is_active_member() then
    raise exception 'EXECUTION_NOT_AUTHORIZED: close_event';             -- Class-U (v307b)
  end if;
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

-- ── release_event · U first, then the v307a body unchanged ──────────────────
create or replace function public.release_event(p_booking uuid, p_actor text,
    p_signoff_ref text default null, p_clearance_ref text default null, p_waiver_ref text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_tenant uuid := public.current_tenant_id(); v_adm record; v_occ uuid; v_n int; v_ord int;
begin
  if not public.is_active_member() then
    raise exception 'EXECUTION_NOT_AUTHORIZED: release_event';           -- Class-U (v307b)
  end if;
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

-- ── release_occurrence · U first, then the v307a body (incl. M-A guard) ─────
create or replace function public.release_occurrence(p_occurrence uuid, p_actor text,
    p_signoff_ref text default null, p_clearance_ref text default null, p_waiver_ref text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_tenant uuid := public.current_tenant_id();
  v_adm record; v_occ record; v_acc uuid; v_event uuid; v_gen integer;
begin
  if not public.is_active_member() then
    raise exception 'EXECUTION_NOT_AUTHORIZED: release_occurrence';      -- Class-U (v307b)
  end if;
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

-- ── deployed marker ─────────────────────────────────────────────────────────
create function public.v307b_class_u() returns text
language sql immutable as $$ select 'v307b' $$;

commit;
