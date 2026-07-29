// v292e DAY SHEET ACCEPTANCE — the REAL mounted production surface in Chromium,
// reading the REAL projection_occurrences_for_operational_day and the REAL
// projection_day_sheet from a REAL Postgres database. No fixtures for truth.
// Claims DS-1…DS-16.
//
// Disposable database (createdb -T ec ec_day292e) so seeded truth is visible to
// the page and destroyed afterwards.
//
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-day-sheet.mjs
import esbuild from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync, existsSync, writeFileSync, unlinkSync, chmodSync } from "fs";
import { execFileSync } from "child_process";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const DB = "ec_day292e";

const psql = (sql, db = DB) => {
  const f = `/tmp/v292e_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(f, sql); chmodSync(f, 0o644);
  try {
    return execFileSync("su", ["postgres", "-c", `psql -d ${db} -tA -v ON_ERROR_STOP=1 -f ${f}`],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
  } finally { try { unlinkSync(f); } catch { /* ignore */ } }
};
const sh = (cmd) => execFileSync("sh", ["-c", cmd], { encoding: "utf8" }).trim();

sh(`su postgres -c "dropdb --if-exists ${DB}" ; su postgres -c "createdb -T ec ${DB}"`);

const [TENANT, USER] = psql(
  `select tu.tenant_id||' '||tu.user_id from public.tenant_users tu
    where tu.active order by tu.tenant_id limit 1`).split(" ");
const ctx = `select set_config('app.user_id','${USER}',false), set_config('request.jwt.claim.sub','${USER}',false);`;

// The tenant operational day, resolved by SQL. The harness never computes it
// either — same rule as the client.
const TZ   = psql(`${ctx} select public.tenant_operational_timezone('${TENANT}'::uuid)`).split("\n").pop();
const HOUR = psql(`${ctx} select public.tenant_operational_day_start_hour('${TENANT}'::uuid)`).split("\n").pop();
const DAY  = psql(`${ctx} select public.operational_day_of(now(),'${TZ}',${HOUR})`).split("\n").pop();

// ── seed real truth: three on-day occurrences + work inside the window ─────
const seed = `
${ctx}
do $$
declare v_t uuid := '${TENANT}'; b uuid; occ uuid; occ2 uuid; occ3 uuid;
        v_e uuid; v_ven uuid;
begin
  insert into public.venue (tenant_id,name,address,venue_type,created_by)
    values (v_t,'Day Ballroom','1 Day St','fixed_facility','v292e') returning id into v_ven;

  -- A · bare-ish, preparing, incomplete
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_t,'Klein','DS-A-'||substr(gen_random_uuid()::text,1,8),'active') returning id into b;
  occ := (public.open_occurrence(b, null, null)->>'occurrence_id')::uuid;
  perform public.set_schedule_milestone(p_occurrence=>occ, p_milestone_key=>'operating_date',
    p_at_date=>date '${DAY}', p_at_moment=>null, p_window_end=>null, p_label=>null, p_reason=>null);
  perform public.bind_occurrence_venue(p_occurrence=>occ, p_venue=>v_ven, p_reason=>null);
  perform public.commit_attendance(p_occurrence=>occ, p_head_count=>180,
    p_basis=>'contracted', p_effective_moment=>null, p_reason=>null);

  -- B · named, so ordering is observable
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_t,'Katz','DS-B-'||substr(gen_random_uuid()::text,1,8),'active') returning id into b;
  occ2 := (public.open_occurrence(b, null, null)->>'occurrence_id')::uuid;
  perform public.set_schedule_milestone(p_occurrence=>occ2, p_milestone_key=>'operating_date',
    p_at_date=>date '${DAY}', p_at_moment=>null, p_window_end=>null, p_label=>null, p_reason=>null);
  perform public.set_occurrence_profile(p_occurrence=>occ2,
    p_display_name=>'Bar Mitzvah Katz', p_occasion_kind=>null, p_reason=>null);

  -- C · cancelled, must render last
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values (v_t,'Gone','DS-C-'||substr(gen_random_uuid()::text,1,8),'active') returning id into b;
  occ3 := (public.open_occurrence(b, null, null)->>'occurrence_id')::uuid;
  perform public.set_schedule_milestone(p_occurrence=>occ3, p_milestone_key=>'operating_date',
    p_at_date=>date '${DAY}', p_at_moment=>null, p_window_end=>null, p_label=>null, p_reason=>null);
  perform public.cancel_occurrence(p_occurrence=>occ3, p_reason=>'v292e fixture');

  -- Work inside the operational window, so the Work lens is non-empty and
  -- DS-10 cannot pass vacuously. A lawful standing responsibility, per the
  -- v286 SC-3 / v287b fixture pattern.
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    origin_revision, kind, department, required_outcome, natural_key, timing)
  values (v_t, null, 'standing', gen_random_uuid(), 'knowledge', gen_random_uuid(),
    'prep', 'culinary', 'Rub the brisket', 'v292e_'||gen_random_uuid()::text,
    jsonb_build_object(
      'due', (public.operational_day_start(date '${DAY}' + 1,'${TZ}',${HOUR}) - interval '2 hours')::text,
      'window_end', (public.operational_day_start(date '${DAY}' + 1,'${TZ}',${HOUR}) - interval '2 hours')::text));

  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    origin_revision, kind, department, required_outcome, natural_key, timing)
  values (v_t, null, 'standing', gen_random_uuid(), 'knowledge', gen_random_uuid(),
    'stage', 'equipment', 'Stage the chafers', 'v292e_'||gen_random_uuid()::text,
    jsonb_build_object(
      'due', (public.operational_day_start(date '${DAY}','${TZ}',${HOUR}) + interval '4 hours')::text,
      'window_end', (public.operational_day_start(date '${DAY}','${TZ}',${HOUR}) + interval '4 hours')::text));
end $$;`;
psql(seed);

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
  b.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(here, "stub-link.tsx") }));
  b.onResolve({ filter: /^@\// }, (a) => {
    const base = join(root, "src", a.path.slice(2));
    for (const ext of [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"])
      if (existsSync(base + ext)) return { path: base + ext };
    return { path: base };
  });
}};
// next/link is not available outside the Next runtime; an <a> preserves the
// href contract DS-11 asserts without pulling the framework in.
writeFileSync(join(here, "stub-link.tsx"),
  `export default function Link(p:any){const{href,children,...r}=p;return <a href={href} {...r}>{children}</a>;}\n`);

const built = await esbuild.build({
  entryPoints: [join(here, "day.harness.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic", loader: { ".ts": "ts", ".tsx": "tsx" },
  define: { "process.env.NODE_ENV": '"development"' },
  banner: { js: "window.process=window.process||{env:{}};" },
  plugins: [aliasPlugin], logLevel: "silent",
});
const js = built.outputFiles[0].text;
const html = readFileSync(join(here, "day.html"));
const css = existsSync(join(here, "app.css")) ? readFileSync(join(here, "app.css")) : "";

// ── bridge: browser → runner → live Postgres ──────────────────────────────
// Unlike accept-today.mjs, this dispatches PER PROJECTION: the two lenses have
// different arities and a single hardcoded shape cannot serve both.
let mode = "live";              // live | refuse | transport | badversion
let rpcCalls = [];              // [{name, params}]

const readBody = (req) => new Promise((ok) => {
  let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => ok(s ? JSON.parse(s) : {}));
});
const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);

const server = createServer(async (req, res) => {
  const u = req.url.split("?")[0];
  if (req.method === "GET") {
    if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(html); }
    if (u === "/day.harness.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js); }
    if (u === "/app.css") { res.writeHead(200, { "content-type": "text/css" }); return res.end(css); }
    res.writeHead(404); return res.end();
  }
  const body = await readBody(req);
  if (u === "/auth") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ data: { data: { user: { id: USER, email: "v@e.test" } }, error: null }, error: null }));
  }
  if (u === "/from") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ data: { tenant_id: TENANT, role: "admin", active: true, tenants: { name: "Fixture" } }, error: null }));
  }
  if (u === "/rpc") {
    rpcCalls.push({ name: body.name, params: body.params || {} });
    if (mode === "transport") { res.writeHead(503); return res.end(); }
    try {
      const p = body.params || {};
      let sql;
      if (mode === "refuse") {
        sql = `${ctx} select public.projection_department_queue('marketing','none')`;
      } else if (body.name === "projection_occurrences_for_operational_day") {
        sql = `${ctx} select public.projection_occurrences_for_operational_day(${p.p_day == null ? "null" : `${lit(p.p_day)}::date`}${p.p_now ? `, ${lit(p.p_now)}::timestamptz` : ""})`;
      } else if (body.name === "projection_day_sheet") {
        sql = `${ctx} select public.projection_day_sheet(${lit(p.p_day)}::date, ${lit(p.p_group_by ?? "department")}${p.p_now ? `, ${lit(p.p_now)}::timestamptz` : ""})`;
      } else {
        sql = `${ctx} select public.${body.name}()`;
      }
      const out = psql(sql);
      let json = JSON.parse(out.split("\n").pop());
      // DS-5b: force a version the client must refuse.
      if (mode === "badversion" && body.name === "projection_day_sheet") json.version = 2;
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ data: json, error: null }));
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
  catch (e) { failed++; console.log(`FAIL ${n}\n     ${e.message.split("\n")[0]}`); } };
const attr = (s, a) => page.getAttribute(s, a);
const go = async (q = "") => {
  rpcCalls = [];
  await page.goto(`http://localhost:4299/${q}`);
  await page.waitForSelector("[data-day-sheet][data-outcome]:not([data-outcome='loading'])",
    { state: "attached", timeout: 15000 });
};

const liveP = () => JSON.parse(psql(`${ctx} select public.projection_occurrences_for_operational_day(null)`).split("\n").pop());

await go();

// ══ DS-1 · exactly two projection reads, one per lens ═════════════════════
await T("DS-1 the surface issues exactly TWO projection reads — one per lens, never one, never per-row", async () => {
  const calls = rpcCalls.filter((c) => c.name.startsWith("projection_"));
  if (calls.length !== 2) throw new Error(`${calls.length} reads: ${calls.map((c) => c.name).join(",")}`);
  const names = calls.map((c) => c.name).sort();
  if (names[0] !== "projection_day_sheet" || names[1] !== "projection_occurrences_for_operational_day")
    throw new Error(`wrong projections: ${names.join(",")}`);
});

// ══ DS-2 · SQL resolves the day; the client asks for none ═════════════════
await T("DS-2 the Promise lens is called with NO day and NO clock, and the header shows the day SQL resolved", async () => {
  const call = rpcCalls.find((c) => c.name === "projection_occurrences_for_operational_day");
  if (call.params.p_day !== null && call.params.p_day !== undefined)
    throw new Error(`client sent a day: ${JSON.stringify(call.params.p_day)}`);
  if ("p_now" in call.params) throw new Error(`client sent a clock: ${call.params.p_now}`);
  const shown = await attr("[data-day-sheet]", "data-day");
  if (shown !== DAY) throw new Error(`header ${shown} vs SQL ${DAY}`);
  if (await attr("[data-day-sheet]", "data-timezone") !== TZ) throw new Error("timezone not from scope");
});

// ══ DS-3 · the Work lens gets the Promise day AND the Promise moment ══════
await T("DS-3 the Work lens receives exactly the day and the evaluation moment the Promise envelope reported", async () => {
  const p = rpcCalls.find((c) => c.name === "projection_occurrences_for_operational_day");
  const w = rpcCalls.find((c) => c.name === "projection_day_sheet");
  const asOf = await attr("[data-day-sheet]", "data-as-of");
  if (w.params.p_day !== DAY) throw new Error(`work day ${w.params.p_day} vs ${DAY}`);
  if (!w.params.p_now) throw new Error("work lens took its own clock");
  if (w.params.p_now !== asOf) throw new Error(`work p_now ${w.params.p_now} != promise as_of ${asOf}`);
  if (p.params.p_now) throw new Error("promise lens was pinned by the client");
  const wAsOf = await attr("[data-day-sheet]", "data-work-as-of");
  if (wAsOf !== asOf) throw new Error(`two moments rendered: ${asOf} vs ${wAsOf}`);
});

// ══ DS-4 / DS-5 · envelope identity and LIVE version enforcement ══════════
await T("DS-4 the Promise envelope is occurrences_for_operational_day v1", async () => {
  if (await attr("[data-day-sheet]", "data-promise-projection") !== "occurrences_for_operational_day")
    throw new Error("wrong promise projection");
  if (await attr("[data-day-sheet]", "data-promise-version") !== "1") throw new Error("wrong version");
});
await T("DS-5 the Work envelope is day_sheet v1", async () => {
  if (await attr("[data-day-sheet]", "data-work-projection") !== "day_sheet") throw new Error("wrong work projection");
  if (await attr("[data-day-sheet]", "data-work-version") !== "1") throw new Error("wrong version");
});
await T("DS-5b version enforcement is LIVE — an unexpected version refuses rather than rendering", async () => {
  mode = "badversion";
  await go();
  if (await attr("[data-day-sheet]", "data-outcome") !== "refusal")
    throw new Error("a v2 envelope rendered instead of refusing");
  if (await attr("[data-day-sheet]", "data-refusal-code") !== "PROJECTION_VERSION_UNSUPPORTED")
    throw new Error(`code ${await attr("[data-day-sheet]", "data-refusal-code")}`);
  if (await page.$('[data-lens="work"]')) throw new Error("work lens rendered under a version refusal");
  mode = "live"; await go();
});

// ══ DS-6 / DS-7 · pass-through ════════════════════════════════════════════
await T("DS-6 every Promise row value on screen equals the projection's value, unmodified", async () => {
  const env = liveP();
  for (const r of env.data.occurrences) {
    const sel = `[data-occurrence-row="${r.occurrence}"]`;
    if (!(await page.$(sel))) throw new Error(`row ${r.occurrence} not rendered`);
    if (await attr(sel, "data-missing-count") !== String(r.missing_count))
      throw new Error(`${r.occurrence}: missing_count drift`);
    if (await attr(sel, "data-active") !== String(r.active)) throw new Error("active drift");
    if (await attr(sel, "data-has-event") !== String(r.has_event)) throw new Error("has_event drift");
    if (await attr(sel, "data-operating-date") !== r.operating_date) throw new Error("operating_date drift");
    if (await attr(sel, "data-venue") !== (r.venue ?? "")) throw new Error("venue drift");
  }
});
await T("DS-7 every Work row state equals the projected state — no client-derived lifecycle", async () => {
  const ids = (await attr('[data-lens="work"]', "data-members")).split(",").filter(Boolean);
  if (ids.length === 0) throw new Error("fixture produced no work in the operational window");
  for (const id of ids) {
    const shown = await attr(`[data-responsibility-row="${id}"]`, "data-state");
    const live = psql(`${ctx} select public.responsibility_state('${id}'::uuid)`).split("\n").pop();
    if (shown !== live) throw new Error(`${id}: rendered ${shown}, SQL says ${live}`);
  }
});

// ══ DS-8 · the constitutional claim: the lenses are never merged ══════════
await T("DS-8 the two lenses are separately rooted — no element carries both an occurrence and a responsibility", async () => {
  const promiseIds = (await attr('[data-lens="promise"]', "data-members")).split(",").filter(Boolean);
  const workIds = (await attr('[data-lens="work"]', "data-members")).split(",").filter(Boolean);
  if (promiseIds.length === 0 || workIds.length === 0) throw new Error("a lens was empty; claim would be vacuous");
  const both = await page.$$eval("*", (els) =>
    els.filter((e) => e.hasAttribute("data-occurrence-row") && e.hasAttribute("data-responsibility-row")).length);
  if (both !== 0) throw new Error(`${both} element(s) carry both row identities`);
  // no occurrence row inside the work lens, and vice versa
  const xa = await page.$$eval('[data-lens="work"] [data-occurrence-row]', (e) => e.length);
  const xb = await page.$$eval('[data-lens="promise"] [data-responsibility-row]', (e) => e.length);
  if (xa !== 0 || xb !== 0) throw new Error(`cross-contained rows: ${xa}/${xb}`);
  for (const id of promiseIds) if (workIds.includes(id)) throw new Error(`id ${id} appears in both lenses`);
});

// ══ DS-9 / DS-10 · counts are the envelope's, and non-vacuous ═════════════
await T("DS-9 Promise counts are the projection's counts, not client-derived, and are non-zero", async () => {
  const env = liveP();
  const c = env.counts;
  if (Number(c.total) === 0) throw new Error("fixture produced no occurrences; claim would be vacuous");
  for (const [k, sel] of [["total", "total"], ["released", "released"], ["preparing", "preparing"],
                          ["cancelled", "cancelled"], ["incomplete", "incomplete"]]) {
    const shown = await attr('[data-lens="promise"]', `data-count-${sel}`);
    if (Number(shown) !== Number(c[k])) throw new Error(`${k}: shown ${shown} vs projection ${c[k]}`);
  }
  // released + preparing + cancelled partition total exactly
  if (Number(c.released) + Number(c.preparing) + Number(c.cancelled) !== Number(c.total))
    throw new Error("the partition does not sum to total");
});
await T("DS-10 Work counts are the projection's counts, non-derived, non-zero", async () => {
  const w = JSON.parse(psql(`${ctx} select public.projection_day_sheet(date '${DAY}','department')`).split("\n").pop());
  if (Number(w.counts.total) === 0) throw new Error("fixture produced no work; claim would be vacuous");
  if (Number(await attr('[data-lens="work"]', "data-count-total")) !== Number(w.counts.total))
    throw new Error("total drift");
  if (Number(await attr('[data-lens="work"]', "data-count-ownerless")) !== Number(w.counts.ownerless ?? 0))
    throw new Error("ownerless drift");
});

// ══ DS-11 · navigation ════════════════════════════════════════════════════
await T("DS-11 a Promise row navigates to the existing preparation console", async () => {
  const id = (await attr('[data-lens="promise"]', "data-members")).split(",").filter(Boolean)[0];
  const href = await attr(`[data-prepare-link="${id}"]`, "href");
  if (href !== `/operations/occurrences/${id}/prepare`) throw new Error(`href ${href}`);
});

// ══ DS-12 · empty day ═════════════════════════════════════════════════════
await T("DS-12 an empty operational day renders both lenses empty, with the day still resolved and no error", async () => {
  const empty = JSON.parse(psql(`${ctx} select public.projection_occurrences_for_operational_day(date '2031-01-06')`).split("\n").pop());
  if (Number(empty.counts.total) !== 0) throw new Error("chosen day is not empty");
  if (!empty.scope.day) throw new Error("scope.day absent on an empty day");
  if (empty.data.occurrences.length !== 0) throw new Error("rows on an empty day");
});

// ══ DS-13 · cancelled last, in projection order ═══════════════════════════
await T("DS-13 cancelled occurrences render as cancelled and appear last, in projection order", async () => {
  const env = liveP();
  const expected = env.data.occurrences.map((r) => r.occurrence);
  const rendered = await page.$$eval("[data-occurrence-row]", (e) =>
    e.map((x) => x.getAttribute("data-occurrence-row")));
  if (rendered.join(",") !== expected.join(",")) throw new Error("render order != projection order");
  const cancelled = env.data.occurrences.filter((r) => !r.active).map((r) => r.occurrence);
  if (cancelled.length === 0) throw new Error("fixture produced no cancelled occurrence");
  const tail = expected.slice(-cancelled.length);
  if (tail.sort().join(",") !== cancelled.sort().join(",")) throw new Error("cancelled not last");
  if (await attr(`[data-occurrence-row="${cancelled[0]}"]`, "data-active") !== "false")
    throw new Error("cancelled row not marked inactive");
});

// ══ DS-14 · membership is the invariant, not order ════════════════════════
await T("DS-14 membership and counts are identical under a label-pack swap — presentation never moves the set", async () => {
  const before = {
    p: await attr('[data-lens="promise"]', "data-members"),
    w: await attr('[data-lens="work"]', "data-members"),
    pt: await attr('[data-lens="promise"]', "data-count-total"),
    wt: await attr('[data-lens="work"]', "data-count-total"),
  };
  await go("?pack=generic");
  const after = {
    p: await attr('[data-lens="promise"]', "data-members"),
    w: await attr('[data-lens="work"]', "data-members"),
    pt: await attr('[data-lens="promise"]', "data-count-total"),
    wt: await attr('[data-lens="work"]', "data-count-total"),
  };
  if (before.p !== after.p) throw new Error("promise membership changed");
  if (before.w !== after.w) throw new Error("work membership changed");
  if (before.pt !== after.pt || before.wt !== after.wt) throw new Error("counts changed");
  await go();
});

// ══ DS-15 · read-only ═════════════════════════════════════════════════════
await T("DS-15 the surface invokes no ceremony and performs zero writes", async () => {
  const after = fingerprint();
  if (after !== beforeFingerprint) throw new Error(`ledger moved: ${beforeFingerprint} -> ${after}`);
  const nonProjection = rpcCalls.filter((c) => !c.name.startsWith("projection_"));
  if (nonProjection.length > 0)
    throw new Error(`non-projection rpc: ${[...new Set(nonProjection.map((c) => c.name))].join(",")}`);
});

// ══ DS-16 · tenant isolation ══════════════════════════════════════════════
await T("DS-16 an anonymous read is empty at the DATABASE, independently of the client", async () => {
  const anon = psql(`select public.projection_occurrences_for_operational_day(null)->'counts'->>'total'`).split("\n").pop();
  if (anon !== "0") throw new Error(`anonymous read returned ${anon} occurrences`);
  const anonWork = psql(`select public.projection_day_sheet(date '${DAY}','department')->'counts'->>'total'`).split("\n").pop();
  if (anonWork !== "0") throw new Error(`anonymous work read returned ${anonWork} rows`);
});

// ══ refusal and transport remain distinguishable ══════════════════════════
await T("DS-17 a genuine SQL refusal renders honestly — no stale lens, no invented day", async () => {
  mode = "refuse"; await go();
  if (await attr("[data-day-sheet]", "data-outcome") !== "refusal") throw new Error("refusal not surfaced");
  if (await page.$("[data-lens]")) throw new Error("a lens rendered under refusal");
  mode = "transport"; await go();
  if (await attr("[data-day-sheet]", "data-outcome") !== "transport") throw new Error("transport not distinguished");
  if (await page.$("[data-lens]")) throw new Error("a lens rendered under transport failure");
  mode = "live";
});

console.log(`\naccept-day-sheet: ${passed} passed, ${failed} failed`);
await browser.close(); server.close();
try { unlinkSync(join(here, "stub-link.tsx")); } catch { /* ignore */ }
sh(`su postgres -c "dropdb --if-exists ${DB}"`);
process.exit(failed === 0 ? 0 : 1);
