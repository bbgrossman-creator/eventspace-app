// v283 OPERATIONAL PROFILE HARNESS — mounts the REAL pages over a mock
// supabase mirroring certified v283 SQL contracts. ?mode=list|detail.
import React from "react";
import { createRoot } from "react-dom/client";
import OperationalProfilesPage from "@/app/operational-profiles/page";
import OperationalProfileDetailPage from "@/app/operational-profiles/[id]/page";

declare global { interface Window { __fixture: Record<string, unknown>; __ceremonies: string[] } }
const mode = new URLSearchParams(location.search).get("mode") ?? "detail";

window.__fixture = {
  components: [
    { id: "lc-1", name: "Carving Station", kind: "station", notes: null, active: true, created_at: "2026-07-01" },
    { id: "lc-2", name: "Passed Hors d'Oeuvres", kind: "passed", notes: null, active: true, created_at: "2026-07-01" },
  ],
  revisions: [
    { id: "rev-2", revision_no: 2, reason: "frontage corrected to 10ft", authored_by: "ben", created_at: "2026-07-15T10:00:00Z" },
    { id: "rev-1", revision_no: 1, reason: null, authored_by: "ben", created_at: "2026-07-01T10:00:00Z" },
  ],
  profile: {
    component_id: "lc-1", name: "Carving Station", kind: "station",
    revision: { id: "rev-2", revision_no: 2, authored_by: "ben", created_at: "2026-07-15T10:00:00Z", reason: "frontage corrected to 10ft" },
    requirements: [
      { id: "q1", family: "space", kind: "frontage", label: "Service frontage", capability: false, provision_source: "company",
        basis: "per_service_point", rate: 10, band_size: null, min_qty: null, max_qty: null, rounding: "ceil", unit: "ft",
        aggregation: "additive", temporal: "concurrent", condition_param: null, condition_value: null,
        resolution: { status: "resolved", quantity: 20 } },
      { id: "q2", family: "utility", kind: "circuit", label: "20A circuits", capability: false, provision_source: "company",
        basis: "per_service_point", rate: 2, band_size: null, min_qty: null, max_qty: null, rounding: "ceil", unit: "circuits",
        aggregation: "additive", temporal: "concurrent", condition_param: null, condition_value: null,
        resolution: { status: "resolved", quantity: 4 } },
      { id: "q3", family: "labor", kind: "role_headcount", label: "Carver", capability: false, provision_source: "company",
        basis: "per_guest_band", rate: 1, band_size: 125, min_qty: 1, max_qty: null, rounding: "ceil", unit: "people",
        aggregation: "additive", temporal: "concurrent", condition_param: null, condition_value: null,
        resolution: { status: "unresolved", missing: "guest_count" } },
      { id: "q4", family: "production", kind: "hot_holding", label: "Hot holding path", capability: true, provision_source: "any",
        basis: "fixed", rate: 40, band_size: null, min_qty: null, max_qty: null, rounding: "ceil", unit: "pans",
        aggregation: "capacity", temporal: "concurrent", condition_param: null, condition_value: null,
        resolution: { status: "resolved", quantity: 40 } },
      { id: "q5", family: "labor", kind: "supervisor", label: "Mashgiach", capability: false, provision_source: "company",
        basis: "fixed", rate: 1, band_size: null, min_qty: null, max_qty: null, rounding: "ceil", unit: "people",
        aggregation: "shareable", temporal: "concurrent", condition_param: "kosher_class", condition_value: "strict",
        resolution: { status: "inactive", condition: "kosher_class=strict" } },
    ],
  },
  create_result: { component_id: "lc-new", possible_duplicates: [{ id: "lc-1", name: "Carving Station" }] },
};

createRoot(document.getElementById("root")!).render(
  React.createElement(mode === "list" ? OperationalProfilesPage : OperationalProfileDetailPage)
);
