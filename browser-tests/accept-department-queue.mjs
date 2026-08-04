// v290 DEPARTMENT QUEUE ACCEPTANCE — the REAL mounted production surface in
// Chromium, reading the REAL projection_department_queue from a REAL Postgres
// database. No fixtures for the projection: only the transport is substituted.
// Claims DQ-1…DQ-18.
//
// Uses a disposable database (createdb -T ec ec_dq290) so seeded truth is
// visible to the page and is destroyed afterwards.
//
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-department-queue.mjs
import esbuild from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { makeFixtureDb } from "./lib/pg.mjs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const DB = "ec_dq290";

// v301 · one shared transport (browser-tests/lib/pg.mjs). This suite used
// `su postgres -c psql -f <tmpfile>`, which needs root and so could never run
// under the certification harness. Transport only — no fixture, claim or
// assertion changes.
const { psql } = makeFixtureDb(DB);

const [TENANT, USER] = psql(
  `select tu.tenant_id||' '||tu.user_id from public.tenant_users tu where tu.active order by tu.tenant_id limit 1`
).split(" ");
const [TENANT_B, USER_B] = psql(
  `select tu.tenant_id||' '||tu.user_id from public.tenant_users tu
    where tu.active and tu.tenant_id <> '${TENANT}' order by tu.tenant_id limit 1`
).split(" ");

const ctx = `select set_config('app.user_id','${USER}',false), set_config('request.jwt.claim.sub','${USER}',false);`;
const ctxB = `select set_config('app.user_id','${USER_B}',false), set_config('request.jwt.claim.sub','${USER_B}',false);`;

// ── seed real truth: two events, several departments, mixed states ──────────
psql(`${ctx}
do $$
declare v_t uuid := '${TENANT}'; v_e1 uuid; v_e2 uuid; v_r uuid; hb1 uuid; ho1 uuid; hb2 uuid; ho2 uuid;
begin
  -- v292a1 HARNESS MIGRATION (fixture construction only; no claim changed):
  -- an event now requires a real engagement and a DECLARED occurrence (I-31').
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_t, 'harness', 'HB-'||substr(gen_random_uuid()::text,1,12), 'active')
    returning id into hb1;
  insert into public.engagement_occurrence (tenant_id, booking_id, ordinal, opened_by)
    values (v_t, hb1, 1, 'harness') returning id into ho1;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref,
                           origin_commitment_ref, released_by)
    values (v_t, hb1, ho1, gen_random_uuid(), 'v290')
    returning id into v_e1;
  insert into public.execution_evidence (tenant_id, event_ref, kind, actor)
  values (v_t, v_e1, 'released', 'v290');
  -- v292a1 HARNESS MIGRATION (fixture construction only; no claim changed):
  -- an event now requires a real engagement and a DECLARED occurrence (I-31').
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_t, 'harness', 'HB-'||substr(gen_random_uuid()::text,1,12), 'active')
    returning id into hb2;
  insert into public.engagement_occurrence (tenant_id, booking_id, ordinal, opened_by)
    values (v_t, hb2, 1, 'harness') returning id into ho2;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref,
                           origin_commitment_ref, released_by)
    values (v_t, hb2, ho2, gen_random_uuid(), 'v290')
    returning id into v_e2;
  insert into public.execution_evidence (tenant_id, event_ref, kind, actor)
  values (v_t, v_e2, 'released', 'v290');

  -- culinary · event 1 · owned and active
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    kind, department, required_outcome, natural_key)
  values (v_t, v_e1, 'event', gen_random_uuid(), 'release',
    'culinary_prepare', 'culinary', 'Rub the brisket', 'v290_'||gen_random_uuid()::text)
  returning id into v_r;
  perform public.transfer_responsibility_ownership(v_r, 'chana', null, 'v290');

  -- culinary · event 1 · ownerless, closing soon (drives ownerless + risk)
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    kind, department, required_outcome, natural_key, timing)
  values (v_t, v_e1, 'event', gen_random_uuid(), 'release',
    'culinary_prepare', 'culinary', 'Plate the fish', 'v290_'||gen_random_uuid()::text,
    jsonb_build_object('window_end',(now()+interval '2 hours')::text));

  -- culinary · event 2 · lapsed (closed window, nothing recorded)
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    kind, department, required_outcome, natural_key, timing)
  values (v_t, v_e2, 'event', gen_random_uuid(), 'release',
    'culinary_prepare', 'culinary', 'Proof the challah', 'v290_'||gen_random_uuid()::text,
    jsonb_build_object('window_end',(now()-interval '2 days')::text));

  -- culinary · event 2 · exception recorded, still owned (risk without terminal state)
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    kind, department, required_outcome, natural_key)
  values (v_t, v_e2, 'event', gen_random_uuid(), 'release',
    'culinary_prepare', 'culinary', 'Sear the roast', 'v290_'||gen_random_uuid()::text)
  returning id into v_r;
  insert into public.execution_evidence (tenant_id, event_ref, obligation_ref, kind, actor, payload)
  values (v_t, v_e2, v_r, 'exception', 'v290', '{"reason":"supplier short"}'::jsonb);
  perform public.transfer_responsibility_ownership(v_r, 'moshe', null, 'v290');

  -- culinary · event 2 · discharged
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    kind, department, required_outcome, natural_key)
  values (v_t, v_e2, 'event', gen_random_uuid(), 'release',
    'culinary_prepare', 'culinary', 'Portion the kugel', 'v290_'||gen_random_uuid()::text)
  returning id into v_r;
  insert into public.execution_evidence (tenant_id, event_ref, obligation_ref, kind, actor)
  values (v_t, v_e2, v_r, 'completion', 'v290');

  -- equipment · event 1 (a second department, so isolation is testable)
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    kind, department, required_outcome, natural_key)
  values (v_t, v_e1, 'event', gen_random_uuid(), 'release',
    'equipment_pull', 'equipment', 'Stage the chafers', 'v290_'||gen_random_uuid()::text);
end $$;`);

// foreign-tenant culinary work, for DQ-18
psql(`${ctxB}
do $$
declare v_t uuid := '${TENANT_B}'; v_e uuid; hb3 uuid; ho3 uuid;
begin
  -- v292a1 HARNESS MIGRATION (fixture construction only; no claim changed):
  -- an event now requires a real engagement and a DECLARED occurrence (I-31').
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_t, 'harness', 'HB-'||substr(gen_random_uuid()::text,1,12), 'active')
    returning id into hb3;
  insert into public.engagement_occurrence (tenant_id, booking_id, ordinal, opened_by)
    values (v_t, hb3, 1, 'harness') returning id into ho3;
  insert into public.event (tenant_id, engagement_ref, occurrence_ref,
                           origin_commitment_ref, released_by)
    values (v_t, hb3, ho3, gen_random_uuid(), 'v290b')
    returning id into v_e;
  insert into public.execution_evidence (tenant_id, event_ref, kind, actor)
  values (v_t, v_e, 'released', 'v290b');
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    kind, department, required_outcome, natural_key)
  values (v_t, v_e, 'event', gen_random_uuid(), 'release',
    'culinary_prepare', 'culinary', 'FOREIGN TENANT PREP', 'v290b_'||gen_random_uuid()::text);
end $$;`);

const FOREIGN_ID = psql(`${ctxB}
  select o.id from public.obligation o where o.required_outcome = 'FOREIGN TENANT PREP' limit 1`)
  .split("\n").pop();

const fingerprint = () => psql(`${ctx}
  select (select count(*) from public.execution_evidence)||'/'||
         (select count(*) from public.responsibility_owner)||'/'||
         (select count(*) from public.obligation)`).split("\n").pop();
const beforeFingerprint = fingerprint();

// ── build the REAL page with only the transport substituted ───────────────
const aliasPlugin = { name: "alias", setup(b) {
  b.onResolve({ filter: /supabase$/ }, (a) => (
    ["@/lib/supabase", "./supabase", "../supabase", "../lib/supabase", "@/lib/supabase.ts"].includes(a.path)
      ? { path: join(here, "live-supabase.ts") } : null));
  b.onResolve({ filter: /^@\// }, (a) => {
    const base = join(root, "src", a.path.slice(2));
    for (const ext of [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"])
      if (existsSync(base + ext)) return { path: base + ext };
    return { path: base };
  });
}};
const built = await esbuild.build({
  entryPoints: [join(here, "department-queue.harness.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic", loader: { ".ts": "ts", ".tsx": "tsx" },
  define: { "process.env.NODE_ENV": '"development"' },
  banner: { js: "window.process=window.process||{env:{}};" },
  plugins: [aliasPlugin], logLevel: "silent",
});
const js = built.outputFiles[0].text;
const html = readFileSync(join(here, "department-queue.html"));
const css = existsSync(join(here, "app.css")) ? readFileSync(join(here, "app.css")) : "";

// ── the bridge: browser → runner → live Postgres ──────────────────────────
let mode = "live";          // live | transport | signedout
let rpcCalls = [];
let fromCalls = [];

const readBody = (req) => new Promise((ok) => {
  let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => ok(s ? JSON.parse(s) : {}));
});

const server = createServer(async (req, res) => {
  const u = req.url.split("?")[0];
  if (req.method === "GET") {
    if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(html); }
    if (u === "/department-queue.harness.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js); }
    if (u === "/app.css") { res.writeHead(200, { "content-type": "text/css" }); return res.end(css); }
    res.writeHead(404); return res.end();
  }
  const body = await readBody(req);

  if (u === "/auth") {
    const user = mode === "signedout" ? null : { id: USER, email: "viewer@example.test" };
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ data: { data: { user }, error: null }, error: null }));
  }
  if (u === "/from") {
    fromCalls.push(body.table);
    const row = mode === "signedout" ? null
      : { tenant_id: TENANT, role: "admin", active: true, tenants: { name: "Fixture" } };
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ data: row, error: null }));
  }
  if (u === "/rpc") {
    rpcCalls.push(body.name);
    if (mode === "transport") { res.writeHead(503); return res.end(); }
    try {
      const p = body.params || {};
      const q = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
      // Session context is injected ONLY when authenticated, so the untrusted
      // path is genuinely anonymous rather than simulated.
      const sessionCtx = mode === "signedout" ? "" : ctx;
      const sql = `${sessionCtx} select public.${body.name}(${q(p.p_department)}, ${q(p.p_group_by)})`;
      const out = psql(sql);
      const json = out.split("\n").pop();
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ data: JSON.parse(json), error: null }));
    } catch (e) {
      const msg = String(e.stderr || e.message || e).replace(/\s+/g, " ").trim();
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ data: null, error: { message: msg } }));
    }
  }
  res.writeHead(404); res.end();
});
await new Promise((ok) => server.listen(4299, ok));

const browser = await chromium.launch();
const page = await browser.newPage();
let passed = 0, failed = 0;
const T = async (n, fn) => { try { await fn(); passed++; console.log(`PASS ${n}`); }
  catch (e) { failed++; console.log(`FAIL ${n}\n     ${String(e.message).split("\n")[0]}`); } };
const attr = (s, a) => page.getAttribute(s, a);
const go = async (q = "?department=culinary") => {
  await page.goto(`http://localhost:4299/${q}`);
  await page.waitForSelector("[data-queue][data-outcome]:not([data-outcome='loading'])", { state: "attached", timeout: 15000 });
};

// ══ DQ-1 · live end-to-end ════════════════════════════════════════════════
await go();
await T("DQ-1 the mounted production surface renders from the REAL projection against live SQL (no fixtures)", async () => {
  if (await attr("[data-queue]", "data-outcome") !== "ready") throw new Error("not ready");
  if (await attr("[data-queue]", "data-projection") !== "department_queue") throw new Error("wrong projection");
  const tv = await attr("[data-queue]", "data-truth-version");
  if (!tv || tv.length < 16) throw new Error("no SQL-owned truth_version");
  const live = psql(`${ctx} select (public.projection_department_queue('culinary','event')->'provenance'->>'truth_version')`).split("\n").pop();
  if (tv !== live) throw new Error(`truth_version ${tv} != live ${live}`);
});

// ══ DQ-2 · membership is the projection's ═════════════════════════════════
await T("DQ-2 rendered membership equals feed(department) exactly — the client cannot shrink a department's queue", async () => {
  const rendered = (await attr("[data-queue]", "data-membership")).split(",").filter(Boolean).sort();
  const sqlIds = psql(`${ctx} select string_agg(f.responsibility::text, ',' order by f.responsibility)
     from public.responsibility_feed('{"department":"culinary"}'::jsonb) f`).split("\n").pop();
  const expected = (sqlIds || "").split(",").filter(Boolean).sort();
  if (expected.length === 0) throw new Error("fixture produced no culinary work");
  if (rendered.join(",") !== expected.join(",")) throw new Error(`rendered ${rendered.length} vs feed ${expected.length}`);
  const shown = await page.$$eval("[data-row]", (e) => e.length);
  if (shown !== expected.length) throw new Error(`${shown} rows displayed vs ${expected.length} owed`);
});

// ══ DQ-3 · no client-derived state ════════════════════════════════════════
await T("DQ-3 every rendered state equals responsibility_state() for the same row, and lies inside the seven", async () => {
  const rows = await page.$$eval("[data-row]", (els) =>
    els.map((e) => [e.getAttribute("data-row"), e.getAttribute("data-state")]));
  if (rows.length === 0) throw new Error("no rows rendered");
  const ok = ["derived", "standing", "active", "discharged", "lapsed", "superseded", "void"];
  for (const [id, st] of rows) {
    const live = psql(`${ctx} select public.responsibility_state('${id}'::uuid)`).split("\n").pop();
    if (st !== live) throw new Error(`${id}: rendered ${st}, SQL says ${live}`);
    if (!ok.includes(st)) throw new Error(`state outside the seven: ${st}`);
  }
});

// ══ DQ-4 · counts are the envelope's ═════════════════════════════════════
await T("DQ-4 displayed counts equal the envelope's counts — nothing is recounted client-side", async () => {
  const live = JSON.parse(psql(`${ctx} select (public.projection_department_queue('culinary','event')->'counts')`).split("\n").pop());
  for (const k of ["total", "ownerless", "at_risk"]) {
    const shown = Number(await attr(`[data-count="${k}"]`, "data-count-value"));
    if (shown !== Number(live[k] ?? 0)) throw new Error(`${k}: shown ${shown} vs projection ${live[k]}`);
  }
});

// ══ DQ-5 · by_state distribution ═════════════════════════════════════════
await T("DQ-5 the state distribution is the envelope's by_state and reconciles to total", async () => {
  const live = JSON.parse(psql(`${ctx} select (public.projection_department_queue('culinary','event')->'counts')`).split("\n").pop());
  const byState = live.by_state ?? {};
  let sum = 0;
  for (const [st, n] of Object.entries(byState)) {
    const shown = await attr(`[data-state-count="${st}"]`, "data-state-count-value");
    if (Number(shown) !== Number(n)) throw new Error(`${st}: shown ${shown} vs projection ${n}`);
    sum += Number(n);
  }
  if (Object.keys(byState).length === 0) throw new Error("fixture produced no state distribution");
  if (sum !== Number(live.total)) throw new Error(`by_state sums to ${sum}, total is ${live.total}`);
});

// ══ DQ-6 · groups are SQL's ══════════════════════════════════════════════
await T("DQ-6 every rendered group's members equal the envelope's declared group members exactly", async () => {
  const env = JSON.parse(psql(`${ctx} select public.projection_department_queue('culinary','event')`).split("\n").pop());
  const groups = env.data.groups ?? [];
  if (groups.length < 2) throw new Error(`fixture produced ${groups.length} group(s); need at least 2`);
  const shownGroups = await page.$$eval("[data-group]", (e) => e.map((x) => x.getAttribute("data-group")));
  if (shownGroups.length !== groups.length) throw new Error(`${shownGroups.length} groups rendered vs ${groups.length} declared`);
  for (const g of groups) {
    const members = (await attr(`[data-group="${g.key}"]`, "data-group-members")).split(",").filter(Boolean);
    const declared = [...g.members].sort();
    if ([...members].sort().join(",") !== declared.join(",")) {
      throw new Error(`group ${g.key}: rendered ${members.length} vs declared ${g.members.length}`);
    }
  }
});

await T("DQ-7 the groups partition the membership — every row in exactly one group, none invented", async () => {
  const membership = (await attr("[data-queue]", "data-membership")).split(",").filter(Boolean);
  const all = await page.$$eval("[data-group]", (e) =>
    e.flatMap((x) => (x.getAttribute("data-group-members") || "").split(",").filter(Boolean)));
  if (all.length !== membership.length) throw new Error(`groups hold ${all.length} rows, membership is ${membership.length}`);
  if (new Set(all).size !== all.length) throw new Error("a row appears in more than one group");
  for (const id of all) if (!membership.includes(id)) throw new Error(`group invented ${id}`);
});

// ══ DQ-8 · regrouping is a new projection read, not a client regroup ═════
await T("DQ-8 changing group_by issues a NEW projection request and renders SQL's grouping, not a client regroup", async () => {
  rpcCalls = [];
  await go("?department=culinary&group_by=state");
  const calls = rpcCalls.filter((n) => n.startsWith("projection_"));
  if (calls.length !== 1) throw new Error(`${calls.length} projection requests for one regroup`);
  if (await attr("[data-queue]", "data-group-by") !== "state") throw new Error("surface did not adopt the answered grouping");
  const env = JSON.parse(psql(`${ctx} select public.projection_department_queue('culinary','state')`).split("\n").pop());
  for (const g of env.data.groups ?? []) {
    const members = (await attr(`[data-group="${g.key}"]`, "data-group-members")).split(",").filter(Boolean);
    if ([...members].sort().join(",") !== [...g.members].sort().join(","))
      throw new Error(`group ${g.key} disagrees with SQL after regroup`);
  }
  await go();
});

// ══ DQ-9 · RISK IS NOT STATE (v290 doctrine) ═════════════════════════════
await T("DQ-9a state and risk are separate elements — no row renders a finding inside its state badge", async () => {
  const badges = await page.$$eval("[data-row]", (els) => els.map((e) => ({
    id: e.getAttribute("data-row"),
    state: e.querySelector("[data-state-label]")?.textContent?.trim() ?? "",
    risk: e.querySelector("[data-risk-badge]")?.textContent?.trim() ?? "",
    riskInsideState: !!e.querySelector("[data-state-label] [data-risk-badge]"),
    stateInsideRisk: !!e.querySelector("[data-risk-badge] [data-state-label]"),
  })));
  if (badges.length === 0) throw new Error("no rows");
  const STATE_WORDS = ["Unassigned", "Waiting", "Active", "Done", "Lapsed", "Replaced", "Void"];
  const FINDING_WORDS = ["Window closed unmet", "Closing soon", "Nobody owns this yet",
                         "Waiting on something else", "Exception recorded"];
  for (const b of badges) {
    if (b.riskInsideState) throw new Error(`${b.id}: a finding is nested inside the state badge`);
    if (b.stateInsideRisk) throw new Error(`${b.id}: a state is nested inside the risk badge`);
    if (b.state && !STATE_WORDS.includes(b.state)) throw new Error(`${b.id}: state badge reads "${b.state}"`);
    if (b.risk && STATE_WORDS.includes(b.risk)) throw new Error(`${b.id}: risk badge reads a state word "${b.risk}"`);
    if (b.state && FINDING_WORDS.some((f) => b.state.includes(f)))
      throw new Error(`${b.id}: state badge carries finding text`);
  }
});

await T("DQ-9b a row may carry a finding without its state changing — risk decorates, it does not reclassify", async () => {
  // the exception fixture: exception recorded, ownership intact, state still active
  const row = await page.$$eval("[data-row]", (els) => els
    .map((e) => ({ id: e.getAttribute("data-row"), state: e.getAttribute("data-state"),
                   findings: e.getAttribute("data-findings") || e.querySelector("[data-risk-badge]")?.getAttribute("data-findings") || "",
                   count: e.getAttribute("data-finding-count") }))
    .find((r) => (r.findings || "").includes("exception_recorded")));
  if (!row) throw new Error("fixture produced no exception_recorded row on this surface");
  if (row.state !== "active") throw new Error(`exception row rendered state ${row.state}, expected active`);
  const live = psql(`${ctx} select public.responsibility_state('${row.id}'::uuid)`).split("\n").pop();
  if (live !== "active") throw new Error(`SQL says ${live}`);
});

await T("DQ-10 each row's findings equal risk_findings() for that row — no finding invented or dropped", async () => {
  const rows = await page.$$eval("[data-row]", (els) => els.map((e) => ({
    id: e.getAttribute("data-row"),
    findings: (e.querySelector("[data-risk-badge]")?.getAttribute("data-findings") || ""),
  })));
  for (const r of rows) {
    // The sentinel prefix matters: with psql -tA an EMPTY aggregate prints an
    // empty line, so .pop() on trimmed output would silently return the
    // preceding set_config row instead. A non-empty result is unambiguous.
    const live = psql(`${ctx} select 'F:'||coalesce(string_agg(f.finding, ',' order by f.finding),'')
       from public.risk_findings('{"department":"culinary"}'::jsonb) f
      where f.responsibility = '${r.id}'::uuid`).split("\n").pop();
    if (!live.startsWith("F:")) throw new Error(`probe misread SQL output: ${live}`);
    const shown = r.findings.split(",").filter(Boolean).sort().join(",");
    const expect = live.slice(2).split(",").filter(Boolean).sort().join(",");
    if (shown !== expect) throw new Error(`${r.id}: shown [${shown}] vs SQL [${expect}]`);
  }
});

// ══ DQ-11/12 · genuine refusals ══════════════════════════════════════════
await T("DQ-11 an unknown department renders the genuine SQL refusal — not an empty queue", async () => {
  await go("?department=marketing");
  if (await attr("[data-queue]", "data-outcome") !== "refusal") throw new Error("unknown department did not refuse");
  const code = await attr("[data-queue]", "data-refusal-code");
  if (code !== "PROJECTION_FILTER_INVALID") throw new Error(`code ${code}`);
  if (await page.$("[data-row]")) throw new Error("rows rendered under refusal");
  if (await page.$("[data-empty-truth]")) throw new Error("refusal shown as an empty queue");
  if (await page.$("[data-group]")) throw new Error("stale groups rendered under refusal");
});

await T("DQ-12 an unknown group_by renders a genuine SQL refusal", async () => {
  await go("?department=culinary&group_by=phase_of_moon");
  if (await attr("[data-queue]", "data-outcome") !== "refusal") throw new Error("unknown group_by did not refuse");
  if (await page.$("[data-row]")) throw new Error("rows rendered under refusal");
});

// ══ DQ-13 · untrusted tenant ═════════════════════════════════════════════
await T("DQ-13 with no trusted tenant the surface refuses and never issues a projection request", async () => {
  mode = "signedout"; rpcCalls = [];
  await go();
  if (await attr("[data-queue]", "data-outcome") !== "refusal") throw new Error("untrusted read did not refuse");
  if (await attr("[data-queue]", "data-refusal-code") !== "TENANT_UNRESOLVED") throw new Error("wrong refusal code");
  if (await page.$("[data-row]")) throw new Error("rows rendered without a trusted tenant");
  if (await page.$("[data-empty-truth]")) throw new Error("untrusted read misreported as an empty queue");
  const asked = rpcCalls.filter((n) => n.startsWith("projection_")).length;
  if (asked !== 0) throw new Error(`untrusted surface issued ${asked} projection request(s)`);
  mode = "live";
});

await T("DQ-14 defence in depth — an anonymous department read is empty at the DATABASE", async () => {
  const anon = psql(`select public.projection_department_queue('culinary','event')->'counts'->>'total'`).split("\n").pop();
  if (anon !== "0") throw new Error(`anonymous read returned ${anon} rows from SQL`);
});

// ══ DQ-15 · transport ════════════════════════════════════════════════════
await T("DQ-15 a transport failure is distinguished from a refusal and from an empty queue", async () => {
  mode = "transport";
  await go();
  if (await attr("[data-queue]", "data-outcome") !== "transport") throw new Error("transport not surfaced");
  if (await page.$("[data-group]")) throw new Error("stale groups rendered under transport failure");
  mode = "live";
});

// ══ DQ-16 · empty truth is not refusal ═══════════════════════════════════
await T("DQ-16 a department with no work renders empty truth, not a refusal", async () => {
  await go("?department=venue");
  if (await attr("[data-queue]", "data-outcome") !== "ready") throw new Error("empty department did not render");
  const total = Number(await attr('[data-count="total"]', "data-count-value"));
  if (total !== 0) throw new Error(`venue fixture is not empty (${total})`);
  if (!(await page.$("[data-empty-truth]"))) throw new Error("empty queue not stated honestly");
  await go();
});

// ══ DQ-17 · label pack is presentation only ══════════════════════════════
await T("DQ-17 swapping the label pack changes words only — membership, state, grouping and order identical", async () => {
  const snap = async () => ({
    members: await attr("[data-queue]", "data-membership"),
    states: await page.$$eval("[data-row]", (e) => e.map((x) => x.getAttribute("data-state")).join(",")),
    order: await page.$$eval("[data-row]", (e) => e.map((x) => x.getAttribute("data-row")).join(",")),
    groups: await page.$$eval("[data-group]", (e) => e.map((x) => x.getAttribute("data-group")).join(",")),
    label: await attr("[data-queue]", "data-department-label"),
  });
  const before = await snap();
  await go("?department=culinary&pack=generic");
  const after = await snap();
  if (before.label !== "Prep") throw new Error(`catering label was ${before.label}`);
  if (after.label !== "Production") throw new Error(`generic label was ${after.label}`);
  if (before.members !== after.members) throw new Error("membership changed");
  if (before.states !== after.states) throw new Error("state changed");
  if (before.order !== after.order) throw new Error("order changed");
  if (before.groups !== after.groups) throw new Error("grouping changed");
  await go();
});

// ══ DQ-18 · tenant isolation ═════════════════════════════════════════════
await T("DQ-18 a foreign tenant's culinary work appears nowhere on this surface", async () => {
  const membership = await attr("[data-queue]", "data-membership");
  if (membership.includes(FOREIGN_ID)) throw new Error("foreign tenant row is in the membership");
  if (await page.$(`[data-row="${FOREIGN_ID}"]`)) throw new Error("foreign tenant row rendered");
  const text = await page.textContent("[data-queue]");
  if (text.includes("FOREIGN TENANT PREP")) throw new Error("foreign tenant outcome text rendered");
});

// ══ DQ-19 · purity ═══════════════════════════════════════════════════════
await T("DQ-19 the entire interaction sweep performed zero writes — ledger fingerprint unchanged", async () => {
  const after = fingerprint();
  if (after !== beforeFingerprint) throw new Error(`${beforeFingerprint} -> ${after}`);
  const writes = rpcCalls.filter((n) => !n.startsWith("projection_"));
  if (writes.length > 0) throw new Error(`non-projection rpc called: ${[...new Set(writes)].join(",")}`);
});

await T("DQ-20 the surface reads ONE projection envelope per render, and reads no table directly", async () => {
  rpcCalls = []; fromCalls = [];
  await go();
  const calls = rpcCalls.filter((n) => n.startsWith("projection_"));
  if (calls.length !== 1) throw new Error(`${calls.length} projection requests for one render: ${calls.join(",")}`);
  if (calls[0] !== "projection_department_queue") throw new Error(`called ${calls[0]}`);
  // the only permitted table read is the session's own tenant_users lookup
  const illegal = fromCalls.filter((t) => t !== "tenant_users");
  if (illegal.length > 0) throw new Error(`surface read tables directly: ${[...new Set(illegal)].join(",")}`);
});

// ══ v291 additions — clickable rows, the picker, and the chooser ══════════
await T("DQ-21 rows link to their detail surface and the LIST makes no detail request — no N+1", async () => {
  await go();
  rpcCalls = [];
  await go();
  const ids = await page.$$eval("[data-row]", (e) => e.map((x) => x.getAttribute("data-row")));
  if (ids.length === 0) throw new Error("no rows");
  for (const id of ids) {
    const link = await page.$(`[data-row-link="${id}"]`);
    if (!link) throw new Error(`row ${id} is not clickable`);
    const href = await link.getAttribute("href");
    if (href !== `/operations/responsibilities/${id}`) throw new Error(`row ${id} links to ${href}`);
  }
  if (rpcCalls.includes("responsibility_detail"))
    throw new Error("the list surface fetched detail per row — this is the N+1 the ruling forbids");
  const projections = rpcCalls.filter((n) => n.startsWith("projection_"));
  if (projections.length !== 1) throw new Error(`${projections.length} projection requests for one list render`);
});

await T("DQ-22 the in-surface picker offers exactly the five closed-vocabulary departments", async () => {
  const opts = await page.$$eval("[data-picker-option]", (e) => e.map((x) => x.getAttribute("data-picker-option")));
  const expected = ["culinary", "equipment", "logistics", "staffing", "venue"];
  if ([...opts].sort().join(",") !== expected.join(",")) throw new Error(`picker offers [${opts.join(",")}]`);
  const active = await page.$$eval('[data-picker-active="true"]', (e) => e.map((x) => x.getAttribute("data-picker-option")));
  if (active.join(",") !== "culinary") throw new Error(`active option was [${active.join(",")}]`);
});

await T("DQ-23 the Departments surface with nothing chosen renders the picker and reads NOTHING", async () => {
  rpcCalls = [];
  await page.goto("http://localhost:4299/?department=");
  await page.waitForSelector("[data-queue][data-outcome='choose']", { state: "attached", timeout: 15000 });
  const opts = await page.$$eval("[data-picker-option]", (e) => e.length);
  if (opts !== 5) throw new Error(`${opts} picker options on the chooser`);
  if (await page.$("[data-row]")) throw new Error("rows rendered without a department chosen");
  const projections = rpcCalls.filter((n) => n.startsWith("projection_"));
  if (projections.length !== 0) throw new Error(`the chooser issued ${projections.length} projection request(s)`);
});

console.log(`\naccept-department-queue: ${passed} passed, ${failed} failed`);
await browser.close(); server.close();
process.exit(failed === 0 ? 0 : 1);   // the fixture database is dropped by the registered cleanup
