-- ═══════════════════════════════════════════════════════════════════════════
-- COMPLETE DATABASE SETUP — run this ONCE on a fresh Supabase project.
-- Combines every migration in the correct order. Safe to re-run.
-- (If your existing project already has some of these, re-running is harmless —
--  every statement uses "if not exists" / "on conflict do nothing".)
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- FROM: schema.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- FROM: email_columns.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Reminder bookkeeping: stamps prevent any reminder from sending twice.
alter table bookings add column if not exists menu_call_reminder_sent_at timestamptz;
alter table bookings add column if not exists hold_warning_sent_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────
-- FROM: menu_schedule_ladder.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Menu scheduling escalation: allow repeated sends (one per booking per day).
-- day_key is null for once-ever automations, 'ladder:<booking>:<date>' for the ladder.
alter table email_sends add column if not exists day_key text;

-- The original (automation_id, booking_id) unique constraint blocks repeats.
-- Drop it and replace with one that lets ladder rows (which carry a day_key) repeat,
-- while still preventing duplicate once-ever sends.
alter table email_sends drop constraint if exists email_sends_automation_id_booking_id_key;
create unique index if not exists email_sends_once_idx
  on email_sends (automation_id, booking_id) where day_key is null;
create unique index if not exists email_sends_daily_idx
  on email_sends (booking_id, day_key) where day_key is not null;

-- ─────────────────────────────────────────────────────────────────────────
-- FROM: menu_templates.sql
-- ─────────────────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════
-- MENU TEMPLATES — Phase 2
-- Run once in the Supabase SQL Editor. Safe to re-run (upserts by slug).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists menu_templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  active boolean default true,
  config jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table menu_templates enable row level security;
do $$ begin
  create policy "team full access" on menu_templates for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Charges gain a source so menu-generated lines can be regenerated without
-- touching manually added ones.
alter table charges add column if not exists source text default 'manual';

alter table menu_templates add column if not exists category text default 'General';
alter table menu_templates add column if not exists sort_order int default 100;

insert into menu_templates (slug, name, category, sort_order, config) values
('full_service', 'Full Service Plated Dinner', 'Plated Dinner Service', 10, '{"slug":"full_service","name":"Full Service Plated Dinner","category":"Plated Dinner Service","sort_order":10,"base":{"adult_pp":60,"child_pp":50,"min_guests":40,"notes":"Includes place settings, beverages, 2.5 hrs professional service, soup, mains, sides, dessert. Tables include coleslaw & pickles; each setting includes 2 mini baguettes & hummus. Children $50 up to age 8; 9+ are adults."},"sections":[{"key":"mechitzah","title":"Do you need a Mechitzah (divider)?","type":"choose","required":true,"options":[{"label":"Yes"},{"label":"No"}]},{"key":"centerpieces","title":"Centerpieces (+$150)","type":"choose","help":"Elegant centerpieces on every table.","options":[{"label":"Yes","price":{"model":"flat","amount":150}},{"label":"No"}]},{"key":"head_table","title":"Head Table Setup (optional)","type":"text","help":"Number of people and event type, e.g. ''Chosson and Kallah table – 2 people''."},{"key":"setup_notes","title":"Special Room Setup Instructions","type":"text"},{"key":"starter","title":"Choose Your Starter","type":"choose","required":true,"options":[{"label":"Chicken Caesar Salad with BBQ Grilled Chicken"},{"label":"Chicken Caesar Salad with Baby Chicken"},{"label":"Chicken Caesar Salad with Schnitzel"},{"label":"Caesar Steak Salad"}]},{"key":"soup","title":"Choose Your Soup","type":"choose","required":true,"options":[{"label":"Homestyle Chicken Matzah Ball Soup"},{"label":"Cream of Chicken Soup"},{"label":"Cream of Zucchini Soup"},{"label":"Butternut Squash Soup"},{"label":"Barley Beef Soup","price":{"model":"per_person","amount":5}}]},{"key":"beef_main","title":"Choose Your Beef Main Course","type":"choose","required":true,"options":[{"label":"Brisket"},{"label":"Crispy Beef"},{"label":"Pepper Steak"},{"label":"Rib Steak","price":{"model":"per_person","amount":30}}]},{"key":"chicken_main","title":"Choose Your Chicken Main Course","type":"choose","required":true,"options":[{"label":"Grilled BBQ Chicken"},{"label":"Baby Chicken"},{"label":"Schnitzel"},{"label":"Beer Batter Chicken"},{"label":"Chicken Marsala"}]},{"key":"second_chicken","title":"Guest Choice of Two Chicken Options (+$5/pp, whole party)","type":"text","help":"Enter the second chicken option and estimated guest count, e.g. ''Baby Chicken – approx 25 guests''. Leave blank if not applicable.","section_price":{"model":"per_person","amount":5}},{"key":"womens_chicken","title":"Women''s Alternate Chicken Entrée (optional)","type":"text","help":"Only if women should receive a different chicken entrée than the main selection."},{"key":"veg_side","title":"Choose Your Vegetable Side","type":"choose","required":true,"options":[{"label":"Sauteed Vegetable"},{"label":"Sauteed Green Beans with Garlic"},{"label":"Julienne Vegetables"},{"label":"Sauteed Green Beans wrapped in Pastrami Bundle"}]},{"key":"starch_side","title":"Choose Your Starch Side","type":"choose","required":true,"options":[{"label":"White Rice"},{"label":"Yellow Rice"},{"label":"Mash Potato with Onion Ring Halo"},{"label":"Fingerling Potato"},{"label":"Sweet Chili Glazed Fingerling Potato"},{"label":"Homemade Fries"},{"label":"Onion Rings"}]},{"key":"dessert","title":"Choose Your Dessert","type":"choose","required":true,"options":[{"label":"Chocolate Soufflé & Vanilla Ice Cream"},{"label":"Apple Cobbler & Vanilla Ice Cream"},{"label":"Cinnamon Churros & Vanilla Ice Cream"},{"label":"Sorbet Ice Pops"}]},{"key":"fam_app_platter","title":"Family Style Appetizer Platter (+$7/pp)","type":"multi","optional_group":true,"count":{"fixed":{"min":3,"max":3}},"help":"Served in the center of each table; select exactly 3. Each platter serves 10. Extra platters after initial service: $70 ($35 head table).","section_price":{"model":"per_person","amount":7},"options":[{"label":"Onion Rings"},{"label":"Fries"},{"label":"Crispy Burger Bites"},{"label":"Crispy Pastrami Fritos"},{"label":"Breaded Cauliflower"}]},{"key":"palate","title":"Palate Cleanser — Sorbet Ice Pops","type":"toggle","options":[{"label":"Add Sorbet Ice Pops","price":{"model":"per_person","amount":2.5}}]},{"key":"sliders","title":"Slider Platters (+$6.50/pp)","type":"toggle","help":"Beef Burger, Pulled Brisket & Schnitzel sliders at the center of each table. Extra platters: $65 ($30 head table).","options":[{"label":"Add Slider Platters","price":{"model":"per_person","amount":6.5}}]},{"key":"fries_platters","title":"French Fries Platters (+$4.50/pp)","type":"toggle","help":"Extra platters after initial service: $45 ($25 head table).","options":[{"label":"Add Fries Platters","price":{"model":"per_person","amount":4.5}}]},{"key":"dessert_station","title":"Dessert Station Upgrade (+$6/pp)","type":"multi","optional_group":true,"help":"Standard dessert is still served to all guests.","section_price":{"model":"per_person","amount":6},"options":[{"label":"Churros with Vanilla Ice Cream"},{"label":"Chocolate Soufflé with Vanilla Ice Cream"},{"label":"Apple Cobbler with Vanilla Ice Cream"}]},{"key":"child_allergy","title":"Do any children have food allergies or dietary restrictions?","type":"choose","options":[{"label":"Yes"},{"label":"No"}]},{"key":"child_allergy_details","title":"Children''s allergies / dietary details","type":"text","visible_if":{"key":"child_allergy","equals":"Yes"}},{"key":"child_requests","title":"Special requests for children''s meals","type":"text"},{"key":"child_table","title":"Separate children''s table?","type":"choose","options":[{"label":"Yes, separate children''s table"},{"label":"No, children sit with adults"}]},{"key":"smorg","title":"Reception Smorgasbord Buffet (standing/walkaround)","type":"choose","required":true,"help":"Pre-event reception, starting at $400. Includes buffet setup, linen, plasticware, napkins, beverages.","options":[{"label":"Yes"},{"label":"No"}]},{"key":"smorg_split","title":"Shared or separate smorgasbord?","type":"choose","help":"Most events use one shared buffet even with a mechitzah.","options":[{"label":"One buffet - shared"},{"label":"Separate buffets for men and women"}],"visible_if":{"key":"smorg","equals":"Yes"}},{"key":"smorg_shared_pkg","title":"Shared Smorg — Package","type":"choose","required":true,"help":"Each hot dish set includes a Main Dish + Appetizer tray.","options":[{"label":"2 Hot Dishes ($400)","price":{"model":"flat","amount":400}},{"label":"4 Hot Dishes ($600)","price":{"model":"flat","amount":600}},{"label":"6 Hot Dishes ($800)","price":{"model":"flat","amount":800}},{"label":"8 Hot Dishes ($1000)","price":{"model":"flat","amount":1000}},{"label":"10 Hot Dishes ($1200)","price":{"model":"flat","amount":1200}}],"visible_if":{"key":"smorg_split","equals":"One buffet - shared"}},{"key":"smorg_shared_main","title":"Shared Smorg — Main Dish Trays","type":"multi","count":{"by_answer":{"key":"smorg_shared_pkg","map":{"2 Hot Dishes ($400)":1,"4 Hot Dishes ($600)":2,"6 Hot Dishes ($800)":3,"8 Hot Dishes ($1000)":4,"10 Hot Dishes ($1200)":5}}},"options":[{"label":"Buffalo Poppers"},{"label":"Crispy Chicken"},{"label":"Cornflake Chicken"},{"label":"Popcorn Chicken"},{"label":"Jack Daniels Poppers"},{"label":"Crispy Beef","price":{"model":"flat","amount":25}}],"visible_if":{"key":"smorg_split","equals":"One buffet - shared"}},{"key":"smorg_shared_app","title":"Shared Smorg — Appetizer Trays","type":"multi","count":{"by_answer":{"key":"smorg_shared_pkg","map":{"2 Hot Dishes ($400)":1,"4 Hot Dishes ($600)":2,"6 Hot Dishes ($800)":3,"8 Hot Dishes ($1000)":4,"10 Hot Dishes ($1200)":5}}},"options":[{"label":"Crispy Cauliflower"},{"label":"Burger Bites"},{"label":"Pastrami Fritos"},{"label":"Franks N Blanks"},{"label":"Mini Potato Knishes"},{"label":"Beef Cigars"},{"label":"Potato Kugel"},{"label":"Kishka & Gravy"},{"label":"Mini Egg Rolls"}],"visible_if":{"key":"smorg_split","equals":"One buffet - shared"}},{"key":"smorg_shared_platters","title":"Shared Smorg — Extra Platters","type":"multi","optional_group":true,"options":[{"label":"Large Fruit Platter","price":{"model":"flat","amount":125}},{"label":"Assorted Petite Four Platter","price":{"model":"flat","amount":125}}],"visible_if":{"key":"smorg_split","equals":"One buffet - shared"}},{"key":"smorg_shared_salads","title":"Shared Smorg — Salads","type":"multi","optional_group":true,"help":"Minimum 2 for display. Served in bowls.","options":[{"label":"Caesar Salad","price":{"model":"flat","amount":65}},{"label":"Chicken Caesar","price":{"model":"flat","amount":110}},{"label":"Mexican Chop Salad","price":{"model":"flat","amount":140}},{"label":"Caesar Steak Salad","price":{"model":"flat","amount":150}}],"visible_if":{"key":"smorg_split","equals":"One buffet - shared"}},{"key":"smorg_men_pkg","title":"Men''s Smorg — Package","type":"choose","required":true,"help":"Each hot dish set includes a Main Dish + Appetizer tray.","options":[{"label":"2 Hot Dishes ($400)","price":{"model":"flat","amount":400}},{"label":"4 Hot Dishes ($600)","price":{"model":"flat","amount":600}},{"label":"6 Hot Dishes ($800)","price":{"model":"flat","amount":800}},{"label":"8 Hot Dishes ($1000)","price":{"model":"flat","amount":1000}},{"label":"10 Hot Dishes ($1200)","price":{"model":"flat","amount":1200}}],"visible_if":{"key":"smorg_split","equals":"Separate buffets for men and women"}},{"key":"smorg_men_main","title":"Men''s Smorg — Main Dish Trays","type":"multi","count":{"by_answer":{"key":"smorg_men_pkg","map":{"2 Hot Dishes ($400)":1,"4 Hot Dishes ($600)":2,"6 Hot Dishes ($800)":3,"8 Hot Dishes ($1000)":4,"10 Hot Dishes ($1200)":5}}},"options":[{"label":"Buffalo Poppers"},{"label":"Crispy Chicken"},{"label":"Cornflake Chicken"},{"label":"Popcorn Chicken"},{"label":"Jack Daniels Poppers"},{"label":"Crispy Beef","price":{"model":"flat","amount":25}}],"visible_if":{"key":"smorg_split","equals":"Separate buffets for men and women"}},{"key":"smorg_men_app","title":"Men''s Smorg — Appetizer Trays","type":"multi","count":{"by_answer":{"key":"smorg_men_pkg","map":{"2 Hot Dishes ($400)":1,"4 Hot Dishes ($600)":2,"6 Hot Dishes ($800)":3,"8 Hot Dishes ($1000)":4,"10 Hot Dishes ($1200)":5}}},"options":[{"label":"Crispy Cauliflower"},{"label":"Burger Bites"},{"label":"Pastrami Fritos"},{"label":"Franks N Blanks"},{"label":"Mini Potato Knishes"},{"label":"Beef Cigars"},{"label":"Potato Kugel"},{"label":"Kishka & Gravy"},{"label":"Mini Egg Rolls"}],"visible_if":{"key":"smorg_split","equals":"Separate buffets for men and women"}},{"key":"smorg_men_platters","title":"Men''s Smorg — Extra Platters","type":"multi","optional_group":true,"options":[{"label":"Large Fruit Platter","price":{"model":"flat","amount":125}},{"label":"Assorted Petite Four Platter","price":{"model":"flat","amount":125}}],"visible_if":{"key":"smorg_split","equals":"Separate buffets for men and women"}},{"key":"smorg_men_salads","title":"Men''s Smorg — Salads","type":"multi","optional_group":true,"help":"Minimum 2 for display. Served in bowls.","options":[{"label":"Caesar Salad","price":{"model":"flat","amount":65}},{"label":"Chicken Caesar","price":{"model":"flat","amount":110}},{"label":"Mexican Chop Salad","price":{"model":"flat","amount":140}},{"label":"Caesar Steak Salad","price":{"model":"flat","amount":150}}],"visible_if":{"key":"smorg_split","equals":"Separate buffets for men and women"}},{"key":"smorg_women_pkg","title":"Women''s Smorg — Package","type":"choose","required":true,"help":"Each hot dish set includes a Main Dish + Appetizer tray.","options":[{"label":"2 Hot Dishes ($400)","price":{"model":"flat","amount":400}},{"label":"4 Hot Dishes ($600)","price":{"model":"flat","amount":600}},{"label":"6 Hot Dishes ($800)","price":{"model":"flat","amount":800}},{"label":"8 Hot Dishes ($1000)","price":{"model":"flat","amount":1000}},{"label":"10 Hot Dishes ($1200)","price":{"model":"flat","amount":1200}}],"visible_if":{"key":"smorg_split","equals":"Separate buffets for men and women"}},{"key":"smorg_women_main","title":"Women''s Smorg — Main Dish Trays","type":"multi","count":{"by_answer":{"key":"smorg_women_pkg","map":{"2 Hot Dishes ($400)":1,"4 Hot Dishes ($600)":2,"6 Hot Dishes ($800)":3,"8 Hot Dishes ($1000)":4,"10 Hot Dishes ($1200)":5}}},"options":[{"label":"Buffalo Poppers"},{"label":"Crispy Chicken"},{"label":"Cornflake Chicken"},{"label":"Popcorn Chicken"},{"label":"Jack Daniels Poppers"},{"label":"Crispy Beef","price":{"model":"flat","amount":25}}],"visible_if":{"key":"smorg_split","equals":"Separate buffets for men and women"}},{"key":"smorg_women_app","title":"Women''s Smorg — Appetizer Trays","type":"multi","count":{"by_answer":{"key":"smorg_women_pkg","map":{"2 Hot Dishes ($400)":1,"4 Hot Dishes ($600)":2,"6 Hot Dishes ($800)":3,"8 Hot Dishes ($1000)":4,"10 Hot Dishes ($1200)":5}}},"options":[{"label":"Crispy Cauliflower"},{"label":"Burger Bites"},{"label":"Pastrami Fritos"},{"label":"Franks N Blanks"},{"label":"Mini Potato Knishes"},{"label":"Beef Cigars"},{"label":"Potato Kugel"},{"label":"Kishka & Gravy"},{"label":"Mini Egg Rolls"}],"visible_if":{"key":"smorg_split","equals":"Separate buffets for men and women"}},{"key":"smorg_women_platters","title":"Women''s Smorg — Extra Platters","type":"multi","optional_group":true,"options":[{"label":"Large Fruit Platter","price":{"model":"flat","amount":125}},{"label":"Assorted Petite Four Platter","price":{"model":"flat","amount":125}}],"visible_if":{"key":"smorg_split","equals":"Separate buffets for men and women"}},{"key":"smorg_women_salads","title":"Women''s Smorg — Salads","type":"multi","optional_group":true,"help":"Minimum 2 for display. Served in bowls.","options":[{"label":"Caesar Salad","price":{"model":"flat","amount":65}},{"label":"Chicken Caesar","price":{"model":"flat","amount":110}},{"label":"Mexican Chop Salad","price":{"model":"flat","amount":140}},{"label":"Caesar Steak Salad","price":{"model":"flat","amount":150}}],"visible_if":{"key":"smorg_split","equals":"Separate buffets for men and women"}},{"key":"addl","title":"Additional seated guests during the main course (buffet service)?","type":"choose","required":true,"help":"Tables, linens & seating provided; buffet with chafers; no preset place settings or plated service.","options":[{"label":"Yes"},{"label":"No"}]},{"key":"addl_pkg","title":"Additional Guests Buffet — Package","type":"choose","visible_if":{"key":"addl","equals":"Yes"},"options":[{"label":"20 guests ($800) - 6 hot dishes","price":{"model":"flat","amount":800}},{"label":"30 guests ($1100) - 8 hot dishes","price":{"model":"flat","amount":1100}},{"label":"40 guests ($1400) - 10 hot dishes","price":{"model":"flat","amount":1400}},{"label":"50 guests ($1700) - 12 hot dishes","price":{"model":"flat","amount":1700}},{"label":"60 guests ($2000) - 14 hot dishes","price":{"model":"flat","amount":2000}}]},{"key":"addl_main","title":"Additional Buffet — Main Dishes","type":"multi","visible_if":{"key":"addl","equals":"Yes"},"count":{"by_answer":{"key":"addl_pkg","map":{"20 guests ($800) - 6 hot dishes":3,"30 guests ($1100) - 8 hot dishes":4,"40 guests ($1400) - 10 hot dishes":5,"50 guests ($1700) - 12 hot dishes":6,"60 guests ($2000) - 14 hot dishes":7}}},"options":[{"label":"Buffalo Poppers"},{"label":"Crispy Chicken"},{"label":"Cornflake Chicken"},{"label":"Popcorn Chicken"},{"label":"Jack Daniels Poppers"},{"label":"Crispy Beef","price":{"model":"per_person_qty","amount":2.5}},{"label":"Pepper Steak","price":{"model":"per_person_qty","amount":2.5}},{"label":"Cholent (Thursday only)"}]},{"key":"addl_app","title":"Additional Buffet — Appetizers","type":"multi","visible_if":{"key":"addl","equals":"Yes"},"count":{"by_answer":{"key":"addl_pkg","map":{"20 guests ($800) - 6 hot dishes":2,"30 guests ($1100) - 8 hot dishes":2,"40 guests ($1400) - 10 hot dishes":3,"50 guests ($1700) - 12 hot dishes":4,"60 guests ($2000) - 14 hot dishes":5}}},"options":[{"label":"Crispy Cauliflower"},{"label":"Burger Bites"},{"label":"Pastrami Fritos"},{"label":"Franks N Blanks"},{"label":"Mini Potato Knishes"},{"label":"Beef Cigars"},{"label":"Potato Kugel"},{"label":"Kishka & Gravy"},{"label":"Egg Rolls"}]},{"key":"addl_side","title":"Additional Buffet — Side Dishes","type":"multi","visible_if":{"key":"addl","equals":"Yes"},"count":{"by_answer":{"key":"addl_pkg","map":{"20 guests ($800) - 6 hot dishes":1,"30 guests ($1100) - 8 hot dishes":2,"40 guests ($1400) - 10 hot dishes":2,"50 guests ($1700) - 12 hot dishes":2,"60 guests ($2000) - 14 hot dishes":2}}},"options":[{"label":"Fries"},{"label":"Spicy Fries"},{"label":"Onion Rings"},{"label":"Grilled Vegetables"},{"label":"Yellow Rice"},{"label":"White Rice"}]},{"key":"addl_sliders","title":"Additional Buffet — Slider Platters ($135/tray)","type":"qty","help":"Recommended 1 per 20 people. Brisket, Burger & Schnitzel sliders.","visible_if":{"key":"addl","equals":"Yes"},"options":[{"label":"Slider Platter","price":{"model":"per_tray","amount":135}}]},{"key":"addl_wraps","title":"Additional Buffet — Wrap Platters ($170/tray)","type":"qty","help":"Recommended 1 per 20 people. Brisket, Pastrami, Grilled Chicken & Schnitzel wraps.","visible_if":{"key":"addl","equals":"Yes"},"options":[{"label":"Wrap Platter","price":{"model":"per_tray","amount":170}}]},{"key":"addl_salads","title":"Additional Buffet — Salads","type":"multi","optional_group":true,"visible_if":{"key":"addl","equals":"Yes"},"options":[{"label":"Caesar Salad","price":{"model":"flat","amount":65}},{"label":"Chicken Caesar","price":{"model":"flat","amount":110}},{"label":"Mexican Chop Salad","price":{"model":"flat","amount":140}},{"label":"Caesar Steak Salad","price":{"model":"flat","amount":150}}]},{"key":"addl_desserts","title":"Additional Buffet — Dessert Platters","type":"multi","optional_group":true,"visible_if":{"key":"addl","equals":"Yes"},"options":[{"label":"Large Fruit Platter","price":{"model":"flat","amount":125}},{"label":"Assorted Petite Four Platter","price":{"model":"flat","amount":125}}]},{"key":"dietary","title":"Dietary Restrictions & Allergies","type":"text","help":"Any restrictions, allergies, or special dietary needs (all guests)."},{"key":"vendors","title":"Outside Vendors","type":"multi","optional_group":true,"options":[{"label":"Photographer/Videographer"},{"label":"DJ/Band/Live Music"},{"label":"Outside Decorations (requires prior permission)"}]},{"key":"vendor_details","title":"Vendor Details","type":"text"},{"key":"notes","title":"Additional Notes","type":"text"}]}'::jsonb),
('single_buffet', 'Single Buffet Station', 'Buffet Service', 20, '{"slug":"single_buffet","name":"Single Buffet Station","category":"Buffet Service","sort_order":20,"base":{"adult_pp":60,"child_pp":50,"min_guests":40,"min_total":2400,"notes":"One buffet station shared between men and women. 2.5 hrs service included; overtime $200 per half hour. Children $50 up to age 8; 9+ are adults at $60."},"sections":[{"key":"mechitzah","title":"Do you need a Mechitzah (divider)?","type":"choose","required":true,"options":[{"label":"Yes"},{"label":"No"}]},{"key":"centerpieces","title":"Centerpieces (+$150)","type":"choose","help":"Elegant centerpieces on every table.","options":[{"label":"Yes","price":{"model":"flat","amount":150}},{"label":"No"}]},{"key":"head_table","title":"Head Table Setup (optional)","type":"text","help":"Number of people and event type, e.g. ''Chosson and Kallah table – 2 people''."},{"key":"setup_notes","title":"Special Room Setup Instructions","type":"text"},{"key":"child_allergy","title":"Do any children have food allergies or dietary restrictions?","type":"choose","options":[{"label":"Yes"},{"label":"No"}]},{"key":"child_allergy_details","title":"Children''s allergies / dietary details","type":"text","visible_if":{"key":"child_allergy","equals":"Yes"}},{"key":"child_requests","title":"Special requests for children''s meals","type":"text"},{"key":"child_table","title":"Separate children''s table?","type":"choose","options":[{"label":"Yes, separate children''s table"},{"label":"No, children sit with adults"}]},{"key":"mains","title":"Chicken or Beef — Choose 4 (chafing dishes)","type":"multi","count":{"fixed":{"min":4,"max":4}},"options":[{"label":"Buffalo Poppers"},{"label":"Crispy Chicken"},{"label":"Cornflake Chicken"},{"label":"Popcorn Chicken"},{"label":"Jack Daniels Poppers"},{"label":"Crispy Beef","price":{"model":"per_side_person","amount":2.5}},{"label":"Pepper Steak","price":{"model":"per_side_person","amount":2.5}},{"label":"Cholent (Thursday only)"}]},{"key":"apps","title":"Appetizers — Choose 4 (chafing dishes)","type":"multi","count":{"fixed":{"min":4,"max":4}},"options":[{"label":"Crispy Cauliflower"},{"label":"Burger Bites"},{"label":"Pastrami Fritos"},{"label":"Franks N Blanks"},{"label":"Mini Potato Knishes"},{"label":"Beef Cigars"},{"label":"Potato Kugel"},{"label":"Kishka & Gravy"},{"label":"Egg Rolls"}]},{"key":"sides","title":"Sides — Choose 2 (chafing dishes)","type":"multi","count":{"fixed":{"min":2,"max":2}},"options":[{"label":"Fries"},{"label":"Spicy Fries"},{"label":"Onion Rings"},{"label":"Grilled Vegetables"},{"label":"Yellow Rice"},{"label":"White Rice"}]},{"key":"salads","title":"Salads — Choose 2 (bowls)","type":"multi","required":true,"count":{"fixed":{"min":2,"max":2}},"options":[{"label":"Caesar Salad"},{"label":"Deli Salad"},{"label":"Mexican Chop Salad"},{"label":"Caesar Steak Salad"}]},{"key":"sliders_info","title":"Slider Platters — Included","type":"info","help":"Your buffet includes Brisket, Burger & Schnitzel sliders served on platters."},{"key":"bread","title":"Bread Station","type":"choose","required":true,"help":"Standard bread station with assorted dinner rolls included. Upgrades in Add-Ons.","options":[{"label":"Standard bread station — assorted dinner rolls"},{"label":"Individual upgrade — select Bread & Chummus or Starter in Add-Ons"}]},{"key":"plated_dessert","title":"Plated Dessert (included)","type":"choose","required":true,"options":[{"label":"Chocolate Soufflé & Vanilla Ice Cream"},{"label":"Apple Cobbler & Vanilla Ice Cream"},{"label":"Cinnamon Churros & Vanilla Ice Cream"},{"label":"Dessert Station Upgrade (replaces plated dessert)"}]},{"key":"refills_info","title":"Refills","type":"info","help":"Discretionary; kitchen refills as needed. Included: 40 guests none · 50→2 · 60→4 · 70→6 · 80→8 · 90→10 · 100→12. Additional refills billed per tray after the event."},{"key":"addon_charger","title":"Charger & Dinner Plate Upgrade","type":"toggle","options":[{"label":"Add charger & dinner plate","price":{"model":"per_person","amount":4}}]},{"key":"addon_starter","title":"Individual Starter (+$16/pp)","type":"choose","help":"Includes 2 mini baguettes, individual chummus, and your selected starter. Replaces the standard bread station.","options":[{"label":"Chicken Caesar Salad with BBQ Grilled Chicken","price":{"model":"per_person","amount":16}},{"label":"Chicken Caesar Salad with Baby Chicken","price":{"model":"per_person","amount":16}},{"label":"Chicken Caesar Salad with Schnitzel","price":{"model":"per_person","amount":16}},{"label":"Deli Salad","price":{"model":"per_person","amount":16}},{"label":"Caesar Steak Salad","price":{"model":"per_person","amount":16}}]},{"key":"addon_wrap","title":"Wrap Platter Add-On","type":"toggle","help":"Mini wraps, displayed and refilled: Pulled Brisket · Pastrami · Schnitzel · Grilled Chicken","options":[{"label":"Add wrap platter","price":{"model":"per_person","amount":7}}]},{"key":"addon_sandwich","title":"Sandwich Platter Add-On","type":"toggle","options":[{"label":"Add sandwich platter","price":{"model":"per_person","amount":7}}]},{"key":"addon_soup","title":"Soup","type":"multi","optional_group":true,"count":{"fixed":{"min":0,"max":2}},"help":"+$4/pp for one soup, +$6/pp for two. Barley Beef adds $5/pp.","section_price":{"model":"per_person_by_count","by_count":{"1":4,"2":6}},"options":[{"label":"Homestyle Chicken Matzah Ball Soup"},{"label":"Cream of Chicken Soup"},{"label":"Cream of Zucchini Soup"},{"label":"Butternut Squash Soup"},{"label":"Barley Beef Soup","price":{"model":"per_person","amount":5}}]},{"key":"addon_platters","title":"Dessert Platters","type":"multi","optional_group":true,"options":[{"label":"Large Fruit Platter","price":{"model":"flat","amount":125}},{"label":"Assorted Petite Four Platter","price":{"model":"flat","amount":125}}]},{"key":"addon_station","title":"Dessert Station Upgrade (+$6/pp — replaces plated dessert)","type":"multi","optional_group":true,"section_price":{"model":"per_person","amount":6},"options":[{"label":"Churros with Vanilla Ice Cream"},{"label":"Chocolate Soufflé with Vanilla Ice Cream"},{"label":"Apple Cobbler with Vanilla Ice Cream"}]},{"key":"addon_passing","title":"Dessert Passing (+$5/pp)","type":"toggle","help":"Mini pops passed tableside, in addition to plated dessert: Orange Creamsicle · Green Apple · Raspberry Lemon","options":[{"label":"Add Dessert Passing","price":{"model":"per_person","amount":5}}]},{"key":"addon_thursday","title":"Thursday Add-On (Thursdays only)","type":"toggle","help":"Cholent, Kugel, and Kishka with Gravy. Tray quantities scale with guest count.","options":[{"label":"Add Thursday package","price":{"model":"per_person","amount":7.5}}]},{"key":"addon_bread_chummus","title":"Individual Bread & Chummus (+$6/pp)","type":"toggle","help":"2 mini baguettes + individual chummus per guest. Replaces standard bread station. Not needed with Individual Starter.","options":[{"label":"Add bread & chummus","price":{"model":"per_person","amount":6}}]},{"key":"dietary","title":"Dietary Restrictions & Allergies","type":"text","help":"Any restrictions, allergies, or special dietary needs (all guests)."},{"key":"vendors","title":"Outside Vendors","type":"multi","optional_group":true,"options":[{"label":"Photographer/Videographer"},{"label":"DJ/Band/Live Music"},{"label":"Outside Decorations (requires prior permission)"}]},{"key":"vendor_details","title":"Vendor Details","type":"text"},{"key":"notes","title":"Additional Notes","type":"text"}]}'::jsonb),
('double_buffet', 'Double Buffet Stations (Men & Women)', 'Buffet Service', 21, '{"slug":"double_buffet","name":"Double Buffet Stations (Men & Women)","category":"Buffet Service","sort_order":21,"base":{"adult_pp":70,"child_pp":50,"min_guests":40,"min_total":2800,"notes":"Separate buffet stations for men and women. 2.5 hrs service included; overtime $200 per half hour. Children $50 up to age 8; 9+ are adults at $70."},"sections":[{"key":"mechitzah","title":"Do you need a Mechitzah (divider)?","type":"choose","required":true,"options":[{"label":"Yes"},{"label":"No"}]},{"key":"centerpieces","title":"Centerpieces (+$150)","type":"choose","help":"Elegant centerpieces on every table.","options":[{"label":"Yes","price":{"model":"flat","amount":150}},{"label":"No"}]},{"key":"head_table","title":"Head Table Setup (optional)","type":"text","help":"Number of people and event type, e.g. ''Chosson and Kallah table – 2 people''."},{"key":"setup_notes","title":"Special Room Setup Instructions","type":"text"},{"key":"child_allergy","title":"Do any children have food allergies or dietary restrictions?","type":"choose","options":[{"label":"Yes"},{"label":"No"}]},{"key":"child_allergy_details","title":"Children''s allergies / dietary details","type":"text","visible_if":{"key":"child_allergy","equals":"Yes"}},{"key":"child_requests","title":"Special requests for children''s meals","type":"text"},{"key":"child_table","title":"Separate children''s table?","type":"choose","options":[{"label":"Yes, separate children''s table"},{"label":"No, children sit with adults"}]},{"key":"men_info","title":"Men''s Buffet","type":"info","help":"10 guests: 4 hot dishes · 20: 6 · 30: 8 · 40+: 10. Refills (40+): 50→2, 60→4, 70→6, 80→8, 90→10, 100→12. Refills are discretionary; extra refills billed per tray after the event."},{"key":"men_main","title":"Men''s — Main Dishes","type":"multi","side":"men","count":{"by_tier":{"source":"men","tiers":[{"min":0,"choose":2},{"min":20,"choose":3},{"min":30,"choose":4},{"min":40,"choose":4}]}},"options":[{"label":"Buffalo Poppers"},{"label":"Crispy Chicken"},{"label":"Cornflake Chicken"},{"label":"Popcorn Chicken"},{"label":"Jack Daniels Poppers"},{"label":"Crispy Beef","price":{"model":"per_side_person","amount":2.5}},{"label":"Pepper Steak","price":{"model":"per_side_person","amount":2.5}},{"label":"Cholent (Thursday only)"}]},{"key":"men_app","title":"Men''s — Appetizers","type":"multi","side":"men","count":{"by_tier":{"source":"men","tiers":[{"min":0,"choose":1},{"min":20,"choose":2},{"min":30,"choose":2},{"min":40,"choose":4}]}},"options":[{"label":"Crispy Cauliflower"},{"label":"Burger Bites"},{"label":"Pastrami Fritos"},{"label":"Franks N Blanks"},{"label":"Mini Potato Knishes"},{"label":"Beef Cigars"},{"label":"Potato Kugel"},{"label":"Kishka & Gravy"},{"label":"Egg Rolls"}]},{"key":"men_side","title":"Men''s — Side Dishes","type":"multi","side":"men","count":{"by_tier":{"source":"men","tiers":[{"min":0,"choose":1},{"min":20,"choose":1},{"min":30,"choose":2},{"min":40,"choose":2}]}},"options":[{"label":"Fries"},{"label":"Spicy Fries"},{"label":"Onion Rings"},{"label":"Grilled Vegetables"},{"label":"Yellow Rice"},{"label":"White Rice"}]},{"key":"men_salads","title":"Men''s — Salads","type":"multi","side":"men","count":{"by_tier":{"source":"men","tiers":[{"min":0,"choose":1},{"min":20,"choose":2}]}},"options":[{"label":"Caesar Salad"},{"label":"Deli Salad"},{"label":"Mexican Chop Salad"},{"label":"Caesar Steak Salad"}]},{"key":"men_bread","title":"Men''s — Bread Station","type":"choose","required":true,"options":[{"label":"Standard bread station — assorted dinner rolls"},{"label":"Individual upgrade — select Bread & Chummus or Starter in Add-Ons"}]},{"key":"men_dessert","title":"Men''s — Plated Dessert","type":"choose","required":true,"options":[{"label":"Chocolate Soufflé & Vanilla Ice Cream"},{"label":"Apple Cobbler & Vanilla Ice Cream"},{"label":"Cinnamon Churros & Vanilla Ice Cream"},{"label":"Dessert Station Upgrade (replaces plated dessert)"}]},{"key":"men_addon_charger","title":"Charger & Dinner Plate Upgrade","type":"toggle","side":"men","options":[{"label":"Add charger & dinner plate","price":{"model":"per_side_person","amount":4}}]},{"key":"men_addon_starter","title":"Individual Starter (+$16/pp)","type":"choose","side":"men","help":"Includes 2 mini baguettes, individual chummus, and your selected starter. Replaces the standard bread station.","options":[{"label":"Chicken Caesar Salad with BBQ Grilled Chicken","price":{"model":"per_side_person","amount":16}},{"label":"Chicken Caesar Salad with Baby Chicken","price":{"model":"per_side_person","amount":16}},{"label":"Chicken Caesar Salad with Schnitzel","price":{"model":"per_side_person","amount":16}},{"label":"Deli Salad","price":{"model":"per_side_person","amount":16}},{"label":"Caesar Steak Salad","price":{"model":"per_side_person","amount":16}}]},{"key":"men_addon_wrap","title":"Wrap Platter Add-On","type":"toggle","side":"men","help":"Mini wraps, displayed and refilled: Pulled Brisket · Pastrami · Schnitzel · Grilled Chicken","options":[{"label":"Add wrap platter","price":{"model":"per_side_person","amount":7}}]},{"key":"men_addon_sandwich","title":"Sandwich Platter Add-On","type":"toggle","side":"men","options":[{"label":"Add sandwich platter","price":{"model":"per_side_person","amount":7}}]},{"key":"men_addon_soup","title":"Soup","type":"multi","optional_group":true,"side":"men","count":{"fixed":{"min":0,"max":2}},"help":"+$4/pp for one soup, +$6/pp for two. Barley Beef adds $5/pp.","section_price":{"model":"per_person_by_count","by_count":{"1":4,"2":6}},"options":[{"label":"Homestyle Chicken Matzah Ball Soup"},{"label":"Cream of Chicken Soup"},{"label":"Cream of Zucchini Soup"},{"label":"Butternut Squash Soup"},{"label":"Barley Beef Soup","price":{"model":"per_side_person","amount":5}}]},{"key":"men_addon_platters","title":"Dessert Platters","type":"multi","optional_group":true,"side":"men","options":[{"label":"Large Fruit Platter","price":{"model":"flat","amount":125}},{"label":"Assorted Petite Four Platter","price":{"model":"flat","amount":125}}]},{"key":"men_addon_station","title":"Dessert Station Upgrade (+$6/pp — replaces plated dessert)","type":"multi","optional_group":true,"side":"men","section_price":{"model":"per_person","amount":6},"options":[{"label":"Churros with Vanilla Ice Cream"},{"label":"Chocolate Soufflé with Vanilla Ice Cream"},{"label":"Apple Cobbler with Vanilla Ice Cream"}]},{"key":"men_addon_passing","title":"Dessert Passing (+$5/pp)","type":"toggle","side":"men","help":"Mini pops passed tableside, in addition to plated dessert: Orange Creamsicle · Green Apple · Raspberry Lemon","options":[{"label":"Add Dessert Passing","price":{"model":"per_side_person","amount":5}}]},{"key":"men_addon_thursday","title":"Thursday Add-On (Thursdays only)","type":"toggle","side":"men","help":"Cholent, Kugel, and Kishka with Gravy. Tray quantities scale with guest count.","options":[{"label":"Add Thursday package","price":{"model":"per_side_person","amount":7.5}}]},{"key":"men_addon_bread_chummus","title":"Individual Bread & Chummus (+$6/pp)","type":"toggle","side":"men","help":"2 mini baguettes + individual chummus per guest. Replaces standard bread station. Not needed with Individual Starter.","options":[{"label":"Add bread & chummus","price":{"model":"per_side_person","amount":6}}]},{"key":"women_info","title":"Women''s Buffet","type":"info","help":"10 guests: 4 hot dishes · 20: 6 · 30: 8 · 40+: 10. Refills (40+): 50→2, 60→4, 70→6, 80→8, 90→10, 100→12. Refills are discretionary; extra refills billed per tray after the event."},{"key":"women_main","title":"Women''s — Main Dishes","type":"multi","side":"women","count":{"by_tier":{"source":"women","tiers":[{"min":0,"choose":2},{"min":20,"choose":3},{"min":30,"choose":4},{"min":40,"choose":4}]}},"options":[{"label":"Buffalo Poppers"},{"label":"Crispy Chicken"},{"label":"Cornflake Chicken"},{"label":"Popcorn Chicken"},{"label":"Jack Daniels Poppers"},{"label":"Crispy Beef","price":{"model":"per_side_person","amount":2.5}},{"label":"Pepper Steak","price":{"model":"per_side_person","amount":2.5}},{"label":"Cholent (Thursday only)"}]},{"key":"women_app","title":"Women''s — Appetizers","type":"multi","side":"women","count":{"by_tier":{"source":"women","tiers":[{"min":0,"choose":1},{"min":20,"choose":2},{"min":30,"choose":2},{"min":40,"choose":4}]}},"options":[{"label":"Crispy Cauliflower"},{"label":"Burger Bites"},{"label":"Pastrami Fritos"},{"label":"Franks N Blanks"},{"label":"Mini Potato Knishes"},{"label":"Beef Cigars"},{"label":"Potato Kugel"},{"label":"Kishka & Gravy"},{"label":"Egg Rolls"}]},{"key":"women_side","title":"Women''s — Side Dishes","type":"multi","side":"women","count":{"by_tier":{"source":"women","tiers":[{"min":0,"choose":1},{"min":20,"choose":1},{"min":30,"choose":2},{"min":40,"choose":2}]}},"options":[{"label":"Fries"},{"label":"Spicy Fries"},{"label":"Onion Rings"},{"label":"Grilled Vegetables"},{"label":"Yellow Rice"},{"label":"White Rice"}]},{"key":"women_salads","title":"Women''s — Salads","type":"multi","side":"women","count":{"by_tier":{"source":"women","tiers":[{"min":0,"choose":1},{"min":20,"choose":2}]}},"options":[{"label":"Caesar Salad"},{"label":"Deli Salad"},{"label":"Mexican Chop Salad"},{"label":"Caesar Steak Salad"}]},{"key":"women_bread","title":"Women''s — Bread Station","type":"choose","required":true,"options":[{"label":"Standard bread station — assorted dinner rolls"},{"label":"Individual upgrade — select Bread & Chummus or Starter in Add-Ons"}]},{"key":"women_dessert","title":"Women''s — Plated Dessert","type":"choose","required":true,"options":[{"label":"Chocolate Soufflé & Vanilla Ice Cream"},{"label":"Apple Cobbler & Vanilla Ice Cream"},{"label":"Cinnamon Churros & Vanilla Ice Cream"},{"label":"Dessert Station Upgrade (replaces plated dessert)"}]},{"key":"women_addon_charger","title":"Charger & Dinner Plate Upgrade","type":"toggle","side":"women","options":[{"label":"Add charger & dinner plate","price":{"model":"per_side_person","amount":4}}]},{"key":"women_addon_starter","title":"Individual Starter (+$16/pp)","type":"choose","side":"women","help":"Includes 2 mini baguettes, individual chummus, and your selected starter. Replaces the standard bread station.","options":[{"label":"Chicken Caesar Salad with BBQ Grilled Chicken","price":{"model":"per_side_person","amount":16}},{"label":"Chicken Caesar Salad with Baby Chicken","price":{"model":"per_side_person","amount":16}},{"label":"Chicken Caesar Salad with Schnitzel","price":{"model":"per_side_person","amount":16}},{"label":"Deli Salad","price":{"model":"per_side_person","amount":16}},{"label":"Caesar Steak Salad","price":{"model":"per_side_person","amount":16}}]},{"key":"women_addon_wrap","title":"Wrap Platter Add-On","type":"toggle","side":"women","help":"Mini wraps, displayed and refilled: Pulled Brisket · Pastrami · Schnitzel · Grilled Chicken","options":[{"label":"Add wrap platter","price":{"model":"per_side_person","amount":7}}]},{"key":"women_addon_sandwich","title":"Sandwich Platter Add-On","type":"toggle","side":"women","options":[{"label":"Add sandwich platter","price":{"model":"per_side_person","amount":7}}]},{"key":"women_addon_soup","title":"Soup","type":"multi","optional_group":true,"side":"women","count":{"fixed":{"min":0,"max":2}},"help":"+$4/pp for one soup, +$6/pp for two. Barley Beef adds $5/pp.","section_price":{"model":"per_person_by_count","by_count":{"1":4,"2":6}},"options":[{"label":"Homestyle Chicken Matzah Ball Soup"},{"label":"Cream of Chicken Soup"},{"label":"Cream of Zucchini Soup"},{"label":"Butternut Squash Soup"},{"label":"Barley Beef Soup","price":{"model":"per_side_person","amount":5}}]},{"key":"women_addon_platters","title":"Dessert Platters","type":"multi","optional_group":true,"side":"women","options":[{"label":"Large Fruit Platter","price":{"model":"flat","amount":125}},{"label":"Assorted Petite Four Platter","price":{"model":"flat","amount":125}}]},{"key":"women_addon_station","title":"Dessert Station Upgrade (+$6/pp — replaces plated dessert)","type":"multi","optional_group":true,"side":"women","section_price":{"model":"per_person","amount":6},"options":[{"label":"Churros with Vanilla Ice Cream"},{"label":"Chocolate Soufflé with Vanilla Ice Cream"},{"label":"Apple Cobbler with Vanilla Ice Cream"}]},{"key":"women_addon_passing","title":"Dessert Passing (+$5/pp)","type":"toggle","side":"women","help":"Mini pops passed tableside, in addition to plated dessert: Orange Creamsicle · Green Apple · Raspberry Lemon","options":[{"label":"Add Dessert Passing","price":{"model":"per_side_person","amount":5}}]},{"key":"women_addon_thursday","title":"Thursday Add-On (Thursdays only)","type":"toggle","side":"women","help":"Cholent, Kugel, and Kishka with Gravy. Tray quantities scale with guest count.","options":[{"label":"Add Thursday package","price":{"model":"per_side_person","amount":7.5}}]},{"key":"women_addon_bread_chummus","title":"Individual Bread & Chummus (+$6/pp)","type":"toggle","side":"women","help":"2 mini baguettes + individual chummus per guest. Replaces standard bread station. Not needed with Individual Starter.","options":[{"label":"Add bread & chummus","price":{"model":"per_side_person","amount":6}}]},{"key":"dietary","title":"Dietary Restrictions & Allergies","type":"text","help":"Any restrictions, allergies, or special dietary needs (all guests)."},{"key":"vendors","title":"Outside Vendors","type":"multi","optional_group":true,"options":[{"label":"Photographer/Videographer"},{"label":"DJ/Band/Live Music"},{"label":"Outside Decorations (requires prior permission)"}]},{"key":"vendor_details","title":"Vendor Details","type":"text"},{"key":"notes","title":"Additional Notes","type":"text"}]}'::jsonb),
('event_production', 'Event Production & Décor (Add-On Sheet)', 'Production & Party Planning', 30, '{"slug":"event_production","name":"Event Production & Décor (Add-On Sheet)","category":"Production & Party Planning","sort_order":30,"base":{"adult_pp":0,"child_pp":0,"notes":"Add-on production sheet — combine with any menu. All prices editable per engagement."},"sections":[{"key":"stations","title":"Food Stations","type":"multi","optional_group":true,"help":"Chef-attended stations, priced per station setup.","options":[{"label":"Carving Station (chef attended)","price":{"model":"per_tray","amount":450,"unit":"station"}},{"label":"Sushi Station","price":{"model":"per_tray","amount":600,"unit":"station"}},{"label":"Salad Station","price":{"model":"per_tray","amount":250,"unit":"station"}},{"label":"Pasta / Action Station","price":{"model":"per_tray","amount":400,"unit":"station"}},{"label":"Dessert Station","price":{"model":"per_tray","amount":350,"unit":"station"}}]},{"key":"stations_qty","title":"Station Quantities","type":"qty","help":"Enter how many of each selected station.","options":[{"label":"Carving Station","price":{"model":"per_tray","amount":450,"unit":"station"}},{"label":"Sushi Station","price":{"model":"per_tray","amount":600,"unit":"station"}},{"label":"Salad Station","price":{"model":"per_tray","amount":250,"unit":"station"}},{"label":"Pasta / Action Station","price":{"model":"per_tray","amount":400,"unit":"station"}},{"label":"Dessert Station","price":{"model":"per_tray","amount":350,"unit":"station"}}]},{"key":"passings","title":"Passed Hors d''Oeuvres","type":"toggle","help":"Butler-passed during reception, priced per person.","options":[{"label":"Add passed hors d''oeuvres service","price":{"model":"per_person","amount":9}}]},{"key":"av","title":"AV, Lighting & Staging","type":"qty","optional_group":true,"options":[{"label":"Pinspot","price":{"model":"per_tray","amount":35,"unit":"fixture"}},{"label":"Uplight","price":{"model":"per_tray","amount":25,"unit":"fixture"}},{"label":"Sound System","price":{"model":"per_tray","amount":250,"unit":"system"}},{"label":"Stage Section (4x8)","price":{"model":"per_tray","amount":150,"unit":"section"}},{"label":"Dance Floor Section","price":{"model":"per_tray","amount":100,"unit":"section"}}]},{"key":"entertainment","title":"Entertainment & Media","type":"multi","optional_group":true,"options":[{"label":"DJ (4 hours)","price":{"model":"flat","amount":1200}},{"label":"Photographer","price":{"model":"flat","amount":1500}},{"label":"Videographer","price":{"model":"flat","amount":1800}}]},{"key":"decor","title":"Décor & Florals","type":"qty","optional_group":true,"options":[{"label":"Floral Centerpiece","price":{"model":"per_tray","amount":85,"unit":"arrangement"}},{"label":"Statement Arrangement","price":{"model":"per_tray","amount":250,"unit":"arrangement"}},{"label":"Linen Upgrade","price":{"model":"per_tray","amount":18,"unit":"table"}},{"label":"Charger Plates","price":{"model":"per_person","amount":4}}]},{"key":"stationery","title":"Stationery & Signage","type":"multi","optional_group":true,"options":[{"label":"Printed Menu Cards","price":{"model":"per_person","amount":1.5}},{"label":"Table Numbers","price":{"model":"flat","amount":40}},{"label":"Seating Chart Board","price":{"model":"flat","amount":75}},{"label":"Place Cards","price":{"model":"per_person","amount":1}}]},{"key":"staffing","title":"Service & Staffing","type":"qty","optional_group":true,"options":[{"label":"Overtime","price":{"model":"per_tray","amount":200,"unit":"half hour"}},{"label":"Additional Server","price":{"model":"per_tray","amount":150,"unit":"staff"}},{"label":"Coat Check Attendant","price":{"model":"per_tray","amount":120,"unit":"staff"}}]},{"key":"production_notes","title":"Production Notes","type":"text"}]}'::jsonb)
on conflict (slug) do update set name = excluded.name, category = excluded.category,
  sort_order = excluded.sort_order, config = excluded.config, updated_at = now();

-- ─────────────────────────────────────────────────────────────────────────
-- FROM: email_automations.sql
-- ─────────────────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════
-- EMAIL AUTOMATIONS — configurable automation catalog. Safe to re-run:
-- existing rows keep their enabled/subject/body/timing edits (only inserts new keys).
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists email_automations (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  category text not null,
  enabled boolean default false,
  recipient text default 'customer' check (recipient in ('customer','internal')),
  subject text not null,
  body text not null,
  trigger text not null,
  offset_minutes int not null default 0,
  status_filter text[],
  require_balance boolean default false,
  sort_order int default 100,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table email_automations enable row level security;
do $$ begin
  create policy "team full access" on email_automations for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Dedupe ledger: one send per automation per booking, ever.
create table if not exists email_sends (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references email_automations(id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,
  sent_at timestamptz default now(),
  unique (automation_id, booking_id)
);
alter table email_sends enable row level security;
do $$ begin
  create policy "team full access" on email_sends for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

insert into email_automations
  (key, name, category, enabled, recipient, subject, body, trigger, offset_minutes, status_filter, require_balance, sort_order)
values
('hold_confirmation', 'Hold Confirmation', 'Lead & Inquiry', true, 'customer', '⏳ Your date is on hold! {{event_date}} — Event Space by Burger Bar', 'Dear {{contact_name}},

Great news — we''ve placed a 24-hour courtesy hold for you:

Event: {{event_name}}
Date: {{event_date}} at {{event_time}}
Invoice #: {{invoice_num}}

⏰ This hold expires {{hold_expires}}.

To confirm your date, a {{deposit_amount}} deposit is required before the hold expires. We accept cash, check, Zelle, or credit card over the phone.

📞 Call us at {{business_phone}} and we''ll take care of it in two minutes.

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'action', 0, null, false, 10),
('inquiry_followup', 'Inquiry Follow-Up (no response)', 'Lead & Inquiry', false, 'customer', 'Still thinking it over? {{event_date}} — Event Space by Burger Bar', 'Dear {{contact_name}},

Just checking in on your inquiry for {{event_name}} on {{event_date}}. We''d love to host you!

If you have any questions about menus, pricing, or the space, call us at {{business_phone}} — happy to help.

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'created', 2880, array['on_hold','hold_expired'], false, 20),
('hold_expiring_warning', 'Hold Expiring Warning', 'Lead & Inquiry', true, 'customer', '⏰ Your hold expires soon — {{event_date}} — Event Space by Burger Bar', 'Dear {{contact_name}},

A quick heads-up: your courtesy hold on {{event_date}} at {{event_time}} expires at {{hold_expires}}.

To lock in your date, we just need the {{deposit_amount}} deposit — cash, check, Zelle, or credit card over the phone.

📞 {{business_phone}} — it takes two minutes. After the hold expires the date opens up to other inquiries.

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'hold_expires', -120, null, false, 30),
('hold_expired_notice', 'Hold Expired Notification', 'Lead & Inquiry', false, 'customer', 'Your hold on {{event_date}} has expired — Event Space by Burger Bar', 'Dear {{contact_name}},

The courtesy hold on {{event_date}} for {{event_name}} has expired, and we can no longer reserve the date.

As of now the date is still open — to secure it, a {{deposit_amount}} deposit is required.

📞 {{business_phone}} or reply to this email and we''ll take care of it right away.

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'hold_expires', 60, array['on_hold','hold_expired'], false, 40),
('deposit_received', 'Deposit Received / Booking Confirmation', 'Booking', true, 'customer', '🎉 You''re booked! {{event_date}} — Event Space by Burger Bar', 'Dear {{contact_name}},

Your deposit has been received — your date is officially confirmed!

Event: {{event_name}}
Date: {{event_date}} at {{event_time}}
Invoice #: {{invoice_num}}
Deposit applied: {{deposit_amount}}

NEXT STEP — let''s plan your menu. Pick a time for a quick call:
👉 {{scheduling_link}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'action', 0, null, false, 50),
('balance_due_reminder', 'Balance Due Reminder', 'Booking', false, 'customer', 'Balance reminder for {{event_date}} — Event Space by Burger Bar', 'Dear {{contact_name}},

Your event is almost here! A friendly reminder that your remaining balance of {{balance}} is due.

We accept cash, check, Zelle, or credit card (3% processing fee applies to cards).

📞 {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -4320, null, true, 60),
('cancellation_confirmation', 'Cancellation Confirmation', 'Booking', false, 'customer', 'Cancellation confirmed — {{event_name}} — Event Space by Burger Bar', 'Dear {{contact_name}},

This confirms the cancellation of {{event_name}} on {{event_date}} (Invoice #{{invoice_num}}).

If anything changes, we''d love to host you another time.

📞 {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'action', 0, null, false, 70),
('menu_scheduling_invite', 'Menu Scheduling Invitation (with menus)', 'Planning', true, 'customer', '📅 Let''s plan your menu! — {{event_name}} — Event Space by Burger Bar', 'Dear {{contact_name}},

Your date is confirmed — now let''s plan your menu! Please pick a time for a quick menu call:

👉 {{scheduling_link}}

⏰ Please schedule by {{menu_deadline}} (7 days before your event) so the kitchen can prepare.

Review our menus before the call:
📄 Full Service: {{full_service_menu}}
📄 Buffet: {{buffet_menu}}

During the call we''ll go through your selections, add-ons, guest count, and any dietary needs.

Prefer to call us directly? {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'action', 0, null, false, 80),
('menu_scheduling_reminder', 'Menu Scheduling Reminder (escalating)', 'Planning', true, 'customer', '⏰ Reminder: please schedule your menu call — {{event_name}}', 'Dear {{contact_name}},

We still need to schedule your menu call for {{event_name}} on {{event_date}}. The deadline to plan your menu is {{menu_deadline}} (7 days before your event).

Please pick a time as soon as possible:
👉 {{scheduling_link}}

📄 Full Service: {{full_service_menu}}
📄 Buffet: {{buffet_menu}}

Or call us directly: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'menu_schedule_ladder', 0, null, false, 90),
('menu_call_reminder', 'Menu Call Reminder', 'Planning', true, 'customer', '📞 Reminder: your menu call is in about an hour', 'Dear {{contact_name}},

A friendly reminder that your menu planning call for {{event_name}} is coming up:

🕐 {{menu_call_time}}

We''ll call you at {{phone}}. Have your guest count estimate and any dietary needs handy.

Need to reschedule? 👉 {{scheduling_link}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'menu_call', -60, null, false, 100),
('menu_selections_due', 'Menu Selections Due Reminder', 'Planning', false, 'customer', 'Your menu is due soon — {{event_name}} on {{event_date}}', 'Dear {{contact_name}},

Your event is {{event_date}} and we haven''t finalized your menu yet. Let''s get it done so the kitchen can prepare!

Schedule your menu call: {{scheduling_link}}
Or call us: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -14400, array['schedule_menu_discussion','send_menu_form'], false, 110),
('guest_count_reminder', 'Final Guest Count Due', 'Planning', false, 'customer', 'Final guest count needed — {{event_name}} on {{event_date}}', 'Dear {{contact_name}},

We need your final guest count for {{event_date}} so we can prepare and finalize your invoice.

Please reply with your counts (men / women / children) or call {{business_phone}}.

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -10080, array['confirm_guest_count'], false, 120),
('vendor_info_reminder', 'Vendor Information Reminder', 'Planning', false, 'customer', 'Outside vendors for {{event_name}} — details needed', 'Dear {{contact_name}},

If you''re bringing outside vendors (photographer, music, decorations) to your event on {{event_date}}, please send us their details and setup requirements this week.

Note: outside decorations require prior permission.

📞 {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -20160, null, false, 130),
('pre_event_90d', '90-Day Reminder', 'Pre-Event', false, 'customer', '90 days to go! {{event_name}} — Event Space by Burger Bar', 'Dear {{contact_name}},

{{event_name}} is 90 days away ({{event_date}} at {{event_time}})!

Questions about menu, setup, or anything else? We''re here: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -129600, null, false, 140),
('pre_event_60d', '60-Day Reminder', 'Pre-Event', false, 'customer', '60 days to go! {{event_name}} — Event Space by Burger Bar', 'Dear {{contact_name}},

{{event_name}} is 60 days away ({{event_date}} at {{event_time}})!

Questions about menu, setup, or anything else? We''re here: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -86400, null, false, 150),
('pre_event_30d', '30-Day Reminder', 'Pre-Event', false, 'customer', '30 days to go! {{event_name}} — Event Space by Burger Bar', 'Dear {{contact_name}},

{{event_name}} is 30 days away ({{event_date}} at {{event_time}})!

Questions about menu, setup, or anything else? We''re here: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -43200, null, false, 160),
('pre_event_14d', '14-Day Reminder', 'Pre-Event', false, 'customer', '14 days to go! {{event_name}} — Event Space by Burger Bar', 'Dear {{contact_name}},

{{event_name}} is 14 days away ({{event_date}} at {{event_time}})!

Questions about menu, setup, or anything else? We''re here: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -20160, null, false, 170),
('pre_event_7d', '7-Day Reminder', 'Pre-Event', false, 'customer', '7 days to go! {{event_name}} — Event Space by Burger Bar', 'Dear {{contact_name}},

{{event_name}} is 7 days away ({{event_date}} at {{event_time}})!

Questions about menu, setup, or anything else? We''re here: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -10080, null, false, 180),
('pre_event_3d', '3-Day Reminder', 'Pre-Event', false, 'customer', '3 days to go! {{event_name}} — Event Space by Burger Bar', 'Dear {{contact_name}},

{{event_name}} is 3 days away ({{event_date}} at {{event_time}})!

Questions about menu, setup, or anything else? We''re here: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -4320, null, false, 190),
('pre_event_24h', '24-Hour Reminder', 'Pre-Event', false, 'customer', 'Tomorrow''s the day! {{event_name}}', 'Dear {{contact_name}},

We''re all set for tomorrow — {{event_date}} at {{event_time}}.

The room will be ready, the kitchen is prepped, and we can''t wait to celebrate with you.

Anything last-minute: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -1440, null, false, 200),
('day_of_info', 'Day-of-Event Information', 'Pre-Event', false, 'customer', 'Today''s details — {{event_name}}', 'Dear {{contact_name}},

Today''s the day! {{event_name}} at {{event_time}}.

Arrival: doors open 30 minutes before your start time for setup and vendors.
Questions on the day: {{business_phone}}

See you soon!

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -360, null, false, 210),
('thank_you', 'Thank-You Email', 'Post-Event', false, 'customer', 'Thank you for celebrating with us! 💙', 'Dear {{contact_name}},

Thank you for choosing Event Space by Burger Bar for {{event_name}}. It was a pleasure hosting you and your guests!

We hope everything was exactly as you imagined.

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event_completed', 1440, null, false, 220),
('review_request', 'Review Request', 'Post-Event', false, 'customer', 'How did we do? — {{event_name}}', 'Dear {{contact_name}},

We''d love your feedback on {{event_name}}! A quick review helps other families find us and helps us improve.

Reply to this email with any thoughts, or leave a review online — it means a lot.

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event_completed', 4320, null, false, 230),
('referral_request', 'Referral Request', 'Post-Event', false, 'customer', 'Know someone planning a simcha?', 'Dear {{contact_name}},

If a friend or family member is planning an event, we''d be honored by the referral — and we''ll take extra-good care of them.

📞 {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event_completed', 20160, null, false, 240),
('outstanding_balance', 'Outstanding Balance (post-event)', 'Post-Event', false, 'customer', 'Outstanding balance — {{event_name}} (Invoice #{{invoice_num}})', 'Dear {{contact_name}},

Thank you again for celebrating with us! Our records show an outstanding balance of {{balance}} on Invoice #{{invoice_num}}.

We accept cash, check, Zelle, or credit card (3% fee). 📞 {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event_completed', 2880, null, true, 250),
('marketing_followup', 'Follow-Up Marketing (anniversary)', 'Post-Event', false, 'customer', 'It''s almost a year since {{event_name}}!', 'Dear {{contact_name}},

Hard to believe it''s been nearly a year since {{event_name}}! If another simcha is on the horizon, we''d love to host you again.

📞 {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event_completed', 475200, null, false, 260),
('internal_new_booking', 'Internal: New Booking Alert', 'Operational Alerts', false, 'internal', '[INTERNAL] New booking: #{{invoice_num}} {{contact_name}} — {{event_date}}', 'New booking created.

#{{invoice_num}} — {{contact_name}} ({{phone}})
{{event_name}} · {{event_date}} {{event_time}} · {{menu_type}} · ~{{guests}} guests', 'action', 0, null, false, 270),
('internal_menu_overdue', 'Internal: Menu Call Missed', 'Operational Alerts', false, 'internal', '[INTERNAL] Menu call missed — #{{invoice_num}} {{contact_name}}', 'The scheduled menu call at {{menu_call_time}} for #{{invoice_num}} ({{contact_name}}, {{phone}}) is an hour past and the menu isn''t completed. Follow up.', 'menu_call', 60, null, false, 280),
('internal_payment_missing', 'Internal: Missing Payment Alert', 'Operational Alerts', false, 'internal', '[INTERNAL] Unpaid balance, event tomorrow — #{{invoice_num}}', '#{{invoice_num}} {{contact_name}} — event {{event_date}} {{event_time}} — balance {{balance}} still open. Collect before or at the event.', 'event', -1440, null, true, 290)
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- FROM: package_guides.sql
-- ─────────────────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════
-- PACKAGE SELL SHEETS — rep talk-tracks for each package, editable in Back Office.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists package_guides (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  price_label text,
  includes text,        -- what's in the package
  best_for text,        -- who it suits
  talk_track text,      -- how to present it
  upsells text,         -- upgrade angles
  sort_order int default 100,
  updated_at timestamptz default now()
);
alter table package_guides enable row level security;
do $$ begin
  create policy "team full access" on package_guides for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

insert into package_guides (key, name, price_label, includes, best_for, talk_track, upsells, sort_order) values
('full_service', 'Full Service Plated Dinner', '$60 / person (min 40)',
 'Complete place settings & beverages, professional service for 2.5 hours, choice of starter, soup, beef & chicken mains, two sides, and dessert. Tables include coleslaw & pickles; each setting includes 2 mini baguettes & hummus.',
 'Weddings, formal sheva brochos, milestone simchas — anyone who wants a sit-down, served experience where guests are taken care of at the table.',
 'Lead with the experience, not the food list: "Your guests sit, relax, and everything comes to them — plated and served, start to finish." Emphasize the 2.5 hours of professional service and that it''s fully turnkey. Mention the individual starter and dessert as signature touches.',
 'Guest choice of two chicken options (+$5/pp) · Rib steak upgrade · Family-style appetizer platters (+$7/pp) · Slider platters (+$6.50/pp) · Dessert station (+$6/pp) · Reception smorgasbord.',
 10),
('single_buffet', 'Single Buffet Station', '$60 / person (min 40, $2,400 min)',
 'One shared buffet station: 10 hot dishes (your choice of mains, appetizers, sides), 2 salads, included slider platters, bread station, plated dessert, and beverages. 2.5 hours of service.',
 'Bar/bat mitzvahs, casual simchas, mixed crowds — when you want abundance and variety without the formality of plated service.',
 'Sell the variety and generosity: "Ten hot dishes, sliders, salads — guests build their own plates and there''s something for everyone." Great for crowds with kids and varied tastes. Note refills are handled by the kitchen as needed.',
 'Charger plate upgrade (+$4/pp) · Individual starter (+$16/pp) · Wrap or sandwich platters (+$7/pp) · Soup (+$4–6/pp) · Dessert station (+$6/pp) · Thursday cholent package (+$7.50/pp).',
 20),
('double_buffet', 'Double Buffet Stations', '$70 / person (min 40, $2,800 min)',
 'Two separate buffet stations — one for men, one for women — each fully stocked with hot dishes, appetizers, sides, salads, sliders, bread, and dessert. 2.5 hours of service.',
 'Events with a mechitzah or separate seating where you want each side to have its own full station — no crossing over, no waiting.',
 'Frame it as comfort and flow: "Each side has its own complete buffet, so nobody crosses the mechitzah and there''s no bottleneck." The $10/pp premium over single buffet buys convenience and dignity for both sides.',
 'Same add-ons as single buffet, available per side · Premium meats · Per-side dessert stations · Per-side soup.',
 30);
