-- ============================================================================
-- v308 · AVAILABILITY DERIVES FROM THE PREDICATES        min_release v307b
-- File: supabase/v308_availability_derivation.sql  ·  apply after v307b
--
-- The preview stops holding its own copy of the law. `action_evaluate` becomes
-- the conjunction the ceremony actually performs:
--
--     Class-U authorization  ∧  admissibility_evaluate (Class-S / Class-A)
--
-- GOVERNING LAW. Availability must neither invent nor omit a condition enforced
-- by the actual ceremony. Every rung availability can block on is a rung the
-- authority declares; every rung the authority declares, availability observes.
--
-- ── THE CLASS-U MECHANISM (owner/architect ruling, 12 Aug 2026) ─────────────
-- Class-U stays DECLARED and is NOT evaluated by the generic S/A evaluator.
-- admissibility_evaluate and admissibility_ladder are untouched; all seven
-- ordinal-0 rungs keep in_scope_v306=false with a null evaluator. The U rung is
-- evaluated HERE, by availability_class_u(), from two sources that already
-- exist: public.action_authorized(text) supplies the truth value, and the
-- declared ordinal-0 ladder row supplies refusal_code / reason_code / ground.
-- No new action→authorizer mapping is created: v307b's ceremony authorizers
-- were themselves derived from action_authorized, so calling it reproduces the
-- ceremony predicate exactly. Amendment Four Article C requires Class-U to be
-- incorporated before availability is exposed; this is that incorporation.
--
-- ── ROUTINE ARGUMENT vs AUTHORIZED OVERRIDE (owner ruling, 12 Aug 2026) ─────
-- R-14.5 makes every Class-A rung "declared, not judged" in a no-argument
-- preview, so pending arguments alone cannot mean "unavailable" — that would
-- disable every action carrying an input. The ratified distinction, applied
-- from DECLARED DATA and never from an action name or from prose:
--
--   routine collectable argument — declared in action_required_fields. Its
--     absence in a no-argument preview does NOT disable the action; the
--     application collects it and supplies it at dispatch.
--   authorized override — a Class-A requirement with NO routine declaration.
--     Its absence DOES disable the action, as unavailable_pending_argument,
--     because nothing in the ordinary collection path will ever satisfy it.
--
-- p_closeout_override is an authorized override and is deliberately NOT
-- declared in action_required_fields. That single data decision — not a branch
-- on 'close_event' — is what produces close_event's unavailable_pending_argument
-- state while assign_staff, correct_staffing_assignment and release_event stay
-- available on their routine inputs.
--
-- ── THE | ALTERNATION (owner ruling, 12 Aug 2026) ───────────────────────────
-- The ceremony declares clearance as p_clearance_ref|p_waiver_ref, satisfied by
-- either. action_required_fields may now express the same alternation with the
-- same grammar the ladder already uses, and the dispatcher gate converges on
-- it: an ordinary entry stays individually required; an entry containing | is
-- satisfied by any one member. This REMOVES no requirement and ADDS none — it
-- stops the dispatcher imposing a rule stricter than the ceremony's. Both the
-- gate and the availability derivation read the grammar through the single
-- parser action_alternatives(), so they cannot acquire competing meanings.
--
-- ── THE FIVE DECLARED CORRECTIONS ───────────────────────────────────────────
-- 1 Y1  release_staffing_assignment no longer blocks on a closed event. Its
--       ladder declares rungs 0,1,2 only — no event_not_closed — because the
--       ceremony has no such check. assign_staff (rung 2) and
--       correct_staffing_assignment (rung 3) DO declare it and keep it.
-- 2 F3  start_service derives from the declared rungs. The v_pre_total > 0
--       requirement reached through event_stage was availability's own; the
--       ceremony never had it. Blocked-detail precedence becomes the ladder's.
-- 3 F8  release_event follows its declared delegation seam. Uniqueness comes
--       from rung 2; occurrence-active and unrescinded-acceptance come from the
--       delegated release_occurrence ladder. A partially released
--       multi-occurrence engagement is no longer globally already_completed.
-- 4     close_event surfaces its unresolved authorized override as
--       unavailable_pending_argument instead of advertising an action the
--       ceremony must refuse.
-- 5 R5  detail is the declared ground: structured operands in `ground`, and
--       rendered_ground reproducing the ceremony message byte-for-byte, in
--       place of hand-written competing strings.
-- Plus: action_reason_of's LIKE inference is retired for refusals the ladder
--       names, and retained verbatim for record_execution_evidence and every
--       non-ladder path. The dispatch vocabulary is PRESERVED: the ladder's
--       'blocked' maps to the legacy 'lawful_refusal' on that surface.
--
-- LEGACY PRESERVATION (Amendment Five). No capability is removed. The external
-- shapes of available_actions and event_available_actions are unchanged, the
-- six legacy reason codes survive, and waiver-only and clearance-only release
-- both keep working. Inventory item 15 (release_event argument collection) is
-- an ADD.
--
-- Successor migration only: CREATE OR REPLACE of four v279-era objects plus
-- five new functions and the marker. No frozen v306/v307a/v307b FILE or object
-- is modified. No table, index, trigger, policy or grant changes.
-- ============================================================================

begin;

do $preflight$
begin
  if to_regprocedure('public.v307b_class_u()') is null then
    raise exception 'V308_PREFLIGHT_FAILED: v307b absent — v308 declares min_release v307b';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='v308_availability') then
    raise exception 'V308_ALREADY_APPLIED';
  end if;
  -- the authority this release derives from
  if to_regprocedure('public.admissibility_evaluate(text, uuid, jsonb)') is null
     or to_regprocedure('public.admissibility_ladder()') is null then
    raise exception 'V308_PREFLIGHT_FAILED: the v306 authority is absent';
  end if;
  -- the canonical authorization binding the Class-U mechanism reuses
  if to_regprocedure('public.action_authorized(text)') is null then
    raise exception 'V308_PREFLIGHT_FAILED: action_authorized absent — the Class-U truth source must exist';
  end if;
  -- the v279-era surfaces this release replaces
  if to_regprocedure('public.action_evaluate(text, uuid)') is null
     or to_regprocedure('public.action_required_fields(text)') is null
     or to_regprocedure('public.action_reason_of(text)') is null
     or to_regprocedure('public.perform_event_action(text, uuid, jsonb, text)') is null
     or to_regprocedure('public.action_registry()') is null
     or to_regprocedure('public.action_target_status(text, uuid)') is null then
    raise exception 'V308_PREFLIGHT_FAILED: a v279 action-routing surface is absent';
  end if;
end
$preflight$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1 · THE ALTERNATION GRAMMAR — one parser, two consumers
-- The dispatcher gate and the availability derivation both read | through this
-- function, so the grammar has exactly one meaning in the database.
-- ════════════════════════════════════════════════════════════════════════════
create function public.action_alternatives(p_entry text)
returns text[]
language sql
immutable
as $$
  select coalesce(
    (select array_agg(btrim(x) order by ord)
       from unnest(string_to_array(coalesce(p_entry,''), '|')) with ordinality as t(x, ord)
      where btrim(x) <> ''),
    array[]::text[]);
$$;

comment on function public.action_alternatives(text) is
  'v308 · the single owner of the | alternation grammar. An entry without | yields one member; an entry with | yields its alternatives. Used by BOTH perform_event_action''s required-field gate and action_evaluate''s routine-argument test so the two cannot diverge.';

-- ── the required-field gate, alternation-aware ──────────────────────────────
-- Ordinary entry: individually required. | group: satisfied by any one member.
-- Returns the unsatisfied entries as declared, or null when all are satisfied.
create function public.action_missing_required(p_action_key text, p_payload jsonb)
returns text
language sql
stable
set search_path to 'public'
as $$
  select string_agg(entry, ', ' order by entry)
    from unnest(public.action_required_fields(p_action_key)) entry
   where not exists (
     select 1 from unnest(public.action_alternatives(entry)) alt
      where (coalesce(p_payload,'{}'::jsonb) ? alt)
        and coalesce(coalesce(p_payload,'{}'::jsonb)->>alt,'') <> '');
$$;

comment on function public.action_missing_required(text, jsonb) is
  'v308 · required-field validation converged on the ceremony''s own semantics. An entry containing | is an alternative group satisfied by any one member, matching admissibility_argument_valid''s or-semantics for clearance_supplied; an ordinary entry remains individually required. This never adds a requirement — it stops the dispatcher enforcing a stricter rule than the ceremony owns.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2 · THE CLASS-U MECHANISM
-- Evaluates the DECLARED ordinal-0 rung without teaching the S/A evaluator to.
-- `declared` is false for a registered action with no ladder U rung (today:
-- record_execution_evidence), which keeps the v279 vocabulary on that path.
-- ════════════════════════════════════════════════════════════════════════════
create function public.availability_class_u(p_action_key text)
returns table(authorized boolean, declared boolean, refusal_code text,
              reason_code text, rendered_ground text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.action_authorized(p_action_key),
         (u.action_key is not null),
         u.refusal_code,
         coalesce(u.reason_code, 'unauthorized'),
         coalesce(public.admissibility_render_ground(u.ground_template, null),
                  'actor not authorized for this action')
    from (select 1) z
    left join lateral (
      select l.action_key, l.refusal_code, l.reason_code, l.ground_template
        from public.admissibility_ladder() l
       where l.action_key = p_action_key
         and l.condition_class = 'U'
         and l.ordinal = 0
       limit 1
    ) u on true;
$$;

comment on function public.availability_class_u(text) is
  'v308 · the Class-U availability mechanism. Truth from the canonical public.action_authorized(text) — the same binding v307b derived its ceremony authorizers from — and vocabulary from the declared ordinal-0 Class-U ladder row. admissibility_evaluate is neither called nor modified: Class-U remains declared and unevaluated by the S/A authority (Amendment Four Article C).';

-- ── the declared delegation seam ────────────────────────────────────────────
-- Resolves the subject of a declared delegates_to seam. The sole declared seam
-- is release_event -> release_occurrence, whose subject_type is
-- engagement_occurrence under a bookings subject. Returns null when the
-- ceremony would CREATE the occurrence (zero existing), because there is no
-- subject to evaluate and the authority has already admitted the action so far.
create function public.availability_delegated_subject(p_action_key text, p_subject uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_deleg text; v_from text; v_to text; v_tenant uuid := public.current_tenant_id(); v_n int; v_occ uuid;
begin
  select l.delegates_to, l.subject_type into v_deleg, v_from
    from public.admissibility_ladder() l
   where l.action_key = p_action_key and l.delegates_to is not null
   limit 1;
  if v_deleg is null then return null; end if;

  select l.subject_type into v_to
    from public.admissibility_ladder() l where l.action_key = v_deleg limit 1;

  if v_from = 'bookings' and v_to = 'engagement_occurrence' then
    select count(*)::int into v_n from public.engagement_occurrence
     where booking_id = p_subject and tenant_id = v_tenant;
    if v_n <> 1 then return null; end if;
    select id into v_occ from public.engagement_occurrence
     where booking_id = p_subject and tenant_id = v_tenant;
    return v_occ;
  end if;

  return null;
end $$;

comment on function public.availability_delegated_subject(text, uuid) is
  'v308 · resolves the subject of a DECLARED delegates_to seam so availability can observe the delegated ladder. Mirrors the ceremony''s own resolution (release_event resolves the single occurrence and delegates); returns null where the ceremony would create the occurrence, since no subject exists to evaluate.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3 · ROUTINE REQUIREMENTS — completed for the Class-A predicates
-- release_event gains the release ceremony's own arguments so the application
-- can collect them (inventory item 15, ADD). The clearance alternation is
-- declared with the ladder's grammar, so neither waiver-only nor clearance-only
-- release is restricted. close_event's p_closeout_override is DELIBERATELY
-- absent: it is an authorized override, not a routine collectable input.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.action_required_fields(p_action_key text)
returns text[] language sql immutable
as $$
  select case p_action_key
    when 'record_execution_evidence'   then array['kind']
    when 'assign_staff'                then array['staff','window_start','window_end']
    when 'correct_staffing_assignment' then array['new_staff','window_start','window_end','reason']
    when 'release_event'               then array['signoff_ref','clearance_ref|waiver_ref']
    else array[]::text[]
  end;
$$;

comment on function public.action_required_fields(text) is
  'v308 · routine collectable action inputs, declared. An entry containing | is an alternative group (see action_alternatives). close_event''s p_closeout_override is intentionally NOT declared here: it is an authorized override, and its absence is what yields unavailable_pending_argument.';

-- ════════════════════════════════════════════════════════════════════════════
-- 4 · AVAILABILITY — the ceremony conjunction
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.action_evaluate(p_action_key text, p_target_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  reg record; ts record; u record; e record; d record;
  v_ladder boolean; v_pending text[]; v_unmet text[];
  v_sub uuid; v_deleg text; base text; detail text := null;
begin
  select * into reg from public.action_registry() where action_key = p_action_key;
  if not found then
    return jsonb_build_object('available',false,'authorized',false,
      'reason_code','unknown_action','reason_detail',null);
  end if;

  select * into u from public.availability_class_u(p_action_key);

  select exists (select 1 from public.admissibility_ladder() l
                  where l.action_key = p_action_key and l.in_scope_v306)
    into v_ladder;

  -- ── no declared authority: the v279 derivation is PRESERVED verbatim ──────
  if not v_ladder then
    select * into ts from public.action_target_status(reg.target_type, p_target_id);
    if not ts.found then
      return jsonb_build_object('available',false,'authorized',u.authorized,
        'reason_code','stale_target','reason_detail','target not found in tenant');
    end if;
    base := 'available';
    if p_action_key = 'record_execution_evidence' then
      if public.event_stage(ts.event_ref) = 'closed' then
        base := 'blocked'; detail := 'event is closed';
      end if;
    end if;
    return jsonb_build_object(
      'available',    (base = 'available' and u.authorized),
      'authorized',   u.authorized,
      'reason_code',  case when not u.authorized then 'unauthorized' else base end,
      'reason_detail',case when not u.authorized
                           then 'actor not authorized for this action' else detail end);
  end if;

  -- ── Class-U at ordinal 0, exactly where the ceremony puts it ──────────────
  if not u.authorized then
    return jsonb_build_object('available',false,'authorized',false,
      'reason_code', u.reason_code, 'reason_detail', u.rendered_ground);
  end if;

  -- ── Class-S / Class-A from the shared authority ───────────────────────────
  select * into e from public.admissibility_evaluate(p_action_key, p_target_id, null);
  if not found then
    return jsonb_build_object('available',false,'authorized',true,
      'reason_code','stale_target','reason_detail','target not found in tenant');
  end if;
  if not e.admissible then
    return jsonb_build_object('available',false,'authorized',true,
      'reason_code', e.reason_code, 'reason_detail', e.rendered_ground);
  end if;
  v_pending := coalesce(e.pending_arguments, array[]::text[]);

  -- ── the declared delegation seam (M-2): observe the delegated ladder ──────
  if not e.evaluation_complete then
    select l.delegates_to into v_deleg from public.admissibility_ladder() l
     where l.action_key = p_action_key and l.delegates_to is not null limit 1;
    if v_deleg is not null then
      v_sub := public.availability_delegated_subject(p_action_key, p_target_id);
      if v_sub is not null then
        select * into d from public.admissibility_evaluate(v_deleg, v_sub, null);
        if found then
          if not d.admissible then
            return jsonb_build_object('available',false,'authorized',true,
              'reason_code', d.reason_code, 'reason_detail', d.rendered_ground);
          end if;
          v_pending := v_pending || coalesce(d.pending_arguments, array[]::text[]);
        end if;
      end if;
    end if;
  end if;

  -- ── routine argument vs authorized override (ratified 12 Aug 2026) ────────
  -- A pending Class-A argument is ROUTINE when any of its alternatives names a
  -- declared required field (itself possibly an alternative group). Routine
  -- absence never disables. A pending argument with no routine declaration is
  -- an authorized override and does.
  select coalesce(array_agg(distinct p), array[]::text[]) into v_unmet
    from unnest(v_pending) p
   where not exists (
     select 1
       from unnest(public.action_required_fields(p_action_key)) entry
       cross join lateral unnest(public.action_alternatives(entry)) field
       cross join lateral unnest(public.action_alternatives(p)) arg
      where field = regexp_replace(arg, '^p_', ''));

  if coalesce(array_length(v_unmet,1),0) > 0 then
    return jsonb_build_object('available',false,'authorized',true,
      'reason_code','unavailable_pending_argument',
      'reason_detail','authorized override required: '||array_to_string(v_unmet, ', '));
  end if;

  return jsonb_build_object('available',true,'authorized',true,
    'reason_code','available','reason_detail',null);
end $$;

comment on function public.action_evaluate(text, uuid) is
  'v308 · availability IS the ceremony conjunction: Class-U (availability_class_u, ordinal 0) then the declared Class-S/Class-A authority (admissibility_evaluate), following any declared delegates_to seam. It invents no condition and omits none. Routine Class-A inputs are declared in action_required_fields and do not disable an action when unsupplied to a no-argument preview; a Class-A requirement with no routine declaration is an authorized override and yields unavailable_pending_argument. Actions with no declared authority keep the v279 derivation unchanged.';

-- ════════════════════════════════════════════════════════════════════════════
-- 5 · REASON IDENTITY — declared, not inferred
-- The ladder names every refusal it owns, so the LIKE chain is retired for
-- those. It is retained verbatim for record_execution_evidence and every
-- non-ladder path. The legacy DISPATCH vocabulary is preserved: the ladder's
-- 'blocked' is reported as 'lawful_refusal' on this surface, exactly as before.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.action_reason_of(p_msg text)
returns text language sql stable set search_path to 'public'
as $$
  select coalesce(
    (select case l.reason_code when 'blocked' then 'lawful_refusal' else l.reason_code end
       from public.admissibility_ladder() l
      where p_msg like l.refusal_code || '%'
      order by length(l.refusal_code) desc
      limit 1),
    case
      when p_msg like '%NOT_AUTHORIZED%' then 'unauthorized'
      when p_msg like '%CEREMONY_NOT_FOUND%' then 'stale_target'
      when p_msg like '%ALREADY%' then 'already_completed'
      when p_msg like '%NOT_READY%' or p_msg like '%UNCOVERED%' or p_msg like '%PENDING%'
        or p_msg like '%PREDICATE%' or p_msg like '%NOT_IN_SERVICE%' or p_msg like '%CLOSED%'
        or p_msg like '%DUPLICATE%' or p_msg like '%INVALID%' then 'lawful_refusal'
      else 'lawful_refusal' end);
$$;

comment on function public.action_reason_of(text) is
  'v308 · declared reason identity. A refusal the ladder names resolves through its declared reason_code; everything else keeps the v279 LIKE inference verbatim. The legacy dispatch vocabulary is preserved — the ladder''s ''blocked'' reports as ''lawful_refusal'' here.';

-- ════════════════════════════════════════════════════════════════════════════
-- 6 · THE DISPATCHER — one converged gate, everything else byte-identical
-- Only the required-field validation block changes: it now calls
-- action_missing_required so that | means the same thing here as in the
-- availability derivation. Every other statement is the v279 body unchanged.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.perform_event_action(
  p_action_key text, p_target_id uuid, p_payload jsonb default '{}'::jsonb, p_idempotency_key text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  reg record; ts record; v_actor text; v_hash text; v_res jsonb; v_evid uuid;
  v_missing text; inv record; v_event uuid; f text;
begin
  if v_tenant is null then
    return public.action_envelope(false,p_action_key,'unauthorized','no_tenant','no authenticated tenant',null,p_target_id,null,null,p_idempotency_key);
  end if;
  select * into reg from public.action_registry() where action_key=p_action_key;
  if not found then
    return public.action_envelope(false,p_action_key,'unknown','unknown_action','no such registered action',null,p_target_id,null,null,p_idempotency_key);
  end if;
  p_payload := coalesce(p_payload,'{}'::jsonb);

  -- reject forbidden privileged payload fields (no client-supplied authority)
  foreach f in array array['tenant_id','tenant','role','actor_role','actor','__proto__'] loop
    if p_payload ? f then
      return public.action_envelope(false,p_action_key,'invalid','forbidden_field','payload may not carry authority fields',reg.target_type,p_target_id,null,null,p_idempotency_key);
    end if;
  end loop;

  -- required-field validation (v308: alternation-aware, one shared parser)
  v_missing := public.action_missing_required(p_action_key, p_payload);
  if v_missing is not null then
    return public.action_envelope(false,p_action_key,'invalid','missing_required','missing required: '||v_missing,reg.target_type,p_target_id,null,null,p_idempotency_key);
  end if;

  -- target ownership / staleness (cross-tenant resolves here as stale, no leak)
  select * into ts from public.action_target_status(reg.target_type, p_target_id);
  if not ts.found then
    return public.action_envelope(false,p_action_key,'stale','stale_target','target not found',reg.target_type,p_target_id,null,null,p_idempotency_key);
  end if;
  v_event := ts.event_ref;

  -- authority (advisory pre-check; the ceremony remains final)
  if not public.action_authorized(p_action_key) then
    return public.action_envelope(false,p_action_key,'unauthorized','unauthorized','actor not authorized',reg.target_type,p_target_id,null,null,p_idempotency_key);
  end if;

  v_actor := public.action_actor();
  v_hash := encode(extensions.digest(p_payload::text,'sha256'),'hex');

  -- idempotency pre-check (deterministic replay / mismatch)
  if p_idempotency_key is not null then
    select * into inv from public.action_invocation where tenant_id=v_tenant and idempotency_key=p_idempotency_key;
    if found then
      if inv.action_key<>p_action_key or inv.target_id<>p_target_id or inv.payload_hash<>v_hash then
        return public.action_envelope(false,p_action_key,'invalid','idempotency_mismatch','idempotency key reused with a different request',reg.target_type,p_target_id,null,null,p_idempotency_key);
      end if;
      return public.action_envelope(true,p_action_key,'duplicate','idempotent_replay','replayed prior result',reg.target_type,p_target_id,inv.result,inv.evidence_ref,p_idempotency_key);
    end if;
  end if;

  -- execute: pending-insert (serialize) → ceremony → persist success. Refusal rolls
  -- back the pending row (savepoint), so a failed attempt never burns the key.
  begin
    if p_idempotency_key is not null then
      begin
        insert into public.action_invocation(tenant_id,action_key,target_id,idempotency_key,payload_hash,actor,outcome)
          values (v_tenant,p_action_key,p_target_id,p_idempotency_key,v_hash,v_actor,'pending');
      exception when unique_violation then
        select * into inv from public.action_invocation where tenant_id=v_tenant and idempotency_key=p_idempotency_key;
        if inv.action_key<>p_action_key or inv.target_id<>p_target_id or inv.payload_hash<>v_hash then
          return public.action_envelope(false,p_action_key,'invalid','idempotency_mismatch','idempotency key reused with a different request',reg.target_type,p_target_id,null,null,p_idempotency_key);
        end if;
        return public.action_envelope(true,p_action_key,'duplicate','idempotent_replay','replayed prior result',reg.target_type,p_target_id,inv.result,inv.evidence_ref,p_idempotency_key);
      end;
    end if;

    -- typed dispatch to EXACTLY the one registered ceremony (no dynamic SQL)
    if    p_action_key='release_event' then
      v_res := public.release_event(p_target_id, v_actor, p_payload->>'signoff_ref', p_payload->>'clearance_ref', p_payload->>'waiver_ref');
      v_event := (v_res->>'event_id')::uuid;
    elsif p_action_key='start_service' then
      v_res := public.start_service(p_target_id, v_actor);
    elsif p_action_key='close_event' then
      v_res := public.close_event(p_target_id, v_actor, p_payload->>'closeout_override');
    elsif p_action_key='record_execution_evidence' then
      v_evid := public.record_execution_evidence(p_target_id, nullif(p_payload->>'obligation','')::uuid, p_payload->>'kind', v_actor,
                  coalesce(p_payload->'payload','{}'::jsonb), nullif(p_payload->>'prior','')::uuid);
      v_res := jsonb_build_object('evidence_id', v_evid);
    elsif p_action_key='assign_staff' then
      v_res := public.assign_staff(p_target_id, (p_payload->>'staff')::uuid, (p_payload->>'window_start')::timestamptz, (p_payload->>'window_end')::timestamptz, v_actor);
    elsif p_action_key='correct_staffing_assignment' then
      v_res := public.correct_staffing_assignment(p_target_id, (p_payload->>'new_staff')::uuid, (p_payload->>'window_start')::timestamptz, (p_payload->>'window_end')::timestamptz, v_actor, p_payload->>'reason');
    elsif p_action_key='release_staffing_assignment' then
      v_res := public.release_staffing_assignment(p_target_id, v_actor, p_payload->>'reason');
    end if;

    if p_idempotency_key is not null then
      update public.action_invocation set outcome='success', result=v_res, evidence_ref=v_evid
        where tenant_id=v_tenant and idempotency_key=p_idempotency_key;
    end if;

    return public.action_envelope(true,p_action_key,'success','ok','action executed',reg.target_type,p_target_id,v_res,v_evid,p_idempotency_key)
      || jsonb_build_object('workspace', case when v_event is not null then public.event_workspace(v_event) else null end,
                            'available_actions', case when v_event is not null then public.event_available_actions(v_event) else null end);

  exception when others then
    -- lawful ceremony refusal (or error): savepoint rolls back the pending row
    return public.action_envelope(false,p_action_key,'refused',public.action_reason_of(sqlerrm),sqlerrm,reg.target_type,p_target_id,null,null,p_idempotency_key);
  end;
end $$;

-- ── the deployed marker ─────────────────────────────────────────────────────
-- NO GRANT. New functions inherit the schema default, matching v306's precedent;
-- the replaced functions keep the grants v279 gave them.
create function public.v308_availability() returns text
language sql immutable as $$ select 'v308 · availability derives from the predicates'::text $$;

commit;
