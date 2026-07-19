// ═══════════════════════════════════════════════════════════════════════════
// MOMENTS (v219) — the pure side of "the Proposal advertises its moments."
// Kept Supabase-free (the landing.ts discipline) so the rule is unit-testable.
// ═══════════════════════════════════════════════════════════════════════════
export interface MomentType { id: string; name: string; active: boolean }

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
