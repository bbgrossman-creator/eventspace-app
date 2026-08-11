-- ═══════════════════════════════════════════════════════════════════════════
-- v280 — VENUE KNOWLEDGE FOUNDATION · CEREMONIES  [MIGRATION]
-- Established pattern: SECURITY DEFINER, default-deny authority, tenant scoping
-- via current_tenant_id(), non-disclosing CEREMONY_NOT_FOUND, named refusals.
-- Venue reference-field updates and merge redirect happen ONLY here — clients
-- have no update path (I-V9). Advisory duplicate detection never blocks (frozen
-- ruling: no address-similarity uniqueness constraint; identity is the id).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.can_manage_venues()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = public.current_tenant_id() and tu.active
       and tu.role in ('admin','owner','manager','ops')
       and tu.user_id = coalesce(
             nullif(current_setting('app.user_id', true), ''),
             nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid);
$$;

-- advisory duplicate candidates: similar normalized name or address, same tenant
create or replace function public.venue_duplicate_candidates(p_name text, p_address text)
returns jsonb language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'address', v.address)), '[]'::jsonb)
  from public.venue v
  where v.tenant_id = public.current_tenant_id() and v.redirect_to is null
    and ( lower(regexp_replace(v.name,'\s+','','g')) = lower(regexp_replace(coalesce(p_name,''),'\s+','','g'))
       or (coalesce(p_address,'') <> '' and
           lower(regexp_replace(coalesce(v.address,''),'[^a-z0-9]','','gi')) =
           lower(regexp_replace(p_address,'[^a-z0-9]','','gi'))) );
$$;

create or replace function public.create_venue(
  p_name text, p_venue_type text, p_address text default null,
  p_geo_lat numeric default null, p_geo_lng numeric default null,
  p_contacts jsonb default '[]'::jsonb, p_management text default null, p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid; v_dupes jsonb;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'VENUE_NAME_REQUIRED'; end if;
  v_dupes := public.venue_duplicate_candidates(p_name, p_address);   -- advisory, never blocks
  insert into public.venue (tenant_id, name, venue_type, address, geo_lat, geo_lng, contacts, management, notes, created_by)
    values (v_tenant, trim(p_name), p_venue_type, p_address, p_geo_lat, p_geo_lng,
            coalesce(p_contacts,'[]'::jsonb), p_management, p_notes, public.action_actor())
    returning id into v_id;
  return jsonb_build_object('venue_id', v_id, 'possible_duplicates', v_dupes);
end $$;

-- whitelisted reference-field update (no redirect_to, no tenant_id — I-V9)
create or replace function public.update_venue_details(p_venue uuid, p_fields jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); f text;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  perform 1 from public.venue where id=p_venue and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  for f in select jsonb_object_keys(coalesce(p_fields,'{}'::jsonb)) loop
    if f not in ('name','venue_type','address','geo_lat','geo_lng','contacts','management','notes')
      then raise exception 'VENUE_FIELD_FORBIDDEN: %', f; end if;
  end loop;
  update public.venue set
    name       = coalesce(nullif(trim(p_fields->>'name'),''), name),
    venue_type = coalesce(p_fields->>'venue_type', venue_type),
    address    = case when p_fields ? 'address' then p_fields->>'address' else address end,
    geo_lat    = case when p_fields ? 'geo_lat' then (p_fields->>'geo_lat')::numeric else geo_lat end,
    geo_lng    = case when p_fields ? 'geo_lng' then (p_fields->>'geo_lng')::numeric else geo_lng end,
    contacts   = case when p_fields ? 'contacts' then p_fields->'contacts' else contacts end,
    management = case when p_fields ? 'management' then p_fields->>'management' else management end,
    notes      = case when p_fields ? 'notes' then p_fields->>'notes' else notes end
  where id=p_venue and tenant_id=v_tenant;
  return jsonb_build_object('venue_id', p_venue);
end $$;

create or replace function public.add_venue_space(
  p_venue uuid, p_kind text, p_name text,
  p_parent uuid default null, p_contended boolean default false, p_sort int default 0
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  perform 1 from public.venue where id=p_venue and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  insert into public.venue_space (tenant_id, venue_id, parent_space_id, kind, name, contended, sort_order, created_by)
    values (v_tenant, p_venue, p_parent, p_kind, p_name, coalesce(p_contended,false), coalesce(p_sort,0), public.action_actor())
    returning id into v_id;      -- kind check + nesting guard enforce I-V3
  return jsonb_build_object('space_id', v_id);
end $$;

create or replace function public.record_walkthrough(
  p_venue uuid, p_purpose text, p_conducted_at timestamptz,
  p_engagement uuid default null, p_participants jsonb default '[]'::jsonb,
  p_rep_involvement text default 'none', p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  perform 1 from public.venue where id=p_venue and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  insert into public.venue_walkthrough
      (tenant_id, venue_id, engagement_ref, purpose, conducted_at, participants, rep_involvement, notes, created_by)
    values (v_tenant, p_venue, p_engagement, p_purpose, p_conducted_at,
            coalesce(p_participants,'[]'::jsonb), coalesce(p_rep_involvement,'none'), p_notes, public.action_actor())
    returning id into v_id;
  return jsonb_build_object('walkthrough_id', v_id);
end $$;

create or replace function public.declare_walkthrough_coverage(
  p_walkthrough uuid, p_status text, p_space uuid default null, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); v_venue uuid; v_id uuid;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  select venue_id into v_venue from public.venue_walkthrough where id=p_walkthrough and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if p_space is not null and not exists
     (select 1 from public.venue_space s where s.id=p_space and s.venue_id=v_venue and s.tenant_id=v_tenant)
    then raise exception 'OBSERVATION_INVALID_SCOPE'; end if;
  insert into public.walkthrough_coverage (tenant_id, walkthrough_id, space_id, status, note)
    values (v_tenant, p_walkthrough, p_space, p_status, p_note) returning id into v_id;
  return jsonb_build_object('coverage_id', v_id);
end $$;

create or replace function public.record_evidence(
  p_venue uuid, p_kind text, p_label text,
  p_walkthrough uuid default null, p_bytes bytea default null, p_hash text default null,
  p_meta jsonb default '{}'::jsonb, p_replaces uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid; v_hash text;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  perform 1 from public.venue where id=p_venue and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if p_walkthrough is not null and not exists
     (select 1 from public.venue_walkthrough w where w.id=p_walkthrough and w.venue_id=p_venue and w.tenant_id=v_tenant)
    then raise exception 'OBSERVATION_INVALID_SCOPE'; end if;
  if p_replaces is not null and not exists
     (select 1 from public.venue_evidence e where e.id=p_replaces and e.venue_id=p_venue and e.tenant_id=v_tenant)
    then raise exception 'EVIDENCE_INVALID_REPLACES'; end if;
  v_hash := case when p_bytes is not null then encode(extensions.digest(p_bytes,'sha256'),'hex') else p_hash end;
  if coalesce(v_hash,'') = '' then raise exception 'EVIDENCE_HASH_REQUIRED'; end if;
  insert into public.venue_evidence
      (tenant_id, venue_id, walkthrough_id, kind, label, content_bytes, content_hash, meta, replaces_evidence_id, uploaded_by)
    values (v_tenant, p_venue, p_walkthrough, p_kind, p_label, p_bytes, v_hash,
            coalesce(p_meta,'{}'::jsonb), p_replaces, public.action_actor())
    returning id into v_id;
  return jsonb_build_object('evidence_id', v_id, 'content_hash', v_hash);
end $$;

-- record_observation: the structured-value law lives here — a feasibility value
-- must be structured; narrative may accompany, never replace.
create or replace function public.record_observation(
  p_venue uuid, p_attribute text, p_value_kind text, p_value jsonb, p_source_class text,
  p_observed_at timestamptz,
  p_walkthrough uuid default null, p_scope_space uuid default null, p_scope_space2 uuid default null,
  p_narrative text default null, p_method text default null, p_confidence text default null,
  p_effective timestamptz default null, p_expires timestamptz default null,
  p_condition text default null, p_evidence uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  perform 1 from public.venue where id=p_venue and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if coalesce(trim(p_attribute),'') = '' then raise exception 'OBSERVATION_ATTRIBUTE_REQUIRED'; end if;
  if p_value is null or p_value = 'null'::jsonb or (jsonb_typeof(p_value)='object' and p_value='{}'::jsonb)
    then raise exception 'OBSERVATION_VALUE_REQUIRED: structured value may not be empty (narrative cannot replace it)'; end if;
  insert into public.venue_observation
      (tenant_id, venue_id, walkthrough_id, scope_space_id, scope_space2_id, attribute_key,
       value_kind, value, narrative, observer, observed_at, source_class, method, confidence,
       effective_at, expires_at, condition_key, evidence_refs, created_by)
    values (v_tenant, p_venue, p_walkthrough, p_scope_space, p_scope_space2, trim(p_attribute),
            p_value_kind, p_value, p_narrative, public.action_actor(), p_observed_at, p_source_class,
            p_method, p_confidence, p_effective, p_expires, p_condition, coalesce(p_evidence,'{}'), public.action_actor())
    returning id into v_id;   -- check constraints enforce I-V6; trigger enforces I-V7
  return jsonb_build_object('observation_id', v_id);
end $$;

create or replace function public.supersede_observation(p_observation uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  perform 1 from public.venue_observation where id=p_observation and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'SUPERSESSION_REASON_REQUIRED'; end if;
  begin
    insert into public.venue_observation_supersession (tenant_id, observation_id, actor, reason)
      values (v_tenant, p_observation, public.action_actor(), p_reason) returning id into v_id;
  exception when unique_violation then
    raise exception 'OBSERVATION_ALREADY_SUPERSEDED';
  end;
  return jsonb_build_object('supersession_id', v_id);
end $$;

-- merge_venues: additive redirect only. Locks both venues in uuid order (no
-- deadlock); refuses self-merge, an already-merged source, a redirected target.
create or replace function public.merge_venues(p_from uuid, p_into uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); a uuid; b uuid; v_from record; v_into record;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  if p_from = p_into then raise exception 'VENUE_MERGE_SELF'; end if;
  a := least(p_from, p_into); b := greatest(p_from, p_into);
  perform 1 from public.venue where id=a and tenant_id=v_tenant for update;
  perform 1 from public.venue where id=b and tenant_id=v_tenant for update;
  select * into v_from from public.venue where id=p_from and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  select * into v_into from public.venue where id=p_into and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_from.redirect_to is not null then raise exception 'VENUE_ALREADY_MERGED'; end if;
  if v_into.redirect_to is not null then raise exception 'VENUE_MERGE_TARGET_REDIRECTED'; end if;
  update public.venue set redirect_to = p_into,
    notes = coalesce(notes,'') || case when p_reason is not null then E'\n[merged: '||p_reason||']' else '' end
    where id = p_from and tenant_id = v_tenant;
  return jsonb_build_object('merged', p_from, 'into', p_into);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'can_manage_venues()','venue_duplicate_candidates(text,text)',
    'create_venue(text,text,text,numeric,numeric,jsonb,text,text)',
    'update_venue_details(uuid,jsonb)','add_venue_space(uuid,text,text,uuid,boolean,int)',
    'record_walkthrough(uuid,text,timestamptz,uuid,jsonb,text,text)',
    'declare_walkthrough_coverage(uuid,text,uuid,text)',
    'record_evidence(uuid,text,text,uuid,bytea,text,jsonb,uuid)',
    'record_observation(uuid,text,text,jsonb,text,timestamptz,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,uuid[])',
    'supersede_observation(uuid,text)','merge_venues(uuid,uuid,text)'] loop
    if exists (select 1 from pg_roles where rolname='authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn); end if;
    if exists (select 1 from pg_roles where rolname='app_user') then
      execute format('grant execute on function public.%s to app_user', fn); end if;
  end loop;
end $$;
