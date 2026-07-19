// ═══════════════════════════════════════════════════════════════════════════
// SHEET CHOICE (v217) — the pure rule for which lens a summoned sheet shows.
// Lifted from v214's StudioRightRegion when that column retired
// (STUDIO_COMPOSITION §9): the Second Sheet inherits its logic verbatim.
// Customer when offered ("the maker watching what the client receives" — the
// pairing that earned the feature), else the first offered lens; and a
// choice no longer in the offer falls back the same way — a remembered
// click grants no standing, exactly as a remembered URL doesn't.
// ═══════════════════════════════════════════════════════════════════════════
export interface SheetOption { key: string; label: string; blurb?: string }

export function fallbackSheetChoice(options: SheetOption[]): string | null {
  if (options.some((o) => o.key === "customer")) return "customer";
  return options[0]?.key ?? null;
}

/** The effective choice: the remembered one if still offered, else fallback. */
export function effectiveSheetChoice(chosen: string | null, options: SheetOption[]): string | null {
  if (chosen && options.some((o) => o.key === chosen)) return chosen;
  return fallbackSheetChoice(options);
}

/** v218 — the Second Sheet's version-axis caption, pure. What changed
 *  between the summoned version and this one, in one quiet line. */
export function formatVersionDiff(
  d: { added: unknown[]; removed: unknown[]; changed: unknown[]; totalA: number; totalB: number },
  money: (n: number) => string,
): string {
  const parts: string[] = [];
  const delta = d.totalB - d.totalA;
  if (delta !== 0) parts.push((delta > 0 ? "+" : "\u2212") + money(Math.abs(delta)));
  if (d.added.length) parts.push(d.added.length + " added");
  if (d.removed.length) parts.push(d.removed.length + " removed");
  if (d.changed.length) parts.push(d.changed.length + " changed");
  return parts.length ? parts.join(" \u00B7 ") : "No differences";
}
