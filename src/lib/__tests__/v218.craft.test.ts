// v218 — the craft slice's pure claims: xrayMode lives in the REGISTRY (the
// Line consults the field, never a lens name), and the version-axis caption
// says what changed in one quiet line.
import { LENSES } from "../lenses";
import { formatVersionDiff, effectiveSheetChoice } from "../sheetChoice";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const lens = (k: string) => LENSES.filter((l) => l.key === k)[0];
T("x-ray is a registry fact (v224: absorbed into supports): design inherent, presentation modifier, sheets silent", () => {
  if (lens("design")?.supports?.xray !== "inherent") throw new Error("design not inherent");
  if (lens("customer")?.supports?.xray !== "modifier") throw new Error("presentation not modifier");
  if (lens("production")?.supports?.xray !== undefined) throw new Error("production should be silent until its renderer honors x-ray");
});
T("the caption: delta and counts, zeros silent, nothing at all honestly said", () => {
  const money = (n: number) => "$" + n;
  const out = formatVersionDiff({ added: [1, 2], removed: [], changed: [1], totalA: 100, totalB: 1350 }, money);
  if (out !== "+$1250 \u00b7 2 added \u00b7 1 changed") throw new Error(out);
  const down = formatVersionDiff({ added: [], removed: [1], changed: [], totalA: 500, totalB: 200 }, money);
  if (down !== "\u2212$300 \u00b7 1 removed") throw new Error(down);
  if (formatVersionDiff({ added: [], removed: [], changed: [], totalA: 9, totalB: 9 }, money) !== "No differences")
    throw new Error("empty diff not honest");
});
T("version keys ride the same choice rule: customer still the default; a v-key choice is honored while offered", () => {
  const opts = [{ key: "customer", label: "C" }, { key: "production", label: "P" }, { key: "v:abc", label: "v2" }];
  if (effectiveSheetChoice(null, opts) !== "customer") throw new Error("default drifted");
  if (effectiveSheetChoice("v:abc", opts) !== "v:abc") throw new Error("v-key not honored");
  if (effectiveSheetChoice("v:gone", [{ key: "customer", label: "C" }]) !== "customer") throw new Error("stale v-key honored");
});
console.log(`\nv218.craft: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
