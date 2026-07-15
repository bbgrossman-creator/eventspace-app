// ═══════════════════════════════════════════════════════════════════════════
// TAX — resolution seam (F0)
//
// WHY THIS EXISTS: PRICING.TAX_RATE was a hard-coded 6.625% (New Jersey), read
// directly by the engine. Every tenant got NJ's rate — so a New York event was
// mis-taxed silently, today, in production. Audit item A3; the finance review
// marked this "do before Partini regardless of everything else."
//
// THE LADDER (finance review §7). Resolution is first-match-wins:
//
//     1. line/service classification   ← seam only, not implemented
//     2. event jurisdiction (venue)    ← seam only, not implemented
//     3. tenant override (per event)   ← IMPLEMENTED
//     4. tenant default                ← IMPLEMENTED
//     5. legacy constant               ← fallback, so nothing breaks pre-seed
//
// v1 ships 3/4/5. Steps 1-2 are deliberately unbuilt: the Venue object and
// service classification don't exist yet (banked domains §10). But the SHAPE
// is here now, so adding them later changes this file and nothing else —
// which is the whole point of a seam. Callers never see the ladder.
//
// THE ENGINE STAYS PURE: computeVersionTotals takes a RESOLVED rate. It does
// no IO and knows nothing about tenants. Resolution happens at the edge, where
// the data already is.
//
// FREEZING: an issued invoice must freeze its rate + basis + source as
// evidence (Tense §2d.ii). Not implemented here — it belongs with the invoice
// object (Finance F4). `TaxResolution` already carries everything a snapshot
// needs, so freezing is a copy, not a redesign.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { PRICING } from "./pricing";

/** Where a rate came from. Kept because "why is this event taxed at 8.875%?"
 *  is a question a bookkeeper will ask, and "because" is not an answer. */
export type TaxSource =
  | "classification"   // future: this service is taxed differently
  | "jurisdiction"     // future: resolved from the venue's location
  | "event_override"   // a human set it on this event
  | "tenant_default"   // this business's configured rate
  | "legacy_constant"; // nothing configured — the old NJ constant

export interface TaxContext {
  /** This tenant's configured rate (fraction, e.g. 0.06625). Null = unset. */
  tenantDefault?: number | null;
  /** An explicit per-event override, if a human set one. */
  eventOverride?: number | null;
  /** Seams — accepted now, ignored now. Present so the signature is stable. */
  jurisdiction?: string | null;
  lineClassification?: string | null;
}

export interface TaxResolution {
  /** The rate to multiply the taxable base by. */
  rate: number;
  source: TaxSource;
  /** True when we fell through to the legacy constant — i.e. this tenant has
   *  not configured tax and is silently inheriting New Jersey's rate. Surface
   *  this; do not let it stay invisible the way it has been. */
  isFallback: boolean;
  jurisdiction?: string | null;
}

/** Pure. No IO. The ladder lives here and only here. */
export function resolveTax(ctx: TaxContext = {}): TaxResolution {
  // 1-2. classification / jurisdiction — seam. Deliberately not implemented.
  if (ctx.eventOverride != null && isRate(ctx.eventOverride)) {
    return { rate: ctx.eventOverride, source: "event_override", isFallback: false, jurisdiction: ctx.jurisdiction ?? null };
  }
  if (ctx.tenantDefault != null && isRate(ctx.tenantDefault)) {
    return { rate: ctx.tenantDefault, source: "tenant_default", isFallback: false, jurisdiction: ctx.jurisdiction ?? null };
  }
  return { rate: PRICING.TAX_RATE, source: "legacy_constant", isFallback: true, jurisdiction: null };
}

/** A rate is a fraction in [0,1). 6.625 is a percent someone forgot to divide;
 *  refusing it here is cheaper than a 662% tax line on a customer's invoice. */
function isRate(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n < 1;
}

export const TAX_RATE_KEY = "tax_rate";

/** Reads this tenant's configured rate. RLS scopes app_settings to the caller's
 *  tenant, so no tenant argument is needed or wanted — same pattern as
 *  loadBusinessConfig(). Returns null when unset (→ fallback + a visible flag).
 *
 *  Stored as a STRING fraction ("0.06625") because app_settings.value is text.
 *  A percent ("6.625") would be caught by isRate() rather than charged. */
export async function loadTenantTaxRate(): Promise<number | null> {
  const { data, error } = await supabase
    .from("app_settings").select("value").eq("key", TAX_RATE_KEY).maybeSingle();
  if (error || !data) return null;
  const n = parseFloat(String((data as { value: string }).value));
  return isRate(n) ? n : null;
}

/** The common path: load the tenant default and resolve. One call at the edge. */
export async function resolveTaxForTenant(eventOverride?: number | null): Promise<TaxResolution> {
  return resolveTax({ tenantDefault: await loadTenantTaxRate(), eventOverride });
}
