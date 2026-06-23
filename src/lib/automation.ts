// ═══════════════════════════════════════════════════════════════════════════
// EMAIL AUTOMATION ENGINE
// Every automated email is a ROW in email_automations — enabled flag, subject,
// body template, recipient, trigger anchor, and timing offset. Nothing is
// hard-coded. Action-triggered sends and the cron both read the same rows.
// ═══════════════════════════════════════════════════════════════════════════
import { Booking, fmtDate, fmtTime, parseLocalDate } from "./workflow";
import { MENU_DEADLINE_DAYS } from "./menuSchedule";

export type TriggerAnchor =
  | "action"          // fires immediately when the matching app action happens
  | "event"           // event date+time
  | "created"         // booking created
  | "deposit"         // deposit recorded
  | "hold_expires"    // hold expiration moment
  | "menu_call"       // recorded menu discussion time
  | "event_completed";// event date+time, but only for completed bookings

export interface Automation {
  id: string;
  key: string;
  name: string;
  category: string;
  enabled: boolean;
  recipient: "customer" | "internal";
  subject: string;
  body: string;
  trigger: TriggerAnchor;
  offset_minutes: number;        // negative = before anchor, positive = after
  status_filter: string[] | null;
  require_balance: boolean;
  sort_order: number;
}

export const ANCHOR_LABELS: Record<TriggerAnchor, string> = {
  action: "the moment the action happens",
  event: "the event",
  created: "booking creation",
  deposit: "the deposit",
  hold_expires: "hold expiration",
  menu_call: "the menu call",
  event_completed: "the event (completed bookings)",
};

// ─── Placeholders available in subject & body ───
export const PLACEHOLDERS = [
  "contact_name", "event_name", "event_type", "event_date", "event_time",
  "invoice_num", "phone", "email", "menu_type", "guests",
  "hold_expires", "menu_call_time", "deposit_amount", "balance", "total",
  "scheduling_link", "business_phone", "menu_deadline", "full_service_menu", "buffet_menu",
] as const;

export const SCHEDULING_LINK = "https://calendar.app.google/MuzMridpmcgdgj9r9";
export const BUSINESS_PHONE = "(848) 299-9079";
export const FULL_SERVICE_MENU = "https://drive.google.com/file/d/1IMd8RvEGTmwMmc68AO9vljIC7N8zyLLp/view";
export const BUFFET_MENU = "https://drive.google.com/file/d/1oof43BE8KZitW4yg7Wqz7U4_40t9AsIf/view";

export function placeholderValues(
  b: Booking,
  extras: Partial<Record<(typeof PLACEHOLDERS)[number], string>> = {}
): Record<string, string> {
  return {
    contact_name: b.contact_name ?? "",
    event_name: b.event_name || b.event_type || "your event",
    event_type: b.event_type ?? "",
    event_date: fmtDate(b.event_date),
    event_time: fmtTime(b.event_time),
    invoice_num: b.invoice_num,
    phone: b.phone ?? "",
    email: b.email ?? "",
    menu_type: b.menu_type ?? "",
    guests: String(b.est_guests ?? ""),
    hold_expires: b.hold_expires ? new Date(b.hold_expires).toLocaleString("en-US", { weekday: "long", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "",
    menu_call_time: b.menu_discussion_date ? new Date(b.menu_discussion_date).toLocaleString("en-US", { weekday: "long", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "",
    deposit_amount: b.deposit_amount != null ? `$${Number(b.deposit_amount).toFixed(2)}` : "$500.00",
    scheduling_link: SCHEDULING_LINK,
    business_phone: BUSINESS_PHONE,
    full_service_menu: FULL_SERVICE_MENU,
    buffet_menu: BUFFET_MENU,
    menu_deadline: b.event_date
      ? fmtDate(new Date(parseLocalDate(b.event_date).getTime() - MENU_DEADLINE_DAYS * 86400000).toISOString().slice(0, 10))
      : "",
    balance: "",
    total: "",
    ...extras,
  };
}

export function renderTemplate(tpl: string, values: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? "");
}

// ─── Anchor → concrete time for a booking (null = anchor not applicable) ───
export function resolveAnchor(a: TriggerAnchor, b: Booking): Date | null {
  switch (a) {
    case "event":
    case "event_completed": {
      if (!b.event_date) return null;
      const d = parseLocalDate(b.event_date);
      const m = (b.event_time ?? "19:00").match(/^(\d{1,2}):(\d{2})/);
      d.setHours(m ? parseInt(m[1]) : 19, m ? parseInt(m[2]) : 0, 0, 0);
      return d;
    }
    case "created": return new Date(b.created_at);
    case "deposit": return b.deposit_date ? new Date(b.deposit_date) : null;
    case "hold_expires": return b.hold_expires ? new Date(b.hold_expires) : null;
    case "menu_call": return b.menu_discussion_date ? new Date(b.menu_discussion_date) : null;
    case "action": return null;
  }
}

// Default status eligibility per anchor, used when status_filter is empty.
export const DEFAULT_ELIGIBLE: Record<TriggerAnchor, string[]> = {
  action: [],
  event: ["schedule_menu_discussion", "send_menu_form", "menu_completed", "send_est_invoice", "confirm_guest_count", "send_final_invoice", "collect_payment"],
  created: ["on_hold", "conflict", "schedule_menu_discussion", "send_menu_form", "menu_completed", "send_est_invoice", "confirm_guest_count", "send_final_invoice", "collect_payment"],
  deposit: ["schedule_menu_discussion", "send_menu_form", "menu_completed", "send_est_invoice", "confirm_guest_count", "send_final_invoice", "collect_payment", "completed"],
  hold_expires: ["on_hold"],
  menu_call: ["schedule_menu_discussion"],
  event_completed: ["completed"],
};

// ─── Human description of a timing rule ───
export function timingLabel(a: Automation): string {
  if (a.trigger === "action") return "Immediately, when triggered";
  const m = Math.abs(a.offset_minutes);
  const dir = a.offset_minutes <= 0 ? "before" : "after";
  const human =
    m === 0 ? "At the moment of" :
    m % 43200 === 0 ? `${m / 43200} month${m / 43200 === 1 ? "" : "s"}` :
    m % 10080 === 0 ? `${m / 10080} week${m / 10080 === 1 ? "" : "s"}` :
    m % 1440 === 0 ? `${m / 1440} day${m / 1440 === 1 ? "" : "s"}` :
    m % 60 === 0 ? `${m / 60} hour${m / 60 === 1 ? "" : "s"}` :
    `${m} minute${m === 1 ? "" : "s"}`;
  return m === 0 ? `At ${ANCHOR_LABELS[a.trigger]}` : `${human} ${dir} ${ANCHOR_LABELS[a.trigger]}`;
}

// ─── Client-side action runner ───
// Fires an action-triggered automation by key. Reads the row; if disabled or
// missing, silently does nothing (the admin is in control).
import { supabase } from "./supabase";
import { sendEmail } from "./sendEmail";

export async function runActionAutomation(
  key: string,
  b: Booking,
  extras: Partial<Record<(typeof PLACEHOLDERS)[number], string>> = {}
): Promise<{ sent: boolean; detail: string }> {
  // Fetch the automation. Use maybeSingle so a missing row doesn't throw.
  const { data, error } = await supabase.from("email_automations")
    .select("*").eq("key", key).maybeSingle();

  async function logSkip(reason: string) {
    await supabase.from("activity_log").insert({
      booking_id: b.id, invoice_num: b.invoice_num,
      action: `Email NOT sent: ${key}`, result: "WARNING",
      details: reason,
    });
  }

  if (error) { await logSkip(`Lookup error: ${error.message}`); return { sent: false, detail: error.message }; }
  if (!data) { await logSkip(`No automation row found for "${key}" — re-seed email automations.`); return { sent: false, detail: "not found" }; }

  const a = data as Automation;
  if (!a.enabled) {
    await logSkip(`Automation "${a.name}" is toggled OFF in Email Automations. Enable it to send this email.`);
    return { sent: false, detail: "disabled" };
  }

  const values = placeholderValues(b, extras);
  const res = await sendEmail({
    to: a.recipient === "internal" ? "__internal__" : b.email,
    subject: renderTemplate(a.subject, values),
    text: renderTemplate(a.body, values),
    bookingId: b.id,
    invoiceNum: b.invoice_num,
    action: `Automation: ${a.name}`,
  });
  if (!res.ok) {
    await supabase.from("activity_log").insert({
      booking_id: b.id, invoice_num: b.invoice_num,
      action: `Email FAILED: ${a.name}`, result: "WARNING",
      details: res.detail,
    });
  }
  return { sent: res.ok, detail: res.detail };
}
