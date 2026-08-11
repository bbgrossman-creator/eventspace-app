-- v233 — PHOTOGRAPHY (docs/PUBLICATION.md §7): propose · choose · pin · render.
--   photo_library : the company's tagged imagery (tenancy per v182 pattern).
--                   Ingestion starts humble — records point at hosted URLs;
--                   bucket upload joins later without schema change.
--   photo_pins    : the VERSION's chosen imagery — presentation, never
--                   design; copied on version copy; frozen into the
--                   presentation snapshot at the send ceremony.
create table if not exists photo_library (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  label text not null default '',
  tags text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table proposal_versions add column if not exists photo_pins jsonb;

do $$
declare bb uuid;
begin
  select id into bb from tenants where slug = 'burger-bar';
  if bb is not null then
    execute 'alter table photo_library add column if not exists tenant_id uuid references tenants(id)';
    execute format('update photo_library set tenant_id = %L where tenant_id is null', bb);
    execute format('alter table photo_library alter column tenant_id set default %L', bb);
  end if;
end $$;
