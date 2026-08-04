-- ============================================================================
-- v303 — OCCURRENCE READINESS (ATL-1)
-- File:  supabase/v303_readiness.sql
-- Apply: after v300_occurrence_brief_risk.sql
--
-- The canonical, SQL-owned readiness model for the Occurrence band. Under R-13 a
-- readiness verdict is TRUTH — it changes what the operator is told is owed — so
-- it must be authored here and never derived in React.
--
-- ── TWO ORTHOGONAL AXES ────────────────────────────────────────────────────
-- LIFECYCLE  preparing · released · settled · cancelled     (where in the arc)
-- READINESS  ready · blocked · not_applicable               (is anything in the way)
--
-- Collapsing these into one scalar is the defect in the legacy event_stage, which
-- enumerates released|in_prep|ready|in_service|closed and therefore cannot say
-- "this released event is blocked". `ready` here means UNIMPEDED. Completion is
-- the lifecycle value `settled`.
--
-- ── BOTTOM-UP COMPOSITION ──────────────────────────────────────────────────
--   responsibility  responsibility_state — SOLE authority, unchanged by v303
--   department      composed from the above
--   occurrence      composed from department verdicts (execution gate)
-- Upper grains have no independent rule, so a verdict cannot disagree with the
-- grounds it carries. EX-02's lesson applied before the fact.
--
-- ── WHAT THIS ADDS TO THE BRIEF ────────────────────────────────────────────
-- Brief body derived from v300 sha256[:16]=e24c4751357d2de3 with THREE additive textual
-- insertions: one CTE, data.readiness_state, counts.readiness_blockers. NO
-- existing key changes shape, meaning, order or nullability; RD-4/RD-5 prove it
-- by subtraction.
--
-- ── VERSION: THE BRIEF STAYS v1 ────────────────────────────────────────────
-- The envelope version protects READER COMPATIBILITY; R-13 governs WHERE truth is
-- authored. Different questions. A new key changes nothing a v1 client reads, so
-- a v1 client ignores readiness_state and behaves exactly as today — the same
-- analysis as v300's data.risk. Consequently
-- projection_occurrences_for_operational_day's composed guard is untouched and
-- projection_preparation_queue is unaffected; both are proved byte-identical.
--
-- ── NOT CHANGED ────────────────────────────────────────────────────────────
-- responsibility_state, responsibility_feed, risk_findings, obligation_state,
-- every ceremony, data.readiness, data.completeness, data.risk, data.exceptions,
-- every existing counts key, and the entire legacy execution layer.
--
-- READ-PURE. All four functions STABLE. Returns NULL for an absent or foreign
-- occurrence (I-40).
-- ============================================================================

begin;

do $preflight$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='v303_readiness') then
    raise exception 'V303_ALREADY_APPLIED';
  end if;
  -- Defence in depth, and the two checks prove different things. The COUNT
  -- proves no second overload exists that could make the replacement target
  -- ambiguous; the IDENTITY proves the one that does exist carries the captured
  -- signature. Either alone leaves a gap.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='projection_occurrence_brief') <> 1 then
    raise exception 'V303_PREFLIGHT_FAILED: projection_occurrence_brief absent or overloaded — CREATE OR REPLACE would mis-target';
  end if;
  if to_regprocedure('public.projection_occurrence_brief(uuid, timestamp with time zone)') is null then
    raise exception 'V303_PREFLIGHT_FAILED: projection_occurrence_brief exists but NOT with the captured identity';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='v300_brief_risk') <> 1 then
    raise exception 'V303_PREFLIGHT_FAILED: v300 is not applied — v303 derives its brief body from v300';
  end if;
  if to_regprocedure('public.responsibility_feed(jsonb, timestamp with time zone)') is null
     or to_regprocedure('public.obligation_nk_complete(uuid, text)') is null
     or to_regprocedure('public.occurrence_is_active(uuid, timestamp with time zone)') is null then
    raise exception 'V303_PREFLIGHT_FAILED: a resolver readiness composes from is absent';
  end if;
end
$preflight$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1 · LIFECYCLE — where the occurrence is in its arc.
--
-- Separate from readiness by ruling. An occurrence in execution was once ready;
-- a model that makes those mutually exclusive (as the legacy event_stage does,
-- by putting `ready` inside a lifecycle enumeration) cannot say so.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.occurrence_phase(
  p_occurrence uuid,
  p_now        timestamptz default now()
) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant   uuid := public.current_tenant_id();
  v_event    uuid;
  v_total    int;
  v_terminal int;
begin
  perform 1 from public.engagement_occurrence o
   where o.id = p_occurrence and o.tenant_id = v_tenant;
  if not found then return null; end if;            -- I-40, no existence leak

  -- Cancellation has ABSOLUTE precedence. A cancelled occurrence has no
  -- readiness at all; nothing below is evaluated for it.
  if not public.occurrence_is_active(p_occurrence, p_now) then
    return 'cancelled';
  end if;

  select e.id into v_event from public.event e where e.occurrence_ref = p_occurrence;
  if v_event is null then return 'preparing'; end if;

  -- `lapsed` is deliberately NOT terminal: a lapsed responsibility is unmet, so
  -- an occurrence carrying one is never settled. The v_total > 0 guard stops a
  -- just-released event with no generated work from being vacuously settled.
  select count(*),
         count(*) filter (where f.state in ('discharged','void','superseded'))
    into v_total, v_terminal
    from public.responsibility_feed(jsonb_build_object('event', v_event), p_now) f;

  if v_total > 0 and v_terminal = v_total then return 'settled'; end if;
  return 'released';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2 · DEPARTMENT READINESS — the first composed grain.
--
-- `ready` means UNIMPEDED, never complete. A department with twelve outstanding
-- responsibilities and nothing standing in their way is ready, and `outstanding`
-- travels beside the verdict so no reader can mistake it. Completion lives on
-- the lifecycle axis as `settled`.
--
-- STATE IS NEVER RE-DERIVED. responsibility_state, through responsibility_feed,
-- is the sole authority. This function reads public.obligation for ONE thing
-- only — `dependencies` — because the feed does not expose it, and resolves it
-- with obligation_nk_complete: the same primitive responsibility_state itself
-- uses. It NEVER reads risk_findings, so readiness cannot become a function of
-- the risk model.
--
-- CLOSED TAXONOMY, primary code first-match-wins, one per responsibility:
--   overdue           impedes  state = lapsed — the window closed unmet
--   dependency_unmet  impedes  standing, and a dependency is incomplete
--   not_due                    standing, and the window has not opened
--   workable                   outstanding, owned or not, nothing in the way
-- Non-impeding NOTES attach alongside and never replace the primary code:
--   ownerless                  lawful (O-1/O-3) — never an impediment
--   exception_open             an operator recorded a problem; visible, not gating
-- RESERVED, not emitted here:
--   owner_required    impedes  no ceremony currently requires ownership; the
--                              captured caller set for responsibility_current_owner
--                              is read-models only (day_sheet, department_workspace,
--                              responsibility_feed, responsibility_state)
--   risk_noted                 NOT emitted, and NOT because risk is uniformly
--                              absorbed — that claim is false. exception_recorded
--                              is neither duplicated by a primary code nor sorted
--                              first by ordering_key, which is exactly why
--                              `exception_open` above exists as an independent
--                              ground, derived from the feed's `exceptions`
--                              column and NOT from risk_findings. The remaining
--                              kinds are already represented: lapsed → overdue,
--                              dependency_blocked → dependency_unmet,
--                              ownerless_nearing_window → the ownerless note,
--                              lapse_approaching → already first in ordering_key,
--                              venue_* → event-level. All findings ride in
--                              data.risk beside this verdict regardless.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.occurrence_department_readiness(
  p_occurrence uuid,
  p_now        timestamptz default now()
) returns table(department text, verdict text, outstanding int, blockers jsonb)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_event  uuid;
begin
  perform 1 from public.engagement_occurrence o
   where o.id = p_occurrence and o.tenant_id = v_tenant;
  if not found then return; end if;
  select e.id into v_event from public.event e where e.occurrence_ref = p_occurrence;
  if v_event is null then return; end if;   -- no work exists before release

  return query
  with f as (
    select * from public.responsibility_feed(jsonb_build_object('event', v_event), p_now)
  ),
  unmet as (
    select f.responsibility, jsonb_agg(d.dep order by d.dep) as nks
      from f
      join public.obligation o on o.id = f.responsibility
      cross join lateral jsonb_array_elements_text(coalesce(o.dependencies,'[]'::jsonb)) as d(dep)
     where f.state = 'standing'
       and o.event_ref is not null
       and not public.obligation_nk_complete(o.event_ref, d.dep)
     group by f.responsibility
  ),
  -- ADDITION 1 (ATL-2). The blocking responsibility RESOLVED, not just its
  -- natural key: without this a next_action model must re-query to name the
  -- action, and the payload stops being self-sufficient.
  blocking as (
    select u.responsibility,
           jsonb_agg(jsonb_build_object(
             'responsibility',   b.responsibility,
             'department',       b.department,
             'state',            b.state,
             'owner',            b.owner,
             'required_outcome', b.required_outcome,
             'ordering_key',     b.ordering_key) order by b.ordering_key) as rows_
      from unmet u
      cross join lateral jsonb_array_elements_text(u.nks) as n(nk)
      join f b on b.natural_key = n.nk
     group by u.responsibility
  ),
  classified as (
    select f.responsibility, f.department, f.required_outcome, f.owner,
           f.ordering_key, f.timing, f.exceptions,
           u.nks, bl.rows_ as blocking_rows,
           case
             when f.state = 'lapsed'  then 'overdue'
             when u.nks is not null    then 'dependency_unmet'
             when f.state = 'standing'
              and nullif(f.timing->>'window_start','')::timestamptz > p_now then 'not_due'
             else 'workable'
           end as code
      from f
      left join unmet    u  on u.responsibility  = f.responsibility
      left join blocking bl on bl.responsibility = f.responsibility
     where f.state not in ('discharged','void','superseded')
  ),
  ground as (
    select c.department,
           (c.code in ('overdue','dependency_unmet')) as impedes,
           c.ordering_key,
           jsonb_build_object(
             'code',             c.code,
             'grain',            'responsibility',
             'subject',          c.responsibility,
             'department',       c.department,
             'required_outcome', c.required_outcome,
             'owner',            c.owner,
             'ordering_key',     c.ordering_key,
             'impedes',          (c.code in ('overdue','dependency_unmet')),
             'timing',           coalesce(c.timing, '{}'::jsonb),
             'notes', (select coalesce(jsonb_agg(n order by n), '[]'::jsonb) from (
                         select 'ownerless'::text n where c.owner is null
                         union all
                         select 'exception_open' where c.exceptions > 0) t),
             'detail',
               (case c.code
                  when 'not_due' then
                    jsonb_build_object('opens_at', c.timing->>'window_start')
                  when 'dependency_unmet' then
                    jsonb_build_object('unmet',    coalesce(c.nks,'[]'::jsonb),
                                       'blocking', coalesce(c.blocking_rows,'[]'::jsonb))
                  else '{}'::jsonb
                end)
               || (case when c.exceptions > 0
                        then jsonb_build_object('exceptions', c.exceptions)
                        else '{}'::jsonb end)
           ) as g
      from classified c
  )
  select d.department,
         case when bool_or(g.impedes) then 'blocked' else 'ready' end,
         count(g.g)::int,
         coalesce(jsonb_agg(g.g order by g.ordering_key)
                  filter (where g.g is not null), '[]'::jsonb)
    from (select distinct fx.department from f fx) d
    left join ground g on g.department = d.department
   group by d.department
   order by d.department;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3 · OCCURRENCE READINESS — the composed verdict.
--
-- The verdict NAMES ITS GATE, and exactly one gate is open per phase. Obligations
-- are generated at release, so before release there are no departments to compose
-- from; the release gate's grounds are occurrence-grain facts. Forcing an offer
-- acceptance into a department would invent an attribution the model does not have.
--
--   preparing → gate `release`   · grounds: the ONE pre-checkable predicate
--   released  → gate `execution` · composed EXCLUSIVELY from department verdicts
--   settled / cancelled → no gate, verdict `not_applicable`
--
-- Of the three release predicates only `commitment` is a state of the world;
-- `clearance` and `sign_off` are ARGUMENTS the operator supplies to the ceremony
-- and cannot be missing in advance. So the release gate has exactly one blocker.
-- That predicate is stated here as well as in release_occurrence — a duplication
-- contained by proof (RS-19/RS-19b), not by hope.
--
-- Completeness INFORMS and never gates (v292a). Risk decorates and never moves a
-- verdict (v287b RSK-*). Ownerless is lawful (O-1/O-3).
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.occurrence_readiness(
  p_occurrence uuid,
  p_now        timestamptz default now()
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_phase   text;
  v_gate    text;
  v_verdict text;
  v_depts   jsonb := '[]'::jsonb;
  v_block   jsonb := '[]'::jsonb;
  v_reason  jsonb := '[]'::jsonb;
  v_book    uuid;
  v_commit  boolean;
  v_count   int;
  v_prof    record; v_eng record; v_att record; v_ven record; v_sup record;
  v_contract integer; v_opdate date; v_ms boolean;
begin
  v_phase := public.occurrence_phase(p_occurrence, p_now);
  if v_phase is null then return null; end if;      -- I-40

  select o.booking_id into v_book from public.engagement_occurrence o
   where o.id = p_occurrence and o.tenant_id = v_tenant;

  if v_phase in ('cancelled','settled') then
    v_gate := null; v_verdict := 'not_applicable';

  elsif v_phase = 'preparing' then
    v_gate := 'release';
    select exists (
      select 1 from public.offer_acceptances a
       left join public.acceptance_rescissions r on r.acceptance_id = a.id
       where a.booking_id = v_book and a.tenant_id = v_tenant and r.id is null)
      into v_commit;
    if not v_commit then
      v_block := jsonb_build_array(jsonb_build_object(
        'code','release_fact_missing','grain','occurrence','subject',p_occurrence,
        'fact','commitment','impedes',true,'notes','[]'::jsonb,
        'detail', jsonb_build_object('predicate','commitment')));
    end if;
    v_verdict := case when v_commit then 'ready' else 'blocked' end;

  else                                              -- released
    v_gate := 'execution';
    select coalesce(jsonb_agg(jsonb_build_object(
             'grain','department', 'subject', r.department, 'verdict', r.verdict,
             'outstanding', r.outstanding, 'blockers', r.blockers)
           order by r.department), '[]'::jsonb)
      into v_depts
      from public.occurrence_department_readiness(p_occurrence, p_now) r;
    v_verdict := case when exists (
      select 1 from jsonb_array_elements(v_depts) d where d->>'verdict' = 'blocked')
      then 'blocked' else 'ready' end;
  end if;

  -- Informational missing promise facts. Composed from the SAME v292a1 resolvers
  -- the brief's completeness is composed from — never restated, and RS-8b proves
  -- the two agree. Never gates: v292a ruled completeness informs, and
  -- OccurrencePrep says so on screen ("you may still release").
  if v_phase in ('preparing','released') then
    select * into v_prof from public.promise_current_occurrence_profile(p_occurrence, p_now);
    select * into v_eng  from public.promise_current_engagement_profile(v_book, p_now);
    select * into v_att  from public.promise_current_attendance(p_occurrence, p_now);
    select * into v_ven  from public.occurrence_current_venue(p_occurrence, p_now);
    select * into v_sup  from public.occurrence_current_supervision(p_occurrence, p_now);
    select a.head_count into v_contract
      from public.attendance_commitment a
     where a.occurrence_id = p_occurrence and a.tenant_id = v_tenant
       and a.basis = 'contracted' and a.recorded_at <= p_now
       and not exists (select 1 from public.attendance_commitment s
                        where s.replaces_id = a.id and s.recorded_at <= p_now)
     order by a.effective_moment desc, a.seq desc limit 1;
    select m.at_date into v_opdate
      from public.promise_current_milestones(p_occurrence, p_now) m
     where m.milestone_key = 'operating_date';
    select exists (select 1 from public.promise_current_milestones(p_occurrence, p_now) m
                    where m.milestone_key <> 'operating_date') into v_ms;

    select coalesce(jsonb_agg(jsonb_build_object(
             'code','fact_missing','grain','occurrence','subject',p_occurrence,
             'fact', k, 'impedes', false, 'notes','[]'::jsonb,
             'detail', jsonb_build_object('fact', k)) order by k), '[]'::jsonb)
      into v_reason
      from (select k from (values
              ('display_name',   v_prof.display_name is not null),
              ('client',         v_eng.client_display_name is not null),
              ('venue',          v_ven.venue_id is not null),
              ('operating_date', v_opdate is not null),
              ('attendance',     v_att.id is not null),
              ('contracted',     v_contract is not null),
              ('supervision',    v_sup.authority_org is not null),
              ('milestones',     v_ms)
            ) t(k, present) where not t.present) miss;
  end if;

  -- ADDITION: the count travels WITH the verdict so readiness_state is
  -- self-sufficient for ATL-2, and counts.readiness_blockers mirrors it exactly.
  select jsonb_array_length(v_block)
       + coalesce((select sum((select count(*)
                                 from jsonb_array_elements(d->'blockers') b
                                where (b->>'impedes')::boolean))
                     from jsonb_array_elements(v_depts) d), 0)
    into v_count;

  return jsonb_build_object(
    'grain',        'occurrence',
    'subject',      p_occurrence,
    'phase',        v_phase,
    'gate',         v_gate,
    'verdict',      v_verdict,
    'blocker_count', v_count,
    'blockers',     v_block,
    'reasons',      v_reason,
    'by_department', v_depts);
end $$;

create or replace function public.projection_occurrence_brief(
  p_occurrence uuid,
  p_now        timestamptz default now()
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_occ     record;
  v_event   uuid;
  v_prof    record;
  v_eng     record;
  v_att     record;
  v_ven     record;
  v_sup     record;
  v_contract integer;
  v_opdate  date;
  v_out     jsonb;
begin
  if p_occurrence is null then
    raise exception 'PROJECTION_SCOPE_REQUIRED: occurrence';
  end if;

  select o.* into v_occ from public.engagement_occurrence o
   where o.id = p_occurrence and o.tenant_id = v_tenant;
  if not found then return null; end if;                 -- I-40, no existence leak

  select e.id into v_event from public.event e where e.occurrence_ref = p_occurrence;

  select * into v_prof from public.promise_current_occurrence_profile(p_occurrence, p_now);
  select * into v_eng  from public.promise_current_engagement_profile(v_occ.booking_id, p_now);
  select * into v_att  from public.promise_current_attendance(p_occurrence, p_now);
  select * into v_ven  from public.occurrence_current_venue(p_occurrence, p_now);
  select * into v_sup  from public.occurrence_current_supervision(p_occurrence, p_now);

  -- the contracted baseline, typed and authoritative
  select a.head_count into v_contract
    from public.attendance_commitment a
   where a.occurrence_id = p_occurrence and a.tenant_id = v_tenant
     and a.basis = 'contracted' and a.recorded_at <= p_now
     and not exists (select 1 from public.attendance_commitment s
                      where s.replaces_id = a.id and s.recorded_at <= p_now)
   order by a.effective_moment desc, a.seq desc limit 1;

  select m.at_date into v_opdate
    from public.promise_current_milestones(p_occurrence, p_now) m
   where m.milestone_key = 'operating_date';

  with
  -- ── PROMISE: the shape of the day ────────────────────────────────────────
  milestones as (
    select m.* from public.promise_current_milestones(p_occurrence, p_now) m
     where m.milestone_key <> 'operating_date'
  ),
  -- ── PROMISE: temporal overlap only. Windows that merely touch do not
  --    overlap; a point milestone inside another's window does.
  -- CTE named window_overlaps: OVERLAPS is a reserved temporal operator in SQL
  window_overlaps as (
    select a.milestone_key ka, coalesce(a.label, a.milestone_key) la,
           b.milestone_key kb, coalesce(b.label, b.milestone_key) lb,
           greatest(a.at_moment, b.at_moment) as ov_start,
           least(coalesce(a.window_end, a.at_moment),
                 coalesce(b.window_end, b.at_moment)) as ov_end
      from milestones a
      join milestones b
        on b.id > a.id
       and a.at_moment < coalesce(b.window_end, b.at_moment)
       and b.at_moment < coalesce(a.window_end, a.at_moment)
     where a.at_moment is not null and b.at_moment is not null
  ),
  -- ── WORK: present only once an event has been released ───────────────────
  feed as (
    select f.* from public.responsibility_feed(
             jsonb_build_object('event', v_event), p_now) f
     where v_event is not null
  ),
  findings as (
    select r.* from public.risk_findings(
             jsonb_build_object('event', v_event), p_now) r
     where v_event is not null
  ),
  readiness as (
    select f.department,
           count(*)                                                    total,
           count(*) filter (where f.state in ('discharged','void',
                                              'superseded'))           settled,
           count(*) filter (where f.state not in ('discharged','void',
                                                  'superseded'))       outstanding,
           count(*) filter (where f.owner is null)                     ownerless,
           count(*) filter (where f.state = 'standing')                blocked
      from feed f group by f.department
  ),
  -- v303 · ATL-1. The canonical readiness verdict, authored in SQL and
  -- composed bottom-up. Evaluated ONCE here so data.readiness_state and
  -- counts.readiness_blockers cannot disagree.
  rs as (select public.occurrence_readiness(p_occurrence, p_now) as v)
  select public.projection_envelope(
    'occurrence_brief', 1, p_now,
    jsonb_build_object('occurrence', p_occurrence),
    jsonb_build_object(
      -- WHO -------------------------------------------------------------
      'identity', jsonb_build_object(
        'occurrence',    p_occurrence,
        'engagement',    v_occ.booking_id,
        'ordinal',       v_occ.ordinal,
        'open_basis',    v_occ.open_basis,
        'active',        public.occurrence_is_active(p_occurrence, p_now),
        'display_name',  v_prof.display_name,
        'occasion_kind', v_prof.occasion_kind,
        'engagement_name', v_eng.display_name,
        -- the CRM contact is the fallback, and the brief says which it used
        'client',        coalesce(v_eng.client_display_name,
                          (select b.contact_name from public.bookings b
                            where b.id = v_occ.booking_id and b.tenant_id = v_tenant)),
        'client_source', case when v_eng.client_display_name is not null
                              then 'engagement_profile' else 'booking_contact' end),
      -- WHERE -----------------------------------------------------------
      'venue', case when v_ven.venue_id is null then null else jsonb_build_object(
        'source',  v_ven.source,          -- 'occurrence' or inherited 'engagement'
        'venue',   v_ven.venue_id,
        'name',    v_ven.venue_name,
        'address', v_ven.venue_address) end,
      -- HOW MANY --------------------------------------------------------
      'attendance', jsonb_build_object(
        'current', case when v_att.id is null then null else jsonb_build_object(
          'head_count', v_att.head_count, 'basis', v_att.basis,
          'effective_moment', v_att.effective_moment) end,
        'contracted', v_contract,
        -- what changed since the contract; null when either side is unknown
        'delta', case when v_contract is null or v_att.head_count is null
                      then null else v_att.head_count - v_contract end,
        -- future-effective commitments, NEVER presented as the operative count
        'scheduled', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'head_count', s.head_count, 'basis', s.basis,
                   'effective_moment', s.effective_moment)
                 order by s.effective_moment)
            from public.promise_scheduled_attendance(p_occurrence, p_now) s),
          '[]'::jsonb)),
      -- WHEN ------------------------------------------------------------
      'schedule', jsonb_build_object(
        'operating_date', v_opdate,
        'milestones', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'key', m.milestone_key, 'label', coalesce(m.label, m.milestone_key),
                   'at', m.at_moment, 'window_end', m.window_end)
                 order by m.at_moment, m.milestone_key)
            from milestones m), '[]'::jsonb)),
      'supervision', case when v_sup.authority_org is null then null else jsonb_build_object(
        'source', v_sup.source, 'authority_org', v_sup.authority_org,
        'window_start', v_sup.window_start, 'window_end', v_sup.window_end,
        'certificate_ref', v_sup.certificate_ref, 'contact', v_sup.contact) end,
      -- WHAT OVERLAPS ---------------------------------------------------
      'overlaps', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'kind', 'temporal',
                 'a', o.la, 'a_key', o.ka, 'b', o.lb, 'b_key', o.kb,
                 'overlap_start', o.ov_start, 'overlap_end', o.ov_end)
               order by o.ov_start)
          from window_overlaps o), '[]'::jsonb),
      -- WHAT IS READY ---------------------------------------------------
      'has_event', v_event is not null,
      'event',     v_event,
      'readiness', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'department', r.department, 'total', r.total,
                 'settled', r.settled, 'outstanding', r.outstanding,
                 'ownerless', r.ownerless, 'blocked', r.blocked)
               order by r.department)
          from readiness r), '[]'::jsonb),
      -- v303 · ATL-1. The VERDICT, beside the counts above. data.readiness
      -- reports how much; this reports whether anything stands in the way,
      -- and carries the grounds it was computed from. Lifecycle phase and
      -- readiness verdict are separate axes: `ready` means unimpeded, never
      -- complete — completion is the phase `settled`.
      'readiness_state', (select v from rs),
      -- WHAT IS WRONG ---------------------------------------------------
      -- v300 · EX-02. The COMPLETE finding set, exactly as risk_findings
      -- computed it — the same `jsonb_agg(to_jsonb(r))` shape day_sheet,
      -- department_queue, event_command and operations_today already emit. This
      -- is what makes counts.at_risk explainable: the aggregate is
      -- count(distinct responsibility) over THIS collection, so a reader can
      -- always recover which responsibilities are at risk and why.
      -- Event-level findings (venue_*) carry responsibility = null; they belong
      -- here, and they correctly do not enter counts.at_risk.
      -- `nulls last` keeps the order total: responsibility is nullable.
      'risk', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.responsibility nulls last, x.finding)
          from findings x), '[]'::jsonb),
      -- Unchanged, and deliberately kept: counts.exceptions decomposes to it
      -- exactly, and OccurrencePrep reads that count today. It is now a filtered
      -- view of `risk` above, never a second source.
      'exceptions', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.responsibility)
          from findings x where x.finding = 'exception_recorded'), '[]'::jsonb),
      'ownerless', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'responsibility', f.responsibility, 'department', f.department,
                 'required_outcome', f.required_outcome, 'state', f.state)
               order by f.ordering_key)
          from feed f where f.owner is null), '[]'::jsonb),
      -- WHAT IS MISSING -------------------------------------------------
      -- Absence stated honestly, so a surface can say "no cover count recorded"
      -- rather than render a blank. Every promise fact is absent on day one;
      -- that is the normal state, not an edge case.
      'completeness', jsonb_build_object(
        'display_name',   v_prof.display_name is not null,
        'client',         v_eng.client_display_name is not null,
        'venue',          v_ven.venue_id is not null,
        'operating_date', v_opdate is not null,
        'attendance',     v_att.id is not null,
        'contracted',     v_contract is not null,
        'supervision',    v_sup.authority_org is not null,
        'milestones',     exists (select 1 from milestones),
        'missing', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
                      from (select k from (values
                              ('display_name',   v_prof.display_name is not null),
                              ('client',         v_eng.client_display_name is not null),
                              ('venue',          v_ven.venue_id is not null),
                              ('operating_date', v_opdate is not null),
                              ('attendance',     v_att.id is not null),
                              ('contracted',     v_contract is not null),
                              ('supervision',    v_sup.authority_org is not null),
                              ('milestones',     exists (select 1 from milestones))
                            ) t(k, present) where not t.present) miss))),
    jsonb_build_object(
      'total',       (select count(*) from feed),
      'outstanding', (select count(*) from feed
                       where state not in ('discharged','void','superseded')),
      'ownerless',   (select count(*) from feed where owner is null),
      'at_risk',     (select count(distinct responsibility) from findings
                       where responsibility is not null),
      'exceptions',  (select count(*) from findings where finding = 'exception_recorded'),
      'overlaps',    (select count(*) from window_overlaps),
      -- v303 · decomposes EXACTLY to the impeding grounds in
      -- readiness_state, across both the occurrence and department grains.
      -- The EX-02 discipline applied from the outset, not retrofitted.
      'readiness_blockers', ((select v from rs)->>'blocker_count')::int,
      'by_state',    coalesce((select jsonb_object_agg(s.state, s.c)
                                 from (select state, count(*) c from feed group by state) s),
                              '{}'::jsonb),
      'missing_promise_facts',
        (select count(*) from (values
           (v_prof.display_name is not null), (v_eng.client_display_name is not null),
           (v_ven.venue_id is not null), (v_opdate is not null),
           (v_att.id is not null), (v_contract is not null),
           (v_sup.authority_org is not null), (exists (select 1 from milestones))
         ) t(present) where not t.present)))
  into v_out;

  return v_out;
end $$;

-- ── the deployed marker ─────────────────────────────────────────────────────
create function public.v303_readiness() returns text
language sql immutable as $$ select 'v303' $$;

commit;
