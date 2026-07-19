// v232 — Font Delivery's teeth: the pairings, the manifest, and fonts.css
// are ONE fact expressed three ways. Any drift is a failure here.
import { readFileSync } from "fs";
import { FONT_PAIRINGS } from "../publication";
import {
  FONT_MANIFEST, manifestGaps, manifestOrphans, requiredCssImports, primaryFamily,
} from "../fonts";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
T("every pairing's primary families are DELIVERED — no silent fallbacks left", () => {
  const gaps = manifestGaps();
  if (gaps.length) throw new Error("undelivered families: " + gaps.join(", "));
  for (const f of FONT_PAIRINGS) {
    if (f.headingStack.split(",").length < 2) throw new Error(f.key + " lost its graceful fallback");
    if (!primaryFamily(f.headingStack)) throw new Error(f.key + " has no primary");
  }
});
T("the manifest carries no orphans, and no family twice", () => {
  const orphans = manifestOrphans();
  if (orphans.length) throw new Error("dead weight: " + orphans.join(", "));
  const seen: Record<string, true> = {};
  for (const m of FONT_MANIFEST) {
    if (seen[m.family]) throw new Error("duplicate " + m.family);
    seen[m.family] = true;
    if (!m.weights.length) throw new Error(m.family + " delivers no faces");
    if (!/^[a-z0-9-]+$/.test(m.pkg)) throw new Error("suspicious package: " + m.pkg);
  }
});
T("fonts.css delivers EXACTLY the manifest — every import present, nothing extra", () => {
  const css = readFileSync("src/app/fonts.css", "utf8");
  const wanted = requiredCssImports();
  for (const imp of wanted) {
    if (!css.includes(`@import "${imp}";`)) throw new Error("fonts.css missing " + imp);
  }
  const found = css.match(/@import "[^"]+";/g) ?? [];
  if (found.length !== wanted.length)
    throw new Error(`fonts.css has ${found.length} imports, manifest demands ${wanted.length}`);
});
console.log(`\nv232.fonts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
