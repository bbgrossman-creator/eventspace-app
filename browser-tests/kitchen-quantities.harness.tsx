// harness/kitchen-quantities.harness.tsx — the REAL mounted v311 Kitchen
// Quantities panel over fixtures whose shape mirrors the certified
// kitchen_event_panel() SQL contract. Modes:
//   ?mode=mixed     — four lines: recommended-only, adjusted, approved+review, unresolved
//   ?mode=noauth    — the same lines with no Authority Grant → no controls
//   ?mode=refusal   — approving returns KITCHEN_QUANTITY_NOT_PERMITTED verbatim
//   ?mode=empty     — a committed design with no culinary line
import React from "react";
import { createRoot } from "react-dom/client";
import KitchenQuantities from "@/components/execution/KitchenQuantities";

const mode = new URLSearchParams(window.location.search).get("mode") ?? "mixed";
(window as unknown as { __ceremonies: string[] }).__ceremonies = [];

// Every value below is a STRING because the SQL returns rendered numerics. The
// panel must display them as given; if it parsed and recomputed anything, this
// fixture would be where the divergence started.
const line = (o: Record<string, unknown>) => ({
  requirement_line: "l-x", requirement_revision: "l-x", item: "Item",
  requirement: "Produce Item for Station",
  recommended_quantity: null, recommendation_resolved: true, unresolved_reason: null,
  derivation: null, guest_count: "130", guest_count_basis: "per_person", design_quantity: "1",
  adjusted_quantity: null, adjusted_by: null, adjusted_reason: null,
  approved_quantity: null, approved_by: null, approved_at: null, approval_reason: null,
  fulfillable_quantity: null, review_required: false, review_reason: null,
  may_adjust: true, may_approve: true, ...o,
});

const lines = [
  line({ requirement_line: "l-sliders", item: "Sliders",
         requirement: "Produce Sliders for Grill Station",
         recommended_quantity: "130", derivation: "130 guests × 1 per guest = 130" }),
  line({ requirement_line: "l-slaw", item: "Coleslaw",
         requirement: "Produce Coleslaw for Grill Station",
         recommended_quantity: "20", guest_count_basis: "flat", design_quantity: "20",
         derivation: "flat 20 — the guest count does not scale this line",
         adjusted_quantity: "26", adjusted_by: "chef@site", adjusted_reason: "10% service reserve" }),
  line({ requirement_line: "l-brownies", item: "Brownies",
         requirement: "Produce Brownies for Dessert Table — approved quantity 200",
         requirement_revision: "l-brownies-r2",
         recommended_quantity: "260", design_quantity: "2",
         derivation: "130 guests × 2 per guest = 260",
         approved_quantity: "200", approved_by: "chef@site", approved_at: "2026-08-20T10:00:00Z",
         approval_reason: "signed off at 100 guests", fulfillable_quantity: "200",
         review_required: true,
         review_reason: "the approved quantity no longer matches what the guest count and committed design imply" }),
  line({ requirement_line: "l-napkins", item: "Napkins",
         requirement: "Produce Napkins for Grill Station",
         recommendation_resolved: false, recommended_quantity: null, design_quantity: null,
         unresolved_reason: "committed design states basis per_person but no quantity" }),
];

const panel = (over: Record<string, unknown> = {}) => ({
  stage: "enacted", operative: true, event_ref: "evt-1",
  as_of: "2026-08-20T12:00:00Z", guest_count: "130", lines, ...over,
});

const fixtures: Record<string, Record<string, unknown>> = {
  mixed: { kitchen_event_panel: panel() },
  noauth: {
    kitchen_event_panel: panel({
      lines: lines.map((l) => ({ ...l, may_adjust: false, may_approve: false })),
    }),
  },
  refusal: {
    kitchen_event_panel: panel(),
    kitchen_refuse_approve: "KITCHEN_QUANTITY_NOT_PERMITTED",
  },
  empty: { kitchen_event_panel: panel({ lines: [] }) },
};

(window as unknown as { __fixture: Record<string, unknown> }).__fixture =
  fixtures[mode] ?? fixtures.mixed;

createRoot(document.getElementById("root")!).render(
  <KitchenQuantities eventId="evt-1" actor="chef@site" />,
);
