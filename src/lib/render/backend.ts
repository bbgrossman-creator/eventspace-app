// ═══════════════════════════════════════════════════════════════════════════
// THE BACKEND PORT (PR-4 · docs/PUBLICATION_RENDERER.md §5)
//
// A backend receives the PagedArtifact — placed boxes inside declared
// geometry, with provenance — and produces bytes. It makes no layout
// decisions, measures nothing, breaks nothing. If adding a backend ever
// requires touching the composer or paginator, the port has failed and
// the phase reopens. No format library appears in this file.
// ═══════════════════════════════════════════════════════════════════════════
import { ImposedPage } from "./masters";

export const RENDER_ENGINE_VERSION = "renderer-1";

export interface ArtifactProvenance {
  engineVersion: string;
  metricsVersion: string;
  generatedAt: string;                 // ISO
  /** The source's identity — a snapshot stamp for sent documents, so a
   *  regenerated artifact can say whether it could differ. */
  sourceFingerprint: string | null;
}

export interface PagedArtifact {
  pages: ImposedPage[];
  /** PR-6 — the digital contents: labeled first-page entries, feeding
   *  the PDF outline. Data here; a printed TOC page deliberately not. */
  outline?: { label: string; pageIndex: number }[];
  provenance: ArtifactProvenance;
}

export interface RenderBackend {
  name: string;
  render(artifact: PagedArtifact): Promise<Uint8Array>;
}
