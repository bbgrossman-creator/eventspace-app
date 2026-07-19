// ═══════════════════════════════════════════════════════════════════════════
// MOMENTS (v219) — the pure side of "the Proposal advertises its moments."
// Kept Supabase-free (the landing.ts discipline) so the rule is unit-testable.
// ═══════════════════════════════════════════════════════════════════════════
export interface MomentType { id: string; name: string; active: boolean; category?: string | null }

/** The moments the picker may offer: active types not already on this
 *  version. Already-present types are absent, not disabled — offering a
 *  moment the version already has would be a duplicate-in-waiting. */
export function availableMomentTypes(
  types: MomentType[],
  present: { section_type_id: string }[],
): MomentType[] {
  const used: Record<string, true> = {};
  for (const v of present) used[v.section_type_id] = true;
  return types.filter((t) => t.active && used[t.id] !== true);
}

/** v221 — the curated picker's shape: the reviewer's editorial groups, in a
 *  fixed reading order, with General absorbing the uncategorized (and every
 *  pre-migration database). Empty groups are absent, not headed voids. */
export const MOMENT_GROUP_ORDER = ["Food", "Event", "Operations", "Presentation", "General"];

export function groupMomentTypes(types: MomentType[]): { group: string; types: MomentType[] }[] {
  const buckets: Record<string, MomentType[]> = {};
  for (const t of types) {
    const g = t.category && MOMENT_GROUP_ORDER.indexOf(t.category) >= 0 ? t.category : "General";
    (buckets[g] = buckets[g] || []).push(t);
  }
  const out: { group: string; types: MomentType[] }[] = [];
  for (const g of MOMENT_GROUP_ORDER) if (buckets[g] && buckets[g].length) out.push({ group: g, types: buckets[g] });
  return out;
}
