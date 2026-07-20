// ═══════════════════════════════════════════════════════════════════════════
// STANDARD-14 METRICS (PR-4). The engine's first REAL metrics set: the
// PDF standard fonts' AFM width tables, shipped inside pdf-lib itself —
// declared, deterministic on every machine, versioned. "serif" is Times,
// "sans" is Helvetica; weight ≥ 600 selects the bold face, italic the
// oblique. Brand-face embedding (the fontsource set) is PR-5 typography
// work; the port makes that a metrics swap, not a rewrite.
// A font this set lacks THROWS — never a fallback (the §1 hard edge).
// ═══════════════════════════════════════════════════════════════════════════
import { PDFDocument, PDFFont, StandardFonts } from "pdf-lib";
import { Measurer } from "./measure";

export const STD14_VERSION = "std14-afm-1";

export interface FaceKey { font: string; weight?: number; italic?: boolean }
const faceName = (font: string, weight: number, italic: boolean): StandardFonts => {
  if (font === "serif")
    return weight >= 600 ? (italic ? StandardFonts.TimesRomanBoldItalic : StandardFonts.TimesRomanBold)
                         : (italic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman);
  if (font === "sans")
    return weight >= 600 ? (italic ? StandardFonts.HelveticaBoldOblique : StandardFonts.HelveticaBold)
                         : (italic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica);
  throw new Error(`UNDECLARED_FONT:${font}`);
};

export interface Std14 {
  measurer: Measurer;
  /** The backend borrows the SAME faces it measured with. */
  face(font: string, weight?: number, italic?: boolean): PDFFont;
}

/** Async once (embedding); sync forever after — the port stays pure. */
export async function standardMetrics(doc?: PDFDocument): Promise<Std14> {
  const scratch = doc ?? await PDFDocument.create();
  const faces: Record<string, PDFFont> = {};
  const NAMES: StandardFonts[] = [
    StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic,
    StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique,
  ];
  for (const n of NAMES) faces[n] = await scratch.embedFont(n);
  const face = (font: string, weight = 400, italic = false): PDFFont => faces[faceName(font, weight, italic)];

  const wrapWords = (text: string, f: PDFFont, size: number, maxWidth: number): string[] => {
    const out: string[] = [];
    for (const rawLine of text.split("\n")) {
      const words = rawLine.split(/\s+/).filter((w) => w.length > 0);
      if (words.length === 0) { out.push(""); continue; }
      let line = "";
      for (const w of words) {
        const trial = line ? line + " " + w : w;
        if (f.widthOfTextAtSize(trial, size) <= maxWidth || !line) line = trial;
        else { out.push(line); line = w; }
      }
      out.push(line);
    }
    return out;
  };

  const measurer: Measurer = {
    version: STD14_VERSION,
    declaredFonts: () => ["serif", "sans"],
    measure(text, font, size, maxWidth) {
      const f = face(font);                       // regular face governs wrap
      if (size <= 0 || maxWidth <= 0) throw new Error("MEASURE_DOMAIN");
      const lines = text.length === 0 ? 0 : wrapWords(text, f, size, maxWidth).length;
      const lineHeight = size * 1.4;
      return { lines, lineHeight, height: lines * lineHeight };
    },
    wrap(text, font, size, maxWidth) {
      return wrapWords(text, face(font), size, maxWidth);
    },
  };
  return { measurer, face };
}
