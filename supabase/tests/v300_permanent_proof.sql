-- ============================================================================
-- v300 PERMANENT PROOF — Occurrence brief risk disclosure (audit finding EX-02)
-- Self-rolling-back, rerunnable, zero residue.
-- Blocking policy = v292d1 ruling: FAIL blocks, UNPROVEN blocks, any skip blocks.
--
-- OB-21  counts.at_risk decomposes exactly to data.risk at its true grain
-- OB-22  data.risk is byte-equal to risk_findings — composition, not restatement
-- OB-23  event-level findings are carried AND correctly do not enter at_risk
-- OB-24  counts.exceptions still decomposes to data.exceptions, which is now a
--        filtered view of data.risk and never a second source
-- OB-25  before release the work side is silent: data.risk = [] , at_risk = 0
--
-- THE GRAIN IS PROVEN, NOT ASSUMED. counts.at_risk is
-- count(distinct responsibility) — NOT a finding count. The audit's proposed
-- equality counts.at_risk = data.exceptions.length is a category error and is
-- deliberately NOT certified here; OB-21 certifies the real contract.
--
-- Fixture produces three findings of three kinds across two responsibilities
-- plus one event-level finding, so no claim below can pass vacuously.
-- ============================================================================
do $$
declare
  n_pass int := 0; n_fail int := 0; n_skip int := 0; n_unproven int := 0;
  v_tenant uuid; v_user uuid; v_sfx text; v_now timestamptz := now();
  v_book uuid; v_occ uuid; v_ev uuid;
  v_prop uuid; v_ver uuid; v_snap uuid;
  v_ob_lapsed uuid; v_ob_exc uuid;
  v_venue uuid; v_wt uuid;
  b jsonb; v_risk jsonb; v_direct jsonb; v_filtered jsonb;
  n int; m int; v_at_risk int;
begin
  select tu.tenant_id, tu.user_id into v_tenant, v_user
    from public.tenant_users tu
   where tu.active and tu.role in ('admin','owner','manager','ops')
   order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'v300 PERMANENT PROOF BLOCKED: no active tenant_users row with an operating role';
  end if;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_sfx := substr(gen_random_uuid()::text, 1, 8);
  raise notice 'v300-permanent: tenant=% actor=%', v_tenant, v_user;

  -- ── fixture · an engagement and one occurrence ───────────────────────────
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'Rosen', 'OB300-'||v_sfx, 'active') returning id into v_book;
  v_occ := (public.open_occurrence(v_book, null, null)->>'occurrence_id')::uuid;

  -- ══ OB-25 · BEFORE RELEASE ═══════════════════════════════════════════════
  -- The work side has no event to read, so the finding set must be empty and
  -- the aggregate zero. A brief that invented risk in the promise regime would
  -- be worse than one that hid it.
  b := public.projection_occurrence_brief(v_occ, v_now);
  if b->'data'->'risk' = '[]'::jsonb
     and (b->'counts'->>'at_risk')::int = 0
     and (b->'data'->>'has_event')::boolean = false then
    n_pass := n_pass + 1;
    raise notice 'OB-25 PASS: before release data.risk is [] and counts.at_risk is 0 — the promise regime reports no work-side risk rather than none-known';
  else
    n_fail := n_fail + 1;
    raise notice 'OB-25 FAIL: pre-release risk=% at_risk=% has_event=%',
      b->'data'->'risk', b->'counts'->>'at_risk', b->'data'->>'has_event';
  end if;

  -- ── fixture · release, so the work side exists ───────────────────────────
  insert into public.proposals (tenant_id, booking_id, title, status)
    values (v_tenant, v_book, 'P300', 'draft') returning id into v_prop;
  insert into public.proposal_versions (tenant_id, proposal_id, version, status)
    values (v_tenant, v_prop, 1, 'sent') returning id into v_ver;
  insert into public.offer_snapshots (tenant_id, version_id, fingerprint, model,
      artifact_bytes, artifact_hash, artifact_meta, assets)
    values (v_tenant, v_ver, 'fp300-'||v_sfx, '{}'::jsonb,
            '\x00'::bytea, 'h', '{}'::jsonb, '{}'::jsonb) returning id into v_snap;
  insert into public.offer_acceptances (tenant_id, snapshot_id, fingerprint, booking_id,
      principal, authority_basis, evidence_basis, channel, recorded_moment)
    values (v_tenant, v_snap, 'fp300', v_book, '{}'::jsonb, 'b', 'b', 'portal', v_now);
  v_ev := (public.release_occurrence(v_occ, 'op', 'signoff', 'clearance', null)->>'event_id')::uuid;

  -- ── fixture · finding 1 · LAPSED (critical, responsibility-level) ────────
  -- window closed without satisfying evidence → responsibility_state = 'lapsed'
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_ev, 'event', gen_random_uuid(), 'release',
            'culinary_prepare', 'culinary', 'Plate the fish', 'ob300_lapsed_'||v_sfx,
            jsonb_build_object('window_end', (v_now - interval '1 hour')::text))
    returning id into v_ob_lapsed;

  -- ── fixture · finding 2 · EXCEPTION_RECORDED (advisory, responsibility) ──
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
      kind, department, required_outcome, natural_key, timing)
    values (v_tenant, v_ev, 'event', gen_random_uuid(), 'release',
            'equipment_pull', 'equipment', 'Pull the chafers', 'ob300_exc_'||v_sfx,
            jsonb_build_object('window_end', (v_now + interval '72 hours')::text))
    returning id into v_ob_exc;
  insert into public.execution_evidence (tenant_id, event_ref, obligation_ref, kind,
      actor, moment, payload)
    values (v_tenant, v_ev, v_ob_exc, 'exception', 'op', v_now,
            jsonb_build_object('note', 'two chafers unavailable'));

  -- ── fixture · finding 3 · VENUE_EXPIRED (critical, EVENT-level) ──────────
  -- responsibility is null by construction in risk_findings' staleness CTE.
  -- This is the case audit finding EX-02 got backwards: it can never enter
  -- counts.at_risk, at any count.
  v_venue := (public.create_venue('OB300 hall '||v_sfx, 'fixed_facility')->>'venue_id')::uuid;
  v_wt := (public.record_walkthrough(v_venue, 'initial_survey', v_now - interval '400 days')->>'walkthrough_id')::uuid;
  perform public.bind_engagement_venue(v_book, v_venue, 'v300 fixture');
  perform public.record_observation(
    v_venue, 'ob300_permit_'||v_sfx, 'text', to_jsonb('permit A'::text),
    'venue_document', v_now - interval '300 days', v_wt,
    p_expires => v_now - interval '30 days');

  b := public.projection_occurrence_brief(v_occ, v_now);
  v_risk := b->'data'->'risk';
  v_at_risk := (b->'counts'->>'at_risk')::int;

  -- fixture sanity: refuse to certify anything against an empty finding set
  if jsonb_array_length(coalesce(v_risk,'[]'::jsonb)) < 3 then
    raise exception 'v300 PERMANENT PROOF BLOCKED: fixture produced % finding(s), expected at least 3 — every claim below would be vacuous. risk=%',
      jsonb_array_length(coalesce(v_risk,'[]'::jsonb)), v_risk;
  end if;

  -- ══ OB-21 · THE AGGREGATE DECOMPOSES ═════════════════════════════════════
  -- The closing claim for EX-02. counts.at_risk must equal the number of
  -- DISTINCT responsibilities named in data.risk — the true grain, not a
  -- finding count and not data.exceptions.length.
  select count(distinct e->>'responsibility') into n
    from jsonb_array_elements(v_risk) e where e->>'responsibility' is not null;
  select count(*) into m from jsonb_array_elements(v_risk) e;
  if v_at_risk = n and n = 2 and m >= 3 and m > n then
    n_pass := n_pass + 1;
    raise notice 'OB-21 PASS: counts.at_risk (%) equals the distinct responsibilities named in data.risk (%), over % findings — the aggregate decomposes to its grounds at the grain it is actually counted', v_at_risk, n, m;
  else
    n_fail := n_fail + 1;
    raise notice 'OB-21 FAIL: counts.at_risk=% distinct_in_risk=% findings=%', v_at_risk, n, m;
  end if;

  -- ══ OB-22 · COMPOSITION, NOT RESTATEMENT ═════════════════════════════════
  -- data.risk must be byte-equal to the resolver at the same p_now. Two
  -- implementations of a finding set diverge; there is one, and the brief
  -- consumes it. (The OB-4 pattern, applied to risk.)
  select jsonb_agg(to_jsonb(x) order by x.responsibility nulls last, x.finding)
    into v_direct
    from public.risk_findings(jsonb_build_object('event', v_ev), v_now) x;
  if v_risk = v_direct then
    n_pass := n_pass + 1;
    raise notice 'OB-22 PASS: data.risk is byte-equal to risk_findings at the same evaluation moment (% findings) — the brief carries the canonical collection rather than a second opinion about it', jsonb_array_length(v_risk);
  else
    n_fail := n_fail + 1;
    raise notice 'OB-22 FAIL: brief=% resolver=%', v_risk, v_direct;
  end if;

  -- ══ OB-23 · EVENT-LEVEL FINDINGS ARE CARRIED, AND DO NOT INFLATE ═════════
  select count(*) into n from jsonb_array_elements(v_risk) e
   where e->>'responsibility' is null and e->>'finding' like 'venue_%';
  if n = 0 then
    n_unproven := n_unproven + 1;
    raise notice 'OB-23 UNPROVEN: the fixture produced no event-level venue finding, so the exclusion could not be tested — risk=%', v_risk;
  else
    select count(distinct e->>'responsibility') into m
      from jsonb_array_elements(v_risk) e where e->>'responsibility' is not null;
    if v_at_risk = m then
      n_pass := n_pass + 1;
      raise notice 'OB-23 PASS: % event-level venue finding(s) are visible in data.risk with responsibility null, and counts.at_risk (%) still counts only the % responsibility-level subjects — an event-level finding is disclosed without being miscounted as a responsibility', n, v_at_risk, m;
    else
      n_fail := n_fail + 1;
      raise notice 'OB-23 FAIL: event-level findings=% at_risk=% distinct_responsibilities=%', n, v_at_risk, m;
    end if;
  end if;

  -- ══ OB-24 · THE UNCHANGED KEYS ARE UNCHANGED ═════════════════════════════
  -- The v300 ruling: counts.exceptions and data.exceptions do not move.
  -- data.exceptions must remain exactly the exception_recorded subset of
  -- data.risk — a filtered VIEW of the one collection, never a second source.
  select jsonb_agg(e order by e->>'responsibility') into v_filtered
    from jsonb_array_elements(v_risk) e where e->>'finding' = 'exception_recorded';
  select count(*) into n from jsonb_array_elements(v_risk) e
   where e->>'finding' = 'exception_recorded';
  if n = 0 then
    n_unproven := n_unproven + 1;
    raise notice 'OB-24 UNPROVEN: the fixture produced no exception_recorded finding, so the decomposition could not be tested';
  elsif (b->'counts'->>'exceptions')::int = jsonb_array_length(b->'data'->'exceptions')
        and b->'data'->'exceptions' = v_filtered then
    n_pass := n_pass + 1;
    raise notice 'OB-24 PASS: counts.exceptions (%) equals length(data.exceptions), and data.exceptions is byte-equal to data.risk filtered to exception_recorded — one collection, one filtered view, no second source', (b->'counts'->>'exceptions')::int;
  else
    n_fail := n_fail + 1;
    raise notice 'OB-24 FAIL: counts.exceptions=% len(data.exceptions)=% exceptions=% filtered=%',
      b->'counts'->>'exceptions', jsonb_array_length(b->'data'->'exceptions'),
      b->'data'->'exceptions', v_filtered;
  end if;

  -- ── verdict ─────────────────────────────────────────────────────────────
  raise notice 'v300 PERMANENT PROOF: % PASS / % FAIL / % SKIPPED / % UNPROVEN',
               n_pass, n_fail, n_skip, n_unproven;
  if n_fail > 0 then
    raise exception 'v300 PERMANENT PROOF FAILED: % claim(s) violated', n_fail;
  elsif n_unproven > 0 or n_skip > 0 then
    raise exception 'v300 PERMANENT PROOF BLOCKED: non-PASS outcomes present';
  end if;
  raise exception 'V300_PERMANENT_ROLLBACK';
exception
  when others then
    if sqlerrm = 'V300_PERMANENT_ROLLBACK' then
      raise notice 'v300 permanent proof rolled back cleanly — zero residue';
    else raise;
    end if;
end $$;
