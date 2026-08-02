-- ============================================================================
-- v297 PERMANENT PROOF — Venue As-Of Integrity invariants
-- Self-rolling-back, rerunnable, zero residue.
-- Blocking policy = v292d1 ruling: FAIL blocks, UNPROVEN blocks, any skip blocks.
--
-- AQ-1  the seven corrected readers keep STABLE + SECURITY DEFINER + search_path
-- AQ-2  a future observation cannot govern a profile read before observed_at
-- AQ-3  a future observation cannot CLEAR staleness before observed_at
-- AQ-4  a future walkthrough is not counted before conducted_at
-- AQ-5  a future engagement binding is invisible before created_at
-- AQ-6  precedence preserved: source class beats recency across classes
--
-- Attribute→family mapping is derived at run time via public.attribute_family(),
-- never assumed, so the proof does not encode a vocabulary it does not own.
-- ============================================================================
do $$
declare
  n_pass int := 0; n_fail int := 0; n_skip int := 0; n_unproven int := 0;
  v_tenant uuid; v_user uuid;
  v_venue uuid; v_wt uuid; v_book uuid; v_occ uuid; v_venue2 uuid;
  v_fam text; v_n int; v_s text; v_t timestamptz; v_sfx text;
begin
  select tu.tenant_id, tu.user_id into v_tenant, v_user
    from public.tenant_users tu
   where tu.active and tu.role in ('admin','owner','manager','ops')
   order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'v297 PERMANENT PROOF BLOCKED: no active tenant_users row with a venue-managing role';
  end if;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_sfx := substr(gen_random_uuid()::text, 1, 8);
  raise notice 'v297-permanent: tenant=% actor=%', v_tenant, v_user;

  -- ── AQ-1 · posture of the seven corrected readers ───────────────────────
  select count(*) into v_n
    from pg_proc p join pg_namespace nsp on nsp.oid = p.pronamespace
   where nsp.nspname = 'public'
     and p.provolatile = 's' and p.prosecdef
     and array_to_string(p.proconfig, ',') like '%search_path%'
     and p.proname in ('occurrence_current_venue','current_observation','venue_profile_read',
                       'venue_knowledge_findings','venue_profile','venue_contradictions',
                       'venue_verification_requirement');
  if v_n = 7 then
    n_pass := n_pass + 1; raise notice 'AQ-1 PASS: all seven readers STABLE + SECDEF + search_path pinned';
  else
    n_fail := n_fail + 1; raise notice 'AQ-1 FAIL: % of 7 readers hold the required posture', v_n;
  end if;

  -- ── shared fixture venue ────────────────────────────────────────────────
  v_venue := (public.create_venue('AQ venue ' || v_sfx, 'fixed_facility')->>'venue_id')::uuid;
  v_wt    := (public.record_walkthrough(v_venue, 'initial_survey', now() - interval '400 days')->>'walkthrough_id')::uuid;

  -- ── AQ-2 · a future observation cannot govern before observed_at ─────────
  perform public.record_observation(v_venue, 'aq2_height_' || v_sfx, 'quantity',
            '{"amount":12,"unit":"ft"}'::jsonb, 'measurement', now() + interval '5 days', v_wt);
  v_s := public.venue_profile_read(v_venue, null, 'aq2_height_' || v_sfx, now())->>'status';
  if v_s is null then
    n_unproven := n_unproven + 1; raise notice 'AQ-2 UNPROVEN: profile read returned no status';
  elsif v_s = 'unobserved' then
    n_pass := n_pass + 1; raise notice 'AQ-2 PASS: a future observation does not govern before observed_at';
  else
    n_fail := n_fail + 1; raise notice 'AQ-2 FAIL: future observation governed with status=%', v_s;
  end if;

  -- ── AQ-3 · a future observation cannot CLEAR staleness ───────────────────
  v_fam := public.attribute_family('aq3_oven_' || v_sfx);
  if v_fam is null then
    n_unproven := n_unproven + 1; raise notice 'AQ-3 UNPROVEN: attribute_family returned null';
  else
    perform public.set_staleness_policy(v_fam, 30, 'advisory', false);
    perform public.record_observation(v_venue, 'aq3_oven_' || v_sfx, 'enum',
              '{"v":"working"}'::jsonb, 'measurement', now() - interval '200 days', v_wt);
    perform public.record_observation(v_venue, 'aq3_oven_' || v_sfx, 'enum',
              '{"v":"working"}'::jsonb, 'measurement', now() + interval '5 days', v_wt);
    select count(*) into v_n
      from jsonb_array_elements(public.venue_knowledge_findings(v_venue, now())) e
     where e->>'kind' = 'stale' and e->>'attribute' = 'aq3_oven_' || v_sfx;
    if v_n = 1 then
      n_pass := n_pass + 1; raise notice 'AQ-3 PASS: a future observation does not clear staleness at an earlier as-of';
    else
      n_fail := n_fail + 1; raise notice 'AQ-3 FAIL: expected 1 stale finding, found %', v_n;
    end if;
  end if;

  -- ── AQ-4 · a future walkthrough is not counted before conducted_at ───────
  v_venue2 := (public.create_venue('AQ walk ' || v_sfx, 'fixed_facility')->>'venue_id')::uuid;
  v_fam := public.attribute_family('aq4_structural_' || v_sfx);
  perform public.set_staleness_policy(v_fam, 1460, 'advisory', true);
  perform public.record_walkthrough(v_venue2, 'initial_survey', now() + interval '7 days');
  v_s := public.venue_verification_requirement(v_venue2, now())->>'verification';
  if v_s is null then
    n_unproven := n_unproven + 1; raise notice 'AQ-4 UNPROVEN: verification verdict was null';
  elsif v_s = 'walkthrough_required' then
    n_pass := n_pass + 1; raise notice 'AQ-4 PASS: a future walkthrough is not counted before conducted_at';
  else
    n_fail := n_fail + 1; raise notice 'AQ-4 FAIL: verdict=% (a future walkthrough was counted)', v_s;
  end if;

  -- ── AQ-5 · a future engagement binding is invisible before created_at ────
  insert into public.bookings (tenant_id, contact_name, invoice_num)
    values (v_tenant, 'AQ ' || v_sfx, 'AQ-' || v_sfx) returning id into v_book;
  insert into public.engagement_occurrence (tenant_id, booking_id, ordinal, opened_by)
    values (v_tenant, v_book, 1, 'v297-permanent') returning id into v_occ;
  perform public.bind_engagement_venue(v_book, v_venue);
  select b.created_at into v_t from public.engagement_venue_binding b
   where b.booking_id = v_book order by b.seq desc limit 1;
  select count(*) into v_n
    from public.occurrence_current_venue(v_occ, v_t - interval '1 second');
  if v_n = 0 then
    n_pass := n_pass + 1; raise notice 'AQ-5 PASS: an engagement binding is invisible before its created_at';
  else
    n_fail := n_fail + 1; raise notice 'AQ-5 FAIL: % binding row(s) visible before created_at', v_n;
  end if;

  -- ── AQ-6 · precedence preserved across source classes ────────────────────
  perform public.record_observation(v_venue, 'aq6_elev_' || v_sfx, 'quantity',
            '{"amount":1500,"unit":"lbs"}'::jsonb, 'measurement', now() - interval '9 days', v_wt);
  perform public.record_observation(v_venue, 'aq6_elev_' || v_sfx, 'quantity',
            '{"amount":2000,"unit":"lbs"}'::jsonb, 'venue_rep_statement', now() - interval '1 day', v_wt);
  v_s := public.venue_profile_read(v_venue, null, 'aq6_elev_' || v_sfx, now())->>'source_class';
  if v_s is null then
    n_unproven := n_unproven + 1; raise notice 'AQ-6 UNPROVEN: governing source_class was null';
  elsif v_s = 'measurement' then
    n_pass := n_pass + 1; raise notice 'AQ-6 PASS: source class still beats recency across classes';
  else
    n_fail := n_fail + 1; raise notice 'AQ-6 FAIL: governing source_class=% (precedence moved)', v_s;
  end if;

  -- ── verdict ─────────────────────────────────────────────────────────────
  raise notice 'v297 PERMANENT PROOF: % PASS / % FAIL / % SKIPPED / % UNPROVEN',
               n_pass, n_fail, n_skip, n_unproven;
  if n_fail > 0 then
    raise exception 'v297 PERMANENT PROOF FAILED: % claim(s) violated', n_fail;
  elsif n_unproven > 0 or n_skip > 0 then
    raise exception 'v297 PERMANENT PROOF BLOCKED: non-PASS outcomes present';
  end if;
  raise exception 'V297_PERMANENT_ROLLBACK';
exception
  when others then
    if sqlerrm = 'V297_PERMANENT_ROLLBACK' then
      raise notice 'v297 permanent proof rolled back cleanly — zero residue';
    else raise;
    end if;
end $$;
