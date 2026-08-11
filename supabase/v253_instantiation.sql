-- ═══════════════════════════════════════════════════════════════════════════
-- v253 — INSTANTIATION (PUBLICATION_BLUEPRINTS constitution, BP-3)
--
-- ONE ACT: a PUBLISHED blueprint revision becomes ONE independent Event
-- Design (a proposal version with its sections, components, items, config,
-- presentation, and guest counts) under ONE coherent organizational
-- snapshot, in ONE transaction — all or nothing.
--
-- Constitutional traceability:
--   §4  independence, not inheritance: authored structure materializes
--       under fresh identities; the only artifact linking design to
--       blueprint is the PROVENANCE RECORD (append-only, a citation).
--       ◆ ONE COHERENT SNAPSHOT: the gather phase reads the revision and
--       ALL current definition-config revisions in single statements,
--       each row locked FOR SHARE so a concurrent definition publish or
--       blueprint supersession WAITS rather than tearing the read. The
--       provenance records exactly what was seen (definition_revisions
--       map + snapshot moment). ◆ NEVER-GUESS: every conflict is
--       collected in the CHECK phase and raised as one named, staged
--       list BEFORE any row of the design exists.
--   §10 guest count is the one seed parameter: required, typed, stamped;
--       never defaulted. Conditions refuse until BP-7.
--   §11 every arriving price is DEBT (price_confirmed=false,
--       package_price_confirmed=false) except the fixed-package decision,
--       which arrives confirmed WITH its stamped provenance {policy ·
--       revision · publisher · published_at} recorded in the act.
--   §5/v241 the portable stratum only, replacement semantics, match law:
--       dress roles must match exactly one created section; zero or
--       multiple matches are named conflicts.
--   §2 SPEC-002 per entry: instantiate_component() runs unchanged; the
--       definition provenance it stamps (seed_config_revision,
--       instantiation_id, copied_from) is untouched — DUAL provenance.
--   §4  FROZEN BASELINE: the complete materialized result (sections,
--       components with config and items, presentation, guests) is
--       serialized into the provenance record at creation — divergence
--       (BP-4) compares against what actually arrived, never against a
--       later blueprint or definition.
--
-- Failure discipline: any raise ROLLS BACK EVERYTHING — no partial
-- design, no partial components, no provenance residue (server-proven:
-- supabase/tests/v253_proof.sql, early/middle/late failures).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── the provenance record + frozen baseline: THE design-side citation.
--    Append-only by absence of update/delete policies. unique(version_id):
--    one design, one origin. ──
create table if not exists public.blueprint_instantiations (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null,
  blueprint_id         uuid not null references public.blueprint_identities(id),
  revision_id          uuid not null references public.blueprint_revisions(id),
  revision_number      int  not null,
  fingerprint          text not null,            -- md5 of canonical revision content
  booking_id           uuid not null,
  proposal_id          uuid not null,
  version_id           uuid not null unique,
  snapshot_at          timestamptz not null,     -- the organizational moment
  parameters           jsonb not null,           -- answers as given (guest_count)
  branches             jsonb not null default '[]'::jsonb,  -- BP-7's; empty and recorded
  definition_revisions jsonb not null,           -- {definition_id: config_revision_id|null} — what was seen
  fixed_price_decisions jsonb not null default '[]'::jsonb, -- [{entry_key, policy, amount, revision_id, published_by, published_at}]
  frozen_baseline      jsonb not null,           -- the complete materialized result
  actor                uuid,
  created_at           timestamptz not null default now()
);
create index if not exists idx_bpin_blueprint on public.blueprint_instantiations (blueprint_id);
alter table public.blueprint_instantiations enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='blueprint_instantiations' and policyname='bpin_select') then
    create policy bpin_select on public.blueprint_instantiations for select
      using (tenant_id = public.current_tenant_id());
    create policy bpin_insert on public.blueprint_instantiations for insert
      with check (tenant_id = public.current_tenant_id());
    -- NO update policy. NO delete policy. A citation never dangles and
    -- never mutates.
  end if;
end $$;

-- ── THE ACT ──
create or replace function public.instantiate_blueprint(
  p_revision uuid,
  p_booking  uuid,
  p_guest_count int,
  p_actor    uuid default null
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
end $$;

-- ═══ v251 ERRATUM (recorded in canon §6.27): the three shelf RPCs are
-- SECURITY DEFINER and verified state but not TENANCY — a caller knowing a
-- foreign revision id could publish across tenants. Re-issued here with the
-- guard; bodies otherwise identical to v251. ═══
create or replace function public.publish_blueprint_revision(
  p_revision uuid, p_declaration text, p_actor uuid default null
) returns uuid language plpgsql security definer as $$
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

create or replace function public.retire_blueprint_identity(
  p_identity uuid, p_actor uuid default null
) returns uuid language plpgsql security definer as $$
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

create or replace function public.reinstate_blueprint_identity(
  p_identity uuid, p_actor uuid default null
) returns uuid language plpgsql security definer as $$
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
