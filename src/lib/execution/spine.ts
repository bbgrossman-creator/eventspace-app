// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION OS · SPINE CLIENT (v275)
//
// Typed wrappers over the v275 SQL ceremonies and projections. This module holds
// NO derivation logic: obligation state and readiness are computed by the
// authoritative SQL functions (obligation_state / event_readiness) — "one
// derivation, many renderings." The client only calls them and shapes the result
// for rendering. Authority lives in the database (default-deny release,
// append-only evidence); nothing here can bypass it.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "@/lib/supabase";

export type Department = "culinary" | "equipment" | "staffing" | "venue" | "logistics";
export type ObligationState =
  | "blocked" | "ready" | "active" | "complete" | "exception" | "invalidated";
export type EvidenceKind =
  | "released" | "clearance" | "sign_off" | "assignment" | "scan" | "inspection"
  | "completion" | "exception" | "invalidated" | "superseded" | "cancelled";

export interface EventRecord {
  id: string;
  engagement_ref: string;       // the booking/engagement identity (singularity key)
  origin_commitment_ref: string; // provenance: the accepted offer
  released_at: string;
  released_by: string;
}

export interface ObligationRow {
  id: string;
  event_ref: string;
  origin_ref: string;
  origin_kind: string;
  kind: string;
  department: Department;
  required_outcome: string;      // "unresolved: …" encodes decision-debt
  resource_role: string | null;
  dependencies: string[];        // predecessor natural_keys
  natural_key: string;
}

export interface EvidenceRow {
  id: string;
  event_ref: string;
  obligation_ref: string | null;
  kind: EvidenceKind;
  actor: string;
  moment: string;
  payload: Record<string, unknown>;
  prior_ref: string | null;
}

/** True when required_outcome carries decision-debt (knowledge not yet modeled). */
export function isDecisionDebt(o: Pick<ObligationRow, "required_outcome">): boolean {
  return o.required_outcome.startsWith("unresolved:");
}

// ─── ceremonies (write paths; authority enforced server-side) ────────────────

/** Default-deny, layered Operational Release. Returns the materialized event id
 *  and the count of generated obligations, or throws the server's refusal
 *  (RELEASE_PREDICATE_UNSATISFIED: <layer> | RELEASE_ALREADY_RELEASED | …). */
export async function releaseEvent(args: {
  booking: string; actor: string;
  signoffRef: string; clearanceRef?: string | null; waiverRef?: string | null;
}): Promise<{ eventId: string; generatedCount: number }> {
  const { data, error } = await supabase.rpc("release_event", {
    p_booking: args.booking, p_actor: args.actor,
    p_signoff_ref: args.signoffRef,
    p_clearance_ref: args.clearanceRef ?? null,
    p_waiver_ref: args.waiverRef ?? null,
  });
  if (error) throw new Error(error.message);
  return { eventId: data.event_id, generatedCount: data.generated_count };
}

/** The append-only write path a DailyOps completion invokes (I-38). */
export async function recordEvidence(args: {
  event: string; obligation?: string | null; kind: EvidenceKind;
  actor: string; payload?: Record<string, unknown>; prior?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("record_execution_evidence", {
    p_event: args.event, p_obligation: args.obligation ?? null,
    p_kind: args.kind, p_actor: args.actor,
    p_payload: args.payload ?? {}, p_prior: args.prior ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Idempotent regeneration (safe to call after an amendment). */
export async function regenerate(eventId: string): Promise<number> {
  const { data, error } = await supabase.rpc("generate_obligations", { p_event: eventId });
  if (error) throw new Error(error.message);
  return data as number;
}

// ─── projections (reads; authoritative derivation is SQL) ────────────────────

export async function getObligationState(obligationId: string): Promise<ObligationState | null> {
  const { data, error } = await supabase.rpc("obligation_state", { p_obligation: obligationId });
  if (error) throw new Error(error.message);
  return (data as ObligationState | null) ?? null;
}

export async function getEventReadiness(eventId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("event_readiness", { p_event: eventId });
  if (error) throw new Error(error.message);
  return (data as Record<string, unknown>) ?? {};
}

export async function loadEventForEngagement(bookingId: string): Promise<EventRecord | null> {
  const { data } = await supabase.from("event")
    .select("id,engagement_ref,origin_commitment_ref,released_at,released_by")
    .eq("engagement_ref", bookingId).maybeSingle();
  return (data as EventRecord | null) ?? null;
}

export async function loadObligations(eventId: string): Promise<ObligationRow[]> {
  const { data } = await supabase.from("obligation")
    .select("id,event_ref,origin_ref,origin_kind,kind,department,required_outcome,resource_role,dependencies,natural_key")
    .eq("event_ref", eventId);
  return (data as ObligationRow[] | null) ?? [];
}

export async function loadEvidence(eventId: string, obligationId?: string): Promise<EvidenceRow[]> {
  let q = supabase.from("execution_evidence")
    .select("id,event_ref,obligation_ref,kind,actor,moment,payload,prior_ref")
    .eq("event_ref", eventId).order("moment", { ascending: true });
  if (obligationId) q = q.eq("obligation_ref", obligationId);
  const { data } = await q;
  return (data as EvidenceRow[] | null) ?? [];
}

// ─── v276 lifecycle (stage is derived in SQL; the app renders, never recomputes) ─

export type EventStage = "released" | "in_prep" | "ready" | "in_service" | "closed";

export interface EventStageDetail {
  event_id: string;
  stage: EventStage;
  why: string;
  established_by: { kind: string; actor: string; moment: string }[];
  blockers: string[];
  next_action: string;
  readiness: Record<string, unknown>;
}

/** The authoritative stage + explanation, derived in SQL (event_stage_detail). */
export async function getEventStageDetail(eventId: string): Promise<EventStageDetail | null> {
  const { data, error } = await supabase.rpc("event_stage_detail", { p_event: eventId });
  if (error) throw new Error(error.message);
  return (data as EventStageDetail | null) ?? null;
}

export async function getEventStage(eventId: string): Promise<EventStage | null> {
  const { data, error } = await supabase.rpc("event_stage", { p_event: eventId });
  if (error) throw new Error(error.message);
  return (data as EventStage | null) ?? null;
}

/** Authorized service-start ceremony (default-deny; refuses unless ready). */
export async function startService(eventId: string, actor: string): Promise<{ eventId: string; stage: EventStage }> {
  const { data, error } = await supabase.rpc("start_service", { p_event: eventId, p_actor: actor });
  if (error) throw new Error(error.message);
  return { eventId: data.event_id, stage: data.stage };
}

/** Authorized close ceremony (default-deny; refuses while a closeout predicate is
 *  unresolved; requires an explicit closeout override — never a fabricated close). */
export async function closeEvent(eventId: string, actor: string, closeoutOverride: string): Promise<{ eventId: string; stage: EventStage }> {
  const { data, error } = await supabase.rpc("close_event", {
    p_event: eventId, p_actor: actor, p_closeout_override: closeoutOverride,
  });
  if (error) throw new Error(error.message);
  return { eventId: data.event_id, stage: data.stage };
}

// ─── v277 Event Operations Workspace (one composed SQL projection; UI renders it) ─

export interface WsHeader {
  event_id: string; engagement_ref: string; origin_commitment_ref: string;
  released_at: string; released_by: string; stage: EventStage;
  readiness: { resolved: number; total: number };
  blocker_count: number; exception_count: number; last_activity: string | null;
}
export interface WsCategory {
  department: Department; resolved: number; total: number; exceptions: number;
  blocking: string[]; state: "pending" | "in_progress" | "complete" | "exception";
}
export interface WsCard {
  id: string; kind: string; department: Department; title: string;
  state: ObligationState; decision_debt: boolean; exception: boolean;
  dependencies: string[];
  latest_evidence: { kind: string; actor: string; moment: string } | null;
  actions: string[];
}
export interface WsBlocker { what: string; cause_ref: string | null; why: string; next_action: string; }
export interface WsNextAction { action: string; label: string; available: boolean; reason: string | null; }
export interface WsActivity {
  kind: EvidenceKind; obligation_ref: string | null; actor: string; moment: string;
  note: Record<string, unknown>; correction_of: string | null;
}
export interface EventWorkspace {
  header: WsHeader;
  lifecycle: EventStageDetail;
  readiness_by_category: WsCategory[];
  workboard: WsCard[];
  blockers: WsBlocker[];
  next_actions: WsNextAction[];
  recent_activity: WsActivity[];
}

/** The whole workspace, derived in one SQL call (event_workspace). The UI renders
 *  this; it computes no lifecycle/readiness/state/blockers itself. */
export async function getEventWorkspace(eventId: string): Promise<EventWorkspace | null> {
  const { data, error } = await supabase.rpc("event_workspace", { p_event: eventId });
  if (error) throw new Error(error.message);
  return (data as EventWorkspace | null) ?? null;
}
