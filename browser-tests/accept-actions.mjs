// ACTION ROUTING ACCEPTANCE (v279) — the REAL mounted EventWorkspace → ActionPanel
// tree in Chromium, driven by the availability projection fixtures and dispatching
// through perform_event_action. Claims A-1…A-11. No stage law in the client.
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-actions.mjs
import esbuild from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const aliasPlugin = { name: "alias", setup(b) {
  b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: join(here, "mock-supabase.ts") }));
  b.onResolve({ filter: /^@\// }, (a) => {
    const base = join(root, "src", a.path.slice(2));
    for (const ext of [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"]) if (existsSync(base + ext)) return { path: base + ext };
    return { path: base };
  });
}};
const built = await esbuild.build({
  entryPoints: [join(here, "event-ops.harness.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
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
await new Promise((ok) => server.listen(4244, ok));
const browser = await chromium.launch();
const page = await browser.newPage();
let passed = 0, failed = 0;
const T = async (n, fn) => { try { await fn(); passed++; console.log(`PASS ${n}`); } catch (e) { failed++; console.log(`FAIL ${n}\n     ${e.message}`); } };
const disp = () => page.evaluate(() => (window.__ceremonies || []).filter((c) => c.startsWith("dispatch:")));
const go = async (mode) => { await page.goto(`http://localhost:4244/?mode=${mode}`); await page.waitForSelector("[data-action-panel]"); };

await T("A-1 the action panel renders lifecycle actions from the projection", async () => {
  await go("ready");
  if (!(await page.$('[data-action-group="lifecycle"]'))) throw new Error("lifecycle group missing");
  if (!(await page.$('[data-action-invoke="start_service"]'))) throw new Error("start_service button missing");
});

await T("A-2 an available action is enabled; a blocked action is disabled with its blocker", async () => {
  await go("ready");
  if (await page.getAttribute('[data-action="start_service"]', "data-action-available") !== "true") throw new Error("start_service should be available");
  if (await page.isDisabled('[data-action-invoke="start_service"]')) throw new Error("available action should be enabled");
  if (!(await page.isDisabled('[data-action-invoke="close_event"]'))) throw new Error("blocked action should be disabled");
  const blk = await page.textContent('[data-action-blocker="close_event"]');
  if (!blk.includes("service has not started")) throw new Error("blocker reason not rendered");
});

await T("A-3 a non-workspace-visible action (record evidence) is not shown in the panel", async () => {
  await go("ready");
  if (await page.$('[data-action-invoke="record_execution_evidence"]')) throw new Error("record evidence should not appear in the panel");
});

await T("A-4 clicking dispatches perform_event_action with the correct stable action_key", async () => {
  await go("ready");
  await page.click('[data-action-invoke="start_service"]');
  await page.waitForTimeout(150);
  const d = await disp();
  if (!d.includes("dispatch:start_service")) throw new Error("dispatcher not called with start_service");
});

await T("A-5 a successful dispatch refreshes the workspace projection", async () => {
  await go("ready");
  const before = (await page.evaluate(() => window.__ceremonies || [])).filter((c) => c === "rpc:event_workspace").length;
  await page.click('[data-action-invoke="start_service"]');
  await page.waitForTimeout(150);
  const after = (await page.evaluate(() => window.__ceremonies || [])).filter((c) => c === "rpc:event_workspace").length;
  if (after <= before) throw new Error("workspace not refreshed after dispatch");
});

await T("A-6 an in-service event shows Close Event as available and dispatches it", async () => {
  await go("in_service");
  if (await page.getAttribute('[data-action="close_event"]', "data-action-available") !== "true") throw new Error("close should be available in service");
  await page.click('[data-action-invoke="close_event"]');
  await page.waitForTimeout(150);
  if (!(await disp()).includes("dispatch:close_event")) throw new Error("close_event not dispatched");
});

await T("A-7 an already-completed action (start after in-service) is not shown", async () => {
  await go("in_service");
  if (await page.$('[data-action-invoke="start_service"]')) throw new Error("completed start_service should be hidden");
});

await T("A-8 an unauthorized actor sees no privileged action buttons", async () => {
  await go("staff_unauth");
  if (await page.$('[data-action-invoke="start_service"]')) throw new Error("unauthorized start_service shown");
  if (await page.$('[data-action-invoke="close_event"]')) throw new Error("unauthorized close_event shown");
});

await T("A-9 a staffing-uncovered event shows Start Service blocked with the staffing reason", async () => {
  await go("staff_uncovered");
  if (!(await page.isDisabled('[data-action-invoke="start_service"]'))) throw new Error("start_service should be blocked");
  const blk = await page.textContent('[data-action-blocker="start_service"]');
  if (!blk.includes("staffing")) throw new Error("staffing blocker not surfaced");
});

await T("A-10 a lawful refusal is rendered honestly (no fake success)", async () => {
  await page.evaluate(() => { window.__fixture.dispatch = { start_service: { ok: false, action_key: "start_service", outcome: "refused", reason_code: "lawful_refusal", message: "SERVICE_NOT_READY: 2 pre-service obligation(s) unresolved", target_id: "evt-1", result: null } }; });
  await page.click('[data-action-invoke="start_service"]').catch(() => {});
  // reload ready mode but keep the canned refusal
  await page.goto("http://localhost:4244/?mode=ready");
  await page.waitForSelector("[data-action-panel]");
  await page.evaluate(() => { window.__fixture.dispatch = { start_service: { ok: false, action_key: "start_service", outcome: "refused", reason_code: "lawful_refusal", message: "SERVICE_NOT_READY: pre-service unresolved", target_id: "evt-1", result: null } }; });
  await page.click('[data-action-invoke="start_service"]');
  await page.waitForSelector("[data-action-note]");
  const note = await page.textContent("[data-action-note]");
  if (!note.toLowerCase().includes("refused")) throw new Error("refusal not rendered honestly: " + note);
});

await T("A-11 the client contains no duplicated stage-transition law", async () => {
  const panel = readFileSync(join(root, "src/components/execution/ActionPanel.tsx"), "utf8");
  // the panel must not branch on lifecycle stage names — those live in SQL only
  for (const w of ["released", "in_prep", "in_service", '=== "ready"', "event_stage"]) {
    if (panel.includes(w)) throw new Error(`ActionPanel encodes stage law: ${w}`);
  }
});

await browser.close(); server.close();
console.log(`\naccept-actions: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
