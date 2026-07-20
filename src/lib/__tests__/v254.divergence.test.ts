// v254 (BP-4) — DIVERGENCE & CITATION. The comparison is pure and
// deterministic: current materialized state against the frozen baseline,
// nothing else CAN arrive (zero imports, arity two). Every named criterion
// is exercised alone; tiers derive from the named sets, never a score;
// earlier-revision stays orthogonal; malformed baselines surface as named
// integrity states without repair; the citation speaks only in the
// started-from voice. Server-side (v254_proof.sql, D-1..D-5): the citation
// survives supersession and retirement; audit noise and later blueprint
// edits cannot reach the comparison's inputs; the baseline refuses rewrite.
import * as fs from "fs";
import {
  MaterializedDesign, compareToBaseline, citationLine, citationStatus,
  HEAVY_CRITERIA, LIGHT_CRITERIA, baselineIntegrity,
} from "../blueprintDivergence";

let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const ok = (cond: boolean, what: string) => { if (!cond) throw new Error(what); };

const design = (): MaterializedDesign => ({
  sections: [{ section_type_id: "role-a", position: 0 }, { section_type_id: "role-b", position: 1 }],
  components: [
    { id: "c1", title: "Sushi", section_type_id: "role-a", definition_id: "d1", instantiation_id: "i1",
      pricing_mode: "package", package_price: 1800, package_price_confirmed: true,
      config: { schemeId: "live-chef", choices: { service: "live_chef" }, scalars: { attendants: 2 } },
      seed_config_revision: "cfg1",
      items: [{ name: "Salmon", unit_price: 12, price_confirmed: false }, { name: "Dragon Roll", unit_price: null, price_confirmed: false }] },
    { id: "c2", title: "Carving", section_type_id: "role-b", definition_id: "d2", instantiation_id: "i2",
      pricing_mode: "itemized", package_price: null, package_price_confirmed: false,
      config: { schemeId: null, choices: {}, scalars: {} }, seed_config_revision: null,
      items: [{ name: "Brisket", unit_price: 24, price_confirmed: false }] },
  ],
  presentation: { theme_key: "classic", theme_override: { colors: { accent: "#123456" } }, photo_pins: null },
  guests: [{ category_id: "adults", count: 120 }],
});

const mutate = (fn: (d: MaterializedDesign) => void): MaterializedDesign => {
  const d = design(); fn(d); return d;
};
const expectTier = (current: MaterializedDesign, tier: string, kind: string) => {
  const r = compareToBaseline(current, design());
  ok(r.integrity === "ok", "integrity should be ok");
  if (r.integrity !== "ok") return;
  ok(r.tier === tier, `${kind}: tier ${r.tier}, want ${tier} — findings ${JSON.stringify(r.findings)}`);
  ok(r.findings.some((f) => f.kind === kind), `${kind}: finding missing — got ${JSON.stringify(r.findings.map((f) => f.kind))}`);
};

T("UNCHANGED IS INFORMATION: identical state yields tier unchanged with zero findings, prose reported unavailable (never invented), and the report carries no numeric ranking of any kind", () => {
  const r = compareToBaseline(design(), design());
  ok(r.integrity === "ok" && r.tier === "unchanged" && r.findings.length === 0, `got ${JSON.stringify(r)}`);
  ok(r.integrity === "ok" && r.prose === "unavailable", "prose honesty missing");
  ok(!("score" in r) && !("rank" in r) && !("conformity" in r), "a ranking number exists");
});

T("EVERY LIGHT CRITERION, ALONE, IS LIGHT: item add/remove/reorder/price, price-confirmation, package price, config value, retitle, component/section reorder, dress under the same theme, guest count", () => {
  expectTier(mutate((d) => d.components[0].items.push({ name: "Tuna", unit_price: null, price_confirmed: false })), "light", "item-added");
  expectTier(mutate((d) => d.components[0].items.splice(1, 1)), "light", "item-removed");
  expectTier(mutate((d) => d.components[0].items.reverse()), "light", "item-reordered");
  expectTier(mutate((d) => { d.components[0].items[0].unit_price = 14; }), "light", "item-price-changed");
  expectTier(mutate((d) => { d.components[0].items[0].price_confirmed = true; }), "light", "price-confirmation-changed");
  expectTier(mutate((d) => { d.components[0].package_price = 1900; }), "light", "package-price-changed");
  expectTier(mutate((d) => { (d.components[0].config as { scalars: { attendants: number } }).scalars.attendants = 3; }), "light", "config-value-changed");
  expectTier(mutate((d) => { d.components[0].title = "Sushi & Sashimi"; }), "light", "component-retitled");
  expectTier(mutate((d) => d.components.reverse()), "light", "component-reordered");
  expectTier(mutate((d) => d.sections.reverse()), "light", "section-reordered");
  expectTier(mutate((d) => { d.presentation = { ...d.presentation!, photo_pins: { cover: { id: "p1" } } }; }), "light", "dress-adjusted");
  expectTier(mutate((d) => { d.guests[0].count = 180; }), "light", "guest-count-changed");
});

T("EVERY HEAVY CRITERION IS HEAVY: component add/remove/move, section add/remove, theme replacement, scheme change, pricing-mode change — named structural criteria, not weights", () => {
  expectTier(mutate((d) => d.components.push({ ...design().components[0], id: "c3", title: "New Station" })), "heavy", "component-added");
  expectTier(mutate((d) => d.components.splice(1, 1)), "heavy", "component-removed");
  expectTier(mutate((d) => { d.components[0].section_type_id = "role-b"; }), "heavy", "component-moved");
  expectTier(mutate((d) => d.sections.push({ section_type_id: "role-c", position: 2 })), "heavy", "section-added");
  expectTier(mutate((d) => { d.sections.splice(1, 1); d.components[1].section_type_id = "role-a"; }), "heavy", "section-removed");
  expectTier(mutate((d) => { d.presentation = { ...d.presentation!, theme_key: "modern" }; }), "heavy", "presentation-replaced");
  expectTier(mutate((d) => { (d.components[0].config as { schemeId: string }).schemeId = "buffet"; }), "heavy", "config-scheme-changed");
  expectTier(mutate((d) => { d.components[1].pricing_mode = "package"; }), "heavy", "pricing-mode-changed");
});

T("NO COLLAPSE INTO ONE NUMBER: light and heavy together report heavy with ALL findings preserved; the criteria sets are disjoint and every produced kind is classified in exactly one", () => {
  const r = compareToBaseline(mutate((d) => {
    d.guests[0].count = 90;
    d.components.push({ ...design().components[0], id: "c9", title: "Ninth" });
  }), design());
  ok(r.integrity === "ok" && r.tier === "heavy", "combined tier");
  if (r.integrity !== "ok") return;
  ok(r.findings.some((f) => f.kind === "guest-count-changed") && r.findings.some((f) => f.kind === "component-added"),
    "findings collapsed");
  const h = new Set<string>(HEAVY_CRITERIA), l = new Set<string>(LIGHT_CRITERIA);
  for (const k of h) ok(!l.has(k), `${k} classified twice`);
  for (const f of r.findings) ok(h.has(f.kind) || l.has(f.kind), `${f.kind} unclassified`);
});

T("EARLIER-REVISION IS ORTHOGONAL: an unchanged design can cite a superseded revision and a heavy one the current — the shelf note and the tier come from different worlds and never merge", () => {
  const unchanged = compareToBaseline(design(), design());
  const stale = citationStatus({ citedRevisionId: "r1", publishedRevisionId: "r2", identityStatus: "active" });
  ok(unchanged.integrity === "ok" && unchanged.tier === "unchanged" && stale.shelfNote === "earlier-revision",
    "unchanged × earlier-revision must coexist");
  const heavy = compareToBaseline(mutate((d) => d.components.splice(0, 1)), design());
  const current = citationStatus({ citedRevisionId: "r2", publishedRevisionId: "r2", identityStatus: "active" });
  ok(heavy.integrity === "ok" && heavy.tier === "heavy" && current.shelfNote === "current",
    "heavy × current must coexist");
  const retired = citationStatus({ citedRevisionId: "r2", publishedRevisionId: null, identityStatus: "retired" });
  ok(retired.identityRetired && retired.shelfNote === "earlier-revision", "retirement is a note, not a tier");
});

T("DETERMINISM: the same inputs give byte-identical reports; object key order inside config is immaterial (canonical value comparison)", () => {
  const a = compareToBaseline(design(), design());
  const b = compareToBaseline(design(), design());
  ok(JSON.stringify(a) === JSON.stringify(b), "nondeterministic report");
  const reordered = mutate((d) => {
    d.components[0].config = { scalars: { attendants: 2 }, choices: { service: "live_chef" }, schemeId: "live-chef" };
  });
  const r = compareToBaseline(reordered, design());
  ok(r.integrity === "ok" && r.tier === "unchanged", `key order produced findings: ${JSON.stringify(r)}`);
});

T("BASELINE INTEGRITY: malformed baselines surface as NAMED states (missing sections/components/guests, component without id, not an object); comparison refuses; the baseline object is read, never mutated or repaired", () => {
  const noComps = { sections: [], guests: [] };
  const r1 = compareToBaseline(design(), noComps);
  ok(r1.integrity === "malformed" && r1.problems.includes("BASELINE_MISSING_COMPONENTS"), JSON.stringify(r1));
  ok(compareToBaseline(design(), "nonsense").integrity === "malformed", "non-object accepted");
  const badComp = { sections: [], components: [{ title: "no id" }], guests: [] };
  ok(baselineIntegrity(badComp).includes("BASELINE_COMPONENT_WITHOUT_ID"), "id-less component unnamed");
  const frozen = JSON.parse(JSON.stringify(design()));
  const before = JSON.stringify(frozen);
  compareToBaseline(mutate((d) => d.components.splice(0, 1)), frozen);
  ok(JSON.stringify(frozen) === before, "the comparison mutated the baseline — repair is forbidden");
});

T("ONE SOURCE OF TRUTH BY SHAPE: the comparison takes exactly two arguments; the pure module imports NOTHING — there is no channel through which the current blueprint, the shelf, or event history could reach the result", () => {
  ok(compareToBaseline.length === 2, `arity ${compareToBaseline.length}`);
  const src = fs.readFileSync("src/lib/blueprintDivergence.ts", "utf8");
  ok(!/^import /m.test(src), "the pure module imports something");
});

T("THE VOICE + NEGATIVE PINS: citationLine speaks only started-from; the banned phrases appear nowhere; the data layer never writes the citation, never reads revision CONTENT, and no refresh/patch/re-execution path exists in the slice", () => {
  ok(citationLine("Wedding Reception", 2) === "Started from Wedding Reception r2", "the voice");
  const pure = fs.readFileSync("src/lib/blueprintDivergence.ts", "utf8");
  const data = fs.readFileSync("src/lib/blueprintDivergenceSupabase.ts", "utf8");
  const surf = fs.readFileSync("src/components/BlueprintCitation.tsx", "utf8");
  for (const [name, src] of [["blueprintDivergence.ts", pure], ["blueprintDivergenceSupabase.ts", data], ["BlueprintCitation.tsx", surf]] as const) {
    for (const banned of ["powered by", "inherited from", "synchronized with", "proof of", "based on current"]) {
      ok(!src.toLowerCase().includes(banned), `"${banned}" appears in ${name}`);
    }
    ok(!/update.?from.?blueprint|\bsync\b|\breplay\b|\bpatch\b|\brevert\b/i.test(src), `a forbidden verb in ${name}`);
    ok(!/recommend|conformity|should\b/i.test(src), `judgment vocabulary in ${name}`);
  }
  const biCalls = [...data.matchAll(/from\("blueprint_instantiations"\)\s*\n?\s*\.(\w+)/g)].map((m) => m[1]);
  ok(biCalls.length > 0 && biCalls.every((v) => v === "select"), `citation table verbs: ${JSON.stringify(biCalls)}`);
  ok(!/\.update\(|\.delete\(|\.insert\(|\.upsert\(/.test(data), "the data layer writes");
  const revSelect = data.match(/from\("blueprint_revisions"\)\s*\n?\s*\.select\("([^"]+)"\)/);
  ok(revSelect !== null && !revSelect[1].includes("content"), `revision select fetches content: ${revSelect?.[1]}`);
});

console.log(`\nv254.divergence: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
