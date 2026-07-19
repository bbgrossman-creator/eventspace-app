// v224 — LENS CAPABILITIES (PUBLICATION §5): the declarations are registry
// facts; chrome asks lensEdits, never a name; structure and content belong
// to Design everywhere and always (§0.2); the Presentation lens edits
// presentation ONLY.
import { LENSES, lensEdits } from "../lenses";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const lens = (k: string) => LENSES.filter((l) => l.key === k)[0];
T("Design owns structure, content, pricing — and edits no presentation", () => {
  const d = lens("design");
  if (!lensEdits(d, "structure") || !lensEdits(d, "content") || !lensEdits(d, "pricing"))
    throw new Error("Design lost its layers");
  if (lensEdits(d, "presentation")) throw new Error("Design edits presentation — the layers leaked");
});
T("the Presentation lens edits presentation ONLY — never structure, content, or pricing (§0.2)", () => {
  const c = lens("customer");
  if (c.label !== "Presentation") throw new Error(`label: ${c.label} — the vocabulary decision didn't land`);
  if (!lensEdits(c, "presentation")) throw new Error("Presentation can't edit presentation");
  if (lensEdits(c, "structure") || lensEdits(c, "content") || lensEdits(c, "pricing"))
    throw new Error("the Presentation lens reached into Design's layers");
  if (c.supports?.print !== true || c.supports?.compare !== true) throw new Error("supports incomplete");
});
T("sheet lenses are read-only citizens; absent declarations mean NO", () => {
  const k = lens("production");
  if (k.edits !== undefined) throw new Error("Kitchen edits something");
  if (k.supports?.print !== true) throw new Error("Kitchen must print");
  if (lensEdits(k, "content") || lensEdits(undefined, "content") || lensEdits(null, "pricing"))
    throw new Error("absence didn't mean no");
});
console.log(`\nv224.capabilities: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
