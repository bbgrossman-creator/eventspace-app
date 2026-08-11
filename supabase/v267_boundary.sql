-- ═══════════════════════════════════════════════════════════════════════════
-- v267 — PL-3 PHASE A · BOUNDARY COMPLETION. Closes the enumeration gap the
-- v266 verification audit found and the v267 reconnaissance proved complete:
-- FOUR more version-scoped customer-visible tables and THREE more version-row
-- customer-visible fields lay outside the seal and the revision witness. This
-- release brings the ENTIRE resolver read-set — every version-scoped,
-- customer-visible source that contributes to the published model — inside
-- both mechanisms. Plus the step-11 supersession status guard.
--
-- NOT new law: I-18 (the seal spans the content) and B3 (freshness is a
-- database fact) are unchanged. v266 enforced them over three tables; v267
-- enforces them over the complete set. The enumeration is now closed (see the
-- v267 reconnaissance): the resolver buildPresentationModel reads exactly ten
-- tables; of those, the version-scoped customer-visible ones are the seven
-- below (three already guarded in v266, four here) plus the version row's
-- customer fields. bookings/proposals/section_types/guest_categories are
-- booking-, thread-, or config-scoped — frozen BY VALUE in the Snapshot, never
-- sealed at their operational source. blueprints is not in the model.
--
-- Requires v263 + v265 + v266.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── B2 completion · extend the content seal to the four remaining tables ──
-- version_adjustments, version_guests, version_sections, choice_groups all
-- carry version_id DIRECTLY, so ownership resolution is a single column read —
-- simpler than the component_items→event_components path v266 used.
create or replace function public.guard_sealed_version_scoped()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ver uuid; v_sealed timestamptz;
begin
  v_ver := coalesce(new.version_id, old.version_id);
  if v_ver is not null then
    select sealed_at into v_sealed from public.proposal_versions where id = v_ver;
    if v_sealed is not null then
      raise exception 'SEALED_VERSION_IMMUTABLE';   -- the seal spans ALL version-scoped content (I-18)
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_guard_content_adjustments on public.version_adjustments;
create trigger trg_guard_content_adjustments before insert or update or delete
  on public.version_adjustments for each row execute function public.guard_sealed_version_scoped();
drop trigger if exists trg_guard_content_guests on public.version_guests;
create trigger trg_guard_content_guests before insert or update or delete
  on public.version_guests for each row execute function public.guard_sealed_version_scoped();
drop trigger if exists trg_guard_content_sections on public.version_sections;
create trigger trg_guard_content_sections before insert or update or delete
  on public.version_sections for each row execute function public.guard_sealed_version_scoped();
drop trigger if exists trg_guard_content_choices on public.choice_groups;
create trigger trg_guard_content_choices before insert or update or delete
  on public.choice_groups for each row execute function public.guard_sealed_version_scoped();

-- ── B3 completion · extend the revision witness to the same four tables ──
create or replace function public.bump_version_revision_scoped()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ver uuid;
begin
  v_ver := coalesce(new.version_id, old.version_id);
  if v_ver is not null then
    update public.proposal_versions set content_revision = content_revision + 1 where id = v_ver;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_rev_adjustments on public.version_adjustments;
create trigger trg_rev_adjustments after insert or update or delete
  on public.version_adjustments for each row execute function public.bump_version_revision_scoped();
drop trigger if exists trg_rev_guests on public.version_guests;
create trigger trg_rev_guests after insert or update or delete
  on public.version_guests for each row execute function public.bump_version_revision_scoped();
drop trigger if exists trg_rev_sections on public.version_sections;
create trigger trg_rev_sections after insert or update or delete
  on public.version_sections for each row execute function public.bump_version_revision_scoped();
drop trigger if exists trg_rev_choices on public.choice_groups;
create trigger trg_rev_choices after insert or update or delete
  on public.choice_groups for each row execute function public.bump_version_revision_scoped();

-- ── B2 + B3 completion · the version-row customer-visible FIELDS ──
-- The v265 seal guard on proposal_versions enumerated only theme/pins; the
-- resolver also reads customer_intro, customer_closing, price_visibility off
-- the same row. Extend the seal guard to refuse post-seal edits to these, and
-- the version-content bump to increment on their change. We REPLACE the two
-- existing functions (from v265 guard_sealed_version and v266
-- bump_on_version_content) so the row's full customer-visible surface is
-- covered in one place.
create or replace function public.guard_sealed_version()
returns trigger language plpgsql as $$
begin
  if old.sealed_at is not null then
    -- permitted post-seal writes: lifecycle terminal transitions + seal metadata
    if new.status is distinct from old.status
       or new.snapshot_id is distinct from old.snapshot_id
       or new.sealed_at is distinct from old.sealed_at
       or new.sent_at is distinct from old.sent_at then
      null;   -- allowed; fall through to the content check
    end if;
    -- customer-visible content fields are frozen: theme/pins (v265) PLUS the
    -- customer prose and price-visibility mode the resolver reads (v267).
    if new.theme_key is distinct from old.theme_key
       or new.theme_override is distinct from old.theme_override
       or new.photo_pins is distinct from old.photo_pins
       or new.customer_intro is distinct from old.customer_intro
       or new.customer_closing is distinct from old.customer_closing
       or new.price_visibility is distinct from old.price_visibility
       or new.version is distinct from old.version
       or new.proposal_id is distinct from old.proposal_id then
      raise exception 'SEALED_VERSION_IMMUTABLE';
    end if;
  end if;
  return new;
end $$;

create or replace function public.bump_on_version_content()
returns trigger language plpgsql as $$
begin
  if new.theme_key is distinct from old.theme_key
     or new.theme_override is distinct from old.theme_override
     or new.photo_pins is distinct from old.photo_pins
     or new.customer_intro is distinct from old.customer_intro
     or new.customer_closing is distinct from old.customer_closing
     or new.price_visibility is distinct from old.price_visibility then
    if new.content_revision = old.content_revision then
      new.content_revision := old.content_revision + 1;
    end if;
  end if;
  return new;
end $$;
-- (triggers trg_guard_sealed_version and trg_bump_version_content already exist
--  from v265/v266 and bind these function names — replacing the bodies suffices.)

-- ── Step-11 · supersession targets only a currently-sent sibling ──
-- The prior-offer determination and supersession must act ONLY on a sent,
-- sealed, non-superseded sibling. v266 already filtered the SELECT by
-- status='sent' and sealed_at is not null; this adds the same guard to the
-- UPDATE so a withdraw racing between SELECT and UPDATE cannot be overwritten
-- sent→superseded. Invariant: supersession transitions sent→superseded only.
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
  if encode(extensions.digest(v_stg.artifact_bytes, 'sha256'), 'hex') is distinct from v_stg.artifact_hash then
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
end $$;
