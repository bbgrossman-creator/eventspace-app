-- ═══════════════════════════════════════════════════════════════════════════
-- v271 — PL-4 · ACCEPTANCE CEREMONY (additive; one new function, one ledger kind).
--
-- Converts a published Offer into an immutable Acceptance. It resolves the Offer
-- under the caller's tenant, takes the SHARED thread-first lock (proposal row,
-- then version row — identical to publish_offer/withdraw_offer, so no deadlock),
-- proves eligibility at the linearization point, validates selections against the
-- FROZEN snapshot model (never live choice_groups), and ATOMICALLY writes:
--   · offer_acceptances       (A.1, immutable, UNIQUE(snapshot_id) = I-20)
--   · acceptance_selection_sets (A.2, immutable, UNIQUE(acceptance_id))
--   · one offer_accepted ledger fact (identifies the same accepted object)
-- Either all three exist or none does. No rescission, no amendment, no status
-- vocabulary beyond the already-admissible 'accepted', no second source of truth.
--
-- SECURITY DEFINER runs the body, but authorization is by current_tenant_id()
-- (auth.uid() → active tenant_users): definer privilege never becomes the
-- authorization model. Every read/write is tenant-scoped; a version outside the
-- caller's tenant does not resolve (CEREMONY_NOT_FOUND — no existence leak).
--
-- Additive, rerunnable (create or replace), production-safe. Deploy after v270.
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
  v_empty      boolean;
  v_grp        jsonb;
  v_gid        text;
  v_opts       jsonb;
  v_oid        text;
  v_seen_opts  text[];
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

  -- ── STEP 6 — validate + normalize selections against the FROZEN model ──
  -- (never reads live choice_groups; frozen groupId/optionId from v268 model)
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

  -- ── STEP 7 — ATOMIC write: acceptance, selection set, ledger fact ──
  insert into public.offer_acceptances (
      tenant_id, snapshot_id, fingerprint, booking_id,
      principal, acting_person, recording_operator, authority_basis,
      evidence_basis, channel, recorded_moment, claimed_moment,
      capability_ref, attestation_ref)
    values (
      v_tenant, v_snap, v_snap_fp, v_booking,
      p_principal, p_principal, null, 'self',      -- observed self-service: principal = acting person
      'observed', p_channel, now(), null,          -- recorded now; observed has no claimed/attestation
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


-- ═══════════════════════════════════════════════════════════════════════════
-- v271 DELTA to publish_offer — keep the accepted Offer discoverable at STEP 10.
--
-- v271 projects an accepted version to status='accepted'. The v270 supersession
-- bar lived at STEP 11 but STEP 10 discovered the prior current Offer by
-- status='sent' only — so an accepted Offer (now 'accepted') escaped discovery
-- and the bar never evaluated it. This delta widens STEP 10 discovery to
-- ('sent','accepted') so the accepted Offer is found and the relation-based bar
-- refuses (PUBLISH_BLOCKED_BY_ACCEPTANCE). The STEP 11 UPDATE still targets ONLY
-- status='sent', so a genuinely-sent prior is superseded and an accepted prior
-- is barred, never mutated. Exactly TWO deltas from the v270 body: (1) STEP 10
-- status filter widened; (2) [carried] the v270 accepted-bar + v267b digest
-- qualification preserved. No signature change.
-- ═══════════════════════════════════════════════════════════════════════════
do $mig$
declare v_schema text; v_body text;
begin
  select n.nspname into v_schema from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.proname='digest' and p.pronargs=2
      and p.proargtypes[0]='bytea'::regtype and p.proargtypes[1]='text'::regtype
    order by (n.nspname='public') desc limit 1;
  if v_schema is null then raise exception 'v271: pgcrypto digest not found'; end if;
  v_body := format($body$create or replace function public.publish_offer(
  p_version    uuid,
  p_actor      text,
  p_staged     uuid,
  p_policy     jsonb,
  p_profile    jsonb,
  p_evidence   text,
  p_channel    text,
  p_occurred_at timestamptz,
  p_reason     text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant   uuid := public.current_tenant_id();
  v_status   text;
  v_sealed   timestamptz;
  v_prop     uuid;
  v_cur_rev  bigint;
  v_stg      record;
  v_cur_fp   text;
  v_review   record;
  v_snap     uuid;
  v_prior    uuid;
  v_token    text;
  v_arch_at  timestamptz;
  v_demands  boolean;
  v_authority_ok boolean;
  v_superseded_count int;
begin
  -- STEP 1 — serialize the THREAD (proposal) then the version (v266 lock order)
  select p.id into v_prop
    from public.proposals p
    join public.bookings b on b.id = p.booking_id and b.tenant_id = v_tenant
    where p.id = (select proposal_id from public.proposal_versions where id = p_version)
    for update of p;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  select v.status, v.sealed_at, v.content_revision
    into v_status, v_sealed, v_cur_rev
    from public.proposal_versions v where v.id = p_version for update of v;

  -- STEP 2 — prove publishable
  if v_sealed is not null or v_status = 'sent' then raise exception 'PUBLISH_ALREADY_PUBLISHED'; end if;
  if v_status in ('withdrawn','superseded','approved') then raise exception 'PUBLISH_NOT_PUBLISHABLE'; end if;
  if v_status not in ('draft','internal_review') then raise exception 'PUBLISH_NOT_PUBLISHABLE'; end if;

  select * into v_stg from public.staged_artifact_packages where id = p_staged for update;
  if not found then raise exception 'PUBLISH_STALE_PREPARATION'; end if;
  if v_stg.tenant_id <> v_tenant or v_stg.version_id <> p_version then raise exception 'PUBLISH_CROSS_TENANT'; end if;
  if v_stg.status <> 'staged' then raise exception 'PUBLISH_STALE_PREPARATION'; end if;

  -- STEP 3 — DB-checkable freshness
  if v_stg.content_revision is distinct from v_cur_rev then raise exception 'PUBLISH_STALE_PREPARATION'; end if;
  v_cur_fp := v_stg.fingerprint;

  -- STEP 4 — current policy
  if coalesce((v_stg.model->>'complete')::boolean, false) is not true then raise exception 'PUBLISH_INCOMPLETE_OFFER'; end if;
  if coalesce((v_stg.model->>'profile_satisfied')::boolean, false) is not true then raise exception 'PUBLISH_INCOMPLETE_OFFER'; end if;
  v_demands := coalesce((p_policy->>'demandsReview')::boolean, false);
  if v_demands then
    select * into v_review from public.review_decisions
      where version_id = p_version and decision = 'approved' and fingerprint = v_cur_fp
      order by moment desc limit 1;
    if not found then raise exception 'PUBLISH_REVIEW_REQUIRED'; end if;
    if not (coalesce(p_policy->'demandedChecks','[]'::jsonb) <@
            to_jsonb(coalesce(v_review.checks_answered, '{}'::text[]))) then
      raise exception 'PUBLISH_STALE_APPROVAL';
    end if;
    if p_policy ? 'requiredApproverRoles' then
      v_authority_ok := (v_review.authority ? 'role')
        and (p_policy->'requiredApproverRoles') @> to_jsonb(array[v_review.authority->>'role']);
      if not v_authority_ok then raise exception 'PUBLISH_INVALID_APPROVER_AUTHORITY'; end if;
    end if;
  end if;

  -- STEP 5 — archive exists + integrity
  if v_stg.artifact_bytes is null or v_stg.artifact_hash is null or octet_length(v_stg.artifact_bytes) = 0 then
    raise exception 'PUBLISH_ARCHIVE_MISSING';
  end if;
  if encode(%1$I.digest(v_stg.artifact_bytes, 'sha256'), 'hex') is distinct from v_stg.artifact_hash then
    raise exception 'PUBLISH_ARCHIVE_CORRUPT';
  end if;
  v_arch_at := v_stg.created_at;

  if p_evidence = 'observed' then
    if p_channel <> 'endpoint' then raise exception 'PUBLISH_INVALID_CHANNEL'; end if;
  elsif p_evidence = 'attested' then
    if p_channel <> 'in_person' then raise exception 'PUBLISH_INVALID_CHANNEL'; end if;
    if p_occurred_at is null then raise exception 'PUBLISH_INVALID_CHANNEL'; end if;
    if not (v_arch_at <= p_occurred_at and p_occurred_at <= now()) then raise exception 'PUBLISH_ATTESTATION_IMPOSSIBLE'; end if;
  else
    raise exception 'PUBLISH_INVALID_CHANNEL';
  end if;

  -- STEP 6 — SEAL
  update public.proposal_versions set sealed_at = now() where id = p_version;

  -- STEP 7 — PROMOTE
  insert into public.offer_snapshots
      (tenant_id, version_id, fingerprint, model, artifact_bytes, artifact_hash, artifact_meta, assets)
    values (v_tenant, p_version, v_cur_fp, v_stg.model, v_stg.artifact_bytes,
            v_stg.artifact_hash, coalesce(v_stg.artifact_meta,'{}'::jsonb), v_stg.assets)
    returning id into v_snap;
  update public.proposal_versions set snapshot_id = v_snap where id = p_version;

  -- STEP 8 — offer_published
  insert into public.engagement_ledger
      (tenant_id, booking_id, ceremony, actor, snapshot_ref, fingerprint_ref, reason, from_state, to_state)
    select v_tenant, p.booking_id, 'offer_published', p_actor, v_snap, v_cur_fp,
           p_evidence || case when p_reason is not null then ' · ' || p_reason else '' end, v_status, 'sent'
      from public.proposals p where p.id = v_prop;

  -- STEP 9 — Version → Sent
  update public.proposal_versions set status = 'sent', sent_at = coalesce(sent_at, now()) where id = p_version;

  -- STEP 10 — prior current offer (sent + sealed + not this one)
  -- v271 — an accepted Offer remains the current Offer (I-16); it must be
  -- discoverable here so the accepted-bar below evaluates and refuses. The
  -- supersession UPDATE (STEP 11) still targets ONLY status='sent', so an
  -- accepted prior is found, barred, and never mutated.
  select v.id into v_prior from public.proposal_versions v
    where v.proposal_id = v_prop and v.id <> p_version
      and v.sealed_at is not null and v.status in ('sent','accepted')
    order by v.sealed_at desc limit 1;

  -- v270 (C.1) + v271 — ACCEPTED-OFFER BAR: an accepted prior current Offer can
  -- never be superseded (I-23). Resolved STRUCTURALLY against the immutable
  -- acceptance relation, not status text. Under the STEP-1 thread lock.
  if v_prior is not null and exists (
       select 1 from public.offer_acceptances a
         join public.offer_snapshots s on s.id = a.snapshot_id
        where s.version_id = v_prior) then
    raise exception 'PUBLISH_BLOCKED_BY_ACCEPTANCE';
  end if;

  -- STEP 11 — supersede ONLY a currently-sent sibling. The status='sent' guard
  -- on the UPDATE makes a withdraw racing between step 10 and here unconstructible:
  -- if the prior was withdrawn in the interim, the UPDATE matches zero rows and
  -- no false offer_superseded is written. Invariant: supersession is sent→superseded.
  if v_prior is not null then
    update public.proposal_versions set status = 'superseded'
      where id = v_prior and status = 'sent';
    get diagnostics v_superseded_count = row_count;
    if v_superseded_count = 1 then
      insert into public.engagement_ledger
          (tenant_id, booking_id, ceremony, actor, from_state, to_state, object_ref)
        select v_tenant, p.booking_id, 'offer_superseded', p_actor, 'sent', 'superseded', v_prior
          from public.proposals p where p.id = v_prop;
    end if;
  end if;

  -- STEP 12 — durable endpoint (observed)
  if p_evidence = 'observed' then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.offer_endpoints (tenant_id, snapshot_id, token) values (v_tenant, v_snap, v_token);
  end if;

  -- STEP 13 — transport: PHASE B, INACTIVE.
  -- STEP 14 — retire the staged identity
  update public.staged_artifact_packages set status = 'promoted' where id = p_staged;
  -- STEP 15 — commit all or nothing
  return jsonb_build_object('outcome', 'published', 'snapshot_id', v_snap,
    'evidence', p_evidence, 'endpoint_token', v_token, 'superseded',
    case when v_superseded_count = 1 then v_prior else null end);
end $$;$body$, v_schema);
  execute v_body;
  raise notice 'v271: publish_offer STEP 10 widened to discover accepted Offers; digest qualified to %.digest', v_schema;
end $mig$;
