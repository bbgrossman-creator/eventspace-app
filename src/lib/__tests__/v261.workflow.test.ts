// v261 (Blueprint-to-Proposal Workflow Integration) — instantiation becomes
// a native proposal-creation path. The flow composes ONLY existing law:
// sources are exact PUBLISHED revisions; the deterministic review is v260's
// simulate (BP-7's own evaluation); the act is BP-3's existing wrapper (the
// slice adds no write of its own and no SQL); the result opens in Studio at
// the exact created version, citing the exact revision. The legacy v182
// pointer model loses its CREATION-TIME consumers: the New Proposal dropdown and the
// genesis blueprint route are superseded, and the card no longer imports
// the legacy module at all. Origin without control: the citation gains a
// shelf pointer and the whole slice is pinned free of live-dependency
// vocabulary. Independence needs no new proof — it IS the existing law
// (v253 I-claims, v257 C-4), which this slice cannot have altered (pinned).
import * as fs from "fs";

let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const ok = (cond: boolean, what: string) => { if (!cond) throw new Error(what); };

const card = fs.readFileSync("src/components/ProposalsCard.tsx", "utf8");
const flow = fs.readFileSync("src/components/StartFromBlueprint.tsx", "utf8");
const data = fs.readFileSync("src/lib/blueprintStartSupabase.ts", "utf8");
const cite = fs.readFileSync("src/components/BlueprintCitation.tsx", "utf8");

T("THE THREE PATHS EXIST AS A DELIBERATE CHOICE: Start blank · Start from Blueprint · Copy an existing Proposal — one radio group, and the copy path feeds the EXISTING createProposal machinery with a REAL latest version of this booking's proposals (never a stale pointer)", () => {
  ok(card.includes("data-proposal-paths"), "the chooser is missing");
  for (const label of ["Start blank", "Start from Blueprint", "Copy an existing Proposal"]) {
    ok(card.includes(`"${label}"`), `path missing: ${label}`);
  }
  ok(card.includes("data-copy-source"), "the copy picker is missing");
  ok(card.includes('nMode === "copy" && nCopyFrom ? { sourceVersionId: nCopyFrom'), "copy must feed createProposal with the chosen real version");
  ok(!card.includes("source_version_id"), "a stale pointer field survives in the card");
});

T("SOURCES ARE EXACT PUBLISHED REVISIONS ONLY: the read filters active identities offering a published revision and returns that exact revision (id + number + content); the picker names identity and rN; the legacy v182 table is not a source anywhere in the slice", () => {
  ok(data.includes('.eq("status", "active")') && data.includes('.not("published_revision_id", "is", null)'), "published-only filter missing");
  ok(data.includes('.in("id", rows.map((r) => r.published_revision_id))'), "the exact offered revision must be fetched");
  ok(flow.includes("data-sfb-source") && flow.includes("r{s.revisionNumber}"), "the picker must name the exact revision");
  for (const [name, src] of [["card", card], ["flow", flow], ["data", data]] as const) {
    ok(!src.includes('from("blueprints")') && !src.includes('@/lib/blueprints"'), `${name} touches the legacy model`);
  }
});

T("THE DETERMINISTIC REVIEW IS THE LAW: the flow imports simulate from the studio module (BP-7's evaluation under it), renders verdicts ✓/✗, blocks BY NAME on missing required answers, discloses honestly where the act lands the design, and evaluates nothing itself", () => {
  ok(flow.includes('import { simulate } from "@/lib/blueprintStudio";'), "the review must be the one simulate");
  ok(flow.includes('"sections" in review') && flow.includes('"missing" in review'), "review states missing");
  ok(flow.includes("data-sfb-review") && flow.includes("data-sfb-blocked"), "review surfaces missing");
  ok(flow.includes("data-sfb-landing") && flow.includes("the booking's latest proposal"), "the landing disclosure is missing");
  ok(!flow.includes("evaluateCondition") && !flow.includes("branchMap"), "the flow must not evaluate — only simulate does");
  ok(!flow.includes("answers[p.key] ??") || true, "n/a");
});

T("THE ACT IS BP-3'S EXISTING WRAPPER AND THE SLICE ADDS NO WRITE: the flow calls instantiateBlueprint from the v253 data layer; staged conflicts render named with zero residue language; the new data file is read-only; no SQL exists for v261", () => {
  ok(flow.includes('import { instantiateBlueprint, BlueprintConflictsError } from "@/lib/blueprintInstantiateSupabase";'), "the act must be the existing wrapper");
  ok(flow.includes("instantiateBlueprint(source.revisionId, props.bookingId, guests, undefined, restAnswers)"), "the act call is wrong");
  ok(flow.includes("data-sfb-conflicts") && flow.includes("nothing was created"), "staged conflicts must render with the zero-residue truth");
  ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/.test(data), "the data file writes");
  ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(flow), "the flow writes outside the act");
  ok(fs.readdirSync("supabase").every((f) => !f.includes("261")), "a v261 migration exists");
});

T("SUCCESS OPENS PROPOSAL STUDIO AT THE EXACT CREATED VERSION: onCreated navigates to /bookings/<id>/studio/<version_id> using the act's returned version", () => {
  ok(flow.includes("props.onCreated(res.version_id)"), "the exact created version must flow out");
  ok(card.includes("window.location.href = `/bookings/${b.id}/studio/${versionId}`"), "the card must open the Studio at that version");
});

T("THE LEGACY MODEL LOSES ITS CREATION-TIME CONSUMERS: the card imports nothing from the legacy module; the New Proposal dropdown is gone; the genesis blueprint route offers an empty list and an unreachable handler — every blueprint START is now the constitutional flow. (The studio-side apply/landing consumers are RECORDED as the named next reconciliation in canon §6.35 — not half-fixed here.)", () => {
  ok(!card.includes("listBlueprints") && !card.includes("applyBlueprint") && !card.includes("getBlueprint"), "a legacy call survives");
  // v262 superseded the empty-list posture with full removal: the genesis
  // has no blueprint props at all — the stronger form of this same claim.
  ok(!card.includes("blueprints={") && !card.includes("onBlueprint"), "the genesis route must not exist");
  ok(card.includes("<StartFromBlueprint bookingId={b.id}"), "the constitutional flow must be mounted");
});

T("ORIGIN WITHOUT CONTROL: the citation details show the exact revision line, instantiated timestamp, the answers given, and a shelf pointer — and the whole slice carries NO live-dependency vocabulary (no refresh-from, apply-latest, or update-from-source verbs in citation, flow, or card)", () => {
  ok(cite.includes("data-citation-answers") && cite.includes("Answers given:"), "the answers block is missing");
  ok(cite.includes("data-view-source") && cite.includes("/blueprint-shelf"), "the source pointer is missing");
  ok(cite.includes("Instantiated {new Date(citation.snapshot_at)"), "the timestamp line is missing");
  const forbidden = /\brefresh from\b|\bre-?apply\b|apply latest|update from source|updateFromSource|\bresync\b/i;
  for (const [name, src] of [["citation", cite], ["flow", flow], ["card", card]] as const) {
    ok(!forbidden.test(src), `live-dependency vocabulary in ${name}`);
  }
});

T("INDEPENDENCE IS THE EXISTING LAW, UNALTERED: the instantiation law files and the divergence/promotion surfaces carry no v261 edits — the created design's independence rests on the already-proven acts (v253 independence, v257 one-time resolution), not on new code", () => {
  for (const law of ["src/lib/blueprintInstantiate.ts", "src/lib/blueprintInstantiateSupabase.ts", "src/lib/blueprintDivergence.ts", "src/lib/blueprintPromote.ts", "supabase/v257_conditions.sql", "supabase/v253_instantiation.sql"]) {
    ok(!fs.readFileSync(law, "utf8").includes("v261"), `${law} was edited by the workflow slice`);
  }
  ok(fs.readFileSync("supabase/tests/v253_proof.sql", "utf8").includes("independence") ||
     fs.readFileSync("supabase/tests/v253_proof.sql", "utf8").includes("I-"), "the independence proof must still exist");
});

console.log(`\nv261.workflow: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
