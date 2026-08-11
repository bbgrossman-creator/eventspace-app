-- ═══════════════════════════════════════════════════════════════════════════
-- v182 — Blueprints (by promotion, never authorship)
--
-- A blueprint is a NAMED POINTER to a real proposal version — "a proven way
-- to do that kind of event" (doctrine Q2). Nobody authors blueprint content;
-- someone builds a great proposal and promotes it ("Save as Blueprint").
-- Style ("Elegant", "Backyard") is just the name. No third abstraction.
--
-- source_label freezes the human provenance ("Cohen Wedding v3 · Oct 2025")
-- so the story survives even if the source booking is ever deleted
-- (source_version_id nulls; the blueprint then reads as historical/empty and
-- can be retired — referenced reality, honestly degraded, never faked).
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists blueprints (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_type text,
  source_version_id uuid references proposal_versions(id) on delete set null,
  source_label text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

do $$
declare bb uuid;
begin
  select id into bb from tenants where slug = 'burger-bar';
  if bb is not null then
    execute 'alter table blueprints add column if not exists tenant_id uuid references tenants(id)';
    execute format('update blueprints set tenant_id = %L where tenant_id is null', bb);
    execute format('alter table blueprints alter column tenant_id set default %L', bb);
  end if;
end $$;

alter table blueprints disable row level security;
