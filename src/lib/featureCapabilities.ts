// ═══════════════════════════════════════════════════════════════════════════
// FEATURE CAPABILITIES — declarative feature access (KNOWLEDGE_ARCHITECTURE §10).
//
// NOT src/lib/capabilities.ts — that module is the tenant BUSINESS-MODEL
// system (what the business does: types, operating models, UI sections).
// This module is feature LICENSING (what the tenant may use). Two questions,
// two files; conflating them is how "capabilities" becomes a junk drawer.
//
// "Capabilities are the source of truth. Subscription tiers are merely
//  predefined collections of capabilities. The application never reasons
//  about plans directly."
//
// `if (plan === "Professional")` must never appear in this codebase. The only
// legal question is can("production.kitchen").
//
// v200 scope: the declarative shape and the check function. Until tiers are
// assigned per tenant (a data concern, not code), every declared capability
// is enabled — so nothing user-visible changes in this release.
// ═══════════════════════════════════════════════════════════════════════════

export type FeatureCapabilitySet = ReadonlySet<string>;

/** A tier is nothing but a named bundle. These are DATA — edit freely. */
export const TIER_BUNDLES: Record<string, string[]> = {
  starter:      ["proposal.customer_view", "library.search"],
  professional: ["proposal.customer_view", "library.search", "production.kitchen"],
  enterprise:   ["*"],
};

/** Build a checker from a tenant's effective capability set. "*" = all. */
export function makeCan(caps: FeatureCapabilitySet | "all"): (capability: string) => boolean {
  if (caps === "all") return () => true;
  return (capability) => caps.has("*") || caps.has(capability);
}

/**
 * The current tenant's checker. v200: all-enabled (see header). When tenant
 * bundles land in settings, this reads them — call sites never change.
 */
export function currentCan(): (capability: string) => boolean {
  return makeCan("all");
}
