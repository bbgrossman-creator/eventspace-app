// harness/events-workspace.harness.tsx — the REAL v312 Event Workspace shell
// over fixtures whose shape mirrors the certified reads it consumes:
// bookings (Product Event root), engagement_occurrences (Function list with
// lineage), occurrence_profile (Function names) and projection_occurrence_brief
// (Function facts).
//
// Modes — one per lawful Function cardinality, plus the pre-release case:
//   ?mode=many      — three Functions, all released
//   ?mode=one       — a single Function: facts, but no selector
//   ?mode=zero      — no Functions at all
//   ?mode=unreleased— three Functions, the middle one with no execution record
//
// Function context arrives ONLY in ?function=, exactly as the route supplies it
// from the address. The harness reads it per render and keeps nothing, so a
// remembered default cannot pass unnoticed.
import React from "react";
import { createRoot } from "react-dom/client";
import EventWorkspaceShell from "@/components/events/EventWorkspaceShell";

const qs = new URLSearchParams(window.location.search);
const mode = qs.get("mode") ?? "many";
(window as unknown as { __calls: string[] }).__calls = [];

const BOOKING = {
  id: "bk-adler", event_name: "Adler Wedding", invoice_num: "EV-2026-0402",
  contact_name: "Sara Mandel", status: "Booked", event_date: "2026-09-27",
};

const occ = (id: string, ordinal: number, event_ref: string | null) => ({
  id, ordinal, open_basis: "declared", opened_at: "2026-08-01T00:00:00Z",
  active: true, event_ref,
});

const profile = (occurrence_id: string, display_name: string, seq: number) => ({
  occurrence_id, display_name, occasion_kind: "meal", seq,
});

const brief = (name: string, date: string, room: string, guests: number) => ({
  identity: {
    occurrence: "x", engagement: "bk-adler", ordinal: 1, open_basis: "declared",
    active: true, display_name: name, occasion_kind: "meal",
    engagement_name: "Adler Wedding", client: "Sara Mandel",
    client_source: "booking_contact",
  },
  venue: { source: "occurrence", venue: "v-1", name: room, address: null },
  attendance: {
    current: { head_count: guests, basis: "contracted", effective_moment: "2026-09-01T00:00:00Z" },
    contracted: guests, delta: null, scheduled: [],
  },
  schedule: { operating_date: date, milestones: [] },
  supervision: null, overlaps: [], has_event: true, event: "ev-1",
  readiness: [], readiness_state: null, risk: [], exceptions: [], ownerless: [],
});

const workspace = (stage: string) => ({
  header: {
    event_id: "ev", engagement_ref: "bk-adler", origin_commitment_ref: "acc-1",
    released_at: "2026-09-01T00:00:00Z", released_by: "ops", stage,
    readiness: { resolved: 2, total: 3 }, blocker_count: 0, exception_count: 0,
    last_activity: null, can_manage_staffing: false,
  },
  lifecycle: { stage, detail: {}, next_actions: [] },
  readiness_by_category: [
    { department: "culinary", resolved: 2, total: 3, exceptions: 0, blocking: [], state: "in_progress" },
  ],
  workboard: [], blockers: [], next_actions: [], recent_activity: [],
});

const FIXTURES: Record<string, Record<string, unknown>> = {
  many: {
    bookings: BOOKING,
    engagement_occurrences: [
      occ("fn-cer", 1, "ev-cer"), occ("fn-rec", 2, "ev-rec"), occ("fn-bru", 3, "ev-bru"),
    ],
    occurrence_profile: [
      profile("fn-cer", "Ceremony", 1), profile("fn-rec", "Reception", 2), profile("fn-bru", "Brunch", 3),
    ],
    briefs: {
      "fn-cer": brief("Ceremony", "2026-09-27", "Main Sanctuary", 240),
      "fn-rec": brief("Reception", "2026-09-27", "Main Ballroom", 240),
      "fn-bru": brief("Brunch", "2026-09-28", "Garden Room", 70),
    },
    workspaces: {
      "ev-cer": workspace("ready"), "ev-rec": workspace("in_service"), "ev-bru": workspace("ready"),
    },
  },
  one: {
    bookings: BOOKING,
    engagement_occurrences: [occ("fn-kid", 1, "ev-kid")],
    occurrence_profile: [profile("fn-kid", "Kiddush", 1)],
    briefs: { "fn-kid": brief("Kiddush", "2026-10-03", "Side Hall", 80) },
    workspaces: { "ev-kid": workspace("ready") },
  },
  zero: { bookings: BOOKING, engagement_occurrences: [], occurrence_profile: [], briefs: {}, workspaces: {} },
  unreleased: {
    bookings: BOOKING,
    engagement_occurrences: [
      occ("fn-cer", 1, "ev-cer"), occ("fn-rec", 2, null), occ("fn-bru", 3, "ev-bru"),
    ],
    occurrence_profile: [
      profile("fn-cer", "Ceremony", 1), profile("fn-rec", "Reception", 2), profile("fn-bru", "Brunch", 3),
    ],
    briefs: {
      "fn-cer": brief("Ceremony", "2026-09-27", "Main Sanctuary", 240),
      "fn-rec": brief("Reception", "2026-09-27", "Main Ballroom", 240),
      "fn-bru": brief("Brunch", "2026-09-28", "Garden Room", 70),
    },
    workspaces: { "ev-cer": workspace("ready"), "ev-bru": workspace("ready") },
  },
};

(window as unknown as { __fixture: Record<string, unknown> }).__fixture = FIXTURES[mode] ?? FIXTURES.many;

/** The address is the only context source — mirrors the real route exactly. */
function Harness() {
  const [fnCtx, setFnCtx] = React.useState<string | null>(qs.get("function"));
  return (
    <EventWorkspaceShell
      productEventId="bk-adler"
      functionContext={fnCtx}
      onFunctionContextChange={(next) => setFnCtx(next === "ALL" ? null : next)}
    />
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
