// ═══════════════════════════════════════════════════════════════════════════
// PRESENTATION KNOWLEDGE — THE PROOF ENGINE (v243 · PA-5 · §5)
//
// Templates aren't just reusable; they're PROVEN — carefully. Proof is
// COMPUTED, never a stored opinion, and attributed ONLY from provenance
// recorded at application time. A version whose theme_key happens to
// match is NOT evidence: theme_key inference falsifies in both
// directions, so it is refused by construction — rows without provenance
// simply never enter the count.
//
// Divergence distinguishes: applied and kept UNCHANGED · LIGHTLY
// modified · HEAVILY modified · applied to an EARLIER REVISION of the
// template (the fingerprint no longer matches the template's current
// portable — honest proof says "started from", not "proof of this").
//
// NOTHING here ranks. There is no "best performing" field, and there
// never will be until sample size and divergence are accounted for.
// ═══════════════════════════════════════════════════════════════════════════
import { ThemeDelta } from "./publication";
import { PhotoPins } from "./photos";
import { PortablePresentation, portablePresentation, fingerprintPortable, PresentationProvenance } from "./portable";

export interface ProofRow {
  status: string;                                  // draft | sent | approved | …
  provenance: PresentationProvenance | null;       // the ONLY admissible attribution
  themeKey: string | null;
  override: ThemeDelta | null;
  pins: PhotoPins | null;
  /** Money, when the host can supply it; proof prints "—" when it can't. */
  acceptedValue?: number | null;
}

export type Divergence = "unchanged" | "light" | "heavy" | "earlier-revision";

/** Leaf-count difference between two portables (document leaves + section
 *  dress at role level + pins at slot level). Pure and symmetric. */
export function portableDistance(a: PortablePresentation, b: PortablePresentation): number {
  const flat = (p: PortablePresentation): Record<string, string> => {
    const out: Record<string, string> = {};
    const walk = (prefix: string, v: unknown) => {
      if (v === null || v === undefined) return;
      if (typeof v !== "object") { out[prefix] = String(v); return; }
      for (const k of Object.keys(v as Record<string, unknown>)) walk(`${prefix}.${k}`, (v as Record<string, unknown>)[k]);
    };
    walk("theme", p.themeKey); walk("delta", p.delta);
    walk("sections", p.sectionDress); walk("pins", p.sectionPins); walk("docpin", p.documentPin);
    return out;
  };
  const A = flat(a), B = flat(b);
  const seen: Record<string, true> = {};
  for (const k of Object.keys(A)) seen[k] = true;
  for (const k of Object.keys(B)) seen[k] = true;
  let n = 0;
  for (const k of Object.keys(seen)) if (A[k] !== B[k]) n++;
  return n;
}

/** Unit-pinned thresholds: 0 unchanged · 1–4 light · 5+ heavy. */
export function classifyDivergence(
  template: { id: string; portable: PortablePresentation },
  row: ProofRow,
): Divergence | null {
  if (!row.provenance || row.provenance.template_id !== template.id) return null;   // not evidence
  if (row.provenance.fingerprint !== fingerprintPortable(template.portable)) return "earlier-revision";
  const d = portableDistance(template.portable,
    portablePresentation({ themeKey: row.themeKey, override: row.override, pins: row.pins }));
  return d === 0 ? "unchanged" : d <= 4 ? "light" : "heavy";
}

export interface TemplateProof {
  used: number;
  sent: number;
  accepted: number;
  acceptanceRate: number | null;        // null when sent === 0 — never 0/0 bravado
  avgAcceptedValue: number | null;      // null when no accepted value is known
  modifiedAfter: number;                // any divergence but "unchanged"
  divergence: Record<Divergence, number>;
}

export function templateProof(
  template: { id: string; portable: PortablePresentation },
  rows: ProofRow[],
): TemplateProof {
  const divergence: Record<Divergence, number> = { unchanged: 0, light: 0, heavy: 0, "earlier-revision": 0 };
  let used = 0, sent = 0, accepted = 0, modifiedAfter = 0, sum = 0, sumN = 0;
  for (const row of rows) {
    const cls = classifyDivergence(template, row);
    if (cls === null) continue;                    // theme_key coincidence refused here
    used++; divergence[cls]++;
    if (cls !== "unchanged") modifiedAfter++;
    if (row.status === "sent" || row.status === "approved") sent++;
    if (row.status === "approved") {
      accepted++;
      if (row.acceptedValue != null) { sum += row.acceptedValue; sumN++; }
    }
  }
  return {
    used, sent, accepted,
    acceptanceRate: sent > 0 ? accepted / sent : null,
    avgAcceptedValue: sumN > 0 ? sum / sumN : null,
    modifiedAfter, divergence,
  };
}

/** The card's one honest line. */
export function proofLine(p: TemplateProof, money: (n: number) => string): string {
  if (p.used === 0) return "Not yet applied.";
  const rate = p.acceptanceRate === null ? "—" : `${Math.round(p.acceptanceRate * 100)}%`;
  const avg = p.avgAcceptedValue === null ? "—" : money(p.avgAcceptedValue);
  return `Used ${p.used} · Sent ${p.sent} · Accepted ${p.accepted} · ${rate} · avg ${avg} · Modified after ${p.modifiedAfter}`;
}
