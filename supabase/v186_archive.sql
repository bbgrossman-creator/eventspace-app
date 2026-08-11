-- ═══════════════════════════════════════════════════════════════════════════
-- v186 — Version Archive (retraction from knowledge, not deletion)
--
-- "Archive is a business decision, not a lifecycle stage." Orthogonal to
-- proposal_versions.status: a Sent or Approved version can be archived for an
-- administrative reason. Superseded ≠ archived — old versions stay history.
--
-- Archived = retracted from the TRUSTED COMMERCIAL RECORD. Excluded (via a
-- simple archived_at IS NULL filter, never a rewrite) from: price memory,
-- last-sold, ranges, reuse counts, blueprint candidates. Reversible.
--
-- Operational truth is untouched by design: memory queries gate on
-- proposal_version_id, so operational components (null version) are never in
-- scope — archiving a proposal cannot erase what the business actually did.
-- ═══════════════════════════════════════════════════════════════════════════
alter table proposal_versions
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;
create index if not exists idx_versions_archived on proposal_versions (proposal_id)
  where archived_at is null;
