-- ═══════════════════════════════════════════════════════════════════════════
-- v192 — COMPONENT IDENTITY (Object Model §4, option (c))
--
-- The composability keystone. "Sushi Station" becomes an object: one node per
-- (tenant, name) that instances tag. Knowledge stays on instances and still
-- copies as it does today; the identity gives the graph a node, "used 183×" a
-- real referent, and media/pairings/standards one place to attach.
--
-- Deliberately minimal — {id, tenant_id, name} — and shaped so (a)
-- ComponentDefinition can absorb it at Layer 2 (defaults become columns on
-- THIS table; instances already point here).
--
-- Full v189 obligations for a new tenant table:
--   tenant_id NOT NULL DEFAULT current_tenant_id() · 4 RLS policies ·
--   FORCE nothing (matches existing tables) · covered in future FK remaps.
--
-- Backfill: one identity per (tenant, trimmed lowercase title). Lineage chains
-- share titles (copies preserve them), so title-grouping covers lineage;
-- renamed copies get their own identity — acceptable under (c), refinable
-- under (a).
--
-- Auto-assign trigger: any event_components INSERT without identity_id gets
-- find-or-create by title, so all 87 existing app insert sites are covered
-- without modification. Copy paths still pass identity_id EXPLICITLY (a
-- renamed instance must keep its identity — knowledge travels; the trigger is
-- the safety net, not the mechanism).
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. The table ─────────────────────────────────────────────────────────────
create table if not exists public.component_identities (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default public.current_tenant_id()
             references public.tenants(id),
  name       text not null,
  created_at timestamptz not null default now(),
  constraint component_identities_name_nonempty check (btrim(name) <> '')
);

-- One identity per name per tenant (case/whitespace-insensitive).
create unique index if not exists idx_component_identities_tenant_name
  on public.component_identities (tenant_id, lower(btrim(name)));

-- ── 2. RLS (v189 pattern) ────────────────────────────────────────────────────
alter table public.component_identities enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'component_identities' and policyname = 'ci_select') then
    create policy ci_select on public.component_identities for select
      using (tenant_id = public.current_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'component_identities' and policyname = 'ci_insert') then
    create policy ci_insert on public.component_identities for insert
      with check (tenant_id = public.current_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'component_identities' and policyname = 'ci_update') then
    create policy ci_update on public.component_identities for update
      using (tenant_id = public.current_tenant_id())
      with check (tenant_id = public.current_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'component_identities' and policyname = 'ci_delete') then
    create policy ci_delete on public.component_identities for delete
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- ── 3. The pointer on instances ──────────────────────────────────────────────
alter table public.event_components
  add column if not exists identity_id uuid references public.component_identities(id);

create index if not exists idx_event_components_identity
  on public.event_components (identity_id);

-- ── 4. Backfill (runs once; guarded) ─────────────────────────────────────────
do $$
declare n int;
begin
  -- Create identities for every distinct (tenant, title) among components.
  insert into public.component_identities (tenant_id, name)
    select distinct on (ec.tenant_id, lower(btrim(ec.title)))
           ec.tenant_id, btrim(ec.title)
    from public.event_components ec
    where ec.title is not null and btrim(ec.title) <> ''
      and ec.tenant_id is not null
    on conflict (tenant_id, lower(btrim(name))) do nothing;

  -- Point every instance at its identity.
  update public.event_components ec
     set identity_id = ci.id
    from public.component_identities ci
   where ec.identity_id is null
     and ec.tenant_id = ci.tenant_id
     and lower(btrim(ec.title)) = lower(btrim(ci.name));

  -- Verify: no titled component left without an identity.
  select count(*) into n from public.event_components
   where identity_id is null and title is not null and btrim(title) <> ''
     and tenant_id is not null;
  if n <> 0 then
    raise exception 'v192 VERIFY: % titled component(s) missing identity_id', n;
  end if;
  raise notice 'v192: backfill complete';
end $$;

-- ── 5. Auto-assign trigger (safety net for inserts that omit identity_id) ────
create or replace function public.assign_component_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if new.identity_id is not null then return new; end if;
  if new.title is null or btrim(new.title) = '' then return new; end if;
  if new.tenant_id is null then return new; end if;  -- tenant default applies before us
  insert into public.component_identities (tenant_id, name)
    values (new.tenant_id, btrim(new.title))
    on conflict (tenant_id, lower(btrim(name))) do nothing;
  select id into v_id from public.component_identities
   where tenant_id = new.tenant_id
     and lower(btrim(name)) = lower(btrim(new.title));
  new.identity_id := v_id;
  return new;
end $$;

drop trigger if exists trg_ec_identity on public.event_components;
create trigger trg_ec_identity
  before insert on public.event_components
  for each row execute function public.assign_component_identity();
