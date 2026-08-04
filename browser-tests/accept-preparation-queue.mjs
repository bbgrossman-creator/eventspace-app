// v294 PREPARATION QUEUE ACCEPTANCE — the REAL mounted surface in Chromium,
// reading the REAL projection_preparation_queue from a REAL Postgres clone.
// Gates: BQ-1..BQ-8 + PQ-14 (the frozen client version-guard claim).
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-preparation-queue.mjs
import esbuild from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "http";
import { existsSync, writeFileSync, unlinkSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { makeFixtureDb } from "./lib/pg.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const DB = "ec_prep294";
// v301 · one shared transport. This suite's implementation was the original;
// it now lives in browser-tests/lib/pg.mjs, unchanged in behaviour, so no
// second copy can drift from it.
const { psql } = makeFixtureDb(DB);
const [TENANT, USER] = psql(
  `select tu.tenant_id||' '||tu.user_id from public.tenant_users tu
    where tu.active order by tu.tenant_id limit 1`).split(" ");
const ctx = `select set_config('app.user_id','${USER}',false), set_config('request.jwt.claim.sub','${USER}',false);`;

// Seed: one undated, one dated-future, one released — through the ceremonies.
psql(`${ctx}
do $$ declare b uuid; o uuid; v_t uuid := '${TENANT}';
begin
  insert into public.bookings (tenant_id,contact_name,invoice_num,status)
    values (v_t,'BrowserQ','BQ-'||substr(gen_random_uuid()::text,1,8),'active') returning id into b;
  o := (public.open_occurrence(b,null,null)->>'occurrence_id')::uuid;
  perform public.set_occurrence_profile(p_occurrence=>o, p_display_name=>'Undated Intake', p_occasion_kind=>null, p_reason=>null);
  o := (public.open_occurrence(b,null,null)->>'occurrence_id')::uuid;
  perform public.set_schedule_milestone(p_occurrence=>o,p_milestone_key=>'operating_date',
    p_at_date=>current_date+21,p_at_moment=>null,p_window_end=>null,p_label=>null,p_reason=>null);
  o := (public.open_occurrence(b,null,null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id,engagement_ref,occurrence_ref,origin_commitment_ref,released_by)
    values (v_t,b,o,gen_random_uuid(),'bq294');
end $$;`);

const fingerprint = () => psql(`${ctx}
  select (select count(*) from public.execution_evidence)||'/'||
         (select count(*) from public.responsibility_owner)||'/'||
         (select count(*) from public.engagement_occurrence)`).split("\n").pop();
const beforeFingerprint = fingerprint();

const aliasPlugin = { name: "alias", setup(b) {
  b.onResolve({ filter: /supabase$/ }, (a) => (
    ["@/lib/supabase", "./supabase", "../supabase", "../lib/supabase"].includes(a.path)
      ? { path: join(here, "live-supabase.ts") } : null));
  b.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(here, "stub-link.tsx") }));
  b.onResolve({ filter: /^@\// }, (a) => {
    const base = join(root, "src", a.path.slice(2));
    for (const ext of [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"])
      if (existsSync(base + ext)) return { path: base + ext };
    return { path: base };
  });
}};
writeFileSync(join(here, "stub-link.tsx"),
  `export default function Link(p:any){const{href,children,...r}=p;return <a href={href} {...r}>{children}</a>;}\n`);
writeFileSync(join(here, "prep-queue.harness.tsx"), `
import { createRoot } from "react-dom/client";
import PreparationQueue from "@/components/preparation/PreparationQueue";
createRoot(document.getElementById("root")!).render(<PreparationQueue />);
`);
const built = await esbuild.build({
  entryPoints: [join(here, "prep-queue.harness.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic", loader: { ".ts": "ts", ".tsx": "tsx" },
  define: { "process.env.NODE_ENV": '"development"' },
  banner: { js: "window.process=window.process||{env:{}};" },
  plugins: [aliasPlugin], logLevel: "silent",
});
const js = built.outputFiles[0].text;
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/q.js"></script></body></html>`;

let mode = "live"; let rpcCalls = [];
const readBody = (req) => new Promise((ok) => { let s=""; req.on("data",(c)=>s+=c); req.on("end",()=>ok(s?JSON.parse(s):{})); });
const lit = (v) => (v==null ? "null" : `'${String(v).replace(/'/g,"''")}'`);
const server = createServer(async (req,res) => {
  const u = req.url.split("?")[0];
  if (req.method==="GET") {
    if (u==="/") { res.writeHead(200,{"content-type":"text/html"}); return res.end(html); }
    if (u==="/q.js") { res.writeHead(200,{"content-type":"text/javascript"}); return res.end(js); }
    res.writeHead(404); return res.end();
  }
  const body = await readBody(req);
  if (u==="/auth") { res.writeHead(200,{"content-type":"application/json"});
    return res.end(JSON.stringify({data:{data:{user:{id:USER,email:"q@e.test"}},error:null},error:null})); }
  if (u==="/from") { res.writeHead(200,{"content-type":"application/json"});
    return res.end(JSON.stringify({data:{tenant_id:TENANT,role:"admin",active:true,tenants:{name:"Fixture"}},error:null})); }
  if (u==="/rpc") {
    rpcCalls.push({ name: body.name, params: body.params||{} });
    let payload;
    try {
      const p = body.params||{};
      let sql;
      if (body.name==="projection_preparation_queue")
        sql = `${ctx} select public.projection_preparation_queue(${p.p_now?`${lit(p.p_now)}::timestamptz`:""})`;
      else sql = `${ctx} select public.${body.name}()`;
      const out = psql(sql);
      try {
        if (/^ERROR:/m.test(out)) throw new Error(out.replace(/\s+/g, " ").trim());
        const json = JSON.parse(out.split("\n").pop());
        if (mode==="badversion") json.version = 2;
        payload = JSON.stringify({data:json,error:null});
      } catch(e) {
        payload = JSON.stringify({data:null,error:{message:String(e.stderr||e.message||e).replace(/\s+/g," ")}});
      }
    } catch(e) {
      payload = JSON.stringify({data:null,error:{message:String(e.stderr||e.message||e).replace(/\s+/g," ")}});
    }
    res.writeHead(200,{"content-type":"application/json"});
    return res.end(payload);
  }
  res.writeHead(404); res.end();
});
await new Promise((ok)=>server.listen(4294,ok));

const browser = await chromium.launch();
const page = await browser.newPage();
let passed=0, failed=0;
const T = async (n,fn)=>{ try{ await fn(); passed++; console.log(`PASS ${n}`);}
  catch(e){ failed++; console.log(`FAIL ${n}\n     ${e.message.split("\n")[0]}`);} };
const attr = (s,a)=>page.getAttribute(s,a);
const go = async ()=>{ rpcCalls=[]; await page.goto("http://localhost:4294/");
  await page.waitForSelector("[data-preparation-queue][data-outcome]:not([data-outcome='loading'])",
    { state:"attached", timeout:15000 }); };
const live = () => JSON.parse(psql(`${ctx} select public.projection_preparation_queue()`).split("\n").pop());

await go();

await T("BQ-1 exactly ONE projection read per render — one lens, one read", async ()=>{
  const calls = rpcCalls.filter((c)=>c.name.startsWith("projection_"));
  if (calls.length!==1 || calls[0].name!=="projection_preparation_queue")
    throw new Error(`reads: ${calls.map((c)=>c.name).join(",")||"(none)"}`);
  if ("p_now" in calls[0].params) throw new Error("client sent a clock");
});
await T("BQ-2 envelope is preparation_queue v1 with basis=unreleased", async ()=>{
  if (await attr("[data-preparation-queue]","data-projection")!=="preparation_queue") throw new Error("name");
  if (await attr("[data-preparation-queue]","data-version")!=="1") throw new Error("version");
  if (await attr("[data-preparation-queue]","data-basis")!=="unreleased") throw new Error("basis");
});
await T("PQ-14 version enforcement is LIVE — a v2 envelope refuses rather than rendering", async ()=>{
  mode="badversion"; await go();
  if (await attr("[data-preparation-queue]","data-outcome")!=="refusal") throw new Error("v2 rendered");
  if (await attr("[data-preparation-queue]","data-refusal-code")!=="PROJECTION_VERSION_UNSUPPORTED")
    throw new Error(`code=${await attr("[data-preparation-queue]","data-refusal-code")}`);
  if (await page.$("[data-queue-row]")) throw new Error("rows rendered under refusal");
  mode="live"; await go();
});
await T("BQ-3 every row value equals the projection's, unmodified", async ()=>{
  const env = live();
  for (const r of env.data.occurrences) {
    const sel = `[data-queue-row="${r.occurrence}"]`;
    if (!(await page.$(sel))) throw new Error(`row ${r.occurrence} not rendered`);
    if (await attr(sel,"data-operating-date")!==(r.operating_date??"")) throw new Error("date drift");
    if (await attr(sel,"data-missing-count")!==String(r.missing_count)) throw new Error("missing drift");
    if (await attr(sel,"data-has-event")!=="false") throw new Error("a released row leaked in");
  }
});
await T("BQ-4 counts are the envelope's, non-vacuous, and total>0/undated>0", async ()=>{
  const c = live().counts;
  if (Number(c.total)===0 || Number(c.undated)===0) throw new Error("fixture vacuous");
  for (const k of ["total","incomplete","undated"])
    if (await attr("[data-preparation-queue]",`data-count-${k}`)!==String(c[k]))
      throw new Error(`${k} drift`);
});
await T("BQ-5 render order equals projection order — the client re-sorts nothing", async ()=>{
  const expected = live().data.occurrences.map((r)=>r.occurrence).join(",");
  const rendered = (await page.$$eval("[data-queue-row]",(e)=>e.map((x)=>x.getAttribute("data-queue-row")))).join(",");
  if (rendered!==expected) throw new Error("order drift");
  if (await attr("[data-preparation-queue]","data-members")!==expected) throw new Error("membership attr drift");
});
await T("BQ-6 a row navigates to the existing Preparation Console", async ()=>{
  const id = live().data.occurrences[0].occurrence;
  if (await attr(`[data-prepare-link="${id}"]`,"href")!==`/operations/occurrences/${id}/prepare`)
    throw new Error("href drift");
});
await T("BQ-7 tenant isolation holds at the DATABASE", async ()=>{
  const anon = psql(`select public.projection_preparation_queue()->'counts'->>'total'`).split("\n").pop();
  if (anon!=="0") throw new Error(`anonymous read total=${anon}`);
});
await T("BQ-8 the surface is read-only: no ceremony, zero writes", async ()=>{
  const after = fingerprint();
  if (after!==beforeFingerprint) throw new Error(`ledger moved ${beforeFingerprint} -> ${after}`);
  const non = rpcCalls.filter((c)=>!c.name.startsWith("projection_"));
  if (non.length) throw new Error(`non-projection rpc: ${non.map((c)=>c.name).join(",")}`);
});

console.log(`\naccept-preparation-queue: ${passed} passed, ${failed} failed`);
await browser.close(); server.close();
try { unlinkSync(join(here,"stub-link.tsx")); unlinkSync(join(here,"prep-queue.harness.tsx")); } catch { /* ignore */ }
process.exit(failed===0?0:1);   // the fixture database is dropped by the registered cleanup
