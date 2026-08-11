-- ═══════════════════════════════════════════════════════════════════════════
-- v270 — PL-4 · PROTECTIVE COMPATIBILITY AMENDMENTS (replace-in-place, narrow).
--
-- The bars that MUST exist before the v271 acceptance ceremonies, so an
-- acceptance can never exist for even one production interval without the
-- accepted-Offer protections and the shared thread-first lock order. This slice
-- creates NO acceptance rows, validates NO selections, implements NO rescission,
-- and adds NO lifecycle model. It amends exactly two PL-3 functions and records
-- the (already-satisfied) status-vocabulary compatibility.
--
-- Narrow PL-4 compatibility amendments, NOT a reopening of PL-3: no signature
-- changes, no invariant weakened, PL-3's ordering/archive/seal law untouched.
--
-- "An acceptance exists for the Offer" is resolved STRUCTURALLY against the
-- immutable v269 relation: an offer_acceptances row whose snapshot's version_id
-- is this Offer's version. It is NOT resolved from status text (I-30: the
-- acceptance record is the fact; status is only a projection).
--
-- Rerunnable, production-safe. Deploy after v269, before v271.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (C.3) STATUS VOCABULARY ─────────────────────────────────────────────────
-- proposal_versions.status is free text (no CHECK, no enum) — verified against
-- the deployed schema. 'accepted' (and later the rescission release states) are
-- therefore already admissible with NO DDL. We deliberately add no CHECK: that
-- would be a new lifecycle model this slice must not introduce, and could reject
-- states later PL-4 slices add. Status stays a compatible projection of the
-- immutable acceptance record, never a substitute for it. No change made here.


-- ── (C.1) publish_offer — accepted-Offer supersession bar (I-23) ────────────
-- Re-creates publish_offer from the authoritative v267 body with EXACTLY two
-- deltas: (1) the accepted-bar inserted at STEP 11; (2) the pgcrypto digest()
-- call schema-qualified (preserving the v267b production correction). Every
-- other step is byte-identical to the deployed law. Idempotent.
do $mig$
declare v_schema text; v_body text;
begin
  select n.nspname into v_schema from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.proname='digest' and p.pronargs=2
      and p.proargtypes[0]='bytea'::regtype and p.proargtypes[1]='text'::regtype
    order by (n.nspname='public') desc limit 1;
  if v_schema is null then raise exception 'v270: pgcrypto digest not found'; end if;
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
  select v.id into v_prior from public.proposal_versions v
    where v.proposal_id = v_prop and v.id <> p_version
      and v.sealed_at is not null and v.status = 'sent'
    order by v.sealed_at desc limit 1;

  -- v270 (C.1) — ACCEPTED-OFFER BAR: an accepted prior current Offer can never
  -- be superseded (I-23). Resolved STRUCTURALLY against the immutable acceptance
  -- relation (an offer_acceptances row whose snapshot's version_id is v_prior),
  -- NOT from status text. Sits under the STEP-1 thread lock, so it is race-safe
  -- against a concurrent acceptance. A commitment is never silently replaced.
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
  raise notice 'v270: publish_offer accepted-bar installed; digest qualified to %.digest', v_schema;
end $mig$;


-- ── (C.2) withdraw_offer — accepted-guard AND thread-first lock ─────────────
-- Two amendments in one replace-in-place:
--   (2a) adopt the v266 thread-first lock order: lock the proposal (thread) row
--        FIRST, then the version row — matching publish_offer and the future
--        acceptance/rescission ceremonies. The deployed body locked only the
--        version (for update of v); this brings withdrawal into the single
--        total order (I-25) and closes the supersede-after-withdraw wrinkle.
--   (2b) refuse withdrawal when an acceptance exists (I-23): an accepted Offer
--        is not withdrawable — releasing a commitment is rescission (a later
--        slice), never withdrawal. Structural check against the immutable relation.
create or replace function public.withdraw_offer(
  p_version uuid, p_actor text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_prop    uuid;
  v_status  text;
  v_booking uuid;
begin
  -- (2a) THREAD-FIRST lock: proposal row first (v266 order), tenant-scoped.
  select p.id, p.booking_id into v_prop, v_booking
    from public.proposals p
    join public.bookings b on b.id = p.booking_id and b.tenant_id = v_tenant
    where p.id = (select proposal_id from public.proposal_versions where id = p_version)
    for update of p;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;

  -- then the version row (second in the shared total order)
  select v.status into v_status
    from public.proposal_versions v where v.id = p_version for update of v;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;

  if v_status in ('approved','withdrawn','superseded') then
    raise exception 'CEREMONY_OFFER_TERMINAL';
  end if;

  -- (2b) ACCEPTED-GUARD: an accepted Offer cannot be withdrawn (I-23). Structural
  -- check against the immutable acceptance relation, not status text. Under the
  -- thread lock above, so race-safe vs a concurrent acceptance.
  if exists (
    select 1 from public.offer_acceptances a
      join public.offer_snapshots s on s.id = a.snapshot_id
     where s.version_id = p_version) then
    raise exception 'WITHDRAW_BLOCKED_BY_ACCEPTANCE';
  end if;

  update public.proposal_versions set status = 'withdrawn' where id = p_version;
  insert into public.engagement_ledger (tenant_id, booking_id, ceremony, actor, object_ref)
    values (v_tenant, v_booking, 'offer_withdrawn', p_actor, p_version);
  return jsonb_build_object('outcome', 'withdrawn');
end $$;
