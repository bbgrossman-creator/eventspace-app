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
