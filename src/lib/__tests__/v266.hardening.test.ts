// v266 (PL-3 Phase A hardening) — the six corrections pinned in source law.
// Server truths (the refusals, the race, immutability) are proven on real
// Postgres in supabase/tests/v266_proof.sql (HB-1..HB-6) and the genuine
// two-session race in v266_race.sql. These pins guard the source shape so a
// future edit cannot silently undo a correction.
import * as fs from "fs";

let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const ok = (c: boolean, w: string) => { if (!c) throw new Error(w); };

const sql = fs.readFileSync("supabase/v266_hardening.sql", "utf8");

T("B1 · THE THREAD IS LOCKED BEFORE THE VERSION: the door takes `for update of p` on the proposal FIRST, then `for update of v` — a consistent lock order so concurrent sibling publishes serialize cleanly (never deadlock, never two current offers)", () => {
  const pLock = sql.indexOf("for update of p");
  const vLock = sql.indexOf("for update of v", pLock);
  ok(pLock > 0 && vLock > pLock, "the proposal (thread) lock must precede the version lock");
  ok(sql.includes("lock the THREAD first"), "the lock-order intent must be documented");
});

T("B2 · THE SEAL SPANS THE CONTENT: a BEFORE trigger on event_components, component_items, AND component_requirements refuses writes when the owning version is sealed, resolving ownership through the FK path", () => {
  ok(sql.includes("guard_sealed_content"), "the content-seal guard is missing");
  for (const tbl of ["trg_guard_content_components", "trg_guard_content_items", "trg_guard_content_reqs"]) {
    ok(sql.includes(tbl), `seal trigger missing on ${tbl}`);
  }
  ok(sql.includes("SEALED_VERSION_IMMUTABLE"), "the seal refusal is missing");
  // ownership resolves through component_id → event_components.proposal_version_id
  ok(sql.includes("ec.proposal_version_id into v_ver from public.event_components ec"), "item ownership path missing");
});

T("B3 · FRESHNESS IS A DATABASE FACT: a content_revision on the version, bumped by an unbypassable trigger on every content write, captured into the staged package at Prepare, and compared in the door before seal", () => {
  ok(sql.includes("content_revision bigint not null default 0"), "the revision column is missing");
  ok(sql.includes("bump_version_revision"), "the content-bump trigger is missing");
  for (const t of ["trg_rev_components", "trg_rev_items", "trg_rev_reqs"]) ok(sql.includes(t), `revision trigger missing: ${t}`);
  // the door compares staged vs current revision, and it does so BEFORE the seal
  const cmp = sql.indexOf("v_stg.content_revision is distinct from v_cur_rev");
  const seal = sql.indexOf("set sealed_at = now()");
  ok(cmp > 0 && cmp < seal, "the freshness check must precede the seal");
  ok(sql.slice(cmp - 200, cmp).includes("PUBLISH_STALE_PREPARATION") || sql.slice(cmp, cmp + 120).includes("STALE_PREPARATION"), "stale refusal not wired to the revision check");
});

T("R2 · ARCHIVE INTEGRITY IS VERIFIED CRYPTOGRAPHICALLY BEFORE THE SEAL: the door checks sha256(artifact_bytes) = artifact_hash and refuses ARCHIVE_CORRUPT, above seal/promotion/publish/supersession in source order", () => {
  const corrupt = sql.indexOf("PUBLISH_ARCHIVE_CORRUPT");
  const seal = sql.indexOf("set sealed_at = now()");
  const promote = sql.indexOf("insert into public.offer_snapshots");
  ok(corrupt > 0 && corrupt < seal && corrupt < promote, "the integrity check must precede seal and promotion");
  ok(sql.includes("digest(v_stg.artifact_bytes, 'sha256')"), "the sha256 verification is missing");
});

T("R3 · APPROVER AUTHORITY IS EVALUATED WHEN POLICY DECLARES IT, AND EMPTY-IS-INFORMATION OTHERWISE: the door reads requiredApproverRoles only when present, refusing INVALID_APPROVER_AUTHORITY; absent the declaration, no authority gate exists", () => {
  ok(sql.includes("p_policy ? 'requiredApproverRoles'"), "the authority gate is not conditional on declaration");
  ok(sql.includes("PUBLISH_INVALID_APPROVER_AUTHORITY"), "the authority refusal is missing");
  ok(sql.includes("v_review.authority ? 'role'"), "the recorded authority is not evaluated");
});

T("THE FRESHNESS AND INTEGRITY CHECKS COMPOSE WITH V265'S ORDERING: archive-missing, corrupt, and stale all precede the seal; the seal still precedes promotion, publication, and supersession", () => {
  const missing = sql.indexOf("PUBLISH_ARCHIVE_MISSING");
  const corrupt = sql.indexOf("PUBLISH_ARCHIVE_CORRUPT");
  const stale = sql.indexOf("v_stg.content_revision is distinct");
  const seal = sql.indexOf("set sealed_at = now()");
  const supersede = sql.indexOf("'offer_superseded'");
  ok(Math.max(missing, corrupt, stale) < seal, "a pre-seal check landed after the seal");
  ok(seal < supersede, "the seal must precede supersession");
});

T("NO PHASE-B TRANSPORT AND NO PL-4 ACCEPTANCE LEAKED IN: the hardening migration fabricates no transport instruction, no outbox, and no acceptance/instrument concept", () => {
  ok(!/transport_instruction|outbox|dead.?letter|acceptance|instrument|deposit|signature/i.test(sql.replace(/--[^\n]*/g, "")), "a reserved concept leaked into v266");
  ok(sql.includes("PHASE B, INACTIVE"), "the transport step must remain explicitly inactive");
});

console.log(`\nv266.hardening: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
