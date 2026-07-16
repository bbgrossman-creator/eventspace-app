// ═══════════════════════════════════════════════════════════════════════════
// v201 — MOVE ENGINE TESTS
// Run: npx tsx --tsconfig tsconfig.test.json src/lib/__tests__/v201.moves.test.ts
//
// The properties that make the grammar a grammar:
//   whole-batch validation precedes any plan · boundaries are enforced at
//   validation · compounds expand against the seed and record parentage ·
//   describe() is the only language · divergence is state-vs-seed and
//   revert/redo collapses to the truth · logical-key recompute is stable.
// ═══════════════════════════════════════════════════════════════════════════
import {
  moveRegistry, registerMoveKind, planBatch, applyConfigMutations,
  registerConsequenceRule, recomputeConsequences, _resetConsequenceRulesForTests,
  computeDivergence, PlanCtx,
} from "../moves/registry";
import { registerCoreMoves } from "../moves/core";
import { emptyConfig, viewOf, MoveProposal, ConfigV1 } from "../moves/types";
import { makeCan } from "../featureCapabilities";

let pass = 0, fail = 0;
const t = (name: string, fn: () => void) => {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n    ${(e as Error).message}`); }
};
const throws = (fn: () => void, contains: string) => {
  try { fn(); } catch (e) {
    if (!(e as Error).message.includes(contains)) throw new Error(`threw "${(e as Error).message}" (wanted "${contains}")`);
    return;
  }
  throw new Error(`expected throw containing "${contains}"`);
};
const eq = (a: unknown, b: unknown, what = "") => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};

moveRegistry._resetForTests();
registerCoreMoves();
const allCan = makeCan("all");
const seed: PlanCtx["seed"] = {
  schemes: { black_slate: { id: "black_slate", label: "Black Slate",
    sets: { choices: { linen: "dark", vessels: "ceramic" } } } },
  scalars: { pieces: { value: 240, overridden: false, derivation: { formula: "180 × 8 ÷ 6", suggested: 240 } } },
  choices: { service: "attended" },
};
const ctx = (c: ConfigV1): PlanCtx => ({ view: viewOf(c), seed });
const P = (kind: string, payload: unknown): MoveProposal =>
  ({ kind, instanceId: "i1", payload, origin: "facet" });

console.log("registration discipline");
t("duplicate kind refused", () => throws(() => registerCoreMoves(), "already registered"));
t("layer-scoped kind may only declare layer:self", () =>
  throws(() => registerMoveKind({
    kind: "kitchen.escape", capability: "x", boundaries: ["config"],
    schema: { parse: (i) => i }, plan: () => [], describe: () => "",
  }), 'may only declare "layer:self"'));

console.log("boundary enforcement (Rev B change 3)");
t("a kind whose plan crosses its declared boundary is refused before any transaction", () => {
  registerMoveKind<{ layerKey: string }>({
    kind: "kitchen.rogue", capability: "production.kitchen", boundaries: ["layer:self"],
    schema: { parse: (i) => i as { layerKey: string } },
    plan: () => [{ boundary: "config", mutation: { op: "set_choice", key: "x", value: "y" } }],
    describe: () => "rogue",
  });
  throws(() => planBatch([P("kitchen.rogue", { layerKey: "kitchen" })], ctx(emptyConfig()), allCan),
    "crossed its boundary");
});
t("a layer-scoped mutation targeting another layer is refused", () => {
  registerMoveKind<{ layerKey: string }>({
    kind: "kitchen.sneaky", capability: "production.kitchen", boundaries: ["layer:self"],
    schema: { parse: (i) => i as { layerKey: string } },
    plan: () => [{ boundary: "layer:self", layerKey: "warehouse", mutation: {} }],
    describe: () => "sneaky",
  });
  throws(() => planBatch([P("kitchen.sneaky", { layerKey: "kitchen" })], ctx(emptyConfig()), allCan),
    "targeted a different layer");
});

console.log("whole-batch validation before any plan (atomicity, planner tier)");
t("one bad child in a batch of good moves yields NO plan at all", () =>
  throws(() => planBatch([
    P("set_choice", { key: "service", value: "live_chef" }),
    P("set_scalar", { key: "pieces", value: "not-a-number" }),
  ], ctx(emptyConfig()), allCan), "must be a finite number"));
t("missing capability refuses the whole batch", () =>
  throws(() => planBatch([P("set_choice", { key: "s", value: "v" })], ctx(emptyConfig()),
    makeCan(new Set(["library.search"]))), 'capability "proposal.configure" not available'));
t("unknown kind refused", () =>
  throws(() => planBatch([P("teleport", {})], ctx(emptyConfig()), allCan), "not registered"));

console.log("compound expansion (schemes)");
t("apply_scheme expands against the SEED, children carry parentIx and scheme origin", () => {
  const b = planBatch([{ ...P("apply_scheme", { schemeId: "black_slate" }), origin: "scheme" }], ctx(emptyConfig()), allCan);
  eq(b.proposals.length, 3, "1 parent + 2 children");
  eq(b.proposals[1].parentIx, 0, "child parentage");
  eq(b.proposals[1].origin, "scheme", "child origin");
});
t("unknown scheme refused (validated against the copied seed, never the live definition)", () =>
  throws(() => planBatch([P("apply_scheme", { schemeId: "acrylic" })], ctx(emptyConfig()), allCan),
    'not in this instance\'s seed'));
t("scheme children set choices without marking customized; operator edits mark it", () => {
  const b = planBatch([P("apply_scheme", { schemeId: "black_slate" })], ctx(emptyConfig()), allCan);
  let c = applyConfigMutations(emptyConfig(), b.mutations);
  eq(c.choices.linen, "dark", "scheme applied");
  eq(c.schemeId, "black_slate", "the PARENT's mutation applied (set_scheme)");
  eq(c.customized, [], "scheme does not customize");
  const edit = planBatch([P("set_choice", { key: "linen", value: "ivory" })], ctx(c), allCan);
  c = applyConfigMutations(c, edit.mutations);
  eq(c.customized, ["choice:linen"], "operator edit marks customized");
});

console.log("describe() is the only diff language");
t("batch descriptions come from describe(), business-worded", () => {
  const b = planBatch([P("set_choice", { key: "service_style", value: "live_chef" })], ctx(emptyConfig()), allCan);
  eq(b.descriptions[0], "service style → live chef");
});

console.log("divergence: deterministic state-vs-seed (Rev B change 1)");
t("revert-and-redo collapses to ONE line (the diff wins over the log)", () => {
  let c = emptyConfig();
  const step = (kind: string, payload: unknown) => {
    c = applyConfigMutations(c, planBatch([P(kind, payload)], ctx(c), allCan).mutations);
  };
  step("set_choice", { key: "service", value: "live_chef" });
  step("set_choice", { key: "service", value: "attended" });   // revert (= seed value)
  step("set_choice", { key: "service", value: "live_chef" });  // redo — 3 moves total
  const d = computeDivergence(c, seed).filter((l) => l.dimension === "choice:service");
  eq(d.length, 1, "one line for three moves");
  eq(d[0].text, "service: attended → live_chef");
});
t("scalar override shows its work; clear_override returns to suggestion", () => {
  let c = emptyConfig();
  c.scalars.pieces = { ...seed.scalars.pieces };
  c = applyConfigMutations(c, planBatch([P("set_scalar", { key: "pieces", value: 300 })], ctx(c), allCan).mutations);
  const d = computeDivergence(c, seed).find((l) => l.dimension === "scalar:pieces")!;
  eq(d.text, "pieces: you set 300 · suggested 240");
  c = applyConfigMutations(c, planBatch([P("clear_override", { key: "pieces" })], ctx(c), allCan).mutations);
  eq(c.scalars.pieces.value, 240, "back to suggested");
  eq(computeDivergence(c, seed).some((l) => l.dimension === "scalar:pieces"), false, "no divergence line");
});

console.log("consequence recompute: ONE choice, MANY layers (each owning its reaction)");
t("live_chef fans into kitchen, warehouse, and staffing — each layer's own rule, each row its own layer_key", () => {
  _resetConsequenceRulesForTests();
  const ifLive = (v: { choice: (k: string) => string | undefined }) => v.choice("service") === "live_chef";
  registerConsequenceRule("kitchen", (v) => ifLive(v)
    ? [{ layerKey: "kitchen", logicalKey: "kitchen.live_chef.handwash_station", name: "Handwash station", category: "equipment" },
       { layerKey: "kitchen", logicalKey: "kitchen.live_chef.prep_table", name: "Prep table", category: "equipment" }] : []);
  registerConsequenceRule("warehouse", (v) => ifLive(v)
    ? [{ layerKey: "warehouse", logicalKey: "warehouse.live_chef.chef_station_kit", name: "Chef station kit", category: "rental" }] : []);
  registerConsequenceRule("staffing", (v) => ifLive(v)
    ? [{ layerKey: "staffing", logicalKey: "staffing.live_chef.sushi_chef", name: "Sushi chef", category: "staff" }] : []);
  let c = emptyConfig();
  eq(recomputeConsequences(c).length, 0, "no live chef, no fan-out");
  c = applyConfigMutations(c, planBatch([P("set_choice", { key: "service", value: "live_chef" })], ctx(c), allCan).mutations);
  const out = recomputeConsequences(c);
  eq(out.map((d) => d.layerKey).sort(), ["kitchen", "kitchen", "staffing", "warehouse"], "rows span three layers");
  eq(out.every((d) => d.logicalKey.startsWith(d.layerKey + ".")), true, "keys namespaced per layer");
});
t("a rule emitting into a FOREIGN layer is refused (kitchen cannot write warehouse's domain)", () => {
  _resetConsequenceRulesForTests();
  registerConsequenceRule("kitchen", () =>
    [{ layerKey: "warehouse", logicalKey: "warehouse.sneaky.thing", name: "sneak", category: "rental" }]);
  throws(() => recomputeConsequences(emptyConfig()), 'emitted into "warehouse"');
});
t("duplicate logical keys across rules are refused; foreign-namespaced keys are refused", () => {
  _resetConsequenceRulesForTests();
  registerConsequenceRule("kitchen", () =>
    [{ layerKey: "kitchen", logicalKey: "kitchen.base.tongs", name: "Tongs", category: "supply" }]);
  registerConsequenceRule("kitchen", () =>
    [{ layerKey: "kitchen", logicalKey: "kitchen.base.tongs", name: "dupe", category: "supply" }]);
  throws(() => recomputeConsequences(emptyConfig()), "duplicate logical key");
  _resetConsequenceRulesForTests();
  registerConsequenceRule("kitchen", () =>
    [{ layerKey: "kitchen", logicalKey: "base.tongs", name: "Tongs", category: "supply" }]);
  throws(() => recomputeConsequences(emptyConfig()), "namespaced under its layer");
});

console.log("invert foundations (not undo — the foundation)");
t("suppress inverts to restore; set_choice inverts to the prior value", () => {
  const sup = moveRegistry.get("suppress_requirement")!;
  const inv = sup.invert!({ layerKey: "kitchen", logicalKey: "k.x.y" }, viewOf(emptyConfig()))!;
  eq(inv.kind, "restore_requirement");
  const sc = moveRegistry.get("set_choice")!;
  const c = applyConfigMutations(emptyConfig(),
    planBatch([P("set_choice", { key: "service", value: "attended" })], ctx(emptyConfig()), allCan).mutations);
  const inv2 = sc.invert!({ key: "service", value: "live_chef" }, viewOf(c))!;
  eq((inv2.payload as { value: string }).value, "attended");
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
