// v280 VENUE HARNESS — mounts the REAL /venues and /venues/[id] pages over a
// mock supabase whose canned answers mirror the certified v280 SQL contracts
// (three-valued profile, contradiction shape, ceremony rpcs). Fixture mode via
// ?mode=; rpc calls recorded in window.__ceremonies.
import React from "react";
import { createRoot } from "react-dom/client";
import VenuesPage from "@/app/venues/page";
import VenueDetailPage from "@/app/venues/[id]/page";

declare global { interface Window { __fixture: Record<string, unknown>; __ceremonies: string[]; } }

const params = new URLSearchParams(location.search);
const mode = params.get("mode") ?? "detail";

const spaces = [
  { id: "sp-k", venue_id: "ven-1", parent_space_id: null, kind: "kitchen", name: "Main Kitchen", contended: false, sort_order: 0 },
  { id: "sp-b", venue_id: "ven-1", parent_space_id: null, kind: "ballroom", name: "Grand Ballroom", contended: false, sort_order: 1 },
  { id: "sp-e", venue_id: "ven-1", parent_space_id: null, kind: "elevator", name: "Freight Elevator", contended: true, sort_order: 2 },
  { id: "sp-w", venue_id: "ven-1", parent_space_id: "sp-k", kind: "refrigeration_area", name: "Walk-in", contended: false, sort_order: 0 },
];
const profile = [
  { status: "observed", attribute: "walkin_capacity_cuft", scope_space: "sp-k",
    value: { amount: 180, unit: "cuft" }, value_kind: "quantity", source_class: "measurement",
    observed_at: "2026-07-01T10:00:00Z", observer: "ben", observation_id: "ob-1", evidence_refs: ["ev-1"],
    contradiction: { disputing_observation: "ob-2", source_class: "venue_rep_statement", observed_at: "2026-07-20T10:00:00Z", value: { amount: 300, unit: "cuft" }, observer: "venue mgr" } },
  { status: "observed_absent", attribute: "gas_line", scope_space: "sp-k",
    value: { present: false }, value_kind: "absent", source_class: "direct_observation",
    observed_at: "2026-07-01T10:00:00Z", observer: "ben", observation_id: "ob-3", evidence_refs: [], contradiction: null },
  { status: "unobserved", attribute: "room_dimensions", scope_space: "sp-b" },
];

window.__fixture = {
  venues: [
    { id: "ven-1", name: "Grand Hotel", venue_type: "fixed_facility", address: "1 Main St", geo_lat: null, geo_lng: null, contacts: [], management: null, notes: null, redirect_to: null, created_at: "2026-07-01" },
    { id: "ven-2", name: "Old Annex", venue_type: "fixed_facility", address: null, geo_lat: null, geo_lng: null, contacts: [], management: null, notes: null, redirect_to: "ven-1", created_at: "2026-07-01" },
  ],
  spaces,
  walkthroughs: [{ id: "wt-1", venue_id: "ven-1", engagement_ref: null, purpose: "initial_survey", conducted_at: "2026-07-01T09:00:00Z", participants: [], rep_involvement: "supplied", notes: null }],
  profile,
  create_venue_result: { venue_id: "ven-new", possible_duplicates: [{ id: "ven-1", name: "Grand Hotel", address: "1 Main St" }] },
};

const el = document.getElementById("root")!;
createRoot(el).render(
  React.createElement(mode === "list" ? VenuesPage : VenueDetailPage)
);
