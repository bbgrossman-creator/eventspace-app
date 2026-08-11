-- ═══════════════════════════════════════════════════════════════════════════
-- v275 — EXECUTION OS PROJECTIONS (I-34). The AUTHORITATIVE derivation of
-- operational state from immutable evidence + dependencies. "One derivation, many
-- renderings" (the deployed obligations.ts law): the state is computed HERE, once,
-- and every renderer (DailyOps, badges, oversight) calls it — never its own copy.
-- Read-only; stores nothing. Provable at the SQL layer, so no UI depends on an
-- unproven assumption.
--
--   obligation_state(uuid)  → blocked | ready | active | complete | exception | invalidated
--   event_readiness(uuid)   → per-department roll-up + named blockers (explanatory)
-- ═══════════════════════════════════════════════════════════════════════════

-- is the obligation carrying a given natural_key complete? (a completion fact not
-- later invalidated). Used to evaluate dependency predicates.
create or replace function public.obligation_nk_complete(p_event uuid, p_nk text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.obligation o
      join public.execution_evidence e
        on e.obligation_ref = o.id and e.kind = 'completion'
     where o.event_ref = p_event and o.natural_key = p_nk
       and o.tenant_id = public.current_tenant_id()
       and not exists (select 1 from public.execution_evidence i
                        where i.obligation_ref = o.id and i.kind = 'invalidated'
                          and i.moment >= e.moment)
  );
$$;

-- the projection (I-34): obligation state is DERIVED, never stored.
create or replace function public.obligation_state(p_obligation uuid)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_event  uuid;
  v_deps   jsonb;
  v_dep    text;
  v_blocked boolean := false;
begin
  select event_ref, dependencies into v_event, v_deps
    from public.obligation where id = p_obligation and tenant_id = v_tenant;
  if not found then return null; end if;  -- not visible / not ours

  -- correction outcomes and progress, most-decisive first
  if exists (select 1 from public.execution_evidence
              where obligation_ref = p_obligation and kind = 'invalidated') then
    return 'invalidated';
  end if;
  if exists (select 1 from public.execution_evidence
              where obligation_ref = p_obligation and kind = 'exception') then
    return 'exception';
  end if;
  if exists (select 1 from public.execution_evidence
              where obligation_ref = p_obligation and kind = 'completion') then
    return 'complete';
  end if;
  if exists (select 1 from public.execution_evidence
              where obligation_ref = p_obligation and kind in ('assignment','scan','inspection')) then
    return 'active';
  end if;

  -- otherwise ready/blocked by the dependency predicate over facts
  for v_dep in select jsonb_array_elements_text(coalesce(v_deps,'[]'::jsonb)) loop
    if not public.obligation_nk_complete(v_event, v_dep) then v_blocked := true; end if;
  end loop;
  return case when v_blocked then 'blocked' else 'ready' end;
end $$;

-- readiness roll-up (SPEC 65): explanatory, per department, with named blockers.
create or replace function public.event_readiness(p_event uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with st as (
    select o.department,
           public.obligation_state(o.id) as state,
           o.required_outcome,
           o.dependencies
      from public.obligation o
     where o.event_ref = p_event and o.tenant_id = public.current_tenant_id()
  )
  select jsonb_build_object(
    'by_department', coalesce((
      select jsonb_object_agg(department, counts) from (
        select department, jsonb_object_agg(state, n) as counts
          from (select department, state, count(*) n from st
                 where state is not null group by department, state) g
         group by department
      ) d
    ), '{}'::jsonb),
    'blocked', coalesce((select count(*) from st where state = 'blocked'), 0),
    'ready',   coalesce((select count(*) from st where state = 'ready'), 0),
    'active',  coalesce((select count(*) from st where state = 'active'), 0),
    'complete',coalesce((select count(*) from st where state = 'complete'), 0),
    'exception',coalesce((select count(*) from st where state = 'exception'), 0),
    'total',   coalesce((select count(*) from st where state is not null), 0)
  );
$$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.obligation_state(uuid), public.event_readiness(uuid),
                             public.obligation_nk_complete(uuid,text) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant execute on function public.obligation_state(uuid), public.event_readiness(uuid),
                             public.obligation_nk_complete(uuid,text) to app_user;
  end if;
end $$;
