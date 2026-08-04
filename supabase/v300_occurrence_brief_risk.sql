-- ============================================================================
-- v300 — OCCURRENCE BRIEF · RISK DISCLOSURE (audit finding EX-02)
-- File:  supabase/v300_occurrence_brief_risk.sql
-- Apply: after v292b_occurrence_brief.sql (and after v292d/v294, which compose it)
--
-- Body derived from supabase/v292b_occurrence_brief.sql sha256[:16]=e1231c8529cdff55
-- with ONE sanctioned insertion. Nothing else in the function differs.
--
-- ── WHAT WAS WRONG ─────────────────────────────────────────────────────────
-- counts.at_risk is count(distinct responsibility) over risk_findings for the
-- event. The brief emitted only the `exception_recorded` subset in
-- data.exceptions, so the aggregate could not be decomposed to its grounds: a
-- reader told `at_risk: 3` had no way to learn which responsibilities, which
-- kinds, or what severity.
--
-- risk_findings emits EIGHT kinds from six CTEs — five responsibility-level
-- (lapsed, lapse_approaching, ownerless_nearing_window, dependency_blocked,
-- exception_recorded) and three event-level (venue_stale, venue_expired,
-- venue_renovation_reverification, all with responsibility = null). SEVEN of
-- those eight — including the critical `lapsed` and `venue_expired` — appeared
-- nowhere in the brief; only `exception_recorded` was emitted.
--
-- ── BEFORE ─────────────────────────────────────────────────────────────────
--   'exceptions', <exception_recorded subset>
--
-- ── AFTER ──────────────────────────────────────────────────────────────────
--   'risk',       <the complete finding set, to_jsonb(r), all eight kinds>
--   'exceptions', <exception_recorded subset — byte-identical to before>
--
-- ── NOT CHANGED (ruled) ────────────────────────────────────────────────────
-- counts.at_risk        — count(distinct responsibility) is correct and is the
--                         system-wide grain (operations_today, day_sheet,
--                         department_queue, event_command, the work lens all
--                         use this identical expression). Changing it would
--                         break cross-surface comparability.
-- counts.exceptions     — unchanged; still count(*) over exception_recorded.
-- data.exceptions       — unchanged, byte for byte.
-- version               — the brief REMAINS occurrence_brief v1. This is an
--                         additive disclosure, not a contract change: no
--                         existing key alters shape, meaning, order or
--                         nullability. Precedent: v292d1 replaced
--                         projection_day_sheet with a genuine behavioural
--                         correction and kept 'day_sheet', 1.
--                         Consequently projection_occurrences_for_operational_day's
--                         composed guard (v292d, which RAISES on any version but
--                         1) is untouched and keeps passing.
-- risk_findings, responsibility_feed, the closed filter grammar, read purity,
-- tenant isolation, and both composed projections (v292d and v294 cherry-pick
-- named keys and read neither at_risk nor exceptions) — all untouched.
--
-- READ-PURE. STABLE. Returns NULL for an absent or foreign occurrence (I-40).
-- ============================================================================

begin;

do $preflight$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='v300_brief_risk') then
    raise exception 'V300_ALREADY_APPLIED';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='projection_occurrence_brief') <> 1 then
    raise exception 'V300_PREFLIGHT_FAILED: projection_occurrence_brief absent or overloaded — CREATE OR REPLACE would mis-target';
  end if;
  if to_regprocedure('public.projection_occurrence_brief(uuid, timestamp with time zone)') is null then
    raise exception 'V300_PREFLIGHT_FAILED: projection_occurrence_brief exists but NOT with the captured identity (uuid, timestamp with time zone) — CREATE OR REPLACE would create a new overload, not replace';
  end if;
  -- the collection being disclosed must be the one this brief already consumes
  if to_regprocedure('public.risk_findings(jsonb, timestamp with time zone)') is null then
    raise exception 'V300_PREFLIGHT_FAILED: risk_findings(jsonb, timestamptz) absent — the brief cannot disclose a collection it cannot compute';
  end if;
end
$preflight$;

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
  )
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

-- NO GRANT. v292b's source carries `grant execute … to authenticated`, but no
-- shipped migration in this repository does, and `ec` has no Supabase roles at
-- all — the statement is what made the first v300 apply abort with
-- `role "authenticated" does not exist`. It is also unnecessary: CREATE OR
-- REPLACE PRESERVES existing privileges, so production keeps its grant and ec
-- keeps its defaults. Re-adding it would make this migration environment-bound.

-- The deployed marker. certify-release.sh --verify reads pg_proc for this name.
create function public.v300_brief_risk() returns text
language sql immutable as $$ select 'v300' $$;

commit;
