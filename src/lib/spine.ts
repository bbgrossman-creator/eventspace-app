// ═══════════════════════════════════════════════════════════════════════════
// SPINE — pure law (v263 · PL-1). The engagement's constitutional lifecycle,
// as the Proposal Lifecycle Constitution defines it. Two laws live here:
//
//   THE VOCABULARY — the full spine (so later slices never re-open it) and
//   the PL-1 reachable subset. Dormant states are values with no door:
//   nothing in this codebase writes them, and their only legible appearance
//   before their ceremony ships is inside a legacy-derived classification.
//
//   THE TWO-CONCEPT STATE MODEL — the heart of honest grandfathering:
//     · CEREMONIAL SPINE STATE: stored on the engagement, entered only
//       through a named ceremony, ledger-backed.
//     · LEGACY-DERIVED LIFECYCLE CLASSIFICATION: a read-time interpretation
//       of observable pre-PL facts, carrying explicit 'legacy-derived'
//       provenance and claiming NO ceremony, NO ledger, NO Instrument.
//   deriveLifecycle() returns both value and provenance, and nothing ever
//   silently converts derived into ceremonial — the crossing is always a
//   real ceremony.
//
// State is the answer; the ledger is the history of answers. Nothing in
// this module (or anywhere) computes state from the ledger.
// ═══════════════════════════════════════════════════════════════════════════

export type SpineState =
  | "inquiry" | "proposing"
  | "committed" | "in_execution" | "delivered" | "settled"   // dormant: no door until their slice
  | "declined" | "cancelled";                                 // cancelled dormant until PL-10

export const SPINE_LABELS: Record<SpineState, string> = {
  inquiry: "Inquiry", proposing: "Proposing",
  committed: "Committed", in_execution: "In Execution",
  delivered: "Delivered", settled: "Settled",
  declined: "Declined", cancelled: "Cancelled",
};

/** The states PL-1 ceremonies can reach. Everything else is dormant. */
export const PL1_REACHABLE: readonly SpineState[] = ["inquiry", "proposing", "declined"];

export type Provenance = "ceremonial" | "legacy-derived";

export interface EffectivePosition {
  /** The honest effective lifecycle position — what a reader should understand. */
  position: SpineState;
  /** How that position is known. */
  provenance: Provenance;
  /** The stored ceremonial spine state — null for untouched legacy engagements. */
  ceremonial: SpineState | null;
}

/**
 * The read-time derivation for engagements the ceremonies have not yet
 * touched, exactly as PL-1 specifies it: a won/accepted version → the
 * honest Committed FLOOR (claiming no Accept ceremony and no Instrument);
 * open offers → Proposing; neither → Inquiry. If a ceremonial state exists,
 * it IS the position — derivation never overrides ceremony.
 */
export function deriveLifecycle(
  spineState: string | null | undefined,
  facts: { hasWonProposal: boolean; hasAnyProposal: boolean },
): EffectivePosition {
  if (spineState) {
    return { position: spineState as SpineState, provenance: "ceremonial", ceremonial: spineState as SpineState };
  }
  const position: SpineState = facts.hasWonProposal ? "committed"
    : facts.hasAnyProposal ? "proposing" : "inquiry";
  return { position, provenance: "legacy-derived", ceremonial: null };
}

/** Version terminals (offer lifecycle). Withdrawn is reachable by its
 *  ceremony; SUPERSEDED HAS NO WRITER in this slice — vocabulary only,
 *  read-tolerated, awaiting PL-3/PL-4's honest proof of replacement. */
export const VERSION_TERMINAL_LABELS: Record<string, string> = {
  approved: "Accepted",          // Amendment 2: the organ's name; "Approved" remains valid chrome
  withdrawn: "Withdrawn",
  superseded: "Superseded",
};

export const isVersionTerminal = (status: string): boolean =>
  status === "approved" || status === "withdrawn" || status === "superseded";
