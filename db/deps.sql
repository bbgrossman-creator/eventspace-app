-- deps.sql — application tables the v263+ migrations build on (handoff §4 list)
\set ON_ERROR_STOP on

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  contact_name text not null,
  invoice_num text not null unique,
  status text default 'active',
  created_at timestamptz not null default now()
);
alter table public.bookings enable row level security;
do $$ begin
  begin create policy bk_all on public.bookings for all
    using (tenant_id = public.current_tenant_id())
    with check (tenant_id = public.current_tenant_id());
  exception when duplicate_object then null; end;
end $$;

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  title text,
  status text default 'open',
  created_at timestamptz not null default now()
);
alter table public.proposals enable row level security;
do $$ begin
  begin create policy pr_all on public.proposals for all
    using (tenant_id = public.current_tenant_id())
    with check (tenant_id = public.current_tenant_id());
  exception when duplicate_object then null; end;
end $$;

create table if not exists public.proposal_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  version int not null default 1,
  status text not null default 'draft',          -- FREE TEXT: no CHECK, no enum (verified prod shape)
  theme_key text,
  theme_override jsonb,
  photo_pins jsonb,
  customer_intro text,
  customer_closing text,
  price_visibility text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.proposal_versions enable row level security;
do $$ begin
  begin create policy pv_all on public.proposal_versions for all
    using (tenant_id = public.current_tenant_id())
    with check (tenant_id = public.current_tenant_id());
  exception when duplicate_object then null; end;
end $$;

-- config-scoped
create table if not exists public.section_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid default public.current_tenant_id() references public.tenants(id),
  name text, key text, label text
);
create table if not exists public.guest_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid default public.current_tenant_id() references public.tenants(id),
  name text, key text, label text
);

-- version-scoped content (v266 set: components/items/requirements)
create table if not exists public.event_components (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),
  booking_id uuid references public.bookings(id),
  proposal_version_id uuid references public.proposal_versions(id),
  title text, domain text, position int
);
create table if not exists public.component_items (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.event_components(id) on delete cascade,
  name text not null, description text, quantity numeric, quantity_basis text,
  unit_price numeric, position int not null default 0
);
create table if not exists public.component_requirements (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.event_components(id) on delete cascade,
  name text not null, category text, notes text
);

-- version-scoped content (v267 set: adjustments/guests/sections/choices — version_id direct)
create table if not exists public.version_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid default public.current_tenant_id() references public.tenants(id),
  version_id uuid not null references public.proposal_versions(id) on delete cascade,
  kind text, label text, amount numeric, value numeric, taxable boolean, position int
);
create table if not exists public.version_guests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid default public.current_tenant_id() references public.tenants(id),
  version_id uuid not null references public.proposal_versions(id) on delete cascade,
  category_id uuid references public.guest_categories(id),
  count int, label text
);
create table if not exists public.version_sections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid default public.current_tenant_id() references public.tenants(id),
  version_id uuid not null references public.proposal_versions(id) on delete cascade,
  section_type_id uuid references public.section_types(id),
  title text, position int
);
create table if not exists public.choice_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid default public.current_tenant_id() references public.tenants(id),
  version_id uuid not null references public.proposal_versions(id) on delete cascade,
  section_type_id uuid references public.section_types(id),
  component_id uuid references public.event_components(id),
  name text, label text, choose_count int, min_count int, max_count int, position int,
  options jsonb not null default '[]'
);

-- RLS on the version-scoped set (tenant-direct where the column exists,
-- derived via component for the two child tables)
alter table public.event_components enable row level security;
alter table public.component_items enable row level security;
alter table public.component_requirements enable row level security;
alter table public.version_adjustments enable row level security;
alter table public.version_guests enable row level security;
alter table public.version_sections enable row level security;
alter table public.choice_groups enable row level security;
do $$ begin
  begin create policy ec_all on public.event_components for all
    using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
  exception when duplicate_object then null; end;
  begin create policy cit_all on public.component_items for all
    using (exists (select 1 from public.event_components ec where ec.id = component_id and ec.tenant_id = public.current_tenant_id()))
    with check (exists (select 1 from public.event_components ec where ec.id = component_id and ec.tenant_id = public.current_tenant_id()));
  exception when duplicate_object then null; end;
  begin create policy cr_all on public.component_requirements for all
    using (exists (select 1 from public.event_components ec where ec.id = component_id and ec.tenant_id = public.current_tenant_id()))
    with check (exists (select 1 from public.event_components ec where ec.id = component_id and ec.tenant_id = public.current_tenant_id()));
  exception when duplicate_object then null; end;
  begin create policy va_all on public.version_adjustments for all
    using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
  exception when duplicate_object then null; end;
  begin create policy vg_all on public.version_guests for all
    using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
  exception when duplicate_object then null; end;
  begin create policy vs_all on public.version_sections for all
    using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
  exception when duplicate_object then null; end;
  begin create policy cg_all on public.choice_groups for all
    using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
  exception when duplicate_object then null; end;
end $$;
