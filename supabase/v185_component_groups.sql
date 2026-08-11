-- ═══════════════════════════════════════════════════════════════════════════
-- v185 — Component Groups (bands): one optional grouping level, no new table.
--
-- Group identity = section + normalized(group_label). A band is a labeled
-- run of components within a section — NOT a container object. This caps
-- depth at four (Section → Group → Component → Item) without a tree editor,
-- and touches NOTHING below: a grouped component is still a component
-- (itemized/package, priced, copied, memory-tracked — all unchanged).
--
-- Multi-row consensus rules (enforced in code, per design):
--   • matching: trimmed, case-insensitive on group_label
--   • band order: MIN(group_position) among members
--   • band description: first non-empty among members; edits sync all members
--
-- group_description is DORMANT until the customer-facing PDF layer (presentation
-- face of a band); stored now so it travels intact on every copy path.
-- ═══════════════════════════════════════════════════════════════════════════
alter table event_components
  add column if not exists group_label text,
  add column if not exists group_position int not null default 0,
  add column if not exists group_description text;
