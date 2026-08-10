-- ============================================================================
-- v305 · CANONICAL EXECUTION FACTS
--
-- Exposes Atlas-owned execution evidence directly, so that the legacy
-- event_stage may later retire without losing an authorised capability.
--
-- It emits FACTS ONLY. It never interprets, classifies, or synthesises a
-- label. Dependency Map line 338 governs: "Progress derives from workflow:
-- which step are we on?" - and workflow is not structure. A collapsed token
-- would create an unowned authority and would risk conflating progress with
-- F-4 readiness and occurrence_phase lifecycle.
--
-- Kinds are NOT enumerated here. Whatever kinds are recorded are reported.
-- Hard-coding a kind list would be inventing the taxonomy this release exists
-- to avoid.
--
-- Governing: PC L288 (evidence is Atlas) | PC-9.7 (decomposes to grounds)
--            PC-9.12 (never stored) | R-13 (truth in SQL, wording in client)
--            E-1 (event is keyed one-to-one to an occurrence)
-- ============================================================================

begin;

do $preflight$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'v305_execution_facts') then
    raise exception 'V305_ALREADY_APPLIED';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'occurrence_execution_facts') then
    raise exception 'V305_PREFLIGHT_FAILED: occurrence_execution_facts already exists';
  end if;
  if to_regclass('public.execution_evidence') is null then
    raise exception 'V305_PREFLIGHT_FAILED: execution_evidence absent';
  end if;
  if to_regclass('public.engagement_occurrence') is null then
    raise exception 'V305_PREFLIGHT_FAILED: engagement_occurrence absent';
  end if;
end
$preflight$;

create or replace function public.occurrence_execution_facts(
  p_occurrence uuid,
  p_now        timestamptz default now()
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_tenant uuid := public.current_tenant_id();
  v_event  uuid;
  v_by     jsonb := '{}'::jsonb;
  v_stream jsonb := '[]'::jsonb;
begin
  perform 1 from public.engagement_occurrence o
   where o.id = p_occurrence and o.tenant_id = v_tenant;
  if not found then return null; end if;          -- I-40, no existence leak

  select e.id into v_event from public.event e where e.occurrence_ref = p_occurrence;

  if v_event is not null then
    -- latest recorded fact per kind, as of p_now
    select coalesce(jsonb_object_agg(k.kind, jsonb_build_object(
             'recorded',    true,
             'evidence_id', k.id,
             'actor',       k.actor,
             'moment',      k.moment)), '{}'::jsonb)
      into v_by
      from (
        select distinct on (x.kind) x.kind, x.id, x.actor, x.moment
          from public.execution_evidence x
         where x.event_ref = v_event and x.tenant_id = v_tenant
           and x.moment <= p_now
         order by x.kind, x.moment desc, x.id desc) k;

    -- the stream itself, oldest first
    select coalesce(jsonb_agg(jsonb_build_object(
             'evidence_id', s.id, 'kind', s.kind, 'actor', s.actor,
             'moment', s.moment, 'obligation', s.obligation_ref)
           order by s.moment, s.id), '[]'::jsonb)
      into v_stream
      from public.execution_evidence s
     where s.event_ref = v_event and s.tenant_id = v_tenant
       and s.moment <= p_now;
  end if;

  return jsonb_build_object(
    'grain',      'occurrence',
    'subject',    p_occurrence,
    'event',      v_event,
    'as_of',      p_now,
    'by_kind',    v_by,
    'stream',     v_stream,
    'fact_count', jsonb_array_length(v_stream));
end
$function$;

create or replace function public.v305_execution_facts() returns text
language sql immutable as $marker$ select 'v305'::text $marker$;

commit;

-- NO GRANT. create or replace preserves existing privileges.
