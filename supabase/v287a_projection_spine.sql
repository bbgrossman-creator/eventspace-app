-- ════════════════════════════════════════════════════════════════════════════
-- v287a — PROJECTION SPINE
-- The read model beneath every operational surface. Implements the v287 plan
-- under Responsibility OS Constitution v285 Rev B (frozen).
--
-- RULINGS HONOURED
--   1. JSONB filter grammar with CLOSED validation — unknown keys and unknown
--      values refuse as PROJECTION_FILTER_INVALID.
--   2. SQL owns the envelope: as_of, truth_version and counts come from the
--      database that answered.
--   3. event_workspace (v277) is untouched and keeps its consumer.
--   4. (search deferred to v287d)
--   5. PRJ-10 completeness is provable at feed level.
--
-- LAYERING
--   L1 state resolvers (v286, unchanged) ← L2 primitives (here) ← L3 composed.
--   Every function here is STABLE, so the engine itself forbids writing and
--   forbids calling anything VOLATILE (R-9, RSP-8).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · CLOSED FILTER GRAMMAR ───────────────────────────────────────────────
-- The grammar is part of the constitutional API surface. It is closed in both
-- directions: unknown keys refuse, and unknown values refuse.
--
--   { "event": uuid, "department": text, "owner": text, "unowned": bool,
--     "states": [text], "scope": "event"|"standing", "risk": bool,
--     "window": {"from": ts, "to": ts}, "text": text }

create or replace function public.validate_projection_filter(p_filter jsonb)
returns jsonb
language plpgsql immutable as $$
declare
  v_allowed  text[] := array['event','department','owner','unowned','states',
                             'scope','risk','window','text'];
  v_states   text[] := array['derived','standing','active','discharged',
                             'lapsed','superseded','void'];
  v_depts    text[] := array['culinary','equipment','staffing','venue','logistics'];
  v_f        jsonb  := coalesce(p_filter, '{}'::jsonb);
  k          text;
  v          text;
  wk         text;
begin
  if jsonb_typeof(v_f) <> 'object' then
    raise exception 'PROJECTION_FILTER_INVALID: filter must be a JSON object';
  end if;

  -- closed key set
  for k in select jsonb_object_keys(v_f) loop
    if not (k = any(v_allowed)) then
      raise exception 'PROJECTION_FILTER_INVALID: unknown filter key %', k;
    end if;
  end loop;

  -- closed value vocabularies
  if v_f ? 'states' then
    if jsonb_typeof(v_f->'states') <> 'array' then
      raise exception 'PROJECTION_FILTER_INVALID: states must be an array';
    end if;
    for v in select jsonb_array_elements_text(v_f->'states') loop
      if not (v = any(v_states)) then
        raise exception 'PROJECTION_FILTER_INVALID: unknown state %', v;
      end if;
    end loop;
  end if;

  if v_f ? 'department' and not ((v_f->>'department') = any(v_depts)) then
    raise exception 'PROJECTION_FILTER_INVALID: unknown department %', v_f->>'department';
  end if;

  if v_f ? 'scope' and not ((v_f->>'scope') in ('event','standing')) then
    raise exception 'PROJECTION_FILTER_INVALID: unknown scope %', v_f->>'scope';
  end if;

  if v_f ? 'unowned' and jsonb_typeof(v_f->'unowned') <> 'boolean' then
    raise exception 'PROJECTION_FILTER_INVALID: unowned must be boolean';
  end if;
  if v_f ? 'risk' and jsonb_typeof(v_f->'risk') <> 'boolean' then
    raise exception 'PROJECTION_FILTER_INVALID: risk must be boolean';
  end if;

  if v_f ? 'window' then
    if jsonb_typeof(v_f->'window') <> 'object' then
      raise exception 'PROJECTION_FILTER_INVALID: window must be an object';
    end if;
    for wk in select jsonb_object_keys(v_f->'window') loop
      if not (wk in ('from','to')) then
        raise exception 'PROJECTION_FILTER_INVALID: unknown window key %', wk;
      end if;
    end loop;
  end if;

  if v_f ? 'event' then
    begin
      perform (v_f->>'event')::uuid;
    exception when others then
      raise exception 'PROJECTION_FILTER_INVALID: event must be a uuid';
    end;
  end if;

  return v_f;
end $$;

-- ── 2 · TRUTH VERSION ───────────────────────────────────────────────────────
-- A cheap deterministic fingerprint of the truth a projection reflects. Same
-- truth ⇒ same version. It is NOT a cache and nothing is stored; it exists so
-- a future lawful, reconstructible cache remains possible without one now.
create or replace function public.projection_truth_version()
returns text
language sql stable security definer set search_path = public as $$
  select encode(extensions.digest(
    coalesce((select count(*)::text||':'||coalesce(max(o.created_at)::text,'')
                from public.obligation o where o.tenant_id = public.current_tenant_id()),'') || '|' ||
    coalesce((select count(*)::text||':'||coalesce(max(e.created_at)::text,'')
                from public.execution_evidence e where e.tenant_id = public.current_tenant_id()),'') || '|' ||
    coalesce((select count(*)::text||':'||coalesce(max(r.created_at)::text,'')
                from public.responsibility_owner r where r.tenant_id = public.current_tenant_id()),'')
  ,'sha256'),'hex');
$$;

-- ── 3 · ENVELOPE (SQL owns it — ruling 2) ───────────────────────────────────
create or replace function public.projection_envelope(
  p_name text, p_version int, p_as_of timestamptz,
  p_scope jsonb, p_data jsonb, p_counts jsonb
) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'projection', p_name,
    'version',    p_version,
    'as_of',      p_as_of,
    'scope',      coalesce(p_scope,'{}'::jsonb),
    'data',       coalesce(p_data,'[]'::jsonb),
    'counts',     coalesce(p_counts,'{}'::jsonb),
    'provenance', jsonb_build_object('truth_version', public.projection_truth_version())
  );
$$;

-- ── 4 · THE FEED — the spine of the whole layer ─────────────────────────────
-- The ONLY place a Responsibility Record becomes a projected row. Every
-- composed projection is this function with a different filter, which is what
-- makes "one engine, many projections" mechanical rather than aspirational.
create or replace function public.responsibility_feed(
  p_filter jsonb default '{}'::jsonb,
  p_now    timestamptz default now()
) returns table (
  responsibility   uuid,
  scope            text,
  event_ref        uuid,
  department       text,
  kind             text,
  required_outcome text,
  resource_role    text,
  owner            text,
  state            text,
  timing           jsonb,
  risk             jsonb,
  exceptions       int,
  natural_key      text,
  ordering_key     text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_f      jsonb := public.validate_projection_filter(p_filter);
  v_tenant uuid  := public.current_tenant_id();
begin
  return query
  with base as (
    select o.id, o.scope as o_scope, o.event_ref, o.department, o.kind,
           o.required_outcome, o.resource_role, o.timing, o.natural_key,
           public.responsibility_state(o.id, p_now)      as st,
           public.responsibility_current_owner(o.id)     as own,
           coalesce(nullif(o.timing->>'window_end','')::timestamptz,
                    nullif(o.timing->>'due','')::timestamptz)      as w_end,
           coalesce(nullif(o.timing->>'window_start','')::timestamptz) as w_start,
           (select count(*)::int from public.execution_evidence e
             where e.obligation_ref = o.id and e.kind = 'exception')  as exc
      from public.obligation o
     where o.tenant_id = v_tenant
       and (not (v_f ? 'event')      or o.event_ref  = (v_f->>'event')::uuid)
       and (not (v_f ? 'department') or o.department = (v_f->>'department'))
       and (not (v_f ? 'scope')      or o.scope      = (v_f->>'scope'))
       and (not (v_f ? 'text')       or o.required_outcome ilike '%'||(v_f->>'text')||'%'
                                     or coalesce(o.resource_role,'') ilike '%'||(v_f->>'text')||'%')
  ), shaped as (
    select b.*,
           (b.w_end is not null and b.w_end > p_now
              and b.w_end <= p_now + interval '24 hours')            as lapse_soon
      from base b
  )
  select s.id, s.o_scope, s.event_ref, s.department, s.kind,
         s.required_outcome, s.resource_role, s.own, s.st, s.timing,
         jsonb_build_object('lapse_soon', s.lapse_soon,
                            'exceptions', s.exc,
                            'unowned',    (s.own is null)),
         s.exc, s.natural_key,
         -- deterministic, stable ordering: risk first, then state rank,
         -- then window, then natural key (total order, no ties)
         (case when s.st = 'lapsed' then '0'
               when s.lapse_soon    then '1'
               when s.st = 'active' then '2'
               when s.st = 'derived' then '3'
               when s.st = 'standing' then '4'
               else '5' end)
         || '|' || coalesce(to_char(s.w_end at time zone 'UTC','YYYYMMDDHH24MISS'),'99999999999999')
         || '|' || s.natural_key
    from shaped s
   where (not (v_f ? 'states')
          or s.st = any (select jsonb_array_elements_text(v_f->'states')))
     and (not (v_f ? 'owner')   or s.own = (v_f->>'owner'))
     and (not coalesce((v_f->>'unowned')::boolean, false) or s.own is null)
     and (not coalesce((v_f->>'risk')::boolean, false)
          or s.lapse_soon or s.exc > 0 or s.st = 'lapsed')
     and (not (v_f #> '{window,from}' is not null)
          or s.w_end is null or s.w_end >= (v_f#>>'{window,from}')::timestamptz)
     and (not (v_f #> '{window,to}' is not null)
          or s.w_end is null or s.w_end <= (v_f#>>'{window,to}')::timestamptz)
   order by 14;
end $$;

-- ── 5 · DETAIL — one responsibility, fully explained ────────────────────────
-- Answers "why does this exist?" in one read: anchors, ownership history,
-- evidence trail, dependencies, supersession chain.
create or replace function public.responsibility_detail(
  p_responsibility uuid,
  p_now            timestamptz default now()
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_o      public.obligation%rowtype;
  v_row    jsonb;
begin
  select * into v_o from public.obligation o
   where o.id = p_responsibility and o.tenant_id = v_tenant;
  if not found then return null; end if;

  select to_jsonb(f) into v_row from public.responsibility_feed(
    jsonb_build_object('event', v_o.event_ref), p_now) f
   where f.responsibility = p_responsibility;

  -- standing responsibilities carry no event; fall back to an unfiltered read
  if v_row is null then
    select to_jsonb(f) into v_row
      from public.responsibility_feed('{}'::jsonb, p_now) f
     where f.responsibility = p_responsibility;
  end if;

  return jsonb_build_object(
    'row', v_row,
    'anchors', jsonb_build_object(
        'origin_kind',     v_o.origin_kind,
        'origin_ref',      v_o.origin_ref,
        'origin_revision', v_o.origin_revision,
        'declared',        v_o.anchors),
    'ownership', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'action', ro.action, 'owner', ro.owner,
                 'prior_owner', ro.prior_owner, 'actor', ro.actor,
                 'moment', ro.moment) order by ro.seq)
          from public.responsibility_owner ro
         where ro.responsibility_ref = p_responsibility
           and ro.tenant_id = v_tenant), '[]'::jsonb),
    'evidence', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'kind', e.kind, 'actor', e.actor, 'moment', e.moment,
                 'payload', e.payload) order by e.moment)
          from public.execution_evidence e
         where e.obligation_ref = p_responsibility
           and e.tenant_id = v_tenant), '[]'::jsonb),
    'dependencies', coalesce(v_o.dependencies, '[]'::jsonb),
    'supersedes', v_o.supersedes_ref,
    'superseded_by', (select r.id from public.obligation r
                       where r.supersedes_ref = p_responsibility
                         and r.tenant_id = v_tenant limit 1)
  );
end $$;

-- ── 6 · OWNERSHIP HISTORY — the ledger, projected ───────────────────────────
create or replace function public.ownership_history(p_responsibility uuid)
returns table (seq bigint, action text, owner text, prior_owner text,
               actor text, moment timestamptz)
language sql stable security definer set search_path = public as $$
  select ro.seq, ro.action, ro.owner, ro.prior_owner, ro.actor, ro.moment
    from public.responsibility_owner ro
   where ro.responsibility_ref = p_responsibility
     and ro.tenant_id = public.current_tenant_id()
   order by ro.seq;
$$;

-- ── 7 · FIRST COMPOSED PROJECTION — proves the envelope convention ──────────
-- Deliberately thin: feed + counts + envelope. No state logic lives here.
create or replace function public.projection_feed(
  p_filter jsonb default '{}'::jsonb,
  p_now    timestamptz default now()
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_f     jsonb := public.validate_projection_filter(p_filter);
  v_data  jsonb;
  v_counts jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(f) order by f.ordering_key), '[]'::jsonb)
    into v_data from public.responsibility_feed(v_f, p_now) f;

  select jsonb_build_object(
           'total',      count(*),
           'unowned',    count(*) filter (where f.owner is null),
           'at_risk',    count(*) filter (where (f.risk->>'lapse_soon')::boolean
                                            or f.exceptions > 0
                                            or f.state = 'lapsed'),
           'by_state',   coalesce(jsonb_object_agg(f.state, f.n), '{}'::jsonb))
    into v_counts
    from (select f.owner, f.risk, f.exceptions, f.state,
                 count(*) over (partition by f.state) as n
            from public.responsibility_feed(v_f, p_now) f) f;

  return public.projection_envelope('feed', 1, p_now, v_f, v_data, v_counts);
end $$;

-- ── 8 · GRANTS ──────────────────────────────────────────────────────────────
grant execute on function public.validate_projection_filter(jsonb) to authenticated;
grant execute on function public.projection_truth_version() to authenticated;
grant execute on function public.projection_envelope(text,int,timestamptz,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.responsibility_feed(jsonb, timestamptz) to authenticated;
grant execute on function public.responsibility_detail(uuid, timestamptz) to authenticated;
grant execute on function public.ownership_history(uuid) to authenticated;
grant execute on function public.projection_feed(jsonb, timestamptz) to authenticated;
