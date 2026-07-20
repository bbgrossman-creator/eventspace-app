// ═══════════════════════════════════════════════════════════════════════════
// THE RENDER ENTRY (PR-4). Gate-side orchestration: compose → paginate →
// impose → backend, with provenance stamped. Pure of the database — the
// caller supplies the RenderPublication whole; for sent documents that
// means THE SNAPSHOT (v231/v239 freezing law extends to pages).
// ═══════════════════════════════════════════════════════════════════════════
import { PresentationModel } from "../presentation";
import { ResolvedTheme, RegionTexts } from "../publication";
import { ResolvedFact } from "../identity";
import { PhotoPins } from "../photos";
import { composePublication, composeMasters, composeProofLabels, RenderPublication } from "./compose";
import { applyProof, tocEntries } from "./proof";
import { paginate } from "./paginate";
import { extentsFrom, imposePages } from "./masters";
import { std14Metrics } from "./pdfMetrics";
import { pdfBackend } from "./pdfBackend";
import { brandMetrics, BrandFontBytes } from "./brandMetrics";
import { PagedArtifact, RENDER_ENGINE_VERSION } from "./backend";

export async function renderToPdf(
  pub: RenderPublication,
  sourceFingerprint: string | null,
  brand?: BrandFontBytes,
): Promise<{ bytes: Uint8Array; artifact: PagedArtifact }> {
  // ONE metrics choice — the same measurer paginates and draws (PR-5).
  const metrics = brand ? brandMetrics(brand) : await std14Metrics();
  const { measurer } = metrics;
  const tree = composePublication(pub);
  const masters = composeMasters(pub);
  const result = paginate(tree, measurer, extentsFrom(masters));
  const labels = composeProofLabels(pub);
  const proofed = applyProof(imposePages(result, masters), result.continuations, labels);
  const artifact: PagedArtifact = {
    pages: proofed,
    outline: tocEntries(proofed, labels),
    provenance: {
      engineVersion: RENDER_ENGINE_VERSION,
      metricsVersion: measurer.version,
      generatedAt: new Date().toISOString(),
      sourceFingerprint,
    },
  };
  const bytes = await pdfBackend(metrics).render(artifact);
  return { bytes, artifact };
}

/** The SNAPSHOT MAPPER — a sent document renders from what was stamped,
 *  never from live state. Every field below comes off the snapshot. */
export function renderPublicationFromSnapshot(
  model: PresentationModel,
  snapshot: ResolvedTheme & { regionTexts?: RegionTexts; companyFacts?: ResolvedFact[]; photoPins?: PhotoPins | null },
): RenderPublication {
  return {
    model,
    theme: snapshot,
    regions: snapshot.regionTexts ?? { footer: null, signature: null, terms: null },
    company: snapshot.companyFacts ?? [],
    pins: snapshot.photoPins ?? null,
  };
}
