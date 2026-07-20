// ═══════════════════════════════════════════════════════════════════════════
// PUBLISH — data (v265 · PL-3 Phase A). The Prepare service (Stage One,
// constitutionally inert) and the Publish RPC wrapper (Stage Two, the atomic
// door). Prepare resolves → fingerprints → renders → freezes → archives into a
// staged package under provisional identity. Publish promotes it in one
// transaction, or refuses by name. Nothing here is customer-visible until
// publish_offer commits and mints the endpoint.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { ResolvedModel, OfferProfile, ReviewCheck, ReviewContext,
  fingerprint, evaluateCompleteness, evaluateReview } from "./publish";

export interface StagedPackage {
  id: string; versionId: string; fingerprint: string;
  hasArchive: boolean; complete: boolean; profileSatisfied: boolean;
}

export interface PublishOutcome {
  ok: boolean; outcome?: string; snapshotId?: string;
  evidence?: string; endpointToken?: string | null; detail?: string;
}

/** STAGE ONE — Prepare. Constitutionally inert: produces a staged package and
 *  nothing else. Advisory gate evaluation is a courtesy; the binding check is
 *  the Publish door. `render` is injected (the shipped renderer path) so this
 *  module stays pure of the render internals. */
export async function prepare(
  versionId: string,
  model: ResolvedModel,
  profile: OfferProfile,
  render: (m: ResolvedModel) => Promise<{ bytes: Uint8Array; hash: string; meta: Record<string, unknown> }>,
): Promise<{ ok: boolean; staged?: StagedPackage; detail?: string }> {
  // B3 — capture the version's current content_revision as the freshness
  // witness. The door compares it under lock; an edit between here and Publish
  // bumps it and makes this package STALE_PREPARATION.
  const { data: verRow } = await supabase.from("proposal_versions")
    .select("content_revision").eq("id", versionId).maybeSingle();
  const contentRevision = (verRow as { content_revision: number } | null)?.content_revision ?? 0;
  const fp = fingerprint(model);
  const completeness = evaluateCompleteness(model, profile);
  // render + freeze the archive (mandatory; Guarantee C). Failure here is a
  // Prepare failure — constitutionally silent, retryable.
  let artifact: { bytes: Uint8Array; hash: string; meta: Record<string, unknown> };
  try {
    artifact = await render(model);
  } catch (e) {
    return { ok: false, detail: `Preparation failed at render: ${(e as Error).message}` };
  }
  // the model carries the resolved completeness verdict the door reads, plus
  // its full content (frozen by value at promotion)
  const storedModel = { ...model, complete: completeness.complete,
    profile_satisfied: completeness.profileSatisfied };
  const { data, error } = await supabase.from("staged_artifact_packages").insert({
    version_id: versionId, fingerprint: fp, model: storedModel,
    artifact_bytes: artifact.bytes, artifact_hash: artifact.hash,
    artifact_meta: artifact.meta, assets: model.assets,
    content_revision: contentRevision,   // B3 freshness witness
  }).select("id").single();
  if (error || !data) return { ok: false, detail: error?.message ?? "staging failed" };
  return { ok: true, staged: {
    id: (data as { id: string }).id, versionId, fingerprint: fp, hasArchive: true,
    complete: completeness.complete, profileSatisfied: completeness.profileSatisfied } };
}

/** STAGE TWO — Publish. The atomic door. The app re-resolves the current model
 *  and refuses to call if the fingerprint drifted from the staged package
 *  (client-side staleness guard, mirrored by the door's own checks). */
export async function publish(args: {
  versionId: string; actor: string; stagedId: string;
  policy: ReviewCheck[]; reviewContext: ReviewContext;
  evidence: "observed" | "attested";
  occurredAt?: string; attestationNote?: string;
}): Promise<PublishOutcome> {
  const review = evaluateReview(args.policy, args.reviewContext);
  const channel = args.evidence === "observed" ? "endpoint" : "in_person";
  const { data, error } = await supabase.rpc("publish_offer", {
    p_version: args.versionId, p_actor: args.actor, p_staged: args.stagedId,
    p_policy: { demandsReview: review.demandsReview, demandedChecks: review.demandedChecks },
    p_profile: {}, p_evidence: args.evidence, p_channel: channel,
    p_occurred_at: args.occurredAt ?? null, p_reason: args.attestationNote ?? null,
  });
  if (error) return { ok: false, detail: error.message };
  const d = data as { outcome?: string; snapshot_id?: string; evidence?: string; endpoint_token?: string | null };
  return { ok: true, outcome: d?.outcome, snapshotId: d?.snapshot_id,
    evidence: d?.evidence, endpointToken: d?.endpoint_token ?? null };
}

/** Record a review decision (evidence, never a token). */
export async function recordReview(
  versionId: string, decision: "requested" | "approved" | "rejected",
  actor: string, opts: { fingerprint?: string; checksAnswered?: string[]; authority?: unknown; reason?: string } = {},
): Promise<{ ok: boolean; detail?: string }> {
  const { error } = await supabase.from("review_decisions").insert({
    version_id: versionId, decision, actor,
    fingerprint: opts.fingerprint ?? null, checks_answered: opts.checksAnswered ?? null,
    authority: opts.authority ?? null, reason: opts.reason ?? null,
  });
  return error ? { ok: false, detail: error.message } : { ok: true };
}

/** Read a published Snapshot — the ONLY source of what was shown. Consults no
 *  live proposal data (the PL-4 handoff contract, exercised early). */
export async function loadSnapshot(versionId: string): Promise<{ id: string; fingerprint: string; model: unknown } | null> {
  const { data } = await supabase.from("offer_snapshots")
    .select("id,fingerprint,model").eq("version_id", versionId).maybeSingle();
  return (data as { id: string; fingerprint: string; model: unknown } | null) ?? null;
}
