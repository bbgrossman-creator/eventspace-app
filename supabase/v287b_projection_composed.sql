-- ════════════════════════════════════════════════════════════════════════════
-- v287b — COMPOSED PROJECTIONS + RISK FINDINGS
-- Built on the v287a spine. Projection architecture frozen; this slice
-- implements it, it does not reopen it.
--
-- COMPOSITION LAW (proved by PRJ-6/PRJ-10):
--     projection contents ≡ responsibility_feed(envelope.scope, envelope.as_of)
-- Composed projections add ONLY grouping, ordering, counts, contextual
-- information, risk decorations and the SQL-owned envelope. They never compute
-- state, reinterpret ownership, duplicate membership logic, suppress rows
-- outside the declared scope, or write anything.
--
-- RISK IS NOT STATE. Four separate concepts are kept separate:
--   constitutional state  — responsibility_state(), the seven words, only.
--   risk finding          — a projection decoration (this file).
--   exception evidence    — an appended fact; surfaces as a risk finding.
--   staleness finding     — v282 venue knowledge, event-level.
-- 'blocked', 'exception' and 'invalidated' are NEVER emitted as states.
--
-- SNAPSHOT: every composed projection assembles its envelope in ONE statement,
-- so contents, counts and risk decorations share a single database snapshot.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · GROUPING VOCABULARY (closed, like the filter grammar) ───────────────
create or replace function public.validate_projection_group_by(p_group_by text)
returns text
language plpgsql immutable as $$
declare v_allowed text[] := array['department','event','state','owner','resource_role','none'];
begin
  if p_group_by is null then return 'none'; end if;
  if not (p_group_by = any(v_allowed)) then
    raise exception 'PROJECTION_GROUP_BY_INVALID: unknown grouping %', p_group_by;
  end if;
  return p_group_by;
end $$;

-- ── 2 · RISK FINDINGS ───────────────────────────────────────────────────────
-- Computed strictly over responsibility_feed(p_filter), so risk can never
-- invent membership. Emits findings; never a lifecycle state.
create or replace function public.risk_findings(
  p_filter jsonb default '{}'::jsonb,
  p_now    timestamptz default now()
) returns table (
  responsibility uuid,
  event_ref      uuid,
  finding        text,
  severity       text,
  detail         jsonb
)
language plpgsql stable security definer set search_path = public as $$
declare v_f jsonb := public.validate_projection_filter(p_filter);
begin
  return query
  with f as (
    select * from public.responsibility_feed(v_f, p_now)
  ),
  -- 1 · already lapsed (constitutional state, surfaced as critical risk)
  lapsed as (
    select f.responsibility, f.event_ref, 'lapsed'::text, 'critical'::text,
           jsonb_build_object('window_end', f.timing->>'window_end',
                              'due', f.timing->>'due')
      from f where f.state = 'lapsed'
  ),
  -- 2 · approaching lapse
  approaching as (
    select f.responsibility, f.event_ref, 'lapse_approaching'::text, 'warning'::text,
           jsonb_build_object('closes', coalesce(f.timing->>'window_end', f.timing->>'due'))
      from f
     where (f.risk->>'lapse_soon')::boolean
       and f.state not in ('lapsed','discharged','superseded','void')
  ),
  -- 3 · ownerless nearing its execution window
  ownerless_near as (
    select f.responsibility, f.event_ref, 'ownerless_nearing_window'::text, 'warning'::text,
           jsonb_build_object('opens', f.timing->>'window_start',
                              'closes', coalesce(f.timing->>'window_end', f.timing->>'due'))
      from f
     where f.owner is null
       and f.state in ('derived','standing')
       and coalesce(nullif(f.timing->>'window_end','')::timestamptz,
                    nullif(f.timing->>'due','')::timestamptz,
                    nullif(f.timing->>'window_start','')::timestamptz)
             between p_now and p_now + interval '48 hours'
  ),
  -- 4 · dependency / blocked-chain risk (a risk finding, NOT the state 'blocked')
  blocked_chain as (
    select f.responsibility, f.event_ref, 'dependency_blocked'::text, 'advisory'::text,
           jsonb_build_object('unmet', jsonb_agg(d.dep))
      from f
      join public.obligation o on o.id = f.responsibility
      cross join lateral jsonb_array_elements_text(coalesce(o.dependencies,'[]'::jsonb)) as d(dep)
     where f.state = 'standing'
       and o.event_ref is not null
       and not public.obligation_nk_complete(o.event_ref, d.dep)
     group by f.responsibility, f.event_ref
  ),
  -- 5 · recorded exception evidence (evidence, NOT a state)
  exceptions as (
    select f.responsibility, f.event_ref, 'exception_recorded'::text, 'advisory'::text,
           jsonb_build_object('count', f.exceptions)
      from f where f.exceptions > 0
  ),
  -- 6 · v282 venue-knowledge staleness — EVENT-level, so responsibility is null
  staleness as (
    select distinct null::uuid, ev.id,
           ('venue_'||coalesce(fnd->>'kind','finding'))::text,
           coalesce(fnd->>'severity','advisory')::text,
           fnd
      from (select distinct f.event_ref from f where f.event_ref is not null) fe
      join public.event ev on ev.id = fe.event_ref
      join public.engagement_venue_binding b
        on b.booking_id = ev.engagement_ref and b.tenant_id = public.current_tenant_id()
      cross join lateral jsonb_array_elements(
        coalesce(public.venue_knowledge_findings(b.venue_id, p_now), '[]'::jsonb)) as fnd
     where coalesce(fnd->>'kind','') in ('stale','expired','renovation_reverification')
  )
  select * from lapsed
  union all select * from approaching
  union all select * from ownerless_near
  union all select * from blocked_chain
  union all select * from exceptions
  union all select * from staleness;
end $$;

-- ── 3 · SHARED GROUPING HELPER (presentation only — never membership) ───────
create or replace function public.projection_group_key(
  p_group_by text, p_department text, p_event uuid, p_state text,
  p_owner text, p_resource_role text
) returns text
language sql immutable as $$
  select case p_group_by
           when 'department'    then coalesce(p_department,'(none)')
           when 'event'         then coalesce(p_event::text,'(standing)')
           when 'state'         then coalesce(p_state,'(none)')
           when 'owner'         then coalesce(p_owner,'(unassigned)')
           when 'resource_role' then coalesce(p_resource_role,'(none)')
           else '(all)'
         end;
$$;

-- ── 4 · OPERATIONS TODAY ────────────────────────────────────────────────────
-- Declared scope is {} — the whole tenant. `viewer` and `since` are CONTEXT,
-- deliberately NOT membership filters: narrowing membership by viewer would
-- hide other people's ownerless work, which the constitution forbids.
-- The five questions are answered as BANDS over one membership set.
create or replace function public.projection_operations_today(
  p_viewer text default null,
  p_since  timestamptz default null,
  p_now    timestamptz default now()
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_scope jsonb := '{}'::jsonb; v_out jsonb;
begin
  v_out := (
    with f as (select * from public.responsibility_feed(v_scope, p_now)),
         r as (select * from public.risk_findings(v_scope, p_now)),
         ids as (select coalesce(jsonb_agg(to_jsonb(f) order by f.ordering_key),'[]'::jsonb) d,
                        count(*) n from f)
    select public.projection_envelope(
      'operations_today', 1, p_now, v_scope,
      jsonb_build_object(
        'viewer', p_viewer,
        'since',  p_since,
        'responsibilities', (select d from ids),
        'bands', jsonb_build_object(
          'mine',      coalesce((select jsonb_agg(f.responsibility order by f.ordering_key)
                                   from f where p_viewer is not null and f.owner = p_viewer),'[]'::jsonb),
          'ownerless', coalesce((select jsonb_agg(f.responsibility order by f.ordering_key)
                                   from f where f.owner is null),'[]'::jsonb),
          'at_risk',   coalesce((select jsonb_agg(distinct r.responsibility)
                                   from r where r.responsibility is not null),'[]'::jsonb),
          'changed',   coalesce((select jsonb_agg(f.responsibility order by f.ordering_key)
                                   from f join public.obligation o on o.id = f.responsibility
                                  where p_since is not null and o.created_at >= p_since),'[]'::jsonb)),
        'events_today', coalesce((select jsonb_agg(distinct f.event_ref)
                                    from f where f.event_ref is not null),'[]'::jsonb),
        'risk', coalesce((select jsonb_agg(to_jsonb(r)) from r),'[]'::jsonb)),
      jsonb_build_object(
        'total',     (select n from ids),
        'mine',      (select count(*) from f where p_viewer is not null and f.owner = p_viewer),
        'ownerless', (select count(*) from f where f.owner is null),
        'at_risk',   (select count(distinct r.responsibility) from r where r.responsibility is not null),
        'changed',   (select count(*) from f join public.obligation o on o.id = f.responsibility
                       where p_since is not null and o.created_at >= p_since),
        'by_state',  coalesce((select jsonb_object_agg(s.state, s.c)
                                 from (select f.state, count(*) c from f group by f.state) s),'{}'::jsonb))));
  return v_out;
end $$;

-- ── 5 · EVENT COMMAND ───────────────────────────────────────────────────────
-- Entirely event-scoped. Does NOT replace event_workspace() (v277), which is
-- untouched and keeps its consumer until a future certified migration.
create or replace function public.projection_event_command(
  p_event uuid,
  p_now   timestamptz default now()
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_scope jsonb; v_out jsonb;
begin
  if p_event is null then
    raise exception 'PROJECTION_FILTER_INVALID: event command requires an event';
  end if;
  v_scope := jsonb_build_object('event', p_event);
  v_out := (
    with f as (select * from public.responsibility_feed(v_scope, p_now)),
         r as (select * from public.risk_findings(v_scope, p_now))
    select public.projection_envelope(
      'event_command', 1, p_now, v_scope,
      jsonb_build_object(
        'event', p_event,
        'responsibilities', coalesce((select jsonb_agg(to_jsonb(f) order by f.ordering_key) from f),'[]'::jsonb),
        -- board columns are the constitutional vocabulary, nothing invented
        'columns', coalesce((select jsonb_object_agg(s.state, s.ids)
                               from (select f.state,
                                            jsonb_agg(f.responsibility order by f.ordering_key) ids
                                       from f group by f.state) s),'{}'::jsonb),
        'risk', coalesce((select jsonb_agg(to_jsonb(r)) from r),'[]'::jsonb)),
      jsonb_build_object(
        'total',     (select count(*) from f),
        'ownerless', (select count(*) from f where f.owner is null),
        'at_risk',   (select count(distinct r.responsibility) from r where r.responsibility is not null),
        'by_state',  coalesce((select jsonb_object_agg(s.state, s.c)
                                 from (select f.state, count(*) c from f group by f.state) s),'{}'::jsonb))));
  return v_out;
end $$;

-- ── 6 · DEPARTMENT QUEUE ────────────────────────────────────────────────────
-- group_by changes grouping, ordering and presentation ONLY. Membership is
-- fixed by the declared scope and is identical across every grouping mode.
create or replace function public.projection_department_queue(
  p_department text,
  p_group_by   text default 'none',
  p_now        timestamptz default now()
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_scope jsonb; v_g text := public.validate_projection_group_by(p_group_by); v_out jsonb;
begin
  v_scope := jsonb_build_object('department', p_department);
  perform public.validate_projection_filter(v_scope);   -- closed department vocabulary
  v_out := (
    with f as (select * from public.responsibility_feed(v_scope, p_now)),
         r as (select * from public.risk_findings(v_scope, p_now)),
         g as (select public.projection_group_key(v_g, f.department, f.event_ref, f.state,
                                                  f.owner, f.resource_role) gk,
                      f.responsibility, f.ordering_key from f)
    select public.projection_envelope(
      'department_queue', 1, p_now, v_scope,
      jsonb_build_object(
        'department', p_department,
        'group_by',   v_g,
        'responsibilities', coalesce((select jsonb_agg(to_jsonb(f) order by f.ordering_key) from f),'[]'::jsonb),
        'groups', coalesce((select jsonb_agg(jsonb_build_object('key', x.gk, 'members', x.ids)
                                             order by x.gk)
                              from (select g.gk, jsonb_agg(g.responsibility order by g.ordering_key) ids
                                      from g group by g.gk) x),'[]'::jsonb),
        'risk', coalesce((select jsonb_agg(to_jsonb(r)) from r),'[]'::jsonb)),
      jsonb_build_object(
        'total',     (select count(*) from f),
        'ownerless', (select count(*) from f where f.owner is null),
        'at_risk',   (select count(distinct r.responsibility) from r where r.responsibility is not null),
        'by_state',  coalesce((select jsonb_object_agg(s.state, s.c)
                                 from (select f.state, count(*) c from f group by f.state) s),'{}'::jsonb))));
  return v_out;
end $$;

-- ── 7 · DAY SHEET ───────────────────────────────────────────────────────────
-- Scope is a window over the frozen filter grammar. NOTE (documented, not a
-- defect): the feed's window predicate never excludes a responsibility that
-- carries no window — undated work is surfaced rather than silently hidden,
-- the same doctrine that protects the ownerless collection. Membership still
-- equals feed(scope) exactly, so PRJ-10 holds.
create or replace function public.projection_day_sheet(
  p_day      date,
  p_group_by text default 'department',
  p_now      timestamptz default now()
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_scope jsonb; v_g text := public.validate_projection_group_by(p_group_by); v_out jsonb;
begin
  v_scope := jsonb_build_object('window', jsonb_build_object(
               'from', (p_day::timestamptz)::text,
               'to',   ((p_day + 1)::timestamptz - interval '1 microsecond')::text));
  v_out := (
    with f as (select * from public.responsibility_feed(v_scope, p_now)),
         r as (select * from public.risk_findings(v_scope, p_now)),
         g as (select public.projection_group_key(v_g, f.department, f.event_ref, f.state,
                                                  f.owner, f.resource_role) gk,
                      f.responsibility, f.ordering_key from f)
    select public.projection_envelope(
      'day_sheet', 1, p_now, v_scope,
      jsonb_build_object(
        'day', p_day,
        'group_by', v_g,
        'responsibilities', coalesce((select jsonb_agg(to_jsonb(f) order by f.ordering_key) from f),'[]'::jsonb),
        'groups', coalesce((select jsonb_agg(jsonb_build_object('key', x.gk, 'members', x.ids)
                                             order by x.gk)
                              from (select g.gk, jsonb_agg(g.responsibility order by g.ordering_key) ids
                                      from g group by g.gk) x),'[]'::jsonb),
        'risk', coalesce((select jsonb_agg(to_jsonb(r)) from r),'[]'::jsonb)),
      jsonb_build_object(
        'total',     (select count(*) from f),
        'ownerless', (select count(*) from f where f.owner is null),
        'at_risk',   (select count(distinct r.responsibility) from r where r.responsibility is not null),
        'by_state',  coalesce((select jsonb_object_agg(s.state, s.c)
                                 from (select f.state, count(*) c from f group by f.state) s),'{}'::jsonb))));
  return v_out;
end $$;

-- ── 8 · GRANTS (authenticated only — SQL_RELEASE_CONVENTIONS Rule 2) ────────
grant execute on function public.validate_projection_group_by(text) to authenticated;
grant execute on function public.projection_group_key(text,text,uuid,text,text,text) to authenticated;
grant execute on function public.risk_findings(jsonb, timestamptz) to authenticated;
grant execute on function public.projection_operations_today(text, timestamptz, timestamptz) to authenticated;
grant execute on function public.projection_event_command(uuid, timestamptz) to authenticated;
grant execute on function public.projection_department_queue(text, text, timestamptz) to authenticated;
grant execute on function public.projection_day_sheet(date, text, timestamptz) to authenticated;
