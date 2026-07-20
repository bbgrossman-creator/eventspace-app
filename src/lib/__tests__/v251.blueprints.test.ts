// v251 (BP-1) — THE SHELF: the Publication Blueprints constitution's first
// slice, unit-proven. States earn their verbs (§3, Archived does not exist);
// publication requires intent AND capability (§3/§13 — the amendment law);
// immutability is supersession (§2); the retired shelf offers nothing while
// history stands; the schema carries the same law verbatim (grep-pinned);
// the banned vocabulary is absent; and the shelf reaches into no event work.
import * as fs from "fs";
import {
  PUBLISH_DECLARATION, CURATE_ORGANIZATIONAL_KNOWLEDGE,
  REVISION_STATES, IDENTITY_STATUSES,
  revisionVerbs, identityVerbs, publishRefusal, canPublish,
  assertDraftEditable, assertDiscardable, nextRevisionNumber,
  planSupersession, offeredRevisionId,
} from "../blueprintShelf";

let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const eq = (a: unknown, b: unknown, what: string) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`${what}: ${ja} !== ${jb}`);
};
const throws = (fn: () => void, msg: string, what: string) => {
  try { fn(); } catch (e) {
    if ((e as Error).message !== msg) throw new Error(`${what}: threw "${(e as Error).message}", wanted "${msg}"`);
    return;
  }
  throw new Error(`${what}: did not throw`);
};

const pureSrc = fs.readFileSync("src/lib/blueprintShelf.ts", "utf8");
const dataSrc = fs.readFileSync("src/lib/blueprintShelfSupabase.ts", "utf8");
const sql = fs.readFileSync("supabase/v251_blueprints_shelf.sql", "utf8");

const ident = (over: Partial<{ status: "active" | "retired"; published_revision_id: string | null }> = {}) =>
  ({ status: "active" as const, published_revision_id: null, ...over });

T("§3 THE VERB ADMISSION TEST: each state's verb set is exact; Archived exists nowhere — it changed no verbs and therefore does not exist", () => {
  eq(revisionVerbs("draft"), ["edit", "discard", "publish"], "draft verbs");
  eq(revisionVerbs("published"), ["instantiate", "begin_new_draft", "retire_identity"], "published verbs");
  eq(revisionVerbs("superseded"), [], "superseded acts on nothing — readable history is not a verb");
  eq(identityVerbs(ident({ status: "retired", published_revision_id: "r7" })), ["view_history", "reinstate"], "retired identity verbs");
  eq(identityVerbs(ident({ published_revision_id: "r7" })), ["instantiate", "begin_draft", "retire", "view_history"], "active+published identity verbs");
  eq(identityVerbs(ident()), ["begin_draft", "retire", "view_history"], "active identity with nothing published cannot offer instantiate");
  eq(REVISION_STATES, ["draft", "published", "superseded"], "closed revision state set");
  eq(IDENTITY_STATUSES, ["active", "retired"], "closed identity status set");
  for (const src of [pureSrc, dataSrc, sql]) {
    if (/archiv/i.test(src)) throw new Error("'archived' appears in a shelf source");
  }
});

T("§3+§13 THE INTENT LAW: capability opens the door, the declaration walks through it — neither substitutes for the other, and near-miss wording is refused", () => {
  const yes = () => true, no = () => false;
  eq(publishRefusal(PUBLISH_DECLARATION, no), "CAPABILITY_REQUIRED", "no capability");
  eq(publishRefusal("", yes), "PUBLISH_INTENT_REQUIRED", "no declaration");
  eq(publishRefusal("this revision is now organizational knowledge.", yes), "PUBLISH_INTENT_REQUIRED", "case near-miss refused");
  eq(publishRefusal(PUBLISH_DECLARATION + " ", yes), "PUBLISH_INTENT_REQUIRED", "trailing-space near-miss refused");
  eq(publishRefusal(PUBLISH_DECLARATION, yes), null, "both present");
  if (!canPublish(PUBLISH_DECLARATION, yes) || canPublish(PUBLISH_DECLARATION, no)) throw new Error("canPublish disagrees with publishRefusal");
  if (CURATE_ORGANIZATIONAL_KNOWLEDGE !== "knowledge.curate") throw new Error("the capability key drifted from the house licensing layer");
});

T("§3 ONE WORDING, ONE SOURCE: the constitutional sentence appears exactly once in src/lib and VERBATIM in the SQL CHECK and RPC guard — one law, two enforcement points, zero drift", () => {
  const sentence = PUBLISH_DECLARATION;
  const countIn = (s: string) => s.split(sentence).length - 1;
  if (countIn(pureSrc) !== 1) throw new Error(`wording appears ${countIn(pureSrc)}× in blueprintShelf.ts, want exactly 1`);
  if (countIn(dataSrc) !== 0) throw new Error("the data layer must import the wording, never restate it");
  if (countIn(sql) !== 2) throw new Error(`wording appears ${countIn(sql)}× in the migration, want exactly 2 (CHECK + RPC guard)`);
  if (!sql.includes("bsa_publish_requires_intent")) throw new Error("the intent CHECK constraint is missing");
  if (!sql.includes("PUBLISH_INTENT_REQUIRED")) throw new Error("the RPC intent guard is missing");
});

T("§2 IMMUTABILITY IS SUPERSESSION: drafts edit and discard; published and superseded refuse; publish plans chain the prior designation; revision numbers are monotone", () => {
  assertDraftEditable({ state: "draft" });
  throws(() => assertDraftEditable({ state: "published" }), "BLUEPRINT_REVISION_IMMUTABLE", "published edit refused");
  throws(() => assertDraftEditable({ state: "superseded" }), "BLUEPRINT_REVISION_IMMUTABLE", "superseded edit refused");
  assertDiscardable({ state: "draft" });
  throws(() => assertDiscardable({ state: "published" }), "PUBLISHED_REVISIONS_ARE_NEVER_DELETED", "§14 published never hard-deleted");
  const first = planSupersession(ident(), { id: "r1", state: "draft" });
  eq(first, { publish: "r1", supersede: null, supersedes_revision_id: null, designation: "r1" }, "first publish supersedes nothing");
  const second = planSupersession(ident({ published_revision_id: "r1" }), { id: "r2", state: "draft" });
  eq(second, { publish: "r2", supersede: "r1", supersedes_revision_id: "r1", designation: "r2" }, "second publish chains the first");
  throws(() => planSupersession(ident({ status: "retired" }), { id: "r2", state: "draft" }), "IDENTITY_RETIRED", "retired identity publishes nothing");
  throws(() => planSupersession(ident(), { id: "r1", state: "published" }), "ONLY_DRAFTS_PUBLISH", "only drafts publish");
  eq(nextRevisionNumber([]), 1, "first revision is 1");
  eq(nextRevisionNumber([{ revision_number: 1 }, { revision_number: 3 }]), 4, "monotone past the max");
});

T("§3 THE RETIRED SHELF OFFERS NOTHING while the designation is retained for reinstatement", () => {
  eq(offeredRevisionId(ident({ published_revision_id: "r7" })), "r7", "active identity offers its designation");
  eq(offeredRevisionId(ident({ status: "retired", published_revision_id: "r7" })), null, "retired offers nothing — the designation survives for reinstate");
  eq(offeredRevisionId(ident()), null, "nothing published, nothing offered");
});

T("§14 THE SCHEMA CARRIES THE LAW: immutability trigger present; acts ledger append-only by ABSENCE (select+insert policies only); deletes reach drafts only; empty identities alone are deletable", () => {
  if (!sql.includes("BLUEPRINT_REVISION_IMMUTABLE")) throw new Error("immutability trigger missing");
  if (!sql.includes("trg_blueprint_revision_guard")) throw new Error("trigger not attached");
  const actPolicies = (sql.match(/create policy bsa_/g) ?? []).length;
  if (actPolicies !== 2) throw new Error(`acts ledger has ${actPolicies} policies, want exactly 2 (select+insert; no update/delete path exists)`);
  if (/create policy bsa_(update|delete)/.test(sql)) throw new Error("a mutation path exists on the append-only ledger");
  if (!/bpr_delete_drafts[\s\S]{0,200}state = 'draft'/.test(sql)) throw new Error("revision deletes are not confined to drafts");
  if (!/bpi_delete_empty[\s\S]{0,400}published_revision_id is null/.test(sql)) throw new Error("identity deletion is not confined to empty identities");
});

T("§1+§7 VOCABULARY PINS: 'override' and the banned noun absent from every shelf source; the pure module imports only the licensing layer — the shelf knows no design, booking, proposal, or publication", () => {
  for (const [name, src] of [["blueprintShelf.ts", pureSrc], ["blueprintShelfSupabase.ts", dataSrc], ["v251_blueprints_shelf.sql", sql]] as const) {
    if (/override/i.test(src)) throw new Error(`'override' appears in ${name}`);
    if (/blueprint publication/i.test(src)) throw new Error(`the banned noun appears in ${name}`);
  }
  const pureImports = [...pureSrc.matchAll(/from "([^"]+)";/g)].map((m) => m[1]);
  eq(pureImports, ["./featureCapabilities"], "pure module imports");
  const dataImports = [...dataSrc.matchAll(/from "([^"]+)";/g)].map((m) => m[1]);
  eq(dataImports, ["./supabase", "./blueprintShelf"], "data module imports");
  for (const banned of ["designResolver", "designStageModel", "proposals", "publication", "studio", "./blueprints"]) {
    if (pureSrc.includes(`from "./${banned}"`) || dataSrc.includes(`from "./${banned}"`)) {
      throw new Error(`the shelf reaches into ${banned}`);
    }
  }
});

console.log(`\nv251.blueprints: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
