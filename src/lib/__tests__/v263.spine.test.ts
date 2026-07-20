// v263 (PL-1 · Spine & Ledger) — the spec's acceptance criteria, pinned.
// The two laws: the spine (ceremonial state, ceremony-only, dormant states
// are values with no door) and the ledger (append-only at the policy layer,
// four required fields, no commercial content, never an input to state).
// The two-concept model: ceremonial spine state vs legacy-derived
// classification, value AND provenance always exposed, no silent
// conversion. The guardrail: no bridge transitions for legacy-ahead rows.
// Honest grandfathering: the migration fabricates nothing. Superseded has
// NO WRITER. The operational bookings.status pipeline: untouched,
// unsynchronized, and constitutionally UNCLASSIFIED by this slice.
// Server-side truths (atomicity, refusals, policy denial) are proven on
// real Postgres in supabase/tests/v263_proof.sql (SP-1..SP-8, all green).
import * as fs from "fs";

let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const ok = (cond: boolean, what: string) => { if (!cond) throw new Error(what); };

const law = fs.readFileSync("src/lib/spine.ts", "utf8");
const data = fs.readFileSync("src/lib/spineSupabase.ts", "utf8");
const sql = fs.readFileSync("supabase/v263_spine_ledger.sql", "utf8");
const ui = fs.readFileSync("src/components/EngagementSpine.tsx", "utf8");
const props = fs.readFileSync("src/lib/proposals.ts", "utf8");
const card = fs.readFileSync("src/components/ProposalsCard.tsx", "utf8");
const thread = fs.readFileSync("src/components/VersionThread.tsx", "utf8");

const walk = (dir: string, into: string[]) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, into);
    else if (/\.(ts|tsx)$/.test(e.name)) into.push(p);
  }
};

T("THE VOCABULARY IS WHOLE AND THE DOORS ARE FEW: the full constitutional spine exists in law (8 states, so later slices never re-open it); PL-1's reachable set is exactly inquiry/proposing/declined; and the DORMANT states have no door — no RPC in the migration writes committed, in_execution, delivered, settled, or cancelled", () => {
  for (const st of ["inquiry", "proposing", "committed", "in_execution", "delivered", "settled", "declined", "cancelled"]) {
    ok(law.includes(`"${st}"`), `vocabulary missing: ${st}`);
  }
  ok(law.includes('PL1_REACHABLE: readonly SpineState[] = ["inquiry", "proposing", "declined"]'), "the reachable set is wrong");
  for (const dormant of ["'committed'", "'in_execution'", "'delivered'", "'settled'", "'cancelled'"]) {
    ok(!new RegExp(`set spine_state = ${dormant}`).test(sql), `a door exists to dormant ${dormant}`);
  }
});

T("THE LEDGER IS APPEND-ONLY AT THE POLICY LAYER WITH THE FOUR REQUIRED FIELDS AND NO COMMERCIAL CONTENT: insert+select policies only (no update/delete policy exists — the blueprint_compositions discipline); booking, ceremony, actor, moment all NOT NULL; no price/amount/snapshot column anywhere in the table", () => {
  ok(sql.includes("create policy el_select") && sql.includes("create policy el_insert"), "the two policies are missing");
  ok(!/create policy \w+ on public\.engagement_ledger\s+for (update|delete)/.test(sql), "a mutation policy exists on the ledger");
  for (const req of ["booking_id  uuid not null", "ceremony    text not null", "actor       text not null", "moment      timestamptz not null"]) {
    ok(sql.includes(req), `required field not enforced: ${req.split(" ")[0]}`);
  }
  const ledgerDdl = sql.slice(sql.indexOf("create table if not exists public.engagement_ledger"), sql.indexOf("create index if not exists ix_engagement_ledger_booking"));
  ok(!/price|amount|snapshot|total/i.test(ledgerDdl), "commercial content in the ledger");
});

T("EVERY CEREMONY IS ATOMIC AND WRITES EXACTLY ONE ENTRY: each of the four RPCs locks its row, checks its precondition at the door, performs one state write and one ledger insert in one function — and each PL-1 ceremony kind appears exactly once as an insert", () => {
  for (const fn of ["open_inquiry", "open_proposing", "decline_engagement", "withdraw_offer"]) {
    ok(sql.includes(`create or replace function public.${fn}`), `ceremony missing: ${fn}`);
  }
  for (const kind of ["'opened', p_actor", "'proposing', p_actor", "'declined', p_actor", "'offer_withdrawn', p_actor"]) {
    const inserts = (sql.match(new RegExp(kind.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
    ok(inserts === 1, `${kind} written by ${inserts} sites`);
  }
  ok((sql.match(/for update/g) ?? []).length >= 4, "row locking missing from a ceremony");
});

T("THE TWO-CONCEPT MODEL, EXPOSED AND NEVER COLLAPSED: deriveLifecycle returns value AND provenance with ceremonial null for untouched rows; the badge renders data-spine-provenance and the derived chip; the derived title states 'ceremonial spine state: absent'; and NOTHING outside the RPCs writes bookings.spine_state (no .update sets it anywhere in src)", () => {
  ok(law.includes('provenance: "legacy-derived", ceremonial: null'), "the derived branch is wrong");
  ok(ui.includes("data-spine-provenance") && ui.includes("data-spine-derived-chip"), "provenance surfaces missing");
  ok(ui.includes("ceremonial spine state: absent"), "the absence must be legible");
  const files: string[] = [];
  walk("src", files);
  const writers = files.filter((f) => !f.includes("__tests__") && /spine_state/.test(fs.readFileSync(f, "utf8"))
    && /\.update\([^)]*spine_state|spine_state[^,}]*\}\s*\)\s*\.eq/.test(fs.readFileSync(f, "utf8")));
  ok(writers.length === 0, `direct spine writers: ${writers.join(", ")}`);
});

T("SUPERSEDED HAS NO WRITER: it exists in the vocabulary and the labels, every reader tolerates it, the generic setter refuses it by name, the ceremony SQL never assigns it, and no app code sets it — replacement awaits PL-3/PL-4's honest proof (server-proven as SP-7c)", () => {
  ok(props.includes('"superseded"'), "the vocabulary is missing the terminal");
  ok(props.includes('status === "withdrawn" || status === "superseded"') && props.includes("set by ceremony, not by the status menu"), "the setter guard is missing");
  ok(!sql.includes("status = 'superseded'"), "the SQL writes superseded");
  const files: string[] = [];
  walk("src", files);
  const writers = files.filter((f) => !f.includes("__tests__")
    && /status:\s*"superseded"|status\s*=\s*"superseded"/.test(fs.readFileSync(f, "utf8"))
    && !f.endsWith("spine.ts") && !f.endsWith("proposals.ts") && !f.endsWith("VersionThread.tsx") && !f.endsWith("ProposalsCard.tsx"));
  ok(writers.length === 0, `superseded writers: ${writers.join(", ")}`);
  ok(thread.includes('"Superseded"'), "readers must render the terminal properly");
});

T("THE GUARDRAIL IS LAW, NOT COURTESY: open_inquiry refuses a row with proposals (LEGACY_AHEAD); open_proposing returns legacy_untouched for NULL-spine rows with zero writes; decline refuses NULL; and no function contains any bridge from derived to ceremonial (server-proven as SP-4/SP-4b/SP-5b)", () => {
  ok(sql.includes("CEREMONY_LEGACY_AHEAD"), "the virgin check is missing");
  ok(sql.includes("'legacy_untouched'"), "the honest third outcome is missing");
  ok(sql.includes("if v_state is null or v_state not in ('inquiry','proposing')"), "decline's source check is wrong");
  ok(!/adopt|bridge|backfill/i.test(sql.replace(/--[^\n]*/g, "")), "bridge machinery in the migration");
});

T("STATE IS NEVER COMPUTED FROM THE LEDGER: loadEffectivePosition reads the stored state and proposal facts only; loadLedger feeds the history view alone; no file reads engagement_ledger to produce a state value", () => {
  const posFn = data.slice(data.indexOf("loadEffectivePosition"), data.indexOf("loadLedger"));
  ok(!posFn.includes("engagement_ledger"), "position reads the ledger");
  const files: string[] = [];
  walk("src", files);
  const readers = files.filter((f) => !f.includes("__tests__") && fs.readFileSync(f, "utf8").includes("engagement_ledger"));
  ok(readers.length === 1 && readers[0].endsWith("spineSupabase.ts"), `ledger readers: ${readers.join(", ")}`);
});

T("HONEST GRANDFATHERING: the migration fabricates nothing — no UPDATE of bookings.spine_state, no INSERT into the ledger outside function bodies, no DEFAULT on the spine column (NULL is the honest legacy value) — proven live as SP-8", () => {
  const topLevel = sql.replace(/create or replace function[\s\S]*?end \$\$;/g, "");
  ok(!/update public\.bookings/i.test(topLevel), "the migration backfills spine state");
  ok(!/insert into public\.engagement_ledger/i.test(topLevel), "the migration seeds the ledger");
  ok(/add column if not exists spine_state text;/.test(sql), "the spine column must be bare nullable, no default");
});

T("THE OPERATIONAL PIPELINE IS UNTOUCHED, UNSYNCHRONIZED, AND UNCLASSIFIED: workflows.ts and workflow.ts carry no v263 edit; nothing writes bookings.status from spine machinery or spine_state from operational machinery; and PL-1 files never declare what the pipeline constitutionally is", () => {
  for (const f of ["src/lib/workflows.ts", "src/lib/workflow.ts"]) {
    ok(!fs.readFileSync(f, "utf8").includes("v263"), `${f} was touched`);
  }
  ok(!data.includes('"status"') || !data.includes('from("bookings")\n    .update'), "spine machinery touches operational status");
  for (const [name, src] of [["law", law], ["data", data], ["ui", ui]] as const) {
    ok(!/pipeline is a projection|status is a projection/i.test(src), `${name} classifies the pipeline`);
  }
});

T("CEREMONIES SIT AT THE CHOKE POINTS AND ONLY THERE: booking creation fires openInquiry (tolerated on failure — the row stays honestly derived); both create-proposal paths fire openProposing; the Withdraw door is wired through the version row; and non-ceremony edit paths (archive, restore, pricing, status flow) call no ceremony", () => {
  const newPage = fs.readFileSync("src/app/bookings/new/page.tsx", "utf8");
  // v264 superseded the bare call with the compound door — which CALLS
  // PL-1's open_inquiry inside (pinned in v264's suite). The stronger form
  // of this same claim: the creation choke point fires the spine's door.
  ok(newPage.includes('openInquiryWithRelationship(data.id, "sales"') && newPage.includes("stays derived"), "creation must open the spine through the door, tolerantly");
  ok((card.match(/openProposing\(b\.id, "sales"\)/g) ?? []).length === 2, "both create paths must fire the door");
  ok(card.includes("withdrawOffer(v.id") && thread.includes("data-ceremony-withdraw"), "the withdraw door is missing");
  const archBlock = card.slice(card.indexOf("async function doArchive"), card.indexOf("async function doDelete"));
  ok(!archBlock.includes("openProposing") && !archBlock.includes("openInquiry"), "a non-ceremony path fires a ceremony");
});

console.log(`\nv263.spine: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
