// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW ENGINE — port of CONFIG.gs STATUS / WORKFLOW_STAGES / priority logic
// ═══════════════════════════════════════════════════════════════════════════

export type Status =
  | "on_hold"
  | "conflict"
  | "hold_expired"
  | "schedule_menu_discussion"
  | "send_menu_form"
  | "menu_completed"
  | "send_est_invoice"
  | "confirm_guest_count"
  | "send_final_invoice"
  | "collect_payment"
  | "completed"
  | "cancelled";

export interface StageInfo {
  status: Status;
  label: string;        // human-readable status
  action: string;       // the next thing to do
  icon: string;
  color: string;        // card tint
  textColor: string;
  stageIndex: number;   // position on the timeline, -1 = off-track
}

export const STAGES: Record<Status, StageInfo> = {
  on_hold:        { status: "on_hold",        label: "On Hold — Collect Deposit",  action: "Collect Deposit",          icon: "💰", color: "#FEF3C7", textColor: "#92400E", stageIndex: 0 },
  conflict:       { status: "conflict",       label: "Conflict — Review Required", action: "Review Conflict",          icon: "⚠️", color: "#FEE2E2", textColor: "#991B1B", stageIndex: 0 },
  hold_expired:   { status: "hold_expired",   label: "Hold Expired",               action: "Rebook or Delete",         icon: "🔄", color: "#FECACA", textColor: "#991B1B", stageIndex: 0 },
  schedule_menu_discussion: { status: "schedule_menu_discussion", label: "Booked — Schedule Menu Call", action: "Schedule Menu Discussion", icon: "📞", color: "#FCE7F3", textColor: "#9D174D", stageIndex: 1 },
  send_menu_form: { status: "send_menu_form", label: "Booked — Menu Pending",      action: "Complete Menu",            icon: "📋", color: "#DCFCE7", textColor: "#166534", stageIndex: 2 },
  menu_completed: { status: "menu_completed", label: "Booked — Menu Completed",    action: "Send Est. Invoice",        icon: "📧", color: "#DCFCE7", textColor: "#166534", stageIndex: 3 },
  send_est_invoice: { status: "send_est_invoice", label: "Booked — Send Est. Invoice", action: "Send Est. Invoice",    icon: "📧", color: "#DBEAFE", textColor: "#1E40AF", stageIndex: 3 },
  confirm_guest_count: { status: "confirm_guest_count", label: "Booked — Confirm Count & Menu", action: "Confirm Count & Menu", icon: "👥", color: "#FCE7F3", textColor: "#9D174D", stageIndex: 4 },
  send_final_invoice: { status: "send_final_invoice", label: "Booked — Send Final Invoice", action: "Send Final Invoice", icon: "📨", color: "#D1FAE5", textColor: "#065F46", stageIndex: 5 },
  collect_payment: { status: "collect_payment", label: "Booked — Collect Payment", action: "Collect Payment",          icon: "💵", color: "#D1FAE5", textColor: "#065F46", stageIndex: 5 },
  completed:      { status: "completed",      label: "Completed",                  action: "Complete",                 icon: "☑️", color: "#E0F2FE", textColor: "#0C4A6E", stageIndex: 6 },
  cancelled:      { status: "cancelled",      label: "Cancelled",                  action: "Cancelled",                icon: "❌", color: "#E5E7EB", textColor: "#374151", stageIndex: -1 },
};

export const TIMELINE_MILESTONES = [
  "Deposit", "Schedule Call", "Menu", "Est. Invoice", "Count & Menu", "Final Invoice", "Complete",
];

// The canonical status that each timeline stage maps to, for click-to-navigate.
// (stageIndex → the Status a user lands on when they click that milestone.)
export const STAGE_TO_STATUS: Status[] = [
  "schedule_menu_discussion", // 0 deposit done → next is schedule call
  "schedule_menu_discussion", // 1 Schedule Call
  "send_menu_form",           // 2 Menu
  "send_est_invoice",         // 3 Est. Invoice
  "confirm_guest_count",      // 4 Count & Menu
  "send_final_invoice",       // 5 Final Invoice
  "completed",                // 6 Complete
];

/** Has a menu actually been completed? Used to guard the invoice steps so a
 *  booking can't advance past "Menu" with nothing selected. */
export function hasMenu(b: Booking): boolean {
  const m = b.menu as unknown as { answers?: Record<string, unknown> } | null;
  return !!(b.menu_completed || (m?.answers && Object.keys(m.answers).length > 0));
}

export function stageFor(status: string): StageInfo {
  return STAGES[status as Status] ?? { ...STAGES.on_hold, label: status, action: "Unknown", icon: "❓" };
}

export const ACTIVE_STATUSES: Status[] = Object.keys(STAGES).filter(
  (s) => s !== "completed" && s !== "cancelled"
) as Status[];

// ─── Booking record shape (matches Supabase schema) ───
export interface Booking {
  id: string;
  invoice_num: string;
  event_name: string | null;
  contact_name: string;
  email: string | null;
  phone: string | null;
  event_date: string | null;     // 'YYYY-MM-DD'
  event_time: string | null;     // 'HH:MM'
  event_type: string | null;
  menu_type: string;
  bill_at_minimum?: boolean | null;
  est_guests: number | null;
  notes: string | null;
  status: Status;
  hold_expires: string | null;
  deposit_date: string | null;
  deposit_amount: number | null;
  deposit_method: string | null;
  menu_completed: boolean;
  menu: Record<string, string>;
  menu_discussion_sent_at: string | null;
  menu_discussion_date: string | null;
  menu_discussion_status: string | null;
  confirmed_men: number | null;
  confirmed_women: number | null;
  confirmed_children: number | null;
  confirmed_additional: number | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_with_tax: number | null;
  invoice_version: string | null;
  created_at: string;
}

/** Computed live — no cron needed. */
export function isHoldExpired(b: Booking): boolean {
  return b.status === "on_hold" && !!b.hold_expires &&
    new Date(b.hold_expires).getTime() < Date.now();
}

// ─── Guest count resolution: confirmed → menu form → inquiry estimate ───
export interface DerivedGuests {
  men: number; women: number; children: number;
  adults: number;           // non-gendered adult count (0 when gendered)
  gendered: boolean;        // true = show men/women; false = show combined "Adults"
  source: "confirmed" | "menu" | "estimate" | "none";
}
export function deriveGuests(b: Booking): DerivedGuests {
  const cm = b.confirmed_men ?? 0, cw = b.confirmed_women ?? 0, cc = b.confirmed_children ?? 0;
  if (cm + cw + cc > 0)
    return { men: cm, women: cw, children: cc, adults: 0, gendered: true, source: "confirmed" };
  const mg = (b.menu as unknown as { guests?: { men?: number; women?: number; children?: number; adults?: number } })?.guests;
  if (mg) {
    const ad = mg.adults ?? 0;
    if (ad > 0)
      return { men: 0, women: 0, children: mg.children ?? 0, adults: ad, gendered: false, source: "menu" };
    if ((mg.men ?? 0) + (mg.women ?? 0) + (mg.children ?? 0) > 0)
      return { men: mg.men ?? 0, women: mg.women ?? 0, children: mg.children ?? 0, adults: 0, gendered: true, source: "menu" };
  }
  if (b.est_guests && b.est_guests > 0)
    return { men: Math.ceil(b.est_guests / 2), women: Math.floor(b.est_guests / 2), children: 0, adults: 0, gendered: true, source: "estimate" };
  return { men: 0, women: 0, children: 0, adults: 0, gendered: true, source: "none" };
}

/** Adult heads regardless of path — for pricing (both bill the adult rate). */
export function adultHeadcount(g: DerivedGuests): number {
  return g.gendered ? g.men + g.women : g.adults;
}

/** True if the event's date+time is in the past. Used to decide whether a
 *  full payment is pre-event (needs override, stays open) or post-event
 *  (can auto-complete). Falls back to end-of-day if no time is set. */
export function eventHasPassed(b: Booking): boolean {
  if (!b.event_date) return false;
  const [y, mo, d] = b.event_date.split("-").map(Number);
  let hh = 23, mm = 59;
  if (b.event_time) { const [h, m] = b.event_time.split(":").map(Number); hh = h; mm = m; }
  const eventDt = new Date(y, mo - 1, d, hh, mm);
  return Date.now() >= eventDt.getTime();
}

// ─── Menu discussion sub-states ───
export type DiscussionState = "not_sent" | "link_sent" | "scheduled" | "overdue";
export const DISCUSSION_OVERDUE_HOURS = 1;

export function discussionState(b: Booking): DiscussionState {
  if (b.menu_discussion_date) {
    const appt = new Date(b.menu_discussion_date).getTime();
    if (!b.menu_completed && Date.now() > appt + DISCUSSION_OVERDUE_HOURS * 3600000)
      return "overdue";
    return "scheduled";
  }
  if (b.menu_discussion_sent_at) return "link_sent";
  return "not_sent";
}

// ─── Priority engine — port of getDailyTasks() ───
export type Priority = "HIGH" | "MEDIUM" | "LOW";

export interface Task {
  booking: Booking;
  stage: StageInfo;
  daysUntil: number;
  priority: Priority;
  reason: string;
}

/** Working days are Sun–Thu (Fri/Sat off). */
export function countWorkingDaysUntil(from: Date, to: Date): number {
  const a = new Date(from); a.setHours(0, 0, 0, 0);
  const b = new Date(to); b.setHours(0, 0, 0, 0);
  if (b <= a) return 0;
  let count = 0;
  const cur = new Date(a);
  cur.setDate(cur.getDate() + 1);
  while (cur <= b) {
    if (cur.getDay() >= 0 && cur.getDay() <= 4) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function parseLocalDate(d: string): Date {
  // Avoid UTC shifting: treat 'YYYY-MM-DD' as local noon
  return new Date(d + "T12:00:00");
}

export function buildTasks(bookings: Booking[]): Task[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const now = new Date();
  const tasks: Task[] = [];

  for (const b of bookings) {
    if (b.status === "completed" || b.status === "cancelled") continue;
    const stage = stageFor(b.status);

    let daysUntil = 999;
    if (b.event_date) {
      const ed = parseLocalDate(b.event_date);
      ed.setHours(0, 0, 0, 0);
      daysUntil = Math.ceil((ed.getTime() - today.getTime()) / 86400000);
    }

    let hoursUntilHold = 999;
    if (b.hold_expires && b.status === "on_hold") {
      hoursUntilHold = (new Date(b.hold_expires).getTime() - now.getTime()) / 3600000;
    }

    const workDays = b.event_date ? countWorkingDaysUntil(today, parseLocalDate(b.event_date)) : 999;

    let priority: Priority = "LOW";
    let reason = "";

    if (b.status === "on_hold" && isHoldExpired(b)) {
      priority = "HIGH"; reason = "🔥 Hold EXPIRED — collect deposit or release the date";
    } else if (b.status === "on_hold" && hoursUntilHold <= 24 && hoursUntilHold > 0) {
      priority = "HIGH"; reason = `⏰ Hold expires in ${Math.round(hoursUntilHold)}h`;
    } else if (b.status === "hold_expired") {
      priority = "HIGH"; reason = "🔥 Hold expired — rebook or delete";
    } else if (daysUntil <= 0 && daysUntil > -900) {
      priority = "HIGH"; reason = daysUntil === 0 ? "🔥 Event TODAY" : `🔥 Event was ${Math.abs(daysUntil)}d ago`;
    } else if (workDays <= 3) {
      priority = "HIGH"; reason = `🔥 ${workDays} working day${workDays === 1 ? "" : "s"} left`;
    } else if (b.status === "confirm_guest_count" && daysUntil <= 5) {
      priority = "HIGH"; reason = "👥 Count & menu confirmation due soon";
    } else if (b.status === "schedule_menu_discussion" && discussionState(b) === "overdue") {
      priority = "HIGH"; reason = "📞 Menu call missed — follow up";
    } else if (daysUntil <= 7) {
      priority = "MEDIUM";
    }

    tasks.push({ booking: b, stage, daysUntil, priority, reason });
  }

  const order: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  tasks.sort((a, z) => order[a.priority] - order[z.priority] || a.daysUntil - z.daysUntil);
  return tasks;
}

// ─── Conflict detection: minimum 4-hour start-to-start gap ───
export const MINIMUM_GAP_HOURS = 4;
export const HOLD_HOURS = 24;
export const EVENT_DURATION_HOURS = 4;

export function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
}

export function findConflicts(
  bookings: Booking[],
  eventDate: string,
  eventTime: string,
  excludeId?: string
): Booking[] {
  const newMins = timeToMinutes(eventTime);
  return bookings.filter((b) => {
    if (excludeId && b.id === excludeId) return false;
    if (b.status === "cancelled" || b.status === "hold_expired") return false;
    if (b.event_date !== eventDate) return false;
    const exMins = timeToMinutes(b.event_time);
    if (newMins === null || exMins === null) return true; // same day, unknown time → flag it
    return Math.abs(newMins - exMins) < MINIMUM_GAP_HOURS * 60;
  });
}

// ─── Display helpers ───
export function fmtTime(t: string | null): string {
  if (!t) return "TBD";
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  let h = parseInt(m[1]);
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${period}`;
}

export function fmtDate(d: string | null): string {
  if (!d) return "TBD";
  return parseLocalDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtMoney(n: number | null | undefined): string {
  return "$" + (n ?? 0).toFixed(2);
}

export function menuBadge(menuType: string | null): string {
  if (menuType === "Single Buffet") return "🥘 Single Buffet";
  if (menuType === "Double Buffet") return "🥘🥘 Double Buffet";
  if (menuType === "Full Service") return "🍽️ Full Service";
  return "—";
}

export function daysLabel(daysUntil: number): string {
  if (daysUntil === 0) return "TODAY";
  if (daysUntil === 1) return "Tomorrow";
  if (daysUntil < 0) return `${Math.abs(daysUntil)}d ago`;
  if (daysUntil > 900) return "No date";
  return `${daysUntil} days`;
}
