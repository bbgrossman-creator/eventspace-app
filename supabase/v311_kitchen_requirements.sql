-- ============================================================================
-- v311 · BOOKED EVENT → OPERATIONAL REQUIREMENTS (Kitchen proving slice)
-- File: supabase/v311_kitchen_requirements.sql            min_release v310.1
--
-- Kitchen has received an enacted obligation since v275. It has never carried a
-- quantity. This release closes that gap for FORWARD commitments and gives both
-- preview and enactment one derivation to share.
--
-- ── THE DEBT THIS PAYS ──────────────────────────────────────────────────────
-- v275_ceremonies.sql emits Kitchen work as kind='culinary_prepare',
-- department='culinary', with required_outcome literally reading
--   'unresolved: produce <title> menu component (recipe/yields not modeled …)'
-- and a source comment naming the debt: "recipe/yields not modeled in v275".
-- v286 built the responsibility machinery but its three derivers produce event,
-- knowledge and attestation truth; none of them resolved the culinary quantity.
--
-- The reason was structural, not an oversight. Event Design DOES carry the rule
-- — public.component_items.quantity and .quantity_basis — but the frozen
-- snapshot builders serialize each item as {name, unit_price, price_confirmed}
-- only. generate_obligations reads the frozen model, so at enactment the rule
-- was unreachable. The design knew the answer; commitment discarded it.
--
-- ── WHAT CHANGES, AND WHY IT IS FORWARD-ONLY BY CONSTRUCTION ────────────────
-- embed_operational_basis(version, model) is v284's existing publish-time
-- enrichment hook: publish stages a model, this function enriches it, and the
-- result is what gets frozen. v311 replaces that function so it ALSO freezes
-- each item's quantity and quantity_basis.
--
-- Because it runs only at publish, only snapshots created after this release
-- carry the quantitative rule. No historical snapshot is rewritten and no
-- frozen migration is edited — v253, v257 and v284 are untouched on disk.
-- Historical snapshots stay lawful and quantitatively unresolved, which is the
-- honest state: their commitment genuinely did not record a quantity.
--
-- ── QUANTITY SEMANTICS (Architect-ratified) ─────────────────────────────────
--   per_person + explicit quantity → quantity × operative attendance
--   flat        + explicit quantity → quantity, attendance does not scale it
--   anything else                  → UNRESOLVED, with a machine-readable reason
--
-- Nothing is ever inferred. A per_person item with a null quantity does NOT
-- mean one per person; it means the rule is incomplete. Substituting attendance
-- for a missing multiplier, or defaulting it to 1, would manufacture
-- operational truth the commitment never stated. Repository evidence supports
-- refusing to guess: v205's legacy import coalesces a null basis to
-- 'per_person' while VersionPricing.tsx displays a null basis as 'flat'. Those
-- two disagree, which is precisely why null must resolve to nothing at all.
--
-- ── REQUIREMENT EXISTS EVEN WHEN QUANTITY DOES NOT ──────────────────────────
-- An unresolved quantity never erases the Kitchen Requirement. That Kitchen
-- owes work, and how much work it owes, are separate facts. The derivation
-- always returns the component; `resolved` reports whether a quantity could be
-- lawfully derived, and `unresolved_reason` says why not.
--
-- ── BOUNDARY ────────────────────────────────────────────────────────────────
-- DATABASE-ONLY. No table is created, dropped or altered; no trigger, policy,
-- grant or index is touched. No second Requirement universe: public.obligation
-- remains the persisted object (C-04 preserved). No new provenance subsystem.
-- Derivation is pure and writes nothing — enactment is a separate act, and the
-- preview path cannot reach it. EventCore only; Booking CRM is not contacted
-- (Shared Cross-Product Ledger v2, X-013).
-- ============================================================================

begin;

-- ── 1 · freeze the committed quantitative rule at publish ───────────────────
-- Replaces v284's hook. The operational-basis enrichment it already performed
-- is preserved exactly: same pinned-component condition, same two keys, same
-- guest-count context. The addition is `items_committed`, written for EVERY
-- component rather than only pinned ones, because the quantity rule is item
-- truth and does not depend on a profile being pinned.
--
-- Values are frozen verbatim from Event Design. A null quantity stays null and
-- a null basis stays null — serialization never invents a default, since a
-- default written here would be indistinguishable later from a rule the
-- customer actually agreed to.
create or replace function public.embed_operational_basis(p_version uuid, p_model jsonb)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  comps jsonb := '[]'::jsonb;
  c jsonb;
  ec record;
  basis jsonb;
  ctx jsonb;
  v_comp_id uuid;
  v_items jsonb;
begin
  ctx := case when p_model->>'guestCount' ~ '^[0-9]+$'
              then jsonb_build_object('guest_count',(p_model->>'guestCount')::numeric)
              else '{}'::jsonb end;

  for c in select * from jsonb_array_elements(coalesce(p_model->'components','[]'::jsonb)) loop
    -- v284 behaviour, unchanged.
    select * into ec from public.event_components
      where tenant_id = v_tenant and id::text = c->>'componentId'
        and proposal_version_id = p_version and profile_revision_id is not null;
    if found then
      basis := public.component_operational_basis(ec.id, ctx);
      c := c || jsonb_build_object('operational_basis', basis,
                                   'requirements', public.render_legacy_requirements(basis));
    end if;

    -- v311 · freeze the quantitative rule for every component that resolves to
    -- a real design component, pinned or not. Keyed on componentId, the same
    -- identity v284 uses, falling back to 'id' for models built by the
    -- blueprint baseline serializers which name it that way.
    v_comp_id := nullif(coalesce(c->>'componentId', c->>'id'), '')::uuid;
    if v_comp_id is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
               'item_id', ci.id,
               'name', ci.name,
               'quantity', ci.quantity,
               'quantity_basis', ci.quantity_basis,
               'selected', ci.selected,
               'item_role', ci.item_role) order by ci.position), '[]'::jsonb)
        into v_items
        from public.component_items ci
       where ci.component_id = v_comp_id;
      if v_items is not null and jsonb_array_length(v_items) > 0 then
        c := c || jsonb_build_object('items_committed', v_items);
      end if;
    end if;

    comps := comps || c;
  end loop;

  return jsonb_set(p_model, '{components}', comps);
end $$;

-- ── 2 · the one shared Kitchen derivation ───────────────────────────────────
-- Preview and enactment both call this and can therefore never disagree; only
-- the write is gated. It takes a SNAPSHOT, not an Event: no event row exists
-- until release_event, so a derivation keyed on the event could not run before
-- commitment and preview would be impossible.
--
-- p_attendance is the operative attendee count. It is passed in rather than
-- resolved here so that the caller decides what is lawful at its own stage:
-- enactment resolves it from the occurrence's attendance commitment as of a
-- moment, while preview may legitimately have none. NULL is honest input and
-- yields UNRESOLVED for per_person, never a guess.
create or replace function public.kitchen_quantity_derive(
  p_snapshot uuid, p_attendance numeric default null)
returns table (
  component_id uuid, component_title text,
  item_id uuid, item_name text,
  quantity_basis text, design_quantity numeric,
  attendance_used numeric, required_quantity numeric,
  resolved boolean, unresolved_reason text)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_model jsonb;
  c jsonb; it jsonb;
  v_basis text; v_qty numeric;
begin
  select s.model into v_model
    from public.offer_snapshots s
   where s.id = p_snapshot and s.tenant_id = v_tenant;
  if v_model is null then
    raise exception 'KITCHEN_DERIVE_NO_SNAPSHOT';
  end if;

  for c in select * from jsonb_array_elements(coalesce(v_model->'components','[]'::jsonb)) loop
    -- Backward compatibility (§17): a snapshot frozen before v311 carries no
    -- items_committed key. That is not an error — it is a commitment that did
    -- not record a quantity — so the component is still reported, once, as
    -- unresolved rather than skipped or raised on.
    if not (c ? 'items_committed') then
      component_id      := nullif(coalesce(c->>'componentId', c->>'id'), '')::uuid;
      component_title   := coalesce(c->>'title', 'Component');
      item_id           := null;
      item_name         := null;
      quantity_basis    := null;
      design_quantity   := null;
      attendance_used   := null;
      required_quantity := null;
      resolved          := false;
      unresolved_reason := 'committed design predates quantity capture';
      return next;
      continue;
    end if;

    for it in select * from jsonb_array_elements(coalesce(c->'items_committed','[]'::jsonb)) loop
      if coalesce((it->>'selected')::boolean, true) is not true then continue; end if;

      component_id    := nullif(coalesce(c->>'componentId', c->>'id'), '')::uuid;
      component_title := coalesce(c->>'title', 'Component');
      item_id         := nullif(it->>'item_id','')::uuid;
      item_name       := it->>'name';
      v_basis         := nullif(it->>'quantity_basis','');
      v_qty           := nullif(it->>'quantity','')::numeric;
      quantity_basis  := v_basis;
      design_quantity := v_qty;
      attendance_used := null;
      required_quantity := null;
      resolved        := false;
      unresolved_reason := null;

      if v_basis is null then
        unresolved_reason := 'committed design states no quantity basis';
      elsif v_qty is null then
        -- Ratified: per_person with a null quantity is an incomplete rule, not
        -- one per person.
        unresolved_reason := 'committed design states basis ' || v_basis || ' but no quantity';
      elsif v_basis = 'flat' then
        required_quantity := v_qty;
        resolved := true;
      elsif v_basis = 'per_person' then
        if p_attendance is null then
          unresolved_reason := 'per_person rule requires an operative attendance basis; none is available';
        else
          attendance_used   := p_attendance;
          required_quantity := v_qty * p_attendance;
          resolved := true;
        end if;
      else
        unresolved_reason := 'unrecognized quantity basis ' || v_basis;
      end if;

      return next;
    end loop;
  end loop;
end $$;

-- ── 3 · preview · read-only, pre-enactment ──────────────────────────────────
-- Keyed on the snapshot precisely because preview must work before any Event
-- exists. It writes nothing and cannot: it only reads the derivation above.
-- `operative` is false on every row, so a caller cannot mistake a preview for
-- enacted demand even if it ignores the wrapper.
create or replace function public.kitchen_requirement_preview(
  p_snapshot uuid, p_attendance numeric default null)
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'stage', 'preview',
    'operative', false,
    'note', 'Preview of Kitchen implications. Not operational demand; no obligation exists until the event is released.',
    'snapshot_ref', p_snapshot,
    'attendance_basis', p_attendance,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'component_ref', d.component_id, 'component', d.component_title,
        'item_ref', d.item_id, 'item', d.item_name,
        'quantity_basis', d.quantity_basis, 'design_quantity', d.design_quantity,
        'attendance_used', d.attendance_used, 'required_quantity', d.required_quantity,
        'resolved', d.resolved, 'unresolved_reason', d.unresolved_reason))
      from public.kitchen_quantity_derive(p_snapshot, p_attendance) d), '[]'::jsonb));
$$;

-- ── the deployed marker ─────────────────────────────────────────────────────
-- NO GRANT. New functions inherit the schema default, matching v306 through
-- v310.1; the replaced function keeps the grants v284 gave it.
create function public.v311_kitchen_requirements() returns text
language sql immutable as $$ select 'v311 · committed design freezes its quantity rule; one shared Kitchen derivation serves preview and enactment'::text $$;

commit;
