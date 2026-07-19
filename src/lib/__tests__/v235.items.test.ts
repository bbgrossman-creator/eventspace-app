// v235 — Item Treatments' pure claims: the item-run identity resolves through
// the rungs; defaults preserve today's paper exactly; layout "inherit"
// defers to Design; nothing hides an item.
import {
  resolveTheme, effectiveItemTreatment, mergeDelta,
  ITEM_TREATMENT_OPTIONS, ITEM_TREATMENT_DEFAULTS, BULLET_CHARS,
} from "../publication";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
T("item dress resolves per component identity through the rungs; defaults preserve today's paper", () => {
  if (ITEM_TREATMENT_DEFAULTS.bullet !== "dot" || ITEM_TREATMENT_DEFAULTS.layout !== "inherit")
    throw new Error("defaults drifted — existing papers would change");
  if (BULLET_CHARS.dot !== "\u00b7") throw new Error("the default bullet isn't today's middot");
  const { theme } = resolveTheme(
    { treatments: { items: { c1: { bullet: "diamond", emphasis: "subtle" } } } }, null,
    { treatments: { items: { c1: { emphasis: "strong" } } } });
  const c1 = effectiveItemTreatment(theme, "c1");
  if (c1.bullet !== "diamond") throw new Error("brand rung lost");
  if (c1.emphasis !== "strong") throw new Error("override didn't beat brand per leaf");
  if (c1.layout !== "inherit" || c1.heading !== "standard") throw new Error("defaults lost");
  if (effectiveItemTreatment(theme, "other").bullet !== "dot") throw new Error("untouched run dressed up");
  const merged = mergeDelta({ treatments: { items: { c2: { bullet: "dash" } } } },
    { treatments: { items: { c1: { layout: "comma" } } } });
  if (merged.treatments?.items?.c2?.bullet !== "dash") throw new Error("sibling run disturbed");
});
T("§0.2 holds at the smallest scale: no option hides an item; 'inherit' keeps Design's layout authority", () => {
  for (const g of ITEM_TREATMENT_OPTIONS) {
    for (const o of g.options)
      if (["hidden", "hide", "off", "remove"].indexOf(o.value) >= 0)
        throw new Error(`${g.key}:${o.value} lets presentation decide existence`);
  }
  const lay = ITEM_TREATMENT_OPTIONS.filter((g) => g.key === "layout")[0];
  if (!lay.options.some((o) => o.value === "inherit")) throw new Error("Design's layout authority lost");
  for (const b of Object.keys(BULLET_CHARS)) {
    if (!ITEM_TREATMENT_OPTIONS.filter((g) => g.key === "bullet")[0].options.some((o) => o.value === b))
      throw new Error("bullet char " + b + " unreachable from the registry");
  }
});
console.log(`\nv235.items: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
