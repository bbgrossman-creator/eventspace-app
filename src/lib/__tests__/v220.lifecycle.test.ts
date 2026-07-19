// v220 — EMPTY-IS-INFORMATION at the model layer: buildDesignStage renders
// an empty section as a chapter (the fix for "＋ section appeared to lie"),
// and orphan handling is unchanged.
import { buildDesignStage } from "../designStageModel";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
T("an empty section RENDERS as a chapter — availability never depends on content", () => {
  const ch = buildDesignStage([], [], [{ id: "s1", name: "Dinner" }], () => null);
  if (ch.length !== 1) throw new Error(`${ch.length} chapters`);
  if (ch[0].id !== "s1" || ch[0].name !== "Dinner") throw new Error(JSON.stringify(ch[0]));
  if (ch[0].components.length !== 0) throw new Error("phantom components");
  if (ch[0].subtotal !== null) throw new Error("an empty chapter claimed a subtotal");
});
T("populated sections and orphans are untouched by the fix", () => {
  const comps = [
    { id: "c1", title: "Sushi", position: 0, section_type_id: "s1", pricing_mode: "itemized",
      package_price: null, package_basis: null, package_price_confirmed: true,
      proposal_display: null, item_categories: [], item_layout: null },
    { id: "c2", title: "Stray", position: 1, section_type_id: null, pricing_mode: "itemized",
      package_price: null, package_basis: null, package_price_confirmed: true,
      proposal_display: null, item_categories: [], item_layout: null },
  ] as Parameters<typeof buildDesignStage>[0];
  const ch = buildDesignStage(comps, [], [{ id: "s1", name: "Cocktail" }, { id: "s2", name: "Dinner" }], () => 100);
  if (ch.map((x) => x.id).join(",") !== "s1,s2,__none__") throw new Error(ch.map((x) => x.id).join(","));
  if (ch[0].components.length !== 1 || ch[1].components.length !== 0 || ch[2].components.length !== 1)
    throw new Error("membership drifted");
});
console.log(`\nv220.lifecycle: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
