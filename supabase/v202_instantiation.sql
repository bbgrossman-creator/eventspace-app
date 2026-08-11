-- ═══════════════════════════════════════════════════════════════════════════
-- v202 — INSTANTIATION & THE ITEMS BOUNDARY (SPEC-002 UI slice, server tier)
-- Implements SPEC-002 §1.4 (instantiation, one transaction) and completes the
-- items boundary of §1.2's atomicity invariant: item mutations persist inside
-- the same transaction as their moves.
--
-- Both functions SECURITY INVOKER: RLS applies through the caller.
-- Additive-only. Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. INSTANTIATION — the only operation that copies definition knowledge
--       into live work (SPEC-001 §1.6 invariant 3). One transaction:
--       component row · seed items · layer deep-copies · config copy · stamps.
--       NO configuration move is recorded — a baseline is not a divergence
--       from itself (SPEC-002 Rev B change 5).
create or replace function public.instantiate_component(
  p_definition uuid,
  p_booking uuid,
  p_version uuid,
  p_domain text default 'food',
  p_position int default 0
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inst uuid := gen_random_uuid();     -- the instantiation_id (KA §7 group)
  v_comp uuid;
  v_name text;
  v_cfg  record;                        -- live definition-config revision
  v_item jsonb;
begin
  select name into v_name from public.component_definitions where id = p_definition;
  if v_name is null then
    raise exception 'INSTANTIATE: definition % not visible', p_definition;
  end if;

  insert into public.event_components
      (booking_id, proposal_version_id, title, domain, position, definition_id, instantiation_id)
    values (p_booking, p_version, v_name, p_domain, p_position, p_definition, v_inst)
    returning id into v_comp;

  -- the seed: current live definition-config revision (if any)
  select id, schema_version, data into v_cfg
    from public.component_definition_config
   where definition_id = p_definition and superseded_by is null and archived_at is null;

  if v_cfg.id is not null then
    -- seed items from default selections
    for v_item in select * from jsonb_array_elements(coalesce(v_cfg.data->'defaultItems','[]'::jsonb)) loop
      insert into public.component_items
          (component_id, name, quantity_basis, unit_price, position, instantiation_id)
        values (v_comp, v_item->>'name', v_item->>'quantity_basis',
                (v_item->>'unit_price')::numeric,
                coalesce((v_item->>'position')::int, 0), v_inst);
    end loop;
    -- instance config = a COPY of the seed, stamped with the exact revision
    insert into public.event_component_config
        (component_id, schema_version, data, seed_config_revision)
      values (v_comp, v_cfg.schema_version,
              coalesce(v_cfg.data->'instanceDefaults', '{"schemeId":null,"customized":[],"scalars":{},"choices":{},"display":{},"substitutions":{}}'::jsonb),
              v_cfg.id);
  else
    insert into public.event_component_config (component_id, schema_version, data)
      values (v_comp, 1, '{"schemeId":null,"customized":[],"scalars":{},"choices":{},"display":{},"substitutions":{}}'::jsonb);
  end if;

  -- deep-copy definition layers → instance layers, copied_from = exact revision
  insert into public.component_instance_layers
      (component_id, layer_key, schema_version, data, copied_from)
    select v_comp, l.layer_key, l.schema_version, l.data, l.id
      from public.component_layers l
     where l.definition_id = p_definition
       and l.superseded_by is null and l.archived_at is null;

  return jsonb_build_object('component_id', v_comp, 'instantiation_id', v_inst);
end $$;

-- ── 2. apply_move_batch gains the items boundary. Recreated with an added
--       defaulted parameter (v201's callers are the app's own — none deployed
--       ahead of this file). Same body plus item ops, same atomicity.
drop function if exists public.apply_move_batch(uuid, timestamptz, jsonb, int, jsonb, jsonb, jsonb, jsonb, jsonb);
create or replace function public.apply_move_batch(
  p_component uuid,
  p_expected_updated_at timestamptz,
  p_config jsonb,
  p_config_schema_version int,
  p_derived jsonb,
  p_suppress jsonb,
  p_restore jsonb,
  p_manual_add jsonb,
  p_moves jsonb,
  p_items jsonb default null            -- [{op:add|remove|update, ...}]
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_ids uuid[] := '{}';
  v_move jsonb; v_id uuid; v_parent uuid; v_it jsonb; n int;
begin
  if p_config is not null then
    update public.event_component_config
       set data = p_config, schema_version = p_config_schema_version, updated_at = v_now
     where component_id = p_component
       and (p_expected_updated_at is null or updated_at = p_expected_updated_at);
    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'CONFIG_CONFLICT: configuration changed since the batch was planned';
    end if;
  end if;

  -- items boundary: routed through the same transaction as everything else
  for v_it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    if v_it->>'op' = 'add_item' then
      insert into public.component_items (component_id, name, category_key, unit_price, quantity_basis, position)
        values (p_component, v_it->>'name', v_it->>'category_key',
                (v_it->>'unit_price')::numeric, v_it->>'quantity_basis',
                coalesce((v_it->>'position')::int, 0));
    elsif v_it->>'op' = 'remove_item' then
      delete from public.component_items
       where id = (v_it->>'item_id')::uuid and component_id = p_component;
    elsif v_it->>'op' = 'update_item' then
      update public.component_items
         set name = coalesce(v_it->>'name', name),
             unit_price = coalesce((v_it->>'unit_price')::numeric, unit_price)
       where id = (v_it->>'item_id')::uuid and component_id = p_component;
    else
      raise exception 'ITEMS: unknown op %', v_it->>'op';
    end if;
  end loop;

  if p_derived is not null then
    delete from public.component_requirements r
     where r.component_id = p_component and r.derived
       and r.suppressed_at is null
       and not exists (select 1 from jsonb_array_elements(p_derived) d
                       where d->>'layer_key' = r.layer_key and d->>'logical_key' = r.logical_key);
    insert into public.component_requirements (component_id, layer_key, logical_key, derived, name, category, notes)
      select p_component, d->>'layer_key', d->>'logical_key', true, d->>'name', d->>'category', d->>'notes'
      from jsonb_array_elements(p_derived) d
      on conflict (component_id, layer_key, logical_key) where logical_key is not null
      do update set name = excluded.name, category = excluded.category, notes = excluded.notes;
  end if;

  update public.component_requirements set suppressed_at = v_now
   where component_id = p_component and suppressed_at is null
     and (layer_key, logical_key) in
         (select s->>'layer_key', s->>'logical_key' from jsonb_array_elements(coalesce(p_suppress,'[]'::jsonb)) s);

  update public.component_requirements set suppressed_at = null
   where component_id = p_component and suppressed_at is not null
     and (layer_key, logical_key) in
         (select s->>'layer_key', s->>'logical_key' from jsonb_array_elements(coalesce(p_restore,'[]'::jsonb)) s);

  insert into public.component_requirements (component_id, layer_key, derived, name, category, notes)
    select p_component, m->>'layer_key', false, m->>'name', m->>'category', m->>'notes'
    from jsonb_array_elements(coalesce(p_manual_add,'[]'::jsonb)) m;

  for v_move in select * from jsonb_array_elements(coalesce(p_moves,'[]'::jsonb)) loop
    v_parent := case when (v_move->>'parent_ix') is not null
                     then v_ids[(v_move->>'parent_ix')::int + 1] end;
    insert into public.configuration_moves (component_id, kind, payload, before, origin, parent_move_id, cause, actor)
      values (p_component, v_move->>'kind', v_move->'payload', v_move->'before',
              v_move->>'origin', v_parent, v_move->>'cause', auth.uid())
      returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  return jsonb_build_object('applied', coalesce(jsonb_array_length(p_moves),0), 'at', v_now);
end $$;

-- ── V3 VERIFY (harness): ──
-- V3-1 instantiation is atomic; component + items + layers + config share one
--      instantiation_id / copied_from stamps; NO configuration move recorded
-- V3-2 an item op inside a failing batch persists nothing (items boundary
--      joins the atomicity invariant)
-- V3-3 cross-tenant instantiate refused (definition invisible → exception)
