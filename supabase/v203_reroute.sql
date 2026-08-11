-- ═══════════════════════════════════════════════════════════════════════════
-- v203 — CANVAS REROUTE, SERVER SIDE (SPEC-002 §1.3 completion)
-- apply_move_batch's add_item op gains the fields the live Studio sets
-- (price_confirmed, taxable, quantity_basis, position). Function recreated in
-- place — same signature, same atomicity, proven by the v202/v203 harnesses.
-- Idempotent; safe to run after v202.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.apply_move_batch(
  p_component uuid, p_expected_updated_at timestamptz, p_config jsonb,
  p_config_schema_version int, p_derived jsonb, p_suppress jsonb,
  p_restore jsonb, p_manual_add jsonb, p_moves jsonb, p_items jsonb default null
) returns jsonb
language plpgsql security invoker set search_path = ''
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
    if n = 0 then raise exception 'CONFIG_CONFLICT: configuration changed since the batch was planned'; end if;
  end if;

  for v_it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    if v_it->>'op' = 'add_item' then
      insert into public.component_items
          (component_id, name, category_key, unit_price, quantity_basis, position, price_confirmed, taxable)
        values (p_component, v_it->>'name', v_it->>'category_key',
                (v_it->>'unit_price')::numeric,
                coalesce(v_it->>'quantity_basis', 'per_person'),
                coalesce((v_it->>'position')::int, 0),
                coalesce((v_it->>'price_confirmed')::boolean, true),
                coalesce((v_it->>'taxable')::boolean, true));
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
     where r.component_id = p_component and r.derived and r.suppressed_at is null
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
    v_parent := case when (v_move->>'parent_ix') is not null then v_ids[(v_move->>'parent_ix')::int + 1] end;
    insert into public.configuration_moves (component_id, kind, payload, before, origin, parent_move_id, cause, actor)
      values (p_component, v_move->>'kind', v_move->'payload', v_move->'before',
              v_move->>'origin', v_parent, v_move->>'cause', auth.uid())
      returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;
  return jsonb_build_object('applied', coalesce(jsonb_array_length(p_moves),0), 'at', v_now);
end $$;
