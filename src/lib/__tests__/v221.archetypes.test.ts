// v221 — the pure claims: archetypes are well-formed, the curated grouping
// is ordered with General absorbing the unfiled, and the two rules compose
// (absence THEN grouping — a present type is absent from every group).
import { ARCHETYPES, archetype } from "../archetypes";
import { groupMomentTypes, availableMomentTypes, MOMENT_GROUP_ORDER } from "../moments";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
T("archetypes: unique keys; blank is truly blank; the grammars carry their outlines", () => {
  const keys: Record<string, true> = {};
  for (const a of ARCHETYPES) { if (keys[a.key]) throw new Error("dup " + a.key); keys[a.key] = true; }
  if (archetype("blank")!.sections.length !== 0) throw new Error("blank isn't blank");
  if (archetype("formal")!.sections[0] !== "Cocktail Hour") throw new Error("the timeline lost its opening");
  if (archetype("reception")!.sections.indexOf("Dinner") >= 0) throw new Error("continuous service grew a meal phase");
});
T("grouping: reading order held, empty groups absent, unfiled lands in General", () => {
  const g = groupMomentTypes([
    { id: "1", name: "Floral", active: true, category: "Presentation" },
    { id: "2", name: "Dinner", active: true, category: "Food" },
    { id: "3", name: "After Party", active: true },
    { id: "4", name: "Bogus", active: true, category: "NotAGroup" },
  ]);
  if (g.map((x) => x.group).join(",") !== "Food,Presentation,General") throw new Error(g.map((x) => x.group).join(","));
  if (g[2].types.map((t) => t.name).sort().join(",") !== "After Party,Bogus") throw new Error("General leaked");
  if (MOMENT_GROUP_ORDER[0] !== "Food") throw new Error("order drifted");
});
T("absence composes with grouping: a present type appears in NO group", () => {
  const g = groupMomentTypes(availableMomentTypes(
    [{ id: "1", name: "Dinner", active: true, category: "Food" },
     { id: "2", name: "Ceremony", active: true, category: "Event" }],
    [{ section_type_id: "1" }]));
  for (const grp of g) for (const t of grp.types) if (t.id === "1") throw new Error("present type offered");
  if (g.map((x) => x.group).join(",") !== "Event") throw new Error("wrong survivors");
});
console.log(`\nv221.archetypes: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
