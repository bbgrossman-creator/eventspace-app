// v258 (BP-8) — AUTHORING-TIME COMPOSITION. The act COPIES lawful authored
// material from an exact source into a destination draft; afterward the
// material is ordinary destination content with NO edge back. Copy-only by
// construction: BP-2 shape out, fresh local ids, deep-copied structure,
// stable identity references, resolve-later absent, barred impossible.
// Minimum ancestry travels; unrelated siblings do not. Conditions copy as
// predicates (never evaluated); their parameters ride along or stage a
// named conflict. The collision matrix is deterministic. Server CO-1..CO-6
// prove exact-source locking, draft-only destination, tenancy, atomicity,
// independence, and append-only edge-free provenance on real Postgres.
import * as fs from "fs";
import {
  composeIntoDraft, conditionParamRefs, COMPOSITION_CONFLICTS, COLLISION_CHOICES,
  CompositionSelection, CompositionPlan,
} from "../blueprintCompose";
import { BlueprintContent, emptyContent, validateBlueprintContent, BARRED_KEYS } from "../blueprintContent";

let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const ok = (cond: boolean, what: string) => { if (!cond) throw new Error(what); };

const SEL = (over: Partial<CompositionSelection> = {}): CompositionSelection =>
  ({ chapters: [], sections: [], entries: [], parameters: [], presentation: false, constraints: false, ...over });
const PLAN = (over: Partial<CompositionPlan> = {}): CompositionPlan =>
  ({ onRoleCollision: "append", onPresentation: "keep-destination", parameterRemap: {}, ...over });
const anyDef = () => true;

function sourceContent(): BlueprintContent {
  const c = emptyContent();
  c.parameters.push(
    { key: "guest_count", label: "Guest count", type: "count", required: true },
    { key: "daypart", label: "Daypart", type: "choice", required: true, options: ["lunch", "evening"] },
  );
  c.structure.push({
    key: "src_ch", title: "Reception", prose: "p",
    sections: [{
      key: "src_se", title: "Dinner", prose: "", role: "role-dinner",
      condition: { predicate: "equals", param: "daypart", operand: "evening" },
      entries: [{
        key: "src_en", definitionId: "def-1", title: "Sushi",
        configuration: { values: { style: "live" }, scheme: "s1", annotations: "" },
        itemSelections: [{ name: "Salmon", include: true, note: "" }],
        choiceGroups: [{ key: "cg1", label: "Side", options: ["a", "b"], required: false }],
        pricingIntent: { form: "authored-suggestion", amount: 1200 }, notes: "n",
      }],
    }, {
      key: "src_se2", title: "Empty Sib", prose: "", role: "role-other", entries: [],
    }],
  });
  return c;
}

T("COPY-ONLY PRODUCES ORDINARY BP-2 CONTENT: a whole-chapter copy validates through BP-2's own validator, carries deep-copied structure, keeps the definition IDENTITY (never a revision), and the pricing rides as authored intent — no confirmed price, no confirmation stamp", () => {
  const src = sourceContent();
  const r = composeIntoDraft(src, emptyContent(), SEL({ chapters: ["src_ch"], parameters: ["guest_count", "daypart"] }), PLAN(), anyDef);
  ok(r.problems.length === 0, `problems: ${JSON.stringify(r.problems)}`);
  ok(validateBlueprintContent(r.content).ok, `invalid: ${JSON.stringify(validateBlueprintContent(r.content).refusals)}`);
  const en = r.content.structure[0].sections[0].entries[0];
  ok(en.definitionId === "def-1", "definition identity must survive");
  ok(en.pricingIntent?.form === "authored-suggestion", "pricing must ride as intent");
  ok(!JSON.stringify(r.content).includes("price_confirmed") && !JSON.stringify(r.content).includes("confirmed"), "no confirmation may appear");
});

T("FRESH LOCAL IDS: every copied node key differs from its source key — chapter, section, entry, choice group all regenerate, so no authored-id collision is possible", () => {
  const src = sourceContent();
  const r = composeIntoDraft(src, emptyContent(), SEL({ chapters: ["src_ch"] }), PLAN(), anyDef);
  const ch = r.content.structure[0];
  ok(ch.key !== "src_ch", "chapter key not fresh");
  ok(ch.sections[0].key !== "src_se", "section key not fresh");
  ok(ch.sections[0].entries[0].key !== "src_en", "entry key not fresh");
  ok(ch.sections[0].entries[0].choiceGroups[0].key !== "cg1", "choice-group key not fresh");
});

T("DEEP-COPY INDEPENDENCE: mutating the source content after the act changes nothing in the copied destination content — no shared reference survives", () => {
  const src = sourceContent();
  const r = composeIntoDraft(src, emptyContent(), SEL({ chapters: ["src_ch"] }), PLAN(), anyDef);
  const before = JSON.stringify(r.content);
  src.structure[0].title = "MUTATED";
  src.structure[0].sections[0].entries[0].itemSelections[0].name = "MUTATED";
  ok(JSON.stringify(r.content) === before, "the source and copy share memory");
});

T("MINIMUM LAWFUL ANCESTRY: selecting one ENTRY brings its section and chapter and nothing else; the unrelated empty sibling section does not travel", () => {
  const src = sourceContent();
  const r = composeIntoDraft(src, emptyContent(), SEL({ entries: ["src_en"] }), PLAN(), anyDef);
  ok(r.content.structure.length === 1, "chapter ancestry missing or excess");
  ok(r.content.structure[0].sections.length === 1, "only the entry's section should travel");
  ok(r.content.structure[0].sections[0].entries.length === 1, "the entry must travel");
  ok(r.content.structure[0].sections[0].role === "role-dinner", "wrong section traveled");
});

T("CONDITIONS COPY AS PREDICATES, NOT OUTCOMES, AND THEIR PARAMETERS RIDE ALONG: a copied condition references daypart; daypart is auto-carried even if unselected; the predicate arrives intact and unevaluated", () => {
  const src = sourceContent();
  const r = composeIntoDraft(src, emptyContent(), SEL({ chapters: ["src_ch"] }), PLAN(), anyDef);  // no explicit params
  const cond = r.content.structure[0].sections[0].condition;
  ok(cond !== undefined && "predicate" in cond && cond.predicate === "equals" && cond.param === "daypart", "the predicate was altered or evaluated");
  ok(r.content.parameters.some((p) => p.key === "daypart"), "the referenced parameter did not ride along");
  const refs = new Set<string>();
  conditionParamRefs(cond, refs);
  ok(refs.has("daypart"), "conditionParamRefs missed the reference");
});

T("INCOMPATIBLE PARAMETER KEY REFUSES: a destination already carrying `daypart` as a COUNT stages COMPOSE_PARAM_TYPE_INCOMPATIBLE rather than overwriting or silently coercing", () => {
  const src = sourceContent();
  const dst = emptyContent();
  dst.parameters.push({ key: "daypart", label: "Daypart", type: "count", required: true });
  const r = composeIntoDraft(src, dst, SEL({ chapters: ["src_ch"] }), PLAN(), anyDef);
  ok(r.problems.some((p) => p.conflict === "COMPOSE_PARAM_TYPE_INCOMPATIBLE" && p.at === "daypart"), `expected type clash: ${JSON.stringify(r.problems)}`);
});

T("DEFINITION UNAVAILABLE REFUSES: an entry whose definition identity is absent from the destination tenant stages COMPOSE_DEFINITION_UNAVAILABLE — never an embedded definition, never a guessed substitute", () => {
  const src = sourceContent();
  const r = composeIntoDraft(src, emptyContent(), SEL({ chapters: ["src_ch"] }), PLAN(), (id) => id !== "def-1");
  ok(r.problems.some((p) => p.conflict === "COMPOSE_DEFINITION_UNAVAILABLE"), "an unavailable definition must refuse");
});

T("THE COLLISION MATRIX IS DETERMINISTIC: a shared section role appends by default, inserts at front on insert-at, and refuses on refuse (COMPOSE_ROLE_COLLISION) — never a silent overwrite; the copied role never replaces the destination's", () => {
  const src = sourceContent();
  const dst = emptyContent();
  dst.structure.push({ key: "d_ch", title: "Dest", prose: "", sections: [
    { key: "d_se", title: "Held", prose: "", role: "role-dinner", entries: [] }] });
  const appended = composeIntoDraft(src, dst, SEL({ chapters: ["src_ch"] }), PLAN({ onRoleCollision: "append" }), anyDef);
  ok(appended.content.structure.length === 2 && appended.content.structure[0].key === "d_ch", "append must keep destination first");
  const front = composeIntoDraft(src, dst, SEL({ chapters: ["src_ch"] }), PLAN({ onRoleCollision: "insert-at", insertAt: 0 }), anyDef);
  ok(front.content.structure[0].title === "Reception", "insert-at front failed");
  const refused = composeIntoDraft(src, dst, SEL({ chapters: ["src_ch"] }), PLAN({ onRoleCollision: "refuse" }), anyDef);
  ok(refused.problems.some((p) => p.conflict === "COMPOSE_ROLE_COLLISION"), "refuse must stage the collision");
  ok(dst.structure[0].sections[0].title === "Held", "the destination content must never be mutated in place");
});

T("PRESENTATION: PORTABLE-ONLY, NO SILENT BLEND — replace-with-source takes the source portable; keep-destination omits it by name; a fresh destination simply receives the portable. Fixed-package pricing without a policy refuses", () => {
  const src = sourceContent();
  src.presentation = { portable: { themeKey: "classic", delta: {}, sectionDress: {}, sectionPins: {}, documentPin: null }, provenance: null };
  const fresh = composeIntoDraft(src, emptyContent(), SEL({ chapters: ["src_ch"], presentation: true }), PLAN(), anyDef);
  ok(fresh.content.presentation?.portable.themeKey === "classic", "fresh destination should receive portable");
  const dst = emptyContent();
  dst.presentation = { portable: { themeKey: "dest", delta: {}, sectionDress: {}, sectionPins: {}, documentPin: null }, provenance: null };
  const kept = composeIntoDraft(src, dst, SEL({ chapters: ["src_ch"], presentation: true }), PLAN({ onPresentation: "keep-destination" }), anyDef);
  ok(kept.content.presentation?.portable.themeKey === "dest" && kept.omissions.some((o) => o.includes("kept")), "keep-destination must hold and name the omission");
  const replaced = composeIntoDraft(src, dst, SEL({ chapters: ["src_ch"], presentation: true }), PLAN({ onPresentation: "replace-with-source" }), anyDef);
  ok(replaced.content.presentation?.portable.themeKey === "classic", "replace must take source portable");
  const fx = sourceContent();
  fx.structure[0].sections[0].entries[0].pricingIntent = { form: "fixed-package", amount: 999, policy: "" };
  const r = composeIntoDraft(fx, emptyContent(), SEL({ chapters: ["src_ch"] }), PLAN(), anyDef);
  ok(r.problems.some((p) => p.conflict === "COMPOSE_FIXED_PRICE_NO_POLICY"), "policyless fixed-package must refuse");
});

T("§5 NOTHING BARRED CAN BE COMPOSED: the copied content's keys never intersect BP-2's barred set; the module constructs no confirmed-price or event-identity field", () => {
  const src = sourceContent();
  const r = composeIntoDraft(src, emptyContent(), SEL({ chapters: ["src_ch"], parameters: ["guest_count", "daypart"] }), PLAN(), anyDef);
  const seen: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === "object" && v !== null) for (const [k, c] of Object.entries(v)) { seen.push(k); walk(c); }
  };
  walk(r.content);
  ok(seen.filter((k) => BARRED_KEYS.has(k)).length === 0, "a barred key was composed");
});

T("NEGATIVE PINS + ONE MODEL: no compose file carries a live-edge verb (attach/inherit/include-live/link/sync/update-from-source/composed-at-runtime); the module imports only the content shape and the condition law; the conflict and collision vocabularies are closed; the server proof covers CO-1..CO-6; provenance is append-only by absence of update/delete policy; the destination instantiation path never reads compositions", () => {
  const pure = fs.readFileSync("src/lib/blueprintCompose.ts", "utf8");
  const data = fs.readFileSync("src/lib/blueprintComposeSupabase.ts", "utf8");
  const ui = fs.readFileSync("src/components/CopyIntoDraft.tsx", "utf8");
  const forbidden = /\b(inherit|composed at runtime|composedAtRuntime|updateFromSource|update_from_source|resync)\b/i;
  for (const [name, src] of [["compose", pure], ["composeSupabase", data], ["CopyIntoDraft", ui]] as const) {
    ok(!forbidden.test(src), `${name} carries a live-edge verb`);
  }
  // "link"/"sync"/"attach" as whole words in user-facing or logic contexts
  ok(!/\bsync\b/i.test(pure) && !/\bsync\b/i.test(data), "sync vocabulary in logic");
  const imports = [...pure.matchAll(/from "([^"]+)";/g)].map((m) => m[1]).sort();
  ok(JSON.stringify(imports) === JSON.stringify(["./blueprintConditions", "./blueprintContent"]), `compose imports: ${JSON.stringify(imports)}`);
  ok(COMPOSITION_CONFLICTS.length === 12 && COLLISION_CHOICES.length === 3, "vocabularies drifted");
  const sql = fs.readFileSync("supabase/v258_composition.sql", "utf8");
  ok(!/create policy bpc_(update|delete)/.test(sql), "provenance has a mutation path");
  ok((sql.match(/create policy bpc_/g) ?? []).length === 2, "provenance policy count ≠ 2");
  ok(sql.includes("for share") && sql.includes("for update"), "exact-source share-lock / draft update-lock missing");
  const proof = fs.readFileSync("supabase/tests/v258_proof.sql", "utf8");
  for (const c of ["CO-1", "CO-2", "CO-3", "CO-4", "CO-5", "CO-6"]) ok(proof.includes(`PASS ${c}`), `proof missing ${c}`);
  // the instantiation act (v257) reads no composition table
  const inst = fs.readFileSync("supabase/v257_conditions.sql", "utf8");
  ok(!inst.includes("blueprint_compositions"), "instantiation reads composition provenance");
  // no v182 legacy source
  ok(!data.includes('.from("blueprints")') && !data.includes('@/lib/blueprints"'), "legacy v182 is reachable as a source");
});

console.log(`\nv258.composition: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
