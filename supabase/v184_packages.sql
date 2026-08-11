-- ═══════════════════════════════════════════════════════════════════════════
-- v184 — Package Mode + the component's faces
--
-- Two legitimate component kinds ("no fake precision"):
--   ITEMIZED — an assembly; items matter and carry prices (hors d'oeuvres).
--   PACKAGE  — sold/purchased as one unit (bread display, floral, AV);
--              decomposing it into 60 uncounted rolls would be invented data.
--
-- Faces: customer_description = PRESENTATION (marketing copy, customer-
-- visible later). Existing `notes` = the internal/production face.
-- package_cost is DORMANT (economics bridge, like unit_cost): collected
-- silently, feeds margin when the purchasing module exists, never touches
-- the sell price (doctrine: upward and visible, never sideways and automatic).
-- ═══════════════════════════════════════════════════════════════════════════
alter table event_components
  add column if not exists pricing_mode text not null default 'itemized',  -- itemized | package
  add column if not exists package_price numeric,
  add column if not exists package_basis text not null default 'flat',     -- flat | per_person
  add column if not exists package_taxable boolean not null default true,
  add column if not exists package_price_confirmed boolean not null default true,
  add column if not exists package_cost numeric,                           -- dormant
  add column if not exists customer_description text;
