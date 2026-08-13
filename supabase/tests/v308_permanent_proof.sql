-- ============================================================================
-- v308 PERMANENT PROOF — availability IS the ceremony conjunction
-- Self-rolling-back, rerunnable, zero residue.
--
-- THE CONSTITUTIONAL PROPERTY. Availability must neither invent nor omit a
-- condition enforced by the actual ceremony. Every claim below is one half of
-- that: a rung availability must observe, or a condition it must no longer
-- assert on its own authority.
--
-- AV-1   Class-U precedence · unauthorized actor, existing target → the
--        DECLARED ordinal-0 refusal, not a hand-written string
-- AV-2   Class-U precedence over rung 1 · unauthorized + absent target →
--        unauthorized, not stale_target (ordinal 0 outranks subject_exists,
--        exactly as the ceremony's first statement outranks its lookup)
-- AV-3   Y1 · release_staffing_assignment is AVAILABLE on a closed event —
--        the preview no longer invents an event_closed rung its ladder and
--        ceremony do not declare
-- AV-4   Y1 boundary · assign_staff STILL blocked on a closed event (rung 2)
-- AV-5   Y1 boundary · correct_staffing_assignment STILL blocked (rung 3)
-- AV-6   F3 · start_service blocks with the DECLARED SERVICE_NOT_READY and its
--        operand count, not the invented v_pre_total string
-- AV-7   F8 · a multi-occurrence engagement is RELEASE_OCCURRENCE_AMBIGUOUS,
--        never globally already_completed
-- AV-8   F8 delegation · release_event observes the DELEGATED release_occurrence
--        ladder (a rung release_event's own ladder does not carry)
-- AV-9   close_event · unresolved AUTHORIZED OVERRIDE → unavailable_pending_argument
-- AV-10  routine ≠ override · assign_staff stays AVAILABLE though its routine
--        Class-A inputs were not supplied to the no-argument preview
-- AV-11  routine ≠ override · correct_staffing_assignment likewise
-- AV-12  routine ≠ override · every Class-A argument release_event can reach,
--        own and delegated, is declared routine (inventory item 15, ADD)
-- AV-13  R5 · the availability detail equals the ceremony's own message
--        byte-for-byte
-- AV-14  alternation · signoff + clearance satisfies the release group
-- AV-15  alternation · signoff + waiver satisfies it (waiver-only PRESERVED)
-- AV-16  alternation · signoff alone leaves the group missing
-- AV-17  alternation · ordinary entry still individually required
-- AV-18  alternation · ordinary all-required semantics unchanged elsewhere
-- AV-19  legacy vocabulary · declared reason identity, blocked → lawful_refusal
--        on the dispatch surface, non-ladder inference unchanged
--
-- Nineteen claims. The v306 differential (38), v307a equivalence (17) and
-- v307b Class-U (17) suites run as regressions and must be unchanged: v308
-- moves the PREVIEW onto the authority and touches no ceremony.
-- ============================================================================

do $$
declare
  n_pass int := 0; n_fail int := 0; v_sfx text; v_err text;
  v_tenant uuid; v_user uuid;
  v_absent uuid := '00000000-0000-0000-0000-000000000000';
  sig_before text; sig_after text;
  bA uuid; ocA uuid; evA uuid; oblA uuid; reqA uuid; asgA uuid;
  bC uuid; ocC uuid; evC uuid; oblC uuid; reqC uuid; asgC uuid;
  bD uuid; ocD uuid; evD uuid;
  bM uuid; bS uuid; ocS uuid;
  v_staff uuid; ev jsonb; v_detail text; v_n int;
begin
  select tu.tenant_id, tu.user_id into v_tenant, v_user
    from public.tenant_users tu
   where tu.active and tu.role in ('admin','owner','manager','ops')
   order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'v308 PERMANENT PROOF BLOCKED: no active tenant_users row with an operating role';
  end if;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_sfx := substr(gen_random_uuid()::text, 1, 8);
  raise notice 'v308-permanent: tenant=% actor=%', v_tenant, v_user;

  -- ── FIXTURE A · open event, one unresolved PRE-SERVICE obligation ─────────
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AV-A', 'AVA-'||v_sfx, 'active') returning id into bA;
  ocA := (public.open_occurrence(bA, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref, origin_commitment_ref, released_by)
    values (v_tenant, bA, ocA, gen_random_uuid(), 'av308') returning id into evA;
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, evA, 'event', gen_random_uuid(), 'release',
            'venue_setup', 'venue', 'pre-service anchor', 'av308_a_'||v_sfx,
            jsonb_build_object('window_end', (now() + interval '96 hours')::text))
    returning id into oblA;
  insert into public.staffing_requirement (tenant_id, event_ref, origin_obligation_ref,
      role, quantity, department, natural_key, window_start, window_end)
    values (v_tenant, evA, oblA, 'server', 2, 'staffing',
            'av308_areq_'||v_sfx, now(), now() + interval '4 hours')
    returning id into reqA;
  insert into public.staff (tenant_id, name, active)
    values (v_tenant, 'AV-308 staff '||v_sfx, true) returning id into v_staff;
  asgA := (public.assign_staff(reqA, v_staff, now(), now()+interval '2 hours', 'av')->>'assignment_id')::uuid;

  -- ── FIXTURE C · the same shape, then CLOSED ───────────────────────────────
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AV-C', 'AVC-'||v_sfx, 'active') returning id into bC;
  ocC := (public.open_occurrence(bC, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref, origin_commitment_ref, released_by)
    values (v_tenant, bC, ocC, gen_random_uuid(), 'av308') returning id into evC;
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, evC, 'event', gen_random_uuid(), 'release',
            'venue_breakdown', 'venue', 'FK anchor only', 'av308_c_'||v_sfx,
            jsonb_build_object('window_end', (now() + interval '96 hours')::text))
    returning id into oblC;
  insert into public.staffing_requirement (tenant_id, event_ref, origin_obligation_ref,
      role, quantity, department, natural_key, window_start, window_end)
    values (v_tenant, evC, oblC, 'server', 1, 'staffing',
            'av308_creq_'||v_sfx, now(), now() + interval '4 hours')
    returning id into reqC;
  asgC := (public.assign_staff(reqC, v_staff, now(), now()+interval '2 hours', 'av')->>'assignment_id')::uuid;
  insert into public.execution_evidence (tenant_id, event_ref, kind, actor, payload)
    values (v_tenant, evC, 'event_closed', 'av', '{}'::jsonb);

  -- ── FIXTURE D · in service, nothing outstanding — close_event is reachable ─
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AV-D', 'AVD-'||v_sfx, 'active') returning id into bD;
  ocD := (public.open_occurrence(bD, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref, origin_commitment_ref, released_by)
    values (v_tenant, bD, ocD, gen_random_uuid(), 'av308') returning id into evD;
  insert into public.execution_evidence (tenant_id, event_ref, kind, actor, payload)
    values (v_tenant, evD, 'service_start', 'av', '{}'::jsonb);

  -- ── FIXTURE M/S · multi-occurrence and single-occurrence engagements ──────
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AV-M', 'AVM-'||v_sfx, 'active') returning id into bM;
  perform public.open_occurrence(bM, null, null);
  perform public.open_occurrence(bM, null, null);
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'AV-S', 'AVS-'||v_sfx, 'active') returning id into bS;
  ocS := (public.open_occurrence(bS, null, null)->>'occurrence_id')::uuid;

  sig_before := (select (select count(*) from public.event)||'/'||
                        (select count(*) from public.execution_evidence)||'/'||
                        (select count(*) from public.engagement_occurrence)||'/'||
                        (select count(*) from public.obligation)||'/'||
                        (select count(*) from public.staffing_assignment));

  -- ══ AV-1 · Class-U, declared ground ══════════════════════════════════════
  perform set_config('app.user_id', gen_random_uuid()::text, true);
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  ev := public.action_evaluate('start_service', evA);
  if (ev->>'available')::boolean is false and (ev->>'authorized')::boolean is false
     and ev->>'reason_code' = 'unauthorized'
     and ev->>'reason_detail' = 'EXECUTION_NOT_AUTHORIZED: start_service' then
    n_pass:=n_pass+1; raise notice 'AV-1 PASS: Class-U refusal carries the DECLARED ordinal-0 ground, not a hand-written string';
  else n_fail:=n_fail+1; raise notice 'AV-1 FAIL: %', ev::text; end if;

  -- ══ AV-2 · ordinal 0 outranks subject_exists ═════════════════════════════
  ev := public.action_evaluate('start_service', v_absent);
  if ev->>'reason_code' = 'unauthorized' then
    n_pass:=n_pass+1; raise notice 'AV-2 PASS: unauthorized + absent target reports the U rung, matching the ceremony whose authorizer precedes its lookup';
  else n_fail:=n_fail+1; raise notice 'AV-2 FAIL: %', ev::text; end if;

  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);

  -- ══ AV-3 · Y1 — the invented condition is gone ═══════════════════════════
  ev := public.action_evaluate('release_staffing_assignment', asgC);
  if (ev->>'available')::boolean is true and ev->>'reason_code' = 'available' then
    n_pass:=n_pass+1; raise notice 'AV-3 PASS: release_staffing_assignment is available on a CLOSED event — no event_closed rung is declared and the ceremony has none';
  else n_fail:=n_fail+1; raise notice 'AV-3 FAIL: %', ev::text; end if;

  -- ══ AV-4 / AV-5 · the legitimate closed-event rungs are PRESERVED ════════
  ev := public.action_evaluate('assign_staff', reqC);
  if (ev->>'available')::boolean is false and ev->>'reason_detail' = 'STAFFING_EVENT_CLOSED' then
    n_pass:=n_pass+1; raise notice 'AV-4 PASS: assign_staff still blocked on a closed event — rung 2 is declared and is preserved';
  else n_fail:=n_fail+1; raise notice 'AV-4 FAIL: %', ev::text; end if;

  ev := public.action_evaluate('correct_staffing_assignment', asgC);
  if (ev->>'available')::boolean is false and ev->>'reason_detail' = 'STAFFING_EVENT_CLOSED' then
    n_pass:=n_pass+1; raise notice 'AV-5 PASS: correct_staffing_assignment still blocked on a closed event — rung 3 is declared and is preserved';
  else n_fail:=n_fail+1; raise notice 'AV-5 FAIL: %', ev::text; end if;

  -- ══ AV-6 · F3 + R5 — declared refusal with its operand ═══════════════════
  ev := public.action_evaluate('start_service', evA);
  if (ev->>'available')::boolean is false
     and ev->>'reason_code' = 'blocked'
     and ev->>'reason_detail' like 'SERVICE_NOT_READY: %pre-service obligation(s) unresolved' then
    n_pass:=n_pass+1; raise notice 'AV-6 PASS: start_service reports the declared SERVICE_NOT_READY with its operand — the invented pre-service availability rule is gone';
  else n_fail:=n_fail+1; raise notice 'AV-6 FAIL: %', ev::text; end if;

  -- ══ AV-7 · F8 — uniqueness, not global completion ════════════════════════
  ev := public.action_evaluate('release_event', bM);
  if (ev->>'available')::boolean is false
     and ev->>'reason_detail' like 'RELEASE_OCCURRENCE_AMBIGUOUS: %'
     and ev->>'reason_code' <> 'already_completed' then
    n_pass:=n_pass+1; raise notice 'AV-7 PASS: a multi-occurrence engagement is AMBIGUOUS, never globally already_completed';
  else n_fail:=n_fail+1; raise notice 'AV-7 FAIL: %', ev::text; end if;

  -- ══ AV-8 · F8 — the DELEGATED ladder is observed ═════════════════════════
  -- unrescinded_acceptance is release_occurrence rung 3. release_event's own
  -- ladder has no such rung, so seeing it proves the seam was followed.
  ev := public.action_evaluate('release_event', bS);
  if (ev->>'available')::boolean is false
     and ev->>'reason_detail' = 'RELEASE_PREDICATE_UNSATISFIED: commitment (no unrescinded acceptance)' then
    n_pass:=n_pass+1; raise notice 'AV-8 PASS: release_event observed the DELEGATED release_occurrence ladder — a rung its own ladder does not carry';
  else n_fail:=n_fail+1; raise notice 'AV-8 FAIL: %', ev::text; end if;

  -- ══ AV-9 · the authorized override ═══════════════════════════════════════
  ev := public.action_evaluate('close_event', evD);
  if (ev->>'available')::boolean is false
     and ev->>'reason_code' = 'unavailable_pending_argument'
     and ev->>'reason_detail' like '%p_closeout_override%' then
    n_pass:=n_pass+1; raise notice 'AV-9 PASS: close_event surfaces its unresolved AUTHORIZED OVERRIDE instead of advertising an action the ceremony must refuse';
  else n_fail:=n_fail+1; raise notice 'AV-9 FAIL: %', ev::text; end if;

  -- ══ AV-10 / AV-11 · routine inputs do NOT disable ════════════════════════
  ev := public.action_evaluate('assign_staff', reqA);
  if (ev->>'available')::boolean is true and ev->>'reason_code' = 'available' then
    n_pass:=n_pass+1; raise notice 'AV-10 PASS: assign_staff stays available though its routine Class-A inputs were not supplied to the preview';
  else n_fail:=n_fail+1; raise notice 'AV-10 FAIL: %', ev::text; end if;

  ev := public.action_evaluate('correct_staffing_assignment', asgA);
  if (ev->>'available')::boolean is true and ev->>'reason_code' = 'available' then
    n_pass:=n_pass+1; raise notice 'AV-11 PASS: correct_staffing_assignment stays available on its routine inputs';
  else n_fail:=n_fail+1; raise notice 'AV-11 FAIL: %', ev::text; end if;

  -- ══ AV-12 · every reachable release_event argument is declared routine ════
  select count(*)::int into v_n
    from public.admissibility_ladder() l
   where l.action_key in ('release_event','release_occurrence')
     and l.condition_class = 'A' and l.in_scope_v306
     and not exists (
       select 1 from unnest(public.action_required_fields('release_event')) entry
       cross join lateral unnest(public.action_alternatives(entry)) field
       cross join lateral unnest(public.action_alternatives(l.argument_name)) arg
        where field = regexp_replace(arg, '^p_', ''));
  if v_n = 0 then
    n_pass:=n_pass+1; raise notice 'AV-12 PASS: every Class-A argument release_event can reach — its own and its delegate''s — is declared routine (inventory item 15)';
  else n_fail:=n_fail+1; raise notice 'AV-12 FAIL: % undeclared reachable argument(s)', v_n; end if;

  -- ══ AV-13 · R5 byte-for-byte with the ceremony ═══════════════════════════
  ev := public.action_evaluate('start_service', evA);
  begin perform public.start_service(evA, 'av'); v_err := 'ADMITTED';
  exception when others then v_err := SQLERRM; end;
  if v_err = ev->>'reason_detail' then
    n_pass:=n_pass+1; raise notice 'AV-13 PASS: the availability detail is the ceremony''s own message, byte-for-byte';
  else n_fail:=n_fail+1; raise notice 'AV-13 FAIL: preview=[%] ceremony=[%]', ev->>'reason_detail', v_err; end if;

  -- ══ AV-14..AV-18 · the alternation grammar, one meaning ══════════════════
  if public.action_missing_required('release_event',
       jsonb_build_object('signoff_ref','s','clearance_ref','c')) is null then
    n_pass:=n_pass+1; raise notice 'AV-14 PASS: signoff + clearance satisfies the release group';
  else n_fail:=n_fail+1; raise notice 'AV-14 FAIL: %',
       public.action_missing_required('release_event', jsonb_build_object('signoff_ref','s','clearance_ref','c')); end if;

  if public.action_missing_required('release_event',
       jsonb_build_object('signoff_ref','s','waiver_ref','w')) is null then
    n_pass:=n_pass+1; raise notice 'AV-15 PASS: signoff + waiver satisfies the release group — waiver-only release is PRESERVED';
  else n_fail:=n_fail+1; raise notice 'AV-15 FAIL: %',
       public.action_missing_required('release_event', jsonb_build_object('signoff_ref','s','waiver_ref','w')); end if;

  if public.action_missing_required('release_event',
       jsonb_build_object('signoff_ref','s')) = 'clearance_ref|waiver_ref' then
    n_pass:=n_pass+1; raise notice 'AV-16 PASS: neither alternative present leaves the group missing, as the ceremony requires';
  else n_fail:=n_fail+1; raise notice 'AV-16 FAIL: %',
       coalesce(public.action_missing_required('release_event', jsonb_build_object('signoff_ref','s')),'<null>'); end if;

  if public.action_missing_required('release_event',
       jsonb_build_object('clearance_ref','c')) = 'signoff_ref' then
    n_pass:=n_pass+1; raise notice 'AV-17 PASS: an ordinary entry remains individually required';
  else n_fail:=n_fail+1; raise notice 'AV-17 FAIL: %',
       coalesce(public.action_missing_required('release_event', jsonb_build_object('clearance_ref','c')),'<null>'); end if;

  if public.action_missing_required('assign_staff',
       jsonb_build_object('staff','s','window_start','x')) = 'window_end'
     and public.action_missing_required('assign_staff',
       jsonb_build_object('staff','s','window_start','x','window_end','y')) is null then
    n_pass:=n_pass+1; raise notice 'AV-18 PASS: all-required semantics are unchanged where no alternation is declared';
  else n_fail:=n_fail+1; raise notice 'AV-18 FAIL: assign_staff gate changed'; end if;

  -- ══ AV-19 · reason vocabulary ════════════════════════════════════════════
  if public.action_reason_of('STAFFING_EVENT_CLOSED') = 'lawful_refusal'
     and public.action_reason_of('CEREMONY_NOT_FOUND') = 'stale_target'
     and public.action_reason_of('EXECUTION_NOT_AUTHORIZED: close_event') = 'unauthorized'
     and public.action_reason_of('STAFFING_ALREADY_RELEASED') = 'already_completed'
     and public.action_reason_of('some unmapped domain message') = 'lawful_refusal' then
    n_pass:=n_pass+1; raise notice 'AV-19 PASS: declared reason identity resolves ladder refusals, blocked reports as lawful_refusal on the dispatch surface, and non-ladder inference is unchanged';
  else n_fail:=n_fail+1; raise notice 'AV-19 FAIL: vocabulary drift'; end if;

  -- ══ residue ══════════════════════════════════════════════════════════════
  sig_after := (select (select count(*) from public.event)||'/'||
                       (select count(*) from public.execution_evidence)||'/'||
                       (select count(*) from public.engagement_occurrence)||'/'||
                       (select count(*) from public.obligation)||'/'||
                       (select count(*) from public.staffing_assignment));
  if sig_before <> sig_after then
    n_fail:=n_fail+1; raise notice 'AV-RESIDUE FAIL: availability wrote — % -> %', sig_before, sig_after;
  end if;

  raise notice 'v308 PERMANENT PROOF: % PASS / % FAIL / 0 SKIPPED / 0 UNPROVEN', n_pass, n_fail;
  if n_fail > 0 then
    raise exception 'v308 PERMANENT PROOF FAILED: % claim(s) violated', n_fail;
  end if;
  raise exception 'V308_PERMANENT_ROLLBACK';
exception
  when others then
    if sqlerrm = 'V308_PERMANENT_ROLLBACK' then
      raise notice 'v308 permanent proof rolled back cleanly — zero residue';
    else raise;
    end if;
end $$;
