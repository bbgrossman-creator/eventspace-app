-- ════════════════════════════════════════════════════════════════════════════
-- v295 PERMANENT PROOF — Promise Release invariants
-- Self-rolling-back, rerunnable, zero residue.
-- Blocking policy = v292d1 ruling: FAIL blocks, UNPROVEN blocks, any skip blocks.
--
--   RQ-1  the wrapper admits no actor parameter, and the actor is derived
--   RQ-2  a session without active membership is refused, and writes nothing
--   RQ-3  an INCOMPLETE occurrence releases lawfully (v292a, made permanent)
--   RQ-4  materialisation is once-only; a second release refuses (I-31')
--   RQ-5  a released occurrence is absent from the Preparation Queue
--   RQ-6  the wrapper remains VOLATILE, SECURITY DEFINER, search_path pinned
--
-- CLOCK: one transaction, so now() is constant and every fact written here
-- carries it. The staleness that required refresh_now() in the clone runner
-- cannot arise.
-- FIXTURES: offer_snapshots / offer_acceptances columns are host-verified.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  n_pass int := 0; n_fail int := 0; n_skip int := 0; n_unproven int := 0;
  v_tenant uuid; v_user uuid; v_orphan uuid := gen_random_uuid();
  b uuid; occ uuid; snap uuid; v_ver uuid; v_ev uuid;
  v_missing int; v_n int; v_s text; v_err text;
  ev_before bigint; ev_after bigint; e_before bigint; e_after bigint;
begin
  select tu.tenant_id, tu.user_id into v_tenant, v_user
    from public.tenant_users tu where tu.active order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'v295 PERMANENT PROOF BLOCKED: no active tenant_users row';
  end if;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  raise notice 'v295-permanent: tenant=% actor=%', v_tenant, v_user;

  -- ── fixture ─────────────────────────────────────────────────────────────
  -- release_occurrence resolves the acceptance BY BOOKING and keys the event on
  -- the OCCURRENCE, so an occurrence opened on an already-accepted booking has
  -- its commitment limb satisfied without creating anything in the offer tables.
  -- That matters: offer_snapshots.version_id is UNIQUE and FK-bound to
  -- proposal_versions, and offer_acceptances.snapshot_id is UNIQUE, so
  -- fabricating either is unlawful. Everything below rolls back regardless.
  select a.booking_id into b
    from public.offer_acceptances a
    left join public.acceptance_rescissions r on r.acceptance_id = a.id
   where a.tenant_id = v_tenant and r.id is null
   order by a.created_at
   limit 1;

  if b is null then
    select pv.id into v_ver
      from public.proposal_versions pv
     where not exists (select 1 from public.offer_snapshots s where s.version_id = pv.id)
     limit 1;
    if v_ver is null then
      raise exception 'v295 PERMANENT PROOF BLOCKED: no unrescinded acceptance for this tenant and no unused proposal_versions row to lawfully create one. Seed that truth; do not weaken the claims.';
    end if;
    insert into public.bookings (tenant_id, contact_name, invoice_num, status)
      values (v_tenant, 'v295perm', 'V295P-'||substr(gen_random_uuid()::text,1,8), 'active')
      returning id into b;
    insert into public.offer_snapshots
      (id, tenant_id, version_id, fingerprint, model, artifact_bytes,
       artifact_hash, artifact_meta, assets, published_at)
      values (gen_random_uuid(), v_tenant, v_ver,
              'v295p-'||substr(gen_random_uuid()::text,1,10),
              '{"components":[]}'::jsonb, '\x00'::bytea, 'v295p',
              '{}'::jsonb, '[]'::jsonb, now())
      returning id into snap;
    insert into public.offer_acceptances
      (id, tenant_id, snapshot_id, fingerprint, booking_id, recorded_moment, created_at)
      values (gen_random_uuid(), v_tenant, snap,
              'v295p-'||substr(gen_random_uuid()::text,1,10), b, now(), now());
  end if;

  occ := (public.open_occurrence(b, null, null)->>'occurrence_id')::uuid;

  -- ── RQ-6 · shape, before anything mutates ───────────────────────────────
  select p.provolatile::text||'/'||p.prosecdef::text||'/'||
         coalesce(array_to_string(p.proconfig,','),'-') into v_s
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='release_promise';
  if v_s = 'v/true/search_path=public' then n_pass := n_pass + 1;
    raise notice 'RQ-6 PASS: the wrapper remains VOLATILE, SECURITY DEFINER and search_path-pinned — it writes, and STABLE would be false';
  else n_fail := n_fail + 1; raise notice 'RQ-6 FAIL: shape=%', v_s; end if;

  -- ── RQ-2 · unauthorized, nothing written ────────────────────────────────
  select count(*) into e_before from public.event;
  select count(*) into ev_before from public.execution_evidence;
  perform set_config('app.user_id', v_orphan::text, true);
  perform set_config('request.jwt.claim.sub', v_orphan::text, true);
  if public.is_active_member() then
    perform set_config('app.user_id', v_user::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    n_unproven := n_unproven + 1;
    raise notice 'RQ-2 UNPROVEN: a generated uid resolved as an active member; the unauthorized path cannot be exercised honestly';
  else
    v_err := null;
    begin perform public.release_promise(occ, 'sig', 'clr', null);
    exception when others then v_err := sqlerrm; end;
    perform set_config('app.user_id', v_user::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    select count(*) into e_after from public.event;
    select count(*) into ev_after from public.execution_evidence;
    if v_err like '%PROMISE_NOT_AUTHORIZED%' and e_after = e_before and ev_after = ev_before then
      n_pass := n_pass + 1;
      raise notice 'RQ-2 PASS: a session without active membership was refused and neither the event nor the evidence ledger moved';
    else n_fail := n_fail + 1;
      raise notice 'RQ-2 FAIL: err=% events %->% evidence %->%',
        coalesce(v_err,'(none)'), e_before, e_after, ev_before, ev_after;
    end if;
  end if;

  -- ── RQ-3 · an INCOMPLETE occurrence releases (v292a) ─────────────────────
  select jsonb_array_length(
           public.projection_occurrence_brief(occ, now())->'data'->'completeness'->'missing')
    into v_missing;
  if coalesce(v_missing,0) = 0 then
    n_unproven := n_unproven + 1;
    raise notice 'RQ-3 UNPROVEN: the fixture occurrence is already complete (missing=%); the v292a claim cannot be exercised', v_missing;
  else
    v_ev := (public.release_promise(occ, 'v295p-signoff', 'v295p-clearance', null)->>'event_id')::uuid;
    if v_ev is not null then n_pass := n_pass + 1;
      raise notice 'RQ-3 PASS: an occurrence with % missing promise facts released lawfully — completeness informs the decision and never gates it', v_missing;
    else n_fail := n_fail + 1; raise notice 'RQ-3 FAIL: no event materialised'; end if;
  end if;

  -- ── RQ-1 · actor derived, no parameter admits one ────────────────────────
  select p.proname||'/'||p.pronargs::text into v_s
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='release_promise';
  if v_ev is null then
    n_unproven := n_unproven + 1;
    raise notice 'RQ-1 UNPROVEN: no event was materialised, so the recorded actor cannot be read';
  else
    select count(*) into v_n from public.event e
     where e.id = v_ev and e.released_by = v_user::text;
    if v_s = 'release_promise/4' and v_n = 1 then n_pass := n_pass + 1;
      raise notice 'RQ-1 PASS: the signature (%) admits no actor parameter, and released_by is the session''s own derived actor — a client cannot assert an identity here', v_s;
    else n_fail := n_fail + 1; raise notice 'RQ-1 FAIL: sig=% released_by_match=%', v_s, v_n; end if;
  end if;

  -- ── RQ-4 · once only (I-31') ────────────────────────────────────────────
  v_err := null;
  begin perform public.release_promise(occ, 'again', 'again', null);
  exception when others then v_err := sqlerrm; end;
  select count(*) into v_n from public.event e where e.occurrence_ref = occ;
  if v_err like '%RELEASE_ALREADY_RELEASED%' and v_n = 1 then n_pass := n_pass + 1;
    raise notice 'RQ-4 PASS: a second release was refused and exactly one event exists for the occurrence (I-31'')';
  else n_fail := n_fail + 1;
    raise notice 'RQ-4 FAIL: err=% events=%', coalesce(v_err,'(no refusal)'), v_n; end if;

  -- ── RQ-5 · released occurrences leave the Preparation Queue ─────────────
  select count(*) into v_n
    from jsonb_array_elements(public.projection_preparation_queue(now())->'data'->'occurrences') r
   where r->>'occurrence' = occ::text;
  if v_n = 0 then n_pass := n_pass + 1;
    raise notice 'RQ-5 PASS: the released occurrence is absent from the Preparation Queue — it left by derivation, which is v294''s documented exit condition';
  else n_fail := n_fail + 1;
    raise notice 'RQ-5 FAIL: a released occurrence is still a queue member'; end if;

  raise notice 'v295 PERMANENT PROOF: % PASS / % FAIL / % SKIPPED / % UNPROVEN',
               n_pass, n_fail, n_skip, n_unproven;
  if n_fail > 0 then
    raise exception 'v295 PERMANENT PROOF FAILED: % claim(s) violated', n_fail;
  elsif n_unproven > 0 or n_skip > 0 then
    raise exception 'v295 PERMANENT PROOF BLOCKED: non-PASS outcomes present';
  end if;
  raise exception 'V295_PERMANENT_ROLLBACK';
exception
  when others then
    if sqlerrm = 'V295_PERMANENT_ROLLBACK' then
      raise notice 'v295 permanent proof rolled back cleanly — zero residue';
    else raise;
    end if;
end $$;
