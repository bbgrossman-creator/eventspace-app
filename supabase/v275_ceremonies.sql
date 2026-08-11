-- ═══════════════════════════════════════════════════════════════════════════
-- v275 — EXECUTION OS CEREMONIES. Three write paths above the frozen commitment
-- layer. All SECURITY DEFINER with authorization by current_tenant_id() (no
-- definer bypass of tenant scoping), thread-first lock on the engagement root,
-- and non-disclosing refusals (CEREMONY_NOT_FOUND) on cross-tenant access.
--
--   release_event()             I-31/32/37/39  default-deny layered release → materialize + generate
--   generate_obligations()      I-33/36        deterministic, idempotent, additive regeneration
--   record_execution_evidence() I-34/35/38     the append-only write path DailyOps invokes
--
-- These READ the frozen commitment layer (offer_acceptances, acceptance_selection_
-- sets, offer_snapshots, acceptance_rescissions) and NEVER write it.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── generate_obligations: deterministic function of the released event's FROZEN
--    accepted configuration. Reads the immutable snapshot model (never live design
--    tables — the frozen-commitment principle). Idempotent by natural_key.
--    Regeneration invalidates obsolete obligations additively (never mutates/deletes).
create or replace function public.generate_obligations(p_event uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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

-- ── release_event: default-deny, layered, evidence-grounded (I-32). Never reads
--    mutable booking/workflow status for authority. Materializes the event (I-31)
--    and licenses generation. Thread-first lock on the engagement root.
create or replace function public.release_event(
  p_booking      uuid,
  p_actor        text,
  p_signoff_ref  text default null,   -- operational sign-off (required)
  p_clearance_ref text default null,  -- financial clearance evidence (required unless waiver)
  p_waiver_ref   text default null    -- authorized waiver (satisfies clearance)
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_book   uuid;
  v_acc    uuid;
  v_event  uuid;
  v_gen    integer;
begin
  -- resolve + LOCK the engagement root (thread-first; serializes concurrent release)
  select id into v_book from public.bookings
    where id = p_booking and tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;   -- no existence leak

  -- ── PREDICATE (default-deny, layered) over IMMUTABLE facts ──
  -- (1) customer commitment: an unrescinded acceptance for this engagement
  select a.id into v_acc
    from public.offer_acceptances a
    left join public.acceptance_rescissions r on r.acceptance_id = a.id
   where a.booking_id = p_booking and a.tenant_id = v_tenant and r.id is null
   order by a.created_at limit 1;
  if not found then
    raise exception 'RELEASE_PREDICATE_UNSATISFIED: commitment (no unrescinded acceptance)';
  end if;
  -- (2) financial clearance: a clearance ref, or an authorized waiver (I-37)
  if p_clearance_ref is null and p_waiver_ref is null then
    raise exception 'RELEASE_PREDICATE_UNSATISFIED: clearance (no deposit/credit/waiver evidence)';
  end if;
  -- (3) operational sign-off
  if p_signoff_ref is null then
    raise exception 'RELEASE_PREDICATE_UNSATISFIED: sign_off (no operator release attestation)';
  end if;
  -- (reserved) Agreement predicate: policy slot, off by default in v275.

  -- ── MATERIALIZE the event exactly once (I-31). Provenance = the acceptance. ──
  insert into public.event (tenant_id, engagement_ref, origin_commitment_ref, released_by)
    values (v_tenant, p_booking, v_acc, p_actor)
    on conflict (tenant_id, engagement_ref) do nothing
    returning id into v_event;
  if v_event is null then raise exception 'RELEASE_ALREADY_RELEASED'; end if;

  -- ── EVIDENCE (append-only): released + sign_off + clearance/waiver ──
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_event, 'released', p_actor,
            jsonb_build_object('acceptance', v_acc));
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_event, 'sign_off', p_actor,
            jsonb_build_object('signoff_ref', p_signoff_ref));
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_tenant, v_event, 'clearance', p_actor,
            case when p_waiver_ref is not null
                 then jsonb_build_object('waiver_ref', p_waiver_ref)
                 else jsonb_build_object('clearance_ref', p_clearance_ref) end);

  -- ── LICENSE generation ──
  v_gen := public.generate_obligations(v_event);

  return jsonb_build_object('event_id', v_event, 'generated_count', v_gen);
end $$;

-- ── record_execution_evidence: the append-only write path a DailyOps completion
--    invokes (I-34/35/38). Validates the obligation/event under the tenant; writes
--    one immutable fact; a correction cites the prior. Stores no projection.
create or replace function public.record_execution_evidence(
  p_event      uuid,
  p_obligation uuid,
  p_kind       text,
  p_actor      text,
  p_payload    jsonb default '{}'::jsonb,
  p_prior      uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.release_event(uuid,text,text,text,text),
                             public.generate_obligations(uuid),
                             public.record_execution_evidence(uuid,uuid,text,text,jsonb,uuid) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant execute on function public.release_event(uuid,text,text,text,text),
                             public.generate_obligations(uuid),
                             public.record_execution_evidence(uuid,uuid,text,text,jsonb,uuid) to app_user;
  end if;
end $$;
