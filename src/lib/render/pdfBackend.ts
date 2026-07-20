// ═══════════════════════════════════════════════════════════════════════════
// THE PDF ADAPTER (PR-4). Dumb by law: it draws what imposition placed,
// re-wrapping text with the SAME measurer pagination budgeted with (the
// wrap()===lines law), and decides nothing. Page-number WORDING stays
// PR-6's — the data rides through undrawn. Images draw as light frames
// until PR-5's placement rules bring bytes; the frame is honest, never a
// silent absence. pdf-lib appears in this file and nowhere upstream.
// ═══════════════════════════════════════════════════════════════════════════
import { PDFDocument, rgb, degrees } from "pdf-lib";
import { Box } from "./box";
import { PlacedBox } from "./paginate";
import { RenderBackend, PagedArtifact } from "./backend";
import { standardMetrics, Std14 } from "./pdfMetrics";

const hex = (h?: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h ?? "");
  if (!m) return rgb(0.12, 0.16, 0.23);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

export function pdfBackend(): RenderBackend {
  return {
    name: "pdf",
    async render(artifact: PagedArtifact): Promise<Uint8Array> {
      const doc = await PDFDocument.create();
      // provenance into fields pdf-lib round-trips (Producer is pdf-lib's own)
      doc.setKeywords([`engine:${artifact.provenance.engineVersion}`, `metrics:${artifact.provenance.metricsVersion}`]);
      doc.setCreationDate(new Date(artifact.provenance.generatedAt));
      if (artifact.provenance.sourceFingerprint) doc.setSubject(artifact.provenance.sourceFingerprint);
      const std: Std14 = await standardMetrics(doc);

      const drawBox = (page: ReturnType<PDFDocument["addPage"]>, pb: PlacedBox, ox: number, oy: number, width: number, pageH: number) => {
        const b: Box = pb.box;
        const top = oy + pb.y;                                  // from page top
        const x = ox + (b.style.indent ?? 0);
        if (b.kind === "text") {
          const size = b.style.size ?? 10;
          const f = std.face(b.style.font ?? "serif", b.style.weight ?? 400, !!b.style.italic);
          const lines = std.measurer.wrap(b.text ?? "", b.style.font ?? "serif", size, width - (b.style.indent ?? 0));
          const from = pb.slice?.fromLine ?? 0;
          const to = pb.slice?.toLine ?? lines.length;
          const lh = size * 1.4;
          for (let i = from; i < to; i++) {
            const line = lines[i] ?? "";
            let lx = x;
            if (b.style.align === "center") lx = ox + (width - f.widthOfTextAtSize(line, size)) / 2;
            else if (b.style.align === "right") lx = ox + width - f.widthOfTextAtSize(line, size);
            page.drawText(line, { x: lx, y: pageH - (top + (i - from + 1) * lh) + size * 0.25,
              size, font: f, color: hex(b.style.color) });
          }
        } else if (b.kind === "rule") {
          const w = b.style.width ?? width;
          page.drawLine({ start: { x: ox, y: pageH - top }, end: { x: ox + w, y: pageH - top },
            thickness: b.style.ruleWidth ?? 1, color: hex(b.style.ruleColor) });
        } else if (b.kind === "image") {
          const w = pb.scaledTo?.width ?? b.style.width ?? width;
          const h = pb.scaledTo?.height ?? pb.height;
          page.drawRectangle({ x, y: pageH - (top + h), width: w, height: h,
            borderColor: rgb(0.85, 0.87, 0.9), borderWidth: 0.5 });   // honest frame until PR-5
        }
        // spacers draw nothing; group children were placed individually
      };

      for (const ip of artifact.pages) {
        const page = doc.addPage([ip.size.width, ip.size.height]);
        const pageH = ip.size.height;
        const bodyW = ip.size.width - ip.margins.left - ip.margins.right;
        // furniture — margin bands
        const band = (b: Box | null, topY: number) => {
          if (!b || b.kind !== "text") return;
          const size = b.style.size ?? 8;
          const f = std.face(b.style.font ?? "sans", b.style.weight ?? 400, !!b.style.italic);
          const text = b.text ?? "";
          const tw = f.widthOfTextAtSize(text, size);
          const lx = b.style.align === "center" ? ip.margins.left + (bodyW - tw) / 2 : ip.margins.left;
          page.drawText(text, { x: lx, y: pageH - topY, size, font: f, color: hex(b.style.color) });
        };
        band(ip.runningHeader, ip.margins.top * 0.55);
        band(ip.runningFooter, ip.size.height - ip.margins.bottom * 0.4);
        if (ip.watermark) {
          const f = std.face("sans", 700, false);
          const size = 84;
          const tw = f.widthOfTextAtSize(ip.watermark, size);
          page.drawText(ip.watermark, { x: (ip.size.width - tw * 0.72) / 2, y: ip.size.height * 0.32,
            size, font: f, color: rgb(0.93, 0.94, 0.96), rotate: degrees(35) });
        }
        for (const pb of ip.content.placed) drawBox(page, pb, ip.contentOrigin.x, ip.contentOrigin.y, bodyW, pageH);
        // pageNumber DATA present, wording undrawn — PR-6's business.
      }
      return doc.save();   // Keywords/Subject round-trip; Producer is pdf-lib's own
    },
  };
}
