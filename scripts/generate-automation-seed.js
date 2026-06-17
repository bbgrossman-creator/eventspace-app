// Generates supabase/email_automations.sql — the full automation catalog.
// Run: node scripts/generate-automation-seed.js
const fs = require("fs");

const SIG = "\n\nEvent Space by Burger Bar\nJackson, NJ · {{business_phone}}";
const D = (n) => n * 1440, H = (n) => n * 60, W = (n) => n * 10080, MO = (n) => n * 43200;

// enabled:true only where current live behavior must be preserved.
const A = [
  // ── Lead & Inquiry ──
  { key: "hold_confirmation", name: "Hold Confirmation", cat: "Lead & Inquiry", trigger: "action", off: 0, enabled: true,
    subject: "⏳ Your date is on hold! {{event_date}} — Event Space by Burger Bar",
    body: `Dear {{contact_name}},\n\nGreat news — we've placed a 24-hour courtesy hold for you:\n\nEvent: {{event_name}}\nDate: {{event_date}} at {{event_time}}\nInvoice #: {{invoice_num}}\n\n⏰ This hold expires {{hold_expires}}.\n\nTo confirm your date, a {{deposit_amount}} deposit is required before the hold expires. We accept cash, check, Zelle, or credit card over the phone.\n\n📞 Call us at {{business_phone}} and we'll take care of it in two minutes.${SIG}` },
  { key: "inquiry_followup", name: "Inquiry Follow-Up (no response)", cat: "Lead & Inquiry", trigger: "created", off: D(2), statuses: ["on_hold", "hold_expired"],
    subject: "Still thinking it over? {{event_date}} — Event Space by Burger Bar",
    body: `Dear {{contact_name}},\n\nJust checking in on your inquiry for {{event_name}} on {{event_date}}. We'd love to host you!\n\nIf you have any questions about menus, pricing, or the space, call us at {{business_phone}} — happy to help.${SIG}` },
  { key: "hold_expiring_warning", name: "Hold Expiring Warning", cat: "Lead & Inquiry", trigger: "hold_expires", off: -H(2), enabled: true,
    subject: "⏰ Your hold expires soon — {{event_date}} — Event Space by Burger Bar",
    body: `Dear {{contact_name}},\n\nA quick heads-up: your courtesy hold on {{event_date}} at {{event_time}} expires at {{hold_expires}}.\n\nTo lock in your date, we just need the {{deposit_amount}} deposit — cash, check, Zelle, or credit card over the phone.\n\n📞 {{business_phone}} — it takes two minutes. After the hold expires the date opens up to other inquiries.${SIG}` },
  { key: "hold_expired_notice", name: "Hold Expired Notification", cat: "Lead & Inquiry", trigger: "hold_expires", off: H(1), statuses: ["on_hold", "hold_expired"],
    subject: "Your hold on {{event_date}} has expired — Event Space by Burger Bar",
    body: `Dear {{contact_name}},\n\nThe courtesy hold on {{event_date}} for {{event_name}} has expired, and we can no longer reserve the date.\n\nAs of now the date is still open — to secure it, a {{deposit_amount}} deposit is required.\n\n📞 {{business_phone}} or reply to this email and we'll take care of it right away.${SIG}` },

  // ── Booking ──
  { key: "deposit_received", name: "Deposit Received / Booking Confirmation", cat: "Booking", trigger: "action", off: 0, enabled: true,
    subject: "🎉 You're booked! {{event_date}} — Event Space by Burger Bar",
    body: `Dear {{contact_name}},\n\nYour deposit has been received — your date is officially confirmed!\n\nEvent: {{event_name}}\nDate: {{event_date}} at {{event_time}}\nInvoice #: {{invoice_num}}\nDeposit applied: {{deposit_amount}}\n\nNEXT STEP — let's plan your menu. Pick a time for a quick call:\n👉 {{scheduling_link}}${SIG}` },
  { key: "balance_due_reminder", name: "Balance Due Reminder", cat: "Booking", trigger: "event", off: -D(3), requireBalance: true,
    subject: "Balance reminder for {{event_date}} — Event Space by Burger Bar",
    body: `Dear {{contact_name}},\n\nYour event is almost here! A friendly reminder that your remaining balance of {{balance}} is due.\n\nWe accept cash, check, Zelle, or credit card (3% processing fee applies to cards).\n\n📞 {{business_phone}}${SIG}` },
  { key: "cancellation_confirmation", name: "Cancellation Confirmation", cat: "Booking", trigger: "action", off: 0,
    subject: "Cancellation confirmed — {{event_name}} — Event Space by Burger Bar",
    body: `Dear {{contact_name}},\n\nThis confirms the cancellation of {{event_name}} on {{event_date}} (Invoice #{{invoice_num}}).\n\nIf anything changes, we'd love to host you another time.\n\n📞 {{business_phone}}${SIG}` },

  // ── Planning ──
  { key: "menu_scheduling_invite", name: "Menu Scheduling Invitation (with menus)", cat: "Planning", trigger: "action", off: 0, enabled: true,
    subject: "📅 Let's plan your menu! — {{event_name}} — Event Space by Burger Bar",
    body: `Dear {{contact_name}},\n\nYour date is confirmed — now let's plan your menu! Please pick a time for a quick menu call:\n\n👉 {{scheduling_link}}\n\n⏰ Please schedule by {{menu_deadline}} (7 days before your event) so the kitchen can prepare.\n\nReview our menus before the call:\n📄 Full Service: {{full_service_menu}}\n📄 Buffet: {{buffet_menu}}\n\nDuring the call we'll go through your selections, add-ons, guest count, and any dietary needs.\n\nPrefer to call us directly? {{business_phone}}${SIG}` },
  { key: "menu_scheduling_reminder", name: "Menu Scheduling Reminder (escalating)", cat: "Planning", trigger: "menu_schedule_ladder", off: 0, enabled: true,
    subject: "⏰ Reminder: please schedule your menu call — {{event_name}}",
    body: `Dear {{contact_name}},\n\nWe still need to schedule your menu call for {{event_name}} on {{event_date}}. The deadline to plan your menu is {{menu_deadline}} (7 days before your event).\n\nPlease pick a time as soon as possible:\n👉 {{scheduling_link}}\n\n📄 Full Service: {{full_service_menu}}\n📄 Buffet: {{buffet_menu}}\n\nOr call us directly: {{business_phone}}${SIG}` },
  { key: "menu_call_reminder", name: "Menu Call Reminder", cat: "Planning", trigger: "menu_call", off: -H(1), enabled: true,
    subject: "📞 Reminder: your menu call is in about an hour",
    body: `Dear {{contact_name}},\n\nA friendly reminder that your menu planning call for {{event_name}} is coming up:\n\n🕐 {{menu_call_time}}\n\nWe'll call you at {{phone}}. Have your guest count estimate and any dietary needs handy.\n\nNeed to reschedule? 👉 {{scheduling_link}}${SIG}` },
  { key: "menu_selections_due", name: "Menu Selections Due Reminder", cat: "Planning", trigger: "event", off: -D(10), statuses: ["schedule_menu_discussion", "send_menu_form"],
    subject: "Your menu is due soon — {{event_name}} on {{event_date}}",
    body: `Dear {{contact_name}},\n\nYour event is {{event_date}} and we haven't finalized your menu yet. Let's get it done so the kitchen can prepare!\n\nSchedule your menu call: {{scheduling_link}}\nOr call us: {{business_phone}}${SIG}` },
  { key: "guest_count_reminder", name: "Final Guest Count Due", cat: "Planning", trigger: "event", off: -D(7), statuses: ["confirm_guest_count"],
    subject: "Final guest count needed — {{event_name}} on {{event_date}}",
    body: `Dear {{contact_name}},\n\nWe need your final guest count for {{event_date}} so we can prepare and finalize your invoice.\n\nPlease reply with your counts (men / women / children) or call {{business_phone}}.${SIG}` },
  { key: "vendor_info_reminder", name: "Vendor Information Reminder", cat: "Planning", trigger: "event", off: -D(14),
    subject: "Outside vendors for {{event_name}} — details needed",
    body: `Dear {{contact_name}},\n\nIf you're bringing outside vendors (photographer, music, decorations) to your event on {{event_date}}, please send us their details and setup requirements this week.\n\nNote: outside decorations require prior permission.\n\n📞 {{business_phone}}${SIG}` },

  // ── Pre-Event countdown ──
  ...[[90, "90-Day"], [60, "60-Day"], [30, "30-Day"], [14, "14-Day"], [7, "7-Day"], [3, "3-Day"]].map(([n, label]) => ({
    key: `pre_event_${n}d`, name: `${label} Reminder`, cat: "Pre-Event", trigger: "event", off: -D(n),
    subject: `${n} days to go! {{event_name}} — Event Space by Burger Bar`,
    body: `Dear {{contact_name}},\n\n{{event_name}} is ${n} days away ({{event_date}} at {{event_time}})!\n\nQuestions about menu, setup, or anything else? We're here: {{business_phone}}${SIG}`,
  })),
  { key: "pre_event_24h", name: "24-Hour Reminder", cat: "Pre-Event", trigger: "event", off: -H(24),
    subject: "Tomorrow's the day! {{event_name}}",
    body: `Dear {{contact_name}},\n\nWe're all set for tomorrow — {{event_date}} at {{event_time}}.\n\nThe room will be ready, the kitchen is prepped, and we can't wait to celebrate with you.\n\nAnything last-minute: {{business_phone}}${SIG}` },
  { key: "day_of_info", name: "Day-of-Event Information", cat: "Pre-Event", trigger: "event", off: -H(6),
    subject: "Today's details — {{event_name}}",
    body: `Dear {{contact_name}},\n\nToday's the day! {{event_name}} at {{event_time}}.\n\nArrival: doors open 30 minutes before your start time for setup and vendors.\nQuestions on the day: {{business_phone}}\n\nSee you soon!${SIG}` },

  // ── Post-Event ──
  { key: "thank_you", name: "Thank-You Email", cat: "Post-Event", trigger: "event_completed", off: D(1),
    subject: "Thank you for celebrating with us! 💙",
    body: `Dear {{contact_name}},\n\nThank you for choosing Event Space by Burger Bar for {{event_name}}. It was a pleasure hosting you and your guests!\n\nWe hope everything was exactly as you imagined.${SIG}` },
  { key: "review_request", name: "Review Request", cat: "Post-Event", trigger: "event_completed", off: D(3),
    subject: "How did we do? — {{event_name}}",
    body: `Dear {{contact_name}},\n\nWe'd love your feedback on {{event_name}}! A quick review helps other families find us and helps us improve.\n\nReply to this email with any thoughts, or leave a review online — it means a lot.${SIG}` },
  { key: "referral_request", name: "Referral Request", cat: "Post-Event", trigger: "event_completed", off: D(14),
    subject: "Know someone planning a simcha?",
    body: `Dear {{contact_name}},\n\nIf a friend or family member is planning an event, we'd be honored by the referral — and we'll take extra-good care of them.\n\n📞 {{business_phone}}${SIG}` },
  { key: "outstanding_balance", name: "Outstanding Balance (post-event)", cat: "Post-Event", trigger: "event_completed", off: D(2), requireBalance: true,
    subject: "Outstanding balance — {{event_name}} (Invoice #{{invoice_num}})",
    body: `Dear {{contact_name}},\n\nThank you again for celebrating with us! Our records show an outstanding balance of {{balance}} on Invoice #{{invoice_num}}.\n\nWe accept cash, check, Zelle, or credit card (3% fee). 📞 {{business_phone}}${SIG}` },
  { key: "marketing_followup", name: "Follow-Up Marketing (anniversary)", cat: "Post-Event", trigger: "event_completed", off: MO(11),
    subject: "It's almost a year since {{event_name}}!",
    body: `Dear {{contact_name}},\n\nHard to believe it's been nearly a year since {{event_name}}! If another simcha is on the horizon, we'd love to host you again.\n\n📞 {{business_phone}}${SIG}` },

  // ── Operational (internal) ──
  { key: "internal_new_booking", name: "Internal: New Booking Alert", cat: "Operational Alerts", trigger: "action", off: 0, recipient: "internal",
    subject: "[INTERNAL] New booking: #{{invoice_num}} {{contact_name}} — {{event_date}}",
    body: `New booking created.\n\n#{{invoice_num}} — {{contact_name}} ({{phone}})\n{{event_name}} · {{event_date}} {{event_time}} · {{menu_type}} · ~{{guests}} guests` },
  { key: "internal_menu_overdue", name: "Internal: Menu Call Missed", cat: "Operational Alerts", trigger: "menu_call", off: H(1), recipient: "internal",
    subject: "[INTERNAL] Menu call missed — #{{invoice_num}} {{contact_name}}",
    body: `The scheduled menu call at {{menu_call_time}} for #{{invoice_num}} ({{contact_name}}, {{phone}}) is an hour past and the menu isn't completed. Follow up.` },
  { key: "internal_payment_missing", name: "Internal: Missing Payment Alert", cat: "Operational Alerts", trigger: "event", off: -D(1), recipient: "internal", requireBalance: true,
    subject: "[INTERNAL] Unpaid balance, event tomorrow — #{{invoice_num}}",
    body: `#{{invoice_num}} {{contact_name}} — event {{event_date}} {{event_time}} — balance {{balance}} still open. Collect before or at the event.` },
];

function esc(s) { return String(s).replace(/'/g, "''"); }
const rows = A.map((a, i) =>
  `('${a.key}', '${esc(a.name)}', '${esc(a.cat)}', ${a.enabled ? "true" : "false"}, '${a.recipient ?? "customer"}', '${esc(a.subject)}', '${esc(a.body)}', '${a.trigger}', ${a.off}, ${a.statuses ? `array[${a.statuses.map((s) => `'${s}'`).join(",")}]` : "null"}, ${a.requireBalance ? "true" : "false"}, ${(i + 1) * 10})`
).join(",\n");

const sql = `-- ═══════════════════════════════════════════════════════════════════════════
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
${rows}
on conflict (key) do nothing;
`;
fs.writeFileSync(__dirname + "/../supabase/email_automations.sql", sql);
console.log(`Wrote email_automations.sql — ${A.length} automations`);
