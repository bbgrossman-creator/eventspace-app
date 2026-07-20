// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT INSTANTIATION — data (v253 · BP-3). One call: the act's RPC.
// Conflicts arrive as BlueprintConflictsError carrying the staged list;
// everything else rethrows untouched. This file decides nothing.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { InstantiationConflict, InstantiationResult, parseConflicts } from "./blueprintInstantiate";

export class BlueprintConflictsError extends Error {
  conflicts: InstantiationConflict[];
  constructor(conflicts: InstantiationConflict[]) {
    super("BLUEPRINT_CONFLICTS");
    this.conflicts = conflicts;
  }
}

export async function instantiateBlueprint(
  revisionId: string, bookingId: string, guestCount: number, actor?: string,
): Promise<InstantiationResult> {
  const { data, error } = await supabase.rpc("instantiate_blueprint", {
    p_revision: revisionId, p_booking: bookingId, p_guest_count: guestCount, p_actor: actor ?? null,
  });
  if (error) {
    const staged = parseConflicts(error.message ?? "");
    if (staged) throw new BlueprintConflictsError(staged);
    throw error;
  }
  return data as InstantiationResult;
}

export interface BookingOption { id: string; label: string; }

export async function listBookingOptions(): Promise<BookingOption[]> {
  const { data } = await supabase
    .from("bookings").select("id, invoice_num, event_date, customer_name")
    .order("created_at", { ascending: false }).limit(50);
  return ((data ?? []) as { id: string; invoice_num?: string; event_date?: string; customer_name?: string }[])
    .map((b) => ({ id: b.id, label: [b.invoice_num, b.customer_name, b.event_date].filter(Boolean).join(" · ") || b.id.slice(0, 8) }));
}
