-- Menu scheduling escalation: allow repeated sends (one per booking per day).
-- day_key is null for once-ever automations, 'ladder:<booking>:<date>' for the ladder.
alter table email_sends add column if not exists day_key text;

-- The original (automation_id, booking_id) unique constraint blocks repeats.
-- Drop it and replace with one that lets ladder rows (which carry a day_key) repeat,
-- while still preventing duplicate once-ever sends.
alter table email_sends drop constraint if exists email_sends_automation_id_booking_id_key;
create unique index if not exists email_sends_once_idx
  on email_sends (automation_id, booking_id) where day_key is null;
create unique index if not exists email_sends_daily_idx
  on email_sends (booking_id, day_key) where day_key is not null;
