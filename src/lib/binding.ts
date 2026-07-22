import { supabase } from "@/lib/supabase";
import type { Venue } from "@/lib/venues";

/** v281 engagement venue binding — thin client. Binding is by explicit venue
 *  uuid only; suggestions are advisory; corrections require a reason. All law
 *  lives in SQL. */

export interface CurrentBinding {
  binding_id: string;
  bound_venue_id: string;
  bound_name_snapshot: string;
  bound_address_snapshot: string | null;
  resolved_venue_id: string;
  resolved_name: string | null;
  resolved_address: string | null;
  redirected: boolean;
  bound_by: string;
  bound_at: string;
  reason: string | null;
  history_count: number;
}

export async function getCurrentBinding(bookingId: string): Promise<CurrentBinding | null> {
  const { data, error } = await supabase.rpc("current_venue_binding", { p_booking: bookingId });
  if (error) throw new Error(error.message);
  return (data as CurrentBinding | null) ?? null;
}

export async function bindVenue(bookingId: string, venueId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("bind_engagement_venue", {
    p_booking: bookingId, p_venue: venueId, p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Advisory suggestions for an unbound off-prem booking, from its free-text
 *  address — never binds, never blocks; the person selects an id explicitly. */
export async function suggestVenues(addressText: string): Promise<{ id: string; name: string; address: string | null }[]> {
  const { data, error } = await supabase.rpc("venue_duplicate_candidates", { p_name: addressText, p_address: addressText });
  if (error) return [];
  return (data as { id: string; name: string; address: string | null }[]) ?? [];
}

export async function listBindableVenues(): Promise<Venue[]> {
  const { data, error } = await supabase.from("venue").select("*").is("redirect_to", null).order("name");
  if (error) throw new Error(error.message);
  return (data as Venue[]) ?? [];
}

/** v282 — venue knowledge findings (pure derivations; nothing stored). */
export interface KnowledgeFinding {
  kind: "stale" | "expired" | "renovation_reverification" | "contradiction_unresolved" | "unobserved";
  severity: "advisory" | "critical";
  family: string; attribute: string | null; scope_space: string | null; reason: string;
}
export interface EngagementVenueKnowledge {
  bound: boolean;
  binding?: CurrentBinding;
  verification?: "none" | "targeted_verification" | "walkthrough_required";
  critical_count?: number; reasons?: string[]; findings?: KnowledgeFinding[];
}
export async function getEngagementVenueKnowledge(bookingId: string, eventDate?: string): Promise<EngagementVenueKnowledge | null> {
  const { data, error } = await supabase.rpc("engagement_venue_knowledge", {
    p_booking: bookingId, p_event_date: eventDate ?? new Date().toISOString(), p_conditions: null,
  });
  if (error) throw new Error(error.message);
  return (data as EngagementVenueKnowledge | null) ?? null;
}
export async function getVenueFindings(venueId: string): Promise<KnowledgeFinding[]> {
  const { data, error } = await supabase.rpc("venue_knowledge_findings", {
    p_venue: venueId, p_at: new Date().toISOString(), p_conditions: null,
  });
  if (error) throw new Error(error.message);
  return (data as KnowledgeFinding[]) ?? [];
}
