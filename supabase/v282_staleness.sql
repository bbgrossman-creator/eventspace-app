-- ═══════════════════════════════════════════════════════════════════════════
-- v282 — VENUE STALENESS & KNOWLEDGE FINDINGS  [MIGRATION]
--
-- BOUNDED ARCHITECTURE RULING (the 14 required decisions):
--  1. POLICY SCHEMA: venue_staleness_policy — one row per (tenant, attribute
--     family): max_age_days, severity_when_stale, verify_required. First
--     DB-side config table (inspection: config precedent is app-side); it is
--     configuration-plane data under C-3 — mutable by ceremony, select-only to
--     clients, last-writer deterministic under row lock. Config changes future
--     derivation only; history is untouched by construction (derivation reads
--     policy at read time).
--  2. FAMILY VOCABULARY (bounded, server-controlled): structural, equipment,
--     utility, document, rule, access, other — classified by attribute_family()
--     (immutable, pattern-based). 'renovation_event' is an event marker, never
--     classified as knowledge.
--  3. DEFAULTS: staleness_defaults() — structural 1460d/advisory, equipment
--     365d/advisory, utility 730d/advisory, document 365d/CRITICAL (expiry-
--     driven family), rule 730d/advisory, access 1095d/advisory, other
--     1095d/advisory; verify_required defaults false everywhere (ruling 6: no
--     generic walkthrough bureaucracy).
--  4. EXPIRY BEATS AGE — exact rule: an observation WITH explicit expires_at is
--     governed by expiry alone (expired at event date → EXPIRED, critical;
--     unexpired → never age-stale). Age thresholds apply ONLY to observations
--     without explicit expiry. A still-valid document is not stale by age.
--  5. RENOVATION: an append-only observation, attribute_key='renovation_event',
--     effective_at = renovation date, scope = venue (null) or a space. It edits
--     nothing; derivation invalidates (critically) any governing observation
--     older than it within its scope, from its effective date.
--  6. SCOPE PROPAGATION: venue-level renovation affects every scope; space-
--     level affects that space and its descendants (space_within()).
--  7. SEVERITY: advisory | critical. expired, renovation_reverification,
--     contradiction_unresolved, unobserved → critical; stale → the family
--     policy's severity.
--  8. FINDING IDENTITY: derived at read; identity (kind, scope, attribute|
--     family); deterministic ordering (kind, family, attribute, scope).
--  9. COMPUTATION: projection functions on demand (venue_knowledge_findings,
--     engagement_venue_knowledge) — nothing stored, nothing scheduled.
-- 10. CONTRADICTIONS: read once from venue_profile_read and mapped to
--     'contradiction_unresolved' — single source, no duplication.
-- 11. UNOBSERVED → VERIFICATION: a verify_required family in which NOTHING has
--     ever been observed derives 'unobserved' (critical); families whose
--     knowledge exists but expired/staled carry those findings instead —
--     one finding per condition, no double-fire. Verification summary:
--     no critical findings → none; critical findings spanning ≤2 families →
--     targeted_verification (itemized); ≥3 families OR any venue-wide
--     renovation reverification OR (critical findings AND the venue has never
--     been walked) → walkthrough_required. Deterministic and proven.
-- 12. FAMILIAR VENUES: current knowledge ⇒ zero findings ⇒ 'none' — proven.
-- 13. WORK-PROJECTION INTEGRATION: DEFERRED under freeze clarification C-4 —
--     the unified Work Projection does not exist yet and no new work
--     derivation may be created outside it; findings ship as venue-knowledge
--     projections and become work items when the unified projection ships.
-- 14. ACKNOWLEDGE/WAIVE: deferred to the exception family (the only existing
--     waiver seam is release's p_waiver_ref); findings are pure derivation.
--
-- ENGAGEMENT DATE (inspection finding): event_date lives application-side, so
-- the date is an injected parameter (p_event_date), exactly like p_context in
-- the v280 profile. Staleness is evaluated FOR THE EVENT DATE (ruling 7).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── policy (configuration plane, C-3) ────────────────────────────────────────
create table if not exists public.venue_staleness_policy (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  attribute_family text not null check (attribute_family in
                     ('structural','equipment','utility','document','rule','access','other')),
  max_age_days     int,
  severity_when_stale text not null default 'advisory' check (severity_when_stale in ('advisory','critical')),
  verify_required  boolean not null default false,
  updated_by       text not null,
  updated_at       timestamptz not null default clock_timestamp(),
  constraint staleness_policy_one_per_family unique (tenant_id, attribute_family)
);
alter table public.venue_staleness_policy enable row level security;
do $$ begin
  begin create policy vsp_sel on public.venue_staleness_policy for select
    using (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  -- no insert/update/delete policies: configuration writes go through the ceremony
end $$;
do $$ begin
  if exists (select 1 from pg_roles where rolname='authenticated') then grant select on public.venue_staleness_policy to authenticated; end if;
  if exists (select 1 from pg_roles where rolname='app_user') then grant select on public.venue_staleness_policy to authenticated; end if;
end $$;

create or replace function public.set_staleness_policy(
  p_family text, p_max_age_days int default null,
  p_severity text default 'advisory', p_verify_required boolean default false
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  insert into public.venue_staleness_policy
      (tenant_id, attribute_family, max_age_days, severity_when_stale, verify_required, updated_by)
    values (v_tenant, p_family, p_max_age_days, p_severity, coalesce(p_verify_required,false), public.action_actor())
  on conflict (tenant_id, attribute_family) do update
    set max_age_days = excluded.max_age_days,
        severity_when_stale = excluded.severity_when_stale,
        verify_required = excluded.verify_required,
        updated_by = excluded.updated_by,
        updated_at = clock_timestamp()
  returning id into v_id;
  return jsonb_build_object('policy_id', v_id, 'family', p_family);
end $$;

-- ── vocabulary: family classification + defaults ─────────────────────────────
create or replace function public.attribute_family(p_attr text)
returns text language sql immutable as $$
  select case
    when p_attr = 'renovation_event' then 'event_marker'
    when p_attr ~* 'insurance|permit|certificat|license' then 'document'
    when p_attr ~* 'dimension|clearance|height|width|length|sqft|footage|ceiling' then 'structural'
    when p_attr ~* 'electric|amperage|voltage|circuit|power|water|gas|drain|ventilat|hvac' then 'utility'
    when p_attr ~* 'equipment|refrigerat|freezer|oven|range|holding|walkin|walk_in|sink|mixer' then 'equipment'
    when p_attr ~* 'rule|labor|union|porter|noise|vendor|hard_out|flame|security|cleanup' then 'rule'
    when p_attr ~* 'elevator|loading|dock|access|stair|corridor|door|parking|curb|entrance' then 'access'
    else 'other' end $$;

create or replace function public.staleness_defaults(p_family text)
returns table (max_age_days int, severity text) language sql immutable as $$
  select v.max_age_days, v.severity from (values
    ('structural', 1460, 'advisory'), ('equipment', 365, 'advisory'),
    ('utility',    730,  'advisory'), ('document',  365, 'critical'),
    ('rule',       730,  'advisory'), ('access',   1095, 'advisory'),
    ('other',     1095,  'advisory')) v(f, max_age_days, severity)
  where v.f = p_family $$;

create or replace function public.effective_staleness_policy(p_family text)
returns table (max_age_days int, severity text, verify_required boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(t.max_age_days, d.max_age_days),
         coalesce(t.severity_when_stale, d.severity),
         coalesce(t.verify_required, false)
  from public.staleness_defaults(p_family) d
  left join public.venue_staleness_policy t
    on t.tenant_id = public.current_tenant_id() and t.attribute_family = p_family $$;

-- ── scope propagation helper ─────────────────────────────────────────────────
create or replace function public.space_within(p_space uuid, p_ancestor uuid)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare cur uuid := p_space; i int := 0;
begin
  if p_ancestor is null then return true; end if;   -- venue-wide scope
  while cur is not null and i < 10 loop
    if cur = p_ancestor then return true; end if;
    select parent_space_id into cur from public.venue_space where id = cur;
    i := i + 1;
  end loop;
  return false;
end $$;

-- ── the findings derivation (nothing stored) ─────────────────────────────────
create or replace function public.venue_knowledge_findings(
  p_venue uuid, p_at timestamptz default now(), p_conditions text[] default null
) returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_canon uuid; k record; prof jsonb; pol record; fnd jsonb := '[]'::jsonb;
  v_reno_eff timestamptz; exp record; v_fam text; v_age_days numeric;
begin
  v_canon := public.resolve_venue(p_venue);
  if v_canon is null then return null; end if;

  for k in
    select distinct o.scope_space_id, o.attribute_key
    from public.venue_observation o
    where o.tenant_id = public.current_tenant_id()
      and o.venue_id in (select public.venue_family(v_canon))
      and o.attribute_key <> 'renovation_event'
  loop
    v_fam := public.attribute_family(k.attribute_key);
    select * into pol from public.effective_staleness_policy(v_fam);
    prof := public.venue_profile_read(v_canon, k.scope_space_id, k.attribute_key, p_at, p_conditions);

    if prof->>'status' = 'unobserved' then
      -- expired vs never-known: an unsuperseded observation exists but its
      -- explicit expiry precedes the evaluation date → EXPIRED (critical)
      select o.id, o.expires_at into exp from public.venue_observation o
        where o.tenant_id = public.current_tenant_id()
          and o.venue_id in (select public.venue_family(v_canon))
          and o.attribute_key = k.attribute_key
          and (o.scope_space_id is not distinct from k.scope_space_id)
          and o.expires_at is not null and o.expires_at <= p_at
          and not exists (select 1 from public.venue_observation_supersession s where s.observation_id = o.id)
        order by o.expires_at desc limit 1;
      if found then
        fnd := fnd || jsonb_build_object('kind','expired','severity','critical',
          'family',v_fam,'attribute',k.attribute_key,'scope_space',k.scope_space_id,
          'observation_id',exp.id,'expired_at',exp.expires_at,
          'reason', k.attribute_key||' expired '||to_char(exp.expires_at,'YYYY-MM-DD')||' — before the evaluation date');
      end if;
      continue;
    end if;

    -- renovation invalidation (critical, regardless of freshness otherwise)
    select max(coalesce(o.effective_at, o.observed_at)) into v_reno_eff
      from public.venue_observation o
      where o.tenant_id = public.current_tenant_id()
        and o.venue_id in (select public.venue_family(v_canon))
        and o.attribute_key = 'renovation_event'
        and not exists (select 1 from public.venue_observation_supersession s where s.observation_id = o.id)
        and coalesce(o.effective_at, o.observed_at) <= p_at
        and (o.scope_space_id is null or public.space_within(k.scope_space_id, o.scope_space_id))
        and coalesce(o.effective_at, o.observed_at) > (prof->>'observed_at')::timestamptz;
    if v_reno_eff is not null then
      fnd := fnd || jsonb_build_object('kind','renovation_reverification','severity','critical',
        'family',v_fam,'attribute',k.attribute_key,'scope_space',k.scope_space_id,
        'observation_id',prof->>'observation_id','renovated_at',v_reno_eff,
        'reason', k.attribute_key||' predates the '||to_char(v_reno_eff,'YYYY-MM-DD')||' renovation — re-verify');
    end if;

    -- contradiction carry-through (single source: the profile)
    if prof->'contradiction' is not null and prof->'contradiction' <> 'null'::jsonb then
      fnd := fnd || jsonb_build_object('kind','contradiction_unresolved','severity','critical',
        'family',v_fam,'attribute',k.attribute_key,'scope_space',k.scope_space_id,
        'observation_id',prof->>'observation_id','disputed_by',prof->'contradiction'->>'disputing_observation',
        'reason', k.attribute_key||' has a newer conflicting '||replace(prof->'contradiction'->>'source_class','_',' ')||' — resolve or supersede');
    end if;

    -- age staleness — ONLY for observations without explicit expiry (ruling 4)
    if (select expires_at from public.venue_observation where id = (prof->>'observation_id')::uuid) is null
       and pol.max_age_days is not null then
      v_age_days := extract(epoch from (p_at - (prof->>'observed_at')::timestamptz)) / 86400.0;
      if v_age_days > pol.max_age_days then
        fnd := fnd || jsonb_build_object('kind','stale','severity',pol.severity,
          'family',v_fam,'attribute',k.attribute_key,'scope_space',k.scope_space_id,
          'observation_id',prof->>'observation_id','age_days',round(v_age_days),
          'reason', k.attribute_key||' last verified '||to_char((prof->>'observed_at')::timestamptz,'YYYY-MM-DD')||' — over the '||pol.max_age_days||'-day '||v_fam||' threshold');
      end if;
    end if;
  end loop;

  -- unobserved verify_required families (ruling 11)
  for pol in
    select p.attribute_family as fam from public.venue_staleness_policy p
     where p.tenant_id = public.current_tenant_id() and p.verify_required
  loop
    if not exists (
      select 1 from public.venue_observation o
       where o.tenant_id = public.current_tenant_id()
         and o.venue_id in (select public.venue_family(v_canon))
         and o.attribute_key <> 'renovation_event'
         and public.attribute_family(o.attribute_key) = pol.fam
         and not exists (select 1 from public.venue_observation_supersession s where s.observation_id = o.id))
    then
      fnd := fnd || jsonb_build_object('kind','unobserved','severity','critical',
        'family',pol.fam,'attribute',null,'scope_space',null,
        'reason', pol.fam||' knowledge is required by policy but has never been observed at this venue');
    end if;
  end loop;

  return coalesce((select jsonb_agg(e order by e->>'kind', e->>'family', coalesce(e->>'attribute',''), coalesce(e->>'scope_space',''))
                   from jsonb_array_elements(fnd) e), '[]'::jsonb);
end $$;

-- ── verification requirement summary (deterministic, ruling 11) ──────────────
create or replace function public.venue_verification_requirement(
  p_venue uuid, p_at timestamptz default now(), p_conditions text[] default null
) returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_canon uuid; fnd jsonb; crit jsonb; n_fam int; has_wide_reno boolean; walked int; verdict text; reasons jsonb;
begin
  v_canon := public.resolve_venue(p_venue);
  if v_canon is null then return null; end if;
  fnd := public.venue_knowledge_findings(p_venue, p_at, p_conditions);
  select coalesce(jsonb_agg(e), '[]'::jsonb) into crit
    from jsonb_array_elements(fnd) e where e->>'severity' = 'critical';
  select count(distinct e->>'family') into n_fam from jsonb_array_elements(crit) e;
  select exists (select 1 from jsonb_array_elements(crit) e
                  where e->>'kind'='renovation_reverification' and e->>'scope_space' is null) into has_wide_reno;
  -- venue-wide renovation: any wide reno event that invalidated anything
  if not has_wide_reno then
    select exists (
      select 1 from jsonb_array_elements(crit) e
       where e->>'kind'='renovation_reverification'
         and exists (select 1 from public.venue_observation o
                      where o.attribute_key='renovation_event' and o.scope_space_id is null
                        and o.venue_id in (select public.venue_family(v_canon))
                        and coalesce(o.effective_at,o.observed_at) <= p_at)) into has_wide_reno;
  end if;
  select count(*) into walked from public.venue_walkthrough
    where tenant_id = public.current_tenant_id() and venue_id in (select public.venue_family(v_canon));
  select coalesce(jsonb_agg(e->>'reason'), '[]'::jsonb) into reasons from jsonb_array_elements(crit) e;

  if jsonb_array_length(crit) = 0 then verdict := 'none';
  elsif n_fam >= 3 or has_wide_reno or walked = 0 then verdict := 'walkthrough_required';
  else verdict := 'targeted_verification';
  end if;
  return jsonb_build_object('verification', verdict, 'critical_count', jsonb_array_length(crit),
                            'critical_families', n_fam, 'reasons', reasons, 'findings', fnd);
end $$;

-- ── the engagement read: binding + event date → knowledge verdict ────────────
create or replace function public.engagement_venue_knowledge(
  p_booking uuid, p_event_date timestamptz default now(), p_conditions text[] default null
) returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare b jsonb; v jsonb;
begin
  b := public.current_venue_binding(p_booking);
  if b is null then
    perform 1 from public.bookings where id=p_booking and tenant_id=public.current_tenant_id();
    if not found then return null; end if;                    -- non-disclosure
    return jsonb_build_object('bound', false, 'verification', 'none', 'findings', '[]'::jsonb);
  end if;
  v := public.venue_verification_requirement((b->>'resolved_venue_id')::uuid, p_event_date, p_conditions);
  return jsonb_build_object('bound', true, 'binding', b, 'event_date', p_event_date) || coalesce(v, '{}'::jsonb);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'set_staleness_policy(text,int,text,boolean)','attribute_family(text)',
    'staleness_defaults(text)','effective_staleness_policy(text)','space_within(uuid,uuid)',
    'venue_knowledge_findings(uuid,timestamptz,text[])',
    'venue_verification_requirement(uuid,timestamptz,text[])',
    'engagement_venue_knowledge(uuid,timestamptz,text[])'] loop
    if exists (select 1 from pg_roles where rolname='authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn); end if;
    if exists (select 1 from pg_roles where rolname='app_user') then
      execute format('grant execute on function public.%s to app_user', fn); end if;
  end loop;
end $$;
