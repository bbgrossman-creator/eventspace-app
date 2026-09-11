// ═══════════════════════════════════════════════════════════════════════════
// v312 · PRODUCT EVENT / FUNCTION READS
//
// The one place where product vocabulary meets the technical identifiers that
// carry it. The mapping is stated here, once, rather than implied at every call
// site — and the technical provenance is never concealed:
//
//   Product Event                  → public.bookings            (the whole affair)
//   Product Function               → public.engagement_occurrence
//   Function display identity      → public.occurrence_profile  (append-only)
//   Function operational record    → public.event               (0..1 per Function)
//   Function operational work      → obligations keyed by that public.event
//
// The technical names are NOT renamed. `engagement_occurrence` remains the
// identifier for the object product language calls a Function; `public.event`
// remains the identifier for that Function's execution record. Only the
// user-facing words change.
//
// WHY THE CANONICAL EVENT ID IS A BOOKING ID. v292a1 (I-31′) re-pointed
// public.event at the occurrence: `event_one_per_occurrence`, occurrence_ref
// NOT NULL. A public.event row is therefore ONE Function's execution record and
// can never address the whole affair. The only object that is 1:N over the
// parts is public.bookings, so the Product Event identity is a booking id.
//
// NOTHING HERE COMPUTES OPERATIONAL TRUTH. Identity and lineage only; every
// operational fact comes from the existing certified seams keyed by the
// Function's own public.event id.
//
// The addressing law lives in ./functionContext, which imports nothing.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "@/lib/supabase";
import type { ProductFunction } from "./functionContext";

export {
  ALL_FUNCTIONS, functionLabel, functionLensApplies, resolveFunctionContext, selectedFunction,
} from "./functionContext";
export type { FunctionContext, ProductFunction } from "./functionContext";

/** The whole affair. Sourced entirely from the engagement root. */
export interface ProductEventIdentity {
  /** public.bookings.id — the canonical Product Event identity. */
  product_event_id: string;
  /** public.bookings.event_name. Null when the affair was never named. */
  name: string | null;
  /** public.bookings.invoice_num — unique, operator-facing reference. */
  reference: string;
  /** public.bookings.contact_name. */
  client: string | null;
  /** public.bookings.status — commercial, deliberately subordinate in the UI. */
  commercial_status: string | null;
  /** public.bookings.event_date. Event-grain; Functions carry their own times. */
  event_date: string | null;
}

/** The Product Event identity, read from the engagement root. */
export async function loadProductEvent(
  productEventId: string,
): Promise<ProductEventIdentity | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, event_name, invoice_num, contact_name, status, event_date")
    .eq("id", productEventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const b = data as Record<string, unknown>;
  return {
    product_event_id: String(b.id),
    name: (b.event_name as string | null) ?? null,
    reference: String(b.invoice_num ?? ""),
    client: (b.contact_name as string | null) ?? null,
    commercial_status: (b.status as string | null) ?? null,
    event_date: (b.event_date as string | null) ?? null,
  };
}

/**
 * Every Function of this Event, in stable ordinal order.
 *
 * Two reads, both existing and certified:
 *   · engagement_occurrences(p_booking) — the list, with each Function's
 *     event_ref (null where unreleased). This is the lineage authority.
 *   · occurrence_profile — the display name. Append-only with `seq`, so the
 *     latest row per Function is the current name.
 */
export async function loadFunctions(productEventId: string): Promise<ProductFunction[]> {
  const { data, error } = await supabase.rpc("engagement_occurrences", {
    p_booking: productEventId,
  });
  if (error) throw new Error(error.message);
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  if (rows.length === 0) return [];

  const names = await loadFunctionNames(rows.map((r) => String(r.id)));

  return rows.map((r) => {
    const id = String(r.id);
    const p = names.get(id);
    return {
      function_id: id,
      ordinal: Number(r.ordinal),
      name: p?.display_name ?? null,
      occasion_kind: p?.occasion_kind ?? null,
      active: r.active !== false,
      open_basis: String(r.open_basis ?? "declared"),
      operational_event_ref: (r.event_ref as string | null) ?? null,
    };
  });
}

interface ProfileFacts { display_name: string | null; occasion_kind: string | null }

/** Latest occurrence_profile row per Function. Append-only: highest seq wins. */
async function loadFunctionNames(ids: string[]): Promise<Map<string, ProfileFacts>> {
  const out = new Map<string, ProfileFacts>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase
    .from("occurrence_profile")
    .select("occurrence_id, display_name, occasion_kind, seq")
    .in("occurrence_id", ids)
    .order("seq", { ascending: true });
  if (error) throw new Error(error.message);
  for (const row of ((data as Record<string, unknown>[] | null) ?? [])) {
    // Ascending order means a later row legitimately supersedes an earlier one.
    out.set(String(row.occurrence_id), {
      display_name: (row.display_name as string | null) ?? null,
      occasion_kind: (row.occasion_kind as string | null) ?? null,
    });
  }
  return out;
}
