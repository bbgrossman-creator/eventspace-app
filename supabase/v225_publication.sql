-- v225 — PUBLICATION (docs/PUBLICATION.md): the Version Override and the
-- presentation snapshot live ON THE VERSION (§13-b: they copy, snapshot,
-- and lock with it).
--   theme_key               — the named/built-in theme this version wears (null = brand/system)
--   theme_override          — the VERSION OVERRIDE: a sparse ThemeDelta (jsonb)
--   presentation_snapshot   — the resolved theme actually SENT (stamped on every
--                             transition into 'sent'; re-send re-stamps; approval
--                             locks the last stamp forever)
--   presentation_stamped_at — when the last stamp was taken
alter table proposal_versions add column if not exists theme_key text;
alter table proposal_versions add column if not exists theme_override jsonb;
alter table proposal_versions add column if not exists presentation_snapshot jsonb;
alter table proposal_versions add column if not exists presentation_stamped_at timestamptz;
