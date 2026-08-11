-- ============================================================================
-- v306 · ADMISSIBILITY AUTHORITY  (C1 / R-14, as amended by Amendment Four)
-- File:  supabase/v306_admissibility.sql
-- Apply: after v305_execution_facts.sql
--
-- Strictly additive and UNWIRED. Every object below is new. No existing
-- function, view, trigger, policy, constraint or client path is altered, no
-- data migrates, and nothing calls any object defined here. The differential
-- suite proves the authority is CORRECT; the no-reference proof proves the
-- release is INERT. Both are required and they prove different things.
--
-- ── WHAT THIS IS ────────────────────────────────────────────────────────────
-- One shared, ordered admissibility authority over the seven ceremonies, so
-- that v307a can migrate ceremonies onto it and v308 can derive availability
-- from it without either restating a condition (R-14.2).
--
-- ── TRUTH VERSUS ORDER — Amendment Four, Article B (R-14.6) ─────────────────
-- Admissibility TRUTH is conjunctive. `admissible` is true iff every evaluated
-- in-scope rung passes; that is exactly the conjunction R-14.1 defines. The
-- ladder's ORDER decides only WHICH failed rung is reported as the canonical
-- `failed_ordinal` / `refusal_code` / `rendered_ground` when the conjunction is
-- false. Reordering rungs can never change whether an act is admissible — it
-- can only change which of several true failures is named. Short-circuiting is
-- an evaluation strategy over a conjunction, not a different rule.
--
-- ── THE FOUR CONDITION CLASSES — Amendment Four, Article A ──────────────────
--   S  state/admissibility predicate  — evaluable from (tenant, subject, moment)
--   A  required act argument          — needs the proposed act's arguments
--   U  authority                      — NOT evaluated here; ordinal 0 reserved
--   W  write-time guard               — NOT evaluated here; never predicts a write
--
-- ── THE CLASS-U VERSION BOUNDARY — Amendment Four, Article C ────────────────
-- v306 evaluates S and A only. `admissible` returned here IS NOT the complete
-- C1 availability verdict and MUST NOT be documented, named or consumed as
-- such. Class-U rungs are declared at ordinal 0 and carry in_scope_v306=false.
-- v307b seats Class-U at that reserved ordinal — reserving it now means that
-- seating renumbers no rung and invalidates no order proof. v308 may expose
-- availability as consumer/UI authority only after v307b exists.
--
-- ── THE WRITE-GUARD MODEL — owner ruling R1, Amendment Four Article A ───────
-- Exactly one W condition exists: RELEASE_ALREADY_RELEASED, enforced by the
-- real `on conflict (tenant_id, occurrence_ref)` in release_occurrence. It is
-- carried in the ladder for completeness and preview mapping and is NEVER
-- evaluated. No readable precheck can prove a subsequent write will succeed
-- under concurrency, and this authority does not pretend otherwise.
--
-- ── EVALUATORS TAKE NO LOCKS ────────────────────────────────────────────────
-- Every evaluator is observational. The ladder records where each ceremony's
-- serialization point sits (`serialization_after_ordinal`,
-- `serialization_relation`) as metadata binding on v307a — notably that
-- correct_staffing_assignment and release_staffing_assignment check existence
-- UNLOCKED and lock the DERIVED staffing_requirement afterwards (Y2), and that
-- STAFFING_ALREADY_RELEASED has no unique index behind it, so that lock is its
-- only protection against double release (Y3).
--
-- ── GROUND CONTRACT (R5) ────────────────────────────────────────────────────
-- `ground` carries structured operands only; `rendered_ground` reproduces the
-- ceremony's message byte-for-byte. Four templates are operand-bearing; three
-- static RELEASE_PREDICATE_UNSATISFIED variants must not collapse into one.
--
-- READ-PURE. No object writes. Returns no row for an unknown action key.
-- ============================================================================

begin;

do $preflight$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'v306_admissibility') then
    raise exception 'V306_ALREADY_APPLIED';
  end if;

  -- every new object must be absent; v306 replaces nothing
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('admissibility_ladder','admissibility_subject_visible',
                                  'admissibility_execution_fact','admissibility_commitment_facts',
                                  'admissibility_obligation_pending','admissibility_assignment_state',
                                  'admissibility_argument_valid','admissibility_render_ground',
                                  'admissibility_evaluate','admissibility_required_arguments')) then
    raise exception 'V306_PREFLIGHT_FAILED: an admissibility object already exists — v306 is additive and replaces nothing';
  end if;

  -- relations the evaluators read
  if to_regclass('public.execution_evidence')    is null then raise exception 'V306_PREFLIGHT_FAILED: execution_evidence absent';    end if;
  if to_regclass('public.obligation')            is null then raise exception 'V306_PREFLIGHT_FAILED: obligation absent';            end if;
  if to_regclass('public.engagement_occurrence') is null then raise exception 'V306_PREFLIGHT_FAILED: engagement_occurrence absent'; end if;
  if to_regclass('public.staffing_requirement')  is null then raise exception 'V306_PREFLIGHT_FAILED: staffing_requirement absent';  end if;
  if to_regclass('public.staffing_assignment')   is null then raise exception 'V306_PREFLIGHT_FAILED: staffing_assignment absent';   end if;
  if to_regclass('public.staffing_release')      is null then raise exception 'V306_PREFLIGHT_FAILED: staffing_release absent';      end if;

  -- helpers the evaluators reuse rather than restate (R-14.2)
  if to_regprocedure('public.current_tenant_id()') is null then
    raise exception 'V306_PREFLIGHT_FAILED: current_tenant_id absent';
  end if;
  if to_regprocedure('public.occurrence_is_active(uuid, timestamp with time zone)') is null then
    raise exception 'V306_PREFLIGHT_FAILED: occurrence_is_active NOT at the captured identity';
  end if;
  if to_regprocedure('public.obligation_state(uuid)') is null then
    raise exception 'V306_PREFLIGHT_FAILED: obligation_state NOT at the captured identity';
  end if;
  if to_regprocedure('public.event_staffing_ready(uuid)') is null then
    raise exception 'V306_PREFLIGHT_FAILED: event_staffing_ready NOT at the captured identity';
  end if;
  if to_regprocedure('public.v305_execution_facts()') is null then
    raise exception 'V306_PREFLIGHT_FAILED: v305 is not applied — v306 declares min_release v305';
  end if;
end
$preflight$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1 · THE LADDER — the authority, deployment-fixed (owner ruling R3)
--
-- IMMUTABLE over literal VALUES rather than a table: the authority must be
-- git-diffable, manifest-addressable and not silently mutable through DML.
-- Follows the existing action_registry()/action_required_fields() convention.
--
-- Ordinal 0 is RESERVED for Class-U in every action. Where a ceremony already
-- enforces authority first, the U rung is declared at 0 with in_scope_v306
-- false; where it does not, ordinal 0 is simply unoccupied and v307b fills it.
-- ════════════════════════════════════════════════════════════════════════════
create function public.admissibility_ladder()
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
    ('release_event',1,'booking_exists','S','visibility',true,
     'CEREMONY_NOT_FOUND','stale_target','CEREMONY_NOT_FOUND',
     'bookings',null,null,true,1,'bookings'),
    ('release_event',2,'single_occurrence','S','commitment',true,
     'RELEASE_OCCURRENCE_AMBIGUOUS','blocked',
     'RELEASE_OCCURRENCE_AMBIGUOUS: engagement holds %s occurrences (%s); call release_occurrence',
     'bookings',null,null,true,1,'bookings'),

    -- ── release_occurrence · subject engagement_occurrence ─────────────────
    -- clearance precedes sign_off in the ceremony body; the order is load-bearing
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
  'v306 · the ordered admissibility authority. Order selects the canonical reported failure only; truth is the conjunction of in-scope rungs (R-14.6). Ordinal 0 reserved for Class-U (v307b).';

-- ════════════════════════════════════════════════════════════════════════════
-- 2 · EVALUATOR FAMILY 1 · VISIBILITY
-- Subject exists and is visible in the caller's tenant. Absent and cross-tenant
-- must be INDISTINGUISHABLE — both return false, no existence leak (I-40).
-- ════════════════════════════════════════════════════════════════════════════
create function public.admissibility_subject_visible(p_subject_type text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_tenant uuid := public.current_tenant_id(); v_found boolean := false;
begin
  if p_id is null then return false; end if;
  case p_subject_type
    when 'event' then
      select exists(select 1 from public.event where id=p_id and tenant_id=v_tenant) into v_found;
    when 'bookings' then
      select exists(select 1 from public.bookings where id=p_id and tenant_id=v_tenant) into v_found;
    when 'engagement_occurrence' then
      select exists(select 1 from public.engagement_occurrence where id=p_id and tenant_id=v_tenant) into v_found;
    when 'staffing_requirement' then
      select exists(select 1 from public.staffing_requirement where id=p_id and tenant_id=v_tenant) into v_found;
    when 'staffing_assignment' then
      select exists(select 1 from public.staffing_assignment where id=p_id and tenant_id=v_tenant) into v_found;
    else
      v_found := false;
  end case;
  return v_found;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3 · EVALUATOR FAMILY 2 · EXECUTION-FACT PRESENCE
-- Reads execution_evidence for the event derived from the subject.
-- subject_path carries the derivation, so no action-specific logic escapes into
-- v307/v308 consumers.
-- ════════════════════════════════════════════════════════════════════════════
create function public.admissibility_execution_fact(p_subject_type text, p_subject uuid, p_kind text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_tenant uuid := public.current_tenant_id(); v_event uuid;
begin
  v_event := case p_subject_type
    when 'event' then p_subject
    when 'staffing_requirement' then
      (select event_ref from public.staffing_requirement where id=p_subject and tenant_id=v_tenant)
    when 'staffing_assignment' then
      (select r.event_ref from public.staffing_assignment a
         join public.staffing_requirement r on r.id = a.requirement_ref and r.tenant_id = v_tenant
        where a.id=p_subject and a.tenant_id=v_tenant)
    else null
  end;
  if v_event is null then return false; end if;
  return exists(select 1 from public.execution_evidence
                 where event_ref=v_event and tenant_id=v_tenant and kind=p_kind);
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4 · EVALUATOR FAMILY 3 · COMMITMENT / OCCURRENCE
-- Serves release_event's occurrence count and release_occurrence's activity and
-- acceptance rungs. Returns operands as well as the verdict so the ground
-- contract can carry counts without a second query.
-- ════════════════════════════════════════════════════════════════════════════
create function public.admissibility_commitment_facts(p_subject_type text, p_subject uuid)
returns table(occurrence_count int, occurrence_ordinals text, is_active boolean, has_acceptance boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_tenant uuid := public.current_tenant_id(); v_booking uuid;
begin
  occurrence_count := 0; occurrence_ordinals := null;
  is_active := false;    has_acceptance := false;

  if p_subject_type = 'bookings' then
    select count(*)::int,
           (select string_agg(ordinal::text, ',' order by ordinal)
              from public.engagement_occurrence
             where booking_id=p_subject and tenant_id=v_tenant)
      into occurrence_count, occurrence_ordinals
      from public.engagement_occurrence
     where booking_id=p_subject and tenant_id=v_tenant;
    return next; return;
  end if;

  if p_subject_type = 'engagement_occurrence' then
    select booking_id into v_booking from public.engagement_occurrence
     where id=p_subject and tenant_id=v_tenant;
    if v_booking is null then return next; return; end if;
    is_active := public.occurrence_is_active(p_subject, now());
    has_acceptance := exists(
      select 1 from public.offer_acceptances a
        left join public.acceptance_rescissions r on r.acceptance_id = a.id
       where a.booking_id = v_booking and a.tenant_id = v_tenant and r.id is null);
    return next; return;
  end if;

  return next;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5 · EVALUATOR FAMILY 4 · OBLIGATION COUNTING
-- Returns the COUNT, not a boolean: the count is the ground operand, and
-- SERVICE_NOT_READY / CLOSE_BREAKDOWN_PENDING / CLOSE_EXCEPTION_OPEN all
-- reproduce it byte-for-byte. p_kinds null means "any kind";
-- p_exception_state selects the exception form used by close_event rung 5.
-- ════════════════════════════════════════════════════════════════════════════
create function public.admissibility_obligation_pending(
  p_event uuid, p_kinds text[], p_exception_state boolean default false)
returns int
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_tenant uuid := public.current_tenant_id(); v_n int;
begin
  if p_event is null then return 0; end if;
  if p_exception_state then
    select count(*)::int into v_n from public.obligation o
     where o.event_ref=p_event and o.tenant_id=v_tenant
       and public.obligation_state(o.id) = 'exception';
  else
    select count(*)::int into v_n from public.obligation o
     where o.event_ref=p_event and o.tenant_id=v_tenant
       and (p_kinds is null or o.kind = any(p_kinds))
       and public.obligation_state(o.id) not in ('complete','invalidated');
  end if;
  return coalesce(v_n, 0);
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6 · EVALUATOR FAMILY 5 · COVERAGE / ASSIGNMENT
-- Staffing coverage, staffing_release presence, and staff active.
-- ════════════════════════════════════════════════════════════════════════════
create function public.admissibility_assignment_state(
  p_subject_type text, p_subject uuid, p_probe text, p_arg uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_tenant uuid := public.current_tenant_id(); v_req uuid;
begin
  case p_probe
    when 'staffing_covered' then
      if p_subject is null then return false; end if;
      return public.event_staffing_ready(p_subject);

    when 'assignment_released' then
      -- rung passes when NOT released
      return not exists(select 1 from public.staffing_release
                         where assignment_ref = p_subject);

    when 'staff_active' then
      if p_arg is null then return false; end if;
      return exists(select 1 from public.staff
                     where id=p_arg and tenant_id=v_tenant and active);

    when 'live_assignment' then
      -- rung passes when there is NO live assignment for (requirement, staff)
      if p_arg is null then return false; end if;
      v_req := case p_subject_type
                 when 'staffing_requirement' then p_subject
                 else (select requirement_ref from public.staffing_assignment
                        where id=p_subject and tenant_id=v_tenant)
               end;
      return not exists(
        select 1 from public.staffing_assignment a
         where a.requirement_ref = v_req and a.staff_ref = p_arg and a.tenant_id = v_tenant
           and not exists (select 1 from public.staffing_release r where r.assignment_ref = a.id));

    else
      return false;
  end case;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7 · EVALUATOR FAMILY 6 · ARGUMENT WELL-FORMEDNESS
-- PURE and IMMUTABLE — no database read. Folding these into a STABLE state
-- evaluator would misdeclare volatility and force needless planner conservatism.
-- ════════════════════════════════════════════════════════════════════════════
create function public.admissibility_argument_valid(p_condition text, p_args jsonb)
returns boolean
language plpgsql
immutable
set search_path to 'public'
as $$
begin
  if p_args is null then return false; end if;
  case p_condition
    when 'closeout_override_supplied' then
      return (p_args ? 'p_closeout_override') and (p_args->>'p_closeout_override') is not null;
    when 'clearance_supplied' then
      return (p_args->>'p_clearance_ref') is not null or (p_args->>'p_waiver_ref') is not null;
    when 'signoff_supplied' then
      return (p_args->>'p_signoff_ref') is not null;
    when 'window_wellformed' then
      return (p_args->>'p_window_start') is not null
         and (p_args->>'p_window_end')   is not null
         and (p_args->>'p_window_end')::timestamptz > (p_args->>'p_window_start')::timestamptz;
    else
      return false;
  end case;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 8 · GROUND RENDERING
-- Substitutes operands positionally into the template. Byte-for-byte equality
-- with the ceremony message is the contract; a template with no operands
-- returns unchanged.
-- ════════════════════════════════════════════════════════════════════════════
create function public.admissibility_render_ground(p_template text, p_operands jsonb)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare v_out text := p_template; v_el jsonb;
begin
  if p_template is null then return null; end if;
  if p_operands is null or jsonb_typeof(p_operands) <> 'array' then return v_out; end if;
  for v_el in select value from jsonb_array_elements(p_operands) loop
    v_out := regexp_replace(v_out, '%s',
               coalesce(case when jsonb_typeof(v_el)='string' then v_el #>> '{}' else v_el::text end, ''),
               '');
  end loop;
  return v_out;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 9 · THE SHARED AUTHORITY
--
-- Evaluates the in-scope rungs of one action ladder in ordinal order.
--
-- TRUTH IS CONJUNCTIVE (R-14.6). `admissible` is true iff every EVALUATED rung
-- passes. Ordering decides only which failure is named when it is false.
--
-- p_args semantics — the absence of arguments is meaningful:
--   null      → Class-A rungs are SKIPPED, not failed, and named in
--               pending_arguments. This is v308's "unavailable-pending-argument"
--               and a direct implementation of R-14.5.
--   supplied  → Class-A rungs participate in ordered evaluation, which is what
--               v307a needs.
--
-- Class-U and Class-W rungs carry in_scope_v306=false and are never evaluated.
-- The value returned here is therefore NOT the complete C1 availability verdict
-- (Amendment Four, Article C).
-- ════════════════════════════════════════════════════════════════════════════
create function public.admissibility_evaluate(
  p_action_key text, p_subject uuid, p_args jsonb default null)
returns table(
  admissible        boolean,
  failed_ordinal    int,
  condition         text,
  condition_class   text,
  refusal_code      text,
  reason_code       text,
  ground            jsonb,
  rendered_ground   text,
  pending_arguments text[],
  evaluation_complete boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  r            record;
  v_pending    text[] := array[]::text[];
  v_pass       boolean;
  v_operands   jsonb;
  v_event      uuid;
  v_count      int;
  v_facts      record;
  v_any        boolean := false;
  v_delegates  text := null;
begin
  for r in select * from public.admissibility_ladder()
            where action_key = p_action_key
            order by ordinal loop
    v_any := true;
    -- capture the action's declared delegation from the authority (per-action
    -- constant); read before the in-scope skip so U/W-first actions still see it
    if r.delegates_to is not null then v_delegates := r.delegates_to; end if;

    -- U and W are declared, never evaluated
    if not r.in_scope_v306 then continue; end if;

    -- Class-A with no arguments: declare, do not judge (R-14.5)
    if r.condition_class = 'A' and p_args is null then
      v_pending := v_pending || r.argument_name;
      continue;
    end if;

    v_operands := null;
    v_pass     := false;

    case r.evaluator
      when 'visibility' then
        v_pass := public.admissibility_subject_visible(r.subject_type, p_subject) = r.polarity;

      when 'execution_fact' then
        v_pass := public.admissibility_execution_fact(
                    r.subject_type, p_subject,
                    split_part(r.subject_path, ':', greatest(1, array_length(string_to_array(r.subject_path, ':'),1)))
                  ) = r.polarity;

      when 'obligation_count' then
        v_event := case r.subject_type when 'event' then p_subject else null end;
        if r.subject_path = '*exception' then
          v_count := public.admissibility_obligation_pending(v_event, null, true);
        else
          v_count := public.admissibility_obligation_pending(
                       v_event, string_to_array(r.subject_path, ','), false);
        end if;
        v_pass := (v_count = 0);
        if not v_pass then v_operands := jsonb_build_array(v_count); end if;

      when 'commitment' then
        select * into v_facts from public.admissibility_commitment_facts(r.subject_type, p_subject);
        if r.condition = 'single_occurrence' then
          v_pass := (v_facts.occurrence_count <= 1);
          if not v_pass then
            v_operands := jsonb_build_array(v_facts.occurrence_count, v_facts.occurrence_ordinals);
          end if;
        elsif r.condition = 'occurrence_active' then
          v_pass := v_facts.is_active;
        elsif r.condition = 'unrescinded_acceptance' then
          v_pass := v_facts.has_acceptance;
        end if;

      when 'coverage' then
        v_pass := public.admissibility_assignment_state(
                    r.subject_type, p_subject, r.subject_path,
                    case when r.argument_name is null or p_args is null then null
                         else (p_args->>split_part(r.argument_name,'|',1))::uuid end);

      when 'argument' then
        v_pass := public.admissibility_argument_valid(r.condition, p_args);

      else
        v_pass := false;
    end case;

    if not v_pass then
      admissible        := false;
      failed_ordinal    := r.ordinal;
      condition         := r.condition;
      condition_class   := r.condition_class;
      refusal_code      := r.refusal_code;
      reason_code       := r.reason_code;
      ground            := coalesce(v_operands, '[]'::jsonb);
      rendered_ground   := public.admissibility_render_ground(r.ground_template, v_operands);
      pending_arguments := v_pending;
      -- a definitive refusal from evaluated authority is a COMPLETE verdict
      -- (ruling case 1: admissible=false, evaluation_complete=true)
      evaluation_complete := true;
      return next;
      return;
    end if;
  end loop;

  if not v_any then return; end if;   -- unknown action key: no row

  admissible        := true;
  failed_ordinal    := null;
  condition         := null;
  condition_class   := null;
  refusal_code      := null;
  reason_code       := null;
  ground            := null;
  rendered_ground   := null;
  pending_arguments := v_pending;
  -- COMPLETE only if this ladder covers the ceremony's full authority. When the
  -- action delegates (release_event -> release_occurrence) the admissible-so-far
  -- verdict is INCOMPLETE: no refusal was found in previewable authority, but
  -- the delegated occurrence-level authority was not evaluated here (ruling
  -- case 3: admissible=true, evaluation_complete=false). This is NOT a
  -- prediction the ceremony will succeed. v307b seats the delegated evaluation.
  evaluation_complete := (v_delegates is null);
  return next;
end $$;

comment on function public.admissibility_evaluate(text, uuid, jsonb) is
  'v306 · shared admissibility authority. UNWIRED. admissible is the conjunction of evaluated in-scope rungs and is NOT the complete C1 availability verdict: Class-U is reserved to v307b and Class-W is never evaluated. evaluation_complete (10-column contract, frozen-design addendum resolving Fable M-2): false means the action delegates authority this ladder does not evaluate (release_event -> release_occurrence), so admissible=true with evaluation_complete=false is admissible-so-far, NOT a prediction the ceremony will succeed. Evaluating a W condition does not predict that a write will succeed under concurrency.';

-- ════════════════════════════════════════════════════════════════════════════
-- 10 · CLASS-A DECLARATION (R-14.5)
-- Projects the ladder's A rungs. UNWIRED: action_required_fields is untouched
-- and keeps returning array[]::text[] for close_event and release_event.
-- ════════════════════════════════════════════════════════════════════════════
create function public.admissibility_required_arguments(p_action_key text)
returns jsonb
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'argument',     argument_name,
           'condition',    condition,
           'refusal_code', refusal_code,
           'ordinal',      ordinal) order by ordinal), '[]'::jsonb)
    from public.admissibility_ladder()
   where action_key = p_action_key and condition_class = 'A' and in_scope_v306
$$;

-- ── the deployed marker ─────────────────────────────────────────────────────
create function public.v306_admissibility() returns text
language sql immutable as $$ select 'v306' $$;

commit;

-- NO GRANT. New functions inherit the schema default, matching every prior
-- additive release; v306 is unwired and no consumer calls them.
