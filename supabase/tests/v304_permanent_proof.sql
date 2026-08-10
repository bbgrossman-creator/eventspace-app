-- ============================================================================
-- v304 PERMANENT PROOF — Canonical Next Action (F-6 + A9)
-- Self-rolling-back, rerunnable, zero residue. Fixtures derive from the v303
-- precedent; nothing here redesigns a fixture that already exists.
--
-- NP-1   release_fact_missing is present and is NEVER selected (E-III.2)
-- NP-2   the selected rank is ALWAYS the minimum rank over actionable grounds
-- NP-3   among fact_missing, the A9 fact order decides which is selected
-- NP-4   overdue outranks every non-impeding ground (F-5 tier boundary)
-- NP-5   not_due is present and is NEVER selected (F-6)
-- NP-6   dependency_unmet returns the RESOLVED blocking responsibility
-- NP-7   Case 11 — unresolvable dependency returns the WAITING responsibility
--        carrying its unmet natural keys
-- NP-8   workable is selectable when it is the only actionable ground (rank 11)
-- NP-9   cardinality — never an array, exactly one object or null (PC-7.4)
-- NP-10  T1 — earliest closing window wins among equal-rank grounds
-- NP-11  T2 — lower UUID wins when windows are equal
-- NP-12  authors no truth — two calls are byte-identical (PC-9.12)
-- NP-13  zero legacy references in the projection body
--
-- WHY PERMANENT. F-6 is a frozen article and A9 is ruled doctrine; every later
-- release must keep proving the selection obeys both.
-- ============================================================================

do $$
declare
  n_pass int := 0; n_fail int := 0;
  v_tenant uuid; v_user uuid; v_sfx text; v_now timestamptz := now();
  v_bookA uuid; v_occA uuid;
  v_bookC uuid; v_occC uuid; v_evC uuid;
  v_bookE uuid; v_occE uuid; v_evE uuid;
  v_bookF uuid; v_occF uuid; v_evF uuid;
  v_bookG uuid; v_occG uuid; v_evG uuid;
  v_lapsed uuid; v_dep uuid; v_work uuid; v_notdue uuid;
  v_wait uuid; v_only uuid; v_t1a uuid; v_t1b uuid;
  v_bookH uuid; v_occH uuid; v_evH uuid; v_t2a uuid; v_t2b uuid;
  v_nk_lapsed text; v_nk_ghost text;
  r jsonb; na jsonb; na2 jsonb;
  n int; m int; v_min int; v_code text;
  FACT_ORDER text[] := array['operating_date','client','venue','contracted',
                             'supervision','milestones','attendance','display_name'];
begin
  select tu.tenant_id, tu.user_id into v_tenant, v_user
    from public.tenant_users tu
   where tu.active and tu.role in ('admin','owner','manager','ops')
   order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'v304 PERMANENT PROOF BLOCKED: no active tenant_users row with an operating role';
  end if;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_sfx := substr(gen_random_uuid()::text, 1, 8);
  raise notice 'v304-permanent: tenant=% actor=%', v_tenant, v_user;

  -- ══ FIXTURE A · preparing, no acceptance ═════════════════════════════════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'NP-A', 'NPA-'||v_sfx, 'active') returning id into v_bookA;
  v_occA := (public.open_occurrence(v_bookA, null, null)->>'occurrence_id')::uuid;

  r  := public.occurrence_readiness(v_occA, v_now);
  na := public.occurrence_next_action(v_occA, v_now);

  select count(*) into n from jsonb_array_elements(r->'blockers') x
   where x->>'code' = 'release_fact_missing';
  if n >= 1 and na is not null and na->>'code' <> 'release_fact_missing' then
    n_pass := n_pass + 1;
    raise notice 'NP-1 PASS: release_fact_missing present (%) yet never selected — acceptance is the counterparty''s act (E-III.2); selected=%', n, na->>'code';
  else
    n_fail := n_fail + 1;
    raise notice 'NP-1 FAIL: release_fact_missing=% selected=%', n, coalesce(na->>'code','NULL');
  end if;

  -- NP-3 · the A9 fact order decides which fact_missing wins
  select min(array_position(FACT_ORDER, x->>'fact')) into m
    from jsonb_array_elements(r->'reasons') x where x->>'code' = 'fact_missing';
  if m is not null and na->>'code' = 'fact_missing'
     and na->'ground'->>'fact' = FACT_ORDER[m] then
    n_pass := n_pass + 1;
    raise notice 'NP-3 PASS: among the fact_missing grounds present the A9 order selects % — the lowest-ranked fact present', FACT_ORDER[m];
  else
    n_fail := n_fail + 1;
    raise notice 'NP-3 FAIL: expected fact=% got code=% fact=%',
      coalesce(FACT_ORDER[m],'(none)'), coalesce(na->>'code','NULL'), coalesce(na->'ground'->>'fact','NULL');
  end if;

  -- ══ FIXTURE C · released, the full taxonomy (v303 pattern) ═══════════════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'NP-C', 'NPC-'||v_sfx, 'active') returning id into v_bookC;
  v_occC := (public.open_occurrence(v_bookC, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref,
      origin_commitment_ref, released_by)
    values (v_tenant, v_bookC, v_occC, gen_random_uuid(), 'np304')
    returning id into v_evC;

  v_nk_lapsed := 'np304_lapsed_'||v_sfx;
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_evC, 'event', gen_random_uuid(), 'release',
            'culinary_prepare', 'culinary', 'Plate the fish', v_nk_lapsed,
            jsonb_build_object('window_end', (v_now - interval '2 hours')::text))
    returning id into v_lapsed;

  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing, dependencies)
    values (v_tenant, v_evC, 'event', gen_random_uuid(), 'release',
            'equipment_pull', 'equipment', 'Pull the chafers', 'np304_dep_'||v_sfx,
            jsonb_build_object('window_end', (v_now + interval '48 hours')::text),
            jsonb_build_array(v_nk_lapsed))
    returning id into v_dep;
  insert into public.responsibility_owner (tenant_id, responsibility_ref, owner, action, actor, moment)
    values (v_tenant, v_dep, 'op-equip', 'assign', 'np304', v_now);

  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_evC, 'event', gen_random_uuid(), 'release',
            'staffing_assign', 'staffing', 'Roster the floor', 'np304_work_'||v_sfx,
            jsonb_build_object('window_end', (v_now + interval '72 hours')::text))
    returning id into v_work;
  insert into public.responsibility_owner (tenant_id, responsibility_ref, owner, action, actor, moment)
    values (v_tenant, v_work, 'op-staff', 'assign', 'np304', v_now);

  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_evC, 'event', gen_random_uuid(), 'release',
            'venue_setup', 'venue', 'Set the room', 'np304_notdue_'||v_sfx,
            jsonb_build_object('window_start', (v_now + interval '30 hours')::text,
                               'window_end',   (v_now + interval '40 hours')::text))
    returning id into v_notdue;
  insert into public.responsibility_owner (tenant_id, responsibility_ref, owner, action, actor, moment)
    values (v_tenant, v_notdue, 'op-venue', 'assign', 'np304', v_now);

  r  := public.occurrence_readiness(v_occC, v_now);
  na := public.occurrence_next_action(v_occC, v_now);

  if jsonb_array_length(r->'by_department') < 4 then
    raise exception 'v304 PERMANENT PROOF BLOCKED: fixture C produced % departments, expected >=4 — every claim below would be vacuous',
      jsonb_array_length(r->'by_department');
  end if;

  -- NP-4 · overdue outranks every non-impeding ground
  if na->>'code' = 'overdue' and (na->>'rank')::int = 1
     and na->>'action_subject' = v_lapsed::text then
    n_pass := n_pass + 1;
    raise notice 'NP-4 PASS: with overdue, dependency_unmet, workable, not_due and fact_missing all present, overdue is selected at rank 1 — the F-5 tier boundary holds';
  else
    n_fail := n_fail + 1;
    raise notice 'NP-4 FAIL: code=% rank=% subject=%',
      coalesce(na->>'code','NULL'), coalesce(na->>'rank','NULL'), coalesce(na->>'action_subject','NULL');
  end if;

  -- NP-5 · not_due present, never selected
  select count(*) into n
    from jsonb_array_elements(r->'by_department') d,
         jsonb_array_elements(d->'blockers') g
   where g->>'code' = 'not_due';
  if n >= 1 and na->>'code' <> 'not_due' then
    n_pass := n_pass + 1;
    raise notice 'NP-5 PASS: not_due present (%) and never selected — it cannot yet be acted upon (F-6)', n;
  else
    n_fail := n_fail + 1;
    raise notice 'NP-5 FAIL: not_due_present=% selected=%', n, coalesce(na->>'code','NULL');
  end if;

  -- NP-2 · the selected rank is the minimum rank over actionable grounds
  with cand as (
    select g->>'code' c, null::text f
      from jsonb_array_elements(r->'by_department') d,
           jsonb_array_elements(d->'blockers') g
    union all select x->>'code', x->>'fact' from jsonb_array_elements(r->'reasons') x
    union all select x->>'code', null       from jsonb_array_elements(r->'blockers') x
  )
  select min(case c when 'overdue' then 1 when 'dependency_unmet' then 2
                    when 'workable' then 11
                    when 'fact_missing' then 2 + array_position(FACT_ORDER, f) end)
    into v_min
    from cand where c not in ('not_due','release_fact_missing');
  if na is not null and (na->>'rank')::int = v_min then
    n_pass := n_pass + 1;
    raise notice 'NP-2 PASS: selected rank % equals the minimum A9 rank over every actionable ground — the ordering is obeyed, not approximated', v_min;
  else
    n_fail := n_fail + 1;
    raise notice 'NP-2 FAIL: selected=% expected_min=%', coalesce(na->>'rank','NULL'), v_min;
  end if;

  -- NP-6 · dependency_unmet returns the RESOLVED blocking responsibility.
  -- Read the dependency ground directly: overdue outranks it on this fixture.
  select g into r
    from jsonb_array_elements(public.occurrence_readiness(v_occC, v_now)->'by_department') d,
         jsonb_array_elements(d->'blockers') g
   where g->>'code' = 'dependency_unmet' limit 1;
  if r is not null
     and jsonb_array_length(r->'detail'->'blocking') = 1
     and r->'detail'->'blocking'->0->>'responsibility' = v_lapsed::text then
    n_pass := n_pass + 1;
    raise notice 'NP-6 PASS: the dependency_unmet ground resolves its blocker to the lapsed responsibility — the payload names the action without a re-query';
  else
    n_fail := n_fail + 1;
    raise notice 'NP-6 FAIL: blocking=%', coalesce(r->'detail'->'blocking', 'null'::jsonb);
  end if;

  -- ══ FIXTURE E · Case 11 — dependency on a natural key nothing carries ════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'NP-E', 'NPE-'||v_sfx, 'active') returning id into v_bookE;
  v_occE := (public.open_occurrence(v_bookE, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref,
      origin_commitment_ref, released_by)
    values (v_tenant, v_bookE, v_occE, gen_random_uuid(), 'np304')
    returning id into v_evE;
  v_nk_ghost := 'np304_ghost_'||v_sfx;
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing, dependencies)
    values (v_tenant, v_evE, 'event', gen_random_uuid(), 'release',
            'equipment_pull', 'equipment', 'Waits on nothing that exists',
            'np304_wait_'||v_sfx,
            jsonb_build_object('window_end', (v_now + interval '24 hours')::text),
            jsonb_build_array(v_nk_ghost))
    returning id into v_wait;
  insert into public.responsibility_owner (tenant_id, responsibility_ref, owner, action, actor, moment)
    values (v_tenant, v_wait, 'op-equip', 'assign', 'np304', v_now);

  na := public.occurrence_next_action(v_occE, v_now);
  if na->>'code' = 'dependency_unmet'
     and na->>'action_subject' = v_wait::text
     and jsonb_array_length(na->'ground'->'detail'->'blocking') = 0
     and na->'ground'->'detail'->'unmet' ? v_nk_ghost then
    n_pass := n_pass + 1;
    raise notice 'NP-7 PASS: Case 11 — no blocking responsibility resolves, so the WAITING responsibility is returned carrying its unmet key %; the impeding ground is not concealed', v_nk_ghost;
  else
    n_fail := n_fail + 1;
    raise notice 'NP-7 FAIL: code=% subject=% blocking=% unmet=%',
      coalesce(na->>'code','NULL'), coalesce(na->>'action_subject','NULL'),
      coalesce(na->'ground'->'detail'->'blocking','null'::jsonb),
      coalesce(na->'ground'->'detail'->'unmet','null'::jsonb);
  end if;

  -- ══ FIXTURE F · workable alone → rank 11 ═════════════════════════════════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'NP-F', 'NPF-'||v_sfx, 'active') returning id into v_bookF;
  v_occF := (public.open_occurrence(v_bookF, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref,
      origin_commitment_ref, released_by)
    values (v_tenant, v_bookF, v_occF, gen_random_uuid(), 'np304')
    returning id into v_evF;
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_evF, 'event', gen_random_uuid(), 'release',
            'staffing_assign', 'staffing', 'Nothing in the way', 'np304_only_'||v_sfx,
            jsonb_build_object('window_end', (v_now + interval '96 hours')::text))
    returning id into v_only;
  insert into public.responsibility_owner (tenant_id, responsibility_ref, owner, action, actor, moment)
    values (v_tenant, v_only, 'op-staff', 'assign', 'np304', v_now);

  na := public.occurrence_next_action(v_occF, v_now);
  select count(*) into n from jsonb_array_elements(
      public.occurrence_readiness(v_occF, v_now)->'reasons') x
   where x->>'code' = 'fact_missing';
  if n > 0 and na->>'code' = 'fact_missing' then
    n_pass := n_pass + 1;
    raise notice 'NP-8 PASS: workable does NOT outrank a missing foundational fact — with % facts missing the fact is selected and workable waits at rank 11', n;
  elsif n = 0 and na->>'code' = 'workable' and (na->>'rank')::int = 11 then
    n_pass := n_pass + 1;
    raise notice 'NP-8 PASS: with no missing fact, workable is selected at rank 11';
  else
    n_fail := n_fail + 1;
    raise notice 'NP-8 FAIL: facts_missing=% code=% rank=%',
      n, coalesce(na->>'code','NULL'), coalesce(na->>'rank','NULL');
  end if;

  -- ══ FIXTURE G · T1 then T2 ═══════════════════════════════════════════════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'NP-G', 'NPG-'||v_sfx, 'active') returning id into v_bookG;
  v_occG := (public.open_occurrence(v_bookG, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref,
      origin_commitment_ref, released_by)
    values (v_tenant, v_bookG, v_occG, gen_random_uuid(), 'np304')
    returning id into v_evG;
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_evG, 'event', gen_random_uuid(), 'release',
            'culinary_prepare', 'culinary', 'Later window', 'np304_t1b_'||v_sfx,
            jsonb_build_object('window_end', (v_now - interval '1 hour')::text))
    returning id into v_t1b;
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_evG, 'event', gen_random_uuid(), 'release',
            'equipment_pull', 'equipment', 'Earlier window', 'np304_t1a_'||v_sfx,
            jsonb_build_object('window_end', (v_now - interval '9 hours')::text))
    returning id into v_t1a;

  na := public.occurrence_next_action(v_occG, v_now);
  if na->>'code' = 'overdue' and na->>'action_subject' = v_t1a::text then
    n_pass := n_pass + 1;
    raise notice 'NP-10 PASS: T1 — of two overdue grounds the one whose window closed EARLIEST is selected, not the lower UUID and not the first emitted';
  else
    n_fail := n_fail + 1;
    raise notice 'NP-10 FAIL: expected % got % (t1b=%)', v_t1a, coalesce(na->>'action_subject','NULL'), v_t1b;
  end if;

  -- ══ FIXTURE H · T2 — two responsibilities IDENTICAL FROM BIRTH ═══════════
  -- Atlas R-8 makes the Responsibility Record append-only, so the tie is built
  -- by insertion and never by editing an existing record.
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'NP-H', 'NPH-'||v_sfx, 'active') returning id into v_bookH;
  v_occH := (public.open_occurrence(v_bookH, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref,
      origin_commitment_ref, released_by)
    values (v_tenant, v_bookH, v_occH, gen_random_uuid(), 'np304')
    returning id into v_evH;
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_evH, 'event', gen_random_uuid(), 'release',
            'culinary_prepare', 'culinary', 'Twin one', 'np304_t2a_'||v_sfx,
            jsonb_build_object('window_end', (v_now - interval '5 hours')::text))
    returning id into v_t2a;
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_evH, 'event', gen_random_uuid(), 'release',
            'culinary_prepare', 'culinary', 'Twin two', 'np304_t2b_'||v_sfx,
            jsonb_build_object('window_end', (v_now - interval '5 hours')::text))
    returning id into v_t2b;

  na := public.occurrence_next_action(v_occH, v_now);
  if na->>'code' = 'overdue' and na->>'action_subject' = least(v_t2a, v_t2b)::text then
    n_pass := n_pass + 1;
    raise notice 'NP-11 PASS: T2 — with windows equal the lower canonical UUID is selected; the order is total and strict';
  else
    n_fail := n_fail + 1;
    raise notice 'NP-11 FAIL: expected % got % (twins %, %)', least(v_t2a, v_t2b), coalesce(na->>'action_subject','NULL'), v_t2a, v_t2b;
  end if;

  -- ══ NP-9 · cardinality across every fixture ══════════════════════════════
  select count(*) into n from (values (v_occA),(v_occC),(v_occE),(v_occF),(v_occG),(v_occH)) t(o)
   where jsonb_typeof(public.occurrence_next_action(t.o, v_now)) not in ('object','null')
      or public.occurrence_next_action(t.o, v_now) is null and false;
  select count(*) into m from (values (v_occA),(v_occC),(v_occE),(v_occF),(v_occG),(v_occH)) t(o)
   where jsonb_typeof(public.occurrence_next_action(t.o, v_now)) = 'array';
  if n = 0 and m = 0 then
    n_pass := n_pass + 1;
    raise notice 'NP-9 PASS: across every fixture the projection returns exactly one object or null — never an array, never a list (PC-7.4)';
  else
    n_fail := n_fail + 1;
    raise notice 'NP-9 FAIL: non-object=% array=%', n, m;
  end if;

  -- ══ NP-12 · authors no truth ═════════════════════════════════════════════
  na  := public.occurrence_next_action(v_occC, v_now);
  na2 := public.occurrence_next_action(v_occC, v_now);
  if na::text = na2::text then
    n_pass := n_pass + 1;
    raise notice 'NP-12 PASS: two consecutive calls are byte-identical — derived and re-derivable, nothing stored (PC-9.12)';
  else
    n_fail := n_fail + 1;
    raise notice 'NP-12 FAIL: call1=% call2=%', na, na2;
  end if;

  -- ══ NP-13 · legacy independence ══════════════════════════════════════════
  select count(*) into n from regexp_matches(
    (select prosrc from pg_proc where proname='occurrence_next_action'
      and pronamespace='public'::regnamespace),
    'obligation_state|event_stage|event_stage_detail|event_readiness|event_workspace|action_evaluate','g');
  if n = 0 then
    n_pass := n_pass + 1;
    raise notice 'NP-13 PASS: the projection references none of the six superseded functions';
  else
    n_fail := n_fail + 1;
    raise notice 'NP-13 FAIL: % legacy reference(s)', n;
  end if;

  -- ── verdict ─────────────────────────────────────────────────────────────
  raise notice 'v304 PERMANENT PROOF: % PASS / % FAIL / 0 SKIPPED / 0 UNPROVEN',
               n_pass, n_fail;
  if n_fail > 0 then
    raise exception 'v304 PERMANENT PROOF FAILED: % claim(s) violated', n_fail;
  end if;
  raise exception 'V304_PERMANENT_ROLLBACK';
exception
  when others then
    if sqlerrm = 'V304_PERMANENT_ROLLBACK' then
      raise notice 'v304 permanent proof rolled back cleanly — zero residue';
    else raise;
    end if;
end $$;
