// ═══════════════════════════════════════════════════════════════════════════
// COMPARE PRESENTATION… (v242 · PA-4 · PUBLISHING_ASSETS §0 §3)
//
// The verb is a COMPARE ENGINE and always was; users compare before
// replacing — Apply is the compare view's closing act, not the door's
// name. The Second Sheet preview exposes, before anything happens:
//   · what CHANGES (including omissions — leaves the destination loses
//     to inheritance, because omission never preserves)
//   · what STAYS BOUND (component & item dress, component pins)
//   · UNMATCHED source dress (roles that will wait silently)
//   · AMBIGUOUS mappings (decisions the user must make — never guessed)
//   · MISSING / inaccessible photos (pins whose photo the library lacks)
// ═══════════════════════════════════════════════════════════════════════════
import { ThemeDelta } from "./publication";
import { PhotoPins } from "./photos";
import { PortablePresentation, portablePresentation, matchSections, RoleMatch } from "./portable";

export interface CompareChange { leaf: string; from: string; to: string }
export interface CompareReport {
  changes: CompareChange[];
  staysBound: { components: number; items: number; compPins: number };
  unmatched: string[];
  ambiguous: RoleMatch[];
  missingPhotos: { slot: string; label: string }[];
  sectionDressArriving: number;
  sectionDressClearing: number;
}

const INHERIT = "(inherits)";
const leafWalk = (prefix: string, v: unknown, out: Record<string, string>) => {
  if (v === null || v === undefined) return;
  if (typeof v !== "object") { out[prefix] = String(v); return; }
  for (const k of Object.keys(v as Record<string, unknown>))
    leafWalk(prefix ? `${prefix}.${k}` : k, (v as Record<string, unknown>)[k], out);
};

/** Flatten a portable's DOCUMENT-LEVEL leaves (theme key + delta). */
const documentLeaves = (p: PortablePresentation): Record<string, string> => {
  const out: Record<string, string> = {};
  if (p.themeKey) out["theme"] = p.themeKey;
  leafWalk("", p.delta, out);
  return out;
};

export function comparePresentation(
  source: PortablePresentation,
  dest: { themeKey: string | null; override: ThemeDelta | null; pins: PhotoPins | null },
  destSections: { id: string; role: string }[],
  libraryPhotoIds: string[],
): CompareReport {
  const destPortable = portablePresentation(dest);
  const a = documentLeaves(destPortable);
  const b = documentLeaves(source);
  const changes: CompareChange[] = [];
  // union of leaves, es5-safe
  const seen: Record<string, true> = {};
  for (const k of Object.keys(a)) seen[k] = true;
  for (const k of Object.keys(b)) seen[k] = true;
  for (const leaf of Object.keys(seen).sort()) {
    const from = a[leaf] ?? INHERIT;
    const to = b[leaf] ?? INHERIT;   // omission MEANS inheritance — shown as a change
    if (from !== to) changes.push({ leaf, from, to });
  }
  const report = matchSections(source, destSections);
  const unmatched = report.filter((m) => m.outcome === "waits").map((m) => m.role);
  const ambiguous = report.filter((m) => m.outcome === "decide");
  const arriving = report.filter((m) => m.outcome !== "waits").length;
  const clearing = Object.keys(destPortable.sectionDress).length;
  const lib: Record<string, true> = {};
  for (const id of libraryPhotoIds) lib[id] = true;
  const missingPhotos: { slot: string; label: string }[] = [];
  if (source.documentPin && !lib[source.documentPin.id])
    missingPhotos.push({ slot: "document", label: source.documentPin.label });
  for (const role of Object.keys(source.sectionPins)) {
    const pin = source.sectionPins[role];
    if (!lib[pin.id]) missingPhotos.push({ slot: role, label: pin.label });
  }
  return {
    changes,
    staysBound: {
      components: Object.keys(dest.override?.treatments?.components ?? {}).length,
      items: Object.keys(dest.override?.treatments?.items ?? {}).length,
      compPins: Object.keys(dest.pins?.components ?? {}).length,
    },
    unmatched, ambiguous, missingPhotos,
    sectionDressArriving: arriving, sectionDressClearing: clearing,
  };
}
