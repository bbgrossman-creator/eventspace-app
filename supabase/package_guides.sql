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
