-- ============================================================================
-- v310.1 PERMANENT PROOF — tenancy is derived, never compiled in
-- Self-rolling-back, rerunnable, zero residue.
--
-- THE PROPERTY. No tenant-scoped default may name a tenant, and no child row
-- may claim a tenancy its authoritative parent does not.
--
-- TI-1  all four tenant-scoped surfaces carry tenant_id as uuid with the
--       canonical foreign key to tenants(id)
-- TI-2  all four defaults resolve through current_tenant_id()
-- TI-3  RECURRENCE GUARD · no tenant_id column anywhere in public defaults to
--       a hardcoded uuid literal
-- TI-4  BEHAVIOURAL · a default-driven insert adopts the ACTING session's
--       tenant, not a constant
-- TI-5  FIXTURE · the release's repair predicate converges a deliberately
--       mis-tenanted version onto its parent AND leaves a correct sibling alone
-- TI-6  zero proposal_versions rows disagree with their parent proposal
--
-- Six claims. This release moves no authority, no ceremony and no projection,
-- so the v306…v310 suites run unchanged as regressions.
--
-- TI-5 exists because TI-6 alone is satisfied trivially by an empty table. The
-- certification database holds no proposal_versions, so without a fixture the
-- repair logic itself would never be exercised anywhere except production.
-- ============================================================================

do $$
declare
  n_pass int := 0; n_fail int := 0;
  v_tenant uuid; v_user uuid; v_n int; v_got uuid;
  v_t1 uuid; v_t2 uuid;
  v_bk uuid; v_pr uuid; v_bad uuid; v_good uuid;
  v_bad_after uuid; v_good_after uuid; v_rows_before int; v_rows_after int;
  v_sfx text;
begin
  select tu.tenant_id, tu.user_id into v_tenant, v_user
    from public.tenant_users tu
   where tu.active and tu.role in ('admin','owner','manager','ops')
   order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'v310.1 PERMANENT PROOF BLOCKED: no active tenant_users row with an operating role';
  end if;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_sfx := substr(gen_random_uuid()::text, 1, 8);
  raise notice 'v310.1-permanent: tenant=% actor=%', v_tenant, v_user;

  -- ══ TI-1 · the four surfaces carry canonical tenant_id ════════════════════
  select count(distinct c.table_name)::int into v_n
    from information_schema.columns c
   where c.table_schema = 'public' and c.column_name = 'tenant_id' and c.data_type = 'uuid'
     and c.table_name in ('proposal_versions','photo_library','publication_themes','blueprints')
     and exists (
       select 1
         from information_schema.table_constraints tc
         join information_schema.key_column_usage k on k.constraint_name = tc.constraint_name
         join information_schema.constraint_column_usage r on r.constraint_name = tc.constraint_name
        where tc.constraint_type = 'FOREIGN KEY'
          and tc.table_schema = 'public'
          and tc.table_name = c.table_name
          and k.column_name = 'tenant_id'
          and r.table_name = 'tenants');
  if v_n = 4 then
    n_pass:=n_pass+1; raise notice 'TI-1 PASS: all four surfaces carry uuid tenant_id with the canonical tenants(id) foreign key';
  else
    n_fail:=n_fail+1; raise notice 'TI-1 FAIL: only % of 4 surfaces carry canonical tenant_id', v_n;
  end if;

  -- ══ TI-2 · all four defaults are dynamic ══════════════════════════════════
  select count(*)::int into v_n
    from pg_attrdef d
    join pg_class c on c.oid = d.adrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = d.adnum
   where n.nspname = 'public'
     and a.attname = 'tenant_id'
     and c.relname in ('proposal_versions','photo_library','publication_themes','blueprints')
     and pg_get_expr(d.adbin, d.adrelid) like '%current_tenant_id()%';
  if v_n = 4 then
    n_pass:=n_pass+1; raise notice 'TI-2 PASS: all four tenant_id defaults resolve through current_tenant_id()';
  else
    n_fail:=n_fail+1; raise notice 'TI-2 FAIL: only % of 4 defaults are dynamic', v_n;
  end if;

  -- ══ TI-3 · recurrence guard · no compiled-in tenancy anywhere ═════════════
  -- Scoped to the WHOLE public schema, not to the four known relations: the
  -- defect class is "a tenant-scoped default names a tenant", and a proof that
  -- only watched the columns already repaired would not notice a fifth.
  select count(*)::int into v_n
    from pg_attrdef d
    join pg_class c on c.oid = d.adrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = d.adnum
   where n.nspname = 'public'
     and a.attname = 'tenant_id'
     and pg_get_expr(d.adbin, d.adrelid) ~ '^''[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}''::uuid$';
  if v_n = 0 then
    n_pass:=n_pass+1; raise notice 'TI-3 PASS: no tenant_id column in public defaults to a hardcoded uuid literal';
  else
    n_fail:=n_fail+1; raise notice 'TI-3 FAIL: % tenant_id column(s) still default to a literal tenant', v_n;
  end if;

  -- ══ TI-4 · behavioural · the default follows the actor ════════════════════
  -- photo_library is used because url is its only NOT NULL column without a
  -- default, so the insert exercises the tenant default and nothing else.
  insert into public.photo_library (url) values ('v310_1-permanent-proof-' || v_sfx)
    returning tenant_id into v_got;
  if v_got is not null and v_got = public.current_tenant_id() then
    n_pass:=n_pass+1; raise notice 'TI-4 PASS: default-driven insert adopted the acting tenant %', v_got;
  else
    n_fail:=n_fail+1;
    raise notice 'TI-4 FAIL: default produced % but the acting tenant is %', v_got, public.current_tenant_id();
  end if;

  -- ══ TI-5 · fixture · the repair converges the wrong and spares the right ══
  select id into v_t1 from public.tenants order by id limit 1;
  select id into v_t2 from public.tenants where id <> v_t1 order by id limit 1;
  if v_t2 is null then
    raise notice 'TI-5 SKIP-AS-FAIL: fewer than two tenants exist, so a cross-tenant fixture cannot be built';
    n_fail:=n_fail+1;
  else
    select count(*)::int into v_rows_before from public.proposal_versions;

    insert into public.bookings (tenant_id, contact_name, invoice_num)
      values (v_t1, 'v310_1 proof ' || v_sfx, 'V3101-' || v_sfx)
      returning id into v_bk;
    insert into public.proposals (tenant_id, booking_id)
      values (v_t1, v_bk) returning id into v_pr;

    -- the mis-tenanted child: parent says t1, child claims t2
    insert into public.proposal_versions (proposal_id, tenant_id, version)
      values (v_pr, v_t2, 901) returning id into v_bad;
    -- the correct sibling: must survive the repair completely untouched
    insert into public.proposal_versions (proposal_id, tenant_id, version)
      values (v_pr, v_t1, 902) returning id into v_good;

    -- the release's own repair predicate, verbatim
    update public.proposal_versions pv
       set tenant_id = pr.tenant_id
      from public.proposals pr
     where pr.id = pv.proposal_id
       and pr.tenant_id is not null
       and pv.tenant_id is distinct from pr.tenant_id;

    select tenant_id into v_bad_after  from public.proposal_versions where id = v_bad;
    select tenant_id into v_good_after from public.proposal_versions where id = v_good;
    select count(*)::int into v_rows_after from public.proposal_versions;

    if v_bad_after = v_t1 and v_good_after = v_t1 and v_rows_after = v_rows_before + 2 then
      n_pass:=n_pass+1;
      raise notice 'TI-5 PASS: mis-tenanted version converged onto its parent, correct sibling untouched, no row created or destroyed';
    else
      n_fail:=n_fail+1;
      raise notice 'TI-5 FAIL: bad=% (want %) good=% (want %) rows %->% (want +2)',
        v_bad_after, v_t1, v_good_after, v_t1, v_rows_before, v_rows_after;
    end if;
  end if;

  -- ══ TI-6 · no child contradicts its authoritative parent ══════════════════
  select count(*)::int into v_n
    from public.proposal_versions pv
    join public.proposals pr on pr.id = pv.proposal_id
   where pv.tenant_id is distinct from pr.tenant_id;
  if v_n = 0 then
    n_pass:=n_pass+1; raise notice 'TI-6 PASS: zero proposal_versions disagree with their parent proposal tenancy';
  else
    n_fail:=n_fail+1; raise notice 'TI-6 FAIL: % proposal_versions row(s) contradict their parent', v_n;
  end if;

  -- ══ rows whose tenancy cannot be derived · reported, never invented ═══════
  select (select count(*) from public.photo_library      where tenant_id is null)
       + (select count(*) from public.publication_themes where tenant_id is null)
       + (select count(*) from public.blueprints         where tenant_id is null)
    into v_n;
  raise notice 'v310.1 unattributed rows on parentless surfaces (left unchanged by design): %', v_n;

  raise notice 'v310.1 PERMANENT PROOF: % PASS / % FAIL / 0 SKIPPED / 0 UNPROVEN', n_pass, n_fail;
  if n_fail > 0 then
    raise exception 'v310.1 PERMANENT PROOF FAILED: % claim(s) violated', n_fail;
  end if;
  raise exception 'V310_1_PERMANENT_ROLLBACK';
exception
  when others then
    if sqlerrm = 'V310_1_PERMANENT_ROLLBACK' then
      raise notice 'v310.1 permanent proof rolled back cleanly — zero residue';
    else raise;
    end if;
end $$;
