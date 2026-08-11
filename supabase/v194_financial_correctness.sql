-- ═══════════════════════════════════════════════════════════════════════════
-- v194 — FINANCIAL CORRECTNESS (schema half)
--
-- Two additive columns. No new tables, no doctrines, no redesign.
-- Both default to today's behaviour, so existing rows are unaffected.
--
-- ── P0.4: package components cannot target a guest audience ────────────────
-- Items have applies_to_category_id (single FK). Packages have nothing — they
-- multiply against ALL guests unconditionally (pricingEngine `allCount`).
--
-- A single FK is NOT sufficient: the benchmark needs "adults + children,
-- exclude vendor meals", which one FK cannot express. So: an ARRAY of category
-- ids. NULL/empty = all guests (today's behaviour, unchanged).
--
--   null                      → all guests            (278)
--   {adults}                  → adults only           (220)
--   {adults,children}         → adults + children     (260)
--   {children}                → children only         (40)
--
-- Note: items keep their single-FK limitation. That asymmetry is REPORTED, not
-- fixed here — widening component_items.applies_to_category_id to an array
-- touches price memory, invoice generation and the catalog, and does not block
-- the benchmark. Filed for v195.
--
-- ── P0.5: "included", "free", "unknown" and "pending" are conflated ────────
-- Today two fields carry four meanings, badly:
--   unit_price IS NULL     → means BOTH "no price entered" (debt) and, in
--                            practice, "not applicable" (operational rows)
--   unit_price = 0         → means BOTH "included in another charge" and
--                            "deliberately free"
--   price_confirmed=false  → "pending" (this one is already correct)
--
-- price_state makes the authored intent explicit. It does NOT replace
-- unit_price or price_confirmed — it disambiguates them:
--
--   'quoted'   (default) → unit_price is the sell price. NULL ⇒ unknown ⇒ debt.
--   'included' → covered by another charge. Contributes 0. Renders "Included".
--                NEVER unpriced debt. unit_price ignored for totals.
--   'free'     → deliberately $0. Contributes 0. Renders "Complimentary".
--                NEVER debt.
--   'internal' → operational truth only; no financial line at all. Contributes
--                0, never debt, never rendered to the customer.
--
-- "Pending" stays price_confirmed=false (already correct, already amber).
-- "Unknown" stays unit_price IS NULL under state 'quoted' (the only debt case).
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── P0.4 ────────────────────────────────────────────────────────────────────
alter table public.event_components
  add column if not exists package_audience uuid[];

comment on column public.event_components.package_audience is
  'v194: guest_categories this package price multiplies against. NULL/empty = all guests. Only meaningful when pricing_mode=package and package_basis=per_person.';

-- ── P0.5 ────────────────────────────────────────────────────────────────────
alter table public.component_items
  add column if not exists price_state text not null default 'quoted';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'component_items_price_state_chk') then
    alter table public.component_items
      add constraint component_items_price_state_chk
      check (price_state in ('quoted','included','free','internal'));
  end if;
end $$;

comment on column public.component_items.price_state is
  'v194: quoted=unit_price is the sell price (NULL⇒unknown⇒debt) | included=covered by another charge | free=deliberately $0 | internal=operational only, no financial line. "Pending" remains price_confirmed=false.';

-- ── Backfill: make the benchmark's intent explicit ──────────────────────────
-- Items that are hidden from the proposal AND have no price were never sell
-- lines — they are operational truth (heat lamps, hot boxes, ice). Today they
-- silently create "unpriced" debt (P0.6). Mark them for what they are.
-- Scoped to unpriced+hidden only: a hidden item WITH a price is a real,
-- deliberate internal charge and is left alone.
update public.component_items
   set price_state = 'internal'
 where price_state = 'quoted'
   and show_on_proposal = false
   and unit_price is null;

-- Items priced exactly 0 that are customer-visible were the "Included" hack.
-- Only touch rows inside a choice group or explicitly zero — never guess at
-- rows that merely happen to be null.
update public.component_items
   set price_state = 'included'
 where price_state = 'quoted'
   and unit_price = 0
   and show_on_proposal = true;

-- ── Report ──────────────────────────────────────────────────────────────────
do $$
declare n_int int; n_inc int;
begin
  select count(*) into n_int from public.component_items where price_state = 'internal';
  select count(*) into n_inc from public.component_items where price_state = 'included';
  raise notice 'v194: % item(s) marked internal (no longer price debt), % marked included', n_int, n_inc;
end $$;
