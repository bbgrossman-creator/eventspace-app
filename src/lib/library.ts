// ═══════════════════════════════════════════════════════════════════════════
// THE LIBRARY — instantiation resolver (v196 slice 3; search retired v215)
//
// v196 built search here as three hand-named queries; v215 (Library slice 1)
// moved search behind the KA §4 registry — the envelope in libraryRegistry.ts,
// the kind registrations (with these same queries, lifted verbatim) in
// libraryKinds.ts. searchLibrary was retired rather than kept as an alias:
// a second search path is a second doctrine, and it had zero callers the
// moment LibraryBrowser consumed rails. The v196 doctrine comments (why
// identities not components; what is deliberately absent; ilike honesty)
// travelled with the queries and live in libraryKinds.ts.
//
// What remains here is the OTHER half of v196: Library → Design.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";

// ═══════════════════════════════════════════════════════════════════════════
// INSTANTIATE — Library → Design. The first of the four verbs, made real.
//
// The Library returns an IDENTITY ("Sushi Station", used 187×). An identity is
// a noun, not a thing you can copy — it has no items, no prices, no
// requirements. So instantiating means: find the best INSTANCE of that noun and
// copy it forward through the existing lineage machinery.
//
// "Best" = the most recent real instance, because the most recent is the one
// that reflects what the organisation currently believes about that component.
// Not the most expensive, not the most used. The freshest.
//
// This deliberately reuses copyIntoVersion — the SAME path the old
// SourceEventPane used and the same one blueprints use. That matters: the copy
// semantics (what travels, what doesn't, what arrives amber) live in ONE place
// and every route into the Design obeys them. A second copy path would be a
// second doctrine, and the prices would arrive confirmed by accident.
// ═══════════════════════════════════════════════════════════════════════════

/** Resolve an identity to a copyable source component. Null = the identity
 *  exists but has no instance we can reach (possible if every instance was
 *  deleted — rare, and a real state, not an error). */
export async function sourceForIdentity(identityId: string): Promise<{ componentId: string; bookingId: string; label: string } | null> {
  const { data } = await supabase
    .from("event_components")
    .select("id,booking_id,title,created_at")
    .eq("definition_id", identityId)
    .is("proposal_version_id", null)      // operational instances, not version copies
    .order("created_at", { ascending: false })
    .limit(1);
  const rows = (data ?? []) as { id: string; booking_id: string; title: string }[];
  if (rows.length) return { componentId: rows[0].id, bookingId: rows[0].booking_id, label: rows[0].title };

  // Fall back to ANY instance — including one that lives on a proposal version.
  // Less ideal (it may be a draft someone is mid-thought on) but far better
  // than telling the user their own Library cannot give them their own work.
  const { data: any2 } = await supabase
    .from("event_components")
    .select("id,booking_id,title,created_at")
    .eq("definition_id", identityId)
    .order("created_at", { ascending: false })
    .limit(1);
  const r2 = (any2 ?? []) as { id: string; booking_id: string; title: string }[];
  return r2.length ? { componentId: r2[0].id, bookingId: r2[0].booking_id, label: r2[0].title } : null;
}
