// v212 unit suite — the Production projection's pure core (SPEC-003 §2, §3).
// The agnosticism proof is the advisory's ownership-chain criterion at the
// unit tier: the skeleton composes a FIXTURE layer it has never heard of,
// through that layer's own contribution — nothing in the composer knows
// kitchen from anything else.
import { composeForLayer, composeProductionModel, ProductionInputs } from "../productionLens";
import { registerKitchenLayer } from "../layers/kitchen";
import { layerRegistry, registerLayer } from "../layers/registry";

let passed = 0, failed = 0;
function eq(a: unknown, b: unknown, msg: string) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) { passed++; } else { failed++; console.log(`FAIL ${msg}\n  got ${A}\n  want ${B}`); }
}

layerRegistry._resetForTests();
registerKitchenLayer();

const base = (over: Partial<ProductionInputs["components"][number]> = {}): ProductionInputs => ({
  booking: { title: "Goldberg Wedding", eventDate: "2026-08-22", estGuests: 180 },
  locked: false, evidence: false,
  components: [{
    id: "c1", title: "Sushi Station",
    config: { schemeId: null, customized: [],
      scalars: { pieces: { value: 300, overridden: true,
        derivation: { formula: "180 × 8 ÷ 6", suggested: 240 } } },
      choices: {}, display: {}, substitutions: {} },
    baselineProvenance: "instantiation_stamp",
    requirements: [
      { layerKey: "kitchen", logicalKey: "kitchen.live_chef.handwash_station",
        name: "Handwash", category: "equipment", notes: null, derived: true, suppressedAt: null },
      { layerKey: "kitchen", logicalKey: "kitchen.live_chef.prep_table",
        name: "Prep table", category: "equipment", notes: null, derived: true, suppressedAt: "t" },
      { layerKey: "warehouse", logicalKey: "warehouse.x.y",
        name: "Kit", category: null, notes: null, derived: true, suppressedAt: null },
    ],
    layer: { schemaVersion: 1, data: { requirements: [], equipment: [],
      staffing: [{ role: "Chef", count: 2 }], prepNotes: null } },
    annotation: "note",
    ...over,
  }],
});

// 1 — overridden scalar carries value, flag, and the full why
const m1 = composeProductionModel(base());
eq(m1.components[0].quantities[0],
  { key: "pieces", value: 300, overridden: true,
    why: "you set 300 · suggested 240 (180 × 8 ÷ 6)" },
  "override why carries suggestion and formula (§2 rule 3)");

// 2 — layer filter: only the lens's key; suppressed present with suppressed=true
eq(m1.components[0].requirements.map((r) => [r.name, r.suppressed]),
  [["Handwash", false], ["Prep table", true]],
  "kitchen rows only; suppressed included, struck-not-hidden is the renderer's job");
eq(m1.components[0].requirements[0].why, "from live chef", "derived cause from the logical key");

// 3 — sections arrive from the registration; provenance label resolves
eq(m1.components[0].sections.map((s) => s.id),
  ["kitchen.staffing", "kitchen.requirements", "kitchen.equipment", "kitchen.notes"],
  "registration-owned section ids");
eq(m1.components[0].provenanceLabel, "vs. definition at instantiation", "Rev E label");

// 4 — honest absence: no layer row
const m2 = composeProductionModel(base({ layer: null }));
eq(m2.components[0].sections, [], "no sections without a layer");
eq(m2.components[0].missingLayer?.includes("nothing was copied"), true, "absence states itself");

// 5 — evidence and lock produce the honesty band
eq(composeForLayer("kitchen", { ...base(), evidence: true }).honesty,
  { readOnly: true, reason: "Historical event — production reads as it was." },
  "evidence honesty");
eq(composeForLayer("kitchen", { ...base(), locked: true }).honesty.readOnly, true, "lock honesty");

// 6 — THE AGNOSTICISM PROOF: a fixture layer the composer never heard of,
// rendered through its own contribution — the ownership chain, generic.
registerLayer<{ crates: number }>({
  key: "fixturelayer", capability: "test.fixture", schemaVersion: 1,
  schema: { parse: (x) => x as { crates: number } }, migrations: {},
  emptyState: () => ({ crates: 0 }), label: { singular: "Fixture", icon: "□" },
  lens: { sections: (p, ctx) => [{ id: "fixturelayer.crates", title: "Crates",
    rows: [{ label: "crates", value: String(p.crates),
      why: ctx.guests !== null ? `for ${ctx.guests} guests` : undefined }] }] },
});
const m3 = composeForLayer("fixturelayer", base({
  layer: { schemaVersion: 1, data: { crates: 7 } },
  requirements: [{ layerKey: "fixturelayer", logicalKey: "fixturelayer.a.b",
    name: "Strap", category: null, notes: null, derived: true, suppressedAt: null }],
}));
eq(m3.components[0].sections[0].rows[0], { label: "crates", value: "7", why: "for 180 guests" },
  "the skeleton composes an unknown layer through ITS contribution — kitchen-agnostic");
eq(m3.components[0].requirements.map((r) => r.name), ["Strap"],
  "requirement filtering follows the parameter, not a hardcoded key");

// 7 — unregistered key: honest, never a throw, never a simulation
const m4 = composeForLayer("ghost", base());
eq(m4.components[0].missingLayer?.includes("not registered"), true,
  "unregistered layer reported, not simulated (Track 0 honesty)");

console.log(`v212.production: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`v212.production: ${failed} failed`);
