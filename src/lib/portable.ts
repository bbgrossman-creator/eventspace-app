// ═══════════════════════════════════════════════════════════════════════════
// PORTABLE PRESENTATION (v241 · PA-3 · PUBLISHING_ASSETS §0 §3 §5)
//
// A presentation is TWO strata. PORTABLE transfers across proposals and
// is savable as a Template: theme key · document-level delta · document
// treatments & regions · SECTION dress and section pins keyed by
// SEMANTIC ROLE (the section type id — tenant-global today). BOUND does
// not travel through presentation-only verbs: component & item
// treatments, component photo pins. Bound dress may travel ONLY when a
// content-copy operation supplies an explicit identity map — never here.
//
// APPLICATION NEVER GUESSES: no matching section → the dress waits
// silently; exactly one match → applies; multiple matches → a mapping
// decision must be made by the user, never by default.
//
// REPLACEMENT SEMANTICS: application replaces the ENTIRE portable
// override namespace. Omission of a leaf means inheritance from
// brand/theme — never preservation of the destination's old portable
// value. Bound dress remains untouched.
// ═══════════════════════════════════════════════════════════════════════════
import { ThemeDelta, SectionTreatment } from "./publication";
import { PhotoPins, PhotoRef } from "./photos";

export const ASSET_KINDS = ["theme", "template"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** The constitutional confirm — stated plainly, verbatim from §0. */
export const APPLY_CONFIRM_WORDING =
  "This will replace this version's document, region, and section-level presentation. Component and item-list styling will remain.";

export interface PortablePresentation {
  themeKey: string | null;
  /** Document-level delta: fonts · colors · paper · margins · the
   *  document treatment (which carries every region). NO sections,
   *  components, or items dictionaries — those live in their strata. */
  delta: ThemeDelta;
  /** Section dress keyed by SEMANTIC ROLE (section type id). */
  sectionDress: Record<string, SectionTreatment>;
  /** Section photo pins keyed by the same role. */
  sectionPins: Record<string, PhotoRef>;
  /** The document's own pin (cover imagery) — document-level, portable. */
  documentPin: PhotoRef | null;
}

/** THE EXTRACTOR — every presentation-only verb operates on its output
 *  exclusively. Pure: give it the version's override + pins + theme key. */
export function portablePresentation(input: {
  themeKey: string | null;
  override: ThemeDelta | null;
  pins: PhotoPins | null;
}): PortablePresentation {
  const ov = input.override ?? {};
  const delta: ThemeDelta = {};
  if (ov.fonts) delta.fonts = { ...ov.fonts };
  if (ov.colors) delta.colors = { ...ov.colors };
  if (ov.paper) delta.paper = { ...ov.paper };
  if (ov.margins) delta.margins = { ...ov.margins };
  if (ov.treatments?.document) delta.treatments = { document: { ...ov.treatments.document } };
  const sectionDress: Record<string, SectionTreatment> = {};
  for (const [role, tr] of Object.entries(ov.treatments?.sections ?? {})) sectionDress[role] = { ...tr };
  const sectionPins: Record<string, PhotoRef> = {};
  for (const [role, pin] of Object.entries(input.pins?.sections ?? {})) sectionPins[role] = { ...pin };
  const documentPin = input.pins?.cover ? { ...input.pins.cover } : null;
  // pins.components are BOUND — they never enter the portable stratum
  return { themeKey: input.themeKey ?? null, delta, sectionDress, sectionPins, documentPin };
}

/** One role's match against a destination design. */
export interface RoleMatch {
  role: string;
  /** Destination section ids whose role equals this role. */
  matches: string[];
  /** waits (0) · applies (1) · decide (N>1 — never guessed). */
  outcome: "waits" | "applies" | "decide";
}

/** THE MATCH LAW — pure, per role, three outcomes and no fourth. */
export function matchSections(
  portable: PortablePresentation,
  destSections: { id: string; role: string }[],
): RoleMatch[] {
  // es5-safe role union: no Set iteration — Ben's production target
  // refuses downlevel iteration, and this file must deploy anywhere.
  const roleSeen: Record<string, true> = {};
  for (const k of Object.keys(portable.sectionDress)) roleSeen[k] = true;
  for (const k of Object.keys(portable.sectionPins)) roleSeen[k] = true;
  const out: RoleMatch[] = [];
  for (const role of Object.keys(roleSeen)) {
    const matches = destSections.filter((s) => s.role === role).map((s) => s.id);
    out.push({ role, matches, outcome: matches.length === 0 ? "waits" : matches.length === 1 ? "applies" : "decide" });
  }
  return out;
}

/** A mapping decision for an ambiguous role: which destination sections
 *  receive the dress. "all" is EXPLICIT user choice — never a default. */
export type MappingDecisions = Record<string, "all" | string[]>;

/** THE APPLICATION — portable × destination → the destination's new
 *  portable stratum. Throws if any ambiguous role lacks a decision:
 *  guessing is not an error path, it is forbidden. */
export function applyPortable(
  portable: PortablePresentation,
  destSections: { id: string; role: string }[],
  decisions: MappingDecisions = {},
): { override: ThemeDelta; pins: PhotoPins; report: RoleMatch[] } {
  const report = matchSections(portable, destSections);
  const sections: Record<string, SectionTreatment> = {};
  const pins: PhotoPins = {};
  if (portable.documentPin) pins.cover = { ...portable.documentPin };
  for (const m of report) {
    let targets: string[];
    if (m.outcome === "waits") continue;                       // the dress waits silently
    else if (m.outcome === "applies") targets = m.matches;
    else {
      const d = decisions[m.role];
      if (d === undefined) throw new Error(`AMBIGUOUS_ROLE:${m.role}`); // never guess
      targets = d === "all" ? m.matches : d.filter((id) => m.matches.includes(id));
    }
    const dress = portable.sectionDress[m.role];
    const pin = portable.sectionPins[m.role];
    for (const id of targets) {
      if (dress) sections[id] = { ...dress };
      if (pin) { pins.sections = pins.sections ?? {}; pins.sections[id] = { ...pin }; }
    }
  }
  const override: ThemeDelta = { ...portable.delta };
  override.treatments = { ...(portable.delta.treatments ?? {}), sections };
  return { override, pins, report };
}

/** REPLACEMENT — the applied portable stratum lands whole; the
 *  destination's BOUND strata (component & item dress, comp pins)
 *  remain exactly as they were. Nothing else of the old override
 *  survives: omission means inheritance, never preservation. */
export function replaceOntoDestination(
  destOverride: ThemeDelta | null,
  destPins: PhotoPins | null,
  applied: { override: ThemeDelta; pins: PhotoPins },
): { override: ThemeDelta; pins: PhotoPins } {
  const override: ThemeDelta = { ...applied.override };
  override.treatments = {
    ...(applied.override.treatments ?? {}),
    components: destOverride?.treatments?.components ?? {},
    items: destOverride?.treatments?.items ?? {},
  };
  const pins: PhotoPins = { ...applied.pins };
  if (destPins?.components && Object.keys(destPins.components).length)
    pins.components = { ...destPins.components };              // bound pins stay
  return { override, pins };
}

/** Deterministic fingerprint of a portable payload — key-order
 *  independent, so provenance survives serialization churn. */
export function fingerprintPortable(p: PortablePresentation): string {
  const stable = (v: unknown): string => {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
  };
  const s = stable(p);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** PROVENANCE — recorded AT APPLICATION TIME, never inferred later from
 *  theme_key (which post-edit proposals falsify in both directions). */
export interface PresentationProvenance {
  template_id: string;
  fingerprint: string;
  applied_at: string;
  mode: "creation" | "midflight";
}
export const makeProvenance = (templateId: string, p: PortablePresentation, mode: PresentationProvenance["mode"]): PresentationProvenance =>
  ({ template_id: templateId, fingerprint: fingerprintPortable(p), applied_at: new Date().toISOString(), mode });
