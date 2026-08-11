-- ═══════════════════════════════════════════════════════════════════════════
-- v267b — publish_offer(): schema-qualify the pgcrypto digest() call (additive).
--
-- WHY: publish_offer() is SECURITY DEFINER with search_path pinned to `public`
-- (correct hardening). Its R2 archive-integrity check called digest()
-- UNQUALIFIED. On Supabase pgcrypto lives in the `extensions` schema, so the
-- call did not resolve from inside the pinned function:
--     ERROR: function digest(bytea, unknown) does not exist   (line ~68)
--
-- AUDIT RESULT: a catalog audit of every function through v267 found that
-- publish_offer() is the ONLY deployed function that calls any pgcrypto
-- function at all. There is therefore no set of other functions depending on
-- an unqualified digest(), so the correct remedy is the DIRECT fix — qualify
-- the one call — NOT a permanent public.digest() compatibility API.
--
-- WHAT THIS DOES: re-creates public.publish_offer() with the SAME signature and
-- an otherwise BYTE-IDENTICAL body, changing exactly one token — digest(...) →
-- <pgcrypto_schema>.digest(...) — where the schema is discovered from the
-- catalog at migration time (works whether pgcrypto is in `extensions`,
-- `public`, or elsewhere). No other line changes; no other object is touched.
--
-- Idempotent: re-running installs the same corrected definition. Additive:
-- introduces no new public API, no constraint change, no data change.
-- ═══════════════════════════════════════════════════════════════════════════
do $mig$
declare
  v_schema text;
  v_body   text;
begin
  -- discover where pgcrypto's digest(bytea, text) actually lives
  select n.nspname into v_schema
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'digest' and p.pronargs = 2
      and p.proargtypes[0] = 'bytea'::regtype
      and p.proargtypes[1] = 'text'::regtype
    order by (n.nspname = 'public') desc
    limit 1;
  if v_schema is null then
    raise exception 'pgcrypto extensions.digest(bytea, text) not found — run: create extension pgcrypto;';
  end if;

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
  raise notice 'publish_offer(): extensions.digest() qualified to %.digest', v_schema;
end $mig$;
