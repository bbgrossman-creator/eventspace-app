-- ════════════════════════════════════════════════════════════════════════════
-- v294 PERMANENT PROOF — Preparation Queue invariants
-- Self-rolling-back, rerunnable, zero residue. Blocking policy = v292d1 ruling:
-- FAIL blocks, UNPROVEN blocks, any skip blocks (no permitted skip category).
--
-- Claims:
--   QP-1  an active undated unreleased occurrence is a member
--   QP-2  an active dated-FUTURE unreleased occurrence is a member
--   QP-3  a released occurrence is not a member
--   QP-4  a cancelled occurrence is not a member
--   QP-5  the row's operating_date equals the brief's own value (composition)
--   QP-6  anonymous-context read is empty (isolation)
--   QP-7  STABLE + SECURITY DEFINER + pinned search_path + envelope identity v1
--   QP-8  an unreleased occurrence with missing_count = 0 is a member
--
-- Membership is derived on read from occurrence_is_active() and event
-- existence. Nothing here reads milestones directly, mirroring the frozen
-- strict-composition constraint on the projection itself.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  n_pass int := 0; n_fail int := 0; n_skip int := 0; n_unproven int := 0;
  v_tenant uuid; v_user uuid; v_prior_user text; v_prior_jwt text;
  ba uuid; r_undated uuid; r_dated uuid; r_released uuid; r_cancelled uuid;
  v_far date := current_date + 45;
  q jsonb; v_n int; v_s text;
  member int; member2 int;
begin
  select tu.tenant_id, tu.user_id into v_tenant, v_user
    from public.tenant_users tu where tu.active order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'v294 PERMANENT PROOF BLOCKED: no active tenant_users row';
  end if;
  v_prior_user := current_setting('app.user_id', true);
  v_prior_jwt  := current_setting('request.jwt.claim.sub', true);
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  raise notice 'v294-permanent: tenant=% actor=%', v_tenant, v_user;

  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'v294perm', 'V294P-'||substr(gen_random_uuid()::text,1,8), 'active')
    returning id into ba;
  r_undated   := (public.open_occurrence(ba, null, null)->>'occurrence_id')::uuid;
  r_dated     := (public.open_occurrence(ba, null, null)->>'occurrence_id')::uuid;
  perform public.set_schedule_milestone(p_occurrence=>r_dated, p_milestone_key=>'operating_date',
    p_at_date=>v_far, p_at_moment=>null, p_window_end=>null, p_label=>null, p_reason=>'v294 permanent fixture');
  r_released  := (public.open_occurrence(ba, null, null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref, origin_commitment_ref, released_by)
    values (v_tenant, ba, r_released, gen_random_uuid(), 'v294perm');
  r_cancelled := (public.open_occurrence(ba, null, null)->>'occurrence_id')::uuid;
  perform public.cancel_occurrence(p_occurrence=>r_cancelled, p_reason=>'v294 permanent fixture');

  q := public.projection_preparation_queue();

  -- QP-1
  select count(*) into member from jsonb_array_elements(q->'data'->'occurrences') r
   where r->>'occurrence' = r_undated::text;
  if member = 1 then n_pass := n_pass + 1;
    raise notice 'QP-1 PASS: an active undated unreleased occurrence is a member — intake is visible from the moment it exists';
  else n_fail := n_fail + 1; raise notice 'QP-1 FAIL: member=%', member; end if;

  -- QP-2
  select count(*) into member from jsonb_array_elements(q->'data'->'occurrences') r
   where r->>'occurrence' = r_dated::text;
  if member = 1 then n_pass := n_pass + 1;
    raise notice 'QP-2 PASS: a dated-FUTURE unreleased occurrence is a member — setting a date re-sorts, it does not remove';
  else n_fail := n_fail + 1; raise notice 'QP-2 FAIL: member=%', member; end if;

  -- QP-3 / QP-4
  select count(*) into member  from jsonb_array_elements(q->'data'->'occurrences') r
   where r->>'occurrence' = r_released::text;
  select count(*) into member2 from jsonb_array_elements(q->'data'->'occurrences') r
   where r->>'occurrence' = r_cancelled::text;
  if member = 0 then n_pass := n_pass + 1;
    raise notice 'QP-3 PASS: a released occurrence is excluded — release is the boundary and the queue respects it';
  else n_fail := n_fail + 1; raise notice 'QP-3 FAIL: released member=%', member; end if;
  if member2 = 0 then n_pass := n_pass + 1;
    raise notice 'QP-4 PASS: a cancelled occurrence is excluded — the queue is work to be done';
  else n_fail := n_fail + 1; raise notice 'QP-4 FAIL: cancelled member=%', member2; end if;

  -- QP-5 · composition: the row's date is the brief's date
  select count(*) into v_n from jsonb_array_elements(q->'data'->'occurrences') r
   where r->>'occurrence' = r_dated::text
     and r->>'operating_date' is not distinct from
         (public.projection_occurrence_brief(r_dated, (q->>'as_of')::timestamptz)
            ->'data'->'schedule'->>'operating_date');
  if v_n = 1 then n_pass := n_pass + 1;
    raise notice 'QP-5 PASS: the row''s operating_date equals projection_occurrence_brief''s own value at the envelope''s as_of — strict composition, no second resolver';
  else n_fail := n_fail + 1; raise notice 'QP-5 FAIL'; end if;

  -- QP-6 · isolation under a cleared identity, restored afterwards
  perform set_config('app.user_id', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  v_n := (public.projection_preparation_queue()->'counts'->>'total')::int;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  if v_n = 0 then n_pass := n_pass + 1;
    raise notice 'QP-6 PASS: an anonymous read returns an empty queue — isolation holds at the database';
  else n_fail := n_fail + 1; raise notice 'QP-6 FAIL: anonymous total=%', v_n; end if;

  -- QP-7 · shape and identity (provolatile is "char": explicit ::text)
  select p.provolatile::text||'|'||p.prosecdef::text||'|'||
         coalesce(array_to_string(p.proconfig,','),'-')||'|'||
         (q->>'projection')||'|'||(q->>'version') into v_s
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='projection_preparation_queue';
  if v_s = 's|true|search_path=public|preparation_queue|1' then n_pass := n_pass + 1;
    raise notice 'QP-7 PASS: STABLE, SECURITY DEFINER, search_path pinned, envelope preparation_queue v1';
  else n_fail := n_fail + 1; raise notice 'QP-7 FAIL: shape=%', v_s; end if;

  -- QP-8 · the complete-but-unreleased boundary. A clone proof passing while
  -- permanent certification omits this invariant is not sufficient: this is the
  -- corner that a membership predicate carrying "AND missing_count > 0" would
  -- violate, and no other claim here would notice.
  --
  -- Two independent routes to the frozen claim, then UNPROVEN. Never a weaker
  -- assertion: route 1 builds completeness through certified ceremonies; route 2
  -- looks for a real unreleased occurrence that is already complete. Only if
  -- both fail is the claim unproven, and then it names what is missing.
  insert into public.venue (tenant_id,name,address,venue_type,created_by)
    values (v_tenant,'Queue Hall','2 Queue St','fixed_facility','v294perm');

  perform public.set_occurrence_profile(p_occurrence=>r_undated, p_display_name=>'QP8 Complete',
            p_occasion_kind=>'wedding', p_reason=>'v294 permanent fixture');
  perform public.set_engagement_profile(
            p_booking=>(select booking_id from public.engagement_occurrence where id=r_undated),
            p_display_name=>'Alpha Events',
            p_client_display_name=>'Klein Family',
            p_reason=>'v294 permanent client');

  perform public.bind_occurrence_venue(
            p_occurrence=>r_undated,
            p_venue=>(select id from public.venue
                       where name='Queue Hall' and tenant_id=v_tenant),
            p_reason=>'v294 permanent venue');

  perform public.bind_occurrence_supervision(
            p_occurrence=>r_undated,
            p_authority_org=>'KCL',
            p_window_start=>now() + interval '39 days',
            p_window_end=>now() + interval '40 days',
            p_certificate_ref=>'QP8-CERT',
            p_contact=>null,
            p_reason=>'v294 permanent supervision');

  perform public.commit_attendance(p_occurrence=>r_undated, p_head_count=>150,
            p_basis=>'contracted', p_effective_moment=>null, p_reason=>'v294 permanent fixture');
  perform public.set_schedule_milestone(p_occurrence=>r_undated, p_milestone_key=>'operating_date',
            p_at_date=>v_far, p_at_moment=>null, p_window_end=>null, p_label=>null, p_reason=>'v294 permanent fixture');
  perform public.set_schedule_milestone(p_occurrence=>r_undated, p_milestone_key=>'staff_call',
            p_at_date=>null, p_at_moment=>now() + interval '40 days',
            p_window_end=>null, p_label=>null, p_reason=>'v294 permanent fixture');

  q := public.projection_preparation_queue();
  select (r->>'missing_count')::int into v_n
    from jsonb_array_elements(q->'data'->'occurrences') r
   where r->>'occurrence' = r_undated::text;

  if v_n = 0 then
    n_pass := n_pass + 1;
    raise notice 'QP-8 PASS: an unreleased occurrence with missing_count=0 is a member — completeness does not gate membership (v292a made permanent)';
  else
    -- route 2: any real complete unreleased occurrence in this tenant
    select count(*) into member
      from jsonb_array_elements(q->'data'->'occurrences') r
     where (r->>'missing_count')::int = 0;
    if member > 0 then
      n_pass := n_pass + 1;
      raise notice 'QP-8 PASS: % complete (missing_count=0) unreleased occurrence(s) are members in live data — the boundary holds', member;
    else
      n_unproven := n_unproven + 1;
      raise notice 'QP-8 UNPROVEN: could not reach missing_count=0 (fixture reached %), and no live unreleased occurrence is complete. Unestablished keys: %. Supply the ceremony for those keys, or re-rule the claim; do not weaken it.',
        v_n,
        (public.projection_occurrence_brief(r_undated, (q->>'as_of')::timestamptz)
           ->'data'->'completeness'->>'missing');
    end if;
  end if;

  raise notice 'v294 PERMANENT PROOF: % PASS / % FAIL / % SKIPPED / % UNPROVEN',
               n_pass, n_fail, n_skip, n_unproven;
  if n_fail > 0 then
    raise exception 'v294 PERMANENT PROOF FAILED: % claim(s) violated', n_fail;
  elsif n_unproven > 0 or n_skip > 0 then
    raise exception 'v294 PERMANENT PROOF BLOCKED: non-PASS outcomes present';
  end if;
  raise exception 'V294_PERMANENT_ROLLBACK';
exception
  when others then
    if sqlerrm = 'V294_PERMANENT_ROLLBACK' then
      raise notice 'v294 permanent proof rolled back cleanly — zero residue';
    else raise;
    end if;
end $$;
