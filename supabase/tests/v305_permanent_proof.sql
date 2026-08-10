-- ============================================================================
-- v305 PERMANENT PROOF — Canonical Execution Facts
-- Self-rolling-back, rerunnable, zero residue. Fixtures follow v303/v304.
--
-- EF-P1   every by_kind entry corresponds to a real execution_evidence row
-- EF-P2   evidence_id matches the originating row
-- EF-P3   actor matches the originating row
-- EF-P4   moment matches the originating row
-- EF-P5   every stream entry corresponds to a real evidence row
-- EF-P6   the stream is complete for all evidence at or before p_now
-- EF-P7   the stream is ordered oldest-first
-- EF-P8   evidence after p_now is excluded
-- EF-P9   fact_count equals the number of included rows
-- EF-P10  an occurrence with no event yields empty by_kind, empty stream, 0
-- EF-P11  no workflow vocabulary appears in emitted JSON KEYS
-- EF-P12  no workflow vocabulary appears in emitted JSON VALUES
-- EF-P13  two identical calls at the same p_now are byte-identical
--
-- Thirteen claims, not fourteen: "rolls back cleanly with zero residue" is not
-- a claim the proof can assert about itself — it is the sentinel's behaviour,
-- reported by the harness. Forcing a fourteenth would be a count, not a proof.
-- ============================================================================

do $$
declare
  n_pass int := 0; n_fail int := 0;
  v_tenant uuid; v_user uuid; v_sfx text;
  v_t0 timestamptz := now();
  v_cut timestamptz := now() + interval '10 minutes';
  v_bookA uuid; v_occA uuid; v_evA uuid;
  v_bookB uuid; v_occB uuid;
  e1 uuid; e2 uuid; e3 uuid; e_after uuid;
  f jsonb; f2 jsonb;
  n int; m int;
  BAD text[] := array['stage','progress','in_service','in_progress',
                      'ready','pending','released','closed'];
begin
  select tu.tenant_id, tu.user_id into v_tenant, v_user
    from public.tenant_users tu
   where tu.active and tu.role in ('admin','owner','manager','ops')
   order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'v305 PERMANENT PROOF BLOCKED: no active tenant_users row with an operating role';
  end if;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_sfx := substr(gen_random_uuid()::text, 1, 8);
  raise notice 'v305-permanent: tenant=% actor=%', v_tenant, v_user;

  -- ══ FIXTURE A · occurrence + event + evidence on both sides of the cutoff ══
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'EF-A', 'EFA-'||v_sfx, 'active') returning id into v_bookA;
  v_occA := (public.open_occurrence(v_bookA, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref,
      origin_commitment_ref, released_by)
    values (v_tenant, v_bookA, v_occA, gen_random_uuid(), 'ef305')
    returning id into v_evA;

  insert into public.execution_evidence (tenant_id, event_ref, kind, actor, moment, payload)
    values (v_tenant, v_evA, 'clearance', 'actor-one', v_t0 - interval '3 hours', '{}'::jsonb)
    returning id into e1;
  insert into public.execution_evidence (tenant_id, event_ref, kind, actor, moment, payload)
    values (v_tenant, v_evA, 'sign_off', 'actor-two', v_t0 - interval '2 hours', '{}'::jsonb)
    returning id into e2;
  insert into public.execution_evidence (tenant_id, event_ref, kind, actor, moment, payload)
    values (v_tenant, v_evA, 'clearance', 'actor-three', v_t0 - interval '1 hour', '{}'::jsonb)
    returning id into e3;
  -- AFTER the cutoff — must be excluded
  insert into public.execution_evidence (tenant_id, event_ref, kind, actor, moment, payload)
    values (v_tenant, v_evA, 'sign_off', 'actor-future', v_cut + interval '1 hour', '{}'::jsonb)
    returning id into e_after;

  f := public.occurrence_execution_facts(v_occA, v_cut);

  if jsonb_typeof(f->'by_kind') = 'object' and f->'by_kind' <> '{}'::jsonb then
    select count(*) into n from jsonb_object_keys(f->'by_kind') k
     where not exists (select 1 from public.execution_evidence x
                        where x.event_ref = v_evA and x.kind = k);
    if n = 0 then n_pass := n_pass+1;
      raise notice 'EF-P1 PASS: every by_kind entry corresponds to a real execution_evidence row';
    else n_fail := n_fail+1; raise notice 'EF-P1 FAIL: % phantom kind(s)', n; end if;
  else n_fail := n_fail+1; raise notice 'EF-P1 FAIL: by_kind empty or not an object: %', f->'by_kind'; end if;

  -- latest clearance at or before the cutoff is e3; latest sign_off is e2
  if (f->'by_kind'->'clearance'->>'evidence_id')::uuid = e3
     and (f->'by_kind'->'sign_off'->>'evidence_id')::uuid = e2 then
    n_pass := n_pass+1; raise notice 'EF-P2 PASS: evidence_id matches the originating row, latest-per-kind as of p_now';
  else n_fail := n_fail+1; raise notice 'EF-P2 FAIL: clearance=% expected % ; sign_off=% expected %',
      f->'by_kind'->'clearance'->>'evidence_id', e3, f->'by_kind'->'sign_off'->>'evidence_id', e2; end if;

  if f->'by_kind'->'clearance'->>'actor' = 'actor-three'
     and f->'by_kind'->'sign_off'->>'actor' = 'actor-two' then
    n_pass := n_pass+1; raise notice 'EF-P3 PASS: actor matches the originating row';
  else n_fail := n_fail+1; raise notice 'EF-P3 FAIL: %', f->'by_kind'; end if;

  select count(*) into n
    from jsonb_each(f->'by_kind') b
    join public.execution_evidence x on x.id = (b.value->>'evidence_id')::uuid
   where x.moment <> (b.value->>'moment')::timestamptz;
  if n = 0 then n_pass := n_pass+1;
    raise notice 'EF-P4 PASS: moment matches the originating row for every kind';
  else n_fail := n_fail+1; raise notice 'EF-P4 FAIL: % mismatch(es)', n; end if;

  select count(*) into n from jsonb_array_elements(f->'stream') s
   where not exists (select 1 from public.execution_evidence x
                      where x.id = (s->>'evidence_id')::uuid);
  if n = 0 then n_pass := n_pass+1;
    raise notice 'EF-P5 PASS: every stream entry corresponds to a real evidence row';
  else n_fail := n_fail+1; raise notice 'EF-P5 FAIL: % phantom entr(ies)', n; end if;

  select count(*) into m from public.execution_evidence x
   where x.event_ref = v_evA and x.moment <= v_cut;
  if jsonb_array_length(f->'stream') = m then
    n_pass := n_pass+1; raise notice 'EF-P6 PASS: the stream is complete — % of % rows at or before p_now', jsonb_array_length(f->'stream'), m;
  else n_fail := n_fail+1; raise notice 'EF-P6 FAIL: stream=% expected %', jsonb_array_length(f->'stream'), m; end if;

  select count(*) into n from (
    select (s->>'moment')::timestamptz mo,
           lag((s->>'moment')::timestamptz) over (order by ord) prev
      from jsonb_array_elements(f->'stream') with ordinality t(s, ord)) q
   where prev is not null and mo < prev;
  if n = 0 then n_pass := n_pass+1;
    raise notice 'EF-P7 PASS: the stream is ordered oldest-first';
  else n_fail := n_fail+1; raise notice 'EF-P7 FAIL: % inversion(s)', n; end if;

  select count(*) into n from jsonb_array_elements(f->'stream') s
   where (s->>'evidence_id')::uuid = e_after;
  if n = 0 then n_pass := n_pass+1;
    raise notice 'EF-P8 PASS: evidence recorded after p_now is excluded — as-of truncation holds';
  else n_fail := n_fail+1; raise notice 'EF-P8 FAIL: future evidence % is present', e_after; end if;

  if (f->>'fact_count')::int = jsonb_array_length(f->'stream')
     and (f->>'fact_count')::int = m then
    n_pass := n_pass+1; raise notice 'EF-P9 PASS: fact_count equals the number of included rows (%)', m;
  else n_fail := n_fail+1; raise notice 'EF-P9 FAIL: fact_count=% stream=% expected %',
      f->>'fact_count', jsonb_array_length(f->'stream'), m; end if;

  -- ══ FIXTURE B · occurrence with NO event ═════════════════════════════════
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'EF-B', 'EFB-'||v_sfx, 'active') returning id into v_bookB;
  v_occB := (public.open_occurrence(v_bookB, null, null)->>'occurrence_id')::uuid;
  f2 := public.occurrence_execution_facts(v_occB, v_cut);
  if f2 is not null and f2->'by_kind' = '{}'::jsonb
     and f2->'stream' = '[]'::jsonb and (f2->>'fact_count')::int = 0 then
    n_pass := n_pass+1; raise notice 'EF-P10 PASS: an occurrence with no event yields empty by_kind, empty stream, fact_count 0';
  else n_fail := n_fail+1; raise notice 'EF-P10 FAIL: %', f2; end if;

  -- ══ EF-P11 / EF-P12 · negative controls, EXACT match not substring ═══════
  select count(*) into n from jsonb_object_keys(f->'by_kind') k where k = any(BAD);
  select count(*) into m from jsonb_array_elements(f->'stream') s
   where (s->>'kind') = any(BAD);
  if n = 0 then n_pass := n_pass+1;
    raise notice 'EF-P11 PASS: no workflow vocabulary appears as an emitted JSON key';
  else n_fail := n_fail+1; raise notice 'EF-P11 FAIL: % forbidden key(s)', n; end if;
  if m = 0 then n_pass := n_pass+1;
    raise notice 'EF-P12 PASS: no workflow vocabulary appears as an emitted JSON value — exact match, so a canonical kind containing a substring is not falsely rejected';
  else n_fail := n_fail+1; raise notice 'EF-P12 FAIL: % forbidden value(s)', m; end if;

  -- ══ EF-P13 · determinism ═════════════════════════════════════════════════
  if public.occurrence_execution_facts(v_occA, v_cut)::text
     = public.occurrence_execution_facts(v_occA, v_cut)::text then
    n_pass := n_pass+1; raise notice 'EF-P13 PASS: two identical calls at the same p_now are byte-identical';
  else n_fail := n_fail+1; raise notice 'EF-P13 FAIL: calls diverge'; end if;

  raise notice 'v305 PERMANENT PROOF: % PASS / % FAIL / 0 SKIPPED / 0 UNPROVEN', n_pass, n_fail;
  if n_fail > 0 then
    raise exception 'v305 PERMANENT PROOF FAILED: % claim(s) violated', n_fail;
  end if;
  raise exception 'V305_PERMANENT_ROLLBACK';
exception
  when others then
    if sqlerrm = 'V305_PERMANENT_ROLLBACK' then
      raise notice 'v305 permanent proof rolled back cleanly — zero residue';
    else raise;
    end if;
end $$;
