-- ═══════════════════════════════════════════════════════════════════════════
-- v179 — Proposal Studio: optional upgrades + reserved choice-group fields
--
-- item_role: 'included' (default — normal line) | 'optional' (upgrade the
-- customer may add). selected: for optional items, whether it's currently
-- chosen (drives Base / With Selected / Potential Upside). Included items
-- ignore `selected`.
--
-- RESERVED (doctrine + design v2): choice groups ("Choose ONE: chicken /
-- salmon +$4") are customer-facing and ship with v180; their schema lands now
-- so the data model doesn't need surgery later. Studio v179 neither reads nor
-- writes choice_group_id / is_default_choice.
-- ═══════════════════════════════════════════════════════════════════════════
alter table component_items
  add column if not exists item_role text not null default 'included',
  add column if not exists selected boolean not null default true,
  add column if not exists choice_group_id uuid,
  add column if not exists is_default_choice boolean not null default false;
