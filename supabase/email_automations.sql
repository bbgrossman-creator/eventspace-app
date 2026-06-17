-- ═══════════════════════════════════════════════════════════════════════════
-- EMAIL AUTOMATIONS — configurable automation catalog. Safe to re-run:
-- existing rows keep their enabled/subject/body/timing edits (only inserts new keys).
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists email_automations (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  category text not null,
  enabled boolean default false,
  recipient text default 'customer' check (recipient in ('customer','internal')),
  subject text not null,
  body text not null,
  trigger text not null,
  offset_minutes int not null default 0,
  status_filter text[],
  require_balance boolean default false,
  sort_order int default 100,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table email_automations enable row level security;
do $$ begin
  create policy "team full access" on email_automations for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Dedupe ledger: one send per automation per booking, ever.
create table if not exists email_sends (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references email_automations(id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,
  sent_at timestamptz default now(),
  unique (automation_id, booking_id)
);
alter table email_sends enable row level security;
do $$ begin
  create policy "team full access" on email_sends for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

insert into email_automations
  (key, name, category, enabled, recipient, subject, body, trigger, offset_minutes, status_filter, require_balance, sort_order)
values
('hold_confirmation', 'Hold Confirmation', 'Lead & Inquiry', true, 'customer', '⏳ Your date is on hold! {{event_date}} — Event Space by Burger Bar', 'Dear {{contact_name}},

Great news — we''ve placed a 24-hour courtesy hold for you:

Event: {{event_name}}
Date: {{event_date}} at {{event_time}}
Invoice #: {{invoice_num}}

⏰ This hold expires {{hold_expires}}.

To confirm your date, a {{deposit_amount}} deposit is required before the hold expires. We accept cash, check, Zelle, or credit card over the phone.

📞 Call us at {{business_phone}} and we''ll take care of it in two minutes.

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'action', 0, null, false, 10),
('inquiry_followup', 'Inquiry Follow-Up (no response)', 'Lead & Inquiry', false, 'customer', 'Still thinking it over? {{event_date}} — Event Space by Burger Bar', 'Dear {{contact_name}},

Just checking in on your inquiry for {{event_name}} on {{event_date}}. We''d love to host you!

If you have any questions about menus, pricing, or the space, call us at {{business_phone}} — happy to help.

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'created', 2880, array['on_hold','hold_expired'], false, 20),
('hold_expiring_warning', 'Hold Expiring Warning', 'Lead & Inquiry', true, 'customer', '⏰ Your hold expires soon — {{event_date}} — Event Space by Burger Bar', 'Dear {{contact_name}},

A quick heads-up: your courtesy hold on {{event_date}} at {{event_time}} expires at {{hold_expires}}.

To lock in your date, we just need the {{deposit_amount}} deposit — cash, check, Zelle, or credit card over the phone.

📞 {{business_phone}} — it takes two minutes. After the hold expires the date opens up to other inquiries.

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'hold_expires', -120, null, false, 30),
('hold_expired_notice', 'Hold Expired Notification', 'Lead & Inquiry', false, 'customer', 'Your hold on {{event_date}} has expired — Event Space by Burger Bar', 'Dear {{contact_name}},

The courtesy hold on {{event_date}} for {{event_name}} has expired, and we can no longer reserve the date.

As of now the date is still open — to secure it, a {{deposit_amount}} deposit is required.

📞 {{business_phone}} or reply to this email and we''ll take care of it right away.

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'hold_expires', 60, array['on_hold','hold_expired'], false, 40),
('deposit_received', 'Deposit Received / Booking Confirmation', 'Booking', true, 'customer', '🎉 You''re booked! {{event_date}} — Event Space by Burger Bar', 'Dear {{contact_name}},

Your deposit has been received — your date is officially confirmed!

Event: {{event_name}}
Date: {{event_date}} at {{event_time}}
Invoice #: {{invoice_num}}
Deposit applied: {{deposit_amount}}

NEXT STEP — let''s plan your menu. Pick a time for a quick call:
👉 {{scheduling_link}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'action', 0, null, false, 50),
('balance_due_reminder', 'Balance Due Reminder', 'Booking', false, 'customer', 'Balance reminder for {{event_date}} — Event Space by Burger Bar', 'Dear {{contact_name}},

Your event is almost here! A friendly reminder that your remaining balance of {{balance}} is due.

We accept cash, check, Zelle, or credit card (3% processing fee applies to cards).

📞 {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -4320, null, true, 60),
('cancellation_confirmation', 'Cancellation Confirmation', 'Booking', false, 'customer', 'Cancellation confirmed — {{event_name}} — Event Space by Burger Bar', 'Dear {{contact_name}},

This confirms the cancellation of {{event_name}} on {{event_date}} (Invoice #{{invoice_num}}).

If anything changes, we''d love to host you another time.

📞 {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'action', 0, null, false, 70),
('menu_scheduling_invite', 'Menu Scheduling Invitation (with menus)', 'Planning', true, 'customer', '📅 Let''s plan your menu! — {{event_name}} — Event Space by Burger Bar', 'Dear {{contact_name}},

Your date is confirmed — now let''s plan your menu! Please pick a time for a quick menu call:

👉 {{scheduling_link}}

⏰ Please schedule by {{menu_deadline}} (7 days before your event) so the kitchen can prepare.

Review our menus before the call:
📄 Full Service: {{full_service_menu}}
📄 Buffet: {{buffet_menu}}

During the call we''ll go through your selections, add-ons, guest count, and any dietary needs.

Prefer to call us directly? {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'action', 0, null, false, 80),
('menu_scheduling_reminder', 'Menu Scheduling Reminder (escalating)', 'Planning', true, 'customer', '⏰ Reminder: please schedule your menu call — {{event_name}}', 'Dear {{contact_name}},

We still need to schedule your menu call for {{event_name}} on {{event_date}}. The deadline to plan your menu is {{menu_deadline}} (7 days before your event).

Please pick a time as soon as possible:
👉 {{scheduling_link}}

📄 Full Service: {{full_service_menu}}
📄 Buffet: {{buffet_menu}}

Or call us directly: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'menu_schedule_ladder', 0, null, false, 90),
('menu_call_reminder', 'Menu Call Reminder', 'Planning', true, 'customer', '📞 Reminder: your menu call is in about an hour', 'Dear {{contact_name}},

A friendly reminder that your menu planning call for {{event_name}} is coming up:

🕐 {{menu_call_time}}

We''ll call you at {{phone}}. Have your guest count estimate and any dietary needs handy.

Need to reschedule? 👉 {{scheduling_link}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'menu_call', -60, null, false, 100),
('menu_selections_due', 'Menu Selections Due Reminder', 'Planning', false, 'customer', 'Your menu is due soon — {{event_name}} on {{event_date}}', 'Dear {{contact_name}},

Your event is {{event_date}} and we haven''t finalized your menu yet. Let''s get it done so the kitchen can prepare!

Schedule your menu call: {{scheduling_link}}
Or call us: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -14400, array['schedule_menu_discussion','send_menu_form'], false, 110),
('guest_count_reminder', 'Final Guest Count Due', 'Planning', false, 'customer', 'Final guest count needed — {{event_name}} on {{event_date}}', 'Dear {{contact_name}},

We need your final guest count for {{event_date}} so we can prepare and finalize your invoice.

Please reply with your counts (men / women / children) or call {{business_phone}}.

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -10080, array['confirm_guest_count'], false, 120),
('vendor_info_reminder', 'Vendor Information Reminder', 'Planning', false, 'customer', 'Outside vendors for {{event_name}} — details needed', 'Dear {{contact_name}},

If you''re bringing outside vendors (photographer, music, decorations) to your event on {{event_date}}, please send us their details and setup requirements this week.

Note: outside decorations require prior permission.

📞 {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -20160, null, false, 130),
('pre_event_90d', '90-Day Reminder', 'Pre-Event', false, 'customer', '90 days to go! {{event_name}} — Event Space by Burger Bar', 'Dear {{contact_name}},

{{event_name}} is 90 days away ({{event_date}} at {{event_time}})!

Questions about menu, setup, or anything else? We''re here: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -129600, null, false, 140),
('pre_event_60d', '60-Day Reminder', 'Pre-Event', false, 'customer', '60 days to go! {{event_name}} — Event Space by Burger Bar', 'Dear {{contact_name}},

{{event_name}} is 60 days away ({{event_date}} at {{event_time}})!

Questions about menu, setup, or anything else? We''re here: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -86400, null, false, 150),
('pre_event_30d', '30-Day Reminder', 'Pre-Event', false, 'customer', '30 days to go! {{event_name}} — Event Space by Burger Bar', 'Dear {{contact_name}},

{{event_name}} is 30 days away ({{event_date}} at {{event_time}})!

Questions about menu, setup, or anything else? We''re here: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -43200, null, false, 160),
('pre_event_14d', '14-Day Reminder', 'Pre-Event', false, 'customer', '14 days to go! {{event_name}} — Event Space by Burger Bar', 'Dear {{contact_name}},

{{event_name}} is 14 days away ({{event_date}} at {{event_time}})!

Questions about menu, setup, or anything else? We''re here: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -20160, null, false, 170),
('pre_event_7d', '7-Day Reminder', 'Pre-Event', false, 'customer', '7 days to go! {{event_name}} — Event Space by Burger Bar', 'Dear {{contact_name}},

{{event_name}} is 7 days away ({{event_date}} at {{event_time}})!

Questions about menu, setup, or anything else? We''re here: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -10080, null, false, 180),
('pre_event_3d', '3-Day Reminder', 'Pre-Event', false, 'customer', '3 days to go! {{event_name}} — Event Space by Burger Bar', 'Dear {{contact_name}},

{{event_name}} is 3 days away ({{event_date}} at {{event_time}})!

Questions about menu, setup, or anything else? We''re here: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -4320, null, false, 190),
('pre_event_24h', '24-Hour Reminder', 'Pre-Event', false, 'customer', 'Tomorrow''s the day! {{event_name}}', 'Dear {{contact_name}},

We''re all set for tomorrow — {{event_date}} at {{event_time}}.

The room will be ready, the kitchen is prepped, and we can''t wait to celebrate with you.

Anything last-minute: {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -1440, null, false, 200),
('day_of_info', 'Day-of-Event Information', 'Pre-Event', false, 'customer', 'Today''s details — {{event_name}}', 'Dear {{contact_name}},

Today''s the day! {{event_name}} at {{event_time}}.

Arrival: doors open 30 minutes before your start time for setup and vendors.
Questions on the day: {{business_phone}}

See you soon!

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event', -360, null, false, 210),
('thank_you', 'Thank-You Email', 'Post-Event', false, 'customer', 'Thank you for celebrating with us! 💙', 'Dear {{contact_name}},

Thank you for choosing Event Space by Burger Bar for {{event_name}}. It was a pleasure hosting you and your guests!

We hope everything was exactly as you imagined.

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event_completed', 1440, null, false, 220),
('review_request', 'Review Request', 'Post-Event', false, 'customer', 'How did we do? — {{event_name}}', 'Dear {{contact_name}},

We''d love your feedback on {{event_name}}! A quick review helps other families find us and helps us improve.

Reply to this email with any thoughts, or leave a review online — it means a lot.

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event_completed', 4320, null, false, 230),
('referral_request', 'Referral Request', 'Post-Event', false, 'customer', 'Know someone planning a simcha?', 'Dear {{contact_name}},

If a friend or family member is planning an event, we''d be honored by the referral — and we''ll take extra-good care of them.

📞 {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event_completed', 20160, null, false, 240),
('outstanding_balance', 'Outstanding Balance (post-event)', 'Post-Event', false, 'customer', 'Outstanding balance — {{event_name}} (Invoice #{{invoice_num}})', 'Dear {{contact_name}},

Thank you again for celebrating with us! Our records show an outstanding balance of {{balance}} on Invoice #{{invoice_num}}.

We accept cash, check, Zelle, or credit card (3% fee). 📞 {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event_completed', 2880, null, true, 250),
('marketing_followup', 'Follow-Up Marketing (anniversary)', 'Post-Event', false, 'customer', 'It''s almost a year since {{event_name}}!', 'Dear {{contact_name}},

Hard to believe it''s been nearly a year since {{event_name}}! If another simcha is on the horizon, we''d love to host you again.

📞 {{business_phone}}

Event Space by Burger Bar
Jackson, NJ · {{business_phone}}', 'event_completed', 475200, null, false, 260),
('internal_new_booking', 'Internal: New Booking Alert', 'Operational Alerts', false, 'internal', '[INTERNAL] New booking: #{{invoice_num}} {{contact_name}} — {{event_date}}', 'New booking created.

#{{invoice_num}} — {{contact_name}} ({{phone}})
{{event_name}} · {{event_date}} {{event_time}} · {{menu_type}} · ~{{guests}} guests', 'action', 0, null, false, 270),
('internal_menu_overdue', 'Internal: Menu Call Missed', 'Operational Alerts', false, 'internal', '[INTERNAL] Menu call missed — #{{invoice_num}} {{contact_name}}', 'The scheduled menu call at {{menu_call_time}} for #{{invoice_num}} ({{contact_name}}, {{phone}}) is an hour past and the menu isn''t completed. Follow up.', 'menu_call', 60, null, false, 280),
('internal_payment_missing', 'Internal: Missing Payment Alert', 'Operational Alerts', false, 'internal', '[INTERNAL] Unpaid balance, event tomorrow — #{{invoice_num}}', '#{{invoice_num}} {{contact_name}} — event {{event_date}} {{event_time}} — balance {{balance}} still open. Collect before or at the event.', 'event', -1440, null, true, 290)
on conflict (key) do nothing;
