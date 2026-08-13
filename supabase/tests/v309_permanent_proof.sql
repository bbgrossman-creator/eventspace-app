-- ============================================================================
-- v309 PERMANENT PROOF — one availability authority, rendered not recomputed
-- Self-rolling-back, rerunnable, zero residue.
--
-- THE PROPERTY. After v309 there is no second availability authority anywhere
-- between the ceremony and the screen. Every preview surface reports what
-- action_evaluate reports, in the legacy shape, with declared wording.
--
-- WP-1   AGREEMENT · every next_actions entry's `available` equals
--        action_evaluate's for the same action and subject
-- WP-2   no duplicate can advertise an action the ceremony refuses — the
--        unauthorized actor now sees unavailable where the old inline rule
--        performed no Class-U check at all
-- WP-3   no canonical lifecycle action disappears from the projection
-- WP-4   the projection's `reason` is the canonical declared ground
-- WP-5   the legacy next_actions shape survives, with reason_code ADDed
-- WP-6   event_stage_detail.blockers correspond to DECLARED rung data — the
--        counted kinds and the closeout ground — with nothing invented
-- WP-7   event_stage_detail keeps its declared types (next_action text,
--        blockers array) and gains next_actions
-- WP-8   ONE SOURCE · workspace and stage-detail report the identical
--        projection; neither computes its own
-- WP-9   required-field rendering derives from declared requirements,
--        including the | alternation group
-- WP-10  event_workspace.blockers closeout wording is the declared ground
--
-- Ten claims. v308's AV-1..AV-19 and the v306/v307a/v307b suites run as
-- regressions: v309 moves no ceremony and changes no authority.
-- ============================================================================

do $$
declare
  n_pass int := 0; n_fail int := 0; v_sfx text;
  v_tenant uuid; v_user uuid;
  sig_before text; sig_after text;
  bA uuid; ocA uuid; evA uuid; oblA uuid;
  bD uuid; ocD uuid; evD uuid;
  ws jsonb; sd jsonb; na jsonb; ev jsonb; v_n int; v_txt text;
begin
  select tu.tenant_id, tu.user_id into v_tenant, v_user
    from public.tenant_users tu
   where tu.active and tu.role in ('admin','owner','manager','ops')
   order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'v309 PERMANENT PROOF BLOCKED: no active tenant_users row with an operating role';
  end if;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_sfx := substr(gen_random_uuid()::text, 1, 8);
  raise notice 'v309-permanent: tenant=% actor=%', v_tenant, v_user;

  -- ── FIXTURE A · open event with an unresolved pre-service obligation ──────
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'WP-A', 'WPA-'||v_sfx, 'active') returning id into bA;
  ocA := (public.open_occurrence(bA, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref, origin_commitment_ref, released_by)
    values (v_tenant, bA, ocA, gen_random_uuid(), 'wp309') returning id into evA;
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, evA, 'event', gen_random_uuid(), 'release',
            'venue_setup', 'venue', 'pre-service anchor', 'wp309_a_'||v_sfx,
            jsonb_build_object('window_end', (now() + interval '96 hours')::text))
    returning id into oblA;

  -- ── FIXTURE D · in service, nothing outstanding ───────────────────────────
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'WP-D', 'WPD-'||v_sfx, 'active') returning id into bD;
  ocD := (public.open_occurrence(bD, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref, origin_commitment_ref, released_by)
    values (v_tenant, bD, ocD, gen_random_uuid(), 'wp309') returning id into evD;
  insert into public.execution_evidence (tenant_id, event_ref, kind, actor, payload)
    values (v_tenant, evD, 'service_start', 'wp', '{}'::jsonb);

  sig_before := (select (select count(*) from public.event)||'/'||
                        (select count(*) from public.execution_evidence)||'/'||
                        (select count(*) from public.engagement_occurrence)||'/'||
                        (select count(*) from public.obligation));

  -- ══ WP-1 · AGREEMENT ═════════════════════════════════════════════════════
  select count(*)::int into v_n
    from (select evA as e union all select evD) t,
         lateral jsonb_array_elements(public.availability_lifecycle_actions(t.e)) a
   where (a->>'available')::boolean
         is distinct from (public.action_evaluate(a->>'action', t.e)->>'available')::boolean;
  if v_n = 0 then
    n_pass:=n_pass+1; raise notice 'WP-1 PASS: every projected entry agrees with action_evaluate — one authority, two renderings';
  else n_fail:=n_fail+1; raise notice 'WP-1 FAIL: % disagreeing entr(ies)', v_n; end if;

  -- ══ WP-3 · nothing lost ══════════════════════════════════════════════════
  select count(*)::int into v_n
    from jsonb_array_elements(public.available_actions('event', evA)) a
   where a->>'group_key' = 'lifecycle'
     and not exists (select 1 from jsonb_array_elements(public.availability_lifecycle_actions(evA)) p
                      where p->>'action' = a->>'action_key');
  if v_n = 0 then
    n_pass:=n_pass+1; raise notice 'WP-3 PASS: no canonical lifecycle action disappears from the preserved projection';
  else n_fail:=n_fail+1; raise notice 'WP-3 FAIL: % canonical action(s) missing', v_n; end if;

  -- ══ WP-4 · declared ground as the reason ═════════════════════════════════
  select count(*)::int into v_n
    from jsonb_array_elements(public.availability_lifecycle_actions(evA)) a
   where not (a->>'available')::boolean
     and a->>'reason' is distinct from (public.action_evaluate(a->>'action', evA)->>'reason_detail');
  if v_n = 0 then
    n_pass:=n_pass+1; raise notice 'WP-4 PASS: the projection''s reason IS the canonical declared ground, not a hand-written string';
  else n_fail:=n_fail+1; raise notice 'WP-4 FAIL: % reason mismatch(es)', v_n; end if;

  -- ══ WP-5 · legacy shape survives, reason_code added ══════════════════════
  na := public.availability_lifecycle_actions(evA);
  select count(*)::int into v_n from jsonb_array_elements(na) a
   where not (a ? 'action' and a ? 'label' and a ? 'available' and a ? 'reason' and a ? 'reason_code');
  if jsonb_typeof(na) = 'array' and v_n = 0 and jsonb_array_length(na) = 2
     and (na->0->>'action') = 'start_service' and (na->1->>'action') = 'close_event' then
    n_pass:=n_pass+1; raise notice 'WP-5 PASS: the legacy next_actions contract survives — array, both entries, declared order, reason_code ADDed';
  else n_fail:=n_fail+1; raise notice 'WP-5 FAIL: %', na::text; end if;

  -- ══ WP-2 · no duplicate advertises what the ceremony refuses ═════════════
  perform set_config('app.user_id', gen_random_uuid()::text, true);
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  select count(*)::int into v_n
    from jsonb_array_elements(public.availability_lifecycle_actions(evD)) a
   where (a->>'available')::boolean;
  ws := public.availability_lifecycle_actions(evD);
  if v_n = 0 and (ws->0->>'reason_code') = 'unauthorized' then
    n_pass:=n_pass+1; raise notice 'WP-2 PASS: an unauthorized actor sees nothing available — the retired inline rule performed no Class-U check at all';
  else n_fail:=n_fail+1; raise notice 'WP-2 FAIL: % advertised to an unauthorized actor', v_n; end if;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);

  -- ══ WP-8 · ONE SOURCE ════════════════════════════════════════════════════
  ws := public.event_workspace(evD);
  sd := public.event_stage_detail(evD);
  if (ws->'next_actions') = (sd->'next_actions')
     and (ws->'next_actions') = public.availability_lifecycle_actions(evD) then
    n_pass:=n_pass+1; raise notice 'WP-8 PASS: workspace and stage-detail report the identical projection — neither computes its own';
  else n_fail:=n_fail+1; raise notice 'WP-8 FAIL: surfaces diverge'; end if;

  -- ══ WP-6 · blockers correspond to declared rung data ═════════════════════
  -- in_service: every blocker is either a counted-kind obligation outcome or
  -- the declared closeout ground. Nothing invented.
  sd := public.event_stage_detail(evD);
  select count(*)::int into v_n
    from jsonb_array_elements_text(sd->'blockers') b
   where b <> public.availability_declared_ground('close_event','closeout_override_supplied')
     and not exists (select 1 from public.obligation o
                      where o.event_ref=evD and o.tenant_id=v_tenant
                        and o.kind = any (public.availability_obligation_kinds('close_event'))
                        and o.required_outcome = b);
  if v_n = 0 and sd->'blockers' @> jsonb_build_array(
       public.availability_declared_ground('close_event','closeout_override_supplied')) then
    n_pass:=n_pass+1; raise notice 'WP-6 PASS: every blocker traces to a declared rung — counted kinds or the closeout ground; none is invented';
  else n_fail:=n_fail+1; raise notice 'WP-6 FAIL: % blocker(s) with no declared rung behind them', v_n; end if;

  -- ══ WP-7 · stage-detail types preserved, next_actions added ══════════════
  if jsonb_typeof(sd->'next_action') = 'string'
     and jsonb_typeof(sd->'blockers') = 'array'
     and jsonb_typeof(sd->'stage') = 'string'
     and jsonb_typeof(sd->'next_actions') = 'array'
     and sd ? 'why' and sd ? 'established_by' and sd ? 'readiness' then
    n_pass:=n_pass+1; raise notice 'WP-7 PASS: event_stage_detail keeps every declared key and type, and gains next_actions';
  else n_fail:=n_fail+1; raise notice 'WP-7 FAIL: %', (sd - 'established_by')::text; end if;

  -- ══ WP-9 · required fields derive from declared requirements ═════════════
  select count(*)::int into v_n
    from jsonb_array_elements(public.available_actions('event', evA)) a
   where a->>'action_key' in ('start_service','close_event','record_execution_evidence')
     and (a->'required_fields')::jsonb
         is distinct from to_jsonb(public.action_required_fields(a->>'action_key'));
  select coalesce(array_to_string(public.action_required_fields('release_event'),','),'') into v_txt;
  if v_n = 0 and v_txt = 'signoff_ref,clearance_ref|waiver_ref' then
    n_pass:=n_pass+1; raise notice 'WP-9 PASS: required-field rendering derives from the declared requirements, alternation group included';
  else n_fail:=n_fail+1; raise notice 'WP-9 FAIL: v_n=% fields=[%]', v_n, v_txt; end if;

  -- ══ WP-10 · workspace closeout blocker is the declared ground ════════════
  ws := public.event_workspace(evD);
  select count(*)::int into v_n
    from jsonb_array_elements(ws->'blockers') b
   where b->>'what' = 'Final closeout (return / inspection / financial)'
     and b->>'why' = public.availability_declared_ground('close_event','closeout_override_supplied');
  if v_n = 1 then
    n_pass:=n_pass+1; raise notice 'WP-10 PASS: the workspace closeout blocker carries the authority''s declared ground, not a restatement';
  else n_fail:=n_fail+1; raise notice 'WP-10 FAIL: found % declared-ground closeout blocker(s)', v_n; end if;

  -- ══ residue ══════════════════════════════════════════════════════════════
  sig_after := (select (select count(*) from public.event)||'/'||
                       (select count(*) from public.execution_evidence)||'/'||
                       (select count(*) from public.engagement_occurrence)||'/'||
                       (select count(*) from public.obligation));
  if sig_before <> sig_after then
    n_fail:=n_fail+1; raise notice 'WP-RESIDUE FAIL: a projection wrote — % -> %', sig_before, sig_after;
  end if;

  raise notice 'v309 PERMANENT PROOF: % PASS / % FAIL / 0 SKIPPED / 0 UNPROVEN', n_pass, n_fail;
  if n_fail > 0 then
    raise exception 'v309 PERMANENT PROOF FAILED: % claim(s) violated', n_fail;
  end if;
  raise exception 'V309_PERMANENT_ROLLBACK';
exception
  when others then
    if sqlerrm = 'V309_PERMANENT_ROLLBACK' then
      raise notice 'v309 permanent proof rolled back cleanly — zero residue';
    else raise;
    end if;
end $$;
