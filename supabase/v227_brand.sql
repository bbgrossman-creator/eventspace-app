-- v227 — BRAND STUDIO (docs/PUBLICATION.md §8).
-- The Company Brand rung + named themes get real storage:
--   · brand delta + default theme  → app_settings (key/value, tenant-scoped,
--     RLS-covered since v189 — the same store business_type and tax use):
--       'publication.brand'          = ThemeDelta as JSON text
--       'publication.default_theme'  = a theme key ('classic', or a
--                                      publication_themes id)
--   · named themes                 → publication_themes (new table), following
--     the v182 blueprint tenancy pattern.
create table if not exists publication_themes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  delta jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

do $$
declare bb uuid;
begin
  select id into bb from tenants where slug = 'burger-bar';
  if bb is not null then
    execute 'alter table publication_themes add column if not exists tenant_id uuid references tenants(id)';
    execute format('update publication_themes set tenant_id = %L where tenant_id is null', bb);
    execute format('alter table publication_themes alter column tenant_id set default %L', bb);
  end if;
end $$;
