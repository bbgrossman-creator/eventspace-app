// ═══════════════════════════════════════════════════════════════════════════
// PUBLICATION (v225) — the pure core of docs/PUBLICATION.md.
//
// THE LAW OF THREE LAYERS (§0): a theme decides how things look; it may
// never decide what exists. Everything in this file is presentation.
//
// THE LADDER (§2): System Default → Company Brand → Named Theme → Version
// Override. Every rung overrides only what it defines; resolution is ONE
// pure function, most-specific-wins per LEAF, and provenance — which rung a
// value came from — is always answerable.
//
// THE SNAPSHOT RULE (§3): every transition INTO "sent" stamps the resolved
// presentation actually sent (re-send re-stamps; editing alone never
// touches a prior stamp); approval locks the last stamp forever. The pure
// rule lives here (shouldStampPresentation); the write lives with the data.
//
// Supabase-free by the landing.ts/libraryRegistry discipline.
// ═══════════════════════════════════════════════════════════════════════════

export interface FontPairing {
  key: string;
  heading: string;              // display name
  body: string;
  styleLabel: string;           // "Luxury", "Modern" — what people actually want
  headingStack: string;         // CSS font-family, graceful fallbacks included
  bodyStack: string;
}

/** Curated pairings — a starter set (v226's Brand Studio expands the shelf).
 *  Users pick a PAIRING, never a font (§9): unlimited choice is how
 *  documents stop looking expensive. */
export const FONT_PAIRINGS: FontPairing[] = [
  { key: "playfair-inter", heading: "Playfair Display", body: "Inter", styleLabel: "Luxury",
    headingStack: '"Playfair Display", Georgia, "Times New Roman", serif',
    bodyStack: 'Inter, "Segoe UI", system-ui, sans-serif' },
  { key: "cormorant-source", heading: "Cormorant Garamond", body: "Source Sans 3", styleLabel: "Elegant",
    headingStack: '"Cormorant Garamond", Garamond, Georgia, serif',
    bodyStack: '"Source Sans 3", "Segoe UI", system-ui, sans-serif' },
  { key: "montserrat-inter", heading: "Montserrat", body: "Inter", styleLabel: "Modern",
    headingStack: 'Montserrat, "Segoe UI", system-ui, sans-serif',
    bodyStack: 'Inter, "Segoe UI", system-ui, sans-serif' },
  { key: "baskerville-lato", heading: "Libre Baskerville", body: "Lato", styleLabel: "Classic",
    headingStack: '"Libre Baskerville", Baskerville, Georgia, serif',
    bodyStack: 'Lato, "Segoe UI", system-ui, sans-serif' },
  { key: "dm-serif-karla", heading: "DM Serif Display", body: "Karla", styleLabel: "Editorial",
    headingStack: '"DM Serif Display", Georgia, serif',
    bodyStack: 'Karla, "Segoe UI", system-ui, sans-serif' },
  { key: "work-sans", heading: "Work Sans", body: "Work Sans", styleLabel: "Minimal",
    headingStack: '"Work Sans", "Segoe UI", system-ui, sans-serif',
    bodyStack: '"Work Sans", "Segoe UI", system-ui, sans-serif' },
];

export const fontPairing = (key: string | null | undefined): FontPairing | null =>
  FONT_PAIRINGS.filter((p) => p.key === key)[0] ?? null;

/** A SPARSE delta — any rung of the ladder. Reserved fields (§1: logo,
 *  cover, dividers, photography, header, footer, watermark, print) are typed
 *  when their slices land; shipping them then is a delta change, never a
 *  resolution change. */
export interface ThemeDelta {
  fonts?: { pairing?: string };
  colors?: { primary?: string; accent?: string; ink?: string };
  /** §1: paper is its OWN field — tint now, texture and page proportions
   *  when their slices land. (v225b: it was a colors leaf; the canon says
   *  otherwise, and the stored shape must match the canon before anything
   *  is stored.) */
  paper?: { tint?: string; texture?: string };
  margins?: { measure?: number; sectionGap?: number };
}

/** The complete resolved theme — every implemented leaf present. */
export interface ResolvedTheme {
  fonts: { pairing: string; headingStack: string; bodyStack: string };
  colors: { primary: string; accent: string; ink: string };
  paper: { tint: string; texture: string };
  margins: { measure: number; sectionGap: number };
}

export type ThemeRung = "system" | "brand" | "theme" | "override";
export type ThemeProvenance = {
  fonts: { pairing: ThemeRung };
  colors: { primary: ThemeRung; accent: ThemeRung; ink: ThemeRung };
  paper: { tint: ThemeRung; texture: ThemeRung };
  margins: { measure: ThemeRung; sectionGap: ThemeRung };
};

/** §2 — the System Default ships in code and guarantees a complete resolved
 *  theme for a tenant who has configured nothing. It matches the renderer's
 *  historical dress, so an untouched proposal looks exactly as it always
 *  has. */
export const SYSTEM_DEFAULT_THEME: Required<ThemeDelta> = {
  fonts: { pairing: "playfair-inter" },
  colors: { primary: "#102F56", accent: "#C9A34E", ink: "#1F2A37" },
  paper: { tint: "#FFFFFF", texture: "none" },
  margins: { measure: 760, sectionGap: 40 },
};

/** THE LADDER, resolved. One pure walk; per-leaf most-specific-wins; the
 *  provenance of every value comes back with it (§2 — the Presentation
 *  lens's x-ray is provenance ink). */
export function resolveTheme(
  brand: ThemeDelta | null,
  named: ThemeDelta | null,
  override: ThemeDelta | null,
): { theme: ResolvedTheme; provenance: ThemeProvenance } {
  const rungs: { rung: ThemeRung; d: ThemeDelta }[] = [{ rung: "system", d: SYSTEM_DEFAULT_THEME }];
  if (brand) rungs.push({ rung: "brand", d: brand });
  if (named) rungs.push({ rung: "theme", d: named });
  if (override) rungs.push({ rung: "override", d: override });

  function leaf<G extends keyof ThemeDelta, L extends string>(group: G, key: L): { v: unknown; rung: ThemeRung } {
    let v: unknown = undefined; let rung: ThemeRung = "system";
    for (const r of rungs) {
      const g = r.d[group] as Record<string, unknown> | undefined;
      if (g && g[key] !== undefined) { v = g[key]; rung = r.rung; }
    }
    return { v, rung };
  }

  const fp = leaf("fonts", "pairing");
  const pairing = fontPairing(fp.v as string) ?? fontPairing(SYSTEM_DEFAULT_THEME.fonts.pairing)!;
  const primary = leaf("colors", "primary"), accent = leaf("colors", "accent"), ink = leaf("colors", "ink");
  const tint = leaf("paper", "tint"), texture = leaf("paper", "texture");
  const measure = leaf("margins", "measure"), gap = leaf("margins", "sectionGap");

  return {
    theme: {
      fonts: { pairing: pairing.key, headingStack: pairing.headingStack, bodyStack: pairing.bodyStack },
      colors: { primary: primary.v as string, accent: accent.v as string, ink: ink.v as string },
      paper: { tint: tint.v as string, texture: texture.v as string },
      margins: { measure: measure.v as number, sectionGap: gap.v as number },
    },
    provenance: {
      fonts: { pairing: fp.rung },
      colors: { primary: primary.rung, accent: accent.rung, ink: ink.rung },
      paper: { tint: tint.rung, texture: texture.rung },
      margins: { measure: measure.rung, sectionGap: gap.rung },
    },
  };
}

/** Built-in named themes (§1) — deltas, sparse by design. */
export const BUILT_IN_THEMES: { key: string; label: string; blurb: string; delta: ThemeDelta }[] = [
  { key: "classic", label: "Classic", blurb: "The house dress — navy, gold, Playfair.", delta: {} },
  { key: "luxury", label: "Luxury", blurb: "Deep charcoal, champagne gold, elegant serifs.",
    delta: { fonts: { pairing: "cormorant-source" },
      colors: { primary: "#1C1917", accent: "#B08D2F" }, paper: { tint: "#FDFBF7" } } },
  { key: "modern", label: "Modern", blurb: "Clean geometry, ink on white.",
    delta: { fonts: { pairing: "montserrat-inter" },
      colors: { primary: "#0F172A", accent: "#2563EB" }, paper: { tint: "#FFFFFF" } } },
  { key: "minimal", label: "Minimal", blurb: "One family, generous air.",
    delta: { fonts: { pairing: "work-sans" },
      colors: { primary: "#111827", accent: "#6B7280" }, paper: { tint: "#FFFFFF" },
      margins: { sectionGap: 56 } } },
];

export const builtInTheme = (key: string | null | undefined): ThemeDelta | null =>
  BUILT_IN_THEMES.filter((t) => t.key === key)[0]?.delta ?? null;

/** Curated palettes for the Palette control — presets, not a color wheel. */
export const PALETTES: { key: string; label: string; colors: NonNullable<ThemeDelta["colors"]> }[] = [
  { key: "navy-gold", label: "Navy & Gold", colors: { primary: "#102F56", accent: "#C9A34E" } },
  { key: "charcoal-champagne", label: "Charcoal & Champagne", colors: { primary: "#1C1917", accent: "#B08D2F" } },
  { key: "forest-brass", label: "Forest & Brass", colors: { primary: "#14532D", accent: "#A16207" } },
  { key: "wine-blush", label: "Wine & Blush", colors: { primary: "#5B1E2D", accent: "#C08497" } },
  { key: "ink-azure", label: "Ink & Azure", colors: { primary: "#0F172A", accent: "#2563EB" } },
];

/** Paper tints for the Paper control — patches the theme's own `paper`
 *  group (the registry serves the stored shape; it is not a side channel). */
export const PAPERS: { key: string; label: string; tint: string }[] = [
  { key: "white", label: "White", tint: "#FFFFFF" },
  { key: "ivory", label: "Ivory", tint: "#FDFBF7" },
  { key: "linen", label: "Linen", tint: "#FAF7F0" },
  { key: "mist", label: "Mist", tint: "#F8FAFC" },
];

/** §3, the pure half — v225b: the stamp is caused by the SEND CEREMONY,
 *  not by the status value changing. An explicit send ALWAYS stamps — sent →
 *  Send → sent takes a fresh snapshot (re-send re-stamps, per adoption
 *  ruling a). A passive status change stamps only on transitions into
 *  "sent" (the safety net for programmatic writes). Editing alone never
 *  stamps; approval never re-stamps — it locks the last stamp. */
export const shouldStampPresentation = (prev: string, next: string, explicitSend = false): boolean =>
  explicitSend ? next === "sent" : (next === "sent" && prev !== "sent");

/** Sparse deep-merge for accumulating override edits (render state → the
 *  Version Override on explicit save). */
export function mergeDelta(base: ThemeDelta | null, patch: ThemeDelta): ThemeDelta {
  const out: ThemeDelta = { ...(base ?? {}) };
  if (patch.fonts) out.fonts = { ...(out.fonts ?? {}), ...patch.fonts };
  if (patch.colors) out.colors = { ...(out.colors ?? {}), ...patch.colors };
  if (patch.paper) out.paper = { ...(out.paper ?? {}), ...patch.paper };
  if (patch.margins) out.margins = { ...(out.margins ?? {}), ...patch.margins };
  return out;
}
