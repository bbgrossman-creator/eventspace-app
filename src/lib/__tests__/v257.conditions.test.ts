// v257 (BP-7) — CONDITIONS. The predicate vocabulary is CLOSED (eight
// words, typed admission, no expressions/scripts/regexes); composition is
// bounded (all/any/not, depth 3, ten predicates); attachment is closed
// (chapter/section/entry/itemSelection, field-treatment registered);
// parameters are referenced by STABLE KEY only. Evaluation is
// deterministic and normalized. The SQL mirrors the client law VERBATIM
// (name-set parity pinned); BP-3's function was REPLACED, not duplicated
// (one path); resolution is ONE-TIME (server C-1..C-4 on real Postgres,
// plus the Library facts LB-1..LB-3). CONDITIONS_RESERVED is retired.
import * as fs from "fs";
import {
  CONDITION_PREDICATES, PREDICATE_ADMISSION, CONDITION_FAILURES,
  CONDITION_MAX_DEPTH, CONDITION_MAX_PREDICATES, CONDITION_UNITS,
  validateCondition, evaluateCondition, branchMap, BlueprintCondition,
} from "../blueprintConditions";
import { validateBlueprintContent, emptyContent, FIELD_TREATMENTS } from "../blueprintContent";

let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const ok = (cond: boolean, what: string) => { if (!cond) throw new Error(what); };

const PARAMS: { key: string; type: "count" | "choice" | "flag"; options?: string[] }[] = [
  { key: "guest_count", type: "count" },
  { key: "daypart", type: "choice", options: ["lunch", "evening"] },
  { key: "kids", type: "flag" },
];

T("THE VOCABULARY IS CLOSED AND TYPED: exactly eight predicates; the admission matrix admits count to all eight, choice to equals/not-equals/one-of/present, flag to equals/not-equals/present — nothing programmable exists (no eval, no Function, no regex construction in the module)", () => {
  ok(CONDITION_PREDICATES.length === 8, `${CONDITION_PREDICATES.length} predicates`);
  ok(JSON.stringify([...CONDITION_PREDICATES].sort()) === JSON.stringify(
    ["at-least", "at-most", "equals", "greater-than", "less-than", "not-equals", "one-of", "present"].sort()), "vocabulary drifted");
  ok(PREDICATE_ADMISSION["greater-than"].length === 1 && PREDICATE_ADMISSION["greater-than"][0] === "count", "ordering admitted beyond count");
  ok(!PREDICATE_ADMISSION["one-of"].includes("flag"), "one-of admitted a flag");
  const src = fs.readFileSync("src/lib/blueprintConditions.ts", "utf8");
  ok(!/\beval\(|new Function|new RegExp|\.exec\(/.test(src), "programmable machinery detected");
  ok(!/^import /m.test(src), "the law module must stay import-free");
});

T("EVALUATION IS DETERMINISTIC AND NORMALIZED: every predicate over fixtures; strings compare trimmed; present means answered (null, undefined, and empty string are absence); an unanswered param fails ordinary predicates rather than guessing", () => {
  const a = { guest_count: 150, daypart: " evening ", kids: true };
  const P = (predicate: string, param: string, operand?: unknown) =>
    evaluateCondition({ predicate, param, operand } as BlueprintCondition, a);
  ok(P("equals", "daypart", "evening"), "trim-normalized equals");
  ok(P("not-equals", "daypart", "lunch"), "not-equals");
  ok(P("greater-than", "guest_count", 100) && !P("greater-than", "guest_count", 150), "greater-than strict");
  ok(P("at-least", "guest_count", 150) && !P("at-least", "guest_count", 151), "at-least");
  ok(P("less-than", "guest_count", 151) && P("at-most", "guest_count", 150), "less-than / at-most");
  ok(P("one-of", "daypart", ["lunch", "evening"]) && !P("one-of", "daypart", ["lunch"]), "one-of trimmed membership");
  ok(P("present", "kids") && !evaluateCondition({ predicate: "present", param: "missing" } as BlueprintCondition, a), "present semantics");
  ok(!evaluateCondition({ predicate: "present", param: "empty" } as BlueprintCondition, { empty: "" }), "empty string is absence");
  ok(!P("equals", "unanswered", "x"), "an unanswered param never satisfies an ordinary predicate");
  ok(evaluateCondition({ all: [{ predicate: "at-least", param: "guest_count", operand: 100 } as BlueprintCondition,
    { predicate: "equals", param: "daypart", operand: "evening" } as BlueprintCondition] }, a), "all");
  ok(evaluateCondition({ any: [{ predicate: "equals", param: "daypart", operand: "lunch" } as BlueprintCondition,
    { predicate: "equals", param: "kids", operand: true } as BlueprintCondition] }, a), "any");
  ok(!evaluateCondition({ not: { predicate: "equals", param: "kids", operand: true } as BlueprintCondition }, a), "not");
});

T("COMPOSITION IS BOUNDED BY SHAPE: empty groups refuse; depth beyond the maximum refuses; predicate count beyond the maximum refuses; unknown predicates, missing params, unsupported types, and bad operands all name themselves — and the failure vocabulary is exactly the closed set", () => {
  const F = (c: unknown) => validateCondition(c, PARAMS, "t").map((p) => p.failure);
  ok(F({ all: [] }).includes("CONDITION_EMPTY_GROUP"), "empty all");
  ok(F({ any: [] }).includes("CONDITION_EMPTY_GROUP"), "empty any");
  const deep = { not: { not: { not: { predicate: "present", param: "kids" } } } };
  ok(F(deep).includes("CONDITION_DEPTH_EXCEEDED"), `depth ${CONDITION_MAX_DEPTH} not enforced`);
  const many = { all: Array.from({ length: CONDITION_MAX_PREDICATES + 1 }, () => ({ predicate: "present", param: "kids" })) };
  ok(F(many).includes("CONDITION_COUNT_EXCEEDED"), "count not enforced");
  ok(F({ predicate: "matches-regex", param: "daypart", operand: "x" }).includes("CONDITION_UNKNOWN_PREDICATE"), "unknown predicate");
  ok(F({ predicate: "equals", param: "ghost", operand: 1 }).includes("CONDITION_PARAM_MISSING"), "missing param");
  ok(F({ predicate: "greater-than", param: "daypart", operand: 5 }).includes("CONDITION_TYPE_UNSUPPORTED"), "type admission");
  ok(F({ predicate: "equals", param: "guest_count", operand: "many" }).includes("CONDITION_OPERAND_INVALID"), "operand type");
  ok(F({ predicate: "one-of", param: "daypart", operand: [] }).includes("CONDITION_OPERAND_INVALID"), "empty one-of operand");
  ok(F({ predicate: "present", param: "kids", operand: true }).includes("CONDITION_OPERAND_INVALID"), "present takes no operand");
  const dupe = validateCondition({ predicate: "present", param: "kids" },
    [...PARAMS, { key: "kids", type: "flag" }], "t").map((p) => p.failure);
  ok(dupe.includes("CONDITION_DUPLICATE_PARAM_KEY"), "duplicate keys unnamed");
  ok(CONDITION_FAILURES.length === 8, "failure vocabulary drifted");
});

T("THE BRANCH MAP IS COMPLETE: every conditioned unit — chapter, section, entry, itemSelection — appears exactly once with its decision and its condition; unconditioned units make no branch noise", () => {
  const cond = (predicate: string, param: string, operand?: unknown) => ({ predicate, param, operand } as BlueprintCondition);
  const structure = [{
    key: "ch1", condition: cond("present", "kids"),
    sections: [{
      key: "s1", condition: cond("at-least", "guest_count", 100),
      entries: [{
        key: "e1", condition: cond("equals", "daypart", "evening"),
        itemSelections: [{ name: "Kids Roll", condition: { not: cond("equals", "kids", true) } as BlueprintCondition }, { name: "Plain" }],
      }, { key: "e2", itemSelections: [] }],
    }],
  }];
  const map = branchMap(structure, { guest_count: 150, daypart: "evening", kids: true });
  ok(map.length === 4, `${map.length} decisions`);
  ok(JSON.stringify(map.map((d) => d.unit)) === JSON.stringify(["chapter", "section", "entry", "itemSelection"]), "unit order");
  ok(map.every((d) => (CONDITION_UNITS as readonly string[]).includes(d.unit)), "unit vocabulary");
  ok(map[0].included && map[1].included && map[2].included && !map[3].included, "decisions wrong");
  ok(map.every((d) => d.condition !== undefined), "the condition must ride each decision");
});

T("CONTENT INTEGRATION: the treatment registry stays TOTAL with the four condition paths registered as copied; a lawful unit condition validates; root-level conditions stay refused; a broken condition surfaces its named failure through the BP-2 validator", () => {
  for (const p of ["structure[].condition", "structure[].sections[].condition",
    "structure[].sections[].entries[].condition", "structure[].sections[].entries[].itemSelections[].condition"]) {
    ok(FIELD_TREATMENTS[p] === "copied", `${p} unregistered`);
  }
  const c = emptyContent();
  c.parameters.push({ key: "daypart", label: "Daypart", type: "choice", required: true, options: ["lunch", "evening"] });
  c.structure.push({ key: "ch1", title: "T", prose: "", sections: [{
    key: "s1", title: "S", prose: "", role: null,
    condition: { predicate: "equals", param: "daypart", operand: "evening" },
    entries: [] }] });
  ok(validateBlueprintContent(c).ok, "a lawful condition refused");
  const broken = JSON.parse(JSON.stringify(c)) as typeof c;
  broken.structure[0].sections[0].condition = { predicate: "equals", param: "ghost", operand: 1 } as never;
  const r = validateBlueprintContent(broken);
  ok(!r.ok && r.refusals.some((x) => x.includes("CONDITION_PARAM_MISSING")), "the failure must name itself through BP-2");
  const rooted = { ...emptyContent(), conditions: [] } as unknown;
  const rr = validateBlueprintContent(rooted);
  ok(!rr.ok && rr.refusals.some((x) => x.includes("never at the root")), "root conditions must stay refused");
});

T("SQL PARITY, ONE PATH: the migration's failure names and predicate names equal the client sets verbatim; instantiate_blueprint is REPLACED under its own name (no second instantiation function); the branch map and the full answers are written to the citation; every declared parameter is validated by type", () => {
  const sql = fs.readFileSync("supabase/v257_conditions.sql", "utf8");
  for (const f of CONDITION_FAILURES) {
    if (f === "CONDITION_DUPLICATE_PARAM_KEY") continue; // authoring-side law; SQL sees published content
    ok(sql.includes(`'${f}'`) || sql.includes(f), `SQL lacks failure ${f}`);
  }
  for (const p of CONDITION_PREDICATES) ok(sql.includes(`"${p}"`) || sql.includes(`'${p}'`), `SQL lacks predicate ${p}`);
  ok(sql.includes("create or replace function public.instantiate_blueprint"), "the act must be replaced, not duplicated");
  ok(!/create (or replace )?function public\.instantiate_blueprint_v2|instantiate_with_conditions/.test(sql), "a second path exists");
  ok(sql.includes("'branches', v_branches") || sql.includes("v_branches,"), "branches not written");
  ok(sql.includes("v_answers, v_branches"), "answers and branches must ride the citation insert");
  ok(sql.includes("PARAMETER_REQUIRED") && sql.includes("PARAMETER_INVALID"), "typed parameter validation missing");
  ok(!sql.includes("CONDITIONS_RESERVED"), "the reserved word survives in v257");
  const client = fs.readFileSync("src/lib/blueprintInstantiate.ts", "utf8");
  ok(!client.includes("CONDITIONS_RESERVED"), "the reserved word survives in the client vocabulary");
});

T("THE PROOFS EXIST AND THE WALLS STAND: server claims C-1..C-4 and LB-1..LB-3 present; the renderer stays blueprint-free; the dialog asks the declared questions (typed inputs, no defaults)", () => {
  const proof = fs.readFileSync("supabase/tests/v257_proof.sql", "utf8");
  for (const c of ["C-1", "C-2", "C-3", "C-4", "LB-1", "LB-2", "LB-3"]) ok(proof.includes(`PASS ${c}`), `proof missing ${c}`);
  for (const f of fs.readdirSync("src/lib/render")) {
    ok(!/blueprint/i.test(fs.readFileSync(`src/lib/render/${f}`, "utf8")), `renderer knows blueprints (${f})`);
  }
  const dlg = fs.readFileSync("src/components/BlueprintInstantiate.tsx", "utf8");
  ok(dlg.includes("data-param-count") && dlg.includes("data-param-choice") && dlg.includes("data-param-flag"), "typed inputs missing");
  ok(dlg.includes("loadRevisionParameters"), "the dialog must read the declared questions");
  ok(!/answers\[p\.key\] \?\? [^"]/.test(dlg.replace(/\?\? ""/g, "")), "a default answer is being supplied");
});

console.log(`\nv257.conditions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
