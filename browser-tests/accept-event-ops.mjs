// EVENT OPERATIONS ACCEPTANCE — the v275/v276 Execution OS surface as MOUNTED on
// the booking page (EventOperations → ReleaseAction | EventLifecycle + DailyOpsEvent),
// rendered in real Chromium over fixtures. Claims:
//   EO-1 unreleased engagement → the Operational Release surface is visible & actionable
//   EO-2 a released 'ready' event → the derived lifecycle rail shows 'ready' and a
//        visible Start Service control that invokes start_service
//   EO-3 an 'in_service' event → the closeout blocker is shown and a visible Close
//        Event control invokes close_event
//   EO-4 DailyOps event scope renders obligations grouped by department, decision-debt flagged
//   EO-5 the parent EventOperations surface is present in every released mode
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-event-ops.mjs
import esbuild from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

// resolve @/ → src, with @/lib/supabase → the harness mock
const aliasPlugin = {
  name: "alias",
  setup(b) {
    b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: join(here, "mock-supabase.ts") }));
    b.onResolve({ filter: /^@\// }, (args) => {
      const base = join(root, "src", args.path.slice(2));
      for (const ext of [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"]) {
        if (existsSync(base + ext)) return { path: base + ext };
      }
      return { path: base };
    });
  },
};

const built = await esbuild.build({
  entryPoints: [join(here, "event-ops.harness.tsx")],
  bundle: true, write: false, format: "iife", jsx: "automatic",
  loader: { ".ts": "ts", ".tsx": "tsx" }, plugins: [aliasPlugin], logLevel: "silent",
});
const js = built.outputFiles[0].text;
const html = readFileSync(join(here, "event-ops.html"));

const server = createServer((req, res) => {
  const u = req.url.split("?")[0];
  if (u === "/" ) { res.writeHead(200, { "content-type": "text/html" }); return res.end(html); }
  if (u === "/event-ops.harness.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js); }
  res.writeHead(404); res.end();
});
await new Promise((ok) => server.listen(4231, ok));

const browser = await chromium.launch();
const page = await browser.newPage();
let passed = 0, failed = 0;
const T = async (name, fn) => {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
};
const ceremonies = () => page.evaluate(() => window.__ceremonies);
const go = async (mode) => { await page.goto(`http://localhost:4231/?mode=${mode}`); await page.waitForSelector("[data-event-ops]"); };

await T("EO-1 an unreleased engagement shows the Operational Release surface with an actionable Release control", async () => {
  await go("unreleased");
  if (!(await page.$("[data-event-ops-release]"))) throw new Error("release surface missing");
  if (!(await page.$("[data-release-event]"))) throw new Error("Release event button missing");
});

await T("EO-2 a released 'ready' event shows the derived lifecycle rail at 'ready' with a Start Service control that invokes start_service", async () => {
  await go("ready");
  await page.waitForSelector("[data-event-lifecycle]");
  const stage = await page.getAttribute("[data-event-lifecycle]", "data-lifecycle-stage");
  if (stage !== "ready") throw new Error(`stage: ${stage}`);
  if (!(await page.$("[data-start-service]"))) throw new Error("Start service control missing at 'ready'");
  await page.click("[data-start-service]");
  await page.waitForTimeout(120);
  if (!(await ceremonies()).includes("rpc:start_service")) throw new Error("Start service did not invoke start_service");
});

await T("EO-3 an 'in_service' event shows the explicit closeout blocker and a Close Event control that invokes close_event", async () => {
  await go("in_service");
  await page.waitForSelector("[data-event-lifecycle]");
  if (await page.getAttribute("[data-event-lifecycle]", "data-lifecycle-stage") !== "in_service") throw new Error("not in_service");
  const body = await page.textContent("[data-event-ops-live]");
  if (!body.includes("closeout")) throw new Error("closeout blocker not shown");
  if (!(await page.$("[data-close-event]"))) throw new Error("Close event control missing");
  await page.fill("[data-event-lifecycle] input", "override-ref-1");
  await page.click("[data-close-event]");
  await page.waitForTimeout(120);
  if (!(await ceremonies()).includes("rpc:close_event")) throw new Error("Close event did not invoke close_event");
});

await T("EO-4 DailyOps event scope renders obligations grouped by department with decision-debt flagged", async () => {
  await go("ready");
  await page.waitForSelector("[data-daily-ops]");
  for (const d of ["culinary", "equipment", "staffing", "venue"]) {
    if (!(await page.$(`[data-dept="${d}"]`))) throw new Error(`department section missing: ${d}`);
  }
  const culinary = await page.textContent('[data-dept="culinary"]');
  if (!culinary.includes("⚑")) throw new Error("decision-debt (⚑) not flagged on the unresolved culinary obligation");
});

await T("EO-5 the parent EventOperations surface is present in every released mode", async () => {
  for (const m of ["ready", "in_service"]) { await go(m); if (!(await page.$("[data-event-ops-live]"))) throw new Error(`live surface missing in ${m}`); }
});

await browser.close(); server.close();
console.log(`\naccept-event-ops: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
