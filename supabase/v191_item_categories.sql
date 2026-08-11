-- ═══════════════════════════════════════════════════════════════════════════
-- v191 — ITEM CATEGORIES (presentation headings) + PRESENTATION NOTE
--
-- Presentation metadata, NOT an operational hierarchy. Categories are
-- component-local: they live in a jsonb column on the component, so they copy
-- with the component, carry no pricing, have no independent lifecycle, and add
-- ZERO new security surface (no table, no tenant_id, no policies, no triggers,
-- no FK remapping in a future tenant transfer).
--
-- 1. component_items.served_with → presentation_note  (SEMANTIC migration)
--      The renderer hard-coded the "served with " prefix, so stored values are
--      FRAGMENTS ("Whole-grain Dijon"). The field has outgrown accompaniments
--      ("Prepared fresh throughout cocktail hour", "Choose one sauce"), so the
--      prefix leaves the renderer and existing fragments are backfilled into
--      complete sentences. Guarded so it runs exactly once.
--
-- 2. event_components.item_categories (jsonb) — ordered category definitions:
--      [{ "key":"rolls", "label":"Signature Rolls", "position":10,
--         "layout":"dot", "show_heading":true }, ...]
--    'key' is component-local; items point at it. Label lives in ONE place, so
--    five items sharing a category cannot drift apart. No speculative fields —
--    jsonb lets us add more the day a feature actually reads them.
--
-- 3. event_components.item_layout — component default: vertical | comma | dot
-- 4. event_components.uncategorized_position — top | bottom (default bottom:
--    an uncategorized straggler must not jump above Entrées)
-- 5. component_items.category_key — points at a category key; NULL = ungrouped
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. served_with → presentation_note (rename + one-time prefix backfill) ──
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'component_items'
      and column_name = 'served_with'
  ) then
    alter table public.component_items rename column served_with to presentation_note;

    -- Fragments become complete sentences, since the renderer no longer
    -- prefixes. Guard against double-prefixing anything already spelled out.
    update public.component_items
       set presentation_note = 'Served with ' || presentation_note
     where presentation_note is not null
       and btrim(presentation_note) <> ''
       and lower(btrim(presentation_note)) not like 'served with%';

    raise notice 'v191: served_with renamed to presentation_note; fragments backfilled';
  else
    raise notice 'v191: presentation_note already present — rename skipped';
  end if;
end $$;

-- ── 2-4. Component-level presentation columns ───────────────────────────────
alter table public.event_components
  add column if not exists item_categories jsonb not null default '[]'::jsonb;

alter table public.event_components
  add column if not exists item_layout text not null default 'vertical';

alter table public.event_components
  add column if not exists uncategorized_position text not null default 'bottom';

-- Constraints added separately so re-running doesn't error on an existing one.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_components_item_layout_chk') then
    alter table public.event_components
      add constraint event_components_item_layout_chk
      check (item_layout in ('vertical','comma','dot'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_components_uncat_pos_chk') then
    alter table public.event_components
      add constraint event_components_uncat_pos_chk
      check (uncategorized_position in ('top','bottom'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_components_item_categories_chk') then
    -- Shape guard only: must be a json ARRAY. Field-level validation stays in
    -- the app (the renderer tolerates unknown/missing keys by design).
    alter table public.event_components
      add constraint event_components_item_categories_chk
      check (jsonb_typeof(item_categories) = 'array');
  end if;
end $$;

-- ── 5. Item → category pointer ──────────────────────────────────────────────
-- Deliberately NO foreign key: keys are component-local strings inside jsonb.
-- An orphaned key (category deleted) renders as uncategorized — graceful by
-- design, never an error.
alter table public.component_items
  add column if not exists category_key text;
