// harness/event-ops.harness.tsx — the REAL mounted Execution OS surface
// (EventOperations → ReleaseAction | EventWorkspace) over fixtures whose shape
// mirrors the certified event_workspace() SQL contract. Modes:
//   ?mode=unreleased — no event yet → Operational Release surface
//   ?mode=ready      — released 'ready' event → full workspace; Start service available
//   ?mode=in_service — 'in_service' event → Close event available; closeout blocker shown
import React from "react";
import { createRoot } from "react-dom/client";
import EventOperations from "@/components/execution/EventOperations";

const mode = new URLSearchParams(window.location.search).get("mode") ?? "ready";
(window as unknown as { __ceremonies: string[] }).__ceremonies = [];

const workboard = [
  { id: "o1", kind: "culinary_prepare", department: "culinary", title: "unresolved: produce Carving Station menu component",
    state: "ready", decision_debt: true, exception: false, dependencies: [], latest_evidence: null, actions: ["assign"] },
  { id: "o2", kind: "equipment_pull", department: "equipment", title: "Pull carving board for Carving Station",
    state: "complete", decision_debt: false, exception: false, dependencies: [], latest_evidence: { kind: "completion", actor: "crew", moment: "2026-07-22T11:00:00Z" }, actions: [] },
  { id: "o3", kind: "staffing_assign", department: "staffing", title: "Assign carver to Carving Station",
    state: "active", decision_debt: false, exception: false, dependencies: [], latest_evidence: { kind: "assignment", actor: "crew", moment: "2026-07-22T11:05:00Z" }, actions: ["complete"] },
  { id: "o4", kind: "venue_setup", department: "venue", title: "Set up Carving Station at venue",
    state: "blocked", decision_debt: false, exception: false, dependencies: ["nk1"], latest_evidence: null, actions: [] },
];
const readiness_by_category = [
  { department: "culinary", resolved: 0, total: 1, exceptions: 0, blocking: ["unresolved: produce Carving Station menu component"], state: "pending" },
  { department: "equipment", resolved: 1, total: 1, exceptions: 0, blocking: [], state: "complete" },
  { department: "staffing", resolved: 0, total: 1, exceptions: 0, blocking: ["Assign carver to Carving Station"], state: "in_progress" },
  { department: "venue", resolved: 0, total: 2, exceptions: 0, blocking: ["Set up Carving Station at venue"], state: "pending" },
];
const recent_activity = [
  { kind: "released", obligation_ref: null, actor: "ops", moment: "2026-07-22T10:00:00Z", note: {}, correction_of: null },
];

const staffingIncomplete = {
  total_requirements: 2, covered: 1, partial: 1, uncovered: 0, conflicts: 1, open_positions: 1,
  readiness: "incomplete",
  requirements: [
    { requirement_id: "req-carver", role: "carver", department: "staffing", required: 2, assigned: 1,
      shortage: 1, over: 0, conflicts: 1, covered: false,
      assignees: [{ assignment_id: "a-1", staff_ref: "s-1", staff_name: "Alice", window_start: "2026-08-01T10:00:00Z", window_end: "2026-08-01T14:00:00Z", conflict: true }] },
    { requirement_id: "req-server", role: "server", department: "staffing", required: 1, assigned: 1,
      shortage: 0, over: 0, conflicts: 0, covered: true,
      assignees: [{ assignment_id: "a-2", staff_ref: "s-2", staff_name: "Bob", window_start: "2026-08-01T10:00:00Z", window_end: "2026-08-01T14:00:00Z", conflict: false }] },
  ],
  blockers: [{ what: "carver staffing", cause_ref: "req-carver", why: "1 of 2 carver position(s) open", next_action: "Assign staff to this role" }],
};
const staffingCovered = {
  total_requirements: 2, covered: 2, partial: 0, uncovered: 0, conflicts: 0, open_positions: 0,
  readiness: "covered",
  requirements: [
    { requirement_id: "req-carver", role: "carver", department: "staffing", required: 1, assigned: 1, shortage: 0, over: 0, conflicts: 0, covered: true,
      assignees: [{ assignment_id: "a-1", staff_ref: "s-1", staff_name: "Alice", window_start: "2026-08-01T10:00:00Z", window_end: "2026-08-01T14:00:00Z", conflict: false }] },
    { requirement_id: "req-server", role: "server", department: "staffing", required: 1, assigned: 1, shortage: 0, over: 0, conflicts: 0, covered: true,
      assignees: [{ assignment_id: "a-2", staff_ref: "s-2", staff_name: "Bob", window_start: "2026-08-01T10:00:00Z", window_end: "2026-08-01T14:00:00Z", conflict: false }] },
  ],
  blockers: [],
};
const rosterFixture = [{ id: "s-1", name: "Alice" }, { id: "s-2", name: "Bob" }, { id: "s-3", name: "Cara" }];

const A = (over) => ({
  action_key: "x", label: "X", domain: "event", target_type: "event", target_id: "evt-1",
  group_key: "lifecycle", sort_order: 20, idempotency_mode: "transition", workspace_visible: true,
  required_fields: [], available: false, authorized: true, reason_code: "blocked", reason_detail: null, ...over,
});
const actionsReady = { event: [
  A({ action_key: "start_service", label: "Start Service", sort_order: 20, available: true, reason_code: "available" }),
  A({ action_key: "close_event", label: "Close Event", sort_order: 30, available: false, reason_code: "blocked", reason_detail: "service has not started" }),
  A({ action_key: "record_execution_evidence", label: "Record Evidence", domain: "evidence", group_key: "evidence", sort_order: 40, workspace_visible: false, available: true, reason_code: "available" }),
], requirements: {}, assignments: {} };
const actionsUncovered = { event: [
  A({ action_key: "start_service", label: "Start Service", sort_order: 20, available: false, reason_code: "blocked", reason_detail: "required staffing coverage not met" }),
  A({ action_key: "close_event", label: "Close Event", sort_order: 30, available: false, reason_code: "blocked", reason_detail: "service has not started" }),
], requirements: {}, assignments: {} };
const actionsInService = { event: [
  A({ action_key: "start_service", label: "Start Service", sort_order: 20, available: false, reason_code: "already_completed" }),
  A({ action_key: "close_event", label: "Close Event", sort_order: 30, available: true, reason_code: "available" }),
], requirements: {}, assignments: {} };
const actionsUnauth = { event: [
  A({ action_key: "start_service", label: "Start Service", sort_order: 20, available: false, authorized: false, reason_code: "unauthorized" }),
  A({ action_key: "close_event", label: "Close Event", sort_order: 30, available: false, authorized: false, reason_code: "unauthorized" }),
], requirements: {}, assignments: {} };

const wsReady = {
  header: { event_id: "evt-1", engagement_ref: "bk-1", origin_commitment_ref: "acc-1",
    released_at: "2026-07-22T10:00:00Z", released_by: "ops", stage: "ready",
    readiness: { resolved: 5, total: 6 }, blocker_count: 0, exception_count: 0, last_activity: "2026-07-22T10:00:00Z",
    can_manage_staffing: true },
  lifecycle: { event_id: "evt-1", stage: "ready", why: "Every pre-service obligation is resolved; awaiting service start.",
    established_by: [{ kind: "released", actor: "ops", moment: "2026-07-22T10:00:00Z" }], blockers: [], next_action: "Start service.", readiness: {} },
  staffing: staffingCovered,
  actions: actionsReady,
  readiness_by_category, workboard, blockers: [],
  next_actions: [
    { action: "start_service", label: "Start service", available: true, reason: null },
    { action: "close_event", label: "Close event", available: false, reason: "Available once service has started" },
  ],
  recent_activity,
};

const wsInService = {
  ...wsReady,
  header: { ...wsReady.header, stage: "in_service", readiness: { resolved: 5, total: 6 } },
  lifecycle: { ...wsReady.lifecycle, stage: "in_service", why: "An authorized service-start fact has been recorded.", next_action: "Complete breakdown, then close." },
  actions: actionsInService,
  blockers: [
    { what: "Final closeout (return / inspection / financial)", cause_ref: null,
      why: "closeout domains not modeled until v285+ (authorized override required)", next_action: "Close with an authorized closeout override" },
  ],
  next_actions: [
    { action: "start_service", label: "Start service", available: false, reason: "Available once every pre-service obligation is resolved" },
    { action: "close_event", label: "Close event", available: true, reason: null },
  ],
  recent_activity: [
    { kind: "service_start", obligation_ref: null, actor: "ops", moment: "2026-07-22T12:00:00Z", note: {}, correction_of: null },
    ...recent_activity,
  ],
};

const wsUncovered = {
  ...wsReady,
  header: { ...wsReady.header, stage: "in_prep", can_manage_staffing: true },
  lifecycle: { ...wsReady.lifecycle, stage: "in_prep", why: "Required staffing coverage is not yet met.", next_action: "Assign the remaining staff." },
  staffing: staffingIncomplete,
  actions: actionsUncovered,
  blockers: [{ what: "carver staffing", cause_ref: "req-carver", why: "1 of 2 carver position(s) open", next_action: "Assign staff to this role" }],
  next_actions: [
    { action: "start_service", label: "Start service", available: false, reason: "Available once every pre-service obligation is resolved" },
    { action: "close_event", label: "Close event", available: false, reason: "Available once service has started" },
  ],
};
const wsUnauth = { ...wsUncovered, header: { ...wsUncovered.header, can_manage_staffing: false }, actions: actionsUnauth };

const fixtures = {
  unreleased: { event: null },
  ready: { event: { id: "evt-1", engagement_ref: "bk-1", origin_commitment_ref: "acc-1", released_at: "2026-07-22T10:00:00Z", released_by: "ops" }, event_workspace: wsReady, eligible_staff: rosterFixture },
  in_service: { event: { id: "evt-1", engagement_ref: "bk-1", origin_commitment_ref: "acc-1", released_at: "2026-07-22T10:00:00Z", released_by: "ops" }, event_workspace: wsInService, eligible_staff: rosterFixture },
  staff_uncovered: { event: { id: "evt-1", engagement_ref: "bk-1", origin_commitment_ref: "acc-1", released_at: "2026-07-22T10:00:00Z", released_by: "ops" }, event_workspace: wsUncovered, eligible_staff: rosterFixture },
  staff_unauth: { event: { id: "evt-1", engagement_ref: "bk-1", origin_commitment_ref: "acc-1", released_at: "2026-07-22T10:00:00Z", released_by: "ops" }, event_workspace: wsUnauth, eligible_staff: rosterFixture },
  foreign: { event: { id: "evt-1", engagement_ref: "bk-1", origin_commitment_ref: "acc-1", released_at: "2026-07-22T10:00:00Z", released_by: "ops" }, event_workspace: null },
};

(window as unknown as { __fixture: Record<string, unknown> }).__fixture = fixtures[mode] ?? fixtures.ready;

createRoot(document.getElementById("root")!).render(
  <div style={{ padding: 24, maxWidth: 900 }}>
    <EventOperations bookingId="bk-1" actor="ops" />
  </div>,
);
