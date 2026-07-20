// v267 (PL-3 Phase A boundary completion) — the enumeration is CLOSED. These
// pins guard the complete version-scoped customer-visible read-set: the seal
// and the revision witness must span every table the resolver reads that
// carries version-owned customer truth. Server truths (refusals, bumps, the
// stale-money case, the step-11 guard) are proven on real Postgres in
// supabase/tests/v267_proof.sql (VB-1..VB-8).
import * as fs from "fs";

let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const ok = (c: boolean, w: string) => { if (!c) throw new Error(w); };

const v267 = fs.readFileSync("supabase/v267_boundary.sql", "utf8");
const resolver = fs.readFileSync("src/lib/presentation.ts", "utf8");

// THE CLOSED ENUMERATION: every table the resolver reads (from the shipped
// resolver body), classified. This test fails if the resolver grows a new
// from() that isn't accounted for here — forcing the enumeration to stay closed.
const RESOLVER_READS: string[] = Array.from(new Set<string>(
  (resolver.match(/from\("([a-z_]+)"\)/g) ?? []).map((m: string) => m.replace(/from\("|"\)/g, ""))
)).sort();

const VERSION_SCOPED_CUSTOMER_VISIBLE = [
  "event_components", "component_items", "component_requirements",   // v266
  "version_adjustments", "version_guests", "version_sections", "choice_groups",  // v267
];
const BOUNDARY_EDGE_FROZEN_BY_VALUE = ["bookings", "proposals"];   // booking/thread-scoped
const CONFIG = ["section_types", "guest_categories"];               // tenant catalog

T("THE RESOLVER READ-SET IS FULLY ACCOUNTED FOR: every table buildPresentationModel reads is classified as version-scoped-customer-visible, boundary-edge (frozen by value), or config — no unclassified table remains (the enumeration is CLOSED)", () => {
  const classified = new Set([...VERSION_SCOPED_CUSTOMER_VISIBLE, ...BOUNDARY_EDGE_FROZEN_BY_VALUE, ...CONFIG]);
  // component_items/requirements are read via component_id (pricingEngine/other),
  // not always a direct resolver from(); the resolver reads the direct set:
  const directlyExpected = ["bookings", "choice_groups", "component_items", "event_components",
    "proposal_versions", "proposals", "section_types", "version_adjustments", "version_guests", "version_sections"];
  ok(JSON.stringify(RESOLVER_READS) === JSON.stringify(directlyExpected),
    `the resolver read-set changed — re-run the enumeration. Got: ${RESOLVER_READS.join(",")}`);
  // proposal_versions is the version row itself (customer fields sealed via the guard)
  for (const tbl of RESOLVER_READS) {
    if (tbl === "proposal_versions") continue;   // the row, handled by the version guard
    ok(classified.has(tbl), `UNCLASSIFIED resolver table: ${tbl} — the enumeration is not closed`);
  }
});

T("THE SEAL SPANS ALL FOUR REMAINING VERSION-SCOPED TABLES: version_adjustments, version_guests, version_sections, choice_groups each carry a content-seal trigger refusing writes on a sealed version", () => {
  for (const trg of ["trg_guard_content_adjustments", "trg_guard_content_guests",
    "trg_guard_content_sections", "trg_guard_content_choices"]) {
    ok(v267.includes(trg), `seal trigger missing: ${trg}`);
  }
  ok(v267.includes("guard_sealed_version_scoped"), "the version_id-based seal guard is missing");
});

T("THE REVISION WITNESS SPANS THE SAME FOUR TABLES: each carries a bump trigger, so an edit to any of them stales a prepared package", () => {
  for (const trg of ["trg_rev_adjustments", "trg_rev_guests", "trg_rev_sections", "trg_rev_choices"]) {
    ok(v267.includes(trg), `revision trigger missing: ${trg}`);
  }
});

T("THE VERSION-ROW CUSTOMER FIELDS ARE SEALED AND BUMPED: the guard and the bump both now cover customer_intro, customer_closing, price_visibility (the resolver reads all three)", () => {
  const guard = v267.slice(v267.indexOf("function public.guard_sealed_version()"), v267.indexOf("function public.bump_on_version_content()"));
  for (const f of ["customer_intro", "customer_closing", "price_visibility"]) {
    ok(guard.includes(f), `the seal guard does not cover the version-row field ${f}`);
  }
  const bump = v267.slice(v267.indexOf("function public.bump_on_version_content()"));
  for (const f of ["customer_intro", "customer_closing", "price_visibility"]) {
    ok(bump.includes(f), `the revision bump does not cover the version-row field ${f}`);
  }
});

T("STEP-11 SUPERSEDES ONLY A CURRENTLY-SENT SIBLING: the supersession UPDATE carries a status='sent' guard, and offer_superseded is written only when exactly one row was superseded — a racing withdraw cannot be overwritten", () => {
  ok(v267.includes("where id = v_prior and status = 'sent'"), "the supersession UPDATE lacks the status guard");
  ok(v267.includes("v_superseded_count = 1"), "offer_superseded is not gated on an actual supersession");
});

T("NO PHASE-B / PL-4 LEAKED IN: v267 fabricates no transport, outbox, or acceptance concept, and step 13 stays inactive", () => {
  ok(!/transport_instruction|outbox|dead.?letter|acceptance|instrument|deposit|signature/i.test(v267.replace(/--[^\n]*/g, "")), "a reserved concept leaked into v267");
  ok(v267.includes("PHASE B, INACTIVE"), "the transport step must remain inactive");
});

console.log(`\nv267.boundary: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
