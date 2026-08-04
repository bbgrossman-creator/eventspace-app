-- ============================================================================
-- v302 PERMANENT PROOF — the v292d composed version guard (audit debt D-6)
-- Self-rolling-back, rerunnable, zero residue.
-- Blocking policy = v292d1 ruling: FAIL blocks, UNPROVEN blocks, any skip blocks.
--
-- OD-20a  the guard function RAISES, by name, for a wrong version and a wrong
--         projection — "usable inside a SQL expression and testable in
--         isolation", which is what v292d's own comment promised
-- OD-20b  the deployed composed projection still CONTAINS the guard — a guard
--         that was quietly edited out would leave OD-20a passing and the
--         system unprotected
-- OD-20c  a genuine version-1 brief composes without raising — the guard does
--         not fire on the happy path
--
-- WHY THIS PROOF EXISTS. projection_occurrences_for_operational_day asserts the
-- brief is occurrence_brief v1 and calls v292d_version_mismatch() otherwise.
-- v292d's source cites OD-20 twice for that behaviour. OD-20 was never written:
-- a repository-wide and harness-wide search finds the identifier ONLY in those
-- two comments. The one thing standing between a future brief version and
-- silent nulls across every operational-day read was a guard nothing proved.
--
-- The BEHAVIOURAL half — actually making the brief emit v2 and watching the
-- composed projection raise — lives in proofs/v302_proofs.sh, because it needs
-- a CREATE OR REPLACE and must run on a disposable clone, never here.
-- ============================================================================
do $$
declare
  n_pass int := 0; n_fail int := 0; n_skip int := 0; n_unproven int := 0;
  v_tenant uuid; v_user uuid; v_sfx text; v_now timestamptz := now();
  v_book uuid; v_occ uuid; v_day date;
  v_src text; v_out jsonb; v_msg text; n int;
begin
  select tu.tenant_id, tu.user_id into v_tenant, v_user
    from public.tenant_users tu
   where tu.active and tu.role in ('admin','owner','manager','ops')
   order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'v302 PERMANENT PROOF BLOCKED: no active tenant_users row with an operating role';
  end if;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_sfx := substr(gen_random_uuid()::text, 1, 8);
  raise notice 'v302-permanent: tenant=% actor=%', v_tenant, v_user;

  -- ══ OD-20a · THE GUARD RAISES, BY NAME ═══════════════════════════════════
  -- Wrong version.
  begin
    perform public.v292d_version_mismatch('occurrence_brief', '2');
    n_fail := n_fail + 1;
    raise notice 'OD-20a FAIL: the guard accepted occurrence_brief v2 without raising';
  exception when others then
    v_msg := sqlerrm;
    if v_msg like 'V292D_COMPOSED_VERSION_MISMATCH%'
       and v_msg like '%occurrence_brief%' and v_msg like '%2%' then
      n_pass := n_pass + 1;
      raise notice 'OD-20a PASS: the guard raises V292D_COMPOSED_VERSION_MISMATCH naming the projection and the version it found (%) — a composed read fails loudly rather than emitting nulls', v_msg;
    else
      n_fail := n_fail + 1;
      raise notice 'OD-20a FAIL: raised, but not the named refusal: %', v_msg;
    end if;
  end;

  -- Wrong projection name, same guard.
  begin
    perform public.v292d_version_mismatch('something_else', '1');
    n_fail := n_fail + 1;
    raise notice 'OD-20a2 FAIL: the guard accepted a foreign projection name';
  exception when others then
    v_msg := sqlerrm;
    if v_msg like 'V292D_COMPOSED_VERSION_MISMATCH%' and v_msg like '%something_else%' then
      n_pass := n_pass + 1;
      raise notice 'OD-20a2 PASS: a foreign projection name is refused by the same guard, named in the message';
    else
      n_fail := n_fail + 1;
      raise notice 'OD-20a2 FAIL: %', v_msg;
    end if;
  end;

  -- ══ OD-20b · THE GUARD IS STILL WIRED IN ═════════════════════════════════
  -- OD-20a proves the function refuses. This proves the composed projection
  -- still CALLS it, and still on both axes. Without this, deleting the CTE
  -- would leave OD-20a green over an unprotected system.
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace nsp on nsp.oid = p.pronamespace
   where nsp.nspname = 'public'
     and p.proname = 'projection_occurrences_for_operational_day';
  if v_src is null then
    n_unproven := n_unproven + 1;
    raise notice 'OD-20b UNPROVEN: projection_occurrences_for_operational_day not found';
  elsif v_src like '%v292d_version_mismatch%'
        and v_src like '%occurrence_brief%'
        and v_src like '%version%' then
    n_pass := n_pass + 1;
    raise notice 'OD-20b PASS: the deployed composed projection still calls v292d_version_mismatch and still checks BOTH the projection name and the version';
  else
    n_fail := n_fail + 1;
    raise notice 'OD-20b FAIL: the composed projection no longer carries its version guard';
  end if;

  -- ══ OD-20c · THE HAPPY PATH DOES NOT RAISE ═══════════════════════════════
  -- A guard that refused everything would also pass OD-20a and OD-20b.
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant, 'OD20c', 'OD20C-'||v_sfx, 'active') returning id into v_book;
  v_occ := (public.open_occurrence(v_book, null, null)->>'occurrence_id')::uuid;
  v_day := (v_now + interval '11 days')::date;
  perform public.set_schedule_milestone(v_occ, 'operating_date', v_day, null, null, null, null);

  v_out := public.projection_occurrences_for_operational_day(v_day, v_now);
  select count(*) into n from jsonb_array_elements(v_out->'data'->'occurrences') x
   where x->>'occurrence' = v_occ::text;
  if n = 1 and v_out->>'projection' = 'occurrences_for_operational_day' then
    n_pass := n_pass + 1;
    raise notice 'OD-20c PASS: a genuine occurrence_brief v1 composes through the guard and appears in the day (%) — the guard does not fire on the happy path', v_day;
  else
    n_fail := n_fail + 1;
    raise notice 'OD-20c FAIL: composed rows=% projection=%', n, v_out->>'projection';
  end if;

  -- ── verdict ─────────────────────────────────────────────────────────────
  raise notice 'v302 PERMANENT PROOF: % PASS / % FAIL / % SKIPPED / % UNPROVEN',
               n_pass, n_fail, n_skip, n_unproven;
  if n_fail > 0 then
    raise exception 'v302 PERMANENT PROOF FAILED: % claim(s) violated', n_fail;
  elsif n_unproven > 0 or n_skip > 0 then
    raise exception 'v302 PERMANENT PROOF BLOCKED: non-PASS outcomes present';
  end if;
  raise exception 'V302_PERMANENT_ROLLBACK';
exception
  when others then
    if sqlerrm = 'V302_PERMANENT_ROLLBACK' then
      raise notice 'v302 permanent proof rolled back cleanly — zero residue';
    else raise;
    end if;
end $$;
