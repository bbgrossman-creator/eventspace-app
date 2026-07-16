// ═══════════════════════════════════════════════════════════════════════════
// v200 — LAYER REGISTRY TESTS
// Run:  npx tsx --tsconfig tsconfig.test.json src/lib/__tests__/v200.registry.test.ts
//
// What must be true for the foundation to be a foundation:
//   the write gate refuses unknown keys, bad payloads, and missing
//   capabilities; the read path upgrades old revisions lazily; duplicate
//   registration is an error; available() is the capability intersection;
//   and the kitchen proof-of-life passes through all of it.
// ═══════════════════════════════════════════════════════════════════════════
import {
  layerRegistry, registerLayer, validateLayerWrite, upgradeLayerData,
  LayerValidationError, Validator,
} from "../layers/registry";
import { registerKitchenLayer, KitchenLayerV1 } from "../layers/kitchen";
import { makeCan, TIER_BUNDLES } from "../featureCapabilities";

let pass = 0, fail = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n    ${(e as Error).message}`); }
}
function expectThrow(fn: () => void, contains: string) {
  try { fn(); } catch (e) {
    const m = (e as Error).message;
    if (!m.includes(contains)) throw new Error(`threw, but "${m}" lacks "${contains}"`);
    return;
  }
  throw new Error(`expected throw containing "${contains}"`);
}
const eq = (a: unknown, b: unknown, what = "") => {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${what} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};

layerRegistry._resetForTests();
registerKitchenLayer();
const allCan = makeCan("all");

console.log("registration & the zero-diff property");
t("kitchen is registered with its declared capability", () => {
  const r = layerRegistry.get("kitchen")!;
  eq(r.capability, "production.kitchen", "capability");
  eq(r.schemaVersion, 1, "schemaVersion");
});
t("duplicate registration throws (no silent second owner of a schema)", () => {
  expectThrow(() => registerKitchenLayer(), "already registered");
});
t("non-snake-case keys are refused", () => {
  expectThrow(() => registerLayer({
    key: "Bad-Key", capability: "x", schemaVersion: 1,
    schema: { parse: (i) => i }, migrations: {}, emptyState: () => ({}),
    label: { singular: "X", icon: "x" },
  }), "snake_case");
});

console.log("the write gate (the ONLY insert path)");
t("valid kitchen payload passes and returns current schemaVersion", () => {
  const out = validateLayerWrite("kitchen",
    { requirements: ["sushi chef"], equipment: ["black slate"], staffing: [{ role: "chef", count: 2 }], prepNotes: null },
    allCan);
  eq(out.schemaVersion, 1, "version");
  eq((out.data as KitchenLayerV1).requirements, ["sushi chef"], "roundtrip");
});
t("the emptyState passes its own schema (a layer that can't be born empty is broken)", () => {
  const r = layerRegistry.get("kitchen")!;
  r.schema.parse(r.emptyState());
});
t("unknown layer key is refused", () => {
  expectThrow(() => validateLayerWrite("warehouse", {}, allCan), "not registered");
});
t("bad payload is refused with the field named", () => {
  expectThrow(() => validateLayerWrite("kitchen",
    { requirements: "not-an-array", equipment: [], staffing: [], prepNotes: null }, allCan),
    "requirements must be string[]");
});
t("unknown fields are refused (opaque payloads stay owned)", () => {
  expectThrow(() => validateLayerWrite("kitchen",
    { requirements: [], equipment: [], staffing: [], prepNotes: null, chefCount: 3 }, allCan),
    'unknown field "chefCount"');
});
t("negative staffing counts are refused", () => {
  expectThrow(() => validateLayerWrite("kitchen",
    { requirements: [], equipment: [], staffing: [{ role: "chef", count: -1 }], prepNotes: null }, allCan),
    "staffing");
});
t("missing capability is refused even with a valid payload", () => {
  const noKitchen = makeCan(new Set(["library.search"]));
  expectThrow(() => validateLayerWrite("kitchen",
    { requirements: [], equipment: [], staffing: [], prepNotes: null }, noKitchen),
    'capability "production.kitchen" not available');
});

console.log("capability intersection (KA §10)");
t("available() filters by capability", () => {
  eq(layerRegistry.available(makeCan(new Set(["production.kitchen"]))).map((r) => r.key), ["kitchen"]);
  eq(layerRegistry.available(makeCan(new Set(["library.search"]))).length, 0, "no kitchen cap");
  eq(layerRegistry.available(makeCan(new Set(["*"]))).map((r) => r.key), ["kitchen"], "wildcard");
});
t("tier bundles are data: professional has kitchen, starter does not", () => {
  eq(makeCan(new Set(TIER_BUNDLES.professional))("production.kitchen"), true);
  eq(makeCan(new Set(TIER_BUNDLES.starter))("production.kitchen"), false);
});

console.log("the lazy read-side upgrader");
t("a v1→v2 migration upgrades stored v1 rows on read", () => {
  layerRegistry._resetForTests();
  interface V2 { requirements: string[]; station: string | null }
  const v2schema: Validator<V2> = { parse(i) {
    const o = i as Record<string, unknown>;
    if (!Array.isArray(o.requirements)) throw new LayerValidationError("demo", "requirements");
    if (o.station !== null && typeof o.station !== "string") throw new LayerValidationError("demo", "station");
    return { requirements: o.requirements as string[], station: (o.station ?? null) as string | null };
  }};
  registerLayer<V2>({
    key: "demo", capability: "production.demo", schemaVersion: 2, schema: v2schema,
    migrations: { 1: (old) => ({ ...(old as object), station: null }) },
    emptyState: () => ({ requirements: [], station: null }),
    label: { singular: "Demo", icon: "•" },
  });
  const up = upgradeLayerData("demo", 1, { requirements: ["x"] });
  eq(up.schemaVersion, 2, "upgraded version");
  eq(up.data, { requirements: ["x"], station: null }, "migrated shape");
});
t("a stored version with no migration path is refused, not guessed", () => {
  expectThrow(() => upgradeLayerData("demo", 0, {}), "no migration from schema v0");
});

// restore real registrations for anything downstream
layerRegistry._resetForTests();
registerKitchenLayer();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
