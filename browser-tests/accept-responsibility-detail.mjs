// v291 RESPONSIBILITY DETAIL ACCEPTANCE — the REAL mounted production surface in
// Chromium, reading the REAL responsibility_detail() and risk_findings() from a
// REAL Postgres database. Claims RD-1…RD-18.
//
// Disposable database (createdb -T ec ec_rd291).
//
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-responsibility-detail.mjs
import esbuild from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync, existsSync, writeFileSync, unlinkSync, chmodSync } from "fs";
import { execFileSync } from "child_process";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const DB = "ec_rd291";

const psql = (sql, db = DB) => {
  const f = `/tmp/v291_${Math.random().toString(36).slice(2)}.sql`;
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
const [TENANT_B, USER_B] = psql(
  `select tu.tenant_id||' '||tu.user_id from public.tenant_users tu
    where tu.active and tu.tenant_id <> '${TENANT}' order by tu.tenant_id limit 1`
).split(" ");
const ctx = `select set_config('app.user_id','${USER}',false), set_config('request.jwt.claim.sub','${USER}',false);`;
const ctxB = `select set_config('app.user_id','${USER_B}',false), set_config('request.jwt.claim.sub','${USER_B}',false);`;

// Sentinel-prefixed scalar read. With psql -tA an empty result prints an empty
// line, so .pop() on trimmed output would return the preceding set_config row.
const scalar = (sql, prefix = "V:") => {
  const out = psql(`${ctx} select '${prefix}'||coalesce((${sql})::text,'')`).split("\n").pop();
  if (!out.startsWith(prefix)) throw new Error(`probe misread output: ${out}`);
  return out.slice(prefix.length);
};

// ── seed real truth ────────────────────────────────────────────────────────
psql(`${ctx}
do $$
declare v_t uuid := '${TENANT}'; v_e uuid; v_rich uuid; v_debt uuid; v_old uuid; v_new uuid; v_stand uuid;
begin
  insert into public.event (tenant_id, engagement_ref, origin_commitment_ref, released_by)
  values (v_t, gen_random_uuid(), gen_random_uuid(), 'v291') returning id into v_e;
  insert into public.execution_evidence (tenant_id, event_ref, kind, actor)
  values (v_t, v_e, 'released', 'v291');

  -- RICH: transferred twice, exception + completion evidence, a dependency
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    kind, department, required_outcome, natural_key, dependencies)
  values (v_t, v_e, 'event', gen_random_uuid(), 'release',
    'culinary_prepare', 'culinary', 'RICH sear the roast', 'v291_rich',
    '["v291_never_completed"]'::jsonb)
  returning id into v_rich;
  perform public.transfer_responsibility_ownership(v_rich, 'chana', null, 'v291');
  perform public.transfer_responsibility_ownership(v_rich, 'moshe', 'chana', 'v291');
  insert into public.execution_evidence (tenant_id, event_ref, obligation_ref, kind, actor, payload)
  values (v_t, v_e, v_rich, 'exception', 'v291', '{"reason":"supplier short"}'::jsonb);

  -- DEBT: assignment evidence recorded but the ownership ledger is EMPTY
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    kind, department, required_outcome, natural_key)
  values (v_t, v_e, 'event', gen_random_uuid(), 'release',
    'staffing_assign', 'staffing', 'DEBT staff the carving station', 'v291_debt')
  returning id into v_debt;
  insert into public.execution_evidence (tenant_id, event_ref, obligation_ref, kind, actor)
  values (v_t, v_e, v_debt, 'assignment', 'v291');

  -- SUPERSESSION pair
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    kind, department, required_outcome, natural_key)
  values (v_t, v_e, 'event', gen_random_uuid(), 'release',
    'equipment_pull', 'equipment', 'OLD pull the chafers', 'v291_old')
  returning id into v_old;
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    kind, department, required_outcome, natural_key, supersedes_ref)
  values (v_t, v_e, 'event', gen_random_uuid(), 'release',
    'equipment_pull', 'equipment', 'NEW pull the induction burners', 'v291_new', v_old)
  returning id into v_new;

  -- STANDING: no event at all (the risk-scope edge case)
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    origin_revision, kind, department, required_outcome, natural_key, timing)
  values (v_t, null, 'standing', gen_random_uuid(), 'knowledge', gen_random_uuid(),
    'venue_setup', 'venue', 'STANDING walk the room', 'v291_standing',
    jsonb_build_object('window_end',(now()+interval '2 hours')::text))
  returning id into v_stand;
end $$;`);

const ID = {};
for (const k of ["rich", "debt", "old", "new", "standing"]) {
  ID[k] = scalar(`select o.id from public.obligation o where o.natural_key = 'v291_${k}'`, `I${k}:`);
}

psql(`${ctxB}
do $$
declare v_t uuid := '${TENANT_B}'; v_e uuid;
begin
  insert into public.event (tenant_id, engagement_ref, origin_commitment_ref, released_by)
  values (v_t, gen_random_uuid(), gen_random_uuid(), 'v291b') returning id into v_e;
  insert into public.execution_evidence (tenant_id, event_ref, kind, actor)
  values (v_t, v_e, 'released', 'v291b');
  insert into public.obligation (tenant_id, event_ref, scope, origin_ref, origin_kind,
    kind, department, required_outcome, natural_key)
  values (v_t, v_e, 'event', gen_random_uuid(), 'release',
    'culinary_prepare', 'culinary', 'FOREIGN detail probe', 'v291b_foreign');
end $$;`);
const FOREIGN_ID = psql(`${ctxB}
  select 'FID:'||(select o.id from public.obligation o where o.natural_key='v291b_foreign')`)
  .split("\n").pop().slice(4);

const fingerprint = () => psql(`${ctx}
  select (select count(*) from public.execution_evidence)||'/'||
         (select count(*) from public.responsibility_owner)||'/'||
         (select count(*) from public.obligation)`).split("\n").pop();
const beforeFingerprint = fingerprint();

// ── build the REAL page ───────────────────────────────────────────────────
const aliasPlugin = { name: "alias", setup(b) {
  b.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(here, "shell-next-link.tsx") }));
  b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(here, "shell-next-navigation.ts") }));
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
  entryPoints: [join(here, "responsibility-detail.harness.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic", loader: { ".ts": "ts", ".tsx": "tsx" },
  define: { "process.env.NODE_ENV": '"development"' },
  banner: { js: "window.process=window.process||{env:{}};" },
  plugins: [aliasPlugin], logLevel: "silent",
});
const js = built.outputFiles[0].text;
const html = readFileSync(join(here, "responsibility-detail.html"));
const css = existsSync(join(here, "app.css")) ? readFileSync(join(here, "app.css")) : "";

// ── bridge ────────────────────────────────────────────────────────────────
let mode = "live";        // live | transport | signedout
let rpcCalls = [];
let rpcParams = [];

const readBody = (req) => new Promise((ok) => {
  let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => ok(s ? JSON.parse(s) : {}));
});

const server = createServer(async (req, res) => {
  const u = req.url.split("?")[0];
  if (req.method === "GET") {
    if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(html); }
    if (u === "/responsibility-detail.harness.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js); }
    if (u === "/app.css") { res.writeHead(200, { "content-type": "text/css" }); return res.end(css); }
    res.writeHead(404); return res.end();
  }
  const body = await readBody(req);
  const json = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };

  if (u === "/auth") {
    const user = mode === "signedout" ? null : { id: USER, email: "viewer@example.test" };
    return json({ data: { data: { user }, error: null }, error: null });
  }
  if (u === "/from") {
    const row = mode === "signedout" ? null
      : { tenant_id: TENANT, role: "admin", active: true, tenants: { name: "Fixture" } };
    return json({ data: row, error: null });
  }
  if (u === "/rpc") {
    rpcCalls.push(body.name);
    rpcParams.push({ name: body.name, params: body.params });
    if (mode === "transport") { res.writeHead(503); return res.end(); }
    try {
      const p = body.params || {};
      const sessionCtx = mode === "signedout" ? "" : ctx;
      let sql;
      if (body.name === "responsibility_detail") {
        sql = `${sessionCtx} select 'D:'||coalesce(public.responsibility_detail('${p.p_responsibility}'::uuid)::text,'null')`;
      } else if (body.name === "risk_findings") {
        sql = `${sessionCtx} select 'D:'||coalesce(jsonb_agg(to_jsonb(f))::text,'[]')
                 from public.risk_findings('${JSON.stringify(p.p_filter ?? {}).replace(/'/g, "''")}'::jsonb) f`;
      } else {
        // Any other projection reaching the wire is itself a finding.
        sql = `${sessionCtx} select 'D:'||'"UNEXPECTED_PROJECTION_${body.name}"'`;
      }
      const line = psql(sql).split("\n").pop();
      if (!line.startsWith("D:")) throw new Error(`probe misread output: ${line}`);
      return json({ data: JSON.parse(line.slice(2)), error: null });
    } catch (e) {
      const msg = String(e.stderr || e.message || e).replace(/\s+/g, " ").trim();
      return json({ data: null, error: { message: msg } });
    }
  }
  res.writeHead(404); res.end();
});
await new Promise((ok) => server.listen(4301, ok));

const browser = await chromium.launch();
const page = await browser.newPage();
let passed = 0, failed = 0;
const T = async (n, fn) => { try { await fn(); passed++; console.log(`PASS ${n}`); }
  catch (e) { failed++; console.log(`FAIL ${n}\n     ${String(e.message).split("\n")[0]}`); } };
const attr = (s, a) => page.getAttribute(s, a);
const go = async (id) => {
  rpcCalls = []; rpcParams = [];
  await page.goto(`http://localhost:4301/?id=${encodeURIComponent(id)}`);
  await page.waitForSelector("[data-detail][data-outcome]:not([data-outcome='loading'])", { state: "attached", timeout: 15000 });
};

// ══ RD-1 · live end-to-end ════════════════════════════════════════════════
await go(ID.rich);
await T("RD-1 the mounted detail surface renders from the REAL responsibility_detail against live SQL", async () => {
  if (await attr("[data-detail]", "data-outcome") !== "ready") throw new Error("not ready");
  if (await attr("[data-detail]", "data-responsibility") !== ID.rich) throw new Error("wrong responsibility");
  const state = await attr("[data-detail]", "data-state");
  const live = scalar(`select public.responsibility_state('${ID.rich}'::uuid)`, "S:");
  if (state !== live) throw new Error(`rendered ${state}, SQL says ${live}`);
});

// ══ RD-2/3 · ONE detail request, and ownership_history is never called ════
await T("RD-2 ONE responsibility_detail request supplies anchors, ownership, evidence, dependencies and supersession", async () => {
  const detailCalls = rpcCalls.filter((n) => n === "responsibility_detail");
  if (detailCalls.length !== 1) throw new Error(`${detailCalls.length} detail requests`);
  for (const sec of ["anchors", "ownership", "evidence", "dependencies", "supersession"]) {
    if (!(await page.$(`[data-section="${sec}"]`))) throw new Error(`section ${sec} not rendered`);
  }
});

await T("RD-3 ownership_history() is never called — the ledger arrives inside the detail envelope", async () => {
  if (rpcCalls.includes("ownership_history")) throw new Error("a redundant ownership_history request was issued");
  const unexpected = rpcCalls.filter((n) => !["responsibility_detail", "risk_findings"].includes(n));
  if (unexpected.length > 0) throw new Error(`unexpected projection calls: ${[...new Set(unexpected)].join(",")}`);
});

// ══ RD-4 · anchors ════════════════════════════════════════════════════════
await T("RD-4 the anchors shown are the obligation's real origin — why this responsibility exists", async () => {
  const kind = await page.textContent('[data-field="origin-kind"]');
  const ref = await page.textContent('[data-field="origin-ref"]');
  const liveKind = scalar(`select o.origin_kind from public.obligation o where o.id='${ID.rich}'::uuid`, "K:");
  const liveRef = scalar(`select o.origin_ref from public.obligation o where o.id='${ID.rich}'::uuid`, "R:");
  if (kind.trim() !== liveKind) throw new Error(`origin_kind ${kind.trim()} vs ${liveKind}`);
  if (ref.trim() !== liveRef) throw new Error(`origin_ref ${ref.trim()} vs ${liveRef}`);
});

// ══ RD-5/6 · ownership timeline ═══════════════════════════════════════════
await T("RD-5 the ownership timeline equals the ownership ledger in seq order", async () => {
  const shown = await page.$$eval("[data-ownership-entry]", (els) => els.map((e) => [
    e.getAttribute("data-ownership-action"),
    e.getAttribute("data-ownership-prior") || "",
    e.getAttribute("data-ownership-owner") || "",
  ].join("|")));
  const live = scalar(
    `select string_agg(ro.action||'|'||coalesce(ro.prior_owner,'')||'|'||coalesce(ro.owner,''), ';' order by ro.seq)
       from public.responsibility_owner ro where ro.responsibility_ref='${ID.rich}'::uuid`, "O:");
  if (shown.length === 0) throw new Error("no ownership entries rendered");
  if (shown.join(";") !== live) throw new Error(`shown [${shown.join(";")}] vs SQL [${live}]`);
});

await T("RD-6 that timeline is byte-identical to ownership_history() — proving a second call would be redundant", async () => {
  const fromDetail = scalar(
    `select string_agg(e->>'action'||'|'||coalesce(e->>'prior_owner','')||'|'||coalesce(e->>'owner',''), ';')
       from jsonb_array_elements(public.responsibility_detail('${ID.rich}'::uuid)->'ownership') e`, "A:");
  const fromHistory = scalar(
    `select string_agg(h.action||'|'||coalesce(h.prior_owner,'')||'|'||coalesce(h.owner,''), ';' order by h.seq)
       from public.ownership_history('${ID.rich}'::uuid) h`, "B:");
  if (fromDetail !== fromHistory) throw new Error(`detail [${fromDetail}] vs ownership_history [${fromHistory}]`);
  const shown = await page.$$eval("[data-ownership-entry]", (e) => e.length);
  const n = Number(scalar(`select count(*) from public.ownership_history('${ID.rich}'::uuid)`, "N:"));
  if (shown !== n) throw new Error(`${shown} rendered vs ${n} in ownership_history`);
});

// ══ RD-7 · evidence ═══════════════════════════════════════════════════════
await T("RD-7 the evidence list equals the recorded execution_evidence in moment order", async () => {
  const shown = await page.$$eval("[data-evidence-entry]", (els) =>
    els.map((e) => e.getAttribute("data-evidence-kind")));
  const live = scalar(
    `select string_agg(e.kind, ',' order by e.moment)
       from public.execution_evidence e where e.obligation_ref='${ID.rich}'::uuid`, "E:");
  if (shown.length === 0) throw new Error("no evidence rendered");
  if (shown.join(",") !== live) throw new Error(`shown [${shown.join(",")}] vs SQL [${live}]`);
});

// ══ RD-8 · dependencies ═══════════════════════════════════════════════════
await T("RD-8 declared dependencies are rendered from the envelope", async () => {
  const shown = await page.$$eval("[data-dependency]", (e) => e.length);
  const n = Number(scalar(
    `select jsonb_array_length(coalesce(o.dependencies,'[]'::jsonb))
       from public.obligation o where o.id='${ID.rich}'::uuid`, "D:"));
  if (n === 0) throw new Error("fixture declared no dependency");
  if (shown !== n) throw new Error(`${shown} rendered vs ${n} declared`);
});

// ══ RD-9 · risk stays separate from state ═════════════════════════════════
await T("RD-9 state and risk remain separate elements with separate vocabularies", async () => {
  const stateText = (await page.textContent("[data-state-label]")).trim();
  const STATE_WORDS = ["Unassigned", "Waiting", "Active", "Done", "Lapsed", "Replaced", "Void"];
  if (!STATE_WORDS.includes(stateText)) throw new Error(`state badge reads "${stateText}"`);
  if (await page.$("[data-state-label] [data-risk-badge]")) throw new Error("finding nested in state badge");
  if (await page.$("[data-risk-badge] [data-state-label]")) throw new Error("state nested in risk badge");
  const findings = await page.$$eval("[data-finding]", (e) => e.map((x) => x.getAttribute("data-finding")));
  for (const f of findings) if (STATE_WORDS.includes(f)) throw new Error(`finding "${f}" is a state word`);
});

await T("RD-10 findings shown equal risk_findings() for this responsibility", async () => {
  const shown = await page.$$eval("[data-finding]", (e) =>
    e.map((x) => x.getAttribute("data-finding")).sort().join(","));
  const eventRef = await attr("[data-detail]", "data-event-ref");
  const live = scalar(
    `select string_agg(f.finding, ',' order by f.finding)
       from public.risk_findings('{"event":"${eventRef}"}'::jsonb) f
      where f.responsibility='${ID.rich}'::uuid`, "F:");
  if (shown !== (live || "")) throw new Error(`shown [${shown}] vs SQL [${live}]`);
});

// ══ RD-11 · ownership debt, and the v295 ruling honoured ══════════════════
await T("RD-11a an ownerless responsibility renders ownership debt, not a fabricated owner", async () => {
  await go(ID.debt);
  if (await attr("[data-detail]", "data-owner") !== "") throw new Error("an owner was invented");
  const owner = await attr("[data-current-owner]", "data-current-owner");
  if (owner !== "") throw new Error(`current owner rendered as ${owner}`);
  const text = await page.textContent('[data-section="ownership"]');
  if (!/ownership debt/i.test(text)) throw new Error("debt not stated");
  if (!(await page.$("[data-ownership-empty]"))) throw new Error("empty ledger not stated");
});

await T("RD-11b the detail surface may state that assignment evidence exists — because THIS envelope carries it", async () => {
  const facts = Number(await attr("[data-detail]", "data-assignment-facts"));
  const live = Number(scalar(
    `select count(*) from public.execution_evidence e
      where e.obligation_ref='${ID.debt}'::uuid and e.kind='assignment'`, "C:"));
  if (live === 0) throw new Error("fixture recorded no assignment evidence");
  if (facts !== live) throw new Error(`${facts} shown vs ${live} recorded`);
  const note = await page.$("[data-assignment-without-ownership]");
  if (!note) throw new Error("assignment-without-ownership not surfaced");
  const text = await page.textContent("[data-assignment-without-ownership]");
  if (!/does not establish constitutional ownership/i.test(text))
    throw new Error("the surface implied assignment establishes ownership");
});

// ══ RD-12 · supersession ══════════════════════════════════════════════════
await T("RD-12 supersession is rendered in both directions from the envelope", async () => {
  await go(ID.new);
  if (await attr("[data-detail]", "data-supersedes") !== ID.old) throw new Error("supersedes not shown");
  if (!(await page.$(`[data-supersedes-link="${ID.old}"]`))) throw new Error("no link to the replaced responsibility");
  await go(ID.old);
  if (await attr("[data-detail]", "data-superseded-by") !== ID.new) throw new Error("superseded_by not shown");
  if (!(await page.$(`[data-superseded-by-link="${ID.new}"]`))) throw new Error("no link to the replacement");
});

// ══ RD-13 · risk scoping, including the standing edge case ═══════════════
await T("RD-13a an event-scoped responsibility has its risk read by event", async () => {
  await go(ID.rich);
  const eventRef = await attr("[data-detail]", "data-event-ref");
  if (!eventRef) throw new Error("no event_ref");
  const scope = await attr("[data-detail]", "data-risk-scope");
  if (scope !== `{"event":"${eventRef}"}`) throw new Error(`risk scope was ${scope}`);
  const sent = rpcParams.find((r) => r.name === "risk_findings");
  if (!sent) throw new Error("risk was never read");
  if (sent.params.p_filter?.event !== eventRef) throw new Error(`wire filter was ${JSON.stringify(sent.params.p_filter)}`);
});

await T("RD-13b a STANDING responsibility reads {scope:'standing'} and says so on screen", async () => {
  await go(ID.standing);
  if (await attr("[data-detail]", "data-event-ref") !== "") throw new Error("standing row has an event_ref");
  const scope = await attr("[data-detail]", "data-risk-scope");
  if (scope !== '{"scope":"standing"}') throw new Error(`risk scope was ${scope}`);
  const sent = rpcParams.find((r) => r.name === "risk_findings");
  if (sent.params.p_filter?.scope !== "standing") throw new Error(`wire filter was ${JSON.stringify(sent.params.p_filter)}`);
  const note = await page.textContent("[data-risk-scope-note]");
  if (!/broader than the row/i.test(note)) throw new Error("the broader read is not disclosed on screen");
});

// ══ RD-14 · not found is not empty ═══════════════════════════════════════
await T("RD-14 an unknown responsibility renders not-found, never an empty detail", async () => {
  await go("00000000-0000-0000-0000-000000000000");
  if (await attr("[data-detail]", "data-outcome") !== "notfound") throw new Error("did not render not-found");
  if (await page.$('[data-section="ownership"]')) throw new Error("sections rendered for a missing responsibility");
  if (!(await page.$("[data-notfound-message]"))) throw new Error("no not-found message");
});

// ══ RD-15 · tenant isolation ═════════════════════════════════════════════
await T("RD-15 a foreign tenant's responsibility is not found — never rendered", async () => {
  await go(FOREIGN_ID);
  if (await attr("[data-detail]", "data-outcome") !== "notfound") throw new Error("foreign responsibility rendered");
  const body = await page.textContent("[data-detail]");
  if (body.includes("FOREIGN detail probe")) throw new Error("foreign outcome text leaked");
});

// ══ RD-16 · untrusted ════════════════════════════════════════════════════
await T("RD-16 with no trusted tenant the surface refuses and issues no projection request", async () => {
  mode = "signedout";
  await go(ID.rich);
  if (await attr("[data-detail]", "data-outcome") !== "refusal") throw new Error("untrusted read did not refuse");
  if (await attr("[data-detail]", "data-refusal-code") !== "TENANT_UNRESOLVED") throw new Error("wrong refusal code");
  if (rpcCalls.filter((n) => n !== "").length !== 0) throw new Error(`issued ${rpcCalls.length} request(s)`);
  mode = "live";
});

await T("RD-17 a transport failure is distinguished from a refusal and from not-found", async () => {
  mode = "transport";
  await go(ID.rich);
  if (await attr("[data-detail]", "data-outcome") !== "transport") throw new Error("transport not surfaced");
  if (await page.$('[data-section="ownership"]')) throw new Error("stale sections rendered");
  mode = "live";
});

// ══ RD-18 · purity ═══════════════════════════════════════════════════════
await T("RD-18 the entire detail sweep performed zero writes — ledger fingerprint unchanged", async () => {
  await go(ID.rich);
  const after = fingerprint();
  if (after !== beforeFingerprint) throw new Error(`${beforeFingerprint} -> ${after}`);
  const detailCalls = rpcCalls.filter((n) => n === "responsibility_detail").length;
  const riskCalls = rpcCalls.filter((n) => n === "risk_findings").length;
  if (detailCalls !== 1 || riskCalls !== 1) throw new Error(`${detailCalls} detail + ${riskCalls} risk requests per render`);
});

console.log(`\naccept-responsibility-detail: ${passed} passed, ${failed} failed`);
await browser.close(); server.close();
sh(`su postgres -c "dropdb --if-exists ${DB}"`);
process.exit(failed === 0 ? 0 : 1);
