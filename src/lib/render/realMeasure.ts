// ═══════════════════════════════════════════════════════════════════════════
// THE REAL MEASURER (PR-4) — the strict port backed by DECLARED font
// bytes (the same files the backend embeds), measured through fontkit's
// actual advance widths. Greedy word wrap; deterministic on every
// machine because the bytes ship with the engine; versioned; an
// undeclared family THROWS. No system fonts, no discovery, no network.
// ═══════════════════════════════════════════════════════════════════════════
import fontkit from "@pdf-lib/fontkit";
import { Measurer } from "./measure";

interface FKFont { unitsPerEm: number; layout(s: string): { advanceWidth: number } }

export function realMeasurer(fontBytes: Record<string, Uint8Array>, version: string): Measurer {
  const fonts: Record<string, FKFont> = {};
  for (const family of Object.keys(fontBytes))
    fonts[family] = fontkit.create(fontBytes[family] as never) as unknown as FKFont;
  const widthOf = (f: FKFont, s: string, size: number): number =>
    (f.layout(s).advanceWidth / f.unitsPerEm) * size;

  const wrap = (text: string, font: string, size: number, maxWidth: number): string[] => {
    const f = fonts[font];
    if (!f) throw new Error(`UNDECLARED_FONT:${font}`);
    if (size <= 0 || maxWidth <= 0) throw new Error("MEASURE_DOMAIN");
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const probe = line ? line + " " + w : w;
      if (widthOf(f, probe, size) <= maxWidth || !line) line = probe;
      else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    return lines;
  };

  return {
    version,
    declaredFonts: () => Object.keys(fonts),
    wrap,
    measure(text, font, size, maxWidth) {
      const lines = wrap(text, font, size, maxWidth);
      const lineHeight = size * 1.4;
      return { lines: lines.length, lineHeight, height: lines.length * lineHeight };
    },
  };
}
