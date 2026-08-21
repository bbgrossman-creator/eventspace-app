// ═══════════════════════════════════════════════════════════════════════════
// v311 · KITCHEN QUANTITIES CLIENT
//
// Typed wrappers over the v311 SQL. This module computes NOTHING. Every number
// the panel shows — the recommendation, the guest count it stands on, the
// adjusted and approved figures, whether review is required, whether the actor
// may act — is produced by kitchen_event_panel and rendered as received.
//
// That is not stylistic. A quantity calculated in a browser would be a second
// derivation of operational demand, able to disagree with the one the database
// treats as authoritative, and the disagreement would surface as a Kitchen lead
// preparing a different amount from the one the system approved. There is one
// derivation (kitchen_quantity_derive); preview and enactment already share it,
// and the client is a third reader of it, never a fourth implementation.
//
// Refusals are surfaced verbatim. KITCHEN_QUANTITY_NOT_PERMITTED is the
// Authority Grant speaking; softening it into "you can't do that right now"
// would hide which act was refused and why.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "@/lib/supabase";

/** Refusals the Quantities ceremonies raise. Listed so a code can be recognised
 *  and shown as itself — never mapped to an invented friendlier claim. */
export const KITCHEN_REFUSALS = [
  "KITCHEN_QUANTITY_NOT_PERMITTED",
  "KITCHEN_ADJUST_QUANTITY_REQUIRED",
  "KITCHEN_ADJUST_REASON_REQUIRED",
  "KITCHEN_APPROVE_REASON_REQUIRED",
  "KITCHEN_APPROVE_NO_QUANTITY",
  "KITCHEN_APPROVE_REVISION_FAILED",
  "KITCHEN_REQUIREMENT_NOT_FOUND",
  "CEREMONY_NOT_FOUND",
] as const;

export class KitchenRefusal extends Error {
  readonly code: string;
  readonly raw: string;
  constructor(code: string, message: string, raw: string) {
    super(message);
    this.name = "KitchenRefusal";
    this.code = code;
    this.raw = raw;
  }
}

export function normalizeKitchenRefusal(raw: string): KitchenRefusal {
  const text = (raw ?? "").replace(/^Error:\s*/, "");
  const code = KITCHEN_REFUSALS.find((c) => text.includes(c));
  if (code) {
    const after = text.split(code)[1] ?? "";
    return new KitchenRefusal(code, after.replace(/^[:\s]+/, "").trim() || text, text);
  }
  return new KitchenRefusal("KITCHEN_ERROR", text, text);
}

async function invoke<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw normalizeKitchenRefusal(error.message);
  return data as T;
}

/** One Kitchen line as the database reports it.
 *
 *  Quantities arrive as strings because they are SQL numerics rendered by
 *  kitchen_quantity_text; they are display truth and are not re-parsed for
 *  arithmetic anywhere in the client. */
export interface KitchenLine {
  requirement_line: string;
  requirement_revision: string | null;
  item: string | null;
  /** The head revision's outcome text — after approval it states the quantity. */
  requirement: string | null;
  recommended_quantity: string | null;
  recommendation_resolved: boolean;
  unresolved_reason: string | null;
  /** e.g. "130 guests × 1 per guest = 130", written when the recommendation
   *  was recorded so it survives its operands moving. */
  derivation: string | null;
  guest_count: string | null;
  guest_count_basis: string | null;
  design_quantity: string | null;
  adjusted_quantity: string | null;
  adjusted_by: string | null;
  adjusted_reason: string | null;
  approved_quantity: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approval_reason: string | null;
  /** Null until approval: a recommendation never reaches a later stage. */
  fulfillable_quantity: string | null;
  review_required: boolean;
  review_reason: string | null;
  /** Derived from explicit Authority Grants — never from a role name. */
  may_adjust: boolean;
  may_approve: boolean;
}

export interface KitchenPanel {
  stage: "enacted";
  operative: true;
  event_ref: string;
  as_of: string;
  guest_count: string | null;
  lines: KitchenLine[];
}

/** One preview line. Shaped separately from KitchenLine on purpose: a preview
 *  has no decisions, no authority and no Requirement, and a type that could hold
 *  them would invite a surface to pretend it does. */
export interface KitchenPreviewLine {
  component_ref: string | null;
  component: string | null;
  item_ref: string | null;
  item: string | null;
  quantity_basis: string | null;
  design_quantity: string | null;
  attendance_used: string | null;
  required_quantity: string | null;
  resolved: boolean;
  unresolved_reason: string | null;
}

export interface KitchenPreview {
  stage: "preview";
  operative: false;
  note: string;
  snapshot_ref: string;
  attendance_basis: string | null;
  lines: KitchenPreviewLine[];
}

/** ENACTED. The Kitchen lines a released Event actually owes. */
export const getKitchenPanel = (eventId: string, asOf?: string) =>
  invoke<KitchenPanel>("kitchen_event_panel", {
    p_event: eventId,
    ...(asOf ? { p_as_of: asOf } : {}),
  });

/** PREVIEW. Keyed on a snapshot because it must work before any Event exists.
 *  Writes nothing, and every line is marked non-operative. */
export const getKitchenPreview = (snapshotId: string, guestCount?: number) =>
  invoke<KitchenPreview>("kitchen_requirement_preview", {
    p_snapshot: snapshotId,
    ...(guestCount === undefined ? {} : { p_attendance: guestCount }),
  });

/** Propose a different quantity. Not an approval — the adjusted figure does not
 *  become fulfillable, and adjust authority does not imply approve authority. */
export const adjustKitchenQuantity = (requirement: string, quantity: number, reason: string) =>
  invoke<{ decision_id: string; created: boolean; requirement_line: string }>(
    "adjust_kitchen_quantity",
    { p_requirement: requirement, p_quantity: quantity, p_reason: reason },
  );

/** Approve. One act with two inseparable effects: the approval decision, and the
 *  superseding quantified Requirement revision. Returns the revision it created
 *  so the caller can see that the Requirement itself moved. */
export const approveKitchenQuantity = (requirement: string, reason: string, quantity?: number) =>
  invoke<{
    decision_id: string; created: boolean; approved_quantity: string;
    requirement_line: string; requirement_revision: string;
  }>("approve_kitchen_quantity", {
    p_requirement: requirement,
    p_reason: reason,
    ...(quantity === undefined ? {} : { p_quantity: quantity }),
  });
