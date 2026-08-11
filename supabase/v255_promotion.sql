-- ═══════════════════════════════════════════════════════════════════════════
-- v255 — PROMOTION (PUBLICATION_BLUEPRINTS constitution, BP-5)
--
-- THE CEREMONY, server side: a design's normalized content becomes ONE
-- blueprint DRAFT — new identity or the next draft on an existing one.
-- ONE PROMOTION, ONE BLUEPRINT. The draft is never published here: there
-- is no publish statement in this file's RPC, publication remains the §3
-- intent ceremony, and published_revision_id is untouched (server-proven,
-- supabase/tests/v255_proof.sql).
--
-- EVIDENCE INFORMS, NEVER WRITES: the ceremony reads the design and
-- writes only the shelf — the design's rows are byte-identical after
-- promotion (PM-4).
--
-- PROMOTED-FROM PROVENANCE: the draft records the exact design version it
-- came from — a recorded FACT (plain uuid, deliberately no foreign key:
-- provenance never dangles and never becomes a dependency).
--
-- THE BARRED BELT (§5): normalization and validation live client-side
-- (BP-2's validator); the schema carries the law a second time with a
-- recursive key walk — event-specific and commercial keys refuse HERE
-- too, named, before any row exists. The key set mirrors BP-2's
-- BARRED_KEYS verbatim (unit-pinned equal).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.blueprint_revisions
  add column if not exists promoted_from_version_id uuid;

-- v255 AMENDMENT (BP-5 spec §provenance): the act row carries the full
-- historical record — selected regions, explicit transformations, named
-- omissions. METADATA ONLY: consumed by no resolver, joined by no view,
-- read by nothing at instantiation — history, not machinery.
alter table public.blueprint_shelf_acts
  add column if not exists detail jsonb;

-- the act vocabulary grows by exactly one word
alter table public.blueprint_shelf_acts drop constraint if exists blueprint_shelf_acts_act_check;
alter table public.blueprint_shelf_acts
  add constraint blueprint_shelf_acts_act_check
  check (act in ('publish','retire','reinstate','promote'));

-- ── the recursive barred-key walk ──
create or replace function public.blueprint_barred_keys(p jsonb)
returns text[] language plpgsql immutable as $$
declare
  barred text[] := array[
    'customer','customerId','customer_id','contact','party','parties',
    'eventDate','event_date','date','dates','venue',
    'guestCount','guest_count','guests',
    'deposit','deposits','discount','payment','payments',
    'agreement','agreements','terms','signature','signatures',
    'delivery','deliveries','approval','approvals','actuals',
    'taxId','tax_id','ach',
    'confirmed','price_confirmed','priceConfirmed'];
  found_keys text[] := '{}';
  k text; v jsonb;
begin
  if jsonb_typeof(p) = 'object' then
    for k, v in select * from jsonb_each(p) loop
      if k = any(barred) then found_keys := found_keys || k; end if;
      found_keys := found_keys || public.blueprint_barred_keys(v);
    end loop;
  elsif jsonb_typeof(p) = 'array' then
    for v in select * from jsonb_array_elements(p) loop
      found_keys := found_keys || public.blueprint_barred_keys(v);
    end loop;
  end if;
  return found_keys;
end $$;

-- ── THE CEREMONY ──
create or replace function public.promote_design_to_draft(
  p_version  uuid,
  p_content  jsonb,
  p_identity uuid default null,
  p_name     text default null,
  p_taxonomy text default null,
  p_actor    uuid default null,
  p_detail   jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_ident  public.blueprint_identities%rowtype;
  v_iid    uuid;
  v_rid    uuid;
  v_num    int;
  v_bad    text[];
begin
  -- tenancy: the promoted design must be the caller's
  if not exists (
    select 1 from public.proposal_versions pv
      join public.proposals p on p.id = pv.proposal_id
      join public.bookings b on b.id = p.booking_id
     where pv.id = p_version and b.tenant_id = v_tenant
  ) then
    raise exception 'PROMOTE: design version not found';
  end if;

  -- §5 belt: barred material refuses by name before anything exists
  v_bad := public.blueprint_barred_keys(coalesce(p_content, '{}'::jsonb));
  if array_length(v_bad, 1) is not null then
    raise exception 'PROMOTION_BARRED_CONTENT: %', array_to_json(v_bad)::text;
  end if;

  if p_identity is not null then
    select * into v_ident from public.blueprint_identities
      where id = p_identity for update;
    if not found or v_ident.tenant_id is distinct from v_tenant then
      raise exception 'PROMOTE: identity not found';
    end if;
    if v_ident.status <> 'active' then
      raise exception 'PROMOTION_TARGET_RETIRED';
    end if;
    if exists (select 1 from public.blueprint_revisions
                where identity_id = p_identity and state = 'draft') then
      raise exception 'PROMOTION_TARGET_BUSY: the identity already carries a draft';
    end if;
    v_iid := p_identity;
  else
    if coalesce(trim(p_name), '') = '' then
      raise exception 'PROMOTION_NAME_REQUIRED';
    end if;
    insert into public.blueprint_identities (tenant_id, name, taxonomy)
      values (v_tenant, trim(p_name), nullif(trim(coalesce(p_taxonomy,'')), ''))
      returning id into v_iid;
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_num
    from public.blueprint_revisions where identity_id = v_iid;

  -- ONE draft. state defaults to 'draft'; no publish statement exists here.
  insert into public.blueprint_revisions
      (identity_id, revision_number, content, promoted_from_version_id)
    values (v_iid, v_num, p_content, p_version)
    returning id into v_rid;

  insert into public.blueprint_shelf_acts (tenant_id, identity_id, revision_id, act, actor, detail)
    values (v_tenant, v_iid, v_rid, 'promote', p_actor,
            coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('source_version', p_version));

  return jsonb_build_object('identity_id', v_iid, 'revision_id', v_rid, 'revision_number', v_num);
end $$;
