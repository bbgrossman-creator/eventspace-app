// ═══════════════════════════════════════════════════════════════════════════
// MENU SCHEDULING ESCALATION
// The cadence for nudging a customer to book their menu call:
//   • Event > 14 days out: remind at 14, 12, 10 days before (every other day),
//     then 9, 8, 7 days before (daily). Deadline is 7 days before the event.
//   • Event <= 7 days out at hold time: remind every day until the event.
// All reminders STOP once menu_discussion_date is set (call booked).
//
// Returned as a list of "days before event" on which a reminder is due, so the
// cron can fire the one matching today. Configurable defaults live here; the
// admin can later move them into settings without touching the cron.
// ═══════════════════════════════════════════════════════════════════════════
import { Booking, parseLocalDate } from "./workflow";

export const MENU_DEADLINE_DAYS = 7;            // call should be booked by this many days before
const FAR_REMINDERS = [14, 12, 10, 9, 8, 7];    // when event is > 14 days out
// When inside 7 days: remind every remaining day (computed dynamically).

/** Whole days from now until the event (>=0 future, <0 past). */
export function daysUntilEvent(b: Booking, now = new Date()): number | null {
  if (!b.event_date) return null;
  const ev = parseLocalDate(b.event_date); ev.setHours(0, 0, 0, 0);
  const t = new Date(now); t.setHours(0, 0, 0, 0);
  return Math.round((ev.getTime() - t.getTime()) / 86400000);
}

/** True if a scheduling reminder is due today for this booking. */
export function menuScheduleReminderDue(b: Booking, now = new Date()): boolean {
  // Only while still needing to schedule, and the call isn't booked yet.
  if (b.status !== "schedule_menu_discussion") return false;
  if (b.menu_discussion_date) return false;
  const d = daysUntilEvent(b, now);
  if (d == null || d < 0) return false;

  // Inside 7 days: remind every day up to (and including) the event day.
  if (d <= MENU_DEADLINE_DAYS) return true;

  // Otherwise only on the far-reminder days.
  return FAR_REMINDERS.includes(d);
}

/** Human description for the activity log / UI. */
export function reminderCadenceLabel(b: Booking, now = new Date()): string {
  const d = daysUntilEvent(b, now);
  if (d == null) return "no event date";
  if (d <= MENU_DEADLINE_DAYS) return `daily (event in ${d}d)`;
  return `escalation (event in ${d}d)`;
}
