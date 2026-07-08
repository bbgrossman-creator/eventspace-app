// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW ENGINE — port of CONFIG.gs STATUS / WORKFLOW_STAGES / priority logic
// ═══════════════════════════════════════════════════════════════════════════

export type Status =
  | "lead"
  | "lead_lost"
  | "on_hold"
  | "waitlisted"
  | "conflict"
  | "hold_expired"
  | "schedule_menu_discussion"
  | "send_menu_form"
  | "menu_completed"
  | "send_est_invoice"
  | "confirm_guest_count"
  | "send_final_invoice"
  | "collect_payment"
  | "paid_awaiting_event"
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
  lead:           { status: "lead",           label: "Lead — Sales Opportunity",   action: "Schedule Next Touchpoint", icon: "🌱", color: "#D1FAE5", textColor: "#065F46", stageIndex: -1 },
  lead_lost:      { status: "lead_lost",      label: "Lead — Lost",                action: "Reopen Lead",              icon: "🚫", color: "#F1F5F9", textColor: "#64748B", stageIndex: -1 },
  on_hold:        { status: "on_hold",        label: "On Hold — Collect Deposit",  action: "Collect Deposit",          icon: "💰", color: "#FEF3C7", textColor: "#92400E", stageIndex: 0 },
  conflict:       { status: "conflict",       label: "Conflict — Review Required", action: "Review Conflict",          icon: "⚠️", color: "#FEE2E2", textColor: "#991B1B", stageIndex: 0 },
  waitlisted:     { status: "waitlisted",     label: "Waitlisted — Awaiting Holder", action: "Awaiting Holder Decision", icon: "⏳", color: "#FEF3C7", textColor: "#92400E", stageIndex: 0 },
  hold_expired:   { status: "hold_expired",   label: "Hold Expired",               action: "Rebook or Delete",         icon: "🔄", color: "#FECACA", textColor: "#991B1B", stageIndex: 0 },
  schedule_menu_discussion: { status: "schedule_menu_discussion", label: "Booked — Schedule Menu Call", action: "Schedule Menu Discussion", icon: "📞", color: "#FCE7F3", textColor: "#9D174D", stageIndex: 1 },
  send_menu_form: { status: "send_menu_form", label: "Booked — Menu Pending",      action: "Complete Menu",            icon: "📋", color: "#DCFCE7", textColor: "#166534", stageIndex: 2 },
  menu_completed: { status: "menu_completed", label: "Booked — Menu Completed",    action: "Send Est. Invoice",        icon: "📧", color: "#DCFCE7", textColor: "#166534", stageIndex: 3 },
  send_est_invoice: { status: "send_est_invoice", label: "Booked — Send Est. Invoice", action: "Send Est. Invoice",    icon: "📧", color: "#DBEAFE", textColor: "#1E40AF", stageIndex: 3 },
  confirm_guest_count: { status: "confirm_guest_count", label: "Booked — Confirm Count & Menu", action: "Confirm Count & Menu", icon: "👥", color: "#FCE7F3", textColor: "#9D174D", stageIndex: 4 },
  send_final_invoice: { status: "send_final_invoice", label: "Booked — Send Final Invoice", action: "Send Final Invoice", icon: "📨", color: "#D1FAE5", textColor: "#065F46", stageIndex: 5 },
  collect_payment: { status: "collect_payment", label: "Booked — Collect Payment", action: "Collect Payment",          icon: "💵", color: "#D1FAE5", textColor: "#065F46", stageIndex: 6 },
  paid_awaiting_event: { status: "paid_awaiting_event", label: "Paid in Full — Awaiting Event", action: "Awaiting Event", icon: "✅", color: "#FEF9C3", textColor: "#854D0E", stageIndex: 6 },
  completed:      { status: "completed",      label: "Completed",                  action: "Complete",                 icon: "☑️", color: "#E0F2FE", textColor: "#0C4A6E", stageIndex: 7 },
  cancelled:      { status: "cancelled",      label: "Cancelled",                  action: "Cancelled",                icon: "❌", color: "#E5E7EB", textColor: "#374151", stageIndex: -1 },
};

export const TIMELINE_MILESTONES = [
  "Hold", "Menu Call", "Menu", "Estimate", "Confirm Count", "Final Invoice", "Payment", "Complete",
];

// The canonical status that each timeline stage maps to, for click-to-navigate.
// (stageIndex → the Status a user lands on when they click that milestone.)
export const STAGE_TO_STATUS: Status[] = [
  "on_hold",                  // 0 Hold — collect the deposit (back here = un-book)
  "schedule_menu_discussion", // 1 Menu Call
  "send_menu_form",           // 2 Menu
  "send_est_invoice",         // 3 Estimate
  "confirm_guest_count",      // 4 Confirm Count
  "send_final_invoice",       // 5 Final Invoice
  "collect_payment",          // 6 Payment
  "completed",                // 7 Complete
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
  (s) => s !== "completed" && s !== "cancelled" && s !== "lead_lost"
) as Status[];

// ─── Booking record shape (matches Supabase schema) ───
export interface Booking {
  id: string;
  invoice_num: string;
  event_name: string | null;
  contact_name: string;
  email: string | null;
  contact2_name?: string | null;
  contact2_phone?: string | null;
  contact2_email?: string | null;
  phone: string | null;
  event_date: string | null;     // 'YYYY-MM-DD'
  event_time: string | null;     // 'HH:MM'
  event_type: string | null;
  menu_type: string;
  bill_at_minimum?: boolean | null;
  est_guests: number | null;
  room_id?: string | null;
  location_type?: string | null;      // on_prem | off_prem
  offprem_address?: string | null;
  capacity_points?: number | null;    // manual override
  offprem_lat?: number | null;
  offprem_lng?: number | null;
  offprem_street?: string | null;
  offprem_city?: string | null;
  offprem_state?: string | null;
  offprem_zip?: string | null;
  offprem_place_id?: string | null;
  offprem_source?: string | null;
  celebrant_name?: string | null;
  celebrant_relation?: string | null;
  celebrant_age?: number | null;
  // Genealogy (Knowledge Architecture §3): the event this lead attended.
  source_booking_id?: string | null;
  source_note?: string | null;
  affiliation?: string | null;
  notes: string | null;
  status: Status;
  hold_expires: string | null;
  waitlisted_for?: string | null;
  expected_hours?: number | null;
  deposit_ready?: boolean | null;
  card_last4?: string | null;
  refusal_deadline?: string | null;
  refusal_challenger?: string | null;
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
/** Production points a job consumes: manual override, else size band. */
export function capacityPointsFor(
  guests: number, override: number | null | undefined,
  pol: { big_job_guests: number; points_small: number; points_big: number },
): number {
  if (override != null && override > 0) return override;
  return guests > pol.big_job_guests ? pol.points_big : pol.points_small;
}

/** Total points already committed on a calendar day (kitchen/crew bandwidth).
 *  Counts every job that will actually be produced — holds onward — and skips
 *  leads, waitlist, expired holds, and cancellations. */
export function dayCapacityUsed(
  bookings: Booking[], dateISO: string,
  pol: { big_job_guests: number; points_small: number; points_big: number },
  excludeId?: string,
): number {
  const SKIP = ["cancelled", "lead", "lead_lost", "hold_expired", "waitlisted"];
  let used = 0;
  for (const b of bookings) {
    if (b.id === excludeId || b.event_date !== dateISO || SKIP.includes(b.status)) continue;
    const g = deriveGuests(b);
    const heads = (g.gendered ? g.men + g.women : g.adults) + g.children;
    used += capacityPointsFor(heads, b.capacity_points, pol);
  }
  return used;
}

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
export type DiscussionState = "not_sent" | "link_sent" | "scheduled" | "overdue" | "menu_in";
export const DISCUSSION_OVERDUE_HOURS = 1;

export function discussionState(b: Booking, overdueHours: number = DISCUSSION_OVERDUE_HOURS): DiscussionState {
  // If the menu form already came in, the call has served its purpose (or is
  // moot) — never show "call scheduled" or "call missed" once the menu exists.
  if (hasMenu(b)) return "menu_in";
  if (b.menu_discussion_date) {
    const appt = new Date(b.menu_discussion_date).getTime();
    if (!b.menu_completed && Date.now() > appt + overdueHours * 3600000)
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
  actionLabel?: string;
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

export function buildTasks(bookings: Booking[], opts?: { menuOverdueHours?: number; leadsWithTouchpoints?: Set<string> }): Task[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const now = new Date();
  const tasks: Task[] = [];
  const overdueHrs = opts?.menuOverdueHours ?? DISCUSSION_OVERDUE_HOURS;

  for (const b of bookings) {
    if (b.status === "completed" || b.status === "cancelled" || b.status === "lead_lost") continue;
    if (b.status === "lead") {
      // A lead with nothing on the calendar is a prospect quietly rotting.
      if (!opts?.leadsWithTouchpoints?.has(b.id)) {
        tasks.push({
          booking: b, stage: stageFor("lead"), daysUntil: 999, priority: "MEDIUM",
          reason: "🌱 Lead — nothing scheduled. No walkthrough, call, or follow-up on the calendar for this opportunity.",
          actionLabel: "Review Lead",
        });
      }
      continue; // leads never enter the booking-stage task logic
    }
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
    } else if (b.status === "schedule_menu_discussion" && discussionState(b, overdueHrs) === "overdue") {
      priority = "HIGH"; reason = "📞 Menu call missed — follow up";
    } else if (daysUntil <= 7) {
      priority = "MEDIUM";
    }

    // Action label normally comes from the stage, but the menu-call stage has
    // sub-states (scheduled / missed / not-yet) the flat label doesn't capture.
    let actionLabel = stage.action;
    if (b.status === "schedule_menu_discussion") {
      const ds = discussionState(b, overdueHrs);
      actionLabel = ds === "menu_in" ? "Menu Received — Review & Advance"
        : ds === "overdue" ? "Menu Call Missed — Follow Up"
        : ds === "scheduled" ? "Complete Menu (call set)"
        : "Schedule Menu Call";
    }

    // Waitlisted lifecycle: a waitlisted booking is either (a) the official
    // deposit-ready challenger (holder's clock is running), (b) a no-standing
    // lead (interested, not committed), or (c) waiting on a holder who is now
    // gone/expired — meaning the date has opened up and the rep should act.
    if (b.status === "waitlisted") {
      const holder = b.waitlisted_for ? bookings.find((x) => x.id === b.waitlisted_for) : undefined;
      const holderGone = !holder || holder.status === "cancelled" || holder.status === "hold_expired" ||
        (holder.status === "on_hold" && isHoldExpired(holder));
      const isChallenger = !!holder && (holder as { refusal_challenger?: string | null }).refusal_challenger === b.id;
      if (holderGone) {
        priority = "HIGH"; reason = "🔓 Held date now OPEN — offer it to this party";
        actionLabel = "Date Open — Follow Up";
      } else if (isChallenger) {
        actionLabel = "Awaiting Holder Decision";
      } else {
        if (priority === "LOW") priority = "MEDIUM";
        if (!reason) reason = "📇 Lead waiting on a held date — keep them warm";
        actionLabel = "Lead — Date Held (follow up)";
      }
    }

    tasks.push({ booking: b, stage, daysUntil, priority, reason, actionLabel });
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
  excludeId?: string,
  opts?: { newHours?: number; defaultHours?: number; bufferMin?: number; roomId?: string | null; locationType?: string },
): Booking[] {
  const newMins = timeToMinutes(eventTime);
  const defaultHours = opts?.defaultHours ?? MINIMUM_GAP_HOURS;
  const bufferMin = opts?.bufferMin ?? 0;
  const newHours = opts?.newHours ?? defaultHours;

  return bookings.filter((b) => {
    if (excludeId && b.id === excludeId) return false;
    if (b.status === "cancelled" || b.status === "hold_expired") return false;
    if (b.status === "lead" || b.status === "lead_lost") return false; // opportunities don't claim dates
    // Space is per-room: off-prem jobs occupy no room; different rooms never
    // clash. Null room (legacy/unassigned) is treated conservatively as
    // clashing with everything so nothing silently double-books.
    if (opts?.locationType === "off_prem") return false;
    if (b.location_type === "off_prem") return false;
    if (opts?.roomId !== undefined && opts.roomId !== null && b.room_id != null && b.room_id !== opts.roomId) return false;
    if (b.event_date !== eventDate) return false;
    const exMins = timeToMinutes(b.event_time);
    if (newMins === null || exMins === null) return true; // unknown time → flag it

    // Service-block model: each event occupies a SERVICE block [start, start+service].
    // Two events conflict if the gap between their service blocks is smaller than the
    // changeover (setup+bussing−overlap), passed in as bufferMin. A shorter service
    // can therefore start later (or end earlier) and still clear the neighbor.
    const exHours = (b as { expected_hours?: number | null }).expected_hours ?? defaultHours;
    const newStart = newMins;
    const newEnd = newMins + newHours * 60;
    const exStart = exMins;
    const exEnd = exMins + exHours * 60;
    // They fit if one's service ends at least `changeover` before the other starts.
    const clears = newEnd + bufferMin <= exStart || exEnd + bufferMin <= newStart;
    return !clears;
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

// ═══════════════════════════════════════════════════════════════════════════
// EVENT INTELLIGENCE — deterministic "business intelligence wearing an AI
// costume": health scoring and next-best-action, computed from the status
// ladder, financials, and contact recency. No LLM, always correct, free.
// ═══════════════════════════════════════════════════════════════════════════

export interface HealthInput {
  balance: number;              // outstanding balance (0 if paid)
  depositReceived: boolean;
  lastHumanContactDays: number | null;  // days since a human touched/spoke; null = never
  nextTouchpointAt: string | null;      // ISO of next scheduled touchpoint
}

export interface EventHealth {
  score: number;                // 0–100
  tier: "healthy" | "attention" | "risk";
  tierLabel: string;            // 🟢 Healthy etc.
  missing: string[];            // human-readable gaps, priority-ordered
}

/** Stage-derived facts every scorer needs. */
function pipelineFacts(b: Booking) {
  const idx = stageFor(b.status).stageIndex;
  return {
    idx,
    depositStage: idx >= 1,                    // past on_hold ⇒ deposit collected
    menuDone: hasMenu(b),
    countConfirmed: idx >= 5,                  // at/past send_final_invoice
  };
}

/** 0–100 health for an active booking. Deductions are additive; proximity to
 *  the event amplifies open gaps (a missing menu 3 days out is an emergency;
 *  90 days out it's Tuesday). */
export function eventHealth(b: Booking, inp: HealthInput): EventHealth {
  const facts = pipelineFacts(b);
  const missing: string[] = [];
  let ded = 0;

  let daysUntil = 999;
  if (b.event_date) {
    const ed = parseLocalDate(b.event_date); ed.setHours(0, 0, 0, 0);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    daysUntil = Math.ceil((ed.getTime() - t.getTime()) / 86400000);
  }

  if (!facts.depositStage && !inp.depositReceived) { ded += 20; missing.push("Deposit"); }
  if (!facts.menuDone) { ded += 15; missing.push("Menu selection"); }
  if (!facts.countConfirmed) { ded += 15; missing.push("Guest count"); }
  if (inp.balance > 0 && facts.idx >= 5) {
    ded += daysUntil <= 7 ? 20 : 10;
    missing.push("Final payment");
  }
  if (inp.lastHumanContactDays == null || inp.lastHumanContactDays > 14) {
    ded += 10;
    missing.push(inp.lastHumanContactDays == null ? "First contact" : `Customer contact (${inp.lastHumanContactDays}d silent)`);
  }
  if (b.status === "conflict") { ded += 25; missing.push("Conflict resolution"); }
  if (isHoldExpired(b)) { ded += 25; missing.push("Expired hold decision"); }

  // Proximity amplifier: unresolved gaps get heavier as the event nears.
  if (daysUntil <= 7 && missing.length > 0) ded = Math.round(ded * 1.4);
  else if (daysUntil <= 14 && missing.length > 0) ded = Math.round(ded * 1.2);

  const score = Math.max(0, Math.min(100, 100 - ded));
  const tier = score >= 80 ? "healthy" : score >= 50 ? "attention" : "risk";
  return {
    score, tier, missing,
    tierLabel: tier === "healthy" ? "🟢 Healthy" : tier === "attention" ? "🟡 Needs Attention" : "🔴 At Risk",
  };
}

/** THE single next move — an imperative, not a state. Waiting-On describes;
 *  this prescribes. Priority-ordered so it names the sharpest gap first. */
export function nextBestAction(b: Booking, inp: HealthInput): { icon: string; label: string } {
  const facts = pipelineFacts(b);
  if (b.status === "lead") return { icon: "🌱", label: "Schedule the next touchpoint — or convert to a hold" };
  if (b.status === "lead_lost") return { icon: "♻️", label: "Reopen if the customer re-engages" };
  if (b.status === "completed") return { icon: "💌", label: "Send the thank-you & ask for a referral" };
  if (b.status === "cancelled") return { icon: "—", label: "No action — booking cancelled" };
  if (isHoldExpired(b)) return { icon: "⏰", label: "Hold expired — collect the deposit or release the date" };
  if (b.status === "conflict") return { icon: "⚠️", label: "Resolve the date conflict" };
  if (!facts.depositStage) return { icon: "💰", label: "Collect the deposit to secure the date" };
  if (!facts.menuDone) return { icon: "🍽️", label: "Review menu selections with the customer" };
  if (!facts.countConfirmed) return { icon: "☎️", label: "Call the customer for the final guest count" };
  if (inp.balance > 0) return { icon: "📧", label: "Send / chase the final payment" };
  if (inp.lastHumanContactDays != null && inp.lastHumanContactDays > 14)
    return { icon: "☎️", label: "Check in — no contact in " + inp.lastHumanContactDays + " days" };
  return { icon: "✅", label: "All set — confirm day-of logistics" };
}

/** Gray vs colored on the timeline: machine activity vs human decisions. */
export function isSystemEvent(action: string): boolean {
  const a = action.toLowerCase();
  return ["auto", "automatic", "reminder", "expired", "regenerat", "sweep",
    "deadline", "scheduled email", "system"].some((k) => a.includes(k));
}
