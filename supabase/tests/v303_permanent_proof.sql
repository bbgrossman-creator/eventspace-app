-- ============================================================================
-- v303 PERMANENT PROOF — Occurrence readiness (ATL-1)
-- Self-rolling-back, rerunnable, zero residue.
-- Blocking policy = v292d1 ruling: FAIL blocks, UNPROVEN blocks, any skip blocks.
--
-- RS-1   cancellation has ABSOLUTE precedence and yields not_applicable
-- RS-2   phase derivation: preparing · released · settled
-- RS-3   a released occurrence with NO generated work is not vacuously settled
-- RS-4   the release gate has exactly ONE impeding blocker: commitment
-- RS-5   completeness INFORMS but never gates — releasable with facts missing
-- RS-6   every fact_missing reason is non-impeding and agrees with completeness
-- RS-7   a department is blocked iff at least one ground impedes
-- RS-8   workable is emitted for unimpeded outstanding work, carrying identity
-- RS-9   a department is READY with outstanding work — unimpeded is not complete
-- RS-10  overdue impedes
-- RS-11  dependency_unmet impedes and carries the RESOLVED blocking responsibility
-- RS-12  closure — every blocking responsibility appears in by_department
-- RS-13  not_due is non-impeding and carries opens_at
-- RS-14  ownerless is a lawful non-impeding NOTE beside the primary code
-- RS-15  exception_open is independently visible and non-impeding
-- RS-16  risk never changes a verdict
-- RS-17  the occurrence verdict composes EXACTLY from department verdicts
-- RS-18  blocker_count equals the impeding grounds, and the brief mirrors it
-- RS-19  owner_required is RESERVED — no ceremony requires ownership
-- RS-20  the obligation_state caller set is FROZEN against new callers
--         (8 named identities since 10 Aug 2026 — see the ALLOWED comment)
--
-- WHY THESE ARE PERMANENT. Readiness is truth under R-13, so every later release
-- must keep proving it. The BEHAVIOURAL half of the composed-guard story — making
-- the brief emit a different version — lives in proofs/v303_proofs.sh, because it
-- needs DDL and must run on a disposable clone, never here.
-- ============================================================================
do $$
declare
  n_pass int := 0; n_fail int := 0; n_skip int := 0; n_unproven int := 0;
  v_tenant uuid; v_user uuid; v_sfx text; v_now timestamptz := now();
  v_bookA uuid; v_occA uuid;                       -- preparing, no commitment
  v_bookB uuid; v_occB uuid;                       -- preparing, with commitment
  v_bookC uuid; v_occC uuid; v_evC uuid;           -- released, five departments
  v_bookD uuid; v_occD uuid; v_evD uuid;           -- released, no work
  v_prop uuid; v_ver uuid; v_snap uuid;
  v_lapsed uuid; v_dep uuid; v_work uuid; v_notdue uuid; v_owner uuid;
  v_nk_lapsed text;
  r jsonb; d jsonb; b jsonb; g jsonb;
  n int; m int; v_txt text;
  -- SCOPE CORRECTION, 10 August 2026, by architect ruling on report a5f7c3d9.
  -- The eighth entry is NOT a relaxation of RS-20's purpose. RS-20 predates
  -- C1/R-14 and exists to stop the legacy obligation_state vocabulary
  -- proliferating into new consumers while it awaits retirement. R-14.2 now
  -- requires each precondition to be authored in exactly one named predicate
  -- and forbids consumers to restate it, and the frozen v306 architecture
  -- designates admissibility_obligation_pending as THE centralized
  -- admissibility authority for this predicate. Admitting it therefore serves
  -- containment rather than defeating it: v307a migrates the ceremonies onto
  -- that single authority, which reduces the eventual caller set rather than
  -- growing it. This admits ONE named identity. Every other new caller still
  -- fails closed, and the v303 retirement debt is untouched.
  ALLOWED text[] := array['action_evaluate','close_event','event_readiness',
                          'event_stage','event_stage_detail','event_workspace',
                          'start_service','admissibility_obligation_pending'];
begin
  select tu.tenant_id, tu.user_id into v_tenant, v_user
    from public.tenant_users tu
   where tu.active and tu.role in ('admin','owner','manager','ops')
   order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'v303 PERMANENT PROOF BLOCKED: no active tenant_users row with an operating role';
  end if;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_sfx := substr(gen_random_uuid()::text, 1, 8);
  raise notice 'v303-permanent: tenant=% actor=%', v_tenant, v_user;

  -- ══ FIXTURE A · preparing, no accepted offer ═════════════════════════════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'RS-A', 'RSA-'||v_sfx, 'active') returning id into v_bookA;
  v_occA := (public.open_occurrence(v_bookA, null, null)->>'occurrence_id')::uuid;

  -- ══ RS-4 · the release gate's ONE impeding blocker ════════════════════════
  -- Of the three release predicates only `commitment` is a state of the world.
  -- `clearance` and `sign_off` are ARGUMENTS the operator supplies at ceremony
  -- time and cannot be missing in advance, so nothing else can block here.
  r := public.occurrence_readiness(v_occA, v_now);
  select count(*) into n from jsonb_array_elements(r->'blockers') x
   where (x->>'impedes')::boolean;
  select count(*) into m from jsonb_array_elements(r->'blockers') x
   where x->>'code' = 'release_fact_missing' and x->>'fact' = 'commitment';
  if r->>'phase' = 'preparing' and r->>'gate' = 'release'
     and r->>'verdict' = 'blocked' and n = 1 and m = 1 then
    n_pass := n_pass + 1;
    raise notice 'RS-4 PASS: with no unrescinded acceptance the release gate is blocked by EXACTLY one ground, commitment — clearance and sign_off are ceremony arguments, not pre-checkable facts';
  else
    n_fail := n_fail + 1;
    raise notice 'RS-4 FAIL: phase=% gate=% verdict=% impeding=% commitment=%',
      r->>'phase', r->>'gate', r->>'verdict', n, m;
  end if;

  -- ══ RS-6 · fact_missing is informational ═════════════════════════════════
  select count(*) into n from jsonb_array_elements(r->'reasons') x
   where (x->>'impedes')::boolean;
  select count(*) into m from jsonb_array_elements(r->'reasons') x
   where x->>'code' = 'fact_missing';
  b := public.projection_occurrence_brief(v_occA, v_now);
  if n = 0 and m > 0
     and m = jsonb_array_length(b->'data'->'completeness'->'missing') then
    n_pass := n_pass + 1;
    raise notice 'RS-6 PASS: all % fact_missing reasons are non-impeding and the set agrees exactly with data.completeness.missing — one truth, two views', m;
  else
    n_fail := n_fail + 1;
    raise notice 'RS-6 FAIL: impeding_reasons=% fact_missing=% completeness_missing=%',
      n, m, jsonb_array_length(b->'data'->'completeness'->'missing');
  end if;

  -- ══ FIXTURE B · preparing, WITH an unrescinded acceptance ════════════════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'RS-B', 'RSB-'||v_sfx, 'active') returning id into v_bookB;
  v_occB := (public.open_occurrence(v_bookB, null, null)->>'occurrence_id')::uuid;
  insert into public.proposals (tenant_id, booking_id, title, status)
    values (v_tenant, v_bookB, 'P303', 'draft') returning id into v_prop;
  insert into public.proposal_versions (tenant_id, proposal_id, version, status)
    values (v_tenant, v_prop, 1, 'sent') returning id into v_ver;
  insert into public.offer_snapshots (tenant_id, version_id, fingerprint, model,
      artifact_bytes, artifact_hash, artifact_meta, assets)
    values (v_tenant, v_ver, 'fp303-'||v_sfx, '{}'::jsonb,
            '\x00'::bytea, 'h', '{}'::jsonb, '{}'::jsonb) returning id into v_snap;
  insert into public.offer_acceptances (tenant_id, snapshot_id, fingerprint, booking_id,
      principal, authority_basis, evidence_basis, channel, recorded_moment)
    values (v_tenant, v_snap, 'fp303', v_bookB, '{}'::jsonb, 'b', 'b', 'portal', v_now);

  -- ══ RS-5 · completeness informs, never gates ═════════════════════════════
  -- v292a ruled it and OccurrencePrep says so on screen: "you may still release".
  r := public.occurrence_readiness(v_occB, v_now);
  select count(*) into n from jsonb_array_elements(r->'reasons') x
   where x->>'code' = 'fact_missing';
  if r->>'verdict' = 'ready' and n > 0 then
    n_pass := n_pass + 1;
    raise notice 'RS-5 PASS: with commitment satisfied the gate is READY while % promise facts are still missing — completeness informs the decision and never gates it', n;
  else
    n_fail := n_fail + 1;
    raise notice 'RS-5 FAIL: verdict=% missing_facts=%', r->>'verdict', n;
  end if;

  -- ══ FIXTURE C · released, five departments, one per taxonomy code ════════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'RS-C', 'RSC-'||v_sfx, 'active') returning id into v_bookC;
  v_occC := (public.open_occurrence(v_bookC, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref,
      origin_commitment_ref, released_by)
    values (v_tenant, v_bookC, v_occC, gen_random_uuid(), 'rs303')
    returning id into v_evC;

  -- culinary · lapsed → overdue (impedes)
  v_nk_lapsed := 'rs303_lapsed_'||v_sfx;
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_evC, 'event', gen_random_uuid(), 'release',
            'culinary_prepare', 'culinary', 'Plate the fish', v_nk_lapsed,
            jsonb_build_object('window_end', (v_now - interval '2 hours')::text))
    returning id into v_lapsed;

  -- equipment · owned, dependency on the lapsed one → dependency_unmet (impedes)
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing, dependencies)
    values (v_tenant, v_evC, 'event', gen_random_uuid(), 'release',
            'equipment_pull', 'equipment', 'Pull the chafers', 'rs303_dep_'||v_sfx,
            jsonb_build_object('window_end', (v_now + interval '48 hours')::text),
            jsonb_build_array(v_nk_lapsed))
    returning id into v_dep;
  insert into public.responsibility_owner (tenant_id, responsibility_ref, owner, action, actor, moment)
    values (v_tenant, v_dep, 'op-equip', 'assign', 'rs303', v_now);

  -- staffing · owned, in window, with a recorded exception → workable + exception_open
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_evC, 'event', gen_random_uuid(), 'release',
            'staffing_assign', 'staffing', 'Roster the floor', 'rs303_work_'||v_sfx,
            jsonb_build_object('window_end', (v_now + interval '72 hours')::text))
    returning id into v_work;
  insert into public.responsibility_owner (tenant_id, responsibility_ref, owner, action, actor, moment)
    values (v_tenant, v_work, 'op-staff', 'assign', 'rs303', v_now);
  insert into public.execution_evidence (tenant_id, event_ref, obligation_ref, kind,
      actor, moment, payload)
    values (v_tenant, v_evC, v_work, 'exception', 'op', v_now,
            jsonb_build_object('note', 'one server called out'));

  -- venue · owned, window not yet open → not_due (non-impeding)
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_evC, 'event', gen_random_uuid(), 'release',
            'venue_setup', 'venue', 'Set the room', 'rs303_notdue_'||v_sfx,
            jsonb_build_object('window_start', (v_now + interval '30 hours')::text,
                               'window_end',   (v_now + interval '40 hours')::text))
    returning id into v_notdue;
  insert into public.responsibility_owner (tenant_id, responsibility_ref, owner, action, actor, moment)
    values (v_tenant, v_notdue, 'op-venue', 'assign', 'rs303', v_now);

  -- logistics · UNOWNED, nothing in the way → workable + ownerless
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_evC, 'event', gen_random_uuid(), 'release',
            'logistics_route', 'logistics', 'Route the vans', 'rs303_owner_'||v_sfx,
            jsonb_build_object('window_end', (v_now + interval '60 hours')::text))
    returning id into v_owner;

  r := public.occurrence_readiness(v_occC, v_now);
  d := r->'by_department';

  -- fixture sanity: refuse to certify anything against a degenerate fixture
  if jsonb_array_length(d) <> 5 then
    raise exception 'v303 PERMANENT PROOF BLOCKED: fixture produced % departments, expected 5 — every claim below would be vacuous. by_department=%',
      jsonb_array_length(d), d;
  end if;

  -- ══ RS-2 · phase derivation ══════════════════════════════════════════════
  if public.occurrence_phase(v_occA, v_now) = 'preparing'
     and public.occurrence_phase(v_occC, v_now) = 'released' then
    n_pass := n_pass + 1;
    raise notice 'RS-2 PASS: an occurrence with no event is `preparing`; one with an event and unsettled work is `released` — lifecycle is derived, never stored';
  else
    n_fail := n_fail + 1;
    raise notice 'RS-2 FAIL: A=% C=%',
      public.occurrence_phase(v_occA, v_now), public.occurrence_phase(v_occC, v_now);
  end if;

  -- ══ RS-7 · department blocked iff a ground impedes ════════════════════════
  select count(*) into n from jsonb_array_elements(d) x
   where x->>'verdict' = 'blocked';
  select count(*) into m from jsonb_array_elements(d) x
   where exists (select 1 from jsonb_array_elements(x->'blockers') y
                  where (y->>'impedes')::boolean);
  if n = 2 and n = m then
    n_pass := n_pass + 1;
    raise notice 'RS-7 PASS: exactly the % departments carrying an impeding ground are blocked — the verdict is a function of the grounds it exposes, not an independent rule', n;
  else
    n_fail := n_fail + 1;
    raise notice 'RS-7 FAIL: blocked=% with_impeding=%', n, m;
  end if;

  -- ══ RS-10 · overdue impedes ══════════════════════════════════════════════
  select x into g from jsonb_array_elements(d) x where x->>'subject' = 'culinary';
  select count(*) into n from jsonb_array_elements(g->'blockers') y
   where y->>'code' = 'overdue' and (y->>'impedes')::boolean
     and y->>'subject' = v_lapsed::text;
  if n = 1 and g->>'verdict' = 'blocked' then
    n_pass := n_pass + 1;
    raise notice 'RS-10 PASS: a lapsed responsibility is `overdue`, impedes, and blocks its department — work whose window closed unmet is the most urgent ground';
  else
    n_fail := n_fail + 1;
    raise notice 'RS-10 FAIL: culinary=%', g;
  end if;

  -- ══ RS-11 / RS-12 · dependency_unmet and CLOSURE ═════════════════════════
  select x into g from jsonb_array_elements(d) x where x->>'subject' = 'equipment';
  select y into b from jsonb_array_elements(g->'blockers') y
   where y->>'code' = 'dependency_unmet';
  if b is not null and (b->>'impedes')::boolean
     and jsonb_array_length(b->'detail'->'blocking') = 1
     and b->'detail'->'blocking'->0->>'responsibility' = v_lapsed::text
     and b->'detail'->'blocking'->0->>'department' = 'culinary'
     and b->'detail'->'blocking'->0->>'ordering_key' is not null then
    n_pass := n_pass + 1;
    raise notice 'RS-11 PASS: dependency_unmet impedes and carries the RESOLVED blocking responsibility — its id, department, state, owner and ordering_key — so a consumer never has to re-query to name what must happen first';
  else
    n_fail := n_fail + 1;
    raise notice 'RS-11 FAIL: equipment blocker=%', b;
  end if;

  -- Closure: the blocking responsibility must itself appear in by_department.
  -- Without this a next-action model would have to traverse outside the payload.
  select count(*) into n
    from jsonb_array_elements(d) dep,
         jsonb_array_elements(dep->'blockers') y,
         jsonb_array_elements(coalesce(y->'detail'->'blocking','[]'::jsonb)) bl
   where not exists (
     select 1 from jsonb_array_elements(d) dep2,
                   jsonb_array_elements(dep2->'blockers') y2
      where y2->>'subject' = bl->>'responsibility');
  if n = 0 then
    n_pass := n_pass + 1;
    raise notice 'RS-12 PASS: every responsibility named by a dependency_unmet blocker appears in by_department — the payload is CLOSED, so the dependency graph can be walked without leaving it';
  else
    n_fail := n_fail + 1;
    raise notice 'RS-12 FAIL: % blocking responsibilities are absent from by_department', n;
  end if;

  -- ══ RS-8 / RS-9 · workable, and ready-with-outstanding ═══════════════════
  select x into g from jsonb_array_elements(d) x where x->>'subject' = 'staffing';
  select y into b from jsonb_array_elements(g->'blockers') y
   where y->>'code' = 'workable';
  if b is not null and (b->>'impedes')::boolean = false
     and b->>'subject' = v_work::text
     and b->>'ordering_key' is not null
     and b->>'required_outcome' = 'Roster the floor'
     and b->>'owner' is not null then
    n_pass := n_pass + 1;
    raise notice 'RS-8 PASS: unimpeded outstanding work is emitted as `workable`, non-impeding, carrying its identity, owner, required outcome and ordering_key — the ninth code exists so no actionable work is invisible';
  else
    n_fail := n_fail + 1;
    raise notice 'RS-8 FAIL: staffing workable ground=%', b;
  end if;

  if g->>'verdict' = 'ready' and (g->>'outstanding')::int > 0 then
    n_pass := n_pass + 1;
    raise notice 'RS-9 PASS: the department is READY with % outstanding responsibilities — `ready` means UNIMPEDED, and completion lives on the lifecycle axis as `settled`', (g->>'outstanding')::int;
  else
    n_fail := n_fail + 1;
    raise notice 'RS-9 FAIL: staffing verdict=% outstanding=%', g->>'verdict', g->>'outstanding';
  end if;

  -- ══ RS-15 · exception_open, independently visible ════════════════════════
  -- NOT absorbed: exception_recorded is neither duplicated by a primary code nor
  -- sorted first by ordering_key, so without this note it would be invisible.
  if b->'notes' @> '["exception_open"]'::jsonb
     and (b->'detail'->>'exceptions')::int = 1
     and g->>'verdict' = 'ready' then
    n_pass := n_pass + 1;
    raise notice 'RS-15 PASS: a recorded exception is visible as an `exception_open` note beside the primary code, carries its count, and does NOT block — visible without gating';
  else
    n_fail := n_fail + 1;
    raise notice 'RS-15 FAIL: notes=% detail=% verdict=%', b->'notes', b->'detail', g->>'verdict';
  end if;

  -- ══ RS-16 · risk never changes a verdict ═════════════════════════════════
  select count(*) into n from public.risk_findings(
         jsonb_build_object('event', v_evC), v_now) rf
   where rf.responsibility = v_work;
  if n > 0 and g->>'verdict' = 'ready' then
    n_pass := n_pass + 1;
    raise notice 'RS-16 PASS: staffing carries % risk finding(s) and is still READY — risk decorates readiness and never moves the verdict by itself (v287b RSK-*)', n;
  elsif n = 0 then
    n_unproven := n_unproven + 1;
    raise notice 'RS-16 UNPROVEN: the fixture produced no risk finding on the staffing responsibility';
  else
    n_fail := n_fail + 1;
    raise notice 'RS-16 FAIL: findings=% verdict=%', n, g->>'verdict';
  end if;

  -- ══ RS-13 · not_due ══════════════════════════════════════════════════════
  select x into g from jsonb_array_elements(d) x where x->>'subject' = 'venue';
  select y into b from jsonb_array_elements(g->'blockers') y where y->>'code' = 'not_due';
  if b is not null and (b->>'impedes')::boolean = false
     and (b->'detail'->>'opens_at') is not null
     and g->>'verdict' = 'ready' then
    n_pass := n_pass + 1;
    raise notice 'RS-13 PASS: work whose window has not opened is `not_due`, carries opens_at, and does NOT impede — not yet actionable is not the same as blocked';
  else
    n_fail := n_fail + 1;
    raise notice 'RS-13 FAIL: venue verdict=% ground=%', g->>'verdict', b;
  end if;

  -- ══ RS-14 · ownerless is lawful ══════════════════════════════════════════
  select x into g from jsonb_array_elements(d) x where x->>'subject' = 'logistics';
  select y into b from jsonb_array_elements(g->'blockers') y where y->>'code' = 'workable';
  if b is not null and b->'notes' @> '["ownerless"]'::jsonb
     and (b->>'impedes')::boolean = false
     and g->>'verdict' = 'ready' then
    n_pass := n_pass + 1;
    raise notice 'RS-14 PASS: unowned work is a non-impeding `ownerless` NOTE beside `workable`, and its department stays READY — ownerless work is lawful and visible debt (O-1, O-3), never an impediment';
  else
    n_fail := n_fail + 1;
    raise notice 'RS-14 FAIL: logistics verdict=% ground=%', g->>'verdict', b;
  end if;

  -- ══ RS-17 · the occurrence composes from departments ═════════════════════
  select count(*) into n from jsonb_array_elements(d) x where x->>'verdict' = 'blocked';
  if r->>'gate' = 'execution'
     and r->>'verdict' = (case when n > 0 then 'blocked' else 'ready' end) then
    n_pass := n_pass + 1;
    raise notice 'RS-17 PASS: the occurrence verdict is exactly `blocked iff some department is blocked` (% blocked) — it has no independent rule and therefore cannot disagree with its grounds', n;
  else
    n_fail := n_fail + 1;
    raise notice 'RS-17 FAIL: gate=% occurrence=% blocked_departments=%',
      r->>'gate', r->>'verdict', n;
  end if;

  -- ══ RS-18 · the count decomposes ═════════════════════════════════════════
  select count(*) into n
    from jsonb_array_elements(d) x, jsonb_array_elements(x->'blockers') y
   where (y->>'impedes')::boolean;
  select count(*) into m from jsonb_array_elements(r->'blockers') x
   where (x->>'impedes')::boolean;
  b := public.projection_occurrence_brief(v_occC, v_now);
  if (r->>'blocker_count')::int = n + m
     and (b->'counts'->>'readiness_blockers')::int = n + m then
    n_pass := n_pass + 1;
    raise notice 'RS-18 PASS: blocker_count (%) equals the impeding grounds across both grains, and counts.readiness_blockers mirrors it — the aggregate decomposes to its grounds by construction (the EX-02 discipline)', n + m;
  else
    n_fail := n_fail + 1;
    raise notice 'RS-18 FAIL: blocker_count=% dept_impeding=% occ_impeding=% counts=%',
      r->>'blocker_count', n, m, b->'counts'->>'readiness_blockers';
  end if;

  -- ══ FIXTURE D · released with no generated work ══════════════════════════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'RS-D', 'RSD-'||v_sfx, 'active') returning id into v_bookD;
  v_occD := (public.open_occurrence(v_bookD, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref,
      origin_commitment_ref, released_by)
    values (v_tenant, v_bookD, v_occD, gen_random_uuid(), 'rs303')
    returning id into v_evD;

  -- ══ RS-3 · the settled guard ═════════════════════════════════════════════
  if public.occurrence_phase(v_occD, v_now) = 'released' then
    n_pass := n_pass + 1;
    raise notice 'RS-3 PASS: a released occurrence with ZERO responsibilities is `released`, not vacuously `settled` — settlement requires work that actually terminated';
  else
    n_fail := n_fail + 1;
    raise notice 'RS-3 FAIL: phase=%', public.occurrence_phase(v_occD, v_now);
  end if;

  -- ══ RS-1 · cancellation is absolute ══════════════════════════════════════
  -- Occurrence A was BLOCKED a moment ago (RS-4, on the commitment predicate).
  -- Cancelling it must not leave it blocked: cancellation is evaluated before
  -- any gate, so the verdict is REPLACED, not merely annotated.
  --
  -- The fixture is deliberately the unreleased occurrence. release_occurrence's
  -- own guard refuses to cancel a released one (OCCURRENCE_RELEASED), so a
  -- cancelled occurrence is necessarily pre-release and therefore has no
  -- departments — that emptiness is a consequence of the ceremony, not of this
  -- model, and is asserted as such.
  if (public.occurrence_readiness(v_occA, v_now)->>'verdict') <> 'blocked' then
    n_fail := n_fail + 1;
    raise notice 'RS-1 FAIL: fixture A was not blocked before cancellation — the claim would be vacuous';
  else
    perform public.cancel_occurrence(v_occA, 'v303 proof');
    r := public.occurrence_readiness(v_occA, v_now);
    if public.occurrence_phase(v_occA, v_now) = 'cancelled'
       and r->>'verdict' = 'not_applicable'
       and r->'gate' = 'null'::jsonb
       and jsonb_array_length(r->'by_department') = 0 then
      n_pass := n_pass + 1;
      raise notice 'RS-1 PASS: an occurrence that was BLOCKED becomes not_applicable the moment it is cancelled, with no gate and no departments — cancellation is evaluated before everything, and a cancelled occurrence has no readiness at all';
    else
      n_fail := n_fail + 1;
      raise notice 'RS-1 FAIL: phase=% verdict=% gate=% departments=%',
        public.occurrence_phase(v_occA, v_now), r->>'verdict', r->'gate',
        jsonb_array_length(r->'by_department');
    end if;
  end if;

  -- ══ RS-19 · owner_required is RESERVED, fail-closed ══════════════════════
  -- If a ceremony ever makes ownership a precondition this claim fails and forces
  -- a ruling, so `owner_required` cannot silently begin blocking lawful work.
  select count(*) into n
    from pg_proc p join pg_namespace nsp on nsp.oid = p.pronamespace
   where nsp.nspname = 'public' and p.prokind = 'f'
     and p.proname not in ('responsibility_current_owner','day_sheet',
                           'department_workspace','responsibility_feed',
                           'responsibility_state')
     and pg_get_functiondef(p.oid) like '%responsibility_current_owner%';
  if n = 0 then
    n_pass := n_pass + 1;
    raise notice 'RS-19 PASS: no function outside the captured read-model set consults responsibility_current_owner — no ceremony requires ownership, so `owner_required` stays reserved and ownerless work stays lawful';
  else
    n_fail := n_fail + 1;
    raise notice 'RS-19 FAIL: % new consumer(s) of responsibility_current_owner — rule whether ownership is now a precondition', n;
  end if;

  -- ══ RS-20 · the obligation_state caller set is FROZEN ════════════════════
  -- v303 contains obligation_state; it does not retire it. Two of these callers
  -- are CEREMONIES (close_event, start_service), so retirement is materially
  -- larger than migrating the bookings UI and is recorded as separate debt.
  select coalesce(string_agg(p.proname, ',' order by p.proname), '') into v_txt
    from pg_proc p join pg_namespace nsp on nsp.oid = p.pronamespace
   where nsp.nspname = 'public' and p.prokind = 'f'
     and p.proname <> 'obligation_state'
     and pg_get_functiondef(p.oid) like '%obligation_state%'
     and not (p.proname = any (ALLOWED));
  if v_txt = '' then
    n_pass := n_pass + 1;
    raise notice 'RS-20 PASS: obligation_state has no callers outside the frozen allowlist of 8 — the seven original consumers plus the single designated admissibility authority (R-14.2). The legacy vocabulary is contained and cannot spread while it awaits retirement';
  else
    n_fail := n_fail + 1;
    raise notice 'RS-20 FAIL: new obligation_state caller(s): %', v_txt;
  end if;

  -- ── verdict ─────────────────────────────────────────────────────────────
  raise notice 'v303 PERMANENT PROOF: % PASS / % FAIL / % SKIPPED / % UNPROVEN',
               n_pass, n_fail, n_skip, n_unproven;
  if n_fail > 0 then
    raise exception 'v303 PERMANENT PROOF FAILED: % claim(s) violated', n_fail;
  elsif n_unproven > 0 or n_skip > 0 then
    raise exception 'v303 PERMANENT PROOF BLOCKED: non-PASS outcomes present';
  end if;
  raise exception 'V303_PERMANENT_ROLLBACK';
exception
  when others then
    if sqlerrm = 'V303_PERMANENT_ROLLBACK' then
      raise notice 'v303 permanent proof rolled back cleanly — zero residue';
    else raise;
    end if;
end $$;
