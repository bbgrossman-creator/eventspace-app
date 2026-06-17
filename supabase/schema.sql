-- ═══════════════════════════════════════════════════════════════════════════
-- EVENT SPACE BY BURGER BAR — Database Schema
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Bookings: replaces the Booking Form tab ───
create table bookings (
  id            uuid primary key default gen_random_uuid(),
  invoice_num   text unique not null,

  -- Contact / event basics
  event_name    text,
  contact_name  text not null,
  email         text,
  phone         text,
  alt_contact_name  text,
  alt_contact_phone text,
  event_date    date,
  event_time    text,                 -- "19:00" 24h format
  event_type    text,
  menu_type     text default 'Not Sure Yet'
                check (menu_type in ('Full Service','Single Buffet','Double Buffet','Not Sure Yet')),
  est_guests    integer,
  referral_source text,
  notes         text,

  -- Workflow
  status        text not null default 'on_hold',
  hold_expires  timestamptz,
  conflict_override_reason text,

  -- Deposit
  deposit_date   timestamptz,
  deposit_amount numeric(10,2),
  deposit_method text,

  -- Menu
  menu_completed boolean default false,
  menu jsonb default '{}'::jsonb,     -- all menu selections, keyed by field name

  -- Menu discussion scheduling
  menu_discussion_sent_at timestamptz,
  menu_discussion_date    timestamptz,
  menu_discussion_status  text,       -- 'Scheduled' | 'Overdue' | 'Completed'

  -- Confirmed guest counts
  confirmed_men        integer,
  confirmed_women      integer,
  confirmed_children   integer,
  confirmed_additional integer,
  guest_count_confirmed_at timestamptz,
  guest_count_confirmed_by text,

  -- Invoice totals (denormalized snapshot of last sent invoice)
  subtotal        numeric(10,2),
  tax_amount      numeric(10,2),
  total_with_tax  numeric(10,2),
  invoice_version text,               -- 'Estimated' | 'Final' | 'Final (Adjusted)'
  invoice_created_at timestamptz,
  invoice_sent_at    timestamptz,

  calendar_event_id text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index bookings_event_date_idx on bookings (event_date);
create index bookings_status_idx on bookings (status);

-- ─── Payments: replaces the Payment Log tab ───
create table payments (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  payment_type text not null,         -- 'Deposit' | 'Additional Payment' | 'Refund'
  method      text not null,          -- 'Cash' | 'Check' | 'Zelle' | 'Credit Card'
  amount_received numeric(10,2) not null,
  amount_applied  numeric(10,2) not null,  -- after CC fee deduction
  cc_fee      numeric(10,2) default 0,
  received_by text,
  notes       text,
  created_at  timestamptz default now()
);
create index payments_booking_idx on payments (booking_id);

-- ─── Charges: replaces the Addon1–4 slots (now unlimited) ───
create table charges (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  description text not null,
  quantity    integer not null default 1,
  unit_price  numeric(10,2) not null,
  taxable     boolean default true,
  is_adjustment boolean default false,    -- post-event [ADJ] items
  added_by    text,
  created_at  timestamptz default now()
);
create index charges_booking_idx on charges (booking_id);

-- ─── Activity log: replaces the System Log tab ───
create table activity_log (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid references bookings(id) on delete set null,
  invoice_num text,
  action      text not null,
  details     text,
  result      text default 'SUCCESS',    -- 'SUCCESS' | 'FAILED' | 'WARNING'
  created_at  timestamptz default now()
);
create index activity_booking_idx on activity_log (booking_id);

-- ─── Auto-update updated_at ───
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger bookings_updated_at before update on bookings
  for each row execute function set_updated_at();

-- ─── Invoice number generator: 5600 prefix, sequential ───
create sequence invoice_seq start 1;

create or replace function next_invoice_num() returns text as $$
  select '5600' || nextval('invoice_seq')::text;
$$ language sql;

-- ─── Row Level Security: any signed-in team member has full access ───
alter table bookings     enable row level security;
alter table payments     enable row level security;
alter table charges      enable row level security;
alter table activity_log enable row level security;

create policy "team full access" on bookings     for all to authenticated using (true) with check (true);
create policy "team full access" on payments     for all to authenticated using (true) with check (true);
create policy "team full access" on charges      for all to authenticated using (true) with check (true);
create policy "team full access" on activity_log for all to authenticated using (true) with check (true);
