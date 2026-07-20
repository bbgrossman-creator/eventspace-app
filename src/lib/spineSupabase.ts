// ═══════════════════════════════════════════════════════════════════════════
// SPINE — data (v263 · PL-1). The ceremony doors and the two reads. Every
// state change goes through a ceremony RPC (atomic: precondition at the
// door, state write, exactly one ledger entry); nothing here — or anywhere —
// updates bookings.spine_state directly, and nothing computes state from
// the ledger (loadEffectivePosition reads the stored state; loadLedger
// feeds the history VIEW only).
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { deriveLifecycle, EffectivePosition } from "./spine";

export interface LedgerEntry {
  id: string;
  ceremony: string;
  actor: string;
  moment: string;
  from_state: string | null;
  to_state: string | null;
  object_ref: string | null;
  reason: string | null;
}

export interface CeremonyOutcome { ok: boolean; outcome?: string; detail?: string }

const call = async (fn: string, args: Record<string, unknown>): Promise<CeremonyOutcome> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, detail: error.message };
  return { ok: true, outcome: (data as { outcome?: string } | null)?.outcome };
};

/** Births the spine — virgin engagements only (the guardrail refuses
 *  legacy-ahead rows; no bridge transitions exist). */
export const openInquiry = (bookingId: string, actor: string) =>
  call("open_inquiry", { p_booking: bookingId, p_actor: actor });

/** Attached at the create-proposal choke point. Three honest outcomes:
 *  transitioned | already (silent) | legacy_untouched (the row stays
 *  derived; the create proceeds; nothing is written). */
export const openProposing = (bookingId: string, actor: string) =>
  call("open_proposing", { p_booking: bookingId, p_actor: actor });

export const declineEngagement = (bookingId: string, actor: string, reason: string) =>
  call("decline_engagement", { p_booking: bookingId, p_actor: actor, p_reason: reason });

export const withdrawOffer = (versionId: string, actor: string) =>
  call("withdraw_offer", { p_version: versionId, p_actor: actor });

/** The engagement's honest position: ceremonial where the stored state
 *  exists; legacy-derived classification (computed from observable
 *  proposal facts, never stored) where it does not. */
export async function loadEffectivePosition(bookingId: string): Promise<EffectivePosition | null> {
  const { data: b } = await supabase.from("bookings")
    .select("id,spine_state").eq("id", bookingId).maybeSingle();
  if (!b) return null;
  const spine = (b as { spine_state: string | null }).spine_state;
  if (spine) return deriveLifecycle(spine, { hasWonProposal: false, hasAnyProposal: false });
  const { data: props } = await supabase.from("proposals")
    .select("id,status").eq("booking_id", bookingId);
  const rows = (props ?? []) as { status: string }[];
  return deriveLifecycle(null, {
    hasWonProposal: rows.some((p) => p.status === "won"),
    hasAnyProposal: rows.length > 0,
  });
}

/** History, for the history view only — never an input to state. */
export async function loadLedger(bookingId: string): Promise<LedgerEntry[]> {
  const { data } = await supabase.from("engagement_ledger")
    .select("id,ceremony,actor,moment,from_state,to_state,object_ref,reason")
    .eq("booking_id", bookingId).order("moment", { ascending: true });
  return (data ?? []) as LedgerEntry[];
}
