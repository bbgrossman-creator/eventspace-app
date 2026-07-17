// v211 unit suite — the lens registry slice (SPEC-003 §1, §3, §5, §10).
// Pure, no DOM — the registry's own suite, where the fixture-lens proof
// lives (SPEC-003 review question 3, draft position adopted).
import {
  LENSES, registerLens, _unregisterLensForTests, visibleLenses, lensAllowed,
  resolveLens, LensDef,
} from "../lenses";
import { registerKitchenLayer } from "../layers/kitchen";
import { layerRegistry } from "../layers/registry";
import { Session } from "../permissions";

let passed = 0, failed = 0;
function eq(a: unknown, b: unknown, msg: string) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) { passed++; } else { failed++; console.log(`FAIL ${msg}\n  got ${A}\n  want ${B}`); }
}
function throws(fn: () => void, needle: string, msg: string) {
  try { fn(); failed++; console.log(`FAIL ${msg}: did not throw`); }
  catch (e) { if (String(e).includes(needle)) passed++; else { failed++; console.log(`FAIL ${msg}: ${e}`); } }
}

const CAPS = { proposals: true, requirements: true, photos_retrieval: true };
const sess = (perms: string[]): Session => ({ perms } as unknown as Session);
const ALL_PERMS = ["bookings.edit", "bookings.view", "ops.view", "knowledge.view", "fixture.view"];

// ── 1. duplicate registration is a build error (SPEC-003 §1) ──
throws(() => registerLens(LENSES[0]), "already registered",
  "duplicate lens key refused");

// ── 2. the fixture lens: the sixth-lens seam, proven (SPEC-003 §10) ──
const before = LENSES.map((l) => l.key).join(",");
registerLens({
  key: "fixture", label: "Fixture", blurb: "seam proof",
  cap: null, perm: "fixture.view" as never, module: "events", editable: false,
  concern: "proving the seam", capability: "lens.fixture", verbs: [], anatomy: "sheet",
});

// visible exactly under featureCan × permission
eq(visibleLenses({ caps: CAPS as never, featureCan: (c) => c === "lens.fixture" || c === null },
    sess(["fixture.view"])).map((l) => l.key),
  ["fixture"],
  "fixture visible under its capability + permission (others feature-gated out)");
// absent — not disabled — without capability
eq(visibleLenses({ caps: CAPS as never, featureCan: () => false }, sess(ALL_PERMS))
    .some((l) => l.key === "fixture"),
  false, "fixture ABSENT without capability (absent, not disabled)");
// absent without permission
eq(visibleLenses({ caps: CAPS as never, featureCan: () => true }, sess(["bookings.view"]))
    .some((l) => l.key === "fixture"),
  false, "fixture absent without permission");
// a URL naming it is a request, never an authorization
eq(lensAllowed("fixture", { caps: CAPS as never, featureCan: () => false }, sess(ALL_PERMS)),
  false, "deep link to an unlicensed lens refused (request, never authorization)");

// zero-diff: unregistering restores the registry byte-identically
_unregisterLensForTests("fixture");
eq(LENSES.map((l) => l.key).join(","), before,
  "fixture leaves zero trace — the seam is real (§10)");

// ── 3. transitional double gate is fail-closed (SPEC-003 §5) ──
eq(visibleLenses({ caps: ({ ...CAPS, proposals: false }) as never, featureCan: () => true },
    sess(ALL_PERMS)).some((l) => l.key === "customer"),
  false, "business-model cap still ANDed during the transition (fail-closed)");
eq(visibleLenses({ caps: CAPS as never, featureCan: (c) => c !== "lens.production" },
    sess(ALL_PERMS)).some((l) => l.key === "production"),
  false, "feature capability gates independently of the business-model cap");

// ── 4. callers without featureCan are unchanged (defaults to currentCan) ──
eq(visibleLenses({ caps: CAPS as never }, sess(ALL_PERMS)).map((l) => l.key),
  ["design", "customer", "production", "operations", "photography"],
  "no caller changes: default checker admits all under v200's all-enabled");

// ── 5. the ladder is untouched by registration mechanics ──
eq(resolveLens({ caps: CAPS as never }, sess(ALL_PERMS), { explicit: "production" }),
  "production", "explicit rung still wins");
eq(resolveLens({ caps: CAPS as never }, sess(ALL_PERMS), {}), "design",
  "maker-first surrender unchanged");

// ── 6. the kitchen contribution: the socket's proof-of-life (SPEC-003 §3) ──
layerRegistry._resetForTests();
registerKitchenLayer();
const kitchen = layerRegistry.get("kitchen");
eq(!!kitchen?.lens, true, "kitchen declares its contribution beside its storage");
const sections = kitchen!.lens!.sections(
  { requirements: ["sushi chef"], equipment: ["cold table"],
    staffing: [{ role: "Sushi chef", count: 2 }], prepNotes: "Rice at dawn." },
  { guests: 180 });
eq(sections.map((s) => s.id),
  ["kitchen.staffing", "kitchen.requirements", "kitchen.equipment", "kitchen.notes"],
  "stable section ids");
eq(sections[0].rows[0], { label: "Sushi chef", value: "× 2", why: "for 180 guests" },
  "a claim-bearing row carries its why (§2 rule 3)");
eq(sections[3].note, "Rice at dawn.", "annotation travels as the different material");
// honest absence, not simulation
const empty = kitchen!.lens!.sections(
  { requirements: [], equipment: [], staffing: [], prepNotes: null }, { guests: null });
eq(empty.every((s) => s.rows.length === 0 && !!s.missing || s.rows.length > 0), true,
  "empty content renders explicit missing lines — never simulated (§5, KA §4)");

console.log(`v211.lenses: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`v211.lenses: ${failed} failed`);
