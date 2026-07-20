// ═══════════════════════════════════════════════════════════════════════════
// THE PDF ADAPTER (PR-4 · docs/PUBLICATION_RENDERER.md §5)
//
// The first adapter behind the RenderBackend port. It receives the
// PagedArtifact and produces bytes — no layout decisions, no breaking:
// text draws the EXACT lines the measurer wrapped (the port's wrap()
// contract, using the SAME Standard-14 faces), so counting and drawing
// can never disagree. Page-number WORDING is PR-6's; the data rides the
// artifact, nothing is drawn. Provenance stamps into PDF metadata.
// ═══════════════════════════════════════════════════════════════════════════
import { PDFDocument, PDFFont, PDFPage, PDFName, PDFString, rgb, degrees } from "pdf-lib";
import { Box } from "./box";
import { PagedArtifact, RenderBackend } from "./backend";
import { Metrics } from "./brandMetrics";
import { ProofedPage } from "./proof";

const hex = (h: string | undefined) => {
  const m = /^#([0-9a-f]{6})$/i.exec(h ?? "");
  if (!m) return rgb(0.12, 0.16, 0.22);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** PR-5 — metrics are INJECTED: the backend receives the same measurer
 *  pagination used and faces built from the same source. It cannot
 *  choose its own, so counting and drawing agree by construction. */
export function pdfBackend(metrics: Metrics): RenderBackend {
  return {
    name: "pdf",
    async render(artifact: PagedArtifact): Promise<Uint8Array> {
      const doc = await PDFDocument.create();
      const { measurer } = metrics;
      const face = await metrics.embed(doc);

      doc.setProducer(`EventCore Publication Renderer ${artifact.provenance.engineVersion}`);
      doc.setCreator(`metrics ${artifact.provenance.metricsVersion}`);
      doc.setSubject(JSON.stringify(artifact.provenance));

      const faceOf = (b: Box): PDFFont => face(b.style.font ?? "serif", b.style.weight ?? 400, !!b.style.italic);

      const drawText = (pg: PDFPage, b: Box, x: number, yTop: number, width: number,
        slice?: { fromLine: number; toLine: number }): void => {
        const size = b.style.size ?? 10;
        const lineH = size * 1.4;
        const avail = width - (b.style.indent ?? 0);
        const all = measurer.wrap(b.text ?? "", b.style.font ?? "serif", size, avail);
        const lines = slice ? all.slice(slice.fromLine, slice.toLine) : all;
        const f = faceOf(b);
        lines.forEach((line, i) => {
          let lx = x + (b.style.indent ?? 0);
          if (b.style.align === "center") lx = x + (width - f.widthOfTextAtSize(line, size)) / 2;
          else if (b.style.align === "right") lx = x + width - f.widthOfTextAtSize(line, size);
          pg.drawText(line, { x: lx, y: pg.getHeight() - (yTop + (i + 1) * lineH) + size * 0.28,
            size, font: f, color: hex(b.style.color) });
        });
      };

      for (const ip of artifact.pages) {
        const pg = doc.addPage([ip.size.width, ip.size.height]);
        const bodyWidth = ip.size.width - ip.margins.left - ip.margins.right;
        if (ip.watermark)
          pg.drawText(ip.watermark, { x: ip.size.width / 2 - 120, y: ip.size.height / 2 - 40,
            size: 64, font: face("sans", 700, false), color: rgb(0.93, 0.93, 0.95), rotate: degrees(35) });
        if (ip.runningHeader)
          drawText(pg, ip.runningHeader, ip.margins.left, ip.margins.top - 26, bodyWidth);
        for (const placed of ip.content.placed) {
          const b = placed.box;
          const yTop = ip.contentOrigin.y + placed.y;
          if (b.kind === "text") drawText(pg, b, ip.contentOrigin.x, yTop, bodyWidth, placed.slice);
          else if (b.kind === "rule") {
            const w = b.style.width ?? bodyWidth;
            pg.drawLine({ start: { x: ip.contentOrigin.x, y: pg.getHeight() - yTop },
              end: { x: ip.contentOrigin.x + w, y: pg.getHeight() - yTop },
              thickness: b.style.ruleWidth ?? 1, color: hex(b.style.ruleColor) });
          } else if (b.kind === "image") {
            const w = placed.scaledTo?.width ?? b.style.width ?? 100;
            const h = placed.scaledTo?.height ?? placed.height;
            // Remote imagery embeds with the asset-corpus work; the geometry
            // is honest today — a bordered frame, never a silent lie.
            pg.drawRectangle({ x: ip.contentOrigin.x, y: pg.getHeight() - yTop - h, width: w, height: h,
              borderColor: rgb(0.85, 0.87, 0.9), borderWidth: 0.5 });
          }
        }
        if (ip.runningFooter)
          drawText(pg, ip.runningFooter, ip.margins.left, ip.size.height - ip.margins.bottom + 16, bodyWidth);
        // PR-6 — proof furniture: the wording, finally on paper
        const proof = (ip as ProofedPage).proof;
        if (proof?.pageNumber)
          drawText(pg, proof.pageNumber, ip.margins.left, ip.size.height - ip.margins.bottom + 30, bodyWidth);
        if (proof?.continued)
          drawText(pg, proof.continued, ip.margins.left, ip.size.height - ip.margins.bottom + 2, bodyWidth);
        if (proof?.continuedFrom)
          drawText(pg, proof.continuedFrom, ip.margins.left, ip.margins.top - 14, bodyWidth);
      }
      // PR-6 — BOOKMARKS: the outline is the digital table of contents,
      // hand-rolled (pdf-lib has no high-level API; the dicts are ours).
      if (artifact.outline && artifact.outline.length) {
        const ctx = doc.context;
        const pageRefs = doc.getPages().map((pg) => pg.ref);
        const root = ctx.obj({ Type: "Outlines", Count: artifact.outline.length });
        const rootRef = ctx.register(root);
        const items = artifact.outline.map((e) => {
          const d = ctx.obj({ Title: PDFString.of(e.label), Parent: rootRef,
            Dest: ctx.obj([pageRefs[e.pageIndex], PDFName.of("XYZ"), null, null, null]) });
          return { d, ref: ctx.register(d) };
        });
        items.forEach((it, i) => {
          if (i > 0) it.d.set(PDFName.of("Prev"), items[i - 1].ref);
          if (i < items.length - 1) it.d.set(PDFName.of("Next"), items[i + 1].ref);
        });
        root.set(PDFName.of("First"), items[0].ref);
        root.set(PDFName.of("Last"), items[items.length - 1].ref);
        doc.catalog.set(PDFName.of("Outlines"), rootRef);
      }
      return doc.save();
    },
  };
}
