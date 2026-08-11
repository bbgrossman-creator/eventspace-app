-- ═══════════════════════════════════════════════════════════════════════════
-- v258 — AUTHORING-TIME COMPOSITION (PUBLICATION_BLUEPRINTS, BP-8)
--
-- THE ACT: copy candidate content (already assembled and BP-2-validated
-- CLIENT-SIDE from an EXACT source revision) into a destination DRAFT,
-- under one transaction that:
--   1 locks + validates the exact source revision (FOR SHARE; fingerprint
--     cited — no floating "current", no identity-alone, no latest-at-render);
--   2 locks + validates the destination draft (FOR UPDATE; must be a
--     mutable draft of the caller's tenant — published/superseded refuse,
--     foreign tenant refuses);
--   3 writes the candidate content to the draft;
--   4 appends copy provenance LAST.
-- Any failure leaves the destination byte-identical and writes no
-- provenance (early/middle/late rollback proven).
--
-- COPY-ONLY: the destination draft gains ORDINARY authored content. No
-- blueprint-to-blueprint foreign key lands in content; the ONLY record of
-- the source is the provenance row, which no resolver, view, or
-- instantiation ever reads (negative pins proven server-side).
--
-- The candidate content is produced and validated by the pure client law
-- (blueprintCompose.ts + BP-2's validator); this function re-asserts the
-- structural guards a database must own regardless of caller (tenancy,
-- draft mutability, exact-source existence) and refuses barred keys via
-- the BP-5 walker as a second belt.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.blueprint_compositions (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null,
  source_identity_id     uuid not null,
  source_revision_id     uuid not null,
  source_fingerprint     text not null,
  dest_identity_id       uuid not null,
  dest_revision_id       uuid not null,
  actor                  uuid,
  created_at             timestamptz not null default now(),
  selected_regions       jsonb not null default '{}'::jsonb,
  collision_choices      jsonb not null default '{}'::jsonb,
  omissions              jsonb not null default '[]'::jsonb,
  transformations        jsonb not null default '[]'::jsonb
);
create index if not exists idx_bpc_dest on public.blueprint_compositions (dest_revision_id);
create index if not exists idx_bpc_source on public.blueprint_compositions (source_revision_id);

alter table public.blueprint_compositions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'bpc_select') then
    create policy bpc_select on public.blueprint_compositions
      for select using (tenant_id = public.current_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'bpc_insert') then
    create policy bpc_insert on public.blueprint_compositions
      for insert with check (tenant_id = public.current_tenant_id());
  end if;
end $$;
-- APPEND-ONLY BY ABSENCE: no update or delete policy exists — a copy record,
-- once written, is permanent historical evidence.

create or replace function public.compose_into_draft(
  p_source_revision uuid,
  p_dest_revision   uuid,
  p_content         jsonb,
  p_actor           uuid default null,
  p_selected        jsonb default '{}'::jsonb,
  p_collisions      jsonb default '{}'::jsonb,
  p_omissions       jsonb default '[]'::jsonb,
  p_transforms      jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_src     public.blueprint_revisions%rowtype;
  v_src_id  public.blueprint_identities%rowtype;
  v_dst     public.blueprint_revisions%rowtype;
  v_dst_id  public.blueprint_identities%rowtype;
  v_fp      text;
  v_bad     text[];
  v_comp    uuid;
begin
  -- ═══ 1 · lock + validate the EXACT source (FOR SHARE) ═══
  select r.* into v_src from public.blueprint_revisions r
    where r.id = p_source_revision for share;
  if not found then raise exception 'COMPOSE: source revision not found'; end if;
  select i.* into v_src_id from public.blueprint_identities i
    where i.id = v_src.identity_id for share;
  if v_src_id.tenant_id is distinct from v_tenant then
    raise exception 'COMPOSE: source revision not found';   -- foreign tenant: invisible
  end if;
  -- prefer published sources; a draft source is admitted but its EXACT state
  -- is locked and fingerprinted under this same transaction (no mutation race)
  v_fp := md5(v_src.content::text);

  -- ═══ 2 · lock + validate the DESTINATION DRAFT (FOR UPDATE) ═══
  select r.* into v_dst from public.blueprint_revisions r
    where r.id = p_dest_revision for update;
  if not found then raise exception 'COMPOSE: destination revision not found'; end if;
  select i.* into v_dst_id from public.blueprint_identities i
    where i.id = v_dst.identity_id for share;
  if v_dst_id.tenant_id is distinct from v_tenant then
    raise exception 'COMPOSE: destination revision not found';
  end if;
  if v_dst.state <> 'draft' then
    raise exception 'COMPOSE_DEST_NOT_DRAFT: only a mutable draft receives copied material';
  end if;

  -- §5 belt: barred material cannot enter authored content, even here
  v_bad := public.blueprint_barred_keys(coalesce(p_content, '{}'::jsonb));
  if array_length(v_bad, 1) is not null then
    raise exception 'COMPOSE_BARRED_CONTENT: %', array_to_json(v_bad)::text;
  end if;

  -- ═══ 3 · write the candidate content to the draft ═══
  -- (the immutability guard permits this precisely because state = 'draft')
  update public.blueprint_revisions set content = p_content where id = p_dest_revision;

  -- ═══ 4 · append copy provenance LAST (outside content, citation-only) ═══
  insert into public.blueprint_compositions
      (tenant_id, source_identity_id, source_revision_id, source_fingerprint,
       dest_identity_id, dest_revision_id, actor,
       selected_regions, collision_choices, omissions, transformations)
    values (v_tenant, v_src_id.id, v_src.id, v_fp,
            v_dst_id.id, v_dst.id, p_actor,
            coalesce(p_selected,'{}'::jsonb), coalesce(p_collisions,'{}'::jsonb),
            coalesce(p_omissions,'[]'::jsonb), coalesce(p_transforms,'[]'::jsonb))
    returning id into v_comp;

  return jsonb_build_object(
    'composition_id', v_comp, 'source_fingerprint', v_fp,
    'dest_revision_id', v_dst.id);
end $$;
