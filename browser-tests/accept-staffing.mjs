// STAFFING ACCEPTANCE (v278) — the REAL mounted Booking→EventOperations→
// EventWorkspace→StaffingSection tree in Chromium over fixtures mirroring the
// certified event_workspace/eligible_staff/assign_staff SQL contracts. Claims S-1…S-10.
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-staffing.mjs
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
await new Promise((ok) => server.listen(4233, ok));
const browser = await chromium.launch();
const page = await browser.newPage();
let passed = 0, failed = 0;
const T = async (n, fn) => { try { await fn(); passed++; console.log(`PASS ${n}`); } catch (e) { failed++; console.log(`FAIL ${n}\n     ${e.message}`); } };
const ceremonies = () => page.evaluate(() => window.__ceremonies);
const go = async (mode) => { await page.goto(`http://localhost:4233/?mode=${mode}`); await page.waitForSelector("[data-event-workspace]"); await page.waitForSelector("[data-staffing]"); };

await T("S-1 the staffing section renders with per-requirement rows", async () => {
  await go("staff_uncovered");
  if (!(await page.$('[data-staff-req="carver"]')) || !(await page.$('[data-staff-req="server"]'))) throw new Error("requirement rows missing");
});

await T("S-2 role quantities and shortage render from the coverage projection", async () => {
  await go("staff_uncovered");
  if (!(await page.textContent('[data-staff-req="carver"]')).includes("1/2")) throw new Error("carver 1/2 missing");
  if (!(await page.textContent('[data-staff-req="server"]')).includes("1/1")) throw new Error("server 1/1 missing");
});

await T("S-3 a scheduling conflict is surfaced", async () => {
  await go("staff_uncovered");
  if (!(await page.$('[data-staff-req="carver"] [data-staff-conflict]'))) throw new Error("conflict not surfaced");
});

await T("S-4 covered vs uncovered readiness renders distinctly", async () => {
  await go("staff_uncovered");
  if (await page.getAttribute("[data-staffing]", "data-staffing-readiness") !== "incomplete") throw new Error("expected incomplete");
  await go("ready");
  if (await page.getAttribute("[data-staffing]", "data-staffing-readiness") !== "covered") throw new Error("expected covered");
});

await T("S-5 authorized assign routes to the ceremony and refreshes the projection", async () => {
  await go("staff_uncovered");
  const before = (await ceremonies()).filter((c) => c === "rpc:event_workspace").length;
  await page.click('[data-staff-req="carver"] [data-assign-open]');
  await page.waitForSelector("[data-assign-form]");
  await page.selectOption("[data-assign-staff]", "s-3");
  await page.fill("[data-assign-start]", "2026-08-01T10:00");
  await page.fill("[data-assign-end]", "2026-08-01T14:00");
  await page.click("[data-assign-submit]");
  await page.waitForTimeout(150);
  const c = await ceremonies();
  if (!c.includes("rpc:assign_staff")) throw new Error("assign_staff not invoked");
  if (c.filter((x) => x === "rpc:event_workspace").length <= before) throw new Error("projection not refreshed");
});

await T("S-6 an unauthorized user sees no assignment controls", async () => {
  await go("staff_unauth");
  if (await page.$("[data-assign-open]")) throw new Error("assign control shown to unauthorized user");
  if (await page.$("[data-staff-remove]")) throw new Error("remove control shown to unauthorized user");
});

await T("S-7 remove routes to the release ceremony", async () => {
  await go("staff_uncovered");
  const before = (await ceremonies()).filter((c) => c === "rpc:event_workspace").length;
  await page.click('[data-staff-req="carver"] [data-staff-remove]');
  await page.waitForTimeout(150);
  const c = await ceremonies();
  if (!c.includes("rpc:release_staffing_assignment")) throw new Error("release not invoked");
  if (c.filter((x) => x === "rpc:event_workspace").length <= before) throw new Error("projection not refreshed");
});

await T("S-8 Start Service is gated while staffing is uncovered, enabled when covered", async () => {
  await go("staff_uncovered");
  if (await page.$("[data-start-service]")) throw new Error("Start Service shown while staffing uncovered");
  await go("ready");
  if (!(await page.$("[data-start-service]"))) throw new Error("Start Service missing when staffing covered");
});

await T("S-9 staffing shortage appears in the workspace blocker section", async () => {
  await go("staff_uncovered");
  const b = await page.textContent("[data-ws-blockers]");
  if (!b.includes("carver")) throw new Error("staffing blocker not surfaced in blocker section");
});

await T("S-10 the staffing section remains usable at tablet width", async () => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await go("staff_uncovered");
  if (!(await page.$("[data-staffing]")) || !(await page.$('[data-staff-req="carver"]'))) throw new Error("staffing not usable at tablet width");
  await page.setViewportSize({ width: 1280, height: 800 });
});

await browser.close(); server.close();
console.log(`\naccept-staffing: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
