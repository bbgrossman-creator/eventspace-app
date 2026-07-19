// ═══════════════════════════════════════════════════════════════════════════
// THE MEASUREMENT PORT (PR-1 · docs/PUBLICATION_RENDERER.md §1, hardened)
//
// STRICT contract: pure and total — same string × font × size × width →
// same lines and heights, always, on every machine. Backed only by
// DECLARED metrics shipped with the engine: never system fonts, never
// environment discovery, never network. VERSIONED — the metrics version
// stamps into artifact provenance so an upgrade is a visible event.
// A font the metrics set lacks is an ERROR, never a fallback.
// ═══════════════════════════════════════════════════════════════════════════

export interface Measured {
  lines: number;
  lineHeight: number;   // points per line
  height: number;       // lines × lineHeight
}

export interface Measurer {
  /** Metrics-set version — stamps into artifact provenance. */
  version: string;
  /** Families this measurer declares. Anything else THROWS. */
  declaredFonts(): string[];
  measure(text: string, font: string, size: number, maxWidth: number): Measured;
}

/** The FIXTURE measurer — the unit suites' deterministic ruler.
 *  Every character is width = size × 0.5; lineHeight = size × 1.4.
 *  Total over its declared families; strict beyond them. */
export function fixtureMeasurer(): Measurer {
  const FONTS: Record<string, true> = { serif: true, sans: true };
  return {
    version: "fixture-1",
    declaredFonts: () => ["serif", "sans"],
    measure(text, font, size, maxWidth) {
      if (!FONTS[font]) throw new Error(`UNDECLARED_FONT:${font}`);   // never a fallback
      if (size <= 0 || maxWidth <= 0) throw new Error("MEASURE_DOMAIN");
      const charW = size * 0.5;
      const perLine = Math.max(1, Math.floor(maxWidth / charW));
      const lines = text.length === 0 ? 0 : Math.ceil(text.length / perLine);
      const lineHeight = size * 1.4;
      return { lines, lineHeight, height: lines * lineHeight };
    },
  };
}
