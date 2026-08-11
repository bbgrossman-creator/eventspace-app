-- ═══════════════════════════════════════════════════════════════════════════
-- v284 — PROPOSAL OPERATIONAL INTEGRATION · RELATIONS & RESOLVERS  [MIGRATION]
-- The bridge: Library revision → PIN on the proposal component instance →
-- append-only overrides → server-side EMBED at publish → legacy projection.
-- Invariants: I-I1 pin coherence (revision belongs to the pinned library
-- component, same tenant — trigger backstop regardless of writer); I-I2 pins
-- never follow the library (embedding reads the pin, nothing reads "current");
-- I-I3 overrides append-only, four kinds, attributed, reasoned where
-- destructive; I-I4 latest-per-target deterministic (seq); I-I5 the embedded
-- basis is complete (revision + declarations + context + resolutions +
-- unresolved + override lineage + aggregation/temporal metadata) and
-- self-contained (no live-library reference after publish); I-I6 the legacy
-- requirement arrays are RENDERED from the basis for pinned components and
-- untouched for unpinned ones (v275/v278 byte-compatible); I-I7 sealed/
-- accepted/released bases immutable (existing snapshot law, hash-proven).
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto;

-- ── the pin (additive nullable columns on the existing instance table) ──────
alter table public.event_components add column if not exists library_component_id uuid references public.library_component(id);
alter table public.event_components add column if not exists profile_revision_id  uuid references public.component_profile_revision(id);

create or replace function public.event_component_pin_guard() returns trigger
language plpgsql as $$
begin
  if (new.library_component_id is null) <> (new.profile_revision_id is null)
    then raise exception 'PIN_INVALID: component and revision must be pinned together'; end if;
  if new.profile_revision_id is not null then
    if not exists (
      select 1 from public.component_profile_revision r
       where r.id = new.profile_revision_id
         and r.library_component_id = new.library_component_id
         and r.tenant_id = new.tenant_id)
      then raise exception 'PIN_INVALID: revision does not belong to the pinned library component'; end if;
  end if;
  return new;
end $$;
drop trigger if exists event_component_pin on public.event_components;
create trigger event_component_pin before insert or update of library_component_id, profile_revision_id
  on public.event_components for each row execute function public.event_component_pin_guard();

-- ── append-only overrides (four kinds) ──────────────────────────────────────
create table if not exists public.component_profile_override (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  event_component_id    uuid not null references public.event_components(id),
  kind                  text not null check (kind in ('parameter','suppress','add','replace')),
  target_requirement_id uuid references public.profile_requirement(id),  -- suppress/replace
  param_name            text check (param_name is null or public.profile_param_valid(param_name)),
  param_value           text,
  requirement           jsonb,                                           -- add/replace declaration
  reason                text,
  actor                 text not null,
  seq                   bigint generated always as identity,
  created_at            timestamptz not null default clock_timestamp(),
  constraint override_shape check (
    (kind='parameter' and param_name is not null and param_value is not null and target_requirement_id is null and requirement is null)
 or (kind='suppress'  and target_requirement_id is not null and requirement is null and coalesce(trim(reason),'') <> '')
 or (kind='add'       and requirement is not null and target_requirement_id is null)
 or (kind='replace'   and target_requirement_id is not null and requirement is not null))
);
create index if not exists cpo_component_idx on public.component_profile_override (tenant_id, event_component_id, seq desc);

alter table public.component_profile_override enable row level security;
do $$ begin
  begin create policy cpo_sel on public.component_profile_override for select
    using (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy cpo_ins on public.component_profile_override for insert
    with check (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
end $$;
do $$ begin
  if exists (select 1 from pg_roles where rolname='authenticated') then grant select, insert on public.component_profile_override to authenticated; end if;
  if exists (select 1 from pg_roles where rolname='app_user') then grant select, insert on public.component_profile_override to authenticated; end if;
end $$;

-- ── requirement-declaration validator (shared by add/replace and authoring) ─
create or replace function public.profile_requirement_decl_valid(r jsonb) returns text
language plpgsql immutable as $$
begin
  if not public.profile_family_valid(coalesce(r->>'family','')) then return 'REQUIREMENT_INVALID_FAMILY'; end if;
  if not public.profile_kind_valid(r->>'family', coalesce(r->>'kind','')) then return 'REQUIREMENT_INVALID_KIND'; end if;
  if not public.profile_unit_valid(r->>'family', coalesce(r->>'unit','')) then return 'REQUIREMENT_INVALID_UNIT'; end if;
  if coalesce(r->>'basis','') not in ('fixed','per_instance','per_service_point','per_guest','per_guest_band','per_table','per_hour','per_shift','per_batch')
    then return 'REQUIREMENT_INVALID_BASIS'; end if;
  if (r->>'rate') is null then return 'REQUIREMENT_RATE_REQUIRED'; end if;
  if (r->>'basis')='per_guest_band' and coalesce((r->>'band_size')::int,0) <= 0 then return 'REQUIREMENT_BAND_REQUIRED'; end if;
  if coalesce(r->'payload','{}'::jsonb) ?| array['formula','expr','expression','code','script','eval'] then return 'NO_EXECUTABLE_FORMULAS'; end if;
  return null;
end $$;

-- ── the single basis resolver (used by UI reads AND publish embedding) ──────
-- Returns the complete self-contained operational basis for one pinned
-- instance under a context. Parameter overrides are folded into the context
-- (latest per param governs). Requirement statuses: active | suppressed |
-- replaced | added; replaced/suppressed carry override lineage.
create or replace function public.component_operational_basis(
  p_event_component uuid, p_context jsonb default '{}'::jsonb
) returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); ec record; rv record; ctx jsonb; o record;
  reqs jsonb := '[]'::jsonb; ov_lineage jsonb := '[]'::jsonb; q record; entry jsonb;
  sup record; rep record; unresolved jsonb := '[]'::jsonb;
begin
  select * into ec from public.event_components where id = p_event_component and tenant_id = v_tenant;
  if not found then return null; end if;
  if ec.profile_revision_id is null then return jsonb_build_object('pinned', false); end if;
  select * into rv from public.component_profile_revision where id = ec.profile_revision_id and tenant_id = v_tenant;

  -- context = supplied context ⊕ parameter overrides (latest per param wins)
  ctx := coalesce(p_context, '{}'::jsonb);
  for o in
    select distinct on (param_name) param_name, param_value
      from public.component_profile_override
     where event_component_id = p_event_component and tenant_id = v_tenant and kind='parameter'
     order by param_name, seq desc
  loop
    ctx := ctx || jsonb_build_object(o.param_name,
             case when o.param_value ~ '^-?[0-9]+(\.[0-9]+)?$' then to_jsonb(o.param_value::numeric) else to_jsonb(o.param_value) end);
  end loop;

  -- library declarations with suppress/replace applied (latest per target)
  for q in select * from public.profile_requirement
            where revision_id = ec.profile_revision_id and tenant_id = v_tenant
            order by family, position loop
    select * into sup from public.component_profile_override
      where event_component_id=p_event_component and tenant_id=v_tenant
        and kind in ('suppress','replace') and target_requirement_id=q.id
      order by seq desc limit 1;
    entry := jsonb_build_object(
      'requirement_id', q.id, 'family', q.family, 'kind', q.kind, 'label', q.label,
      'capability', q.capability, 'provision_source', q.provision_source,
      'basis', q.basis, 'rate', q.rate, 'band_size', q.band_size,
      'min_qty', q.min_qty, 'max_qty', q.max_qty, 'rounding', q.rounding, 'unit', q.unit,
      'aggregation', q.aggregation, 'temporal', q.temporal,
      'condition_param', q.condition_param, 'condition_value', q.condition_value);
    if found and sup.kind='suppress' then
      entry := entry || jsonb_build_object('status','suppressed','override_id',sup.id,'reason',sup.reason,'actor',sup.actor);
    elsif found and sup.kind='replace' then
      entry := entry || jsonb_build_object('status','replaced','override_id',sup.id,'actor',sup.actor,
        'replacement', sup.requirement || jsonb_build_object(
          'resolution', case
            when (sup.requirement->>'condition_param') is not null
                 and ctx->>(sup.requirement->>'condition_param') is distinct from (sup.requirement->>'condition_value')
              then jsonb_build_object('status','inactive')
            else public.resolve_quantity(sup.requirement->>'basis',(sup.requirement->>'rate')::numeric,
                   (sup.requirement->>'band_size')::int,(sup.requirement->>'min_qty')::numeric,
                   (sup.requirement->>'max_qty')::numeric,coalesce(sup.requirement->>'rounding','ceil'),ctx) end));
    else
      entry := entry || jsonb_build_object('status','active',
        'resolution', case
          when q.condition_param is not null and ctx->>q.condition_param is distinct from q.condition_value
            then jsonb_build_object('status','inactive','condition',q.condition_param||'='||q.condition_value)
          else public.resolve_quantity(q.basis,q.rate,q.band_size,q.min_qty,q.max_qty,q.rounding,ctx) end);
    end if;
    reqs := reqs || entry;
  end loop;

  -- engagement-specific additions (each its own declaration)
  for o in select * from public.component_profile_override
            where event_component_id=p_event_component and tenant_id=v_tenant and kind='add'
            order by seq loop
    reqs := reqs || (o.requirement || jsonb_build_object('status','added','override_id',o.id,'actor',o.actor,
      'resolution', case
        when (o.requirement->>'condition_param') is not null
             and ctx->>(o.requirement->>'condition_param') is distinct from (o.requirement->>'condition_value')
          then jsonb_build_object('status','inactive')
        else public.resolve_quantity(o.requirement->>'basis',(o.requirement->>'rate')::numeric,
               (o.requirement->>'band_size')::int,(o.requirement->>'min_qty')::numeric,
               (o.requirement->>'max_qty')::numeric,coalesce(o.requirement->>'rounding','ceil'),ctx) end));
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'target',target_requirement_id,
           'param',param_name,'value',param_value,'reason',reason,'actor',actor,'at',created_at) order by seq),'[]'::jsonb)
    into ov_lineage from public.component_profile_override
    where event_component_id=p_event_component and tenant_id=v_tenant;
  select coalesce(jsonb_agg(distinct e->'resolution'->>'missing'),'[]'::jsonb) into unresolved
    from jsonb_array_elements(reqs) e where e->'resolution'->>'status'='unresolved';

  return jsonb_build_object('pinned', true,
    'library_component_id', ec.library_component_id,
    'profile_revision_id', ec.profile_revision_id,
    'revision_no', rv.revision_no,
    'context', ctx, 'requirements', reqs, 'overrides', ov_lineage, 'unresolved', unresolved);
end $$;

-- ── legacy projection: render the basis into the shipped v275/v278 shape ────
create or replace function public.render_legacy_requirements(p_basis jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select case
      when e->>'family' = 'labor' then
        jsonb_build_object('category','staff',
          'role', coalesce(e->'payload'->>'role', e->>'label'),
          'quantity', coalesce((e->'resolution'->>'quantity')::numeric, (e->>'rate')::numeric))
      when e->>'family' = 'equipment' and e->>'provision_source' = 'rented' then
        jsonb_build_object('category','rental','item', e->>'label')
      when e->>'family' = 'equipment' then
        jsonb_build_object('category','equipment','item', e->>'label')
      when e->>'family' = 'consumable' then
        jsonb_build_object('category','supply','item', e->>'label')
      else null end as x
    from (
      -- effective set: active + added + replacements-in; suppressed/replaced-out/inactive excluded
      select case when e0->>'status'='replaced' then e0->'replacement' else e0 end as e
      from jsonb_array_elements(coalesce(p_basis->'requirements','[]'::jsonb)) e0
      where e0->>'status' in ('active','added','replaced')
    ) eff
    where e->'resolution'->>'status' is distinct from 'inactive'
  ) m where x is not null
$$;

-- ── the embedder (called by publish; also directly provable) ────────────────
-- For every model component whose componentId matches a pinned instance of
-- this version, attach operational_basis and re-render its legacy
-- requirements. Unpinned components pass through BYTE-UNTOUCHED.
create or replace function public.embed_operational_basis(p_version uuid, p_model jsonb)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); comps jsonb := '[]'::jsonb; c jsonb;
  ec record; basis jsonb; ctx jsonb;
begin
  ctx := case when p_model->>'guestCount' ~ '^[0-9]+$'
              then jsonb_build_object('guest_count',(p_model->>'guestCount')::numeric)
              else '{}'::jsonb end;
  for c in select * from jsonb_array_elements(coalesce(p_model->'components','[]'::jsonb)) loop
    select * into ec from public.event_components
      where tenant_id = v_tenant and id::text = c->>'componentId'
        and proposal_version_id = p_version and profile_revision_id is not null;
    if found then
      basis := public.component_operational_basis(ec.id, ctx);
      c := c || jsonb_build_object('operational_basis', basis,
                                   'requirements', public.render_legacy_requirements(basis));
    end if;
    comps := comps || c;
  end loop;
  return jsonb_set(p_model, '{components}', comps);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'profile_requirement_decl_valid(jsonb)',
    'component_operational_basis(uuid,jsonb)','render_legacy_requirements(jsonb)',
    'embed_operational_basis(uuid,jsonb)'] loop
    if exists (select 1 from pg_roles where rolname='authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn); end if;
    if exists (select 1 from pg_roles where rolname='app_user') then
      execute format('grant execute on function public.%s to app_user', fn); end if;
  end loop;
end $$;
