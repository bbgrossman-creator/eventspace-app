// PR-5 — brand font bytes over HTTP (browser + node18 fetch). The
// fontsource layout is the contract; absence degrades to null so the
// caller falls back to Std14 gracefully — the metrics swap never blocks
// a download.
import { BrandFontBytes } from "./brandMetrics";

const get = async (url: string): Promise<Uint8Array> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`FONT_FETCH:${url}`);
  return new Uint8Array(await r.arrayBuffer());
};

export async function fetchBrandFonts(base: string): Promise<BrandFontBytes | null> {
  try {
    const [sr, sb, si, nr, nb] = await Promise.all([
      get(`${base}/playfair-display/files/playfair-display-latin-400-normal.woff`),
      get(`${base}/playfair-display/files/playfair-display-latin-700-normal.woff`),
      get(`${base}/playfair-display/files/playfair-display-latin-400-italic.woff`),
      get(`${base}/inter/files/inter-latin-400-normal.woff`),
      get(`${base}/inter/files/inter-latin-700-normal.woff`),
    ]);
    return { version: "fontsource-1", serif: { regular: sr, bold: sb, italic: si }, sans: { regular: nr, bold: nb } };
  } catch { return null; }
}
