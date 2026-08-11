-- ═══════════════════════════════════════════════════════════════════════════
-- v168 — Event Debriefs (Knowledge Architecture step 5)
-- Three questions at close-out: What worked? What didn't? What would you
-- absolutely repeat? Free text, not ratings — organizational wisdom that
-- becomes searchable in the Rolodex ("outdoor wedding wind" → "never use
-- lightweight chuppah draping outdoors"). Answering is always optional; the
-- cron opens an ignorable task at the honest moment (event completion).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists event_debriefs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  component_id uuid references event_components(id) on delete set null,
  author text,
  worked text,
  didnt_work text,
  would_repeat text,
  created_at timestamptz not null default now()
);
create index if not exists idx_debriefs_booking on event_debriefs (booking_id);

-- Standing rule: RLS stays disabled on app tables until multi-tenancy cutover.
alter table event_debriefs disable row level security;
