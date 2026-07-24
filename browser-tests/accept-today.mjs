// v288 OPERATIONS TODAY ACCEPTANCE — the REAL mounted production surface in
// Chromium, reading the REAL projection_operations_today from a REAL Postgres
// database. No fixtures. Claims UI-1…UI-8.
//
// Uses a disposable database (createdb -T ec ec_today288) so seeded truth is
// visible to the page and is destroyed afterwards.
//
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-today.mjs
import esbuild from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync, existsSync, writeFileSync, unlinkSync, chmodSync } from "fs";
import { execFileSync } from "child_process";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const DB = "ec_today288";

// ── live SQL helpers ───────────────────────────────────────────────────────
// via a temp file: psql -c cannot take multi-line statements reliably
const psql = (sql, db = DB) => {
  const f = `/tmp/v288_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(f, sql); chmodSync(f, 0o644);
  try {
    return execFileSync("su", ["postgres", "-c", `psql -d ${db} -tA -v ON_ERROR_STOP=1 -f ${f}`],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
  } finally { try { unlinkSync(f); } catch { /* ignore */ } }
};

const sh = (cmd) => execFileSync("sh", ["-c", cmd], { encoding: "utf8" }).trim();

sh(`su postgres -c "dropdb --if-exists ${DB}" ; su postgres -c "createdb -T ec ${DB}"`);

const [TENANT, USER] = psql(
  `select tu.tenant_id||' '||tu.user_id from public.tenant_users tu where tu.active order by tu.tenant_id limit 1`
).split(" ");

// session context prefix for every live call
const ctx = `select set_config('app.user_id','${USER}',false), set_config('request.jwt.claim.sub','${USER}',false);`;

// ── seed real truth ────────────────────────────────────────────────────────
const seed = `
${ctx}
do $$
declare v_t uuid := '${TENANT}'; v_e uuid; v_r uuid;
begin
  insert into public.event (tenant_id, engagement_ref, origin_commitment_ref, released_by)
  values (v_t, gen_random_uuid(), gen_random_uuid(), 'v288') returning id into v_e;
  insert into public.execution_evidence (tenant_id, event_ref, kind, actor, payload)
  values (v_t, v_e, 'released', 'v288', '{}'::jsonb);
  perform public.derive_responsibilities(v_e);

  -- owned by the viewer, closing soon (feeds My Work + At Risk)
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    origin_revision, kind, department, required_outcome, natural_key, timing)
  values (v_t, null, 'standing', gen_random_uuid(), 'knowledge', gen_random_uuid(),
    'prep', 'culinary', 'Rub the brisket', 'v288_'||gen_random_uuid()::text,
    jsonb_build_object('window_end',(now()+interval '3 hours')::text))
  returning id into v_r;
  perform public.transfer_responsibility_ownership(v_r, '${USER}', null, 'v288');

  -- ownerless (feeds Nobody's)
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    origin_revision, kind, department, required_outcome, natural_key, timing)
  values (v_t, null, 'standing', gen_random_uuid(), 'knowledge', gen_random_uuid(),
    'stage', 'equipment', 'Stage the chafers', 'v288_'||gen_random_uuid()::text,
    jsonb_build_object('window_end',(now()+interval '30 hours')::text));

  -- ownerless, far out (Nobody's but not at risk)
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    origin_revision, kind, department, required_outcome, natural_key, timing)
  values (v_t, null, 'standing', gen_random_uuid(), 'knowledge', gen_random_uuid(),
    'load', 'logistics', 'Load the truck', 'v288_'||gen_random_uuid()::text,
    jsonb_build_object('window_end',(now()+interval '20 days')::text));
end $$;`;
psql(seed);

// ── evidence-ledger fingerprint, for UI-6 ─────────────────────────────────
const fingerprint = () => psql(`${ctx}
  select (select count(*) from public.execution_evidence)||'/'||
         (select count(*) from public.responsibility_owner)||'/'||
         (select count(*) from public.obligation)`).split("\n").pop();
const beforeFingerprint = fingerprint();

// ── build the REAL page with only the transport substituted ───────────────
const aliasPlugin = { name: "alias", setup(b) {
  // The transport must be substituted for EVERY import form. Aliasing only
  // "@/lib/supabase" is not enough: much of src/lib imports "./supabase"
  // relatively, which would silently pull in the real client (and throw
  // "supabaseUrl is required"). Catch every path that resolves to it.
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
  entryPoints: [join(here, "today.harness.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic", loader: { ".ts": "ts", ".tsx": "tsx" },
  define: { "process.env.NODE_ENV": '"development"' },
  banner: { js: "window.process=window.process||{env:{}};" },
  plugins: [aliasPlugin], logLevel: "silent",
});
const js = built.outputFiles[0].text;
const html = readFileSync(join(here, "today.html"));
const css = existsSync(join(here, "app.css")) ? readFileSync(join(here, "app.css")) : "";

// ── the bridge: browser → runner → live Postgres ──────────────────────────
let mode = "live";          // live | refuse | transport | signedout
let rpcCalls = [];

const readBody = (req) => new Promise((ok) => {
  let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => ok(s ? JSON.parse(s) : {}));
});

const server = createServer(async (req, res) => {
  const u = req.url.split("?")[0];
  if (req.method === "GET") {
    if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(html); }
    if (u === "/today.harness.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js); }
    if (u === "/app.css") { res.writeHead(200, { "content-type": "text/css" }); return res.end(css); }
    res.writeHead(404); return res.end();
  }
  const body = await readBody(req);

  if (u === "/auth") {
    const user = mode === "signedout" ? null
      : mode === "noviewer" ? { id: "", email: null }
      : { id: USER, email: "viewer@example.test" };
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ data: { data: { user }, error: null }, error: null }));
  }
  if (u === "/from") {
    // tenant_users lookup used by loadSession()
    const row = mode === "signedout" ? null
      : { tenant_id: TENANT, role: "admin", active: true, tenants: { name: "Fixture" } };
    // noviewer keeps the tenant row (trusted tenant) but yields no user id
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ data: row, error: null }));
  }
  if (u === "/rpc") {
    rpcCalls.push(body.name);
    if (mode === "transport") { res.writeHead(503); return res.end(); }
    try {
      let sql;
      if (mode === "refuse") {
        // a GENUINE refusal from live SQL: closed department vocabulary
        sql = `${ctx} select public.projection_department_queue('marketing','none')`;
      } else {
        const p = body.params || {};
        const viewer = p.p_viewer == null ? "null" : `'${String(p.p_viewer).replace(/'/g, "''")}'`;
        const since = p.p_since == null ? "null" : `'${p.p_since}'::timestamptz`;
        // Session context is injected ONLY when authenticated. Signed out means
        // an anonymous connection, exactly as it would be in production, so the
        // untrusted path is genuinely exercised rather than simulated.
        const sessionCtx = mode === "signedout" ? "" : ctx;
        sql = `${sessionCtx} select public.${body.name}(${viewer}, ${since})`;
      }
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
await new Promise((ok) => server.listen(4298, ok));

const browser = await chromium.launch();
const page = await browser.newPage();
let passed = 0, failed = 0;
const T = async (n, fn) => { try { await fn(); passed++; console.log(`PASS ${n}`); }
  catch (e) { failed++; console.log(`FAIL ${n}\n     ${e.message.split("\n")[0]}`); } };
const attr = (s, a) => page.getAttribute(s, a);
const go = async (q = "") => {
  await page.goto(`http://localhost:4298/${q}`);
  await page.waitForSelector("[data-today][data-outcome]:not([data-outcome='loading'])", { state: "attached", timeout: 15000 });
};

// ══ UI-1 · live end-to-end ════════════════════════════════════════════════
await go();
await T("UI-1 the mounted production surface renders from the REAL projection against live SQL (no fixtures)", async () => {
  if (await attr("[data-today]", "data-outcome") !== "ready") throw new Error("not ready");
  if (await attr("[data-today]", "data-projection") !== "operations_today") throw new Error("wrong projection");
  const tv = await attr("[data-today]", "data-truth-version");
  if (!tv || tv.length < 16) throw new Error("no SQL-owned truth_version");
  const live = psql(`${ctx} select (public.projection_operations_today(null,null)->'provenance'->>'truth_version')`).split("\n").pop();
  if (tv !== live) throw new Error(`truth_version ${tv} != live ${live}`);
});

// ══ UI-2 · ownerless completeness — the primary gate ══════════════════════
await T("UI-2 the Nobody's band renders projection membership exactly — the client cannot shrink the debt list", async () => {
  const rendered = (await attr('[data-band="ownerless"]', "data-band-members")).split(",").filter(Boolean).sort();
  const sqlIds = psql(`${ctx} select string_agg(f.responsibility::text, ',' order by f.responsibility)
     from public.responsibility_feed('{"unowned":true}'::jsonb) f`).split("\n").pop();
  const expected = (sqlIds || "").split(",").filter(Boolean).sort();
  if (expected.length === 0) throw new Error("fixture produced no ownerless work");
  if (rendered.join(",") !== expected.join(",")) throw new Error(`rendered ${rendered.length} vs feed ${expected.length}`);
  const shown = await page.$$eval('[data-row-band="ownerless"]', (e) => e.length);
  if (shown !== expected.length) throw new Error(`${shown} rows displayed vs ${expected.length} owed`);
});

// ══ UI-3 · no client-derived state ════════════════════════════════════════
await T("UI-3 every rendered state equals the projected state for the same row", async () => {
  const rows = await page.$$eval("[data-row]", (els) =>
    els.map((e) => [e.getAttribute("data-row"), e.getAttribute("data-state")]));
  if (rows.length === 0) throw new Error("no rows rendered");
  const seen = new Map();
  for (const [id, st] of rows) {
    const live = psql(`${ctx} select public.responsibility_state('${id}'::uuid)`).split("\n").pop();
    if (st !== live) throw new Error(`${id}: rendered ${st}, SQL says ${live}`);
    seen.set(id, st);
  }
  const ok = ["derived", "standing", "active", "discharged", "lapsed", "superseded", "void"];
  for (const st of seen.values()) if (!ok.includes(st)) throw new Error(`state outside the seven: ${st}`);
});

// ══ UI-4 · no client-derived membership ═══════════════════════════════════
await T("UI-4 rendered membership equals the envelope's membership — bands are lookups, not filters", async () => {
  const membership = (await attr("[data-today]", "data-membership")).split(",").filter(Boolean).sort();
  const sqlIds = psql(`${ctx} select string_agg(f.responsibility::text, ',' order by f.responsibility)
     from public.responsibility_feed('{}'::jsonb) f`).split("\n").pop();
  const expected = (sqlIds || "").split(",").filter(Boolean).sort();
  if (membership.join(",") !== expected.join(",")) throw new Error(`page ${membership.length} vs feed ${expected.length}`);
  // every band is a subset of that one membership set
  for (const b of ["mine", "ownerless", "at_risk", "changed"]) {
    const ids = (await attr(`[data-band="${b}"]`, "data-band-members")).split(",").filter(Boolean);
    for (const id of ids) if (!membership.includes(id)) throw new Error(`band ${b} invented ${id}`);
  }
});

// ══ UI-5 · counts are the envelope's ══════════════════════════════════════
await T("UI-5 displayed counts equal projection counts and equal what is displayed", async () => {
  const live = JSON.parse(psql(`${ctx} select (public.projection_operations_today('${USER}',null)->'counts')`).split("\n").pop());
  for (const [band, key] of [["ownerless", "ownerless"], ["at_risk", "at_risk"], ["mine", "mine"]]) {
    const shown = await attr(`[data-count="${band}"]`, "data-count-value");
    if (Number(shown) !== Number(live[key] ?? 0)) throw new Error(`${band}: shown ${shown} vs projection ${live[key]}`);
  }
  const ownerlessBand = (await attr('[data-band="ownerless"]', "data-band-count"));
  const ownerlessCount = await attr('[data-count="ownerless"]', "data-count-value");
  if (ownerlessBand !== ownerlessCount) throw new Error(`band ${ownerlessBand} != count ${ownerlessCount}`);
});

// ══ UI-7 · label pack is presentation only ════════════════════════════════
await T("UI-7 swapping the label pack changes words only — membership, state and order identical", async () => {
  const before = {
    members: await attr("[data-today]", "data-membership"),
    states: await page.$$eval("[data-row]", (e) => e.map((x) => x.getAttribute("data-state")).join(",")),
    order: await page.$$eval("[data-row]", (e) => e.map((x) => x.getAttribute("data-row")).join(",")),
    dept: await attr('[data-row][data-dept-key="equipment"]', "data-dept-label"),
  };
  await go("?pack=generic");
  const after = {
    members: await attr("[data-today]", "data-membership"),
    states: await page.$$eval("[data-row]", (e) => e.map((x) => x.getAttribute("data-state")).join(",")),
    order: await page.$$eval("[data-row]", (e) => e.map((x) => x.getAttribute("data-row")).join(",")),
    dept: await attr('[data-row][data-dept-key="equipment"]', "data-dept-label"),
  };
  if (before.dept !== "Pulls") throw new Error(`catering label was ${before.dept}`);
  if (after.dept !== "Warehouse") throw new Error(`generic label was ${after.dept}`);
  if (before.members !== after.members) throw new Error("membership changed");
  if (before.states !== after.states) throw new Error("state changed");
  if (before.order !== after.order) throw new Error("order changed");
  await go();
});

// ══ UI-8 · refusal, transport and empty truth are distinct ════════════════
await T("UI-8a a genuine SQL refusal renders honestly — no stale fallback, no invented view", async () => {
  mode = "refuse";
  await go();
  if (await attr("[data-today]", "data-outcome") !== "refusal") throw new Error("refusal not surfaced");
  const code = await attr("[data-today]", "data-refusal-code");
  if (code !== "PROJECTION_FILTER_INVALID") throw new Error(`code ${code}`);
  if (await page.$("[data-band]")) throw new Error("stale bands rendered under refusal");
  if (await page.$("[data-empty-truth]")) throw new Error("refusal shown as an empty day");
  mode = "live";
});
await T("UI-8b a transport failure is distinguished from a refusal and from empty truth", async () => {
  mode = "transport";
  await go();
  if (await attr("[data-today]", "data-outcome") !== "transport") throw new Error("transport not surfaced");
  if (await page.$("[data-band]")) throw new Error("stale bands rendered under transport failure");
  mode = "live";
});
await T("UI-9a NO TRUSTED TENANT — the whole projection refuses and no operational band renders", async () => {
  mode = "signedout";
  rpcCalls = [];            // count requests made by THIS render only
  await go();
  if (await attr("[data-today]", "data-outcome") !== "refusal") throw new Error("untrusted read did not refuse");
  if (await attr("[data-today]", "data-refusal-code") !== "TENANT_UNRESOLVED") throw new Error("wrong refusal code");
  if (await page.$("[data-band]")) throw new Error("an operational band rendered without a trusted tenant");
  if (await page.$("[data-empty-truth]")) throw new Error("untrusted read misreported as an empty day");
  if (await page.$("[data-row]")) throw new Error("responsibility rows rendered without a trusted tenant");
  // the surface must not even ASK when untrusted
  const asked = rpcCalls.filter((n) => n.startsWith("projection_")).length;
  if (asked !== 0) throw new Error(`untrusted surface issued ${asked} projection request(s)`);
  mode = "live";
});
await T("UI-9b defence in depth — an anonymous read is empty at the DATABASE, independently of the client", async () => {
  const anon = psql(`select public.projection_operations_today(null,null)->'counts'->>'total'`).split("\n").pop();
  if (anon !== "0") throw new Error(`anonymous read returned ${anon} rows from SQL`);
  const anonFeed = psql(`select count(*) from public.responsibility_feed('{}'::jsonb)`).split("\n").pop();
  if (anonFeed !== "0") throw new Error(`anonymous feed returned ${anonFeed} rows`);
});
await T("UI-9c TRUSTED TENANT, UNRESOLVED VIEWER — My Work refuses; tenant bands still render", async () => {
  mode = "noviewer";
  await go();
  if (await attr("[data-today]", "data-outcome") !== "ready") throw new Error("trusted tenant should still render");
  if (await attr("[data-today]", "data-tenant-trusted") !== "true") throw new Error("tenant not trusted");
  if (!(await page.$('[data-band-refusal="mine"]'))) throw new Error("My Work not refused");
  if (await attr('[data-band="mine"]', "data-band-count") !== "0") throw new Error("fabricated My Work");
  if (await attr("[data-today]", "data-viewer") !== "") throw new Error("invented a viewer identity");
  const ownerless = Number(await attr('[data-band="ownerless"]', "data-band-count"));
  if (ownerless === 0) throw new Error("tenant bands did not render for a trusted tenant");
  mode = "live";
});

// ══ UI-6 · zero writes across the whole sweep ═════════════════════════════
await go();
await T("UI-6 the entire interaction sweep performed zero writes — ledger fingerprint unchanged", async () => {
  const after = fingerprint();
  if (after !== beforeFingerprint) throw new Error(`${beforeFingerprint} -> ${after}`);
  const writes = rpcCalls.filter((n) => !n.startsWith("projection_"));
  if (writes.length > 0) throw new Error(`non-projection rpc called: ${[...new Set(writes)].join(",")}`);
  const perLoad = rpcCalls.filter((n) => n === "projection_operations_today").length;
  if (perLoad === 0) throw new Error("the surface never called the projection");
});
await T("UI-6b the surface reads ONE projection envelope per render — no per-band requests", async () => {
  rpcCalls = [];
  await go();
  const calls = rpcCalls.filter((n) => n.startsWith("projection_"));
  if (calls.length !== 1) throw new Error(`${calls.length} projection requests for one render: ${calls.join(",")}`);
});

console.log(`\naccept-today: ${passed} passed, ${failed} failed`);
await browser.close(); server.close();
sh(`su postgres -c "dropdb --if-exists ${DB}"`);
process.exit(failed === 0 ? 0 : 1);
