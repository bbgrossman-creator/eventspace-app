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
  // v227 — the shelf expands (Brand Studio §8/§9): still curated, never a font list.
  { key: "lora-open", heading: "Lora", body: "Open Sans", styleLabel: "Warm",
    headingStack: 'Lora, Georgia, serif', bodyStack: '"Open Sans", "Segoe UI", system-ui, sans-serif' },
  { key: "merri-source", heading: "Merriweather", body: "Source Sans 3", styleLabel: "Literary",
    headingStack: 'Merriweather, Georgia, serif', bodyStack: '"Source Sans 3", "Segoe UI", system-ui, sans-serif' },
  { key: "spectral-inter", heading: "Spectral", body: "Inter", styleLabel: "Refined",
    headingStack: 'Spectral, Georgia, serif', bodyStack: 'Inter, "Segoe UI", system-ui, sans-serif' },
  { key: "fraunces-work", heading: "Fraunces", body: "Work Sans", styleLabel: "Contemporary",
    headingStack: 'Fraunces, Georgia, serif', bodyStack: '"Work Sans", "Segoe UI", system-ui, sans-serif' },
  { key: "garamond-lato", heading: "EB Garamond", body: "Lato", styleLabel: "Heritage",
    headingStack: '"EB Garamond", Garamond, Georgia, serif', bodyStack: 'Lato, "Segoe UI", system-ui, sans-serif' },
  { key: "bodoni-karla", heading: "Bodoni Moda", body: "Karla", styleLabel: "Fashion",
    headingStack: '"Bodoni Moda", "Didot", Georgia, serif', bodyStack: 'Karla, "Segoe UI", system-ui, sans-serif' },
];

export const fontPairing = (key: string | null | undefined): FontPairing | null =>
  FONT_PAIRINGS.filter((p) => p.key === key)[0] ?? null;

/** A SPARSE delta — any rung of the ladder. Reserved fields (§1: logo,
 *  cover, dividers, photography, header, footer, watermark, print) are typed
 *  when their slices land; shipping them then is a delta change, never a
 *  resolution change. */
/** §6.2 — PRESENTATION TREATMENTS: semantic dress for presentation
 *  identities. Named options only, never free-form styling. Document-level
 *  sets the publication's defaults; per-section entries override per leaf.
 *  (Component/item treatments are reserved by scope ruling — adding them is
 *  a delta change, never a resolution change.) */
export interface SectionTreatment {
  divider?: "rule" | "double" | "dots" | "none";
  heading?: "standard" | "eyebrow" | "centered";
  spacing?: "compact" | "standard" | "airy";
  /** v229 — a section's wash: none, a soft accent tint, or a ringed panel. */
  background?: "none" | "tint" | "panel";
  /** v233 — HOW pinned imagery wears (§7): the pin decides existence, this
   *  decides dress. "side" is section-only; "full" is document-only —
   *  the registries constrain what each toolbar offers. */
  photo?: "none" | "band" | "side" | "full";
}

/** v234 — a COMPONENT's dress. Semantic only, and §0.2-safe: nothing here
 *  hides content — description and price options RE-DRESS what Design chose
 *  to show; existence stays Design's alone. */
export interface ComponentTreatment {
  title?: "standard" | "caps" | "accent";
  description?: "standard" | "italic" | "understated";
  price?: "standard" | "tabular" | "muted";
  photo?: "none" | "side" | "band";
}

/** v235 — the ITEM RUN's dress: attaches to the stable identity
 *  "the items of component X" (individual items are too unstable to
 *  address — reordering would orphan their dress). §0.2-safe throughout:
 *  layout "inherit" defers to Design's choice; nothing hides an item. */
export interface ItemTreatment {
  bullet?: "dot" | "dash" | "diamond" | "none";
  heading?: "standard" | "eyebrow" | "understated";
  emphasis?: "standard" | "strong" | "subtle";
  layout?: "inherit" | "vertical" | "comma" | "dot";
}

export const BULLET_CHARS: Record<NonNullable<ItemTreatment["bullet"]>, string> =
  { dot: "\u00b7", dash: "\u2013", diamond: "\u25c6", none: "" };

/** v229 — the DOCUMENT identity's own dress: everything a section has
 *  (as the publication's defaults) plus document-only leaves. */
export interface DocumentTreatment extends SectionTreatment {
  title?: "standard" | "centered" | "understated";
  /** v231 — PUBLICATION REGIONS: each an optional slot on the paper.
   *  Style/visibility ride the ladder here; the WORDS (footer, signature,
   *  terms) are company facts and live in Brand Studio (§8). Page numbers
   *  are deliberately absent until real pagination exists (print/PDF slice)
   *  — a page number in continuous scroll is a lie. */
  cover?: "none" | "classic" | "banner";
  watermark?: "none" | "draft" | "confidential";
  /** v239 — the COMPANY HEADER: identity block above the document. */
  header?: "none" | "block";
  /** v239 — the CONTACT region: how to reach the company. */
  contact?: "none" | "block";
  footer?: "none" | "line";
  signature?: "none" | "line";
  terms?: "none" | "standard";
}

/** v231 — the region WORDS, loaded from Brand settings and frozen into the
 *  presentation snapshot at the send ceremony. */
export interface RegionTexts {
  footer: string | null;
  signature: string | null;
  terms: string | null;
}

export interface ThemeDelta {
  fonts?: { pairing?: string };
  colors?: { primary?: string; accent?: string; ink?: string };
  /** §1: paper is its OWN field — tint now, texture and page proportions
   *  when their slices land. (v225b: it was a colors leaf; the canon says
   *  otherwise, and the stored shape must match the canon before anything
   *  is stored.) */
  paper?: { tint?: string; texture?: string };
  margins?: { measure?: number; sectionGap?: number };
  treatments?: { document?: DocumentTreatment; sections?: Record<string, SectionTreatment>; components?: Record<string, ComponentTreatment>; items?: Record<string, ItemTreatment> };
}

/** The complete resolved theme — every implemented leaf present. */
export interface ResolvedTheme {
  fonts: { pairing: string; headingStack: string; bodyStack: string };
  colors: { primary: string; accent: string; ink: string };
  paper: { tint: string; texture: string };
  margins: { measure: number; sectionGap: number };
  treatments: { document: Required<DocumentTreatment>; sections: Record<string, SectionTreatment>; components: Record<string, ComponentTreatment>; items: Record<string, ItemTreatment> };
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
  treatments: { document: { divider: "rule", heading: "standard", spacing: "standard", background: "none", title: "standard", cover: "none", watermark: "none", header: "block", contact: "block", footer: "line", signature: "none", terms: "standard", photo: "band" }, sections: {}, components: {}, items: {} },
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

  // Treatments: document per-leaf through the rungs; section dicts merge
  // rung over rung, per id, per leaf. (Scalar provenance covers the ladder's
  // spirit; per-section provenance lands with the x-ray ink slice.)
  const doc: Required<DocumentTreatment> = { ...(SYSTEM_DEFAULT_THEME.treatments!.document as Required<DocumentTreatment>) };
  const secs: Record<string, SectionTreatment> = {};
  const compTr: Record<string, ComponentTreatment> = {};
  const itemTr: Record<string, ItemTreatment> = {};
  for (const r of rungs) {
    const t = r.d.treatments;
    if (!t) continue;
    if (t.document) for (const k of Object.keys(t.document) as (keyof DocumentTreatment)[]) {
      if (t.document[k] !== undefined) (doc as Record<string, unknown>)[k] = t.document[k];
    }
    if (t.sections) for (const id of Object.keys(t.sections)) {
      secs[id] = { ...(secs[id] ?? {}), ...t.sections[id] };
    }
    if (t.components) for (const id of Object.keys(t.components)) {
      compTr[id] = { ...(compTr[id] ?? {}), ...t.components[id] };
    }
    if (t.items) for (const id of Object.keys(t.items)) {
      itemTr[id] = { ...(itemTr[id] ?? {}), ...t.items[id] };
    }
  }

  return {
    theme: {
      fonts: { pairing: pairing.key, headingStack: pairing.headingStack, bodyStack: pairing.bodyStack },
      colors: { primary: primary.v as string, accent: accent.v as string, ink: ink.v as string },
      paper: { tint: tint.v as string, texture: texture.v as string },
      margins: { measure: measure.v as number, sectionGap: gap.v as number },
      treatments: { document: doc, sections: secs, components: compTr, items: itemTr },
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

/** v227 — a version's theme_key names EITHER a built-in or a tenant-named
 *  theme (by id). Pure: the tenant list arrives as data. Unknown keys
 *  resolve to null — the ladder simply skips the rung (brand + system
 *  still guarantee a complete dress). */
export function resolveThemeKey(
  key: string | null | undefined,
  tenantThemes: { id: string; delta: ThemeDelta }[],
): ThemeDelta | null {
  if (!key) return null;
  const built = builtInTheme(key);
  if (built) return built;
  return tenantThemes.filter((t) => t.id === key)[0]?.delta ?? null;
}

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
  if (patch.treatments) {
    const bt = out.treatments ?? {};
    const nt: NonNullable<ThemeDelta["treatments"]> = { ...bt };
    if (patch.treatments.document) nt.document = { ...(bt.document ?? {}), ...patch.treatments.document };
    if (patch.treatments.sections) {
      nt.sections = { ...(bt.sections ?? {}) };
      for (const id of Object.keys(patch.treatments.sections)) {
        nt.sections[id] = { ...(nt.sections[id] ?? {}), ...patch.treatments.sections[id] };
      }
    }
    if (patch.treatments.components) {
      nt.components = { ...(bt.components ?? {}) };
      for (const id of Object.keys(patch.treatments.components)) {
        nt.components[id] = { ...(nt.components[id] ?? {}), ...patch.treatments.components[id] };
      }
    }
    if (patch.treatments.items) {
      nt.items = { ...(bt.items ?? {}) };
      for (const id of Object.keys(patch.treatments.items)) {
        nt.items[id] = { ...(nt.items[id] ?? {}), ...patch.treatments.items[id] };
      }
    }
    out.treatments = nt;
  }
  return out;
}

/** §6.2 — the effective dress of one section identity: the document's
 *  defaults, overlaid by that section's own entry, per leaf. */
export function effectiveSectionTreatment(theme: ResolvedTheme, sectionId: string): Required<SectionTreatment> {
  return { ...theme.treatments.document, ...(theme.treatments.sections[sectionId] ?? {}) } as Required<SectionTreatment>;
}

/** v234 — a component's effective dress: system defaults + its own rung-
 *  merged entry. (No document-level component defaults yet — reserved.) */
export const COMPONENT_TREATMENT_DEFAULTS: Required<ComponentTreatment> =
  { title: "standard", description: "standard", price: "standard", photo: "side" };
export function effectiveComponentTreatment(theme: ResolvedTheme, componentId: string): Required<ComponentTreatment> {
  return { ...COMPONENT_TREATMENT_DEFAULTS, ...(theme.treatments.components[componentId] ?? {}) } as Required<ComponentTreatment>;
}

/** v235 — the item run's dress: defaults preserve today's paper exactly. */
export const ITEM_TREATMENT_DEFAULTS: Required<ItemTreatment> =
  { bullet: "dot", heading: "standard", emphasis: "standard", layout: "inherit" };
export function effectiveItemTreatment(theme: ResolvedTheme, componentId: string): Required<ItemTreatment> {
  return { ...ITEM_TREATMENT_DEFAULTS, ...(theme.treatments.items[componentId] ?? {}) } as Required<ItemTreatment>;
}

/** v235 — the item toolbar's registry. Layout "inherit" defers to Design. */
export const ITEM_TREATMENT_OPTIONS: {
  key: keyof ItemTreatment; label: string;
  options: { value: string; label: string }[];
}[] = [
  { key: "bullet", label: "Bullet", options: [
    { value: "dot", label: "Dot" }, { value: "dash", label: "Dash" },
    { value: "diamond", label: "Diamond" }, { value: "none", label: "None" } ] },
  { key: "heading", label: "Category", options: [
    { value: "standard", label: "Standard" }, { value: "eyebrow", label: "Eyebrow" },
    { value: "understated", label: "Understated" } ] },
  { key: "emphasis", label: "Emphasis", options: [
    { value: "standard", label: "Standard" }, { value: "strong", label: "Strong" },
    { value: "subtle", label: "Subtle" } ] },
  { key: "layout", label: "Layout", options: [
    { value: "inherit", label: "As designed" }, { value: "vertical", label: "List" },
    { value: "comma", label: "Comma" }, { value: "dot", label: "Run" } ] },
];

/** v234 — the component toolbar's registry. Semantic; nothing hides content. */
export const COMPONENT_TREATMENT_OPTIONS: {
  key: keyof ComponentTreatment; label: string;
  options: { value: string; label: string }[];
}[] = [
  { key: "title", label: "Title", options: [
    { value: "standard", label: "Standard" }, { value: "caps", label: "Caps" },
    { value: "accent", label: "Accent" } ] },
  { key: "description", label: "Description", options: [
    { value: "standard", label: "Standard" }, { value: "italic", label: "Italic" },
    { value: "understated", label: "Understated" } ] },
  { key: "price", label: "Price", options: [
    { value: "standard", label: "Standard" }, { value: "tabular", label: "Tabular" },
    { value: "muted", label: "Muted" } ] },
  { key: "photo", label: "Photo", options: [
    { value: "side", label: "Side" }, { value: "band", label: "Band" },
    { value: "none", label: "None" } ] },
];

/** §6.2/§6.3 — the SEMANTIC registry the contextual toolbar renders from.
 *  Treatments are named options, never free-form styling; chrome renders
 *  THIS, and asks no identity any question directly. */
export const TREATMENT_OPTIONS: {
  key: keyof SectionTreatment; label: string;
  options: { value: string; label: string }[];
}[] = [
  { key: "divider", label: "Divider", options: [
    { value: "rule", label: "Rule" }, { value: "double", label: "Double" },
    { value: "dots", label: "Dots" }, { value: "none", label: "None" } ] },
  { key: "heading", label: "Heading", options: [
    { value: "standard", label: "Standard" }, { value: "eyebrow", label: "Eyebrow" },
    { value: "centered", label: "Centered" } ] },
  { key: "spacing", label: "Spacing", options: [
    { value: "compact", label: "Compact" }, { value: "standard", label: "Standard" },
    { value: "airy", label: "Airy" } ] },
  { key: "background", label: "Background", options: [
    { value: "none", label: "None" }, { value: "tint", label: "Tint" },
    { value: "panel", label: "Panel" } ] },
  { key: "photo", label: "Photo", options: [
    { value: "band", label: "Band" }, { value: "side", label: "Side" },
    { value: "none", label: "None" } ] },
];

/** v233 — the DOCUMENT's photo placements (cover imagery). */
export const DOCUMENT_PHOTO_OPTIONS: { value: "band" | "full" | "none"; label: string }[] = [
  { value: "band", label: "Band" }, { value: "full", label: "Full" }, { value: "none", label: "None" },
];

/** v229 — DOCUMENT-only semantic groups for the document toolbar. */
export const DOCUMENT_TITLE_OPTIONS: { value: NonNullable<DocumentTreatment["title"]>; label: string }[] = [
  { value: "standard", label: "Standard" }, { value: "centered", label: "Centered" },
  { value: "understated", label: "Understated" },
];

/** v231 — the REGIONS registry: semantic slots, semantic options. */
export const REGION_OPTIONS: {
  key: "cover" | "watermark" | "header" | "contact" | "footer" | "signature" | "terms";
  label: string; blurb: string;
  options: { value: string; label: string }[];
}[] = [
  { key: "header", label: "Company header", blurb: "Who this is from. Facts live in Brand Studio.", options: [
    { value: "none", label: "None" }, { value: "block", label: "Block" } ] },
  { key: "contact", label: "Contact", blurb: "How to reach the company. Facts live in Brand Studio.", options: [
    { value: "none", label: "None" }, { value: "block", label: "Block" } ] },
  { key: "cover", label: "Cover", blurb: "How the document opens.", options: [
    { value: "none", label: "None" }, { value: "classic", label: "Classic" }, { value: "banner", label: "Banner" } ] },
  { key: "watermark", label: "Watermark", blurb: "A ghost across the paper.", options: [
    { value: "none", label: "None" }, { value: "draft", label: "Draft" }, { value: "confidential", label: "Confidential" } ] },
  { key: "footer", label: "Footer", blurb: "The company line at the foot. Words live in Brand Studio.", options: [
    { value: "none", label: "None" }, { value: "line", label: "Line" } ] },
  { key: "signature", label: "Signature", blurb: "A closing hand. Name lives in Brand Studio.", options: [
    { value: "none", label: "None" }, { value: "line", label: "Line" } ] },
  { key: "terms", label: "Terms", blurb: "Small print at the end. Words live in Brand Studio.", options: [
    { value: "none", label: "None" }, { value: "standard", label: "Standard" } ] },
];


/** ═══════════════════════════════════════════════════════════════════════
 *  v240 — PAGE ANATOMY (PA-2 · PUBLISHING_ASSETS §2). Regions graduate
 *  from "slots" to the page's NAMED anatomy. This is DECLARATION, not new
 *  physics: visibility · treatment · inheritance · override all still
 *  ride the existing ladder. Every togglable region is claimed by exactly
 *  one zone (unit-enforced).
 *
 *  CONTINUOUS vs PAGE-MASTER: a web header/footer flows once in
 *  continuous scroll. Repeating per-page furniture (running headers,
 *  running footers, page numbers) is PAGE-MASTER — a different kind of
 *  thing, reserved for the PDF slice, and NAMED here so the reservation
 *  is legible instead of implicit. A page number in continuous scroll is
 *  a lie (§6.7); the anatomy says so out loud.
 *  ═══════════════════════════════════════════════════════════════════ */
export type PageZoneKind = "continuous" | "reserved";
export type RegionKey = (typeof REGION_OPTIONS)[number]["key"];
export interface PageZone {
  key: "header" | "body" | "footer" | "decorations" | "sidebar";
  label: string;
  blurb: string;
  kind: PageZoneKind;
  /** The togglable regions this zone claims (REGION_OPTIONS keys). */
  regions: RegionKey[];
  /** PAGE-MASTER furniture reserved for print — named, never buildable
   *  here. The strings are the reservation. */
  pageMaster?: string[];
}
export const PAGE_ANATOMY: PageZone[] = [
  { key: "header", label: "Header", kind: "continuous", regions: ["header"],
    blurb: "Who this is from — the paper's opening band.",
    pageMaster: ["Repeating page header"] },
  { key: "body", label: "Body", kind: "continuous", regions: ["cover"],
    blurb: "The document itself — everything the design says." },
  { key: "footer", label: "Footer", kind: "continuous",
    regions: ["contact", "signature", "terms", "footer"],
    blurb: "The paper's tail — how it closes.",
    pageMaster: ["Repeating page footer"] },
  { key: "decorations", label: "Page decorations", kind: "continuous", regions: ["watermark"],
    blurb: "Marks laid across the paper, not in its flow.",
    pageMaster: ["Page numbers"] },
  { key: "sidebar", label: "Sidebar", kind: "reserved", regions: [],
    blurb: "Reserved — named so nothing built now contradicts it." },
];

/** Semantic measure — labels for humans, numbers for margins.measure. */
export const MEASURE_OPTIONS: { value: number; label: string }[] = [
  { value: 640, label: "Narrow" }, { value: 760, label: "Standard" }, { value: 880, label: "Wide" },
];
