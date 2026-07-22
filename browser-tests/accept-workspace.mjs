// EVENT OPERATIONS WORKSPACE ACCEPTANCE (v277) — the REAL mounted workspace
// (EventOperations → EventWorkspace) in Chromium over fixtures that mirror the
// certified event_workspace() SQL contract. Claims W-1…W-13.
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-workspace.mjs
import esbuild from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const aliasPlugin = {
  name: "alias",
  setup(b) {
    b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: join(here, "mock-supabase.ts") }));
    b.onResolve({ filter: /^@\// }, (a) => {
      const base = join(root, "src", a.path.slice(2));
      for (const ext of [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"]) if (existsSync(base + ext)) return { path: base + ext };
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
  if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(html); }
  if (u === "/event-ops.harness.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js); }
  res.writeHead(404); res.end();
});
await new Promise((ok) => server.listen(4232, ok));
const browser = await chromium.launch();
const page = await browser.newPage();
let passed = 0, failed = 0;
const T = async (n, fn) => { try { await fn(); passed++; console.log(`PASS ${n}`); } catch (e) { failed++; console.log(`FAIL ${n}\n     ${e.message}`); } };
const ceremonies = () => page.evaluate(() => window.__ceremonies);
const go = async (mode) => { await page.goto(`http://localhost:4232/?mode=${mode}`); await page.waitForSelector("[data-event-ops]"); };

await T("W-1 unreleased booking shows an operational release surface", async () => {
  await go("unreleased");
  if (!(await page.$("[data-event-ops-release]")) || !(await page.$("[data-release-event]"))) throw new Error("release surface/control missing");
  if (await page.$("[data-event-workspace]")) throw new Error("workspace rendered without an event");
});

await T("W-2 released event shows the complete workspace (all seven sections present)", async () => {
  await go("ready");
  await page.waitForSelector("[data-event-workspace]");
  for (const s of ["[data-ws-header]", "[data-event-lifecycle]", "[data-ws-readiness]", "[data-daily-ops]", "[data-ws-blockers]", "[data-ws-activity]"])
    if (!(await page.$(s))) throw new Error(`section missing: ${s}`);
});

await T("W-3 lifecycle rail displays the SQL-derived stage and the header derives real counts", async () => {
  await go("ready");
  if (await page.getAttribute("[data-event-lifecycle]", "data-lifecycle-stage") !== "ready") throw new Error("rail stage wrong");
  if ((await page.textContent("[data-ws-stage]")) !== "ready") throw new Error("header stage wrong");
  if (!(await page.textContent("[data-ws-readiness-pct]")).includes("5/6")) throw new Error("readiness fraction wrong");
});

await T("W-4 readiness categories render correct counts from the obligation model", async () => {
  await go("ready");
  if (!(await page.textContent('[data-ws-cat="equipment"]')).includes("1/1")) throw new Error("equipment 1/1 missing");
  if (!(await page.textContent('[data-ws-cat="culinary"]')).includes("0/1")) throw new Error("culinary 0/1 missing");
});

await T("W-5 obligations group by real categories in the workboard", async () => {
  await go("ready");
  for (const d of ["culinary", "equipment", "staffing", "venue"]) if (!(await page.$(`[data-dept="${d}"]`))) throw new Error(`dept missing: ${d}`);
  if (!(await page.textContent('[data-dept="culinary"]')).includes("⚑")) throw new Error("decision-debt not flagged");
});

await T("W-6 blockers identify the actual blocking work", async () => {
  await go("in_service");
  const b = await page.textContent("[data-ws-blockers]");
  if (!b.includes("closeout")) throw new Error("closeout blocker not identified");
});

await T("W-7 Start Service appears only when permitted", async () => {
  await go("ready"); if (!(await page.$("[data-start-service]"))) throw new Error("Start service missing at ready");
  await go("in_service"); if (await page.$("[data-start-service]")) throw new Error("Start service shown when not permitted");
});

await T("W-8 Close Event appears only when permitted", async () => {
  await go("in_service"); if (!(await page.$("[data-close-event]"))) throw new Error("Close event missing when permitted");
  await go("ready"); if (await page.$("[data-close-event]")) throw new Error("Close event shown when not permitted");
});

await T("W-9 a successful obligation action invokes the ceremony and refreshes the projection", async () => {
  await go("ready");
  const before = (await ceremonies()).filter((c) => c === "rpc:event_workspace").length;
  await page.click("[data-card-assign]");
  await page.waitForTimeout(150);
  const c = await ceremonies();
  if (!c.includes("rpc:record_execution_evidence")) throw new Error("action did not invoke record_execution_evidence");
  const after = c.filter((x) => x === "rpc:event_workspace").length;
  if (after <= before) throw new Error("projection not refreshed after action");
});

await T("W-10 a rejected ceremony shows a useful error and does not falsely advance the UI", async () => {
  await go("in_service");
  await page.fill("[data-event-lifecycle] input", "FAIL");
  await page.click("[data-close-event]");
  await page.waitForSelector("[data-ws-error]");
  const err = await page.textContent("[data-ws-error]");
  if (!err.includes("CLOSE_CLOSEOUT_UNRESOLVED")) throw new Error(`error not surfaced: ${err}`);
  if (await page.getAttribute("[data-event-lifecycle]", "data-lifecycle-stage") !== "in_service") throw new Error("UI falsely advanced past a rejected close");
});

await T("W-11 recent evidence is rendered from the ledger", async () => {
  await go("in_service");
  const items = (await page.$$("[data-ws-activity-item]")).length;
  if (items < 2) throw new Error(`activity items: ${items}`);
});

await T("W-12 a tenant-inaccessible event does not render operational data", async () => {
  await go("foreign");
  if (await page.$("[data-event-workspace]")) throw new Error("workspace rendered for a null (cross-tenant) projection");
  if (!(await page.$("[data-ws-loading]"))) throw new Error("expected the non-rendering placeholder");
});

await T("W-13 the workspace remains usable at tablet width", async () => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await go("ready");
  if (!(await page.$("[data-event-workspace]")) || !(await page.$("[data-ws-readiness]"))) throw new Error("workspace not usable at tablet width");
  await page.setViewportSize({ width: 1280, height: 800 });
});

await browser.close(); server.close();
console.log(`\naccept-workspace: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
