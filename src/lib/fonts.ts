// ═══════════════════════════════════════════════════════════════════════════
// FONT DELIVERY (v232) — deterministic, self-hosted typography.
//
// THE PROBLEM THIS RETIRES: FONT_PAIRINGS were CSS stacks with graceful
// fallbacks — which means the user could design one appearance and the
// customer could see another, depending on what their machine happened to
// have installed. v229's root repair exposed how silently that class of
// bug lives.
//
// THE MECHANISM: fonts are VERSIONED NPM DEPENDENCIES (Fontsource — woff2
// self-hosted from our own origin, font-display: swap, no Google runtime
// call). src/app/fonts.css imports each family/weight; the app's layout
// imports fonts.css; Studio, customer preview, and print therefore share
// ONE deterministic set of faces.
//
// THE TEETH: this manifest is the single source of truth, and the v232
// unit suite proves three facts — every pairing's primary families are in
// the manifest, the manifest carries no orphans, and fonts.css delivers
// every manifest entry. Adding a pairing without delivering its font is a
// TEST FAILURE, not a silent fallback.
//
// Weights: headings ship 700 (the renderer's 800 resolves to the nearest
// face identically everywhere); bodies ship 400 + a semibold. Families
// with narrower cuts declare exactly what exists (DM Serif Display is a
// single-weight display face; Lato's semibold is 700).
// ═══════════════════════════════════════════════════════════════════════════
import { FONT_PAIRINGS } from "./publication";

export interface FontManifestEntry {
  family: string;        // CSS family name, exactly as the stacks spell it
  pkg: string;           // fontsource package (without the @fontsource/ prefix)
  weights: number[];     // faces we deliver
}

export const FONT_MANIFEST: FontManifestEntry[] = [
  // heading families
  { family: "Playfair Display", pkg: "playfair-display", weights: [700] },
  { family: "Cormorant Garamond", pkg: "cormorant-garamond", weights: [700] },
  { family: "Montserrat", pkg: "montserrat", weights: [700] },
  { family: "Libre Baskerville", pkg: "libre-baskerville", weights: [700] },
  { family: "DM Serif Display", pkg: "dm-serif-display", weights: [400] },
  { family: "Lora", pkg: "lora", weights: [700] },
  { family: "Merriweather", pkg: "merriweather", weights: [700] },
  { family: "Spectral", pkg: "spectral", weights: [700] },
  { family: "Fraunces", pkg: "fraunces", weights: [700] },
  { family: "EB Garamond", pkg: "eb-garamond", weights: [700] },
  { family: "Bodoni Moda", pkg: "bodoni-moda", weights: [700] },
  // body families (Work Sans serves both roles)
  { family: "Inter", pkg: "inter", weights: [400, 600] },
  { family: "Source Sans 3", pkg: "source-sans-3", weights: [400, 600] },
  { family: "Lato", pkg: "lato", weights: [400, 700] },
  { family: "Karla", pkg: "karla", weights: [400, 600] },
  { family: "Open Sans", pkg: "open-sans", weights: [400, 600] },
  { family: "Work Sans", pkg: "work-sans", weights: [400, 600, 700] },
];

/** The first (primary) family in a CSS stack, unquoted. */
export function primaryFamily(stack: string): string {
  const first = stack.split(",")[0].trim();
  return first.replace(/^["']|["']$/g, "");
}

/** Families the pairings actually demand, by role. */
export function requiredFamilies(): { heading: string[]; body: string[] } {
  const heading: string[] = [], body: string[] = [];
  for (const f of FONT_PAIRINGS) {
    const h = primaryFamily(f.headingStack), b = primaryFamily(f.bodyStack);
    if (heading.indexOf(h) < 0) heading.push(h);
    if (body.indexOf(b) < 0) body.push(b);
  }
  return { heading, body };
}

/** Manifest gaps: pairings demanding families the manifest doesn't carry. */
export function manifestGaps(): string[] {
  const req = requiredFamilies();
  const have = FONT_MANIFEST.map((m) => m.family);
  return req.heading.concat(req.body).filter((f) => have.indexOf(f) < 0);
}

/** Manifest orphans: entries no pairing demands (dead weight in the bundle). */
export function manifestOrphans(): string[] {
  const req = requiredFamilies();
  const wanted = req.heading.concat(req.body);
  return FONT_MANIFEST.filter((m) => wanted.indexOf(m.family) < 0).map((m) => m.family);
}

/** Every css import fonts.css must carry, in manifest order. */
export function requiredCssImports(): string[] {
  const out: string[] = [];
  for (const m of FONT_MANIFEST) for (const w of m.weights)
    out.push(`@fontsource/${m.pkg}/${w}.css`);
  return out;
}

/** The exact install line for the deploy note. */
export function installCommand(): string {
  return "npm i " + FONT_MANIFEST.map((m) => `@fontsource/${m.pkg}`).join(" ");
}
