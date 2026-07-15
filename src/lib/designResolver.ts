// ═══════════════════════════════════════════════════════════════════════════
// THE DESIGN RESOLVER — the A1 hedge (v196)
//
// ─── THE PROBLEM THIS IS INSURANCE AGAINST ────────────────────────────────
// The executable Event Design hangs off `proposal_versions` — a SALES artifact.
// guest counts, sections, choice groups, adjustments: all of them live on a
// version. So when Production asks "how many guests?", the honest answer today
// is *read the won proposal version*, and **the kitchen's source of truth is a
// sales document.**
//
// The workflow walkthrough made this visceral in a way the audit could not:
// watch the chef's Production lens and his prep quantities are a projection of
// `version_guests`. Open v3 to try a cheaper menu and Production is reading a
// document Sales is experimenting in.
//
// ─── WHAT THIS FILE IS, AND IS NOT ────────────────────────────────────────
// It is NOT the fix. The fix is an `event_design` object owned by the EVENT,
// which a proposal version SNAPSHOTS — evidence tense (§2d.ii), which the Tense
// Doctrine has wanted all along. That is a migration and it is not v196.
//
// This is the **seam**. Every "which design is the event?" read goes through
// one function, so the day the object lands, ONE function changes instead of
// forty call sites. It is the cheapest insurance in the codebase and it costs
// nothing today: right now it returns a version id, exactly as callers already
// assume.
//
// ─── THE QUESTION IT MAKES ANSWERABLE ─────────────────────────────────────
// "Which version IS the event?" is currently answered by every caller
// independently, and mostly by accident — `order by created_at limit 1` appears
// in several places, including the benchmark script I wrote. That is not a
// resolution rule; it is a coin toss with a stable seed. Below is the rule,
// stated once, in one place, with its reasoning attached.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";

/** Why this version was chosen. Kept because "why is Production reading v2?"
 *  is a question someone will ask at 6 AM with a braise on. */
export type DesignSource =
  | "won"        // the proposal was won and names its version — unambiguous
  | "approved"   // a version is approved but the proposal isn't closed
  | "sent"       // the latest thing the customer has actually seen
  | "draft"      // nothing sent yet; the newest draft is the best guess
  | "none";      // no design exists

export interface ResolvedDesign {
  bookingId: string;
  /** null when nothing has been composed. Callers must handle it — an event
   *  with no design is a REAL state (an inquiry), not an error. */
  versionId: string | null;
  proposalId: string | null;
  version: number | null;
  source: DesignSource;
  /** True when the resolution rested on a guess rather than a fact — i.e. we
   *  fell through to a draft. Production reading a DRAFT is a real risk worth
   *  surfacing: Sales may be editing it right now. Nobody acts on this yet;
   *  it exists so that when someone does, the information is already there. */
  provisional: boolean;
}

const NONE = (bookingId: string): ResolvedDesign => ({
  bookingId, versionId: null, proposalId: null, version: null,
  source: "none", provisional: false,
});

/**
 * **The one place that answers "which version is the event?"**
 *
 * The rule, in order — each rung a stronger claim than the next:
 *   1. WON      — the proposal names its won version. A commercial fact.
 *   2. APPROVED — a version the customer approved.
 *   3. SENT     — the latest version the customer has actually seen. Not
 *                 agreed, but at least not something Sales is mid-thought on.
 *   4. DRAFT    — the newest draft, flagged PROVISIONAL, because Sales may be
 *                 editing it while the kitchen reads it. This rung is exactly
 *                 the A1 problem, and naming it is the point: it does not go
 *                 away by being resolved, it goes away when the design stops
 *                 living on a sales artifact.
 *
 * When `event_design` lands, everything above collapses to one row read and
 * this signature does not change.
 */
export async function designForBooking(bookingId: string): Promise<ResolvedDesign> {
  if (!bookingId) return NONE(bookingId);

  const { data: props } = await supabase
    .from("proposals").select("id,won_version_id,status")
    .eq("booking_id", bookingId).order("created_at");
  const proposals = (props ?? []) as { id: string; won_version_id: string | null; status: string }[];
  if (!proposals.length) return NONE(bookingId);

  // ── 1. WON — the only unambiguous rung ──
  const won = proposals.find((p) => p.won_version_id);
  if (won?.won_version_id) {
    const { data: v } = await supabase.from("proposal_versions")
      .select("id,version").eq("id", won.won_version_id).maybeSingle();
    const row = v as { id: string; version: number } | null;
    if (row) {
      return { bookingId, versionId: row.id, proposalId: won.id,
               version: row.version, source: "won", provisional: false };
    }
  }

  // ── 2–4. Otherwise the best version across this booking's proposals ──
  // NOTE: "across proposals" is itself an assumption (audit A10 — one proposal
  // per booking is assumed, never enforced). Concentrating that assumption
  // HERE is half the value of this file: when two concurrent proposals become
  // real, this is the only function that has to learn about it.
  const { data: vers } = await supabase.from("proposal_versions")
    .select("id,proposal_id,version,status,sent_at")
    .in("proposal_id", proposals.map((p) => p.id))
    .order("version", { ascending: false });
  const versions = (vers ?? []) as {
    id: string; proposal_id: string; version: number; status: string; sent_at: string | null;
  }[];
  if (!versions.length) return NONE(bookingId);

  const pick = (pred: (v: typeof versions[number]) => boolean) => versions.find(pred);

  const approved = pick((v) => v.status === "approved");
  if (approved) {
    return { bookingId, versionId: approved.id, proposalId: approved.proposal_id,
             version: approved.version, source: "approved", provisional: false };
  }

  const sent = pick((v) => v.status === "sent" || !!v.sent_at);
  if (sent) {
    return { bookingId, versionId: sent.id, proposalId: sent.proposal_id,
             version: sent.version, source: "sent", provisional: false };
  }

  const draft = versions[0];   // highest version number
  return { bookingId, versionId: draft.id, proposalId: draft.proposal_id,
           version: draft.version, source: "draft", provisional: true };
}

/** Human-readable, for anywhere that shows a non-sales user WHICH design they
 *  are reading and why. The chef deserves to know he is looking at a draft. */
export function designSourceLabel(d: ResolvedDesign): string {
  switch (d.source) {
    case "won":      return `v${d.version} · won`;
    case "approved": return `v${d.version} · approved`;
    case "sent":     return `v${d.version} · sent to customer`;
    case "draft":    return `v${d.version} · DRAFT — sales may still be editing`;
    case "none":     return "nothing composed yet";
  }
}
