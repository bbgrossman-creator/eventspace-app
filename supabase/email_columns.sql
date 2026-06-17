-- Reminder bookkeeping: stamps prevent any reminder from sending twice.
alter table bookings add column if not exists menu_call_reminder_sent_at timestamptz;
alter table bookings add column if not exists hold_warning_sent_at timestamptz;
