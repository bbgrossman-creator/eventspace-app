// ═══════════════════════════════════════════════════════════════════════════
// RELATIONSHIP — data (v264 · PL-2). The four ceremony doors + the reads.
// Nothing here — or anywhere — sets bookings.relationship_id directly:
// the citation is written only by the compound door, Adopt, or Correct
// Citation, each an atomic RPC. Matching lives in the pure module and
// reads only; no code path leads from a match to a write.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { Relationship } from "./relationship";

export interface CeremonyOutcome { ok: boolean; outcome?: string; relationshipId?: string; detail?: string }

const call = async (fn: string, args: Record<string, unknown>): Promise<CeremonyOutcome> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, detail: error.message };
  const d = data as { outcome?: string; relationship_id?: string } | null;
  return { ok: true, outcome: d?.outcome, relationshipId: d?.relationship_id };
};

/** THE COMPOUND DOOR — one user action, one transaction, TWO ceremonies,
 *  TWO ledger entries (PL-1's `opened` + establish/found), no partial
 *  residue. FOUND: pass the chosen relationshipId. CREATED: pass identity. */
export const openInquiryWithRelationship = (
  bookingId: string, actor: string,
  found: string | null,
  identity: { name: string; kind: string; phone: string | null; email: string | null },
) => call("open_inquiry_with_relationship", {
  p_booking: bookingId, p_actor: actor, p_relationship: found,
  p_name: identity.name, p_kind: identity.kind, p_phone: identity.phone, p_email: identity.email,
});

export const adoptEngagement = (bookingId: string, relationshipId: string, actor: string) =>
  call("adopt_engagement", { p_booking: bookingId, p_relationship: relationshipId, p_actor: actor });

export const correctCitation = (bookingId: string, relationshipId: string, actor: string, reason: string) =>
  call("correct_citation", { p_booking: bookingId, p_relationship: relationshipId, p_actor: actor, p_reason: reason });

export const amendRelationship = (
  relationshipId: string, actor: string,
  facts: { name: string; kind: string; phones: string[]; emails: string[]; notes: string | null },
) => call("amend_relationship", {
  p_relationship: relationshipId, p_actor: actor,
  p_name: facts.name, p_kind: facts.kind, p_phones: facts.phones, p_emails: facts.emails, p_notes: facts.notes,
});

const REL_COLS = "id,name,kind,phones,emails,standing_notes";

export async function loadRelationship(id: string): Promise<Relationship | null> {
  const { data } = await supabase.from("relationships").select(REL_COLS).eq("id", id).maybeSingle();
  return (data as Relationship | null) ?? null;
}

/** All stored parties (this operation's scale makes the full list the
 *  honest candidate set for the pure matcher). Read-only. */
export async function listRelationships(): Promise<Relationship[]> {
  const { data } = await supabase.from("relationships").select(REL_COLS).order("name");
  return (data ?? []) as Relationship[];
}

export async function getBookingRelationshipId(bookingId: string): Promise<string | null> {
  const { data } = await supabase.from("bookings")
    .select("relationship_id").eq("id", bookingId).maybeSingle();
  return ((data as { relationship_id: string | null } | null)?.relationship_id) ?? null;
}

/** The ceremonially attached engagements of one party — the ceremonial
 *  voice's history (derived matching is the OTHER voice, and stays in
 *  customer.ts). */
export async function listAttachedBookingIds(relationshipId: string): Promise<string[]> {
  const { data } = await supabase.from("bookings")
    .select("id").eq("relationship_id", relationshipId);
  return ((data ?? []) as { id: string }[]).map((b) => b.id);
}
