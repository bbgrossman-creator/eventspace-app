-- ============================================================================
-- v307b PERMANENT PROOF — Class-U closure for the four execution ceremonies
-- Self-rolling-back, rerunnable, zero residue.
--
-- Authorizer: public.is_active_member() (derived from action_authorized + the
-- release_promise wrapper precedent). Refusal (ruling v307b-R1): the single
-- code EXECUTION_NOT_AUTHORIZED with the ceremony as rendered detail.
--
-- UB-1..4  unauthorized actor + EXISTING target → exact refusal + ZERO writes
-- UC-1..4  PRECEDENCE · unauthorized + ABSENT target → the U refusal,
--          not CEREMONY_NOT_FOUND (ordinal 0 outranks rung 1)
-- UD-1..4  authorized member + ABSENT target → CEREMONY_NOT_FOUND
--          (passes Class-U, reaches the ceremony's own locked lookup)
-- UE-1     authorized end-to-end anchor · start_service succeeds
-- UF-1     CROSS-TENANT · tenant B's active member against tenant A's real
--          event: passes Class-U in their own tenant, refused CEREMONY_NOT_FOUND,
--          indistinguishable from absent — no existence leak, no authority
-- UG-1     wrapper coherence · unauthorized release_promise still refuses
--          PROMISE_NOT_AUTHORIZED: release (wrapper's own U fires first)
-- UG-2     delegation coherence · unauthorized release_event refuses at ITS
--          own U rung (EXECUTION_NOT_AUTHORIZED: release_event), before any
--          delegation to release_occurrence
--
-- Sixteen claims. The v306 differential (38) and v307a equivalence (17) suites
-- run as regressions and must be unchanged — Class-U is transparent to an
-- authorized actor by construction.
-- ============================================================================

do $$
declare
  n_pass int := 0; n_fail int := 0; v_sfx text; v_err text;
  v_tenant uuid; v_user uuid; v_userB uuid; v_tenantB uuid;
  b uuid; occ uuid; ev uuid; bR uuid; ocR uuid;
  v_absent uuid := '00000000-0000-0000-0000-000000000000';
  sig_before text; sig_after text;
  a_code text; b_code text;
begin
  select tu.tenant_id, tu.user_id into v_tenant, v_user
    from public.tenant_users tu
   where tu.active and tu.role in ('admin','owner','manager','ops')
   order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'v307b PERMANENT PROOF BLOCKED: no active operating tenant_users row';
  end if;
  select tu.tenant_id, tu.user_id into v_tenantB, v_userB
    from public.tenant_users tu
   where tu.active and tu.tenant_id <> v_tenant
   order by tu.tenant_id limit 1;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_sfx := substr(gen_random_uuid()::text, 1, 8);
  raise notice 'v307b-permanent: tenant=% actor=%', v_tenant, v_user;

  -- ── fixtures (authored as the authorized member) ─────────────────────────
  insert into public.bookings (tenant_id,contact_name,invoice_num,status)
    values (v_tenant,'UB','UB-'||v_sfx,'active') returning id into b;
  occ := (public.open_occurrence(b,null,null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id,engagement_ref,occurrence_ref,origin_commitment_ref,released_by)
    values (v_tenant,b,occ,gen_random_uuid(),'v307b') returning id into ev;
  insert into public.bookings (tenant_id,contact_name,invoice_num,status)
    values (v_tenant,'UBR','UBR-'||v_sfx,'active') returning id into bR;
  ocR := (public.open_occurrence(bR,null,null)->>'occurrence_id')::uuid;

  -- write fingerprint across every relation these ceremonies touch
  sig_before := (select (select count(*) from public.event)||'/'||
                        (select count(*) from public.execution_evidence)||'/'||
                        (select count(*) from public.engagement_occurrence)||'/'||
                        (select count(*) from public.obligation));

  -- ── become an UNAUTHORIZED actor (orphan uid — no membership anywhere) ───
  perform set_config('app.user_id', gen_random_uuid()::text, true);
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);

  -- ══ UB-1..4 · unauthorized + EXISTING target → exact refusal ═════════════
  begin perform public.start_service(ev,'x'); v_err:='ADMITTED'; exception when others then v_err:=SQLERRM; end;
  if v_err='EXECUTION_NOT_AUTHORIZED: start_service' then n_pass:=n_pass+1; raise notice 'UB-1 PASS: %', v_err;
  else n_fail:=n_fail+1; raise notice 'UB-1 FAIL: %', v_err; end if;

  begin perform public.close_event(ev,'x','ovr'); v_err:='ADMITTED'; exception when others then v_err:=SQLERRM; end;
  if v_err='EXECUTION_NOT_AUTHORIZED: close_event' then n_pass:=n_pass+1; raise notice 'UB-2 PASS: %', v_err;
  else n_fail:=n_fail+1; raise notice 'UB-2 FAIL: %', v_err; end if;

  begin perform public.release_event(bR,'x','s','c',null); v_err:='ADMITTED'; exception when others then v_err:=SQLERRM; end;
  if v_err='EXECUTION_NOT_AUTHORIZED: release_event' then n_pass:=n_pass+1; raise notice 'UB-3 PASS: %', v_err;
  else n_fail:=n_fail+1; raise notice 'UB-3 FAIL: %', v_err; end if;

  begin perform public.release_occurrence(ocR,'x','s','c',null); v_err:='ADMITTED'; exception when others then v_err:=SQLERRM; end;
  if v_err='EXECUTION_NOT_AUTHORIZED: release_occurrence' then n_pass:=n_pass+1; raise notice 'UB-4 PASS: % — and ZERO writes across all four attempts (checked below)', v_err;
  else n_fail:=n_fail+1; raise notice 'UB-4 FAIL: %', v_err; end if;

  -- ══ UC-1..4 · PRECEDENCE · unauthorized + ABSENT target → U, not NOT_FOUND ═
  begin perform public.start_service(v_absent,'x'); v_err:='ADMITTED'; exception when others then v_err:=SQLERRM; end;
  if v_err='EXECUTION_NOT_AUTHORIZED: start_service' then n_pass:=n_pass+1; raise notice 'UC-1 PASS: ordinal 0 outranks rung 1';
  else n_fail:=n_fail+1; raise notice 'UC-1 FAIL: %', v_err; end if;
  begin perform public.close_event(v_absent,'x','ovr'); v_err:='ADMITTED'; exception when others then v_err:=SQLERRM; end;
  if v_err='EXECUTION_NOT_AUTHORIZED: close_event' then n_pass:=n_pass+1; raise notice 'UC-2 PASS';
  else n_fail:=n_fail+1; raise notice 'UC-2 FAIL: %', v_err; end if;
  begin perform public.release_event(v_absent,'x','s','c',null); v_err:='ADMITTED'; exception when others then v_err:=SQLERRM; end;
  if v_err='EXECUTION_NOT_AUTHORIZED: release_event' then n_pass:=n_pass+1; raise notice 'UC-3 PASS';
  else n_fail:=n_fail+1; raise notice 'UC-3 FAIL: %', v_err; end if;
  begin perform public.release_occurrence(v_absent,'x','s','c',null); v_err:='ADMITTED'; exception when others then v_err:=SQLERRM; end;
  if v_err='EXECUTION_NOT_AUTHORIZED: release_occurrence' then n_pass:=n_pass+1; raise notice 'UC-4 PASS';
  else n_fail:=n_fail+1; raise notice 'UC-4 FAIL: %', v_err; end if;

  -- ══ UG-1 · wrapper coherence · unauthorized release_promise ══════════════
  begin perform public.release_promise(ocR,'s','c',null); v_err:='ADMITTED'; exception when others then v_err:=SQLERRM; end;
  if v_err='PROMISE_NOT_AUTHORIZED: release' then n_pass:=n_pass+1; raise notice 'UG-1 PASS: the wrapper''s own U fires first — v295 RQ-2 semantics preserved';
  else n_fail:=n_fail+1; raise notice 'UG-1 FAIL: %', v_err; end if;

  -- ══ UG-2 · delegation coherence · outermost U wins ═══════════════════════
  -- (release_event with one occurrence would delegate; unauthorized must be
  -- refused at release_event's OWN rung, never reach the delegate's)
  begin perform public.release_event(b,'x','s','c',null); v_err:='ADMITTED'; exception when others then v_err:=SQLERRM; end;
  if v_err='EXECUTION_NOT_AUTHORIZED: release_event' then n_pass:=n_pass+1; raise notice 'UG-2 PASS: refused at release_event''s own U rung, before delegation';
  else n_fail:=n_fail+1; raise notice 'UG-2 FAIL: %', v_err; end if;

  -- ══ zero-writes fingerprint after ALL unauthorized attempts ══════════════
  sig_after := (select (select count(*) from public.event)||'/'||
                       (select count(*) from public.execution_evidence)||'/'||
                       (select count(*) from public.engagement_occurrence)||'/'||
                       (select count(*) from public.obligation));
  if sig_before = sig_after then n_pass:=n_pass+1; raise notice 'UB-W PASS: ten unauthorized attempts wrote nothing — %', sig_after;
  else n_fail:=n_fail+1; raise notice 'UB-W FAIL: % -> %', sig_before, sig_after; end if;

  -- ══ UF-1 · CROSS-TENANT · tenant B''s ACTIVE member vs tenant A''s event ══
  if v_userB is null then
    n_fail:=n_fail+1; raise notice 'UF-1 FAIL: no second tenant member';
  else
    perform set_config('app.user_id', v_userB::text, true);
    perform set_config('request.jwt.claim.sub', v_userB::text, true);
    begin perform public.start_service(ev,'x'); a_code:='ADMITTED'; exception when others then a_code:=SQLERRM; end;
    begin perform public.start_service(v_absent,'x'); b_code:='ADMITTED'; exception when others then b_code:=SQLERRM; end;
    if a_code='CEREMONY_NOT_FOUND' and a_code = b_code then
      n_pass:=n_pass+1; raise notice 'UF-1 PASS: an active member of another tenant passes Class-U in THEIR tenant and is refused CEREMONY_NOT_FOUND — indistinguishable from absent, no existence leak, no authority';
    else n_fail:=n_fail+1; raise notice 'UF-1 FAIL: real=% absent=%', a_code, b_code; end if;
  end if;

  -- ── back to the authorized member ─────────────────────────────────────────
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);

  -- ══ UD-1..4 · authorized + ABSENT → CEREMONY_NOT_FOUND (U passed) ═════════
  begin perform public.start_service(v_absent,'x'); v_err:='ADMITTED'; exception when others then v_err:=SQLERRM; end;
  if v_err='CEREMONY_NOT_FOUND' then n_pass:=n_pass+1; raise notice 'UD-1 PASS: authorized member passes Class-U and reaches the locked lookup';
  else n_fail:=n_fail+1; raise notice 'UD-1 FAIL: %', v_err; end if;
  begin perform public.close_event(v_absent,'x','ovr'); v_err:='ADMITTED'; exception when others then v_err:=SQLERRM; end;
  if v_err='CEREMONY_NOT_FOUND' then n_pass:=n_pass+1; raise notice 'UD-2 PASS';
  else n_fail:=n_fail+1; raise notice 'UD-2 FAIL: %', v_err; end if;
  begin perform public.release_event(v_absent,'x','s','c',null); v_err:='ADMITTED'; exception when others then v_err:=SQLERRM; end;
  if v_err='CEREMONY_NOT_FOUND' then n_pass:=n_pass+1; raise notice 'UD-3 PASS';
  else n_fail:=n_fail+1; raise notice 'UD-3 FAIL: %', v_err; end if;
  begin perform public.release_occurrence(v_absent,'x','s','c',null); v_err:='ADMITTED'; exception when others then v_err:=SQLERRM; end;
  if v_err='CEREMONY_NOT_FOUND' then n_pass:=n_pass+1; raise notice 'UD-4 PASS';
  else n_fail:=n_fail+1; raise notice 'UD-4 FAIL: %', v_err; end if;

  -- ══ UE-1 · authorized end-to-end anchor ══════════════════════════════════
  begin perform public.start_service(ev,'a'); v_err:=null; exception when others then v_err:=SQLERRM; end;
  if v_err is null then n_pass:=n_pass+1; raise notice 'UE-1 PASS: the authorized member''s start_service succeeded end-to-end — Class-U is transparent to authorized actors';
  else n_fail:=n_fail+1; raise notice 'UE-1 FAIL: %', v_err; end if;

  -- ══ verdict ══════════════════════════════════════════════════════════════
  raise notice 'v307b PERMANENT PROOF: % PASS / % FAIL / 0 SKIPPED / 0 UNPROVEN', n_pass, n_fail;
  if n_fail > 0 then
    raise exception 'v307b PERMANENT PROOF FAILED: % claim(s) violated', n_fail;
  end if;
  raise exception 'V307B_PERMANENT_ROLLBACK';
exception
  when others then
    if sqlerrm = 'V307B_PERMANENT_ROLLBACK' then
      raise notice 'v307b permanent proof rolled back cleanly — zero residue';
    else raise;
    end if;
end $$;
