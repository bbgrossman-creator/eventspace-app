// v284 basis harness — mounts the REAL OperationalBasisCard against the mock
// data layer. Modes: unpinned | pinned | frozen.
import { createRoot } from "react-dom/client";
import OperationalBasisCard from "@/components/OperationalBasisCard";

declare global { interface Window { __fixture: Record<string, unknown>; __ceremonies: string[] } }

const mode = new URLSearchParams(location.search).get("mode") ?? "pinned";
window.__ceremonies = [];

const baseReqs = [
  { requirement_id: "rq-carver", family: "labor", kind: "role_headcount", label: "Carver",
    basis: "per_service_point", rate: 1, unit: "people", status: "active",
    resolution: { status: "resolved", quantity: 2, unit: "people" } },
  { requirement_id: "rq-lamp", family: "equipment", kind: "equipment_item", label: "Carving lamp",
    basis: "per_service_point", rate: 1, unit: "count", status: "replaced",
    replacement: { family: "equipment", kind: "equipment_item", label: "LED carving lamp",
      basis: "per_service_point", rate: 1, unit: "count",
      resolution: { status: "resolved", quantity: 2, unit: "count" } } },
  { requirement_id: "rq-burner", family: "equipment", kind: "equipment_item", label: "Induction burner",
    provision_source: "rented", basis: "fixed", rate: 1, unit: "count", status: "active",
    resolution: { status: "resolved", quantity: 1, unit: "count" } },
  { requirement_id: "rq-front", family: "space", kind: "frontage", label: "Frontage",
    basis: "per_service_point", rate: 8, unit: "ft", status: "suppressed",
    reason: "venue provides carving counter", actor: "ben" },
  { family: "labor", kind: "supervisor", label: "Captain", basis: "fixed", rate: 1, unit: "people",
    status: "added", override_id: "ov-add-1", actor: "ben",
    resolution: { status: "resolved", quantity: 1, unit: "people" } },
  { requirement_id: "rq-sterno", family: "consumable", kind: "fuel", label: "Sterno",
    basis: "per_hour", rate: 2, unit: "count", status: "active",
    resolution: { status: "unresolved", missing: "duration_hours" } },
];

const pinnedBasis = {
  pinned: true, library_component_id: "lc-1", profile_revision_id: "rev-1", revision_no: 3,
  context: { service_points: 2 }, requirements: baseReqs,
  overrides: [], unresolved: ["duration_hours"],
};

window.__fixture = {
  component_operational_basis:
    mode === "unpinned" ? { pinned: false } : pinnedBasis,
  library_component: [{ id: "lc-1", name: "Carving Station" }, { id: "lc-2", name: "Pasta Station" }],
};

const root = createRoot(document.getElementById("root")!);
if (mode === "frozen") {
  root.render(<OperationalBasisCard eventComponentId="ec-1" frozen frozenBasis={pinnedBasis as never} />);
} else {
  root.render(<OperationalBasisCard eventComponentId="ec-1" />);
}
