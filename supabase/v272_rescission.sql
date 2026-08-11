-- ═══════════════════════════════════════════════════════════════════════════
-- v272 — PL-4 · RESCISSION (Phase B). The authority-gated release of an
-- Acceptance: one immutable rescission record, one ceremony, one new ledger
-- kind, and the projection/bar rework that lets a released Offer be replaced
-- while a terminally-released Offer stays barred.
--
-- THE LAW THIS SLICE SATISFIES (PL-4 constitution, I-20…I-30; load-bearing):
--   I-23  an accepted Offer cannot be superseded until rescinded — the v270/
--         v271 bar stays; rescission is the ONLY door out, and that door is
--         authority-gated (I-29), which is what gives I-23 its teeth.
--   I-27  EVIDENCE PERMANENCE — rescission is ADDITIVE. The acceptance record
--         and its selection set are never updated, deleted, or overwritten.
--         A rescinded acceptance still exists, forever; the rescission record
--         is a second immutable fact BESIDE it, not an eraser.
--   I-29  rescission is AUTHORITY-GATED, DEFAULT-DENY. An unknown class, a
--         missing evidence element, a wrong capability, an unresolved external
--         basis — every one refuses. Nothing rescinds by default.
--   I-30  LEDGER PRIMACY — the acceptance_rescinded ledger fact structurally
--         references the binding rescission record (object_ref = the record's
--         id), so ledger replay resolves the record → republish_permission →
--         the exact projection. Status is a derived projection written
--         atomically with the fact, reconstructible from the ledger, and is
--         NEVER read as authority by any gate in this slice.
--
-- THE FIVE POLICY CLASSES (Reconciliation Addendum — the closed contract):
--   self_withdrawal     the accepting principal releases their own acceptance;
--                       authority = the SAME endpoint capability that accepted
--                       (evidence.capability must equal the acceptance's
--                       capability_ref). Republish permitted, fixed.
--   mutual_release      both parties agree; evidence must carry BOTH
--                       principal_assent and operator_assent. Republish
--                       permitted, fixed.
--   operator_correction supervisory correction of an erroneous record;
--                       evidence must carry supervisory_authority. Republish
--                       permitted, fixed.
--   fraud_correction    evidence must carry fraud_determination_ref; the class
--                       alone does NOT determine the outcome — the caller must
--                       state republish_permission explicitly (true OR false).
--   compelled_reversal  an external basis (court order etc.) enters ONLY as an
--                       authorized platform actor ATTESTING the compulsion —
--                       evidence must carry instrument_ref; republish stated
--                       explicitly (true OR false). Outside parties never act
--                       directly.
--
-- THE DEFERRED SEAM, honored: the full per-class authority MODEL (which roles
-- may invoke operator_correction, who may attest an instrument, delegation…)
-- is deferred policy and is NOT resolved here. What v272 enforces is the
-- STRUCTURAL default-deny shape of I-29: the class must be one of the five,
-- its class-specific evidence element must be present (and, for
-- self_withdrawal, must PROVE the same capability that accepted), the caller
-- must resolve as an active member of the acceptance's tenant, and the
-- republish outcome must be determined (fixed by class, or explicitly stated
-- where the class alone cannot determine it). Everything else refuses.
--
-- TWO EXPLICIT RELEASE PROJECTIONS (settled in the implementation plan):
--   rescinded_republishable   the thread may carry a new Offer again
--   rescinded_terminal        no republication; the release is final
-- NOT a single ambiguous 'rescinded' — because fraud_correction and
-- compelled_reversal may permit OR bar republication, class alone doesn't
-- determine the outcome. Both are free-text status values: NO CHECK, NO enum
-- (v270 C.3 discipline — status stays a projection, never a lifecycle model).
--
-- EVERY RESCISSION ROW IS A BINDING RELEASE. There is no binding=false
-- category; commentary and refused attempts belong to audit logs, never this
-- table. Single effective rescission is therefore a plain UNIQUE(acceptance_id).
--
-- SHARED LOCK ORDER (v266, adopted v270/v271): thread (proposals) row FIRST,
-- then the version row. rescind_acceptance takes the identical order, so
-- publish / withdraw / accept / rescind serialize in one total order — no
-- deadlock is constructible among the four ceremonies.
--
-- Additive + two replace-in-place deltas (publish_offer STEP 10/11 rework).
-- Rerunnable, production-safe. Deploy after v271.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── R.1 · The rescission record (immutable, insert + select ONLY) ───────────
create table if not exists public.acceptance_rescissions (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null,
  -- the released acceptance, by FK — the record references the EVIDENCE it
  -- releases (I-27: the acceptance outlives its rescission, untouched)
  acceptance_id        uuid not null unique          -- plain UNIQUE: single effective rescission; every row is binding
                         references public.offer_acceptances(id),
  -- the closed policy contract (Addendum): five classes, no sixth
  policy_class         text not null
                         check (policy_class in ('self_withdrawal','mutual_release',
                                'operator_correction','fraud_correction','compelled_reversal')),
  -- who released, and on what satisfied authority
  acting_party         jsonb,                        -- the releasing party, by value (principal / operator context)
  actor                text not null,                -- who performed the ceremony (mirrors the ledger)
  authority_basis      text not null,                -- the satisfied authority shape (recorded from the gate)
  -- the class evidence, by value: capability | joint assent | supervisory
  -- authority | fraud determination ref | external-compulsion instrument ref
  evidence             jsonb not null,
  -- the determined outcome — the SOURCE the projection and the publish gate
  -- derive from (fixed by class, or explicitly stated for fraud/compelled)
  republish_permission boolean not null,
  reason               text not null,
  recorded_moment      timestamptz not null default now(),
  created_at           timestamptz not null default now()
);
create index if not exists ix_rescission_tenant on public.acceptance_rescissions (tenant_id);

alter table public.acceptance_rescissions enable row level security;
do $$ begin
  begin create policy rsc_select on public.acceptance_rescissions
    for select using (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy rsc_insert on public.acceptance_rescissions
    for insert with check (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  -- Deliberately NO update policy and NO delete policy: immutability is a
  -- property of the object (the v269 acceptance-evidence discipline).
end $$;

comment on table public.acceptance_rescissions is
  'v272/PL-4 Phase B: immutable binding release of an acceptance. Insert+select '
  'only. UNIQUE(acceptance_id) = single effective rescission (every row is '
  'binding; commentary/refusals go to audit logs, never here). The acceptance '
  'it references is never touched (I-27). republish_permission here is the '
  'source the projection and the publish gate derive from (I-30).';

-- ── R.2 · The ceremony: rescind_acceptance ──────────────────────────────────
create or replace function public.rescind_acceptance(
  p_acceptance uuid,             -- the acceptance to release
  p_actor      text,             -- who performs the ceremony (ledger)
  p_class      text,             -- one of the five policy classes
  p_evidence   jsonb,            -- class evidence (see the gate below)
  p_reason     text,             -- mandatory human reason
  p_acting_party jsonb default null,   -- the releasing party, by value
  p_republish  boolean default null    -- REQUIRED for fraud_correction /
                                       -- compelled_reversal; must be ABSENT or
                                       -- agree for the fixed classes
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant     uuid := public.current_tenant_id();
  v_acc        record;
  v_ver        uuid;
  v_prop       uuid;
  v_booking    uuid;
  v_status     text;
  v_republish  boolean;
  v_authority  text;
  v_rsc        uuid;
  v_projection text;
begin
  -- ── STEP 0 — mandatory reason (a release without a reason is not a release) ──
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'RESCIND_REASON_REQUIRED';
  end if;

  -- ── STEP 1 — resolve the acceptance UNDER THE CALLER'S TENANT.
  -- offer_acceptances and offer_snapshots are immutable (no lock needed);
  -- resolution walks acceptance → snapshot → version without touching the
  -- lockable rows yet. An out-of-tenant acceptance simply does not resolve:
  -- CEREMONY_NOT_FOUND, no existence leak. ──
  select a.id, a.tenant_id, a.snapshot_id, a.fingerprint, a.capability_ref,
         s.version_id
    into v_acc
    from public.offer_acceptances a
    join public.offer_snapshots s on s.id = a.snapshot_id
    where a.id = p_acceptance and a.tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  v_ver := v_acc.version_id;

  -- ── STEP 2 — THREAD-FIRST lock: proposal row, then version row (v266 order,
  -- identical to publish_offer / withdraw_offer / accept_offer) ──
  select p.id, p.booking_id into v_prop, v_booking
    from public.proposals p
    join public.bookings b on b.id = p.booking_id and b.tenant_id = v_tenant
    where p.id = (select proposal_id from public.proposal_versions where id = v_ver)
    for update of p;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;

  select v.status into v_status
    from public.proposal_versions v where v.id = v_ver for update of v;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;

  -- ── STEP 3 — LINEARIZATION POINT: single effective rescission, checked
  -- against the RELATION under the thread lock (the UNIQUE is the race
  -- backstop, never the primary gate) ──
  if exists (select 1 from public.acceptance_rescissions r
              where r.acceptance_id = v_acc.id) then
    raise exception 'RESCIND_ALREADY_RESCINDED';
  end if;

  -- ── STEP 4 — THE AUTHORITY GATE (I-29): DEFAULT-DENY, per class.
  -- The structural shape only; the richer per-class authority model is the
  -- deferred seam and is NOT resolved here. Anything not explicitly satisfied
  -- below refuses. ──
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'RESCIND_AUTHORITY_DENIED';
  end if;

  if p_class = 'self_withdrawal' then
    -- the accepting principal releases their OWN acceptance: the presented
    -- capability must PROVE the same endpoint capability that accepted.
    if p_evidence->'capability' is null
       or v_acc.capability_ref is null
       or (p_evidence->'capability') is distinct from v_acc.capability_ref then
      raise exception 'RESCIND_AUTHORITY_DENIED';
    end if;
    v_authority := 'self_capability';
    v_republish := true;                       -- fixed by class
  elsif p_class = 'mutual_release' then
    if p_evidence->'principal_assent' is null or p_evidence->'operator_assent' is null then
      raise exception 'RESCIND_AUTHORITY_DENIED';
    end if;
    v_authority := 'joint_assent';
    v_republish := true;                       -- fixed by class
  elsif p_class = 'operator_correction' then
    if p_evidence->'supervisory_authority' is null then
      raise exception 'RESCIND_AUTHORITY_DENIED';
    end if;
    v_authority := 'supervisory';
    v_republish := true;                       -- fixed by class
  elsif p_class = 'fraud_correction' then
    if p_evidence->'fraud_determination_ref' is null then
      raise exception 'RESCIND_AUTHORITY_DENIED';
    end if;
    v_authority := 'fraud_determination';
    -- class alone does NOT determine the outcome — it must be stated
    if p_republish is null then raise exception 'RESCIND_PERMISSION_REQUIRED'; end if;
    v_republish := p_republish;
  elsif p_class = 'compelled_reversal' then
    -- the external basis enters ONLY as an authorized platform actor
    -- ATTESTING the compulsion instrument — never direct outside access
    if p_evidence->'instrument_ref' is null then
      raise exception 'RESCIND_AUTHORITY_DENIED';
    end if;
    v_authority := 'attested_compulsion';
    if p_republish is null then raise exception 'RESCIND_PERMISSION_REQUIRED'; end if;
    v_republish := p_republish;
  else
    -- unknown class: the contract is closed (default-deny)
    raise exception 'RESCIND_UNKNOWN_CLASS';
  end if;

  -- a caller-stated permission that CONTRADICTS a class-fixed outcome is a
  -- request this ceremony cannot honor — refused, never silently corrected
  if p_class in ('self_withdrawal','mutual_release','operator_correction')
     and p_republish is not null and p_republish is distinct from v_republish then
    raise exception 'RESCIND_INVALID_PERMISSION';
  end if;

  v_projection := case when v_republish then 'rescinded_republishable'
                       else 'rescinded_terminal' end;

  -- ── STEP 5 — ATOMIC write: the binding record, the ledger fact that
  -- STRUCTURALLY REFERENCES it, and the derived projection (I-30). Either all
  -- three commit or none does. ──
  insert into public.acceptance_rescissions (
      tenant_id, acceptance_id, policy_class, acting_party, actor,
      authority_basis, evidence, republish_permission, reason, recorded_moment)
    values (
      v_tenant, v_acc.id, p_class, p_acting_party, p_actor,
      v_authority, p_evidence, v_republish, btrim(p_reason), now())
    returning id into v_rsc;

  -- the fact references the RECORD (object_ref = rescission id), so ledger
  -- replay resolves the record → republish_permission → this exact projection.
  -- snapshot_ref/fingerprint_ref identify the released accepted object.
  insert into public.engagement_ledger
      (tenant_id, booking_id, ceremony, actor, moment,
       object_ref, snapshot_ref, fingerprint_ref, from_state, to_state, reason)
    values (v_tenant, v_booking, 'acceptance_rescinded', p_actor, now(),
       v_rsc, v_acc.snapshot_id, v_acc.fingerprint, v_status, v_projection,
       p_class || ' · ' || btrim(p_reason));

  -- the derived projection — written atomically with the fact, from the same
  -- v_republish the record carries; never itself consulted as authority
  update public.proposal_versions set status = v_projection where id = v_ver;

  return jsonb_build_object(
    'outcome', 'rescinded',
    'rescission_id', v_rsc,
    'acceptance_id', v_acc.id,
    'projection', v_projection,
    'republish_permission', v_republish);
end $$;

comment on function public.rescind_acceptance is
  'v272/PL-4 Phase B: the authority-gated (I-29, default-deny) release of an '
  'acceptance. Thread-first lock (v266 order). Writes the binding rescission '
  'record + the acceptance_rescinded ledger fact referencing it (object_ref) + '
  'the derived projection, atomically (I-30). Never touches the acceptance (I-27).';

-- ── R.3 · publish_offer STEP 10/11 rework — the post-rescission gate ────────
-- The v270/v271 accepted-bar refused whenever an acceptance existed for the
-- prior current Offer. After v272 the acceptance STILL EXISTS post-rescission
-- (I-27 — evidence is permanent), so the bar as deployed would freeze the
-- thread forever. The rework derives the gate from the acceptance relation
-- JOINED to the rescission record (never status text):
--   · acceptance, NO rescission            → PUBLISH_BLOCKED_BY_ACCEPTANCE (I-23, unchanged)
--   · rescission, republish_permission=false → PUBLISH_BLOCKED_TERMINAL_RESCISSION
--   · rescission, republish_permission=true  → the release opened the thread:
--     the prior is supersedable again; STEP 11 supersedes it from its actual
--     prior state (the ledger fact records the true from_state).
-- STEP 10 discovery widens to the full current-Offer vocabulary
-- ('sent','accepted','rescinded_republishable','rescinded_terminal') so every
-- prior current Offer is FOUND and the structural gate — not discovery
-- accidents — decides. (This is exactly the projection/bar interaction that
-- bit v271; here it is reworked deliberately and proven.)
-- Exactly the STEP 10/11 block differs from the v271 body; the v270 bar
-- semantics for un-rescinded acceptances and the v267b digest qualification
-- are preserved. No signature change.
do $mig$
declare v_schema text; v_body text;
begin
  select n.nspname into v_schema from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.proname='digest' and p.pronargs=2
      and p.proargtypes[0]='bytea'::regtype and p.proargtypes[1]='text'::regtype
    order by (n.nspname='public') desc limit 1;
  if v_schema is null then raise exception 'v272: pgcrypto digest not found'; end if;
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
  v_prior_status text;
  v_rsc      record;
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

  -- STEP 10 — prior current offer, FULL current-Offer vocabulary (v272).
  -- 'sent' (live), 'accepted' (committed), and both release projections must
  -- all be DISCOVERED so the structural gate below decides — never a
  -- discovery accident (the v271 lesson, applied deliberately).
  select v.id, v.status into v_prior, v_prior_status from public.proposal_versions v
    where v.proposal_id = v_prop and v.id <> p_version
      and v.sealed_at is not null
      and v.status in ('sent','accepted','rescinded_republishable','rescinded_terminal')
    order by v.sealed_at desc limit 1;

  -- v272 GATE — derived from the acceptance relation JOINED to the binding
  -- rescission record (never status text):
  --   acceptance + no rescission        → blocked by acceptance (I-23, v270 law)
  --   rescission, republish barred      → blocked, terminal release
  --   rescission, republish permitted   → the thread is open again; fall through
  if v_prior is not null then
    select r.* into v_rsc
      from public.offer_acceptances a
      join public.offer_snapshots s on s.id = a.snapshot_id
      left join public.acceptance_rescissions r on r.acceptance_id = a.id
     where s.version_id = v_prior;
    if found then
      if v_rsc.id is null then
        raise exception 'PUBLISH_BLOCKED_BY_ACCEPTANCE';
      elsif v_rsc.republish_permission is not true then
        raise exception 'PUBLISH_BLOCKED_TERMINAL_RESCISSION';
      end if;
      -- republishable release: proceed to supersede the prior
    end if;
  end if;

  -- STEP 11 — supersede the prior current Offer from its ACTUAL state. Only
  -- 'sent' and 'rescinded_republishable' can reach here ('accepted' and
  -- 'rescinded_terminal' were refused above); the status guard on the UPDATE
  -- pins that set, so nothing else is ever superseded and the ledger fact
  -- records the true from_state.
  if v_prior is not null then
    update public.proposal_versions set status = 'superseded'
      where id = v_prior and status in ('sent','rescinded_republishable');
    get diagnostics v_superseded_count = row_count;
    if v_superseded_count = 1 then
      insert into public.engagement_ledger
          (tenant_id, booking_id, ceremony, actor, from_state, to_state, object_ref)
        select v_tenant, p.booking_id, 'offer_superseded', p_actor, v_prior_status, 'superseded', v_prior
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
  raise notice 'v272: publish_offer STEP 10/11 reworked (post-rescission gate); digest qualified to %.digest', v_schema;
end $mig$;

-- ── R.4 · withdraw_offer — NO delta needed, on purpose ──────────────────────
-- A rescinded Offer is not withdrawable, and the deployed v270 guard already
-- enforces this STRUCTURALLY: the acceptance record survives rescission (I-27),
-- so the acceptance-relation check refuses WITHDRAW_BLOCKED_BY_ACCEPTANCE.
-- Releasing a commitment is rescission's job and it has already happened; the
-- refusal is the correct outcome with zero amendment. Proven in the v272 proof.

-- ── R.5 · accept_offer — NO delta needed, on purpose ────────────────────────
-- A rescinded Offer's snapshot can never be re-accepted: the acceptance record
-- survives (I-27), so accept_offer's relation precheck refuses
-- ACCEPT_ALREADY_ACCEPTED and UNIQUE(snapshot_id) is the structural backstop.
-- A new commitment requires a NEW Offer — which rescinded_republishable now
-- permits via publish_offer, and rescinded_terminal forever bars. Proven.
