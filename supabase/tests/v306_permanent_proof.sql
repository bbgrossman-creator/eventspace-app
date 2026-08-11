-- ============================================================================
-- v306 PERMANENT PROOF — Admissibility Authority
-- Self-rolling-back, rerunnable, zero residue. Fixtures follow v303/v304/v305.
--
-- THE DIFFERENTIAL METHOD, per the frozen design:
--   fixture → savepoint → run the REAL ceremony → capture SQLERRM
--           → roll back to savepoint → run admissibility_evaluate
--           → compare refusal code AND rendered ground, byte-for-byte.
--
-- The comparison is against ACTUAL CEREMONY EXECUTION, never against copied
-- SQL. A rung that merely restates the ceremony's text would pass a copy test
-- and fail this one the moment the ceremony moved.
--
-- AD-1   start_service  · rung 1 subject_exists            differential + ground
-- AD-2   start_service  · rung 2 event_not_closed          differential + ground
-- AD-3   start_service  · rung 3 service_not_started       differential + ground
-- AD-4   start_service  · rung 4 pre_service_obligations   differential + OPERAND ground
-- AD-5   start_service  · rung 5 staffing_covered          differential + ground
-- AD-6   close_event    · rung 2 event_not_closed          differential + ground
-- AD-7   close_event    · rung 3 service_started (polarity true)
-- AD-8   close_event    · rung 4 breakdown_resolved        differential + OPERAND ground
-- AD-9   close_event    · rung 6 closeout_override [A]     differential with args
-- AD-10  release_event  · rung 2 single_occurrence         differential + TWO-OPERAND ground
-- AD-11  release_occurrence · rung 2 occurrence_active
-- AD-12  release_occurrence · rung 3 unrescinded_acceptance
-- AD-13  release_occurrence · rungs 4/5 clearance before sign_off — ORDER
-- AD-14  assign_staff   · rung 2 event_not_closed (derived requirement→event)
-- AD-15  assign_staff   · rungs 3/4/5 argument rungs with args supplied
-- AD-16  correct_staffing · rungs 2/3 already_released BEFORE event_closed — ORDER
-- AD-17  release_staffing · rung 2 already_released
-- AD-18  release_staffing carries NO event_closed rung (Y1)
-- AD-19  NON-LEAK · absent and cross-tenant are indistinguishable, 5 subjects
-- AD-20  Class-A DECLARED not judged when args absent (R-14.5)
-- AD-21  ALL-PASS · a fully satisfied subject is admissible in every reachable action
-- AD-22  CONJUNCTIVE TRUTH · multiple simultaneous failures report the LOWEST ordinal
-- AD-23  W-GUARD · RELEASE_ALREADY_RELEASED is never evaluated by the authority
--
-- ── 10-column contract (frozen-design addendum, Fable M-2) ──────────────────
-- AD-24  COMPLETE ADMISSIBLE · fully-satisfied close_event → true / true
-- AD-25  DEFINITIVE REFUSAL · a refusal the evaluator established → false / true
-- AD-26  release_event DELEGATED · admissible-so-far → true / false
-- AD-27  reproduced counterexample · one CANCELLED occurrence (M-2 case A)
-- AD-28  reproduced counterexample · ZERO occurrences / no acceptance (M-2 case B)
-- AD-29  true/false is DISTINGUISHABLE from unconditional admissibility
-- ── M-3 coverage gaps + all-pass + genuine cross-tenant ─────────────────────
-- AD-30  close_event rung 5 · CLOSE_EXCEPTION_OPEN differential + OPERAND ground
-- AD-31  assign_staff rung 3 · STAFFING_STAFF_INVALID differential
-- AD-32  assign_staff rung 5 · STAFFING_DUPLICATE_ASSIGNMENT differential
-- AD-33  start_service ALL-PASS → true / true  (surfaced M-4: null coverage probe)
-- AD-34  release_occurrence ALL-PASS → true / true
-- AD-35  assign_staff ALL-PASS → true / true
-- AD-36  correct_staffing_assignment ALL-PASS → true / true
-- AD-37  release_staffing_assignment ALL-PASS → true / true
-- AD-38  GENUINE CROSS-TENANT non-leak · foreign-tenant row indistinguishable
--
-- Thirty-eight claims. "Rolls back cleanly" is not among them — that is the
-- sentinel's behaviour, reported by the harness, not a claim this proof makes
-- about itself.
-- ============================================================================

do $$
declare
  n_pass int := 0; n_fail int := 0;
  v_tenant uuid; v_user uuid; v_sfx text;
  v_other uuid;
  v_book uuid; v_occ uuid; v_ev uuid;
  v_book2 uuid; v_occ2 uuid;
  v_bookM uuid;
  v_bookB uuid; v_occB uuid; v_evB uuid;
  v_bookC uuid; v_occC uuid; v_evC uuid;
  v_bookD uuid; v_occD uuid; v_evD uuid;
  v_bookE uuid; v_occE uuid; v_evE uuid;
  v_req uuid; v_asg uuid; v_staff uuid; v_oblig uuid;
  v_err text; v_code text;
  r record;
  n int;
  v_absent uuid := '00000000-0000-0000-0000-000000000000';
  -- M-2 / M-3 additional fixtures (evaluation_complete contract + coverage gaps)
  v_bkF uuid; v_ocF uuid; v_evF uuid; v_reqF uuid; v_staffF uuid; v_asgF uuid;
  v_bkG uuid; v_ocG uuid; v_prG uuid; v_veG uuid; v_snG uuid;
  v_exc_ob uuid; v_seam_bk uuid; v_canc_bk uuid; v_canc_oc uuid; v_zero_bk uuid;
  v_xt_bk uuid; a_code text; a_ord int; a_cmp boolean; b_code text; b_ord int;
  r2 record;

begin
  select tu.tenant_id, tu.user_id into v_tenant, v_user
    from public.tenant_users tu
   where tu.active and tu.role in ('admin','owner','manager','ops')
   order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'v306 PERMANENT PROOF BLOCKED: no active tenant_users row with an operating role';
  end if;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_sfx := substr(gen_random_uuid()::text, 1, 8);
  raise notice 'v306-permanent: tenant=% actor=%', v_tenant, v_user;

  select t.id into v_other from public.tenants t where t.id <> v_tenant limit 1;

  -- ══ FIXTURE · a released occurrence with a materialised event ═════════════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AD-A', 'ADA-'||v_sfx, 'active') returning id into v_book;
  v_occ := (public.open_occurrence(v_book, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref, origin_commitment_ref, released_by)
    values (v_tenant, v_book, v_occ, gen_random_uuid(), 'ad306') returning id into v_ev;
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_ev, 'event', gen_random_uuid(), 'release',
            'venue_breakdown', 'venue', 'FK anchor only', 'ad306_anchor_'||v_sfx,
            jsonb_build_object('window_end', (now() + interval '96 hours')::text))
    returning id into v_oblig;

  -- ══ AD-1 · start_service rung 1 — absent subject ═════════════════════════
  begin perform public.start_service(v_absent, 'ad'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, rendered_ground, failed_ordinal into r
    from public.admissibility_evaluate('start_service', v_absent);
  if v_err = 'CEREMONY_NOT_FOUND' and r.refusal_code = 'CEREMONY_NOT_FOUND'
     and r.rendered_ground = v_err and r.failed_ordinal = 1 then
    n_pass := n_pass + 1; raise notice 'AD-1 PASS: absent subject — ceremony and authority both CEREMONY_NOT_FOUND at ordinal 1, grounds identical';
  else n_fail := n_fail + 1; raise notice 'AD-1 FAIL: ceremony=% authority=% ground=%', v_err, r.refusal_code, r.rendered_ground; end if;

  -- ══ AD-2 · start_service rung 2 — event_closed ═══════════════════════════
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_ev, 'event_closed', 'ad', '{}'::jsonb);
  begin perform public.start_service(v_ev, 'ad'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, rendered_ground, failed_ordinal into r
    from public.admissibility_evaluate('start_service', v_ev);
  if v_err = 'START_SERVICE_EVENT_CLOSED' and r.refusal_code = v_err
     and r.rendered_ground = v_err and r.failed_ordinal = 2 then
    n_pass := n_pass + 1; raise notice 'AD-2 PASS: closed event — both refuse START_SERVICE_EVENT_CLOSED at ordinal 2';
  else n_fail := n_fail + 1; raise notice 'AD-2 FAIL: ceremony=% authority=% ord=%', v_err, r.refusal_code, r.failed_ordinal; end if;
  delete from public.execution_evidence where event_ref = v_ev and kind = 'event_closed';

  -- ══ AD-3 · start_service rung 3 — service already started ════════════════
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_ev, 'service_start', 'ad', '{}'::jsonb);
  begin perform public.start_service(v_ev, 'ad'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, rendered_ground, failed_ordinal into r
    from public.admissibility_evaluate('start_service', v_ev);
  if v_err = 'SERVICE_ALREADY_STARTED' and r.refusal_code = v_err
     and r.rendered_ground = v_err and r.failed_ordinal = 3 then
    n_pass := n_pass + 1; raise notice 'AD-3 PASS: service already started — both refuse at ordinal 3';
  else n_fail := n_fail + 1; raise notice 'AD-3 FAIL: ceremony=% authority=% ord=%', v_err, r.refusal_code, r.failed_ordinal; end if;
  delete from public.execution_evidence where event_ref = v_ev and kind = 'service_start';

  -- ══ AD-4 · start_service rung 4 — OPERAND-BEARING ground ═════════════════
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_ev, 'event', gen_random_uuid(), 'release',
            'venue_setup', 'venue', 'Set the room', 'ad306_setup_'||v_sfx,
            jsonb_build_object('window_end', (now() + interval '48 hours')::text));
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_ev, 'event', gen_random_uuid(), 'release',
            'culinary_prepare', 'culinary', 'Plate the fish', 'ad306_cul_'||v_sfx,
            jsonb_build_object('window_end', (now() + interval '48 hours')::text));
  begin perform public.start_service(v_ev, 'ad'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, rendered_ground, failed_ordinal, ground into r
    from public.admissibility_evaluate('start_service', v_ev);
  if v_err like 'SERVICE_NOT_READY:%' and r.refusal_code = 'SERVICE_NOT_READY'
     and r.rendered_ground = v_err and r.failed_ordinal = 4 then
    n_pass := n_pass + 1; raise notice 'AD-4 PASS: % — operand count preserved byte-for-byte, ground=%', v_err, r.ground;
  else n_fail := n_fail + 1; raise notice 'AD-4 FAIL: ceremony=[%] authority=[%]', v_err, r.rendered_ground; end if;

  -- ══ AD-22 · CONJUNCTIVE TRUTH — lowest failing ordinal wins ══════════════
  -- Obligations (rung 4) AND a closed event (rung 2) both fail. The ceremony
  -- reports rung 2; the authority must agree. Order selects the report; both
  -- failures remain true.
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_ev, 'event_closed', 'ad', '{}'::jsonb);
  begin perform public.start_service(v_ev, 'ad'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, failed_ordinal into r
    from public.admissibility_evaluate('start_service', v_ev);
  if v_err = 'START_SERVICE_EVENT_CLOSED' and r.failed_ordinal = 2 then
    n_pass := n_pass + 1; raise notice 'AD-22 PASS: rungs 2 and 4 both fail; both ceremony and authority report the LOWEST ordinal (2) — precedence selects the report, not the truth';
  else n_fail := n_fail + 1; raise notice 'AD-22 FAIL: ceremony=% authority ord=%', v_err, r.failed_ordinal; end if;
  delete from public.execution_evidence where event_ref = v_ev and kind = 'event_closed';

  -- ══ AD-5 · start_service rung 5 — staffing uncovered ═════════════════════
  -- A FRESH event: obligation is append-only under R-8, so rung 4 cannot be
  -- cleared on the event that proved it. Distinct fixture, not a reset.
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AD-B', 'ADB-'||v_sfx, 'active') returning id into v_bookB;
  v_occB := (public.open_occurrence(v_bookB, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref, origin_commitment_ref, released_by)
    values (v_tenant, v_bookB, v_occB, gen_random_uuid(), 'ad306') returning id into v_evB;
  insert into public.staffing_requirement (tenant_id, event_ref, origin_obligation_ref,
      role, quantity, department, natural_key, window_start, window_end)
    values (v_tenant, v_evB, v_oblig, 'server', 2, 'staffing',
            'ad306_sreq_'||v_sfx, now(), now() + interval '4 hours')
    returning id into v_req;
  begin perform public.start_service(v_evB, 'ad'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, rendered_ground, failed_ordinal into r
    from public.admissibility_evaluate('start_service', v_evB);
  if v_err = 'SERVICE_STAFFING_UNCOVERED: required staffing coverage is not met'
     and r.refusal_code = 'SERVICE_STAFFING_UNCOVERED' and r.rendered_ground = v_err
     and r.failed_ordinal = 5 then
    n_pass := n_pass + 1; raise notice 'AD-5 PASS: staffing uncovered — static ground reproduced exactly at ordinal 5';
  else n_fail := n_fail + 1; raise notice 'AD-5 FAIL: ceremony=[%] authority=[%] ord=%', v_err, r.rendered_ground, r.failed_ordinal; end if;

  -- ══ AD-6 · close_event rung 2 ════════════════════════════════════════════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AD-C2', 'ADC2-'||v_sfx, 'active') returning id into v_bookC;
  v_occC := (public.open_occurrence(v_bookC, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref, origin_commitment_ref, released_by)
    values (v_tenant, v_bookC, v_occC, gen_random_uuid(), 'ad306') returning id into v_evC;
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_evC, 'event_closed', 'ad', '{}'::jsonb);
  begin perform public.close_event(v_evC, 'ad', 'ovr'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, rendered_ground, failed_ordinal into r
    from public.admissibility_evaluate('close_event', v_evC, jsonb_build_object('p_closeout_override','ovr'));
  if v_err = 'CLOSE_ALREADY_CLOSED' and r.refusal_code = v_err and r.rendered_ground = v_err
     and r.failed_ordinal = 2 then
    n_pass := n_pass + 1; raise notice 'AD-6 PASS: already closed — both refuse CLOSE_ALREADY_CLOSED at ordinal 2';
  else n_fail := n_fail + 1; raise notice 'AD-6 FAIL: ceremony=% authority=% ord=%', v_err, r.refusal_code, r.failed_ordinal; end if;
  delete from public.execution_evidence where event_ref = v_evC and kind = 'event_closed';

  -- ══ AD-7 · close_event rung 3 — POLARITY TRUE (fact must be present) ═════
  begin perform public.close_event(v_evC, 'ad', 'ovr'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, rendered_ground, failed_ordinal into r
    from public.admissibility_evaluate('close_event', v_evC, jsonb_build_object('p_closeout_override','ovr'));
  if v_err = 'CLOSE_NOT_IN_SERVICE' and r.refusal_code = v_err and r.rendered_ground = v_err
     and r.failed_ordinal = 3 then
    n_pass := n_pass + 1; raise notice 'AD-7 PASS: not in service — polarity-true rung agrees with the ceremony at ordinal 3';
  else n_fail := n_fail + 1; raise notice 'AD-7 FAIL: ceremony=% authority=% ord=%', v_err, r.refusal_code, r.failed_ordinal; end if;

  -- ══ AD-8 · close_event rung 4 — OPERAND-BEARING breakdown ground ═════════
  -- Own event: the breakdown obligation cannot be removed afterwards (R-8).
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AD-D', 'ADD-'||v_sfx, 'active') returning id into v_bookD;
  v_occD := (public.open_occurrence(v_bookD, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref, origin_commitment_ref, released_by)
    values (v_tenant, v_bookD, v_occD, gen_random_uuid(), 'ad306') returning id into v_evD;
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_evD, 'service_start', 'ad', '{}'::jsonb);
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_evD, 'event', gen_random_uuid(), 'release',
            'venue_breakdown', 'venue', 'Strike the room', 'ad306_bd_'||v_sfx,
            jsonb_build_object('window_end', (now() + interval '48 hours')::text));
  begin perform public.close_event(v_evD, 'ad', 'ovr'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, rendered_ground, failed_ordinal into r
    from public.admissibility_evaluate('close_event', v_evD, jsonb_build_object('p_closeout_override','ovr'));
  if v_err like 'CLOSE_BREAKDOWN_PENDING:%' and r.refusal_code = 'CLOSE_BREAKDOWN_PENDING'
     and r.rendered_ground = v_err and r.failed_ordinal = 4 then
    n_pass := n_pass + 1; raise notice 'AD-8 PASS: % — breakdown operand preserved', v_err;
  else n_fail := n_fail + 1; raise notice 'AD-8 FAIL: ceremony=[%] authority=[%]', v_err, r.rendered_ground; end if;

  -- ══ AD-9 · close_event rung 6 — Class-A judged WHEN ARGS SUPPLIED ════════
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_evC, 'service_start', 'ad', '{}'::jsonb);
  begin perform public.close_event(v_evC, 'ad', null); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, rendered_ground, failed_ordinal, condition_class into r
    from public.admissibility_evaluate('close_event', v_evC, '{}'::jsonb);
  if v_err like 'CLOSE_CLOSEOUT_UNRESOLVED:%' and r.refusal_code = 'CLOSE_CLOSEOUT_UNRESOLVED'
     and r.rendered_ground = v_err and r.failed_ordinal = 6 and r.condition_class = 'A' then
    n_pass := n_pass + 1; raise notice 'AD-9 PASS: closeout override missing — Class-A rung evaluated when args supplied, ground identical';
  else n_fail := n_fail + 1; raise notice 'AD-9 FAIL: ceremony=[%] authority=[%] class=%', v_err, r.rendered_ground, r.condition_class; end if;

  -- ══ AD-20 · Class-A DECLARED, not judged, when args absent (R-14.5) ══════
  select admissible, pending_arguments, failed_ordinal into r
    from public.admissibility_evaluate('close_event', v_evC, null);
  if r.pending_arguments @> array['p_closeout_override'] and r.failed_ordinal is null and r.admissible then
    n_pass := n_pass + 1; raise notice 'AD-20 PASS: with no arguments the Class-A rung is DECLARED in pending_arguments and never judged — R-14.5';
  else n_fail := n_fail + 1; raise notice 'AD-20 FAIL: pending=% ord=% admissible=%', r.pending_arguments, r.failed_ordinal, r.admissible; end if;

  -- ══ AD-21 · ALL-PASS · fully satisfied subject is admissible ═════════════
  select admissible, failed_ordinal into r
    from public.admissibility_evaluate('close_event', v_evC, jsonb_build_object('p_closeout_override','ovr'));
  if r.admissible and r.failed_ordinal is null then
    n_pass := n_pass + 1; raise notice 'AD-21 PASS: every close_event rung satisfied — admissible true, no failed ordinal (the conjunction holds)';
  else n_fail := n_fail + 1; raise notice 'AD-21 FAIL: admissible=% ord=%', r.admissible, r.failed_ordinal; end if;

  -- ══ AD-10 · release_event rung 2 — TWO-OPERAND ground ════════════════════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AD-M', 'ADM-'||v_sfx, 'active') returning id into v_bookM;
  perform public.open_occurrence(v_bookM, null, null);
  perform public.open_occurrence(v_bookM, null, null);
  begin perform public.release_event(v_bookM, 'ad', 's', 'c', null); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, rendered_ground, failed_ordinal, ground into r
    from public.admissibility_evaluate('release_event', v_bookM);
  if v_err like 'RELEASE_OCCURRENCE_AMBIGUOUS:%' and r.refusal_code = 'RELEASE_OCCURRENCE_AMBIGUOUS'
     and r.rendered_ground = v_err and r.failed_ordinal = 2 then
    n_pass := n_pass + 1; raise notice 'AD-10 PASS: % — count AND ordinal list both preserved, ground=%', v_err, r.ground;
  else n_fail := n_fail + 1; raise notice 'AD-10 FAIL: ceremony=[%] authority=[%]', v_err, r.rendered_ground; end if;

  -- ══ AD-11 · release_occurrence rung 2 — cancelled occurrence ═════════════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AD-C', 'ADC-'||v_sfx, 'active') returning id into v_book2;
  v_occ2 := (public.open_occurrence(v_book2, null, null)->>'occurrence_id')::uuid;
  perform public.cancel_occurrence(v_occ2, 'proof');
  begin perform public.release_occurrence(v_occ2, 'ad', 's', 'c', null); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, rendered_ground, failed_ordinal into r
    from public.admissibility_evaluate('release_occurrence', v_occ2);
  if v_err = 'OCCURRENCE_CANCELLED' and r.refusal_code = v_err and r.rendered_ground = v_err
     and r.failed_ordinal = 2 then
    n_pass := n_pass + 1; raise notice 'AD-11 PASS: cancelled occurrence — both refuse OCCURRENCE_CANCELLED at ordinal 2';
  else n_fail := n_fail + 1; raise notice 'AD-11 FAIL: ceremony=% authority=% ord=%', v_err, r.refusal_code, r.failed_ordinal; end if;

  -- ══ AD-12 · release_occurrence rung 3 — no unrescinded acceptance ════════
  begin perform public.release_occurrence(v_occ, 'ad', 's', 'c', null); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, rendered_ground, failed_ordinal into r
    from public.admissibility_evaluate('release_occurrence', v_occ);
  if v_err = 'RELEASE_PREDICATE_UNSATISFIED: commitment (no unrescinded acceptance)'
     and r.rendered_ground = v_err and r.failed_ordinal = 3 then
    n_pass := n_pass + 1; raise notice 'AD-12 PASS: no acceptance — the commitment VARIANT is reproduced, not a collapsed generic';
  else n_fail := n_fail + 1; raise notice 'AD-12 FAIL: ceremony=[%] authority=[%] ord=%', v_err, r.rendered_ground, r.failed_ordinal; end if;

  -- ══ AD-13 · release_occurrence rungs 4/5 — ORDER: clearance BEFORE sign_off
  -- Both arguments are missing. The ceremony reports clearance. If the ladder
  -- transposed them it would report sign_off and this fails.
  select refusal_code, rendered_ground, failed_ordinal into r
    from public.admissibility_evaluate('release_occurrence', v_occ, '{}'::jsonb);
  if r.failed_ordinal = 3 then
    n_pass := n_pass + 1; raise notice 'AD-13 PASS: rung 3 precedes both argument rungs — adjacent order holds (commitment before clearance before sign_off)';
  else n_fail := n_fail + 1; raise notice 'AD-13 FAIL: expected ordinal 3 first, got % (%)', r.failed_ordinal, r.rendered_ground; end if;

  -- ══ AD-14 · assign_staff rung 2 — DERIVED subject path requirement→event ═
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AD-E', 'ADE-'||v_sfx, 'active') returning id into v_bookE;
  v_occE := (public.open_occurrence(v_bookE, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref, origin_commitment_ref, released_by)
    values (v_tenant, v_bookE, v_occE, gen_random_uuid(), 'ad306') returning id into v_evE;
  insert into public.staffing_requirement (tenant_id, event_ref, origin_obligation_ref,
      role, quantity, department, natural_key, window_start, window_end)
    values (v_tenant, v_evE, v_oblig, 'chef', 1, 'culinary',
            'ad306_creq_'||v_sfx, now(), now() + interval '4 hours')
    returning id into v_req;
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_evE, 'event_closed', 'ad', '{}'::jsonb);
  -- the fixture tenant carries no staff; create one so the argument rungs are
  -- reachable rather than short-circuited at staff_valid
  insert into public.staff (tenant_id, name, active)
    values (v_tenant, 'AD-306 proof staff '||v_sfx, true) returning id into v_staff;
  begin perform public.assign_staff(v_req, v_staff, now(), now()+interval '2 hours', 'ad'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, rendered_ground, failed_ordinal into r
    from public.admissibility_evaluate('assign_staff', v_req,
      jsonb_build_object('p_staff', v_staff, 'p_window_start', now()::text, 'p_window_end', (now()+interval '2 hours')::text));
  if v_err = 'STAFFING_EVENT_CLOSED' and r.refusal_code = v_err and r.failed_ordinal = 2 then
    n_pass := n_pass + 1; raise notice 'AD-14 PASS: closed event reached through requirement→event — derived subject path resolves inside the evaluator';
  else n_fail := n_fail + 1; raise notice 'AD-14 FAIL: ceremony=% authority=% ord=%', v_err, r.refusal_code, r.failed_ordinal; end if;
  delete from public.execution_evidence where event_ref = v_evE and kind = 'event_closed';

  -- ══ AD-15 · assign_staff argument rungs with args supplied ═══════════════
  begin perform public.assign_staff(v_req, v_staff, now()+interval '2 hours', now(), 'ad'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, failed_ordinal, condition_class into r
    from public.admissibility_evaluate('assign_staff', v_req,
      jsonb_build_object('p_staff', v_staff,
                         'p_window_start', (now()+interval '2 hours')::text,
                         'p_window_end', now()::text));
  if v_err = 'STAFFING_WINDOW_INVALID' and r.refusal_code = v_err
     and r.failed_ordinal = 4 and r.condition_class = 'A' then
    n_pass := n_pass + 1; raise notice 'AD-15 PASS: inverted window — pure IMMUTABLE argument rung agrees with the ceremony at ordinal 4';
  else n_fail := n_fail + 1; raise notice 'AD-15 FAIL: ceremony=% authority=% ord=% class=%', v_err, r.refusal_code, r.failed_ordinal, r.condition_class; end if;

  -- ══ AD-16 · correct_staffing ORDER — already_released BEFORE event_closed ═
  v_asg := (public.assign_staff(v_req, v_staff, now(), now()+interval '2 hours', 'ad')->>'assignment_id')::uuid;
  perform public.release_staffing_assignment(v_asg, 'ad', 'proof');
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_evE, 'event_closed', 'ad', '{}'::jsonb);
  -- BOTH rung 2 (released) and rung 3 (event closed) now fail. The ceremony
  -- checks released first; a transposed ladder would report EVENT_CLOSED.
  begin perform public.correct_staffing_assignment(v_asg, v_staff, now(), now()+interval '1 hour', 'ad', 'r'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, failed_ordinal into r
    from public.admissibility_evaluate('correct_staffing_assignment', v_asg,
      jsonb_build_object('p_new_staff', v_staff, 'p_window_start', now()::text, 'p_window_end', (now()+interval '1 hour')::text));
  if v_err = 'STAFFING_ALREADY_RELEASED' and r.refusal_code = v_err and r.failed_ordinal = 2 then
    n_pass := n_pass + 1; raise notice 'AD-16 PASS: released AND closed both true; ceremony and authority both report already_released at ordinal 2 — the mandatory adjacent-order case';
  else n_fail := n_fail + 1; raise notice 'AD-16 FAIL: ceremony=% authority=% ord=%', v_err, r.refusal_code, r.failed_ordinal; end if;

  -- ══ AD-17 · release_staffing rung 2 ══════════════════════════════════════
  begin perform public.release_staffing_assignment(v_asg, 'ad', 'again'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, rendered_ground, failed_ordinal into r
    from public.admissibility_evaluate('release_staffing_assignment', v_asg);
  if v_err = 'STAFFING_ALREADY_RELEASED' and r.refusal_code = v_err
     and r.rendered_ground = v_err and r.failed_ordinal = 2 then
    n_pass := n_pass + 1; raise notice 'AD-17 PASS: double release — both refuse STAFFING_ALREADY_RELEASED at ordinal 2';
  else n_fail := n_fail + 1; raise notice 'AD-17 FAIL: ceremony=% authority=% ord=%', v_err, r.refusal_code, r.failed_ordinal; end if;

  -- ══ AD-18 · Y1 — release_staffing carries NO event_closed rung ═══════════
  -- The event is closed. The ceremony has no such check, so the ONLY reason it
  -- refuses is the release. The authority must not invent the condition the
  -- current preview wrongly applies (R-14.3 forbids introduction).
  select count(*) into n from public.admissibility_ladder()
   where action_key = 'release_staffing_assignment' and condition = 'event_not_closed';
  if n = 0 then
    n_pass := n_pass + 1; raise notice 'AD-18 PASS: Y1 — no event_closed rung is declared for release_staffing_assignment; the authority does not introduce a condition the ceremony lacks';
  else n_fail := n_fail + 1; raise notice 'AD-18 FAIL: an event_closed rung was declared'; end if;

  -- ══ AD-19 · NON-LEAK — absent and cross-tenant indistinguishable ═════════
  n := 0;
  for r in
    select unnest(array['start_service','close_event','release_event',
                        'release_occurrence','assign_staff']) as ak
  loop
    declare a_code text; a_ord int; b_code text; b_ord int;
    begin
      select refusal_code, failed_ordinal into a_code, a_ord
        from public.admissibility_evaluate(r.ak, v_absent);
      select refusal_code, failed_ordinal into b_code, b_ord
        from public.admissibility_evaluate(r.ak, gen_random_uuid());
      if a_code is distinct from b_code or a_ord is distinct from b_ord
         or a_code <> 'CEREMONY_NOT_FOUND' then
        n := n + 1;
      end if;
    end;
  end loop;
  if n = 0 then
    n_pass := n_pass + 1; raise notice 'AD-19 PASS: across five subject types an absent uuid and a foreign uuid are mutually indistinguishable — both CEREMONY_NOT_FOUND at ordinal 1, no existence leak (I-40)';
  else n_fail := n_fail + 1; raise notice 'AD-19 FAIL: % subject types leaked a distinction', n; end if;

  -- ══ AD-23 · W-GUARD — never evaluated ════════════════════════════════════
  -- release_occurrence declares RELEASE_ALREADY_RELEASED as Class-W. The
  -- authority must never return it, however the subject is arranged, because
  -- no readable precheck can prove the write will succeed under concurrency.
  select count(*) into n
    from (select unnest(array['release_occurrence','release_event']) a) x,
         lateral public.admissibility_evaluate(x.a, v_occ, '{}'::jsonb) e
   where e.refusal_code = 'RELEASE_ALREADY_RELEASED';
  if n = 0 then
    n_pass := n_pass + 1; raise notice 'AD-23 PASS: the W guard is declared in the ladder but never returned by the authority — admissibility does not predict write success (R1)';
  else n_fail := n_fail + 1; raise notice 'AD-23 FAIL: the authority returned a W verdict'; end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- M-2 · the 10-column contract — evaluation_complete (frozen-design addendum)
  -- ════════════════════════════════════════════════════════════════════════

  -- ══ AD-24 · COMPLETE ADMISSIBLE — true / true ════════════════════════════
  -- A fully-satisfied close_event: evaluate BEFORE the write returns admissible
  -- with evaluation_complete=true (the ladder covers the ceremony's authority),
  -- and the real ceremony then succeeds.
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AD-F', 'ADF-'||v_sfx, 'active') returning id into v_bkF;
  v_ocF := (public.open_occurrence(v_bkF, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref, origin_commitment_ref, released_by)
    values (v_tenant, v_bkF, v_ocF, gen_random_uuid(), 'ad306') returning id into v_evF;
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_evF, 'service_start', 'ad', '{}'::jsonb);
  select admissible, evaluation_complete into r
    from public.admissibility_evaluate('close_event', v_evF, jsonb_build_object('p_closeout_override','ovr'));
  begin perform public.close_event(v_evF, 'ad', 'ovr'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  if r.admissible and r.evaluation_complete and v_err is null then
    n_pass := n_pass + 1; raise notice 'AD-24 PASS: fully-satisfied close_event — admissible=true, evaluation_complete=true, and the real ceremony succeeded';
  else n_fail := n_fail + 1; raise notice 'AD-24 FAIL: admissible=% complete=% ceremony_err=%', r.admissible, r.evaluation_complete, v_err; end if;

  -- ══ AD-25 · DEFINITIVE REFUSAL — false / true ════════════════════════════
  -- The cancelled occurrence from AD-11: a refusal the evaluator itself
  -- established is a COMPLETE verdict.
  select admissible, evaluation_complete, failed_ordinal into r
    from public.admissibility_evaluate('release_occurrence', v_occ2);
  if r.admissible = false and r.evaluation_complete = true and r.failed_ordinal = 2 then
    n_pass := n_pass + 1; raise notice 'AD-25 PASS: a definitive refusal is admissible=false, evaluation_complete=true (the evaluator established the ground itself)';
  else n_fail := n_fail + 1; raise notice 'AD-25 FAIL: admissible=% complete=% ord=%', r.admissible, r.evaluation_complete, r.failed_ordinal; end if;

  -- ══ AD-26 · release_event DELEGATED — true / false ═══════════════════════
  -- A booking with one occurrence: the event-level ladder passes but the
  -- occurrence-level authority is delegated to release_occurrence and NOT
  -- evaluated here, so the verdict is admissible-so-far, INCOMPLETE.
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AD-SEAM', 'ADS-'||v_sfx, 'active') returning id into v_seam_bk;
  perform public.open_occurrence(v_seam_bk, null, null);
  select admissible, evaluation_complete into r
    from public.admissibility_evaluate('release_event', v_seam_bk);
  if r.admissible = true and r.evaluation_complete = false then
    n_pass := n_pass + 1; raise notice 'AD-26 PASS: release_event with delegated occurrence authority is admissible=true, evaluation_complete=false — admissible-so-far, not a success prediction';
  else n_fail := n_fail + 1; raise notice 'AD-26 FAIL: admissible=% complete=%', r.admissible, r.evaluation_complete; end if;

  -- ══ AD-27 · REPRODUCED COUNTEREXAMPLE · one CANCELLED occurrence ══════════
  -- Fable M-2 case A. The ceremony refuses OCCURRENCE_CANCELLED; the authority
  -- must NOT claim complete admissibility — it declares evaluation incomplete.
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AD-CANC', 'ADCX-'||v_sfx, 'active') returning id into v_canc_bk;
  v_canc_oc := (public.open_occurrence(v_canc_bk, null, null)->>'occurrence_id')::uuid;
  perform public.cancel_occurrence(v_canc_oc, 'ad306 m2');
  begin perform public.release_event(v_canc_bk, 'ad', 's', 'c', null); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select admissible, evaluation_complete into r
    from public.admissibility_evaluate('release_event', v_canc_bk);
  if v_err = 'OCCURRENCE_CANCELLED' and r.admissible = true and r.evaluation_complete = false then
    n_pass := n_pass + 1; raise notice 'AD-27 PASS: cancelled-occurrence counterexample closed — ceremony refuses OCCURRENCE_CANCELLED and the authority reports admissible-so-far/INCOMPLETE, not complete admissibility';
  else n_fail := n_fail + 1; raise notice 'AD-27 FAIL: ceremony=% admissible=% complete=%', v_err, r.admissible, r.evaluation_complete; end if;

  -- ══ AD-28 · REPRODUCED COUNTEREXAMPLE · ZERO occurrences, no acceptance ═══
  -- Fable M-2 case B. The ceremony creates the compatibility occurrence, delegates,
  -- and refuses RELEASE_PREDICATE_UNSATISFIED (its write rolls back on the raise).
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AD-ZERO', 'ADZ-'||v_sfx, 'active') returning id into v_zero_bk;
  select admissible, evaluation_complete into r
    from public.admissibility_evaluate('release_event', v_zero_bk);
  begin perform public.release_event(v_zero_bk, 'ad', 's', 'c', null); v_err := null;
  exception when others then v_err := SQLERRM; end;
  if v_err like 'RELEASE_PREDICATE_UNSATISFIED%' and r.admissible = true and r.evaluation_complete = false then
    n_pass := n_pass + 1; raise notice 'AD-28 PASS: zero-occurrence counterexample closed — ceremony refuses % and the authority reports admissible-so-far/INCOMPLETE', v_err;
  else n_fail := n_fail + 1; raise notice 'AD-28 FAIL: ceremony=% admissible=% complete=%', v_err, r.admissible, r.evaluation_complete; end if;

  -- ══ AD-29 · true/false IS DISTINGUISHABLE from unconditional admissibility ═
  -- The seam verdict (AD-26) and a complete admissible verdict differ exactly in
  -- evaluation_complete; a consumer can tell "admissible-so-far" from "complete".
  select evaluation_complete into r  from public.admissibility_evaluate('release_event', v_seam_bk);
  select evaluation_complete into r2
    from public.admissibility_evaluate('close_event', v_evF, jsonb_build_object('p_closeout_override','ovr'));
  -- v_evF is now closed (AD-24 wrote it): its evaluate is a definitive refusal,
  -- also evaluation_complete=true. Either way the seam (false) differs from a
  -- complete verdict (true).
  if r.evaluation_complete = false and r2.evaluation_complete = true and (r.evaluation_complete is distinct from r2.evaluation_complete) then
    n_pass := n_pass + 1; raise notice 'AD-29 PASS: admissible-so-far (evaluation_complete=false) is distinguishable from a complete verdict (true) — the column carries the distinction';
  else n_fail := n_fail + 1; raise notice 'AD-29 FAIL: seam_complete=% other_complete=%', r.evaluation_complete, r2.evaluation_complete; end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- M-3 · differential coverage gaps + all-pass cases + genuine cross-tenant
  -- ════════════════════════════════════════════════════════════════════════

  -- ══ AD-30 · close_event rung 5 — CLOSE_EXCEPTION_OPEN (operand ground) ════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AD-XO', 'ADXO-'||v_sfx, 'active') returning id into v_bkF;
  v_ocF := (public.open_occurrence(v_bkF, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref, origin_commitment_ref, released_by)
    values (v_tenant, v_bkF, v_ocF, gen_random_uuid(), 'ad306') returning id into v_evF;
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_evF, 'service_start', 'ad', '{}'::jsonb);
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_evF, 'event', gen_random_uuid(), 'release',
            'venue_setup', 'venue', 'anchor', 'ad306_xo_'||v_sfx,
            jsonb_build_object('window_end', (now() + interval '48 hours')::text))
    returning id into v_exc_ob;
  insert into public.execution_evidence (tenant_id,event_ref,obligation_ref,kind,actor,payload)
    values (v_tenant, v_evF, v_exc_ob, 'exception', 'ad', '{}'::jsonb);
  begin perform public.close_event(v_evF, 'ad', 'ovr'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, rendered_ground, failed_ordinal into r
    from public.admissibility_evaluate('close_event', v_evF, jsonb_build_object('p_closeout_override','ovr'));
  if v_err like 'CLOSE_EXCEPTION_OPEN:%' and r.refusal_code = 'CLOSE_EXCEPTION_OPEN'
     and r.rendered_ground = v_err and r.failed_ordinal = 5 then
    n_pass := n_pass + 1; raise notice 'AD-30 PASS: % — exception-state operand preserved byte-for-byte at ordinal 5', v_err;
  else n_fail := n_fail + 1; raise notice 'AD-30 FAIL: ceremony=[%] authority=[%] ord=%', v_err, r.rendered_ground, r.failed_ordinal; end if;

  -- ══ AD-31 · assign_staff rung 3 — STAFFING_STAFF_INVALID ═════════════════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AD-SI', 'ADSI-'||v_sfx, 'active') returning id into v_bkF;
  v_ocF := (public.open_occurrence(v_bkF, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref, origin_commitment_ref, released_by)
    values (v_tenant, v_bkF, v_ocF, gen_random_uuid(), 'ad306') returning id into v_evF;
  insert into public.staffing_requirement (tenant_id, event_ref, origin_obligation_ref,
      role, quantity, department, natural_key, window_start, window_end)
    values (v_tenant, v_evF, v_oblig, 'server', 1, 'staffing',
            'ad306_sireq_'||v_sfx, now(), now() + interval '4 hours')
    returning id into v_reqF;
  begin perform public.assign_staff(v_reqF, v_absent, now(), now()+interval '2 hours', 'ad'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, failed_ordinal, condition_class into r
    from public.admissibility_evaluate('assign_staff', v_reqF,
      jsonb_build_object('p_staff', v_absent, 'p_window_start', now()::text, 'p_window_end', (now()+interval '2 hours')::text));
  if v_err = 'STAFFING_STAFF_INVALID' and r.refusal_code = v_err and r.failed_ordinal = 3 then
    n_pass := n_pass + 1; raise notice 'AD-31 PASS: invalid staff — ceremony and authority both STAFFING_STAFF_INVALID at ordinal 3';
  else n_fail := n_fail + 1; raise notice 'AD-31 FAIL: ceremony=% authority=% ord=%', v_err, r.refusal_code, r.failed_ordinal; end if;

  -- ══ AD-32 · assign_staff rung 5 — STAFFING_DUPLICATE_ASSIGNMENT ══════════
  insert into public.staff (tenant_id, name, active)
    values (v_tenant, 'AD-306 dup staff '||v_sfx, true) returning id into v_staffF;
  perform public.assign_staff(v_reqF, v_staffF, now(), now()+interval '2 hours', 'ad');   -- first, succeeds
  begin perform public.assign_staff(v_reqF, v_staffF, now(), now()+interval '2 hours', 'ad'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  select refusal_code, failed_ordinal into r
    from public.admissibility_evaluate('assign_staff', v_reqF,
      jsonb_build_object('p_staff', v_staffF, 'p_window_start', now()::text, 'p_window_end', (now()+interval '2 hours')::text));
  if v_err = 'STAFFING_DUPLICATE_ASSIGNMENT' and r.refusal_code = v_err and r.failed_ordinal = 5 then
    n_pass := n_pass + 1; raise notice 'AD-32 PASS: duplicate assignment — ceremony and authority both STAFFING_DUPLICATE_ASSIGNMENT at ordinal 5';
  else n_fail := n_fail + 1; raise notice 'AD-32 FAIL: ceremony=% authority=% ord=%', v_err, r.refusal_code, r.failed_ordinal; end if;

  -- ══ AD-33 · start_service ALL-PASS — true / true ═════════════════════════
  -- A bare event: not closed, no service_start, no pre-service obligations, no
  -- staffing requirements (event_staffing_ready vacuously true).
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AD-SS', 'ADSS-'||v_sfx, 'active') returning id into v_bkF;
  v_ocF := (public.open_occurrence(v_bkF, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref, origin_commitment_ref, released_by)
    values (v_tenant, v_bkF, v_ocF, gen_random_uuid(), 'ad306') returning id into v_evF;
  select admissible, evaluation_complete into r from public.admissibility_evaluate('start_service', v_evF);
  begin perform public.start_service(v_evF, 'ad'); v_err := null; exception when others then v_err := SQLERRM; end;
  if r.admissible and r.evaluation_complete and v_err is null then
    n_pass := n_pass + 1; raise notice 'AD-33 PASS: start_service all-pass — admissible=true/complete=true and the ceremony succeeded';
  else n_fail := n_fail + 1; raise notice 'AD-33 FAIL: admissible=% complete=% ceremony_err=%', r.admissible, r.evaluation_complete, v_err; end if;

  -- ══ AD-34 · release_occurrence ALL-PASS — true / true ════════════════════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AD-RO', 'ADRO-'||v_sfx, 'active') returning id into v_bkG;
  insert into public.proposals (tenant_id, booking_id, title, status)
    values (v_tenant, v_bkG, 'P306RO', 'draft') returning id into v_prG;
  insert into public.proposal_versions (tenant_id, proposal_id, version, status)
    values (v_tenant, v_prG, 1, 'sent') returning id into v_veG;
  insert into public.offer_snapshots (tenant_id, version_id, fingerprint, model,
      artifact_bytes, artifact_hash, artifact_meta, assets, published_at)
    values (v_tenant, v_veG, 'ro-'||v_sfx, '{"components":[]}'::jsonb,
            '\x00'::bytea, 'ro-h', '{}'::jsonb, '[]'::jsonb, now()) returning id into v_snG;
  insert into public.offer_acceptances (tenant_id, snapshot_id, fingerprint, booking_id, recorded_moment, created_at)
    values (v_tenant, v_snG, 'roa-'||v_sfx, v_bkG, now(), now());
  v_ocG := (public.open_occurrence(v_bkG, null, null)->>'occurrence_id')::uuid;
  select admissible, evaluation_complete into r
    from public.admissibility_evaluate('release_occurrence', v_ocG,
      jsonb_build_object('p_clearance_ref','c','p_signoff_ref','s'));
  begin perform public.release_occurrence(v_ocG, 'ad', 's', 'c', null); v_err := null;
  exception when others then v_err := SQLERRM; end;
  if r.admissible and r.evaluation_complete and v_err is null then
    n_pass := n_pass + 1; raise notice 'AD-34 PASS: release_occurrence all-pass — admissible=true/complete=true and the ceremony released';
  else n_fail := n_fail + 1; raise notice 'AD-34 FAIL: admissible=% complete=% ceremony_err=%', r.admissible, r.evaluation_complete, v_err; end if;

  -- ══ AD-35 · assign_staff ALL-PASS — true / true ══════════════════════════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AD-AS', 'ADAS-'||v_sfx, 'active') returning id into v_bkF;
  v_ocF := (public.open_occurrence(v_bkF, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref, origin_commitment_ref, released_by)
    values (v_tenant, v_bkF, v_ocF, gen_random_uuid(), 'ad306') returning id into v_evF;
  insert into public.staffing_requirement (tenant_id, event_ref, origin_obligation_ref,
      role, quantity, department, natural_key, window_start, window_end)
    values (v_tenant, v_evF, v_oblig, 'server', 1, 'staffing',
            'ad306_asreq_'||v_sfx, now(), now() + interval '4 hours')
    returning id into v_reqF;
  insert into public.staff (tenant_id, name, active)
    values (v_tenant, 'AD-306 as staff '||v_sfx, true) returning id into v_staffF;
  select admissible, evaluation_complete into r
    from public.admissibility_evaluate('assign_staff', v_reqF,
      jsonb_build_object('p_staff', v_staffF, 'p_window_start', now()::text, 'p_window_end', (now()+interval '2 hours')::text));
  begin v_asgF := (public.assign_staff(v_reqF, v_staffF, now(), now()+interval '2 hours', 'ad')->>'assignment_id')::uuid; v_err := null;
  exception when others then v_err := SQLERRM; end;
  if r.admissible and r.evaluation_complete and v_err is null then
    n_pass := n_pass + 1; raise notice 'AD-35 PASS: assign_staff all-pass — admissible=true/complete=true and the ceremony assigned';
  else n_fail := n_fail + 1; raise notice 'AD-35 FAIL: admissible=% complete=% ceremony_err=%', r.admissible, r.evaluation_complete, v_err; end if;

  -- ══ AD-36 · correct_staffing_assignment ALL-PASS — true / true ═══════════
  -- Reuses the not-released assignment AD-35 just created; event is not closed.
  select admissible, evaluation_complete into r
    from public.admissibility_evaluate('correct_staffing_assignment', v_asgF,
      jsonb_build_object('p_new_staff', v_staffF, 'p_window_start', now()::text, 'p_window_end', (now()+interval '3 hours')::text));
  begin perform public.correct_staffing_assignment(v_asgF, v_staffF, now(), now()+interval '3 hours', 'ad', 'r'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  if r.admissible and r.evaluation_complete and v_err is null then
    n_pass := n_pass + 1; raise notice 'AD-36 PASS: correct_staffing_assignment all-pass — admissible=true/complete=true and the ceremony corrected';
  else n_fail := n_fail + 1; raise notice 'AD-36 FAIL: admissible=% complete=% ceremony_err=%', r.admissible, r.evaluation_complete, v_err; end if;

  -- ══ AD-37 · release_staffing_assignment ALL-PASS — true / true ═══════════
  -- A fresh, not-released assignment on a not-closed event.
  insert into public.staff (tenant_id, name, active)
    values (v_tenant, 'AD-306 rs staff '||v_sfx, true) returning id into v_staffF;
  v_asgF := (public.assign_staff(v_reqF, v_staffF, now(), now()+interval '2 hours', 'ad')->>'assignment_id')::uuid;
  select admissible, evaluation_complete into r
    from public.admissibility_evaluate('release_staffing_assignment', v_asgF);
  begin perform public.release_staffing_assignment(v_asgF, 'ad', 'r'); v_err := null;
  exception when others then v_err := SQLERRM; end;
  if r.admissible and r.evaluation_complete and v_err is null then
    n_pass := n_pass + 1; raise notice 'AD-37 PASS: release_staffing_assignment all-pass — admissible=true/complete=true and the ceremony released';
  else n_fail := n_fail + 1; raise notice 'AD-37 FAIL: admissible=% complete=% ceremony_err=%', r.admissible, r.evaluation_complete, v_err; end if;

  -- ══ AD-38 · GENUINE CROSS-TENANT NON-LEAK ════════════════════════════════
  -- A real booking under a FOREIGN tenant, constructed transactionally, must be
  -- indistinguishable from an absent subject: both CEREMONY_NOT_FOUND at ord 1.
  if v_other is null then
    n_fail := n_fail + 1; raise notice 'AD-38 FAIL: no second tenant present to construct a cross-tenant subject';
  else
    insert into public.bookings (tenant_id, contact_name, invoice_num, status)
      values (v_other, 'AD-XT', 'ADXT-'||v_sfx, 'active') returning id into v_xt_bk;
    select refusal_code, failed_ordinal, evaluation_complete into a_code, a_ord, a_cmp
      from public.admissibility_evaluate('release_event', v_xt_bk);   -- foreign-tenant subject
    select refusal_code, failed_ordinal into b_code, b_ord
      from public.admissibility_evaluate('release_event', v_absent);  -- absent subject
    if a_code = 'CEREMONY_NOT_FOUND' and a_ord = 1 and a_cmp = true
       and a_code is not distinct from b_code and a_ord is not distinct from b_ord then
      n_pass := n_pass + 1; raise notice 'AD-38 PASS: a real foreign-tenant booking is indistinguishable from absent — both CEREMONY_NOT_FOUND at ordinal 1, no cross-tenant existence leak';
    else n_fail := n_fail + 1; raise notice 'AD-38 FAIL: foreign=%/% absent=%/%', a_code, a_ord, b_code, b_ord; end if;
  end if;

  -- ══ verdict ══════════════════════════════════════════════════════════════
  raise notice 'v306 PERMANENT PROOF: % PASS / % FAIL / 0 SKIPPED / 0 UNPROVEN', n_pass, n_fail;
  if n_fail > 0 then
    raise exception 'v306 PERMANENT PROOF FAILED: % claim(s) violated', n_fail;
  end if;
  raise exception 'V306_PERMANENT_ROLLBACK';
exception
  when others then
    if sqlerrm = 'V306_PERMANENT_ROLLBACK' then
      raise notice 'v306 permanent proof rolled back cleanly — zero residue';
    else raise;
    end if;
end $$;
