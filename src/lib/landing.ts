// ═══════════════════════════════════════════════════════════════════════════
// LANDING (v216) — the pure side of the landing decision. Kept free of any
// data client so the rule is unit-testable and importable anywhere (the
// same discipline that keeps libraryRegistry.ts Supabase-free: machinery
// and rules here, projections with their data).
// ═══════════════════════════════════════════════════════════════════════════

/** THE ROUTING RULE, stated once (UI_GRAMMAR §11): an empty Canvas receiving
 *  a whole design instantiates directly — there is nothing to protect, and
 *  confirmation would be ceremony without a decision. A populated Canvas
 *  opens the landing decision, and nothing commits until chosen. */
export const landingRoute = (existingComponents: number): "direct" | "decision" =>
  existingComponents === 0 ? "direct" : "decision";
