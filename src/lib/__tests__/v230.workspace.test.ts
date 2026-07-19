// v230 — Selection Capabilities are registry facts (§6.6): the Presentation
// lens declares what the paper lets you select; absence means no.
import { LENSES, lensSelects } from "../lenses";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const lens = (k: string) => LENSES.filter((l) => l.key === k)[0];
T("the Presentation lens selects all four identities (v235 — every door is open, and each has furniture behind it)", () => {
  const c = lens("customer");
  for (const k of ["document", "section", "component", "item"] as const) {
    if (!lensSelects(c, k)) throw new Error(k + " selection lost");
  }
});
T("no other lens declares presentation selection; absence means NO", () => {
  for (const l of LENSES) if (l.key !== "customer" && l.selects !== undefined)
    throw new Error(`${l.key} grew presentation selection`);
  if (lensSelects(lens("design"), "section") || lensSelects(undefined, "document"))
    throw new Error("absence didn't mean no");
});
console.log(`\nv230.workspace: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
