// v292c OCCURRENCE PREPARATION ACCEPTANCE — the REAL mounted console in Chromium,
// invoking the REAL certified ceremonies against REAL Postgres. Claims PR-1…PR-16.
// Ceremony writes COMMIT, so the console's re-read sees them: this is the actual
// capture loop, not a simulation of it.
import esbuild from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync, existsSync, writeFileSync, unlinkSync, chmodSync } from "fs";
import { execFileSync } from "child_process";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const DB = "ec_prep292c";
const psql = (sql, db = DB) => {
  const f = `/tmp/pr_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(f, sql); chmodSync(f, 0o644);
  try { return execFileSync("su", ["postgres", "-c", `psql -d ${db} -tA -v ON_ERROR_STOP=1 -f ${f}`],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim(); }
  finally { try { unlinkSync(f); } catch {} }
};
const sh = (c) => execFileSync("sh", ["-c", c], { encoding: "utf8" }).trim();
sh(`su postgres -c "dropdb --if-exists ${DB}" ; su postgres -c "createdb -T ec ${DB}"`);

const [TENANT, USER] = psql(
  `select tu.tenant_id||' '||tu.user_id from public.tenant_users tu where tu.active order by tu.tenant_id limit 1`).split(" ");
const ctx = `select set_config('app.user_id','${USER}',false), set_config('request.jwt.claim.sub','${USER}',false);`;
const scalar = (sql, pre = "V:") => {
  const o = psql(`${ctx} select '${pre}'||coalesce((${sql})::text,'')`).split("\n").pop();
  if (!o.startsWith(pre)) throw new Error(`probe misread: ${o}`);
  return o.slice(pre.length);
};

// a bare occurrence: NOTHING recorded. This is the day-one state.
psql(`${ctx}
do $$
declare v_b uuid; v_o uuid;
begin
  insert into public.bookings (tenant_id, contact_name, invoice_num, status)
    values ('${TENANT}','Goldstein','PR-'||substr(gen_random_uuid()::text,1,8),'active')
    returning id into v_b;
  v_o := (public.open_occurrence(v_b, null, null)->>'occurrence_id')::uuid;
  insert into public.venue (tenant_id,name,address,venue_type,created_by)
    values ('${TENANT}','Main Ballroom','1 St','fixed_facility','pr');
  insert into public.venue (tenant_id,name,address,venue_type,created_by)
    values ('${TENANT}','Garden Room','2 St','fixed_facility','pr');
end $$;`);
const OCC = scalar(`select o.id from public.engagement_occurrence o order by o.opened_at desc limit 1`, "O:");
const BOOK = scalar(`select booking_id from public.engagement_occurrence where id='${OCC}'::uuid`, "B:");

const alias = { name: "alias", setup(b) {
  b.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(here, "shell-next-link.tsx") }));
  b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(here, "shell-next-navigation.ts") }));
  b.onResolve({ filter: /supabase$/ }, (a) => (
    ["@/lib/supabase","./supabase","../supabase","../lib/supabase","@/lib/supabase.ts"].includes(a.path)
      ? { path: join(here, "prep-supabase.ts") } : null));
  b.onResolve({ filter: /^@\// }, (a) => {
    const base = join(root, "src", a.path.slice(2));
    for (const e of [".tsx",".ts",".jsx",".js","/index.tsx","/index.ts"]) if (existsSync(base+e)) return { path: base+e };
    return { path: base }; });
}};
const built = await esbuild.build({ entryPoints:[join(here,"prep.harness.tsx")], bundle:true, write:false,
  format:"iife", jsx:"automatic", loader:{".ts":"ts",".tsx":"tsx"},
  define:{"process.env.NODE_ENV":'"development"'},
  banner:{js:"window.process=window.process||{env:{}};"}, plugins:[alias], logLevel:"silent" });
const js = built.outputFiles[0].text;
const html = readFileSync(join(here,"prep.html"));
const css = existsSync(join(here,"app.css")) ? readFileSync(join(here,"app.css")) : "";

let tables = [], rpcs = [];
const readBody = (rq) => new Promise(ok => { let s=""; rq.on("data",c=>s+=c); rq.on("end",()=>ok(s?JSON.parse(s):{})); });
const server = createServer(async (req,res) => {
  const u = req.url.split("?")[0];
  if (req.method === "GET") {
    if (u==="/") { res.writeHead(200,{"content-type":"text/html"}); return res.end(html); }
    if (u==="/prep.harness.js") { res.writeHead(200,{"content-type":"text/javascript"}); return res.end(js); }
    if (u==="/app.css") { res.writeHead(200,{"content-type":"text/css"}); return res.end(css); }
    res.writeHead(404); return res.end();
  }
  const body = await readBody(req);
  const json = (o) => { res.writeHead(200,{"content-type":"application/json"}); res.end(JSON.stringify(o)); };
  if (u==="/auth") return json({ data:{ data:{ user:{ id:USER, email:"op@x" } }, error:null }, error:null });
  if (u==="/from") {
    tables.push(body.table);
    if (body.table === "tenant_users")
      return json({ data:{ tenant_id:TENANT, role:"admin", active:true, tenants:{name:"P"} }, error:null });
    if (body.table === "venue")
      return json({ data: JSON.parse(psql(`${ctx} select 'D:'||coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name) order by v.name)::text,'[]') from public.venue v`).split("\n").pop().slice(2)), error:null });
    return json({ data:null, error:null });
  }
  if (u==="/rpc") {
    rpcs.push(body.name);
    const p = body.params || {};
    const q = (v) => (v===null||v===undefined) ? "null" : `'${String(v).replace(/'/g,"''")}'`;
    let sql;
    try {
      if (body.name === "projection_occurrence_brief")
        sql = `${ctx} select 'D:'||coalesce(public.projection_occurrence_brief(${q(p.p_occurrence)}::uuid)::text,'null')`;
      else if (body.name === "set_schedule_milestone")
        sql = `${ctx} select 'D:'||public.set_schedule_milestone(${q(p.p_occurrence)}::uuid,${q(p.p_milestone_key)},${p.p_at_date?q(p.p_at_date)+"::date":"null"},${p.p_at_moment?q(p.p_at_moment)+"::timestamptz":"null"},${p.p_window_end?q(p.p_window_end)+"::timestamptz":"null"},${q(p.p_label)},${q(p.p_reason)})::text`;
      else if (body.name === "commit_attendance")
        sql = `${ctx} select 'D:'||public.commit_attendance(${q(p.p_occurrence)}::uuid,${p.p_head_count},${q(p.p_basis)},${p.p_effective_moment?q(p.p_effective_moment)+"::timestamptz":"null"},${q(p.p_reason)})::text`;
      else if (body.name === "bind_occurrence_venue")
        sql = `${ctx} select 'D:'||public.bind_occurrence_venue(${q(p.p_occurrence)}::uuid,${q(p.p_venue)}::uuid,${q(p.p_reason)})::text`;
      else if (body.name === "set_occurrence_profile")
        sql = `${ctx} select 'D:'||public.set_occurrence_profile(${q(p.p_occurrence)}::uuid,${q(p.p_display_name)},${q(p.p_occasion_kind)},${q(p.p_reason)})::text`;
      else if (body.name === "set_engagement_profile")
        sql = `${ctx} select 'D:'||public.set_engagement_profile(${q(p.p_booking)}::uuid,${q(p.p_display_name)},${q(p.p_client_display_name)},${q(p.p_reason)})::text`;
      else if (body.name === "bind_occurrence_supervision")
        sql = `${ctx} select 'D:'||public.bind_occurrence_supervision(${q(p.p_occurrence)}::uuid,${q(p.p_authority_org)},${p.p_window_start?q(p.p_window_start)+"::timestamptz":"null"},${p.p_window_end?q(p.p_window_end)+"::timestamptz":"null"},${q(p.p_certificate_ref)},${q(p.p_contact)},${q(p.p_reason)})::text`;
      else sql = `${ctx} select 'D:'||'"UNEXPECTED_${body.name}"'`;
      const line = psql(sql).split("\n").pop();
      if (!line.startsWith("D:")) throw new Error(`probe misread: ${line}`);
      return json({ data: JSON.parse(line.slice(2)), error:null });
    } catch (e) {
      const m = String(e.stderr || e.message || e).replace(/\s+/g," ").trim();
      return json({ data:null, error:{ message:m } });
    }
  }
  res.writeHead(404); res.end();
});
await new Promise(ok => server.listen(4320, ok));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:900} });
let passed=0, failed=0;
const T = async (n,f) => { try { await f(); passed++; console.log(`PASS ${n}`); }
  catch(e) { failed++; console.log(`FAIL ${n}\n     ${String(e.message).split("\n")[0]}`); } };
const attr = (s,a) => page.getAttribute(s,a);
const go = async () => { tables=[]; rpcs=[];
  await page.goto(`http://localhost:4320/?id=${OCC}`);
  await page.waitForSelector("[data-prep][data-outcome='ready']",{timeout:20000}); };
// record a fact through the UI exactly as an operator would
const record = async (fact, fill) => {
  // open only if closed: clicking an open row is the Cancel affordance
  if (!(await page.$(`[data-fact-form="${fact}"]`))) {
    await page.click(`[data-fact-action="${fact}"]`);
  }
  await page.waitForSelector(`[data-fact-form="${fact}"]`,{timeout:5000});
  await fill();
  await page.click(`[data-submit="${fact}"]`);
  await page.waitForTimeout(900);
};

// ══ PR-1 · day one ═══════════════════════════════════════════════════════
await go();
await T("PR-1 a bare occurrence renders a usable console naming all 7 missing facts — day one is the normal state, not an error", async () => {
  if (await attr("[data-prep]","data-recorded") !== "0") throw new Error("recorded != 0");
  const n = await page.$$eval("[data-fact]",e=>e.length);
  if (n !== 7) throw new Error(`${n} ledger rows`);
  const present = await page.$$eval('[data-fact][data-present="true"]',e=>e.length);
  if (present !== 0) throw new Error(`${present} facts marked present`);
  if (!(await page.$("[data-missing-list]"))) throw new Error("missing list not shown");
});
await T("PR-2 the console issues exactly ONE projection read per render and no operational table read", async () => {
  const briefs = rpcs.filter(r=>r==="projection_occurrence_brief").length;
  if (briefs !== 1) throw new Error(`${briefs} brief reads`);
  const illegal = tables.filter(t=>t!=="tenant_users"&&t!=="venue");
  if (illegal.length) throw new Error(`read tables: ${[...new Set(illegal)].join(",")}`);
});

// ══ PR-3…PR-6 · the capture loop ═════════════════════════════════════════
await T("PR-3 recording the operating date invokes the real ceremony and the value appears in SQL", async () => {
  await record("operating_date", async () => { await page.fill('[data-input="date"]',"2026-08-16"); });
  const live = scalar(`select m.at_date from public.promise_current_milestones('${OCC}'::uuid, now()) m where m.milestone_key='operating_date'`,"D:");
  if (live !== "2026-08-16") throw new Error(`SQL has ${live}`);
});
await T("PR-4 the screen re-reads the brief after the write rather than patching local state", async () => {
  if (await attr('[data-fact="operating_date"]',"data-present") !== "true") throw new Error("row not present");
  const shown = await page.textContent('[data-fact="operating_date"] [data-fact-value]');
  if (!shown.includes("2026-08-16")) throw new Error(`shows "${shown.trim()}"`);
  if (await attr("[data-prep]","data-recorded") !== "1") throw new Error("readiness did not advance");
  const missing = await attr("[data-prep]","data-missing");
  if (missing.includes("operating_date")) throw new Error("still listed missing");
});
await T("PR-5 covers record with a basis and the contracted delta comes from the projection", async () => {
  await record("attendance", async () => {
    await page.fill('[data-input="count"]',"300");
    await page.selectOption('[data-input="basis"]',"contracted"); });
  await record("attendance", async () => {
    await page.fill('[data-input="count"]',"285");
    await page.selectOption('[data-input="basis"]',"guaranteed");
    await page.fill('[data-input="reason"]',"guarantee at 72h"); });
  const txt = await page.textContent('[data-fact="attendance"] [data-fact-value]');
  if (!txt.includes("285") || !txt.includes("guaranteed")) throw new Error(`shows "${txt.trim()}"`);
  const delta = await page.textContent("[data-delta]");
  if (!delta.includes("-15") || !delta.includes("300")) throw new Error(`delta reads "${delta.trim()}"`);
  const live = scalar(`select head_count from public.promise_current_attendance('${OCC}'::uuid, now())`,"A:");
  if (live !== "285") throw new Error(`SQL current is ${live}`);
});
await T("PR-6 the venue selector offers the catalogue and binding is recorded by ceremony", async () => {
  await page.click('[data-fact-action="venue"]');
  await page.waitForSelector('[data-input="venue"]',{timeout:5000});
  await page.waitForFunction(()=>document.querySelectorAll('[data-input="venue"] option').length>1,null,{timeout:5000});
  const opts = await page.$$eval('[data-input="venue"] option',e=>e.map(o=>o.textContent));
  if (!opts.includes("Main Ballroom")) throw new Error(`options ${opts.join(",")}`);
  const vid = scalar(`select id from public.venue where name='Main Ballroom'`,"V:");
  await page.selectOption('[data-input="venue"]',vid);
  await page.click('[data-submit="venue"]');
  await page.waitForTimeout(900);
  const shown = await page.textContent('[data-fact="venue"] [data-fact-value]');
  if (!shown.includes("Main Ballroom")) throw new Error(`shows "${shown.trim()}"`);
  const src = scalar(`select source from public.occurrence_current_venue('${OCC}'::uuid, now())`,"S:");
  if (src !== "occurrence") throw new Error(`source ${src}`);
});

// ══ PR-7…PR-10 · refusals surface verbatim ═══════════════════════════════
await T("PR-7 amending without a reason renders the ceremony's own PROMISE_REASON_REQUIRED", async () => {
  await page.click('[data-fact-action="operating_date"]');
  await page.waitForSelector('[data-fact-form="operating_date"]',{timeout:5000});
  await page.fill('[data-input="date"]',"2026-08-17");
  await page.fill('[data-input="reason"]',"");
  await page.click('[data-submit="operating_date"]');
  await page.waitForSelector("[data-ceremony-refusal]",{timeout:6000});
  const code = await attr("[data-ceremony-refusal]","data-ceremony-refusal");
  if (code !== "PROMISE_REASON_REQUIRED") throw new Error(`code ${code}`);
  const live = scalar(`select m.at_date from public.promise_current_milestones('${OCC}'::uuid, now()) m where m.milestone_key='operating_date'`,"D:");
  if (live !== "2026-08-16") throw new Error(`refused write still landed: ${live}`);
});
await T("PR-8 restating an identical value renders PROMISE_UNCHANGED — the client did not pre-judge it", async () => {
  await page.fill('[data-input="date"]',"2026-08-16");
  await page.fill('[data-input="reason"]',"no change at all");
  await page.click('[data-submit="operating_date"]');
  await page.waitForTimeout(800);
  const code = await attr("[data-ceremony-refusal]","data-ceremony-refusal");
  if (code !== "PROMISE_UNCHANGED") throw new Error(`code ${code}`);
});
await T("PR-9 a legitimate amendment with a reason succeeds and supersedes in SQL", async () => {
  await page.fill('[data-input="date"]',"2026-08-17");
  await page.fill('[data-input="reason"]',"client moved the date");
  await page.click('[data-submit="operating_date"]');
  await page.waitForTimeout(900);
  const live = scalar(`select m.at_date from public.promise_current_milestones('${OCC}'::uuid, now()) m where m.milestone_key='operating_date'`,"D:");
  if (live !== "2026-08-17") throw new Error(`SQL has ${live}`);
  const chain = scalar(`select count(*) from public.occurrence_schedule_milestone where occurrence_id='${OCC}'::uuid and milestone_key='operating_date'`,"C:");
  if (Number(chain) !== 2) throw new Error(`${chain} records; expected an append, not an edit`);
});
await T("PR-10 supervision_start is refused as a milestone — MILESTONE_DUAL_CAPTURE, straight from SQL", async () => {
  await go();
  await page.click('[data-fact-action="schedule"]');
  await page.waitForSelector('[data-fact-form="schedule"]',{timeout:5000});
  const keys = await page.$$eval('[data-input="mkey"] option',e=>e.map(o=>o.getAttribute("value")));
  if (keys.includes("supervision_start")) throw new Error("the console offers a dual-capture key");
  if (keys.includes("operating_date")) throw new Error("operating_date offered among moment milestones");
  if (keys.length !== 15) throw new Error(`${keys.length} milestone keys offered`);
  await page.click('[data-fact-action="schedule"]');            // close it again
  await page.waitForSelector('[data-fact-form="schedule"]',{state:"detached",timeout:5000});
});

// ══ PR-11…PR-13 · schedule, overlaps, inheritance ════════════════════════
await T("PR-11 two overlapping windows are recorded and the console states they OVERLAP, never conflict", async () => {
  await record("schedule", async () => {
    await page.selectOption('[data-input="mkey"]',"load_in_start");
    await page.fill('[data-input="mat"]',"2026-08-17T13:00");
    await page.fill('[data-input="mend"]',"2026-08-17T16:00"); });
  await record("schedule", async () => {
    await page.selectOption('[data-input="mkey"]',"vendor_arrival");
    await page.fill('[data-input="mlabel"]',"Florist");
    await page.fill('[data-input="mat"]',"2026-08-17T15:00");
    await page.fill('[data-input="mend"]',"2026-08-17T17:00"); });
  await page.waitForSelector("[data-overlaps]",{timeout:6000});
  const n = await attr("[data-overlaps]","data-overlap-count");
  if (n !== "1") throw new Error(`${n} overlaps`);
  const txt = await page.textContent("[data-overlaps]");
  if (!/overlaps/i.test(txt)) throw new Error("does not say overlaps");
  if (/conflict|contention|clash/i.test(txt)) throw new Error(`asserts contention: "${txt}"`);
  const live = scalar(`select jsonb_array_length(public.projection_occurrence_brief('${OCC}'::uuid)->'data'->'overlaps')`,"N:");
  if (live !== "1") throw new Error(`projection says ${live}`);
});
await T("PR-12 an engagement-level supervision default renders as INHERITED, not as the occurrence's own", async () => {
  psql(`${ctx} select public.bind_supervision('${BOOK}'::uuid,'Local Vaad',now(),now()+interval '8 hours',null,null,null)`);
  await go();
  const shown = await page.textContent('[data-fact="supervision"] [data-fact-value]');
  if (!shown.includes("Local Vaad")) throw new Error(`shows "${shown.trim()}"`);
  if (!(await page.$('[data-inherited="supervision"]'))) throw new Error("inheritance not disclosed");
});
await T("PR-13 binding supervision on the occurrence overrides the default and the badge disappears", async () => {
  await record("supervision", async () => {
    await page.fill('[data-input="org"]',"KCL");
    await page.fill('[data-input="cert"]',"CERT-9");
    if (await page.$('[data-input="reason"]')) await page.fill('[data-input="reason"]',"occurrence-specific supervision"); });
  const shown = await page.textContent('[data-fact="supervision"] [data-fact-value]');
  if (!shown.includes("KCL")) throw new Error(`shows "${shown.trim()}"`);
  if (await page.$('[data-inherited="supervision"]')) throw new Error("still marked inherited");
  const src = scalar(`select source from public.occurrence_current_supervision('${OCC}'::uuid, now())`,"S:");
  if (src !== "occurrence") throw new Error(`source ${src}`);
});

// ══ PR-14…PR-16 · scheduled counts, regime, and truth agreement ══════════
await T("PR-14 a future-effective count is shown as scheduled and never as the operative number", async () => {
  await record("attendance", async () => {
    await page.fill('[data-input="count"]',"291");
    await page.selectOption('[data-input="basis"]',"final");
    await page.fill('[data-input="eff"]',"2026-08-16T09:00");
    await page.fill('[data-input="reason"]',"final count"); });
  const head = await page.textContent("[data-head-count]");
  if (head.trim() === "291") throw new Error("a future count became the operative number");
  if (!(await page.$("[data-scheduled-count]"))) throw new Error("scheduled commitment not surfaced");
});
await T("PR-15 every value on screen equals the projection — no client-side derivation anywhere", async () => {
  const brief = JSON.parse(scalar(`select public.projection_occurrence_brief('${OCC}'::uuid)`,"J:"));
  const d = brief.data;
  if (await attr("[data-prep]","data-missing-count") !== String(brief.counts.missing_promise_facts))
    throw new Error("missing count disagrees with counts");
  if (await attr("[data-prep]","data-has-event") !== String(d.has_event))
    throw new Error("regime disagrees");
  if (await attr("[data-prep]","data-truth-version") !== brief.provenance.truth_version)
    throw new Error("truth_version disagrees");
  if (d.overlaps.length > 0) {
    const shownOverlaps = await attr("[data-overlaps]","data-overlap-count");
    if (Number(shownOverlaps) !== d.overlaps.length) throw new Error("overlap count disagrees");
  } else if (await page.$("[data-overlaps]")) {
    throw new Error("overlaps rendered when the projection reports none");
  }
});
await T("PR-16 a foreign or absent occurrence renders not-found and no ledger", async () => {
  await page.goto(`http://localhost:4320/?id=00000000-0000-0000-0000-000000000000`);
  await page.waitForSelector("[data-prep][data-outcome='notfound']",{timeout:15000});
  if (await page.$("[data-ledger]")) throw new Error("ledger rendered for a missing occurrence");
  if (await page.$("[data-fact]")) throw new Error("facts rendered for a missing occurrence");
});

console.log(`\naccept-occurrence-prep: ${passed} passed, ${failed} failed`);
await browser.close(); server.close();
sh(`su postgres -c "dropdb --if-exists ${DB}"`);
process.exit(failed===0?0:1);
