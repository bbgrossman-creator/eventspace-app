-- v241 — PORTABLE PRESENTATION & TEMPLATES (PA-3 · PUBLISHING_ASSETS §0 §3 §5).
--
-- 1) publication_themes learns to hold BOTH asset kinds. THEME = design
--    vocabulary (delta). TEMPLATE = a named portable presentation
--    (portable jsonb: theme key + document delta + regions + role-keyed
--    section dress + section pins). The domain declares asset_kind
--    because Apply Theme and Apply Template have different replacement
--    scopes and must never confuse.
alter table publication_themes add column if not exists asset_kind text not null default 'theme';
alter table publication_themes add column if not exists description text;
alter table publication_themes add column if not exists portable jsonb;
alter table publication_themes drop constraint if exists publication_themes_asset_kind_check;
alter table publication_themes add constraint publication_themes_asset_kind_check
  check (asset_kind in ('theme', 'template'));

-- 2) PROVENANCE, NOT RECONSTRUCTION: recorded at application time —
--    template_id · fingerprint · applied_at · mode. Never inferred from
--    theme_key, which post-edit proposals falsify in both directions.
alter table proposal_versions add column if not exists presentation_provenance jsonb;

-- Verify
select column_name from information_schema.columns
 where table_name = 'publication_themes'
   and column_name in ('asset_kind', 'description', 'portable');
select column_name from information_schema.columns
 where table_name = 'proposal_versions' and column_name = 'presentation_provenance';
