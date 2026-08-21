-- ============================================================================
-- v311 · KITCHEN QUANTITIES STAGE — recommendation, adjustment, approval
-- File: supabase/v311_kitchen_quantity_decisions.sql       min_release v310.1
--
-- Companion to supabase/v311_kitchen_requirements.sql, which freezes the
-- committed quantitative rule and derives from it. This file adds the stage the
-- reconstructed Kitchen ledger requires between a Requirement existing and a
-- quantity being fulfillable:
--
--   Menu / Intake Review → QUANTITIES → Ingredient Coverage / Sourcing → …
--
-- The ledger's governing sentence for this stage is "Recommended ≠ adjusted ≠
-- approved", and "approved quantity drives fulfillment demand". Everything here
-- exists to keep those three facts distinct and individually attributable.
--
-- ── WHY A DECISION LINEAGE AND NOT THREE COLUMNS ────────────────────────────
-- Three mutable columns on the obligation would answer "what is the quantity?"
-- and destroy "how did it come to be that?" — the recommendation that preceded
-- an adjustment, the basis an approval was made under, who approved it. Those
-- are the facts reconciliation needs when guest count later moves. They are
-- acts, so they are recorded as acts, append-only, and current state is derived
-- rather than stored.
--
-- public.obligation is itself append-only: v286's responsibility_no_edit
-- trigger refuses UPDATE and DELETE outright and directs change through
-- supersession. This relation follows the same law rather than inventing a
-- softer one beside it.
--
-- ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
-- Not a second Requirement. public.obligation remains the Requirement (C-04);
-- this is decision history attached to it, in the same way v286's
-- responsibility_owner is ownership history attached to it. No new canonical
-- product noun is introduced.
--
-- Nothing here creates or mutates prepared-stock allocation, make/purchase
-- disposition, ingredient explosion, shortages, purchase orders, Runs, Batches,
-- Assemblies, or any Prep/Production/Pack/Handoff state. v311 establishes the
-- approved quantity those later stages will consume, and stops there.
--
-- EventCore only. Booking CRM is not contacted (Shared Ledger v2, X-013).
-- ============================================================================

begin;

-- ── 0 · quantities as an operator reads them ────────────────────────────────
-- Every quantity that reaches a human — a Requirement's text, a derivation line
-- — goes through here, so a Kitchen lead is never shown "approved quantity 110."
-- or "100. guests". FM suppresses padding and trailing zeros but strands the
-- decimal point on a whole number; only that point is removed, never trailing
-- zeros, which on 100 would leave 1.
create or replace function public.kitchen_quantity_text(p_quantity numeric)
returns text language sql immutable as $$
  select case when p_quantity is null then null
              else regexp_replace(btrim(to_char(p_quantity, 'FM9999999990.999')), '\.$', '')
         end;
$$;

-- ── 1 · Requirement lineage ─────────────────────────────────────────────────
-- public.obligation already carries supersedes_ref, and v286's
-- responsibility_state already reports a superseded record by that citation
-- alone. What was missing is the ability to speak about the LINE rather than a
-- single revision of it.
--
-- This matters because approval creates a new Requirement revision. If decisions
-- were filed against whichever revision happened to be current when they were
-- taken, the history of a single Kitchen line would scatter across revisions and
-- "what was recommended before this was approved?" would stop being answerable
-- the moment approval succeeded — the exact question reconciliation needs most.
--
-- So decisions are filed against the lineage ROOT, and every reader resolves to
-- the root first. A caller may pass any revision; it gets the same answer. The
-- root is the stable name of the line, and revisions are what happened to it.
create or replace function public.requirement_lineage_root(p_requirement uuid)
returns uuid language plpgsql stable security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_id uuid := p_requirement; v_next uuid; v_guard int := 0;
begin
  if p_requirement is null then return null; end if;
  loop
    select o.supersedes_ref into v_next
      from public.obligation o where o.id = v_id and o.tenant_id = v_tenant;
    if not found then return null; end if;          -- unknown, or another tenant's
    exit when v_next is null;
    v_id := v_next;
    v_guard := v_guard + 1;
    if v_guard > 1000 then raise exception 'REQUIREMENT_LINEAGE_CYCLE'; end if;
  end loop;
  return v_id;
end $$;

-- The authoritative revision: the one nothing supersedes. Ordered deterministic
-- descent, so a malformed fork resolves the same way on every call rather than
-- returning whichever row the planner reached first.
create or replace function public.requirement_lineage_head(p_requirement uuid)
returns uuid language plpgsql stable security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_id uuid; v_next uuid; v_guard int := 0;
begin
  v_id := public.requirement_lineage_root(p_requirement);
  if v_id is null then return null; end if;
  loop
    select o.id into v_next from public.obligation o
      where o.supersedes_ref = v_id and o.tenant_id = v_tenant
      order by o.created_at, o.id limit 1;
    exit when v_next is null;
    v_id := v_next;
    v_guard := v_guard + 1;
    if v_guard > 1000 then raise exception 'REQUIREMENT_LINEAGE_CYCLE'; end if;
  end loop;
  return v_id;
end $$;

-- The whole line, oldest first. This is what makes supersession inspectable:
-- every revision a Kitchen line has ever had, in order, with the current one
-- named. Superseded revisions are never removed and never edited.
create or replace function public.requirement_lineage(p_requirement uuid)
returns table (requirement_ref uuid, revision_no int, required_outcome text,
               created_at timestamptz, is_head boolean)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_id uuid; v_next uuid; v_n int := 0;
begin
  v_id := public.requirement_lineage_root(p_requirement);
  if v_id is null then return; end if;
  loop
    v_n := v_n + 1;
    select o.id into v_next from public.obligation o
      where o.supersedes_ref = v_id and o.tenant_id = v_tenant
      order by o.created_at, o.id limit 1;

    select v_id, v_n, o.required_outcome, o.created_at, v_next is null
      into requirement_ref, revision_no, required_outcome, created_at, is_head
      from public.obligation o where o.id = v_id and o.tenant_id = v_tenant;
    return next;

    exit when v_next is null;
    v_id := v_next;
    if v_n > 1000 then raise exception 'REQUIREMENT_LINEAGE_CYCLE'; end if;
  end loop;
end $$;

-- ── 2 · the decision lineage ────────────────────────────────────────────────
create table if not exists public.requirement_quantity_decision (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  requirement_ref   uuid not null references public.obligation(id),
  decision_kind     text not null check (decision_kind in ('recommended','adjusted','approved')),
  -- The decided figure. NULL is meaningful and only lawful on a recommendation:
  -- it records that the system looked and could not resolve one, which is a
  -- different fact from nobody having looked.
  quantity          numeric,
  quantity_basis    text,
  design_quantity   numeric,
  guest_count       numeric,
  resolved          boolean not null,
  unresolved_reason text,
  -- Human-readable derivation, e.g. '100 guests × 1 per guest = 100'. Stored
  -- rather than recomputed so the explanation survives even after the operands
  -- move underneath it.
  derivation        text,
  decided_by        text not null,
  reason            text,
  effective_basis   jsonb not null default '{}'::jsonb,
  supersedes_ref    uuid references public.requirement_quantity_decision(id),
  natural_key       text not null,
  recorded_at       timestamptz not null default now(),
  seq               bigserial not null,
  constraint requirement_quantity_decision_nk unique (tenant_id, natural_key),
  -- A resolved decision must carry a figure; an unresolved one must not pretend
  -- to. This is the invariant that stops an unresolved recommendation from ever
  -- being read as a quantity.
  constraint rqd_resolved_has_quantity check (
    (resolved and quantity is not null) or (not resolved and quantity is null)),
  -- Only a recommendation may be unresolved. A human cannot adjust or approve
  -- their way to "no quantity".
  constraint rqd_only_recommendation_unresolved check (
    resolved or decision_kind = 'recommended'),
  -- Deliberate human acts must say why. The system's own recommendation is
  -- explained by its derivation instead.
  constraint rqd_human_acts_need_reason check (
    decision_kind = 'recommended' or (reason is not null and btrim(reason) <> ''))
);

create index if not exists idx_rqd_requirement on public.requirement_quantity_decision(requirement_ref);
create index if not exists idx_rqd_tenant_kind on public.requirement_quantity_decision(tenant_id, decision_kind);

alter table public.requirement_quantity_decision enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='requirement_quantity_decision' and policyname='rqd_tenant_select') then
    create policy rqd_tenant_select on public.requirement_quantity_decision
      for select using (tenant_id = public.current_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='requirement_quantity_decision' and policyname='rqd_tenant_insert') then
    create policy rqd_tenant_insert on public.requirement_quantity_decision
      for insert with check (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- Append-only, in the same words and for the same reason as v286's obligation
-- guard: a decision that can be edited is not a record of what was decided.
create or replace function public.quantity_decision_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'QUANTITY_DECISION_EDIT_REFUSED: quantity decisions are append-only; express change by recording the next decision';
end $$;

drop trigger if exists rqd_no_edit on public.requirement_quantity_decision;
create trigger rqd_no_edit
  before update or delete on public.requirement_quantity_decision
  for each row execute function public.quantity_decision_append_only();

-- ── 3 · record a system recommendation ──────────────────────────────────────
-- Idempotent by construction: the natural key is the requirement plus the exact
-- operands the recommendation was derived from, so replaying identical inputs
-- finds the existing row and writes nothing, while a genuinely changed guest
-- count or design operand records the next recommendation and leaves the prior
-- one standing. The guest count is in THIS key because a recommendation is a
-- statement about specific operands — it is deliberately NOT in the Requirement
-- lineage key, where it would fracture the obligation's identity.
create or replace function public.record_kitchen_recommendation(
  p_requirement uuid, p_quantity numeric, p_quantity_basis text,
  p_design_quantity numeric, p_guest_count numeric,
  p_resolved boolean, p_unresolved_reason text, p_derivation text,
  p_effective_basis jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_nk text; v_id uuid; v_prior uuid; v_root uuid;
begin
  -- Filed against the line, not the revision: a recommendation made before an
  -- approval must still be readable after that approval created a new revision.
  v_root := public.requirement_lineage_root(p_requirement);
  if v_root is null then
    raise exception 'KITCHEN_REQUIREMENT_NOT_FOUND';
  end if;

  v_nk := encode(extensions.digest(
            v_root::text || 'recommended' ||
            coalesce(p_quantity_basis,'-') || coalesce(p_design_quantity::text,'-') ||
            coalesce(p_guest_count::text,'-') || coalesce(p_unresolved_reason,'-'),
            'sha256'), 'hex');

  select id into v_id from public.requirement_quantity_decision
    where tenant_id = v_tenant and natural_key = v_nk;
  if v_id is not null then
    return jsonb_build_object('decision_id', v_id, 'created', false, 'kind', 'recommended');
  end if;

  select id into v_prior from public.requirement_quantity_decision
    where tenant_id = v_tenant and requirement_ref = v_root and decision_kind = 'recommended'
    order by seq desc limit 1;

  insert into public.requirement_quantity_decision
      (tenant_id, requirement_ref, decision_kind, quantity, quantity_basis, design_quantity,
       guest_count, resolved, unresolved_reason, derivation, decided_by, effective_basis,
       supersedes_ref, natural_key)
    values (v_tenant, v_root, 'recommended',
            case when p_resolved then p_quantity else null end,
            p_quantity_basis, p_design_quantity, p_guest_count,
            coalesce(p_resolved,false), p_unresolved_reason, p_derivation,
            'system:kitchen_quantity_recommend', coalesce(p_effective_basis,'{}'::jsonb),
            v_prior, v_nk)
    returning id into v_id;

  return jsonb_build_object('decision_id', v_id, 'created', true, 'kind', 'recommended',
                            'requirement_line', v_root, 'supersedes', v_prior);
end $$;

-- ── 4 · deliberate human adjustment ─────────────────────────────────────────
-- An adjustment is not an approval. Keeping them separable is the point: the
-- ledger allows a Kitchen lead to say "make it 110, we want a service reserve"
-- without that statement silently becoming the authority that drives sourcing.
create or replace function public.adjust_kitchen_quantity(
  p_requirement uuid, p_quantity numeric, p_reason text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_actor text; v_nk text; v_id uuid; v_prior record; v_root uuid;
begin
  if not public.can_adjust_kitchen_quantity(p_requirement) then
    raise exception 'KITCHEN_QUANTITY_NOT_PERMITTED';
  end if;
  if p_quantity is null then raise exception 'KITCHEN_ADJUST_QUANTITY_REQUIRED'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'KITCHEN_ADJUST_REASON_REQUIRED'; end if;
  v_root := public.requirement_lineage_root(p_requirement);
  if v_root is null then
    raise exception 'KITCHEN_REQUIREMENT_NOT_FOUND';
  end if;

  v_actor := coalesce(nullif(current_setting('app.user_id', true), ''),
                      nullif(current_setting('request.jwt.claim.sub', true), ''), 'unknown');

  select * into v_prior from public.requirement_quantity_decision
    where tenant_id = v_tenant and requirement_ref = v_root
    order by seq desc limit 1;

  v_nk := encode(extensions.digest(
            v_root::text || 'adjusted' || p_quantity::text || v_actor || btrim(p_reason),
            'sha256'), 'hex');
  select id into v_id from public.requirement_quantity_decision
    where tenant_id = v_tenant and natural_key = v_nk;
  if v_id is not null then
    return jsonb_build_object('decision_id', v_id, 'created', false, 'kind', 'adjusted');
  end if;

  insert into public.requirement_quantity_decision
      (tenant_id, requirement_ref, decision_kind, quantity, quantity_basis, design_quantity,
       guest_count, resolved, derivation, decided_by, reason, effective_basis,
       supersedes_ref, natural_key)
    values (v_tenant, v_root, 'adjusted', p_quantity,
            v_prior.quantity_basis, v_prior.design_quantity, v_prior.guest_count, true,
            'adjusted from ' || coalesce(v_prior.quantity::text,'unresolved') || ' to ' || p_quantity::text,
            v_actor, btrim(p_reason), coalesce(v_prior.effective_basis,'{}'::jsonb),
            v_prior.id, v_nk)
    returning id into v_id;

  return jsonb_build_object('decision_id', v_id, 'created', true, 'kind', 'adjusted',
                            'requirement_line', v_root, 'supersedes', v_prior.id);
end $$;

-- ── 5 · approval · the authoritative Quantities-stage act ───────────────────
-- Approval is what Ingredient Coverage / Sourcing will later be allowed to
-- consume. It is attributable, append-only, and refuses to invent a figure: it
-- approves either an explicit quantity or the standing decision, and if neither
-- resolves it refuses rather than approving nothing.
--
-- ── APPROVAL IS ONE ACT WITH TWO INSEPARABLE EFFECTS ────────────────────────
-- Recording the approval decision alone would leave the approved figure as a
-- side projection: true in the decision ledger, absent from the Requirement that
-- Kitchen actually works to. The authoritative quantified demand must BE the
-- Requirement, because public.obligation is what C-04 names as the Requirement
-- and what every downstream stage will read.
--
-- So approval atomically does both: it appends the decision, and it creates the
-- next quantified revision of the Requirement, citing the prior revision through
-- supersedes_ref. The prior revision is neither edited nor deleted — v286's
-- append-only trigger would refuse either — and v286's responsibility_state
-- already reports it as 'superseded' on the strength of that citation alone.
--
-- Atomicity is structural rather than asserted: this is a single plpgsql
-- function with no exception handler, so any failure after the decision insert
-- unwinds the decision with it. The explicit check below turns a silently
-- missing revision into a named failure rather than a half-approved state.
create or replace function public.approve_kitchen_quantity(
  p_requirement uuid, p_reason text, p_quantity numeric default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_actor text; v_nk text; v_id uuid; v_prior record; v_qty numeric;
  v_root uuid; v_head uuid; v_h public.obligation%rowtype;
  v_base text; v_rev_outcome text; v_rev_nk text; v_rev uuid; v_qtxt text;
begin
  if not public.can_approve_kitchen_quantity(p_requirement) then
    raise exception 'KITCHEN_QUANTITY_NOT_PERMITTED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'KITCHEN_APPROVE_REASON_REQUIRED'; end if;

  v_root := public.requirement_lineage_root(p_requirement);
  if v_root is null then
    raise exception 'KITCHEN_REQUIREMENT_NOT_FOUND';
  end if;
  -- Approval acts on the current revision of the line, whichever revision the
  -- caller happened to name.
  v_head := public.requirement_lineage_head(v_root);
  select * into v_h from public.obligation o where o.id = v_head and o.tenant_id = v_tenant;
  if not found then raise exception 'KITCHEN_REQUIREMENT_NOT_FOUND'; end if;

  v_actor := coalesce(nullif(current_setting('app.user_id', true), ''),
                      nullif(current_setting('request.jwt.claim.sub', true), ''), 'unknown');

  select * into v_prior from public.requirement_quantity_decision
    where tenant_id = v_tenant and requirement_ref = v_root
    order by seq desc limit 1;

  v_qty := coalesce(p_quantity, v_prior.quantity);
  if v_qty is null then
    raise exception 'KITCHEN_APPROVE_NO_QUANTITY: nothing resolves to a quantity to approve';
  end if;

  v_nk := encode(extensions.digest(
            v_root::text || 'approved' || v_qty::text || v_actor || btrim(p_reason),
            'sha256'), 'hex');
  select id into v_id from public.requirement_quantity_decision
    where tenant_id = v_tenant and natural_key = v_nk;
  if v_id is not null then
    -- Replay: the act already happened. Report the revision it produced rather
    -- than a bare acknowledgement, so a retrying caller still learns the
    -- authoritative Requirement.
    select o.id into v_rev from public.obligation o
      where o.tenant_id = v_tenant
        and o.anchors @> jsonb_build_array(jsonb_build_object('truth','quantity_approval','ref',v_id))
      limit 1;
    return jsonb_build_object('decision_id', v_id, 'created', false, 'kind', 'approved',
                              'requirement_line', v_root, 'approved_quantity', v_qty,
                              'requirement_revision', v_rev);
  end if;

  insert into public.requirement_quantity_decision
      (tenant_id, requirement_ref, decision_kind, quantity, quantity_basis, design_quantity,
       guest_count, resolved, derivation, decided_by, reason, effective_basis,
       supersedes_ref, natural_key)
    values (v_tenant, v_root, 'approved', v_qty,
            v_prior.quantity_basis, v_prior.design_quantity, v_prior.guest_count, true,
            'approved ' || v_qty::text ||
              case when p_quantity is not null and p_quantity is distinct from v_prior.quantity
                   then ' (approver-supplied)' else ' (standing decision)' end,
            v_actor, btrim(p_reason),
            coalesce(v_prior.effective_basis,'{}'::jsonb)
              || jsonb_build_object('approved_revision', v_head),
            v_prior.id, v_nk)
    returning id into v_id;

  -- ── the same act, continued: the quantified Requirement revision ──────────
  -- The outcome text carries the approved figure so the Requirement reads as
  -- what it now is. Any previously appended approval clause is stripped first,
  -- so a line approved three times reads with one quantity, not three.
  v_qtxt := public.kitchen_quantity_text(v_qty);
  v_base := regexp_replace(v_h.required_outcome, ' — approved quantity [^—]*$', '');
  v_rev_outcome := v_base || ' — approved quantity ' || v_qtxt;

  -- Identity derives from the revision being superseded plus the approved
  -- figure, so replay of the same approval resolves to the same revision and
  -- cannot fork the line.
  v_rev_nk := encode(extensions.digest(
                v_h.natural_key || '@approved:' || v_qty::text, 'sha256'), 'hex');

  insert into public.obligation
      (tenant_id, event_ref, scope, origin_ref, origin_kind, origin_revision,
       kind, department, required_outcome, resource_role, dependencies, timing,
       natural_key, supersedes_ref, anchors)
    values (v_tenant, v_h.event_ref, v_h.scope, v_h.origin_ref, v_h.origin_kind,
            v_h.origin_revision, v_h.kind, v_h.department, v_rev_outcome,
            v_h.resource_role, coalesce(v_h.dependencies,'[]'::jsonb), v_h.timing,
            v_rev_nk, v_head,
            -- Provenance travels with the Requirement: the approval act, the
            -- figure, the committed design operand, and the guest count the
            -- derivation stood on. A later reader never has to reconstruct the
            -- basis from decisions that may since have been superseded.
            coalesce(v_h.anchors,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
              'truth','quantity_approval',
              'ref', v_id,
              'quantity', v_qty,
              'quantity_basis', v_prior.quantity_basis,
              'design_quantity', v_prior.design_quantity,
              'guest_count', v_prior.guest_count,
              'derivation', v_prior.derivation,
              'approved_by', v_actor,
              'approved_at', now(),
              'supersedes', v_head)))
    on conflict (tenant_id, natural_key) do nothing
    returning id into v_rev;

  if v_rev is null then
    select o.id into v_rev from public.obligation o
      where o.tenant_id = v_tenant and o.natural_key = v_rev_nk;
  end if;
  if v_rev is null then
    raise exception 'KITCHEN_APPROVE_REVISION_FAILED: the approved quantity did not become a Requirement revision';
  end if;

  return jsonb_build_object('decision_id', v_id, 'created', true, 'kind', 'approved',
                            'approved_quantity', v_qty,
                            'requirement_line', v_root,
                            'requirement_revision', v_rev,
                            'supersedes_requirement', v_head,
                            'supersedes', v_prior.id);
end $$;

-- ── 6 · current state · derived, never stored ───────────────────────────────
-- Staleness is a comparison, not a flag. The approval record is never edited to
-- say it went stale — it remains historically true that this quantity was
-- approved under these operands at that moment. What changes is the answer to a
-- different question: do the operands still hold? This is the same
-- history-versus-current-truth doctrine the rest of EventCore uses.
create or replace function public.kitchen_quantity_state(p_requirement uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_appr record; v_rec record; v_adj record; v_stale boolean := false; v_why text;
  v_root uuid; v_head uuid;
begin
  -- Any revision of the line answers for the whole line.
  v_root := public.requirement_lineage_root(p_requirement);
  if v_root is null then return null; end if;
  v_head := public.requirement_lineage_head(v_root);

  select * into v_appr from public.requirement_quantity_decision
    where tenant_id = v_tenant and requirement_ref = v_root and decision_kind = 'approved'
    order by seq desc limit 1;
  select * into v_rec from public.requirement_quantity_decision
    where tenant_id = v_tenant and requirement_ref = v_root and decision_kind = 'recommended'
    order by seq desc limit 1;
  select * into v_adj from public.requirement_quantity_decision
    where tenant_id = v_tenant and requirement_ref = v_root and decision_kind = 'adjusted'
    order by seq desc limit 1;

  if v_appr.id is not null and v_rec.id is not null then
    if v_rec.seq > v_appr.seq
       and (v_rec.guest_count is distinct from v_appr.guest_count
            or v_rec.design_quantity is distinct from v_appr.design_quantity
            or v_rec.quantity_basis is distinct from v_appr.quantity_basis) then
      v_stale := true;
      v_why := 'the guest or design basis changed after this quantity was approved';
    end if;
  end if;

  return jsonb_build_object(
    'requirement_ref', p_requirement,
    -- The stable name of the line, and the revision that is currently
    -- authoritative. After an approval these differ, and that difference is the
    -- visible fact that a Requirement revision was created.
    'requirement_line', v_root,
    'requirement_revision', v_head,
    'adjusted_quantity', v_adj.quantity,
    'adjusted_by', v_adj.decided_by,
    'adjusted_reason', v_adj.reason,
    'has_approved_quantity', v_appr.id is not null,
    'approved_quantity', v_appr.quantity,
    'approved_by', v_appr.decided_by,
    'approved_at', v_appr.recorded_at,
    'approval_reason', v_appr.reason,
    'recommended_quantity', v_rec.quantity,
    'recommendation_resolved', coalesce(v_rec.resolved, false),
    'unresolved_reason', v_rec.unresolved_reason,
    'derivation', v_rec.derivation,
    'guest_count', v_rec.guest_count,
    'review_required', v_stale,
    'review_reason', v_why,
    -- What later Ingredient Coverage / Sourcing may consume. Deliberately null
    -- until an approval exists: a recommendation never reaches downstream.
    'fulfillable_quantity', v_appr.quantity);
end $$;

-- ── the deployed marker ─────────────────────────────────────────────────────
create function public.v311_kitchen_quantity_decisions() returns text
language sql immutable as $$ select 'v311 · Kitchen Quantities stage — recommendation, adjustment and approval as append-only decisions; approval alone is fulfillable'::text $$;

commit;
