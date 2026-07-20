// ═══════════════════════════════════════════════════════════════════════════
// PRINT PROOF (PR-6 · docs/PUBLICATION_RENDERER.md — the closing slice)
//
// Only now do page numbers appear on paper: their reservation's condition
// (real pagination) is fully met. WORDING lives here and only here —
// pagination emitted neutral facts (markers, {n, of} data); proof turns
// facts into words. Labels arrive as an OPAQUE map built at the
// composer's gate: this file resolves tags by longest prefix and never
// learns what a tag means. An unresolvable tag yields SILENCE — a
// customer never reads machinery.
// ═══════════════════════════════════════════════════════════════════════════
import { Box, box } from "./box";
import { ContinuationMarker } from "./paginate";
import { ImposedPage } from "./masters";

export interface ProofFurniture {
  pageNumber: Box | null;
  /** Bottom of a page whose content continues onto the next. */
  continued: Box | null;
  /** Top of a page whose content continues from the previous. */
  continuedFrom: Box | null;
}
export type ProofedPage = ImposedPage & { proof: ProofFurniture };

/** Longest-prefix label lookup — tags stay opaque; the map decides. */
export const labelFor = (tag: string, labels: Record<string, string>): string | null => {
  let best: string | null = null;
  let bestLen = -1;
  for (const k of Object.keys(labels)) {
    if (tag === k || tag.indexOf(k + "/") === 0 || tag.indexOf(k + ":") === 0 || tag.indexOf(k) === 0) {
      if (k.length > bestLen) { best = labels[k]; bestLen = k.length; }
    }
  }
  return best;
};

/** The most SPECIFIC labeled marker wins a crossing — "Carving Station,
 *  continued" over "Dinner, continued" when both cross. */
const crossingLabel = (markers: ContinuationMarker[], labels: Record<string, string>): string | null => {
  let best: string | null = null;
  let bestLen = -1;
  for (const m of markers) {
    const l = labelFor(m.tag, labels);
    if (l !== null && m.tag.length > bestLen) { best = l; bestLen = m.tag.length; }
  }
  return best;
};

const tiny = (tag: string, text: string, align: "left" | "center" | "right"): Box =>
  box("text", tag, { text, style: { font: "sans", size: 7.5, italic: true, color: "#94A3B8", align } });

export function applyProof(
  imposed: ImposedPage[],
  continuations: ContinuationMarker[],
  labels: Record<string, string>,
): ProofedPage[] {
  return imposed.map((p) => {
    const outgoing = continuations.filter((c) => c.fromPage === p.index);
    const incoming = continuations.filter((c) => c.toPage === p.index);
    const outLabel = crossingLabel(outgoing, labels);
    const inLabel = crossingLabel(incoming, labels);
    // position honors the master's DECLARED decoration
    const pageNumber: Box | null = p.pageNumber
      ? tiny("proof:page-number", `Page ${p.pageNumber.n} of ${p.pageNumber.of}`,
          p.pageNumber.position === "footer-outside" ? "right" : "center")
      : null;
    return {
      ...p,
      proof: {
        pageNumber,
        continued: outLabel ? tiny("proof:continued", `${outLabel} continues\u2026`, "right") : null,
        continuedFrom: inLabel ? tiny("proof:continued-from", `${inLabel}, continued`, "left") : null,
      },
    };
  });
}

/** THE TOC — pure data from provenance: each labeled top-level entry's
 *  FIRST page, in reading order. Feeds the PDF outline (the digital
 *  contents); a printed TOC page is deliberately NOT built — it would
 *  need its own page reserved before numbering, and proposals are short.
 *  The data is here the day that changes. */
export function tocEntries(
  pages: ImposedPage[],
  labels: Record<string, string>,
): { label: string; pageIndex: number }[] {
  const seen: Record<string, true> = {};
  const out: { label: string; pageIndex: number }[] = [];
  for (const p of pages) {
    for (const placed of p.content.placed) {
      for (const key of Object.keys(labels)) {
        if ((placed.box.tag === key || placed.box.tag.indexOf(key + "/") === 0) && !seen[key]) {
          seen[key] = true;
          out.push({ label: labels[key], pageIndex: p.index });
        }
      }
    }
  }
  return out;
}
