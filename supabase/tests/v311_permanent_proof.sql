-- ============================================================================
-- v311 PERMANENT PROOF — a booked Event owes Kitchen a quantified Requirement
-- Self-rolling-back, rerunnable, zero residue.
--
-- THE PROPERTY. A committed design's quantity rule survives commitment, becomes
-- an operative Kitchen Requirement at release, moves only by attributable acts,
-- and reaches fulfillment only through an approval that the Requirement itself
-- records. Recommended ≠ adjusted ≠ approved, at every step.
--
-- Seven suites, 85 claims, each rolling back independently.
--
-- FX-1…8   COMMITTED RULE · publish freezes items_committed; one shared
--          derivation serves preview and enactment; per_person scales with the
--          guest count, flat does not, and an incomplete rule resolves to
--          UNRESOLVED rather than to a guess
-- A1…A12   AUTHORITY (O-010) · no role is authority; adjust does not imply
--          approve; grants are effective-dated and append-only; revocation is
--          prospective; a grant in another tenant authorizes nothing
-- C…INV2   DECISIONS · recommendation, adjustment and approval are distinct
--          append-only acts; only a recommendation may be unresolved; a
--          recommendation never becomes fulfillable demand
-- L1…L15   REQUIREMENT LINEAGE · approval atomically creates the superseding
--          quantified Requirement revision; the prior revision remains and is
--          immutable; decision history stays readable from either end; and if
--          the revision cannot be created, the approval does not survive either
-- P1…E16   ENACTMENT · release creates the Requirements and one recommendation
--          and never an approval; regeneration is idempotent and no longer
--          voids an approved revision; a guest-count change recommends again
--          and nothing more; a future-effective guest count becomes current by
--          derivation at its own instant, with nothing polled or scheduled;
--          and the downstream fence holds
--
-- R1…R10   POST-COMMITMENT REVISION · a booking seals a baseline, not a
--          forever-event. A revised commitment is inert until explicitly
--          adopted under an Authority Grant; adoption is append-only and leaves
--          the original baseline in place; the SAME Requirement re-derives so
--          decision history is never orphaned; and the approval made under the
--          old commitment stands historically while the panel reports Review
--          required. Adoption approves nothing and moves nothing downstream.
--
-- X1…X12   CROSS-DOMAIN RECONCILIATION · an adopted commitment revision
--          reconciles Event Requirements in EVERY receiving domain, not only
--          Kitchen. Unchanged Requirements preserve identity (and keep their
--          completed work); changed Requirements supersede while the prior text
--          remains; new Requirements append; removed Requirements resolve
--          historically without deletion. Operational acts already performed
--          against a superseded Requirement are retained and named in an
--          explicit reconciliation fact, and the revised Requirement is
--          outstanding rather than pre-satisfied. Reconciliation is idempotent,
--          and completion reads across a line so supersession never strands a
--          dependent. X13 additionally proves v311 reproduces v275's natural
--          keys exactly for an unrevised event, so deploying it re-keys nothing.
--
-- L14 is the claim that matters most. It installs a guard that forces the
-- Requirement revision to fail after the approval decision has been written,
-- and proves neither survives — there is no state in which a quantity is
-- approved but the Requirement does not say so.
-- ============================================================================

do $$
declare
  v_tenant uuid; v_user uuid; v_snap uuid; v_ver uuid; v_bk uuid; v_pr uuid;
  r record; n_pass int := 0; n_fail int := 0;
  v_model jsonb;
begin
  select tu.tenant_id, tu.user_id into v_tenant, v_user
    from public.tenant_users tu where tu.active order by tu.tenant_id limit 1;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);

  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_tenant,'v311 fixture','V311-FIX','active') returning id into v_bk;
  insert into public.proposals (tenant_id, booking_id) values (v_tenant, v_bk) returning id into v_pr;
  insert into public.proposal_versions (tenant_id, proposal_id, version) values (v_tenant, v_pr, 1) returning id into v_ver;

  -- A committed model as v311 would freeze it: four items exercising every rule.
  v_model := jsonb_build_object('components', jsonb_build_array(
    jsonb_build_object('componentId', gen_random_uuid()::text, 'title', 'Sliders',
      'items_committed', jsonb_build_array(
        jsonb_build_object('item_id', gen_random_uuid()::text, 'name','Slider','quantity',1,'quantity_basis','per_person','selected',true),
        jsonb_build_object('item_id', gen_random_uuid()::text, 'name','Sauce tray','quantity',5,'quantity_basis','flat','selected',true),
        jsonb_build_object('item_id', gen_random_uuid()::text, 'name','Pickles','quantity',null,'quantity_basis','per_person','selected',true),
        jsonb_build_object('item_id', gen_random_uuid()::text, 'name','Garnish','quantity',3,'quantity_basis',null,'selected',true)))));

  insert into public.offer_snapshots (tenant_id, version_id, fingerprint, model, artifact_bytes, artifact_hash, artifact_meta)
    values (v_tenant, v_ver, 'v311-fixture', v_model, '\x00'::bytea, 'fixhash', '{}'::jsonb) returning id into v_snap;

  raise notice '--- derivation with operative attendance = 100 ---';
  for r in select * from public.kitchen_quantity_derive(v_snap, 100) loop
    raise notice '  % | basis=% qty=% attendance=% required=% resolved=% reason=%',
      rpad(coalesce(r.item_name,'(component)'),12), coalesce(r.quantity_basis,'-'),
      coalesce(r.design_quantity::text,'-'), coalesce(r.attendance_used::text,'-'),
      coalesce(r.required_quantity::text,'-'), r.resolved, coalesce(r.unresolved_reason,'-');

    if r.item_name = 'Slider' then
      if r.resolved and r.required_quantity = 100 then n_pass:=n_pass+1;
        raise notice '    PASS per_person 1 x 100 guests = 100';
      else n_fail:=n_fail+1; raise notice '    FAIL expected 100'; end if;
    elsif r.item_name = 'Sauce tray' then
      if r.resolved and r.required_quantity = 5 and r.attendance_used is null then n_pass:=n_pass+1;
        raise notice '    PASS flat = 5, attendance did not scale it';
      else n_fail:=n_fail+1; raise notice '    FAIL expected flat 5'; end if;
    elsif r.item_name = 'Pickles' then
      if (not r.resolved) and r.required_quantity is null then n_pass:=n_pass+1;
        raise notice '    PASS per_person with null quantity stayed UNRESOLVED (did not become 100)';
      else n_fail:=n_fail+1; raise notice '    FAIL null quantity was inferred'; end if;
    elsif r.item_name = 'Garnish' then
      if (not r.resolved) then n_pass:=n_pass+1;
        raise notice '    PASS missing basis stayed UNRESOLVED';
      else n_fail:=n_fail+1; raise notice '    FAIL missing basis was inferred'; end if;
    end if;
  end loop;

  raise notice '--- preview with NO attendance operand ---';
  for r in select * from public.kitchen_quantity_derive(v_snap, null) loop
    if r.item_name = 'Slider' then
      if (not r.resolved) then n_pass:=n_pass+1;
        raise notice '    PASS per_person without attendance = UNRESOLVED (%)', r.unresolved_reason;
      else n_fail:=n_fail+1; raise notice '    FAIL invented an attendance'; end if;
    elsif r.item_name = 'Sauce tray' then
      if r.resolved and r.required_quantity = 5 then n_pass:=n_pass+1;
        raise notice '    PASS flat resolves without attendance';
      else n_fail:=n_fail+1; raise notice '    FAIL flat needed attendance'; end if;
    end if;
  end loop;

  raise notice '--- backward compatibility: a pre-v311 snapshot ---';
  declare v_old uuid; v_cnt int := 0; v_ver2 uuid;
  begin
    insert into public.proposal_versions (tenant_id, proposal_id, version)
      values (v_tenant, v_pr, 2) returning id into v_ver2;
    insert into public.offer_snapshots (tenant_id, version_id, fingerprint, model, artifact_bytes, artifact_hash, artifact_meta)
      values (v_tenant, v_ver2, 'v311-old',
        jsonb_build_object('components', jsonb_build_array(
          jsonb_build_object('componentId', gen_random_uuid()::text, 'title','Legacy Sliders',
            'items', jsonb_build_array(jsonb_build_object('name','Slider','unit_price',12))))),
        '\x00'::bytea, 'oldhash', '{}'::jsonb)
      returning id into v_old;
    for r in select * from public.kitchen_quantity_derive(v_old, 100) loop
      v_cnt := v_cnt + 1;
      if (not r.resolved) and r.unresolved_reason = 'committed design predates quantity capture' then
        n_pass:=n_pass+1; raise notice '    PASS legacy snapshot reported once, unresolved, no error';
      else n_fail:=n_fail+1; raise notice '    FAIL legacy handling'; end if;
    end loop;
    if v_cnt <> 1 then n_fail:=n_fail+1; raise notice '    FAIL expected exactly 1 legacy row, got %', v_cnt; end if;
  end;

  raise notice '--- preview writes nothing ---';
  declare v_ob int; begin
    select count(*) into v_ob from public.obligation;
    perform public.kitchen_requirement_preview(v_snap, 100);
    if (select count(*) from public.obligation) = v_ob then n_pass:=n_pass+1;
      raise notice '    PASS preview created zero obligations';
    else n_fail:=n_fail+1; raise notice '    FAIL preview wrote an obligation'; end if;
  end;

  raise notice 'v311 FIXTURE: % PASS / % FAIL', n_pass, n_fail;
  if n_fail > 0 then raise exception 'v311 FIXTURE FAILED: % checks', n_fail; end if;
  raise exception 'V311_FIXTURE_ROLLBACK';
exception when others then
  if sqlerrm = 'V311_FIXTURE_ROLLBACK' then raise notice 'rolled back cleanly — zero residue';
  else raise; end if;
end $$;
do $$
declare
  v_t uuid; v_admin uuid; v_req uuid; v_g uuid; r jsonb;
  n_pass int := 0; n_fail int := 0; v_other_t uuid;
begin
  select tu.tenant_id, tu.user_id into v_t, v_admin
    from public.tenant_users tu where tu.active order by tu.tenant_id limit 1;
  select id into v_other_t from public.tenants where id <> v_t limit 1;
  perform set_config('app.user_id', v_admin::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  insert into public.obligation
      (tenant_id, origin_ref, origin_kind, kind, department, required_outcome,
       resource_role, dependencies, natural_key, scope, anchors, origin_revision)
    values (v_t, gen_random_uuid(), 'knowledge', 'culinary_prepare', 'culinary',
            'Produce Sliders', 'sliders', '[]'::jsonb,
            'v311-auth-'||substr(gen_random_uuid()::text,1,8), 'standing', '{}'::jsonb, gen_random_uuid())
    returning id into v_req;
  perform public.record_kitchen_recommendation(v_req, 100, 'per_person', 1, 100, true, null, '100 guests × 1 per guest = 100');

  -- ══ an admin with NO grant is refused — the whole point ═══════════════════
  begin
    perform public.adjust_kitchen_quantity(v_req, 110, 'reserve');
    n_fail:=n_fail+1; raise notice 'A1 FAIL admin adjusted without a grant';
  exception when others then
    if sqlerrm like 'KITCHEN_QUANTITY_NOT_PERMITTED%' then n_pass:=n_pass+1;
      raise notice 'A1 PASS admin with no grant refused — role is not authority';
    else n_fail:=n_fail+1; raise notice 'A1 FAIL %', sqlerrm; end if;
  end;
  begin
    perform public.approve_kitchen_quantity(v_req, 'sign off');
    n_fail:=n_fail+1; raise notice 'A2 FAIL admin approved without a grant';
  exception when others then
    if sqlerrm like 'KITCHEN_QUANTITY_NOT_PERMITTED%' then n_pass:=n_pass+1;
      raise notice 'A2 PASS admin with no grant cannot approve';
    else n_fail:=n_fail+1; raise notice 'A2 FAIL %', sqlerrm; end if;
  end;

  -- ══ explicit adjust grant authorizes adjustment only ══════════════════════
  insert into public.authority_grant (tenant_id, record_kind, actor, act_class, granted_by, reason)
    values (v_t, 'grant', v_admin, 'kitchen.quantity.adjust', 'test', 'proof') returning id into v_g;
  r := public.adjust_kitchen_quantity(v_req, 110, '10% service reserve');
  if (r->>'created')::boolean then n_pass:=n_pass+1; raise notice 'A3 PASS explicit adjust grant authorizes adjustment';
  else n_fail:=n_fail+1; raise notice 'A3 FAIL'; end if;

  begin
    perform public.approve_kitchen_quantity(v_req, 'sign off');
    n_fail:=n_fail+1; raise notice 'A4 FAIL adjust grant allowed approval';
  exception when others then
    if sqlerrm like 'KITCHEN_QUANTITY_NOT_PERMITTED%' then n_pass:=n_pass+1;
      raise notice 'A4 PASS adjust grant alone cannot approve — act classes are distinct';
    else n_fail:=n_fail+1; raise notice 'A4 FAIL %', sqlerrm; end if;
  end;

  -- ══ explicit approve grant authorizes approval ════════════════════════════
  insert into public.authority_grant (tenant_id, record_kind, actor, act_class, granted_by, reason)
    values (v_t, 'grant', v_admin, 'kitchen.quantity.approve', 'test', 'proof');
  r := public.approve_kitchen_quantity(v_req, 'kitchen lead signed off');
  if (r->>'created')::boolean then n_pass:=n_pass+1; raise notice 'A5 PASS explicit approve grant authorizes approval';
  else n_fail:=n_fail+1; raise notice 'A5 FAIL'; end if;

  -- ══ future-effective grant does not authorize early ══════════════════════
  if public.has_authority(v_admin, 'kitchen.future.act', null, now()) = false then
    insert into public.authority_grant (tenant_id, record_kind, actor, act_class, effective_from, granted_by)
      values (v_t, 'grant', v_admin, 'kitchen.future.act', now() + interval '1 day', 'test');
    if public.has_authority(v_admin, 'kitchen.future.act', null, now()) = false
       and public.has_authority(v_admin, 'kitchen.future.act', null, now() + interval '2 days') = true then
      n_pass:=n_pass+1; raise notice 'A6 PASS future-effective grant inert today, active after its instant';
    else n_fail:=n_fail+1; raise notice 'A6 FAIL'; end if;
  else n_fail:=n_fail+1; raise notice 'A6 FAIL precondition'; end if;

  -- ══ revocation is prospective; history stays valid ═══════════════════════
  insert into public.authority_grant (tenant_id, record_kind, actor, act_class, revokes_ref, granted_by, reason)
    values (v_t, 'revocation', v_admin, 'kitchen.quantity.adjust', v_g, 'test', 'no longer adjusts');
  if public.can_adjust_kitchen_quantity(v_req) = false then
    n_pass:=n_pass+1; raise notice 'A7 PASS revoked grant no longer authorizes';
  else n_fail:=n_fail+1; raise notice 'A7 FAIL'; end if;

  if exists (select 1 from public.requirement_quantity_decision
              where requirement_ref = v_req and decision_kind = 'approved') then
    n_pass:=n_pass+1; raise notice 'A8 PASS approval performed under prior authority remains historical evidence';
  else n_fail:=n_fail+1; raise notice 'A8 FAIL'; end if;

  -- ══ cross-tenant grant does not authorize ════════════════════════════════
  if v_other_t is not null then
    insert into public.authority_grant (tenant_id, record_kind, actor, act_class, granted_by)
      values (v_other_t, 'grant', v_admin, 'kitchen.cross.act', 'test');
    if public.has_authority(v_admin, 'kitchen.cross.act', null, now()) = false then
      n_pass:=n_pass+1; raise notice 'A9 PASS grant in another tenant does not authorize here';
    else n_fail:=n_fail+1; raise notice 'A9 FAIL cross-tenant grant authorized'; end if;
  end if;

  -- ══ absent actor is refused ══════════════════════════════════════════════
  perform set_config('app.user_id', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  if public.can_approve_kitchen_quantity(v_req) = false then
    n_pass:=n_pass+1; raise notice 'A10 PASS absent actor refused';
  else n_fail:=n_fail+1; raise notice 'A10 FAIL'; end if;
  perform set_config('app.user_id', v_admin::text, true);

  -- ══ authority records are append-only ════════════════════════════════════
  begin
    update public.authority_grant set act_class = 'x' where id = v_g;
    n_fail:=n_fail+1; raise notice 'A11 FAIL grant was editable';
  exception when others then
    if sqlerrm like 'AUTHORITY_GRANT_EDIT_REFUSED%' then n_pass:=n_pass+1;
      raise notice 'A11 PASS authority records are append-only';
    else n_fail:=n_fail+1; raise notice 'A11 FAIL %', sqlerrm; end if;
  end;

  -- ══ no grant is manufactured from tenant_users.role ══════════════════════
  if (select count(*) from public.authority_grant
        where tenant_id = v_t and record_kind = 'grant' and granted_by <> 'test') = 0 then
    n_pass:=n_pass+1; raise notice 'A12 PASS no grant was manufactured from a role';
  else n_fail:=n_fail+1; raise notice 'A12 FAIL'; end if;

  raise notice 'v311 AUTHORITY: % PASS / % FAIL', n_pass, n_fail;
  if n_fail > 0 then raise exception 'v311 AUTHORITY PROOF FAILED: %', n_fail; end if;
  raise exception 'V311_AUTH_ROLLBACK';
exception when others then
  if sqlerrm = 'V311_AUTH_ROLLBACK' then raise notice 'rolled back cleanly — zero residue';
  else raise; end if;
end $$;
do $$
declare
  v_tenant uuid; v_user uuid; v_req uuid; r jsonb; s jsonb;
  n_pass int := 0; n_fail int := 0; v_n int; v_txt text;
begin
  select tu.tenant_id, tu.user_id into v_tenant, v_user
    from public.tenant_users tu where tu.active order by tu.tenant_id limit 1;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);

  insert into public.obligation
      (tenant_id, origin_ref, origin_kind, kind, department, required_outcome,
       resource_role, dependencies, natural_key, scope, anchors, origin_revision)
    values (v_tenant, gen_random_uuid(), 'knowledge', 'culinary_prepare', 'culinary',
            'Produce Sliders for the committed menu', 'sliders', '[]'::jsonb,
            'v311-qproof-'||substr(gen_random_uuid()::text,1,8), 'standing', '{}'::jsonb, gen_random_uuid())
    returning id into v_req;

  insert into public.authority_grant (tenant_id, record_kind, actor, act_class, granted_by)
    values (v_tenant,'grant',v_user,'kitchen.quantity.adjust','proof'),
           (v_tenant,'grant',v_user,'kitchen.quantity.approve','proof');

  -- ══ C · recommendation recorded from explicit committed semantics ═════════
  r := public.record_kitchen_recommendation(v_req, 100, 'per_person', 1, 100, true, null,
        '100 guests × 1 per guest = 100');
  if (r->>'created')::boolean then n_pass:=n_pass+1;
    raise notice 'C PASS recommendation recorded: %', r->>'decision_id';
  else n_fail:=n_fail+1; raise notice 'C FAIL'; end if;

  -- ══ E · recommendation alone is NOT approved / not fulfillable ════════════
  s := public.kitchen_quantity_state(v_req);
  if (s->>'has_approved_quantity')::boolean = false and s->>'fulfillable_quantity' is null
     and (s->>'recommended_quantity')::numeric = 100 then
    n_pass:=n_pass+1; raise notice 'E PASS recommended 100 but fulfillable_quantity is null — recommendation is not approval';
  else n_fail:=n_fail+1; raise notice 'E FAIL %', s; end if;

  -- ══ I · replaying the SAME recommendation inputs is idempotent ════════════
  r := public.record_kitchen_recommendation(v_req, 100, 'per_person', 1, 100, true, null,
        '100 guests × 1 per guest = 100');
  select count(*) into v_n from public.requirement_quantity_decision
    where requirement_ref = v_req and decision_kind = 'recommended';
  if (r->>'created')::boolean = false and v_n = 1 then
    n_pass:=n_pass+1; raise notice 'I PASS replay created no duplicate recommendation';
  else n_fail:=n_fail+1; raise notice 'I FAIL created=% count=%', r->>'created', v_n; end if;

  -- ══ F · adjustment preserves the recommendation and records actor/reason ══
  r := public.adjust_kitchen_quantity(v_req, 110, '10% service reserve');
  select count(*) into v_n from public.requirement_quantity_decision
    where requirement_ref = v_req and decision_kind = 'recommended' and quantity = 100;
  s := public.kitchen_quantity_state(v_req);
  if (r->>'created')::boolean and v_n = 1 and (s->>'has_approved_quantity')::boolean = false then
    n_pass:=n_pass+1; raise notice 'F PASS adjusted to 110, recommendation 100 intact, still not approved';
  else n_fail:=n_fail+1; raise notice 'F FAIL'; end if;

  -- ══ G · approval produces the authoritative fulfillable quantity ══════════
  r := public.approve_kitchen_quantity(v_req, 'kitchen lead signed off for service');
  s := public.kitchen_quantity_state(v_req);
  if (s->>'has_approved_quantity')::boolean and (s->>'approved_quantity')::numeric = 110
     and (s->>'fulfillable_quantity')::numeric = 110 then
    n_pass:=n_pass+1; raise notice 'G PASS approved 110 — now fulfillable, attributed to %', s->>'approved_by';
  else n_fail:=n_fail+1; raise notice 'G FAIL %', s; end if;

  -- ══ I2 · replaying the same approval act is idempotent ════════════════════
  r := public.approve_kitchen_quantity(v_req, 'kitchen lead signed off for service');
  select count(*) into v_n from public.requirement_quantity_decision
    where requirement_ref = v_req and decision_kind = 'approved';
  if (r->>'created')::boolean = false and v_n = 1 then
    n_pass:=n_pass+1; raise notice 'I2 PASS replayed approval created no duplicate';
  else n_fail:=n_fail+1; raise notice 'I2 FAIL count=%', v_n; end if;

  -- ══ J · a new guest count recommends again, never auto-approves ═══════════
  r := public.record_kitchen_recommendation(v_req, 120, 'per_person', 1, 120, true, null,
        '120 guests × 1 per guest = 120');
  s := public.kitchen_quantity_state(v_req);
  if (r->>'created')::boolean
     and (s->>'recommended_quantity')::numeric = 120
     and (s->>'approved_quantity')::numeric = 110
     and (s->>'review_required')::boolean = true then
    n_pass:=n_pass+1;
    raise notice 'J PASS guest count 100→120 recommends 120, approval still 110, review_required — no auto-approval';
  else n_fail:=n_fail+1; raise notice 'J FAIL %', s; end if;

  -- ══ history · the earlier recommendation is still inspectable ═════════════
  select count(*) into v_n from public.requirement_quantity_decision where requirement_ref = v_req;
  if v_n = 4 then n_pass:=n_pass+1;
    raise notice 'H PASS full lineage retained: 4 decisions (rec 100, adj 110, appr 110, rec 120)';
  else n_fail:=n_fail+1; raise notice 'H FAIL lineage count %', v_n; end if;

  -- ══ append-only · an edit is refused ══════════════════════════════════════
  begin
    update public.requirement_quantity_decision set quantity = 999 where requirement_ref = v_req;
    n_fail:=n_fail+1; raise notice 'APPEND FAIL update was allowed';
  exception when others then
    if sqlerrm like 'QUANTITY_DECISION_EDIT_REFUSED%' then
      n_pass:=n_pass+1; raise notice 'APPEND PASS edit refused: decisions are append-only';
    else n_fail:=n_fail+1; raise notice 'APPEND FAIL wrong error %', sqlerrm; end if;
  end;

  -- ══ unresolved recommendation may not carry a quantity ═══════════════════
  begin
    insert into public.requirement_quantity_decision
      (tenant_id, requirement_ref, decision_kind, quantity, resolved, decided_by, natural_key)
      values (v_tenant, v_req, 'recommended', 50, false, 'test', 'bad-'||gen_random_uuid()::text);
    n_fail:=n_fail+1; raise notice 'INVARIANT FAIL unresolved row carried a quantity';
  exception when check_violation then
    n_pass:=n_pass+1; raise notice 'INVARIANT PASS unresolved decision cannot carry a quantity';
  end;

  -- ══ approval cannot be unresolved ════════════════════════════════════════
  begin
    insert into public.requirement_quantity_decision
      (tenant_id, requirement_ref, decision_kind, quantity, resolved, decided_by, reason, natural_key)
      values (v_tenant, v_req, 'approved', null, false, 'test', 'x', 'bad2-'||gen_random_uuid()::text);
    n_fail:=n_fail+1; raise notice 'INVARIANT2 FAIL approval was allowed to be unresolved';
  exception when check_violation then
    n_pass:=n_pass+1; raise notice 'INVARIANT2 PASS only a recommendation may be unresolved';
  end;

  raise notice 'v311 QUANTITY STAGE: % PASS / % FAIL', n_pass, n_fail;
  if n_fail > 0 then raise exception 'v311 QUANTITY PROOF FAILED: %', n_fail; end if;
  raise exception 'V311_Q_ROLLBACK';
exception when others then
  if sqlerrm = 'V311_Q_ROLLBACK' then raise notice 'rolled back cleanly — zero residue';
  else raise; end if;
end $$;
do $$
declare
  v_t uuid; v_u uuid; v_req uuid; r jsonb; s jsonb;
  n_pass int := 0; n_fail int := 0; v_n int; v_rev uuid; v_rev2 uuid; v_probe_line uuid;
  v_o public.obligation%rowtype; v_a jsonb; v_txt text;
begin
  select tu.tenant_id, tu.user_id into v_t, v_u
    from public.tenant_users tu where tu.active order by tu.tenant_id limit 1;
  perform set_config('app.user_id', v_u::text, true);
  perform set_config('request.jwt.claim.sub', v_u::text, true);

  insert into public.authority_grant (tenant_id, record_kind, actor, act_class, granted_by)
    values (v_t,'grant',v_u,'kitchen.quantity.adjust','proof'),
           (v_t,'grant',v_u,'kitchen.quantity.approve','proof');

  insert into public.obligation
      (tenant_id, origin_ref, origin_kind, kind, department, required_outcome,
       resource_role, dependencies, natural_key, scope, anchors, origin_revision)
    values (v_t, gen_random_uuid(), 'knowledge', 'culinary_item_prepare', 'culinary',
            'Produce Sliders for Grill Station', 'sliders', '[]'::jsonb,
            'v311-lin-'||substr(gen_random_uuid()::text,1,8), 'standing',
            '[]'::jsonb, gen_random_uuid())
    returning id into v_req;

  perform public.record_kitchen_recommendation(v_req, 100, 'per_person', 1, 100, true, null,
            '100 guests × 1 per guest = 100');
  perform public.adjust_kitchen_quantity(v_req, 110, '10% service reserve');

  -- ══ L1 · approval atomically creates the superseding Requirement revision ══
  r := public.approve_kitchen_quantity(v_req, 'kitchen lead signed off');
  v_rev := (r->>'requirement_revision')::uuid;
  if v_rev is not null and v_rev <> v_req then
    n_pass:=n_pass+1; raise notice 'L1 PASS approval produced Requirement revision %', v_rev;
  else n_fail:=n_fail+1; raise notice 'L1 FAIL no revision: %', r; end if;

  -- ══ L2 · the revision cites the prior Requirement ═════════════════════════
  select * into v_o from public.obligation where id = v_rev;
  if v_o.supersedes_ref = v_req then
    n_pass:=n_pass+1; raise notice 'L2 PASS revision supersedes_ref points at the prior Requirement';
  else n_fail:=n_fail+1; raise notice 'L2 FAIL supersedes_ref=%', v_o.supersedes_ref; end if;

  -- ══ L3 · the prior Requirement remains, unedited, and reads as superseded ══
  if exists (select 1 from public.obligation where id = v_req)
     and public.responsibility_state(v_req) = 'superseded' then
    n_pass:=n_pass+1; raise notice 'L3 PASS prior Requirement remains and reads as superseded';
  else n_fail:=n_fail+1; raise notice 'L3 FAIL state=%', public.responsibility_state(v_req); end if;

  begin
    update public.obligation set required_outcome = 'x' where id = v_req;
    n_fail:=n_fail+1; raise notice 'L4 FAIL prior Requirement was editable';
  exception when others then
    if sqlerrm like 'RESP_EDIT_REFUSED%' then
      n_pass:=n_pass+1; raise notice 'L4 PASS prior Requirement is immutable';
    else n_fail:=n_fail+1; raise notice 'L4 FAIL wrong error %', sqlerrm; end if;
  end;

  -- ══ L5 · the revision states the approved quantity ════════════════════════
  if v_o.required_outcome = 'Produce Sliders for Grill Station — approved quantity 110' then
    n_pass:=n_pass+1; raise notice 'L5 PASS revision reads: %', v_o.required_outcome;
  else n_fail:=n_fail+1; raise notice 'L5 FAIL outcome=%', v_o.required_outcome; end if;

  -- ══ L6 · approval provenance / design / guest-count basis preserved ═══════
  select a into v_a from jsonb_array_elements(v_o.anchors) a
    where a->>'truth' = 'quantity_approval' limit 1;
  if v_a is not null
     and (v_a->>'quantity')::numeric = 110
     and (v_a->>'design_quantity')::numeric = 1
     and (v_a->>'guest_count')::numeric = 100
     and v_a->>'quantity_basis' = 'per_person'
     and v_a->>'approved_by' = v_u::text
     and (v_a->>'ref')::uuid = (r->>'decision_id')::uuid then
    n_pass:=n_pass+1;
    raise notice 'L6 PASS provenance preserved on the Requirement: 110 from 1 per guest × 100 guests, approved by %', v_a->>'approved_by';
  else n_fail:=n_fail+1; raise notice 'L6 FAIL anchor=%', v_a; end if;

  -- ══ L7 · decision history survives supersession — readable from either end ═
  s := public.kitchen_quantity_state(v_rev);
  if (s->>'recommended_quantity')::numeric = 100
     and (s->>'adjusted_quantity')::numeric = 110
     and (s->>'approved_quantity')::numeric = 110
     and (s->>'requirement_line')::uuid = v_req
     and (s->>'requirement_revision')::uuid = v_rev then
    n_pass:=n_pass+1;
    raise notice 'L7 PASS full history readable from the NEW revision: rec 100 → adj 110 → appr 110';
  else n_fail:=n_fail+1; raise notice 'L7 FAIL %', s; end if;

  -- requirement_ref legitimately echoes which revision was asked about; every
  -- other fact about the line must be identical from either end.
  if (public.kitchen_quantity_state(v_req) - 'requirement_ref') = (s - 'requirement_ref') then
    n_pass:=n_pass+1; raise notice 'L8 PASS the old revision answers identically — the line is one thing';
  else n_fail:=n_fail+1; raise notice 'L8 FAIL divergent answers across revisions'; end if;

  -- ══ L9 · lineage is ordered and names its head ════════════════════════════
  select count(*) into v_n from public.requirement_lineage(v_req);
  select string_agg(l.requirement_ref::text || case when l.is_head then '*' else '' end, '>' order by l.revision_no)
    into v_txt from public.requirement_lineage(v_req) l;
  if v_n = 2 and v_txt = v_req::text || '>' || v_rev::text || '*' then
    n_pass:=n_pass+1; raise notice 'L9 PASS lineage root→head with head named: %', v_txt;
  else n_fail:=n_fail+1; raise notice 'L9 FAIL n=% chain=%', v_n, v_txt; end if;

  -- ══ L10 · replay of the same approval creates nothing ═════════════════════
  r := public.approve_kitchen_quantity(v_req, 'kitchen lead signed off');
  select count(*) into v_n from public.obligation
    where tenant_id = v_t and (id = v_req or supersedes_ref is not null and supersedes_ref = v_req);
  if (r->>'created')::boolean = false
     and (r->>'requirement_revision')::uuid = v_rev
     and v_n = 2
     and (select count(*) from public.requirement_quantity_decision
           where requirement_ref = v_req and decision_kind = 'approved') = 1 then
    n_pass:=n_pass+1; raise notice 'L11 PASS replay is idempotent — same revision, no duplicates';
  else n_fail:=n_fail+1; raise notice 'L11 FAIL n=% r=%', v_n, r; end if;

  -- ══ L12 · a new guest count recommends again; approval stays historical ═══
  perform public.record_kitchen_recommendation(v_req, 120, 'per_person', 1, 120, true, null,
            '120 guests × 1 per guest = 120');
  s := public.kitchen_quantity_state(v_req);
  if (s->>'recommended_quantity')::numeric = 120
     and (s->>'approved_quantity')::numeric = 110
     and (s->>'review_required')::boolean
     and (s->>'requirement_revision')::uuid = v_rev then
    n_pass:=n_pass+1;
    raise notice 'L12 PASS guests 100→120 recommends 120; approved 110 stands, review required, no new revision';
  else n_fail:=n_fail+1; raise notice 'L12 FAIL %', s; end if;

  -- ══ L13 · approving again supersedes the revision, not the root ═══════════
  r := public.approve_kitchen_quantity(v_req, 'revised for the higher guest count');
  v_rev2 := (r->>'requirement_revision')::uuid;
  select * into v_o from public.obligation where id = v_rev2;
  if v_o.supersedes_ref = v_rev
     and v_o.required_outcome = 'Produce Sliders for Grill Station — approved quantity 120'
     and (select count(*) from public.requirement_lineage(v_req)) = 3 then
    n_pass:=n_pass+1;
    raise notice 'L13 PASS second approval supersedes the revision; outcome reads 120; three revisions in the line';
  else n_fail:=n_fail+1; raise notice 'L13 FAIL sup=% out=%', v_o.supersedes_ref, v_o.required_outcome; end if;

  -- ══ L14 · ATOMICITY · if the revision cannot be created, nothing is ═══════
  -- A temporary guard forces the Requirement revision to fail after the
  -- approval decision has been inserted. Nothing may survive that failure.
  -- The probe line is created BEFORE the guard exists, so only the revision
  -- insert trips it.
  insert into public.obligation
      (tenant_id, origin_ref, origin_kind, kind, department, required_outcome,
       resource_role, dependencies, natural_key, scope, anchors, origin_revision)
    values (v_t, gen_random_uuid(), 'knowledge', 'culinary_item_prepare', 'culinary',
            'Produce ATOMICITY PROBE Item', 'probe', '[]'::jsonb,
            'v311-probe-'||substr(gen_random_uuid()::text,1,8), 'standing',
            '[]'::jsonb, gen_random_uuid())
    returning id into v_probe_line;
  perform public.record_kitchen_recommendation(v_probe_line, 40, 'flat', 40, null, true, null, 'flat 40');

  create or replace function public.v311_atomicity_guard() returns trigger
  language plpgsql as $g$
  begin
    if new.required_outcome like '%ATOMICITY PROBE%' then
      raise exception 'V311_INDUCED_FAILURE';
    end if;
    return new;
  end $g$;
  create trigger v311_atomicity_probe before insert on public.obligation
    for each row execute function public.v311_atomicity_guard();

  declare
    v_probe uuid; v_dec_after int; v_obl_before int; v_obl_after int; v_err text;
  begin
    select count(*) into v_obl_before from public.obligation where tenant_id = v_t;

    begin
      perform public.approve_kitchen_quantity(v_probe_line, 'probe approval');
      v_err := 'no failure raised';
    exception when others then
      v_err := sqlerrm;
    end;

    select count(*) into v_dec_after from public.requirement_quantity_decision
      where requirement_ref = v_probe_line and decision_kind = 'approved';
    select count(*) into v_obl_after from public.obligation where tenant_id = v_t;

    if v_err like '%V311_INDUCED_FAILURE%' and v_dec_after = 0 and v_obl_after = v_obl_before then
      n_pass:=n_pass+1;
      raise notice 'L14 PASS the revision failed, so the approval decision did not survive either — no half-approved state';
    else
      n_fail:=n_fail+1;
      raise notice 'L14 FAIL err=% decisions=% obligations %→%', v_err, v_dec_after, v_obl_before, v_obl_after;
    end if;
  end;

  drop trigger if exists v311_atomicity_probe on public.obligation;
  drop function if exists public.v311_atomicity_guard();

  -- and with the guard gone the same act completes, proving the failure was the
  -- guard rather than a broken approval path
  r := public.approve_kitchen_quantity(v_probe_line, 'probe approval');
  if (r->>'requirement_revision') is not null
     and (select count(*) from public.requirement_quantity_decision
           where requirement_ref = v_probe_line and decision_kind = 'approved') = 1 then
    n_pass:=n_pass+1; raise notice 'L15 PASS once the induced failure is removed the same approval succeeds';
  else n_fail:=n_fail+1; raise notice 'L15 FAIL %', r; end if;

  raise notice 'v311 LINEAGE: % PASS / % FAIL', n_pass, n_fail;
  if n_fail > 0 then raise exception 'v311 LINEAGE PROOF FAILED: %', n_fail; end if;
  raise exception 'V311_LIN_ROLLBACK';
exception when others then
  if sqlerrm = 'V311_LIN_ROLLBACK' then raise notice 'rolled back cleanly — zero residue';
  else raise; end if;
end $$;
do $$
declare
  v_t uuid; v_u uuid; v_book uuid; v_occ uuid; v_prop uuid; v_ver uuid;
  v_snap uuid; v_ev uuid; v_sfx text := substr(gen_random_uuid()::text,1,8);
  v_now timestamptz := now(); v_model jsonb;
  cA uuid := gen_random_uuid(); cB uuid := gen_random_uuid();
  iSl uuid := gen_random_uuid(); iCo uuid := gen_random_uuid();
  iNa uuid := gen_random_uuid(); iHi uuid := gen_random_uuid(); iBr uuid := gen_random_uuid();
  n_pass int := 0; n_fail int := 0; v_n int; v_err text;
  p jsonb; ln jsonb; s jsonb; c jsonb; r jsonb;
  v_sl uuid; v_na uuid; v_rev uuid; v_att uuid; v_gen int;
begin
  select tu.tenant_id, tu.user_id into v_t, v_u
    from public.tenant_users tu where tu.active order by tu.tenant_id limit 1;
  perform set_config('app.user_id', v_u::text, true);
  perform set_config('request.jwt.claim.sub', v_u::text, true);

  -- ── fixture · a committed design that DOES state its quantity rule ────────
  v_model := jsonb_build_object('guestCount','100','components', jsonb_build_array(
    jsonb_build_object('componentId', cA, 'title','Grill Station','station',true,
      'items_committed', jsonb_build_array(
        jsonb_build_object('item_id',iSl,'name','Sliders','quantity',1,'quantity_basis','per_person','selected',true),
        jsonb_build_object('item_id',iCo,'name','Coleslaw','quantity',20,'quantity_basis','flat','selected',true),
        jsonb_build_object('item_id',iNa,'name','Napkins','quantity',null,'quantity_basis','per_person','selected',true),
        jsonb_build_object('item_id',iHi,'name','Withdrawn','quantity',5,'quantity_basis','flat','selected',false))),
    jsonb_build_object('componentId', cB, 'title','Dessert Table','station',false,
      'items_committed', jsonb_build_array(
        jsonb_build_object('item_id',iBr,'name','Brownies','quantity',2,'quantity_basis','per_person','selected',true)))));

  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_t, 'Rosen', 'OB311-'||v_sfx, 'active') returning id into v_book;
  v_occ := (public.open_occurrence(v_book, null, null)->>'occurrence_id')::uuid;
  insert into public.proposals (tenant_id, booking_id, title, status)
    values (v_t, v_book, 'P311', 'draft') returning id into v_prop;
  insert into public.proposal_versions (tenant_id, proposal_id, version, status)
    values (v_t, v_prop, 1, 'sent') returning id into v_ver;
  insert into public.offer_snapshots (tenant_id, version_id, fingerprint, model,
      artifact_bytes, artifact_hash, artifact_meta, assets)
    values (v_t, v_ver, 'fp311-'||v_sfx, v_model, '\x00'::bytea, 'h', '{}'::jsonb, '{}'::jsonb)
    returning id into v_snap;
  insert into public.offer_acceptances (tenant_id, snapshot_id, fingerprint, booking_id,
      principal, authority_basis, evidence_basis, channel, recorded_moment)
    values (v_t, v_snap, 'fp311-'||v_sfx, v_book, '{}'::jsonb, 'b', 'b', 'portal', v_now);

  -- ══ P1 · PREVIEW before release · writes nothing, and says so ═════════════
  select count(*) into v_n from public.obligation where tenant_id = v_t and kind = 'culinary_item_prepare';
  p := public.kitchen_requirement_preview(v_snap, 100);
  if (p->>'operative')::boolean = false
     and jsonb_array_length(p->'lines') = 4
     and (select count(*) from public.obligation where tenant_id = v_t and kind='culinary_item_prepare') = v_n then
    n_pass:=n_pass+1; raise notice 'P1 PASS preview describes 4 lines, is marked non-operative, and wrote nothing';
  else n_fail:=n_fail+1; raise notice 'P1 FAIL %', p; end if;

  -- ══ committed guest count, then release ═══════════════════════════════════
  begin
    perform public.commit_attendance(v_occ, 100, 'contracted', v_now, 'contracted headcount');
  exception when others then
    insert into public.attendance_commitment (tenant_id, occurrence_id, head_count, basis,
        effective_moment, recorded_by)
      values (v_t, v_occ, 100, 'contracted', v_now, 'fixture');
  end;

  v_ev := (public.release_occurrence(v_occ, 'op', 'signoff', 'clearance', null)->>'event_id')::uuid;
  if v_ev is null then raise exception 'fixture: release produced no event'; end if;

  -- ══ E1 · release enacted one Kitchen Requirement per committed line ═══════
  select count(*) into v_n from public.obligation
    where tenant_id = v_t and event_ref = v_ev and kind = 'culinary_item_prepare';
  if v_n = 4 then n_pass:=n_pass+1;
    raise notice 'E1 PASS release enacted 4 Kitchen Requirements — the withdrawn line was not enacted';
  else n_fail:=n_fail+1; raise notice 'E1 FAIL count=%', v_n; end if;

  select o.id into v_sl from public.obligation o
    where o.tenant_id = v_t and o.event_ref = v_ev and o.resource_role = 'Sliders';
  select o.id into v_na from public.obligation o
    where o.tenant_id = v_t and o.event_ref = v_ev and o.resource_role = 'Napkins';

  -- ══ E2 · each carries a recommendation and NO approval ════════════════════
  s := public.kitchen_quantity_state(v_sl);
  if (s->>'recommended_quantity')::numeric = 100
     and (s->>'has_approved_quantity')::boolean = false
     and s->>'fulfillable_quantity' is null
     and s->>'derivation' = '100 guests × 1 per guest = 100' then
    n_pass:=n_pass+1; raise notice 'E2 PASS Sliders recommended 100 (%), unapproved, not yet fulfillable', s->>'derivation';
  else n_fail:=n_fail+1; raise notice 'E2 FAIL %', s; end if;

  if (select count(*) from public.requirement_quantity_decision d
       join public.obligation o on o.id = d.requirement_ref
      where o.event_ref = v_ev and d.decision_kind in ('adjusted','approved')) = 0 then
    n_pass:=n_pass+1; raise notice 'E3 PASS release recorded no adjustment and no approval anywhere';
  else n_fail:=n_fail+1; raise notice 'E3 FAIL release created a human decision'; end if;

  -- ══ E4 · an unresolvable line still becomes a Requirement ═════════════════
  s := public.kitchen_quantity_state(v_na);
  if v_na is not null
     and (s->>'recommendation_resolved')::boolean = false
     and s->>'recommended_quantity' is null
     and s->>'unresolved_reason' = 'committed design states basis per_person but no quantity' then
    n_pass:=n_pass+1; raise notice 'E4 PASS Napkins is a real Requirement with an explicitly unresolved quantity';
  else n_fail:=n_fail+1; raise notice 'E4 FAIL %', s; end if;

  -- ══ E5 · flat does not scale with guests; per_person does ═════════════════
  if (public.kitchen_quantity_state(
        (select id from public.obligation where event_ref=v_ev and resource_role='Coleslaw'))
      ->>'recommended_quantity')::numeric = 20
     and (public.kitchen_quantity_state(
        (select id from public.obligation where event_ref=v_ev and resource_role='Brownies'))
      ->>'recommended_quantity')::numeric = 200 then
    n_pass:=n_pass+1; raise notice 'E5 PASS flat Coleslaw stays 20; per_person Brownies is 2 × 100 = 200';
  else n_fail:=n_fail+1; raise notice 'E5 FAIL'; end if;

  -- ══ E6 · PREVIEW and ENACTED agree for identical inputs ═══════════════════
  select l into ln from jsonb_array_elements(p->'lines') l where l->>'item' = 'Sliders';
  c := public.kitchen_line_current(v_sl, now());
  if (ln->>'required_quantity')::numeric = (c->>'recommended_quantity')::numeric
     and ln->>'quantity_basis' = c->>'quantity_basis'
     and (ln->>'resolved')::boolean = (c->>'resolved')::boolean then
    n_pass:=n_pass+1; raise notice 'E6 PASS preview and enacted derive identically for identical inputs — one derivation, two stages';
  else n_fail:=n_fail+1; raise notice 'E6 FAIL preview=% enacted=%', ln, c; end if;

  -- ══ E7 · regeneration is idempotent ═══════════════════════════════════════
  select count(*) into v_n from public.requirement_quantity_decision d
    join public.obligation o on o.id = d.requirement_ref where o.event_ref = v_ev;
  v_gen := public.generate_obligations(v_ev);
  if (select count(*) from public.obligation
       where tenant_id=v_t and event_ref=v_ev and kind='culinary_item_prepare') = 4
     and (select count(*) from public.requirement_quantity_decision d
           join public.obligation o on o.id = d.requirement_ref where o.event_ref = v_ev) = v_n then
    n_pass:=n_pass+1; raise notice 'E7 PASS regeneration created no duplicate Requirement and no duplicate recommendation';
  else n_fail:=n_fail+1; raise notice 'E7 FAIL'; end if;

  -- ══ E8 · approval, then regeneration must NOT void the approved revision ══
  insert into public.authority_grant (tenant_id, record_kind, actor, act_class, granted_by)
    values (v_t,'grant',v_u,'kitchen.quantity.approve','proof'),
           (v_t,'grant',v_u,'kitchen.quantity.adjust','proof');
  r := public.approve_kitchen_quantity(v_sl, 'kitchen lead signed off for service');
  v_rev := (r->>'requirement_revision')::uuid;
  v_gen := public.generate_obligations(v_ev);
  if public.responsibility_state(v_rev) <> 'void'
     and not exists (select 1 from public.execution_evidence e
                      where e.obligation_ref = v_rev and e.kind = 'invalidated')
     and (public.kitchen_quantity_state(v_sl)->>'fulfillable_quantity')::numeric = 100 then
    n_pass:=n_pass+1;
    raise notice 'E8 PASS regeneration left the approved Requirement revision authoritative (state %)',
      public.responsibility_state(v_rev);
  else n_fail:=n_fail+1; raise notice 'E8 FAIL revision was voided by regeneration'; end if;

  -- ══ E9 · a guest-count change recommends again and nothing more ═══════════
  select id into v_att from public.attendance_commitment
    where occurrence_id = v_occ and tenant_id = v_t order by seq desc limit 1;
  begin
    perform public.correct_attendance(v_att, 130, 'guaranteed', 'final guarantee received');
    v_err := 'ceremony';
  exception when others then
    v_err := sqlerrm;
    insert into public.attendance_commitment (tenant_id, occurrence_id, head_count, basis,
        effective_moment, replaces_id, reason, recorded_by)
      values (v_t, v_occ, 130, 'guaranteed', v_now, v_att, 'final guarantee received', 'fixture');
    perform public.refresh_kitchen_recommendations(v_occ);
  end;
  raise notice 'E9 note: attendance path = %', v_err;

  s := public.kitchen_quantity_state(v_sl);
  c := public.kitchen_line_current(v_sl, now());
  if (c->>'recommended_quantity')::numeric = 130
     and (s->>'recommended_quantity')::numeric = 130
     and (s->>'approved_quantity')::numeric = 100
     and (s->>'requirement_revision')::uuid = v_rev then
    n_pass:=n_pass+1;
    raise notice 'E9 PASS guests 100→130 recommends 130; the approved 100 stands and no new revision was created';
  else n_fail:=n_fail+1; raise notice 'E9 FAIL s=% c=%', s, c; end if;

  p := public.kitchen_event_panel(v_ev, now());
  select l into ln from jsonb_array_elements(p->'lines') l where l->>'item' = 'Sliders';
  if (ln->>'review_required')::boolean
     and (ln->>'approved_quantity')::numeric = 100
     and (ln->>'recommended_quantity')::numeric = 130 then
    n_pass:=n_pass+1; raise notice 'E10 PASS the panel derives Review required: approved 100, now implied 130';
  else n_fail:=n_fail+1; raise notice 'E10 FAIL %', ln; end if;

  if (select count(*) from public.requirement_quantity_decision d
       join public.obligation o on o.id = d.requirement_ref
      where o.event_ref = v_ev and d.decision_kind = 'approved') = 1
     and (select count(*) from public.obligation
           where event_ref = v_ev and kind='culinary_item_prepare' and supersedes_ref is not null) = 1 then
    n_pass:=n_pass+1; raise notice 'E11 PASS the guest-count change created no approval and no Requirement revision';
  else n_fail:=n_fail+1; raise notice 'E11 FAIL'; end if;

  -- ══ E12 · a FUTURE-EFFECTIVE guest count is inert until its instant ═══════
  insert into public.attendance_commitment (tenant_id, occurrence_id, head_count, basis,
      effective_moment, recorded_by)
    values (v_t, v_occ, 160, 'final', now() + interval '2 days', 'fixture');
  c := public.kitchen_line_current(v_sl, now());
  if (c->>'recommended_quantity')::numeric = 130 and (c->>'guest_count')::numeric = 130 then
    n_pass:=n_pass+1; raise notice 'E12 PASS a guest count effective in two days does not change today''s recommendation';
  else n_fail:=n_fail+1; raise notice 'E12 FAIL %', c; end if;

  c := public.kitchen_line_current(v_sl, now() + interval '3 days');
  if (c->>'recommended_quantity')::numeric = 160 then
    n_pass:=n_pass+1;
    raise notice 'E13 PASS it becomes current at its own instant by derivation — nothing polled, nothing scheduled';
  else n_fail:=n_fail+1; raise notice 'E13 FAIL %', c; end if;

  if (select count(*) from public.requirement_quantity_decision d
       join public.obligation o on o.id = d.requirement_ref
      where o.event_ref = v_ev and d.quantity = 160) = 0 then
    n_pass:=n_pass+1; raise notice 'E14 PASS no decision was written for the future guest count — it is derived, not materialized early';
  else n_fail:=n_fail+1; raise notice 'E14 FAIL a future-effective count was recorded as a present decision'; end if;

  -- ══ E15 · the panel is complete and authority-aware ═══════════════════════
  p := public.kitchen_event_panel(v_ev, now());
  select l into ln from jsonb_array_elements(p->'lines') l where l->>'item' = 'Napkins';
  if p->>'stage' = 'enacted' and (p->>'operative')::boolean
     and jsonb_array_length(p->'lines') = 4
     and (ln->>'recommendation_resolved')::boolean = false
     and ln->>'unresolved_reason' is not null
     and (ln->>'may_approve')::boolean = true then
    n_pass:=n_pass+1; raise notice 'E15 PASS panel is ENACTED, lists 4 lines, shows the unresolved reason and the actor''s authority';
  else n_fail:=n_fail+1; raise notice 'E15 FAIL %', ln; end if;

  -- ══ E16 · the downstream fence held ═══════════════════════════════════════
  -- Whole-noun match: a pre-existing table such as staged_artifact_packages
  -- merely contains the letters 'pack' and is not a Kitchen Pack relation.
  if (select count(*) from information_schema.tables where table_schema='public'
       and table_name ~ '^(kitchen_)?(ingredient|ingredients|coverage|sourcing|prep|prep_plan|production|pack|handoff|purchase_order|purchase_orders|batch|batches|run|runs|assembly|assemblies|shortage|shortages)$') = 0 then
    n_pass:=n_pass+1; raise notice 'E16 PASS no Coverage/Sourcing/Prep/Production/Pack/Handoff relation was created';
  else n_fail:=n_fail+1; raise notice 'E16 FAIL a downstream relation exists'; end if;

  raise notice 'v311 ENACTMENT: % PASS / % FAIL', n_pass, n_fail;
  if n_fail > 0 then raise exception 'v311 ENACTMENT PROOF FAILED: %', n_fail; end if;
  raise exception 'V311_ENACT_ROLLBACK';
exception when others then
  if sqlerrm = 'V311_ENACT_ROLLBACK' then raise notice 'rolled back cleanly — zero residue';
  else raise; end if;
end $$;
-- POST-COMMITMENT REVISION INSPECTION (probe, not a claim suite).
-- Asks the runtime one question: after release, can a later committed-design
-- revision reach the Event — and therefore Kitchen — at all?
do $$
declare
  v_t uuid; v_u uuid; v_book uuid; v_occ uuid; v_prop uuid;
  v_v1 uuid; v_v2 uuid; v_s1 uuid; v_s2 uuid; v_a1 uuid; v_a2 uuid;
  v_ev uuid; v_sfx text := substr(gen_random_uuid()::text,1,8);
  v_now timestamptz := now(); v_err text; v_seen uuid; v_qty numeric;
  n_pass int := 0; n_fail int := 0; v_req uuid; v_rev uuid;
  r jsonb; s jsonb; c jsonb; p jsonb; ln jsonb;
  m1 jsonb; m2 jsonb; cA uuid := gen_random_uuid(); iSl uuid := gen_random_uuid();
begin
  select tu.tenant_id, tu.user_id into v_t, v_u
    from public.tenant_users tu where tu.active order by tu.tenant_id limit 1;
  perform set_config('app.user_id', v_u::text, true);
  perform set_config('request.jwt.claim.sub', v_u::text, true);

  m1 := jsonb_build_object('components', jsonb_build_array(jsonb_build_object(
          'componentId', cA, 'title','Grill Station','station',true,
          'items_committed', jsonb_build_array(jsonb_build_object(
            'item_id',iSl,'name','Sliders','quantity',1,'quantity_basis','per_person','selected',true)))));
  -- the revised commitment: the SAME line, now two per guest
  m2 := jsonb_build_object('components', jsonb_build_array(jsonb_build_object(
          'componentId', cA, 'title','Grill Station','station',true,
          'items_committed', jsonb_build_array(jsonb_build_object(
            'item_id',iSl,'name','Sliders','quantity',2,'quantity_basis','per_person','selected',true)))));

  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_t,'PCR','PCR-'||v_sfx,'active') returning id into v_book;
  v_occ := (public.open_occurrence(v_book, null, null)->>'occurrence_id')::uuid;
  insert into public.proposals (tenant_id, booking_id, title, status)
    values (v_t, v_book, 'PCR', 'draft') returning id into v_prop;

  insert into public.proposal_versions (tenant_id, proposal_id, version, status)
    values (v_t, v_prop, 1, 'sent') returning id into v_v1;
  insert into public.offer_snapshots (tenant_id, version_id, fingerprint, model,
      artifact_bytes, artifact_hash, artifact_meta, assets)
    values (v_t, v_v1, 'pcr1-'||v_sfx, m1, '\x00'::bytea,'h','{}'::jsonb,'{}'::jsonb)
    returning id into v_s1;
  insert into public.offer_acceptances (tenant_id, snapshot_id, fingerprint, booking_id,
      principal, authority_basis, evidence_basis, channel, recorded_moment)
    values (v_t, v_s1, 'pcr1-'||v_sfx, v_book, '{}'::jsonb,'b','b','portal', v_now)
    returning id into v_a1;

  insert into public.attendance_commitment (tenant_id, occurrence_id, head_count, basis,
      effective_moment, recorded_by) values (v_t, v_occ, 100, 'contracted', v_now, 'probe');

  v_ev := (public.release_occurrence(v_occ,'op','signoff','clearance',null)->>'event_id')::uuid;
  select (public.kitchen_quantity_state(o.id)->>'recommended_quantity')::numeric into v_qty
    from public.obligation o where o.event_ref = v_ev and o.resource_role = 'Sliders';
  raise notice 'PCR-0  baseline: Kitchen recommends % for Sliders', v_qty;

  -- ── Q1 · can a SECOND commitment be recorded after release? ───────────────
  insert into public.proposal_versions (tenant_id, proposal_id, version, status)
    values (v_t, v_prop, 2, 'sent') returning id into v_v2;
  insert into public.offer_snapshots (tenant_id, version_id, fingerprint, model,
      artifact_bytes, artifact_hash, artifact_meta, assets)
    values (v_t, v_v2, 'pcr2-'||v_sfx, m2, '\x00'::bytea,'h','{}'::jsonb,'{}'::jsonb)
    returning id into v_s2;
  begin
    insert into public.offer_acceptances (tenant_id, snapshot_id, fingerprint, booking_id,
        principal, authority_basis, evidence_basis, channel, recorded_moment)
      values (v_t, v_s2, 'pcr2-'||v_sfx, v_book, '{}'::jsonb,'b','b','portal', v_now + interval '1 hour')
      returning id into v_a2;
    raise notice 'PCR-1  a SECOND acceptance for the released engagement IS recordable (%)', v_a2;
  exception when others then
    raise notice 'PCR-1  a second acceptance is REFUSED: %', sqlerrm;
  end;

  -- ── Q2 · does the Event follow it? ────────────────────────────────────────
  select origin_commitment_ref into v_seen from public.event where id = v_ev;
  if v_seen = v_a1 then
    raise notice 'PCR-2  event.origin_commitment_ref still names the FIRST acceptance — the revision is unreachable';
  else
    raise notice 'PCR-2  event.origin_commitment_ref moved to %', v_seen;
  end if;


  -- ══ R1 · a revision is INERT until adopted ════════════════════════════════
  select (public.kitchen_quantity_state(o.id)->>'recommended_quantity')::numeric into v_qty
    from public.obligation o where o.event_ref = v_ev and o.resource_role='Sliders' and o.supersedes_ref is null;
  if v_qty = 100 then n_pass:=n_pass+1;
    raise notice 'R1 PASS a recorded but unadopted revision changes nothing — acceptance is commercial, adoption is operational';
  else n_fail:=n_fail+1; raise notice 'R1 FAIL %', v_qty; end if;

  -- ══ R2 · adoption is default-deny ═════════════════════════════════════════
  begin
    perform public.revise_event_commitment(v_ev, v_a2, 'menu revised');
    n_fail:=n_fail+1; raise notice 'R2 FAIL adopted without a grant';
  exception when others then
    if sqlerrm like 'COMMITMENT_REVISION_NOT_PERMITTED%' then n_pass:=n_pass+1;
      raise notice 'R2 PASS adoption refused without an explicit Authority Grant';
    else n_fail:=n_fail+1; raise notice 'R2 FAIL %', sqlerrm; end if;
  end;

  insert into public.authority_grant (tenant_id, record_kind, actor, act_class, granted_by)
    values (v_t,'grant',v_u,'event.commitment.revise','proof'),
           (v_t,'grant',v_u,'kitchen.quantity.approve','proof');

  -- an approval standing on the ORIGINAL commitment
  select o.id into v_req from public.obligation o
    where o.event_ref = v_ev and o.resource_role='Sliders' and o.supersedes_ref is null;
  r := public.approve_kitchen_quantity(v_req, 'approved against the original menu');
  v_rev := (r->>'requirement_revision')::uuid;

  -- ══ R3 · adoption is recorded, append-only, and keeps the baseline ════════
  r := public.revise_event_commitment(v_ev, v_a2, 'customer revised the menu after booking');
  if (r->>'acceptance_ref')::uuid = v_a2
     and (r->>'baseline')::uuid = v_a1
     and (select origin_commitment_ref from public.event where id=v_ev) = v_a1 then
    n_pass:=n_pass+1;
    raise notice 'R3 PASS the revision is adopted and the original baseline is untouched';
  else n_fail:=n_fail+1; raise notice 'R3 FAIL %', r; end if;

  begin
    update public.event_commitment_revision set reason='x' where event_ref = v_ev;
    n_fail:=n_fail+1; raise notice 'R4 FAIL adoption record was editable';
  exception when others then
    if sqlerrm like 'COMMITMENT_REVISION_EDIT_REFUSED%' then n_pass:=n_pass+1;
      raise notice 'R4 PASS adoption records are append-only';
    else n_fail:=n_fail+1; raise notice 'R4 FAIL %', sqlerrm; end if;
  end;

  -- ══ R5 · the SAME Requirement re-derives — no orphaned line ═══════════════
  select o.id into v_seen from public.obligation o
    where o.event_ref = v_ev and o.resource_role='Sliders' and o.supersedes_ref is null;
  if v_seen = v_req
     and (select count(*) from public.obligation
           where event_ref=v_ev and kind='culinary_item_prepare' and supersedes_ref is null) = 1 then
    n_pass:=n_pass+1;
    raise notice 'R5 PASS the revised commitment re-derives the SAME Requirement — decision history is not orphaned';
  else n_fail:=n_fail+1; raise notice 'R5 FAIL new=% old=%', v_seen, v_req; end if;

  -- ══ R6 · Kitchen now recommends what the revision implies ════════════════
  s := public.kitchen_quantity_state(v_req);
  c := public.kitchen_line_current(v_req, now());
  if (c->>'recommended_quantity')::numeric = 200
     and (s->>'recommended_quantity')::numeric = 200 then
    n_pass:=n_pass+1; raise notice 'R6 PASS Kitchen re-derives 2 per guest × 100 guests = 200';
  else n_fail:=n_fail+1; raise notice 'R6 FAIL s=% c=%', s, c; end if;

  -- ══ R7 · the prior approval stands, historically, and needs review ════════
  if (s->>'approved_quantity')::numeric = 100
     and (s->>'requirement_revision')::uuid = v_rev
     and public.responsibility_state(v_rev) <> 'void' then
    n_pass:=n_pass+1;
    raise notice 'R7 PASS the approval made under the original commitment remains historical and authoritative until revisited';
  else n_fail:=n_fail+1; raise notice 'R7 FAIL %', s; end if;

  p := public.kitchen_event_panel(v_ev, now());
  select l into ln from jsonb_array_elements(p->'lines') l where l->>'item'='Sliders';
  if (ln->>'review_required')::boolean then
    n_pass:=n_pass+1; raise notice 'R8 PASS the panel reports Review required — %', ln->>'review_reason';
  else n_fail:=n_fail+1; raise notice 'R8 FAIL review not raised'; end if;

  -- ══ R9 · adoption approves nothing and moves nothing downstream ═══════════
  if (select count(*) from public.requirement_quantity_decision d
       join public.obligation o on o.id=d.requirement_ref
      where o.event_ref=v_ev and d.decision_kind='approved') = 1
     and (select count(*) from public.obligation
           where event_ref=v_ev and kind='culinary_item_prepare' and supersedes_ref is not null) = 1 then
    n_pass:=n_pass+1; raise notice 'R9 PASS adoption created no approval and no new Requirement revision';
  else n_fail:=n_fail+1; raise notice 'R9 FAIL'; end if;

  -- ══ R10 · adoption refuses a foreign or rescinded commitment ══════════════
  begin
    perform public.revise_event_commitment(v_ev, v_a2, 'again');
    n_fail:=n_fail+1; raise notice 'R10 FAIL re-adopting the same commitment was admitted';
  exception when others then
    if sqlerrm like 'COMMITMENT_REVISION_UNCHANGED%' then n_pass:=n_pass+1;
      raise notice 'R10 PASS re-adopting the standing commitment is refused';
    else n_fail:=n_fail+1; raise notice 'R10 FAIL %', sqlerrm; end if;
  end;

  raise notice 'v311 POST-COMMITMENT REVISION: % PASS / % FAIL', n_pass, n_fail;
  if n_fail > 0 then raise exception 'v311 PCR PROOF FAILED: %', n_fail; end if;
  raise exception 'PCR_ROLLBACK';
exception when others then
  if sqlerrm = 'PCR_ROLLBACK' then raise notice 'rolled back cleanly — zero residue';
  else raise; end if;
end $$;
-- CROSS-DOMAIN REVISION RECONCILIATION (Architect ruling).
-- An adopted commitment revision reconciles Event Requirements in EVERY
-- receiving domain: unchanged preserve identity, changed supersede, new append,
-- removed resolve historically, and enacted work is never silently rewritten.
do $$
declare
  v_t uuid; v_u uuid; v_book uuid; v_occ uuid; v_prop uuid;
  v_v1 uuid; v_v2 uuid; v_s1 uuid; v_s2 uuid; v_a1 uuid; v_a2 uuid;
  v_ev uuid; v_sfx text := substr(gen_random_uuid()::text,1,8);
  v_now timestamptz := now(); m1 jsonb; m2 jsonb;
  n_pass int := 0; n_fail int := 0; v_n int; v_txt text;
  cA uuid := gen_random_uuid(); cB uuid := gen_random_uuid(); cC uuid := gen_random_uuid();
  v_carve uuid; v_carve2 uuid; v_setup uuid; v_staff uuid; v_pay jsonb;
begin
  select tu.tenant_id, tu.user_id into v_t, v_u
    from public.tenant_users tu where tu.active order by tu.tenant_id limit 1;
  perform set_config('app.user_id', v_u::text, true);
  perform set_config('request.jwt.claim.sub', v_u::text, true);

  -- ── baseline commitment · two stations ───────────────────────────────────
  m1 := jsonb_build_object('components', jsonb_build_array(
    jsonb_build_object('componentId', cA, 'title','Carving Station','station',true,
      'requirements', jsonb_build_array(
        jsonb_build_object('category','equipment','item','carving board'),
        jsonb_build_object('category','staff','role','carver'))),
    jsonb_build_object('componentId', cB, 'title','Oyster Bar','station',true,
      'requirements', jsonb_build_array(
        jsonb_build_object('category','staff','role','shucker')))));

  -- ── revised commitment ───────────────────────────────────────────────────
  --   Carving Station : UNCHANGED           → identity preserved
  --   Oyster Bar      : RENAMED to Raw Bar  → superseded
  --   Dessert Table   : ADDED               → appended
  --   (nothing removed here; removal is exercised below by dropping Raw Bar)
  m2 := jsonb_build_object('components', jsonb_build_array(
    jsonb_build_object('componentId', cA, 'title','Carving Station','station',true,
      'requirements', jsonb_build_array(
        jsonb_build_object('category','equipment','item','carving board'),
        jsonb_build_object('category','staff','role','carver'))),
    jsonb_build_object('componentId', cB, 'title','Raw Bar','station',true,
      'requirements', jsonb_build_array(
        jsonb_build_object('category','staff','role','shucker'))),
    jsonb_build_object('componentId', cC, 'title','Dessert Table','station',true,
      'requirements', jsonb_build_array(
        jsonb_build_object('category','equipment','item','cake stand')))));

  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_t,'XDOM','XDOM-'||v_sfx,'active') returning id into v_book;
  v_occ := (public.open_occurrence(v_book, null, null)->>'occurrence_id')::uuid;
  insert into public.proposals (tenant_id, booking_id, title, status)
    values (v_t, v_book, 'XDOM', 'draft') returning id into v_prop;
  insert into public.proposal_versions (tenant_id, proposal_id, version, status)
    values (v_t, v_prop, 1, 'sent') returning id into v_v1;
  insert into public.offer_snapshots (tenant_id, version_id, fingerprint, model,
      artifact_bytes, artifact_hash, artifact_meta, assets)
    values (v_t, v_v1, 'x1-'||v_sfx, m1, '\x00'::bytea,'h','{}'::jsonb,'{}'::jsonb)
    returning id into v_s1;
  insert into public.offer_acceptances (tenant_id, snapshot_id, fingerprint, booking_id,
      principal, authority_basis, evidence_basis, channel, recorded_moment)
    values (v_t, v_s1, 'x1-'||v_sfx, v_book, '{}'::jsonb,'b','b','portal', v_now)
    returning id into v_a1;
  insert into public.attendance_commitment (tenant_id, occurrence_id, head_count, basis,
      effective_moment, recorded_by) values (v_t, v_occ, 80, 'contracted', v_now, 'probe');

  v_ev := (public.release_occurrence(v_occ,'op','signoff','clearance',null)->>'event_id')::uuid;

  select o.id into v_carve from public.obligation o
    where o.event_ref=v_ev and o.kind='equipment_pull' and o.resource_role='carving board';
  select o.id into v_setup from public.obligation o
    where o.event_ref=v_ev and o.kind='venue_setup' and o.resource_role=cB::text;
  select o.id into v_staff from public.obligation o
    where o.event_ref=v_ev and o.kind='staffing_assign' and o.resource_role='shucker';

  -- real operational acts performed against the ORIGINAL requirements
  perform public.record_execution_evidence(v_ev, v_carve, 'completion', 'crew', '{}'::jsonb);
  perform public.record_execution_evidence(v_ev, v_staff, 'assignment', 'crew', '{}'::jsonb);

  -- ── adopt the revision ───────────────────────────────────────────────────
  insert into public.proposal_versions (tenant_id, proposal_id, version, status)
    values (v_t, v_prop, 2, 'sent') returning id into v_v2;
  insert into public.offer_snapshots (tenant_id, version_id, fingerprint, model,
      artifact_bytes, artifact_hash, artifact_meta, assets)
    values (v_t, v_v2, 'x2-'||v_sfx, m2, '\x00'::bytea,'h','{}'::jsonb,'{}'::jsonb)
    returning id into v_s2;
  insert into public.offer_acceptances (tenant_id, snapshot_id, fingerprint, booking_id,
      principal, authority_basis, evidence_basis, channel, recorded_moment)
    values (v_t, v_s2, 'x2-'||v_sfx, v_book, '{}'::jsonb,'b','b','portal', v_now + interval '1 hour')
    returning id into v_a2;
  insert into public.authority_grant (tenant_id, record_kind, actor, act_class, granted_by)
    values (v_t,'grant',v_u,'event.commitment.revise','proof');
  perform public.revise_event_commitment(v_ev, v_a2, 'customer revised the stations after booking');
  perform public.generate_obligations(v_ev);

  -- ══ X1 · UNCHANGED requirements preserve identity ═════════════════════════
  if (select o.id from public.obligation o
        where o.event_ref=v_ev and o.kind='equipment_pull' and o.resource_role='carving board'
          and o.supersedes_ref is null) = v_carve
     and (select count(*) from public.obligation
           where event_ref=v_ev and kind='equipment_pull' and resource_role='carving board') = 1 then
    n_pass:=n_pass+1;
    raise notice 'X1 PASS the untouched Carving Station requirement kept its identity — no new row, no supersession';
  else n_fail:=n_fail+1; raise notice 'X1 FAIL identity was not preserved'; end if;

  -- ══ X2 · its completed work is untouched and still reads complete ═════════
  if public.responsibility_state(v_carve) = 'discharged'
     and exists (select 1 from public.execution_evidence
                  where obligation_ref=v_carve and kind='completion') then
    n_pass:=n_pass+1; raise notice 'X2 PASS work completed before the revision is still discharged';
  else n_fail:=n_fail+1; raise notice 'X2 FAIL state=%', public.responsibility_state(v_carve); end if;

  -- ══ X3 · CHANGED requirements supersede, append-only ══════════════════════
  select o.id into v_carve2 from public.obligation o
    where o.event_ref=v_ev and o.kind='venue_setup' and o.supersedes_ref = v_setup;
  if v_carve2 is not null
     and (select required_outcome from public.obligation where id=v_carve2) = 'Set up Raw Bar at venue'
     and (select required_outcome from public.obligation where id=v_setup) = 'Set up Oyster Bar at venue'
     and public.responsibility_state(v_setup) = 'superseded' then
    n_pass:=n_pass+1;
    raise notice 'X3 PASS the renamed station superseded: prior says Oyster Bar and remains, revision says Raw Bar';
  else n_fail:=n_fail+1; raise notice 'X3 FAIL rev=%', v_carve2; end if;

  -- ══ X4 · NEW requirements append ══════════════════════════════════════════
  if (select count(*) from public.obligation
       where event_ref=v_ev and resource_role='cake stand') = 1
     and (select count(*) from public.obligation
           where event_ref=v_ev and kind='venue_setup' and resource_role=cC::text) = 1 then
    n_pass:=n_pass+1; raise notice 'X4 PASS the added Dessert Table appended new requirements';
  else n_fail:=n_fail+1; raise notice 'X4 FAIL'; end if;

  -- ══ X5 · enacted work on a SUPERSEDED line is never rewritten ═════════════
  -- The shucker requirement states "Assign shucker to Oyster Bar", so renaming
  -- the station genuinely changed WHAT IT SAYS and it must supersede. This is
  -- the case the ruling cares about most: a staffing assignment had already been
  -- made against the prior requirement.
  select o.id into v_carve2 from public.obligation o
    where o.event_ref=v_ev and o.kind='staffing_assign' and o.supersedes_ref = v_staff;
  if v_carve2 is not null
     and (select required_outcome from public.obligation where id=v_carve2) = 'Assign shucker to Raw Bar'
     and (select required_outcome from public.obligation where id=v_staff) = 'Assign shucker to Oyster Bar' then
    n_pass:=n_pass+1;
    raise notice 'X5 PASS the staffing requirement changed with the station and superseded, prior text intact';
  else n_fail:=n_fail+1; raise notice 'X5 FAIL rev=%', v_carve2; end if;

  -- The assignment stays attached to the requirement it was performed against —
  -- it was true — and the new revision is outstanding, which IS the pressure.
  select e.payload into v_pay from public.execution_evidence e
    where e.obligation_ref = v_staff and e.kind='superseded'
      and e.actor='commitment_reconciliation' limit 1;
  if exists (select 1 from public.execution_evidence
              where obligation_ref=v_staff and kind='assignment')
     and v_pay->>'enacted_work_on_prior' = 'assignment'
     and public.responsibility_state(v_carve2) <> 'discharged' then
    n_pass:=n_pass+1;
    raise notice 'X6 PASS the assignment is retained on the prior requirement, named in the reconciliation fact, and the revised requirement is outstanding rather than pre-satisfied';
  else n_fail:=n_fail+1; raise notice 'X6 FAIL pay=% state=%', v_pay, public.responsibility_state(v_carve2); end if;

  -- ══ X7 · reconciliation pressure is stated, not implied ═══════════════════
  select e.payload into v_pay from public.execution_evidence e
    where e.obligation_ref = v_setup and e.kind='superseded'
      and e.actor='commitment_reconciliation' limit 1;
  if v_pay is not null
     and v_pay->>'prior_outcome' = 'Set up Oyster Bar at venue'
     and v_pay->>'revised_outcome' = 'Set up Raw Bar at venue' then
    n_pass:=n_pass+1;
    raise notice 'X7 PASS an explicit reconciliation fact names the delta: % → %',
      v_pay->>'prior_outcome', v_pay->>'revised_outcome';
  else n_fail:=n_fail+1; raise notice 'X7 FAIL %', v_pay; end if;

  -- ══ X8 · nothing is permanently tied to the superseded commitment ═════════
  if (select count(*) from public.obligation o
        where o.event_ref=v_ev and o.origin_ref = v_a2) > 0
     and public.event_current_commitment(v_ev, now()) = v_a2 then
    n_pass:=n_pass+1;
    raise notice 'X8 PASS requirements derived after adoption cite the revised commitment';
  else n_fail:=n_fail+1; raise notice 'X8 FAIL still tied to the superseded commitment'; end if;

  -- ══ X9 · REMOVED requirements resolve historically ════════════════════════
  update public.offer_snapshots set model = jsonb_build_object('components',
    (select jsonb_agg(c) from jsonb_array_elements(m2->'components') c
      where c->>'componentId' <> cB::text))
   where id = v_s2;
  perform public.generate_obligations(v_ev);
  select o.id into v_carve2 from public.obligation o
    where o.event_ref=v_ev and o.kind='staffing_assign' and o.resource_role='shucker'
      and o.supersedes_ref is null;
  if public.responsibility_state(v_carve2) in ('void','superseded')
     and exists (select 1 from public.obligation where id=v_carve2) then
    n_pass:=n_pass+1;
    raise notice 'X9 PASS the withdrawn station resolved historically (%) — the row still exists',
      public.responsibility_state(v_carve2);
  else n_fail:=n_fail+1; raise notice 'X9 FAIL state=%', public.responsibility_state(v_carve2); end if;

  -- ══ X10 · the untouched line survived BOTH regenerations ══════════════════
  if public.responsibility_state(v_carve) = 'discharged' then
    n_pass:=n_pass+1;
    raise notice 'X10 PASS after two revisions the untouched completed requirement is still discharged';
  else n_fail:=n_fail+1; raise notice 'X10 FAIL state=%', public.responsibility_state(v_carve); end if;

  -- ══ X11 · reconciliation is idempotent ════════════════════════════════════
  select count(*) into v_n from public.obligation where event_ref = v_ev;
  perform public.generate_obligations(v_ev);
  if (select count(*) from public.obligation where event_ref = v_ev) = v_n then
    n_pass:=n_pass+1; raise notice 'X11 PASS re-running reconciliation created nothing further';
  else n_fail:=n_fail+1; raise notice 'X11 FAIL rows % -> %', v_n,
    (select count(*) from public.obligation where event_ref = v_ev); end if;

  -- ══ X12 · a dependency on a superseded predecessor still resolves ═════════
  -- venue_breakdown depends on venue_setup's identity key; superseding setup
  -- must not strand its dependent behind a revision that can no longer be worked.
  select o.id into v_carve2 from public.obligation o
    where o.event_ref=v_ev and o.kind='venue_setup' and o.resource_role=cA::text
      and o.supersedes_ref is null;
  perform public.record_execution_evidence(v_ev, public.requirement_lineage_head(v_carve2),
                                           'completion', 'crew', '{}'::jsonb);
  select o.natural_key into v_txt from public.obligation o where o.id = v_carve2;
  if public.obligation_nk_complete(v_ev, v_txt) then
    n_pass:=n_pass+1;
    raise notice 'X12 PASS completion is read across the line, so dependents are not stranded by supersession';
  else n_fail:=n_fail+1; raise notice 'X12 FAIL dependency blocked behind a superseded revision'; end if;

  -- ══ X13 · existing events are NOT re-keyed by this release ═══════════════
  -- Identity moved from the acceptance to the Event's baseline commitment. On an
  -- event that never adopted a revision those are the same value, so v311 must
  -- reproduce v275's natural keys exactly. If it did not, deploying v311 would
  -- silently invalidate and re-create every obligation on every existing event.
  select o.natural_key into v_txt from public.obligation o
    where o.event_ref = v_ev and o.kind = 'culinary_prepare' and o.resource_role = cA::text
      and o.supersedes_ref is null;
  if v_txt = encode(extensions.digest(
       v_ev::text || v_a1::text || 'culinary_prepare' || cA::text, 'sha256'), 'hex') then
    n_pass:=n_pass+1;
    raise notice 'X13 PASS v311 reproduces the v275 natural key exactly — no existing event is re-keyed by this release';
  else n_fail:=n_fail+1; raise notice 'X13 FAIL identity digest changed for an unrevised event'; end if;

  raise notice 'v311 CROSS-DOMAIN RECONCILIATION: % PASS / % FAIL', n_pass, n_fail;
  if n_fail > 0 then raise exception 'v311 XDOM PROOF FAILED: %', n_fail; end if;
  raise exception 'V311_XDOM_ROLLBACK';
exception when others then
  if sqlerrm = 'V311_XDOM_ROLLBACK' then raise notice 'rolled back cleanly — zero residue';
  else raise; end if;
end $$;
