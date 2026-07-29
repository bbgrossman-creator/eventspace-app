// v295 RELEASE ACCEPTANCE — the REAL Occurrence Preparation Console in Chromium,
// invoking the REAL release_promise against a REAL Postgres clone.
// Claims BR-1..BR-8.
// Run: node browser-tests/accept-release.mjs   (env supplied by certify-release.sh)
import esbuild from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync, existsSync, writeFileSync, unlinkSync, chmodSync, mkdtempSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { dirname, join, resolve } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
// Scratch NEVER lives in the checkout (the v294 lesson). But mkdtemp creates
// the directory 0700 owned by the invoking user, and psql runs as the POSTGRES
// OS user — which then cannot traverse it, however permissive the file inside
// is. The directory mode is therefore widened deliberately, once, here.
// Files written into it are 0644 individually.
const scratch = mkdtempSync(join(tmpdir(), "v295-"));
chmodSync(scratch, 0o755);
// Fail loudly and specifically if the transition is ever broken again, rather
// than surfacing as an opaque "psql: Permission denied" mid-suite.
try {
  const probe = join(scratch, "probe.sql");
  writeFileSync(probe, "select 1;"); chmodSync(probe, 0o644);
  execFileSync("su", ["postgres", "-c", `test -r ${probe}`], { stdio: "ignore" });
  unlinkSync(probe);
} catch {
  console.error(`FATAL: the postgres OS user cannot read scratch under ${scratch}.\n` +
    `       SQL scratch must be traversable by postgres and must NOT be moved\n` +
    `       back into the checkout. Check the mode of ${scratch} and of ${tmpdir()}.`);
  process.exit(2);
}
const DB = "ec_release295";

const psql = (sql, db = DB) => {
  const f = join(scratch, `q_${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(f, sql); chmodSync(f, 0o644);
  try {
    return execFileSync("su", ["postgres", "-c", `psql -d ${db} -tA -v ON_ERROR_STOP=1 -f ${f}`],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
  } finally { try { unlinkSync(f); } catch {} }
};
const sh = (c) => execFileSync("sh", ["-c", c], { encoding: "utf8" }).trim();

sh(`su postgres -c "dropdb --if-exists ${DB}" ; su postgres -c "createdb -T ec ${DB}"`);
const [TENANT, USER] = psql(
  `select tu.tenant_id||' '||tu.user_id from public.tenant_users tu
    where tu.active order by tu.tenant_id limit 1`).split(" ");
const ctx = `select set_config('app.user_id','${USER}',false), set_config('request.jwt.claim.sub','${USER}',false);`;

// Two occurrences: BA releasable and INCOMPLETE (BR-2), BB already released (BR-1).
psql(`${ctx}
create table if not exists public.v295_br(tag text primary key, occ uuid);
do $$
declare v_t uuid := '${TENANT}'; b uuid; o uuid; snap uuid; v_ver uuid; v_tag text;
begin
  -- The acceptance resolves BY BOOKING and the event is keyed on the
  -- OCCURRENCE, so both fixture occurrences sit on ONE already-accepted
  -- booking and nothing is written to the offer tables. Required by the real
  -- constraints: offer_snapshots.version_id is UNIQUE and FK-bound to
  -- proposal_versions; offer_acceptances.snapshot_id is UNIQUE.
  select a.booking_id into b
    from public.offer_acceptances a
    left join public.acceptance_rescissions r on r.acceptance_id = a.id
   where a.tenant_id = v_t and r.id is null
   order by a.created_at limit 1;

  if b is null then
    select pv.id into v_ver from public.proposal_versions pv
     where not exists (select 1 from public.offer_snapshots s where s.version_id = pv.id)
     limit 1;
    if v_ver is null then
      raise exception 'V295_BROWSER_FIXTURE_UNSATISFIABLE: no unrescinded acceptance and no unused proposal_versions row';
    end if;
    insert into public.bookings (tenant_id,contact_name,invoice_num,status)
      values (v_t,'BR-ACC','V295BRACC-'||substr(gen_random_uuid()::text,1,8),'active') returning id into b;
    insert into public.offer_snapshots
      (id,tenant_id,version_id,fingerprint,model,artifact_bytes,artifact_hash,artifact_meta,assets,published_at)
      values (gen_random_uuid(),v_t,v_ver,'br-'||substr(gen_random_uuid()::text,1,10),
              '{"components":[]}'::jsonb,'\\x00'::bytea,'br-h','{}'::jsonb,'[]'::jsonb,now())
      returning id into snap;
    insert into public.offer_acceptances
      (id,tenant_id,snapshot_id,fingerprint,booking_id,recorded_moment,created_at)
      values (gen_random_uuid(),v_t,snap,'bra-'||substr(gen_random_uuid()::text,1,10),b,now(),now());
  end if;

  -- BA releasable + incomplete (BR-2); BB pre-released (BR-1); BC for BR-6.
  foreach v_tag in array array['BA','BB','BC'] loop
    o := (public.open_occurrence(b,null,null)->>'occurrence_id')::uuid;
    insert into public.v295_br values (v_tag,o);
  end loop;
  perform public.release_promise((select x.occ from public.v295_br x where x.tag='BB'),'pre-sig','pre-clr',null);
end $$;`);
const BA = psql(`${ctx} select occ from public.v295_br where tag='BA'`).split("\n").pop();
const BB = psql(`${ctx} select occ from public.v295_br where tag='BB'`).split("\n").pop();

const fingerprint = () => psql(`${ctx}
  select (select count(*) from public.event)||'/'||(select count(*) from public.execution_evidence)`)
  .split("\n").pop();

const aliasPlugin = { name: "alias", setup(b) {
  b.onResolve({ filter: /supabase$/ }, (a) => (
    ["@/lib/supabase","./supabase","../supabase","../lib/supabase"].includes(a.path)
      ? { path: join(here, "live-supabase.ts") } : null));
  b.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(scratch, "stub-link.tsx") }));
  b.onResolve({ filter: /^@\// }, (a) => {
    const base = join(root, "src", a.path.slice(2));
    for (const ext of [".tsx",".ts",".jsx",".js","/index.tsx","/index.ts"])
      if (existsSync(base + ext)) return { path: base + ext };
    return { path: base };
  });
}};
writeFileSync(join(scratch, "stub-link.tsx"),
  `export default function Link(p:any){const{href,children,...r}=p;return <a href={href} {...r}>{children}</a>;}\n`);
writeFileSync(join(scratch, "rel.harness.tsx"), `
import { createRoot } from "react-dom/client";
import OccurrencePrep from "@/components/occurrence/OccurrencePrep";
const occ = new URLSearchParams(location.search).get("occ")!;
createRoot(document.getElementById("root")!).render(<OccurrencePrep occurrence={occ} />);
`);
const built = await esbuild.build({
  entryPoints: [join(scratch, "rel.harness.tsx")], bundle: true, write: false,
  // The harness entry and the next/link stub live in /tmp so that scratch never
  // enters the checkout. esbuild resolves bare imports by walking up from the
  // IMPORTING FILE's directory, so from /tmp it can never reach the repo's
  // node_modules: react-dom/client and the react/jsx-runtime injected by
  // jsx:"automatic" both fail. nodePaths is esbuild's own resolver option and
  // IS honoured (unlike NODE_PATH, which Node's ESM runtime ignores — a
  // different resolver entirely). The shared tree is only ever read.
  nodePaths: [join(root, "node_modules")],
  absWorkingDir: root,
  format: "iife", jsx: "automatic", loader: { ".ts":"ts", ".tsx":"tsx" },
  define: { "process.env.NODE_ENV": '"development"' },
  banner: { js: "window.process=window.process||{env:{}};" },
  plugins: [aliasPlugin], logLevel: "silent",
});
const js = built.outputFiles[0].text;
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/r.js"></script></body></html>`;

let rpcCalls = []; let forceRefuse = false;
const readBody = (req) => new Promise((ok) => { let s=""; req.on("data",c=>s+=c); req.on("end",()=>ok(s?JSON.parse(s):{})); });
const lit = (v) => (v==null ? "null" : `'${String(v).replace(/'/g,"''")}'`);
const server = createServer(async (req,res) => {
  const u = req.url.split("?")[0];
  if (req.method==="GET") {
    if (u==="/") { res.writeHead(200,{"content-type":"text/html"}); return res.end(html); }
    if (u==="/r.js") { res.writeHead(200,{"content-type":"text/javascript"}); return res.end(js); }
    res.writeHead(404); return res.end();
  }
  const body = await readBody(req);
  if (u==="/auth") { res.writeHead(200,{"content-type":"application/json"});
    return res.end(JSON.stringify({data:{data:{user:{id:USER,email:"r@e.test"}},error:null},error:null})); }
  if (u==="/from") { res.writeHead(200,{"content-type":"application/json"});
    return res.end(JSON.stringify({data:{tenant_id:TENANT,role:"admin",active:true,tenants:{name:"Fixture"}},error:null})); }
  if (u==="/rpc") {
    rpcCalls.push({ name: body.name, params: body.params || {} });
    try {
      const p = body.params || {};
      let sql;
      if (body.name==="projection_occurrence_brief")
        sql = `${ctx} select public.projection_occurrence_brief(${lit(p.p_occurrence)}::uuid)`;
      else if (body.name==="release_promise") {
        // BR-6 forces a predicate refusal by withholding the sign-off ref,
        // exercising the REAL certified refusal rather than a simulated one.
        const sig = forceRefuse ? "null" : lit(p.p_signoff_ref);
        sql = `${ctx} select public.release_promise(${lit(p.p_occurrence)}::uuid, ${sig}, ${lit(p.p_clearance_ref)}, ${lit(p.p_waiver_ref)})`;
      } else sql = `${ctx} select public.${body.name}()`;
      const out = psql(sql);
      res.writeHead(200,{"content-type":"application/json"});
      return res.end(JSON.stringify({data: JSON.parse(out.split("\n").pop()), error:null}));
    } catch(e) {
      res.writeHead(200,{"content-type":"application/json"});
      return res.end(JSON.stringify({data:null,error:{message:String(e.stderr||e.message||e).replace(/\s+/g," ")}}));
    }
  }
  res.writeHead(404); res.end();
});
await new Promise(ok => server.listen(4295, ok));

let browser = null;
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { if (browser) browser.close(); } catch {}
  try { server.close(); } catch {}
  try { sh(`su postgres -c "dropdb --if-exists ${DB}"`); } catch {}
  try { rmSync(scratch, { recursive: true, force: true }); } catch {}
};
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });

browser = await chromium.launch();
const page = await browser.newPage();
let passed=0, failed=0;
const T = async (n,fn) => { try { await fn(); passed++; console.log(`PASS ${n}`); }
  catch(e) { failed++; console.log(`FAIL ${n}\n     ${e.message.split("\n")[0]}`); } };
const attr = (s,a) => page.getAttribute(s,a);
const go = async (occ) => { rpcCalls=[]; await page.goto(`http://localhost:4295/?occ=${occ}`);
  await page.waitForSelector("[data-prep][data-outcome='ready']", { state:"attached", timeout:15000 }); };

const before = fingerprint();
try {
await go(BA);

await T("BR-1 the release affordance renders for an UNRELEASED occurrence and is absent once released", async () => {
  if (!(await page.$("[data-release]"))) throw new Error("absent on an unreleased occurrence");
  await go(BB);
  if (await page.$("[data-release]")) throw new Error("still present on a released occurrence");
  if (await attr("[data-prep]","data-has-event") !== "true") throw new Error("BB is not released");
  await go(BA);
});
await T("BR-2 it renders while facts are MISSING — completeness informs, never gates (v292a)", async () => {
  const missing = Number(await attr("[data-prep]","data-missing-count"));
  if (missing === 0) throw new Error("fixture is complete; the claim would be vacuous");
  if (!(await page.$("[data-release-action]"))) throw new Error("release withheld from an incomplete occurrence");
  const note = await page.textContent("[data-release-readiness]");
  if (!/still missing/.test(note ?? "")) throw new Error("missing facts not surfaced beside the action");
});
await T("BR-3 releasing invokes exactly one release_promise rpc and the client sends NO actor", async () => {
  await page.click("[data-release-action]");
  await page.fill('[data-input="signoff_ref"]', "br-signoff");
  await page.fill('[data-input="clearance_ref"]', "br-clearance");
  rpcCalls = [];
  await page.click("[data-release-submit]");
  await page.waitForSelector("[data-prep][data-has-event='true']", { timeout: 15000 });
  const rel = rpcCalls.filter(c => c.name === "release_promise");
  if (rel.length !== 1) throw new Error(`${rel.length} release calls`);
  for (const k of Object.keys(rel[0].params))
    if (/actor|tenant|role/i.test(k)) throw new Error(`client sent an authority field: ${k}`);
});
await T("BR-4 after success the surface RE-READS and the regime flips by derivation", async () => {
  if (await attr("[data-prep]","data-has-event") !== "true") throw new Error("has_event not re-read");
  const regime = await page.textContent("[data-regime]");
  if (!/Released/.test(regime ?? "")) throw new Error(`regime reads ${regime}`);
  const briefs = rpcCalls.filter(c => c.name === "projection_occurrence_brief");
  if (briefs.length < 1) throw new Error("no re-read followed the ceremony");
});
await T("BR-5 no optimistic state — the SQL truth changed before the surface claimed it", async () => {
  const live = psql(`${ctx} select (public.projection_occurrence_brief('${BA}'::uuid)->'data'->>'has_event')`).split("\n").pop();
  if (live !== "true") throw new Error("surface shows released but SQL does not");
});
await T("BR-6 a genuine predicate refusal renders verbatim and records no release", async () => {
  forceRefuse = true;
  // BC was seeded on the SAME accepted booking; no offer-table write here.
  const fresh = psql(`${ctx} select occ from public.v295_br where tag='BC'`).split("\n").pop();
  await go(fresh);
  await page.click("[data-release-action]");
  await page.fill('[data-input="clearance_ref"]', "clr-only");
  await page.click("[data-release-submit]");
  // Ceremony refusals render as data-ceremony-refusal. data-refusal-code
  // belongs to the whole-page PROJECTION refusal branch and can never appear
  // for a ceremony outcome.
  await page.waitForSelector("[data-ceremony-refusal]", { timeout: 15000 });
  const code = await attr("[data-ceremony-refusal]","data-ceremony-refusal");
  if (!/RELEASE_PREDICATE_UNSATISFIED/.test(code ?? "")) throw new Error(`code=${code}`);
  if (await attr("[data-prep]","data-has-event") !== "false") throw new Error("a refused release materialised an event");
  if (!(await page.$("[data-release]"))) throw new Error("affordance vanished after a refusal");
  forceRefuse = false;
});
await T("BR-7 the released occurrence is absent from the Preparation Queue", async () => {
  const n = psql(`${ctx} select count(*) from jsonb_array_elements(
    public.projection_preparation_queue()->'data'->'occurrences') r where r->>'occurrence'='${BA}'`).split("\n").pop();
  if (n !== "0") throw new Error(`released occurrence still a queue member (${n})`);
});
await T("BR-8 ledger deltas are exactly attributable: +1 event, +3 evidence per release", async () => {
  const [e0, v0] = before.split("/").map(Number);
  const [e1, v1] = fingerprint().split("/").map(Number);
  if (e1 - e0 !== 1) throw new Error(`event delta ${e1 - e0}, expected 1`);
  if (v1 - v0 !== 3) throw new Error(`evidence delta ${v1 - v0}, expected 3 (released, sign_off, clearance)`);
});

} finally {
  cleanup();
}

console.log(`\naccept-release: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
