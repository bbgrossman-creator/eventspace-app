// v262 (Blueprint Workflow Unification) — the reconciliation of the last
// competing Blueprint doctrine. After this slice there is ONE workflow and
// ONE language: creation is Instantiation (BP-3, via New Proposal → Start
// from Blueprint), authoring reuse is Composition (BP-8, on the Shelf),
// knowledge capture is Promotion (BP-5, in the Studio header), reference is
// Citation / View Source. The v216 land/apply doctrine is retired: the
// Studio's landing orchestration, the pane's copy-components tab, the
// genesis blueprint route, and the LandingDecision surface are gone —
// capabilities preserved through the constitutional doors, implementations
// replaced, provenance untouched, law untouched, no SQL. The acceptance
// harnesses were amended to follow the product (G-4 is now the negative
// claim; the landing fixture wears neutral vocabulary) — recorded in canon.
import * as fs from "fs";

let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const ok = (cond: boolean, what: string) => { if (!cond) throw new Error(what); };

const STUDIO = "src/app/bookings/[id]/studio/[versionId]/page.tsx";
const page = fs.readFileSync(STUDIO, "utf8");
const pane = fs.readFileSync("src/components/SourceEventPane.tsx", "utf8");
const genesis = fs.readFileSync("src/components/studio/VersionGenesis.tsx", "utf8");
const card = fs.readFileSync("src/components/ProposalsCard.tsx", "utf8");
const cite = fs.readFileSync("src/components/BlueprintCitation.tsx", "utf8");

const walk = (dir: string, into: string[]) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, into);
    else if (/\.(ts|tsx)$/.test(e.name)) into.push(p);
  }
};

T("ONE DOCTRINE — THE GLOBAL PIN v261 COULD NOT MAKE: across all of src, only the legacy module itself and its retired-in-place page reference '@/lib/blueprints' — zero live importers remain anywhere (components, app pages, libs)", () => {
  const files: string[] = [];
  walk("src", files);
  const offenders = files.filter((f) =>
    !f.endsWith("src/lib/blueprints.ts") && !f.endsWith("src/app/blueprints/page.tsx")
    && !f.includes("__tests__")
    && fs.readFileSync(f, "utf8").includes('@/lib/blueprints"'));
  ok(offenders.length === 0, `live importers: ${offenders.join(", ")}`);
});

T("THE STUDIO PAGE CARRIES NO LAND/APPLY MACHINERY: no legacy identifiers (the apply/replace/subset verbs, the legacy promote and list calls, the preview type), no landing state or orchestration, no LandingDecision, and no drop branch for the retired drag payload anywhere in src", () => {
  for (const id of ["applyBlueprint", "replaceWithBlueprint", "applyBlueprintSubset", "promoteToBlueprint(", "listBlueprints", "previewBlueprint", "openLanding", "commitLanding", "LandingDecision", "BlueprintPreview"]) {
    ok(!page.includes(id), `legacy identifier survives in the studio page: ${id}`);
  }
  const files: string[] = [];
  walk("src", files);
  const mimeCarriers = files.filter((f) => !f.includes("__tests__") && fs.readFileSync(f, "utf8").includes("text/eventcore-blueprint"));
  ok(mimeCarriers.length === 0, `the retired drag payload survives: ${mimeCarriers.join(", ")}`);
  ok(!fs.existsSync("src/components/studio/LandingDecision.tsx"), "LandingDecision must be gone");
});

T("FOUR CATEGORIES, CLEANLY MAPPED: the Studio's blueprint surface is exactly Citation/View-Source (reference) + PromoteToBlueprint (capture); creation lives in New Proposal → Start from Blueprint (instantiation); authoring reuse lives on the Shelf as Copy into Draft (composition) — all four doors exist and no fifth blueprint action remains in the Studio", () => {
  ok(page.includes("<BlueprintCitation versionId={version.id} />"), "the reference door is missing");
  ok(page.includes("<PromoteToBlueprint versionId={version.id}"), "the capture door is missing");
  const bpImports = [...page.matchAll(/import (\w+) from "@\/components\/(Blueprint\w+|PromoteToBlueprint)"/g)].map((m) => m[1]).sort();
  ok(JSON.stringify(bpImports) === JSON.stringify(["BlueprintCitation", "PromoteToBlueprint"]), `studio blueprint components: ${JSON.stringify(bpImports)}`);
  ok(card.includes('"Start from Blueprint"') && card.includes("<StartFromBlueprint"), "the instantiation door is missing");
  const shelf = fs.readFileSync("src/app/blueprint-shelf/page.tsx", "utf8");
  ok(shelf.includes("<CopyIntoDraft"), "the composition door is missing");
});

T("THE PANE'S TAB IS REFERENCE-ONLY: it reads the PUBLISHED shelf through the constitutional v261 read, offers View-on-Shelf links, routes creation and reuse to their doors by name, and contains no add/copy action wired to blueprint content (the generic onAdd serves events/proposals only)", () => {
  ok(pane.includes("listPublishedBlueprints"), "the tab must read the published shelf");
  ok(pane.includes("data-bp-reference") && pane.includes("data-bp-view-source"), "the reference surfaces are missing");
  ok(pane.includes("Start from Blueprint") && pane.includes("Copy into Draft"), "the doors must be named");
  const tab = pane.slice(pane.indexOf("data-bp-reference"), pane.indexOf("Reference only"));
  ok(!tab.includes("onAdd("), "the reference tab wires an add action");
  ok(!pane.includes("Apply whole"), "an apply affordance survives in the pane");
});

T("THE GENESIS OFFERS NO BLUEPRINT ROUTE: VersionGenesis has no blueprints prop, no onBlueprint, no blueprint mode, and both product callers pass neither — new versions are revise/copy/blank; designing from a Blueprint is a proposal-creation act", () => {
  for (const id of ["blueprints:", "onBlueprint", '"blueprint"', "data-genesis-bp"]) {
    ok(!genesis.includes(id), `the retired route survives in VersionGenesis: ${id}`);
  }
  ok(!page.includes("onBlueprint") && !card.includes("onBlueprint"), "a caller still wires the retired route");
});

T("VOCABULARY: no live-dependency phrase survives in any product component or page — the retired verbs are gone and the constitutional verbs are what the product teaches", () => {
  // built from fragments so this suite's own text never trips the sweep
  const A = "Apply", R = "Replace", U = "Update", P = "Pull", S = "Sync", F = "Refresh";
  const forbidden = new RegExp(
    `${A}\\s+Blueprint|${A} whole|${R}\\s+(with|from)\\s+Blueprint|${F}\\s+from|${U}\\s+from\\s+Blueprint|${P}\\s+latest|${S}\\s+Blueprint`, "i");
  const files: string[] = [];
  walk("src/components", files);
  files.push(STUDIO, "src/app/blueprint-shelf/page.tsx");
  const offenders = files.filter((f) => !f.includes("__tests__") && forbidden.test(fs.readFileSync(f, "utf8")));
  ok(offenders.length === 0, `live-dependency vocabulary in: ${offenders.join(", ")}`);
  for (const verb of ["Start from Blueprint", "Promote"]) {
    ok(card.includes(verb) || page.includes(verb), `the constitutional verb is missing: ${verb}`);
  }
});

T("PROVENANCE IS UNTOUCHED AND INTACT: the citation keeps its toggle, detail, answers, and view-source surfaces; the composition and promotion provenance records and their append-only policies are exactly as v255/v258 shipped them (files carry no v262 edits)", () => {
  for (const attr of ["data-citation-toggle", "data-citation-detail", "data-citation-answers", "data-view-source"]) {
    ok(cite.includes(attr), `citation surface missing: ${attr}`);
  }
  for (const f of ["src/components/BlueprintCitation.tsx", "src/components/PromoteToBlueprint.tsx", "src/components/CopyIntoDraft.tsx", "supabase/v255_promotion.sql", "supabase/v258_composition.sql"]) {
    ok(!fs.readFileSync(f, "utf8").includes("v262"), `${f} was touched by the unification slice`);
  }
});

T("LAW, VALIDATORS, RESOLVERS, AND CEREMONIES ARE FROZEN THROUGH THIS SLICE: no SQL exists for v262 and no law module carries a v262 edit — the slice is product coherence only", () => {
  ok(fs.readdirSync("supabase").every((f) => !f.includes("262")), "a v262 migration exists");
  for (const law of ["blueprintContent", "blueprintConditions", "blueprintCompose", "blueprintPromote", "blueprintShelf", "blueprintInstantiate", "blueprintLibrary", "blueprintDivergence", "blueprintStudio", "blueprintGuide"]) {
    ok(!fs.readFileSync(`src/lib/${law}.ts`, "utf8").includes("v262"), `${law} was edited`);
  }
});

T("ACCEPTANCE FOLLOWS THE PRODUCT, RECORDED: the lifecycle harness feeds no blueprint fixtures and G-4 is the negative claim (the retired route does not exist); the landing harness's fixture wears neutral card-payload vocabulary while testing the same drag mechanics", () => {
  const lh = fs.readFileSync("browser-tests/lifecycle.harness.tsx", "utf8");
  ok(!lh.includes("blueprint") && !lh.includes("Blueprint"), "the lifecycle harness still feeds the retired route");
  const lm = fs.readFileSync("browser-tests/accept-lifecycle.mjs", "utf8");
  ok(lm.includes("the retired blueprint route does not exist"), "G-4 must prove absence");
  ok(!lm.includes("genesis:blueprint:"), "a positive blueprint commit expectation survives");
  const dh = fs.readFileSync("browser-tests/landing.harness.tsx", "utf8");
  ok(dh.includes("text/eventcore-cardpayload") && !dh.includes("text/eventcore-blueprint"), "the landing fixture still wears the retired mime");
  const dm = fs.readFileSync("browser-tests/accept-landing.mjs", "utf8");
  ok(dm.includes("drop-card:") && !dm.includes("drop-blueprint:"), "the landing claims still speak the retired vocabulary");
});

T("INDEPENDENCE IS UNCHANGED BECAUSE NOTHING THAT GRANTS IT MOVED: the instantiation wrapper and SQL, the divergence law, and the citation reads are byte-level free of v262 — the created design's independence still rests on the proven acts", () => {
  for (const f of ["src/lib/blueprintInstantiateSupabase.ts", "supabase/v253_instantiation.sql", "supabase/v257_conditions.sql", "src/lib/blueprintDivergenceSupabase.ts"]) {
    ok(!fs.readFileSync(f, "utf8").includes("v262"), `${f} was touched`);
  }
});

console.log(`\nv262.unification: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
