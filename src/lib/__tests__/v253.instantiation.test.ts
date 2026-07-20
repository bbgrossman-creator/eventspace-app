// v253 (BP-3) — INSTANTIATION, client side. THE ACT itself is server-proven
// on real Postgres (supabase/tests/v253_proof.sql — I-1..I-9: the act, dual
// provenance, independence, early/middle/late atomicity, never-guess
// staging, match law, lifecycle, tenancy). This suite proves the client
// law: the staged-conflict parser, the closed conflict vocabulary, and the
// NEGATIVE-LAW PINS — no update-from-blueprint verb, no sync, no replay,
// no live edge, no legacy v182 dependency, anywhere in the slice.
import * as fs from "fs";
import {
  CONFLICT_KINDS, parseConflicts,
} from "../blueprintInstantiate";

let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const ok = (cond: boolean, what: string) => { if (!cond) throw new Error(what); };

const sql = fs.readFileSync("supabase/v253_instantiation.sql", "utf8");
// v257 AMENDMENT: instantiate_blueprint was REPLACED (same name, same
// transaction — BP-7). Vocabulary claims grep the LIVE body.
const liveSql = fs.readFileSync("supabase/v257_conditions.sql", "utf8");
const pure = fs.readFileSync("src/lib/blueprintInstantiate.ts", "utf8");
const data = fs.readFileSync("src/lib/blueprintInstantiateSupabase.ts", "utf8");
const surface = fs.readFileSync("src/components/BlueprintInstantiate.tsx", "utf8");
const proof = fs.readFileSync("supabase/tests/v253_proof.sql", "utf8");

T("THE STAGED PARSER: a BLUEPRINT_CONFLICTS refusal parses to its named list verbatim; a plain failure returns null and travels untouched; malformed payloads return null (never guessed into a list)", () => {
  const msg = 'BLUEPRINT_CONFLICTS: [{"kind":"CONFIG_SCHEME_GONE","at":"Sushi","scheme":"live-chef","detail":"gone"},{"kind":"PARAMETER_REQUIRED","detail":"guest_count"}]';
  const parsed = parseConflicts(msg)!;
  ok(parsed.length === 2 && parsed[0].kind === "CONFIG_SCHEME_GONE" && parsed[0].at === "Sushi" && parsed[1].kind === "PARAMETER_REQUIRED", `parsed: ${JSON.stringify(parsed)}`);
  ok(parseConflicts("connection reset") === null, "plain failure must not parse");
  ok(parseConflicts("BLUEPRINT_CONFLICTS: not-json") === null, "malformed payload must not parse");
  ok(parseConflicts('prefix noise BLUEPRINT_CONFLICTS: [{"kind":"DRESS_NO_MATCH"}]')![0].kind === "DRESS_NO_MATCH", "marker found mid-message");
});

T("THE CLOSED CONFLICT VOCABULARY (AMENDED v257): the act's LIVE body is the v257 replacement, so the vocabularies compare against it — every kind the live body can raise is declared in CONFLICT_KINDS, and every declared kind is raised there (condition failures arrive through the validator's indirection and are counted via its return set)", () => {
  const raised = new Set([...liveSql.matchAll(/'kind','([A-Z_]+)'/g)].map((m) => m[1]));
  // failures staged via `'kind', v_prob` — the validator's named returns:
  for (const m of liveSql.matchAll(/'(CONDITION_[A-Z_]+)'/g)) raised.add(m[1]);
  raised.delete("CONDITION_DUPLICATE_PARAM_KEY_"); // guard against partials
  const declared = new Set<string>(CONFLICT_KINDS);
  // CONDITION_DUPLICATE_PARAM_KEY is authoring-side law (BP-2); the act
  // sees published content whose keys the validator already proved unique.
  declared.delete("CONDITION_DUPLICATE_PARAM_KEY");
  for (const k of raised) ok(declared.has(k), `live body raises undeclared kind ${k}`);
  for (const k of declared) ok(raised.has(k), `declared kind ${k} is raised nowhere in the live body`);
});

T("§4 NEGATIVE-LAW PINS in the migration: no update-from/sync/replay verb exists; the citation table is append-only by absence (select+insert policies only); the only blueprint reference from the act's writes is the citation record itself", () => {
  ok(!/create (or replace )?function public\.(update_design_from_blueprint|sync_|replay_|refresh_from_blueprint)/i.test(sql), "a forbidden verb exists");
  ok(!/\bresync|\bsubscription/i.test(sql), "sync vocabulary appears");
  const bpinPolicies = (sql.match(/create policy bpin_/g) ?? []).length;
  ok(bpinPolicies === 2, `citation table has ${bpinPolicies} policies, want exactly 2`);
  ok(!/create policy bpin_(update|delete)/.test(sql), "a mutation path exists on the citation");
  // design tables gain no blueprint FK: every 'references public.blueprint'
  // in this migration lives inside the blueprint_instantiations DDL block.
  const ddlStart = sql.indexOf("create table if not exists public.blueprint_instantiations");
  const ddlEnd = sql.indexOf(");", ddlStart);
  const refs = [...sql.matchAll(/references public\.blueprint_[a-z_]+/g)];
  for (const m of refs) {
    ok(m.index! > ddlStart && m.index! < ddlEnd, "a blueprint reference exists outside the citation record — a live edge");
  }
  ok(sql.includes("unique"), "one design, one origin (unique version_id) missing");
});

T("§4 THE SERVER PROOF EXISTS AND COVERS THE LAW: I-1..I-9 present, including early/middle/late atomicity, independence, dual provenance, never-guess, match law, tenancy", () => {
  for (const claim of ["I-1", "I-2", "I-3", "I-4", "I-5", "I-6", "I-7", "I-8", "I-9"]) {
    ok(proof.includes(`PASS ${claim}`), `server proof missing ${claim}`);
  }
  ok(proof.includes("EARLY FAILURE") && proof.includes("MIDDLE FAILURE") && proof.includes("LATE FAILURE"), "atomicity stages missing");
  ok(proof.includes("DUAL PROVENANCE") && proof.includes("INDEPENDENCE"), "core claims missing");
});

T("§11+§10 PINNED IN THE ACT: every arriving item price lands unconfirmed; the fixed-package branch alone confirms and stamps its decision; the seed parameter refuses null/non-positive; conditions refuse with the BP-7 reservation", () => {
  ok(sql.includes("set price_confirmed = false where component_id"), "item debt missing");
  ok(sql.includes("package_price_confirmed = false"), "package debt missing");
  ok(/fixed-package[\s\S]{0,400}package_price_confirmed = true/.test(sql), "the exception missing");
  ok(sql.includes("'policy', v_intent->>'policy'"), "the decision stamp missing");
  ok(sql.includes("PARAMETER_REQUIRED"), "seed parameter law missing");
  ok(sql.includes("CONDITIONS_RESERVED"), "the BP-7 reservation missing");
});

T("NO LEGACY, NO LIVE IMPORTS: the slice's three client files import nothing from the legacy v182 module or table, nothing downstream imports blueprint modules into the renderer, and the surface offers no update/sync/re-link verb", () => {
  for (const [name, src] of [["blueprintInstantiate.ts", pure], ["blueprintInstantiateSupabase.ts", data], ["BlueprintInstantiate.tsx", surface]] as const) {
    ok(!src.includes('@/lib/blueprints"') && !src.includes('./blueprints"'), `${name} imports the legacy module`);
    ok(!src.includes('.from("blueprints")'), `${name} reads the legacy table`);
    ok(!/override/i.test(src), `'override' in ${name}`);
    ok(!/update.?from.?blueprint|\bsync\b|\bre-?link\b|\breplay\b/i.test(src), `a forbidden verb appears in ${name}`);
  }
  for (const f of fs.readdirSync("src/lib/render")) {
    const rsrc = fs.readFileSync(`src/lib/render/${f}`, "utf8");
    ok(!/blueprint/i.test(rsrc), `the renderer knows blueprints exist (${f}) — the wall is breached`);
  }
});

console.log(`\nv253.instantiation: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
