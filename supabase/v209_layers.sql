-- ═══════════════════════════════════════════════════════════════════════════
-- v209 — LAYER AUTHORING THROUGH THE ONE PATH (IMPLEMENTATION-004 v209)
-- author_definition_revision() recreated with the SAME signature (READINESS
-- F-2's guarantee): p_layers activates. Each layer entry supersedes its own
-- live revision with its own race check; artifacts land as
-- kind='layer_revision' rows (F-1); an act may be layer-only (p_data null),
-- and NO_ARTIFACTS now means "neither config nor layers".
-- review_session_key already exists on the acts table (v207) — sessions are
-- provenance annotations, never transactions.
-- Idempotent; runs after v207.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.author_definition_revision(
  p_definition uuid,
  p_expected_live_revision uuid,
  p_data jsonb,
  p_schema_version int,
  p_origin text,
  p_note text,
  p_citations jsonb default null,
  p_layers jsonb default null,      -- [{layer_key, expected_live, schema_version, data}]
  p_session_key text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
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
