// ═══════════════════════════════════════════════════════════════════════════
// BRAND METRICS (PR-5) — the promised METRICS SWAP. The same strict port,
// now backed by the brand's own font bytes (the v232 fontsource set):
// realMeasurer wraps by true advance widths, and embed() hands the
// backend faces built from THE SAME BYTES — one source, so counting and
// drawing agree by construction. Regular faces govern wrap (the Std14
// approximation, kept and named); bold/italic select at draw time with
// within-brand fallback to regular. An undeclared family still THROWS.
// ═══════════════════════════════════════════════════════════════════════════
import { PDFDocument, PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { Measurer } from "./measure";
import { realMeasurer } from "./realMeasure";

export interface BrandFontBytes {
  version: string;
  serif: { regular: Uint8Array; bold?: Uint8Array; italic?: Uint8Array };
  sans: { regular: Uint8Array; bold?: Uint8Array; italic?: Uint8Array };
}

export type FaceFn = (font: string, weight: number, italic: boolean) => PDFFont;

export interface Metrics {
  measurer: Measurer;
  embed(doc: PDFDocument): Promise<FaceFn>;
}

export function brandMetrics(bytes: BrandFontBytes): Metrics {
  const measurer = realMeasurer({ serif: bytes.serif.regular, sans: bytes.sans.regular }, bytes.version);
  return {
    measurer,
    async embed(doc) {
      doc.registerFontkit(fontkit as never);
      const cache: Record<string, PDFFont> = {};
      const emb = async (key: string, b: Uint8Array | undefined, fallback?: PDFFont): Promise<PDFFont> => {
        if (b) { cache[key] = await doc.embedFont(b as never, { subset: true }); return cache[key]; }
        if (fallback) return fallback;
        throw new Error(`UNDECLARED_FONT:${key}`);
      };
      const serifR = await emb("serif", bytes.serif.regular);
      const serifB = await emb("serif-b", bytes.serif.bold, serifR);
      const serifI = await emb("serif-i", bytes.serif.italic, serifR);
      const sansR = await emb("sans", bytes.sans.regular);
      const sansB = await emb("sans-b", bytes.sans.bold, sansR);
      return (font, weight, italic) => {
        if (font === "serif") return italic ? serifI : weight >= 600 ? serifB : serifR;
        if (font === "sans") return weight >= 600 ? sansB : sansR;
        throw new Error(`UNDECLARED_FONT:${font}`);
      };
    },
  };
}
