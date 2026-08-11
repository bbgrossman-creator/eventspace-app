-- ═══════════════════════════════════════════════════════════════════════════
-- v257 — CONDITIONS (PUBLICATION_BLUEPRINTS constitution, BP-7)
--
-- The v253 reservation on conditions retires: the complete authoring → validation →
-- evaluation → provenance → atomicity path is now present. This file
-- EXTENDS BP-3's transaction (create or replace of the SAME function —
-- no second instantiation path): the sequence inside the one act is now
--   1 validate all required parameter answers (typed, per key);
--   2 validate every condition against the exact published revision;
--   3 evaluate every condition deterministically;
--   4 produce the complete branch map;
--   5 stage ALL conflicts;
--   6 only then materialize;
--   7 freeze the result and record the branch map in the citation.
--
-- ONE-TIME RESOLUTION: excluded branches never materialize; included
-- branches become ordinary independent Design content; NO executable
-- condition survives into Design tables (server-proven); later Design
-- edits re-evaluate nothing (no machinery exists); later Blueprint
-- condition changes change nothing in existing Designs (proven).
--
-- The predicate vocabulary, admission matrix, normalization, and failure
-- names MIRROR src/lib/blueprintConditions.ts verbatim (unit-pinned).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── the closed evaluator ──
create or replace function public.blueprint_condition_eval(p_cond jsonb, p_answers jsonb)
returns boolean language plpgsql immutable as $$
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

create or replace function public.blueprint_condition_size(p_cond jsonb)
returns int language plpgsql immutable as $$
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

-- ── the closed validator: named failures, mirrored from the client law ──
create or replace function public.blueprint_condition_problems(
  p_cond jsonb, p_params jsonb, p_depth int default 1
) returns text[] language plpgsql immutable as $$
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

-- ── THE ACT, EXTENDED (same name, same transaction — no second path) ──
create or replace function public.instantiate_blueprint(
  p_revision uuid,
  p_booking  uuid,
  p_guest_count int,
  p_actor    uuid default null,
  p_answers  jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
end $$;
