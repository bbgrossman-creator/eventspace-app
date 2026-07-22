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
