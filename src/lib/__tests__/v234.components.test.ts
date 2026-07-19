// v234 — Component Treatments' pure claims: per-identity resolution through
// the rungs; §0.2 holds (nothing hides content); comp: photo slots are
// isolated from section slots even under a raw-id collision.
import {
  resolveTheme, effectiveComponentTreatment, mergeDelta, COMPONENT_TREATMENT_OPTIONS,
} from "../publication";
import { pinPhoto, pinnedFor, unpinPhoto, PhotoRecord } from "../photos";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
T("component dress resolves per identity through the rungs; untouched components wear the defaults", () => {
  const { theme } = resolveTheme(
    { treatments: { components: { c1: { title: "caps", price: "muted" } } } }, null,
    { treatments: { components: { c1: { price: "tabular" } } } });
  const c1 = effectiveComponentTreatment(theme, "c1");
  if (c1.title !== "caps") throw new Error("brand rung lost");
  if (c1.price !== "tabular") throw new Error("override didn't beat brand per leaf");
  if (c1.description !== "standard" || c1.photo !== "side") throw new Error("defaults lost");
  const c9 = effectiveComponentTreatment(theme, "never");
  if (c9.title !== "standard") throw new Error("untouched identity dressed up");
  const merged = mergeDelta({ treatments: { components: { c2: { title: "accent" } } } },
    { treatments: { components: { c1: { description: "italic" } } } });
  if (merged.treatments?.components?.c2?.title !== "accent") throw new Error("sibling component disturbed");
});
T("§0.2 SURVIVES the component toolbar: no option hides content — description and price re-dress, never remove", () => {
  for (const g of COMPONENT_TREATMENT_OPTIONS) {
    for (const o of g.options) {
      if (["hidden", "hide", "off", "remove"].indexOf(o.value) >= 0)
        throw new Error(`${g.key}:${o.value} lets presentation decide existence`);
    }
  }
});
T("comp: photo slots are isolated — the same raw id pins independently as section and component", () => {
  const ph: PhotoRecord = { id: "p", url: "u", label: "L", tags: [] };
  const pins = pinPhoto(pinPhoto(null, "xyz", ph), "comp:xyz", { ...ph, id: "p2", url: "u2" });
  if (pinnedFor(pins, "xyz")?.url !== "u" || pinnedFor(pins, "comp:xyz")?.url !== "u2")
    throw new Error("namespaces collided");
  const un = unpinPhoto(pins, "comp:xyz");
  if (pinnedFor(un, "xyz") === null) throw new Error("unpinning the component took the section's photo");
  if (pinnedFor(un, "comp:xyz") !== null) throw new Error("comp unpin failed");
});
console.log(`\nv234.components: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
