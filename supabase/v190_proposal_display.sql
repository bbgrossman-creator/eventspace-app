-- ═══════════════════════════════════════════════════════════════════════════
-- v190 — PROPOSAL DISPLAY MODES + ITEM VISIBILITY
--
-- Store operational truth; control customer presentation separately.
--   • event_components.proposal_display: how much detail the customer sees
--       'title_only'   — title + price only
--       'description'  — title + price + customer_description
--       'items'        — title + price + customer-visible items (default)
--   • component_items.show_on_proposal: per-item customer visibility
--       (true = customer sees it; false = internal-only for cost/ops/purchasing)
--
-- Both columns get DEFAULTs so existing rows and existing app inserts (which
-- don't yet supply them) keep working. tenant_id/RLS are untouched — these are
-- plain nullable-with-default columns on already-tenant-scoped tables.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- proposal_display: default 'items' so existing components immediately show
-- their items (fixes the preview bug for itemized components). Package
-- components historically showed only their description — preserve that for
-- rows currently in package mode by defaulting THEM to 'description'.
alter table public.event_components
  add column if not exists proposal_display text not null default 'items'
  check (proposal_display in ('title_only','description','items'));

-- Preserve prior behavior for existing package-mode components: they showed
-- description-only. New itemized components default to 'items'. Run once;
-- guarded so re-running doesn't clobber later manual choices.
do $$
begin
  if not exists (select 1 from public.event_components where proposal_display <> 'items') then
    update public.event_components
      set proposal_display = 'description'
      where pricing_mode = 'package';
  end if;
end $$;

alter table public.component_items
  add column if not exists show_on_proposal boolean not null default true;

-- Backfill safety: any NULLs (shouldn't exist given NOT NULL DEFAULT) → true.
update public.component_items set show_on_proposal = true where show_on_proposal is null;
