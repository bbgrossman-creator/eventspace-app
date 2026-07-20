// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT SHELF (v251 · BP-1) — the pure law of PUBLICATION_BLUEPRINTS.
//
// THE NEGATIVE LAW: a blueprint is never a live ancestor of an Event Design.
// INSTANTIATION SEVERS ANCESTRY WHILE PRESERVING MEMORY. This module holds
// the shelf's law only — identity, immutable revisions, lifecycle verbs,
// the intent gate. Nothing here consumes the shelf; nothing here knows a
// design, a booking, a proposal, or a publication exists (grep-pinned).
//
// Constitutional traceability:
//   §1  vocabulary — Blueprint identity / revision / published designation;
//       the banned two-word noun of §1 never appears (the verb is publish,
//       the noun is "published revision")
//   §2  stable identity over immutable revisions; supersede-and-chain
//   §3  states earn their verbs (draft · published · retired; the state
//       §3 rejected changed no verbs and does not exist); PUBLICATION REQUIRES
//       INTENT, NOT MERELY AUTHORITY — the declaration wording below is
//       constitutional (the APPLY_CONFIRM_WORDING discipline)
//   §13 CURATE ORGANIZATIONAL KNOWLEDGE is the one capability gating
//       publish/retire/reinstate — mapped to the house licensing key,
//       untied from any role word; capability opens the door, the
//       declaration walks through it
//   §14 published revisions are never hard-deleted; never-published drafts
//       discard freely; empty identities may be deleted
//
// NAMING NOTE: src/lib/blueprints.ts is the LEGACY v182 object — a named
// pointer to a proposal version whose content is read LIVE from its source:
// a proto-promotion, and precisely the live ancestry the negative law
// forbids the constitutional object to have. The two share a word, not a
// nature. The legacy module is untouched; its reconciliation is reserved
// for the BP-5 promotion slice.
//
// Data layer: src/lib/blueprintShelfSupabase.ts (the promotion.ts /
// promotionSupabase.ts split — this file imports no client and is fully
// unit-testable).
// ═══════════════════════════════════════════════════════════════════════════
import { currentCan } from "./featureCapabilities";

// ── §13: the one capability, named constitutionally, keyed mechanically. ──
export const CURATE_ORGANIZATIONAL_KNOWLEDGE = "knowledge.curate";

// ── §3: the constitutional intent declaration — one sentence, fixed,
//    displayed and affirmed at the publish act, recorded with the act.
//    This constant is the single source of the wording in src/ (unit-pinned);
//    the SQL CHECK constraint carries the same sentence at the database. ──
export const PUBLISH_DECLARATION = "This revision is now organizational knowledge.";

// ── §2/§3: the closed state sets — nothing beyond them exists; a state
//    that changes no verbs was refused admission (§3). ──
export type RevisionState = "draft" | "published" | "superseded";
export type IdentityStatus = "active" | "retired";
export const REVISION_STATES: readonly RevisionState[] = ["draft", "published", "superseded"];
export const IDENTITY_STATUSES: readonly IdentityStatus[] = ["active", "retired"];

export interface BlueprintIdentity {
  id: string;
  tenant_id?: string;
  name: string;
  taxonomy: string | null;
  status: IdentityStatus;
  published_revision_id: string | null;
  created_at: string;
  retired_at: string | null;
}

export interface BlueprintRevision {
  id: string;
  identity_id: string;
  revision_number: number;
  state: RevisionState;
  content: unknown; // authored payload; the constitutional SHAPE (§6 field treatments) lands in BP-2
  supersedes_revision_id: string | null;
  seeded_from_revision_id: string | null;
  created_at: string;
  published_at: string | null;
  published_by: string | null;
}

// ── §3: THE VERB ADMISSION TEST, encoded. A state exists only where it
//    changes the available verbs; these sets ARE the states' justification. ──
export type RevisionVerb = "edit" | "discard" | "publish";
export type PublishedVerb = "instantiate" | "begin_new_draft" | "retire_identity";
export type IdentityVerb = "begin_draft" | "retire" | "reinstate" | "view_history" | "instantiate";

/** Verbs available on a revision, per §3. Superseded revisions act on
 *  nothing — they are readable, citable history (§2), which is not a verb. */
export function revisionVerbs(state: RevisionState): readonly (RevisionVerb | PublishedVerb)[] {
  switch (state) {
    case "draft":     return ["edit", "discard", "publish"];
    case "published": return ["instantiate", "begin_new_draft", "retire_identity"];
    case "superseded": return [];
  }
}

/** Verbs available on an identity, per §3. `instantiate` is DERIVED here and
 *  consumed nowhere until BP-3 — the shelf knows its verb set; nothing
 *  executes it yet (the slice map's "nothing consumes it yet"). */
export function identityVerbs(identity: Pick<BlueprintIdentity, "status" | "published_revision_id">): readonly IdentityVerb[] {
  if (identity.status === "retired") return ["view_history", "reinstate"];
  const verbs: IdentityVerb[] = ["begin_draft", "retire", "view_history"];
  if (identity.published_revision_id) verbs.unshift("instantiate");
  return verbs;
}

// ── §3 + §13: the publish gate — BOTH the capability AND the exact
//    declaration. Authority answers who may; intent answers whether it was
//    deliberate; neither substitutes for the other. ──
export type PublishRefusal =
  | "CAPABILITY_REQUIRED"   // the door is closed
  | "PUBLISH_INTENT_REQUIRED" // the door is open, nobody walked through it
  | null;

export function publishRefusal(
  declaration: string,
  canCheck: (capability: string) => boolean = currentCan(),
): PublishRefusal {
  if (!canCheck(CURATE_ORGANIZATIONAL_KNOWLEDGE)) return "CAPABILITY_REQUIRED";
  if (declaration !== PUBLISH_DECLARATION) return "PUBLISH_INTENT_REQUIRED";
  return null;
}

export const canPublish = (
  declaration: string,
  canCheck: (capability: string) => boolean = currentCan(),
): boolean => publishRefusal(declaration, canCheck) === null;

// ── §2: immutability — amendment is supersession. The database trigger is
//    the wall; this guard is the courteous refusal before the wall. ──
export function assertDraftEditable(revision: Pick<BlueprintRevision, "state">): void {
  if (revision.state !== "draft") throw new Error("BLUEPRINT_REVISION_IMMUTABLE");
}

/** §14: only never-published drafts discard freely. */
export function assertDiscardable(revision: Pick<BlueprintRevision, "state">): void {
  if (revision.state !== "draft") throw new Error("PUBLISHED_REVISIONS_ARE_NEVER_DELETED");
}

/** §2: revision numbers chain monotonically under an identity. */
export function nextRevisionNumber(existing: readonly Pick<BlueprintRevision, "revision_number">[]): number {
  return existing.reduce((m, r) => Math.max(m, r.revision_number), 0) + 1;
}

// ── §2/§3: THE SUPERSESSION TRANSITION, as a pure function — the publish
//    act's state arithmetic, testable without a database. The RPC performs
//    exactly this plan in one transaction. ──
export interface SupersessionPlan {
  publish: string;                       // revision id gaining the designation
  supersede: string | null;              // prior published revision id, if any
  supersedes_revision_id: string | null; // chain link recorded on the new revision
  designation: string;                   // identity.published_revision_id after
}

export function planSupersession(
  identity: Pick<BlueprintIdentity, "status" | "published_revision_id">,
  target: Pick<BlueprintRevision, "id" | "state">,
): SupersessionPlan {
  if (identity.status !== "active") throw new Error("IDENTITY_RETIRED");
  if (target.state !== "draft") throw new Error("ONLY_DRAFTS_PUBLISH");
  return {
    publish: target.id,
    supersede: identity.published_revision_id,
    supersedes_revision_id: identity.published_revision_id,
    designation: target.id,
  };
}

// ── §3: the retired shelf offers nothing for new use while history stands.
//    Consumed by BP-3; derived here so the law has one home. ──
export function offeredRevisionId(
  identity: Pick<BlueprintIdentity, "status" | "published_revision_id">,
): string | null {
  if (identity.status !== "active") return null;
  return identity.published_revision_id;
}
