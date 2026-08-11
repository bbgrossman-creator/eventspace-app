-- ═══════════════════════════════════════════════════════════════════════════
-- v266 — PL-3 PHASE A HARDENING. Corrects the six findings of the adversarial
-- v265 acceptance audit. NOT a change to constitutional law — an
-- implementation catching up to the law it under-delivered. Six corrections:
--
--   B1 · SERIALIZE THE THREAD — the door locks the owning proposal row before
--        determining/superseding the prior current offer, so two siblings can
--        never both commit as current offers (I-16).
--   B2 · THE SEAL SPANS THE CONTENT — a sealed Version's version-scoped content
--        rows (event_components, component_items, component_requirements) are
--        structurally frozen by trigger, resolving ownership through the FK
--        path to the owning Version's sealed_at (I-18).
--   B3 · DB-CHECKABLE FRESHNESS — a monotonic content_revision on the Version,
--        bumped by trigger on every customer-visible content write; Prepare
--        captures it, the door compares it under lock (STALE_PREPARATION as a
--        database fact, not an app courtesy).
--   R2 · ARCHIVE INTEGRITY — the door verifies sha256(artifact_bytes) =
--        artifact_hash before seal/promotion/publish/supersession
--        (ARCHIVE_CORRUPT, I-17).
--   R3 · APPROVER AUTHORITY — when policy declares approver constraints, the
--        door evaluates the recorded approval authority against them
--        (INVALID_APPROVER_AUTHORITY); empty-is-information preserved.
--   R1 (the endpoint route) is application-layer — shipped in src/, proven by
--        route + Chromium tests; no DB change beyond what v265 already minted.
--
-- Additive; nothing replacing except the publish_offer body (same signature).
-- Requires v263 + v265.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── B3 · the content revision witness ──
do $$ begin
  alter table public.proposal_versions add column if not exists content_revision bigint not null default 0;
exception when duplicate_column then null; end $$;

-- bump the owning Version's revision on any customer-visible content write.
-- event_components carries proposal_version_id directly; items/requirements
-- resolve through component_id → event_components.proposal_version_id.
create or replace function public.bump_version_revision()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ver uuid;
begin
  if tg_table_name = 'event_components' then
    v_ver := coalesce(new.proposal_version_id, old.proposal_version_id);
  else
    select ec.proposal_version_id into v_ver from public.event_components ec
      where ec.id = coalesce(new.component_id, old.component_id);
  end if;
  if v_ver is not null then
    update public.proposal_versions set content_revision = content_revision + 1 where id = v_ver;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_rev_components on public.event_components;
create trigger trg_rev_components after insert or update or delete
  on public.event_components for each row execute function public.bump_version_revision();
drop trigger if exists trg_rev_items on public.component_items;
create trigger trg_rev_items after insert or update or delete
  on public.component_items for each row execute function public.bump_version_revision();
drop trigger if exists trg_rev_reqs on public.component_requirements;
create trigger trg_rev_reqs after insert or update or delete
  on public.component_requirements for each row execute function public.bump_version_revision();

-- version-level customer-visible field writes also bump (theme/pins), via the
-- existing update path; done in the seal guard's sibling trigger below.
create or replace function public.bump_on_version_content()
returns trigger language plpgsql as $$
begin
  if new.theme_key is distinct from old.theme_key
     or new.theme_override is distinct from old.theme_override
     or new.photo_pins is distinct from old.photo_pins then
    -- only bump when the content actually changed, and not when WE are bumping
    if new.content_revision = old.content_revision then
      new.content_revision := old.content_revision + 1;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_bump_version_content on public.proposal_versions;
create trigger trg_bump_version_content before update on public.proposal_versions
  for each row execute function public.bump_on_version_content();

-- ── B2 · the seal spans the content ──
-- A write to a version-scoped content row is refused when the owning Version
-- is sealed. The bump trigger runs AFTER; this guard runs BEFORE and aborts.
create or replace function public.guard_sealed_content()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ver uuid; v_sealed timestamptz;
begin
  if tg_table_name = 'event_components' then
    v_ver := coalesce(new.proposal_version_id, old.proposal_version_id);
  else
    select ec.proposal_version_id into v_ver from public.event_components ec
      where ec.id = coalesce(new.component_id, old.component_id);
  end if;
  if v_ver is not null then
    select sealed_at into v_sealed from public.proposal_versions where id = v_ver;
    if v_sealed is not null then
      raise exception 'SEALED_VERSION_IMMUTABLE';   -- the seal spans the content (I-18)
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_guard_content_components on public.event_components;
create trigger trg_guard_content_components before insert or update or delete
  on public.event_components for each row execute function public.guard_sealed_content();
drop trigger if exists trg_guard_content_items on public.component_items;
create trigger trg_guard_content_items before insert or update or delete
  on public.component_items for each row execute function public.guard_sealed_content();
drop trigger if exists trg_guard_content_reqs on public.component_requirements;
create trigger trg_guard_content_reqs before insert or update or delete
  on public.component_requirements for each row execute function public.guard_sealed_content();

-- ── B3 · Prepare captures the revision into the staged package ──
do $$ begin
  alter table public.staged_artifact_packages add column if not exists content_revision bigint;
exception when duplicate_column then null; end $$;

-- ═══ THE HARDENED PUBLISH DOOR ═══
create or replace function public.publish_offer(
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
begin
  -- STEP 1 — serialize the Version AND THE THREAD (B1). The proposal row lock
  -- is the serialization point: concurrent sibling publishes queue here, so
  -- step 10's prior-offer determination and step 11's supersession see a
  -- consistent world. Two siblings can never both commit as current (I-16).
  -- lock the THREAD first (proposal row), then the version — a consistent lock
  -- order across concurrent sibling publishes, so they serialize cleanly on the
  -- thread instead of deadlocking (B1/I-16).
  select p.id into v_prop
    from public.proposals p
    join public.bookings b on b.id = p.booking_id and b.tenant_id = v_tenant
    where p.id = (select proposal_id from public.proposal_versions where id = p_version)
    for update of p;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  select v.status, v.sealed_at, v.content_revision
    into v_status, v_sealed, v_cur_rev
    from public.proposal_versions v
    where v.id = p_version
    for update of v;

  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;

  -- STEP 2 — prove publishable
  if v_sealed is not null or v_status = 'sent' then raise exception 'PUBLISH_ALREADY_PUBLISHED'; end if;
  if v_status in ('withdrawn','superseded','approved') then raise exception 'PUBLISH_NOT_PUBLISHABLE'; end if;
  if v_status not in ('draft','internal_review') then raise exception 'PUBLISH_NOT_PUBLISHABLE'; end if;

  select * into v_stg from public.staged_artifact_packages where id = p_staged for update;
  if not found then raise exception 'PUBLISH_STALE_PREPARATION'; end if;
  if v_stg.tenant_id <> v_tenant or v_stg.version_id <> p_version then
    raise exception 'PUBLISH_CROSS_TENANT';
  end if;
  if v_stg.status <> 'staged' then raise exception 'PUBLISH_STALE_PREPARATION'; end if;

  -- STEP 3 — DB-CHECKABLE FRESHNESS (B3): the staged revision must equal the
  -- Version's CURRENT revision (captured under the lock above). An edit between
  -- Prepare and Publish bumped the revision → the package is stale.
  if v_stg.content_revision is distinct from v_cur_rev then
    raise exception 'PUBLISH_STALE_PREPARATION';
  end if;
  v_cur_fp := v_stg.fingerprint;

  -- STEP 4 — current policy: completeness core + profile, then review
  if coalesce((v_stg.model->>'complete')::boolean, false) is not true then
    raise exception 'PUBLISH_INCOMPLETE_OFFER';
  end if;
  if coalesce((v_stg.model->>'profile_satisfied')::boolean, false) is not true then
    raise exception 'PUBLISH_INCOMPLETE_OFFER';
  end if;
  v_demands := coalesce((p_policy->>'demandsReview')::boolean, false);
  if v_demands then
    select * into v_review from public.review_decisions
      where version_id = p_version and decision = 'approved' and fingerprint = v_cur_fp
      order by moment desc limit 1;
    if not found then raise exception 'PUBLISH_REVIEW_REQUIRED'; end if;
    -- check coverage
    if not (coalesce(p_policy->'demandedChecks','[]'::jsonb) <@
            to_jsonb(coalesce(v_review.checks_answered, '{}'::text[]))) then
      raise exception 'PUBLISH_STALE_APPROVAL';
    end if;
    -- R3 · APPROVER AUTHORITY: when policy declares a required approver role
    -- set, the recorded approval authority must be within it. Empty-is-
    -- information: no declared constraint → no authority gate.
    if p_policy ? 'requiredApproverRoles' then
      v_authority_ok := (v_review.authority ? 'role')
        and (p_policy->'requiredApproverRoles') @> to_jsonb(array[v_review.authority->>'role']);
      if not v_authority_ok then raise exception 'PUBLISH_INVALID_APPROVER_AUTHORITY'; end if;
    end if;
  end if;

  -- STEP 5 — ARCHIVE EXISTS + INTEGRITY (R2/I-17). Non-empty AND the bytes
  -- hash to the recorded hash. Precedes seal/promotion/publish/supersession.
  if v_stg.artifact_bytes is null or v_stg.artifact_hash is null
     or octet_length(v_stg.artifact_bytes) = 0 then
    raise exception 'PUBLISH_ARCHIVE_MISSING';
  end if;
  if encode(extensions.digest(v_stg.artifact_bytes, 'sha256'), 'hex') is distinct from v_stg.artifact_hash then
    raise exception 'PUBLISH_ARCHIVE_CORRUPT';
  end if;
  v_arch_at := v_stg.created_at;

  -- channel validity (Phase A)
  if p_evidence = 'observed' then
    if p_channel <> 'endpoint' then raise exception 'PUBLISH_INVALID_CHANNEL'; end if;
  elsif p_evidence = 'attested' then
    if p_channel <> 'in_person' then raise exception 'PUBLISH_INVALID_CHANNEL'; end if;
    if p_occurred_at is null then raise exception 'PUBLISH_INVALID_CHANNEL'; end if;
    if not (v_arch_at <= p_occurred_at and p_occurred_at <= now()) then
      raise exception 'PUBLISH_ATTESTATION_IMPOSSIBLE';
    end if;
  else
    raise exception 'PUBLISH_INVALID_CHANNEL';
  end if;

  -- STEP 6 — SEAL
  update public.proposal_versions set sealed_at = now() where id = p_version;

  -- STEP 7 — PROMOTE into the permanent Snapshot
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
           p_evidence || case when p_reason is not null then ' · ' || p_reason else '' end,
           v_status, 'sent'
      from public.proposals p where p.id = v_prop;

  -- STEP 9 — Version → Sent
  update public.proposal_versions set status = 'sent', sent_at = coalesce(sent_at, now()) where id = p_version;

  -- STEP 10 — prior current offer (under the thread lock, so this is stable)
  select v.id into v_prior from public.proposal_versions v
    where v.proposal_id = v_prop and v.id <> p_version
      and v.sealed_at is not null and v.status = 'sent'
    order by v.sealed_at desc limit 1;

  -- STEP 11 — supersede it
  if v_prior is not null then
    update public.proposal_versions set status = 'superseded' where id = v_prior;
    insert into public.engagement_ledger
        (tenant_id, booking_id, ceremony, actor, from_state, to_state, object_ref)
      select v_tenant, p.booking_id, 'offer_superseded', p_actor, 'sent', 'superseded', v_prior
        from public.proposals p where p.id = v_prop;
  end if;

  -- STEP 12 — durable endpoint (observed)
  if p_evidence = 'observed' then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.offer_endpoints (tenant_id, snapshot_id, token) values (v_tenant, v_snap, v_token);
  end if;

  -- STEP 13 — transport instructions: PHASE B, INACTIVE. No row fabricated.

  -- STEP 14 — retire the staged identity
  update public.staged_artifact_packages set status = 'promoted' where id = p_staged;

  -- STEP 15 — commit all or nothing
  return jsonb_build_object('outcome', 'published', 'snapshot_id', v_snap,
    'evidence', p_evidence, 'endpoint_token', v_token, 'superseded', v_prior);
end $$;
