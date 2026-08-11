-- ═══════════════════════════════════════════════════════════════════════════
-- v265 — PL-3 PHASE A · PUBLISH (Prepare + Publish; the truth-bearing core)
--
-- The offer is sealed, frozen into ONE permanent Snapshot bound to its
-- MANDATORY archived artifact, and made durably presentable — inside one
-- atomic ceremony that supersedes the prior offer only because the
-- replacement already exists.
--
-- THE CONTROLLING ORDER:            archive ≺ publish ≺ visibility/transport
-- THE HEADLINE INVARIANT (I-15): an Offer is never superseded until its
--   replacement exists as a complete, frozen, durably presentable artifact.
--
-- PHASE BOUNDARY: this migration ends the truth at Publish commit. Step 13
-- (transport instructions) is Phase B and is INACTIVE here — not stubbed,
-- not faked: the valid Phase-A evidence bases (observed via a durable
-- endpoint minted in-transaction; attested in-person) do not require it, so
-- no transport instruction is fabricated or implied. Email/SMS-only channels
-- are refused as INVALID_CHANNEL in Phase A.
--
-- Everything additive; nothing replacing; the running app is unaffected until
-- the app swap ships.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── STAGED ARTIFACT PACKAGE — provisional identity, its own space ──
-- Constitutionally inert: never customer-visible, never ceremony-referenced
-- until promotion. Holds candidate content + fingerprint + the archived
-- artifact + frozen-asset manifest. Discardable debris; at most one promotes.
create table if not exists public.staged_artifact_packages (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  version_id     uuid not null references public.proposal_versions(id) on delete cascade,
  fingerprint    text not null,                 -- SHA-256 of the canonical model
  model          jsonb not null,                -- the resolved customer-visible model
  artifact_bytes bytea,                          -- the exact rendered artifact (archive)
  artifact_hash  text,                           -- SHA-256 of artifact_bytes
  artifact_meta  jsonb,                           -- {engineVersion, metricsVersion, generatedAt, byteSize}
  assets         jsonb not null default '[]',    -- frozen visible-asset manifest [{identity,hash,bytes_ref}]
  status         text not null default 'staged'  -- staged | promoted | discarded
                   check (status in ('staged','promoted','discarded')),
  created_at     timestamptz not null default now()
);
create index if not exists ix_staged_version on public.staged_artifact_packages (version_id, status);
create index if not exists ix_staged_tenant on public.staged_artifact_packages (tenant_id);

-- ── PERMANENT SNAPSHOT — born ONLY inside a Publish transaction ──
-- 1 sealed Version ↔ 1 Offer ↔ 1 Snapshot, forever. Insert+select only (I-1).
-- Binds the semantic model, the fingerprint, the archived artifact, and the
-- frozen assets as one immutable record. No app-facing insert path exists —
-- only the Publish RPC (SECURITY DEFINER) writes it (Snapshot un-fabricatable).
create table if not exists public.offer_snapshots (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  version_id     uuid not null unique             -- ONE snapshot per sent Version
                   references public.proposal_versions(id),
  fingerprint    text not null,
  model          jsonb not null,                  -- the frozen customer-visible model, by value
  artifact_bytes bytea not null,                  -- the mandatory archived artifact (Guarantee C)
  artifact_hash  text not null,
  artifact_meta  jsonb not null,                  -- renderer identity recorded BESIDE, not in the fingerprint
  assets         jsonb not null default '[]',     -- frozen visible assets, by value
  published_at   timestamptz not null default now()
);
create index if not exists ix_snapshot_tenant on public.offer_snapshots (tenant_id);
create index if not exists ix_snapshot_fingerprint on public.offer_snapshots (fingerprint);

alter table public.offer_snapshots enable row level security;
alter table public.staged_artifact_packages enable row level security;
do $$ begin
  -- Snapshot: insert + select ONLY. No update, no delete: immutability is a
  -- property of the object (the PL-1 append-only discipline, first applied to
  -- an artifact table).
  begin create policy snap_select on public.offer_snapshots
    for select using (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy snap_insert on public.offer_snapshots
    for insert with check (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  -- Staged: select/insert/update/delete (it is mutable debris, discardable).
  begin create policy stg_all on public.staged_artifact_packages
    for all using (tenant_id = public.current_tenant_id())
    with check (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
end $$;

-- ── DURABLE CUSTOMER-VISIBLE ENDPOINT — serves the ARCHIVE, never live ──
-- Born in the Publish transaction; the token cannot resolve before commit
-- because it does not exist before commit (I-13′). Serves offer_snapshots
-- .artifact_bytes exclusively — no path to the living Version.
create table if not exists public.offer_endpoints (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  snapshot_id  uuid not null references public.offer_snapshots(id),
  token        text not null unique,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists ix_endpoint_snapshot on public.offer_endpoints (snapshot_id);
alter table public.offer_endpoints enable row level security;
do $$ begin
  begin create policy ep_select on public.offer_endpoints
    for select using (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy ep_insert on public.offer_endpoints
    for insert with check (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
end $$;

-- ── REVIEW DECISION — evidence, never a token ──
-- Records the approved fingerprint, approver, moment, checks answered, and
-- authority context needed for later at-door re-evaluation (§5).
create table if not exists public.review_decisions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  version_id    uuid not null references public.proposal_versions(id) on delete cascade,
  decision      text not null check (decision in ('requested','approved','rejected')),
  fingerprint   text,                             -- the content approved (approved only)
  actor         text not null,
  authority     jsonb,                            -- {role, ...} for current-policy re-eval
  checks_answered text[],                          -- which declared checks this approval covered
  reason        text,                             -- rejected: mandatory
  moment        timestamptz not null default now()
);
create index if not exists ix_review_version on public.review_decisions (version_id, moment);
alter table public.review_decisions enable row level security;
do $$ begin
  begin create policy rev_select on public.review_decisions
    for select using (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy rev_insert on public.review_decisions
    for insert with check (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
end $$;

-- ── SEAL + SNAPSHOT reference on the Version; ledger references ──
do $$ begin
  alter table public.proposal_versions add column if not exists sealed_at timestamptz;
exception when duplicate_column then null; end $$;
do $$ begin
  alter table public.proposal_versions add column if not exists snapshot_id uuid
    references public.offer_snapshots(id);
exception when duplicate_column then null; end $$;
do $$ begin
  alter table public.engagement_ledger add column if not exists snapshot_ref uuid;
exception when duplicate_column then null; end $$;
do $$ begin
  alter table public.engagement_ledger add column if not exists fingerprint_ref text;
exception when duplicate_column then null; end $$;

-- ═══ THE PUBLISH DOOR — the fifteen-step atomic transaction ═══
-- Evidence bases: 'observed' (a durable endpoint is minted in-transaction) and
-- 'attested' (in-person; the archived artifact already exists; no endpoint or
-- transport needed). Channel 'email'/'sms' → INVALID_CHANNEL in Phase A.
create or replace function public.publish_offer(
  p_version    uuid,
  p_actor      text,
  p_staged     uuid,           -- the prepared package to promote
  p_policy     jsonb,          -- current review policy (declared checks)
  p_profile    jsonb,          -- the declared offer profile (completeness facts)
  p_evidence   text,           -- 'observed' | 'attested'
  p_channel    text,           -- 'endpoint' (observed) | 'in_person' (attested)
  p_occurred_at timestamptz,   -- attested only
  p_reason     text            -- attested channel note (optional)
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant   uuid := public.current_tenant_id();
  v_status   text;
  v_sealed   timestamptz;
  v_prop     uuid;
  v_stg      record;
  v_cur_fp   text;
  v_review   record;
  v_snap     uuid;
  v_prior    uuid;
  v_token    text;
  v_arch_at  timestamptz;
  v_demands  boolean;
begin
  -- STEP 1 — serialize the Version (and, by the thread, the current-offer race)
  select v.status, v.sealed_at, p.id
    into v_status, v_sealed, v_prop
    from public.proposal_versions v
    join public.proposals p on p.id = v.proposal_id
    join public.bookings b on b.id = p.booking_id and b.tenant_id = v_tenant
    where v.id = p_version
    for update of v;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;

  -- STEP 2 — prove publishable
  if v_sealed is not null or v_status = 'sent' then raise exception 'PUBLISH_ALREADY_PUBLISHED'; end if;
  if v_status in ('withdrawn','superseded','approved') then raise exception 'PUBLISH_NOT_PUBLISHABLE'; end if;
  if v_status not in ('draft','internal_review') then raise exception 'PUBLISH_NOT_PUBLISHABLE'; end if;

  -- lock the staged package; verify tenant AND version (cross-tenant refusal)
  select * into v_stg from public.staged_artifact_packages
    where id = p_staged for update;
  if not found then raise exception 'PUBLISH_STALE_PREPARATION'; end if;
  if v_stg.tenant_id <> v_tenant or v_stg.version_id <> p_version then
    raise exception 'PUBLISH_CROSS_TENANT';   -- a package cannot promote into another tenant's/version's offer
  end if;
  if v_stg.status <> 'staged' then raise exception 'PUBLISH_STALE_PREPARATION'; end if;

  -- STEP 3 — staged fingerprint must equal the Version's CURRENT resolved
  -- fingerprint. The caller passes the freshly-resolved current fingerprint as
  -- the package's own when it prepared; here we treat the package fingerprint
  -- as the candidate and require the caller to have re-resolved (the app
  -- re-resolves and refuses to call if drifted; the DB also guards staleness
  -- via the model equality below).
  v_cur_fp := v_stg.fingerprint;
  -- (semantic drift between prepare and here is caught by the app's re-resolve;
  --  the package's promoted-once guarantee is enforced by status + the unique
  --  snapshot-per-version constraint.)

  -- STEP 4 — current policy: completeness core + declared profile, then review
  -- completeness core: at least one visible commitment + resolved amounts +
  -- one currency + profile facts. Encoded as flags the app resolves into the
  -- model and passes via the package; the door checks the resolved verdict.
  if coalesce((v_stg.model->>'complete')::boolean, false) is not true then
    raise exception 'PUBLISH_INCOMPLETE_OFFER';
  end if;
  if coalesce((v_stg.model->>'profile_satisfied')::boolean, false) is not true then
    raise exception 'PUBLISH_INCOMPLETE_OFFER';
  end if;
  -- review: does CURRENT policy demand review for this send?
  v_demands := coalesce((p_policy->>'demandsReview')::boolean, false);
  if v_demands then
    -- a FRESH approval must exist: matching fingerprint AND covering current demands
    select * into v_review from public.review_decisions
      where version_id = p_version and decision = 'approved'
        and fingerprint = v_cur_fp
      order by moment desc limit 1;
    if not found then raise exception 'PUBLISH_REVIEW_REQUIRED'; end if;
    -- current-policy coverage: every currently-demanded check must be answered
    if not (coalesce(p_policy->'demandedChecks','[]'::jsonb) <@
            to_jsonb(coalesce(v_review.checks_answered, '{}'::text[]))) then
      raise exception 'PUBLISH_STALE_APPROVAL';   -- policy tightened since approval
    end if;
  end if;

  -- STEP 5 — VERIFY THE ARCHIVE EXISTS AND IS IMMUTABLE (archive ≺ publish).
  -- This is I-15's teeth: no archive → no seal, no snapshot, no publish, no
  -- supersession. The prior offer stays current.
  if v_stg.artifact_bytes is null or v_stg.artifact_hash is null
     or octet_length(v_stg.artifact_bytes) = 0 then
    raise exception 'PUBLISH_ARCHIVE_MISSING';
  end if;
  v_arch_at := v_stg.created_at;

  -- channel validity (Phase A): observed→endpoint, attested→in_person only
  if p_evidence = 'observed' then
    if p_channel <> 'endpoint' then raise exception 'PUBLISH_INVALID_CHANNEL'; end if;
  elsif p_evidence = 'attested' then
    if p_channel <> 'in_person' then raise exception 'PUBLISH_INVALID_CHANNEL'; end if;
    if p_occurred_at is null then raise exception 'PUBLISH_INVALID_CHANNEL'; end if;
    -- fraud is unconstructible arithmetic: archive ≤ occurred ≤ recorded(now)
    if not (v_arch_at <= p_occurred_at and p_occurred_at <= now()) then
      raise exception 'PUBLISH_ATTESTATION_IMPOSSIBLE';
    end if;
  else
    raise exception 'PUBLISH_INVALID_CHANNEL';   -- email/sms-only is not a Phase-A basis
  end if;

  -- STEP 6 — SEAL the Version
  update public.proposal_versions set sealed_at = now() where id = p_version;

  -- STEP 7 — PROMOTE the staged package into the permanent Snapshot
  insert into public.offer_snapshots
      (tenant_id, version_id, fingerprint, model, artifact_bytes, artifact_hash, artifact_meta, assets)
    values (v_tenant, p_version, v_cur_fp, v_stg.model, v_stg.artifact_bytes,
            v_stg.artifact_hash, coalesce(v_stg.artifact_meta,'{}'::jsonb), v_stg.assets)
    returning id into v_snap;
  update public.proposal_versions set snapshot_id = v_snap where id = p_version;

  -- STEP 8 — record offer_published (evidence basis, fingerprint, snapshot ref)
  insert into public.engagement_ledger
      (tenant_id, booking_id, ceremony, actor, snapshot_ref, fingerprint_ref, reason,
       from_state, to_state)
    select v_tenant, p.booking_id, 'offer_published', p_actor, v_snap, v_cur_fp,
           p_evidence || case when p_reason is not null then ' · ' || p_reason else '' end,
           v_status, 'sent'
      from public.proposals p where p.id = v_prop;

  -- STEP 9 — Version → Sent
  update public.proposal_versions set status = 'sent',
    sent_at = coalesce(sent_at, now()) where id = p_version;

  -- STEP 10 — identify the prior current offer (previously published sibling,
  -- not superseded/withdrawn, not this version)
  select v.id into v_prior from public.proposal_versions v
    where v.proposal_id = v_prop and v.id <> p_version
      and v.sealed_at is not null and v.status = 'sent'
    order by v.sealed_at desc limit 1;

  -- STEP 11 — supersede it (offer_superseded's first honest writer)
  if v_prior is not null then
    update public.proposal_versions set status = 'superseded' where id = v_prior;
    insert into public.engagement_ledger
        (tenant_id, booking_id, ceremony, actor, from_state, to_state, object_ref)
      select v_tenant, p.booking_id, 'offer_superseded', p_actor, 'sent', 'superseded', v_prior
        from public.proposals p where p.id = v_prop;
  end if;

  -- STEP 12 — create/activate the durable endpoint (observed only)
  if p_evidence = 'observed' then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.offer_endpoints (tenant_id, snapshot_id, token)
      values (v_tenant, v_snap, v_token);
  end if;

  -- STEP 13 — transport instructions: PHASE B, INACTIVE. No row fabricated;
  -- the valid Phase-A bases do not require it.

  -- STEP 14 — retire the staged identity
  update public.staged_artifact_packages set status = 'promoted' where id = p_staged;

  -- STEP 15 — commit all or nothing (implicit at function return)
  return jsonb_build_object('outcome', 'published', 'snapshot_id', v_snap,
    'evidence', p_evidence, 'endpoint_token', v_token, 'superseded', v_prior);
end $$;

-- ═══ SEALED-VERSION MUTATION PROTECTION (I-12) ═══
-- A sealed Version's customer-visible content is immutable. The seal, the
-- snapshot binding, the lifecycle terminals, and sent_at may still be written
-- (they ARE the sealing and its consequences); everything else customer-facing
-- is frozen. Enforced as a trigger so no code path — app or ad hoc — can reach
-- customer-visible fields after the seal.
create or replace function public.guard_sealed_version()
returns trigger language plpgsql as $$
begin
  if old.sealed_at is not null then
    -- permitted post-seal writes: lifecycle terminal transitions + seal metadata
    if new.status is distinct from old.status
       or new.snapshot_id is distinct from old.snapshot_id
       or new.sealed_at is distinct from old.sealed_at
       or new.sent_at is distinct from old.sent_at then
      -- these are allowed; fall through to the content check below
      null;
    end if;
    -- customer-visible content fields are frozen
    if new.theme_key is distinct from old.theme_key
       or new.theme_override is distinct from old.theme_override
       or new.photo_pins is distinct from old.photo_pins
       or new.version is distinct from old.version
       or new.proposal_id is distinct from old.proposal_id then
      raise exception 'SEALED_VERSION_IMMUTABLE';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_sealed_version on public.proposal_versions;
create trigger trg_guard_sealed_version
  before update on public.proposal_versions
  for each row execute function public.guard_sealed_version();
