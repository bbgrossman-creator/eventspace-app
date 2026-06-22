// ═══════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATES — plain-text, Apps Script style.
// Each returns { subject, text }. Sending happens via /api/email (Resend).
// ═══════════════════════════════════════════════════════════════════════════
import { Booking, fmtDate, fmtTime } from "./workflow";

const SIG = `\nEvent Space by Burger Bar\nJackson, NJ · (848) 299-9079`;
const RULE = "═══════════════════════════════════════";
const SCHEDULING_LINK = "https://calendar.app.google/MuzMridpmcgdgj9r9";

export function holdConfirmation(b: Booking, holdExpires: Date) {
  return {
    subject: `⏳ Your date is on hold! ${fmtDate(b.event_date)} — Event Space by Burger Bar`,
    text:
      `Dear ${b.contact_name},\n\n` +
      `Great news — we've placed a 24-hour courtesy hold for you:\n\n` +
      `${RULE}\n` +
      `📅 YOUR HOLD\n${RULE}\n` +
      `Event: ${b.event_name || b.event_type || "Your event"}\n` +
      `Date: ${fmtDate(b.event_date)}\n` +
      `Time: ${fmtTime(b.event_time)}\n` +
      `Invoice #: ${b.invoice_num}\n\n` +
      `⏰ This hold expires ${holdExpires.toLocaleString("en-US", { weekday: "long", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}.\n\n` +
      `To confirm your date, a $500 deposit is required before the hold expires.\n` +
      `We accept cash, check, Zelle, or credit card over the phone.\n\n` +
      `📞 Call us at (848) 299-9079 and we'll take care of it in two minutes.\n\n` +
      `We look forward to celebrating with you!\n` + SIG,
  };
}

export function bookingConfirmation(b: Booking, depositApplied: number, method: string) {
  return {
    subject: `🎉 You're booked! ${fmtDate(b.event_date)} — Event Space by Burger Bar`,
    text:
      `Dear ${b.contact_name},\n\n` +
      `Your deposit has been received — your date is officially confirmed!\n\n` +
      `${RULE}\n` +
      `✅ BOOKING CONFIRMED\n${RULE}\n` +
      `Event: ${b.event_name || b.event_type || "Your event"}\n` +
      `Date: ${fmtDate(b.event_date)}\n` +
      `Time: ${fmtTime(b.event_time)}\n` +
      `Invoice #: ${b.invoice_num}\n` +
      `Deposit applied: $${depositApplied.toFixed(2)} (${method})\n\n` +
      `NEXT STEP — let's plan your menu:\n` +
      `👉 ${SCHEDULING_LINK}\n\n` +
      `Pick a time for a quick menu call at the link above. We'll go through your ` +
      `selections, add-ons, and guest count.\n\n` +
      `Thank you for choosing us!\n` + SIG,
  };
}

export function menuCallReminder(b: Booking, callTime: Date) {
  return {
    subject: `📞 Reminder: your menu call is in about an hour — Event Space by Burger Bar`,
    text:
      `Dear ${b.contact_name},\n\n` +
      `A friendly reminder that your menu planning call for ` +
      `${b.event_name || "your event"} is coming up:\n\n` +
      `🕐 ${callTime.toLocaleString("en-US", { weekday: "long", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}\n\n` +
      `We'll call you at ${b.phone ?? "the number on file"}. Have your guest ` +
      `count estimate and any dietary needs handy.\n\n` +
      `Need to reschedule? Pick a new time here:\n👉 ${SCHEDULING_LINK}\n\n` +
      `Speak soon!\n` + SIG,
  };
}

export function holdExpiringWarning(b: Booking, holdExpires: Date) {
  return {
    subject: `⏰ Your hold expires soon — ${fmtDate(b.event_date)} — Event Space by Burger Bar`,
    text:
      `Dear ${b.contact_name},\n\n` +
      `A quick heads-up: your courtesy hold on ${fmtDate(b.event_date)} at ` +
      `${fmtTime(b.event_time)} expires at ` +
      `${holdExpires.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })} today.\n\n` +
      `To lock in your date, we just need the $500 deposit — cash, check, Zelle, ` +
      `or credit card over the phone.\n\n` +
      `📞 (848) 299-9079 — it takes two minutes.\n\n` +
      `After the hold expires the date opens up to other inquiries, so don't wait!\n` + SIG,
  };
}
