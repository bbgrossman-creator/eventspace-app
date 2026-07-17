// ═══════════════════════════════════════════════════════════════════════════
// BACK-REFERENCE (v210 · IMPLEMENTATION-004, final slice) — the instance-side
// context line: "N of these changes were promoted into the definition."
//
// PURELY INFORMATIONAL, READ-ONLY BY CONSTRUCTION: this module imports no
// persistence and exposes no write path — none exists for this feature at
// all (SPEC-004 §5 step 7: stillness is partially guaranteed by what the
// plan refuses to build).
//
// The rule (IMPLEMENTATION-004 v210): match the open component's divergence
// dimension_keys against promotion_citations for its definition, NEWER THAN
// ITS BASELINE. Implemented as a pure intersection so the render derives it
// fresh every time — derived state, never stored (ENGINEERING_PRINCIPLES).
//
// Honesty rules, decided here so the UI cannot improvise:
//   · No baseline timestamp ⇒ no back-reference. "Newer than its baseline"
//     is unanswerable without a baseline moment; rendering a guess would
//     claim more certainty than the system has (UI_GRAMMAR §5).
//   · An act is cited only for keys the component CURRENTLY diverges on —
//     a change the operator has since reverted is no longer "one of these
//     changes," and the diff (state-vs-baseline) wins over history, exactly
//     as SPEC-002 §1.5 orders divergence and causal history.
//   · Acts at-or-before the baseline are excluded: those promotions are
//     already IN the comparison point; citing them would double-count.
// ═══════════════════════════════════════════════════════════════════════════

/** One promotion act's citation footprint for a definition (read side). */
export interface PromotionActRef {
  actId: string;
  note: string;
  createdAt: string;        // ISO — the act's moment
  keys: string[];           // cited dimension_keys (READINESS F-3 grammar)
}

/** A matched back-reference: the informational line's exact content. */
export interface BackReference {
  actId: string;
  note: string;
  createdAt: string;
  matchedKeys: string[];    // ∩ of the act's citations and CURRENT divergence,
                            // ordered as the divergence panel orders them
}

/**
 * Pure intersection. `divergence` is the panel's own lines (same
 * computeDivergence the chip uses — no duplicated truth); `acts` are the
 * definition's promotion acts; `baselineAt` is the instance's frozen
 * baseline moment (Rev E). Returns acts newest-first; acts with no matched
 * key are absent, not empty.
 */
export function matchBackReferences(
  divergence: { dimension: string }[],
  acts: PromotionActRef[],
  baselineAt: string | null,
): BackReference[] {
  if (!baselineAt) return [];                      // no honest comparison moment
  const order = new Map<string, number>();
  divergence.forEach((l, i) => { if (!order.has(l.dimension)) order.set(l.dimension, i); });
  const out: BackReference[] = [];
  for (const a of acts) {
    if (!(a.createdAt > baselineAt)) continue;     // newer than its baseline, strictly
    // es5-safe dedupe: no Set/Map iteration below es2015 (production target)
    const seen: Record<string, true> = {};
    const matched: string[] = [];
    for (const k of a.keys) {
      if (!seen[k] && order.has(k)) { seen[k] = true; matched.push(k); }
    }
    if (matched.length === 0) continue;
    matched.sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0));
    out.push({ actId: a.actId, note: a.note, createdAt: a.createdAt, matchedKeys: matched });
  }
  out.sort((x, y) => (x.createdAt < y.createdAt ? 1 : x.createdAt > y.createdAt ? -1 : 0));
  return out;
}

/** The line's language: a computed fact, past tense, visible numbers (KA §9). */
export function backReferenceText(r: BackReference, divergenceCount: number): string {
  const n = r.matchedKeys.length;
  const noun = n === 1 ? "change" : "changes";
  const scope = divergenceCount > n ? `${n} of these ${divergenceCount} changes` : `${n === 1 ? "This" : `These ${n}`} ${noun}`;
  const when = new Date(r.createdAt).toLocaleDateString();
  return `${scope} ${n === 1 && divergenceCount <= n ? "was" : "were"} promoted into the definition · ${when}`;
}
