-- ═══════════════════════════════════════════════════════════════════════════
-- v251 — THE SHELF (PUBLICATION_BLUEPRINTS constitution, BP-1)
--
-- Blueprint identity + immutable revisions + the lifecycle acts ledger.
-- Constitutional traceability:
--   §1/§2  stable identity over immutable revisions; supersede-and-chain
--   §3     draft/published/retired lifecycle; PUBLICATION REQUIRES INTENT —
--          the declaration wording is a CHECK constraint: the database
--          itself refuses undeclared organizational knowledge
--   §13    publish/retire/reinstate acts recorded with actor (the CURATE
--          ORGANIZATIONAL KNOWLEDGE gate rides the house licensing layer,
--          key "knowledge.curate"; intent is enforced HERE, mechanically)
--   §14    published revisions are never hard-deleted (no delete path
--          exists for non-draft rows); never-published drafts discard
--          freely; empty identities may be deleted
--   §15.9  accidental organizational knowledge is mechanically impossible
--
-- NAMING: the legacy v182 `blueprints` table (a named POINTER to a proposal
-- version — a proto-promotion, content read live) is a DIFFERENT OBJECT and
-- is untouched. The constitutional shelf lives in blueprint_identities /
-- blueprint_revisions. Reconciliation of the legacy pointers is reserved
-- for the BP-5 promotion slice, deliberately.
--
-- Additive-only. Idempotent. Append-only ledger by ABSENCE of update/delete
-- policies (the v207 discipline).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── the identity: stable; carries name, taxonomy, status — never content (§1/§2) ──
create table if not exists public.blueprint_identities (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  name                  text not null check (btrim(name) <> ''),
  taxonomy              text,
  status                text not null default 'active'
                          check (status in ('active','retired')),
  published_revision_id uuid,        -- THE designation: at most one, by construction
  created_at            timestamptz not null default now(),
  retired_at            timestamptz
);
create index if not exists idx_bpi_tenant on public.blueprint_identities (tenant_id);

-- ── the revision: immutable authored content under an identity (§2) ──
-- content is the authored payload; its CONSTITUTIONAL SHAPE (field-treatment
-- declarations, §6) lands in BP-2. The shelf holds it; immutability guards it.
create table if not exists public.blueprint_revisions (
  id                      uuid primary key default gen_random_uuid(),
  identity_id             uuid not null references public.blueprint_identities(id),
  revision_number         int  not null,
  state                   text not null default 'draft'
                            check (state in ('draft','published','superseded')),
  content                 jsonb not null default '{}'::jsonb,
  supersedes_revision_id  uuid references public.blueprint_revisions(id),
  seeded_from_revision_id uuid references public.blueprint_revisions(id),
  created_at              timestamptz not null default now(),
  published_at            timestamptz,
  published_by            uuid,
  unique (identity_id, revision_number)
);
create index if not exists idx_bpr_identity on public.blueprint_revisions (identity_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bpi_published_revision_fk') then
    alter table public.blueprint_identities
      add constraint bpi_published_revision_fk
      foreign key (published_revision_id) references public.blueprint_revisions(id);
  end if;
end $$;

-- ── IMMUTABILITY AT PUBLISH (§2, §3, invariant 2): once a revision leaves
--    draft, its authored material is frozen against EVERY path — the trigger
--    guards regardless of who writes. The only legal post-draft change is
--    the published → superseded flip the publish path performs. ──
create or replace function public.blueprint_revision_guard() returns trigger
language plpgsql as $$
begin
  if old.state <> 'draft' then
    if new.content                 is distinct from old.content
       or new.identity_id             is distinct from old.identity_id
       or new.revision_number         is distinct from old.revision_number
       or new.supersedes_revision_id  is distinct from old.supersedes_revision_id
       or new.seeded_from_revision_id is distinct from old.seeded_from_revision_id
       or new.published_at            is distinct from old.published_at
       or new.published_by            is distinct from old.published_by
       or new.created_at              is distinct from old.created_at
    then
      raise exception 'BLUEPRINT_REVISION_IMMUTABLE';
    end if;
    if new.state is distinct from old.state
       and not (old.state = 'published' and new.state = 'superseded') then
      raise exception 'BLUEPRINT_REVISION_IMMUTABLE';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_blueprint_revision_guard on public.blueprint_revisions;
create trigger trg_blueprint_revision_guard
  before update on public.blueprint_revisions
  for each row execute function public.blueprint_revision_guard();

-- ── the acts ledger (§3, §13): every publish/retire/reinstate is a recorded,
--    attributed act. THE INTENT LAW LIVES IN THE SCHEMA: a publish act
--    without the exact constitutional declaration cannot exist as a row. ──
create table if not exists public.blueprint_shelf_acts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  identity_id uuid not null references public.blueprint_identities(id),
  revision_id uuid references public.blueprint_revisions(id),
  act         text not null check (act in ('publish','retire','reinstate')),
  declaration text,
  actor       uuid,
  created_at  timestamptz not null default now(),
  constraint bsa_publish_requires_intent check (
    act <> 'publish'
    or declaration = 'This revision is now organizational knowledge.'
  )
);
create index if not exists idx_bsa_identity on public.blueprint_shelf_acts (identity_id);

-- ── THE PUBLISH ACT (§3): one transaction — intent verified, prior
--    designation superseded, chain recorded, designation moved, act logged. ──
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
  if v_rev.state <> 'draft' then raise exception 'ONLY_DRAFTS_PUBLISH'; end if;
  select * into v_ident from public.blueprint_identities where id = v_rev.identity_id for update;
  if v_ident.status <> 'active' then raise exception 'IDENTITY_RETIRED'; end if;

  v_prior := v_ident.published_revision_id;
  if v_prior is not null then
    update public.blueprint_revisions set state = 'superseded' where id = v_prior;
  end if;
  update public.blueprint_revisions
     set state = 'published',
         published_at = now(),
         published_by = p_actor,
         supersedes_revision_id = v_prior
   where id = p_revision;
  update public.blueprint_identities
     set published_revision_id = p_revision
   where id = v_ident.id;
  insert into public.blueprint_shelf_acts (tenant_id, identity_id, revision_id, act, declaration, actor)
    values (v_ident.tenant_id, v_ident.id, p_revision, 'publish', p_declaration, p_actor);
  return p_revision;
end $$;

-- ── RETIRE (§3): identity-level; instantiation stops, history stands.
--    The last published designation is RETAINED — reinstatement restores it. ──
create or replace function public.retire_blueprint_identity(
  p_identity uuid, p_actor uuid default null
) returns uuid language plpgsql security definer as $$
declare v_ident public.blueprint_identities%rowtype;
begin
  select * into v_ident from public.blueprint_identities where id = p_identity for update;
  if not found then raise exception 'IDENTITY_NOT_FOUND'; end if;
  if v_ident.status <> 'active' then raise exception 'ALREADY_RETIRED'; end if;
  update public.blueprint_identities
     set status = 'retired', retired_at = now() where id = p_identity;
  insert into public.blueprint_shelf_acts (tenant_id, identity_id, act, actor)
    values (v_ident.tenant_id, p_identity, 'retire', p_actor);
  return p_identity;
end $$;

-- ── REINSTATE (§3): deliberate restoration of the last published designation. ──
create or replace function public.reinstate_blueprint_identity(
  p_identity uuid, p_actor uuid default null
) returns uuid language plpgsql security definer as $$
declare v_ident public.blueprint_identities%rowtype;
begin
  select * into v_ident from public.blueprint_identities where id = p_identity for update;
  if not found then raise exception 'IDENTITY_NOT_FOUND'; end if;
  if v_ident.status <> 'retired' then raise exception 'NOT_RETIRED'; end if;
  update public.blueprint_identities
     set status = 'active', retired_at = null where id = p_identity;
  insert into public.blueprint_shelf_acts (tenant_id, identity_id, act, actor)
    values (v_ident.tenant_id, p_identity, 'reinstate', p_actor);
  return p_identity;
end $$;

-- ── RLS (§13, §14): tenant-isolated absolutely. Drafts edit and discard
--    freely; non-draft rows have NO update/delete path (immutable + never
--    hard-deleted because no path exists, not because a path is guarded).
--    Empty identities (nothing ever published) may be deleted (§14). ──
alter table public.blueprint_identities enable row level security;
alter table public.blueprint_revisions  enable row level security;
alter table public.blueprint_shelf_acts enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='blueprint_identities' and policyname='bpi_select') then
    create policy bpi_select on public.blueprint_identities for select
      using (tenant_id = public.current_tenant_id());
    create policy bpi_insert on public.blueprint_identities for insert
      with check (tenant_id = public.current_tenant_id());
    create policy bpi_update on public.blueprint_identities for update
      using (tenant_id = public.current_tenant_id());
    create policy bpi_delete_empty on public.blueprint_identities for delete
      using (tenant_id = public.current_tenant_id()
             and published_revision_id is null
             and not exists (select 1 from public.blueprint_revisions r
                              where r.identity_id = blueprint_identities.id
                                and r.state <> 'draft'));
  end if;
  if not exists (select 1 from pg_policies where tablename='blueprint_revisions' and policyname='bpr_select') then
    create policy bpr_select on public.blueprint_revisions for select
      using (exists (select 1 from public.blueprint_identities i
                      where i.id = identity_id and i.tenant_id = public.current_tenant_id()));
    create policy bpr_insert on public.blueprint_revisions for insert
      with check (exists (select 1 from public.blueprint_identities i
                           where i.id = identity_id and i.tenant_id = public.current_tenant_id()));
    create policy bpr_update_drafts on public.blueprint_revisions for update
      using (state = 'draft'
             and exists (select 1 from public.blueprint_identities i
                          where i.id = identity_id and i.tenant_id = public.current_tenant_id()));
    create policy bpr_delete_drafts on public.blueprint_revisions for delete
      using (state = 'draft'
             and exists (select 1 from public.blueprint_identities i
                          where i.id = identity_id and i.tenant_id = public.current_tenant_id()));
  end if;
  if not exists (select 1 from pg_policies where tablename='blueprint_shelf_acts' and policyname='bsa_select') then
    create policy bsa_select on public.blueprint_shelf_acts for select
      using (tenant_id = public.current_tenant_id());
    create policy bsa_insert on public.blueprint_shelf_acts for insert
      with check (tenant_id = public.current_tenant_id());
    -- NO update policy. NO delete policy. The ledger is append-only because
    -- there is no path.
  end if;
end $$;
