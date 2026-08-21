-- ============================================================================
-- v311 · KITCHEN ENACTMENT — release, guest-count consequence, and the panel
-- File: supabase/v311_kitchen_enactment.sql                min_release v310.1
--
-- The third and last file of v311. Its companions established what a Kitchen
-- quantity IS (v311_kitchen_requirements.sql), who may decide it
-- (v311_authority_grant.sql), and how a decision is recorded and approved
-- (v311_kitchen_quantity_decisions.sql). This file connects that machinery to
-- the two events that actually drive it — a booked Event being released, and an
-- operative guest count changing — and exposes one read model for the panel.
--
-- ── WHY ENACTMENT HANGS OFF generate_obligations ────────────────────────────
-- Release is not one function. release_event materializes the Event (v275), and
-- v292a1, v307a and v307b each carry their own release path. What all four have
-- in common is that they license generation by calling generate_obligations, and
-- nothing else creates event Requirements. Wiring Kitchen enactment into that
-- one seam reaches every release path without editing four ceremonies, and
-- regeneration then refreshes Kitchen exactly when it refreshes everything else.
--
-- generate_obligations is therefore replaced here. Its v275 body is carried over
-- unchanged — same station gate, same natural keys, same additive invalidation —
-- with two additions, both marked v311 inline.
--
-- ── THE SWEEP HAD TO LEARN ABOUT SUPERSESSION ───────────────────────────────
-- v275's sweep invalidates every obligation for the event whose natural key the
-- current configuration does not entail. That was correct while obligations were
-- flat. It is not correct now: approving a Kitchen quantity creates a superseding
-- Requirement revision whose natural key is derived from the approval, so the
-- next regeneration would have invalidated the very Requirement the approval
-- just made authoritative — silently voiding approved operational demand.
--
-- The sweep now walks supersession lineage: a revision is entailed when the ROOT
-- of its line is entailed. Nothing else about the sweep changes, and an
-- obligation genuinely dropped from the accepted configuration is still
-- invalidated exactly as before.
--
-- ── RELEASE RECOMMENDS; IT NEVER APPROVES ───────────────────────────────────
-- Enactment creates the Kitchen Requirement and records the system's initial
-- recommendation — or an explicitly unresolved recommendation, which is a real
-- record that the system looked and could not derive a quantity. It never
-- records an adjustment or an approval. Approval is a human act under an
-- explicit Authority Grant, and release grants nobody that authority.
--
-- ── GUEST COUNT BECOMES CURRENT BY DERIVATION, NOT BY SCHEDULE ──────────────
-- A future-effective guest count must not change today's answer, and must change
-- it the moment it takes effect, with nothing running in between. That rules out
-- polling, scheduled mutation and background triggers.
--
-- So the current recommendation is DERIVED as of a moment, not stored:
-- kitchen_line_current re-reads the frozen committed design and resolves the
-- operative guest count through promise_current_attendance, which already
-- filters on both recorded_at and effective_moment. A commitment effective next
-- Tuesday is simply not part of the answer until next Tuesday, and is part of it
-- from that instant on, without anything having run.
--
-- The recorded recommendation lineage still exists, and is still materialized at
-- explicit ceremony points — release, regeneration, an attendance act. Those are
-- acts, not timers. Between them the panel reads derived truth, so it is never
-- stale and never waiting for a job.
--
-- ── BOUNDARY ────────────────────────────────────────────────────────────────
-- Nothing here reaches past Quantities. No ingredient explosion, no coverage, no
-- sourcing, no prep plan, no prep, production, pack or handoff. No approval is
-- created, and no Authority Grant is created. Preview still writes nothing.
-- EventCore only; Booking CRM is not contacted (Shared Ledger v2, X-013).
-- ============================================================================

begin;

-- ── 1 · the operative guest count for an Event, as of a moment ──────────────
-- One resolver, so enactment, the attendance consequence and the panel can never
-- disagree about what the guest count was. Delegates entirely to v292a1's
-- promise_current_attendance rather than re-deriving: that resolver already
-- excludes superseded commitments, ignores anything recorded after the asking
-- moment, and ignores anything not yet effective at it.
--
-- NULL is a lawful answer and means the Event has no operative guest count as of
-- that moment — never zero, and never a guess.
create or replace function public.event_operative_guest_count(
  p_event uuid, p_as_of timestamptz default now())
returns numeric language plpgsql stable security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_occ uuid; v_att record;
begin
  select e.occurrence_ref into v_occ
    from public.event e where e.id = p_event and e.tenant_id = v_tenant;
  if v_occ is null then return null; end if;
  select * into v_att from public.promise_current_attendance(v_occ, p_as_of);
  if not found then return null; end if;
  return v_att.head_count;
end $$;

-- ── 2 · enactment · a released Event owes Kitchen its lines ─────────────────
-- Returns the natural keys it entails so the caller's sweep can see them. One
-- Requirement per committed culinary line, because a quantity is item truth: a
-- component holding three items has three quantities and could not carry them on
-- one Requirement.
--
-- Requirement identity deliberately excludes the quantity. The line "Sliders for
-- the Grill Station" is the same Requirement whether 100 or 120 are needed —
-- otherwise every guest-count change would orphan the old Requirement and its
-- decision history, which is precisely the fracture the lineage exists to
-- prevent. Quantity lives in decisions and in approved revisions.
create or replace function public.enact_kitchen_requirements(p_event uuid)
returns text[] language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_acc uuid; v_base uuid; v_snap uuid; v_att numeric;
  d record; v_nk text; v_id uuid; v_keys text[] := '{}';
  v_outcome text; v_role text; v_deriv text;
begin
  -- Two different commitments, deliberately.
  --
  -- v_base is the Event's ORIGINAL baseline and is what Requirement identity is
  -- built from. If identity followed the current commitment, adopting a revision
  -- would mint a fresh Requirement for the same culinary line and orphan its
  -- entire decision history — the exact fracture the lineage exists to prevent.
  -- "Sliders for the Grill Station on this Event" is one Requirement whether the
  -- commitment says one per guest or two.
  --
  -- v_acc is the commitment the Event works to NOW (§8), and is what the
  -- quantity is derived FROM. A revision therefore changes the recommendation
  -- and nothing about which Requirement it is a recommendation for.
  select e.origin_commitment_ref into v_base
    from public.event e where e.id = p_event and e.tenant_id = v_tenant;
  if v_base is null then return v_keys; end if;
  v_acc := public.event_current_commitment(p_event, now());
  if v_acc is null then return v_keys; end if;

  select a.snapshot_id into v_snap
    from public.offer_acceptances a where a.id = v_acc and a.tenant_id = v_tenant;
  if v_snap is null then return v_keys; end if;

  v_att := public.event_operative_guest_count(p_event, now());

  for d in select * from public.kitchen_quantity_derive(v_snap, v_att) loop
    if d.component_id is null then continue; end if;   -- unidentifiable line

    v_role := coalesce(nullif(d.item_name,''), d.component_title);
    v_outcome := case
      when d.item_id is not null then 'Produce ' || v_role || ' for ' || d.component_title
      else 'Produce ' || d.component_title || ' menu component'
    end;

    -- Identity: the Event, its BASELINE commitment, the line. Never the
    -- quantity, and never the currently-adopted revision.
    v_nk := encode(extensions.digest(
              p_event::text || v_base::text || 'culinary_item_prepare' ||
              d.component_id::text || coalesce(d.item_id::text,'-'), 'sha256'), 'hex');

    insert into public.obligation
        (tenant_id, event_ref, scope, origin_ref, origin_kind, kind, department,
         required_outcome, resource_role, dependencies, natural_key, anchors)
      values (v_tenant, p_event, 'event', v_base, 'selection', 'culinary_item_prepare',
              'culinary', v_outcome, v_role, '[]'::jsonb, v_nk,
              jsonb_build_array(jsonb_build_object(
                'truth','kitchen_line', 'ref', coalesce(d.item_id, d.component_id),
                'component', d.component_id, 'item', d.item_id, 'snapshot', v_snap)))
      on conflict (tenant_id, natural_key) do nothing;

    select o.id into v_id from public.obligation o
      where o.tenant_id = v_tenant and o.natural_key = v_nk;
    v_keys := array_append(v_keys, v_nk);

    -- The initial recommendation. Idempotent by operands, so re-releasing or
    -- regenerating with an unchanged guest count records nothing new.
    v_deriv := case
      when not d.resolved then null
      when d.quantity_basis = 'per_person' then
        public.kitchen_quantity_text(d.attendance_used) || ' guests × ' ||
        public.kitchen_quantity_text(d.design_quantity) || ' per guest = ' ||
        public.kitchen_quantity_text(d.required_quantity)
      else 'flat ' || public.kitchen_quantity_text(d.required_quantity) ||
           ' — the guest count does not scale this line'
    end;

    perform public.record_kitchen_recommendation(
      v_id, d.required_quantity, d.quantity_basis, d.design_quantity,
      d.attendance_used, d.resolved, d.unresolved_reason, v_deriv,
      jsonb_build_object('snapshot', v_snap, 'component', d.component_id,
                         'item', d.item_id, 'guest_count_basis', v_att));
  end loop;

  return v_keys;
end $$;

-- ── 3 · the current recommendation, derived as of a moment ──────────────────
-- Never stored, never scheduled. Re-derives the line from the same frozen
-- committed design and the same shared derivation the preview uses, against the
-- guest count operative at p_as_of. This is what makes a future-effective guest
-- count become current on its own instant with nothing having run.
create or replace function public.kitchen_line_current(
  p_requirement uuid, p_as_of timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_root uuid; v_o public.obligation%rowtype; v_a jsonb;
  v_acc uuid; v_snap uuid; v_att numeric; d record;
begin
  v_root := public.requirement_lineage_root(p_requirement);
  if v_root is null then return null; end if;
  select * into v_o from public.obligation o where o.id = v_root and o.tenant_id = v_tenant;

  select a into v_a from jsonb_array_elements(coalesce(v_o.anchors,'[]'::jsonb)) a
    where a->>'truth' = 'kitchen_line' limit 1;
  if v_a is null or v_o.event_ref is null then
    -- Not an enacted Kitchen line (a fixture, or a Requirement from another
    -- stage). Honest answer: nothing to derive.
    return jsonb_build_object('derivable', false,
      'reason', 'this Requirement carries no committed Kitchen line to derive from');
  end if;

  v_acc := public.event_current_commitment(v_o.event_ref, p_as_of);
  select a.snapshot_id into v_snap
    from public.offer_acceptances a where a.id = v_acc and a.tenant_id = v_tenant;
  if v_snap is null then
    return jsonb_build_object('derivable', false, 'reason', 'the committed design is unavailable');
  end if;

  v_att := public.event_operative_guest_count(v_o.event_ref, p_as_of);

  for d in select * from public.kitchen_quantity_derive(v_snap, v_att) loop
    if d.component_id::text = v_a->>'component'
       and coalesce(d.item_id::text,'-') = coalesce(v_a->>'item','-') then
      return jsonb_build_object(
        'derivable', true,
        'as_of', p_as_of,
        'guest_count', v_att,
        'quantity_basis', d.quantity_basis,
        'design_quantity', d.design_quantity,
        'attendance_used', d.attendance_used,
        'recommended_quantity', d.required_quantity,
        'resolved', d.resolved,
        'unresolved_reason', d.unresolved_reason);
    end if;
  end loop;

  return jsonb_build_object('derivable', false,
    'reason', 'this line is no longer present in the committed design');
end $$;

-- ── 4 · the Event-facing panel read model ───────────────────────────────────
-- One call, everything the panel shows, computed in the database. React renders
-- these values and calculates none of them — a quantity computed in a browser
-- would be a second derivation able to disagree with the authoritative one.
--
-- ENACTED when the Event exists and its Requirements do; PREVIEW is the separate
-- kitchen_requirement_preview path, which is keyed on a snapshot precisely
-- because it must work before any Event exists.
create or replace function public.kitchen_event_panel(
  p_event uuid, p_as_of timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_lines jsonb := '[]'::jsonb;
  r record; s jsonb; c jsonb; v_review boolean; v_why text;
begin
  if not exists (select 1 from public.event e where e.id = p_event and e.tenant_id = v_tenant) then
    raise exception 'CEREMONY_NOT_FOUND';
  end if;

  for r in
    select o.id, o.required_outcome, o.resource_role
      from public.obligation o
     where o.tenant_id = v_tenant
       and o.event_ref = p_event
       and o.kind = 'culinary_item_prepare'
       and o.supersedes_ref is null                       -- one row per line
     order by o.resource_role, o.created_at
  loop
    s := public.kitchen_quantity_state(r.id);
    c := public.kitchen_line_current(r.id, p_as_of);

    -- Review is a comparison made now, never a flag written earlier. It is
    -- required when an approved quantity no longer equals what the committed
    -- design and the operative guest count currently imply.
    v_review := coalesce((s->>'review_required')::boolean, false);
    v_why := s->>'review_reason';
    if (s->>'has_approved_quantity')::boolean
       and coalesce((c->>'derivable')::boolean, false)
       and coalesce((c->>'resolved')::boolean, false)
       and (c->>'recommended_quantity')::numeric is distinct from (s->>'approved_quantity')::numeric then
      v_review := true;
      v_why := 'the approved quantity no longer matches what the guest count and committed design imply';
    end if;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'requirement_line',      r.id,
      'requirement_revision',  s->>'requirement_revision',
      'item',                  r.resource_role,
      'requirement',           (select l.required_outcome from public.requirement_lineage(r.id) l
                                 where l.is_head),
      'recommended_quantity',  c->>'recommended_quantity',
      'recommendation_resolved', coalesce((c->>'resolved')::boolean, false),
      'unresolved_reason',     coalesce(c->>'unresolved_reason', c->>'reason'),
      'derivation',            s->>'derivation',
      'guest_count',           c->>'guest_count',
      'guest_count_basis',     c->>'quantity_basis',
      'design_quantity',       c->>'design_quantity',
      'adjusted_quantity',     s->>'adjusted_quantity',
      'adjusted_by',           s->>'adjusted_by',
      'adjusted_reason',       s->>'adjusted_reason',
      'approved_quantity',     s->>'approved_quantity',
      'approved_by',           s->>'approved_by',
      'approved_at',           s->>'approved_at',
      'approval_reason',       s->>'approval_reason',
      'fulfillable_quantity',  s->>'fulfillable_quantity',
      'review_required',       v_review,
      'review_reason',         v_why,
      -- Authority is asked per line and per act, so the panel can render a
      -- control the actor may actually use and hide one they may not.
      'may_adjust',            public.can_adjust_kitchen_quantity(r.id, p_as_of),
      'may_approve',           public.can_approve_kitchen_quantity(r.id, p_as_of)));
  end loop;

  return jsonb_build_object(
    'stage', 'enacted',
    'operative', true,
    'event_ref', p_event,
    'as_of', p_as_of,
    'guest_count', public.event_operative_guest_count(p_event, p_as_of),
    'lines', v_lines);
end $$;

-- ── 5 · the guest-count consequence ─────────────────────────────────────────
-- An attendance act re-derives every Kitchen line of the affected Event and
-- records the resulting recommendation. It records NOTHING else: no adjustment,
-- no approval, no Requirement revision, and nothing downstream of Quantities.
-- A prior approval is left exactly where it is, and becomes review-required by
-- comparison rather than by being touched.
--
-- Materialization is idempotent by operands, so an act that does not move the
-- operative guest count — a correction to a superseded commitment, or a
-- future-effective commitment that is not yet in force — writes nothing at all.
create or replace function public.refresh_kitchen_recommendations(p_occurrence uuid)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_event uuid; v_n integer := 0;
begin
  select e.id into v_event from public.event e
    where e.occurrence_ref = p_occurrence and e.tenant_id = v_tenant;
  if v_event is null then return 0; end if;      -- not released: nothing enacted
  select coalesce(array_length(public.enact_kitchen_requirements(v_event), 1), 0) into v_n;
  return v_n;
end $$;

-- ── 6 · the attendance ceremonies gain that consequence ─────────────────────
-- v292a1's bodies are carried over verbatim; the single added line is marked.
-- The consequence sits inside the ceremony rather than in a trigger so that it
-- is an explicit, inspectable part of the act — the Architect's constraint that
-- guest-count effects must not arrive through uncontrolled triggers.
create or replace function public.commit_attendance(
  p_occurrence uuid, p_head_count integer, p_basis text,
  p_effective_moment timestamptz default null, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
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

  perform public.refresh_kitchen_recommendations(p_occurrence);   -- v311

  return jsonb_build_object('attendance_id', v_id, 'basis', p_basis, 'effective_moment', v_eff);
end $$;

create or replace function public.correct_attendance(
  p_attendance uuid, p_head_count integer, p_basis text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
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

  perform public.refresh_kitchen_recommendations(v_prior.occurrence_id);   -- v311

  return jsonb_build_object('attendance_id', v_id, 'corrected', p_attendance);
end $$;

-- ── 7 · generation licenses Kitchen enactment, and stops voiding revisions ──
-- v275's body verbatim. The two v311 additions are marked inline.
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

  -- ── v311 · Kitchen enactment, licensed by the same act that licenses every
  --    other Requirement. Its keys join v_present BEFORE the sweep, so a Kitchen
  --    line the accepted configuration still entails is never invalidated.
  v_present := v_present || public.enact_kitchen_requirements(p_event);

  -- ── additive regeneration (I-35/I-36): obligations no longer entailed by the
  --    current frozen config are INVALIDATED via a new evidence fact — never
  --    mutated or deleted. Completed evidence is untouched.
  --
  --    v311 · lineage-aware. An obligation created by supersession carries a
  --    natural key the configuration cannot name — an approved Kitchen quantity
  --    is the case that matters — so entailment is inherited from the ROOT of
  --    its supersession line. Without this the next regeneration would void the
  --    Requirement an approval had just made authoritative. An obligation whose
  --    root is genuinely no longer entailed is still invalidated, exactly as
  --    before.
  insert into public.execution_evidence (tenant_id, event_ref, obligation_ref, kind, actor, payload)
    with recursive lineage as (
      select o.id, o.natural_key as root_key
        from public.obligation o
       where o.tenant_id = v_tenant and o.event_ref = p_event and o.supersedes_ref is null
      union all
      select c.id, l.root_key
        from public.obligation c
        join lineage l on c.supersedes_ref = l.id
       where c.tenant_id = v_tenant and c.event_ref = p_event)
    select v_tenant, p_event, o.id, 'invalidated', 'generator',
           jsonb_build_object('reason','no longer entailed by accepted configuration')
      from public.obligation o
     where o.tenant_id = v_tenant and o.event_ref = p_event
       and not (o.natural_key = any(v_present))
       and not exists (select 1 from lineage l
                        where l.id = o.id and l.root_key = any(v_present))
       and not exists (select 1 from public.execution_evidence e
                        where e.obligation_ref = o.id and e.kind = 'invalidated');

  select count(*) into v_count from public.obligation
    where tenant_id = v_tenant and event_ref = p_event
      and natural_key = any(v_present);
  return v_count;
end $$;

-- ── 8 · post-commitment revision · the seam Kitchen needs ───────────────────
-- C-205 seals a commitment BASELINE, not a forever-event, and CAN-183 makes a
-- later committed-design change an explicit append-only revision. The runtime
-- did not implement that, and inspection found something worse than absence:
--
--   · a SECOND acceptance for an already-released engagement is recordable —
--     accept_offer refuses a replayed snapshot, not a revised one;
--   · event.origin_commitment_ref permanently names the FIRST acceptance and is
--     never updated;
--   · re-release is refused (RELEASE_ALREADY_RELEASED);
--   · so regeneration keeps reading the original snapshot forever.
--
-- The revised commitment was therefore recorded and then silently ignored. An
-- operator could accept a revised menu and watch Kitchen keep preparing to the
-- original one, with nothing anywhere reporting the divergence.
--
-- ── WHY ADOPTION IS A SEPARATE ACT FROM ACCEPTANCE ──────────────────────────
-- The fix is not to make the Event follow the newest acceptance automatically.
-- A counterparty accepting a revised offer is a COMMERCIAL fact; making that
-- revision the Event's operative commitment is an OPERATIONAL act with
-- consequences for work already approved. EventCore keeps such things apart
-- everywhere else, and it separates them here: a revision is inert until it is
-- explicitly adopted, under an explicit Authority Grant.
--
-- ── THE BASELINE STAYS ──────────────────────────────────────────────────────
-- event.origin_commitment_ref is never rewritten. Adoption is an append-only
-- record citing the commitment it supersedes, so the original baseline remains
-- exactly where it was and the sequence of revisions is inspectable.
--
-- ── BOUNDED ON PURPOSE ──────────────────────────────────────────────────────
-- Kitchen resolves its committed design through this. The v275 execution
-- obligations do NOT: their natural keys embed the acceptance, so re-pointing
-- them would supersede and regenerate every equipment, staffing and venue
-- obligation on the event. That is an execution-spine decision, not a Kitchen
-- one, and it is reported as a named residual rather than taken here.
create table if not exists public.event_commitment_revision (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  event_ref      uuid not null references public.event(id),
  -- The acceptance this Event now works to.
  acceptance_ref uuid not null references public.offer_acceptances(id),
  -- The commitment it replaces: a prior revision, or null when it supersedes
  -- the Event's original baseline.
  supersedes_ref uuid references public.event_commitment_revision(id),
  reason         text not null,
  adopted_by     text not null,
  recorded_at    timestamptz not null default now(),
  seq            bigserial not null,
  constraint ecr_reason_present check (btrim(reason) <> '')
);

create index if not exists idx_ecr_event on public.event_commitment_revision(event_ref, seq);

alter table public.event_commitment_revision enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='event_commitment_revision' and policyname='ecr_tenant_select') then
    create policy ecr_tenant_select on public.event_commitment_revision
      for select using (tenant_id = public.current_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='event_commitment_revision' and policyname='ecr_tenant_insert') then
    create policy ecr_tenant_insert on public.event_commitment_revision
      for insert with check (tenant_id = public.current_tenant_id());
  end if;
end $$;

create or replace function public.event_commitment_revision_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'COMMITMENT_REVISION_EDIT_REFUSED: adoption records are append-only; adopt the next revision instead';
end $$;

drop trigger if exists ecr_no_edit on public.event_commitment_revision;
create trigger ecr_no_edit
  before update or delete on public.event_commitment_revision
  for each row execute function public.event_commitment_revision_append_only();

-- The commitment the Event works to as of a moment. Falls back to the original
-- baseline, so an Event that never revised behaves exactly as it did before.
create or replace function public.event_current_commitment(
  p_event uuid, p_as_of timestamptz default now())
returns uuid language plpgsql stable security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_acc uuid;
begin
  select r.acceptance_ref into v_acc
    from public.event_commitment_revision r
   where r.event_ref = p_event and r.tenant_id = v_tenant
     and r.recorded_at <= p_as_of
   order by r.seq desc limit 1;
  if v_acc is not null then return v_acc; end if;

  select e.origin_commitment_ref into v_acc
    from public.event e where e.id = p_event and e.tenant_id = v_tenant;
  return v_acc;
end $$;

create or replace function public.can_revise_event_commitment(
  p_event uuid default null, p_as_of timestamptz default now())
returns boolean language sql stable security definer set search_path = public
as $$
  select public.current_actor() is not null
     and public.has_authority(public.current_actor(), 'event.commitment.revise', p_event, p_as_of);
$$;

-- Adopt a revised commitment. Refuses anything that is not a real, unrescinded
-- acceptance of THIS engagement, so adoption cannot quietly re-point an Event at
-- another booking's design.
--
-- Kitchen re-derives from the moment this returns, because its recommendation is
-- derived as of now rather than stored. A prior approval is untouched and
-- remains historically true; it simply stops matching what the commitment now
-- implies, which the panel reports as Review required. Nothing is auto-approved
-- and nothing downstream of Quantities moves.
create or replace function public.revise_event_commitment(
  p_event uuid, p_acceptance uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_actor text; v_book uuid; v_acc_book uuid; v_prior uuid; v_cur uuid; v_id uuid;
begin
  if not public.can_revise_event_commitment(p_event) then
    raise exception 'COMMITMENT_REVISION_NOT_PERMITTED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'COMMITMENT_REVISION_REASON_REQUIRED';
  end if;

  select e.engagement_ref into v_book
    from public.event e where e.id = p_event and e.tenant_id = v_tenant;
  if v_book is null then raise exception 'CEREMONY_NOT_FOUND'; end if;

  select a.booking_id into v_acc_book
    from public.offer_acceptances a where a.id = p_acceptance and a.tenant_id = v_tenant;
  if v_acc_book is null then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_acc_book <> v_book then
    raise exception 'COMMITMENT_REVISION_FOREIGN: that acceptance belongs to another engagement';
  end if;
  if exists (select 1 from public.acceptance_rescissions r where r.acceptance_id = p_acceptance) then
    raise exception 'COMMITMENT_REVISION_RESCINDED: a rescinded acceptance cannot become the operative commitment';
  end if;

  v_cur := public.event_current_commitment(p_event, now());
  if v_cur = p_acceptance then
    raise exception 'COMMITMENT_REVISION_UNCHANGED';
  end if;

  v_actor := coalesce(nullif(current_setting('app.user_id', true), ''),
                      nullif(current_setting('request.jwt.claim.sub', true), ''), 'unknown');

  select r.id into v_prior from public.event_commitment_revision r
    where r.event_ref = p_event and r.tenant_id = v_tenant
    order by r.seq desc limit 1;

  insert into public.event_commitment_revision
      (tenant_id, event_ref, acceptance_ref, supersedes_ref, reason, adopted_by)
    values (v_tenant, p_event, p_acceptance, v_prior, btrim(p_reason), v_actor)
    returning id into v_id;

  -- Kitchen records the recommendation the revised commitment implies. It does
  -- not approve it, and it does not touch the prior approval.
  perform public.enact_kitchen_requirements(p_event);

  return jsonb_build_object('revision_id', v_id, 'event_ref', p_event,
                            'acceptance_ref', p_acceptance,
                            'supersedes', v_prior,
                            'baseline', (select e.origin_commitment_ref
                                           from public.event e where e.id = p_event));
end $$;

-- ── the deployed marker ─────────────────────────────────────────────────────
create function public.v311_kitchen_enactment() returns text
language sql immutable as $$ select 'v311 · release enacts Kitchen Requirements and one recommendation; guest count becomes current by derivation; approval is never automatic'::text $$;

commit;
