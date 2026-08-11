-- base.sql — production-faithful identity base (regenerated per handoff §4)
\set ON_ERROR_STOP on
create extension if not exists pgcrypto;

-- auth schema + users, as Supabase provides
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);
-- auth.uid(): reads request.jwt.claim.sub (prod path) and app.user_id (local convenience)
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    nullif(current_setting('app.user_id', true), '')::uuid)
$$;

-- tenants: slug NOT NULL UNIQUE (v173-faithful)
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- tenant_users: FK to auth.users (production-faithful)
create table if not exists public.tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create unique index if not exists ux_tenant_users_one_active
  on public.tenant_users (user_id) where active;

-- current_tenant_id EXACTLY as v189 defines it
create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select tu.tenant_id from public.tenant_users tu
  where tu.user_id = auth.uid() and tu.active = true limit 1
$$;

-- application roles (no superuser, no rls bypass)
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='app_user') then create role app_user nologin; end if;
end $$;
grant usage on schema public to authenticated, app_user;
grant usage on schema auth to authenticated, app_user;

revoke all on function public.current_tenant_id() from public;
grant execute on function public.current_tenant_id() to authenticated, app_user;

-- seed: real auth users, two slugged tenants, active memberships
insert into auth.users (id, email) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'a@proof.local'),
  ('bbbbbbbb-1111-0000-0000-000000000002', 'b@proof.local')
on conflict do nothing;
insert into public.tenants (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Tenant A', 'tenant-a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Tenant B', 'tenant-b')
on conflict do nothing;
insert into public.tenant_users (tenant_id, user_id, role, active) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'admin', true),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-1111-0000-0000-000000000002', 'admin', true)
on conflict do nothing;
