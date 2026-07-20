// v260 (Blueprint Studio · Object-Centric Authoring & Simulation) — a
// product refinement, UX-ONLY over frozen BP-1..BP-8. The object workspace
// is a PROJECTION over the same content and the same editors (the literal
// EntryEditor component on the literal patch path — no second editing
// model, no second save). Simulation invokes the EXISTING evaluation law —
// branchMap/evaluateCondition — and persists nothing; every inclusion
// explanation is the law's own verdict per leaf predicate. Behavior
// summaries are descriptive only. Removing an object clears focus with no
// stale state. No SQL, no law edits, no publication/promotion/composition/
// instantiation change (all pinned).
import * as fs from "fs";
import {
  objectView, behaviorSummary, describeCondition, explainCondition, simulate,
  reviewDiagnostics, findEntryPath,
} from "../blueprintStudio";
import { evaluateCondition, BlueprintCondition } from "../blueprintConditions";
import { emptyContent, BlueprintContent } from "../blueprintContent";

let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const ok = (cond: boolean, what: string) => { if (!cond) throw new Error(what); };

const page = fs.readFileSync("src/app/blueprint-shelf/page.tsx", "utf8");
const studio = fs.readFileSync("src/lib/blueprintStudio.ts", "utf8");

function fixture(): BlueprintContent {
  const c = emptyContent();
  c.parameters.push(
    { key: "guest_count", label: "Guest Count", type: "count", required: true },
    { key: "package", label: "Package", type: "choice", required: true, options: ["standard", "premium"] },
    { key: "outdoor", label: "Outdoor venue", type: "flag", required: false },
    { key: "orphan", label: "Never referenced", type: "flag", required: false },
  );
  c.structure.push({
    key: "ch1", title: "Cocktail Hour", prose: "",
    sections: [{
      key: "s1", title: "Stations", prose: "", role: "role-st",
      condition: { predicate: "at-least", param: "guest_count", operand: 100 },
      entries: [
        { key: "sushi", definitionId: "d1", title: "Sushi Station",
          configuration: { values: {}, scheme: null, annotations: "" },
          itemSelections: [{ name: "Kids Roll", include: false, note: "",
            condition: { not: { predicate: "equals", param: "outdoor", operand: true } } }],
          choiceGroups: [{ key: "cg1", label: "Add-on bar", options: ["Coffee", "Ice Cream"], required: false }],
          pricingIntent: { form: "authored-suggestion", amount: 2950 }, notes: "" },
        { key: "coffee", definitionId: "d2", title: "Coffee Bar",
          configuration: { values: {}, scheme: null, annotations: "" },
          itemSelections: [], choiceGroups: [],
          pricingIntent: null, notes: "",
          condition: { predicate: "equals", param: "package", operand: "premium" } },
      ],
    }],
  });
  return c;
}

T("THE OBJECT VIEW CROSS-REFERENCES WITHOUT DUPLICATING: for Sushi Station it returns the entry with its chapter/section path, the inherited section rule, the influencing questions (guest_count from the section gate, outdoor from the item rule — package does not influence it), and its choice groups via the summary", () => {
  const c = fixture();
  const v = objectView(c, "sushi")!;
  ok(v.entry.title === "Sushi Station" && v.section.key === "s1" && v.chapter.key === "ch1", "path wrong");
  ok(v.inheritedConditions.length === 1 && v.inheritedConditions[0].from === "section", "inherited rule missing");
  ok(JSON.stringify(v.influencingParams) === JSON.stringify(["guest_count", "outdoor"]), `influencing: ${JSON.stringify(v.influencingParams)}`);
  ok(v.questions.map((q) => q.key).join(",") === "guest_count,outdoor", "questions wrong");
  const s = behaviorSummary(c, "sushi")!;
  ok(s.choices.length === 1 && s.choices[0] === "Add-on bar", "choices wrong");
  ok(objectView(c, "ghost") === null && findEntryPath(c, "ghost") === null, "a missing object must be null, never guessed");
});

T("BEHAVIOR SUMMARY IS DESCRIPTIVE ONLY: plain sentences assembled from the shape — appears-when wording, pricing form name, question labels — and the studio module carries no recommend/predict/auto vocabulary anywhere", () => {
  const c = fixture();
  const s = behaviorSummary(c, "coffee")!;
  ok(s.appears.includes("Guest Count is at least 100") && s.appears.includes("Package is premium"), s.appears);
  ok(s.pricing === "No pricing guidance", s.pricing);
  const sushi = behaviorSummary(c, "sushi")!;
  ok(sushi.pricing === "Suggested", sushi.pricing);
  ok(!/recommend|predict|auto-?(create|fix|apply)/i.test(studio), "assistive vocabulary in the studio module");
});

T("CONDITION WORDING IS DETERMINISTIC over the full vocabulary and composition, using parameter LABELS: is / is not / is more than / is at least / is under / is at most / is one of / is answered; AND · OR · NOT", () => {
  const c = fixture();
  const D = (cond: BlueprintCondition) => describeCondition(cond, c);
  ok(D({ predicate: "equals", param: "package", operand: "premium" }) === "Package is premium", "equals");
  ok(D({ predicate: "not-equals", param: "package", operand: "standard" }) === "Package is not standard", "not-equals");
  ok(D({ predicate: "greater-than", param: "guest_count", operand: 150 }) === "Guest Count is more than 150", "gt");
  ok(D({ predicate: "at-least", param: "guest_count", operand: 100 }) === "Guest Count is at least 100", "gte");
  ok(D({ predicate: "less-than", param: "guest_count", operand: 50 }) === "Guest Count is under 50", "lt");
  ok(D({ predicate: "at-most", param: "guest_count", operand: 300 }) === "Guest Count is at most 300", "lte");
  ok(D({ predicate: "one-of", param: "package", operand: ["standard", "premium"] }) === "Package is one of standard, premium", "one-of");
  ok(D({ predicate: "present", param: "outdoor" }) === "Outdoor venue is answered", "present");
  ok(D({ all: [{ predicate: "present", param: "outdoor" }, { predicate: "equals", param: "package", operand: "premium" }] })
     === "Outdoor venue is answered AND Package is premium", "all");
  ok(D({ not: { predicate: "equals", param: "outdoor", operand: true } }) === "NOT (Outdoor venue is true)", "not");
});

T("SIMULATION IS THE EXISTING LAW RUN WITHOUT SAVING: verdicts come from branchMap/evaluateCondition only — the module never reads an answer itself (`answers[` absent; every verdict flows through the law) — and the panel plus module are write-free (no supabase, no rpc, no save)", () => {
  ok(!studio.includes("answers["), "the studio module reads answers directly — a second rule engine");
  ok(studio.includes("branchMap(") && (studio.match(/evaluateCondition\(/g) ?? []).length >= 2, "the law is not being invoked");
  ok(!studio.includes("supabase") && !studio.includes(".rpc(") && !studio.includes("saveDraftContent"), "the studio module persists");
  const sim = page.slice(page.indexOf("function SimulationPanel"), page.indexOf("function ReasonRow"));
  ok(!sim.includes("supabase") && !sim.includes("saveDraftContent") && !sim.includes("patch("), "the simulation panel writes");
  ok(sim.includes("simulate(content, typed)"), "the panel must call the one simulate");
});

T("SIMULATION VERDICTS MATCH INSTANTIATION SEMANTICS ON THE FIXTURE: 250/premium → Stations ✓, Sushi ✓, Coffee ✓, item rule applies when not outdoor; 80/premium → the section gate excludes everything beneath it; 150/standard → Coffee ✗ while Sushi ✓", () => {
  const c = fixture();
  const big = simulate(c, { guest_count: 250, package: "premium" });
  ok("sections" in big, "blocked unexpectedly");
  if ("sections" in big) {
    ok(big.sections[0].included && big.sections[0].entries[0].included && big.sections[0].entries[1].included, "250/premium wrong");
    ok(big.sections[0].entries[0].itemDecisions[0].applies, "item rule should apply when outdoor is unanswered (NOT(equals) holds)");
  }
  const small = simulate(c, { guest_count: 80, package: "premium" });
  ok("sections" in small && small.sections[0].included === false
     && small.sections[0].entries.every((e) => !e.included),
     "the section gate must exclude everything beneath it");
  const std = simulate(c, { guest_count: 150, package: "standard" });
  ok("sections" in std && std.sections[0].entries[1].included === false && std.sections[0].entries[0].included === true,
     "150/standard must include Sushi and exclude Coffee");
});

T("EVERY EXPLANATION IS THE LAW'S OWN VERDICT PER LEAF: explainCondition's held flags equal evaluateCondition on each leaf for the same answers — checked leaf-by-leaf across a composed condition — and the NOT wrapper inverts honestly", () => {
  const c = fixture();
  const cond: BlueprintCondition = { all: [
    { predicate: "at-least", param: "guest_count", operand: 100 },
    { predicate: "equals", param: "package", operand: "premium" },
  ] };
  const answers = { guest_count: 150, package: "standard" };
  const rows = explainCondition(cond, answers, c);
  ok(rows.length === 2, "leaf count");
  ok(rows[0].held === evaluateCondition({ predicate: "at-least", param: "guest_count", operand: 100 }, answers), "leaf 1 disagrees with the law");
  ok(rows[1].held === evaluateCondition({ predicate: "equals", param: "package", operand: "premium" }, answers), "leaf 2 disagrees with the law");
  ok(rows[0].held === true && rows[1].held === false, "fixture expectations");
  const notRows = explainCondition({ not: { predicate: "equals", param: "outdoor", operand: true } }, { outdoor: true }, c);
  ok(notRows[0].held === false && notRows[0].text.startsWith("NOT ("), "NOT must invert and say so");
});

T("MISSING REQUIRED ANSWERS BLOCK SIMULATION BY NAME: no result is produced, the missing questions are listed, and the panel renders the named blocked state", () => {
  const c = fixture();
  const blocked = simulate(c, { guest_count: 100 });
  ok("missing" in blocked, "must block");
  if ("missing" in blocked) ok(blocked.missing.length === 1 && blocked.missing[0].key === "package", "missing list wrong");
  ok(page.includes("data-sim-blocked") && page.includes("Answer these first"), "blocked surface missing");
});

T("THE WORKSPACE IS A PROJECTION OVER THE SAME EDITORS AND DATA: it renders the literal EntryEditor on the literal patch path used by the structure dashboard; there is no second save; removing the object calls onGone and the focus-clearing effect derives from content so summaries can never go stale", () => {
  const ws = page.slice(page.indexOf("function ObjectWorkspace"), page.indexOf("function SimulationPanel"));
  ok(ws.includes("<EntryEditor entry={v.entry}"), "the workspace must reuse the one EntryEditor");
  ok(ws.includes("fn(c.structure[ci].sections[si].entries[ei])"), "the workspace must patch the identical path");
  ok(!ws.includes("saveDraftContent") && !ws.includes("supabase"), "a second save path exists");
  ok(ws.includes("props.onGone()"), "removal must clear focus");
  ok(page.includes("if (focusedEntry && !findEntryPath(content, focusedEntry)) setFocusedEntry(null);"), "the stale-focus guard is missing");
  ok((page.match(/<EntryEditor/g) ?? []).length === 2, "EntryEditor must have exactly its two projection sites");
});

T("GLOBAL AREAS REMAIN AS DASHBOARDS AND DIAGNOSTICS ARE READ-ONLY: the seven v259 areas still render beneath the 'Organizational dashboards' label; reviewDiagnostics lists unused parameters (guest_count exempt — the act always asks it), missing-question references, and required questions; the Diag component patches nothing", () => {
  ok(page.includes("Organizational dashboards"), "the dashboards label is missing");
  for (let i = 0; i <= 6; i++) ok(page.includes(`EDITOR_AREAS[${i}]}>`), `area ${i} gone`);
  const c = fixture();
  const d = reviewDiagnostics(c);
  ok(d.unusedParameters.length === 1 && d.unusedParameters[0].key === "orphan", `unused: ${JSON.stringify(d.unusedParameters.map((p) => p.key))}`);
  ok(d.unresolvedQuestions.map((p) => p.key).join(",") === "guest_count,package", "required list wrong");
  const broken = fixture();
  broken.structure[0].sections[0].entries[1].condition = { predicate: "equals", param: "ghost", operand: "x" };
  ok(reviewDiagnostics(broken).conditionsMissingQuestions.some((m) => m.param === "ghost"), "missing-question reference not surfaced");
  const diag = page.slice(page.indexOf("function Diag("), page.indexOf("/** v260 — THE OBJECT WORKSPACE"));
  ok(!diag.includes("patch") && !diag.includes("save"), "diagnostics must be read-only");
});

T("NOTHING CONSTITUTIONAL CHANGED: no SQL for v260; the studio module imports only the three pure law/shape modules; the law files (content, conditions, compose, promote, shelf, instantiate, library, divergence) carry no v260 edits; publication/promotion/composition/instantiation surfaces are untouched by the slice", () => {
  ok(fs.readdirSync("supabase").every((f) => !f.includes("260")), "a v260 migration exists");
  const imports = [...studio.matchAll(/from "([^"]+)";/g)].map((m) => m[1]).sort();
  ok(JSON.stringify(imports) === JSON.stringify(["./blueprintCompose", "./blueprintConditions", "./blueprintContent"]), `studio imports: ${JSON.stringify(imports)}`);
  for (const law of ["blueprintContent", "blueprintConditions", "blueprintCompose", "blueprintPromote", "blueprintShelf", "blueprintInstantiate", "blueprintLibrary", "blueprintDivergence"]) {
    ok(!fs.readFileSync(`src/lib/${law}.ts`, "utf8").includes("v260"), `${law} was edited by the UX slice`);
  }
  for (const f of ["src/components/PromoteToBlueprint.tsx", "src/components/CopyIntoDraft.tsx", "src/components/BlueprintInstantiate.tsx"]) {
    ok(!fs.readFileSync(f, "utf8").includes("v260"), `${f} was touched by the UX slice`);
  }
});

console.log(`\nv260.studio: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
