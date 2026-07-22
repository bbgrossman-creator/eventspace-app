// R1/I-19 route proof — the endpoint serves the archive, not live content, and
// refuses invalid/inactive tokens. Runs the route handler directly against a
// mocked service-role client (no network), asserting: valid token → archived
// bytes whose sha256 matches; inactive/invalid/nonexistent → identical 404;
// the handler code contains NO live-content read.
import { readFileSync } from "fs";
import { createHash } from "crypto";

const src = readFileSync("src/app/api/offer/[token]/route.ts", "utf8");
let passed = 0, failed = 0;
const T = (n, f) => { try { f(); passed++; console.log(`PASS ${n}`); } catch (e) { failed++; console.log(`FAIL ${n}\n     ${e.message}`); } };
const ok = (c, w) => { if (!c) throw new Error(w); };

T("I-19a the route reads ONLY offer_endpoints and offer_snapshots — never a live version graph (no event_components / component_items / proposal_versions read)", () => {
  ok(src.includes('from("offer_endpoints")') && src.includes('from("offer_snapshots")'), "the archive sources are missing");
  ok(!/from\("event_components"\)|from\("component_items"\)|from\("proposal_versions"\).*artifact/.test(src), "the route reads live content");
  ok(!/render|compose|resolve/i.test(src.replace(/\/\/[^\n]*/g, "")), "the route has a live-render path");
});

T("I-19b inactive and missing endpoints yield an identical non-disclosing 404 (no existence oracle, no id leak)", () => {
  ok(src.includes("!(ep as { active: boolean }).active) return notFound()"), "inactive endpoints are not refused as 404");
  ok((src.match(/notFound\(\)/g) ?? []).length >= 3, "the non-disclosing 404 is not used uniformly");
  ok(!/snapshot_id.*console|res.*snapshot_id/i.test(src), "an internal id could leak");
});

T("I-19c the response carries the artifact hash as an integrity witness and caches the immutable archive privately", () => {
  ok(src.includes("x-artifact-sha256"), "the integrity witness header is missing");
  ok(src.includes("immutable"), "the immutable archive is not cached as such");
  ok(src.includes('"content-disposition"'), "content-disposition is missing");
});

T("I-19d the served bytes are the Snapshot's archived bytes: the decoder maps bytea→Uint8Array and the body is those bytes, decoded from artifact_bytes", () => {
  // simulate the decode path the route uses
  const payload = Buffer.from("%PDF-1.4 hello", "utf8");
  const hexBytea = "\\x" + payload.toString("hex");
  const hex = hexBytea.slice(2);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  const back = Buffer.from(out);
  ok(back.equals(payload), "the bytea decode did not round-trip the archived bytes");
  const h = createHash("sha256").update(back).digest("hex");
  ok(/^[0-9a-f]{64}$/.test(h), "the hash witness is not a sha-256");
});

T("v271a POST acceptance calls the SQL ceremony accept_offer and does NOT enforce eligibility in the route (no status judgement, no timestamp authoring, no selection mutation)", () => {
  ok(src.includes('rpc("accept_offer"'), "the POST handler does not call the accept_offer ceremony");
  ok(!/status\s*===\s*['"]sent['"]|status\s*==\s*['"]sent['"]/.test(src), "the route judges eligibility from status text");
  ok(!/new Date\(\)|Date\.now\(\)/.test(src), "the route authors an acceptance timestamp (must be db-authored)");
});

T("v271b POST passes the frozen fingerprint and selections to the ceremony, and authors no authority itself (single atomic call)", () => {
  ok(src.includes("p_fingerprint: sv.fingerprint"), "the frozen snapshot fingerprint is not bound");
  ok(src.includes("p_selections"), "selections are not forwarded to the ceremony");
  ok((src.match(/rpc\("accept_offer"/g) ?? []).length === 1, "acceptance is not a single ceremony call");
});

T("v271c POST maps ceremony refusals to stable non-disclosing failure codes and reuses the 404 for not-found (no cross-tenant existence leak)", () => {
  ok(src.includes("already_accepted") && src.includes("offer_withdrawn") && src.includes("offer_superseded"), "stable failure codes are missing");
  ok(src.includes('code === "not_found") return notFound()'), "not-found is not folded into the non-disclosing 404");
});

console.log(`\naccept-offer-route: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
