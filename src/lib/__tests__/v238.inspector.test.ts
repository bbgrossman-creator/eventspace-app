// v238 — Inspector Unification's pure claims: one selection language,
// declaration-driven facets, zero lens conditionals in the Inspector.
import * as fs from "fs";
import { SELECTION, selectedStyle } from "../selection";
import { LENSES, LensDef } from "../lenses";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
T("ONE selection language: the object's bar and the wing's seam draw from the SAME token; selection never shifts layout", () => {
  const on = selectedStyle(true);
  if (!String(on.boxShadow).includes(SELECTION.accent)) throw new Error("the bar isn't the token");
  if (on.background !== SELECTION.wash) throw new Error("the wash isn't the token");
  if (String(on.boxShadow).indexOf("inset") !== 0) throw new Error("the bar shifts layout — must be inset");
  const region = fs.readFileSync("src/components/studio/InspectorRegion.tsx", "utf8");
  if (!region.includes("SELECTION.accent")) throw new Error("the wing's seam doesn't inherit the token");
  if (region.includes("#C9A34E")) throw new Error("the wing still speaks gold — two visual languages");
  const renderer = fs.readFileSync("src/components/ProposalRenderer.tsx", "utf8");
  if (renderer.includes('ring-2 ring-[#4A9EFF]/60')) throw new Error("the old selection ring survives in the renderer");
});
T("facet order is the LENS'S declaration: every content-editing lens declares inspects; the Inspector holds zero lens conditionals", () => {
  for (const l of LENSES as LensDef[]) {
    if (l.edits?.content && !l.inspects)
      throw new Error(`${l.key} edits content but declares no facet order — the Inspector would have to guess`);
  }
  const src = fs.readFileSync("src/components/studio/Inspector.tsx", "utf8");
  if (/lens\s*===|===\s*"design"|===\s*"customer"/.test(src))
    throw new Error("the Inspector consults lens names — order must come from the declaration alone");
  if (!src.includes("facetOrder")) throw new Error("the Inspector ignores the declaration");
});
console.log(`\nv238.inspector: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
