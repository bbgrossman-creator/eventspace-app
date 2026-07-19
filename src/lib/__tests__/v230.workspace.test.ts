// v230 — Selection Capabilities are registry facts (§6.6): the Presentation
// lens declares what the paper lets you select; absence means no.
import { LENSES, lensSelects } from "../lenses";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const lens = (k: string) => LENSES.filter((l) => l.key === k)[0];
T("the Presentation lens selects document + section + component (v234); ITEM still waits for its treatments", () => {
  const c = lens("customer");
  if (!lensSelects(c, "document") || !lensSelects(c, "section") || !lensSelects(c, "component"))
    throw new Error("selection lost");
  if ((c.selects as Record<string, unknown>).item) throw new Error("item selection declared before its treatments exist — a dead click");
});
T("no other lens declares presentation selection; absence means NO", () => {
  for (const l of LENSES) if (l.key !== "customer" && l.selects !== undefined)
    throw new Error(`${l.key} grew presentation selection`);
  if (lensSelects(lens("design"), "section") || lensSelects(undefined, "document"))
    throw new Error("absence didn't mean no");
});
console.log(`\nv230.workspace: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
