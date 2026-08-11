-- ═══════════════════════════════════════════════════════════════════════════
-- v207 — THE ONE WRITING PATH (SPEC-004 Rev B · IMPLEMENTATION-004 v207
--        · READINESS F-1/F-2 shape)
-- Executive Curation and Promotion share author_definition_revision() — one
-- function, one validation, one staging check, one ledger (INV-1). The
-- provenance differs; the writing path does not.
-- Additive-only. Idempotent. Append-only ledgers by ABSENCE of update/delete
-- policies.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── the ledger of deliberate acts ──
create table if not exists public.definition_revision_acts (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  definition_id      uuid not null references public.component_definitions(id),
  origin             text not null check (origin in ('promotion','executive_curation')),
  note               text not null check (btrim(note) <> ''),
  review_session_key text,
  actor              uuid,
  created_at         timestamptz not null default now()
);
create index if not exists idx_dra_definition on public.definition_revision_acts (definition_id);

-- ── one row per produced artifact (READINESS F-1: never columns, never jsonb) ──
create table if not exists public.act_produced_artifacts (
  id                  uuid primary key default gen_random_uuid(),
  act_id              uuid not null references public.definition_revision_acts(id),
  artifact_kind       text not null check (artifact_kind in ('config_revision','layer_revision')),
  revision_id         uuid not null,
  layer_key           text,
  superseded_revision uuid,
  created_at          timestamptz not null default now()
);
create index if not exists idx_apa_act on public.act_produced_artifacts (act_id);

-- ── per-line evidence, promotion only (dimension_key grammar: kind:identifier) ──
create table if not exists public.promotion_citations (
  id                uuid primary key default gen_random_uuid(),
  act_id            uuid not null references public.definition_revision_acts(id),
  component_id      uuid not null references public.event_components(id),
  dimension_key     text not null,
  from_value        jsonb,
  to_value          jsonb,
  baseline_kind     text not null,
  baseline_revision uuid,
  created_at        timestamptz not null default now()
);
create index if not exists idx_pc_act on public.promotion_citations (act_id);

-- ── RLS: SELECT + INSERT only. No update/delete policies exist — the ledger
--    is append-only because there is no path, not because a path is guarded. ──
alter table public.definition_revision_acts enable row level security;
alter table public.act_produced_artifacts enable row level security;
alter table public.promotion_citations enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='definition_revision_acts' and policyname='dra_select') then
    create policy dra_select on public.definition_revision_acts for select
      using (tenant_id = public.current_tenant_id());
    create policy dra_insert on public.definition_revision_acts for insert
      with check (tenant_id = public.current_tenant_id()
                  and exists (select 1 from public.component_definitions d
                              where d.id = definition_id and d.tenant_id = public.current_tenant_id()));
  end if;
  if not exists (select 1 from pg_policies where tablename='act_produced_artifacts' and policyname='apa_select') then
    create policy apa_select on public.act_produced_artifacts for select
      using (exists (select 1 from public.definition_revision_acts a
                     where a.id = act_id and a.tenant_id = public.current_tenant_id()));
    create policy apa_insert on public.act_produced_artifacts for insert
      with check (exists (select 1 from public.definition_revision_acts a
                          where a.id = act_id and a.tenant_id = public.current_tenant_id()));
  end if;
  if not exists (select 1 from pg_policies where tablename='promotion_citations' and policyname='pc_select') then
    create policy pc_select on public.promotion_citations for select
      using (exists (select 1 from public.definition_revision_acts a
                     where a.id = act_id and a.tenant_id = public.current_tenant_id()));
    create policy pc_insert on public.promotion_citations for insert
      with check (exists (select 1 from public.definition_revision_acts a
                          where a.id = act_id and a.tenant_id = public.current_tenant_id())
                  and exists (select 1 from public.event_components ec
                              where ec.id = component_id and ec.tenant_id = public.current_tenant_id()));
  end if;
end $$;

-- ── INV-1 made literal ──
create or replace function public.author_definition_revision(
  p_definition uuid,
  p_expected_live_revision uuid,
  p_data jsonb,                     -- nullable (READINESS F-2); v207 curation always sends it
  p_schema_version int,
  p_origin text,
  p_note text,
  p_citations jsonb default null,   -- REQUIRED ≥1 for promotion; FORBIDDEN for curation
  p_layers jsonb default null,      -- refused until v209 — signature never changes
  p_session_key text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_act uuid; v_rev uuid; v_cite jsonb; n int;
begin
  -- (1) the discriminator, validated per-kind (operating principle 10's
  --     enforcement point — impersonation is impossible on the one path)
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
  if p_layers is not null then
    raise exception 'LAYERS_NOT_YET_SUPPORTED: layer authoring arrives in v209';
  end if;
  if p_data is null then
    raise exception 'NO_ARTIFACTS: an act must produce at least one artifact';
  end if;
  if not exists (select 1 from public.component_definitions d
                 where d.id = p_definition and d.tenant_id = v_tenant) then
    raise exception 'DEFINITION_NOT_VISIBLE';
  end if;
  -- validate the staging premise BEFORE any write, so refusals carry their
  -- own names (idx_cdc_live remains the hard backstop underneath)
  if p_expected_live_revision is null
     and exists (select 1 from public.component_definition_config
                 where definition_id = p_definition
                   and superseded_by is null and archived_at is null) then
    raise exception 'EXPECTED_REQUIRED: a live revision exists; stage against it';
  end if;

  -- (2) the act, first — artifacts and citations hang from it
  insert into public.definition_revision_acts
      (tenant_id, definition_id, origin, note, review_session_key, actor)
    values (v_tenant, p_definition, p_origin, p_note, p_session_key, auth.uid())
    returning id into v_act;

  -- (3)+(4) supersede-then-insert, in that order, because idx_cdc_live
  --     rightly forbids two live revisions even for an instant. The new id is
  --     pre-generated; superseded_by's DEFERRABLE FK (v201) permits pointing
  --     at it before it exists within this transaction. The supersession
  --     UPDATE is itself the staging-race check: the expected revision must
  --     still be live to be superseded.
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

  -- (5) citations (promotion only; validated above)
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

  return jsonb_build_object('act_id', v_act, 'revision_id', v_rev);
end $$;
