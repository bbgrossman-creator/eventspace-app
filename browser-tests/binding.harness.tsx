// v281 BINDING HARNESS — mounts the REAL VenueBindingCard over a mock supabase
// mirroring the certified v281 SQL contracts. ?mode=unbound|bound|redirected.
import React from "react";
import { createRoot } from "react-dom/client";
import VenueBindingCard from "@/components/VenueBindingCard";

declare global { interface Window { __fixture: Record<string, unknown>; __ceremonies: string[] } }
const mode = new URLSearchParams(location.search).get("mode") ?? "unbound";

const bindings: Record<string, unknown> = {
  unbound: null,
  bound: {
    binding_id: "bind-1", bound_venue_id: "ven-1", bound_name_snapshot: "Grand Hotel",
    bound_address_snapshot: "1 Main St", resolved_venue_id: "ven-1", resolved_name: "Grand Hotel",
    resolved_address: "1 Main St", redirected: false, bound_by: "ben",
    bound_at: "2026-07-10T12:00:00Z", reason: null, history_count: 1,
  },
  redirected: {
    binding_id: "bind-2", bound_venue_id: "ven-2", bound_name_snapshot: "Grand Hotel Annex",
    bound_address_snapshot: null, resolved_venue_id: "ven-1", resolved_name: "Grand Hotel",
    resolved_address: "1 Main St", redirected: true, bound_by: "ben",
    bound_at: "2026-07-10T12:00:00Z", reason: "initial", history_count: 2,
  },
};

window.__fixture = {
  binding: bindings[mode],
  venues: [
    { id: "ven-1", name: "Grand Hotel", venue_type: "fixed_facility", address: "1 Main St", redirect_to: null },
    { id: "ven-3", name: "Lakeside Manor", venue_type: "fixed_facility", address: "9 Lake Rd", redirect_to: null },
  ],
  suggestions: [{ id: "ven-1", name: "Grand Hotel", address: "1 Main St" }],
};

createRoot(document.getElementById("root")!).render(
  React.createElement(VenueBindingCard, { bookingId: "bk-1", offpremAddress: "1 Main Street, Newark" })
);
