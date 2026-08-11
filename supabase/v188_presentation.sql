-- ═══════════════════════════════════════════════════════════════════════════
-- v188A — Customer Presentation
--
-- Choice groups (the v179-reserved choice_group_id finally gets its metadata):
-- a named "Choose N" rule at the version level.
--
-- price_visibility on the version: full | sections | hidden.
-- customer_intro / customer_closing — presentation prose (cover-letter voice).
--
-- served_with — OPTIONAL item-level accompaniment ("Mini Beef Sliders /
-- served with Whole-grain Dijon"). A child PROPERTY of an item, not a
-- component, band, or component-wide inclusion — so the kitchen later knows
-- exactly which sauce pairs with which item instead of guessing from one
-- vague condiment list. Travels on every copy path.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists choice_groups (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references proposal_versions(id) on delete cascade,
  section_type_id uuid references section_types(id) on delete set null,
  label text not null default 'Choose your selection',
  choose_count int not null default 1,
  position int not null default 0
);
create index if not exists idx_choice_groups_version on choice_groups (version_id);

alter table proposal_versions
  add column if not exists price_visibility text not null default 'full',
  add column if not exists customer_intro text,
  add column if not exists customer_closing text;

alter table component_items
  add column if not exists served_with text;

alter table choice_groups disable row level security;
