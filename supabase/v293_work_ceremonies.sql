-- ============================================================================
-- v293 — Work Becomes Actionable
-- File:  supabase/v293_work_ceremonies.sql
-- Apply: after v292d1_work_lens_operational_day.sql
--
-- Two work-side ceremonies, pattern-copied from the v292c promise ceremonies
-- (open_occurrence / cancel_occurrence / set_schedule_milestone):
--
--   guard with is_active_member()  ·  derive the actor with action_actor()
--   ·  delegate to a certified ceremony  ·  add no semantics of its own
--
-- WHAT THESE ADD, precisely: an authorization guard and a server-derived actor.
-- Nothing else. Ownership still moves ONLY through the certified compare-and-
-- swap in transfer_responsibility_ownership. Evidence still lands ONLY through
-- the kind-validated record_execution_evidence. State is still derived ONLY by
-- responsibility_state(). No new ownership, evidence, completion or state
-- semantics are introduced here.
--
-- WHY THEY EXIST AT ALL: the delegates take p_actor as a parameter, and the
-- house discipline on every UI-facing ceremony is that the client never
-- supplies an actor — perform_event_action refuses actor/tenant_id/role in a
-- payload outright, and every promise ceremony derives it internally. Exposing
-- the raw delegates to the client would send an actor from the browser, against
-- that discipline. These wrappers close that gap and nothing more.
--
-- DELIBERATE, RECORDED DECISIONS (frozen specification §0):
--   · complete_responsibility REFUSES a duplicate completion. The delegate
--     permits a second completion fact; this wrapper does not. Judged a
--     ceremony-level guard rather than new semantics: derived state is
--     'discharged' either way, the action registry itself marks evidence
--     recording 'record_once', and CLOSE_ALREADY_CLOSED / PROMISE_UNCHANGED are
--     the identical house shape.
--   · Completion does NOT require ownership. Enforcing owner = actor would be
--     semantics the delegate lacks, and it contradicts operational reality: a
--     manager records for the person elbow-deep in the brisket. The UI renders
--     the verb by ownership; SQL permits any active member.
--
-- Both functions are VOLATILE. They write. Declaring them STABLE would be false
-- and the engine-enforced volatility invariant cuts both ways.
-- ============================================================================

-- ── Preflight ───────────────────────────────────────────────────────────────
do $preflight$
declare
  v_missing text[] := '{}';
  r record;
begin
  for r in
    select * from (values
      ('action_actor'),
      ('is_active_member'),
      ('current_tenant_id'),
      ('transfer_responsibility_ownership'),
      ('record_execution_evidence'),
      ('responsibility_state'),
      ('responsibility_current_owner')
    ) d(name)
  loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.proname = r.name
    ) then
      v_missing := v_missing || ('function public.' || r.name);
    end if;
  end loop;

  if array_length(v_missing, 1) is not null then
    raise exception
      'V293_PREFLIGHT_FAILED: missing % — apply against the live instance, not a database rebuilt from the deployment checkout',
      array_to_string(v_missing, ', ');
  end if;

  -- Non-idempotent by design, matching the v292d1 house pattern: a second
  -- apply must be caught rather than silently succeeding, so the +2 pg_proc
  -- residue census stays meaningful.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('claim_responsibility', 'complete_responsibility')
  ) then
    raise exception 'V293_ALREADY_APPLIED: a work ceremony is already present';
  end if;
end $preflight$;

-- ── claim_responsibility ────────────────────────────────────────────────────
-- Unowned-only by construction: p_expected_prior is null, so the delegate's
-- certified compare-and-swap refuses with OWNERSHIP_CONFLICT if anyone already
-- holds the row. A stale render or a race therefore resolves CORRECTLY — the
-- refusal is the feature, not a rough edge. Nothing here re-implements the CAS.
create or replace function public.claim_responsibility(p_responsibility uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor text := public.action_actor();
  v_id    uuid;
begin
  if not public.is_active_member() then
    raise exception 'WORK_NOT_AUTHORIZED: responsibility';
  end if;

  -- Delegation only. RESP_NOT_FOUND, OWNERSHIP_CONFLICT and RESP_ACTOR_REQUIRED
  -- all surface from the certified ceremony, unaltered.
  v_id := public.transfer_responsibility_ownership(
            p_responsibility,   -- the row
            v_actor,            -- new owner: the session's own actor
            null,               -- expected prior: unowned only
            v_actor);           -- actor, server-derived, never client-supplied

  return jsonb_build_object('ownership_id', v_id, 'owner', v_actor);
end $function$;

-- ── complete_responsibility ─────────────────────────────────────────────────
-- The department verb ("Made", "Pulled", "Delivered") is PRESENTATION. It rides
-- in p_payload if the caller wants it recorded; the fact written is always
-- kind='completion', which is what responsibility_state() derives 'discharged'
-- from. The closed evidence vocabulary is not widened by a label.
create or replace function public.complete_responsibility(
  p_responsibility uuid,
  p_payload jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor  text := public.action_actor();
  v_tenant uuid := public.current_tenant_id();
  v_id     uuid;
begin
  if not public.is_active_member() then
    raise exception 'WORK_NOT_AUTHORIZED: responsibility';
  end if;

  -- Recorded decision: refuse a second completion. See the header.
  if exists (
    select 1 from public.execution_evidence e
     where e.obligation_ref = p_responsibility
       and e.tenant_id = v_tenant
       and e.kind = 'completion'
  ) then
    raise exception 'COMPLETION_ALREADY_RECORDED';
  end if;

  -- p_event null: the delegate resolves the event THROUGH the obligation under
  -- the tenant, so standing rows (event_ref null) and event-scoped rows take
  -- the same path. A foreign or absent responsibility surfaces as
  -- CEREMONY_NOT_FOUND — not-found rather than forbidden, so existence does not
  -- leak across tenants.
  v_id := public.record_execution_evidence(
            null,                              -- p_event
            p_responsibility,                  -- p_obligation
            'completion',                      -- p_kind, closed vocabulary
            v_actor,                           -- p_actor, server-derived
            coalesce(p_payload, '{}'::jsonb),  -- p_payload, opaque
            null);                             -- p_prior

  return jsonb_build_object('evidence_id', v_id);
end $function$;
