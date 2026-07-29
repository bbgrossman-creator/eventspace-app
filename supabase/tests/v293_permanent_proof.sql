-- ════════════════════════════════════════════════════════════════════════════
-- v293 PERMANENT PROOF — Work ceremony invariants
-- Self-rolling-back, rerunnable, zero residue.
--
-- STANDING proof. Runs against the migrated production database indefinitely.
-- It does not require a clone, does not depend on pre-v293 state, and does not
-- use the one-shot comparison architecture.
--
-- Claims (permanent behavioural invariants):
--   WP-1  the wrappers admit no actor parameter, and the actor is derived
--   WP-2  claim is unowned-only; a second claim refuses via the certified CAS
--   WP-3  a duplicate completion is refused (frozen decision, §0)
--   WP-4  completion derives 'discharged' — state is never written
--   WP-5  a session without active membership is refused, and writes nothing
--   WP-6  an absent responsibility refuses as not-found, and writes nothing
--   WP-7  both wrappers remain VOLATILE, SECURITY DEFINER, search_path pinned
--   WP-8  completion does NOT require ownership (frozen decision, §0)
--
-- OUTCOMES — blocking policy identical to the v292d1 ruling:
--   PASS      the invariant holds
--   FAIL      the invariant is violated                  -> BLOCKS
--   UNPROVEN  applies but could not be exercised here    -> BLOCKS
--   SKIPPED   inapplicable                               -> BLOCKS
-- v293 has no expressly permitted skip category. Every non-PASS outcome blocks,
-- and each is counted and named in a single greppable summary line.
--
-- Behaviour over implementation. WP-7 is the only catalog read, and it
-- supplements the behavioural claims rather than replacing any of them. Note
-- what WP-2's refusal message and WP-3's evidence kind establish: the certified
-- delegates are doing the work. Nothing here re-implements ownership, evidence
-- or state.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  n_pass     int := 0;
  n_fail     int := 0;
  n_skip     int := 0;
  n_unproven int := 0;
  v_tenant   uuid; v_user uuid; v_actor text;
  v_orphan   uuid := gen_random_uuid();
  v_absent   uuid := gen_random_uuid();
  r_claim    uuid; r_complete uuid; r_unowned uuid;
  v_nargs    text; v_shape text;
  v_own      text; v_act text; v_action text;
  v_state    text; v_kind text;
  v_n        int; v_m int;
  v_led_before bigint; v_evi_before bigint;
  v_led_after  bigint; v_evi_after  bigint;
  v_err      text;
begin
  -- ── identity ─────────────────────────────────────────────────────────────
  select tu.tenant_id, tu.user_id into v_tenant, v_user
    from public.tenant_users tu where tu.active order by tu.tenant_id limit 1;
  if v_tenant is null then
    -- Not a permitted skip: the proof requires an active member and its absence
    -- is an environmental defect that must block certification.
    raise exception 'v293 PERMANENT PROOF BLOCKED: no active tenant_users row — the work ceremonies cannot be exercised in this environment';
  end if;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_actor := public.action_actor();
  raise notice 'v293-permanent: tenant=% actor=%', v_tenant, v_actor;

  if not public.is_active_member() then
    raise exception 'v293 PERMANENT PROOF BLOCKED: the discovered identity is not an active member';
  end if;

  -- ── fixtures: lawful STANDING responsibilities (v286 SC-3 pattern) ───────
  -- knowledge origin, pinned revision, no event anchor. Rolled back with the
  -- rest of the transaction.
  insert into public.obligation
    (tenant_id, event_ref, scope, origin_ref, origin_kind, origin_revision,
     kind, department, required_outcome, natural_key, timing)
  values (v_tenant, null, 'standing', gen_random_uuid(), 'knowledge', gen_random_uuid(),
          'prep', 'culinary', 'v293 permanent claim probe',
          'v293p_claim_'||gen_random_uuid()::text,
          jsonb_build_object('window_end', (now() + interval '6 hours')::text))
  returning id into r_claim;

  insert into public.obligation
    (tenant_id, event_ref, scope, origin_ref, origin_kind, origin_revision,
     kind, department, required_outcome, natural_key, timing)
  values (v_tenant, null, 'standing', gen_random_uuid(), 'knowledge', gen_random_uuid(),
          'prep', 'culinary', 'v293 permanent complete probe',
          'v293p_complete_'||gen_random_uuid()::text,
          jsonb_build_object('window_end', (now() + interval '6 hours')::text))
  returning id into r_complete;

  insert into public.obligation
    (tenant_id, event_ref, scope, origin_ref, origin_kind, origin_revision,
     kind, department, required_outcome, natural_key, timing)
  values (v_tenant, null, 'standing', gen_random_uuid(), 'knowledge', gen_random_uuid(),
          'stage', 'equipment', 'v293 permanent unowned-completion probe',
          'v293p_unowned_'||gen_random_uuid()::text,
          jsonb_build_object('window_end', (now() + interval '6 hours')::text))
  returning id into r_unowned;

  -- ══ WP-1 · no actor parameter exists, and the actor is derived ══════════
  select string_agg(p.proname||'/'||p.pronargs::text, ',' order by p.proname)
    into v_nargs
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('claim_responsibility', 'complete_responsibility');

  perform public.claim_responsibility(r_claim);
  select ro.owner, ro.actor, ro.action into v_own, v_act, v_action
    from public.responsibility_owner ro
   where ro.responsibility_ref = r_claim and ro.tenant_id = v_tenant
   order by ro.seq desc limit 1;

  if v_nargs = 'claim_responsibility/1,complete_responsibility/2'
     and v_own = v_actor and v_act = v_actor then
    raise notice 'WP-1 PASS: the signatures admit no actor parameter (%), and both owner and actor were derived server-side as % — a client cannot assert an identity here', v_nargs, v_actor;
    n_pass := n_pass + 1;
  else
    raise notice 'WP-1 FAIL: signatures=% owner=% actor=% expected_actor=%', v_nargs, v_own, v_act, v_actor;
    n_fail := n_fail + 1;
  end if;

  -- ══ WP-2 · unowned-only; the second claim refuses via the certified CAS ══
  if v_action <> 'assign' then
    raise notice 'WP-2 FAIL: first claim recorded action=% (expected assign)', v_action;
    n_fail := n_fail + 1;
  else
    v_err := null;
    begin
      perform public.claim_responsibility(r_claim);
    exception when others then
      v_err := sqlerrm;
    end;
    select count(*) into v_n from public.responsibility_owner
     where responsibility_ref = r_claim and tenant_id = v_tenant;
    if v_err like '%OWNERSHIP_CONFLICT%' and v_n = 1 then
      raise notice 'WP-2 PASS: a second claim was refused as OWNERSHIP_CONFLICT and the ledger still holds exactly one act — the compare-and-swap, not the wrapper, decided this';
      n_pass := n_pass + 1;
    else
      raise notice 'WP-2 FAIL: err=% ledger_rows=%', coalesce(v_err,'(no refusal)'), v_n;
      n_fail := n_fail + 1;
    end if;
  end if;

  -- ══ WP-3 · duplicate completion refused ═════════════════════════════════
  perform public.complete_responsibility(r_complete, jsonb_build_object('verb','probe'));
  v_err := null;
  begin
    perform public.complete_responsibility(r_complete);
  exception when others then
    v_err := sqlerrm;
  end;
  select count(*) into v_n from public.execution_evidence
   where obligation_ref = r_complete and tenant_id = v_tenant and kind = 'completion';
  if v_err like '%COMPLETION_ALREADY_RECORDED%' and v_n = 1 then
    raise notice 'WP-3 PASS: a second completion was refused and exactly one completion fact survives';
    n_pass := n_pass + 1;
  else
    raise notice 'WP-3 FAIL: err=% completion_rows=%', coalesce(v_err,'(no refusal)'), v_n;
    n_fail := n_fail + 1;
  end if;

  -- ══ WP-4 · completion derives discharged ════════════════════════════════
  select e.kind into v_kind from public.execution_evidence e
   where e.obligation_ref = r_complete and e.tenant_id = v_tenant
   order by e.moment desc limit 1;
  v_state := public.responsibility_state(r_complete);
  if v_kind = 'completion' and v_state = 'discharged' then
    raise notice 'WP-4 PASS: the recorded fact is kind=completion and responsibility_state() DERIVES discharged — no state was written anywhere';
    n_pass := n_pass + 1;
  else
    raise notice 'WP-4 FAIL: kind=% state=%', v_kind, v_state;
    n_fail := n_fail + 1;
  end if;

  -- ══ WP-8 · completion does NOT require ownership (frozen decision) ══════
  -- Pinned deliberately: a later "helpful" ownership check here would be new
  -- semantics the delegate does not have, and would break the operational case
  -- of a manager recording for the person doing the work.
  if public.responsibility_current_owner(r_unowned) is not null then
    raise notice 'WP-8 UNPROVEN: the fixture row acquired an owner; the unowned-completion path cannot be exercised';
    n_unproven := n_unproven + 1;
  else
    perform public.complete_responsibility(r_unowned);
    v_state := public.responsibility_state(r_unowned);
    if v_state = 'discharged' then
      raise notice 'WP-8 PASS: an UNOWNED responsibility completed lawfully and derives discharged — completion is not gated on ownership';
      n_pass := n_pass + 1;
    else
      raise notice 'WP-8 FAIL: unowned completion produced state=%', v_state;
      n_fail := n_fail + 1;
    end if;
  end if;

  -- ══ WP-5 · no active membership ⇒ refused, nothing written ══════════════
  select count(*) into v_led_before from public.responsibility_owner;
  select count(*) into v_evi_before from public.execution_evidence;

  perform set_config('app.user_id', v_orphan::text, true);
  perform set_config('request.jwt.claim.sub', v_orphan::text, true);

  if public.is_active_member() then
    perform set_config('app.user_id', v_user::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    raise notice 'WP-5 UNPROVEN: a freshly generated uid resolved as an active member; the unauthorized path cannot be exercised honestly here';
    n_unproven := n_unproven + 1;
  else
    v_err := null;
    begin
      perform public.claim_responsibility(r_claim);
    exception when others then v_err := sqlerrm; end;
    v_shape := coalesce(v_err, '(no refusal)');

    v_err := null;
    begin
      perform public.complete_responsibility(r_claim);
    exception when others then v_err := sqlerrm; end;

    perform set_config('app.user_id', v_user::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);

    select count(*) into v_led_after from public.responsibility_owner;
    select count(*) into v_evi_after from public.execution_evidence;

    if v_shape like '%WORK_NOT_AUTHORIZED%' and v_err like '%WORK_NOT_AUTHORIZED%'
       and v_led_after = v_led_before and v_evi_after = v_evi_before then
      raise notice 'WP-5 PASS: both ceremonies refused a session without active membership, and neither the ownership ledger nor the evidence ledger moved';
      n_pass := n_pass + 1;
    else
      raise notice 'WP-5 FAIL: claim=% complete=% ledger %->% evidence %->%',
        v_shape, coalesce(v_err,'(no refusal)'), v_led_before, v_led_after, v_evi_before, v_evi_after;
      n_fail := n_fail + 1;
    end if;
  end if;

  -- ══ WP-6 · absent responsibility ⇒ not-found, nothing written ═══════════
  select count(*) into v_led_before from public.responsibility_owner;
  select count(*) into v_evi_before from public.execution_evidence;

  v_err := null;
  begin
    perform public.claim_responsibility(v_absent);
  exception when others then v_err := sqlerrm; end;
  v_shape := coalesce(v_err, '(no refusal)');

  v_err := null;
  begin
    perform public.complete_responsibility(v_absent);
  exception when others then v_err := sqlerrm; end;

  select count(*) into v_led_after from public.responsibility_owner;
  select count(*) into v_evi_after from public.execution_evidence;

  if v_shape like '%RESP_NOT_FOUND%' and v_err like '%CEREMONY_NOT_FOUND%'
     and v_led_after = v_led_before and v_evi_after = v_evi_before then
    raise notice 'WP-6 PASS: an absent responsibility refuses as not-found on both paths — existence does not leak — and nothing was written';
    n_pass := n_pass + 1;
  else
    raise notice 'WP-6 FAIL: claim=% complete=% ledger %->% evidence %->%',
      v_shape, coalesce(v_err,'(no refusal)'), v_led_before, v_led_after, v_evi_before, v_evi_after;
    n_fail := n_fail + 1;
  end if;

  -- ══ WP-7 · shape guard ══════════════════════════════════════════════════
  -- provolatile is type "char"; the explicit ::text cast is required or the
  -- concatenation is ambiguous.
  select string_agg(p.provolatile::text||'/'||p.prosecdef::text||'/'||
                    coalesce(array_to_string(p.proconfig, ','), '(none)'),
                    ' ' order by p.proname)
    into v_shape
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('claim_responsibility', 'complete_responsibility');

  if v_shape = 'v/true/search_path=public v/true/search_path=public' then
    raise notice 'WP-7 PASS: both wrappers remain VOLATILE, SECURITY DEFINER and search_path-pinned — they write, and declaring them STABLE would be false';
    n_pass := n_pass + 1;
  else
    raise notice 'WP-7 FAIL: shape=% (expected v/true/search_path=public twice)', v_shape;
    n_fail := n_fail + 1;
  end if;

  -- ══ summary ═════════════════════════════════════════════════════════════
  raise notice 'v293 PERMANENT PROOF: % PASS / % FAIL / % SKIPPED / % UNPROVEN',
               n_pass, n_fail, n_skip, n_unproven;

  if n_fail > 0 then
    raise exception 'v293 PERMANENT PROOF FAILED: % claim(s) violated', n_fail;
  elsif n_unproven > 0 then
    raise exception 'v293 PERMANENT PROOF BLOCKED: % claim(s) UNPROVEN — environmental or harness defect, not a permitted outcome', n_unproven;
  elsif n_skip > 0 then
    raise exception 'v293 PERMANENT PROOF BLOCKED: % skipped claim(s) — v293 has no permitted skip category', n_skip;
  end if;

  raise exception 'V293_PERMANENT_ROLLBACK';
exception
  when others then
    if sqlerrm = 'V293_PERMANENT_ROLLBACK' then
      raise notice 'v293 permanent proof rolled back cleanly — zero residue';
    else raise;
    end if;
end $$;
