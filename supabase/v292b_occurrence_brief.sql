-- ════════════════════════════════════════════════════════════════════════════
-- v292b — OCCURRENCE BRIEF PROJECTION
--
-- projection_occurrence_brief(p_occurrence uuid, p_now timestamptz)
--
-- The single authoritative read model for pre-execution operations, and the one
-- call behind Day Sheet. It answers the approved sixty-second contract:
--   who · how many · where · when · what is ready · what is wrong · what overlaps
--
-- ── WHY OCCURRENCE-SCOPED, NOT EVENT-SCOPED ────────────────────────────────
-- A briefing is needed for PLANNING, before release — which is most of an
-- engagement's life. An event-scoped brief could not answer anything until the
-- day it stopped mattering. So the brief is anchored on the occurrence and
-- carries work-side truth only when a released event exists. `has_event` states
-- which regime the reader is in, and it is never implied by empty work.
--
-- ── COMPOSITION, NOT RESTATEMENT ───────────────────────────────────────────
-- Every promise fact comes from the v292a1 resolvers — promise_current_*,
-- occurrence_current_venue, occurrence_current_supervision. The bitemporal
-- resolution rule (eligible → live → effective → latest, with future-effective
-- returned separately) is NOT restated here. Two implementations of a bitemporal
-- rule diverge; there is one, and this projection consumes it.
--
-- ── OVERLAPS, NOT COLLISIONS (ruled) ───────────────────────────────────────
-- `data.overlaps` reports that two windows overlap in TIME. It makes no claim
-- about shared resources. "Both need the loading dock" requires a resource model
-- that does not exist, and is registered as future architecture. The field is
-- named overlaps so no consumer can mistake it for contention.
--
-- ── CONTRACTED COUNT ───────────────────────────────────────────────────────
-- Read from attendance_commitment with basis='contracted'. NEVER inferred from
-- offer_snapshots.model, which is schemaless application JSON with no
-- constitutional path to a headcount (proven in the v292a report §2).
--
-- READ-PURE. STABLE, so the engine forbids it writing. Returns NULL for an
-- absent or foreign occurrence (I-40), exactly as event_workspace does.
-- ════════════════════════════════════════════════════════════════════════════

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

grant execute on function public.projection_occurrence_brief(uuid, timestamptz) to authenticated;
