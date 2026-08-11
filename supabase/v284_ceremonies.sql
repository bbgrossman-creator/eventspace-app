-- ═══════════════════════════════════════════════════════════════════════════
-- v284 — PROPOSAL OPERATIONAL INTEGRATION · CEREMONIES  [MIGRATION]
-- attach (pin, defaults to the CURRENT revision at attach time and then never
-- moves), refresh (explicit whole-revision adoption; orphaned overrides
-- surface as inert lineage), override (four kinds, validated, attributed).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.attach_component_profile(
  p_event_component uuid, p_library_component uuid, p_revision uuid default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); v_rev uuid; v_no int;
begin
  if not public.can_manage_library() then raise exception 'LIBRARY_NOT_AUTHORIZED'; end if;
  perform 1 from public.event_components where id=p_event_component and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.library_component where id=p_library_component and tenant_id=v_tenant and active;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  v_rev := coalesce(p_revision, public.profile_current_revision(p_library_component));
  if v_rev is null then raise exception 'PROFILE_NO_REVISION'; end if;
  update public.event_components
     set library_component_id = p_library_component, profile_revision_id = v_rev
   where id = p_event_component and tenant_id = v_tenant;   -- pin guard validates coherence
  select revision_no into v_no from public.component_profile_revision where id=v_rev;
  return jsonb_build_object('event_component_id', p_event_component,
                            'profile_revision_id', v_rev, 'revision_no', v_no);
end $$;

create or replace function public.refresh_component_profile(
  p_event_component uuid, p_revision uuid default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); ec record; v_rev uuid; v_no int; orphaned int;
begin
  if not public.can_manage_library() then raise exception 'LIBRARY_NOT_AUTHORIZED'; end if;
  select * into ec from public.event_components where id=p_event_component and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if ec.library_component_id is null then raise exception 'PROFILE_NOT_PINNED'; end if;
  v_rev := coalesce(p_revision, public.profile_current_revision(ec.library_component_id));
  if v_rev is null then raise exception 'PROFILE_NO_REVISION'; end if;
  update public.event_components set profile_revision_id = v_rev
   where id = p_event_component and tenant_id = v_tenant;   -- whole-revision adoption
  select revision_no into v_no from public.component_profile_revision where id=v_rev;
  select count(*) into orphaned from public.component_profile_override o
    where o.event_component_id=p_event_component and o.tenant_id=v_tenant
      and o.kind in ('suppress','replace')
      and not exists (select 1 from public.profile_requirement q
                       where q.id=o.target_requirement_id and q.revision_id=v_rev);
  return jsonb_build_object('event_component_id', p_event_component,
                            'profile_revision_id', v_rev, 'revision_no', v_no,
                            'orphaned_overrides', orphaned);
end $$;

create or replace function public.override_component_requirement(
  p_event_component uuid, p_kind text,
  p_target uuid default null, p_param_name text default null, p_param_value text default null,
  p_requirement jsonb default null, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); ec record; v_err text; v_id uuid;
begin
  if not public.can_manage_library() then raise exception 'LIBRARY_NOT_AUTHORIZED'; end if;
  select * into ec from public.event_components where id=p_event_component and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if ec.profile_revision_id is null then raise exception 'PROFILE_NOT_PINNED'; end if;
  if p_kind='parameter' then
    if p_param_name is null or not public.profile_param_valid(p_param_name)
      then raise exception 'OVERRIDE_INVALID_PARAMETER'; end if;
    if coalesce(trim(p_param_value),'') = '' then raise exception 'OVERRIDE_VALUE_REQUIRED'; end if;
  elsif p_kind in ('suppress','replace') then
    if p_target is null or not exists (select 1 from public.profile_requirement q
        where q.id=p_target and q.revision_id=ec.profile_revision_id and q.tenant_id=v_tenant)
      then raise exception 'OVERRIDE_INVALID_TARGET: must reference a requirement of the pinned revision'; end if;
    if p_kind='suppress' and coalesce(trim(p_reason),'') = ''
      then raise exception 'OVERRIDE_REASON_REQUIRED'; end if;
  end if;
  if p_kind in ('add','replace') then
    if p_requirement is null then raise exception 'OVERRIDE_REQUIREMENT_REQUIRED'; end if;
    v_err := public.profile_requirement_decl_valid(p_requirement);
    if v_err is not null then raise exception '%', v_err; end if;
  end if;
  insert into public.component_profile_override
      (tenant_id, event_component_id, kind, target_requirement_id, param_name, param_value, requirement, reason, actor)
    values (v_tenant, p_event_component, p_kind, p_target, p_param_name, p_param_value, p_requirement,
            nullif(trim(coalesce(p_reason,'')),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('override_id', v_id, 'kind', p_kind);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'attach_component_profile(uuid,uuid,uuid)','refresh_component_profile(uuid,uuid)',
    'override_component_requirement(uuid,text,uuid,text,text,jsonb,text)'] loop
    if exists (select 1 from pg_roles where rolname='authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn); end if;
    if exists (select 1 from pg_roles where rolname='app_user') then
      execute format('grant execute on function public.%s to app_user', fn); end if;
  end loop;
end $$;
