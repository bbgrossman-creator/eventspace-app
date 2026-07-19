// ═══════════════════════════════════════════════════════════════════════════
// PHOTOGRAPHY (v233 · PUBLICATION §7) — the pure layer.
//
// THE PIN DECIDES EXISTENCE; THE TREATMENT DECIDES DRESS. A pin is a
// version-level presentation fact: which photo this publication chose for a
// slot. It denormalizes url + label AT PIN TIME so a stamped document
// renders whole forever, whatever later happens to the library. Placement
// (band / side / full / none) is a treatment riding the ladder like any
// other dress; "none" suppresses render without losing the pin.
//
// PROPOSE: the system suggests tagged photos for a slot by token overlap
// between the slot's name and each photo's tags + label. Pure, ranked,
// deterministic; ties break by library order.
// ═══════════════════════════════════════════════════════════════════════════

export interface PhotoRecord {
  id: string; url: string; label: string; tags: string[];
}

export interface PhotoRef { id: string; url: string; label: string }

export interface PhotoPins {
  cover?: PhotoRef;
  sections?: Record<string, PhotoRef>;
  /** v234 — component imagery, addressed as slot "comp:<id>". */
  components?: Record<string, PhotoRef>;
}

const tokens = (s: string): string[] =>
  s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);

/** Ranked proposals for a slot. Score: tag hits weigh 2, label hits 1. */
export function proposePhotos(slotName: string, library: PhotoRecord[], limit = 3): PhotoRecord[] {
  const want = tokens(slotName);
  if (!want.length || !library.length) return library.slice(0, limit);
  const scored = library.map((p, i) => {
    let score = 0;
    const tagTok = p.tags.map((t) => tokens(t)).reduce((a, b) => a.concat(b), []);
    const labTok = tokens(p.label);
    for (const w of want) {
      if (tagTok.some((t) => t === w || t.indexOf(w) === 0 || w.indexOf(t) === 0)) score += 2;
      if (labTok.some((t) => t === w || t.indexOf(w) === 0 || w.indexOf(t) === 0)) score += 1;
    }
    return { p, score, i };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.filter((s) => s.score > 0).concat(scored.filter((s) => s.score === 0))
    .slice(0, limit).map((s) => s.p);
}

/** Immutable pin: "__document__" pins the cover; anything else, a section. */
export function pinPhoto(pins: PhotoPins | null, slot: string, photo: PhotoRecord): PhotoPins {
  const ref: PhotoRef = { id: photo.id, url: photo.url, label: photo.label };
  const base: PhotoPins = { ...(pins ?? {}) };
  if (slot === "__document__") return { ...base, cover: ref };
  if (slot.indexOf("comp:") === 0)
    return { ...base, components: { ...(base.components ?? {}), [slot.slice(5)]: ref } };
  return { ...base, sections: { ...(base.sections ?? {}), [slot]: ref } };
}

export function unpinPhoto(pins: PhotoPins | null, slot: string): PhotoPins {
  const base: PhotoPins = { ...(pins ?? {}) };
  if (slot === "__document__") { delete base.cover; return base; }
  if (slot.indexOf("comp:") === 0) {
    const components = { ...(base.components ?? {}) };
    delete components[slot.slice(5)];
    return { ...base, components };
  }
  const sections = { ...(base.sections ?? {}) };
  delete sections[slot];
  return { ...base, sections };
}

export const pinnedFor = (pins: PhotoPins | null | undefined, slot: string): PhotoRef | null =>
  !pins ? null
  : slot === "__document__" ? (pins.cover ?? null)
  : slot.indexOf("comp:") === 0 ? (pins.components?.[slot.slice(5)] ?? null)
  : (pins.sections?.[slot] ?? null);
