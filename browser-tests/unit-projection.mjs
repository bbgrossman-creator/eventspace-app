// v287c UNIT VERIFICATION — the PURE projection helpers (state.ts, labels.ts,
// client.ts validators), executed with no browser and no database.
//
// The repository has no configured test runner (`npm test` exits 1), so these
// assertions are written to be genuinely RUNNABLE rather than merely
// type-checked:
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/unit-projection.mjs
// It bundles the real TypeScript modules with esbuild and executes them in
// this process.
import esbuild from "esbuild";
import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const aliasPlugin = { name: "alias", setup(b) {
  b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: join(here, "mock-supabase.ts") }));
  b.onResolve({ filter: /^@\// }, (a) => {
    const base = join(root, "src", a.path.slice(2));
    for (const ext of [".tsx", ".ts", ".js", "/index.ts"]) if (existsSync(base + ext)) return { path: base + ext };
    return { path: base };
  });
}};

const built = await esbuild.build({
  stdin: {
    contents: `
      export * from "@/lib/projection/state";
      export * from "@/lib/projection/labels";
      export { assertEnvelope, normalizeRefusal, toFilter } from "@/lib/projection/client";
      export { isEnvelopeLike, RESPONSIBILITY_STATES } from "@/lib/projection/types";
    `,
    resolveDir: root, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, write: false, format: "esm", platform: "neutral",
  define: { "process.env.NODE_ENV": '"test"' },
  plugins: [aliasPlugin], logLevel: "silent",
});
const mod = await import("data:text/javascript;base64," +
  Buffer.from(built.outputFiles[0].text).toString("base64"));

let passed = 0, failed = 0;
const T = (name, fn) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m ?? ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

const row = (id, dept, state, owner, ord) => ({
  responsibility: id, scope: "event", event_ref: "ev-1", department: dept, kind: "k",
  required_outcome: `outcome ${id}`, resource_role: null, owner, state,
  timing: null, risk: { lapse_soon: false, exceptions: 0, unowned: owner === null },
  exceptions: 0, natural_key: `nk-${id}`, ordering_key: ord,
});
const ROWS = [
  row("r1", "equipment", "lapsed", "moshe", "0|a"),
  row("r2", "culinary", "active", "moshe", "2|b"),
  row("r3", "logistics", "derived", null, "3|c"),
  row("r4", "staffing", "standing", "dovid", "4|d"),
];

// ── state helpers ─────────────────────────────────────────────────────────
T("U-1 every constitutional state has a distinct glyph", () => {
  const glyphs = mod.RESPONSIBILITY_STATES.map((s) => mod.stateGlyph(s));
  eq(new Set(glyphs).size, mod.RESPONSIBILITY_STATES.length, "glyphs collide");
});
T("U-2 state presentation is total over the seven and never throws", () => {
  for (const s of mod.RESPONSIBILITY_STATES) {
    const p = mod.statePresentation(s);
    if (!p.glyph || !p.className || !p.tone) throw new Error(`incomplete presentation for ${s}`);
  }
});
T("U-3 a value outside the seven is rejected by the state guard", () => {
  eq(mod.isResponsibilityState("active"), true);
  eq(mod.isResponsibilityState("blocked"), false, "v275 vocabulary must not validate");
  eq(mod.isResponsibilityState("exception"), false);
  eq(mod.isResponsibilityState("invalidated"), false);
});
T("U-4 sorting never changes membership", () => {
  const base = ROWS.map((r) => r.responsibility).sort().join(",");
  for (const m of ["projection", "state", "department", "owner", "outcome"]) {
    const got = mod.sortRows(ROWS, m).map((r) => r.responsibility).sort().join(",");
    eq(got, base, `sort ${m}`);
  }
});
T("U-5 sortRows does not mutate its input", () => {
  const before = ROWS.map((r) => r.responsibility).join(",");
  mod.sortRows(ROWS, "owner");
  eq(ROWS.map((r) => r.responsibility).join(","), before);
});
T("U-6 projection sort honours the SQL ordering_key exactly", () => {
  eq(mod.sortRows(ROWS, "projection").map((r) => r.responsibility).join(","), "r1,r2,r3,r4");
});
T("U-7 grouping partitions every row exactly once, in every mode", () => {
  for (const g of ["department", "event", "state", "owner", "resource_role", "none"]) {
    const groups = mod.groupRows(ROWS, g);
    const members = groups.flatMap((x) => x.members);
    eq(members.length, ROWS.length, `grouping ${g} count`);
    eq(new Set(members).size, ROWS.length, `grouping ${g} duplicates`);
  }
});
T("U-8 an unowned row groups under a sentinel, never disappears", () => {
  const g = mod.groupRows(ROWS, "owner");
  const un = g.find((x) => x.key === "(unassigned)");
  if (!un || !un.members.includes("r3")) throw new Error("ownerless row lost in grouping");
});
T("U-9 risk indexing separates event-level findings from row findings", () => {
  const { byResponsibility, eventLevel } = mod.indexRisk([
    { responsibility: "r1", event_ref: "ev-1", finding: "lapsed", severity: "critical", detail: null },
    { responsibility: null, event_ref: "ev-1", finding: "venue_stale", severity: "warning", detail: null },
  ]);
  eq(byResponsibility.get("r1").length, 1);
  eq(eventLevel.length, 1);
});
T("U-10 worstSeverity ranks critical over warning over advisory", () => {
  const f = (s) => ({ responsibility: "x", event_ref: null, finding: "lapsed", severity: s, detail: null });
  eq(mod.worstSeverity([f("advisory"), f("critical"), f("warning")]), "critical");
  eq(mod.worstSeverity([f("advisory"), f("warning")]), "warning");
  eq(mod.worstSeverity([]), null);
  eq(mod.worstSeverity(undefined), null);
});

// ── label packs ───────────────────────────────────────────────────────────
T("U-11 the catering pack is the default and speaks catering", () => {
  mod.setLabelPack("catering");
  eq(mod.departmentLabel("culinary"), "Prep");
  eq(mod.departmentLabel("equipment"), "Pulls");
  eq(mod.departmentLabel("logistics"), "Routes");
  eq(mod.departmentLabel("staffing"), "Roster");
});
T("U-12 a pack swap changes every word but no constitutional key", () => {
  mod.setLabelPack("generic");
  eq(mod.departmentLabel("culinary"), "Production");
  eq(mod.departmentLabel("equipment"), "Warehouse");
  // keys are law: the same key still resolves, it is only spelled differently
  eq(mod.labelPack().departments.culinary, "Production");
  mod.setLabelPack("catering");
  eq(mod.departmentLabel("culinary"), "Prep");
});
T("U-13 state words are labels over the seven constitutional keys", () => {
  for (const s of mod.RESPONSIBILITY_STATES) {
    const w = mod.stateLabel(s);
    if (!w || w === "") throw new Error(`no label for ${s}`);
  }
  eq(mod.stateLabel("derived"), "Unassigned");
  eq(mod.stateLabel("discharged"), "Done");
});
T("U-14 an unknown department or finding degrades to the raw key, never throws", () => {
  eq(mod.departmentLabel("floral"), "floral");
  eq(mod.findingLabel("some_new_finding"), "some new finding");
});
T("U-15 a custom pack can be registered without touching components", () => {
  mod.registerLabelPack({
    id: "av", name: "AV", departments: { culinary: "Content", equipment: "Gear", logistics: "Transport", staffing: "Crew", venue: "Venues" },
    verbs: { culinary: [], equipment: [], logistics: [], staffing: [], venue: [] },
    states: mod.labelPack().states, findings: {}, surfaces: {},
  });
  mod.setLabelPack("av");
  eq(mod.departmentLabel("equipment"), "Gear");
  mod.setLabelPack("catering");
});

// ── client validators ─────────────────────────────────────────────────────
const ENV = {
  projection: "operations_today", version: 1, as_of: "2026-01-02T00:00:00Z",
  scope: {}, data: {}, counts: { total: 0 }, provenance: { truth_version: "tv" },
};
T("U-16 a well-formed envelope validates", () => {
  eq(mod.assertEnvelope("operations_today", ENV).version, 1);
});
T("U-17 shape, name and version violations each refuse with their own code", () => {
  const code = (fn) => { try { fn(); return "accepted"; } catch (e) { return e.code; } };
  eq(code(() => mod.assertEnvelope("operations_today", { nope: 1 })), "PROJECTION_SHAPE_INVALID");
  eq(code(() => mod.assertEnvelope("day_sheet", ENV)), "PROJECTION_NAME_MISMATCH");
  eq(code(() => mod.assertEnvelope("operations_today", { ...ENV, version: 9 })), "PROJECTION_VERSION_UNSUPPORTED");
});
T("U-18 server refusals normalize to typed codes and keep the raw text", () => {
  const r = mod.normalizeRefusal("Error: PROJECTION_FILTER_INVALID: unknown filter key departmnet");
  eq(r.code, "PROJECTION_FILTER_INVALID");
  if (!r.message.includes("unknown filter key")) throw new Error(r.message);
  if (!r.raw.includes("PROJECTION_FILTER_INVALID")) throw new Error("raw lost");
  eq(mod.normalizeRefusal("connection reset").code, "PROJECTION_ERROR");
});
T("U-19 filter serialization drops unset keys so absence is never sent as a value", () => {
  const f = mod.toFilter({ department: "culinary", owner: undefined, unowned: false });
  eq(JSON.stringify(f), JSON.stringify({ department: "culinary", unowned: false }));
});
T("U-20 isEnvelopeLike inspects shape only and never opinions about data", () => {
  eq(mod.isEnvelopeLike(ENV), true);
  eq(mod.isEnvelopeLike({ ...ENV, data: undefined }), false);
  eq(mod.isEnvelopeLike(null), false);
  eq(mod.isEnvelopeLike("string"), false);
});

console.log(`\nunit-projection: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
