-- ═══════════════════════════════════════════════════════════════════════════
-- v283 — COMPONENT OPERATIONAL PROFILE · CEREMONIES & PROJECTIONS  [MIGRATION]
-- author_profile_revision is the ONLY writer of revisions and requirement
-- rows: it locks the component, assigns revision_no, validates every
-- declaration against the server vocabularies, and inserts the COMPLETE set
-- atomically — which is what makes "never a mixed revision" structural.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.can_manage_library()
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

create or replace function public.library_duplicate_candidates(p_name text)
returns jsonb language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name)), '[]'::jsonb)
  from public.library_component c
  where c.tenant_id = public.current_tenant_id() and c.active
    and lower(regexp_replace(c.name,'\s+','','g')) = lower(regexp_replace(coalesce(p_name,''),'\s+','','g'));
$$;

create or replace function public.create_library_component(
  p_name text, p_kind text default 'general', p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid; v_dupes jsonb;
begin
  if not public.can_manage_library() then raise exception 'LIBRARY_NOT_AUTHORIZED'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'LIBRARY_NAME_REQUIRED'; end if;
  v_dupes := public.library_duplicate_candidates(p_name);   -- advisory, never blocks
  insert into public.library_component (tenant_id, name, kind, notes, created_by)
    values (v_tenant, trim(p_name), coalesce(p_kind,'general'), p_notes, public.action_actor())
    returning id into v_id;
  return jsonb_build_object('component_id', v_id, 'possible_duplicates', v_dupes);
end $$;

create or replace function public.update_library_component_details(p_component uuid, p_fields jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); f text;
begin
  if not public.can_manage_library() then raise exception 'LIBRARY_NOT_AUTHORIZED'; end if;
  perform 1 from public.library_component where id=p_component and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  for f in select jsonb_object_keys(coalesce(p_fields,'{}'::jsonb)) loop
    if f not in ('name','kind','notes','active') then raise exception 'LIBRARY_FIELD_FORBIDDEN: %', f; end if;
  end loop;
  update public.library_component set
    name  = coalesce(nullif(trim(p_fields->>'name'),''), name),
    kind  = coalesce(p_fields->>'kind', kind),
    notes = case when p_fields ? 'notes' then p_fields->>'notes' else notes end,
    active = coalesce((p_fields->>'active')::boolean, active)
  where id=p_component and tenant_id=v_tenant;
  return jsonb_build_object('component_id', p_component);
end $$;

-- author_profile_revision: the atomic complete-set writer.
-- p_requirements: jsonb array of declaration objects (see field names below).
create or replace function public.author_profile_revision(
  p_component uuid, p_requirements jsonb, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); v_rev uuid; v_no int; v_prev uuid;
  r jsonb; i int := 0; v_fam text; v_kind text; v_unit text; v_basis text;
begin
  if not public.can_manage_library() then raise exception 'LIBRARY_NOT_AUTHORIZED'; end if;
  perform 1 from public.library_component where id=p_component and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if p_requirements is null or jsonb_typeof(p_requirements) <> 'array' or jsonb_array_length(p_requirements)=0
    then raise exception 'REVISION_REQUIREMENTS_REQUIRED'; end if;

  -- pre-validate the WHOLE set before writing anything (atomic authorship)
  for r in select * from jsonb_array_elements(p_requirements) loop
    i := i + 1;
    v_fam := r->>'family'; v_kind := r->>'kind'; v_unit := r->>'unit'; v_basis := r->>'basis';
    if not public.profile_family_valid(coalesce(v_fam,'')) then raise exception 'REQUIREMENT_INVALID_FAMILY: row %', i; end if;
    if not public.profile_kind_valid(v_fam, coalesce(v_kind,'')) then raise exception 'REQUIREMENT_INVALID_KIND: row %', i; end if;
    if not public.profile_unit_valid(v_fam, coalesce(v_unit,'')) then raise exception 'REQUIREMENT_INVALID_UNIT: row %', i; end if;
    if coalesce(v_basis,'') not in ('fixed','per_instance','per_service_point','per_guest','per_guest_band','per_table','per_hour','per_shift','per_batch')
      then raise exception 'REQUIREMENT_INVALID_BASIS: row %', i; end if;
    if (r->>'rate') is null then raise exception 'REQUIREMENT_RATE_REQUIRED: row %', i; end if;
    if v_basis='per_guest_band' and coalesce((r->>'band_size')::int,0) <= 0
      then raise exception 'REQUIREMENT_BAND_REQUIRED: row %', i; end if;
    if (r->>'condition_param') is not null and not public.profile_param_valid(r->>'condition_param')
      then raise exception 'REQUIREMENT_INVALID_CONDITION: row %', i; end if;
    if coalesce(r->'payload','{}'::jsonb) ?| array['formula','expr','expression','code','script','eval']
      then raise exception 'NO_EXECUTABLE_FORMULAS: row %', i; end if;
  end loop;

  select id into v_prev from public.component_profile_revision
    where library_component_id=p_component and tenant_id=v_tenant order by seq desc limit 1;
  select coalesce(max(revision_no),0)+1 into v_no from public.component_profile_revision
    where library_component_id=p_component and tenant_id=v_tenant;
  insert into public.component_profile_revision
      (tenant_id, library_component_id, revision_no, reason, supersedes_revision_id, authored_by)
    values (v_tenant, p_component, v_no, nullif(trim(coalesce(p_reason,'')),''), v_prev, public.action_actor())
    returning id into v_rev;

  i := 0;
  for r in select * from jsonb_array_elements(p_requirements) loop
    i := i + 1;
    insert into public.profile_requirement
        (tenant_id, revision_id, family, kind, label, capability, provision_source,
         basis, rate, band_size, min_qty, max_qty, rounding, unit, payload,
         aggregation, temporal, condition_param, condition_value, position)
      values (v_tenant, v_rev, r->>'family', r->>'kind', coalesce(r->>'label', r->>'kind'),
              coalesce((r->>'capability')::boolean,false), coalesce(r->>'provision_source','company'),
              r->>'basis', (r->>'rate')::numeric, (r->>'band_size')::int,
              (r->>'min_qty')::numeric, (r->>'max_qty')::numeric, coalesce(r->>'rounding','ceil'),
              r->>'unit', coalesce(r->'payload','{}'::jsonb),
              coalesce(r->>'aggregation','additive'), coalesce(r->>'temporal','concurrent'),
              r->>'condition_param', r->>'condition_value', i);
  end loop;
  return jsonb_build_object('revision_id', v_rev, 'revision_no', v_no, 'requirement_count', i);
end $$;

-- current revision: derived, deterministic (max seq)
create or replace function public.profile_current_revision(p_component uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.component_profile_revision
   where library_component_id = p_component and tenant_id = public.current_tenant_id()
   order by seq desc limit 1 $$;

-- the Inspector read: component + current (or named) revision + grouped
-- requirements with per-requirement resolution under the given context.
create or replace function public.library_profile(
  p_component uuid, p_context jsonb default null, p_revision uuid default null
) returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); c record; v_rev uuid; rv record; reqs jsonb;
begin
  select * into c from public.library_component where id=p_component and tenant_id=v_tenant;
  if not found then return null; end if;
  v_rev := coalesce(p_revision, public.profile_current_revision(p_component));
  if v_rev is null then
    return jsonb_build_object('component_id', c.id, 'name', c.name, 'kind', c.kind,
                              'revision', null, 'requirements', '[]'::jsonb);
  end if;
  select * into rv from public.component_profile_revision where id=v_rev and tenant_id=v_tenant;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'family', q.family, 'kind', q.kind, 'label', q.label,
           'capability', q.capability, 'provision_source', q.provision_source,
           'basis', q.basis, 'rate', q.rate, 'band_size', q.band_size,
           'min_qty', q.min_qty, 'max_qty', q.max_qty, 'rounding', q.rounding,
           'unit', q.unit, 'aggregation', q.aggregation, 'temporal', q.temporal,
           'condition_param', q.condition_param, 'condition_value', q.condition_value,
           'resolution', case
              when q.condition_param is not null and (p_context is null or p_context->>q.condition_param is distinct from q.condition_value)
                then jsonb_build_object('status','inactive','condition',q.condition_param||'='||q.condition_value)
              else public.resolve_quantity(q.basis, q.rate, q.band_size, q.min_qty, q.max_qty, q.rounding, p_context) end
         ) order by q.family, q.position), '[]'::jsonb)
    into reqs
    from public.profile_requirement q where q.revision_id=v_rev and q.tenant_id=v_tenant;
  return jsonb_build_object('component_id', c.id, 'name', c.name, 'kind', c.kind,
    'revision', jsonb_build_object('id', rv.id, 'revision_no', rv.revision_no,
                                   'authored_by', rv.authored_by, 'created_at', rv.created_at,
                                   'reason', rv.reason),
    'requirements', reqs);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'can_manage_library()','library_duplicate_candidates(text)',
    'create_library_component(text,text,text)','update_library_component_details(uuid,jsonb)',
    'author_profile_revision(uuid,jsonb,text)','profile_current_revision(uuid)',
    'resolve_quantity(text,numeric,int,numeric,numeric,text,jsonb)',
    'library_profile(uuid,jsonb,uuid)'] loop
    if exists (select 1 from pg_roles where rolname='authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn); end if;
    if exists (select 1 from pg_roles where rolname='app_user') then
      execute format('grant execute on function public.%s to app_user', fn); end if;
  end loop;
end $$;
