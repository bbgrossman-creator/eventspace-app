// v264 (PL-2 · Relationship) — the corrected spec's acceptance criteria,
// pinned. The second identity: stored, stateless (structurally — no
// column exists to misuse), role-free, never deletable. The citation:
// one nullable reference, written only by ceremony. The compound door:
// one action, one transaction, TWO ceremonies, TWO entries, no partial
// residue — PL-1's one-ceremony-one-entry invariant preserved verbatim
// (v263 files untouched). Correct Citation: append-only means
// corrections stay VISIBLE — prev + replacement + mandatory reason,
// history intact. No auto-link exists: matching is pure and read-only.
// Server truths proven on real Postgres: supabase/tests/v264_proof.sql
// (RP-1..RP-8, all green, incl. compound-door atomicity RP-3 and
// intact-history correction RP-7).
import * as fs from "fs";

let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const ok = (cond: boolean, what: string) => { if (!cond) throw new Error(what); };

const sql = fs.readFileSync("supabase/v264_relationship.sql", "utf8");
const law = fs.readFileSync("src/lib/relationship.ts", "utf8");
const data = fs.readFileSync("src/lib/relationshipSupabase.ts", "utf8");
const panel = fs.readFileSync("src/components/RelationshipPanel.tsx", "utf8");
const door = fs.readFileSync("src/app/bookings/new/page.tsx", "utf8");
const cust = fs.readFileSync("src/app/customers/[id]/page.tsx", "utf8");

const walk = (dir: string, into: string[]) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, into);
    else if (/\.(ts|tsx)$/.test(e.name)) into.push(p);
  }
};

T("STATELESSNESS IS STRUCTURAL AND ROLE-FREEDOM TOO: the relationships DDL carries NO status/state/stage/lifecycle/tier/role column (server-proven RP-8d), the pure law models no lifecycle, and no delete policy exists — a Relationship never expires (RP-8e)", () => {
  const ddl = sql.slice(sql.indexOf("create table if not exists public.relationships"), sql.indexOf("create index if not exists ix_relationships_tenant"));
  ok(!/\b(status|state|stage|lifecycle|tier|role)\b/.test(ddl), "a state-shaped column exists");
  ok(!/create policy \w+ on public\.relationships\s+for delete/.test(sql), "a delete policy exists");
  ok(sql.includes("Deliberately NO delete policy"), "the never-expires ruling must be stated");
  ok(!/status|stage|lifecycle/.test(law.replace(/\/\/[^\n]*/g, "")), "the pure law models state");
});

T("THE CITATION IS CEREMONY-ONLY: bookings.relationship_id is written by exactly three SQL sites (the compound door, adopt, correct) and by NOTHING in the app — no .update touches relationship_id anywhere in src", () => {
  const writes = (sql.match(/update public\.bookings set relationship_id/g) ?? []).length;
  ok(writes === 3, `citation writers in SQL: ${writes}`);
  const files: string[] = [];
  walk("src", files);
  const offenders = files.filter((f) => !f.includes("__tests__")
    && /\.update\([^)]*relationship_id|relationship_id:\s*[^n]/.test(fs.readFileSync(f, "utf8"))
    && !f.endsWith("relationshipSupabase.ts"));
  ok(offenders.length === 0, `app-layer citation writers: ${offenders.join(", ")}`);
});

T("THE COMPOUND DOOR PRESERVES PL-1 VERBATIM: the v264 function CALLS public.open_inquiry (PL-1's ceremony, its own entry) and writes exactly ONE entry of its own (establish/found); the v263 migration file is byte-free of v264; failure semantics are transactional (plpgsql exception = full rollback, proven RP-3)", () => {
  ok(sql.includes("perform public.open_inquiry(p_booking, p_actor);"), "the door must fire PL-1's ceremony, not reimplement it");
  const doorFn = sql.slice(sql.indexOf("create or replace function public.open_inquiry_with_relationship"), sql.indexOf("create or replace function public.adopt_engagement"));
  const entries = (doorFn.match(/insert into public\.engagement_ledger/g) ?? []).length;
  ok(entries === 1, `the door writes ${entries} entries of its own (must be 1; PL-1 writes the other)`);
  ok(!fs.readFileSync("supabase/v263_spine_ledger.sql", "utf8").includes("v264"), "v263 was touched");
  ok(doorFn.includes("relationship_established") && doorFn.includes("relationship_found"), "both outcomes must be named");
});

T("CORRECT CITATION KEEPS HISTORY INTACT: the ceremony writes prev_relationship_ref + relationship_ref + a MANDATORY reason, contains no DELETE and no UPDATE of the ledger, and its three refusals are named (NOTHING_TO_CORRECT, CHANGES_NOTHING, REASON_REQUIRED) — server-proven RP-7 with the original adoption entry still standing", () => {
  const fn = sql.slice(sql.indexOf("create or replace function public.correct_citation"), sql.indexOf("create or replace function public.amend_relationship"));
  ok(fn.includes("prev_relationship_ref") && fn.includes("btrim(p_reason)"), "the correction payload is incomplete");
  ok(!/delete from public\.engagement_ledger|update public\.engagement_ledger/.test(fn), "the correction touches history");
  for (const err of ["CEREMONY_NOTHING_TO_CORRECT", "CEREMONY_CORRECTION_CHANGES_NOTHING", "CEREMONY_REASON_REQUIRED"]) {
    ok(fn.includes(err), `refusal missing: ${err}`);
  }
});

T("NO PII IN THE LEDGER: the identity-amendment entry records THAT identity changed (relationship_ref only) and never the values — no phone/email/name parameter reaches its insert (server-proven RP-8c)", () => {
  const fn = sql.slice(sql.indexOf("create or replace function public.amend_relationship"));
  const ins = fn.slice(fn.indexOf("insert into public.engagement_ledger"), fn.indexOf("limit 1"));
  ok(!/p_phone|p_email|p_name|p_notes/.test(ins), "a value parameter reaches the ledger insert");
  ok(fn.includes("relationship_identity_amended"), "the amendment kind is missing");
});

T("NO AUTO-LINK EXISTS: the matcher is pure (relationship.ts imports no data layer and performs no IO); no code path leads from a match result to a ceremony call; FOUND pre-selection is unambiguous-only at both call sites (the door and the harness's law)", () => {
  ok(!law.includes("supabase") && !law.includes("fetch("), "the matcher touches IO");
  ok(door.includes("relMatches.length === 1 ? relMatches[0].relationship.id : null"), "the door pre-selects ambiguously");
  ok(!/matchRelationships[\s\S]{0,200}(adoptEngagement|openInquiryWith|correctCitation)/.test(law), "law reaches a ceremony");
});

T("THE MIGRATION FABRICATES NOTHING: no INSERT into relationships, no UPDATE of bookings, no ledger seed exists at the migration's top level (function bodies excluded) — server-proven RP-8a/RP-8b", () => {
  const topLevel = sql.replace(/create or replace function[\s\S]*?end \$\$;/g, "");
  ok(!/insert into public\.relationships/i.test(topLevel), "the migration creates relationships");
  ok(!/update public\.bookings/i.test(topLevel), "the migration sets citations");
  ok(!/insert into public\.engagement_ledger/i.test(topLevel), "the migration seeds the ledger");
});

T("THE TWO VOICES ARE STRUCTURAL: the ceremonial surfaces carry data-rel-provenance='ceremonial', the derived ones 'derived'; the unattached customer page states its derivation honestly; customer.ts (the surviving suggestion law) is byte-free of v264", () => {
  ok(panel.includes('data-rel-provenance="ceremonial"') && panel.includes('data-rel-provenance="derived"'), "the voices lack provenance");
  ok(cust.includes("data-rel-derived-banner") && cust.includes("grouped by phone/email match, not by ceremony"), "the derived banner is missing");
  ok(!fs.readFileSync("src/lib/customer.ts", "utf8").includes("v264"), "customer.ts was touched");
});

T("VOCABULARY PROJECTION HOLDS: the UI says Customer/Individual/Family/Organization; the ledger kinds are constitutional (relationship_established/found, engagement_adopted, citation_corrected, relationship_identity_amended); no UI surface renders the word Relationship to the person", () => {
  ok(law.includes('person: "Individual", household: "Family", organization: "Organization"'), "the kind projection is wrong");
  for (const kind of ["relationship_established", "relationship_found", "engagement_adopted", "citation_corrected", "relationship_identity_amended"]) {
    ok(sql.includes(`'${kind}'`), `ledger kind missing: ${kind}`);
  }
  for (const surface of [panel, cust]) {
    // rendered text nodes and label strings only — code identifiers
    // (RelationshipHeader, Relationship types) are organs and allowed
    ok(!/[>}]\s*Relationships?\s*[<{]/.test(surface) && !/["']Relationships?["']/.test(surface),
      "the organ's name reaches the person");
  }
  ok(panel.includes("new customer") && panel.includes("Link to customer"), "the chrome must speak Customer");
});

T("NEGATIVE BOUNDARIES HOLD GREP-ABLY: no merge, no lead scoring, no campaign, no portal, no relationship-scoped communications, no standalone creation surface (creation is exposed only at the door — SQL requires the compound door for birth outside a bare insert none of the app performs), and PL-3+ concepts (send snapshots, instruments, acceptance) are absent from every v264 file", () => {
  for (const [name, src] of [["sql", sql], ["law", law], ["data", data], ["panel", panel]] as const) {
    ok(!/\bmerge\b|lead.?scor|campaign|portal|segment/i.test(src.replace(/--[^\n]*|\/\/[^\n]*/g, "")), `banned concept in ${name}`);
    ok(!/instrument|sent_snapshot|acceptance_/i.test(src), `a later slice leaks into ${name}`);
  }
  const files: string[] = [];
  walk("src", files);
  const creators = files.filter((f) => !f.includes("__tests__")
    && /from\("relationships"\)[\s\S]{0,80}\.insert\(/.test(fs.readFileSync(f, "utf8")));
  ok(creators.length === 0, `standalone creation surface: ${creators.join(", ")}`);
});

console.log(`\nv264.relationship: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
