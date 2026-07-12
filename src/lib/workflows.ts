// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOWS — typed pipeline configuration keyed by operating model (v176).
//
// WHY THIS FILE EXISTS: the pipeline used to be a hard-coded constant in
// workflow.ts, which made "deposit-before-menu" a law of physics instead of a
// property of how a given business operates. Deposit-before-menu vs.
// proposal-before-deposit is an Operating Model property. This file makes the
// pipeline data — typed application configuration, NOT user-editable database
// rows (deliberate: admin-invented stages would need validation, transition
// integrity, and migration of in-flight bookings; that's an Enterprise-tier
// problem for later, not foundation).
//
// THE IDENTITY GUARANTEE: VENUE_WORKFLOW.stages IS the object that workflow.ts
// has always exported as STAGES — moved here, not copied. workflow.ts
// re-exports it by reference, so the venue pipeline cannot drift from today's
// behavior: there is no second copy to drift.
//
// WHAT IDENTITY DOES NOT PROVE: that the app consults this engine everywhere.
// ~260 raw status-string literals exist across src (queries, cron eligibility,
// UI conditionals). Those behave identically today because only the venue
// pipeline is live; they are inventoried in the v176 audit and must become
// workflow-aware before a second pipeline is activated for a real user.
//
// The caterer workflow below is DORMANT: defined, typed, and unreachable in
// behavior until proposal_driven work goes live. Its shape will evolve —
// that's expected and needs no special marker. Note deliberately absent:
// a "Revision" stage. Customer revisions are proposal-VERSION state (v177's
// domain), not opportunity pipeline state — an opportunity sits in "Proposal"
// while v1→v4 cycle beneath it.
// ═══════════════════════════════════════════════════════════════════════════
import type { OperatingModel } from "./capabilities";

// ── Types (moved verbatim from workflow.ts; workflow.ts re-exports them) ──

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

/** Generic over the status union so a second pipeline can carry its own
 *  statuses. Defaults to the venue union, so every existing `StageInfo`
 *  annotation in the app means exactly what it always meant. */
export interface StageInfo<S extends string = Status> {
  status: S;
  label: string;        // human-readable status
  action: string;       // the next thing to do
  icon: string;
  color: string;        // card tint
  textColor: string;
  stageIndex: number;   // position on the timeline, -1 = off-track
}

export interface WorkflowDef<S extends string = string> {
  key: string;
  label: string;
  stages: Record<S, StageInfo<S>>;
  /** Timeline milestone labels, in order (the stepper). */
  timelineMilestones: string[];
  /** The canonical status each milestone maps to, for click-to-navigate. */
  stageToStatus: S[];
  /** Statuses excluded from "active" (terminal / dead states). */
  terminalStatuses: S[];
}

// ── VENUE — today's pipeline, MOVED from workflow.ts (identity preserved) ──

const VENUE_STAGES: Record<Status, StageInfo> = {
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

export const VENUE_WORKFLOW: WorkflowDef<Status> = {
  key: "venue",
  label: "Venue / Template Driven",
  stages: VENUE_STAGES,
  timelineMilestones: [
    "Hold", "Menu Call", "Menu", "Estimate", "Confirm Count", "Final Invoice", "Payment", "Complete",
  ],
  stageToStatus: [
    "on_hold",                  // 0 Hold — collect the deposit (back here = un-book)
    "schedule_menu_discussion", // 1 Menu Call
    "send_menu_form",           // 2 Menu
    "send_est_invoice",         // 3 Estimate
    "confirm_guest_count",      // 4 Confirm Count
    "send_final_invoice",       // 5 Final Invoice
    "collect_payment",          // 6 Payment
    "completed",                // 7 Complete
  ],
  terminalStatuses: ["completed", "cancelled", "lead_lost"],
};

// ── CATERER — defined, typed, DORMANT until proposal-driven work goes live ──

export type CatererStatus =
  | "lead"
  | "lead_lost"
  | "discovery"
  | "proposal"          // the opportunity sits here while versions v1..vN cycle
  | "approved"
  | "deposit_pending"
  | "in_production"
  | "final_billing"
  | "completed"
  | "cancelled";

const CATERER_STAGES: Record<CatererStatus, StageInfo<CatererStatus>> = {
  lead:            { status: "lead",            label: "Lead — Sales Opportunity",     action: "Schedule Next Touchpoint", icon: "🌱", color: "#D1FAE5", textColor: "#065F46", stageIndex: -1 },
  lead_lost:       { status: "lead_lost",       label: "Lead — Lost",                  action: "Reopen Lead",              icon: "🚫", color: "#F1F5F9", textColor: "#64748B", stageIndex: -1 },
  discovery:       { status: "discovery",       label: "Discovery — Consultation",     action: "Hold Consultation",        icon: "🔍", color: "#FEF3C7", textColor: "#92400E", stageIndex: 0 },
  proposal:        { status: "proposal",        label: "Proposal — In Play",           action: "Send / Revise Proposal",   icon: "🎨", color: "#FCE7F3", textColor: "#9D174D", stageIndex: 1 },
  approved:        { status: "approved",        label: "Proposal Approved",            action: "Collect Deposit",          icon: "✅", color: "#DCFCE7", textColor: "#166534", stageIndex: 2 },
  deposit_pending: { status: "deposit_pending", label: "Deposit Pending",              action: "Collect Deposit",          icon: "💰", color: "#FEF3C7", textColor: "#92400E", stageIndex: 3 },
  in_production:   { status: "in_production",   label: "In Production",                action: "Run Production",           icon: "👨‍🍳", color: "#DBEAFE", textColor: "#1E40AF", stageIndex: 4 },
  final_billing:   { status: "final_billing",   label: "Final Billing",                action: "Send Final Invoice",       icon: "📨", color: "#D1FAE5", textColor: "#065F46", stageIndex: 5 },
  completed:       { status: "completed",       label: "Completed",                    action: "Complete",                 icon: "☑️", color: "#E0F2FE", textColor: "#0C4A6E", stageIndex: 6 },
  cancelled:       { status: "cancelled",       label: "Cancelled",                    action: "Cancelled",                icon: "❌", color: "#E5E7EB", textColor: "#374151", stageIndex: -1 },
};

export const CATERER_WORKFLOW: WorkflowDef<CatererStatus> = {
  key: "caterer",
  label: "Caterer / Proposal Driven",
  stages: CATERER_STAGES,
  timelineMilestones: [
    "Discovery", "Proposal", "Approval", "Deposit", "Production", "Billing", "Complete",
  ],
  stageToStatus: [
    "discovery", "proposal", "approved", "deposit_pending", "in_production", "final_billing", "completed",
  ],
  terminalStatuses: ["completed", "cancelled", "lead_lost"],
};

// ── Selection ──
// hybrid/enterprise deliberately resolve to VENUE for now: Burger Bar dogfoods
// caterer FEATURES by flipping to hybrid, and its live pipeline must not
// change underneath it when that happens. Only proposal_driven — which no
// current install uses — selects the caterer pipeline. Revisit when a real
// proposal-driven user exists.
export function getWorkflow(model: OperatingModel): WorkflowDef {
  return model === "proposal_driven" ? (CATERER_WORKFLOW as WorkflowDef) : (VENUE_WORKFLOW as WorkflowDef);
}

export const WORKFLOWS: Record<OperatingModel, WorkflowDef> = {
  template_driven: VENUE_WORKFLOW as WorkflowDef,
  proposal_driven: CATERER_WORKFLOW as WorkflowDef,
  hybrid: VENUE_WORKFLOW as WorkflowDef,
  enterprise: VENUE_WORKFLOW as WorkflowDef,
};
