--
-- PostgreSQL database dump
--

\restrict 4HxigqpTunNw4VhjQjZdxecoA0cFhW714yQg0Xx4jEpZQ4gXOBZZ0sekSIcB2Zp

-- Dumped from database version 18.4 (Ubuntu 18.4-1.pgdg24.04+1)
-- Dumped by pg_dump version 18.4 (Ubuntu 18.4-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: dblink; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA public;


--
-- Name: EXTENSION dblink; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION dblink IS 'connect to other PostgreSQL databases from within a database';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;


--
-- Name: digest(bytea, text); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.digest(bytea, text) RETURNS bytea
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $_$ select public.digest($1, $2) $_$;


--
-- Name: digest(text, text); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.digest(text, text) RETURNS bytea
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $_$ select public.digest($1, $2) $_$;


--
-- Name: accept_offer(uuid, text, text, jsonb, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_offer(p_version uuid, p_actor text, p_fingerprint text, p_selections jsonb, p_principal jsonb DEFAULT NULL::jsonb, p_channel text DEFAULT 'endpoint'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: FUNCTION accept_offer(p_version uuid, p_actor text, p_fingerprint text, p_selections jsonb, p_principal jsonb, p_channel text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.accept_offer(p_version uuid, p_actor text, p_fingerprint text, p_selections jsonb, p_principal jsonb, p_channel text) IS 'v271 acceptance ceremony, v273-hardened: expiry (I-22/A.1, frozen validUntil, half-open interval, server clock, observed→recorded moment) and selection cardinality (I-26/A.2, frozen min/max with legacy chooseCount precedence, absent-mandatory and excessive both refused) are now enforced against the frozen model. Observed-only; the attested path remains a deferred slice.';


--
-- Name: action_actor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.action_actor() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    nullif(current_setting('app.user_id', true), ''),
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    'unknown');
$$;


--
-- Name: action_authorized(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.action_authorized(p_action_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case
    when p_action_key in ('assign_staff','correct_staffing_assignment','release_staffing_assignment')
      then public.can_manage_staffing()
    when p_action_key in ('release_event','start_service','close_event','record_execution_evidence')
      then public.is_active_member()
    else false          -- unknown → default-deny
  end;
$$;


--
-- Name: action_envelope(boolean, text, text, text, text, text, uuid, jsonb, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.action_envelope(p_ok boolean, p_action text, p_outcome text, p_reason text, p_message text, p_target_type text, p_target_id uuid, p_result jsonb, p_evidence uuid, p_idem text) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    AS $$
  select jsonb_build_object(
    'ok', p_ok, 'action_key', p_action, 'outcome', p_outcome,
    'reason_code', p_reason, 'message', p_message,
    'target_type', p_target_type, 'target_id', p_target_id,
    'result', p_result, 'evidence_ref', p_evidence, 'idempotency_key', p_idem);
$$;


--
-- Name: action_evaluate(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.action_evaluate(p_action_key text, p_target_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  reg record; ts record; v_auth boolean; v_stage text; base text; detail text := null; cov jsonb;
begin
  select * into reg from public.action_registry() where action_key=p_action_key;
  if not found then return jsonb_build_object('available',false,'authorized',false,'reason_code','unknown_action','reason_detail',null); end if;
  v_auth := public.action_authorized(p_action_key);
  select * into ts from public.action_target_status(reg.target_type, p_target_id);

  if not ts.found then
    return jsonb_build_object('available',false,'authorized',v_auth,'reason_code','stale_target','reason_detail','target not found in tenant');
  end if;

  -- base applicability/availability (ignores authority; folded in afterwards)
  base := 'available';
  if p_action_key = 'release_event' then
    if ts.event_ref is not null then base := 'already_completed';
    elsif not exists (select 1 from public.offer_acceptances a where a.booking_id=p_target_id and a.tenant_id=public.current_tenant_id()
                        and not exists (select 1 from public.acceptance_rescissions r where r.acceptance_id=a.id))
      then base := 'blocked'; detail := 'no unrescinded commitment to release'; end if;

  elsif p_action_key = 'start_service' then
    v_stage := public.event_stage(ts.event_ref);
    if v_stage in ('in_service','closed') then base := 'already_completed';
    elsif v_stage = 'ready' then base := 'available';
    else base := 'blocked';
      detail := case when not public.event_staffing_ready(ts.event_ref) then 'required staffing coverage not met'
                     else 'pre-service obligations unresolved' end; end if;

  elsif p_action_key = 'close_event' then
    v_stage := public.event_stage(ts.event_ref);
    if v_stage = 'closed' then base := 'already_completed';
    elsif v_stage <> 'in_service' then base := 'blocked'; detail := 'service has not started';
    elsif exists (select 1 from public.obligation o where o.event_ref=ts.event_ref and o.tenant_id=public.current_tenant_id()
                    and o.kind='venue_breakdown' and public.obligation_state(o.id) not in ('complete','invalidated'))
      then base := 'blocked'; detail := 'breakdown not complete';
    elsif exists (select 1 from public.obligation o where o.event_ref=ts.event_ref and o.tenant_id=public.current_tenant_id()
                    and public.obligation_state(o.id)='exception')
      then base := 'blocked'; detail := 'open exception';
    end if;

  elsif p_action_key = 'record_execution_evidence' then
    if public.event_stage(ts.event_ref) = 'closed' then base := 'blocked'; detail := 'event is closed'; end if;

  elsif p_action_key = 'assign_staff' then
    if public.event_stage(ts.event_ref) = 'closed' then base := 'blocked'; detail := 'event is closed';
    else cov := public.requirement_coverage(p_target_id);
         if cov is not null and (cov->>'covered')::boolean then detail := 'requirement already covered (further assignments over-staff)'; end if; end if;

  elsif p_action_key in ('correct_staffing_assignment','release_staffing_assignment') then
    if ts.released then base := 'already_completed';
    elsif public.event_stage(ts.event_ref) = 'closed' then base := 'blocked'; detail := 'event is closed'; end if;
  end if;

  -- fold authority in with distinct precedence
  return jsonb_build_object(
    'available',  (base='available' and v_auth),
    'authorized', v_auth,
    'reason_code', case when not v_auth then 'unauthorized' else base end,
    'reason_detail', case when not v_auth then 'actor not authorized for this action' else detail end);
end $$;


--
-- Name: action_reason_of(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.action_reason_of(p_msg text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when p_msg like '%NOT_AUTHORIZED%' then 'unauthorized'
    when p_msg like '%CEREMONY_NOT_FOUND%' then 'stale_target'
    when p_msg like '%ALREADY%' then 'already_completed'
    when p_msg like '%NOT_READY%' or p_msg like '%UNCOVERED%' or p_msg like '%PENDING%'
      or p_msg like '%PREDICATE%' or p_msg like '%NOT_IN_SERVICE%' or p_msg like '%CLOSED%'
      or p_msg like '%DUPLICATE%' or p_msg like '%INVALID%' then 'lawful_refusal'
    else 'lawful_refusal' end;
$$;


--
-- Name: action_registry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.action_registry() RETURNS TABLE(action_key text, label text, domain text, target_type text, idempotency_mode text, workspace_visible boolean, group_key text, sort_order integer)
    LANGUAGE sql IMMUTABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  values
    ('release_event',               'Release Event',      'event',    'booking',              'transition', true,  'lifecycle', 10),
    ('start_service',               'Start Service',      'event',    'event',                'transition', true,  'lifecycle', 20),
    ('close_event',                 'Close Event',        'event',    'event',                'transition', true,  'lifecycle', 30),
    ('record_execution_evidence',   'Record Evidence',    'evidence', 'event',                'record_once',false, 'evidence',  40),
    ('assign_staff',                'Assign Staff',       'staffing', 'staffing_requirement', 'guarded',    true,  'staffing',  50),
    ('correct_staffing_assignment', 'Correct Assignment', 'staffing', 'staffing_assignment',  'append',     true,  'staffing',  60),
    ('release_staffing_assignment', 'Release Assignment', 'staffing', 'staffing_assignment',  'append',     true,  'staffing',  70)
$$;


--
-- Name: action_required_fields(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.action_required_fields(p_action_key text) RETURNS text[]
    LANGUAGE sql IMMUTABLE
    AS $$
  select case p_action_key
    when 'record_execution_evidence'   then array['kind']
    when 'assign_staff'                then array['staff','window_start','window_end']
    when 'correct_staffing_assignment' then array['new_staff','window_start','window_end','reason']
    else array[]::text[]
  end;
$$;


--
-- Name: action_target_status(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.action_target_status(p_target_type text, p_target_id uuid) RETURNS TABLE(found boolean, event_ref uuid, released boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id();
begin
  found := false; event_ref := null; released := false;
  if p_target_type = 'booking' then
    if exists (select 1 from public.bookings where id=p_target_id and tenant_id=v_tenant) then
      found := true; select e.id into event_ref from public.event e where e.engagement_ref=p_target_id and e.tenant_id=v_tenant;
    end if;
  elsif p_target_type = 'event' then
    if exists (select 1 from public.event where id=p_target_id and tenant_id=v_tenant) then found := true; event_ref := p_target_id; end if;
  elsif p_target_type = 'staffing_requirement' then
    select true, r.event_ref into found, event_ref from public.staffing_requirement r where r.id=p_target_id and r.tenant_id=v_tenant;
  elsif p_target_type = 'staffing_assignment' then
    select true, a.event_ref, exists(select 1 from public.staffing_release rel where rel.assignment_ref=a.id)
      into found, event_ref, released from public.staffing_assignment a where a.id=p_target_id and a.tenant_id=v_tenant;
  end if;
  found := coalesce(found,false); released := coalesce(released,false);
  return next;
end $$;


--
-- Name: add_venue_space(uuid, text, text, uuid, boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_venue_space(p_venue uuid, p_kind text, p_name text, p_parent uuid DEFAULT NULL::uuid, p_contended boolean DEFAULT false, p_sort integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  perform 1 from public.venue where id=p_venue and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  insert into public.venue_space (tenant_id, venue_id, parent_space_id, kind, name, contended, sort_order, created_by)
    values (v_tenant, p_venue, p_parent, p_kind, p_name, coalesce(p_contended,false), coalesce(p_sort,0), public.action_actor())
    returning id into v_id;      -- kind check + nesting guard enforce I-V3
  return jsonb_build_object('space_id', v_id);
end $$;


--
-- Name: adopt_engagement(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.adopt_engagement(p_booking uuid, p_relationship uuid, p_actor text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_ref    uuid;
begin
  select b.relationship_id into v_ref from public.bookings b
    where b.id = p_booking and b.tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_ref is not null then raise exception 'CEREMONY_ALREADY_ATTACHED'; end if;
  perform 1 from public.relationships r
    where r.id = p_relationship and r.tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_RELATIONSHIP_NOT_FOUND'; end if;

  update public.bookings set relationship_id = p_relationship where id = p_booking;
  insert into public.engagement_ledger (tenant_id, booking_id, ceremony, actor, relationship_ref)
    values (v_tenant, p_booking, 'engagement_adopted', p_actor, p_relationship);
  return jsonb_build_object('outcome', 'adopted');
end $$;


--
-- Name: amend_relationship(uuid, text, text, text, text[], text[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.amend_relationship(p_relationship uuid, p_actor text, p_name text, p_kind text, p_phones text[], p_emails text[], p_notes text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_phones  text[];
  v_emails  text[];
  v_changed boolean;
begin
  select r.phones, r.emails into v_phones, v_emails from public.relationships r
    where r.id = p_relationship and r.tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'CEREMONY_IDENTITY_REQUIRED'; end if;

  v_changed := (v_phones is distinct from p_phones) or (v_emails is distinct from p_emails);
  update public.relationships set
    name = btrim(p_name),
    kind = coalesce(nullif(btrim(p_kind), ''), kind),
    phones = coalesce(p_phones, phones),
    emails = coalesce(p_emails, emails),
    standing_notes = p_notes
    where id = p_relationship;

  if v_changed then
    -- THAT identity was amended — never WHAT it became. No PII in the ledger.
    insert into public.engagement_ledger (tenant_id, booking_id, ceremony, actor, relationship_ref)
      select v_tenant, b.id, 'relationship_identity_amended', p_actor, p_relationship
        from public.bookings b
        where b.relationship_id = p_relationship and b.tenant_id = v_tenant
        limit 1;
    -- (an unattached party's amendment has no engagement to file under; the
    --  fact update itself is the record until its first citation exists)
  end if;
  return jsonb_build_object('outcome', 'amended', 'identity_changed', v_changed);
end $$;


--
-- Name: apply_move_batch(uuid, timestamp with time zone, jsonb, integer, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_move_batch(p_component uuid, p_expected_updated_at timestamp with time zone, p_config jsonb, p_config_schema_version integer, p_derived jsonb, p_suppress jsonb, p_restore jsonb, p_manual_add jsonb, p_moves jsonb, p_items jsonb DEFAULT NULL::jsonb, p_baseline jsonb DEFAULT NULL::jsonb, p_baseline_provenance text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_now timestamptz := now();
  v_ids uuid[] := '{}';
  v_move jsonb; v_id uuid; v_parent uuid; v_it jsonb; n int;
begin
  if p_config is not null then
    if p_expected_updated_at is null then
      -- FIRST WRITE: creating a baseline is a stated act, never an accident.
      if not exists (select 1 from public.event_component_config where component_id = p_component) then
        if p_baseline is null or p_baseline_provenance is null
           or p_baseline_provenance not in
             ('legacy_initialized_from_definition','reconstructed_from_instance','baseline_unknown') then
          raise exception 'BASELINE_REQUIRED: first write must state its baseline and provenance';
        end if;
        insert into public.event_component_config
            (component_id, schema_version, data, updated_at, baseline, baseline_provenance, baseline_at)
          values (p_component, p_config_schema_version, p_config, v_now,
                  p_baseline, p_baseline_provenance, v_now);
      else
        update public.event_component_config
           set data = p_config, schema_version = p_config_schema_version, updated_at = v_now
         where component_id = p_component;
      end if;
    else
      update public.event_component_config
         set data = p_config, schema_version = p_config_schema_version, updated_at = v_now
       where component_id = p_component and updated_at = p_expected_updated_at;
      get diagnostics n = row_count;
      if n = 0 then raise exception 'CONFIG_CONFLICT: configuration changed since the batch was planned'; end if;
    end if;
  end if;

  for v_it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    if v_it->>'op' = 'add_item' then
      insert into public.component_items
          (component_id, name, category_key, unit_price, quantity_basis, position, price_confirmed, taxable)
        values (p_component, v_it->>'name', v_it->>'category_key', (v_it->>'unit_price')::numeric,
                coalesce(v_it->>'quantity_basis','per_person'), coalesce((v_it->>'position')::int,0),
                coalesce((v_it->>'price_confirmed')::boolean,true), coalesce((v_it->>'taxable')::boolean,true));
    elsif v_it->>'op' = 'remove_item' then
      delete from public.component_items where id=(v_it->>'item_id')::uuid and component_id=p_component;
    elsif v_it->>'op' = 'update_item' then
      update public.component_items set name=coalesce(v_it->>'name',name),
        unit_price=coalesce((v_it->>'unit_price')::numeric,unit_price)
       where id=(v_it->>'item_id')::uuid and component_id=p_component;
    else raise exception 'ITEMS: unknown op %', v_it->>'op'; end if;
  end loop;

  if p_derived is not null then
    delete from public.component_requirements r
     where r.component_id=p_component and r.derived and r.suppressed_at is null
       and not exists (select 1 from jsonb_array_elements(p_derived) d
                       where d->>'layer_key'=r.layer_key and d->>'logical_key'=r.logical_key);
    insert into public.component_requirements (component_id, layer_key, logical_key, derived, name, category, notes)
      select p_component, d->>'layer_key', d->>'logical_key', true, d->>'name', d->>'category', d->>'notes'
      from jsonb_array_elements(p_derived) d
      on conflict (component_id, layer_key, logical_key) where logical_key is not null
      do update set name=excluded.name, category=excluded.category, notes=excluded.notes;
  end if;
  update public.component_requirements set suppressed_at=v_now
   where component_id=p_component and suppressed_at is null
     and (layer_key,logical_key) in (select s->>'layer_key',s->>'logical_key'
          from jsonb_array_elements(coalesce(p_suppress,'[]'::jsonb)) s);
  update public.component_requirements set suppressed_at=null
   where component_id=p_component and suppressed_at is not null
     and (layer_key,logical_key) in (select s->>'layer_key',s->>'logical_key'
          from jsonb_array_elements(coalesce(p_restore,'[]'::jsonb)) s);
  insert into public.component_requirements (component_id, layer_key, derived, name, category, notes)
    select p_component, m->>'layer_key', false, m->>'name', m->>'category', m->>'notes'
    from jsonb_array_elements(coalesce(p_manual_add,'[]'::jsonb)) m;

  for v_move in select * from jsonb_array_elements(coalesce(p_moves,'[]'::jsonb)) loop
    v_parent := case when (v_move->>'parent_ix') is not null then v_ids[(v_move->>'parent_ix')::int+1] end;
    insert into public.configuration_moves (component_id, kind, payload, before, origin, parent_move_id, cause, actor)
      values (p_component, v_move->>'kind', v_move->'payload', v_move->'before',
              v_move->>'origin', v_parent, v_move->>'cause', auth.uid())
      returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;
  return jsonb_build_object('applied', coalesce(jsonb_array_length(p_moves),0), 'at', v_now);
end $$;


--
-- Name: assign_component_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_component_identity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_id uuid;
begin
  if new.definition_id is not null then return new; end if;
  if new.title is null or btrim(new.title) = '' then return new; end if;
  if new.tenant_id is null then return new; end if;
  insert into public.component_definitions (tenant_id, name, created_by_process)
    values (new.tenant_id, btrim(new.title), 'auto_title')
    on conflict (tenant_id, lower(btrim(name))) do nothing;
  select id into v_id from public.component_definitions
   where tenant_id = new.tenant_id
     and lower(btrim(name)) = lower(btrim(new.title));
  new.definition_id := v_id;
  return new;
end $$;


--
-- Name: assign_staff(uuid, uuid, timestamp with time zone, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_staff(p_requirement uuid, p_staff uuid, p_window_start timestamp with time zone, p_window_end timestamp with time zone, p_actor text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_event uuid; v_role text; v_id uuid;
begin
  if not public.can_manage_staffing() then raise exception 'STAFFING_NOT_AUTHORIZED'; end if;
  select event_ref, role into v_event, v_role from public.staffing_requirement
    where id=p_requirement and tenant_id=v_tenant for update;                    -- resolve + lock
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if exists (select 1 from public.execution_evidence where event_ref=v_event and tenant_id=v_tenant and kind='event_closed')
    then raise exception 'STAFFING_EVENT_CLOSED'; end if;
  if not exists (select 1 from public.staff where id=p_staff and tenant_id=v_tenant and active)
    then raise exception 'STAFFING_STAFF_INVALID'; end if;
  if p_window_end is null or p_window_start is null or p_window_end <= p_window_start
    then raise exception 'STAFFING_WINDOW_INVALID'; end if;
  if exists (select 1 from public.staffing_assignment a
              where a.requirement_ref=p_requirement and a.staff_ref=p_staff and a.tenant_id=v_tenant
                and not exists (select 1 from public.staffing_release r where r.assignment_ref=a.id))
    then raise exception 'STAFFING_DUPLICATE_ASSIGNMENT'; end if;

  insert into public.staffing_assignment
      (tenant_id,event_ref,requirement_ref,staff_ref,role,window_start,window_end,assigned_by)
    values (v_tenant,v_event,p_requirement,p_staff,v_role,p_window_start,p_window_end,p_actor)
    returning id into v_id;
  return jsonb_build_object('assignment_id', v_id, 'coverage', public.requirement_coverage(p_requirement));
end $$;


--
-- Name: attach_component_profile(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.attach_component_profile(p_event_component uuid, p_library_component uuid, p_revision uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_rev uuid; v_no int;
begin
  if not public.can_manage_library() then raise exception 'LIBRARY_NOT_AUTHORIZED'; end if;
  perform 1 from public.event_components where id=p_event_component and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.library_component where id=p_library_component and tenant_id=v_tenant and active;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  v_rev := coalesce(p_revision, public.profile_current_revision(p_library_component));
  if v_rev is null then raise exception 'PROFILE_NO_REVISION'; end if;
  update public.event_components
     set library_component_id = p_library_component, profile_revision_id = v_rev
   where id = p_event_component and tenant_id = v_tenant;   -- pin guard validates coherence
  select revision_no into v_no from public.component_profile_revision where id=v_rev;
  return jsonb_build_object('event_component_id', p_event_component,
                            'profile_revision_id', v_rev, 'revision_no', v_no);
end $$;


--
-- Name: attribute_family(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.attribute_family(p_attr text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when p_attr = 'renovation_event' then 'event_marker'
    when p_attr ~* 'insurance|permit|certificat|license' then 'document'
    when p_attr ~* 'dimension|clearance|height|width|length|sqft|footage|ceiling' then 'structural'
    when p_attr ~* 'electric|amperage|voltage|circuit|power|water|gas|drain|ventilat|hvac' then 'utility'
    when p_attr ~* 'equipment|refrigerat|freezer|oven|range|holding|walkin|walk_in|sink|mixer' then 'equipment'
    when p_attr ~* 'rule|labor|union|porter|noise|vendor|hard_out|flame|security|cleanup' then 'rule'
    when p_attr ~* 'elevator|loading|dock|access|stair|corridor|door|parking|curb|entrance' then 'access'
    else 'other' end $$;


--
-- Name: author_definition_revision(uuid, uuid, jsonb, integer, text, text, jsonb, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.author_definition_revision(p_definition uuid, p_expected_live_revision uuid, p_data jsonb, p_schema_version integer, p_origin text, p_note text, p_citations jsonb DEFAULT NULL::jsonb, p_layers jsonb DEFAULT NULL::jsonb, p_session_key text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_act uuid; v_rev uuid; v_cite jsonb; v_lay jsonb; v_lrev uuid; v_lexp uuid; n int;
  v_layer_out jsonb := '[]'::jsonb;
begin
  if p_origin = 'promotion' then
    if p_citations is null or jsonb_array_length(p_citations) = 0 then
      raise exception 'CITATIONS_REQUIRED: a promotion must cite at least one divergence line';
    end if;
  elsif p_origin = 'executive_curation' then
    if p_citations is not null and jsonb_array_length(p_citations) > 0 then
      raise exception 'CITATIONS_FORBIDDEN: executive curation cites a decision, not events';
    end if;
  else
    raise exception 'ORIGIN_INVALID: %', p_origin;
  end if;
  if p_note is null or btrim(p_note) = '' then
    raise exception 'NOTE_REQUIRED: the act must state its reason';
  end if;
  if p_data is null and (p_layers is null or jsonb_array_length(p_layers) = 0) then
    raise exception 'NO_ARTIFACTS: an act must produce at least one artifact';
  end if;
  if not exists (select 1 from public.component_definitions d
                 where d.id = p_definition and d.tenant_id = v_tenant) then
    raise exception 'DEFINITION_NOT_VISIBLE';
  end if;
  if p_data is not null and p_expected_live_revision is null
     and exists (select 1 from public.component_definition_config
                 where definition_id = p_definition
                   and superseded_by is null and archived_at is null) then
    raise exception 'EXPECTED_REQUIRED: a live revision exists; stage against it';
  end if;

  insert into public.definition_revision_acts
      (tenant_id, definition_id, origin, note, review_session_key, actor)
    values (v_tenant, p_definition, p_origin, p_note, p_session_key, auth.uid())
    returning id into v_act;

  -- ── config artifact (optional since v209: an act may be layer-only) ──
  if p_data is not null then
    v_rev := gen_random_uuid();
    if p_expected_live_revision is not null then
      update public.component_definition_config
         set superseded_by = v_rev
       where id = p_expected_live_revision
         and definition_id = p_definition
         and superseded_by is null and archived_at is null;
      get diagnostics n = row_count;
      if n = 0 then
        raise exception 'REVISION_SUPERSEDED: the revision you staged against is no longer live';
      end if;
    end if;
    insert into public.component_definition_config (id, definition_id, schema_version, data, created_by)
      values (v_rev, p_definition, p_schema_version, p_data, auth.uid());
    insert into public.act_produced_artifacts (act_id, artifact_kind, revision_id, superseded_revision)
      values (v_act, 'config_revision', v_rev, p_expected_live_revision);
  end if;

  -- ── layer artifacts: each supersedes ITS OWN live revision, same dance ──
  for v_lay in select * from jsonb_array_elements(coalesce(p_layers, '[]'::jsonb)) loop
    if v_lay->>'layer_key' is null or btrim(v_lay->>'layer_key') = '' then
      raise exception 'LAYER_KEY_REQUIRED';
    end if;
    v_lexp := (v_lay->>'expected_live')::uuid;
    v_lrev := gen_random_uuid();
    if v_lexp is not null then
      update public.component_layers
         set superseded_by = v_lrev
       where id = v_lexp
         and definition_id = p_definition
         and layer_key = v_lay->>'layer_key'
         and superseded_by is null and archived_at is null;
      get diagnostics n = row_count;
      if n = 0 then
        raise exception 'LAYER_REVISION_SUPERSEDED: the % layer changed since staging', v_lay->>'layer_key';
      end if;
    else
      if exists (select 1 from public.component_layers
                 where definition_id = p_definition and layer_key = v_lay->>'layer_key'
                   and superseded_by is null and archived_at is null) then
        raise exception 'LAYER_EXPECTED_REQUIRED: a live % layer exists; stage against it', v_lay->>'layer_key';
      end if;
    end if;
    insert into public.component_layers (id, definition_id, layer_key, schema_version, data, created_by)
      values (v_lrev, p_definition, v_lay->>'layer_key',
              coalesce((v_lay->>'schema_version')::int, 1), v_lay->'data', auth.uid());
    insert into public.act_produced_artifacts (act_id, artifact_kind, revision_id, layer_key, superseded_revision)
      values (v_act, 'layer_revision', v_lrev, v_lay->>'layer_key', v_lexp);
    v_layer_out := v_layer_out || jsonb_build_object('layer_key', v_lay->>'layer_key', 'revision_id', v_lrev);
  end loop;

  if p_origin = 'promotion' then
    for v_cite in select * from jsonb_array_elements(p_citations) loop
      insert into public.promotion_citations
          (act_id, component_id, dimension_key, from_value, to_value, baseline_kind, baseline_revision)
        values (v_act, (v_cite->>'component_id')::uuid, v_cite->>'dimension_key',
                v_cite->'from_value', v_cite->'to_value',
                coalesce(v_cite->>'baseline_kind','baseline_unknown'),
                (v_cite->>'baseline_revision')::uuid);
    end loop;
  end if;

  return jsonb_build_object('act_id', v_act, 'revision_id', v_rev, 'layer_revisions', v_layer_out);
end $$;


--
-- Name: author_profile_revision(uuid, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.author_profile_revision(p_component uuid, p_requirements jsonb, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_rev uuid; v_no int; v_prev uuid;
  r jsonb; i int := 0; v_fam text; v_kind text; v_unit text; v_basis text;
begin
  if not public.can_manage_library() then raise exception 'LIBRARY_NOT_AUTHORIZED'; end if;
  perform 1 from public.library_component where id=p_component and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if p_requirements is null or jsonb_typeof(p_requirements) <> 'array' or jsonb_array_length(p_requirements)=0
    then raise exception 'REVISION_REQUIREMENTS_REQUIRED'; end if;

  -- pre-validate the WHOLE set before writing anything (atomic authorship)
  for r in select * from jsonb_array_elements(p_requirements) loop
    i := i + 1;
    v_fam := r->>'family'; v_kind := r->>'kind'; v_unit := r->>'unit'; v_basis := r->>'basis';
    if not public.profile_family_valid(coalesce(v_fam,'')) then raise exception 'REQUIREMENT_INVALID_FAMILY: row %', i; end if;
    if not public.profile_kind_valid(v_fam, coalesce(v_kind,'')) then raise exception 'REQUIREMENT_INVALID_KIND: row %', i; end if;
    if not public.profile_unit_valid(v_fam, coalesce(v_unit,'')) then raise exception 'REQUIREMENT_INVALID_UNIT: row %', i; end if;
    if coalesce(v_basis,'') not in ('fixed','per_instance','per_service_point','per_guest','per_guest_band','per_table','per_hour','per_shift','per_batch')
      then raise exception 'REQUIREMENT_INVALID_BASIS: row %', i; end if;
    if (r->>'rate') is null then raise exception 'REQUIREMENT_RATE_REQUIRED: row %', i; end if;
    if v_basis='per_guest_band' and coalesce((r->>'band_size')::int,0) <= 0
      then raise exception 'REQUIREMENT_BAND_REQUIRED: row %', i; end if;
    if (r->>'condition_param') is not null and not public.profile_param_valid(r->>'condition_param')
      then raise exception 'REQUIREMENT_INVALID_CONDITION: row %', i; end if;
    if coalesce(r->'payload','{}'::jsonb) ?| array['formula','expr','expression','code','script','eval']
      then raise exception 'NO_EXECUTABLE_FORMULAS: row %', i; end if;
  end loop;

  select id into v_prev from public.component_profile_revision
    where library_component_id=p_component and tenant_id=v_tenant order by seq desc limit 1;
  select coalesce(max(revision_no),0)+1 into v_no from public.component_profile_revision
    where library_component_id=p_component and tenant_id=v_tenant;
  insert into public.component_profile_revision
      (tenant_id, library_component_id, revision_no, reason, supersedes_revision_id, authored_by)
    values (v_tenant, p_component, v_no, nullif(trim(coalesce(p_reason,'')),''), v_prev, public.action_actor())
    returning id into v_rev;

  i := 0;
  for r in select * from jsonb_array_elements(p_requirements) loop
    i := i + 1;
    insert into public.profile_requirement
        (tenant_id, revision_id, family, kind, label, capability, provision_source,
         basis, rate, band_size, min_qty, max_qty, rounding, unit, payload,
         aggregation, temporal, condition_param, condition_value, position)
      values (v_tenant, v_rev, r->>'family', r->>'kind', coalesce(r->>'label', r->>'kind'),
              coalesce((r->>'capability')::boolean,false), coalesce(r->>'provision_source','company'),
              r->>'basis', (r->>'rate')::numeric, (r->>'band_size')::int,
              (r->>'min_qty')::numeric, (r->>'max_qty')::numeric, coalesce(r->>'rounding','ceil'),
              r->>'unit', coalesce(r->'payload','{}'::jsonb),
              coalesce(r->>'aggregation','additive'), coalesce(r->>'temporal','concurrent'),
              r->>'condition_param', r->>'condition_value', i);
  end loop;
  return jsonb_build_object('revision_id', v_rev, 'revision_no', v_no, 'requirement_count', i);
end $$;


--
-- Name: available_actions(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.available_actions(p_target_type text, p_target_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'action_key', r.action_key, 'label', r.label, 'domain', r.domain,
    'target_type', r.target_type, 'target_id', p_target_id,
    'group_key', r.group_key, 'sort_order', r.sort_order,
    'idempotency_mode', r.idempotency_mode, 'workspace_visible', r.workspace_visible,
    'required_fields', to_jsonb(public.action_required_fields(r.action_key)),
    'available', (ev->>'available')::boolean, 'authorized', (ev->>'authorized')::boolean,
    'reason_code', ev->>'reason_code', 'reason_detail', ev->>'reason_detail'
  ) order by r.sort_order), '[]'::jsonb)
  from public.action_registry() r
  cross join lateral public.action_evaluate(r.action_key, p_target_id) ev
  where r.target_type = p_target_type;
$$;


--
-- Name: bind_engagement_venue(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bind_engagement_venue(p_booking uuid, p_venue uuid, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_ven record; v_cur record; v_id uuid;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  -- serialize on the engagement (race posture #9)
  perform 1 from public.bookings where id=p_booking and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  select * into v_ven from public.venue where id=p_venue and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_ven.redirect_to is not null then raise exception 'VENUE_REDIRECTED'; end if;
  select * into v_cur from public.engagement_venue_binding
    where booking_id=p_booking and tenant_id=v_tenant
    order by seq desc limit 1;
  if found and v_cur.venue_id = p_venue then raise exception 'BINDING_UNCHANGED'; end if;
  if found and coalesce(trim(p_reason),'') = '' then
    raise exception 'BINDING_REASON_REQUIRED';   -- corrections must be attributed
  end if;
  insert into public.engagement_venue_binding
      (tenant_id, booking_id, venue_id, replaces_binding_id, reason,
       venue_name_snapshot, venue_address_snapshot, bound_by)
    values (v_tenant, p_booking, p_venue, v_cur.id, nullif(trim(p_reason),''),
            v_ven.name, v_ven.address, public.action_actor())
    returning id into v_id;
  return jsonb_build_object('binding_id', v_id, 'venue_id', p_venue,
                            'replaced', v_cur.id is not null);
end $$;


--
-- Name: bind_occurrence_supervision(uuid, text, timestamp with time zone, timestamp with time zone, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bind_occurrence_supervision(p_occurrence uuid, p_authority_org text, p_window_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_window_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_certificate_ref text DEFAULT NULL::text, p_contact text DEFAULT NULL::text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_book uuid; v_cur record; v_id uuid;
begin
  if not public.can_bind_supervision() then
    raise exception 'PROMISE_NOT_AUTHORIZED: supervision is compliance-bearing';
  end if;
  select booking_id into v_book from public.engagement_occurrence
   where id = p_occurrence and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.bookings where id = v_book and tenant_id = v_tenant for update;
  if coalesce(trim(p_authority_org),'') = '' then raise exception 'SUPERVISION_ORG_REQUIRED'; end if;

  select * into v_cur from public.occurrence_supervision s
   where s.occurrence_id = p_occurrence and s.tenant_id = v_tenant
     and not exists (select 1 from public.occurrence_supervision x where x.replaces_id = s.id)
   order by s.seq desc limit 1;
  if found and not v_cur.cleared
     and v_cur.authority_org is not distinct from trim(p_authority_org)
     and v_cur.window_start is not distinct from p_window_start
     and v_cur.window_end is not distinct from p_window_end then
    raise exception 'PROMISE_UNCHANGED';
  end if;
  if found and coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;

  insert into public.occurrence_supervision
      (tenant_id, occurrence_id, authority_org, window_start, window_end,
       certificate_ref, contact, cleared, replaces_id, reason, recorded_by)
    values (v_tenant, p_occurrence, trim(p_authority_org), p_window_start, p_window_end,
            nullif(trim(p_certificate_ref),''), nullif(trim(p_contact),''), false,
            v_cur.id, nullif(trim(p_reason),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('supervision_id', v_id, 'replaced', v_cur.id is not null);
end $$;


--
-- Name: bind_occurrence_venue(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bind_occurrence_venue(p_occurrence uuid, p_venue uuid, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_book uuid;
        v_ven record; v_cur record; v_id uuid;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  select booking_id into v_book from public.engagement_occurrence
   where id = p_occurrence and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.bookings where id = v_book and tenant_id = v_tenant for update;
  select * into v_ven from public.venue where id = p_venue and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_ven.redirect_to is not null then raise exception 'VENUE_REDIRECTED'; end if;

  select * into v_cur from public.occurrence_venue_binding v
   where v.occurrence_id = p_occurrence and v.tenant_id = v_tenant
     and not exists (select 1 from public.occurrence_venue_binding s where s.replaces_id = v.id)
   order by v.seq desc limit 1;
  if found and v_cur.venue_id = p_venue then raise exception 'BINDING_UNCHANGED'; end if;
  if found and coalesce(trim(p_reason),'') = '' then raise exception 'BINDING_REASON_REQUIRED'; end if;

  insert into public.occurrence_venue_binding
      (tenant_id, occurrence_id, venue_id, venue_name_snapshot,
       venue_address_snapshot, replaces_id, reason, recorded_by)
    values (v_tenant, p_occurrence, p_venue, v_ven.name, v_ven.address,
            v_cur.id, nullif(trim(p_reason),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('binding_id', v_id, 'replaced', v_cur.id is not null);
end $$;


--
-- Name: bind_supervision(uuid, text, timestamp with time zone, timestamp with time zone, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bind_supervision(p_booking uuid, p_authority_org text, p_window_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_window_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_certificate_ref text DEFAULT NULL::text, p_contact text DEFAULT NULL::text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_cur record; v_id uuid;
begin
  if not public.can_bind_supervision() then
    raise exception 'PROMISE_NOT_AUTHORIZED: supervision is compliance-bearing';
  end if;
  perform 1 from public.bookings where id = p_booking and tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if coalesce(trim(p_authority_org),'') = '' then
    raise exception 'SUPERVISION_ORG_REQUIRED';
  end if;

  select * into v_cur from public.promise_current_supervision(p_booking, now());
  if found then
    if v_cur.authority_org is not distinct from trim(p_authority_org)
       and v_cur.window_start is not distinct from p_window_start
       and v_cur.window_end is not distinct from p_window_end
       and coalesce(v_cur.certificate_ref,'') is not distinct from coalesce(nullif(trim(p_certificate_ref),''),'') then
      raise exception 'PROMISE_UNCHANGED';
    end if;
    if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  end if;

  insert into public.engagement_supervision
      (tenant_id, booking_id, authority_org, window_start, window_end,
       certificate_ref, contact, cleared, replaces_id, reason, recorded_by)
    values (v_tenant, p_booking, trim(p_authority_org), p_window_start, p_window_end,
            nullif(trim(p_certificate_ref),''), nullif(trim(p_contact),''), false,
            v_cur.id, nullif(trim(p_reason),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('supervision_id', v_id, 'replaced', v_cur.id is not null);
end $$;


--
-- Name: blueprint_barred_keys(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.blueprint_barred_keys(p jsonb) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  barred text[] := array[
    'customer','customerId','customer_id','contact','party','parties',
    'eventDate','event_date','date','dates','venue',
    'guestCount','guest_count','guests',
    'deposit','deposits','discount','payment','payments',
    'agreement','agreements','terms','signature','signatures',
    'delivery','deliveries','approval','approvals','actuals',
    'taxId','tax_id','ach',
    'confirmed','price_confirmed','priceConfirmed'];
  found_keys text[] := '{}';
  k text; v jsonb;
begin
  if jsonb_typeof(p) = 'object' then
    for k, v in select * from jsonb_each(p) loop
      if k = any(barred) then found_keys := found_keys || k; end if;
      found_keys := found_keys || public.blueprint_barred_keys(v);
    end loop;
  elsif jsonb_typeof(p) = 'array' then
    for v in select * from jsonb_array_elements(p) loop
      found_keys := found_keys || public.blueprint_barred_keys(v);
    end loop;
  end if;
  return found_keys;
end $$;


--
-- Name: blueprint_condition_eval(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.blueprint_condition_eval(p_cond jsonb, p_answers jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  v_pred text; v_param text; v_raw jsonb; v_child jsonb; v_res boolean;
begin
  if p_cond ? 'all' then
    for v_child in select * from jsonb_array_elements(p_cond->'all') loop
      if not public.blueprint_condition_eval(v_child, p_answers) then return false; end if;
    end loop;
    return true;
  elsif p_cond ? 'any' then
    for v_child in select * from jsonb_array_elements(p_cond->'any') loop
      if public.blueprint_condition_eval(v_child, p_answers) then return true; end if;
    end loop;
    return false;
  elsif p_cond ? 'not' then
    return not public.blueprint_condition_eval(p_cond->'not', p_answers);
  end if;
  v_pred := p_cond->>'predicate';
  v_param := p_cond->>'param';
  v_raw := p_answers->v_param;
  if v_pred = 'present' then
    return v_raw is not null and v_raw <> 'null'::jsonb and v_raw <> '""'::jsonb;
  end if;
  if v_raw is null or v_raw = 'null'::jsonb then return false; end if;
  case v_pred
    when 'equals' then
      if jsonb_typeof(v_raw) = 'string' then
        return trim(v_raw #>> '{}') = trim(p_cond->>'operand');
      end if;
      return v_raw = p_cond->'operand';
    when 'not-equals' then
      if jsonb_typeof(v_raw) = 'string' then
        return trim(v_raw #>> '{}') <> trim(p_cond->>'operand');
      end if;
      return v_raw <> p_cond->'operand';
    when 'greater-than' then return (v_raw #>> '{}')::numeric >  (p_cond->>'operand')::numeric;
    when 'at-least'     then return (v_raw #>> '{}')::numeric >= (p_cond->>'operand')::numeric;
    when 'less-than'    then return (v_raw #>> '{}')::numeric <  (p_cond->>'operand')::numeric;
    when 'at-most'      then return (v_raw #>> '{}')::numeric <= (p_cond->>'operand')::numeric;
    when 'one-of' then
      if jsonb_typeof(v_raw) = 'string' then
        return exists (select 1 from jsonb_array_elements_text(p_cond->'operand') o
                        where trim(o) = trim(v_raw #>> '{}'));
      end if;
      return p_cond->'operand' @> jsonb_build_array(v_raw);
    else return false;
  end case;
end $$;


--
-- Name: blueprint_condition_problems(jsonb, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.blueprint_condition_problems(p_cond jsonb, p_params jsonb, p_depth integer DEFAULT 1) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  v_probs text[] := '{}';
  v_child jsonb; v_pred text; v_param text; v_decl jsonb; v_type text; v_op jsonb;
  v_admit jsonb := '{"equals":["count","choice","flag"],"not-equals":["count","choice","flag"],
    "greater-than":["count"],"at-least":["count"],"less-than":["count"],"at-most":["count"],
    "one-of":["count","choice"],"present":["count","choice","flag"]}';
begin
  if p_depth = 1 and public.blueprint_condition_size(p_cond) > 10 then
    return array['CONDITION_COUNT_EXCEEDED'];
  end if;
  if p_depth > 3 then return array['CONDITION_DEPTH_EXCEEDED']; end if;
  if p_cond ? 'all' or p_cond ? 'any' then
    if jsonb_array_length(coalesce(p_cond->'all', p_cond->'any')) = 0
       or jsonb_typeof(coalesce(p_cond->'all', p_cond->'any')) <> 'array' then
      return array['CONDITION_EMPTY_GROUP'];
    end if;
    for v_child in select * from jsonb_array_elements(coalesce(p_cond->'all', p_cond->'any')) loop
      v_probs := v_probs || public.blueprint_condition_problems(v_child, p_params, p_depth + 1);
    end loop;
    return v_probs;
  elsif p_cond ? 'not' then
    return public.blueprint_condition_problems(p_cond->'not', p_params, p_depth + 1);
  end if;
  v_pred := p_cond->>'predicate';
  if v_pred is null or not (v_admit ? v_pred) then return array['CONDITION_UNKNOWN_PREDICATE']; end if;
  v_param := p_cond->>'param';
  select p into v_decl from jsonb_array_elements(coalesce(p_params, '[]'::jsonb)) p
    where p->>'key' = v_param limit 1;
  if v_decl is null then return array['CONDITION_PARAM_MISSING']; end if;
  v_type := v_decl->>'type';
  if not (v_admit->v_pred @> to_jsonb(array[v_type])) then
    return array['CONDITION_TYPE_UNSUPPORTED'];
  end if;
  v_op := p_cond->'operand';
  if v_pred = 'present' then
    if v_op is not null then v_probs := v_probs || 'CONDITION_OPERAND_INVALID'; end if;
  elsif v_pred = 'one-of' then
    if v_op is null or jsonb_typeof(v_op) <> 'array' or jsonb_array_length(v_op) = 0 then
      v_probs := v_probs || 'CONDITION_OPERAND_INVALID';
    end if;
  elsif v_type = 'count' then
    if v_op is null or jsonb_typeof(v_op) <> 'number' then v_probs := v_probs || 'CONDITION_OPERAND_INVALID'; end if;
  elsif v_type = 'choice' then
    if v_op is null or jsonb_typeof(v_op) <> 'string' then v_probs := v_probs || 'CONDITION_OPERAND_INVALID'; end if;
  elsif v_type = 'flag' then
    if v_op is null or jsonb_typeof(v_op) <> 'boolean' then v_probs := v_probs || 'CONDITION_OPERAND_INVALID'; end if;
  end if;
  return v_probs;
end $$;


--
-- Name: blueprint_condition_size(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.blueprint_condition_size(p_cond jsonb) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare v_n int := 0; v_child jsonb;
begin
  if p_cond ? 'all' or p_cond ? 'any' then
    for v_child in select * from jsonb_array_elements(coalesce(p_cond->'all', p_cond->'any')) loop
      v_n := v_n + public.blueprint_condition_size(v_child);
    end loop;
    return v_n;
  elsif p_cond ? 'not' then
    return public.blueprint_condition_size(p_cond->'not');
  end if;
  return 1;
end $$;


--
-- Name: blueprint_revision_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.blueprint_revision_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if old.state <> 'draft' then
    if new.content                 is distinct from old.content
       or new.identity_id             is distinct from old.identity_id
       or new.revision_number         is distinct from old.revision_number
       or new.supersedes_revision_id  is distinct from old.supersedes_revision_id
       or new.seeded_from_revision_id is distinct from old.seeded_from_revision_id
       or new.published_at            is distinct from old.published_at
       or new.published_by            is distinct from old.published_by
       or new.created_at              is distinct from old.created_at
    then
      raise exception 'BLUEPRINT_REVISION_IMMUTABLE';
    end if;
    if new.state is distinct from old.state
       and not (old.state = 'published' and new.state = 'superseded') then
      raise exception 'BLUEPRINT_REVISION_IMMUTABLE';
    end if;
  end if;
  return new;
end $$;


--
-- Name: bump_on_version_content(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_on_version_content() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.theme_key is distinct from old.theme_key
     or new.theme_override is distinct from old.theme_override
     or new.photo_pins is distinct from old.photo_pins
     or new.customer_intro is distinct from old.customer_intro
     or new.customer_closing is distinct from old.customer_closing
     or new.price_visibility is distinct from old.price_visibility
     or new.valid_until is distinct from old.valid_until then   -- v268
    if new.content_revision = old.content_revision then
      new.content_revision := old.content_revision + 1;
    end if;
  end if;
  return new;
end $$;


--
-- Name: bump_version_revision(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_version_revision() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: bump_version_revision_scoped(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_version_revision_scoped() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_ver uuid;
begin
  v_ver := coalesce(new.version_id, old.version_id);
  if v_ver is not null then
    update public.proposal_versions set content_revision = content_revision + 1 where id = v_ver;
  end if;
  return coalesce(new, old);
end $$;


--
-- Name: can_bind_supervision(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_bind_supervision() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = public.current_tenant_id() and tu.active
       and tu.role in ('admin','owner','manager')
       and tu.user_id = coalesce(
             nullif(current_setting('app.user_id', true), ''),
             nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid);
$$;


--
-- Name: can_commit_attendance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_commit_attendance() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = public.current_tenant_id() and tu.active
       and tu.role in ('admin','owner','manager')
       and tu.user_id = coalesce(
             nullif(current_setting('app.user_id', true), ''),
             nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid);
$$;


--
-- Name: can_edit_engagement_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_edit_engagement_profile() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = public.current_tenant_id() and tu.active
       and tu.role in ('admin','owner','manager','ops','coordinator')
       and tu.user_id = coalesce(
             nullif(current_setting('app.user_id', true), ''),
             nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid);
$$;


--
-- Name: can_manage_library(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_library() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = public.current_tenant_id() and tu.active
       and tu.role in ('admin','owner','manager','ops')
       and tu.user_id = coalesce(
             nullif(current_setting('app.user_id', true), ''),
             nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid);
$$;


--
-- Name: can_manage_staffing(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_staffing() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = public.current_tenant_id()
       and tu.active
       and tu.role in ('admin','owner','manager','ops')
       and tu.user_id = coalesce(
             nullif(current_setting('app.user_id', true), ''),
             nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid
  );
$$;


--
-- Name: can_manage_venues(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_venues() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = public.current_tenant_id() and tu.active
       and tu.role in ('admin','owner','manager','ops')
       and tu.user_id = coalesce(
             nullif(current_setting('app.user_id', true), ''),
             nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid);
$$;


--
-- Name: can_open_occurrence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_open_occurrence() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = public.current_tenant_id() and tu.active
       and tu.role in ('admin','owner','manager','ops','coordinator')
       and tu.user_id = coalesce(
             nullif(current_setting('app.user_id', true), ''),
             nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid);
$$;


--
-- Name: can_set_schedule(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_set_schedule() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = public.current_tenant_id() and tu.active
       and tu.role in ('admin','owner','manager','ops','coordinator')
       and tu.user_id = coalesce(
             nullif(current_setting('app.user_id', true), ''),
             nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid);
$$;


--
-- Name: cancel_occurrence(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_occurrence(p_occurrence uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_book uuid; v_id uuid;
begin
  if not public.can_open_occurrence() then
    raise exception 'PROMISE_NOT_AUTHORIZED: occurrence';
  end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  select booking_id into v_book from public.engagement_occurrence
   where id = p_occurrence and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.bookings where id = v_book and tenant_id = v_tenant for update;
  if exists (select 1 from public.event where occurrence_ref = p_occurrence) then
    raise exception 'OCCURRENCE_RELEASED: cannot cancel an occurrence that has released an event';
  end if;
  if not public.occurrence_is_active(p_occurrence, now()) then
    raise exception 'PROMISE_UNCHANGED';
  end if;
  insert into public.occurrence_status
      (tenant_id, occurrence_id, status, reason, recorded_by)
    values (v_tenant, p_occurrence, 'cancelled', trim(p_reason), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('status_id', v_id, 'cancelled', true);
end $$;


--
-- Name: canonical_operational_window(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.canonical_operational_window(p_at timestamp with time zone DEFAULT now()) RETURNS timestamp with time zone
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_tz     text := public.tenant_operational_timezone(v_tenant);
  v_hour   int  := public.tenant_operational_day_start_hour(v_tenant);
  d        date := public.operational_day_of(p_at, v_tz, v_hour);
  guard    int  := 0;
begin
  if public.is_blackout_day(d) then
    -- inside a blackout: fall back to the last operating day
    while public.is_blackout_day(d) and guard < 14 loop
      d := d - 1; guard := guard + 1;
    end loop;
  elsif public.is_blackout_day(d - 1) then
    -- preceded by a blackout: reach back across it to the last operating day
    d := d - 1;
    while public.is_blackout_day(d) and guard < 14 loop
      d := d - 1; guard := guard + 1;
    end loop;
  end if;
  return public.operational_day_start(d, v_tz, v_hour);
end $$;


--
-- Name: claim_responsibility(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_responsibility(p_responsibility uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
end $$;


--
-- Name: clear_schedule_milestone(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_schedule_milestone(p_occurrence uuid, p_milestone_key text, p_label text DEFAULT NULL::text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_book uuid; v_cur record; v_id uuid;
begin
  if not public.can_set_schedule() then raise exception 'PROMISE_NOT_AUTHORIZED: schedule'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  select booking_id into v_book from public.engagement_occurrence
   where id = p_occurrence and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.bookings where id = v_book and tenant_id = v_tenant for update;

  select * into v_cur from public.occurrence_schedule_milestone m
   where m.occurrence_id = p_occurrence and m.tenant_id = v_tenant
     and m.milestone_key = p_milestone_key
     and coalesce(m.label,'') = coalesce(nullif(trim(p_label),''),'')
     and not exists (select 1 from public.occurrence_schedule_milestone s
                      where s.replaces_id = m.id and s.tenant_id = v_tenant)
   order by m.seq desc limit 1;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_cur.cleared then raise exception 'PROMISE_UNCHANGED'; end if;

  insert into public.occurrence_schedule_milestone
      (tenant_id, occurrence_id, milestone_key, label, cleared,
       replaces_id, reason, recorded_by)
    values (v_tenant, p_occurrence, p_milestone_key, nullif(trim(p_label),''), true,
            v_cur.id, trim(p_reason), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('milestone_id', v_id, 'cleared', true);
end $$;


--
-- Name: close_event(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_event(p_event uuid, p_actor text, p_closeout_override text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_bd_pending int; v_exc int;
begin
  perform 1 from public.event where id=p_event and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;

  if exists (select 1 from public.execution_evidence
              where event_ref=p_event and tenant_id=v_tenant and kind='event_closed') then
    raise exception 'CLOSE_ALREADY_CLOSED';
  end if;
  if not exists (select 1 from public.execution_evidence
                  where event_ref=p_event and tenant_id=v_tenant and kind='service_start') then
    raise exception 'CLOSE_NOT_IN_SERVICE';
  end if;

  -- post-service breakdown must be resolved
  select count(*) into v_bd_pending
    from public.obligation o
   where o.event_ref=p_event and o.tenant_id=v_tenant and o.kind='venue_breakdown'
     and public.obligation_state(o.id) not in ('complete','invalidated');
  if v_bd_pending > 0 then raise exception 'CLOSE_BREAKDOWN_PENDING: % breakdown obligation(s) unresolved', v_bd_pending; end if;

  -- no open exception anywhere on the event
  select count(*) into v_exc
    from public.obligation o
   where o.event_ref=p_event and o.tenant_id=v_tenant and public.obligation_state(o.id)='exception';
  if v_exc > 0 then raise exception 'CLOSE_EXCEPTION_OPEN: % unresolved exception(s)', v_exc; end if;

  -- explicit closeout seam (return/inspection/financial not modeled until v285+)
  if p_closeout_override is null then
    raise exception 'CLOSE_CLOSEOUT_UNRESOLVED: return/inspection/financial closeout not modeled until v285+; authorized override required';
  end if;

  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, p_event, 'event_closed', p_actor,
            jsonb_build_object('closeout_override', p_closeout_override,
              'seam','return/inspection/financial closeout enforced from v285+'));
  return jsonb_build_object('event_id', p_event, 'stage', public.event_stage(p_event));
end $$;


--
-- Name: commit_attendance(uuid, integer, text, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.commit_attendance(p_occurrence uuid, p_head_count integer, p_basis text, p_effective_moment timestamp with time zone DEFAULT NULL::timestamp with time zone, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_book uuid; v_cur record; v_id uuid;
        v_eff timestamptz := coalesce(p_effective_moment, now());
begin
  if not public.can_commit_attendance() then
    raise exception 'PROMISE_NOT_AUTHORIZED: attendance is a billable commitment';
  end if;
  select booking_id into v_book from public.engagement_occurrence
   where id = p_occurrence and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.bookings where id = v_book and tenant_id = v_tenant for update;
  if p_head_count is null or p_head_count < 0 then raise exception 'ATTENDANCE_INVALID_COUNT'; end if;
  if p_basis not in ('estimated','contracted','guaranteed','final') then
    raise exception 'ATTENDANCE_INVALID_BASIS: %', p_basis;
  end if;

  select * into v_cur from public.promise_current_attendance(p_occurrence, greatest(v_eff, now()));
  if found then
    if v_cur.head_count = p_head_count and v_cur.basis = p_basis then
      raise exception 'PROMISE_UNCHANGED';
    end if;
    if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  end if;

  insert into public.attendance_commitment
      (tenant_id, occurrence_id, head_count, basis, effective_moment,
       replaces_id, reason, recorded_by)
    values (v_tenant, p_occurrence, p_head_count, p_basis, v_eff, null,
            nullif(trim(p_reason),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('attendance_id', v_id, 'basis', p_basis, 'effective_moment', v_eff);
end $$;


--
-- Name: complete_responsibility(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_responsibility(p_responsibility uuid, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
end $$;


--
-- Name: component_operational_basis(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.component_operational_basis(p_event_component uuid, p_context jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare v_tenant uuid := public.current_tenant_id(); ec record; rv record; ctx jsonb; o record;
  reqs jsonb := '[]'::jsonb; ov_lineage jsonb := '[]'::jsonb; q record; entry jsonb;
  sup record; rep record; unresolved jsonb := '[]'::jsonb;
begin
  select * into ec from public.event_components where id = p_event_component and tenant_id = v_tenant;
  if not found then return null; end if;
  if ec.profile_revision_id is null then return jsonb_build_object('pinned', false); end if;
  select * into rv from public.component_profile_revision where id = ec.profile_revision_id and tenant_id = v_tenant;

  -- context = supplied context ⊕ parameter overrides (latest per param wins)
  ctx := coalesce(p_context, '{}'::jsonb);
  for o in
    select distinct on (param_name) param_name, param_value
      from public.component_profile_override
     where event_component_id = p_event_component and tenant_id = v_tenant and kind='parameter'
     order by param_name, seq desc
  loop
    ctx := ctx || jsonb_build_object(o.param_name,
             case when o.param_value ~ '^-?[0-9]+(\.[0-9]+)?$' then to_jsonb(o.param_value::numeric) else to_jsonb(o.param_value) end);
  end loop;

  -- library declarations with suppress/replace applied (latest per target)
  for q in select * from public.profile_requirement
            where revision_id = ec.profile_revision_id and tenant_id = v_tenant
            order by family, position loop
    select * into sup from public.component_profile_override
      where event_component_id=p_event_component and tenant_id=v_tenant
        and kind in ('suppress','replace') and target_requirement_id=q.id
      order by seq desc limit 1;
    entry := jsonb_build_object(
      'requirement_id', q.id, 'family', q.family, 'kind', q.kind, 'label', q.label,
      'capability', q.capability, 'provision_source', q.provision_source,
      'basis', q.basis, 'rate', q.rate, 'band_size', q.band_size,
      'min_qty', q.min_qty, 'max_qty', q.max_qty, 'rounding', q.rounding, 'unit', q.unit,
      'aggregation', q.aggregation, 'temporal', q.temporal,
      'condition_param', q.condition_param, 'condition_value', q.condition_value);
    if found and sup.kind='suppress' then
      entry := entry || jsonb_build_object('status','suppressed','override_id',sup.id,'reason',sup.reason,'actor',sup.actor);
    elsif found and sup.kind='replace' then
      entry := entry || jsonb_build_object('status','replaced','override_id',sup.id,'actor',sup.actor,
        'replacement', sup.requirement || jsonb_build_object(
          'resolution', case
            when (sup.requirement->>'condition_param') is not null
                 and ctx->>(sup.requirement->>'condition_param') is distinct from (sup.requirement->>'condition_value')
              then jsonb_build_object('status','inactive')
            else public.resolve_quantity(sup.requirement->>'basis',(sup.requirement->>'rate')::numeric,
                   (sup.requirement->>'band_size')::int,(sup.requirement->>'min_qty')::numeric,
                   (sup.requirement->>'max_qty')::numeric,coalesce(sup.requirement->>'rounding','ceil'),ctx) end));
    else
      entry := entry || jsonb_build_object('status','active',
        'resolution', case
          when q.condition_param is not null and ctx->>q.condition_param is distinct from q.condition_value
            then jsonb_build_object('status','inactive','condition',q.condition_param||'='||q.condition_value)
          else public.resolve_quantity(q.basis,q.rate,q.band_size,q.min_qty,q.max_qty,q.rounding,ctx) end);
    end if;
    reqs := reqs || entry;
  end loop;

  -- engagement-specific additions (each its own declaration)
  for o in select * from public.component_profile_override
            where event_component_id=p_event_component and tenant_id=v_tenant and kind='add'
            order by seq loop
    reqs := reqs || (o.requirement || jsonb_build_object('status','added','override_id',o.id,'actor',o.actor,
      'resolution', case
        when (o.requirement->>'condition_param') is not null
             and ctx->>(o.requirement->>'condition_param') is distinct from (o.requirement->>'condition_value')
          then jsonb_build_object('status','inactive')
        else public.resolve_quantity(o.requirement->>'basis',(o.requirement->>'rate')::numeric,
               (o.requirement->>'band_size')::int,(o.requirement->>'min_qty')::numeric,
               (o.requirement->>'max_qty')::numeric,coalesce(o.requirement->>'rounding','ceil'),ctx) end));
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'target',target_requirement_id,
           'param',param_name,'value',param_value,'reason',reason,'actor',actor,'at',created_at) order by seq),'[]'::jsonb)
    into ov_lineage from public.component_profile_override
    where event_component_id=p_event_component and tenant_id=v_tenant;
  select coalesce(jsonb_agg(distinct e->'resolution'->>'missing'),'[]'::jsonb) into unresolved
    from jsonb_array_elements(reqs) e where e->'resolution'->>'status'='unresolved';

  return jsonb_build_object('pinned', true,
    'library_component_id', ec.library_component_id,
    'profile_revision_id', ec.profile_revision_id,
    'revision_no', rv.revision_no,
    'context', ctx, 'requirements', reqs, 'overrides', ov_lineage, 'unresolved', unresolved);
end $_$;


--
-- Name: compose_into_draft(uuid, uuid, jsonb, uuid, jsonb, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compose_into_draft(p_source_revision uuid, p_dest_revision uuid, p_content jsonb, p_actor uuid DEFAULT NULL::uuid, p_selected jsonb DEFAULT '{}'::jsonb, p_collisions jsonb DEFAULT '{}'::jsonb, p_omissions jsonb DEFAULT '[]'::jsonb, p_transforms jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_src     public.blueprint_revisions%rowtype;
  v_src_id  public.blueprint_identities%rowtype;
  v_dst     public.blueprint_revisions%rowtype;
  v_dst_id  public.blueprint_identities%rowtype;
  v_fp      text;
  v_bad     text[];
  v_comp    uuid;
begin
  -- ═══ 1 · lock + validate the EXACT source (FOR SHARE) ═══
  select r.* into v_src from public.blueprint_revisions r
    where r.id = p_source_revision for share;
  if not found then raise exception 'COMPOSE: source revision not found'; end if;
  select i.* into v_src_id from public.blueprint_identities i
    where i.id = v_src.identity_id for share;
  if v_src_id.tenant_id is distinct from v_tenant then
    raise exception 'COMPOSE: source revision not found';   -- foreign tenant: invisible
  end if;
  -- prefer published sources; a draft source is admitted but its EXACT state
  -- is locked and fingerprinted under this same transaction (no mutation race)
  v_fp := md5(v_src.content::text);

  -- ═══ 2 · lock + validate the DESTINATION DRAFT (FOR UPDATE) ═══
  select r.* into v_dst from public.blueprint_revisions r
    where r.id = p_dest_revision for update;
  if not found then raise exception 'COMPOSE: destination revision not found'; end if;
  select i.* into v_dst_id from public.blueprint_identities i
    where i.id = v_dst.identity_id for share;
  if v_dst_id.tenant_id is distinct from v_tenant then
    raise exception 'COMPOSE: destination revision not found';
  end if;
  if v_dst.state <> 'draft' then
    raise exception 'COMPOSE_DEST_NOT_DRAFT: only a mutable draft receives copied material';
  end if;

  -- §5 belt: barred material cannot enter authored content, even here
  v_bad := public.blueprint_barred_keys(coalesce(p_content, '{}'::jsonb));
  if array_length(v_bad, 1) is not null then
    raise exception 'COMPOSE_BARRED_CONTENT: %', array_to_json(v_bad)::text;
  end if;

  -- ═══ 3 · write the candidate content to the draft ═══
  -- (the immutability guard permits this precisely because state = 'draft')
  update public.blueprint_revisions set content = p_content where id = p_dest_revision;

  -- ═══ 4 · append copy provenance LAST (outside content, citation-only) ═══
  insert into public.blueprint_compositions
      (tenant_id, source_identity_id, source_revision_id, source_fingerprint,
       dest_identity_id, dest_revision_id, actor,
       selected_regions, collision_choices, omissions, transformations)
    values (v_tenant, v_src_id.id, v_src.id, v_fp,
            v_dst_id.id, v_dst.id, p_actor,
            coalesce(p_selected,'{}'::jsonb), coalesce(p_collisions,'{}'::jsonb),
            coalesce(p_omissions,'[]'::jsonb), coalesce(p_transforms,'[]'::jsonb))
    returning id into v_comp;

  return jsonb_build_object(
    'composition_id', v_comp, 'source_fingerprint', v_fp,
    'dest_revision_id', v_dst.id);
end $$;


--
-- Name: correct_attendance(uuid, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.correct_attendance(p_attendance uuid, p_head_count integer, p_basis text, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_prior record; v_book uuid; v_id uuid;
begin
  if not public.can_commit_attendance() then
    raise exception 'PROMISE_NOT_AUTHORIZED: attendance is a billable commitment';
  end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  select * into v_prior from public.attendance_commitment
   where id = p_attendance and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  select booking_id into v_book from public.engagement_occurrence where id = v_prior.occurrence_id;
  perform 1 from public.bookings where id = v_book and tenant_id = v_tenant for update;
  if exists (select 1 from public.attendance_commitment
              where replaces_id = p_attendance and tenant_id = v_tenant) then
    raise exception 'PROMISE_ALREADY_SUPERSEDED';
  end if;
  if p_basis not in ('estimated','contracted','guaranteed','final') then
    raise exception 'ATTENDANCE_INVALID_BASIS: %', p_basis;
  end if;
  if v_prior.head_count = p_head_count and v_prior.basis = p_basis then
    raise exception 'PROMISE_UNCHANGED';
  end if;

  insert into public.attendance_commitment
      (tenant_id, occurrence_id, head_count, basis, effective_moment,
       replaces_id, reason, recorded_by)
    values (v_tenant, v_prior.occurrence_id, p_head_count, p_basis,
            v_prior.effective_moment, p_attendance, trim(p_reason), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('attendance_id', v_id, 'corrected', p_attendance);
end $$;


--
-- Name: correct_citation(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.correct_citation(p_booking uuid, p_relationship uuid, p_actor text, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_prev   uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'CEREMONY_REASON_REQUIRED';
  end if;
  select b.relationship_id into v_prev from public.bookings b
    where b.id = p_booking and b.tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_prev is null then raise exception 'CEREMONY_NOTHING_TO_CORRECT'; end if;
  if v_prev = p_relationship then raise exception 'CEREMONY_CORRECTION_CHANGES_NOTHING'; end if;
  perform 1 from public.relationships r
    where r.id = p_relationship and r.tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_RELATIONSHIP_NOT_FOUND'; end if;

  update public.bookings set relationship_id = p_relationship where id = p_booking;
  -- The earlier adoption/establishment entry is NOT deleted, NOT amended:
  -- the history honestly reads "attached to A; corrected to B because…".
  insert into public.engagement_ledger
      (tenant_id, booking_id, ceremony, actor, relationship_ref, prev_relationship_ref, reason)
    values (v_tenant, p_booking, 'citation_corrected', p_actor,
            p_relationship, v_prev, btrim(p_reason));
  return jsonb_build_object('outcome', 'corrected');
end $$;


--
-- Name: correct_staffing_assignment(uuid, uuid, timestamp with time zone, timestamp with time zone, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.correct_staffing_assignment(p_assignment uuid, p_new_staff uuid, p_window_start timestamp with time zone, p_window_end timestamp with time zone, p_actor text, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_req uuid; v_event uuid; v_role text; v_new uuid;
begin
  if not public.can_manage_staffing() then raise exception 'STAFFING_NOT_AUTHORIZED'; end if;
  select requirement_ref, event_ref, role into v_req, v_event, v_role from public.staffing_assignment
    where id=p_assignment and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.staffing_requirement where id=v_req and tenant_id=v_tenant for update;   -- lock
  if exists (select 1 from public.staffing_release where assignment_ref=p_assignment)
    then raise exception 'STAFFING_ALREADY_RELEASED'; end if;
  if exists (select 1 from public.execution_evidence where event_ref=v_event and tenant_id=v_tenant and kind='event_closed')
    then raise exception 'STAFFING_EVENT_CLOSED'; end if;
  if not exists (select 1 from public.staff where id=p_new_staff and tenant_id=v_tenant and active)
    then raise exception 'STAFFING_STAFF_INVALID'; end if;
  if p_window_end is null or p_window_start is null or p_window_end <= p_window_start
    then raise exception 'STAFFING_WINDOW_INVALID'; end if;

  insert into public.staffing_release (tenant_id,assignment_ref,actor,reason)
    values (v_tenant,p_assignment,p_actor,coalesce('corrected: '||p_reason,'corrected'));
  insert into public.staffing_assignment
      (tenant_id,event_ref,requirement_ref,staff_ref,role,window_start,window_end,assigned_by)
    values (v_tenant,v_event,v_req,p_new_staff,v_role,p_window_start,p_window_end,p_actor)
    returning id into v_new;
  return jsonb_build_object('released', p_assignment, 'assignment_id', v_new, 'coverage', public.requirement_coverage(v_req));
end $$;


--
-- Name: create_library_component(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_library_component(p_name text, p_kind text DEFAULT 'general'::text, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid; v_dupes jsonb;
begin
  if not public.can_manage_library() then raise exception 'LIBRARY_NOT_AUTHORIZED'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'LIBRARY_NAME_REQUIRED'; end if;
  v_dupes := public.library_duplicate_candidates(p_name);   -- advisory, never blocks
  insert into public.library_component (tenant_id, name, kind, notes, created_by)
    values (v_tenant, trim(p_name), coalesce(p_kind,'general'), p_notes, public.action_actor())
    returning id into v_id;
  return jsonb_build_object('component_id', v_id, 'possible_duplicates', v_dupes);
end $$;


--
-- Name: create_venue(text, text, text, numeric, numeric, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_venue(p_name text, p_venue_type text, p_address text DEFAULT NULL::text, p_geo_lat numeric DEFAULT NULL::numeric, p_geo_lng numeric DEFAULT NULL::numeric, p_contacts jsonb DEFAULT '[]'::jsonb, p_management text DEFAULT NULL::text, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid; v_dupes jsonb;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'VENUE_NAME_REQUIRED'; end if;
  v_dupes := public.venue_duplicate_candidates(p_name, p_address);   -- advisory, never blocks
  insert into public.venue (tenant_id, name, venue_type, address, geo_lat, geo_lng, contacts, management, notes, created_by)
    values (v_tenant, trim(p_name), p_venue_type, p_address, p_geo_lat, p_geo_lng,
            coalesce(p_contacts,'[]'::jsonb), p_management, p_notes, public.action_actor())
    returning id into v_id;
  return jsonb_build_object('venue_id', v_id, 'possible_duplicates', v_dupes);
end $$;


--
-- Name: current_observation(uuid, uuid, text, timestamp with time zone, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_observation(p_venue uuid, p_scope_space uuid, p_attribute text, p_context timestamp with time zone DEFAULT now(), p_conditions text[] DEFAULT NULL::text[]) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select o.id
  from public.venue_observation o
  where o.tenant_id = public.current_tenant_id()
    and o.venue_id in (select public.venue_family(public.resolve_venue(p_venue)))
    and o.attribute_key = p_attribute
    and (o.scope_space_id is not distinct from p_scope_space)
    and not exists (select 1 from public.venue_observation_supersession s where s.observation_id = o.id)
    and (o.effective_at is null or o.effective_at <= p_context)
    and (o.expires_at   is null or o.expires_at   >  p_context)
    and (o.condition_key is null or (p_conditions is not null and o.condition_key = any(p_conditions)))
  order by public.source_class_rank(o.source_class) asc, o.observed_at desc, o.created_at desc
  limit 1;
$$;


--
-- Name: current_tenant_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select tu.tenant_id from public.tenant_users tu
  where tu.user_id = auth.uid() and tu.active = true limit 1
$$;


--
-- Name: current_venue_binding(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_venue_binding(p_booking uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); c record; v_res uuid; v_res_name text; v_res_addr text; n int;
begin
  perform 1 from public.bookings where id=p_booking and tenant_id=v_tenant;
  if not found then return null; end if;                       -- non-disclosure
  select * into c from public.engagement_venue_binding
    where booking_id=p_booking and tenant_id=v_tenant
    order by seq desc limit 1;
  if not found then return null; end if;                       -- lawfully unbound
  v_res := public.resolve_venue(c.venue_id);
  select name, address into v_res_name, v_res_addr from public.venue where id=v_res and tenant_id=v_tenant;
  select count(*) into n from public.engagement_venue_binding where booking_id=p_booking and tenant_id=v_tenant;
  return jsonb_build_object(
    'binding_id', c.id,
    'bound_venue_id', c.venue_id,
    'bound_name_snapshot', c.venue_name_snapshot,
    'bound_address_snapshot', c.venue_address_snapshot,
    'resolved_venue_id', v_res,
    'resolved_name', v_res_name,
    'resolved_address', v_res_addr,
    'redirected', (v_res is distinct from c.venue_id),
    'bound_by', c.bound_by, 'bound_at', c.created_at, 'reason', c.reason,
    'history_count', n);
end $$;


--
-- Name: day_sheet(date, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.day_sheet(p_day date, p_now timestamp with time zone DEFAULT now()) RETURNS TABLE(responsibility uuid, department text, required_outcome text, owner text, state text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select o.id, o.department, o.required_outcome,
         public.responsibility_current_owner(o.id),
         public.responsibility_state(o.id, p_now)
    from public.obligation o
   where o.tenant_id = public.current_tenant_id()
     and (
       (o.timing ? 'due'        and (o.timing->>'due')::timestamptz::date  = p_day) or
       (o.timing ? 'window_end' and (o.timing->>'window_end')::timestamptz::date = p_day)
     )
   order by o.department, o.natural_key;
$$;


--
-- Name: declare_walkthrough_coverage(uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.declare_walkthrough_coverage(p_walkthrough uuid, p_status text, p_space uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_venue uuid; v_id uuid;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  select venue_id into v_venue from public.venue_walkthrough where id=p_walkthrough and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if p_space is not null and not exists
     (select 1 from public.venue_space s where s.id=p_space and s.venue_id=v_venue and s.tenant_id=v_tenant)
    then raise exception 'OBSERVATION_INVALID_SCOPE'; end if;
  insert into public.walkthrough_coverage (tenant_id, walkthrough_id, space_id, status, note)
    values (v_tenant, p_walkthrough, p_space, p_status, p_note) returning id into v_id;
  return jsonb_build_object('coverage_id', v_id);
end $$;


--
-- Name: decline_engagement(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decline_engagement(p_booking uuid, p_actor text, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_state  text;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'CEREMONY_REASON_REQUIRED';
  end if;
  select b.spine_state into v_state from public.bookings b
    where b.id = p_booking and b.tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  -- Legacy rows (NULL) have no ceremonial state to decline from; and past
  -- Proposing is Cancellation's territory (PL-10), which does not exist.
  if v_state is null or v_state not in ('inquiry','proposing') then
    raise exception 'CEREMONY_BAD_SOURCE_STATE';
  end if;

  update public.bookings set spine_state = 'declined' where id = p_booking;
  insert into public.engagement_ledger (tenant_id, booking_id, ceremony, actor, from_state, to_state, reason)
    values (v_tenant, p_booking, 'declined', p_actor, v_state, 'declined', btrim(p_reason));
  return jsonb_build_object('outcome', 'transitioned', 'to', 'declined');
end $$;


--
-- Name: department_workspace(text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.department_workspace(p_department text, p_now timestamp with time zone DEFAULT now()) RETURNS TABLE(responsibility uuid, event_ref uuid, kind text, required_outcome text, resource_role text, owner text, state text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select o.id, o.event_ref, o.kind, o.required_outcome, o.resource_role,
         public.responsibility_current_owner(o.id),
         public.responsibility_state(o.id, p_now)
    from public.obligation o
   where o.tenant_id = public.current_tenant_id()
     and o.department = p_department
   order by o.created_at, o.natural_key;
$$;


--
-- Name: derive_from_attestation_truth(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.derive_from_attestation_truth(p_event uuid) RETURNS TABLE(scope text, event_ref uuid, origin_kind text, origin_ref uuid, origin_revision uuid, kind text, department text, required_outcome text, resource_role text, timing jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select 'event', e.event_ref, 'attestation', e.id, null::uuid,
         coalesce(e.payload->'responsibility'->>'kind','attested'),
         e.payload->'responsibility'->>'department',
         e.payload->'responsibility'->>'outcome',
         e.payload->'responsibility'->>'resource_role',
         e.payload->'responsibility'->'timing'
    from public.execution_evidence e
   where e.event_ref = p_event
     and e.kind = 'sign_off'
     and e.tenant_id = public.current_tenant_id()
     and e.payload ? 'responsibility'
     and e.payload->'responsibility' ? 'department'
     and e.payload->'responsibility' ? 'outcome';
$$;


--
-- Name: derive_from_event_truth(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.derive_from_event_truth(p_event uuid) RETURNS TABLE(scope text, event_ref uuid, origin_kind text, origin_ref uuid, origin_revision uuid, kind text, department text, required_outcome text, resource_role text, timing jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select 'event', e.event_ref, 'release', e.id, null::uuid,
         'event_execute', 'venue',
         'Execute the released event', null::text, null::jsonb
    from public.execution_evidence e
   where e.event_ref = p_event
     and e.kind = 'released'
     and e.tenant_id = public.current_tenant_id();
$$;


--
-- Name: derive_from_knowledge_truth(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.derive_from_knowledge_truth(p_event uuid) RETURNS TABLE(scope text, event_ref uuid, origin_kind text, origin_ref uuid, origin_revision uuid, kind text, department text, required_outcome text, resource_role text, timing jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  r        record;
  req      jsonb;
begin
  for r in
    select ec.id as ec_id, ec.profile_revision_id, ec.title
      from public.event_components ec
      join public.event ev on ev.engagement_ref = ec.booking_id
     where ev.id = p_event and ec.tenant_id = v_tenant
       and ec.profile_revision_id is not null
  loop
    for req in
      select jsonb_array_elements(
        public.render_legacy_requirements(public.component_operational_basis(r.ec_id)))
    loop
      scope := 'event'; event_ref := p_event;
      origin_kind := 'knowledge'; origin_ref := r.ec_id;
      origin_revision := r.profile_revision_id;
      kind := req->>'kind';
      department := case req->>'kind'
                      when 'staff'     then 'staffing'
                      when 'equipment' then 'equipment'
                      when 'rental'    then 'equipment'
                      when 'supply'    then 'culinary'
                      else 'logistics' end;
      resource_role := coalesce(req->>'role', req->>'item');
      required_outcome := 'Provide ' || coalesce(req->>'quantity','') || ' ' ||
                          coalesce(req->>'role', req->>'item','requirement') ||
                          ' for ' || coalesce(r.title,'component');
      timing := null;
      return next;
    end loop;
  end loop;
end $$;


--
-- Name: derive_responsibilities(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.derive_responsibilities(p_event uuid, p_now timestamp with time zone DEFAULT now()) RETURNS TABLE(created integer, unchanged integer, superseded integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_created int := 0;
  v_same    int := 0;
  v_super   int := 0;
  r         record;
  v_nk      text;
  v_exists  uuid;
  v_desired text[] := array[]::text[];
begin
  if p_event is null then
    raise exception 'RESP_NO_TRUTH_ANCHOR: derivation requires a truth scope';
  end if;

  -- Single-writer discipline: one derivation per event at a time.
  perform pg_advisory_xact_lock(hashtext(v_tenant::text || ':' || p_event::text));

  for r in
    select * from public.derive_from_event_truth(p_event)
    union all
    select * from public.derive_from_knowledge_truth(p_event)
    union all
    select * from public.derive_from_attestation_truth(p_event)
  loop
    -- R-1 enforced before writing: refuse anchorless derivation by name.
    if r.origin_ref is null or r.department is null or r.required_outcome is null then
      raise exception 'RESP_NO_TRUTH_ANCHOR: derived row lacks anchor or outcome';
    end if;

    v_nk := public.responsibility_natural_key(
              r.scope, r.event_ref, r.origin_kind, r.origin_ref, r.origin_revision,
              r.kind, r.resource_role, r.required_outcome, r.timing);
    v_desired := array_append(v_desired, v_nk);

    select o.id into v_exists from public.obligation o
      where o.tenant_id = v_tenant and o.natural_key = v_nk;

    if v_exists is null then
      insert into public.obligation
        (tenant_id, event_ref, scope, origin_ref, origin_kind, origin_revision,
         kind, department, required_outcome, resource_role, timing, natural_key, anchors)
      values
        (v_tenant, r.event_ref, r.scope, r.origin_ref, r.origin_kind, r.origin_revision,
         r.kind, r.department, r.required_outcome, r.resource_role, r.timing, v_nk,
         jsonb_build_array(jsonb_build_object(
           'truth', r.origin_kind, 'ref', r.origin_ref, 'revision', r.origin_revision)))
      on conflict (tenant_id, natural_key) do nothing;
      if found then v_created := v_created + 1; else v_same := v_same + 1; end if;
    else
      v_same := v_same + 1;
    end if;
  end loop;

  -- L-3: previously derived, no longer implied ⇒ superseded by appended fact.
  for r in
    select o.id from public.obligation o
     where o.tenant_id = v_tenant
       and o.event_ref = p_event
       and o.origin_kind in ('release','knowledge','attestation')
       and not (o.natural_key = any(v_desired))
       and not exists (select 1 from public.execution_evidence e
                        where e.obligation_ref = o.id and e.kind = 'superseded')
  loop
    insert into public.execution_evidence
      (tenant_id, event_ref, obligation_ref, kind, actor, payload)
    values (v_tenant, p_event, r.id, 'superseded', 'derive_responsibilities',
            jsonb_build_object('reason','no longer implied by truth'));
    v_super := v_super + 1;
  end loop;

  created := v_created; unchanged := v_same; superseded := v_super;
  return next;
end $$;


--
-- Name: effective_staleness_policy(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.effective_staleness_policy(p_family text) RETURNS TABLE(max_age_days integer, severity text, verify_required boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(t.max_age_days, d.max_age_days),
         coalesce(t.severity_when_stale, d.severity),
         coalesce(t.verify_required, false)
  from public.staleness_defaults(p_family) d
  left join public.venue_staleness_policy t
    on t.tenant_id = public.current_tenant_id() and t.attribute_family = p_family $$;


--
-- Name: eligible_staff(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.eligible_staff(p_event uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id();
begin
  perform 1 from public.event where id=p_event and tenant_id=v_tenant;
  if not found then return null; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by sort_order, name), '[]'::jsonb)
            from public.staff where tenant_id=v_tenant and active);
end $$;


--
-- Name: embed_operational_basis(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.embed_operational_basis(p_version uuid, p_model jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare v_tenant uuid := public.current_tenant_id(); comps jsonb := '[]'::jsonb; c jsonb;
  ec record; basis jsonb; ctx jsonb;
begin
  ctx := case when p_model->>'guestCount' ~ '^[0-9]+$'
              then jsonb_build_object('guest_count',(p_model->>'guestCount')::numeric)
              else '{}'::jsonb end;
  for c in select * from jsonb_array_elements(coalesce(p_model->'components','[]'::jsonb)) loop
    select * into ec from public.event_components
      where tenant_id = v_tenant and id::text = c->>'componentId'
        and proposal_version_id = p_version and profile_revision_id is not null;
    if found then
      basis := public.component_operational_basis(ec.id, ctx);
      c := c || jsonb_build_object('operational_basis', basis,
                                   'requirements', public.render_legacy_requirements(basis));
    end if;
    comps := comps || c;
  end loop;
  return jsonb_set(p_model, '{components}', comps);
end $_$;


--
-- Name: engagement_occurrences(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engagement_occurrences(p_booking uuid, p_now timestamp with time zone DEFAULT now()) RETURNS TABLE(id uuid, ordinal integer, open_basis text, opened_at timestamp with time zone, active boolean, event_ref uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select o.id, o.ordinal, o.open_basis, o.opened_at,
         public.occurrence_is_active(o.id, p_now),
         (select e.id from public.event e where e.occurrence_ref = o.id)
    from public.engagement_occurrence o
   where o.booking_id = p_booking
     and o.tenant_id = public.current_tenant_id()
     and o.opened_at <= p_now
   order by o.ordinal;
$$;


--
-- Name: engagement_venue_knowledge(uuid, timestamp with time zone, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engagement_venue_knowledge(p_booking uuid, p_event_date timestamp with time zone DEFAULT now(), p_conditions text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare b jsonb; v jsonb;
begin
  b := public.current_venue_binding(p_booking);
  if b is null then
    perform 1 from public.bookings where id=p_booking and tenant_id=public.current_tenant_id();
    if not found then return null; end if;                    -- non-disclosure
    return jsonb_build_object('bound', false, 'verification', 'none', 'findings', '[]'::jsonb);
  end if;
  v := public.venue_verification_requirement((b->>'resolved_venue_id')::uuid, p_event_date, p_conditions);
  return jsonb_build_object('bound', true, 'binding', b, 'event_date', p_event_date) || coalesce(v, '{}'::jsonb);
end $$;


--
-- Name: evb_integrity_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.evb_integrity_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if not exists (select 1 from public.bookings b where b.id=new.booking_id and b.tenant_id=new.tenant_id)
    then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if not exists (select 1 from public.venue v where v.id=new.venue_id and v.tenant_id=new.tenant_id)
    then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if new.replaces_binding_id is not null and not exists
     (select 1 from public.engagement_venue_binding p
       where p.id=new.replaces_binding_id and p.tenant_id=new.tenant_id and p.booking_id=new.booking_id)
    then raise exception 'BINDING_INVALID_LINEAGE'; end if;
  return new;
end $$;


--
-- Name: event_available_actions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.event_available_actions(p_event uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); result jsonb;
begin
  perform 1 from public.event where id=p_event and tenant_id=v_tenant;
  if not found then return '[]'::jsonb; end if;
  select jsonb_build_object(
    'event', public.available_actions('event', p_event),
    'requirements', (select coalesce(jsonb_object_agg(r.id, public.available_actions('staffing_requirement', r.id)), '{}'::jsonb)
                       from public.staffing_requirement r where r.event_ref=p_event and r.tenant_id=v_tenant),
    'assignments', (select coalesce(jsonb_object_agg(a.id, public.available_actions('staffing_assignment', a.id)), '{}'::jsonb)
                       from public.staffing_assignment a where a.event_ref=p_event and a.tenant_id=v_tenant
                         and not exists (select 1 from public.staffing_release rel where rel.assignment_ref=a.id))
  ) into result;
  return result;
end $$;


--
-- Name: event_component_pin_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.event_component_pin_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if (new.library_component_id is null) <> (new.profile_revision_id is null)
    then raise exception 'PIN_INVALID: component and revision must be pinned together'; end if;
  if new.profile_revision_id is not null then
    if not exists (
      select 1 from public.component_profile_revision r
       where r.id = new.profile_revision_id
         and r.library_component_id = new.library_component_id
         and r.tenant_id = new.tenant_id)
      then raise exception 'PIN_INVALID: revision does not belong to the pinned library component'; end if;
  end if;
  return new;
end $$;


--
-- Name: event_readiness(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.event_readiness(p_event uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with st as (
    select o.department,
           public.obligation_state(o.id) as state,
           o.required_outcome,
           o.dependencies
      from public.obligation o
     where o.event_ref = p_event and o.tenant_id = public.current_tenant_id()
  )
  select jsonb_build_object(
    'by_department', coalesce((
      select jsonb_object_agg(department, counts) from (
        select department, jsonb_object_agg(state, n) as counts
          from (select department, state, count(*) n from st
                 where state is not null group by department, state) g
         group by department
      ) d
    ), '{}'::jsonb),
    'blocked', coalesce((select count(*) from st where state = 'blocked'), 0),
    'ready',   coalesce((select count(*) from st where state = 'ready'), 0),
    'active',  coalesce((select count(*) from st where state = 'active'), 0),
    'complete',coalesce((select count(*) from st where state = 'complete'), 0),
    'exception',coalesce((select count(*) from st where state = 'exception'), 0),
    'total',   coalesce((select count(*) from st where state is not null), 0)
  );
$$;


--
-- Name: event_staffing_ready(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.event_staffing_ready(p_event uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select not exists (
    select 1 from public.staffing_requirement req
     where req.event_ref=p_event and req.tenant_id=public.current_tenant_id()
       and not (public.requirement_coverage(req.id)->>'covered')::boolean
  );
$$;


--
-- Name: event_staffing_summary(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.event_staffing_summary(p_event uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); result jsonb;
begin
  perform 1 from public.event where id=p_event and tenant_id=v_tenant;
  if not found then return null; end if;

  with req as (
    select r.id, r.role, r.quantity, r.department, public.requirement_coverage(r.id) as cov
      from public.staffing_requirement r where r.event_ref=p_event and r.tenant_id=v_tenant
  )
  select jsonb_build_object(
    'total_requirements', (select count(*) from req),
    'covered',   (select count(*) from req where (cov->>'covered')::boolean),
    'partial',   (select count(*) from req where (cov->>'assigned')::int > 0 and not (cov->>'covered')::boolean),
    'uncovered', (select count(*) from req where (cov->>'assigned')::int = 0),
    'conflicts', (select coalesce(sum((cov->>'conflicts')::int),0) from req),
    'open_positions', (select coalesce(sum((cov->>'shortage')::int),0) from req),
    'readiness', case when (select count(*) from req)=0 then 'no_requirements'
                      when (select bool_and((cov->>'covered')::boolean) from req) then 'covered'
                      else 'incomplete' end,
    'requirements', (select coalesce(jsonb_agg(jsonb_build_object(
        'requirement_id', id, 'role', role, 'department', department, 'required', quantity,
        'assigned', (cov->>'assigned')::int, 'shortage', (cov->>'shortage')::int,
        'over', (cov->>'over')::int, 'conflicts', (cov->>'conflicts')::int,
        'covered', (cov->>'covered')::boolean,
        'assignees', (select coalesce(jsonb_agg(jsonb_build_object(
              'assignment_id', a.id, 'staff_ref', a.staff_ref,
              'staff_name', (select s.name from public.staff s where s.id=a.staff_ref),
              'window_start', a.window_start, 'window_end', a.window_end,
              'conflict', public.staff_overlap_count(a.staff_ref,a.window_start,a.window_end,a.id) > 0
            ) order by a.assigned_at), '[]'::jsonb)
          from public.staffing_assignment a
          where a.requirement_ref=req.id and a.tenant_id=v_tenant
            and not exists (select 1 from public.staffing_release r where r.assignment_ref=a.id))
      ) order by role), '[]'::jsonb) from req),
    'blockers', (select coalesce(jsonb_agg(jsonb_build_object(
        'what', role||' staffing', 'cause_ref', id, 'why', (cov->>'blocker'),
        'next_action', 'Assign staff to this role') order by role)
        filter (where (cov->>'blocker') is not null), '[]'::jsonb) from req)
  ) into result;
  return result;
end $$;


--
-- Name: event_stage(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.event_stage(p_event uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_pre_total int; v_pre_resolved int; v_pre_exc int;
begin
  perform 1 from public.event where id = p_event and tenant_id = v_tenant;
  if not found then return null; end if;
  if exists (select 1 from public.execution_evidence where event_ref=p_event and tenant_id=v_tenant and kind='event_closed') then return 'closed'; end if;
  if exists (select 1 from public.execution_evidence where event_ref=p_event and tenant_id=v_tenant and kind='service_start') then return 'in_service'; end if;
  select count(*), count(*) filter (where st in ('complete','invalidated')), count(*) filter (where st='exception')
    into v_pre_total, v_pre_resolved, v_pre_exc
    from (select public.obligation_state(o.id) st from public.obligation o
           where o.event_ref=p_event and o.tenant_id=v_tenant
             and o.kind in ('culinary_prepare','equipment_pull','staffing_assign','venue_setup')) q;
  if v_pre_total > 0 and v_pre_resolved = v_pre_total and v_pre_exc = 0
     and public.event_staffing_ready(p_event) then
    return 'ready';
  end if;
  if exists (select 1 from public.obligation o where o.event_ref=p_event and o.tenant_id=v_tenant
              and public.obligation_state(o.id) in ('active','complete'))
     or exists (select 1 from public.execution_evidence where event_ref=p_event and tenant_id=v_tenant
                 and kind in ('assignment','scan','inspection','completion')) then
    return 'in_prep';
  end if;
  return 'released';
end $$;


--
-- Name: event_stage_detail(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.event_stage_detail(p_event uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_stage  text := public.event_stage(p_event);
  v_blockers jsonb;
  v_facts   jsonb;
  v_why text; v_next text;
begin
  if v_stage is null then return null; end if;

  -- named blockers appropriate to the stage
  if v_stage in ('released','in_prep') then
    select coalesce(jsonb_agg(required_outcome order by kind), '[]'::jsonb) into v_blockers
      from public.obligation o
     where o.event_ref=p_event and o.tenant_id=v_tenant
       and o.kind in ('culinary_prepare','equipment_pull','staffing_assign','venue_setup')
       and public.obligation_state(o.id) not in ('complete','invalidated');
  elsif v_stage = 'in_service' then
    select coalesce(jsonb_agg(required_outcome order by kind), '[]'::jsonb) into v_blockers
      from public.obligation o
     where o.event_ref=p_event and o.tenant_id=v_tenant and o.kind='venue_breakdown'
       and public.obligation_state(o.id) not in ('complete','invalidated');
    v_blockers := v_blockers || jsonb_build_array(
      'unresolved: return/inspection/financial closeout not modeled until v285+ (authorized override required to close)');
  else
    v_blockers := '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'actor',actor,'moment',moment) order by moment), '[]'::jsonb)
    into v_facts
    from public.execution_evidence
   where event_ref=p_event and tenant_id=v_tenant
     and kind in ('released','service_start','event_closed');

  v_why := case v_stage
    when 'released'  then 'Materialized by Operational Release; preparation has not begun.'
    when 'in_prep'   then 'Preparation has begun; not all pre-service obligations are resolved.'
    when 'ready'     then 'Every pre-service obligation is resolved with no open exception; awaiting service start.'
    when 'in_service'then 'An authorized service-start fact has been recorded.'
    when 'closed'    then 'An authorized closeout has been recorded.'
  end;
  v_next := case v_stage
    when 'released'  then 'Begin preparation (assign or complete a pre-service obligation).'
    when 'in_prep'   then 'Resolve the remaining pre-service obligations.'
    when 'ready'     then 'Start service (start_service).'
    when 'in_service'then 'Complete breakdown, then close with authorized closeout (close_event).'
    when 'closed'    then '—'
  end;

  return jsonb_build_object(
    'event_id', p_event, 'stage', v_stage, 'why', v_why,
    'established_by', v_facts, 'blockers', v_blockers, 'next_action', v_next,
    'readiness', public.event_readiness(p_event));
end $$;


--
-- Name: event_workspace(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.event_workspace(p_event uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_ev record;
  v_stage text;
  v_bd_pending int;
  v_exc int;
  result jsonb;
begin
  select * into v_ev from public.event where id = p_event and tenant_id = v_tenant;
  if not found then return null; end if;          -- I-40: cross-tenant → not-found
  v_stage := public.event_stage(p_event);

  select count(*) into v_bd_pending from public.obligation o
    where o.event_ref=p_event and o.tenant_id=v_tenant and o.kind='venue_breakdown'
      and public.obligation_state(o.id) not in ('complete','invalidated');
  select count(*) into v_exc from public.obligation o
    where o.event_ref=p_event and o.tenant_id=v_tenant and public.obligation_state(o.id)='exception';

  with obl as (
    select o.id, o.kind, o.department, o.required_outcome, o.dependencies,
           public.obligation_state(o.id) as st,
           (o.required_outcome like 'unresolved:%') as debt,
           (o.kind in ('culinary_prepare','equipment_pull','staffing_assign','venue_setup')) as pre_service
      from public.obligation o
     where o.event_ref=p_event and o.tenant_id=v_tenant
  ),
  live as (select * from obl where st <> 'invalidated'),
  latest_ev as (
    select distinct on (obligation_ref) obligation_ref, kind, actor, moment
      from public.execution_evidence
     where event_ref=p_event and tenant_id=v_tenant and obligation_ref is not null
     order by obligation_ref, moment desc
  ),
  cats as (
    select department,
           count(*) as total,
           count(*) filter (where st in ('complete','invalidated')) as resolved,
           count(*) filter (where st='exception') as exceptions,
           coalesce(jsonb_agg(required_outcome) filter (where st not in ('complete','invalidated')), '[]'::jsonb) as blocking
      from live group by department
  )
  select jsonb_build_object(
    'header', jsonb_build_object(
      'event_id', v_ev.id,
      'engagement_ref', v_ev.engagement_ref,
      'origin_commitment_ref', v_ev.origin_commitment_ref,
      'released_at', v_ev.released_at,
      'released_by', v_ev.released_by,
      'stage', v_stage,
      'readiness', (select jsonb_build_object(
                      'resolved', coalesce(sum(resolved),0),
                      'total', coalesce(sum(total),0)) from cats),
      'blocker_count', (select count(*) from live
                          where (pre_service and st not in ('complete','invalidated'))),
      'exception_count', v_exc,
      'last_activity', (select max(moment) from public.execution_evidence
                          where event_ref=p_event and tenant_id=v_tenant),
      'can_manage_staffing', public.can_manage_staffing()
    ),
    'lifecycle', public.event_stage_detail(p_event),
    'staffing', public.event_staffing_summary(p_event),
    'actions', public.event_available_actions(p_event),
    'readiness_by_category', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'department', department, 'resolved', resolved, 'total', total,
        'exceptions', exceptions, 'blocking', blocking,
        'state', case when exceptions>0 then 'exception'
                      when total>0 and resolved=total then 'complete'
                      when resolved>0 then 'in_progress' else 'pending' end
      ) order by department), '[]'::jsonb) from cats),
    'workboard', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'kind', kind, 'department', department, 'title', required_outcome,
        'state', st, 'decision_debt', debt, 'exception', (st='exception'),
        'dependencies', dependencies,
        'latest_evidence', (select jsonb_build_object('kind',le.kind,'actor',le.actor,'moment',le.moment)
                              from latest_ev le where le.obligation_ref=live.id),
        'actions', case st when 'ready' then '["assign"]'::jsonb
                           when 'active' then '["complete"]'::jsonb else '[]'::jsonb end
      ) order by department, kind), '[]'::jsonb) from live),
    'blockers', (
      -- unresolved pre-service obligations + open exceptions + closeout seam
      select coalesce(jsonb_agg(b), '[]'::jsonb) from (
        select jsonb_build_object(
          'what', required_outcome, 'cause_ref', id,
          'why', case when st='exception' then 'open exception'
                      when debt then 'decision-debt (knowledge not yet modeled)'
                      when st='blocked' then 'blocked by an unmet dependency'
                      else 'obligation not yet resolved' end,
          'next_action', case when st='exception' then 'Resolve the exception'
                              when debt then 'Record an authorized resolution'
                              else 'Complete this obligation' end) as b
          from live
         where (pre_service and st not in ('complete','invalidated')) or st='exception'
        union all
        select jsonb_build_object(
          'what','Final closeout (return / inspection / financial)',
          'cause_ref', null,
          'why','closeout domains not modeled until v285+ (authorized override required)',
          'next_action','Close with an authorized closeout override')
          from (select 1) s where v_stage='in_service'
        union all
        select jsonb_build_object(
          'what', r.role||' staffing', 'cause_ref', r.id,
          'why', public.requirement_coverage(r.id)->>'blocker',
          'next_action', 'Assign staff to this role')
          from public.staffing_requirement r
         where r.event_ref=p_event and r.tenant_id=v_tenant
           and (public.requirement_coverage(r.id)->>'blocker') is not null
      ) z),
    'next_actions', jsonb_build_array(
      jsonb_build_object('action','start_service','label','Start service',
        'available', (v_stage='ready'),
        'reason', case when v_stage='ready' then null else 'Available once every pre-service obligation is resolved' end),
      jsonb_build_object('action','close_event','label','Close event',
        'available', (v_stage='in_service' and v_bd_pending=0 and v_exc=0),
        'reason', case when v_stage<>'in_service' then 'Available once service has started'
                       when v_bd_pending>0 then 'Breakdown must be completed first'
                       when v_exc>0 then 'Open exceptions must be resolved first'
                       else null end)
    ),
    'recent_activity', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'kind', kind, 'obligation_ref', obligation_ref, 'actor', actor,
        'moment', moment, 'note', payload, 'correction_of', prior_ref) order by moment desc), '[]'::jsonb)
      from (select * from public.execution_evidence
             where event_ref=p_event and tenant_id=v_tenant
             order by moment desc limit 12) r)
  ) into result;

  return result;
end $$;


--
-- Name: generate_obligations(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_obligations(p_event uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_acc     uuid;
  v_model   jsonb;
  v_comp    jsonb;
  v_req     jsonb;
  v_role    text;
  v_title   text;
  v_nk      text;
  v_setup_deps jsonb;
  v_setup_nk   text;
  v_comp_nks   text[];          -- predecessors for this component's setup
  v_present    text[] := '{}';  -- natural_keys entailed by the current config
  v_count      integer;
begin
  -- resolve the event and its originating acceptance under the tenant
  select origin_commitment_ref into v_acc
    from public.event where id = p_event and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;

  -- the FROZEN accepted model (immutable snapshot). Generation reads only this.
  select s.model into v_model
    from public.offer_acceptances a
    join public.offer_snapshots s on s.id = a.snapshot_id
   where a.id = v_acc and a.tenant_id = v_tenant;
  if v_model is null then raise exception 'GENERATE_NO_MODEL'; end if;

  -- helper: emit one obligation (insert-or-ignore by natural_key), record presence
  -- (implemented inline below via the local blocks)

  for v_comp in select * from jsonb_array_elements(coalesce(v_model->'components','[]'::jsonb))
  loop
    if coalesce((v_comp->>'station')::boolean, false) is not true then continue; end if;
    v_title := coalesce(v_comp->>'title', 'Station');
    v_comp_nks := '{}';

    -- ── culinary_prepare (decision-debt: recipe/yields not modeled in v275) ──
    v_role := v_comp->>'componentId';
    v_nk := encode(extensions.digest(p_event::text||v_acc::text||'culinary_prepare'||coalesce(v_role,''),'sha256'),'hex');
    insert into public.obligation
        (tenant_id,event_ref,origin_ref,origin_kind,kind,department,required_outcome,resource_role,dependencies,natural_key)
      values (v_tenant,p_event,v_acc,'selection','culinary_prepare','culinary',
              'unresolved: produce '||v_title||' menu component (recipe/yields not modeled until v286)',
              v_role,'[]'::jsonb,v_nk)
      on conflict (tenant_id,natural_key) do nothing;
    v_comp_nks := array_append(v_comp_nks, v_nk); v_present := array_append(v_present, v_nk);

    -- ── requirement-derived obligations (equipment / staffing) from the frozen model ──
    for v_req in select * from jsonb_array_elements(coalesce(v_comp->'requirements','[]'::jsonb))
    loop
      if (v_req->>'category') in ('equipment','rental','supply','vehicle') then
        v_role := coalesce(v_req->>'item', v_req->>'category');
        v_nk := encode(extensions.digest(p_event::text||v_acc::text||'equipment_pull'||coalesce(v_role,''),'sha256'),'hex');
        insert into public.obligation
            (tenant_id,event_ref,origin_ref,origin_kind,kind,department,required_outcome,resource_role,dependencies,natural_key)
          values (v_tenant,p_event,v_acc,'selection','equipment_pull','equipment',
                  'Pull '||v_role||' for '||v_title, v_role,'[]'::jsonb,v_nk)
          on conflict (tenant_id,natural_key) do nothing;
        v_comp_nks := array_append(v_comp_nks, v_nk); v_present := array_append(v_present, v_nk);
      elsif (v_req->>'category') = 'staff' then
        v_role := coalesce(v_req->>'role', 'attendant');
        v_nk := encode(extensions.digest(p_event::text||v_acc::text||'staffing_assign'||coalesce(v_role,''),'sha256'),'hex');
        insert into public.obligation
            (tenant_id,event_ref,origin_ref,origin_kind,kind,department,required_outcome,resource_role,dependencies,natural_key)
          values (v_tenant,p_event,v_acc,'selection','staffing_assign','staffing',
                  'Assign '||v_role||' to '||v_title, v_role,'[]'::jsonb,v_nk)
          on conflict (tenant_id,natural_key) do nothing;
        v_comp_nks := array_append(v_comp_nks, v_nk); v_present := array_append(v_present, v_nk);
      end if;
    end loop;

    -- decision-debt where a needed category was not enumerated in the frozen model
    if not exists (select 1 from jsonb_array_elements(coalesce(v_comp->'requirements','[]'::jsonb)) r
                   where (r->>'category') in ('equipment','rental','supply','vehicle')) then
      v_nk := encode(extensions.digest(p_event::text||v_acc::text||'equipment_pull'||'unresolved','sha256'),'hex');
      insert into public.obligation
          (tenant_id,event_ref,origin_ref,origin_kind,kind,department,required_outcome,resource_role,dependencies,natural_key)
        values (v_tenant,p_event,v_acc,'selection','equipment_pull','equipment',
                'unresolved: '||v_title||' equipment not enumerated (equipment master arrives v281)',
                'unresolved','[]'::jsonb,v_nk)
        on conflict (tenant_id,natural_key) do nothing;
      v_comp_nks := array_append(v_comp_nks, v_nk); v_present := array_append(v_present, v_nk);
    end if;
    if not exists (select 1 from jsonb_array_elements(coalesce(v_comp->'requirements','[]'::jsonb)) r
                   where (r->>'category') = 'staff') then
      v_nk := encode(extensions.digest(p_event::text||v_acc::text||'staffing_assign'||'unresolved','sha256'),'hex');
      insert into public.obligation
          (tenant_id,event_ref,origin_ref,origin_kind,kind,department,required_outcome,resource_role,dependencies,natural_key)
        values (v_tenant,p_event,v_acc,'selection','staffing_assign','staffing',
                'unresolved: '||v_title||' staffing not enumerated (scheduling arrives v279)',
                'unresolved','[]'::jsonb,v_nk)
        on conflict (tenant_id,natural_key) do nothing;
      v_comp_nks := array_append(v_comp_nks, v_nk); v_present := array_append(v_present, v_nk);
    end if;

    -- ── venue_setup: depends on prep + all pulls + all assigns (structural) ──
    v_setup_deps := to_jsonb(v_comp_nks);
    v_role := v_comp->>'componentId';
    v_setup_nk := encode(extensions.digest(p_event::text||v_acc::text||'venue_setup'||coalesce(v_role,''),'sha256'),'hex');
    insert into public.obligation
        (tenant_id,event_ref,origin_ref,origin_kind,kind,department,required_outcome,resource_role,dependencies,natural_key)
      values (v_tenant,p_event,v_acc,'selection','venue_setup','venue',
              'Set up '||v_title||' at venue', v_role, v_setup_deps, v_setup_nk)
      on conflict (tenant_id,natural_key) do nothing;
    v_present := array_append(v_present, v_setup_nk);

    -- ── venue_breakdown: depends on setup ──
    v_nk := encode(extensions.digest(p_event::text||v_acc::text||'venue_breakdown'||coalesce(v_role,''),'sha256'),'hex');
    insert into public.obligation
        (tenant_id,event_ref,origin_ref,origin_kind,kind,department,required_outcome,resource_role,dependencies,natural_key)
      values (v_tenant,p_event,v_acc,'selection','venue_breakdown','venue',
              'Break down '||v_title||' and return', v_role, jsonb_build_array(v_setup_nk), v_nk)
      on conflict (tenant_id,natural_key) do nothing;
    v_present := array_append(v_present, v_nk);
  end loop;

  -- ── additive regeneration (I-35/I-36): obligations no longer entailed by the
  --    current frozen config are INVALIDATED via a new evidence fact — never
  --    mutated or deleted. Completed evidence is untouched.
  insert into public.execution_evidence (tenant_id, event_ref, obligation_ref, kind, actor, payload)
    select v_tenant, p_event, o.id, 'invalidated', 'generator',
           jsonb_build_object('reason','no longer entailed by accepted configuration')
      from public.obligation o
     where o.tenant_id = v_tenant and o.event_ref = p_event
       and not (o.natural_key = any(v_present))
       and not exists (select 1 from public.execution_evidence e
                        where e.obligation_ref = o.id and e.kind = 'invalidated');

  select count(*) into v_count from public.obligation
    where tenant_id = v_tenant and event_ref = p_event
      and natural_key = any(v_present);
  return v_count;
end $$;


--
-- Name: generate_staffing_requirements(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_staffing_requirements(p_event uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_acc uuid; v_model jsonb; o record; v_role text; v_qty int; v_nk text; v_count int;
begin
  select origin_commitment_ref into v_acc from public.event where id=p_event and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  select s.model into v_model from public.offer_acceptances a join public.offer_snapshots s on s.id=a.snapshot_id
    where a.id=v_acc and a.tenant_id=v_tenant;

  for o in select id, resource_role, timing from public.obligation
             where event_ref=p_event and tenant_id=v_tenant and kind='staffing_assign'
  loop
    v_role := coalesce(o.resource_role, 'staff');
    -- quantity from the frozen model's matching staff requirement, else 1
    select coalesce(max((req->>'quantity')::int), 1) into v_qty
      from jsonb_array_elements(coalesce(v_model->'components','[]'::jsonb)) comp,
           jsonb_array_elements(coalesce(comp->'requirements','[]'::jsonb)) req
     where req->>'category'='staff' and coalesce(req->>'role','attendant')=v_role;
    v_qty := coalesce(v_qty, 1);
    v_nk := encode(extensions.digest(p_event::text||o.id::text||v_role,'sha256'),'hex');
    insert into public.staffing_requirement
        (tenant_id,event_ref,origin_obligation_ref,role,quantity,department,window_start,window_end,natural_key)
      values (v_tenant,p_event,o.id,v_role,v_qty,'staffing',
              nullif(o.timing->>'window_start','')::timestamptz, nullif(o.timing->>'window_end','')::timestamptz, v_nk)
      on conflict (tenant_id,natural_key) do nothing;
  end loop;

  select count(*) into v_count from public.staffing_requirement where event_ref=p_event and tenant_id=v_tenant;
  return v_count;
end $$;


--
-- Name: guard_sealed_content(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_sealed_content() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: guard_sealed_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_sealed_version() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if old.sealed_at is not null then
    if new.status is distinct from old.status
       or new.snapshot_id is distinct from old.snapshot_id
       or new.sealed_at is distinct from old.sealed_at
       or new.sent_at is distinct from old.sent_at then
      null;   -- permitted post-seal lifecycle/metadata writes
    end if;
    if new.theme_key is distinct from old.theme_key
       or new.theme_override is distinct from old.theme_override
       or new.photo_pins is distinct from old.photo_pins
       or new.customer_intro is distinct from old.customer_intro
       or new.customer_closing is distinct from old.customer_closing
       or new.price_visibility is distinct from old.price_visibility
       or new.valid_until is distinct from old.valid_until   -- v268: offered deadline frozen at seal
       or new.version is distinct from old.version
       or new.proposal_id is distinct from old.proposal_id then
      raise exception 'SEALED_VERSION_IMMUTABLE';
    end if;
  end if;
  return new;
end $$;


--
-- Name: guard_sealed_version_scoped(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_sealed_version_scoped() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: instantiate_blueprint(uuid, uuid, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.instantiate_blueprint(p_revision uuid, p_booking uuid, p_guest_count integer, p_actor uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_ident    public.blueprint_identities%rowtype;
  v_rev      public.blueprint_revisions%rowtype;
  v_content  jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_defrevs  jsonb := '{}'::jsonb;      -- definition_id -> current config revision id (or null)
  v_snapshot timestamptz;
  v_fp       text;
  v_proposal uuid;
  v_vnum     int;
  v_version  uuid;
  v_adults   uuid;
  v_ch       jsonb;  v_se jsonb;  v_en jsonb;
  v_secpos   int := 0;
  v_comppos  int;
  v_role     uuid;
  v_roles    text[] := '{}';
  v_def_id   uuid;
  v_defcfg   record;
  v_inst     jsonb;
  v_comp     uuid;
  v_cfgdata  jsonb;
  v_choices  jsonb;
  v_scalars  jsonb;
  v_kv       record;
  v_item     jsonb;
  v_intent   jsonb;
  v_fixed    jsonb := '[]'::jsonb;
  v_dress    jsonb;
  v_pins     jsonb;
  v_override jsonb;
  v_baseline jsonb;
  v_dresskey text;
  v_n        int;
begin
  -- ═══ GATHER — one coherent organizational snapshot ═══
  -- Statement 1: the revision + identity, locked (a concurrent publish of
  -- a superseding revision, or a retire, waits on these rows).
  select r.* into v_rev from public.blueprint_revisions r
    where r.id = p_revision for share;
  if not found then raise exception 'INSTANTIATE_BLUEPRINT: revision not found'; end if;
  select i.* into v_ident from public.blueprint_identities i
    where i.id = v_rev.identity_id for share;

  -- SECURITY DEFINER tenancy guard: the act crosses RLS, so isolation is
  -- enforced HERE, first — a foreign tenant's revision does not exist.
  if v_ident.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'INSTANTIATE_BLUEPRINT: revision not found';
  end if;
  if not exists (select 1 from public.bookings b
                  where b.id = p_booking and b.tenant_id = public.current_tenant_id()) then
    raise exception 'INSTANTIATE_BLUEPRINT: booking not found';
  end if;

  if v_rev.state <> 'published' then
    v_conflicts := v_conflicts || jsonb_build_object('kind','NOT_PUBLISHED','detail','only the published revision instantiates');
  end if;
  if v_ident.status <> 'active' then
    v_conflicts := v_conflicts || jsonb_build_object('kind','IDENTITY_RETIRED','detail','the retired shelf offers nothing for new use');
  end if;

  -- §10 — the seed parameter: required, typed, never defaulted.
  if p_guest_count is null or p_guest_count <= 0 then
    v_conflicts := v_conflicts || jsonb_build_object('kind','PARAMETER_REQUIRED','detail','guest_count must be a positive count — a guessed guest count is a lie');
  end if;

  v_content := v_rev.content;
  if v_content ? 'conditions' then
    v_conflicts := v_conflicts || jsonb_build_object('kind','CONDITIONS_RESERVED','detail','conditions arrive in BP-7');
  end if;

  -- Statement 2: EVERY referenced definition's current config revision,
  -- in one statement (one snapshot), rows locked FOR SHARE so a
  -- concurrent definition publish waits. Also validates existence.
  select coalesce(jsonb_object_agg(d.def_id, d.cfg_id), '{}'::jsonb) into v_defrevs
    from (
      select (e.entry->>'definitionId')::uuid as def_id,
             (select c.id from public.component_definition_config c
               where c.definition_id = (e.entry->>'definitionId')::uuid
                 and c.superseded_by is null and c.archived_at is null
               for share of c) as cfg_id
        from (
          select jsonb_array_elements(
                   jsonb_path_query_array(coalesce(v_content->'structure','[]'::jsonb),
                                          '$[*].sections[*].entries[*]')) as entry
        ) e
       where coalesce(e.entry->>'definitionId','') <> ''
       group by 1, 2
    ) d;

  v_snapshot := now();
  v_fp := md5(v_content::text);

  -- ═══ CHECK — every conflict named and collected; nothing built yet ═══
  for v_ch in select * from jsonb_array_elements(coalesce(v_content->'structure','[]'::jsonb)) loop
    for v_se in select * from jsonb_array_elements(coalesce(v_ch->'sections','[]'::jsonb)) loop
      -- section role: required to materialize, must be a real section type
      if coalesce(v_se->>'role','') = '' then
        v_conflicts := v_conflicts || jsonb_build_object('kind','SECTION_ROLE_REQUIRED',
          'at', coalesce(v_se->>'title','(untitled section)'),
          'detail','a section materializes under a semantic role (section type)');
      else
        select id into v_role from public.section_types where id::text = v_se->>'role' and active;
        if v_role is null then
          v_conflicts := v_conflicts || jsonb_build_object('kind','SECTION_ROLE_UNKNOWN',
            'at', coalesce(v_se->>'title','(untitled section)'), 'role', v_se->>'role',
            'detail','the semantic role is not an active section type');
        else
          v_roles := v_roles || (v_se->>'role');
        end if;
      end if;

      for v_en in select * from jsonb_array_elements(coalesce(v_se->'entries','[]'::jsonb)) loop
        if coalesce(v_en->>'definitionId','') = '' then
          v_conflicts := v_conflicts || jsonb_build_object('kind','DEFINITION_REQUIRED',
            'at', coalesce(v_en->>'title','(untitled entry)'),
            'detail','a component entry references a definition identity');
          continue;
        end if;
        v_def_id := (v_en->>'definitionId')::uuid;
        if not exists (select 1 from public.component_definitions where id = v_def_id) then
          v_conflicts := v_conflicts || jsonb_build_object('kind','DEFINITION_UNAVAILABLE',
            'at', coalesce(v_en->>'title','(untitled entry)'), 'definition', v_def_id::text,
            'detail','the referenced definition is not available');
          continue;
        end if;
        -- authored configuration must still apply to the CURRENT revision
        v_defcfg := null;
        if (v_defrevs->>(v_def_id::text)) is not null then
          select * into v_defcfg from public.component_definition_config
            where id = (v_defrevs->>(v_def_id::text))::uuid;
        end if;
        if (v_en->'configuration'->>'scheme') is not null then
          if v_defcfg.id is null
             or not (coalesce(v_defcfg.data->'schemes','{}'::jsonb) ? (v_en->'configuration'->>'scheme')) then
            v_conflicts := v_conflicts || jsonb_build_object('kind','CONFIG_SCHEME_GONE',
              'at', coalesce(v_en->>'title','(untitled entry)'),
              'scheme', v_en->'configuration'->>'scheme',
              'detail','the authored scheme no longer exists on the current definition');
          end if;
        end if;
        for v_kv in select key, value from jsonb_each(coalesce(v_en->'configuration'->'values','{}'::jsonb)) loop
          if v_defcfg.id is null then
            v_conflicts := v_conflicts || jsonb_build_object('kind','CONFIG_KEY_GONE',
              'at', coalesce(v_en->>'title','(untitled entry)'), 'key', v_kv.key,
              'detail','the current definition carries no configuration');
          elsif coalesce(v_defcfg.data->'dimensions','{}'::jsonb) ? v_kv.key then
            if not (coalesce(v_defcfg.data->'dimensions'->v_kv.key->'options','[]'::jsonb) @> to_jsonb(array[trim(both '"' from v_kv.value::text)])) then
              v_conflicts := v_conflicts || jsonb_build_object('kind','CONFIG_OPTION_GONE',
                'at', coalesce(v_en->>'title','(untitled entry)'), 'key', v_kv.key,
                'value', trim(both '"' from v_kv.value::text),
                'detail','the authored option no longer exists on the current definition');
            end if;
          elsif not (coalesce(v_defcfg.data->'instanceDefaults'->'scalars','{}'::jsonb) ? v_kv.key) then
            v_conflicts := v_conflicts || jsonb_build_object('kind','CONFIG_KEY_GONE',
              'at', coalesce(v_en->>'title','(untitled entry)'), 'key', v_kv.key,
              'detail','the authored key is neither a dimension nor a scalar on the current definition');
          end if;
        end loop;
        -- §11 — fixed-package must carry its policy (belt; BP-2 refuses too)
        v_intent := v_en->'pricingIntent';
        if v_intent is not null and v_intent->>'form' = 'fixed-package'
           and coalesce(trim(v_intent->>'policy'),'') = '' then
          v_conflicts := v_conflicts || jsonb_build_object('kind','FIXED_PRICE_POLICY_MISSING',
            'at', coalesce(v_en->>'title','(untitled entry)'),
            'detail','a fixed-package price travels only under a named policy');
        end if;
      end loop;
    end loop;
  end loop;

  -- v241 match law over OUR OWN sections: dress must match exactly one.
  v_dress := coalesce(v_content->'presentation'->'portable'->'sectionDress','{}'::jsonb);
  for v_dresskey in select jsonb_object_keys(v_dress) loop
    select count(*) into v_n from unnest(v_roles) r where r = v_dresskey;
    if v_n = 0 then
      v_conflicts := v_conflicts || jsonb_build_object('kind','DRESS_NO_MATCH',
        'role', v_dresskey, 'detail','no matching section waits silently (v241)');
    elsif v_n > 1 then
      v_conflicts := v_conflicts || jsonb_build_object('kind','DRESS_AMBIGUOUS',
        'role', v_dresskey, 'detail','multiple matches demand a mapping decision (v241)');
    end if;
  end loop;
  v_pins := coalesce(v_content->'presentation'->'portable'->'sectionPins','{}'::jsonb);
  for v_dresskey in select jsonb_object_keys(v_pins) loop
    select count(*) into v_n from unnest(v_roles) r where r = v_dresskey;
    if v_n <> 1 then
      v_conflicts := v_conflicts || jsonb_build_object('kind', case when v_n = 0 then 'DRESS_NO_MATCH' else 'DRESS_AMBIGUOUS' end,
        'role', v_dresskey, 'detail','section pin match law (v241)');
    end if;
  end loop;

  if jsonb_array_length(v_conflicts) > 0 then
    raise exception 'BLUEPRINT_CONFLICTS: %', v_conflicts::text;
  end if;

  -- ═══ BUILD — nothing above wrote; everything below is one transaction ═══
  select id into v_proposal from public.proposals
    where booking_id = p_booking order by created_at desc limit 1;
  if v_proposal is null then
    insert into public.proposals (booking_id, title) values (p_booking, coalesce(v_ident.name,'Proposal'))
      returning id into v_proposal;
  end if;
  select coalesce(max(version),0) + 1 into v_vnum from public.proposal_versions where proposal_id = v_proposal;
  insert into public.proposal_versions (proposal_id, version, status, notes)
    values (v_proposal, v_vnum, 'draft', 'Started from ' || v_ident.name || ' r' || v_rev.revision_number)
    returning id into v_version;

  -- guests: the answered parameter lands as the version's frozen count
  select id into v_adults from public.guest_categories order by position limit 1;
  if v_adults is not null then
    insert into public.version_guests (version_id, category_id, count) values (v_version, v_adults, p_guest_count);
  end if;

  -- sections + components + items + config
  for v_ch in select * from jsonb_array_elements(coalesce(v_content->'structure','[]'::jsonb)) loop
    for v_se in select * from jsonb_array_elements(coalesce(v_ch->'sections','[]'::jsonb)) loop
      insert into public.version_sections (version_id, section_type_id, position)
        values (v_version, (v_se->>'role')::uuid, v_secpos)
        on conflict (version_id, section_type_id) do nothing;
      v_comppos := 0;
      for v_en in select * from jsonb_array_elements(coalesce(v_se->'entries','[]'::jsonb)) loop
        v_def_id := (v_en->>'definitionId')::uuid;
        -- SPEC-002, unchanged — the component's own provenance stamps here
        v_inst := public.instantiate_component(v_def_id, p_booking, v_version, 'food', v_comppos);
        v_comp := (v_inst->>'component_id')::uuid;
        v_comppos := v_comppos + 1;
        update public.event_components
           set section_type_id = (v_se->>'role')::uuid,
               title = case when coalesce(v_en->>'title','') <> '' then v_en->>'title' else title end
         where id = v_comp;

        -- authored configuration as seed (checked applicable above)
        select data into v_cfgdata from public.event_component_config where component_id = v_comp;
        v_choices := coalesce(v_cfgdata->'choices','{}'::jsonb);
        v_scalars := coalesce(v_cfgdata->'scalars','{}'::jsonb);
        for v_kv in select key, value from jsonb_each(coalesce(v_en->'configuration'->'values','{}'::jsonb)) loop
          if exists (select 1 from public.component_definition_config c
                      where c.id = nullif(v_defrevs->>(v_def_id::text),'')::uuid
                        and coalesce(c.data->'dimensions','{}'::jsonb) ? v_kv.key) then
            v_choices := jsonb_set(v_choices, array[v_kv.key], v_kv.value);
          else
            v_scalars := jsonb_set(v_scalars, array[v_kv.key], v_kv.value);
          end if;
        end loop;
        v_cfgdata := jsonb_set(coalesce(v_cfgdata,'{}'::jsonb), '{choices}', v_choices);
        v_cfgdata := jsonb_set(v_cfgdata, '{scalars}', v_scalars);
        if (v_en->'configuration'->>'scheme') is not null then
          v_cfgdata := jsonb_set(v_cfgdata, '{schemeId}', to_jsonb(v_en->'configuration'->>'scheme'));
        end if;
        update public.event_component_config set data = v_cfgdata where component_id = v_comp;

        -- authored item selections: exclusions remove seed items; authored
        -- additions arrive unpriced (honest debt, not a guessed number)
        for v_item in select * from jsonb_array_elements(coalesce(v_en->'itemSelections','[]'::jsonb)) loop
          if (v_item->>'include')::boolean is false then
            delete from public.component_items
             where component_id = v_comp and name = v_item->>'name';
          elsif not exists (select 1 from public.component_items
                             where component_id = v_comp and name = v_item->>'name') then
            insert into public.component_items (component_id, name, unit_price, position)
              values (v_comp, v_item->>'name', null,
                      coalesce((select max(position)+1 from public.component_items where component_id = v_comp), 0));
          end if;
        end loop;

        -- §11 — money arrives as DEBT…
        update public.component_items set price_confirmed = false where component_id = v_comp;
        v_intent := v_en->'pricingIntent';
        if v_intent is not null then
          if v_intent->>'form' = 'authored-suggestion' then
            update public.event_components
               set pricing_mode = 'package', package_price = (v_intent->>'amount')::numeric,
                   package_basis = 'flat', package_price_confirmed = false
             where id = v_comp;
          elsif v_intent->>'form' = 'formula' then
            update public.event_components
               set pricing_mode = 'package',
                   package_price = (v_intent->>'perGuest')::numeric * p_guest_count,
                   package_basis = 'flat', package_price_confirmed = false
             where id = v_comp;
          elsif v_intent->>'form' = 'fixed-package' then
            -- …except the stamped decision (§11's one exception)
            update public.event_components
               set pricing_mode = 'package', package_price = (v_intent->>'amount')::numeric,
                   package_basis = 'flat', package_price_confirmed = true
             where id = v_comp;
            v_fixed := v_fixed || jsonb_build_object(
              'entry_key', v_en->>'key', 'component_id', v_comp::text,
              'policy', v_intent->>'policy', 'amount', (v_intent->>'amount')::numeric,
              'revision_id', v_rev.id::text, 'published_by', coalesce(v_rev.published_by::text,''),
              'published_at', v_rev.published_at);
          else
            update public.event_components set package_price_confirmed = false where id = v_comp;
          end if;
        else
          update public.event_components set package_price_confirmed = false where id = v_comp;
        end if;
      end loop;
      v_secpos := v_secpos + 1;
    end loop;
  end loop;

  -- v241 — the portable stratum, replacement semantics; bound untouched
  if v_content->'presentation' is not null and v_content->'presentation' <> 'null'::jsonb then
    v_override := coalesce(v_content->'presentation'->'portable'->'delta','{}'::jsonb);
    if v_dress <> '{}'::jsonb then
      v_override := jsonb_set(v_override, '{treatments}',
        coalesce(v_override->'treatments','{}'::jsonb) || jsonb_build_object('sections', v_dress));
    end if;
    update public.proposal_versions
       set theme_key = nullif(v_content->'presentation'->'portable'->>'themeKey',''),
           theme_override = v_override,
           photo_pins = jsonb_strip_nulls(jsonb_build_object(
             'sections', nullif(v_pins,'{}'::jsonb),
             'cover', v_content->'presentation'->'portable'->'documentPin'))
     where id = v_version;
  end if;

  -- ═══ FREEZE + CITE — the last act: baseline and dual-provenance record ═══
  select jsonb_build_object(
    'sections', (select coalesce(jsonb_agg(jsonb_build_object('section_type_id', vs.section_type_id, 'position', vs.position) order by vs.position),'[]'::jsonb)
                   from public.version_sections vs where vs.version_id = v_version),
    'components', (select coalesce(jsonb_agg(jsonb_build_object(
                      'id', ec.id, 'title', ec.title, 'section_type_id', ec.section_type_id,
                      'definition_id', ec.definition_id, 'instantiation_id', ec.instantiation_id,
                      'pricing_mode', ec.pricing_mode, 'package_price', ec.package_price,
                      'package_price_confirmed', ec.package_price_confirmed,
                      'config', (select c.data from public.event_component_config c where c.component_id = ec.id),
                      'seed_config_revision', (select c.seed_config_revision from public.event_component_config c where c.component_id = ec.id),
                      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', ci.name, 'unit_price', ci.unit_price, 'price_confirmed', ci.price_confirmed) order by ci.position),'[]'::jsonb)
                                  from public.component_items ci where ci.component_id = ec.id)) order by ec.position),'[]'::jsonb)
                     from public.event_components ec where ec.proposal_version_id = v_version),
    'presentation', (select jsonb_build_object('theme_key', pv.theme_key, 'theme_override', pv.theme_override, 'photo_pins', pv.photo_pins)
                       from public.proposal_versions pv where pv.id = v_version),
    'guests', (select coalesce(jsonb_agg(jsonb_build_object('category_id', vg.category_id, 'count', vg.count)),'[]'::jsonb)
                 from public.version_guests vg where vg.version_id = v_version),
    'structure_prose', v_content->'structure'
  ) into v_baseline;

  insert into public.blueprint_instantiations
      (tenant_id, blueprint_id, revision_id, revision_number, fingerprint,
       booking_id, proposal_id, version_id, snapshot_at, parameters,
       definition_revisions, fixed_price_decisions, frozen_baseline, actor)
    values (v_ident.tenant_id, v_ident.id, v_rev.id, v_rev.revision_number, v_fp,
            p_booking, v_proposal, v_version, v_snapshot,
            jsonb_build_object('guest_count', p_guest_count),
            v_defrevs, v_fixed, v_baseline, p_actor);

  return jsonb_build_object(
    'version_id', v_version, 'proposal_id', v_proposal,
    'fingerprint', v_fp, 'snapshot_at', v_snapshot,
    'citation', 'Started from ' || v_ident.name || ' r' || v_rev.revision_number);
end $_$;


--
-- Name: instantiate_blueprint(uuid, uuid, integer, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.instantiate_blueprint(p_revision uuid, p_booking uuid, p_guest_count integer, p_actor uuid DEFAULT NULL::uuid, p_answers jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_ident    public.blueprint_identities%rowtype;
  v_rev      public.blueprint_revisions%rowtype;
  v_content  jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_defrevs  jsonb := '{}'::jsonb;
  v_snapshot timestamptz;
  v_fp       text;
  v_proposal uuid;
  v_vnum     int;
  v_version  uuid;
  v_adults   uuid;
  v_ch       jsonb;  v_se jsonb;  v_en jsonb;
  v_secpos   int := 0;
  v_comppos  int;
  v_role     uuid;
  v_roles    text[] := '{}';
  v_def_id   uuid;
  v_defcfg   record;
  v_inst     jsonb;
  v_comp     uuid;
  v_cfgdata  jsonb;
  v_choices  jsonb;
  v_scalars  jsonb;
  v_kv       record;
  v_item     jsonb;
  v_intent   jsonb;
  v_fixed    jsonb := '[]'::jsonb;
  v_dress    jsonb;
  v_pins     jsonb;
  v_override jsonb;
  v_baseline jsonb;
  v_dresskey text;
  v_n        int;
  -- v257
  v_answers  jsonb;
  v_params   jsonb;
  v_pdecl    jsonb;
  v_pkey     text; v_ptype text; v_pans jsonb;
  v_branches jsonb := '[]'::jsonb;
  v_incl     jsonb := '{}'::jsonb;   -- "ch:<key>"/"se:<key>"/"en:<key>" -> bool
  v_probs    text[]; v_prob text;
  v_cinc     boolean; v_sinc boolean; v_einc boolean;
begin
  -- ═══ GATHER — one coherent organizational snapshot (v253, unchanged) ═══
  select r.* into v_rev from public.blueprint_revisions r
    where r.id = p_revision for share;
  if not found then raise exception 'INSTANTIATE_BLUEPRINT: revision not found'; end if;
  select i.* into v_ident from public.blueprint_identities i
    where i.id = v_rev.identity_id for share;

  if v_ident.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'INSTANTIATE_BLUEPRINT: revision not found';
  end if;
  if not exists (select 1 from public.bookings b
                  where b.id = p_booking and b.tenant_id = public.current_tenant_id()) then
    raise exception 'INSTANTIATE_BLUEPRINT: booking not found';
  end if;

  if v_rev.state <> 'published' then
    v_conflicts := v_conflicts || jsonb_build_object('kind','NOT_PUBLISHED','detail','only the published revision instantiates');
  end if;
  if v_ident.status <> 'active' then
    v_conflicts := v_conflicts || jsonb_build_object('kind','IDENTITY_RETIRED','detail','the retired shelf offers nothing for new use');
  end if;

  v_content := v_rev.content;

  -- ═══ v257 step 1 — EVERY required parameter answer, validated by type ═══
  if p_guest_count is null or p_guest_count <= 0 then
    v_conflicts := v_conflicts || jsonb_build_object('kind','PARAMETER_REQUIRED','key','guest_count',
      'detail','guest_count must be a positive count — a guessed guest count is a lie');
  end if;
  v_answers := coalesce(p_answers, '{}'::jsonb)
               || jsonb_build_object('guest_count', p_guest_count);
  v_params := coalesce(v_content->'parameters', '[]'::jsonb);
  for v_pdecl in select * from jsonb_array_elements(v_params) loop
    v_pkey := v_pdecl->>'key';
    v_ptype := v_pdecl->>'type';
    v_pans := v_answers->v_pkey;
    if coalesce((v_pdecl->>'required')::boolean, false)
       and (v_pans is null or v_pans = 'null'::jsonb or v_pans = '""'::jsonb) then
      v_conflicts := v_conflicts || jsonb_build_object('kind','PARAMETER_REQUIRED','key',v_pkey,
        'detail','a required question has no answer');
      continue;
    end if;
    if v_pans is not null and v_pans <> 'null'::jsonb then
      if v_ptype = 'count' and (jsonb_typeof(v_pans) <> 'number' or (v_pans #>> '{}')::numeric <= 0) then
        v_conflicts := v_conflicts || jsonb_build_object('kind','PARAMETER_INVALID','key',v_pkey,'detail','a count answers with a positive number');
      elsif v_ptype = 'choice' then
        if jsonb_typeof(v_pans) <> 'string' then
          v_conflicts := v_conflicts || jsonb_build_object('kind','PARAMETER_INVALID','key',v_pkey,'detail','a choice answers with text');
        elsif jsonb_array_length(coalesce(v_pdecl->'options','[]'::jsonb)) > 0
              and not exists (select 1 from jsonb_array_elements_text(v_pdecl->'options') o
                               where trim(o) = trim(v_pans #>> '{}')) then
          v_conflicts := v_conflicts || jsonb_build_object('kind','PARAMETER_INVALID','key',v_pkey,'detail','the answer is not among the declared options');
        end if;
      elsif v_ptype = 'flag' and jsonb_typeof(v_pans) <> 'boolean' then
        v_conflicts := v_conflicts || jsonb_build_object('kind','PARAMETER_INVALID','key',v_pkey,'detail','a flag answers true or false');
      end if;
    end if;
  end loop;

  -- root-level conditions stay barred (they attach at units)
  if v_content ? 'conditions' then
    v_conflicts := v_conflicts || jsonb_build_object('kind','CONDITION_LOCATION_BARRED','detail','conditions attach at chapters, sections, entries, and item selections — never at the root');
  end if;

  -- ═══ v257 steps 2–4 — validate every condition, then evaluate every
  --     condition deterministically into the COMPLETE branch map ═══
  for v_ch in select * from jsonb_array_elements(coalesce(v_content->'structure','[]'::jsonb)) loop
    if v_ch ? 'condition' then
      v_probs := public.blueprint_condition_problems(v_ch->'condition', v_params);
      foreach v_prob in array v_probs loop
        v_conflicts := v_conflicts || jsonb_build_object('kind', v_prob, 'at', coalesce(v_ch->>'title','(chapter)'));
      end loop;
    end if;
    for v_se in select * from jsonb_array_elements(coalesce(v_ch->'sections','[]'::jsonb)) loop
      if v_se ? 'condition' then
        v_probs := public.blueprint_condition_problems(v_se->'condition', v_params);
        foreach v_prob in array v_probs loop
          v_conflicts := v_conflicts || jsonb_build_object('kind', v_prob, 'at', coalesce(v_se->>'title','(section)'));
        end loop;
      end if;
      for v_en in select * from jsonb_array_elements(coalesce(v_se->'entries','[]'::jsonb)) loop
        if v_en ? 'condition' then
          v_probs := public.blueprint_condition_problems(v_en->'condition', v_params);
          foreach v_prob in array v_probs loop
            v_conflicts := v_conflicts || jsonb_build_object('kind', v_prob, 'at', coalesce(v_en->>'title','(entry)'));
          end loop;
        end if;
        for v_item in select * from jsonb_array_elements(coalesce(v_en->'itemSelections','[]'::jsonb)) loop
          if v_item ? 'condition' then
            v_probs := public.blueprint_condition_problems(v_item->'condition', v_params);
            foreach v_prob in array v_probs loop
              v_conflicts := v_conflicts || jsonb_build_object('kind', v_prob, 'at', coalesce(v_item->>'name','(item)'));
            end loop;
          end if;
        end loop;
      end loop;
    end loop;
  end loop;

  if jsonb_array_length(v_conflicts) = 0 then
    for v_ch in select * from jsonb_array_elements(coalesce(v_content->'structure','[]'::jsonb)) loop
      v_cinc := true;
      if v_ch ? 'condition' then
        v_cinc := public.blueprint_condition_eval(v_ch->'condition', v_answers);
        v_branches := v_branches || jsonb_build_object('unit','chapter','at',v_ch->>'key','included',v_cinc,'condition',v_ch->'condition');
      end if;
      v_incl := v_incl || jsonb_build_object('ch:' || (v_ch->>'key'), v_cinc);
      for v_se in select * from jsonb_array_elements(coalesce(v_ch->'sections','[]'::jsonb)) loop
        v_sinc := v_cinc;
        if v_se ? 'condition' then
          v_sinc := v_sinc and public.blueprint_condition_eval(v_se->'condition', v_answers);
          v_branches := v_branches || jsonb_build_object('unit','section','at',v_se->>'key','included',v_sinc,'condition',v_se->'condition');
        end if;
        v_incl := v_incl || jsonb_build_object('se:' || (v_se->>'key'), v_sinc);
        for v_en in select * from jsonb_array_elements(coalesce(v_se->'entries','[]'::jsonb)) loop
          v_einc := v_sinc;
          if v_en ? 'condition' then
            v_einc := v_einc and public.blueprint_condition_eval(v_en->'condition', v_answers);
            v_branches := v_branches || jsonb_build_object('unit','entry','at',v_en->>'key','included',v_einc,'condition',v_en->'condition');
          end if;
          v_incl := v_incl || jsonb_build_object('en:' || (v_en->>'key'), v_einc);
          for v_item in select * from jsonb_array_elements(coalesce(v_en->'itemSelections','[]'::jsonb)) loop
            if v_item ? 'condition' then
              v_branches := v_branches || jsonb_build_object('unit','itemSelection','at',v_item->>'name',
                'included', v_einc and public.blueprint_condition_eval(v_item->'condition', v_answers),
                'condition', v_item->'condition');
              v_incl := v_incl || jsonb_build_object('it:' || (v_en->>'key') || '|' || (v_item->>'name'),
                v_einc and public.blueprint_condition_eval(v_item->'condition', v_answers));
            end if;
          end loop;
        end loop;
      end loop;
    end loop;
  end if;

  -- Statement 2 (v253): definitions' current config revisions — for
  -- INCLUDED entries only (excluded branches make no demands).
  select coalesce(jsonb_object_agg(d.def_id, d.cfg_id), '{}'::jsonb) into v_defrevs
    from (
      select (e.entry->>'definitionId')::uuid as def_id,
             (select c.id from public.component_definition_config c
               where c.definition_id = (e.entry->>'definitionId')::uuid
                 and c.superseded_by is null and c.archived_at is null
               for share of c) as cfg_id
        from (
          select jsonb_array_elements(
                   jsonb_path_query_array(coalesce(v_content->'structure','[]'::jsonb),
                                          '$[*].sections[*].entries[*]')) as entry
        ) e
       where coalesce(e.entry->>'definitionId','') <> ''
       group by 1, 2
    ) d;

  v_snapshot := now();
  v_fp := md5(v_content::text);

  -- ═══ CHECK (v253, over INCLUDED units only) ═══
  for v_ch in select * from jsonb_array_elements(coalesce(v_content->'structure','[]'::jsonb)) loop
    if coalesce((v_incl->>('ch:' || (v_ch->>'key')))::boolean, true) is false then continue; end if;
    for v_se in select * from jsonb_array_elements(coalesce(v_ch->'sections','[]'::jsonb)) loop
      if coalesce((v_incl->>('se:' || (v_se->>'key')))::boolean, true) is false then continue; end if;
      if coalesce(v_se->>'role','') = '' then
        v_conflicts := v_conflicts || jsonb_build_object('kind','SECTION_ROLE_REQUIRED',
          'at', coalesce(v_se->>'title','(untitled section)'),
          'detail','a section materializes under a semantic role (section type)');
      else
        select id into v_role from public.section_types where id::text = v_se->>'role' and active;
        if v_role is null then
          v_conflicts := v_conflicts || jsonb_build_object('kind','SECTION_ROLE_UNKNOWN',
            'at', coalesce(v_se->>'title','(untitled section)'), 'role', v_se->>'role',
            'detail','the semantic role is not an active section type');
        else
          v_roles := v_roles || (v_se->>'role');
        end if;
      end if;

      for v_en in select * from jsonb_array_elements(coalesce(v_se->'entries','[]'::jsonb)) loop
        if coalesce((v_incl->>('en:' || (v_en->>'key')))::boolean, true) is false then continue; end if;
        if coalesce(v_en->>'definitionId','') = '' then
          v_conflicts := v_conflicts || jsonb_build_object('kind','DEFINITION_REQUIRED',
            'at', coalesce(v_en->>'title','(untitled entry)'),
            'detail','a component entry references a definition identity');
          continue;
        end if;
        v_def_id := (v_en->>'definitionId')::uuid;
        if not exists (select 1 from public.component_definitions where id = v_def_id) then
          v_conflicts := v_conflicts || jsonb_build_object('kind','DEFINITION_UNAVAILABLE',
            'at', coalesce(v_en->>'title','(untitled entry)'), 'definition', v_def_id::text,
            'detail','the referenced definition is not available');
          continue;
        end if;
        v_defcfg := null;
        if (v_defrevs->>(v_def_id::text)) is not null then
          select * into v_defcfg from public.component_definition_config
            where id = (v_defrevs->>(v_def_id::text))::uuid;
        end if;
        if (v_en->'configuration'->>'scheme') is not null then
          if v_defcfg.id is null
             or not (coalesce(v_defcfg.data->'schemes','{}'::jsonb) ? (v_en->'configuration'->>'scheme')) then
            v_conflicts := v_conflicts || jsonb_build_object('kind','CONFIG_SCHEME_GONE',
              'at', coalesce(v_en->>'title','(untitled entry)'),
              'scheme', v_en->'configuration'->>'scheme',
              'detail','the authored scheme no longer exists on the current definition');
          end if;
        end if;
        for v_kv in select key, value from jsonb_each(coalesce(v_en->'configuration'->'values','{}'::jsonb)) loop
          if v_defcfg.id is null then
            v_conflicts := v_conflicts || jsonb_build_object('kind','CONFIG_KEY_GONE',
              'at', coalesce(v_en->>'title','(untitled entry)'), 'key', v_kv.key,
              'detail','the current definition carries no configuration');
          elsif coalesce(v_defcfg.data->'dimensions','{}'::jsonb) ? v_kv.key then
            if not (coalesce(v_defcfg.data->'dimensions'->v_kv.key->'options','[]'::jsonb) @> to_jsonb(array[trim(both '"' from v_kv.value::text)])) then
              v_conflicts := v_conflicts || jsonb_build_object('kind','CONFIG_OPTION_GONE',
                'at', coalesce(v_en->>'title','(untitled entry)'), 'key', v_kv.key,
                'value', trim(both '"' from v_kv.value::text),
                'detail','the authored option no longer exists on the current definition');
            end if;
          elsif not (coalesce(v_defcfg.data->'instanceDefaults'->'scalars','{}'::jsonb) ? v_kv.key) then
            v_conflicts := v_conflicts || jsonb_build_object('kind','CONFIG_KEY_GONE',
              'at', coalesce(v_en->>'title','(untitled entry)'), 'key', v_kv.key,
              'detail','the authored key is neither a dimension nor a scalar on the current definition');
          end if;
        end loop;
        v_intent := v_en->'pricingIntent';
        if v_intent is not null and v_intent->>'form' = 'fixed-package'
           and coalesce(trim(v_intent->>'policy'),'') = '' then
          v_conflicts := v_conflicts || jsonb_build_object('kind','FIXED_PRICE_POLICY_MISSING',
            'at', coalesce(v_en->>'title','(untitled entry)'),
            'detail','a fixed-package price travels only under a named policy');
        end if;
      end loop;
    end loop;
  end loop;

  -- v241 match law over the INCLUDED sections
  v_dress := coalesce(v_content->'presentation'->'portable'->'sectionDress','{}'::jsonb);
  for v_dresskey in select jsonb_object_keys(v_dress) loop
    select count(*) into v_n from unnest(v_roles) r where r = v_dresskey;
    if v_n = 0 then
      v_conflicts := v_conflicts || jsonb_build_object('kind','DRESS_NO_MATCH',
        'role', v_dresskey, 'detail','no matching section waits silently (v241)');
    elsif v_n > 1 then
      v_conflicts := v_conflicts || jsonb_build_object('kind','DRESS_AMBIGUOUS',
        'role', v_dresskey, 'detail','multiple matches demand a mapping decision (v241)');
    end if;
  end loop;
  v_pins := coalesce(v_content->'presentation'->'portable'->'sectionPins','{}'::jsonb);
  for v_dresskey in select jsonb_object_keys(v_pins) loop
    select count(*) into v_n from unnest(v_roles) r where r = v_dresskey;
    if v_n <> 1 then
      v_conflicts := v_conflicts || jsonb_build_object('kind', case when v_n = 0 then 'DRESS_NO_MATCH' else 'DRESS_AMBIGUOUS' end,
        'role', v_dresskey, 'detail','section pin match law (v241)');
    end if;
  end loop;

  -- ═══ step 5 — stage all conflicts; a failure creates NOTHING ═══
  if jsonb_array_length(v_conflicts) > 0 then
    raise exception 'BLUEPRINT_CONFLICTS: %', v_conflicts::text;
  end if;

  -- ═══ step 6 — MATERIALIZE (v253's build, honoring the branch map) ═══
  select id into v_proposal from public.proposals
    where booking_id = p_booking order by created_at desc limit 1;
  if v_proposal is null then
    insert into public.proposals (booking_id, title) values (p_booking, coalesce(v_ident.name,'Proposal'))
      returning id into v_proposal;
  end if;
  select coalesce(max(version),0) + 1 into v_vnum from public.proposal_versions where proposal_id = v_proposal;
  insert into public.proposal_versions (proposal_id, version, status, notes)
    values (v_proposal, v_vnum, 'draft', 'Started from ' || v_ident.name || ' r' || v_rev.revision_number)
    returning id into v_version;

  select id into v_adults from public.guest_categories order by position limit 1;
  if v_adults is not null then
    insert into public.version_guests (version_id, category_id, count) values (v_version, v_adults, p_guest_count);
  end if;

  for v_ch in select * from jsonb_array_elements(coalesce(v_content->'structure','[]'::jsonb)) loop
    if coalesce((v_incl->>('ch:' || (v_ch->>'key')))::boolean, true) is false then continue; end if;
    for v_se in select * from jsonb_array_elements(coalesce(v_ch->'sections','[]'::jsonb)) loop
      if coalesce((v_incl->>('se:' || (v_se->>'key')))::boolean, true) is false then continue; end if;
      insert into public.version_sections (version_id, section_type_id, position)
        values (v_version, (v_se->>'role')::uuid, v_secpos)
        on conflict (version_id, section_type_id) do nothing;
      v_comppos := 0;
      for v_en in select * from jsonb_array_elements(coalesce(v_se->'entries','[]'::jsonb)) loop
        if coalesce((v_incl->>('en:' || (v_en->>'key')))::boolean, true) is false then continue; end if;
        v_def_id := (v_en->>'definitionId')::uuid;
        v_inst := public.instantiate_component(v_def_id, p_booking, v_version, 'food', v_comppos);
        v_comp := (v_inst->>'component_id')::uuid;
        v_comppos := v_comppos + 1;
        update public.event_components
           set section_type_id = (v_se->>'role')::uuid,
               title = case when coalesce(v_en->>'title','') <> '' then v_en->>'title' else title end
         where id = v_comp;

        select data into v_cfgdata from public.event_component_config where component_id = v_comp;
        v_choices := coalesce(v_cfgdata->'choices','{}'::jsonb);
        v_scalars := coalesce(v_cfgdata->'scalars','{}'::jsonb);
        for v_kv in select key, value from jsonb_each(coalesce(v_en->'configuration'->'values','{}'::jsonb)) loop
          if exists (select 1 from public.component_definition_config c
                      where c.id = nullif(v_defrevs->>(v_def_id::text),'')::uuid
                        and coalesce(c.data->'dimensions','{}'::jsonb) ? v_kv.key) then
            v_choices := jsonb_set(v_choices, array[v_kv.key], v_kv.value);
          else
            v_scalars := jsonb_set(v_scalars, array[v_kv.key], v_kv.value);
          end if;
        end loop;
        v_cfgdata := jsonb_set(coalesce(v_cfgdata,'{}'::jsonb), '{choices}', v_choices);
        v_cfgdata := jsonb_set(v_cfgdata, '{scalars}', v_scalars);
        if (v_en->'configuration'->>'scheme') is not null then
          v_cfgdata := jsonb_set(v_cfgdata, '{schemeId}', to_jsonb(v_en->'configuration'->>'scheme'));
        end if;
        update public.event_component_config set data = v_cfgdata where component_id = v_comp;

        for v_item in select * from jsonb_array_elements(coalesce(v_en->'itemSelections','[]'::jsonb)) loop
          -- v257: an item selection under a false condition never applies —
          -- neither its exclusion nor its addition (one-time resolution).
          if v_item ? 'condition'
             and coalesce((v_incl->>('it:' || (v_en->>'key') || '|' || (v_item->>'name')))::boolean, true) is false then
            continue;
          end if;
          if (v_item->>'include')::boolean is false then
            delete from public.component_items
             where component_id = v_comp and name = v_item->>'name';
          elsif not exists (select 1 from public.component_items
                             where component_id = v_comp and name = v_item->>'name') then
            insert into public.component_items (component_id, name, unit_price, position)
              values (v_comp, v_item->>'name', null,
                      coalesce((select max(position)+1 from public.component_items where component_id = v_comp), 0));
          end if;
        end loop;

        update public.component_items set price_confirmed = false where component_id = v_comp;
        v_intent := v_en->'pricingIntent';
        if v_intent is not null then
          if v_intent->>'form' = 'authored-suggestion' then
            update public.event_components
               set pricing_mode = 'package', package_price = (v_intent->>'amount')::numeric,
                   package_basis = 'flat', package_price_confirmed = false
             where id = v_comp;
          elsif v_intent->>'form' = 'formula' then
            update public.event_components
               set pricing_mode = 'package',
                   package_price = (v_intent->>'perGuest')::numeric * p_guest_count,
                   package_basis = 'flat', package_price_confirmed = false
             where id = v_comp;
          elsif v_intent->>'form' = 'fixed-package' then
            update public.event_components
               set pricing_mode = 'package', package_price = (v_intent->>'amount')::numeric,
                   package_basis = 'flat', package_price_confirmed = true
             where id = v_comp;
            v_fixed := v_fixed || jsonb_build_object(
              'entry_key', v_en->>'key', 'component_id', v_comp::text,
              'policy', v_intent->>'policy', 'amount', (v_intent->>'amount')::numeric,
              'revision_id', v_rev.id::text, 'published_by', coalesce(v_rev.published_by::text,''),
              'published_at', v_rev.published_at);
          else
            update public.event_components set package_price_confirmed = false where id = v_comp;
          end if;
        else
          update public.event_components set package_price_confirmed = false where id = v_comp;
        end if;
      end loop;
      v_secpos := v_secpos + 1;
    end loop;
  end loop;

  if v_content->'presentation' is not null and v_content->'presentation' <> 'null'::jsonb then
    v_override := coalesce(v_content->'presentation'->'portable'->'delta','{}'::jsonb);
    if v_dress <> '{}'::jsonb then
      v_override := jsonb_set(v_override, '{treatments}',
        coalesce(v_override->'treatments','{}'::jsonb) || jsonb_build_object('sections', v_dress));
    end if;
    update public.proposal_versions
       set theme_key = nullif(v_content->'presentation'->'portable'->>'themeKey',''),
           theme_override = v_override,
           photo_pins = jsonb_strip_nulls(jsonb_build_object(
             'sections', nullif(v_pins,'{}'::jsonb),
             'cover', v_content->'presentation'->'portable'->'documentPin'))
     where id = v_version;
  end if;

  -- ═══ step 7 — FREEZE + CITE, now carrying the branch map and answers ═══
  select jsonb_build_object(
    'sections', (select coalesce(jsonb_agg(jsonb_build_object('section_type_id', vs.section_type_id, 'position', vs.position) order by vs.position),'[]'::jsonb)
                   from public.version_sections vs where vs.version_id = v_version),
    'components', (select coalesce(jsonb_agg(jsonb_build_object(
                      'id', ec.id, 'title', ec.title, 'section_type_id', ec.section_type_id,
                      'definition_id', ec.definition_id, 'instantiation_id', ec.instantiation_id,
                      'pricing_mode', ec.pricing_mode, 'package_price', ec.package_price,
                      'package_price_confirmed', ec.package_price_confirmed,
                      'config', (select c.data from public.event_component_config c where c.component_id = ec.id),
                      'seed_config_revision', (select c.seed_config_revision from public.event_component_config c where c.component_id = ec.id),
                      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', ci.name, 'unit_price', ci.unit_price, 'price_confirmed', ci.price_confirmed) order by ci.position),'[]'::jsonb)
                                  from public.component_items ci where ci.component_id = ec.id)) order by ec.position),'[]'::jsonb)
                     from public.event_components ec where ec.proposal_version_id = v_version),
    'presentation', (select jsonb_build_object('theme_key', pv.theme_key, 'theme_override', pv.theme_override, 'photo_pins', pv.photo_pins)
                       from public.proposal_versions pv where pv.id = v_version),
    'guests', (select coalesce(jsonb_agg(jsonb_build_object('category_id', vg.category_id, 'count', vg.count)),'[]'::jsonb)
                 from public.version_guests vg where vg.version_id = v_version),
    'structure_prose', v_content->'structure'
  ) into v_baseline;

  insert into public.blueprint_instantiations
      (tenant_id, blueprint_id, revision_id, revision_number, fingerprint,
       booking_id, proposal_id, version_id, snapshot_at, parameters, branches,
       definition_revisions, fixed_price_decisions, frozen_baseline, actor)
    values (v_ident.tenant_id, v_ident.id, v_rev.id, v_rev.revision_number, v_fp,
            p_booking, v_proposal, v_version, v_snapshot,
            v_answers, v_branches,
            v_defrevs, v_fixed, v_baseline, p_actor);

  return jsonb_build_object(
    'version_id', v_version, 'proposal_id', v_proposal,
    'fingerprint', v_fp, 'snapshot_at', v_snapshot,
    'branches', v_branches,
    'citation', 'Started from ' || v_ident.name || ' r' || v_rev.revision_number);
end $_$;


--
-- Name: instantiate_component(uuid, uuid, uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.instantiate_component(p_definition uuid, p_booking uuid, p_version uuid, p_domain text DEFAULT 'food'::text, p_position integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_inst uuid := gen_random_uuid();
  v_comp uuid; v_name text; v_cfg record; v_item jsonb; v_defaults jsonb;
begin
  select name into v_name from public.component_definitions where id = p_definition;
  if v_name is null then raise exception 'INSTANTIATE: definition % not visible', p_definition; end if;
  insert into public.event_components
      (booking_id, proposal_version_id, title, domain, position, definition_id, instantiation_id)
    values (p_booking, p_version, v_name, p_domain, p_position, p_definition, v_inst)
    returning id into v_comp;
  select id, schema_version, data into v_cfg
    from public.component_definition_config
   where definition_id = p_definition and superseded_by is null and archived_at is null;
  if v_cfg.id is not null then
    for v_item in select * from jsonb_array_elements(coalesce(v_cfg.data->'defaultItems','[]'::jsonb)) loop
      insert into public.component_items
          (component_id, name, quantity_basis, unit_price, position, instantiation_id)
        values (v_comp, v_item->>'name', v_item->>'quantity_basis',
                (v_item->>'unit_price')::numeric, coalesce((v_item->>'position')::int, 0), v_inst);
    end loop;
    v_defaults := coalesce(v_cfg.data->'instanceDefaults',
      '{"schemeId":null,"customized":[],"scalars":{},"choices":{},"display":{},"substitutions":{}}'::jsonb);
    insert into public.event_component_config
        (component_id, schema_version, data, seed_config_revision,
         baseline, baseline_provenance, baseline_at)
      values (v_comp, v_cfg.schema_version, v_defaults, v_cfg.id,
              v_defaults, 'instantiation_stamp', now());
  else
    v_defaults := '{"schemeId":null,"customized":[],"scalars":{},"choices":{},"display":{},"substitutions":{}}'::jsonb;
    insert into public.event_component_config
        (component_id, schema_version, data, baseline, baseline_provenance, baseline_at)
      values (v_comp, 1, v_defaults, v_defaults, 'instantiation_stamp', now());
  end if;
  insert into public.component_instance_layers
      (component_id, layer_key, schema_version, data, copied_from)
    select v_comp, l.layer_key, l.schema_version, l.data, l.id
      from public.component_layers l
     where l.definition_id = p_definition and l.superseded_by is null and l.archived_at is null;
  return jsonb_build_object('component_id', v_comp, 'instantiation_id', v_inst);
end $$;


--
-- Name: is_active_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_active_member() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = public.current_tenant_id() and tu.active
       and tu.user_id = coalesce(
             nullif(current_setting('app.user_id', true), ''),
             nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid);
$$;


--
-- Name: is_blackout_day(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_blackout_day(p_day date) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select extract(isodow from p_day) = 6;   -- ISO 6 = Saturday
$$;


--
-- Name: library_duplicate_candidates(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.library_duplicate_candidates(p_name text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name)), '[]'::jsonb)
  from public.library_component c
  where c.tenant_id = public.current_tenant_id() and c.active
    and lower(regexp_replace(c.name,'\s+','','g')) = lower(regexp_replace(coalesce(p_name,''),'\s+','','g'));
$$;


--
-- Name: library_profile(uuid, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.library_profile(p_component uuid, p_context jsonb DEFAULT NULL::jsonb, p_revision uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); c record; v_rev uuid; rv record; reqs jsonb;
begin
  select * into c from public.library_component where id=p_component and tenant_id=v_tenant;
  if not found then return null; end if;
  v_rev := coalesce(p_revision, public.profile_current_revision(p_component));
  if v_rev is null then
    return jsonb_build_object('component_id', c.id, 'name', c.name, 'kind', c.kind,
                              'revision', null, 'requirements', '[]'::jsonb);
  end if;
  select * into rv from public.component_profile_revision where id=v_rev and tenant_id=v_tenant;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'family', q.family, 'kind', q.kind, 'label', q.label,
           'capability', q.capability, 'provision_source', q.provision_source,
           'basis', q.basis, 'rate', q.rate, 'band_size', q.band_size,
           'min_qty', q.min_qty, 'max_qty', q.max_qty, 'rounding', q.rounding,
           'unit', q.unit, 'aggregation', q.aggregation, 'temporal', q.temporal,
           'condition_param', q.condition_param, 'condition_value', q.condition_value,
           'resolution', case
              when q.condition_param is not null and (p_context is null or p_context->>q.condition_param is distinct from q.condition_value)
                then jsonb_build_object('status','inactive','condition',q.condition_param||'='||q.condition_value)
              else public.resolve_quantity(q.basis, q.rate, q.band_size, q.min_qty, q.max_qty, q.rounding, p_context) end
         ) order by q.family, q.position), '[]'::jsonb)
    into reqs
    from public.profile_requirement q where q.revision_id=v_rev and q.tenant_id=v_tenant;
  return jsonb_build_object('component_id', c.id, 'name', c.name, 'kind', c.kind,
    'revision', jsonb_build_object('id', rv.id, 'revision_no', rv.revision_no,
                                   'authored_by', rv.authored_by, 'created_at', rv.created_at,
                                   'reason', rv.reason),
    'requirements', reqs);
end $$;


--
-- Name: merge_venues(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.merge_venues(p_from uuid, p_into uuid, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); a uuid; b uuid; v_from record; v_into record;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  if p_from = p_into then raise exception 'VENUE_MERGE_SELF'; end if;
  a := least(p_from, p_into); b := greatest(p_from, p_into);
  perform 1 from public.venue where id=a and tenant_id=v_tenant for update;
  perform 1 from public.venue where id=b and tenant_id=v_tenant for update;
  select * into v_from from public.venue where id=p_from and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  select * into v_into from public.venue where id=p_into and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_from.redirect_to is not null then raise exception 'VENUE_ALREADY_MERGED'; end if;
  if v_into.redirect_to is not null then raise exception 'VENUE_MERGE_TARGET_REDIRECTED'; end if;
  update public.venue set redirect_to = p_into,
    notes = coalesce(notes,'') || case when p_reason is not null then E'\n[merged: '||p_reason||']' else '' end
    where id = p_from and tenant_id = v_tenant;
  return jsonb_build_object('merged', p_from, 'into', p_into);
end $$;


--
-- Name: obligation_nk_complete(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.obligation_nk_complete(p_event uuid, p_nk text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
      from public.obligation o
      join public.execution_evidence e
        on e.obligation_ref = o.id and e.kind = 'completion'
     where o.event_ref = p_event and o.natural_key = p_nk
       and o.tenant_id = public.current_tenant_id()
       and not exists (select 1 from public.execution_evidence i
                        where i.obligation_ref = o.id and i.kind = 'invalidated'
                          and i.moment >= e.moment)
  );
$$;


--
-- Name: obligation_state(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.obligation_state(p_obligation uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_event  uuid;
  v_deps   jsonb;
  v_dep    text;
  v_blocked boolean := false;
begin
  select event_ref, dependencies into v_event, v_deps
    from public.obligation where id = p_obligation and tenant_id = v_tenant;
  if not found then return null; end if;  -- not visible / not ours

  -- correction outcomes and progress, most-decisive first
  if exists (select 1 from public.execution_evidence
              where obligation_ref = p_obligation and kind = 'invalidated') then
    return 'invalidated';
  end if;
  if exists (select 1 from public.execution_evidence
              where obligation_ref = p_obligation and kind = 'exception') then
    return 'exception';
  end if;
  if exists (select 1 from public.execution_evidence
              where obligation_ref = p_obligation and kind = 'completion') then
    return 'complete';
  end if;
  if exists (select 1 from public.execution_evidence
              where obligation_ref = p_obligation and kind in ('assignment','scan','inspection')) then
    return 'active';
  end if;

  -- otherwise ready/blocked by the dependency predicate over facts
  for v_dep in select jsonb_array_elements_text(coalesce(v_deps,'[]'::jsonb)) loop
    if not public.obligation_nk_complete(v_event, v_dep) then v_blocked := true; end if;
  end loop;
  return case when v_blocked then 'blocked' else 'ready' end;
end $$;


--
-- Name: occurrence_current_supervision(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.occurrence_current_supervision(p_occurrence uuid, p_now timestamp with time zone DEFAULT now()) RETURNS TABLE(source text, authority_org text, window_start timestamp with time zone, window_end timestamp with time zone, certificate_ref text, contact text, record_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with occ as (
    select 'occurrence'::text as source, s.authority_org, s.window_start, s.window_end,
           s.certificate_ref, s.contact, s.id, s.seq
      from public.occurrence_supervision s
     where s.occurrence_id = p_occurrence
       and s.tenant_id = public.current_tenant_id()
       and s.recorded_at <= p_now and not s.cleared
       and not exists (select 1 from public.occurrence_supervision x
                        where x.replaces_id = s.id and x.recorded_at <= p_now)
     order by s.seq desc limit 1),
  eng as (
    select 'engagement'::text as source, g.authority_org, g.window_start, g.window_end,
           g.certificate_ref, g.contact, g.id, g.seq
      from public.engagement_supervision g
      join public.engagement_occurrence o on o.booking_id = g.booking_id
     where o.id = p_occurrence
       and g.tenant_id = public.current_tenant_id()
       and g.recorded_at <= p_now and not g.cleared
       and not exists (select 1 from public.engagement_supervision x
                        where x.replaces_id = g.id and x.recorded_at <= p_now)
     order by g.seq desc limit 1)
  select source, authority_org, window_start, window_end, certificate_ref, contact, id
    from (select * from occ union all select * from eng) u
   order by case when u.source = 'occurrence' then 0 else 1 end
   limit 1;
$$;


--
-- Name: occurrence_current_venue(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.occurrence_current_venue(p_occurrence uuid, p_now timestamp with time zone DEFAULT now()) RETURNS TABLE(source text, venue_id uuid, venue_name text, venue_address text, binding_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with occ as (
    select 'occurrence'::text as source, v.venue_id, v.venue_name_snapshot,
           v.venue_address_snapshot, v.id, v.seq
      from public.occurrence_venue_binding v
     where v.occurrence_id = p_occurrence
       and v.tenant_id = public.current_tenant_id()
       and v.recorded_at <= p_now
       and not exists (select 1 from public.occurrence_venue_binding s
                        where s.replaces_id = v.id and s.recorded_at <= p_now)
     order by v.seq desc limit 1),
  eng as (
    select 'engagement'::text as source, b.venue_id, b.venue_name_snapshot,
           b.venue_address_snapshot, b.id, b.seq
      from public.engagement_venue_binding b
      join public.engagement_occurrence o on o.booking_id = b.booking_id
     where o.id = p_occurrence
       and b.tenant_id = public.current_tenant_id()
       and not exists (select 1 from public.engagement_venue_binding s
                        where s.replaces_binding_id = b.id)
     order by b.seq desc limit 1)
  select source, venue_id, venue_name_snapshot, venue_address_snapshot, id
    from (select * from occ union all select * from eng) u
   order by case when u.source = 'occurrence' then 0 else 1 end
   limit 1;
$$;


--
-- Name: occurrence_is_active(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.occurrence_is_active(p_occurrence uuid, p_now timestamp with time zone DEFAULT now()) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((
    select s.status = 'reinstated'
      from public.occurrence_status s
     where s.occurrence_id = p_occurrence
       and s.tenant_id = public.current_tenant_id()
       and s.recorded_at <= p_now
     order by s.seq desc limit 1), true);
$$;


--
-- Name: open_inquiry(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.open_inquiry(p_booking uuid, p_actor text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_state  text;
  v_props  int;
begin
  select b.spine_state into v_state from public.bookings b
    where b.id = p_booking and b.tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_state is not null then raise exception 'CEREMONY_ALREADY_ON_SPINE'; end if;
  -- THE GUARDRAIL: a legacy engagement with proposals is derived-ahead of
  -- Inquiry; no bridge exists. Only a virgin engagement opens here.
  select count(*) into v_props from public.proposals p where p.booking_id = p_booking;
  if v_props > 0 then raise exception 'CEREMONY_LEGACY_AHEAD'; end if;

  update public.bookings set spine_state = 'inquiry' where id = p_booking;
  insert into public.engagement_ledger (tenant_id, booking_id, ceremony, actor, from_state, to_state)
    values (v_tenant, p_booking, 'opened', p_actor, null, 'inquiry');
  return jsonb_build_object('outcome', 'transitioned', 'to', 'inquiry');
end $$;


--
-- Name: open_inquiry_with_relationship(uuid, text, uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.open_inquiry_with_relationship(p_booking uuid, p_actor text, p_relationship uuid, p_name text, p_kind text, p_phone text, p_email text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_rel    uuid;
  v_kind   text;
  v_found  boolean := false;
begin
  if p_relationship is not null then
    -- FOUND: confirm the party exists in-tenant.
    select r.id into v_rel from public.relationships r
      where r.id = p_relationship and r.tenant_id = v_tenant;
    if not found then raise exception 'CEREMONY_RELATIONSHIP_NOT_FOUND'; end if;
    v_found := true;
  else
    -- CREATED: contact identity is the door requirement.
    if p_name is null or btrim(p_name) = '' then
      raise exception 'CEREMONY_IDENTITY_REQUIRED';
    end if;
    if (p_phone is null or btrim(p_phone) = '') and (p_email is null or btrim(p_email) = '') then
      raise exception 'CEREMONY_IDENTITY_REQUIRED';
    end if;
    v_kind := coalesce(nullif(btrim(p_kind), ''), 'person');
    insert into public.relationships (tenant_id, name, kind, phones, emails, established_by)
      values (v_tenant, btrim(p_name), v_kind,
        case when p_phone is null or btrim(p_phone) = '' then '{}'::text[] else array[btrim(p_phone)] end,
        case when p_email is null or btrim(p_email) = '' then '{}'::text[] else array[lower(btrim(p_email))] end,
        p_actor)
      returning id into v_rel;
  end if;

  -- CEREMONY ONE: PL-1's Open Inquiry, byte-identical, its own single entry.
  -- Any refusal it raises rolls back everything above: no partial residue.
  perform public.open_inquiry(p_booking, p_actor);

  -- The citation.
  update public.bookings set relationship_id = v_rel where id = p_booking;

  -- CEREMONY TWO: Establish/Find — its own single entry.
  insert into public.engagement_ledger (tenant_id, booking_id, ceremony, actor, relationship_ref)
    values (v_tenant, p_booking,
      case when v_found then 'relationship_found' else 'relationship_established' end,
      p_actor, v_rel);
  return jsonb_build_object('outcome', case when v_found then 'found' else 'established' end,
                            'relationship_id', v_rel);
end $$;


--
-- Name: open_occurrence(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.open_occurrence(p_booking uuid, p_display_name text DEFAULT NULL::text, p_occasion_kind text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_ord int; v_id uuid;
begin
  if not public.can_open_occurrence() then
    raise exception 'PROMISE_NOT_AUTHORIZED: occurrence';
  end if;
  perform 1 from public.bookings where id = p_booking and tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;

  select coalesce(max(ordinal), 0) + 1 into v_ord
    from public.engagement_occurrence
   where booking_id = p_booking and tenant_id = v_tenant;

  insert into public.engagement_occurrence
      (tenant_id, booking_id, ordinal, open_basis, opened_by)
    values (v_tenant, p_booking, v_ord, 'declared', public.action_actor())
    returning id into v_id;

  if coalesce(trim(p_display_name),'') <> '' or coalesce(trim(p_occasion_kind),'') <> '' then
    insert into public.occurrence_profile
        (tenant_id, occurrence_id, display_name, occasion_kind, recorded_by)
      values (v_tenant, v_id, nullif(trim(p_display_name),''),
              nullif(trim(p_occasion_kind),''), public.action_actor());
  end if;
  return jsonb_build_object('occurrence_id', v_id, 'ordinal', v_ord);
end $$;


--
-- Name: open_proposing(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.open_proposing(p_booking uuid, p_actor text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_state  text;
begin
  select b.spine_state into v_state from public.bookings b
    where b.id = p_booking and b.tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_state is null then
    return jsonb_build_object('outcome', 'legacy_untouched');
  end if;
  if v_state = 'proposing' then
    return jsonb_build_object('outcome', 'already');
  end if;
  if v_state <> 'inquiry' then raise exception 'CEREMONY_BAD_SOURCE_STATE'; end if;

  update public.bookings set spine_state = 'proposing' where id = p_booking;
  insert into public.engagement_ledger (tenant_id, booking_id, ceremony, actor, from_state, to_state)
    values (v_tenant, p_booking, 'proposing', p_actor, 'inquiry', 'proposing');
  return jsonb_build_object('outcome', 'transitioned', 'to', 'proposing');
end $$;


--
-- Name: operational_day_of(timestamp with time zone, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.operational_day_of(p_at timestamp with time zone, p_tz text, p_hour integer) RETURNS date
    LANGUAGE sql STABLE
    AS $$
  select case when extract(hour from timezone(p_tz, p_at)) < p_hour
              then (timezone(p_tz, p_at))::date - 1
              else (timezone(p_tz, p_at))::date end;
$$;


--
-- Name: operational_day_start(date, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.operational_day_start(p_day date, p_tz text, p_hour integer) RETURNS timestamp with time zone
    LANGUAGE sql STABLE
    AS $$
  select timezone(p_tz, (p_day::timestamp + make_interval(hours => p_hour)));
$$;


--
-- Name: override_component_requirement(uuid, text, uuid, text, text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.override_component_requirement(p_event_component uuid, p_kind text, p_target uuid DEFAULT NULL::uuid, p_param_name text DEFAULT NULL::text, p_param_value text DEFAULT NULL::text, p_requirement jsonb DEFAULT NULL::jsonb, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); ec record; v_err text; v_id uuid;
begin
  if not public.can_manage_library() then raise exception 'LIBRARY_NOT_AUTHORIZED'; end if;
  select * into ec from public.event_components where id=p_event_component and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if ec.profile_revision_id is null then raise exception 'PROFILE_NOT_PINNED'; end if;
  if p_kind='parameter' then
    if p_param_name is null or not public.profile_param_valid(p_param_name)
      then raise exception 'OVERRIDE_INVALID_PARAMETER'; end if;
    if coalesce(trim(p_param_value),'') = '' then raise exception 'OVERRIDE_VALUE_REQUIRED'; end if;
  elsif p_kind in ('suppress','replace') then
    if p_target is null or not exists (select 1 from public.profile_requirement q
        where q.id=p_target and q.revision_id=ec.profile_revision_id and q.tenant_id=v_tenant)
      then raise exception 'OVERRIDE_INVALID_TARGET: must reference a requirement of the pinned revision'; end if;
    if p_kind='suppress' and coalesce(trim(p_reason),'') = ''
      then raise exception 'OVERRIDE_REASON_REQUIRED'; end if;
  end if;
  if p_kind in ('add','replace') then
    if p_requirement is null then raise exception 'OVERRIDE_REQUIREMENT_REQUIRED'; end if;
    v_err := public.profile_requirement_decl_valid(p_requirement);
    if v_err is not null then raise exception '%', v_err; end if;
  end if;
  insert into public.component_profile_override
      (tenant_id, event_component_id, kind, target_requirement_id, param_name, param_value, requirement, reason, actor)
    values (v_tenant, p_event_component, p_kind, p_target, p_param_name, p_param_value, p_requirement,
            nullif(trim(coalesce(p_reason,'')),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('override_id', v_id, 'kind', p_kind);
end $$;


--
-- Name: ownership_history(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ownership_history(p_responsibility uuid) RETURNS TABLE(seq bigint, action text, owner text, prior_owner text, actor text, moment timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select ro.seq, ro.action, ro.owner, ro.prior_owner, ro.actor, ro.moment
    from public.responsibility_owner ro
   where ro.responsibility_ref = p_responsibility
     and ro.tenant_id = public.current_tenant_id()
   order by ro.seq;
$$;


--
-- Name: perform_event_action(text, uuid, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.perform_event_action(p_action_key text, p_target_id uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_idempotency_key text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  reg record; ts record; v_actor text; v_hash text; v_res jsonb; v_evid uuid;
  v_missing text; inv record; v_event uuid; f text;
begin
  if v_tenant is null then
    return public.action_envelope(false,p_action_key,'unauthorized','no_tenant','no authenticated tenant',null,p_target_id,null,null,p_idempotency_key);
  end if;
  select * into reg from public.action_registry() where action_key=p_action_key;
  if not found then
    return public.action_envelope(false,p_action_key,'unknown','unknown_action','no such registered action',null,p_target_id,null,null,p_idempotency_key);
  end if;
  p_payload := coalesce(p_payload,'{}'::jsonb);

  -- reject forbidden privileged payload fields (no client-supplied authority)
  foreach f in array array['tenant_id','tenant','role','actor_role','actor','__proto__'] loop
    if p_payload ? f then
      return public.action_envelope(false,p_action_key,'invalid','forbidden_field','payload may not carry authority fields',reg.target_type,p_target_id,null,null,p_idempotency_key);
    end if;
  end loop;

  -- required-field validation
  select string_agg(k,', ') into v_missing from unnest(public.action_required_fields(p_action_key)) k
    where not (p_payload ? k) or coalesce(p_payload->>k,'')='';
  if v_missing is not null then
    return public.action_envelope(false,p_action_key,'invalid','missing_required','missing required: '||v_missing,reg.target_type,p_target_id,null,null,p_idempotency_key);
  end if;

  -- target ownership / staleness (cross-tenant resolves here as stale, no leak)
  select * into ts from public.action_target_status(reg.target_type, p_target_id);
  if not ts.found then
    return public.action_envelope(false,p_action_key,'stale','stale_target','target not found',reg.target_type,p_target_id,null,null,p_idempotency_key);
  end if;
  v_event := ts.event_ref;

  -- authority (advisory pre-check; the ceremony remains final)
  if not public.action_authorized(p_action_key) then
    return public.action_envelope(false,p_action_key,'unauthorized','unauthorized','actor not authorized',reg.target_type,p_target_id,null,null,p_idempotency_key);
  end if;

  v_actor := public.action_actor();
  v_hash := encode(extensions.digest(p_payload::text,'sha256'),'hex');

  -- idempotency pre-check (deterministic replay / mismatch)
  if p_idempotency_key is not null then
    select * into inv from public.action_invocation where tenant_id=v_tenant and idempotency_key=p_idempotency_key;
    if found then
      if inv.action_key<>p_action_key or inv.target_id<>p_target_id or inv.payload_hash<>v_hash then
        return public.action_envelope(false,p_action_key,'invalid','idempotency_mismatch','idempotency key reused with a different request',reg.target_type,p_target_id,null,null,p_idempotency_key);
      end if;
      return public.action_envelope(true,p_action_key,'duplicate','idempotent_replay','replayed prior result',reg.target_type,p_target_id,inv.result,inv.evidence_ref,p_idempotency_key);
    end if;
  end if;

  -- execute: pending-insert (serialize) → ceremony → persist success. Refusal rolls
  -- back the pending row (savepoint), so a failed attempt never burns the key.
  begin
    if p_idempotency_key is not null then
      begin
        insert into public.action_invocation(tenant_id,action_key,target_id,idempotency_key,payload_hash,actor,outcome)
          values (v_tenant,p_action_key,p_target_id,p_idempotency_key,v_hash,v_actor,'pending');
      exception when unique_violation then
        select * into inv from public.action_invocation where tenant_id=v_tenant and idempotency_key=p_idempotency_key;
        if inv.action_key<>p_action_key or inv.target_id<>p_target_id or inv.payload_hash<>v_hash then
          return public.action_envelope(false,p_action_key,'invalid','idempotency_mismatch','idempotency key reused with a different request',reg.target_type,p_target_id,null,null,p_idempotency_key);
        end if;
        return public.action_envelope(true,p_action_key,'duplicate','idempotent_replay','replayed prior result',reg.target_type,p_target_id,inv.result,inv.evidence_ref,p_idempotency_key);
      end;
    end if;

    -- typed dispatch to EXACTLY the one registered ceremony (no dynamic SQL)
    if    p_action_key='release_event' then
      v_res := public.release_event(p_target_id, v_actor, p_payload->>'signoff_ref', p_payload->>'clearance_ref', p_payload->>'waiver_ref');
      v_event := (v_res->>'event_id')::uuid;
    elsif p_action_key='start_service' then
      v_res := public.start_service(p_target_id, v_actor);
    elsif p_action_key='close_event' then
      v_res := public.close_event(p_target_id, v_actor, p_payload->>'closeout_override');
    elsif p_action_key='record_execution_evidence' then
      v_evid := public.record_execution_evidence(p_target_id, nullif(p_payload->>'obligation','')::uuid, p_payload->>'kind', v_actor,
                  coalesce(p_payload->'payload','{}'::jsonb), nullif(p_payload->>'prior','')::uuid);
      v_res := jsonb_build_object('evidence_id', v_evid);
    elsif p_action_key='assign_staff' then
      v_res := public.assign_staff(p_target_id, (p_payload->>'staff')::uuid, (p_payload->>'window_start')::timestamptz, (p_payload->>'window_end')::timestamptz, v_actor);
    elsif p_action_key='correct_staffing_assignment' then
      v_res := public.correct_staffing_assignment(p_target_id, (p_payload->>'new_staff')::uuid, (p_payload->>'window_start')::timestamptz, (p_payload->>'window_end')::timestamptz, v_actor, p_payload->>'reason');
    elsif p_action_key='release_staffing_assignment' then
      v_res := public.release_staffing_assignment(p_target_id, v_actor, p_payload->>'reason');
    end if;

    if p_idempotency_key is not null then
      update public.action_invocation set outcome='success', result=v_res, evidence_ref=v_evid
        where tenant_id=v_tenant and idempotency_key=p_idempotency_key;
    end if;

    return public.action_envelope(true,p_action_key,'success','ok','action executed',reg.target_type,p_target_id,v_res,v_evid,p_idempotency_key)
      || jsonb_build_object('workspace', case when v_event is not null then public.event_workspace(v_event) else null end,
                            'available_actions', case when v_event is not null then public.event_available_actions(v_event) else null end);

  exception when others then
    -- lawful ceremony refusal (or error): savepoint rolls back the pending row
    return public.action_envelope(false,p_action_key,'refused',public.action_reason_of(sqlerrm),sqlerrm,reg.target_type,p_target_id,null,null,p_idempotency_key);
  end;
end $$;


--
-- Name: profile_current_revision(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profile_current_revision(p_component uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id from public.component_profile_revision
   where library_component_id = p_component and tenant_id = public.current_tenant_id()
   order by seq desc limit 1 $$;


--
-- Name: profile_family_valid(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profile_family_valid(f text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select f in ('space','utility','equipment','labor','time','production','access','environment','consumable') $$;


--
-- Name: profile_kind_valid(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profile_kind_valid(f text, k text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select case f
    when 'space'       then k in ('footprint','frontage','clearance','staging','storage','circulation','queue_area')
    when 'utility'     then k in ('circuit','amperage','voltage','water','drainage','gas','ventilation','data')
    when 'equipment'   then k in ('equipment_item','smallwares','serviceware','transport_container','safety_equipment')
    when 'labor'       then k in ('role_headcount','skill','setup_labor','service_labor','breakdown_labor','supervisor')
    when 'time'        then k in ('lead_time','setup_duration','service_duration','replenishment_interval','breakdown_duration','reset_time')
    when 'production'  then k in ('kitchen_access','commissary','refrigeration','freezer','hot_holding','finishing','plating','dishwashing','sanitation')
    when 'access'      then k in ('loading_access','freight_elevator','stairs','travel_path','vehicle_access','delivery_window','security_checkin','dock_reservation')
    when 'environment' then k in ('indoor_outdoor','weather_protection','fire_restriction','open_flame','noise','floor_loading','food_safety','allergen_separation')
    when 'consumable'  then k in ('fuel','ice','disposables','linens','serving_pieces','replacement_stock','replenishment_qty')
    else false end $$;


--
-- Name: profile_param_valid(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profile_param_valid(p text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select p in ('guest_count','duration_hours','service_points','table_count','location_class',
               'service_style','ware_class','kosher_class','floor_level','travel_class') $$;


--
-- Name: profile_requirement_decl_valid(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profile_requirement_decl_valid(r jsonb) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
begin
  if not public.profile_family_valid(coalesce(r->>'family','')) then return 'REQUIREMENT_INVALID_FAMILY'; end if;
  if not public.profile_kind_valid(r->>'family', coalesce(r->>'kind','')) then return 'REQUIREMENT_INVALID_KIND'; end if;
  if not public.profile_unit_valid(r->>'family', coalesce(r->>'unit','')) then return 'REQUIREMENT_INVALID_UNIT'; end if;
  if coalesce(r->>'basis','') not in ('fixed','per_instance','per_service_point','per_guest','per_guest_band','per_table','per_hour','per_shift','per_batch')
    then return 'REQUIREMENT_INVALID_BASIS'; end if;
  if (r->>'rate') is null then return 'REQUIREMENT_RATE_REQUIRED'; end if;
  if (r->>'basis')='per_guest_band' and coalesce((r->>'band_size')::int,0) <= 0 then return 'REQUIREMENT_BAND_REQUIRED'; end if;
  if coalesce(r->'payload','{}'::jsonb) ?| array['formula','expr','expression','code','script','eval'] then return 'NO_EXECUTABLE_FORMULAS'; end if;
  return null;
end $$;


--
-- Name: profile_unit_valid(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profile_unit_valid(f text, u text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select case f
    when 'space'       then u in ('ft','sqft','in')
    when 'utility'     then u in ('amps','volts','circuits','gpm','cfm','mbps')
    when 'equipment'   then u in ('count')
    when 'labor'       then u in ('people','hours')
    when 'time'        then u in ('minutes','hours','days')
    when 'production'  then u in ('cuft','pans','count','sqft','covers_per_hour')
    when 'access'      then u in ('count','ft','lbs','minutes')
    when 'environment' then u in ('count','db','lbs_per_sqft')
    when 'consumable'  then u in ('count','lbs','gal','bags')
    else false end $$;


--
-- Name: projection_day_sheet(date, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projection_day_sheet(p_day date, p_group_by text DEFAULT 'department'::text, p_now timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_scope  jsonb;
  v_g      text := public.validate_projection_group_by(p_group_by);
  v_out    jsonb;
  -- v292d1: tenant operational calendar resolution. Same pattern
  -- canonical_operational_window uses; current_tenant_id() is a new dependency
  -- edge for this function and is registered as such.
  v_tenant uuid := public.current_tenant_id();
  v_tz     text := public.tenant_operational_timezone(v_tenant);
  v_hour   int  := public.tenant_operational_day_start_hour(v_tenant);
begin
  -- v292d1: window anchored to the tenant operational day, not session midnight.
  v_scope := jsonb_build_object('window', jsonb_build_object(
               'from', (public.operational_day_start(p_day, v_tz, v_hour))::text,
               'to',   (public.operational_day_start(p_day + 1, v_tz, v_hour)
                        - interval '1 microsecond')::text));
  v_out := (
    with f as (select * from public.responsibility_feed(v_scope, p_now)),
         r as (select * from public.risk_findings(v_scope, p_now)),
         g as (select public.projection_group_key(v_g, f.department, f.event_ref, f.state,
                                                  f.owner, f.resource_role) gk,
                      f.responsibility, f.ordering_key from f)
    select public.projection_envelope(
      'day_sheet', 1, p_now, v_scope,
      jsonb_build_object(
        'day', p_day,
        'group_by', v_g,
        'responsibilities', coalesce((select jsonb_agg(to_jsonb(f) order by f.ordering_key) from f),'[]'::jsonb),
        'groups', coalesce((select jsonb_agg(jsonb_build_object('key', x.gk, 'members', x.ids)
                                             order by x.gk)
                              from (select g.gk, jsonb_agg(g.responsibility order by g.ordering_key) ids
                                      from g group by g.gk) x),'[]'::jsonb),
        'risk', coalesce((select jsonb_agg(to_jsonb(r)) from r),'[]'::jsonb)),
      jsonb_build_object(
        'total',     (select count(*) from f),
        'ownerless', (select count(*) from f where f.owner is null),
        'at_risk',   (select count(distinct r.responsibility) from r where r.responsibility is not null),
        'by_state',  coalesce((select jsonb_object_agg(s.state, s.c)
                                 from (select f.state, count(*) c from f group by f.state) s),'{}'::jsonb))));
  return v_out;
end $$;


--
-- Name: projection_department_queue(text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projection_department_queue(p_department text, p_group_by text DEFAULT 'none'::text, p_now timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_scope jsonb; v_g text := public.validate_projection_group_by(p_group_by); v_out jsonb;
begin
  v_scope := jsonb_build_object('department', p_department);
  perform public.validate_projection_filter(v_scope);   -- closed department vocabulary
  v_out := (
    with f as (select * from public.responsibility_feed(v_scope, p_now)),
         r as (select * from public.risk_findings(v_scope, p_now)),
         g as (select public.projection_group_key(v_g, f.department, f.event_ref, f.state,
                                                  f.owner, f.resource_role) gk,
                      f.responsibility, f.ordering_key from f)
    select public.projection_envelope(
      'department_queue', 1, p_now, v_scope,
      jsonb_build_object(
        'department', p_department,
        'group_by',   v_g,
        'responsibilities', coalesce((select jsonb_agg(to_jsonb(f) order by f.ordering_key) from f),'[]'::jsonb),
        'groups', coalesce((select jsonb_agg(jsonb_build_object('key', x.gk, 'members', x.ids)
                                             order by x.gk)
                              from (select g.gk, jsonb_agg(g.responsibility order by g.ordering_key) ids
                                      from g group by g.gk) x),'[]'::jsonb),
        'risk', coalesce((select jsonb_agg(to_jsonb(r)) from r),'[]'::jsonb)),
      jsonb_build_object(
        'total',     (select count(*) from f),
        'ownerless', (select count(*) from f where f.owner is null),
        'at_risk',   (select count(distinct r.responsibility) from r where r.responsibility is not null),
        'by_state',  coalesce((select jsonb_object_agg(s.state, s.c)
                                 from (select f.state, count(*) c from f group by f.state) s),'{}'::jsonb))));
  return v_out;
end $$;


--
-- Name: projection_envelope(text, integer, timestamp with time zone, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projection_envelope(p_name text, p_version integer, p_as_of timestamp with time zone, p_scope jsonb, p_data jsonb, p_counts jsonb) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'projection', p_name,
    'version',    p_version,
    'as_of',      p_as_of,
    'scope',      coalesce(p_scope,'{}'::jsonb),
    'data',       coalesce(p_data,'[]'::jsonb),
    'counts',     coalesce(p_counts,'{}'::jsonb),
    'provenance', jsonb_build_object('truth_version', public.projection_truth_version())
  );
$$;


--
-- Name: projection_event_command(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projection_event_command(p_event uuid, p_now timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_scope jsonb; v_out jsonb;
begin
  if p_event is null then
    raise exception 'PROJECTION_FILTER_INVALID: event command requires an event';
  end if;
  v_scope := jsonb_build_object('event', p_event);
  v_out := (
    with f as (select * from public.responsibility_feed(v_scope, p_now)),
         r as (select * from public.risk_findings(v_scope, p_now))
    select public.projection_envelope(
      'event_command', 1, p_now, v_scope,
      jsonb_build_object(
        'event', p_event,
        'responsibilities', coalesce((select jsonb_agg(to_jsonb(f) order by f.ordering_key) from f),'[]'::jsonb),
        -- board columns are the constitutional vocabulary, nothing invented
        'columns', coalesce((select jsonb_object_agg(s.state, s.ids)
                               from (select f.state,
                                            jsonb_agg(f.responsibility order by f.ordering_key) ids
                                       from f group by f.state) s),'{}'::jsonb),
        'risk', coalesce((select jsonb_agg(to_jsonb(r)) from r),'[]'::jsonb)),
      jsonb_build_object(
        'total',     (select count(*) from f),
        'ownerless', (select count(*) from f where f.owner is null),
        'at_risk',   (select count(distinct r.responsibility) from r where r.responsibility is not null),
        'by_state',  coalesce((select jsonb_object_agg(s.state, s.c)
                                 from (select f.state, count(*) c from f group by f.state) s),'{}'::jsonb))));
  return v_out;
end $$;


--
-- Name: projection_feed(jsonb, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projection_feed(p_filter jsonb DEFAULT '{}'::jsonb, p_now timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_f     jsonb := public.validate_projection_filter(p_filter);
  v_data  jsonb;
  v_counts jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(f) order by f.ordering_key), '[]'::jsonb)
    into v_data from public.responsibility_feed(v_f, p_now) f;

  select jsonb_build_object(
           'total',      count(*),
           'unowned',    count(*) filter (where f.owner is null),
           'at_risk',    count(*) filter (where (f.risk->>'lapse_soon')::boolean
                                            or f.exceptions > 0
                                            or f.state = 'lapsed'),
           'by_state',   coalesce(jsonb_object_agg(f.state, f.n), '{}'::jsonb))
    into v_counts
    from (select f.owner, f.risk, f.exceptions, f.state,
                 count(*) over (partition by f.state) as n
            from public.responsibility_feed(v_f, p_now) f) f;

  return public.projection_envelope('feed', 1, p_now, v_f, v_data, v_counts);
end $$;


--
-- Name: projection_group_key(text, text, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projection_group_key(p_group_by text, p_department text, p_event uuid, p_state text, p_owner text, p_resource_role text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case p_group_by
           when 'department'    then coalesce(p_department,'(none)')
           when 'event'         then coalesce(p_event::text,'(standing)')
           when 'state'         then coalesce(p_state,'(none)')
           when 'owner'         then coalesce(p_owner,'(unassigned)')
           when 'resource_role' then coalesce(p_resource_role,'(none)')
           else '(all)'
         end;
$$;


--
-- Name: projection_occurrence_brief(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projection_occurrence_brief(p_occurrence uuid, p_now timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: projection_occurrences_for_operational_day(date, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projection_occurrences_for_operational_day(p_day date DEFAULT NULL::date, p_now timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_tz     text;
  v_hour   int;
  v_day    date;
  v_out    jsonb;
begin
  if v_tenant is null then
    raise exception 'PROJECTION_SCOPE_REQUIRED: tenant';
  end if;

  v_tz   := public.tenant_operational_timezone(v_tenant);
  v_hour := public.tenant_operational_day_start_hour(v_tenant);

  -- The client is forbidden from computing the operational window. When p_day
  -- is null the projection resolves the current operational day itself and
  -- echoes it (with its inputs) in the scope, so the caller can hand the value
  -- to other day-scoped surfaces without deriving it.
  v_day := coalesce(p_day, public.operational_day_of(p_now, v_tz, v_hour));

  with
  -- Membership pre-filter: equality on operating_date, read through the same
  -- resolver the brief uses internally (promise_current_milestones). Ruled: no
  -- reach-back, no forward horizon; undated occurrences match no day.
  day_members as (
    select o.id
      from public.engagement_occurrence o
      cross join lateral (
        select m.at_date
          from public.promise_current_milestones(o.id, p_now) m
         where m.milestone_key = 'operating_date'
      ) d
     where o.tenant_id = v_tenant
       and d.at_date = v_day
  ),
  -- Sole per-occurrence source. One p_now across every composed brief is
  -- load-bearing: it fixes a single evaluation moment for all rows.
  briefs as (
    select dm.id,
           public.projection_occurrence_brief(dm.id, p_now) as b
      from day_members dm
  ),
  -- Version guard: a silent path relocation in a future brief version must
  -- fail loudly, not emit nulls (OD-20).
  checked as (
    select id,
           case
             when b is null then
               null  -- tenant-scope mismatch inside the brief; excluded below
             when b->>'projection' is distinct from 'occurrence_brief'
               or (b->>'version')::int is distinct from 1 then
               public.v292d_version_mismatch(b->>'projection', b->>'version')
             else b
           end as b
      from briefs
  ),
  rows_ as (
    select
      id,
      b,
      (b->'data'->'identity'->>'active')::boolean            as r_active,
      b->'data'->'identity'->>'display_name'                 as r_display_name,
      (b->'data'->'identity'->>'ordinal')::int               as r_ordinal,
      (b->'counts'->>'missing_promise_facts')::int           as r_missing_count
    from checked
    where b is not null
  )
  select public.projection_envelope(
    'occurrences_for_operational_day', 1, p_now,
    jsonb_build_object(
      'day',            v_day,
      'timezone',       v_tz,
      'day_start_hour', v_hour),
    jsonb_build_object(
      'day', v_day,
      'occurrences', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'occurrence',     r.b->'data'->'identity'->'occurrence',
                 'engagement',     r.b->'data'->'identity'->'engagement',
                 'ordinal',        r.b->'data'->'identity'->'ordinal',
                 'active',         r.b->'data'->'identity'->'active',
                 'display_name',   r.b->'data'->'identity'->'display_name',
                 'client',         r.b->'data'->'identity'->'client',
                 'client_source',  r.b->'data'->'identity'->'client_source',
                 'operating_date', r.b->'data'->'schedule'->'operating_date',
                 'venue',          r.b->'data'->'venue'->'name',
                 'attendance',     r.b->'data'->'attendance'->'current'->'head_count',
                 'contracted',     r.b->'data'->'attendance'->'contracted',
                 'delta',          r.b->'data'->'attendance'->'delta',
                 'has_event',      r.b->'data'->'has_event',
                 'event',          r.b->'data'->'event',
                 'missing',        r.b->'data'->'completeness'->'missing',
                 'missing_count',  r.b->'counts'->'missing_promise_facts')
               -- Ordering (frozen §7): cancelled last, then display name with
               -- nulls last, ordinal, id as the total-order guarantee.
               order by (not r.r_active),
                        r.r_display_name nulls last,
                        r.r_ordinal,
                        r.id)
          from rows_ r), '[]'::jsonb)),
    jsonb_build_object(
      -- released/preparing/cancelled partition total exactly; incomplete is
      -- cross-cutting over active rows only and is NOT part of the partition.
      'total',      (select count(*) from rows_),
      'released',   (select count(*) from rows_ r
                      where r.r_active and (r.b->'data'->>'has_event')::boolean),
      'preparing',  (select count(*) from rows_ r
                      where r.r_active and not (r.b->'data'->>'has_event')::boolean),
      'cancelled',  (select count(*) from rows_ r where not r.r_active),
      'incomplete', (select count(*) from rows_ r
                      where r.r_active and r.r_missing_count > 0)))
  into v_out;

  return v_out;
end $$;


--
-- Name: projection_operations_today(text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projection_operations_today(p_viewer text DEFAULT NULL::text, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_now timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_scope jsonb := '{}'::jsonb;
  v_since timestamptz;
  v_out   jsonb;
begin
  -- The projection owns the window. A caller may still pass an explicit
  -- p_since (the proofs do, to pin a boundary), but nothing needs to: absent
  -- one, the canonical operational window is resolved here, from the tenant's
  -- operating day and this envelope's own as_of. Nothing is read from or
  -- written to storage.
  v_since := coalesce(p_since, public.canonical_operational_window(p_now));

  v_out := (
    with f as (select * from public.responsibility_feed(v_scope, p_now)),
         r as (select * from public.risk_findings(v_scope, p_now)),
         ids as (select coalesce(jsonb_agg(to_jsonb(f) order by f.ordering_key),'[]'::jsonb) d,
                        count(*) n from f),
         -- CHANGED = appeared since the window, or withdrawn since the window
         chg as (
           select f.responsibility, f.ordering_key
             from f join public.obligation o on o.id = f.responsibility
            where o.created_at >= v_since
               or exists (select 1 from public.execution_evidence e
                           where e.obligation_ref = o.id
                             and e.kind = 'superseded'
                             and e.moment >= v_since)
         )
    select public.projection_envelope(
      'operations_today', 1, p_now, v_scope,
      jsonb_build_object(
        'viewer', p_viewer,
        'since',  v_since,
        'responsibilities', (select d from ids),
        'bands', jsonb_build_object(
          'mine',      coalesce((select jsonb_agg(f.responsibility order by f.ordering_key)
                                   from f where p_viewer is not null and f.owner = p_viewer),'[]'::jsonb),
          'ownerless', coalesce((select jsonb_agg(f.responsibility order by f.ordering_key)
                                   from f where f.owner is null),'[]'::jsonb),
          'at_risk',   coalesce((select jsonb_agg(distinct r.responsibility)
                                   from r where r.responsibility is not null),'[]'::jsonb),
          'changed',   coalesce((select jsonb_agg(chg.responsibility order by chg.ordering_key)
                                   from chg),'[]'::jsonb)),
        'events_today', coalesce((select jsonb_agg(distinct f.event_ref)
                                    from f where f.event_ref is not null),'[]'::jsonb),
        'risk', coalesce((select jsonb_agg(to_jsonb(r)) from r),'[]'::jsonb)),
      jsonb_build_object(
        'total',     (select n from ids),
        'mine',      (select count(*) from f where p_viewer is not null and f.owner = p_viewer),
        'ownerless', (select count(*) from f where f.owner is null),
        'at_risk',   (select count(distinct r.responsibility) from r where r.responsibility is not null),
        'changed',   (select count(*) from chg),
        'by_state',  coalesce((select jsonb_object_agg(s.state, s.c)
                                 from (select f.state, count(*) c from f group by f.state) s),'{}'::jsonb))));
  return v_out;
end $$;


--
-- Name: projection_preparation_queue(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projection_preparation_queue(p_now timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_rows   jsonb;
  v_total  int;
  v_incomplete int;
  v_undated    int;
begin
  -- Composed rows. One brief per member; every field below is the brief's own.
  with members as (
    -- Membership: the frozen predicate. occurrence_is_active() is the certified
    -- activity predicate (the same one release_occurrence guards with); the
    -- event table carries one row per released occurrence under its certified
    -- (tenant_id, occurrence_ref) uniqueness. Nothing here interprets
    -- milestones, completeness, or lifecycle.
    select o.id
      from public.engagement_occurrence o
     where o.tenant_id = v_tenant
       and public.occurrence_is_active(o.id, p_now)
       and not exists (select 1 from public.event e
                        where e.occurrence_ref = o.id
                          and e.tenant_id = v_tenant)
  ),
  composed as (
    select m.id,
           public.projection_occurrence_brief(m.id, p_now)->'data' as d
      from members m
  ),
  rows_built as (
    select
      jsonb_build_object(
        'occurrence',     d->'identity'->>'occurrence',
        'engagement',     d->'identity'->>'engagement',
        'ordinal',        (d->'identity'->>'ordinal')::int,
        'active',         (d->'identity'->>'active')::boolean,
        'display_name',   d->'identity'->>'display_name',
        'client',         d->'identity'->>'client',
        'client_source',  d->'identity'->>'client_source',
        'operating_date', d->'schedule'->>'operating_date',
        'venue',          d->'venue'->>'name',
        'attendance',     (d->'attendance'->'current'->>'head_count')::int,
        'contracted',     (d->'attendance'->>'contracted')::int,
        'delta',          (d->'attendance'->>'delta')::int,
        'has_event',      (d->>'has_event')::boolean,
        'event',          d->>'event',
        'missing',        coalesce(d->'completeness'->'missing', '[]'::jsonb),
        'missing_count',  jsonb_array_length(coalesce(d->'completeness'->'missing','[]'::jsonb))
      ) as row_j,
      -- ordering inputs, read from the same composed payload
      (d->'schedule'->>'operating_date')::date as ord_date,
      d->'identity'->>'engagement'             as ord_eng,
      (d->'identity'->>'ordinal')::int         as ord_ordinal,
      d->'identity'->>'occurrence'             as ord_occ
    from composed
  )
  select
    coalesce(jsonb_agg(row_j
             -- The declared ordering, frozen: undated first, then chronological,
             -- then the deterministic triple. No recency, no additional joins.
             order by ord_date asc nulls first, ord_eng, ord_ordinal, ord_occ),
             '[]'::jsonb),
    count(*),
    count(*) filter (where (row_j->>'missing_count')::int > 0),
    count(*) filter (where row_j->>'operating_date' is null)
    into v_rows, v_total, v_incomplete, v_undated
  from rows_built;

  return public.projection_envelope(
    'preparation_queue', 1, p_now,
    jsonb_build_object('basis', 'unreleased'),
    jsonb_build_object('occurrences', v_rows),
    jsonb_build_object(
      'total',      v_total,
      'incomplete', v_incomplete,
      'undated',    v_undated));
end $$;


--
-- Name: projection_truth_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projection_truth_version() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select encode(extensions.digest(
    coalesce((select count(*)::text||':'||coalesce(max(o.created_at)::text,'')
                from public.obligation o where o.tenant_id = public.current_tenant_id()),'') || '|' ||
    coalesce((select count(*)::text||':'||coalesce(max(e.created_at)::text,'')
                from public.execution_evidence e where e.tenant_id = public.current_tenant_id()),'') || '|' ||
    coalesce((select count(*)::text||':'||coalesce(max(r.created_at)::text,'')
                from public.responsibility_owner r where r.tenant_id = public.current_tenant_id()),'')
  ,'sha256'),'hex');
$$;


--
-- Name: promise_append_only_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.promise_append_only_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'PROMISE_EDIT_REFUSED: % is append-only; supersede with a new record and a reason',
    tg_table_name;
end $$;


--
-- Name: promise_current_attendance(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.promise_current_attendance(p_occurrence uuid, p_now timestamp with time zone DEFAULT now()) RETURNS TABLE(id uuid, head_count integer, basis text, effective_moment timestamp with time zone, recorded_at timestamp with time zone, seq bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with eligible as (
    select a.* from public.attendance_commitment a
     where a.occurrence_id = p_occurrence
       and a.tenant_id = public.current_tenant_id()
       and a.recorded_at <= p_now),
  live as (
    select e.* from eligible e
     where not exists (select 1 from eligible s where s.replaces_id = e.id))
  select l.id, l.head_count, l.basis, l.effective_moment, l.recorded_at, l.seq
    from live l
   where l.effective_moment <= p_now
   order by l.effective_moment desc, l.seq desc limit 1;
$$;


--
-- Name: promise_current_engagement_profile(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.promise_current_engagement_profile(p_booking uuid, p_now timestamp with time zone DEFAULT now()) RETURNS TABLE(id uuid, display_name text, client_display_name text, recorded_at timestamp with time zone, seq bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with eligible as (
    select p.* from public.engagement_profile p
     where p.booking_id = p_booking
       and p.tenant_id = public.current_tenant_id()
       and p.recorded_at <= p_now)
  select e.id, e.display_name, e.client_display_name, e.recorded_at, e.seq
    from eligible e
   where not exists (select 1 from eligible s where s.replaces_id = e.id)
   order by e.seq desc limit 1;
$$;


--
-- Name: promise_current_milestones(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.promise_current_milestones(p_occurrence uuid, p_now timestamp with time zone DEFAULT now()) RETURNS TABLE(id uuid, milestone_key text, label text, at_date date, at_moment timestamp with time zone, window_end timestamp with time zone, seq bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with eligible as (
    select m.* from public.occurrence_schedule_milestone m
     where m.occurrence_id = p_occurrence
       and m.tenant_id = public.current_tenant_id()
       and m.recorded_at <= p_now),
  live as (
    select e.* from eligible e
     where not exists (select 1 from eligible s where s.replaces_id = e.id)),
  latest as (
    select distinct on (l.milestone_key, coalesce(l.label,'')) l.*
      from live l order by l.milestone_key, coalesce(l.label,''), l.seq desc)
  select x.id, x.milestone_key, x.label, x.at_date, x.at_moment, x.window_end, x.seq
    from latest x where not x.cleared
   order by coalesce(x.at_moment, x.at_date::timestamptz), x.milestone_key;
$$;


--
-- Name: promise_current_occurrence_profile(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.promise_current_occurrence_profile(p_occurrence uuid, p_now timestamp with time zone DEFAULT now()) RETURNS TABLE(id uuid, display_name text, occasion_kind text, recorded_at timestamp with time zone, seq bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with eligible as (
    select p.* from public.occurrence_profile p
     where p.occurrence_id = p_occurrence
       and p.tenant_id = public.current_tenant_id()
       and p.recorded_at <= p_now)
  select e.id, e.display_name, e.occasion_kind, e.recorded_at, e.seq
    from eligible e
   where not exists (select 1 from eligible s where s.replaces_id = e.id)
   order by e.seq desc limit 1;
$$;


--
-- Name: promise_current_supervision(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.promise_current_supervision(p_booking uuid, p_now timestamp with time zone DEFAULT now()) RETURNS TABLE(id uuid, authority_org text, window_start timestamp with time zone, window_end timestamp with time zone, certificate_ref text, contact text, seq bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with eligible as (
    select s.* from public.engagement_supervision s
     where s.booking_id = p_booking
       and s.tenant_id = public.current_tenant_id()
       and s.recorded_at <= p_now),
  live as (
    select e.* from eligible e
     where not exists (select 1 from eligible x where x.replaces_id = e.id))
  select l.id, l.authority_org, l.window_start, l.window_end,
         l.certificate_ref, l.contact, l.seq
    from live l
   where not l.cleared
   order by l.seq desc limit 1;
$$;


--
-- Name: promise_scheduled_attendance(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.promise_scheduled_attendance(p_occurrence uuid, p_now timestamp with time zone DEFAULT now()) RETURNS TABLE(id uuid, head_count integer, basis text, effective_moment timestamp with time zone, recorded_at timestamp with time zone, seq bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with eligible as (
    select a.* from public.attendance_commitment a
     where a.occurrence_id = p_occurrence
       and a.tenant_id = public.current_tenant_id()
       and a.recorded_at <= p_now),
  live as (
    select e.* from eligible e
     where not exists (select 1 from eligible s where s.replaces_id = e.id))
  select l.id, l.head_count, l.basis, l.effective_moment, l.recorded_at, l.seq
    from live l
   where l.effective_moment > p_now
   order by l.effective_moment asc, l.seq asc;
$$;


--
-- Name: promote_design_to_draft(uuid, jsonb, uuid, text, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.promote_design_to_draft(p_version uuid, p_content jsonb, p_identity uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_taxonomy text DEFAULT NULL::text, p_actor uuid DEFAULT NULL::uuid, p_detail jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_ident  public.blueprint_identities%rowtype;
  v_iid    uuid;
  v_rid    uuid;
  v_num    int;
  v_bad    text[];
begin
  -- tenancy: the promoted design must be the caller's
  if not exists (
    select 1 from public.proposal_versions pv
      join public.proposals p on p.id = pv.proposal_id
      join public.bookings b on b.id = p.booking_id
     where pv.id = p_version and b.tenant_id = v_tenant
  ) then
    raise exception 'PROMOTE: design version not found';
  end if;

  -- §5 belt: barred material refuses by name before anything exists
  v_bad := public.blueprint_barred_keys(coalesce(p_content, '{}'::jsonb));
  if array_length(v_bad, 1) is not null then
    raise exception 'PROMOTION_BARRED_CONTENT: %', array_to_json(v_bad)::text;
  end if;

  if p_identity is not null then
    select * into v_ident from public.blueprint_identities
      where id = p_identity for update;
    if not found or v_ident.tenant_id is distinct from v_tenant then
      raise exception 'PROMOTE: identity not found';
    end if;
    if v_ident.status <> 'active' then
      raise exception 'PROMOTION_TARGET_RETIRED';
    end if;
    if exists (select 1 from public.blueprint_revisions
                where identity_id = p_identity and state = 'draft') then
      raise exception 'PROMOTION_TARGET_BUSY: the identity already carries a draft';
    end if;
    v_iid := p_identity;
  else
    if coalesce(trim(p_name), '') = '' then
      raise exception 'PROMOTION_NAME_REQUIRED';
    end if;
    insert into public.blueprint_identities (tenant_id, name, taxonomy)
      values (v_tenant, trim(p_name), nullif(trim(coalesce(p_taxonomy,'')), ''))
      returning id into v_iid;
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_num
    from public.blueprint_revisions where identity_id = v_iid;

  -- ONE draft. state defaults to 'draft'; no publish statement exists here.
  insert into public.blueprint_revisions
      (identity_id, revision_number, content, promoted_from_version_id)
    values (v_iid, v_num, p_content, p_version)
    returning id into v_rid;

  insert into public.blueprint_shelf_acts (tenant_id, identity_id, revision_id, act, actor, detail)
    values (v_tenant, v_iid, v_rid, 'promote', p_actor,
            coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('source_version', p_version));

  return jsonb_build_object('identity_id', v_iid, 'revision_id', v_rid, 'revision_number', v_num);
end $$;


--
-- Name: publish_blueprint_revision(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_blueprint_revision(p_revision uuid, p_declaration text, p_actor uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_rev   public.blueprint_revisions%rowtype;
  v_ident public.blueprint_identities%rowtype;
  v_prior uuid;
begin
  if p_declaration is distinct from 'This revision is now organizational knowledge.' then
    raise exception 'PUBLISH_INTENT_REQUIRED';
  end if;
  select * into v_rev from public.blueprint_revisions where id = p_revision for update;
  if not found then raise exception 'REVISION_NOT_FOUND'; end if;
  select * into v_ident from public.blueprint_identities where id = v_rev.identity_id for update;
  if v_ident.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'REVISION_NOT_FOUND';
  end if;
  if v_rev.state <> 'draft' then raise exception 'ONLY_DRAFTS_PUBLISH'; end if;
  if v_ident.status <> 'active' then raise exception 'IDENTITY_RETIRED'; end if;
  v_prior := v_ident.published_revision_id;
  if v_prior is not null then
    update public.blueprint_revisions set state = 'superseded' where id = v_prior;
  end if;
  update public.blueprint_revisions
     set state = 'published', published_at = now(), published_by = p_actor,
         supersedes_revision_id = v_prior
   where id = p_revision;
  update public.blueprint_identities set published_revision_id = p_revision where id = v_ident.id;
  insert into public.blueprint_shelf_acts (tenant_id, identity_id, revision_id, act, declaration, actor)
    values (v_ident.tenant_id, v_ident.id, p_revision, 'publish', p_declaration, p_actor);
  return p_revision;
end $$;


--
-- Name: publish_offer(uuid, text, uuid, jsonb, jsonb, text, text, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_offer(p_version uuid, p_actor text, p_staged uuid, p_policy jsonb, p_profile jsonb, p_evidence text, p_channel text, p_occurred_at timestamp with time zone, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  if encode(public.digest(v_stg.artifact_bytes, 'sha256'), 'hex') is distinct from v_stg.artifact_hash then
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

  -- v284: embed the operational basis server-side for pinned components and
  -- render their legacy requirement arrays from it; unpinned components pass
  -- through byte-untouched (I-I5/I-I6).
  v_stg.model := public.embed_operational_basis(p_version, v_stg.model);

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
end $$;


--
-- Name: race292_arm(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.race292_arm() RETURNS text
    LANGUAGE plpgsql
    AS $$
declare v_t uuid; v_u uuid; v_b uuid;
begin
  delete from race292_barrier; delete from race292_setup; delete from race292_result;
  select tu.tenant_id, tu.user_id into v_t, v_u
    from public.tenant_users tu where tu.active order by tu.tenant_id limit 1;
  perform set_config('app.user_id', v_u::text, false);
  perform set_config('request.jwt.claim.sub', v_u::text, false);

  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_t, 'RaceClient', 'R292-'||substr(gen_random_uuid()::text,1,8), 'active')
    returning id into v_b;

  -- a baseline so both backends are AMENDING, which is the contended path
  perform public.commit_attendance(v_b, 300, 'contracted', now() - interval '1 day', null);
  perform public.set_schedule_milestone(v_b, 'service_start', null,
            now() + interval '6 hours', null, null, null);

  insert into race292_setup values (v_b, v_t, v_u);
  insert into race292_barrier values (clock_timestamp() + interval '2 seconds');
  return 'armed booking '||v_b::text;
end $$;


--
-- Name: race292_backend_a(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.race292_backend_a() RETURNS text
    LANGUAGE plpgsql
    AS $$
declare v_s record; v_at timestamptz; v_note text := '';
begin
  select * into v_s from race292_setup;
  perform set_config('app.user_id', v_s.user_id::text, false);
  perform set_config('request.jwt.claim.sub', v_s.user_id::text, false);
  select armed_at into v_at from race292_barrier;
  while clock_timestamp() < v_at loop perform pg_sleep(0.01); end loop;

  begin
    perform public.commit_attendance(v_s.booking_id, 285, 'guaranteed',
              now() - interval '1 hour', 'backend A guarantee');
    v_note := 'attendance committed';
  exception when others then v_note := 'attendance refused: '||sqlerrm; end;

  begin
    perform public.set_schedule_milestone(v_s.booking_id, 'service_start', null,
              now() + interval '7 hours', null, null, 'backend A moved service');
    v_note := v_note||' | milestone amended';
  exception when others then v_note := v_note||' | milestone refused: '||sqlerrm; end;

  insert into race292_result values ('A', 'done', v_note)
    on conflict (backend) do update set outcome = 'done', detail = excluded.detail;
  return v_note;
end $$;


--
-- Name: race292_backend_b(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.race292_backend_b() RETURNS text
    LANGUAGE plpgsql
    AS $$
declare v_s record; v_at timestamptz; v_note text := '';
begin
  select * into v_s from race292_setup;
  perform set_config('app.user_id', v_s.user_id::text, false);
  perform set_config('request.jwt.claim.sub', v_s.user_id::text, false);
  select armed_at into v_at from race292_barrier;
  while clock_timestamp() < v_at loop perform pg_sleep(0.01); end loop;

  begin
    perform public.commit_attendance(v_s.booking_id, 291, 'guaranteed',
              now() - interval '1 hour', 'backend B guarantee');
    v_note := 'attendance committed';
  exception when others then v_note := 'attendance refused: '||sqlerrm; end;

  begin
    perform public.set_schedule_milestone(v_s.booking_id, 'service_start', null,
              now() + interval '8 hours', null, null, 'backend B moved service');
    v_note := v_note||' | milestone amended';
  exception when others then v_note := v_note||' | milestone refused: '||sqlerrm; end;

  insert into race292_result values ('B', 'done', v_note)
    on conflict (backend) do update set outcome = 'done', detail = excluded.detail;
  return v_note;
end $$;


--
-- Name: race292_verdict(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.race292_verdict() RETURNS SETOF text
    LANGUAGE plpgsql
    AS $$
declare
  v_s record; failed boolean := false;
  n_backends int; n_att int; n_cur_att int; n_dup_chain int; n_live_att int;
  n_mile int; n_cur_mile int; n_dup_mile int;
begin
  select * into v_s from race292_setup;
  perform set_config('app.user_id', v_s.user_id::text, false);
  perform set_config('request.jwt.claim.sub', v_s.user_id::text, false);

  select count(*) into n_backends from race292_result;
  if n_backends <> 2 then
    return next 'RACE-PC1 INCONCLUSIVE: '||n_backends||' backend(s) reported — run both in parallel';
    return;
  end if;

  -- ── RACE-PC1 · attendance ────────────────────────────────────────────────
  select count(*) into n_att from public.attendance_commitment
   where booking_id = v_s.booking_id;
  select count(*) into n_cur_att from public.promise_current_attendance(v_s.booking_id, now());
  select count(*) into n_dup_chain from (
    select replaces_id from public.attendance_commitment
     where booking_id = v_s.booking_id and replaces_id is not null
     group by replaces_id having count(*) > 1) x;
  select count(*) into n_live_att from public.attendance_commitment a
   where a.booking_id = v_s.booking_id
     and not exists (select 1 from public.attendance_commitment s where s.replaces_id = a.id);

  if n_att = 3 then
    return next 'RACE-PC1a PASS: both concurrent commitments survived alongside the baseline — 3 records, no amendment lost under contention';
  else
    return next 'RACE-PC1a FAIL: '||n_att||' attendance record(s), expected 3'; failed := true;
  end if;

  if n_dup_chain = 0 then
    return next 'RACE-PC1b PASS: no two records claim the same predecessor — the supersession chain did not fork';
  else
    return next 'RACE-PC1b FAIL: '||n_dup_chain||' forked chain link(s)'; failed := true;
  end if;

  if n_cur_att = 1 then
    return next 'RACE-PC1c PASS: exactly one attendance count is current after both commits settled — the resolver is unambiguous under contention';
  else
    return next 'RACE-PC1c FAIL: resolver returned '||n_cur_att||' current row(s)'; failed := true;
  end if;

  -- ── RACE-PC2 · schedule ──────────────────────────────────────────────────
  select count(*) into n_mile from public.engagement_schedule_milestone
   where booking_id = v_s.booking_id and milestone_key = 'service_start';
  select count(*) into n_cur_mile from public.promise_current_milestones(v_s.booking_id, now())
   where milestone_key = 'service_start';
  select count(*) into n_dup_mile from (
    select replaces_id from public.engagement_schedule_milestone
     where booking_id = v_s.booking_id and milestone_key = 'service_start'
       and replaces_id is not null
     group by replaces_id having count(*) > 1) y;

  if n_dup_mile = 0 then
    return next 'RACE-PC2a PASS: concurrent amendment of one milestone produced no forked chain — `for update` on the engagement root serialised the read-then-append';
  else
    return next 'RACE-PC2a FAIL: '||n_dup_mile||' forked milestone link(s)'; failed := true;
  end if;

  if n_cur_mile = 1 then
    return next 'RACE-PC2b PASS: exactly one service_start is current — a concurrent amendment cannot leave the schedule ambiguous';
  else
    return next 'RACE-PC2b FAIL: '||n_cur_mile||' current service_start row(s)'; failed := true;
  end if;

  -- both backends must have been genuinely admitted; a race in which one was
  -- refused outright would prove serialisation but not survival
  if exists (select 1 from race292_result where detail like '%refused%') then
    return next 'RACE-PC2c NOTE: a backend was refused — '||
      (select string_agg(backend||': '||detail, ' / ') from race292_result);
  else
    return next 'RACE-PC2c PASS: neither backend was refused — both amendments were admitted and ordered, not serialised by rejection';
  end if;

  if failed then return next 'v292a RACE FAILED';
  else return next 'v292a RACE COMPLETE — all claims passed'; end if;
end $$;


--
-- Name: race292a1_arm(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.race292a1_arm() RETURNS text
    LANGUAGE plpgsql
    AS $$
declare v_t uuid; v_u uuid; v_b uuid; v_p uuid; v_v uuid; v_s uuid; v_o1 uuid; v_o2 uuid;
begin
  delete from race292a1_barrier; delete from race292a1_setup; delete from race292a1_result;
  select tu.tenant_id, tu.user_id into v_t, v_u from public.tenant_users tu
   where tu.active order by tu.tenant_id limit 1;
  perform set_config('app.user_id', v_u::text, false);
  perform set_config('request.jwt.claim.sub', v_u::text, false);
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_t,'RaceWeekend','R1-'||substr(gen_random_uuid()::text,1,8),'active') returning id into v_b;
  insert into public.proposals (tenant_id, booking_id, title, status)
    values (v_t, v_b, 'P', 'draft') returning id into v_p;
  insert into public.proposal_versions (tenant_id, proposal_id, version, status)
    values (v_t, v_p, 1, 'sent') returning id into v_v;
  insert into public.offer_snapshots (tenant_id, version_id, fingerprint, model,
      artifact_bytes, artifact_hash, artifact_meta, assets)
    values (v_t, v_v, 'fp-'||substr(gen_random_uuid()::text,1,8), '{}'::jsonb,
            '\x00'::bytea,'h','{}'::jsonb,'{}'::jsonb) returning id into v_s;
  insert into public.offer_acceptances (tenant_id, snapshot_id, fingerprint, booking_id,
      principal, authority_basis, evidence_basis, channel, recorded_moment)
    values (v_t, v_s, 'fp', v_b, '{}'::jsonb, 'b','b','portal', now());
  v_o1 := (public.open_occurrence(v_b,'Friday dinner','shabbos_meal')->>'occurrence_id')::uuid;
  v_o2 := (public.open_occurrence(v_b,'Sunday brunch','brunch')->>'occurrence_id')::uuid;
  insert into race292a1_setup values (v_b, v_o1, v_o2, v_t, v_u);
  insert into race292a1_barrier values (clock_timestamp() + interval '2 seconds');
  return 'armed';
end $$;


--
-- Name: race292a1_backend_a(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.race292a1_backend_a() RETURNS text
    LANGUAGE plpgsql
    AS $$
declare s record; v_at timestamptz; note text := '';
begin
  select * into s from race292a1_setup;
  perform set_config('app.user_id', s.user_id::text, false);
  perform set_config('request.jwt.claim.sub', s.user_id::text, false);
  select armed_at into v_at from race292a1_barrier;
  while clock_timestamp() < v_at loop perform pg_sleep(0.01); end loop;
  begin perform public.release_occurrence(s.o1,'A','signoff','clearance',null);
        note := 'released_o1';
  exception when others then note := 'o1_refused:'||sqlerrm; end;
  begin perform public.open_occurrence(s.booking_id,'A extra',null); note := note||' | opened';
  exception when others then note := note||' | open_refused:'||sqlerrm; end;
  insert into race292a1_result values ('A', note)
    on conflict (backend) do update set detail = excluded.detail;
  return note;
end $$;


--
-- Name: race292a1_backend_b(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.race292a1_backend_b() RETURNS text
    LANGUAGE plpgsql
    AS $$
declare s record; v_at timestamptz; note text := '';
begin
  select * into s from race292a1_setup;
  perform set_config('app.user_id', s.user_id::text, false);
  perform set_config('request.jwt.claim.sub', s.user_id::text, false);
  select armed_at into v_at from race292a1_barrier;
  while clock_timestamp() < v_at loop perform pg_sleep(0.01); end loop;
  begin perform public.release_occurrence(s.o1,'B','signoff','clearance',null);
        note := 'released_o1';
  exception when others then note := 'o1_refused:'||sqlerrm; end;
  begin perform public.release_occurrence(s.o2,'B','signoff','clearance',null);
        note := note||' | released_o2';
  exception when others then note := note||' | o2_refused:'||sqlerrm; end;
  insert into race292a1_result values ('B', note)
    on conflict (backend) do update set detail = excluded.detail;
  return note;
end $$;


--
-- Name: race292a1_verdict(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.race292a1_verdict() RETURNS SETOF text
    LANGUAGE plpgsql
    AS $$
declare s record; failed boolean := false; n int; m int; k int;
begin
  select * into s from race292a1_setup;
  perform set_config('app.user_id', s.user_id::text, false);
  perform set_config('request.jwt.claim.sub', s.user_id::text, false);
  select count(*) into n from race292a1_result;
  if n <> 2 then
    return next 'RACE-OC INCONCLUSIVE: '||n||' backend(s) reported'; return;
  end if;

  select count(*) into n from public.event where occurrence_ref = s.o1;
  if n = 1 then
    return next 'RACE-OC1a PASS: two backends released the same occurrence and exactly ONE event exists — I-31′ holds under genuine contention';
  else return next 'RACE-OC1a FAIL: '||n||' event(s) for one occurrence'; failed := true; end if;

  select count(*) into m from race292a1_result where detail like '%o1_refused:RELEASE_ALREADY_RELEASED%';
  if m = 1 then
    return next 'RACE-OC1b PASS: the losing backend was refused with RELEASE_ALREADY_RELEASED — it learned it lost rather than silently succeeding';
  else return next 'RACE-OC1b FAIL: '||m||' backend(s) saw the already-released refusal'; failed := true; end if;

  select count(*) into k from public.event where occurrence_ref = s.o2;
  if k = 1 then
    return next 'RACE-OC2 PASS: the second occurrence released CONCURRENTLY — serialisation lives on the occurrence, so one meal of a weekend never blocks another';
  else return next 'RACE-OC2 FAIL: '||k||' event(s) for the sibling occurrence'; failed := true; end if;

  select count(*) into n from public.engagement_occurrence where booking_id = s.booking_id;
  select count(distinct ordinal) into m from public.engagement_occurrence where booking_id = s.booking_id;
  if n = m and n >= 3 then
    return next 'RACE-OC3 PASS: concurrent opening produced '||n||' occurrences with '||m||' distinct ordinals — no collision, no gap';
  else return next 'RACE-OC3 FAIL: '||n||' occurrence(s), '||m||' distinct ordinal(s)'; failed := true; end if;

  if failed then return next 'v292a1 RACE FAILED';
  else return next 'v292a1 RACE COMPLETE — all claims passed'; end if;
end $$;


--
-- Name: record_evidence(uuid, text, text, uuid, bytea, text, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_evidence(p_venue uuid, p_kind text, p_label text, p_walkthrough uuid DEFAULT NULL::uuid, p_bytes bytea DEFAULT NULL::bytea, p_hash text DEFAULT NULL::text, p_meta jsonb DEFAULT '{}'::jsonb, p_replaces uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid; v_hash text;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  perform 1 from public.venue where id=p_venue and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if p_walkthrough is not null and not exists
     (select 1 from public.venue_walkthrough w where w.id=p_walkthrough and w.venue_id=p_venue and w.tenant_id=v_tenant)
    then raise exception 'OBSERVATION_INVALID_SCOPE'; end if;
  if p_replaces is not null and not exists
     (select 1 from public.venue_evidence e where e.id=p_replaces and e.venue_id=p_venue and e.tenant_id=v_tenant)
    then raise exception 'EVIDENCE_INVALID_REPLACES'; end if;
  v_hash := case when p_bytes is not null then encode(extensions.digest(p_bytes,'sha256'),'hex') else p_hash end;
  if coalesce(v_hash,'') = '' then raise exception 'EVIDENCE_HASH_REQUIRED'; end if;
  insert into public.venue_evidence
      (tenant_id, venue_id, walkthrough_id, kind, label, content_bytes, content_hash, meta, replaces_evidence_id, uploaded_by)
    values (v_tenant, p_venue, p_walkthrough, p_kind, p_label, p_bytes, v_hash,
            coalesce(p_meta,'{}'::jsonb), p_replaces, public.action_actor())
    returning id into v_id;
  return jsonb_build_object('evidence_id', v_id, 'content_hash', v_hash);
end $$;


--
-- Name: record_execution_evidence(uuid, uuid, text, text, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_execution_evidence(p_event uuid, p_obligation uuid, p_kind text, p_actor text, p_payload jsonb DEFAULT '{}'::jsonb, p_prior uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_event  uuid;
  v_id     uuid;
begin
  -- resolve event under tenant (via the obligation when event not given directly)
  if p_obligation is not null then
    select event_ref into v_event from public.obligation
      where id = p_obligation and tenant_id = v_tenant;
    if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
    if p_event is not null and p_event <> v_event then
      raise exception 'EVIDENCE_EVENT_MISMATCH';
    end if;
  else
    select id into v_event from public.event where id = p_event and tenant_id = v_tenant;
    if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  end if;

  if p_kind not in ('released','clearance','sign_off','assignment','scan','inspection',
                    'completion','exception','invalidated','superseded','cancelled') then
    raise exception 'EVIDENCE_KIND_INVALID: %', p_kind;
  end if;

  insert into public.execution_evidence (tenant_id,event_ref,obligation_ref,kind,actor,payload,prior_ref)
    values (v_tenant, v_event, p_obligation, p_kind, p_actor, coalesce(p_payload,'{}'::jsonb), p_prior)
    returning id into v_id;
  return v_id;
end $$;


--
-- Name: record_observation(uuid, text, text, jsonb, text, timestamp with time zone, uuid, uuid, uuid, text, text, text, timestamp with time zone, timestamp with time zone, text, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_observation(p_venue uuid, p_attribute text, p_value_kind text, p_value jsonb, p_source_class text, p_observed_at timestamp with time zone, p_walkthrough uuid DEFAULT NULL::uuid, p_scope_space uuid DEFAULT NULL::uuid, p_scope_space2 uuid DEFAULT NULL::uuid, p_narrative text DEFAULT NULL::text, p_method text DEFAULT NULL::text, p_confidence text DEFAULT NULL::text, p_effective timestamp with time zone DEFAULT NULL::timestamp with time zone, p_expires timestamp with time zone DEFAULT NULL::timestamp with time zone, p_condition text DEFAULT NULL::text, p_evidence uuid[] DEFAULT '{}'::uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  perform 1 from public.venue where id=p_venue and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if coalesce(trim(p_attribute),'') = '' then raise exception 'OBSERVATION_ATTRIBUTE_REQUIRED'; end if;
  if p_value is null or p_value = 'null'::jsonb or (jsonb_typeof(p_value)='object' and p_value='{}'::jsonb)
    then raise exception 'OBSERVATION_VALUE_REQUIRED: structured value may not be empty (narrative cannot replace it)'; end if;
  insert into public.venue_observation
      (tenant_id, venue_id, walkthrough_id, scope_space_id, scope_space2_id, attribute_key,
       value_kind, value, narrative, observer, observed_at, source_class, method, confidence,
       effective_at, expires_at, condition_key, evidence_refs, created_by)
    values (v_tenant, p_venue, p_walkthrough, p_scope_space, p_scope_space2, trim(p_attribute),
            p_value_kind, p_value, p_narrative, public.action_actor(), p_observed_at, p_source_class,
            p_method, p_confidence, p_effective, p_expires, p_condition, coalesce(p_evidence,'{}'), public.action_actor())
    returning id into v_id;   -- check constraints enforce I-V6; trigger enforces I-V7
  return jsonb_build_object('observation_id', v_id);
end $$;


--
-- Name: record_walkthrough(uuid, text, timestamp with time zone, uuid, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_walkthrough(p_venue uuid, p_purpose text, p_conducted_at timestamp with time zone, p_engagement uuid DEFAULT NULL::uuid, p_participants jsonb DEFAULT '[]'::jsonb, p_rep_involvement text DEFAULT 'none'::text, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  perform 1 from public.venue where id=p_venue and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  insert into public.venue_walkthrough
      (tenant_id, venue_id, engagement_ref, purpose, conducted_at, participants, rep_involvement, notes, created_by)
    values (v_tenant, p_venue, p_engagement, p_purpose, p_conducted_at,
            coalesce(p_participants,'[]'::jsonb), coalesce(p_rep_involvement,'none'), p_notes, public.action_actor())
    returning id into v_id;
  return jsonb_build_object('walkthrough_id', v_id);
end $$;


--
-- Name: refresh_component_profile(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_component_profile(p_event_component uuid, p_revision uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); ec record; v_rev uuid; v_no int; orphaned int;
begin
  if not public.can_manage_library() then raise exception 'LIBRARY_NOT_AUTHORIZED'; end if;
  select * into ec from public.event_components where id=p_event_component and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if ec.library_component_id is null then raise exception 'PROFILE_NOT_PINNED'; end if;
  v_rev := coalesce(p_revision, public.profile_current_revision(ec.library_component_id));
  if v_rev is null then raise exception 'PROFILE_NO_REVISION'; end if;
  update public.event_components set profile_revision_id = v_rev
   where id = p_event_component and tenant_id = v_tenant;   -- whole-revision adoption
  select revision_no into v_no from public.component_profile_revision where id=v_rev;
  select count(*) into orphaned from public.component_profile_override o
    where o.event_component_id=p_event_component and o.tenant_id=v_tenant
      and o.kind in ('suppress','replace')
      and not exists (select 1 from public.profile_requirement q
                       where q.id=o.target_requirement_id and q.revision_id=v_rev);
  return jsonb_build_object('event_component_id', p_event_component,
                            'profile_revision_id', v_rev, 'revision_no', v_no,
                            'orphaned_overrides', orphaned);
end $$;


--
-- Name: reinstate_blueprint_identity(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reinstate_blueprint_identity(p_identity uuid, p_actor uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare v_ident public.blueprint_identities%rowtype;
begin
  select * into v_ident from public.blueprint_identities where id = p_identity for update;
  if not found or v_ident.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'IDENTITY_NOT_FOUND';
  end if;
  if v_ident.status <> 'retired' then raise exception 'NOT_RETIRED'; end if;
  update public.blueprint_identities set status = 'active', retired_at = null where id = p_identity;
  insert into public.blueprint_shelf_acts (tenant_id, identity_id, act, actor)
    values (v_ident.tenant_id, p_identity, 'reinstate', p_actor);
  return p_identity;
end $$;


--
-- Name: release_event(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_event(p_booking uuid, p_actor text, p_signoff_ref text DEFAULT NULL::text, p_clearance_ref text DEFAULT NULL::text, p_waiver_ref text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_occ uuid; v_n int; v_ord int;
begin
  perform 1 from public.bookings where id = p_booking and tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;

  select count(*) into v_n from public.engagement_occurrence
   where booking_id = p_booking and tenant_id = v_tenant;

  if v_n > 1 then
    raise exception 'RELEASE_OCCURRENCE_AMBIGUOUS: engagement holds % occurrences (%); call release_occurrence',
      v_n, (select string_agg(ordinal::text, ',' order by ordinal)
              from public.engagement_occurrence
             where booking_id = p_booking and tenant_id = v_tenant);
  elsif v_n = 1 then
    select id into v_occ from public.engagement_occurrence
     where booking_id = p_booking and tenant_id = v_tenant;
  else
    -- COMPATIBILITY AFFORDANCE, marked and inspectable. Nobody declared this
    -- occurrence; a legacy release implied it.
    select coalesce(max(ordinal), 0) + 1 into v_ord from public.engagement_occurrence
     where booking_id = p_booking and tenant_id = v_tenant;
    insert into public.engagement_occurrence
        (tenant_id, booking_id, ordinal, open_basis, opened_by)
      values (v_tenant, p_booking, v_ord, 'release_implied', p_actor)
      returning id into v_occ;
  end if;

  return public.release_occurrence(v_occ, p_actor, p_signoff_ref, p_clearance_ref, p_waiver_ref);
end $$;


--
-- Name: release_occurrence(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_occurrence(p_occurrence uuid, p_actor text, p_signoff_ref text DEFAULT NULL::text, p_clearance_ref text DEFAULT NULL::text, p_waiver_ref text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_occ record; v_acc uuid; v_event uuid; v_gen integer;
begin
  select * into v_occ from public.engagement_occurrence
   where id = p_occurrence and tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if not public.occurrence_is_active(p_occurrence, now()) then
    raise exception 'OCCURRENCE_CANCELLED';
  end if;

  -- PREDICATE (default-deny, layered) over IMMUTABLE facts — unchanged from v275
  select a.id into v_acc
    from public.offer_acceptances a
    left join public.acceptance_rescissions r on r.acceptance_id = a.id
   where a.booking_id = v_occ.booking_id and a.tenant_id = v_tenant and r.id is null
   order by a.created_at limit 1;
  if not found then
    raise exception 'RELEASE_PREDICATE_UNSATISFIED: commitment (no unrescinded acceptance)';
  end if;
  if p_clearance_ref is null and p_waiver_ref is null then
    raise exception 'RELEASE_PREDICATE_UNSATISFIED: clearance (no deposit/credit/waiver evidence)';
  end if;
  if p_signoff_ref is null then
    raise exception 'RELEASE_PREDICATE_UNSATISFIED: sign_off (no operator release attestation)';
  end if;

  -- MATERIALIZE the event exactly once per OCCURRENCE (I-31′)
  insert into public.event (tenant_id, engagement_ref, occurrence_ref,
                            origin_commitment_ref, released_by)
    values (v_tenant, v_occ.booking_id, p_occurrence, v_acc, p_actor)
    on conflict (tenant_id, occurrence_ref) do nothing
    returning id into v_event;
  if v_event is null then raise exception 'RELEASE_ALREADY_RELEASED'; end if;

  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_event, 'released', p_actor, jsonb_build_object('acceptance', v_acc));
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_event, 'sign_off', p_actor, jsonb_build_object('signoff_ref', p_signoff_ref));
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_event, 'clearance', p_actor,
            case when p_waiver_ref is not null
                 then jsonb_build_object('waiver_ref', p_waiver_ref)
                 else jsonb_build_object('clearance_ref', p_clearance_ref) end);

  v_gen := public.generate_obligations(v_event);
  return jsonb_build_object('event_id', v_event, 'occurrence_id', p_occurrence,
                            'generated_count', v_gen);
end $$;


--
-- Name: release_promise(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_promise(p_occurrence uuid, p_signoff_ref text DEFAULT NULL::text, p_clearance_ref text DEFAULT NULL::text, p_waiver_ref text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor text := public.action_actor();
begin
  if not public.is_active_member() then
    raise exception 'PROMISE_NOT_AUTHORIZED: release';
  end if;

  -- Delegation only. CEREMONY_NOT_FOUND, OCCURRENCE_CANCELLED,
  -- RELEASE_PREDICATE_UNSATISFIED (commitment | clearance | sign_off) and
  -- RELEASE_ALREADY_RELEASED all surface from the certified ceremony unaltered,
  -- as do the once-per-occurrence materialisation (I-31') and the
  -- generate_obligations derivation that follows it.
  return public.release_occurrence(
           p_occurrence, v_actor, p_signoff_ref, p_clearance_ref, p_waiver_ref);
end $$;


--
-- Name: release_staffing_assignment(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_staffing_assignment(p_assignment uuid, p_actor text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_req uuid;
begin
  if not public.can_manage_staffing() then raise exception 'STAFFING_NOT_AUTHORIZED'; end if;
  select requirement_ref into v_req from public.staffing_assignment where id=p_assignment and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.staffing_requirement where id=v_req and tenant_id=v_tenant for update;
  if exists (select 1 from public.staffing_release where assignment_ref=p_assignment)
    then raise exception 'STAFFING_ALREADY_RELEASED'; end if;
  insert into public.staffing_release (tenant_id,assignment_ref,actor,reason) values (v_tenant,p_assignment,p_actor,p_reason);
  return jsonb_build_object('released', p_assignment, 'coverage', public.requirement_coverage(v_req));
end $$;


--
-- Name: render_legacy_requirements(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.render_legacy_requirements(p_basis jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    AS $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select case
      when e->>'family' = 'labor' then
        jsonb_build_object('category','staff',
          'role', coalesce(e->'payload'->>'role', e->>'label'),
          'quantity', coalesce((e->'resolution'->>'quantity')::numeric, (e->>'rate')::numeric))
      when e->>'family' = 'equipment' and e->>'provision_source' = 'rented' then
        jsonb_build_object('category','rental','item', e->>'label')
      when e->>'family' = 'equipment' then
        jsonb_build_object('category','equipment','item', e->>'label')
      when e->>'family' = 'consumable' then
        jsonb_build_object('category','supply','item', e->>'label')
      else null end as x
    from (
      -- effective set: active + added + replacements-in; suppressed/replaced-out/inactive excluded
      select case when e0->>'status'='replaced' then e0->'replacement' else e0 end as e
      from jsonb_array_elements(coalesce(p_basis->'requirements','[]'::jsonb)) e0
      where e0->>'status' in ('active','added','replaced')
    ) eff
    where e->'resolution'->>'status' is distinct from 'inactive'
  ) m where x is not null
$$;


--
-- Name: requirement_coverage(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.requirement_coverage(p_requirement uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_req record; v_assigned int; v_conf int;
begin
  select * into v_req from public.staffing_requirement where id=p_requirement and tenant_id=v_tenant;
  if not found then return null; end if;
  select count(*) into v_assigned from public.staffing_assignment a
    where a.requirement_ref=p_requirement and a.tenant_id=v_tenant
      and not exists (select 1 from public.staffing_release r where r.assignment_ref=a.id);
  select count(*) into v_conf from public.staffing_assignment a
    where a.requirement_ref=p_requirement and a.tenant_id=v_tenant
      and not exists (select 1 from public.staffing_release r where r.assignment_ref=a.id)
      and public.staff_overlap_count(a.staff_ref, a.window_start, a.window_end, a.id) > 0;
  return jsonb_build_object(
    'requirement_id', p_requirement, 'role', v_req.role,
    'required', v_req.quantity, 'assigned', v_assigned,
    'shortage', greatest(0, v_req.quantity - v_assigned),
    'over', greatest(0, v_assigned - v_req.quantity),
    'conflicts', v_conf,
    'covered', (v_assigned >= v_req.quantity and v_conf = 0),
    'blocker', case when v_conf > 0 then v_conf||' conflicting assignment(s) for '||v_req.role
                    when v_assigned < v_req.quantity then (v_req.quantity - v_assigned)||' of '||v_req.quantity||' '||v_req.role||' position(s) open'
                    else null end);
end $$;


--
-- Name: rescind_acceptance(uuid, text, text, jsonb, text, jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rescind_acceptance(p_acceptance uuid, p_actor text, p_class text, p_evidence jsonb, p_reason text, p_acting_party jsonb DEFAULT NULL::jsonb, p_republish boolean DEFAULT NULL::boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: FUNCTION rescind_acceptance(p_acceptance uuid, p_actor text, p_class text, p_evidence jsonb, p_reason text, p_acting_party jsonb, p_republish boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rescind_acceptance(p_acceptance uuid, p_actor text, p_class text, p_evidence jsonb, p_reason text, p_acting_party jsonb, p_republish boolean) IS 'v272/PL-4 Phase B: the authority-gated (I-29, default-deny) release of an acceptance. Thread-first lock (v266 order). Writes the binding rescission record + the acceptance_rescinded ledger fact referencing it (object_ref) + the derived projection, atomically (I-30). Never touches the acceptance (I-27).';


--
-- Name: resolve_quantity(text, numeric, integer, numeric, numeric, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_quantity(p_basis text, p_rate numeric, p_band integer, p_min numeric, p_max numeric, p_rounding text, p_context jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare needed text; cnt numeric; q numeric;
begin
  needed := case p_basis
    when 'per_guest' then 'guest_count' when 'per_guest_band' then 'guest_count'
    when 'per_service_point' then 'service_points' when 'per_table' then 'table_count'
    when 'per_hour' then 'duration_hours' when 'per_shift' then 'shift_count'
    when 'per_batch' then 'batch_count' else null end;
  if p_basis in ('fixed','per_instance') then cnt := 1;
  else
    if p_context is null or p_context->>needed is null then
      return jsonb_build_object('status','unresolved','missing',needed);
    end if;
    cnt := (p_context->>needed)::numeric;
    if p_basis = 'per_guest_band' then cnt := ceil(cnt / p_band); end if;
  end if;
  q := p_rate * cnt;
  q := case p_rounding when 'floor' then floor(q) when 'nearest' then round(q) else ceil(q) end;
  if p_min is not null then q := greatest(q, p_min); end if;
  if p_max is not null then q := least(q, p_max); end if;
  return jsonb_build_object('status','resolved','quantity',q,'basis_count',cnt);
end $$;


--
-- Name: resolve_venue(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_venue(p_venue uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); cur uuid := p_venue; nxt uuid; i int := 0;
begin
  loop
    select redirect_to into nxt from public.venue where id=cur and tenant_id=v_tenant;
    if not found then return null; end if;
    exit when nxt is null; cur := nxt; i := i + 1;
    if i > 8 then return cur; end if;
  end loop;
  return cur;
end $$;


--
-- Name: responsibility_anchor_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.responsibility_anchor_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  -- R-1: every responsibility cites at least one truth anchor.
  if new.origin_ref is null then
    raise exception 'RESP_NO_TRUTH_ANCHOR: a responsibility must cite truth (origin_ref)';
  end if;
  -- R-11: knowledge truth reaches a responsibility only through a pinned
  -- revision, so later library edits cannot rewrite it.
  if new.origin_kind = 'knowledge' and new.origin_revision is null then
    raise exception 'RESP_NO_TRUTH_ANCHOR: knowledge-origin responsibility must pin origin_revision';
  end if;
  -- A standing responsibility carries no event; its anchor must be explicit.
  if new.scope = 'standing' and new.origin_kind not in ('knowledge','attestation') then
    raise exception 'RESP_NO_TRUTH_ANCHOR: standing scope requires knowledge or attestation truth';
  end if;
  return new;
end $$;


--
-- Name: responsibility_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.responsibility_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'RESP_EDIT_REFUSED: the Responsibility Record is append-only (R-8); express change by supersession';
end $$;


--
-- Name: responsibility_current_owner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.responsibility_current_owner(p_responsibility uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case when ro.action = 'release' then null else ro.owner end
    from public.responsibility_owner ro
   where ro.responsibility_ref = p_responsibility
     and ro.tenant_id = public.current_tenant_id()
   order by ro.seq desc
   limit 1;
$$;


--
-- Name: responsibility_detail(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.responsibility_detail(p_responsibility uuid, p_now timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_o      public.obligation%rowtype;
  v_row    jsonb;
begin
  select * into v_o from public.obligation o
   where o.id = p_responsibility and o.tenant_id = v_tenant;
  if not found then return null; end if;

  select to_jsonb(f) into v_row from public.responsibility_feed(
    jsonb_build_object('event', v_o.event_ref), p_now) f
   where f.responsibility = p_responsibility;

  -- standing responsibilities carry no event; fall back to an unfiltered read
  if v_row is null then
    select to_jsonb(f) into v_row
      from public.responsibility_feed('{}'::jsonb, p_now) f
     where f.responsibility = p_responsibility;
  end if;

  return jsonb_build_object(
    'row', v_row,
    'anchors', jsonb_build_object(
        'origin_kind',     v_o.origin_kind,
        'origin_ref',      v_o.origin_ref,
        'origin_revision', v_o.origin_revision,
        'declared',        v_o.anchors),
    'ownership', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'action', ro.action, 'owner', ro.owner,
                 'prior_owner', ro.prior_owner, 'actor', ro.actor,
                 'moment', ro.moment) order by ro.seq)
          from public.responsibility_owner ro
         where ro.responsibility_ref = p_responsibility
           and ro.tenant_id = v_tenant), '[]'::jsonb),
    'evidence', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'kind', e.kind, 'actor', e.actor, 'moment', e.moment,
                 'payload', e.payload) order by e.moment)
          from public.execution_evidence e
         where e.obligation_ref = p_responsibility
           and e.tenant_id = v_tenant), '[]'::jsonb),
    'dependencies', coalesce(v_o.dependencies, '[]'::jsonb),
    'supersedes', v_o.supersedes_ref,
    'superseded_by', (select r.id from public.obligation r
                       where r.supersedes_ref = p_responsibility
                         and r.tenant_id = v_tenant limit 1)
  );
end $$;


--
-- Name: responsibility_feed(jsonb, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.responsibility_feed(p_filter jsonb DEFAULT '{}'::jsonb, p_now timestamp with time zone DEFAULT now()) RETURNS TABLE(responsibility uuid, scope text, event_ref uuid, department text, kind text, required_outcome text, resource_role text, owner text, state text, timing jsonb, risk jsonb, exceptions integer, natural_key text, ordering_key text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_f      jsonb := public.validate_projection_filter(p_filter);
  v_tenant uuid  := public.current_tenant_id();
begin
  return query
  with base as (
    select o.id, o.scope as o_scope, o.event_ref, o.department, o.kind,
           o.required_outcome, o.resource_role, o.timing, o.natural_key,
           public.responsibility_state(o.id, p_now)      as st,
           public.responsibility_current_owner(o.id)     as own,
           coalesce(nullif(o.timing->>'window_end','')::timestamptz,
                    nullif(o.timing->>'due','')::timestamptz)      as w_end,
           coalesce(nullif(o.timing->>'window_start','')::timestamptz) as w_start,
           (select count(*)::int from public.execution_evidence e
             where e.obligation_ref = o.id and e.kind = 'exception')  as exc
      from public.obligation o
     where o.tenant_id = v_tenant
       and (not (v_f ? 'event')      or o.event_ref  = (v_f->>'event')::uuid)
       and (not (v_f ? 'department') or o.department = (v_f->>'department'))
       and (not (v_f ? 'scope')      or o.scope      = (v_f->>'scope'))
       and (not (v_f ? 'text')       or o.required_outcome ilike '%'||(v_f->>'text')||'%'
                                     or coalesce(o.resource_role,'') ilike '%'||(v_f->>'text')||'%')
  ), shaped as (
    select b.*,
           (b.w_end is not null and b.w_end > p_now
              and b.w_end <= p_now + interval '24 hours')            as lapse_soon
      from base b
  )
  select s.id, s.o_scope, s.event_ref, s.department, s.kind,
         s.required_outcome, s.resource_role, s.own, s.st, s.timing,
         jsonb_build_object('lapse_soon', s.lapse_soon,
                            'exceptions', s.exc,
                            'unowned',    (s.own is null)),
         s.exc, s.natural_key,
         -- deterministic, stable ordering: risk first, then state rank,
         -- then window, then natural key (total order, no ties)
         (case when s.st = 'lapsed' then '0'
               when s.lapse_soon    then '1'
               when s.st = 'active' then '2'
               when s.st = 'derived' then '3'
               when s.st = 'standing' then '4'
               else '5' end)
         || '|' || coalesce(to_char(s.w_end at time zone 'UTC','YYYYMMDDHH24MISS'),'99999999999999')
         || '|' || s.natural_key
    from shaped s
   where (not (v_f ? 'states')
          or s.st = any (select jsonb_array_elements_text(v_f->'states')))
     and (not (v_f ? 'owner')   or s.own = (v_f->>'owner'))
     and (not coalesce((v_f->>'unowned')::boolean, false) or s.own is null)
     and (not coalesce((v_f->>'risk')::boolean, false)
          or s.lapse_soon or s.exc > 0 or s.st = 'lapsed')
     and (not (v_f #> '{window,from}' is not null)
          or s.w_end is null or s.w_end >= (v_f#>>'{window,from}')::timestamptz)
     and (not (v_f #> '{window,to}' is not null)
          or s.w_end is null or s.w_end <= (v_f#>>'{window,to}')::timestamptz)
   order by 14;
end $$;


--
-- Name: responsibility_natural_key(text, uuid, text, uuid, uuid, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.responsibility_natural_key(p_scope text, p_event uuid, p_origin_kind text, p_origin_ref uuid, p_origin_revision uuid, p_kind text, p_resource_role text, p_required_outcome text, p_timing jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select encode(extensions.digest(
    p_scope || '|' || coalesce(p_event::text,'') || '|' || p_origin_kind || '|' ||
    p_origin_ref::text || '|' || coalesce(p_origin_revision::text,'') || '|' ||
    p_kind || '|' || coalesce(p_resource_role,'') || '|' ||
    p_required_outcome || '|' || coalesce(p_timing::text,''), 'sha256'), 'hex');
$$;


--
-- Name: responsibility_owner_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.responsibility_owner_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'RESP_OWNER_LEDGER_APPEND_ONLY: ownership history is append-only (R-6)';
end $$;


--
-- Name: responsibility_state(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.responsibility_state(p_responsibility uuid, p_now timestamp with time zone DEFAULT now()) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_o       public.obligation%rowtype;
  v_owner   text;
  v_end     timestamptz;
  v_start   timestamptz;
  v_dep     text;
  v_blocked boolean := false;
begin
  select * into v_o from public.obligation o
   where o.id = p_responsibility and o.tenant_id = v_tenant;
  if not found then return null; end if;

  -- Superseded: a replacement cites this record.
  if exists (select 1 from public.obligation r where r.supersedes_ref = p_responsibility) then
    return 'superseded';
  end if;
  if exists (select 1 from public.execution_evidence e
              where e.obligation_ref = p_responsibility and e.kind = 'superseded') then
    return 'superseded';
  end if;

  -- Void: anchoring truth was corrected away.
  if exists (select 1 from public.execution_evidence e
              where e.obligation_ref = p_responsibility
                and e.kind in ('invalidated','cancelled')) then
    return 'void';
  end if;

  -- Discharged derives ONLY from evidence (L-2, R-7).
  if exists (select 1 from public.execution_evidence e
              where e.obligation_ref = p_responsibility and e.kind = 'completion') then
    return 'discharged';
  end if;

  v_start := nullif(v_o.timing->>'window_start','')::timestamptz;
  v_end   := coalesce(nullif(v_o.timing->>'window_end','')::timestamptz,
                      nullif(v_o.timing->>'due','')::timestamptz);

  -- Lapsed: window closed without satisfying evidence.
  if v_end is not null and p_now > v_end then
    return 'lapsed';
  end if;

  v_owner := public.responsibility_current_owner(p_responsibility);
  if v_owner is null then
    return 'derived';                      -- lawful, and visible debt (O-3)
  end if;

  for v_dep in select jsonb_array_elements_text(coalesce(v_o.dependencies,'[]'::jsonb)) loop
    if v_o.event_ref is not null
       and not public.obligation_nk_complete(v_o.event_ref, v_dep) then
      v_blocked := true;
    end if;
  end loop;

  if v_blocked then return 'standing'; end if;
  if v_start is not null and p_now < v_start then return 'standing'; end if;
  return 'active';
end $$;


--
-- Name: retire_blueprint_identity(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.retire_blueprint_identity(p_identity uuid, p_actor uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare v_ident public.blueprint_identities%rowtype;
begin
  select * into v_ident from public.blueprint_identities where id = p_identity for update;
  if not found or v_ident.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'IDENTITY_NOT_FOUND';
  end if;
  if v_ident.status <> 'active' then raise exception 'ALREADY_RETIRED'; end if;
  update public.blueprint_identities set status = 'retired', retired_at = now() where id = p_identity;
  insert into public.blueprint_shelf_acts (tenant_id, identity_id, act, actor)
    values (v_ident.tenant_id, p_identity, 'retire', p_actor);
  return p_identity;
end $$;


--
-- Name: risk_findings(jsonb, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.risk_findings(p_filter jsonb DEFAULT '{}'::jsonb, p_now timestamp with time zone DEFAULT now()) RETURNS TABLE(responsibility uuid, event_ref uuid, finding text, severity text, detail jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_f jsonb := public.validate_projection_filter(p_filter);
begin
  return query
  with f as (
    select * from public.responsibility_feed(v_f, p_now)
  ),
  -- 1 · already lapsed (constitutional state, surfaced as critical risk)
  lapsed as (
    select f.responsibility, f.event_ref, 'lapsed'::text, 'critical'::text,
           jsonb_build_object('window_end', f.timing->>'window_end',
                              'due', f.timing->>'due')
      from f where f.state = 'lapsed'
  ),
  -- 2 · approaching lapse
  approaching as (
    select f.responsibility, f.event_ref, 'lapse_approaching'::text, 'warning'::text,
           jsonb_build_object('closes', coalesce(f.timing->>'window_end', f.timing->>'due'))
      from f
     where (f.risk->>'lapse_soon')::boolean
       and f.state not in ('lapsed','discharged','superseded','void')
  ),
  -- 3 · ownerless nearing its execution window
  ownerless_near as (
    select f.responsibility, f.event_ref, 'ownerless_nearing_window'::text, 'warning'::text,
           jsonb_build_object('opens', f.timing->>'window_start',
                              'closes', coalesce(f.timing->>'window_end', f.timing->>'due'))
      from f
     where f.owner is null
       and f.state in ('derived','standing')
       and coalesce(nullif(f.timing->>'window_end','')::timestamptz,
                    nullif(f.timing->>'due','')::timestamptz,
                    nullif(f.timing->>'window_start','')::timestamptz)
             between p_now and p_now + interval '48 hours'
  ),
  -- 4 · dependency / blocked-chain risk (a risk finding, NOT the state 'blocked')
  blocked_chain as (
    select f.responsibility, f.event_ref, 'dependency_blocked'::text, 'advisory'::text,
           jsonb_build_object('unmet', jsonb_agg(d.dep))
      from f
      join public.obligation o on o.id = f.responsibility
      cross join lateral jsonb_array_elements_text(coalesce(o.dependencies,'[]'::jsonb)) as d(dep)
     where f.state = 'standing'
       and o.event_ref is not null
       and not public.obligation_nk_complete(o.event_ref, d.dep)
     group by f.responsibility, f.event_ref
  ),
  -- 5 · recorded exception evidence (evidence, NOT a state)
  exceptions as (
    select f.responsibility, f.event_ref, 'exception_recorded'::text, 'advisory'::text,
           jsonb_build_object('count', f.exceptions)
      from f where f.exceptions > 0
  ),
  -- 6 · v282 venue-knowledge staleness — EVENT-level, so responsibility is null
  staleness as (
    select distinct null::uuid, ev.id,
           ('venue_'||coalesce(fnd->>'kind','finding'))::text,
           coalesce(fnd->>'severity','advisory')::text,
           fnd
      from (select distinct f.event_ref from f where f.event_ref is not null) fe
      join public.event ev on ev.id = fe.event_ref
      join public.engagement_venue_binding b
        on b.booking_id = ev.engagement_ref and b.tenant_id = public.current_tenant_id()
      cross join lateral jsonb_array_elements(
        coalesce(public.venue_knowledge_findings(b.venue_id, p_now), '[]'::jsonb)) as fnd
     where coalesce(fnd->>'kind','') in ('stale','expired','renovation_reverification')
  )
  select * from lapsed
  union all select * from approaching
  union all select * from ownerless_near
  union all select * from blocked_chain
  union all select * from exceptions
  union all select * from staleness;
end $$;


--
-- Name: set_engagement_profile(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_engagement_profile(p_booking uuid, p_display_name text DEFAULT NULL::text, p_client_display_name text DEFAULT NULL::text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_cur record; v_id uuid;
begin
  if not public.can_edit_engagement_profile() then
    raise exception 'PROMISE_NOT_AUTHORIZED: engagement profile';
  end if;
  perform 1 from public.bookings where id = p_booking and tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if coalesce(trim(p_display_name),'') = '' and coalesce(trim(p_client_display_name),'') = '' then
    raise exception 'PROMISE_EMPTY: a profile record must carry at least one fact';
  end if;
  select * into v_cur from public.promise_current_engagement_profile(p_booking, now());
  if found then
    if coalesce(v_cur.display_name,'') is not distinct from coalesce(nullif(trim(p_display_name),''),'')
       and coalesce(v_cur.client_display_name,'') is not distinct from coalesce(nullif(trim(p_client_display_name),''),'') then
      raise exception 'PROMISE_UNCHANGED';
    end if;
    if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  end if;
  insert into public.engagement_profile
      (tenant_id, booking_id, display_name, client_display_name,
       replaces_id, reason, recorded_by)
    values (v_tenant, p_booking, nullif(trim(p_display_name),''),
            nullif(trim(p_client_display_name),''), v_cur.id,
            nullif(trim(p_reason),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('profile_id', v_id, 'replaced', v_cur.id is not null);
end $$;


--
-- Name: set_occurrence_profile(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_occurrence_profile(p_occurrence uuid, p_display_name text DEFAULT NULL::text, p_occasion_kind text DEFAULT NULL::text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_book uuid; v_cur record; v_id uuid;
begin
  if not public.can_edit_engagement_profile() then
    raise exception 'PROMISE_NOT_AUTHORIZED: occurrence profile';
  end if;
  select booking_id into v_book from public.engagement_occurrence
   where id = p_occurrence and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.bookings where id = v_book and tenant_id = v_tenant for update;
  if coalesce(trim(p_display_name),'') = '' and coalesce(trim(p_occasion_kind),'') = '' then
    raise exception 'PROMISE_EMPTY: a profile record must carry at least one fact';
  end if;

  select * into v_cur from public.promise_current_occurrence_profile(p_occurrence, now());
  if found then
    if coalesce(v_cur.display_name,'') is not distinct from coalesce(nullif(trim(p_display_name),''),'')
       and coalesce(v_cur.occasion_kind,'') is not distinct from coalesce(nullif(trim(p_occasion_kind),''),'') then
      raise exception 'PROMISE_UNCHANGED';
    end if;
    if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  end if;

  insert into public.occurrence_profile
      (tenant_id, occurrence_id, display_name, occasion_kind, replaces_id, reason, recorded_by)
    values (v_tenant, p_occurrence, nullif(trim(p_display_name),''),
            nullif(trim(p_occasion_kind),''), v_cur.id,
            nullif(trim(p_reason),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('profile_id', v_id, 'replaced', v_cur.id is not null);
end $$;


--
-- Name: set_schedule_milestone(uuid, text, date, timestamp with time zone, timestamp with time zone, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_schedule_milestone(p_occurrence uuid, p_milestone_key text, p_at_date date DEFAULT NULL::date, p_at_moment timestamp with time zone DEFAULT NULL::timestamp with time zone, p_window_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_label text DEFAULT NULL::text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_book uuid; v_cur record; v_id uuid;
begin
  if not public.can_set_schedule() then raise exception 'PROMISE_NOT_AUTHORIZED: schedule'; end if;
  select booking_id into v_book from public.engagement_occurrence
   where id = p_occurrence and tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  perform 1 from public.bookings where id = v_book and tenant_id = v_tenant for update;
  if p_milestone_key = 'supervision_start' then
    raise exception 'MILESTONE_DUAL_CAPTURE: supervision is owned by occurrence_supervision';
  end if;
  if p_milestone_key = 'operating_date' then
    if p_at_date is null then raise exception 'MILESTONE_DATE_REQUIRED'; end if;
  elsif p_at_moment is null then
    raise exception 'MILESTONE_MOMENT_REQUIRED';
  end if;

  select * into v_cur from public.occurrence_schedule_milestone m
   where m.occurrence_id = p_occurrence and m.tenant_id = v_tenant
     and m.milestone_key = p_milestone_key
     and coalesce(m.label,'') = coalesce(nullif(trim(p_label),''),'')
     and not exists (select 1 from public.occurrence_schedule_milestone s
                      where s.replaces_id = m.id and s.tenant_id = v_tenant)
   order by m.seq desc limit 1;
  if found then
    if not v_cur.cleared
       and v_cur.at_date is not distinct from p_at_date
       and v_cur.at_moment is not distinct from p_at_moment
       and v_cur.window_end is not distinct from p_window_end then
      raise exception 'PROMISE_UNCHANGED';
    end if;
    if coalesce(trim(p_reason),'') = '' then raise exception 'PROMISE_REASON_REQUIRED'; end if;
  end if;

  insert into public.occurrence_schedule_milestone
      (tenant_id, occurrence_id, milestone_key, label, at_date, at_moment,
       window_end, cleared, replaces_id, reason, recorded_by)
    values (v_tenant, p_occurrence, p_milestone_key, nullif(trim(p_label),''),
            p_at_date, p_at_moment, p_window_end, false,
            v_cur.id, nullif(trim(p_reason),''), public.action_actor())
    returning id into v_id;
  return jsonb_build_object('milestone_id', v_id, 'key', p_milestone_key,
                            'replaced', v_cur.id is not null);
end $$;


--
-- Name: set_staleness_policy(text, integer, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_staleness_policy(p_family text, p_max_age_days integer DEFAULT NULL::integer, p_severity text DEFAULT 'advisory'::text, p_verify_required boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  insert into public.venue_staleness_policy
      (tenant_id, attribute_family, max_age_days, severity_when_stale, verify_required, updated_by)
    values (v_tenant, p_family, p_max_age_days, p_severity, coalesce(p_verify_required,false), public.action_actor())
  on conflict (tenant_id, attribute_family) do update
    set max_age_days = excluded.max_age_days,
        severity_when_stale = excluded.severity_when_stale,
        verify_required = excluded.verify_required,
        updated_by = excluded.updated_by,
        updated_at = clock_timestamp()
  returning id into v_id;
  return jsonb_build_object('policy_id', v_id, 'family', p_family);
end $$;


--
-- Name: source_class_rank(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.source_class_rank(p text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$ select case p
  when 'measurement' then 1 when 'direct_observation' then 2 when 'venue_document' then 3
  when 'venue_rep_statement' then 4 when 'prior_knowledge' then 5 else 99 end $$;


--
-- Name: space_within(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.space_within(p_space uuid, p_ancestor uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare cur uuid := p_space; i int := 0;
begin
  if p_ancestor is null then return true; end if;   -- venue-wide scope
  while cur is not null and i < 10 loop
    if cur = p_ancestor then return true; end if;
    select parent_space_id into cur from public.venue_space where id = cur;
    i := i + 1;
  end loop;
  return false;
end $$;


--
-- Name: staff_overlap_count(uuid, timestamp with time zone, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_overlap_count(p_staff uuid, p_ws timestamp with time zone, p_we timestamp with time zone, p_exclude uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(*)::int from public.staffing_assignment a
   where a.tenant_id=public.current_tenant_id() and a.staff_ref=p_staff and a.id <> coalesce(p_exclude,'00000000-0000-0000-0000-000000000000'::uuid)
     and not exists (select 1 from public.staffing_release r where r.assignment_ref=a.id)
     and a.window_start < p_we and p_ws < a.window_end;                         -- half-open overlap
$$;


--
-- Name: staffing_assignment_active(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staffing_assignment_active(p_assignment uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.staffing_assignment a
                  where a.id=p_assignment and a.tenant_id=public.current_tenant_id())
     and not exists (select 1 from public.staffing_release r where r.assignment_ref=p_assignment);
$$;


--
-- Name: staleness_defaults(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staleness_defaults(p_family text) RETURNS TABLE(max_age_days integer, severity text)
    LANGUAGE sql IMMUTABLE
    AS $$
  select v.max_age_days, v.severity from (values
    ('structural', 1460, 'advisory'), ('equipment', 365, 'advisory'),
    ('utility',    730,  'advisory'), ('document',  365, 'critical'),
    ('rule',       730,  'advisory'), ('access',   1095, 'advisory'),
    ('other',     1095,  'advisory')) v(f, max_age_days, severity)
  where v.f = p_family $$;


--
-- Name: start_service(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_service(p_event uuid, p_actor text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_pending int;
begin
  perform 1 from public.event where id=p_event and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if exists (select 1 from public.execution_evidence where event_ref=p_event and tenant_id=v_tenant and kind='event_closed') then raise exception 'START_SERVICE_EVENT_CLOSED'; end if;
  if exists (select 1 from public.execution_evidence where event_ref=p_event and tenant_id=v_tenant and kind='service_start') then raise exception 'SERVICE_ALREADY_STARTED'; end if;
  select count(*) into v_pending from public.obligation o
   where o.event_ref=p_event and o.tenant_id=v_tenant
     and o.kind in ('culinary_prepare','equipment_pull','staffing_assign','venue_setup')
     and public.obligation_state(o.id) not in ('complete','invalidated');
  if v_pending > 0 then raise exception 'SERVICE_NOT_READY: % pre-service obligation(s) unresolved', v_pending; end if;
  if not public.event_staffing_ready(p_event) then raise exception 'SERVICE_STAFFING_UNCOVERED: required staffing coverage is not met'; end if;
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, p_event, 'service_start', p_actor, '{}'::jsonb);
  return jsonb_build_object('event_id', p_event, 'stage', public.event_stage(p_event));
end $$;


--
-- Name: supersede_observation(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.supersede_observation(p_observation uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); v_id uuid;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  perform 1 from public.venue_observation where id=p_observation and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'SUPERSESSION_REASON_REQUIRED'; end if;
  begin
    insert into public.venue_observation_supersession (tenant_id, observation_id, actor, reason)
      values (v_tenant, p_observation, public.action_actor(), p_reason) returning id into v_id;
  exception when unique_violation then
    raise exception 'OBSERVATION_ALREADY_SUPERSEDED';
  end;
  return jsonb_build_object('supersession_id', v_id);
end $$;


--
-- Name: supersession_tenant_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.supersession_tenant_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if not exists (select 1 from public.venue_observation o
                  where o.id=new.observation_id and o.tenant_id=new.tenant_id)
    then raise exception 'CEREMONY_NOT_FOUND'; end if;   -- cross-tenant/unknown: no leak
  return new;
end $$;


--
-- Name: tenant_operational_day_start_hour(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tenant_operational_day_start_hour(p_tenant uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select t.operational_day_start_hour
       from public.tenants t
      where t.id = p_tenant
        and t.operational_day_start_hour between 0 and 23),
    0);
$$;


--
-- Name: tenant_operational_timezone(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tenant_operational_timezone(p_tenant uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select t.operational_timezone
       from public.tenants t
      where t.id = p_tenant
        and t.operational_timezone is not null
        and exists (select 1 from pg_timezone_names z where z.name = t.operational_timezone)),
    'America/New_York');
$$;


--
-- Name: tenants_operational_config_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tenants_operational_config_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.operational_timezone is not null then
    if btrim(new.operational_timezone) = '' then
      raise exception 'TENANT_TIMEZONE_INVALID: operational_timezone may not be blank; leave it NULL to use the default';
    end if;
    if not exists (select 1 from pg_timezone_names z where z.name = new.operational_timezone) then
      raise exception 'TENANT_TIMEZONE_INVALID: % is not a time zone this database can resolve', new.operational_timezone;
    end if;
  end if;
  return new;
end $$;


--
-- Name: transfer_responsibility_ownership(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transfer_responsibility_ownership(p_responsibility uuid, p_new_owner text, p_expected_prior text, p_actor text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_current text;
  v_prior   uuid;
  v_action  text;
  v_id      uuid;
begin
  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'RESP_ACTOR_REQUIRED: ownership ceremonies require a human actor';
  end if;

  -- Single-writer serialization for this responsibility's ownership.
  perform 1 from public.obligation o
    where o.id = p_responsibility and o.tenant_id = v_tenant
    for update;
  if not found then
    raise exception 'RESP_NOT_FOUND: no such responsibility in this tenant';
  end if;

  select case when ro.action='release' then null else ro.owner end, ro.id
    into v_current, v_prior
    from public.responsibility_owner ro
   where ro.responsibility_ref = p_responsibility and ro.tenant_id = v_tenant
   order by ro.seq desc limit 1;

  -- O-1: the caller must state the ownership it believes it is replacing.
  if v_current is distinct from p_expected_prior then
    raise exception 'OWNERSHIP_CONFLICT: current owner is %, expected %',
      coalesce(v_current,'(unassigned)'), coalesce(p_expected_prior,'(unassigned)');
  end if;

  v_action := case when p_new_owner is null then 'release'
                   when v_current is null   then 'assign'
                   else 'transfer' end;

  insert into public.responsibility_owner
    (tenant_id, responsibility_ref, action, owner, prior_owner, prior_ref, actor)
  values (v_tenant, p_responsibility, v_action, p_new_owner, v_current, v_prior, p_actor)
  returning id into v_id;

  return v_id;
end $$;


--
-- Name: update_library_component_details(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_library_component_details(p_component uuid, p_fields jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); f text;
begin
  if not public.can_manage_library() then raise exception 'LIBRARY_NOT_AUTHORIZED'; end if;
  perform 1 from public.library_component where id=p_component and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  for f in select jsonb_object_keys(coalesce(p_fields,'{}'::jsonb)) loop
    if f not in ('name','kind','notes','active') then raise exception 'LIBRARY_FIELD_FORBIDDEN: %', f; end if;
  end loop;
  update public.library_component set
    name  = coalesce(nullif(trim(p_fields->>'name'),''), name),
    kind  = coalesce(p_fields->>'kind', kind),
    notes = case when p_fields ? 'notes' then p_fields->>'notes' else notes end,
    active = coalesce((p_fields->>'active')::boolean, active)
  where id=p_component and tenant_id=v_tenant;
  return jsonb_build_object('component_id', p_component);
end $$;


--
-- Name: update_venue_details(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_venue_details(p_venue uuid, p_fields jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_tenant uuid := public.current_tenant_id(); f text;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  perform 1 from public.venue where id=p_venue and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  for f in select jsonb_object_keys(coalesce(p_fields,'{}'::jsonb)) loop
    if f not in ('name','venue_type','address','geo_lat','geo_lng','contacts','management','notes')
      then raise exception 'VENUE_FIELD_FORBIDDEN: %', f; end if;
  end loop;
  update public.venue set
    name       = coalesce(nullif(trim(p_fields->>'name'),''), name),
    venue_type = coalesce(p_fields->>'venue_type', venue_type),
    address    = case when p_fields ? 'address' then p_fields->>'address' else address end,
    geo_lat    = case when p_fields ? 'geo_lat' then (p_fields->>'geo_lat')::numeric else geo_lat end,
    geo_lng    = case when p_fields ? 'geo_lng' then (p_fields->>'geo_lng')::numeric else geo_lng end,
    contacts   = case when p_fields ? 'contacts' then p_fields->'contacts' else contacts end,
    management = case when p_fields ? 'management' then p_fields->>'management' else management end,
    notes      = case when p_fields ? 'notes' then p_fields->>'notes' else notes end
  where id=p_venue and tenant_id=v_tenant;
  return jsonb_build_object('venue_id', p_venue);
end $$;


--
-- Name: v292d_version_mismatch(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.v292d_version_mismatch(p_name text, p_version text) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
begin
  raise exception
    'V292D_COMPOSED_VERSION_MISMATCH: expected occurrence_brief v1, found % v%',
    coalesce(p_name, '<null>'), coalesce(p_version, '<null>');
end $$;


--
-- Name: validate_projection_filter(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_projection_filter(p_filter jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  v_allowed  text[] := array['event','department','owner','unowned','states',
                             'scope','risk','window','text'];
  v_states   text[] := array['derived','standing','active','discharged',
                             'lapsed','superseded','void'];
  v_depts    text[] := array['culinary','equipment','staffing','venue','logistics'];
  v_f        jsonb  := coalesce(p_filter, '{}'::jsonb);
  k          text;
  v          text;
  wk         text;
begin
  if jsonb_typeof(v_f) <> 'object' then
    raise exception 'PROJECTION_FILTER_INVALID: filter must be a JSON object';
  end if;

  -- closed key set
  for k in select jsonb_object_keys(v_f) loop
    if not (k = any(v_allowed)) then
      raise exception 'PROJECTION_FILTER_INVALID: unknown filter key %', k;
    end if;
  end loop;

  -- closed value vocabularies
  if v_f ? 'states' then
    if jsonb_typeof(v_f->'states') <> 'array' then
      raise exception 'PROJECTION_FILTER_INVALID: states must be an array';
    end if;
    for v in select jsonb_array_elements_text(v_f->'states') loop
      if not (v = any(v_states)) then
        raise exception 'PROJECTION_FILTER_INVALID: unknown state %', v;
      end if;
    end loop;
  end if;

  if v_f ? 'department' and not ((v_f->>'department') = any(v_depts)) then
    raise exception 'PROJECTION_FILTER_INVALID: unknown department %', v_f->>'department';
  end if;

  if v_f ? 'scope' and not ((v_f->>'scope') in ('event','standing')) then
    raise exception 'PROJECTION_FILTER_INVALID: unknown scope %', v_f->>'scope';
  end if;

  if v_f ? 'unowned' and jsonb_typeof(v_f->'unowned') <> 'boolean' then
    raise exception 'PROJECTION_FILTER_INVALID: unowned must be boolean';
  end if;
  if v_f ? 'risk' and jsonb_typeof(v_f->'risk') <> 'boolean' then
    raise exception 'PROJECTION_FILTER_INVALID: risk must be boolean';
  end if;

  if v_f ? 'window' then
    if jsonb_typeof(v_f->'window') <> 'object' then
      raise exception 'PROJECTION_FILTER_INVALID: window must be an object';
    end if;
    for wk in select jsonb_object_keys(v_f->'window') loop
      if not (wk in ('from','to')) then
        raise exception 'PROJECTION_FILTER_INVALID: unknown window key %', wk;
      end if;
    end loop;
  end if;

  if v_f ? 'event' then
    begin
      perform (v_f->>'event')::uuid;
    exception when others then
      raise exception 'PROJECTION_FILTER_INVALID: event must be a uuid';
    end;
  end if;

  return v_f;
end $$;


--
-- Name: validate_projection_group_by(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_projection_group_by(p_group_by text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare v_allowed text[] := array['department','event','state','owner','resource_role','none'];
begin
  if p_group_by is null then return 'none'; end if;
  if not (p_group_by = any(v_allowed)) then
    raise exception 'PROJECTION_GROUP_BY_INVALID: unknown grouping %', p_group_by;
  end if;
  return p_group_by;
end $$;


--
-- Name: venue_contradictions(uuid, timestamp with time zone, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.venue_contradictions(p_venue uuid, p_context timestamp with time zone DEFAULT now(), p_conditions text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(e), '[]'::jsonb) from (
    select public.venue_profile_read(p_venue, k.scope_space_id, k.attribute_key, p_context, p_conditions) e
      from (select distinct o.scope_space_id, o.attribute_key
              from public.venue_observation o
             where o.tenant_id = public.current_tenant_id()
               and o.venue_id in (select public.venue_family(public.resolve_venue(p_venue)))) k
  ) q where e->'contradiction' is not null and e->>'contradiction' is not null;
$$;


--
-- Name: venue_duplicate_candidates(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.venue_duplicate_candidates(p_name text, p_address text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'address', v.address)), '[]'::jsonb)
  from public.venue v
  where v.tenant_id = public.current_tenant_id() and v.redirect_to is null
    and ( lower(regexp_replace(v.name,'\s+','','g')) = lower(regexp_replace(coalesce(p_name,''),'\s+','','g'))
       or (coalesce(p_address,'') <> '' and
           lower(regexp_replace(coalesce(v.address,''),'[^a-z0-9]','','gi')) =
           lower(regexp_replace(p_address,'[^a-z0-9]','','gi'))) );
$$;


--
-- Name: venue_family(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.venue_family(p_canonical uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with recursive fam as (
    select id from public.venue where id = p_canonical and tenant_id = public.current_tenant_id()
    union all
    select v.id from public.venue v join fam on v.redirect_to = fam.id
     where v.tenant_id = public.current_tenant_id()
  ) select id from fam;
$$;


--
-- Name: venue_knowledge_findings(uuid, timestamp with time zone, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.venue_knowledge_findings(p_venue uuid, p_at timestamp with time zone DEFAULT now(), p_conditions text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_canon uuid; k record; prof jsonb; pol record; fnd jsonb := '[]'::jsonb;
  v_reno_eff timestamptz; exp record; v_fam text; v_age_days numeric;
begin
  v_canon := public.resolve_venue(p_venue);
  if v_canon is null then return null; end if;

  for k in
    select distinct o.scope_space_id, o.attribute_key
    from public.venue_observation o
    where o.tenant_id = public.current_tenant_id()
      and o.venue_id in (select public.venue_family(v_canon))
      and o.attribute_key <> 'renovation_event'
  loop
    v_fam := public.attribute_family(k.attribute_key);
    select * into pol from public.effective_staleness_policy(v_fam);
    prof := public.venue_profile_read(v_canon, k.scope_space_id, k.attribute_key, p_at, p_conditions);

    if prof->>'status' = 'unobserved' then
      -- expired vs never-known: an unsuperseded observation exists but its
      -- explicit expiry precedes the evaluation date → EXPIRED (critical)
      select o.id, o.expires_at into exp from public.venue_observation o
        where o.tenant_id = public.current_tenant_id()
          and o.venue_id in (select public.venue_family(v_canon))
          and o.attribute_key = k.attribute_key
          and (o.scope_space_id is not distinct from k.scope_space_id)
          and o.expires_at is not null and o.expires_at <= p_at
          and not exists (select 1 from public.venue_observation_supersession s where s.observation_id = o.id)
        order by o.expires_at desc limit 1;
      if found then
        fnd := fnd || jsonb_build_object('kind','expired','severity','critical',
          'family',v_fam,'attribute',k.attribute_key,'scope_space',k.scope_space_id,
          'observation_id',exp.id,'expired_at',exp.expires_at,
          'reason', k.attribute_key||' expired '||to_char(exp.expires_at,'YYYY-MM-DD')||' — before the evaluation date');
      end if;
      continue;
    end if;

    -- renovation invalidation (critical, regardless of freshness otherwise)
    select max(coalesce(o.effective_at, o.observed_at)) into v_reno_eff
      from public.venue_observation o
      where o.tenant_id = public.current_tenant_id()
        and o.venue_id in (select public.venue_family(v_canon))
        and o.attribute_key = 'renovation_event'
        and not exists (select 1 from public.venue_observation_supersession s where s.observation_id = o.id)
        and coalesce(o.effective_at, o.observed_at) <= p_at
        and (o.scope_space_id is null or public.space_within(k.scope_space_id, o.scope_space_id))
        and coalesce(o.effective_at, o.observed_at) > (prof->>'observed_at')::timestamptz;
    if v_reno_eff is not null then
      fnd := fnd || jsonb_build_object('kind','renovation_reverification','severity','critical',
        'family',v_fam,'attribute',k.attribute_key,'scope_space',k.scope_space_id,
        'observation_id',prof->>'observation_id','renovated_at',v_reno_eff,
        'reason', k.attribute_key||' predates the '||to_char(v_reno_eff,'YYYY-MM-DD')||' renovation — re-verify');
    end if;

    -- contradiction carry-through (single source: the profile)
    if prof->'contradiction' is not null and prof->'contradiction' <> 'null'::jsonb then
      fnd := fnd || jsonb_build_object('kind','contradiction_unresolved','severity','critical',
        'family',v_fam,'attribute',k.attribute_key,'scope_space',k.scope_space_id,
        'observation_id',prof->>'observation_id','disputed_by',prof->'contradiction'->>'disputing_observation',
        'reason', k.attribute_key||' has a newer conflicting '||replace(prof->'contradiction'->>'source_class','_',' ')||' — resolve or supersede');
    end if;

    -- age staleness — ONLY for observations without explicit expiry (ruling 4)
    if (select expires_at from public.venue_observation where id = (prof->>'observation_id')::uuid) is null
       and pol.max_age_days is not null then
      v_age_days := extract(epoch from (p_at - (prof->>'observed_at')::timestamptz)) / 86400.0;
      if v_age_days > pol.max_age_days then
        fnd := fnd || jsonb_build_object('kind','stale','severity',pol.severity,
          'family',v_fam,'attribute',k.attribute_key,'scope_space',k.scope_space_id,
          'observation_id',prof->>'observation_id','age_days',round(v_age_days),
          'reason', k.attribute_key||' last verified '||to_char((prof->>'observed_at')::timestamptz,'YYYY-MM-DD')||' — over the '||pol.max_age_days||'-day '||v_fam||' threshold');
      end if;
    end if;
  end loop;

  -- unobserved verify_required families (ruling 11)
  for pol in
    select p.attribute_family as fam from public.venue_staleness_policy p
     where p.tenant_id = public.current_tenant_id() and p.verify_required
  loop
    if not exists (
      select 1 from public.venue_observation o
       where o.tenant_id = public.current_tenant_id()
         and o.venue_id in (select public.venue_family(v_canon))
         and o.attribute_key <> 'renovation_event'
         and public.attribute_family(o.attribute_key) = pol.fam
         and not exists (select 1 from public.venue_observation_supersession s where s.observation_id = o.id))
    then
      fnd := fnd || jsonb_build_object('kind','unobserved','severity','critical',
        'family',pol.fam,'attribute',null,'scope_space',null,
        'reason', pol.fam||' knowledge is required by policy but has never been observed at this venue');
    end if;
  end loop;

  return coalesce((select jsonb_agg(e order by e->>'kind', e->>'family', coalesce(e->>'attribute',''), coalesce(e->>'scope_space',''))
                   from jsonb_array_elements(fnd) e), '[]'::jsonb);
end $$;


--
-- Name: venue_observation_scope_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.venue_observation_scope_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare e uuid;
begin
  if new.scope_space_id is not null and not exists
     (select 1 from public.venue_space s where s.id=new.scope_space_id and s.venue_id=new.venue_id and s.tenant_id=new.tenant_id)
    then raise exception 'OBSERVATION_INVALID_SCOPE'; end if;
  if new.scope_space2_id is not null and not exists
     (select 1 from public.venue_space s where s.id=new.scope_space2_id and s.venue_id=new.venue_id and s.tenant_id=new.tenant_id)
    then raise exception 'OBSERVATION_INVALID_SCOPE'; end if;
  if new.walkthrough_id is not null and not exists
     (select 1 from public.venue_walkthrough w where w.id=new.walkthrough_id and w.venue_id=new.venue_id and w.tenant_id=new.tenant_id)
    then raise exception 'OBSERVATION_INVALID_SCOPE'; end if;
  foreach e in array new.evidence_refs loop
    if not exists (select 1 from public.venue_evidence v where v.id=e and v.venue_id=new.venue_id and v.tenant_id=new.tenant_id)
      then raise exception 'OBSERVATION_INVALID_EVIDENCE'; end if;
  end loop;
  return new;
end $$;


--
-- Name: venue_profile(uuid, timestamp with time zone, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.venue_profile(p_venue uuid, p_context timestamp with time zone DEFAULT now(), p_conditions text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(
           public.venue_profile_read(p_venue, k.scope_space_id, k.attribute_key, p_context, p_conditions)
           order by k.attribute_key), '[]'::jsonb)
  from (select distinct o.scope_space_id, o.attribute_key
          from public.venue_observation o
         where o.tenant_id = public.current_tenant_id()
           and o.venue_id in (select public.venue_family(public.resolve_venue(p_venue)))) k;
$$;


--
-- Name: venue_profile_read(uuid, uuid, text, timestamp with time zone, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.venue_profile_read(p_venue uuid, p_scope_space uuid, p_attribute text, p_context timestamp with time zone DEFAULT now(), p_conditions text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_gov uuid; g record; d record; v_contra jsonb := null;
begin
  if public.resolve_venue(p_venue) is null then return null; end if;   -- cross-tenant: nothing
  v_gov := public.current_observation(p_venue, p_scope_space, p_attribute, p_context, p_conditions);
  if v_gov is null then
    return jsonb_build_object('status','unobserved','attribute',p_attribute,'scope_space',p_scope_space);
  end if;
  select * into g from public.venue_observation where id = v_gov;
  -- contradiction: a NEWER, LOWER-class, applicable, unsuperseded observation
  -- whose value materially differs. It never overrides; it derives a finding.
  select o.* into d from public.venue_observation o
    where o.tenant_id = public.current_tenant_id()
      and o.venue_id in (select public.venue_family(public.resolve_venue(p_venue)))
      and o.attribute_key = p_attribute
      and (o.scope_space_id is not distinct from p_scope_space)
      and not exists (select 1 from public.venue_observation_supersession s where s.observation_id = o.id)
      and (o.effective_at is null or o.effective_at <= p_context)
      and (o.expires_at   is null or o.expires_at   >  p_context)
      and (o.condition_key is null or (p_conditions is not null and o.condition_key = any(p_conditions)))
      and public.source_class_rank(o.source_class) > public.source_class_rank(g.source_class)
      and o.observed_at > g.observed_at
      and o.value is distinct from g.value
    order by o.observed_at desc limit 1;
  if found then
    v_contra := jsonb_build_object('disputing_observation', d.id, 'source_class', d.source_class,
                                   'observed_at', d.observed_at, 'value', d.value, 'observer', d.observer);
  end if;
  return jsonb_build_object(
    'status', case when g.value_kind = 'absent' then 'observed_absent' else 'observed' end,
    'attribute', p_attribute, 'scope_space', p_scope_space,
    'value', g.value, 'value_kind', g.value_kind, 'narrative', g.narrative,
    'source_class', g.source_class, 'observed_at', g.observed_at, 'observer', g.observer,
    'observation_id', g.id, 'evidence_refs', to_jsonb(g.evidence_refs),
    'contradiction', v_contra);
end $$;


--
-- Name: venue_space_nesting_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.venue_space_nesting_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare p record; d int := 0; cur uuid;
begin
  if new.parent_space_id is not null then
    if new.parent_space_id = new.id then raise exception 'VENUE_SPACE_INVALID_PARENT'; end if;
    select * into p from public.venue_space where id = new.parent_space_id;
    if not found or p.venue_id <> new.venue_id or p.tenant_id <> new.tenant_id then
      raise exception 'VENUE_SPACE_INVALID_PARENT';
    end if;
    cur := new.parent_space_id;
    while cur is not null loop
      d := d + 1;
      if d > 6 then raise exception 'VENUE_SPACE_DEPTH'; end if;
      select parent_space_id into cur from public.venue_space where id = cur;
    end loop;
  end if;
  return new;
end $$;


--
-- Name: venue_verification_requirement(uuid, timestamp with time zone, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.venue_verification_requirement(p_venue uuid, p_at timestamp with time zone DEFAULT now(), p_conditions text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_canon uuid; fnd jsonb; crit jsonb; n_fam int; has_wide_reno boolean; walked int; verdict text; reasons jsonb;
begin
  v_canon := public.resolve_venue(p_venue);
  if v_canon is null then return null; end if;
  fnd := public.venue_knowledge_findings(p_venue, p_at, p_conditions);
  select coalesce(jsonb_agg(e), '[]'::jsonb) into crit
    from jsonb_array_elements(fnd) e where e->>'severity' = 'critical';
  select count(distinct e->>'family') into n_fam from jsonb_array_elements(crit) e;
  select exists (select 1 from jsonb_array_elements(crit) e
                  where e->>'kind'='renovation_reverification' and e->>'scope_space' is null) into has_wide_reno;
  -- venue-wide renovation: any wide reno event that invalidated anything
  if not has_wide_reno then
    select exists (
      select 1 from jsonb_array_elements(crit) e
       where e->>'kind'='renovation_reverification'
         and exists (select 1 from public.venue_observation o
                      where o.attribute_key='renovation_event' and o.scope_space_id is null
                        and o.venue_id in (select public.venue_family(v_canon))
                        and coalesce(o.effective_at,o.observed_at) <= p_at)) into has_wide_reno;
  end if;
  select count(*) into walked from public.venue_walkthrough
    where tenant_id = public.current_tenant_id() and venue_id in (select public.venue_family(v_canon));
  select coalesce(jsonb_agg(e->>'reason'), '[]'::jsonb) into reasons from jsonb_array_elements(crit) e;

  if jsonb_array_length(crit) = 0 then verdict := 'none';
  elsif n_fam >= 3 or has_wide_reno or walked = 0 then verdict := 'walkthrough_required';
  else verdict := 'targeted_verification';
  end if;
  return jsonb_build_object('verification', verdict, 'critical_count', jsonb_array_length(crit),
                            'critical_families', n_fam, 'reasons', reasons, 'findings', fnd);
end $$;


--
-- Name: withdraw_offer(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.withdraw_offer(p_version uuid, p_actor text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: acceptance_rescissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acceptance_rescissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    acceptance_id uuid NOT NULL,
    policy_class text NOT NULL,
    acting_party jsonb,
    actor text NOT NULL,
    authority_basis text NOT NULL,
    evidence jsonb NOT NULL,
    republish_permission boolean NOT NULL,
    reason text NOT NULL,
    recorded_moment timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT acceptance_rescissions_policy_class_check CHECK ((policy_class = ANY (ARRAY['self_withdrawal'::text, 'mutual_release'::text, 'operator_correction'::text, 'fraud_correction'::text, 'compelled_reversal'::text])))
);


--
-- Name: TABLE acceptance_rescissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.acceptance_rescissions IS 'v272/PL-4 Phase B: immutable binding release of an acceptance. Insert+select only. UNIQUE(acceptance_id) = single effective rescission (every row is binding; commentary/refusals go to audit logs, never here). The acceptance it references is never touched (I-27). republish_permission here is the source the projection and the publish gate derive from (I-30).';


--
-- Name: acceptance_selection_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acceptance_selection_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    acceptance_id uuid NOT NULL,
    selections jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE acceptance_selection_sets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.acceptance_selection_sets IS 'v269/PL-4 A.2: immutable 1:1 selection-set child. Insert+select only. UNIQUE(acceptance_id) = exactly one child per acceptance. Frozen group/option identities reference the snapshot model by value, never live choice_groups.';


--
-- Name: act_produced_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.act_produced_artifacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    act_id uuid NOT NULL,
    artifact_kind text NOT NULL,
    revision_id uuid NOT NULL,
    layer_key text,
    superseded_revision uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT act_produced_artifacts_artifact_kind_check CHECK ((artifact_kind = ANY (ARRAY['config_revision'::text, 'layer_revision'::text])))
);


--
-- Name: action_invocation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.action_invocation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    action_key text NOT NULL,
    target_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    payload_hash text NOT NULL,
    actor text NOT NULL,
    outcome text NOT NULL,
    result jsonb,
    evidence_ref uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: attendance_commitment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_commitment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    head_count integer NOT NULL,
    basis text NOT NULL,
    effective_moment timestamp with time zone NOT NULL,
    replaces_id uuid,
    reason text,
    recorded_by text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    seq bigint NOT NULL,
    occurrence_id uuid NOT NULL,
    CONSTRAINT attendance_commitment_basis_check CHECK ((basis = ANY (ARRAY['estimated'::text, 'contracted'::text, 'guaranteed'::text, 'final'::text]))),
    CONSTRAINT attendance_commitment_head_count_check CHECK ((head_count >= 0))
);


--
-- Name: COLUMN attendance_commitment.basis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.attendance_commitment.basis IS 'estimated = planning count before contractual commitment; contracted = count sold in the accepted agreement; guaranteed = client''s binding operational guarantee; final = final billable count established under the contract. Revision is expressed by the append-only supersession chain, never by basis. Observed attendance (actual) is execution evidence and is NOT in this slice.';


--
-- Name: attendance_commitment_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.attendance_commitment ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.attendance_commitment_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: blueprint_compositions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blueprint_compositions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    source_identity_id uuid NOT NULL,
    source_revision_id uuid NOT NULL,
    source_fingerprint text NOT NULL,
    dest_identity_id uuid NOT NULL,
    dest_revision_id uuid NOT NULL,
    actor uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    selected_regions jsonb DEFAULT '{}'::jsonb NOT NULL,
    collision_choices jsonb DEFAULT '{}'::jsonb NOT NULL,
    omissions jsonb DEFAULT '[]'::jsonb NOT NULL,
    transformations jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: blueprint_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blueprint_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    taxonomy text,
    status text DEFAULT 'active'::text NOT NULL,
    published_revision_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    retired_at timestamp with time zone,
    CONSTRAINT blueprint_identities_name_check CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT blueprint_identities_status_check CHECK ((status = ANY (ARRAY['active'::text, 'retired'::text])))
);


--
-- Name: blueprint_instantiations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blueprint_instantiations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    blueprint_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    revision_number integer NOT NULL,
    fingerprint text NOT NULL,
    booking_id uuid NOT NULL,
    proposal_id uuid NOT NULL,
    version_id uuid NOT NULL,
    snapshot_at timestamp with time zone NOT NULL,
    parameters jsonb NOT NULL,
    branches jsonb DEFAULT '[]'::jsonb NOT NULL,
    definition_revisions jsonb NOT NULL,
    fixed_price_decisions jsonb DEFAULT '[]'::jsonb NOT NULL,
    frozen_baseline jsonb NOT NULL,
    actor uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blueprint_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blueprint_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identity_id uuid NOT NULL,
    revision_number integer NOT NULL,
    state text DEFAULT 'draft'::text NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    supersedes_revision_id uuid,
    seeded_from_revision_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    published_by uuid,
    promoted_from_version_id uuid,
    CONSTRAINT blueprint_revisions_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'published'::text, 'superseded'::text])))
);


--
-- Name: blueprint_shelf_acts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blueprint_shelf_acts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    identity_id uuid NOT NULL,
    revision_id uuid,
    act text NOT NULL,
    declaration text,
    actor uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    detail jsonb,
    CONSTRAINT blueprint_shelf_acts_act_check CHECK ((act = ANY (ARRAY['publish'::text, 'retire'::text, 'reinstate'::text, 'promote'::text]))),
    CONSTRAINT bsa_publish_requires_intent CHECK (((act <> 'publish'::text) OR (declaration = 'This revision is now organizational knowledge.'::text)))
);


--
-- Name: blueprints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blueprints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    event_type text,
    source_version_id uuid,
    source_label text DEFAULT ''::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    contact_name text NOT NULL,
    invoice_num text NOT NULL,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    spine_state text,
    relationship_id uuid,
    CONSTRAINT bookings_spine_state_chk CHECK (((spine_state IS NULL) OR (spine_state = ANY (ARRAY['inquiry'::text, 'proposing'::text, 'committed'::text, 'in_execution'::text, 'delivered'::text, 'settled'::text, 'declined'::text, 'cancelled'::text]))))
);


--
-- Name: choice_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.choice_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id(),
    version_id uuid NOT NULL,
    section_type_id uuid,
    component_id uuid,
    name text,
    label text,
    choose_count integer,
    min_count integer,
    max_count integer,
    "position" integer,
    options jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: component_definition_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.component_definition_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    definition_id uuid NOT NULL,
    schema_version integer NOT NULL,
    data jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    superseded_by uuid,
    archived_at timestamp with time zone
);


--
-- Name: component_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.component_definitions (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT component_identities_id_not_null NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id(),
    name text CONSTRAINT component_identities_name_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT component_identities_created_at_not_null NOT NULL,
    status text DEFAULT 'implicit'::text NOT NULL,
    description text,
    archived_at timestamp with time zone,
    promoted_by uuid,
    promoted_at timestamp with time zone,
    created_by_process text DEFAULT 'authored'::text NOT NULL,
    source_definition_id uuid,
    CONSTRAINT component_definitions_status_chk CHECK ((status = ANY (ARRAY['implicit'::text, 'curated'::text]))),
    CONSTRAINT component_identities_name_nonempty CHECK ((btrim(name) <> ''::text))
);


--
-- Name: component_identities; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.component_identities WITH (security_invoker='true') AS
 SELECT id,
    tenant_id,
    name,
    created_at
   FROM public.component_definitions;


--
-- Name: component_instance_layers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.component_instance_layers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_id uuid NOT NULL,
    layer_key text NOT NULL,
    schema_version integer NOT NULL,
    data jsonb NOT NULL,
    copied_from uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT component_instance_layers_layer_key_check CHECK ((btrim(layer_key) <> ''::text))
);


--
-- Name: component_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.component_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    quantity numeric,
    quantity_basis text,
    unit_price numeric,
    "position" integer DEFAULT 0 NOT NULL,
    item_role text DEFAULT 'included'::text NOT NULL,
    selected boolean DEFAULT true NOT NULL,
    choice_group_id uuid,
    is_default_choice boolean DEFAULT false NOT NULL,
    presentation_note text,
    show_on_proposal boolean DEFAULT true NOT NULL,
    category_key text,
    price_state text DEFAULT 'quoted'::text NOT NULL,
    instantiation_id uuid,
    CONSTRAINT component_items_price_state_chk CHECK ((price_state = ANY (ARRAY['quoted'::text, 'included'::text, 'free'::text, 'internal'::text])))
);


--
-- Name: COLUMN component_items.price_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.component_items.price_state IS 'v194: quoted=unit_price is the sell price (NULL⇒unknown⇒debt) | included=covered by another charge | free=deliberately $0 | internal=operational only, no financial line. "Pending" remains price_confirmed=false.';


--
-- Name: component_layers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.component_layers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    definition_id uuid NOT NULL,
    layer_key text NOT NULL,
    schema_version integer NOT NULL,
    data jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    superseded_by uuid,
    archived_at timestamp with time zone,
    CONSTRAINT component_layers_layer_key_check CHECK ((btrim(layer_key) <> ''::text))
);


--
-- Name: component_profile_override; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.component_profile_override (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    event_component_id uuid NOT NULL,
    kind text NOT NULL,
    target_requirement_id uuid,
    param_name text,
    param_value text,
    requirement jsonb,
    reason text,
    actor text NOT NULL,
    seq bigint NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT component_profile_override_kind_check CHECK ((kind = ANY (ARRAY['parameter'::text, 'suppress'::text, 'add'::text, 'replace'::text]))),
    CONSTRAINT component_profile_override_param_name_check CHECK (((param_name IS NULL) OR public.profile_param_valid(param_name))),
    CONSTRAINT override_shape CHECK ((((kind = 'parameter'::text) AND (param_name IS NOT NULL) AND (param_value IS NOT NULL) AND (target_requirement_id IS NULL) AND (requirement IS NULL)) OR ((kind = 'suppress'::text) AND (target_requirement_id IS NOT NULL) AND (requirement IS NULL) AND (COALESCE(TRIM(BOTH FROM reason), ''::text) <> ''::text)) OR ((kind = 'add'::text) AND (requirement IS NOT NULL) AND (target_requirement_id IS NULL)) OR ((kind = 'replace'::text) AND (target_requirement_id IS NOT NULL) AND (requirement IS NOT NULL))))
);


--
-- Name: component_profile_override_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.component_profile_override ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.component_profile_override_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: component_profile_revision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.component_profile_revision (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    library_component_id uuid NOT NULL,
    revision_no integer NOT NULL,
    reason text,
    supersedes_revision_id uuid,
    authored_by text NOT NULL,
    seq bigint NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


--
-- Name: component_profile_revision_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.component_profile_revision ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.component_profile_revision_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: component_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.component_requirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_id uuid NOT NULL,
    name text NOT NULL,
    category text,
    notes text,
    layer_key text,
    logical_key text,
    derived boolean DEFAULT false NOT NULL,
    suppressed_at timestamp with time zone
);


--
-- Name: configuration_moves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuration_moves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_id uuid NOT NULL,
    kind text NOT NULL,
    payload jsonb NOT NULL,
    before jsonb,
    origin text NOT NULL,
    parent_move_id uuid,
    cause text,
    actor uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT configuration_moves_kind_check CHECK ((btrim(kind) <> ''::text)),
    CONSTRAINT configuration_moves_origin_check CHECK ((origin = ANY (ARRAY['facet'::text, 'canvas'::text, 'scheme'::text, 'intent.deterministic'::text, 'intent.model'::text, 'intent.replay'::text])))
);


--
-- Name: definition_revision_acts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.definition_revision_acts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    definition_id uuid NOT NULL,
    origin text NOT NULL,
    note text NOT NULL,
    review_session_key text,
    actor uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT definition_revision_acts_note_check CHECK ((btrim(note) <> ''::text)),
    CONSTRAINT definition_revision_acts_origin_check CHECK ((origin = ANY (ARRAY['promotion'::text, 'executive_curation'::text])))
);


--
-- Name: engagement_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engagement_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    ceremony text NOT NULL,
    actor text NOT NULL,
    moment timestamp with time zone DEFAULT now() NOT NULL,
    from_state text,
    to_state text,
    object_ref uuid,
    reason text,
    relationship_ref uuid,
    prev_relationship_ref uuid,
    snapshot_ref uuid,
    fingerprint_ref text
);


--
-- Name: engagement_occurrence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engagement_occurrence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    ordinal integer NOT NULL,
    open_basis text DEFAULT 'declared'::text NOT NULL,
    opened_by text NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engagement_occurrence_open_basis_check CHECK ((open_basis = ANY (ARRAY['declared'::text, 'release_implied'::text]))),
    CONSTRAINT engagement_occurrence_ordinal_check CHECK ((ordinal >= 1))
);


--
-- Name: engagement_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engagement_profile (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    display_name text,
    client_display_name text,
    replaces_id uuid,
    reason text,
    recorded_by text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    seq bigint NOT NULL,
    CONSTRAINT engagement_profile_not_empty CHECK (((display_name IS NOT NULL) OR (client_display_name IS NOT NULL)))
);


--
-- Name: engagement_profile_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.engagement_profile ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.engagement_profile_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: occurrence_schedule_milestone; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.occurrence_schedule_milestone (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT engagement_schedule_milestone_id_not_null NOT NULL,
    tenant_id uuid CONSTRAINT engagement_schedule_milestone_tenant_id_not_null NOT NULL,
    milestone_key text CONSTRAINT engagement_schedule_milestone_milestone_key_not_null NOT NULL,
    label text,
    at_date date,
    at_moment timestamp with time zone,
    window_end timestamp with time zone,
    cleared boolean DEFAULT false CONSTRAINT engagement_schedule_milestone_cleared_not_null NOT NULL,
    replaces_id uuid,
    reason text,
    recorded_by text CONSTRAINT engagement_schedule_milestone_recorded_by_not_null NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() CONSTRAINT engagement_schedule_milestone_recorded_at_not_null NOT NULL,
    seq bigint CONSTRAINT engagement_schedule_milestone_seq_not_null NOT NULL,
    occurrence_id uuid NOT NULL,
    CONSTRAINT engagement_schedule_milestone_milestone_key_check CHECK ((milestone_key = ANY (ARRAY['operating_date'::text, 'production_start'::text, 'warehouse_departure'::text, 'load_in_start'::text, 'load_in_end'::text, 'staff_call'::text, 'vendor_arrival'::text, 'ceremony'::text, 'cocktail_start'::text, 'service_start'::text, 'service_end'::text, 'dessert'::text, 'breakdown_start'::text, 'breakdown_end'::text, 'venue_clear'::text, 'custom'::text]))),
    CONSTRAINT milestone_cleared_shape CHECK (((cleared AND (at_date IS NULL) AND (at_moment IS NULL) AND (window_end IS NULL)) OR ((NOT cleared) AND ((at_date IS NOT NULL) OR (at_moment IS NOT NULL))))),
    CONSTRAINT milestone_custom_labelled CHECK (((milestone_key <> 'custom'::text) OR cleared OR (COALESCE(TRIM(BOTH FROM label), ''::text) <> ''::text))),
    CONSTRAINT milestone_moment_shape CHECK (((milestone_key = 'operating_date'::text) OR (at_date IS NULL))),
    CONSTRAINT milestone_operating_date_shape CHECK (((milestone_key <> 'operating_date'::text) OR ((at_moment IS NULL) AND (window_end IS NULL)))),
    CONSTRAINT milestone_window_forward CHECK (((window_end IS NULL) OR (at_moment IS NULL) OR (window_end >= at_moment)))
);


--
-- Name: TABLE occurrence_schedule_milestone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.occurrence_schedule_milestone IS 'Supervision has its own object. A supervision marker on a timeline must be DERIVED from engagement_supervision, never captured here — dual capture of the same fact is forbidden.';


--
-- Name: engagement_schedule_milestone_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.occurrence_schedule_milestone ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.engagement_schedule_milestone_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: engagement_supervision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engagement_supervision (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    authority_org text,
    window_start timestamp with time zone,
    window_end timestamp with time zone,
    certificate_ref text,
    contact text,
    cleared boolean DEFAULT false NOT NULL,
    replaces_id uuid,
    reason text,
    recorded_by text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    seq bigint NOT NULL,
    CONSTRAINT supervision_cleared_shape CHECK (((cleared AND (authority_org IS NULL) AND (window_start IS NULL) AND (window_end IS NULL) AND (certificate_ref IS NULL) AND (contact IS NULL)) OR ((NOT cleared) AND (COALESCE(TRIM(BOTH FROM authority_org), ''::text) <> ''::text)))),
    CONSTRAINT supervision_window_forward CHECK (((window_start IS NULL) OR (window_end IS NULL) OR (window_end >= window_start)))
);


--
-- Name: engagement_supervision_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.engagement_supervision ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.engagement_supervision_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: engagement_venue_binding; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engagement_venue_binding (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    venue_id uuid NOT NULL,
    replaces_binding_id uuid,
    reason text,
    venue_name_snapshot text NOT NULL,
    venue_address_snapshot text,
    bound_by text NOT NULL,
    seq bigint NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


--
-- Name: engagement_venue_binding_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.engagement_venue_binding ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.engagement_venue_binding_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    engagement_ref uuid NOT NULL,
    origin_commitment_ref uuid NOT NULL,
    released_at timestamp with time zone DEFAULT now() NOT NULL,
    released_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    occurrence_ref uuid NOT NULL
);


--
-- Name: event_component_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_component_config (
    component_id uuid NOT NULL,
    schema_version integer NOT NULL,
    data jsonb NOT NULL,
    seed_config_revision uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    baseline jsonb,
    baseline_provenance text DEFAULT 'instantiation_stamp'::text NOT NULL,
    baseline_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ecc_baseline_provenance_chk CHECK ((baseline_provenance = ANY (ARRAY['instantiation_stamp'::text, 'legacy_initialized_from_definition'::text, 'reconstructed_from_instance'::text, 'baseline_unknown'::text])))
);


--
-- Name: event_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_components (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id() NOT NULL,
    booking_id uuid,
    proposal_version_id uuid,
    title text,
    domain text,
    "position" integer,
    pricing_mode text DEFAULT 'itemized'::text NOT NULL,
    package_price numeric,
    package_basis text DEFAULT 'flat'::text NOT NULL,
    package_taxable boolean DEFAULT true NOT NULL,
    package_price_confirmed boolean DEFAULT true NOT NULL,
    package_cost numeric,
    customer_description text,
    group_label text,
    group_position integer DEFAULT 0 NOT NULL,
    group_description text,
    proposal_display text DEFAULT 'items'::text NOT NULL,
    item_categories jsonb DEFAULT '[]'::jsonb NOT NULL,
    item_layout text DEFAULT 'vertical'::text NOT NULL,
    uncategorized_position text DEFAULT 'bottom'::text NOT NULL,
    definition_id uuid,
    package_audience uuid[],
    instantiation_id uuid,
    library_component_id uuid,
    profile_revision_id uuid,
    CONSTRAINT event_components_item_categories_chk CHECK ((jsonb_typeof(item_categories) = 'array'::text)),
    CONSTRAINT event_components_item_layout_chk CHECK ((item_layout = ANY (ARRAY['vertical'::text, 'comma'::text, 'dot'::text]))),
    CONSTRAINT event_components_proposal_display_check CHECK ((proposal_display = ANY (ARRAY['title_only'::text, 'description'::text, 'items'::text]))),
    CONSTRAINT event_components_uncat_pos_chk CHECK ((uncategorized_position = ANY (ARRAY['top'::text, 'bottom'::text])))
);


--
-- Name: COLUMN event_components.package_audience; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_components.package_audience IS 'v194: guest_categories this package price multiplies against. NULL/empty = all guests. Only meaningful when pricing_mode=package and package_basis=per_person.';


--
-- Name: event_debriefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_debriefs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    component_id uuid,
    author text,
    worked text,
    didnt_work text,
    would_repeat text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: execution_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.execution_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    event_ref uuid,
    obligation_ref uuid,
    kind text NOT NULL,
    actor text NOT NULL,
    moment timestamp with time zone DEFAULT now() NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    prior_ref uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT execution_evidence_anchor_check CHECK (((event_ref IS NOT NULL) OR (obligation_ref IS NOT NULL))),
    CONSTRAINT execution_evidence_kind_check CHECK ((kind = ANY (ARRAY['released'::text, 'clearance'::text, 'sign_off'::text, 'assignment'::text, 'scan'::text, 'inspection'::text, 'completion'::text, 'exception'::text, 'invalidated'::text, 'superseded'::text, 'cancelled'::text, 'service_start'::text, 'event_closed'::text])))
);


--
-- Name: guest_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guest_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id(),
    name text,
    key text,
    label text
);


--
-- Name: library_component; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_component (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    kind text DEFAULT 'general'::text NOT NULL,
    notes text,
    active boolean DEFAULT true NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: obligation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.obligation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    event_ref uuid,
    origin_ref uuid NOT NULL,
    origin_kind text NOT NULL,
    kind text NOT NULL,
    department text NOT NULL,
    required_outcome text NOT NULL,
    resource_role text,
    dependencies jsonb DEFAULT '[]'::jsonb NOT NULL,
    timing jsonb,
    natural_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    origin_revision uuid,
    scope text DEFAULT 'event'::text NOT NULL,
    supersedes_ref uuid,
    anchors jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT obligation_department_check CHECK ((department = ANY (ARRAY['culinary'::text, 'equipment'::text, 'staffing'::text, 'venue'::text, 'logistics'::text]))),
    CONSTRAINT obligation_origin_kind_check CHECK ((origin_kind = ANY (ARRAY['selection'::text, 'release'::text, 'manual_authorized'::text, 'knowledge'::text, 'attestation'::text]))),
    CONSTRAINT obligation_scope_anchor_check CHECK ((((scope = 'event'::text) AND (event_ref IS NOT NULL)) OR ((scope = 'standing'::text) AND (event_ref IS NULL) AND (origin_kind = ANY (ARRAY['knowledge'::text, 'attestation'::text]))))),
    CONSTRAINT obligation_scope_check CHECK ((scope = ANY (ARRAY['event'::text, 'standing'::text])))
);


--
-- Name: TABLE obligation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.obligation IS 'THE RESPONSIBILITY RECORD (Responsibility OS Constitution v285 Rev B). Physically named `obligation` for compatibility per constitutional ruling; canonical vocabulary is `responsibility` at every function boundary. Deliberately carries NO lifecycle status column (R-3): state is projected by responsibility_state() from evidence + truth + clock.';


--
-- Name: occurrence_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.occurrence_profile (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    occurrence_id uuid NOT NULL,
    display_name text,
    occasion_kind text,
    replaces_id uuid,
    reason text,
    recorded_by text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    seq bigint NOT NULL,
    CONSTRAINT occurrence_profile_not_empty CHECK (((display_name IS NOT NULL) OR (occasion_kind IS NOT NULL)))
);


--
-- Name: occurrence_profile_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.occurrence_profile ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.occurrence_profile_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: occurrence_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.occurrence_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    occurrence_id uuid NOT NULL,
    status text NOT NULL,
    reason text NOT NULL,
    recorded_by text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    seq bigint NOT NULL,
    CONSTRAINT occurrence_status_status_check CHECK ((status = ANY (ARRAY['cancelled'::text, 'reinstated'::text])))
);


--
-- Name: occurrence_status_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.occurrence_status ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.occurrence_status_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: occurrence_supervision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.occurrence_supervision (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    occurrence_id uuid NOT NULL,
    authority_org text,
    window_start timestamp with time zone,
    window_end timestamp with time zone,
    certificate_ref text,
    contact text,
    cleared boolean DEFAULT false NOT NULL,
    replaces_id uuid,
    reason text,
    recorded_by text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    seq bigint NOT NULL,
    CONSTRAINT occ_supervision_cleared_shape CHECK (((cleared AND (authority_org IS NULL) AND (window_start IS NULL) AND (window_end IS NULL) AND (certificate_ref IS NULL) AND (contact IS NULL)) OR ((NOT cleared) AND (COALESCE(TRIM(BOTH FROM authority_org), ''::text) <> ''::text)))),
    CONSTRAINT occ_supervision_window_forward CHECK (((window_start IS NULL) OR (window_end IS NULL) OR (window_end >= window_start)))
);


--
-- Name: occurrence_supervision_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.occurrence_supervision ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.occurrence_supervision_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: occurrence_venue_binding; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.occurrence_venue_binding (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    occurrence_id uuid NOT NULL,
    venue_id uuid NOT NULL,
    venue_name_snapshot text NOT NULL,
    venue_address_snapshot text,
    replaces_id uuid,
    reason text,
    recorded_by text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    seq bigint NOT NULL
);


--
-- Name: occurrence_venue_binding_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.occurrence_venue_binding ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.occurrence_venue_binding_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: offer_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offer_acceptances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    snapshot_id uuid NOT NULL,
    fingerprint text NOT NULL,
    booking_id uuid NOT NULL,
    principal jsonb,
    acting_person jsonb,
    recording_operator uuid,
    authority_basis text,
    evidence_basis text,
    channel text,
    recorded_moment timestamp with time zone DEFAULT now() NOT NULL,
    claimed_moment timestamp with time zone,
    capability_ref jsonb,
    attestation_ref jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE offer_acceptances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.offer_acceptances IS 'v269/PL-4 A.1: immutable acceptance evidence. Insert+select only. UNIQUE(snapshot_id) = at most one acceptance per Offer (I-20). Reserved identity fields (principal/acting_person/recording_operator/authority_basis, claimed_moment, capability/attestation refs) are first populated by v271.';


--
-- Name: offer_endpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offer_endpoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    snapshot_id uuid NOT NULL,
    token text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: offer_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offer_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    version_id uuid NOT NULL,
    fingerprint text NOT NULL,
    model jsonb NOT NULL,
    artifact_bytes bytea NOT NULL,
    artifact_hash text NOT NULL,
    artifact_meta jsonb NOT NULL,
    assets jsonb DEFAULT '[]'::jsonb NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: photo_library; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.photo_library (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    url text NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profile_requirement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_requirement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    family text NOT NULL,
    kind text NOT NULL,
    label text NOT NULL,
    capability boolean DEFAULT false NOT NULL,
    provision_source text DEFAULT 'company'::text NOT NULL,
    basis text NOT NULL,
    rate numeric NOT NULL,
    band_size integer,
    min_qty numeric,
    max_qty numeric,
    rounding text DEFAULT 'ceil'::text NOT NULL,
    unit text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    aggregation text NOT NULL,
    temporal text NOT NULL,
    condition_param text,
    condition_value text,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profile_req_band CHECK (((basis <> 'per_guest_band'::text) OR ((band_size IS NOT NULL) AND (band_size > 0)))),
    CONSTRAINT profile_req_condition CHECK (((condition_param IS NULL) = (condition_value IS NULL))),
    CONSTRAINT profile_req_kind_valid CHECK (public.profile_kind_valid(family, kind)),
    CONSTRAINT profile_req_no_formulas CHECK ((NOT (payload ?| ARRAY['formula'::text, 'expr'::text, 'expression'::text, 'code'::text, 'script'::text, 'eval'::text]))),
    CONSTRAINT profile_req_unit_valid CHECK (public.profile_unit_valid(family, unit)),
    CONSTRAINT profile_requirement_aggregation_check CHECK ((aggregation = ANY (ARRAY['additive'::text, 'shareable'::text, 'capacity'::text, 'exclusive'::text]))),
    CONSTRAINT profile_requirement_basis_check CHECK ((basis = ANY (ARRAY['fixed'::text, 'per_instance'::text, 'per_service_point'::text, 'per_guest'::text, 'per_guest_band'::text, 'per_table'::text, 'per_hour'::text, 'per_shift'::text, 'per_batch'::text]))),
    CONSTRAINT profile_requirement_condition_param_check CHECK (((condition_param IS NULL) OR public.profile_param_valid(condition_param))),
    CONSTRAINT profile_requirement_family_check CHECK (public.profile_family_valid(family)),
    CONSTRAINT profile_requirement_provision_source_check CHECK ((provision_source = ANY (ARRAY['company'::text, 'rented'::text, 'venue'::text, 'any'::text]))),
    CONSTRAINT profile_requirement_rounding_check CHECK ((rounding = ANY (ARRAY['ceil'::text, 'floor'::text, 'nearest'::text]))),
    CONSTRAINT profile_requirement_temporal_check CHECK ((temporal = ANY (ARRAY['concurrent'::text, 'phase_reusable'::text, 'consumed'::text])))
);


--
-- Name: promotion_citations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_citations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    act_id uuid NOT NULL,
    component_id uuid NOT NULL,
    dimension_key text NOT NULL,
    from_value jsonb,
    to_value jsonb,
    baseline_kind text NOT NULL,
    baseline_revision uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: proposal_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposal_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    proposal_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    theme_key text,
    theme_override jsonb,
    photo_pins jsonb,
    customer_intro text,
    customer_closing text,
    price_visibility text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    archived_reason text,
    presentation_snapshot jsonb,
    presentation_stamped_at timestamp with time zone,
    presentation_provenance jsonb,
    sealed_at timestamp with time zone,
    snapshot_id uuid,
    content_revision bigint DEFAULT 0 NOT NULL,
    valid_until timestamp with time zone
);


--
-- Name: COLUMN proposal_versions.valid_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.proposal_versions.valid_until IS 'v268/PL-4: offered validity deadline. Null = open-ended. Frozen into offer_snapshots.model at publication (fingerprint-covered); the first instant of invalidity under the half-open interval [published_at, valid_until). Read by the presentation resolver; a different deadline requires a new Offer.';


--
-- Name: proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    title text,
    status text DEFAULT 'open'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: publication_themes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.publication_themes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    delta jsonb DEFAULT '{}'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    asset_kind text DEFAULT 'theme'::text NOT NULL,
    description text,
    portable jsonb,
    CONSTRAINT publication_themes_asset_kind_check CHECK ((asset_kind = ANY (ARRAY['theme'::text, 'template'::text])))
);


--
-- Name: race292_barrier; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.race292_barrier (
    armed_at timestamp with time zone NOT NULL
);


--
-- Name: race292_result; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.race292_result (
    backend text NOT NULL,
    outcome text,
    detail text
);


--
-- Name: race292_setup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.race292_setup (
    booking_id uuid,
    tenant_id uuid,
    user_id uuid
);


--
-- Name: race292a1_barrier; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.race292a1_barrier (
    armed_at timestamp with time zone NOT NULL
);


--
-- Name: race292a1_result; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.race292a1_result (
    backend text NOT NULL,
    detail text
);


--
-- Name: race292a1_setup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.race292a1_setup (
    booking_id uuid,
    o1 uuid,
    o2 uuid,
    tenant_id uuid,
    user_id uuid
);


--
-- Name: relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    kind text DEFAULT 'person'::text NOT NULL,
    phones text[] DEFAULT '{}'::text[] NOT NULL,
    emails text[] DEFAULT '{}'::text[] NOT NULL,
    standing_notes text,
    established_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT relationships_kind_check CHECK ((kind = ANY (ARRAY['person'::text, 'household'::text, 'organization'::text])))
);


--
-- Name: responsibility_owner; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.responsibility_owner (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    responsibility_ref uuid NOT NULL,
    action text NOT NULL,
    owner text,
    prior_owner text,
    prior_ref uuid,
    actor text NOT NULL,
    seq bigint NOT NULL,
    moment timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT responsibility_owner_action_check CHECK ((action = ANY (ARRAY['assign'::text, 'transfer'::text, 'release'::text]))),
    CONSTRAINT responsibility_owner_presence_check CHECK ((((action = 'release'::text) AND (owner IS NULL)) OR ((action = ANY (ARRAY['assign'::text, 'transfer'::text])) AND (owner IS NOT NULL))))
);


--
-- Name: TABLE responsibility_owner; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.responsibility_owner IS 'Dedicated append-only ownership ledger (v285 Rev B ruling). AUTHORITATIVE for current accountability. At most one current owner (O-1); unassigned Derived is lawful (O-3); history is total and append-only (R-6).';


--
-- Name: responsibility_owner_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.responsibility_owner ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.responsibility_owner_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: review_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    version_id uuid NOT NULL,
    decision text NOT NULL,
    fingerprint text,
    actor text NOT NULL,
    authority jsonb,
    checks_answered text[],
    reason text,
    moment timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT review_decisions_decision_check CHECK ((decision = ANY (ARRAY['requested'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: section_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.section_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id(),
    name text,
    key text,
    label text,
    category text
);


--
-- Name: staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staffing_assignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staffing_assignment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    event_ref uuid NOT NULL,
    requirement_ref uuid NOT NULL,
    staff_ref uuid NOT NULL,
    role text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    window_end timestamp with time zone NOT NULL,
    assigned_by text NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staffing_assignment_window_valid CHECK ((window_end > window_start))
);


--
-- Name: staffing_release; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staffing_release (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    assignment_ref uuid NOT NULL,
    actor text NOT NULL,
    reason text,
    moment timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staffing_requirement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staffing_requirement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    event_ref uuid NOT NULL,
    origin_obligation_ref uuid NOT NULL,
    role text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    department text DEFAULT 'staffing'::text NOT NULL,
    window_start timestamp with time zone,
    window_end timestamp with time zone,
    natural_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staffing_requirement_quantity_check CHECK ((quantity >= 1))
);


--
-- Name: staged_artifact_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staged_artifact_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    version_id uuid NOT NULL,
    fingerprint text NOT NULL,
    model jsonb NOT NULL,
    artifact_bytes bytea,
    artifact_hash text,
    artifact_meta jsonb,
    assets jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'staged'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    content_revision bigint,
    CONSTRAINT staged_artifact_packages_status_check CHECK ((status = ANY (ARRAY['staged'::text, 'promoted'::text, 'discarded'::text])))
);


--
-- Name: tenant_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'staff'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    operational_timezone text,
    operational_day_start_hour integer,
    CONSTRAINT tenants_operational_day_start_hour_check CHECK (((operational_day_start_hour IS NULL) OR ((operational_day_start_hour >= 0) AND (operational_day_start_hour <= 23))))
);


--
-- Name: COLUMN tenants.operational_timezone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tenants.operational_timezone IS 'IANA zone defining this tenant''s operating day. NULL ⇒ the documented default (America/New_York — EventCore''s first domain). Configuration only.';


--
-- Name: COLUMN tenants.operational_day_start_hour; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tenants.operational_day_start_hour IS 'Local hour at which the operating day begins (0–23). NULL ⇒ 0. A caterer finishing at 01:00 may set 4 so the small hours belong to the prior day.';


--
-- Name: venue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    venue_type text NOT NULL,
    address text,
    geo_lat numeric,
    geo_lng numeric,
    contacts jsonb DEFAULT '[]'::jsonb NOT NULL,
    management text,
    notes text,
    redirect_to uuid,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT venue_venue_type_check CHECK ((venue_type = ANY (ARRAY['fixed_facility'::text, 'private_home'::text, 'outdoor_property'::text, 'temporary_structure'::text])))
);


--
-- Name: venue_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    venue_id uuid NOT NULL,
    walkthrough_id uuid,
    kind text NOT NULL,
    label text NOT NULL,
    content_bytes bytea,
    content_hash text NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    replaces_evidence_id uuid,
    uploaded_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT venue_evidence_kind_check CHECK ((kind = ANY (ARRAY['photograph'::text, 'annotated_photograph'::text, 'measurement_record'::text, 'floor_plan'::text, 'utility_diagram'::text, 'rulebook'::text, 'insurance_requirement'::text, 'equipment_inventory'::text, 'correspondence'::text, 'permit'::text, 'fire_documentation'::text, 'other'::text])))
);


--
-- Name: venue_observation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_observation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    venue_id uuid NOT NULL,
    walkthrough_id uuid,
    scope_space_id uuid,
    scope_space2_id uuid,
    attribute_key text NOT NULL,
    value_kind text NOT NULL,
    value jsonb NOT NULL,
    narrative text,
    observer text NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    source_class text NOT NULL,
    method text,
    confidence text,
    effective_at timestamp with time zone,
    expires_at timestamp with time zone,
    condition_key text,
    evidence_refs uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT venue_observation_source_class_check CHECK ((source_class = ANY (ARRAY['measurement'::text, 'direct_observation'::text, 'venue_document'::text, 'venue_rep_statement'::text, 'prior_knowledge'::text]))),
    CONSTRAINT venue_observation_value_kind_check CHECK ((value_kind = ANY (ARRAY['quantity'::text, 'range'::text, 'boolean'::text, 'enum'::text, 'text'::text, 'document'::text, 'absent'::text])))
);


--
-- Name: venue_observation_supersession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_observation_supersession (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    observation_id uuid NOT NULL,
    actor text NOT NULL,
    reason text NOT NULL,
    moment timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: venue_space; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_space (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    venue_id uuid NOT NULL,
    parent_space_id uuid,
    kind text NOT NULL,
    name text NOT NULL,
    contended boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT venue_space_kind_check CHECK ((kind = ANY (ARRAY['building'::text, 'room'::text, 'ballroom'::text, 'ceremony_space'::text, 'kitchen'::text, 'temporary_kitchen_area'::text, 'prep_area'::text, 'plating_area'::text, 'refrigeration_area'::text, 'storage'::text, 'staging'::text, 'loading_zone'::text, 'dock'::text, 'driveway'::text, 'elevator'::text, 'corridor'::text, 'stair'::text, 'waste_area'::text, 'dish_return_area'::text, 'outdoor_area'::text, 'tent_site'::text])))
);


--
-- Name: venue_staleness_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_staleness_policy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    attribute_family text NOT NULL,
    max_age_days integer,
    severity_when_stale text DEFAULT 'advisory'::text NOT NULL,
    verify_required boolean DEFAULT false NOT NULL,
    updated_by text NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT venue_staleness_policy_attribute_family_check CHECK ((attribute_family = ANY (ARRAY['structural'::text, 'equipment'::text, 'utility'::text, 'document'::text, 'rule'::text, 'access'::text, 'other'::text]))),
    CONSTRAINT venue_staleness_policy_severity_when_stale_check CHECK ((severity_when_stale = ANY (ARRAY['advisory'::text, 'critical'::text])))
);


--
-- Name: venue_walkthrough; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_walkthrough (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    venue_id uuid NOT NULL,
    engagement_ref uuid,
    purpose text NOT NULL,
    conducted_at timestamp with time zone NOT NULL,
    participants jsonb DEFAULT '[]'::jsonb NOT NULL,
    rep_involvement text DEFAULT 'none'::text NOT NULL,
    notes text,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT venue_walkthrough_purpose_check CHECK ((purpose = ANY (ARRAY['initial_survey'::text, 'pre_event_verification'::text, 'post_renovation'::text, 'dispute_resolution'::text, 'general'::text]))),
    CONSTRAINT venue_walkthrough_rep_involvement_check CHECK ((rep_involvement = ANY (ARRAY['none'::text, 'supplied'::text, 'approved'::text])))
);


--
-- Name: version_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.version_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id(),
    version_id uuid NOT NULL,
    kind text,
    label text,
    amount numeric,
    value numeric,
    taxable boolean,
    "position" integer
);


--
-- Name: version_guests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.version_guests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id(),
    version_id uuid NOT NULL,
    category_id uuid,
    count integer,
    label text
);


--
-- Name: version_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.version_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id(),
    version_id uuid NOT NULL,
    section_type_id uuid,
    title text,
    "position" integer
);


--
-- Name: walkthrough_coverage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.walkthrough_coverage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    walkthrough_id uuid NOT NULL,
    space_id uuid,
    status text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT walkthrough_coverage_status_check CHECK ((status = ANY (ARRAY['visited'::text, 'partial'::text, 'inaccessible'::text])))
);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: acceptance_rescissions acceptance_rescissions_acceptance_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acceptance_rescissions
    ADD CONSTRAINT acceptance_rescissions_acceptance_id_key UNIQUE (acceptance_id);


--
-- Name: acceptance_rescissions acceptance_rescissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acceptance_rescissions
    ADD CONSTRAINT acceptance_rescissions_pkey PRIMARY KEY (id);


--
-- Name: acceptance_selection_sets acceptance_selection_sets_acceptance_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acceptance_selection_sets
    ADD CONSTRAINT acceptance_selection_sets_acceptance_id_key UNIQUE (acceptance_id);


--
-- Name: acceptance_selection_sets acceptance_selection_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acceptance_selection_sets
    ADD CONSTRAINT acceptance_selection_sets_pkey PRIMARY KEY (id);


--
-- Name: act_produced_artifacts act_produced_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.act_produced_artifacts
    ADD CONSTRAINT act_produced_artifacts_pkey PRIMARY KEY (id);


--
-- Name: action_invocation action_invocation_idem_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_invocation
    ADD CONSTRAINT action_invocation_idem_unique UNIQUE (tenant_id, idempotency_key);


--
-- Name: action_invocation action_invocation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_invocation
    ADD CONSTRAINT action_invocation_pkey PRIMARY KEY (id);


--
-- Name: attendance_commitment attendance_commitment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_commitment
    ADD CONSTRAINT attendance_commitment_pkey PRIMARY KEY (id);


--
-- Name: blueprint_compositions blueprint_compositions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blueprint_compositions
    ADD CONSTRAINT blueprint_compositions_pkey PRIMARY KEY (id);


--
-- Name: blueprint_identities blueprint_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blueprint_identities
    ADD CONSTRAINT blueprint_identities_pkey PRIMARY KEY (id);


--
-- Name: blueprint_instantiations blueprint_instantiations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blueprint_instantiations
    ADD CONSTRAINT blueprint_instantiations_pkey PRIMARY KEY (id);


--
-- Name: blueprint_instantiations blueprint_instantiations_version_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blueprint_instantiations
    ADD CONSTRAINT blueprint_instantiations_version_id_key UNIQUE (version_id);


--
-- Name: blueprint_revisions blueprint_revisions_identity_id_revision_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blueprint_revisions
    ADD CONSTRAINT blueprint_revisions_identity_id_revision_number_key UNIQUE (identity_id, revision_number);


--
-- Name: blueprint_revisions blueprint_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blueprint_revisions
    ADD CONSTRAINT blueprint_revisions_pkey PRIMARY KEY (id);


--
-- Name: blueprint_shelf_acts blueprint_shelf_acts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blueprint_shelf_acts
    ADD CONSTRAINT blueprint_shelf_acts_pkey PRIMARY KEY (id);


--
-- Name: blueprints blueprints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blueprints
    ADD CONSTRAINT blueprints_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_invoice_num_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_invoice_num_key UNIQUE (invoice_num);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: choice_groups choice_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.choice_groups
    ADD CONSTRAINT choice_groups_pkey PRIMARY KEY (id);


--
-- Name: component_definition_config component_definition_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_definition_config
    ADD CONSTRAINT component_definition_config_pkey PRIMARY KEY (id);


--
-- Name: component_definitions component_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_definitions
    ADD CONSTRAINT component_identities_pkey PRIMARY KEY (id);


--
-- Name: component_instance_layers component_instance_layers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_instance_layers
    ADD CONSTRAINT component_instance_layers_pkey PRIMARY KEY (id);


--
-- Name: component_items component_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_items
    ADD CONSTRAINT component_items_pkey PRIMARY KEY (id);


--
-- Name: component_layers component_layers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_layers
    ADD CONSTRAINT component_layers_pkey PRIMARY KEY (id);


--
-- Name: component_profile_override component_profile_override_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_profile_override
    ADD CONSTRAINT component_profile_override_pkey PRIMARY KEY (id);


--
-- Name: component_profile_revision component_profile_revision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_profile_revision
    ADD CONSTRAINT component_profile_revision_pkey PRIMARY KEY (id);


--
-- Name: component_requirements component_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_requirements
    ADD CONSTRAINT component_requirements_pkey PRIMARY KEY (id);


--
-- Name: configuration_moves configuration_moves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuration_moves
    ADD CONSTRAINT configuration_moves_pkey PRIMARY KEY (id);


--
-- Name: definition_revision_acts definition_revision_acts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.definition_revision_acts
    ADD CONSTRAINT definition_revision_acts_pkey PRIMARY KEY (id);


--
-- Name: engagement_ledger engagement_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_ledger
    ADD CONSTRAINT engagement_ledger_pkey PRIMARY KEY (id);


--
-- Name: engagement_occurrence engagement_occurrence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_occurrence
    ADD CONSTRAINT engagement_occurrence_pkey PRIMARY KEY (id);


--
-- Name: engagement_profile engagement_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_profile
    ADD CONSTRAINT engagement_profile_pkey PRIMARY KEY (id);


--
-- Name: occurrence_schedule_milestone engagement_schedule_milestone_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occurrence_schedule_milestone
    ADD CONSTRAINT engagement_schedule_milestone_pkey PRIMARY KEY (id);


--
-- Name: engagement_supervision engagement_supervision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_supervision
    ADD CONSTRAINT engagement_supervision_pkey PRIMARY KEY (id);


--
-- Name: engagement_venue_binding engagement_venue_binding_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_venue_binding
    ADD CONSTRAINT engagement_venue_binding_pkey PRIMARY KEY (id);


--
-- Name: event_component_config event_component_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_component_config
    ADD CONSTRAINT event_component_config_pkey PRIMARY KEY (component_id);


--
-- Name: event_components event_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_components
    ADD CONSTRAINT event_components_pkey PRIMARY KEY (id);


--
-- Name: event_debriefs event_debriefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_debriefs
    ADD CONSTRAINT event_debriefs_pkey PRIMARY KEY (id);


--
-- Name: event event_one_per_occurrence; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT event_one_per_occurrence UNIQUE (tenant_id, occurrence_ref);


--
-- Name: event event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT event_pkey PRIMARY KEY (id);


--
-- Name: execution_evidence execution_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_evidence
    ADD CONSTRAINT execution_evidence_pkey PRIMARY KEY (id);


--
-- Name: guest_categories guest_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_categories
    ADD CONSTRAINT guest_categories_pkey PRIMARY KEY (id);


--
-- Name: library_component library_component_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_component
    ADD CONSTRAINT library_component_pkey PRIMARY KEY (id);


--
-- Name: obligation obligation_natural_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.obligation
    ADD CONSTRAINT obligation_natural_key_unique UNIQUE (tenant_id, natural_key);


--
-- Name: obligation obligation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.obligation
    ADD CONSTRAINT obligation_pkey PRIMARY KEY (id);


--
-- Name: engagement_occurrence occurrence_ordinal_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_occurrence
    ADD CONSTRAINT occurrence_ordinal_unique UNIQUE (tenant_id, booking_id, ordinal);


--
-- Name: occurrence_profile occurrence_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occurrence_profile
    ADD CONSTRAINT occurrence_profile_pkey PRIMARY KEY (id);


--
-- Name: occurrence_status occurrence_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occurrence_status
    ADD CONSTRAINT occurrence_status_pkey PRIMARY KEY (id);


--
-- Name: occurrence_supervision occurrence_supervision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occurrence_supervision
    ADD CONSTRAINT occurrence_supervision_pkey PRIMARY KEY (id);


--
-- Name: occurrence_venue_binding occurrence_venue_binding_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occurrence_venue_binding
    ADD CONSTRAINT occurrence_venue_binding_pkey PRIMARY KEY (id);


--
-- Name: offer_acceptances offer_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_acceptances
    ADD CONSTRAINT offer_acceptances_pkey PRIMARY KEY (id);


--
-- Name: offer_acceptances offer_acceptances_snapshot_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_acceptances
    ADD CONSTRAINT offer_acceptances_snapshot_id_key UNIQUE (snapshot_id);


--
-- Name: offer_endpoints offer_endpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_endpoints
    ADD CONSTRAINT offer_endpoints_pkey PRIMARY KEY (id);


--
-- Name: offer_endpoints offer_endpoints_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_endpoints
    ADD CONSTRAINT offer_endpoints_token_key UNIQUE (token);


--
-- Name: offer_snapshots offer_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_snapshots
    ADD CONSTRAINT offer_snapshots_pkey PRIMARY KEY (id);


--
-- Name: offer_snapshots offer_snapshots_version_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_snapshots
    ADD CONSTRAINT offer_snapshots_version_id_key UNIQUE (version_id);


--
-- Name: photo_library photo_library_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.photo_library
    ADD CONSTRAINT photo_library_pkey PRIMARY KEY (id);


--
-- Name: profile_requirement profile_requirement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_requirement
    ADD CONSTRAINT profile_requirement_pkey PRIMARY KEY (id);


--
-- Name: component_profile_revision profile_revision_no_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_profile_revision
    ADD CONSTRAINT profile_revision_no_unique UNIQUE (library_component_id, revision_no);


--
-- Name: promotion_citations promotion_citations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_citations
    ADD CONSTRAINT promotion_citations_pkey PRIMARY KEY (id);


--
-- Name: proposal_versions proposal_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_versions
    ADD CONSTRAINT proposal_versions_pkey PRIMARY KEY (id);


--
-- Name: proposals proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_pkey PRIMARY KEY (id);


--
-- Name: publication_themes publication_themes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_themes
    ADD CONSTRAINT publication_themes_pkey PRIMARY KEY (id);


--
-- Name: race292_result race292_result_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.race292_result
    ADD CONSTRAINT race292_result_pkey PRIMARY KEY (backend);


--
-- Name: race292a1_result race292a1_result_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.race292a1_result
    ADD CONSTRAINT race292a1_result_pkey PRIMARY KEY (backend);


--
-- Name: relationships relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_pkey PRIMARY KEY (id);


--
-- Name: responsibility_owner responsibility_owner_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.responsibility_owner
    ADD CONSTRAINT responsibility_owner_pkey PRIMARY KEY (id);


--
-- Name: review_decisions review_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_decisions
    ADD CONSTRAINT review_decisions_pkey PRIMARY KEY (id);


--
-- Name: section_types section_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_types
    ADD CONSTRAINT section_types_pkey PRIMARY KEY (id);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: staffing_assignment staffing_assignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staffing_assignment
    ADD CONSTRAINT staffing_assignment_pkey PRIMARY KEY (id);


--
-- Name: staffing_release staffing_release_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staffing_release
    ADD CONSTRAINT staffing_release_pkey PRIMARY KEY (id);


--
-- Name: staffing_requirement staffing_requirement_natural_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staffing_requirement
    ADD CONSTRAINT staffing_requirement_natural_key_unique UNIQUE (tenant_id, natural_key);


--
-- Name: staffing_requirement staffing_requirement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staffing_requirement
    ADD CONSTRAINT staffing_requirement_pkey PRIMARY KEY (id);


--
-- Name: staged_artifact_packages staged_artifact_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staged_artifact_packages
    ADD CONSTRAINT staged_artifact_packages_pkey PRIMARY KEY (id);


--
-- Name: venue_staleness_policy staleness_policy_one_per_family; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_staleness_policy
    ADD CONSTRAINT staleness_policy_one_per_family UNIQUE (tenant_id, attribute_family);


--
-- Name: venue_observation_supersession supersession_one_shot; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_observation_supersession
    ADD CONSTRAINT supersession_one_shot UNIQUE (observation_id);


--
-- Name: tenant_users tenant_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_users
    ADD CONSTRAINT tenant_users_pkey PRIMARY KEY (id);


--
-- Name: tenant_users tenant_users_tenant_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_users
    ADD CONSTRAINT tenant_users_tenant_id_user_id_key UNIQUE (tenant_id, user_id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: venue_evidence venue_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_evidence
    ADD CONSTRAINT venue_evidence_pkey PRIMARY KEY (id);


--
-- Name: venue_observation venue_observation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_observation
    ADD CONSTRAINT venue_observation_pkey PRIMARY KEY (id);


--
-- Name: venue_observation_supersession venue_observation_supersession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_observation_supersession
    ADD CONSTRAINT venue_observation_supersession_pkey PRIMARY KEY (id);


--
-- Name: venue venue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue
    ADD CONSTRAINT venue_pkey PRIMARY KEY (id);


--
-- Name: venue_space venue_space_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_space
    ADD CONSTRAINT venue_space_pkey PRIMARY KEY (id);


--
-- Name: venue_staleness_policy venue_staleness_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_staleness_policy
    ADD CONSTRAINT venue_staleness_policy_pkey PRIMARY KEY (id);


--
-- Name: venue_walkthrough venue_walkthrough_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_walkthrough
    ADD CONSTRAINT venue_walkthrough_pkey PRIMARY KEY (id);


--
-- Name: version_adjustments version_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.version_adjustments
    ADD CONSTRAINT version_adjustments_pkey PRIMARY KEY (id);


--
-- Name: version_guests version_guests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.version_guests
    ADD CONSTRAINT version_guests_pkey PRIMARY KEY (id);


--
-- Name: version_sections version_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.version_sections
    ADD CONSTRAINT version_sections_pkey PRIMARY KEY (id);


--
-- Name: walkthrough_coverage walkthrough_coverage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walkthrough_coverage
    ADD CONSTRAINT walkthrough_coverage_pkey PRIMARY KEY (id);


--
-- Name: action_invocation_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_invocation_target_idx ON public.action_invocation USING btree (tenant_id, target_id);


--
-- Name: cpo_component_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cpo_component_idx ON public.component_profile_override USING btree (tenant_id, event_component_id, seq DESC);


--
-- Name: evb_booking_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evb_booking_idx ON public.engagement_venue_binding USING btree (tenant_id, booking_id, seq DESC);


--
-- Name: evidence_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evidence_event_idx ON public.execution_evidence USING btree (tenant_id, event_ref);


--
-- Name: evidence_obligation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evidence_obligation_idx ON public.execution_evidence USING btree (tenant_id, obligation_ref);


--
-- Name: idx_apa_act; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apa_act ON public.act_produced_artifacts USING btree (act_id);


--
-- Name: idx_attendance_occurrence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_occurrence ON public.attendance_commitment USING btree (occurrence_id, effective_moment DESC, seq DESC);


--
-- Name: idx_bpc_dest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bpc_dest ON public.blueprint_compositions USING btree (dest_revision_id);


--
-- Name: idx_bpc_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bpc_source ON public.blueprint_compositions USING btree (source_revision_id);


--
-- Name: idx_bpi_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bpi_tenant ON public.blueprint_identities USING btree (tenant_id);


--
-- Name: idx_bpin_blueprint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bpin_blueprint ON public.blueprint_instantiations USING btree (blueprint_id);


--
-- Name: idx_bpr_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bpr_identity ON public.blueprint_revisions USING btree (identity_id);


--
-- Name: idx_bsa_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bsa_identity ON public.blueprint_shelf_acts USING btree (identity_id);


--
-- Name: idx_cdc_definition; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cdc_definition ON public.component_definition_config USING btree (definition_id);


--
-- Name: idx_cdc_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_cdc_live ON public.component_definition_config USING btree (definition_id) WHERE ((superseded_by IS NULL) AND (archived_at IS NULL));


--
-- Name: idx_choice_groups_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_choice_groups_version ON public.choice_groups USING btree (version_id);


--
-- Name: idx_cm_component; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cm_component ON public.configuration_moves USING btree (component_id, created_at);


--
-- Name: idx_component_definitions_global_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_component_definitions_global_name ON public.component_definitions USING btree (lower(btrim(name))) WHERE (tenant_id IS NULL);


--
-- Name: idx_component_definitions_tenant_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_component_definitions_tenant_name ON public.component_definitions USING btree (tenant_id, lower(btrim(name)));


--
-- Name: idx_component_instance_layers_component; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_component_instance_layers_component ON public.component_instance_layers USING btree (component_id);


--
-- Name: idx_component_instance_layers_one; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_component_instance_layers_one ON public.component_instance_layers USING btree (component_id, layer_key);


--
-- Name: idx_component_layers_definition; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_component_layers_definition ON public.component_layers USING btree (definition_id);


--
-- Name: idx_component_layers_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_component_layers_live ON public.component_layers USING btree (definition_id, layer_key) WHERE ((superseded_by IS NULL) AND (archived_at IS NULL));


--
-- Name: idx_cr_logical; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_cr_logical ON public.component_requirements USING btree (component_id, layer_key, logical_key) WHERE (logical_key IS NOT NULL);


--
-- Name: idx_debriefs_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debriefs_booking ON public.event_debriefs USING btree (booking_id);


--
-- Name: idx_dra_definition; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dra_definition ON public.definition_revision_acts USING btree (definition_id);


--
-- Name: idx_eng_profile_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eng_profile_booking ON public.engagement_profile USING btree (booking_id, seq DESC);


--
-- Name: idx_event_components_definition; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_components_definition ON public.event_components USING btree (definition_id);


--
-- Name: idx_milestone_occurrence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_milestone_occurrence ON public.occurrence_schedule_milestone USING btree (occurrence_id, milestone_key, seq DESC);


--
-- Name: idx_occ_profile_occurrence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_occ_profile_occurrence ON public.occurrence_profile USING btree (occurrence_id, seq DESC);


--
-- Name: idx_occ_status_occurrence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_occ_status_occurrence ON public.occurrence_status USING btree (occurrence_id, seq DESC);


--
-- Name: idx_occ_supervision_occurrence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_occ_supervision_occurrence ON public.occurrence_supervision USING btree (occurrence_id, seq DESC);


--
-- Name: idx_occ_venue_occurrence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_occ_venue_occurrence ON public.occurrence_venue_binding USING btree (occurrence_id, seq DESC);


--
-- Name: idx_occurrence_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_occurrence_booking ON public.engagement_occurrence USING btree (booking_id, ordinal);


--
-- Name: idx_pc_act; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pc_act ON public.promotion_citations USING btree (act_id);


--
-- Name: idx_supervision_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supervision_booking ON public.engagement_supervision USING btree (booking_id, seq DESC);


--
-- Name: idx_versions_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_versions_archived ON public.proposal_versions USING btree (proposal_id) WHERE (archived_at IS NULL);


--
-- Name: ix_acceptance_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_acceptance_booking ON public.offer_acceptances USING btree (booking_id);


--
-- Name: ix_acceptance_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_acceptance_tenant ON public.offer_acceptances USING btree (tenant_id);


--
-- Name: ix_bookings_relationship; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_bookings_relationship ON public.bookings USING btree (relationship_id);


--
-- Name: ix_endpoint_snapshot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_endpoint_snapshot ON public.offer_endpoints USING btree (snapshot_id);


--
-- Name: ix_engagement_ledger_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_engagement_ledger_booking ON public.engagement_ledger USING btree (booking_id, moment);


--
-- Name: ix_engagement_ledger_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_engagement_ledger_tenant ON public.engagement_ledger USING btree (tenant_id);


--
-- Name: ix_relationships_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_relationships_tenant ON public.relationships USING btree (tenant_id);


--
-- Name: ix_rescission_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_rescission_tenant ON public.acceptance_rescissions USING btree (tenant_id);


--
-- Name: ix_review_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_review_version ON public.review_decisions USING btree (version_id, moment);


--
-- Name: ix_selection_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_selection_tenant ON public.acceptance_selection_sets USING btree (tenant_id);


--
-- Name: ix_snapshot_fingerprint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_snapshot_fingerprint ON public.offer_snapshots USING btree (fingerprint);


--
-- Name: ix_snapshot_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_snapshot_tenant ON public.offer_snapshots USING btree (tenant_id);


--
-- Name: ix_staged_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_staged_tenant ON public.staged_artifact_packages USING btree (tenant_id);


--
-- Name: ix_staged_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_staged_version ON public.staged_artifact_packages USING btree (version_id, status);


--
-- Name: library_component_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX library_component_idx ON public.library_component USING btree (tenant_id, name);


--
-- Name: obligation_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX obligation_event_idx ON public.obligation USING btree (tenant_id, event_ref);


--
-- Name: profile_requirement_rev_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_requirement_rev_idx ON public.profile_requirement USING btree (tenant_id, revision_id, family, "position");


--
-- Name: responsibility_owner_resp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX responsibility_owner_resp_idx ON public.responsibility_owner USING btree (tenant_id, responsibility_ref, seq DESC);


--
-- Name: staffing_assignment_req_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staffing_assignment_req_idx ON public.staffing_assignment USING btree (tenant_id, requirement_ref);


--
-- Name: staffing_assignment_staff_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staffing_assignment_staff_idx ON public.staffing_assignment USING btree (tenant_id, staff_ref);


--
-- Name: staffing_release_assignment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staffing_release_assignment_idx ON public.staffing_release USING btree (tenant_id, assignment_ref);


--
-- Name: staffing_requirement_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staffing_requirement_event_idx ON public.staffing_requirement USING btree (tenant_id, event_ref);


--
-- Name: ux_tenant_users_one_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_tenant_users_one_active ON public.tenant_users USING btree (user_id) WHERE active;


--
-- Name: venue_observation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX venue_observation_idx ON public.venue_observation USING btree (tenant_id, venue_id, attribute_key);


--
-- Name: venue_space_venue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX venue_space_venue_idx ON public.venue_space USING btree (tenant_id, venue_id);


--
-- Name: venue_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX venue_tenant_idx ON public.venue USING btree (tenant_id, name);


--
-- Name: venue_walkthrough_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX venue_walkthrough_idx ON public.venue_walkthrough USING btree (tenant_id, venue_id, conducted_at DESC);


--
-- Name: attendance_commitment attendance_commitment_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER attendance_commitment_append_only BEFORE DELETE OR UPDATE ON public.attendance_commitment FOR EACH ROW EXECUTE FUNCTION public.promise_append_only_guard();


--
-- Name: engagement_occurrence engagement_occurrence_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER engagement_occurrence_append_only BEFORE DELETE OR UPDATE ON public.engagement_occurrence FOR EACH ROW EXECUTE FUNCTION public.promise_append_only_guard();


--
-- Name: engagement_profile engagement_profile_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER engagement_profile_append_only BEFORE DELETE OR UPDATE ON public.engagement_profile FOR EACH ROW EXECUTE FUNCTION public.promise_append_only_guard();


--
-- Name: occurrence_schedule_milestone engagement_schedule_milestone_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER engagement_schedule_milestone_append_only BEFORE DELETE OR UPDATE ON public.occurrence_schedule_milestone FOR EACH ROW EXECUTE FUNCTION public.promise_append_only_guard();


--
-- Name: engagement_supervision engagement_supervision_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER engagement_supervision_append_only BEFORE DELETE OR UPDATE ON public.engagement_supervision FOR EACH ROW EXECUTE FUNCTION public.promise_append_only_guard();


--
-- Name: engagement_venue_binding evb_integrity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER evb_integrity BEFORE INSERT ON public.engagement_venue_binding FOR EACH ROW EXECUTE FUNCTION public.evb_integrity_guard();


--
-- Name: event_components event_component_pin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER event_component_pin BEFORE INSERT OR UPDATE OF library_component_id, profile_revision_id ON public.event_components FOR EACH ROW EXECUTE FUNCTION public.event_component_pin_guard();


--
-- Name: occurrence_profile occurrence_profile_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER occurrence_profile_append_only BEFORE DELETE OR UPDATE ON public.occurrence_profile FOR EACH ROW EXECUTE FUNCTION public.promise_append_only_guard();


--
-- Name: occurrence_status occurrence_status_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER occurrence_status_append_only BEFORE DELETE OR UPDATE ON public.occurrence_status FOR EACH ROW EXECUTE FUNCTION public.promise_append_only_guard();


--
-- Name: occurrence_supervision occurrence_supervision_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER occurrence_supervision_append_only BEFORE DELETE OR UPDATE ON public.occurrence_supervision FOR EACH ROW EXECUTE FUNCTION public.promise_append_only_guard();


--
-- Name: occurrence_venue_binding occurrence_venue_binding_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER occurrence_venue_binding_append_only BEFORE DELETE OR UPDATE ON public.occurrence_venue_binding FOR EACH ROW EXECUTE FUNCTION public.promise_append_only_guard();


--
-- Name: obligation responsibility_anchor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER responsibility_anchor BEFORE INSERT ON public.obligation FOR EACH ROW EXECUTE FUNCTION public.responsibility_anchor_guard();


--
-- Name: obligation responsibility_no_edit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER responsibility_no_edit BEFORE DELETE OR UPDATE ON public.obligation FOR EACH ROW EXECUTE FUNCTION public.responsibility_append_only();


--
-- Name: responsibility_owner responsibility_owner_no_edit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER responsibility_owner_no_edit BEFORE DELETE OR UPDATE ON public.responsibility_owner FOR EACH ROW EXECUTE FUNCTION public.responsibility_owner_append_only();


--
-- Name: venue_observation_supersession supersession_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER supersession_tenant BEFORE INSERT ON public.venue_observation_supersession FOR EACH ROW EXECUTE FUNCTION public.supersession_tenant_guard();


--
-- Name: tenants tenants_operational_config; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tenants_operational_config BEFORE INSERT OR UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.tenants_operational_config_guard();


--
-- Name: blueprint_revisions trg_blueprint_revision_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_blueprint_revision_guard BEFORE UPDATE ON public.blueprint_revisions FOR EACH ROW EXECUTE FUNCTION public.blueprint_revision_guard();


--
-- Name: proposal_versions trg_bump_version_content; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_version_content BEFORE UPDATE ON public.proposal_versions FOR EACH ROW EXECUTE FUNCTION public.bump_on_version_content();


--
-- Name: event_components trg_ec_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ec_identity BEFORE INSERT ON public.event_components FOR EACH ROW EXECUTE FUNCTION public.assign_component_identity();


--
-- Name: version_adjustments trg_guard_content_adjustments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_content_adjustments BEFORE INSERT OR DELETE OR UPDATE ON public.version_adjustments FOR EACH ROW EXECUTE FUNCTION public.guard_sealed_version_scoped();


--
-- Name: choice_groups trg_guard_content_choices; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_content_choices BEFORE INSERT OR DELETE OR UPDATE ON public.choice_groups FOR EACH ROW EXECUTE FUNCTION public.guard_sealed_version_scoped();


--
-- Name: event_components trg_guard_content_components; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_content_components BEFORE INSERT OR DELETE OR UPDATE ON public.event_components FOR EACH ROW EXECUTE FUNCTION public.guard_sealed_content();


--
-- Name: version_guests trg_guard_content_guests; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_content_guests BEFORE INSERT OR DELETE OR UPDATE ON public.version_guests FOR EACH ROW EXECUTE FUNCTION public.guard_sealed_version_scoped();


--
-- Name: component_items trg_guard_content_items; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_content_items BEFORE INSERT OR DELETE OR UPDATE ON public.component_items FOR EACH ROW EXECUTE FUNCTION public.guard_sealed_content();


--
-- Name: component_requirements trg_guard_content_reqs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_content_reqs BEFORE INSERT OR DELETE OR UPDATE ON public.component_requirements FOR EACH ROW EXECUTE FUNCTION public.guard_sealed_content();


--
-- Name: version_sections trg_guard_content_sections; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_content_sections BEFORE INSERT OR DELETE OR UPDATE ON public.version_sections FOR EACH ROW EXECUTE FUNCTION public.guard_sealed_version_scoped();


--
-- Name: proposal_versions trg_guard_sealed_version; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_sealed_version BEFORE UPDATE ON public.proposal_versions FOR EACH ROW EXECUTE FUNCTION public.guard_sealed_version();


--
-- Name: version_adjustments trg_rev_adjustments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rev_adjustments AFTER INSERT OR DELETE OR UPDATE ON public.version_adjustments FOR EACH ROW EXECUTE FUNCTION public.bump_version_revision_scoped();


--
-- Name: choice_groups trg_rev_choices; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rev_choices AFTER INSERT OR DELETE OR UPDATE ON public.choice_groups FOR EACH ROW EXECUTE FUNCTION public.bump_version_revision_scoped();


--
-- Name: event_components trg_rev_components; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rev_components AFTER INSERT OR DELETE OR UPDATE ON public.event_components FOR EACH ROW EXECUTE FUNCTION public.bump_version_revision();


--
-- Name: version_guests trg_rev_guests; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rev_guests AFTER INSERT OR DELETE OR UPDATE ON public.version_guests FOR EACH ROW EXECUTE FUNCTION public.bump_version_revision_scoped();


--
-- Name: component_items trg_rev_items; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rev_items AFTER INSERT OR DELETE OR UPDATE ON public.component_items FOR EACH ROW EXECUTE FUNCTION public.bump_version_revision();


--
-- Name: component_requirements trg_rev_reqs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rev_reqs AFTER INSERT OR DELETE OR UPDATE ON public.component_requirements FOR EACH ROW EXECUTE FUNCTION public.bump_version_revision();


--
-- Name: version_sections trg_rev_sections; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rev_sections AFTER INSERT OR DELETE OR UPDATE ON public.version_sections FOR EACH ROW EXECUTE FUNCTION public.bump_version_revision_scoped();


--
-- Name: venue_observation venue_observation_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER venue_observation_scope BEFORE INSERT ON public.venue_observation FOR EACH ROW EXECUTE FUNCTION public.venue_observation_scope_guard();


--
-- Name: venue_space venue_space_nesting; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER venue_space_nesting BEFORE INSERT OR UPDATE ON public.venue_space FOR EACH ROW EXECUTE FUNCTION public.venue_space_nesting_guard();


--
-- Name: acceptance_rescissions acceptance_rescissions_acceptance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acceptance_rescissions
    ADD CONSTRAINT acceptance_rescissions_acceptance_id_fkey FOREIGN KEY (acceptance_id) REFERENCES public.offer_acceptances(id);


--
-- Name: acceptance_selection_sets acceptance_selection_sets_acceptance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acceptance_selection_sets
    ADD CONSTRAINT acceptance_selection_sets_acceptance_id_fkey FOREIGN KEY (acceptance_id) REFERENCES public.offer_acceptances(id);


--
-- Name: act_produced_artifacts act_produced_artifacts_act_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.act_produced_artifacts
    ADD CONSTRAINT act_produced_artifacts_act_id_fkey FOREIGN KEY (act_id) REFERENCES public.definition_revision_acts(id);


--
-- Name: attendance_commitment attendance_commitment_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_commitment
    ADD CONSTRAINT attendance_commitment_occurrence_id_fkey FOREIGN KEY (occurrence_id) REFERENCES public.engagement_occurrence(id);


--
-- Name: attendance_commitment attendance_commitment_replaces_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_commitment
    ADD CONSTRAINT attendance_commitment_replaces_id_fkey FOREIGN KEY (replaces_id) REFERENCES public.attendance_commitment(id);


--
-- Name: blueprint_instantiations blueprint_instantiations_blueprint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blueprint_instantiations
    ADD CONSTRAINT blueprint_instantiations_blueprint_id_fkey FOREIGN KEY (blueprint_id) REFERENCES public.blueprint_identities(id);


--
-- Name: blueprint_instantiations blueprint_instantiations_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blueprint_instantiations
    ADD CONSTRAINT blueprint_instantiations_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES public.blueprint_revisions(id);


--
-- Name: blueprint_revisions blueprint_revisions_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blueprint_revisions
    ADD CONSTRAINT blueprint_revisions_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.blueprint_identities(id);


--
-- Name: blueprint_revisions blueprint_revisions_seeded_from_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blueprint_revisions
    ADD CONSTRAINT blueprint_revisions_seeded_from_revision_id_fkey FOREIGN KEY (seeded_from_revision_id) REFERENCES public.blueprint_revisions(id);


--
-- Name: blueprint_revisions blueprint_revisions_supersedes_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blueprint_revisions
    ADD CONSTRAINT blueprint_revisions_supersedes_revision_id_fkey FOREIGN KEY (supersedes_revision_id) REFERENCES public.blueprint_revisions(id);


--
-- Name: blueprint_shelf_acts blueprint_shelf_acts_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blueprint_shelf_acts
    ADD CONSTRAINT blueprint_shelf_acts_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.blueprint_identities(id);


--
-- Name: blueprint_shelf_acts blueprint_shelf_acts_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blueprint_shelf_acts
    ADD CONSTRAINT blueprint_shelf_acts_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES public.blueprint_revisions(id);


--
-- Name: blueprints blueprints_source_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blueprints
    ADD CONSTRAINT blueprints_source_version_id_fkey FOREIGN KEY (source_version_id) REFERENCES public.proposal_versions(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_relationship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES public.relationships(id);


--
-- Name: bookings bookings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: blueprint_identities bpi_published_revision_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blueprint_identities
    ADD CONSTRAINT bpi_published_revision_fk FOREIGN KEY (published_revision_id) REFERENCES public.blueprint_revisions(id);


--
-- Name: choice_groups choice_groups_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.choice_groups
    ADD CONSTRAINT choice_groups_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.event_components(id);


--
-- Name: choice_groups choice_groups_section_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.choice_groups
    ADD CONSTRAINT choice_groups_section_type_id_fkey FOREIGN KEY (section_type_id) REFERENCES public.section_types(id);


--
-- Name: choice_groups choice_groups_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.choice_groups
    ADD CONSTRAINT choice_groups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: choice_groups choice_groups_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.choice_groups
    ADD CONSTRAINT choice_groups_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.proposal_versions(id) ON DELETE CASCADE;


--
-- Name: component_definition_config component_definition_config_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_definition_config
    ADD CONSTRAINT component_definition_config_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES public.component_definitions(id);


--
-- Name: component_definition_config component_definition_config_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_definition_config
    ADD CONSTRAINT component_definition_config_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.component_definition_config(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: component_definitions component_definitions_source_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_definitions
    ADD CONSTRAINT component_definitions_source_definition_id_fkey FOREIGN KEY (source_definition_id) REFERENCES public.component_definitions(id);


--
-- Name: component_definitions component_identities_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_definitions
    ADD CONSTRAINT component_identities_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: component_instance_layers component_instance_layers_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_instance_layers
    ADD CONSTRAINT component_instance_layers_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.event_components(id) ON DELETE CASCADE;


--
-- Name: component_instance_layers component_instance_layers_copied_from_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_instance_layers
    ADD CONSTRAINT component_instance_layers_copied_from_fkey FOREIGN KEY (copied_from) REFERENCES public.component_layers(id);


--
-- Name: component_items component_items_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_items
    ADD CONSTRAINT component_items_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.event_components(id) ON DELETE CASCADE;


--
-- Name: component_layers component_layers_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_layers
    ADD CONSTRAINT component_layers_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES public.component_definitions(id);


--
-- Name: component_layers component_layers_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_layers
    ADD CONSTRAINT component_layers_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.component_layers(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: component_profile_override component_profile_override_event_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_profile_override
    ADD CONSTRAINT component_profile_override_event_component_id_fkey FOREIGN KEY (event_component_id) REFERENCES public.event_components(id);


--
-- Name: component_profile_override component_profile_override_target_requirement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_profile_override
    ADD CONSTRAINT component_profile_override_target_requirement_id_fkey FOREIGN KEY (target_requirement_id) REFERENCES public.profile_requirement(id);


--
-- Name: component_profile_revision component_profile_revision_library_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_profile_revision
    ADD CONSTRAINT component_profile_revision_library_component_id_fkey FOREIGN KEY (library_component_id) REFERENCES public.library_component(id);


--
-- Name: component_profile_revision component_profile_revision_supersedes_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_profile_revision
    ADD CONSTRAINT component_profile_revision_supersedes_revision_id_fkey FOREIGN KEY (supersedes_revision_id) REFERENCES public.component_profile_revision(id);


--
-- Name: component_requirements component_requirements_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.component_requirements
    ADD CONSTRAINT component_requirements_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.event_components(id) ON DELETE CASCADE;


--
-- Name: configuration_moves configuration_moves_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuration_moves
    ADD CONSTRAINT configuration_moves_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.event_components(id) ON DELETE CASCADE;


--
-- Name: configuration_moves configuration_moves_parent_move_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuration_moves
    ADD CONSTRAINT configuration_moves_parent_move_id_fkey FOREIGN KEY (parent_move_id) REFERENCES public.configuration_moves(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: definition_revision_acts definition_revision_acts_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.definition_revision_acts
    ADD CONSTRAINT definition_revision_acts_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES public.component_definitions(id);


--
-- Name: engagement_ledger engagement_ledger_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_ledger
    ADD CONSTRAINT engagement_ledger_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: engagement_occurrence engagement_occurrence_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_occurrence
    ADD CONSTRAINT engagement_occurrence_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: engagement_profile engagement_profile_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_profile
    ADD CONSTRAINT engagement_profile_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: engagement_profile engagement_profile_replaces_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_profile
    ADD CONSTRAINT engagement_profile_replaces_id_fkey FOREIGN KEY (replaces_id) REFERENCES public.engagement_profile(id);


--
-- Name: occurrence_schedule_milestone engagement_schedule_milestone_replaces_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occurrence_schedule_milestone
    ADD CONSTRAINT engagement_schedule_milestone_replaces_id_fkey FOREIGN KEY (replaces_id) REFERENCES public.occurrence_schedule_milestone(id);


--
-- Name: engagement_supervision engagement_supervision_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_supervision
    ADD CONSTRAINT engagement_supervision_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: engagement_supervision engagement_supervision_replaces_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_supervision
    ADD CONSTRAINT engagement_supervision_replaces_id_fkey FOREIGN KEY (replaces_id) REFERENCES public.engagement_supervision(id);


--
-- Name: engagement_venue_binding engagement_venue_binding_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_venue_binding
    ADD CONSTRAINT engagement_venue_binding_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: engagement_venue_binding engagement_venue_binding_replaces_binding_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_venue_binding
    ADD CONSTRAINT engagement_venue_binding_replaces_binding_id_fkey FOREIGN KEY (replaces_binding_id) REFERENCES public.engagement_venue_binding(id);


--
-- Name: engagement_venue_binding engagement_venue_binding_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_venue_binding
    ADD CONSTRAINT engagement_venue_binding_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venue(id);


--
-- Name: event_component_config event_component_config_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_component_config
    ADD CONSTRAINT event_component_config_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.event_components(id) ON DELETE CASCADE;


--
-- Name: event_component_config event_component_config_seed_config_revision_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_component_config
    ADD CONSTRAINT event_component_config_seed_config_revision_fkey FOREIGN KEY (seed_config_revision) REFERENCES public.component_definition_config(id);


--
-- Name: event_components event_components_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_components
    ADD CONSTRAINT event_components_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: event_components event_components_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_components
    ADD CONSTRAINT event_components_identity_id_fkey FOREIGN KEY (definition_id) REFERENCES public.component_definitions(id);


--
-- Name: event_components event_components_library_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_components
    ADD CONSTRAINT event_components_library_component_id_fkey FOREIGN KEY (library_component_id) REFERENCES public.library_component(id);


--
-- Name: event_components event_components_profile_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_components
    ADD CONSTRAINT event_components_profile_revision_id_fkey FOREIGN KEY (profile_revision_id) REFERENCES public.component_profile_revision(id);


--
-- Name: event_components event_components_proposal_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_components
    ADD CONSTRAINT event_components_proposal_version_id_fkey FOREIGN KEY (proposal_version_id) REFERENCES public.proposal_versions(id);


--
-- Name: event_components event_components_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_components
    ADD CONSTRAINT event_components_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: event_debriefs event_debriefs_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_debriefs
    ADD CONSTRAINT event_debriefs_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: event_debriefs event_debriefs_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_debriefs
    ADD CONSTRAINT event_debriefs_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.event_components(id) ON DELETE SET NULL;


--
-- Name: event event_occurrence_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT event_occurrence_ref_fkey FOREIGN KEY (occurrence_ref) REFERENCES public.engagement_occurrence(id);


--
-- Name: execution_evidence execution_evidence_event_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_evidence
    ADD CONSTRAINT execution_evidence_event_ref_fkey FOREIGN KEY (event_ref) REFERENCES public.event(id);


--
-- Name: execution_evidence execution_evidence_obligation_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_evidence
    ADD CONSTRAINT execution_evidence_obligation_ref_fkey FOREIGN KEY (obligation_ref) REFERENCES public.obligation(id);


--
-- Name: execution_evidence execution_evidence_prior_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_evidence
    ADD CONSTRAINT execution_evidence_prior_ref_fkey FOREIGN KEY (prior_ref) REFERENCES public.execution_evidence(id);


--
-- Name: guest_categories guest_categories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_categories
    ADD CONSTRAINT guest_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: obligation obligation_event_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.obligation
    ADD CONSTRAINT obligation_event_ref_fkey FOREIGN KEY (event_ref) REFERENCES public.event(id);


--
-- Name: obligation obligation_supersedes_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.obligation
    ADD CONSTRAINT obligation_supersedes_ref_fkey FOREIGN KEY (supersedes_ref) REFERENCES public.obligation(id);


--
-- Name: occurrence_profile occurrence_profile_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occurrence_profile
    ADD CONSTRAINT occurrence_profile_occurrence_id_fkey FOREIGN KEY (occurrence_id) REFERENCES public.engagement_occurrence(id);


--
-- Name: occurrence_profile occurrence_profile_replaces_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occurrence_profile
    ADD CONSTRAINT occurrence_profile_replaces_id_fkey FOREIGN KEY (replaces_id) REFERENCES public.occurrence_profile(id);


--
-- Name: occurrence_schedule_milestone occurrence_schedule_milestone_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occurrence_schedule_milestone
    ADD CONSTRAINT occurrence_schedule_milestone_occurrence_id_fkey FOREIGN KEY (occurrence_id) REFERENCES public.engagement_occurrence(id);


--
-- Name: occurrence_status occurrence_status_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occurrence_status
    ADD CONSTRAINT occurrence_status_occurrence_id_fkey FOREIGN KEY (occurrence_id) REFERENCES public.engagement_occurrence(id);


--
-- Name: occurrence_supervision occurrence_supervision_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occurrence_supervision
    ADD CONSTRAINT occurrence_supervision_occurrence_id_fkey FOREIGN KEY (occurrence_id) REFERENCES public.engagement_occurrence(id);


--
-- Name: occurrence_supervision occurrence_supervision_replaces_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occurrence_supervision
    ADD CONSTRAINT occurrence_supervision_replaces_id_fkey FOREIGN KEY (replaces_id) REFERENCES public.occurrence_supervision(id);


--
-- Name: occurrence_venue_binding occurrence_venue_binding_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occurrence_venue_binding
    ADD CONSTRAINT occurrence_venue_binding_occurrence_id_fkey FOREIGN KEY (occurrence_id) REFERENCES public.engagement_occurrence(id);


--
-- Name: occurrence_venue_binding occurrence_venue_binding_replaces_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occurrence_venue_binding
    ADD CONSTRAINT occurrence_venue_binding_replaces_id_fkey FOREIGN KEY (replaces_id) REFERENCES public.occurrence_venue_binding(id);


--
-- Name: occurrence_venue_binding occurrence_venue_binding_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.occurrence_venue_binding
    ADD CONSTRAINT occurrence_venue_binding_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venue(id);


--
-- Name: offer_acceptances offer_acceptances_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_acceptances
    ADD CONSTRAINT offer_acceptances_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: offer_acceptances offer_acceptances_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_acceptances
    ADD CONSTRAINT offer_acceptances_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.offer_snapshots(id);


--
-- Name: offer_endpoints offer_endpoints_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_endpoints
    ADD CONSTRAINT offer_endpoints_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.offer_snapshots(id);


--
-- Name: offer_snapshots offer_snapshots_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_snapshots
    ADD CONSTRAINT offer_snapshots_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.proposal_versions(id);


--
-- Name: profile_requirement profile_requirement_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_requirement
    ADD CONSTRAINT profile_requirement_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES public.component_profile_revision(id);


--
-- Name: promotion_citations promotion_citations_act_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_citations
    ADD CONSTRAINT promotion_citations_act_id_fkey FOREIGN KEY (act_id) REFERENCES public.definition_revision_acts(id);


--
-- Name: promotion_citations promotion_citations_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_citations
    ADD CONSTRAINT promotion_citations_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.event_components(id);


--
-- Name: proposal_versions proposal_versions_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_versions
    ADD CONSTRAINT proposal_versions_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposals(id) ON DELETE CASCADE;


--
-- Name: proposal_versions proposal_versions_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_versions
    ADD CONSTRAINT proposal_versions_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.offer_snapshots(id);


--
-- Name: proposal_versions proposal_versions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_versions
    ADD CONSTRAINT proposal_versions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: proposals proposals_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: proposals proposals_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: responsibility_owner responsibility_owner_prior_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.responsibility_owner
    ADD CONSTRAINT responsibility_owner_prior_ref_fkey FOREIGN KEY (prior_ref) REFERENCES public.responsibility_owner(id);


--
-- Name: responsibility_owner responsibility_owner_responsibility_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.responsibility_owner
    ADD CONSTRAINT responsibility_owner_responsibility_ref_fkey FOREIGN KEY (responsibility_ref) REFERENCES public.obligation(id);


--
-- Name: review_decisions review_decisions_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_decisions
    ADD CONSTRAINT review_decisions_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.proposal_versions(id) ON DELETE CASCADE;


--
-- Name: section_types section_types_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_types
    ADD CONSTRAINT section_types_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: staffing_assignment staffing_assignment_event_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staffing_assignment
    ADD CONSTRAINT staffing_assignment_event_ref_fkey FOREIGN KEY (event_ref) REFERENCES public.event(id);


--
-- Name: staffing_assignment staffing_assignment_requirement_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staffing_assignment
    ADD CONSTRAINT staffing_assignment_requirement_ref_fkey FOREIGN KEY (requirement_ref) REFERENCES public.staffing_requirement(id);


--
-- Name: staffing_release staffing_release_assignment_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staffing_release
    ADD CONSTRAINT staffing_release_assignment_ref_fkey FOREIGN KEY (assignment_ref) REFERENCES public.staffing_assignment(id);


--
-- Name: staffing_requirement staffing_requirement_event_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staffing_requirement
    ADD CONSTRAINT staffing_requirement_event_ref_fkey FOREIGN KEY (event_ref) REFERENCES public.event(id);


--
-- Name: staffing_requirement staffing_requirement_origin_obligation_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staffing_requirement
    ADD CONSTRAINT staffing_requirement_origin_obligation_ref_fkey FOREIGN KEY (origin_obligation_ref) REFERENCES public.obligation(id);


--
-- Name: staged_artifact_packages staged_artifact_packages_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staged_artifact_packages
    ADD CONSTRAINT staged_artifact_packages_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.proposal_versions(id) ON DELETE CASCADE;


--
-- Name: tenant_users tenant_users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_users
    ADD CONSTRAINT tenant_users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_users tenant_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_users
    ADD CONSTRAINT tenant_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: venue_evidence venue_evidence_replaces_evidence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_evidence
    ADD CONSTRAINT venue_evidence_replaces_evidence_id_fkey FOREIGN KEY (replaces_evidence_id) REFERENCES public.venue_evidence(id);


--
-- Name: venue_evidence venue_evidence_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_evidence
    ADD CONSTRAINT venue_evidence_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venue(id);


--
-- Name: venue_evidence venue_evidence_walkthrough_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_evidence
    ADD CONSTRAINT venue_evidence_walkthrough_id_fkey FOREIGN KEY (walkthrough_id) REFERENCES public.venue_walkthrough(id);


--
-- Name: venue_observation venue_observation_scope_space2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_observation
    ADD CONSTRAINT venue_observation_scope_space2_id_fkey FOREIGN KEY (scope_space2_id) REFERENCES public.venue_space(id);


--
-- Name: venue_observation venue_observation_scope_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_observation
    ADD CONSTRAINT venue_observation_scope_space_id_fkey FOREIGN KEY (scope_space_id) REFERENCES public.venue_space(id);


--
-- Name: venue_observation_supersession venue_observation_supersession_observation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_observation_supersession
    ADD CONSTRAINT venue_observation_supersession_observation_id_fkey FOREIGN KEY (observation_id) REFERENCES public.venue_observation(id);


--
-- Name: venue_observation venue_observation_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_observation
    ADD CONSTRAINT venue_observation_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venue(id);


--
-- Name: venue_observation venue_observation_walkthrough_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_observation
    ADD CONSTRAINT venue_observation_walkthrough_id_fkey FOREIGN KEY (walkthrough_id) REFERENCES public.venue_walkthrough(id);


--
-- Name: venue venue_redirect_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue
    ADD CONSTRAINT venue_redirect_to_fkey FOREIGN KEY (redirect_to) REFERENCES public.venue(id);


--
-- Name: venue_space venue_space_parent_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_space
    ADD CONSTRAINT venue_space_parent_space_id_fkey FOREIGN KEY (parent_space_id) REFERENCES public.venue_space(id);


--
-- Name: venue_space venue_space_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_space
    ADD CONSTRAINT venue_space_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venue(id);


--
-- Name: venue_walkthrough venue_walkthrough_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_walkthrough
    ADD CONSTRAINT venue_walkthrough_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venue(id);


--
-- Name: version_adjustments version_adjustments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.version_adjustments
    ADD CONSTRAINT version_adjustments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: version_adjustments version_adjustments_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.version_adjustments
    ADD CONSTRAINT version_adjustments_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.proposal_versions(id) ON DELETE CASCADE;


--
-- Name: version_guests version_guests_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.version_guests
    ADD CONSTRAINT version_guests_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.guest_categories(id);


--
-- Name: version_guests version_guests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.version_guests
    ADD CONSTRAINT version_guests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: version_guests version_guests_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.version_guests
    ADD CONSTRAINT version_guests_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.proposal_versions(id) ON DELETE CASCADE;


--
-- Name: version_sections version_sections_section_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.version_sections
    ADD CONSTRAINT version_sections_section_type_id_fkey FOREIGN KEY (section_type_id) REFERENCES public.section_types(id);


--
-- Name: version_sections version_sections_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.version_sections
    ADD CONSTRAINT version_sections_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: version_sections version_sections_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.version_sections
    ADD CONSTRAINT version_sections_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.proposal_versions(id) ON DELETE CASCADE;


--
-- Name: walkthrough_coverage walkthrough_coverage_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walkthrough_coverage
    ADD CONSTRAINT walkthrough_coverage_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.venue_space(id);


--
-- Name: walkthrough_coverage walkthrough_coverage_walkthrough_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walkthrough_coverage
    ADD CONSTRAINT walkthrough_coverage_walkthrough_id_fkey FOREIGN KEY (walkthrough_id) REFERENCES public.venue_walkthrough(id);


--
-- Name: offer_acceptances acc_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY acc_insert ON public.offer_acceptances FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: offer_acceptances acc_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY acc_select ON public.offer_acceptances FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: acceptance_rescissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.acceptance_rescissions ENABLE ROW LEVEL SECURITY;

--
-- Name: acceptance_selection_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.acceptance_selection_sets ENABLE ROW LEVEL SECURITY;

--
-- Name: act_produced_artifacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.act_produced_artifacts ENABLE ROW LEVEL SECURITY;

--
-- Name: action_invocation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.action_invocation ENABLE ROW LEVEL SECURITY;

--
-- Name: action_invocation ainv_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ainv_select ON public.action_invocation FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: act_produced_artifacts apa_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY apa_insert ON public.act_produced_artifacts FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.definition_revision_acts a
  WHERE ((a.id = act_produced_artifacts.act_id) AND (a.tenant_id = public.current_tenant_id())))));


--
-- Name: act_produced_artifacts apa_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY apa_select ON public.act_produced_artifacts FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.definition_revision_acts a
  WHERE ((a.id = act_produced_artifacts.act_id) AND (a.tenant_id = public.current_tenant_id())))));


--
-- Name: attendance_commitment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_commitment ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_commitment attendance_commitment_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_commitment_insert ON public.attendance_commitment FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: attendance_commitment attendance_commitment_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_commitment_select ON public.attendance_commitment FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: bookings bk_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bk_all ON public.bookings USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: blueprint_compositions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blueprint_compositions ENABLE ROW LEVEL SECURITY;

--
-- Name: blueprint_identities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blueprint_identities ENABLE ROW LEVEL SECURITY;

--
-- Name: blueprint_instantiations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blueprint_instantiations ENABLE ROW LEVEL SECURITY;

--
-- Name: blueprint_revisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blueprint_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: blueprint_shelf_acts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blueprint_shelf_acts ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: blueprint_compositions bpc_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bpc_insert ON public.blueprint_compositions FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: blueprint_compositions bpc_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bpc_select ON public.blueprint_compositions FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: blueprint_identities bpi_delete_empty; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bpi_delete_empty ON public.blueprint_identities FOR DELETE USING (((tenant_id = public.current_tenant_id()) AND (published_revision_id IS NULL) AND (NOT (EXISTS ( SELECT 1
   FROM public.blueprint_revisions r
  WHERE ((r.identity_id = blueprint_identities.id) AND (r.state <> 'draft'::text)))))));


--
-- Name: blueprint_identities bpi_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bpi_insert ON public.blueprint_identities FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: blueprint_identities bpi_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bpi_select ON public.blueprint_identities FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: blueprint_identities bpi_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bpi_update ON public.blueprint_identities FOR UPDATE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: blueprint_instantiations bpin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bpin_insert ON public.blueprint_instantiations FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: blueprint_instantiations bpin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bpin_select ON public.blueprint_instantiations FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: blueprint_revisions bpr_delete_drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bpr_delete_drafts ON public.blueprint_revisions FOR DELETE USING (((state = 'draft'::text) AND (EXISTS ( SELECT 1
   FROM public.blueprint_identities i
  WHERE ((i.id = blueprint_revisions.identity_id) AND (i.tenant_id = public.current_tenant_id()))))));


--
-- Name: blueprint_revisions bpr_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bpr_insert ON public.blueprint_revisions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.blueprint_identities i
  WHERE ((i.id = blueprint_revisions.identity_id) AND (i.tenant_id = public.current_tenant_id())))));


--
-- Name: blueprint_revisions bpr_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bpr_select ON public.blueprint_revisions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.blueprint_identities i
  WHERE ((i.id = blueprint_revisions.identity_id) AND (i.tenant_id = public.current_tenant_id())))));


--
-- Name: blueprint_revisions bpr_update_drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bpr_update_drafts ON public.blueprint_revisions FOR UPDATE USING (((state = 'draft'::text) AND (EXISTS ( SELECT 1
   FROM public.blueprint_identities i
  WHERE ((i.id = blueprint_revisions.identity_id) AND (i.tenant_id = public.current_tenant_id()))))));


--
-- Name: blueprint_shelf_acts bsa_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bsa_insert ON public.blueprint_shelf_acts FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: blueprint_shelf_acts bsa_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bsa_select ON public.blueprint_shelf_acts FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: component_definitions cd_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cd_select ON public.component_definitions FOR SELECT USING (((tenant_id IS NULL) OR (tenant_id = public.current_tenant_id())));


--
-- Name: component_definition_config cdc_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cdc_select ON public.component_definition_config FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.component_definitions d
  WHERE ((d.id = component_definition_config.definition_id) AND ((d.tenant_id IS NULL) OR (d.tenant_id = public.current_tenant_id()))))));


--
-- Name: component_definition_config cdc_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cdc_write ON public.component_definition_config USING ((EXISTS ( SELECT 1
   FROM public.component_definitions d
  WHERE ((d.id = component_definition_config.definition_id) AND (d.tenant_id = public.current_tenant_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.component_definitions d
  WHERE ((d.id = component_definition_config.definition_id) AND (d.tenant_id = public.current_tenant_id())))));


--
-- Name: choice_groups cg_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cg_all ON public.choice_groups USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: component_definitions ci_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ci_delete ON public.component_definitions FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: component_definitions ci_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ci_insert ON public.component_definitions FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: component_definitions ci_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ci_update ON public.component_definitions FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: component_instance_layers cil_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cil_delete ON public.component_instance_layers FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.event_components ec
  WHERE ((ec.id = component_instance_layers.component_id) AND (ec.tenant_id = public.current_tenant_id())))));


--
-- Name: component_instance_layers cil_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cil_insert ON public.component_instance_layers FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.event_components ec
  WHERE ((ec.id = component_instance_layers.component_id) AND (ec.tenant_id = public.current_tenant_id())))));


--
-- Name: component_instance_layers cil_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cil_select ON public.component_instance_layers FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.event_components ec
  WHERE ((ec.id = component_instance_layers.component_id) AND (ec.tenant_id = public.current_tenant_id())))));


--
-- Name: component_instance_layers cil_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cil_update ON public.component_instance_layers FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.event_components ec
  WHERE ((ec.id = component_instance_layers.component_id) AND (ec.tenant_id = public.current_tenant_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.event_components ec
  WHERE ((ec.id = component_instance_layers.component_id) AND (ec.tenant_id = public.current_tenant_id())))));


--
-- Name: component_items cit_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cit_all ON public.component_items USING ((EXISTS ( SELECT 1
   FROM public.event_components ec
  WHERE ((ec.id = component_items.component_id) AND (ec.tenant_id = public.current_tenant_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.event_components ec
  WHERE ((ec.id = component_items.component_id) AND (ec.tenant_id = public.current_tenant_id())))));


--
-- Name: component_layers cl_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cl_delete ON public.component_layers FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.component_definitions d
  WHERE ((d.id = component_layers.definition_id) AND (d.tenant_id = public.current_tenant_id())))));


--
-- Name: component_layers cl_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cl_insert ON public.component_layers FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.component_definitions d
  WHERE ((d.id = component_layers.definition_id) AND (d.tenant_id = public.current_tenant_id())))));


--
-- Name: component_layers cl_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cl_select ON public.component_layers FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.component_definitions d
  WHERE ((d.id = component_layers.definition_id) AND ((d.tenant_id IS NULL) OR (d.tenant_id = public.current_tenant_id()))))));


--
-- Name: component_layers cl_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cl_update ON public.component_layers FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.component_definitions d
  WHERE ((d.id = component_layers.definition_id) AND (d.tenant_id = public.current_tenant_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.component_definitions d
  WHERE ((d.id = component_layers.definition_id) AND (d.tenant_id = public.current_tenant_id())))));


--
-- Name: configuration_moves cm_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cm_insert ON public.configuration_moves FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.event_components ec
  WHERE ((ec.id = configuration_moves.component_id) AND (ec.tenant_id = public.current_tenant_id())))));


--
-- Name: configuration_moves cm_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cm_select ON public.configuration_moves FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.event_components ec
  WHERE ((ec.id = configuration_moves.component_id) AND (ec.tenant_id = public.current_tenant_id())))));


--
-- Name: component_definition_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.component_definition_config ENABLE ROW LEVEL SECURITY;

--
-- Name: component_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.component_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: component_instance_layers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.component_instance_layers ENABLE ROW LEVEL SECURITY;

--
-- Name: component_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.component_items ENABLE ROW LEVEL SECURITY;

--
-- Name: component_layers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.component_layers ENABLE ROW LEVEL SECURITY;

--
-- Name: component_profile_override; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.component_profile_override ENABLE ROW LEVEL SECURITY;

--
-- Name: component_profile_revision; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.component_profile_revision ENABLE ROW LEVEL SECURITY;

--
-- Name: component_profile_revision component_profile_revision_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY component_profile_revision_ins ON public.component_profile_revision FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: component_profile_revision component_profile_revision_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY component_profile_revision_sel ON public.component_profile_revision FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: component_requirements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.component_requirements ENABLE ROW LEVEL SECURITY;

--
-- Name: configuration_moves; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.configuration_moves ENABLE ROW LEVEL SECURITY;

--
-- Name: component_profile_override cpo_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cpo_ins ON public.component_profile_override FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: component_profile_override cpo_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cpo_sel ON public.component_profile_override FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: component_requirements cr_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cr_all ON public.component_requirements USING ((EXISTS ( SELECT 1
   FROM public.event_components ec
  WHERE ((ec.id = component_requirements.component_id) AND (ec.tenant_id = public.current_tenant_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.event_components ec
  WHERE ((ec.id = component_requirements.component_id) AND (ec.tenant_id = public.current_tenant_id())))));


--
-- Name: definition_revision_acts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.definition_revision_acts ENABLE ROW LEVEL SECURITY;

--
-- Name: definition_revision_acts dra_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dra_insert ON public.definition_revision_acts FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.component_definitions d
  WHERE ((d.id = definition_revision_acts.definition_id) AND (d.tenant_id = public.current_tenant_id()))))));


--
-- Name: definition_revision_acts dra_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dra_select ON public.definition_revision_acts FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: event_components ec_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ec_all ON public.event_components USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: event_component_config ecc_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ecc_all ON public.event_component_config USING ((EXISTS ( SELECT 1
   FROM public.event_components ec
  WHERE ((ec.id = event_component_config.component_id) AND (ec.tenant_id = public.current_tenant_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.event_components ec
  WHERE ((ec.id = event_component_config.component_id) AND (ec.tenant_id = public.current_tenant_id())))));


--
-- Name: engagement_ledger el_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY el_insert ON public.engagement_ledger FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: engagement_ledger el_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY el_select ON public.engagement_ledger FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: engagement_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engagement_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: engagement_occurrence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engagement_occurrence ENABLE ROW LEVEL SECURITY;

--
-- Name: engagement_occurrence engagement_occurrence_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engagement_occurrence_insert ON public.engagement_occurrence FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: engagement_occurrence engagement_occurrence_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engagement_occurrence_select ON public.engagement_occurrence FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: engagement_profile; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engagement_profile ENABLE ROW LEVEL SECURITY;

--
-- Name: engagement_profile engagement_profile_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engagement_profile_insert ON public.engagement_profile FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: engagement_profile engagement_profile_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engagement_profile_select ON public.engagement_profile FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: occurrence_schedule_milestone engagement_schedule_milestone_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engagement_schedule_milestone_insert ON public.occurrence_schedule_milestone FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: occurrence_schedule_milestone engagement_schedule_milestone_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engagement_schedule_milestone_select ON public.occurrence_schedule_milestone FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: engagement_supervision; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engagement_supervision ENABLE ROW LEVEL SECURITY;

--
-- Name: engagement_supervision engagement_supervision_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engagement_supervision_insert ON public.engagement_supervision FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: engagement_supervision engagement_supervision_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engagement_supervision_select ON public.engagement_supervision FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: engagement_venue_binding; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engagement_venue_binding ENABLE ROW LEVEL SECURITY;

--
-- Name: offer_endpoints ep_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ep_insert ON public.offer_endpoints FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: offer_endpoints ep_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ep_select ON public.offer_endpoints FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: execution_evidence ev_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ev_insert ON public.execution_evidence FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: execution_evidence ev_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ev_select ON public.execution_evidence FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: engagement_venue_binding evb_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY evb_ins ON public.engagement_venue_binding FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: engagement_venue_binding evb_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY evb_sel ON public.engagement_venue_binding FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: event; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event ENABLE ROW LEVEL SECURITY;

--
-- Name: event_component_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_component_config ENABLE ROW LEVEL SECURITY;

--
-- Name: event_components; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_components ENABLE ROW LEVEL SECURITY;

--
-- Name: event event_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_insert ON public.event FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: event event_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_select ON public.event FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: execution_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.execution_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: library_component; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.library_component ENABLE ROW LEVEL SECURITY;

--
-- Name: library_component library_component_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY library_component_ins ON public.library_component FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: library_component library_component_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY library_component_sel ON public.library_component FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: obligation obl_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY obl_insert ON public.obligation FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: obligation obl_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY obl_select ON public.obligation FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: obligation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.obligation ENABLE ROW LEVEL SECURITY;

--
-- Name: occurrence_profile; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.occurrence_profile ENABLE ROW LEVEL SECURITY;

--
-- Name: occurrence_profile occurrence_profile_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY occurrence_profile_insert ON public.occurrence_profile FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: occurrence_profile occurrence_profile_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY occurrence_profile_select ON public.occurrence_profile FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: occurrence_schedule_milestone; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.occurrence_schedule_milestone ENABLE ROW LEVEL SECURITY;

--
-- Name: occurrence_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.occurrence_status ENABLE ROW LEVEL SECURITY;

--
-- Name: occurrence_status occurrence_status_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY occurrence_status_insert ON public.occurrence_status FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: occurrence_status occurrence_status_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY occurrence_status_select ON public.occurrence_status FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: occurrence_supervision; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.occurrence_supervision ENABLE ROW LEVEL SECURITY;

--
-- Name: occurrence_supervision occurrence_supervision_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY occurrence_supervision_insert ON public.occurrence_supervision FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: occurrence_supervision occurrence_supervision_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY occurrence_supervision_select ON public.occurrence_supervision FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: occurrence_venue_binding; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.occurrence_venue_binding ENABLE ROW LEVEL SECURITY;

--
-- Name: occurrence_venue_binding occurrence_venue_binding_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY occurrence_venue_binding_insert ON public.occurrence_venue_binding FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: occurrence_venue_binding occurrence_venue_binding_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY occurrence_venue_binding_select ON public.occurrence_venue_binding FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: offer_acceptances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offer_acceptances ENABLE ROW LEVEL SECURITY;

--
-- Name: offer_endpoints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offer_endpoints ENABLE ROW LEVEL SECURITY;

--
-- Name: offer_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offer_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: promotion_citations pc_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pc_insert ON public.promotion_citations FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.definition_revision_acts a
  WHERE ((a.id = promotion_citations.act_id) AND (a.tenant_id = public.current_tenant_id())))) AND (EXISTS ( SELECT 1
   FROM public.event_components ec
  WHERE ((ec.id = promotion_citations.component_id) AND (ec.tenant_id = public.current_tenant_id()))))));


--
-- Name: promotion_citations pc_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pc_select ON public.promotion_citations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.definition_revision_acts a
  WHERE ((a.id = promotion_citations.act_id) AND (a.tenant_id = public.current_tenant_id())))));


--
-- Name: proposals pr_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pr_all ON public.proposals USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: profile_requirement; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_requirement ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_requirement profile_requirement_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profile_requirement_ins ON public.profile_requirement FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: profile_requirement profile_requirement_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profile_requirement_sel ON public.profile_requirement FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: promotion_citations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promotion_citations ENABLE ROW LEVEL SECURITY;

--
-- Name: proposal_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proposal_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: proposal_versions pv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pv_all ON public.proposal_versions USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: relationships rel_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rel_insert ON public.relationships FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: relationships rel_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rel_select ON public.relationships FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: relationships rel_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rel_update ON public.relationships FOR UPDATE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: relationships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

--
-- Name: responsibility_owner; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.responsibility_owner ENABLE ROW LEVEL SECURITY;

--
-- Name: review_decisions rev_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rev_insert ON public.review_decisions FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: review_decisions rev_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rev_select ON public.review_decisions FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: review_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.review_decisions ENABLE ROW LEVEL SECURITY;

--
-- Name: responsibility_owner ro_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ro_insert ON public.responsibility_owner FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: responsibility_owner ro_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ro_select ON public.responsibility_owner FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: acceptance_rescissions rsc_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rsc_insert ON public.acceptance_rescissions FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: acceptance_rescissions rsc_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rsc_select ON public.acceptance_rescissions FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: staffing_assignment sasg_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sasg_insert ON public.staffing_assignment FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: staffing_assignment sasg_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sasg_select ON public.staffing_assignment FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: acceptance_selection_sets sel_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sel_insert ON public.acceptance_selection_sets FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: acceptance_selection_sets sel_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sel_select ON public.acceptance_selection_sets FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: offer_snapshots snap_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY snap_insert ON public.offer_snapshots FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: offer_snapshots snap_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY snap_select ON public.offer_snapshots FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: staffing_release srel_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srel_insert ON public.staffing_release FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: staffing_release srel_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srel_select ON public.staffing_release FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: staffing_requirement sreq_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sreq_insert ON public.staffing_requirement FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: staffing_requirement sreq_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sreq_select ON public.staffing_requirement FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: staffing_assignment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staffing_assignment ENABLE ROW LEVEL SECURITY;

--
-- Name: staffing_release; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staffing_release ENABLE ROW LEVEL SECURITY;

--
-- Name: staffing_requirement; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staffing_requirement ENABLE ROW LEVEL SECURITY;

--
-- Name: staged_artifact_packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staged_artifact_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: staged_artifact_packages stg_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stg_all ON public.staged_artifact_packages USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: version_adjustments va_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY va_all ON public.version_adjustments USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: venue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venue ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venue_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_evidence venue_evidence_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY venue_evidence_ins ON public.venue_evidence FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: venue_evidence venue_evidence_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY venue_evidence_sel ON public.venue_evidence FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: venue venue_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY venue_ins ON public.venue FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: venue_observation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venue_observation ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_observation venue_observation_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY venue_observation_ins ON public.venue_observation FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: venue_observation venue_observation_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY venue_observation_sel ON public.venue_observation FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: venue_observation_supersession; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venue_observation_supersession ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_observation_supersession venue_observation_supersession_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY venue_observation_supersession_ins ON public.venue_observation_supersession FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: venue_observation_supersession venue_observation_supersession_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY venue_observation_supersession_sel ON public.venue_observation_supersession FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: venue venue_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY venue_sel ON public.venue FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: venue_space; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venue_space ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_space venue_space_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY venue_space_ins ON public.venue_space FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: venue_space venue_space_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY venue_space_sel ON public.venue_space FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: venue_staleness_policy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venue_staleness_policy ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_walkthrough; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venue_walkthrough ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_walkthrough venue_walkthrough_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY venue_walkthrough_ins ON public.venue_walkthrough FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: venue_walkthrough venue_walkthrough_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY venue_walkthrough_sel ON public.venue_walkthrough FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: version_adjustments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.version_adjustments ENABLE ROW LEVEL SECURITY;

--
-- Name: version_guests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.version_guests ENABLE ROW LEVEL SECURITY;

--
-- Name: version_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.version_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: version_guests vg_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vg_all ON public.version_guests USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: version_sections vs_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vs_all ON public.version_sections USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: venue_staleness_policy vsp_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vsp_sel ON public.venue_staleness_policy FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: walkthrough_coverage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.walkthrough_coverage ENABLE ROW LEVEL SECURITY;

--
-- Name: walkthrough_coverage walkthrough_coverage_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY walkthrough_coverage_ins ON public.walkthrough_coverage FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: walkthrough_coverage walkthrough_coverage_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY walkthrough_coverage_sel ON public.walkthrough_coverage FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- PostgreSQL database dump complete
--

\unrestrict 4HxigqpTunNw4VhjQjZdxecoA0cFhW714yQg0Xx4jEpZQ4gXOBZZ0sekSIcB2Zp

