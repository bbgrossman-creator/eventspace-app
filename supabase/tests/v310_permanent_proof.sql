-- ============================================================================
-- v310 PERMANENT PROOF — event_stage is a projection, not an authority
-- Self-rolling-back, rerunnable, zero residue.
--
-- THE PROPERTY. The legacy stage vocabulary survives intact above canonical
-- operational truth, and can no longer contradict it.
--
-- SC-1   event_stage keeps its callable contract and returns NULL for a
--        non-visible subject
-- SC-2   the complete vocabulary remains reachable:
--        released · in_prep · ready · in_service · closed
-- SC-3   the canonical closed fact ⇒ 'closed'
-- SC-4   the canonical service-start fact ⇒ 'in_service'
-- SC-5   a canonically start-service-admissible event ⇒ 'ready'
-- SC-6   E-1 (owner ruling) · zero pre-service obligations with start_service
--        AVAILABLE ⇒ 'ready', never 'released'
-- SC-7   the obsolete contradiction is IMPOSSIBLE · no state exists where
--        start_service is admissible and the stage is released or in_prep
-- SC-8   in_prep survives as the preserved "work has begun" classification
-- SC-9   .stage survives on the start_service success payload
-- SC-10  .stage survives on the close_event success payload
-- SC-11  why cannot contradict canonical availability
-- SC-12  next_action never tells an operator to begin preparation while
--        start_service is admissible
-- SC-13  blockers remain externally correct without stage-keyed selection
-- SC-14  readiness IS the authority's verdict, not a second derivation
-- SC-15  frozen v308/v309 availability is unchanged by this release
-- SC-16  L21 PRESERVED · action_evaluate still carries exactly one event_stage
--        call, so v308's frozen one-shot US-5 remains true
--
-- Sixteen claims. v306/v307a/v307b/v308/v309 run as regressions: v310 moves no
-- authority and no ceremony.
-- ============================================================================

do $$
declare
  n_pass int := 0; n_fail int := 0; v_sfx text; v_err text;
  v_tenant uuid; v_user uuid;
  v_absent uuid := '00000000-0000-0000-0000-000000000000';
  sig_before text; sig_after text;
  bZ uuid; ocZ uuid; evZ uuid;                 -- zero obligations           → ready
  bK uuid; ocK uuid; evK uuid;                 -- a SECOND ready event, spent by SC-9
  bB uuid; ocB uuid; evB uuid; oblB uuid;      -- unresolved, no work        → released
  bP uuid; ocP uuid; evP uuid; oblP uuid;      -- unresolved + work begun    → in_prep
  bS uuid; ocS uuid; evS uuid;                 -- service started            → in_service
  bC uuid; ocC uuid; evC uuid;                 -- closed                     → closed
  sd jsonb; r jsonb; v_n int; v_txt text;
begin
  select tu.tenant_id, tu.user_id into v_tenant, v_user
    from public.tenant_users tu
   where tu.active and tu.role in ('admin','owner','manager','ops')
   order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'v310 PERMANENT PROOF BLOCKED: no active tenant_users row with an operating role';
  end if;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_sfx := substr(gen_random_uuid()::text, 1, 8);
  raise notice 'v310-permanent: tenant=% actor=%', v_tenant, v_user;

  -- ── fixtures, one per reachable stage ────────────────────────────────────
  insert into public.bookings (tenant_id,contact_name,invoice_num,status)
    values (v_tenant,'SC-Z','SCZ-'||v_sfx,'active') returning id into bZ;
  ocZ := (public.open_occurrence(bZ,null,null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id,engagement_ref,occurrence_ref,origin_commitment_ref,released_by)
    values (v_tenant,bZ,ocZ,gen_random_uuid(),'sc310') returning id into evZ;

  -- SC-9 invokes a real ceremony, which would advance its subject. It gets its
  -- own ready event so the narrative claims below read an unspent fixture.
  insert into public.bookings (tenant_id,contact_name,invoice_num,status)
    values (v_tenant,'SC-K','SCK-'||v_sfx,'active') returning id into bK;
  ocK := (public.open_occurrence(bK,null,null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id,engagement_ref,occurrence_ref,origin_commitment_ref,released_by)
    values (v_tenant,bK,ocK,gen_random_uuid(),'sc310') returning id into evK;

  insert into public.bookings (tenant_id,contact_name,invoice_num,status)
    values (v_tenant,'SC-B','SCB-'||v_sfx,'active') returning id into bB;
  ocB := (public.open_occurrence(bB,null,null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id,engagement_ref,occurrence_ref,origin_commitment_ref,released_by)
    values (v_tenant,bB,ocB,gen_random_uuid(),'sc310') returning id into evB;
  insert into public.obligation (tenant_id,event_ref,scope,origin_ref,origin_kind,
      kind,department,required_outcome,natural_key,timing)
    values (v_tenant,evB,'event',gen_random_uuid(),'release','venue_setup','venue',
            'unresolved pre-service','sc310_b_'||v_sfx,
            jsonb_build_object('window_end',(now()+interval '96 hours')::text))
    returning id into oblB;

  insert into public.bookings (tenant_id,contact_name,invoice_num,status)
    values (v_tenant,'SC-P','SCP-'||v_sfx,'active') returning id into bP;
  ocP := (public.open_occurrence(bP,null,null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id,engagement_ref,occurrence_ref,origin_commitment_ref,released_by)
    values (v_tenant,bP,ocP,gen_random_uuid(),'sc310') returning id into evP;
  insert into public.obligation (tenant_id,event_ref,scope,origin_ref,origin_kind,
      kind,department,required_outcome,natural_key,timing)
    values (v_tenant,evP,'event',gen_random_uuid(),'release','venue_setup','venue',
            'unresolved pre-service','sc310_p_'||v_sfx,
            jsonb_build_object('window_end',(now()+interval '96 hours')::text))
    returning id into oblP;
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant,evP,'assignment','sc','{}'::jsonb);

  insert into public.bookings (tenant_id,contact_name,invoice_num,status)
    values (v_tenant,'SC-S','SCS-'||v_sfx,'active') returning id into bS;
  ocS := (public.open_occurrence(bS,null,null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id,engagement_ref,occurrence_ref,origin_commitment_ref,released_by)
    values (v_tenant,bS,ocS,gen_random_uuid(),'sc310') returning id into evS;
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant,evS,'service_start','sc','{}'::jsonb);

  insert into public.bookings (tenant_id,contact_name,invoice_num,status)
    values (v_tenant,'SC-C','SCC-'||v_sfx,'active') returning id into bC;
  ocC := (public.open_occurrence(bC,null,null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id,engagement_ref,occurrence_ref,origin_commitment_ref,released_by)
    values (v_tenant,bC,ocC,gen_random_uuid(),'sc310') returning id into evC;
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant,evC,'event_closed','sc','{}'::jsonb);

  sig_before := (select (select count(*) from public.event)||'/'||
                        (select count(*) from public.execution_evidence)||'/'||
                        (select count(*) from public.engagement_occurrence)||'/'||
                        (select count(*) from public.obligation));

  -- ══ SC-1 · callable contract + NULL for a non-visible subject ════════════
  if public.event_stage(v_absent) is null
     and (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='event_stage'
             and pg_get_function_identity_arguments(p.oid) = 'p_event uuid'
             and pg_get_function_result(p.oid) = 'text') = 1 then
    n_pass:=n_pass+1; raise notice 'SC-1 PASS: event_stage(uuid)->text is unchanged and still returns NULL for a non-visible subject';
  else n_fail:=n_fail+1; raise notice 'SC-1 FAIL: contract changed'; end if;

  -- ══ SC-2 · the complete vocabulary remains reachable ═════════════════════
  v_txt := public.event_stage(evB)||'/'||public.event_stage(evP)||'/'||public.event_stage(evZ)
           ||'/'||public.event_stage(evS)||'/'||public.event_stage(evC);
  if v_txt = 'released/in_prep/ready/in_service/closed' then
    n_pass:=n_pass+1; raise notice 'SC-2 PASS: released · in_prep · ready · in_service · closed all remain reachable — no stage removed or renamed';
  else n_fail:=n_fail+1; raise notice 'SC-2 FAIL: [%]', v_txt; end if;

  -- ══ SC-3 / SC-4 · terminal facts drive the terminal stages ══════════════
  if public.event_stage(evC) = 'closed'
     and public.admissibility_execution_fact('event', evC, 'event_closed') then
    n_pass:=n_pass+1; raise notice 'SC-3 PASS: the canonical closed fact yields closed';
  else n_fail:=n_fail+1; raise notice 'SC-3 FAIL'; end if;

  if public.event_stage(evS) = 'in_service'
     and public.admissibility_execution_fact('event', evS, 'service_start') then
    n_pass:=n_pass+1; raise notice 'SC-4 PASS: the canonical service-start fact yields in_service';
  else n_fail:=n_fail+1; raise notice 'SC-4 FAIL'; end if;

  -- ══ SC-5 · ready IS the authority's verdict ═════════════════════════════
  if public.event_stage(evZ) = 'ready'
     and public.stage_action_admissible('start_service', evZ) then
    n_pass:=n_pass+1; raise notice 'SC-5 PASS: a canonically start-service-admissible event reports ready';
  else n_fail:=n_fail+1; raise notice 'SC-5 FAIL'; end if;

  -- ══ SC-6 · E-1, the owner ruling ════════════════════════════════════════
  if public.event_stage(evZ) = 'ready'
     and (public.action_evaluate('start_service', evZ)->>'available')::boolean is true then
    n_pass:=n_pass+1; raise notice 'SC-6 PASS: E-1 — a ZERO pre-service obligation event with start_service AVAILABLE reports ready, never released';
  else n_fail:=n_fail+1; raise notice 'SC-6 FAIL: stage=[%] available=[%]',
       public.event_stage(evZ), (public.action_evaluate('start_service',evZ)->>'available'); end if;

  -- ══ SC-7 · the contradiction is IMPOSSIBLE across every fixture ═════════
  select count(*)::int into v_n
    from (select evZ e union all select evB union all select evP
          union all select evS union all select evC) t
   where public.stage_action_admissible('start_service', t.e)
     and public.event_stage(t.e) in ('released','in_prep');
  if v_n = 0 then
    n_pass:=n_pass+1; raise notice 'SC-7 PASS: no state exists where start_service is admissible while the stage still reads released or in_prep — the obsolete v_pre_total condition is gone';
  else n_fail:=n_fail+1; raise notice 'SC-7 FAIL: % contradicting state(s)', v_n; end if;

  -- ══ SC-8 · in_prep is preserved ═════════════════════════════════════════
  if public.event_stage(evP) = 'in_prep' then
    n_pass:=n_pass+1; raise notice 'SC-8 PASS: in_prep survives as the preserved work-has-begun classification';
  else n_fail:=n_fail+1; raise notice 'SC-8 FAIL: [%]', public.event_stage(evP); end if;

  -- ══ SC-9 · .stage on the start_service payload ══════════════════════════
  r := public.start_service(evK, 'sc');
  if r ? 'stage' and r->>'stage' = 'in_service' and r ? 'event_id' then
    n_pass:=n_pass+1; raise notice 'SC-9 PASS: .stage survives on the start_service success payload — same key, same vocabulary';
  else n_fail:=n_fail+1; raise notice 'SC-9 FAIL: %', r::text; end if;

  -- ══ SC-10 · .stage on the close_event payload ═══════════════════════════
  r := public.close_event(evS, 'sc', 'override-'||v_sfx);
  if r ? 'stage' and r->>'stage' = 'closed' and r ? 'event_id' then
    n_pass:=n_pass+1; raise notice 'SC-10 PASS: .stage survives on the close_event success payload — the compatibility contract is intact';
  else n_fail:=n_fail+1; raise notice 'SC-10 FAIL: %', r::text; end if;

  -- ══ SC-11 · why cannot contradict canonical availability ════════════════
  select count(*)::int into v_n
    from (select evZ e union all select evB union all select evP) t
   where public.stage_action_admissible('start_service', t.e)
     and (public.event_stage_detail(t.e)->>'why') like '%preparation has not begun%';
  if v_n = 0 and (public.event_stage_detail(evZ)->>'why')
                 = 'Every pre-service obligation is resolved with no open exception; awaiting service start.' then
    n_pass:=n_pass+1; raise notice 'SC-11 PASS: why agrees with canonical truth — it cannot claim preparation has not begun while service is admissible';
  else n_fail:=n_fail+1; raise notice 'SC-11 FAIL: % contradiction(s)', v_n; end if;

  -- ══ SC-12 · next_action never misdirects ════════════════════════════════
  select count(*)::int into v_n
    from (select evZ e union all select evB union all select evP
          union all select evC) t
   where public.stage_action_admissible('start_service', t.e)
     and (public.event_stage_detail(t.e)->>'next_action') like 'Begin preparation%';
  if v_n = 0 and (public.event_stage_detail(evZ)->>'next_action') = 'Start service (start_service).' then
    n_pass:=n_pass+1; raise notice 'SC-12 PASS: next_action recommends the admissible action and never tells the operator to prepare while start_service is available';
  else n_fail:=n_fail+1; raise notice 'SC-12 FAIL: % misdirection(s)', v_n; end if;

  -- ══ SC-13 · blockers correct without stage-keyed selection ══════════════
  -- pre-service blocker present where work remains; none once closed
  sd := public.event_stage_detail(evB);
  if sd->'blockers' @> jsonb_build_array('unresolved pre-service')
     and jsonb_array_length(public.event_stage_detail(evC)->'blockers') = 0
     and jsonb_typeof(sd->'blockers') = 'array' then
    n_pass:=n_pass+1; raise notice 'SC-13 PASS: the externally observable blocker contract is preserved with the stage-keyed selector retired';
  else n_fail:=n_fail+1; raise notice 'SC-13 FAIL: %', (sd->'blockers')::text; end if;

  -- ══ SC-14 · readiness IS the verdict, not a second derivation ═══════════
  select count(*)::int into v_n
    from (select evZ e union all select evB union all select evP) t
   where (public.event_stage(t.e) = 'ready')
         is distinct from public.stage_action_admissible('start_service', t.e);
  if v_n = 0 then
    n_pass:=n_pass+1; raise notice 'SC-14 PASS: ready is exactly the authority''s verdict on start_service in every non-terminal state — no independent readiness rule survives';
  else n_fail:=n_fail+1; raise notice 'SC-14 FAIL: % divergence(s)', v_n; end if;

  -- ══ SC-15 · frozen v308/v309 availability unchanged ═════════════════════
  select count(*)::int into v_n
    from (select evB e union all select evP) t,
         lateral jsonb_array_elements(public.availability_lifecycle_actions(t.e)) a
   where (a->>'available')::boolean
         is distinct from (public.action_evaluate(a->>'action', t.e)->>'available')::boolean;
  if v_n = 0 then
    n_pass:=n_pass+1; raise notice 'SC-15 PASS: the v308/v309 availability authority and its projection are untouched by this release';
  else n_fail:=n_fail+1; raise notice 'SC-15 FAIL: % divergence(s)', v_n; end if;

  -- ══ SC-16 · L21 preserved, so v308's frozen one-shot stays true ═════════
  select count(*)::int into v_n
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='action_evaluate'
     and (length(p.prosrc) - length(replace(p.prosrc,'event_stage(',''))) / length('event_stage(') = 1;
  if v_n = 1 then
    n_pass:=n_pass+1; raise notice 'SC-16 PASS: L21 PRESERVED — action_evaluate still carries exactly one event_stage call, so v308''s frozen US-5 remains true';
  else n_fail:=n_fail+1; raise notice 'SC-16 FAIL: action_evaluate event_stage call count changed'; end if;

  -- ══ residue ══════════════════════════════════════════════════════════════
  sig_after := (select (select count(*) from public.event)||'/'||
                       (select count(*) from public.execution_evidence)||'/'||
                       (select count(*) from public.engagement_occurrence)||'/'||
                       (select count(*) from public.obligation));
  -- SC-9/SC-10 invoke real ceremonies, so evidence rows are EXPECTED to grow;
  -- the rollback below removes them. The fingerprint is reported, not asserted.
  raise notice 'v310 fixture fingerprint: % -> % (rolled back below)', sig_before, sig_after;

  raise notice 'v310 PERMANENT PROOF: % PASS / % FAIL / 0 SKIPPED / 0 UNPROVEN', n_pass, n_fail;
  if n_fail > 0 then
    raise exception 'v310 PERMANENT PROOF FAILED: % claim(s) violated', n_fail;
  end if;
  raise exception 'V310_PERMANENT_ROLLBACK';
exception
  when others then
    if sqlerrm = 'V310_PERMANENT_ROLLBACK' then
      raise notice 'v310 permanent proof rolled back cleanly — zero residue';
    else raise;
    end if;
end $$;
