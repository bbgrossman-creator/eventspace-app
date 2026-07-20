// ═══════════════════════════════════════════════════════════════════════════
// RELATIONSHIP — pure law (v264 · PL-2). The second authoritative identity:
// the enduring party, IDENTITY ONLY (Interpretive Note 1). No lifecycle
// exists here to model — that absence is the law. This module also carries
// the SUGGESTION matcher: the surviving customer.ts discipline pointed at
// stored relationship identity. Suggestions are derived, provenance-marked,
// and by construction have no write path — this module imports no data
// layer and performs no IO.
// ═══════════════════════════════════════════════════════════════════════════
import { normPhone, normEmail } from "./customer";

export type RelationshipKind = "person" | "household" | "organization";

export interface Relationship {
  id: string;
  name: string;
  kind: RelationshipKind;
  phones: string[];
  emails: string[];
  standing_notes: string | null;
}

/** Amendment 2 — vocabulary projection: the UI says these; the ledger
 *  and code say Relationship forever. */
export const KIND_LABELS: Record<RelationshipKind, string> = {
  person: "Individual", household: "Family", organization: "Organization",
};

export interface RelationshipMatch {
  relationship: Relationship;
  /** which identity facts matched — for the suggestion voice */
  via: ("phone" | "email")[];
}

/** FOUND candidates for the door: typed contact vs stored identity.
 *  Pre-selection is the CALLER's decision and only lawful when the match
 *  is unambiguous (exactly one candidate). */
export function matchRelationships(
  candidates: Relationship[], phone: string | null, email: string | null,
): RelationshipMatch[] {
  const ph = normPhone(phone);
  const em = normEmail(email);
  if (!ph && !em) return [];
  const out: RelationshipMatch[] = [];
  for (const r of candidates) {
    const via: ("phone" | "email")[] = [];
    if (ph && r.phones.some((x) => normPhone(x) === ph)) via.push("phone");
    if (em && r.emails.some((x) => normEmail(x) === em)) via.push("email");
    if (via.length > 0) out.push({ relationship: r, via });
  }
  return out;
}
