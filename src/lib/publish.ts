// ═══════════════════════════════════════════════════════════════════════════
// PUBLISH — pure law (v265 · PL-3 Phase A). The constitutional fingerprint,
// the canonical serialization it seals, the completeness core, and the review
// evaluator contract. NO IO: this module imports no data layer. The fingerprint
// is the materiality boundary — four uses (reuse, staleness, staged
// verification, integrity), one definition.
// ═══════════════════════════════════════════════════════════════════════════
import { createHash } from "crypto";

// ── The customer-visible resolved semantic model (what a customer understands) ──
export interface ResolvedModel {
  structure: unknown;          // chapters/sections/components/items, wording, ordering (visibility applied)
  pricing: {
    lines: { qty: number; unitMinor: number; taxable: boolean; label: string }[];
    adjustmentsMinor: number;
    subtotalMinor: number;
    taxMinor: number;
    serviceMinor: number;
    totalMinor: number;
    taxRate: number;           // the RATE VALUE used, as a number (frozen, not a pointer)
    serviceRate: number;
    currency: string;
  } | null;
  paymentSchedule: unknown | null;
  terms: unknown | null;
  eventFacts: Record<string, unknown>;   // as shown
  presentation: {                         // absorbs the v231/v239 stamp (F-1)
    theme: unknown; regionTexts: unknown; companyFacts: unknown; photoPins: unknown;
  };
  assets: { identity: string; hash: string }[];   // which images were shown (identity + content hash)
  locale: string;
}

// ── CANONICAL SERIALIZATION (constitutional law) ──
// Sorted keys; NFC strings; arrays order-significant; money already in minor
// units upstream; omitted and null are the same fact and both omitted; no
// timestamps/ids/env values (the model above contains none by construction).
export function canonicalize(value: unknown): string {
  const walk = (v: unknown): string => {
    if (v === null || v === undefined) return "\u0000omit";      // the omission law
    if (typeof v === "string") return JSON.stringify(v.normalize("NFC"));
    if (typeof v === "number") {
      if (!Number.isFinite(v)) throw new Error("non-finite number in canonical model");
      // one canonical decimal form: integers plain; others via normalized string
      return Number.isInteger(v) ? String(v) : String(v);
    }
    if (typeof v === "boolean") return v ? "true" : "false";
    if (Array.isArray(v)) return `[${v.map(walk).join(",")}]`;   // order-significant
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== null && o[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${walk(o[k])}`).join(",")}}`;
  };
  return walk(value);
}

// ── THE CONSTITUTIONAL FINGERPRINT — SHA-256 (not djb2) ──
// Collision resistance matters: reuse, staleness, and integrity all hang on
// equality. Renderer identity is NOT an input (it is recorded beside the
// snapshot); hidden/internal data is not an input (the model excludes it).
export function fingerprint(model: ResolvedModel): string {
  return createHash("sha256").update(canonicalize(model), "utf8").digest("hex");
}

// ── COMPLETENESS: the universal core + the declared offer profile ──
export interface OfferProfile {
  key: string;                    // "catering" | "venue_hold" | ...
  requiredFacts: string[];        // eventFacts keys that must be present & non-empty
}

export interface CompletenessVerdict {
  complete: boolean;              // the universal core
  profileSatisfied: boolean;      // the declared profile
  failures: string[];             // named, for independent reporting
}

/** The universal, form-independent core + the declared profile facts. */
export function evaluateCompleteness(model: ResolvedModel, profile: OfferProfile): CompletenessVerdict {
  const failures: string[] = [];
  // (1) at least one customer-visible commitment
  const hasCommitment = !!model.structure &&
    (Array.isArray(model.structure) ? model.structure.length > 0 : true);
  if (!hasCommitment) failures.push("no_visible_commitment");
  // (2) every shown commercial amount resolved (no placeholder tokens)
  if (model.pricing) {
    if (model.pricing.lines.some((l) => !Number.isFinite(l.unitMinor))) failures.push("unresolved_amount");
    // (3) one determinable stated currency where pricing is shown
    if (!model.pricing.currency) failures.push("no_currency");
    if (!Number.isFinite(model.pricing.totalMinor)) failures.push("total_indeterminate");
  }
  const complete = failures.length === 0;
  // (4) profile facts present
  const profileFailures = profile.requiredFacts.filter((f) => {
    const v = model.eventFacts[f];
    return v === null || v === undefined || v === "";
  }).map((f) => `profile:${f}`);
  return { complete, profileSatisfied: profileFailures.length === 0,
    failures: [...failures, ...profileFailures] };
}

// ── REVIEW EVALUATOR — declared predicates only; no org constants ──
export type ReviewCheck =
  | { kind: "threshold"; minMinor: number }
  | { kind: "first_proposal_for_relationship" }
  | { kind: "discount_present" }
  | { kind: "custom_or_unconfirmed_pricing" }
  | { kind: "actor_scope"; roles: string[] }
  | { kind: "offer_profile_scope"; profiles: string[] }
  | { kind: "deposit_deviation" };

export interface ReviewContext {
  totalMinor: number;
  hasDiscount: boolean;
  hasUnconfirmedPricing: boolean;
  actorRole: string;
  relationshipHasPriorOffer: boolean;
  offerProfile: string;
  depositDeviates: boolean;
}

export interface ReviewVerdict { demandsReview: boolean; demandedChecks: string[] }

/** Evaluates the DECLARED set against context. Holds no organization's
 *  beliefs — an empty policy demands nothing (empty-is-information). */
export function evaluateReview(policy: ReviewCheck[], ctx: ReviewContext): ReviewVerdict {
  const demanded: string[] = [];
  for (const c of policy) {
    const fires =
      c.kind === "threshold" ? ctx.totalMinor >= c.minMinor :
      c.kind === "first_proposal_for_relationship" ? !ctx.relationshipHasPriorOffer :
      c.kind === "discount_present" ? ctx.hasDiscount :
      c.kind === "custom_or_unconfirmed_pricing" ? ctx.hasUnconfirmedPricing :
      c.kind === "actor_scope" ? c.roles.includes(ctx.actorRole) :
      c.kind === "offer_profile_scope" ? c.profiles.includes(ctx.offerProfile) :
      c.kind === "deposit_deviation" ? ctx.depositDeviates : false;
    if (fires) demanded.push(c.kind);
  }
  return { demandsReview: demanded.length > 0, demandedChecks: demanded };
}

/** The shipped catering profile — guests + date, demoted here from universal
 *  law to where they always belonged. */
export const CATERING_PROFILE: OfferProfile = {
  key: "catering", requiredFacts: ["guests", "event_date"],
};
