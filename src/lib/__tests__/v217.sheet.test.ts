// v217 — the sheet-choice rule, pure (lifted from v214's region when the
// column retired; the Second Sheet inherits it verbatim).
import { fallbackSheetChoice, effectiveSheetChoice } from "../sheetChoice";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const opt = (k: string) => ({ key: k, label: k });
T("customer when offered — the pairing that earned the feature", () => {
  if (fallbackSheetChoice([opt("production"), opt("customer")]) !== "customer") throw new Error("not customer");
});
T("else the first offered; empty offer is null", () => {
  if (fallbackSheetChoice([opt("production")]) !== "production") throw new Error("not first");
  if (fallbackSheetChoice([]) !== null) throw new Error("not null");
});
T("a remembered choice grants no standing once the offer shrinks", () => {
  if (effectiveSheetChoice("production", [opt("customer")]) !== "customer") throw new Error("stale choice honored");
  if (effectiveSheetChoice("production", [opt("production"), opt("customer")]) !== "production") throw new Error("live choice ignored");
});
console.log(`\nv217.sheet: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
