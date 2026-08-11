-- ═══════════════════════════════════════════════════════════════════════════
-- v280 — VENUE KNOWLEDGE FOUNDATION · DERIVED CURRENT PROFILE  [MIGRATION]
-- Nothing here is stored: the current profile, contradictions, and coverage
-- answers are computed at read time from append-only observations under the
-- frozen precedence rule:
--   applicability first (effective/expiry/condition) → unsuperseded only →
--   HIGHEST SOURCE CLASS GOVERNS → recency wins WITHIN a class → a newer
--   lower-class observation NEVER silently overrides — a material difference
--   derives a contradiction finding while the governing value keeps answering.
-- Three-valued reads: observed | observed_absent | unobserved (I-three-valued).
-- Merge redirects resolve additively: a redirected venue's observations are
-- read through the canonical venue; no row is rewritten.
-- ═══════════════════════════════════════════════════════════════════════════

-- frozen source-class order: 1 = most authoritative
create or replace function public.source_class_rank(p text)
returns int language sql immutable
as $$ select case p
  when 'measurement' then 1 when 'direct_observation' then 2 when 'venue_document' then 3
  when 'venue_rep_statement' then 4 when 'prior_knowledge' then 5 else 99 end $$;

-- follow merge redirects (bounded) → canonical venue id under the tenant
create or replace function public.resolve_venue(p_venue uuid)
returns uuid language plpgsql stable security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); cur uuid := p_venue; nxt uuid; i int := 0;
begin
  loop
    select redirect_to into nxt from public.venue where id=cur and tenant_id=v_tenant;
    if not found then return null; end if;
    exit when nxt is null; cur := nxt; i := i + 1;
    if i > 8 then return cur; end if;
  end loop;
  return cur;
end $$;

-- the merged family: the canonical venue plus every venue redirecting into it
create or replace function public.venue_family(p_canonical uuid)
returns setof uuid language sql stable security definer set search_path = public
as $$
  with recursive fam as (
    select id from public.venue where id = p_canonical and tenant_id = public.current_tenant_id()
    union all
    select v.id from public.venue v join fam on v.redirect_to = fam.id
     where v.tenant_id = public.current_tenant_id()
  ) select id from fam;
$$;

-- the governing observation for (venue-family, scope, attribute) under context
create or replace function public.current_observation(
  p_venue uuid, p_scope_space uuid, p_attribute text,
  p_context timestamptz default now(), p_conditions text[] default null
) returns uuid language sql stable security definer set search_path = public
as $$
  select o.id
  from public.venue_observation o
  where o.tenant_id = public.current_tenant_id()
    and o.venue_id in (select public.venue_family(public.resolve_venue(p_venue)))
    and o.attribute_key = p_attribute
    and (o.scope_space_id is not distinct from p_scope_space)
    and not exists (select 1 from public.venue_observation_supersession s where s.observation_id = o.id)
    and (o.effective_at is null or o.effective_at <= p_context)
    and (o.expires_at   is null or o.expires_at   >  p_context)
    and (o.condition_key is null or (p_conditions is not null and o.condition_key = any(p_conditions)))
  order by public.source_class_rank(o.source_class) asc, o.observed_at desc, o.created_at desc
  limit 1;
$$;

-- the three-valued profile read with provenance and derived contradiction
create or replace function public.venue_profile_read(
  p_venue uuid, p_scope_space uuid, p_attribute text,
  p_context timestamptz default now(), p_conditions text[] default null
) returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_gov uuid; g record; d record; v_contra jsonb := null;
begin
  if public.resolve_venue(p_venue) is null then return null; end if;   -- cross-tenant: nothing
  v_gov := public.current_observation(p_venue, p_scope_space, p_attribute, p_context, p_conditions);
  if v_gov is null then
    return jsonb_build_object('status','unobserved','attribute',p_attribute,'scope_space',p_scope_space);
  end if;
  select * into g from public.venue_observation where id = v_gov;
  -- contradiction: a NEWER, LOWER-class, applicable, unsuperseded observation
  -- whose value materially differs. It never overrides; it derives a finding.
  select o.* into d from public.venue_observation o
    where o.tenant_id = public.current_tenant_id()
      and o.venue_id in (select public.venue_family(public.resolve_venue(p_venue)))
      and o.attribute_key = p_attribute
      and (o.scope_space_id is not distinct from p_scope_space)
      and not exists (select 1 from public.venue_observation_supersession s where s.observation_id = o.id)
      and (o.effective_at is null or o.effective_at <= p_context)
      and (o.expires_at   is null or o.expires_at   >  p_context)
      and (o.condition_key is null or (p_conditions is not null and o.condition_key = any(p_conditions)))
      and public.source_class_rank(o.source_class) > public.source_class_rank(g.source_class)
      and o.observed_at > g.observed_at
      and o.value is distinct from g.value
    order by o.observed_at desc limit 1;
  if found then
    v_contra := jsonb_build_object('disputing_observation', d.id, 'source_class', d.source_class,
                                   'observed_at', d.observed_at, 'value', d.value, 'observer', d.observer);
  end if;
  return jsonb_build_object(
    'status', case when g.value_kind = 'absent' then 'observed_absent' else 'observed' end,
    'attribute', p_attribute, 'scope_space', p_scope_space,
    'value', g.value, 'value_kind', g.value_kind, 'narrative', g.narrative,
    'source_class', g.source_class, 'observed_at', g.observed_at, 'observer', g.observer,
    'observation_id', g.id, 'evidence_refs', to_jsonb(g.evidence_refs),
    'contradiction', v_contra);
end $$;

-- the full profile: every (scope, attribute) pair known to the family
create or replace function public.venue_profile(
  p_venue uuid, p_context timestamptz default now(), p_conditions text[] default null
) returns jsonb language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(
           public.venue_profile_read(p_venue, k.scope_space_id, k.attribute_key, p_context, p_conditions)
           order by k.attribute_key), '[]'::jsonb)
  from (select distinct o.scope_space_id, o.attribute_key
          from public.venue_observation o
         where o.tenant_id = public.current_tenant_id()
           and o.venue_id in (select public.venue_family(public.resolve_venue(p_venue)))) k;
$$;

-- all derived contradictions for a venue (work-projection food, later slice)
create or replace function public.venue_contradictions(
  p_venue uuid, p_context timestamptz default now(), p_conditions text[] default null
) returns jsonb language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(e), '[]'::jsonb) from (
    select public.venue_profile_read(p_venue, k.scope_space_id, k.attribute_key, p_context, p_conditions) e
      from (select distinct o.scope_space_id, o.attribute_key
              from public.venue_observation o
             where o.tenant_id = public.current_tenant_id()
               and o.venue_id in (select public.venue_family(public.resolve_venue(p_venue)))) k
  ) q where e->'contradiction' is not null and e->>'contradiction' is not null;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'source_class_rank(text)','resolve_venue(uuid)','venue_family(uuid)',
    'current_observation(uuid,uuid,text,timestamptz,text[])',
    'venue_profile_read(uuid,uuid,text,timestamptz,text[])',
    'venue_profile(uuid,timestamptz,text[])','venue_contradictions(uuid,timestamptz,text[])'] loop
    if exists (select 1 from pg_roles where rolname='authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn); end if;
    if exists (select 1 from pg_roles where rolname='app_user') then
      execute format('grant execute on function public.%s to app_user', fn); end if;
  end loop;
end $$;
