// v265 (PL-3 Phase A · Publish) — the constitutional core, pinned. The
// fingerprint law (canonical serialization + SHA-256, not djb2); the
// completeness core (form-independent) + offer profiles; the review evaluator
// holding no org constants; the sealed-version and archive-precedes-publish
// orderings; no parallel send path (sendVersion retired from the send role);
// sent reachable only through publish. Server truths (atomicity, all refusal
// teeth, the I-15 headline, immutability under the app role) are proven on real
// Postgres in supabase/tests/v265_proof.sql (PB-1..PB-11, all green).
import * as fs from "fs";
import { canonicalize, fingerprint, evaluateCompleteness, evaluateReview,
  CATERING_PROFILE, ResolvedModel, ReviewCheck } from "../publish";

let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const ok = (cond: boolean, what: string) => { if (!cond) throw new Error(what); };

const sql = fs.readFileSync("supabase/v265_publish.sql", "utf8");
const law = fs.readFileSync("src/lib/publish.ts", "utf8");
const data = fs.readFileSync("src/lib/publishSupabase.ts", "utf8");

const baseModel = (): ResolvedModel => ({
  structure: [{ title: "Dinner", items: ["a", "b"] }],
  pricing: { lines: [{ qty: 2, unitMinor: 4000000, taxable: true, label: "Plated" }],
    adjustmentsMinor: 0, subtotalMinor: 8000000, taxMinor: 560000, serviceMinor: 0,
    totalMinor: 8560000, taxRate: 0.07, serviceRate: 0, currency: "USD" },
  paymentSchedule: null, terms: null,
  eventFacts: { guests: 200, event_date: "2026-09-01" },
  presentation: { theme: { k: 1 }, regionTexts: {}, companyFacts: {}, photoPins: null },
  assets: [{ identity: "img-1", hash: "h1" }], locale: "en-US",
});

T("THE CANONICAL SERIALIZATION IS ORDER-INDEPENDENT BY KEY, ORDER-SIGNIFICANT BY ARRAY, AND OBEYS THE OMISSION LAW: reordering object keys leaves the fingerprint identical; reordering an array changes it; and null equals omitted equals absent", () => {
  const a = { x: 1, y: 2, z: [1, 2, 3] };
  const b = { z: [1, 2, 3], y: 2, x: 1 };
  ok(canonicalize(a) === canonicalize(b), "key order changed the canonical form");
  ok(canonicalize({ z: [3, 2, 1] }) !== canonicalize({ z: [1, 2, 3] }), "array order was ignored");
  ok(canonicalize({ x: 1, y: null }) === canonicalize({ x: 1 }), "null and omitted must be one fact");
  ok(canonicalize({ x: 1, y: undefined }) === canonicalize({ x: 1 }), "undefined and omitted must be one fact");
});

T("THE FINGERPRINT IS SHA-256, NOT djb2: it is 64 lowercase hex chars, collision-resistant width, and identical models fingerprint identically while a one-cent change diverges", () => {
  const fp = fingerprint(baseModel());
  ok(/^[0-9a-f]{64}$/.test(fp), `not a sha-256 digest: ${fp}`);
  ok(fingerprint(baseModel()) === fp, "identical models diverged");
  const m2 = baseModel(); m2.pricing!.totalMinor = 8560001;
  ok(fingerprint(m2) !== fp, "a one-cent change did not move the fingerprint");
  // the shipped djb2 (portable.ts) produces 8 hex chars — proving this is a
  // different, stronger primitive, not a reuse of the churn hash
  ok(fs.readFileSync("src/lib/portable.ts", "utf8").includes("padStart(8"), "djb2 precedent not found (sanity)");
});

T("RENDERER IDENTITY IS OUTSIDE THE FINGERPRINT: presentation theme parameters are inside (visible), but no engineVersion/metricsVersion/renderer token participates — a renderer upgrade cannot move the fingerprint", () => {
  ok(!/engineVersion|metricsVersion|renderer/i.test(law.slice(law.indexOf("export function fingerprint"), law.indexOf("export interface OfferProfile"))), "renderer identity leaked into the fingerprint region");
  // presentation IS in the model (visible), proving the exclusion is renderer-specific, not presentation-blind
  const m = baseModel(); const fp = fingerprint(m);
  m.presentation.theme = { k: 2 };
  ok(fingerprint(m) !== fp, "a visible theme change was ignored (presentation must be inside)");
});

T("THE COMPLETENESS CORE IS FORM-INDEPENDENT: it demands a visible commitment, resolved amounts, and one currency — but NOT guests or date; those live only in the catering PROFILE", () => {
  const core = law.slice(law.indexOf("export function evaluateCompleteness"), law.indexOf("// ── REVIEW"));
  ok(!/guests|event_date/.test(core), "the universal core hardcodes catering facts");
  ok(law.includes('requiredFacts: ["guests", "event_date"]'), "the catering profile must own guests+date");
  const v = evaluateCompleteness(baseModel(), CATERING_PROFILE);
  ok(v.complete && v.profileSatisfied, "a complete catering offer failed");
  const missing = baseModel(); missing.eventFacts = { guests: 200 };  // no date
  const v2 = evaluateCompleteness(missing, CATERING_PROFILE);
  ok(v2.complete && !v2.profileSatisfied, "profile facts must fail independently of the core");
  ok(v2.failures.includes("profile:event_date"), "the missing profile fact must be named");
});

T("COMPLETENESS AND REVIEW FAIL INDEPENDENTLY AND BY NAME: an unpriced offer fails the core with a named reason; profile failures are prefixed distinctly", () => {
  const noPrice = baseModel(); noPrice.pricing = { ...noPrice.pricing!, currency: "" };
  const v = evaluateCompleteness(noPrice, CATERING_PROFILE);
  ok(!v.complete && v.failures.includes("no_currency"), "missing currency not named");
  ok(v.failures.every((f) => typeof f === "string"), "failures must be named strings");
});

T("THE REVIEW EVALUATOR HOLDS NO ORGANIZATION'S BELIEFS: an empty policy demands nothing (empty-is-information); declared checks fire on context alone; no org-specific constant appears in the evaluator", () => {
  ok(evaluateReview([], {} as never).demandsReview === false, "empty policy demanded review");
  const policy: ReviewCheck[] = [{ kind: "threshold", minMinor: 5000000 }, { kind: "discount_present" }];
  const ctx = { totalMinor: 8560000, hasDiscount: false, hasUnconfirmedPricing: false,
    actorRole: "sales", relationshipHasPriorOffer: true, offerProfile: "catering", depositDeviates: false };
  const v = evaluateReview(policy, ctx);
  ok(v.demandsReview && v.demandedChecks.includes("threshold") && !v.demandedChecks.includes("discount_present"),
    "threshold should fire, discount should not");
  const evalRegion = law.slice(law.indexOf("export function evaluateReview"), law.indexOf("export const CATERING"));
  ok(!/\b\d{5,}\b|Burger|Partini|\bcholov\b/i.test(evalRegion), "an org-specific constant/value leaked into the evaluator");
});

T("ARCHIVE PRECEDES PUBLISH IN THE DOOR (I-14′/I-15): the migration checks artifact_bytes/hash BEFORE it seals, promotes, or supersedes — the ARCHIVE_MISSING refusal sits above the seal in source order", () => {
  const archIdx = sql.indexOf("PUBLISH_ARCHIVE_MISSING");
  const sealIdx = sql.indexOf("set sealed_at = now()");
  const promoteIdx = sql.indexOf("insert into public.offer_snapshots");
  const supersedeIdx = sql.indexOf("'offer_superseded'");
  ok(archIdx > 0 && archIdx < sealIdx && archIdx < promoteIdx && archIdx < supersedeIdx,
    "the archive check must precede seal, promotion, and supersession");
});

T("SUPERSEDED GETS ITS FIRST HONEST WRITER, AND ONLY THERE: publish_offer writes offer_superseded; no other writer of status='superseded' exists in the migration; and it is written only after the replacement's snapshot is minted", () => {
  ok(sql.includes("'offer_superseded'"), "the supersession ceremony is missing");
  const supersedeWrites = (sql.match(/set status = 'superseded'/g) ?? []).length;
  ok(supersedeWrites === 1, `superseded written by ${supersedeWrites} sites`);
  ok(sql.indexOf("insert into public.offer_snapshots") < sql.indexOf("set status = 'superseded'"),
    "supersession must follow the replacement's snapshot minting");
});

T("THE SNAPSHOT IS INSERT+SELECT ONLY AND UNFABRICATABLE: no update/delete policy on offer_snapshots; the version_id is UNIQUE (one snapshot per sent version); and only the SECURITY DEFINER RPC inserts it (no app insert path)", () => {
  ok(!/create policy \w+ on public\.offer_snapshots\s+for (update|delete)/.test(sql), "a mutation policy exists on snapshots");
  ok(sql.includes("version_id     uuid not null unique"), "one-snapshot-per-version not enforced");
  ok(!data.includes('from("offer_snapshots").insert') && !data.includes('.from("offer_snapshots")\n    .insert'), "an app-layer snapshot insert path exists");
});

T("NO PARALLEL SEND PATH: sendVersion is retired from the send role — the app's publish path is the RPC, and the pure law consults no live proposal data in the reproduce path (loadSnapshot reads only offer_snapshots)", () => {
  const loadRegion = data.slice(data.indexOf("export async function loadSnapshot"));
  ok(loadRegion.includes('from("offer_snapshots")') && !loadRegion.includes('from("proposal_versions")') && !loadRegion.includes('from("event_components")'),
    "the reproduce path reads live proposal data");
  ok(data.includes('supabase.rpc("publish_offer"'), "publish must go through the atomic RPC");
});

T("SENT IS REACHABLE ONLY THROUGH PUBLISH: the migration sets status='sent' exactly once, inside publish_offer, and the sealed-version guard blocks customer-visible edits after the seal", () => {
  const sentWrites = (sql.match(/set status = 'sent'/g) ?? []).length;
  ok(sentWrites === 1, `status='sent' written by ${sentWrites} sites`);
  ok(sql.includes("SEALED_VERSION_IMMUTABLE") && sql.includes("trg_guard_sealed_version"), "the seal guard is missing");
});

console.log(`\nv265.publish: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
