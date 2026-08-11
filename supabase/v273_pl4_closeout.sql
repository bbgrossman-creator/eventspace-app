-- ═══════════════════════════════════════════════════════════════════════════
-- v273 — PL-4 · CLOSE-OUT HARDENING (accept_offer replace-in-place; no schema
-- change, no signature change, PL-3 untouched).
--
-- THE AUDIT FINDING THIS SLICE CLOSES. The v268 resolver already freezes the
-- offered terms into offer_snapshots.model — `validUntil` (A.1) and, per choice
-- group, a frozen `groupId`, stable option `optionId`s, and explicit `min`/`max`
-- bounds derived from `chooseCount` (A.2). But the deployed v271 accept_offer
-- reads NONE of the bounds and NEITHER the deadline: it validated selections for
-- membership and duplicates only, and never evaluated expiry. Two settled
-- invariants were therefore under-enforced against the closed data contract:
--
--   I-22 (current-only / expiry, Addendum A.1) — an Offer past its frozen
--        `validUntil` was still acceptable. The customer sees a deadline the
--        system did not honor.
--   I-26 (selection validity, Addendum A.2) — a frozen "choose exactly N" (or
--        any min/max) group could be satisfied with fewer or more than N, or
--        omitted entirely; the accepted configuration could violate the offer's
--        own frozen rules.
--
-- Neither was a false certification: the v271 proof (AC-1..AC-12) never claimed
-- expiry or cardinality, and canon §6.43 recorded them by omission. They are
-- honest under-enforcement gaps, closeable with NO schema change because the
-- frozen data to check against is already present in every post-v268 Snapshot.
-- This migration reads it back and enforces it, at the acceptance linearization
-- point, under the existing thread-first lock.
--
-- WHAT IS **NOT** IN THIS SLICE (recorded, not silently resolved):
--   · Attested acceptance (constitution §4.2 / plan A.5) — explicitly deferred
--     to a later slice by canon §6.43 ("the attested path is a later slice").
--     accept_offer stays observed-only; the expiry comparison therefore governs
--     on the RECORDED moment (now()). The claimed-moment branch (Addendum A.1,
--     attested) is written as an unreachable, documented seam so the attested
--     slice populates it without restructuring — never as live dead code.
--   · Refusal-code vocabulary reconciliation — the deployed ceremony uses the
--     ACCEPT_* / RESCIND_* / CEREMONY_* prefix convention rather than the
--     constitution's OFFER_* / RESCISSION_* / ACCEPTANCE_* strings. The behavior
--     matches code-for-code; the route maps them to stable non-disclosing codes.
--     Churning the strings would risk that mapping for no behavioral gain, so the
--     divergence is RECORDED in the certification, not changed here. The new
--     checks below follow the same ACCEPT_* convention for local consistency.
--
-- LEGACY PRECEDENCE (plan A.0, binding). Per frozen group, bounds resolve by:
--   (1) explicit frozen `min`/`max` present → use them;
--   (2) else frozen `chooseCount` present → min = max = chooseCount (exact);
--   (3) else → refuse ACCEPT_LEGACY_CHOICE_UNRESOLVED. The ceremony NEVER infers
--       optionality or any cardinality the artifact did not freeze — a customer
--       is never accepted against terms the Snapshot does not establish. A
--       missing `validUntil` is null = open-ended (the one safe default: it makes
--       an old Offer no MORE permissive about its content, only unbounded in
--       time, which is unambiguous).
--
-- Exactly the accept_offer body changes; every other object is untouched.
-- Additive, rerunnable (create or replace), production-safe. Deploy after v272.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.accept_offer(
  p_version      uuid,      -- the Offer's version (one snapshot per sent version)
  p_actor        text,      -- who performs the ceremony (recorded on the ledger)
  p_fingerprint  text,      -- the fingerprint the client believes it is accepting
  p_selections   jsonb,     -- [{ "groupId": text, "optionIds": [text,...] }, ...] or null/[]
  p_principal    jsonb default null,   -- the committing principal, by value (as known)
  p_channel      text default 'endpoint'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant     uuid := public.current_tenant_id();
  v_prop       uuid;
  v_status     text;
  v_sealed     timestamptz;
  v_booking    uuid;
  v_snap       uuid;
  v_snap_fp    text;
  v_model      jsonb;
  v_acc        uuid;
  v_sel_norm   jsonb;
  v_grp        jsonb;
  v_gid        text;
  v_opts       jsonb;
  v_oid        text;
  v_seen_opts  text[];
  -- v273 close-out locals
  v_valid_until text;
  v_govern_mmt timestamptz;
  v_min        int;
  v_max        int;
  v_count      int;
begin
  -- ── STEP 1 — THREAD-FIRST lock: proposal row, then version row (v266 order) ──
  select p.id, p.booking_id into v_prop, v_booking
    from public.proposals p
    join public.bookings b on b.id = p.booking_id and b.tenant_id = v_tenant
    where p.id = (select proposal_id from public.proposal_versions where id = p_version)
    for update of p;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;

  select v.status, v.sealed_at into v_status, v_sealed
    from public.proposal_versions v where v.id = p_version for update of v;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;

  -- ── STEP 2 — LINEARIZATION POINT: prove eligibility from the LOCKED row ──
  if v_sealed is null then raise exception 'ACCEPT_NOT_PUBLISHED'; end if;
  if v_status = 'withdrawn'  then raise exception 'ACCEPT_OFFER_WITHDRAWN';  end if;
  if v_status = 'superseded' then raise exception 'ACCEPT_OFFER_SUPERSEDED'; end if;

  -- ── STEP 3 — resolve the immutable snapshot (one per version) + its fingerprint ──
  select s.id, s.fingerprint, s.model into v_snap, v_snap_fp, v_model
    from public.offer_snapshots s where s.version_id = p_version;
  if not found then raise exception 'ACCEPT_NOT_PUBLISHED'; end if;

  -- ── STEP 4 — already-accepted precheck under lock, RELATION-based (I-20).
  -- Runs BEFORE the status-eligibility check so a replay against the accepted
  -- Offer returns ALREADY_ACCEPTED, not NOT_ELIGIBLE — the acceptance record is
  -- the constitutional truth, not the status projection. The UNIQUE(snapshot) is
  -- the race backstop. ──
  if exists (select 1 from public.offer_acceptances a where a.snapshot_id = v_snap) then
    raise exception 'ACCEPT_ALREADY_ACCEPTED';
  end if;

  -- only a currently-sent Offer is first-acceptable (accepted was handled above)
  if v_status <> 'sent' then raise exception 'ACCEPT_OFFER_NOT_ELIGIBLE'; end if;

  -- ── STEP 5 — fingerprint binding (I-21): bind the snapshot's own fingerprint;
  -- if the client presented one, it must match (defence in depth, no recompute) ──
  if p_fingerprint is not null and p_fingerprint is distinct from v_snap_fp then
    raise exception 'ACCEPT_FINGERPRINT_MISMATCH';
  end if;

  -- ── STEP 5b (v273) — EXPIRY (I-22 / Addendum A.1). Read the frozen deadline
  -- from the immutable model (fingerprint-covered). Null ⇒ open-ended. The
  -- interval is half-open [published_at, valid_until): acceptable iff the
  -- governing moment < valid_until; refuse ACCEPT_OFFER_EXPIRED at or after it.
  -- The DATABASE server clock is authoritative — no client time is trusted.
  -- Observed acceptance governs on the RECORDED moment (now()); the attested
  -- claimed-moment branch is the documented seam the attested slice fills. ──
  v_valid_until := v_model->>'validUntil';
  if v_valid_until is not null then
    -- observed-only today: the governing moment is the recorded moment.
    v_govern_mmt := now();
    if v_govern_mmt >= v_valid_until::timestamptz then
      raise exception 'ACCEPT_OFFER_EXPIRED';
    end if;
  end if;

  -- ── STEP 6 — validate + normalize selections against the FROZEN model ──
  -- (never reads live choice_groups; frozen groupId/optionId from v268 model)
  -- Membership + duplicate-free, exactly as v271. Cardinality is STEP 6b.
  if p_selections is null or jsonb_typeof(p_selections) = 'null'
     or (jsonb_typeof(p_selections) = 'array' and jsonb_array_length(p_selections) = 0) then
    v_sel_norm := jsonb_build_object('empty', true, 'groups', '[]'::jsonb);
  else
    if jsonb_typeof(p_selections) <> 'array' then raise exception 'ACCEPT_INVALID_SELECTION'; end if;
    v_sel_norm := jsonb_build_object('empty', false, 'groups', '[]'::jsonb);
    for v_grp in select * from jsonb_array_elements(p_selections) loop
      if jsonb_typeof(v_grp) <> 'object' then raise exception 'ACCEPT_INVALID_SELECTION'; end if;
      v_gid := v_grp->>'groupId';
      if v_gid is null then raise exception 'ACCEPT_INVALID_SELECTION'; end if;
      -- the group must exist in the frozen model
      if not exists (
        select 1 from jsonb_array_elements(coalesce(v_model->'choiceGroups','[]'::jsonb)) g
        where g->>'groupId' = v_gid
      ) then raise exception 'ACCEPT_INVALID_SELECTION'; end if;

      v_opts := v_grp->'optionIds';
      if v_opts is null or jsonb_typeof(v_opts) <> 'array' then raise exception 'ACCEPT_INVALID_SELECTION'; end if;
      v_seen_opts := array[]::text[];
      for v_oid in select jsonb_array_elements_text(v_opts) loop
        -- duplicate within the group is structurally refused (never deduped)
        if v_oid = any(v_seen_opts) then raise exception 'ACCEPT_DUPLICATE_SELECTION'; end if;
        v_seen_opts := v_seen_opts || v_oid;
        -- the option must belong to THIS group in the frozen model
        if not exists (
          select 1
          from jsonb_array_elements(coalesce(v_model->'choiceGroups','[]'::jsonb)) g,
               jsonb_array_elements(coalesce(g->'options','[]'::jsonb)) o
          where g->>'groupId' = v_gid and o->>'optionId' = v_oid
        ) then raise exception 'ACCEPT_INVALID_SELECTION'; end if;
      end loop;

      v_sel_norm := jsonb_set(v_sel_norm, '{groups}',
        (v_sel_norm->'groups') || jsonb_build_object('groupId', v_gid, 'optionIds', v_opts));
    end loop;
  end if;

  -- ── STEP 6b (v273) — CARDINALITY (I-26 / Addendum A.2). Iterate EVERY frozen
  -- group (the authoritative set), so a mandatory group OMITTED from the payload
  -- is caught, not just malformed present ones. Bounds resolve by the binding
  -- legacy precedence: explicit frozen min/max → frozen chooseCount as min=max →
  -- refuse ACCEPT_LEGACY_CHOICE_UNRESOLVED (never infer cardinality the artifact
  -- did not freeze). count < min ⇒ ACCEPT_INCOMPLETE_SELECTION (includes the
  -- absent mandatory group); count > max ⇒ ACCEPT_INVALID_SELECTION (excessive).
  -- Validates against the frozen model ONLY — the live choice_groups table is
  -- never read. ──
  for v_grp in
    select * from jsonb_array_elements(coalesce(v_model->'choiceGroups','[]'::jsonb))
  loop
    v_gid := v_grp->>'groupId';

    -- bounds by strict precedence
    if v_grp ? 'min' and v_grp ? 'max'
       and jsonb_typeof(v_grp->'min') = 'number' and jsonb_typeof(v_grp->'max') = 'number' then
      v_min := (v_grp->>'min')::int;
      v_max := (v_grp->>'max')::int;
    elsif v_grp ? 'chooseCount' and jsonb_typeof(v_grp->'chooseCount') = 'number' then
      v_min := (v_grp->>'chooseCount')::int;
      v_max := v_min;
    else
      -- neither explicit bounds nor a frozen choose_count: the artifact did not
      -- establish this group's cardinality. Refuse — never default to optional.
      raise exception 'ACCEPT_LEGACY_CHOICE_UNRESOLVED';
    end if;

    -- how many options did the (normalized) payload select for THIS frozen group?
    select coalesce(jsonb_array_length(sg->'optionIds'), 0) into v_count
      from jsonb_array_elements(v_sel_norm->'groups') sg
     where sg->>'groupId' = v_gid
     limit 1;
    if v_count is null then v_count := 0; end if;   -- group absent from payload

    if v_count < v_min then raise exception 'ACCEPT_INCOMPLETE_SELECTION'; end if;
    if v_count > v_max then raise exception 'ACCEPT_INVALID_SELECTION'; end if;
  end loop;

  -- ── STEP 7 — ATOMIC write: acceptance, selection set, ledger fact ──
  -- Observed self-service: principal = acting person, authority_basis 'self',
  -- evidence_basis 'observed', recording_operator/claimed_moment/attestation_ref
  -- NULL. The reserved attested slots are populated by the deferred attested slice.
  insert into public.offer_acceptances (
      tenant_id, snapshot_id, fingerprint, booking_id,
      principal, acting_person, recording_operator, authority_basis,
      evidence_basis, channel, recorded_moment, claimed_moment,
      capability_ref, attestation_ref)
    values (
      v_tenant, v_snap, v_snap_fp, v_booking,
      p_principal, p_principal, null, 'self',
      'observed', p_channel, now(), null,
      jsonb_build_object('version_id', p_version, 'snapshot_id', v_snap), null)
    returning id into v_acc;

  insert into public.acceptance_selection_sets (tenant_id, acceptance_id, selections)
    values (v_tenant, v_acc, v_sel_norm);

  insert into public.engagement_ledger
      (tenant_id, booking_id, ceremony, actor, moment, object_ref, snapshot_ref, fingerprint_ref, reason)
    values (v_tenant, v_booking, 'offer_accepted', p_actor, now(), p_version, v_snap, v_snap_fp, 'observed');

  -- ── STEP 8 — derived status projection (I-30): written atomically with the fact ──
  update public.proposal_versions set status = 'accepted' where id = p_version;

  return jsonb_build_object(
    'outcome', 'accepted',
    'acceptance_id', v_acc,
    'snapshot_id', v_snap,
    'fingerprint', v_snap_fp);
end $$;

comment on function public.accept_offer is
  'v271 acceptance ceremony, v273-hardened: expiry (I-22/A.1, frozen validUntil, '
  'half-open interval, server clock, observed→recorded moment) and selection '
  'cardinality (I-26/A.2, frozen min/max with legacy chooseCount precedence, '
  'absent-mandatory and excessive both refused) are now enforced against the '
  'frozen model. Observed-only; the attested path remains a deferred slice.';
