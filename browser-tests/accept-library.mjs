// ═══════════════════════════════════════════════════════════════════════════
// v215 ACCEPTANCE — the registry-driven Library browser (KA §4/§5), real
// Chromium, real component over fixture registrations (library.harness.tsx).
// The claims:
//   different facts     → L-1 (idle ≠ no-results — two distinct states)
//   registry-driven     → L-2 (rail headings/glyphs come from registrations
//                          the browser never names; the source-level claim —
//                          zero kind literals in LibraryBrowser.tsx — is
//                          checked by the slice report's grep)
//   grouped rails (§5)  → L-3 (only non-empty rails; ordered by best hit;
//                          within-rail order by weight)
//   keyboard walks flat → L-4 (↓ crosses a rail boundary; ↵ picks)
//   pick = registration → L-5 (instantiate kind + host → callback + close;
//                          navigate kind → href)
//   drag is declared    → L-6 (draggable exactly where the registration
//                          returns a payload; gesture-level drags remain
//                          covered by the v197 DesignStage suites)
//   secondary affordance→ L-7 (the "definition" chip fires the host handler,
//                          not the row's pick)
//   docked strip        → L-8 (data-knowledge-strip renders in docked mode)
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-library.mjs
// Build: npx esbuild browser-tests/library.harness.tsx --bundle
//   --outfile=browser-tests/library.harness.js --jsx=automatic
//   --define:process.env.NODE_ENV='"development"' --alias:@=./src
// (No Supabase defines needed: the rebuilt browser imports only the
// registry, and the harness registers fixtures.)
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const server = createServer((req, res) => {
  const routes = { "/": ["library.html", "text/html"],
    "/library.harness.js": ["library.harness.js", "text/javascript"],
    "/app.css": ["app.css", "text/css"] };
  const r = routes[req.url.split("?")[0]];
  if (!r) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": r[1] }); res.end(readFileSync(join(here, r[0])));
});
await new Promise((ok) => server.listen(4191, ok));
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
let passed = 0, failed = 0;
const T = async (name, fn) => { try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); } };
const type = async (text) => {
  await page.fill("input", "");
  await page.fill("input", text);
  await page.waitForTimeout(260);   // past the 160ms debounce
};

await T("L-1 idle and no-results are different facts", async () => {
  await page.goto("http://localhost:4191/");
  await page.waitForSelector("[data-library-idle]");
  if (await page.$("[data-library-empty]")) throw new Error("empty state shown while idle");
  await type("zzzz-nothing");
  await page.waitForSelector("[data-library-empty]");
  if (await page.$("[data-library-idle]")) throw new Error("idle state shown for a real miss");
});
await T("L-2 rails carry the registrations' headings — kinds the browser never names", async () => {
  await type("sus");   // "Sushi Station" and "Sussman Bar Mitzvah" both match
  await page.waitForSelector("[data-library-rail='fx-station']");
  await page.waitForSelector("[data-library-rail='fx-gala']");
  const h1 = await page.textContent("[data-library-rail='fx-station'] div");
  const h2 = await page.textContent("[data-library-rail='fx-gala'] div");
  if (h1.trim() !== "Stations") throw new Error(`heading: ${h1}`);
  if (h2.trim() !== "Past galas") throw new Error(`heading: ${h2}`);
});
await T("L-3 only non-empty rails; best hit leads; within-rail order by weight", async () => {
  await type("sus");   // both stations match ("Sushi…" prefix, "Couscous…" substring); the gala matches by prefix
  await page.waitForSelector("[data-library-rail='fx-station']");
  const kinds = await page.$$eval("[data-library-rail]", (xs) => xs.map((x) => x.getAttribute("data-library-rail")));
  // station best = 117 (prefix+17) beats gala best = 100 (prefix)
  if (kinds.join(",") !== "fx-station,fx-gala") throw new Error(`rail order: ${kinds}`);
  const titles = await page.$$eval("[data-library-rail='fx-station'] button span:nth-child(2)", (xs) => xs.map((x) => x.textContent));
  if (titles[0] !== "Sushi Station") throw new Error(`within-rail order: ${titles}`);
  await type("couscous");
  await page.waitForSelector("[data-library-rail='fx-station']");
  if (await page.$("[data-library-rail='fx-gala']")) throw new Error("an empty rail rendered");
});
await T("L-4 the keyboard walks one flat list across rail boundaries", async () => {
  await type("sus");
  await page.waitForSelector("[data-library-rail='fx-gala']");
  await page.press("input", "ArrowDown");
  await page.press("input", "ArrowDown");   // cursor now on the gala row (index 2)
  await page.press("input", "Enter");
  await page.waitForFunction(() => window.location.hash === "#opened-g1");
});
await T("L-5 pick means what the registration declares: instantiate + host → callback and close", async () => {
  await page.goto("http://localhost:4191/?mode=host");
  await page.waitForSelector("[data-library-idle]");
  await type("sushi");
  await page.waitForSelector("[data-library-rail='fx-station']");
  // Real CSS puts the secondary "definition" chip mid-row; click the TITLE
  // region, as a cursor aiming at the row would.
  await page.click("[data-library-rail='fx-station'] button", { position: { x: 30, y: 12 } });
  const picks = await page.evaluate(() => window.__picks);
  if (picks[0] !== "instantiate:s1:Sushi Station") throw new Error(`picks: ${picks}`);
  if (picks[1] !== "closed") throw new Error("did not close ON PICK");
});
await T("L-6 drag is declared, never inferred: draggable exactly where a payload exists", async () => {
  await page.goto("http://localhost:4191/");
  await page.waitForSelector("[data-library-idle]");
  await type("sus");
  await page.waitForSelector("[data-library-rail='fx-gala']");
  const station = await page.getAttribute("[data-library-rail='fx-station'] button", "draggable");
  const gala = await page.getAttribute("[data-library-rail='fx-gala'] button", "draggable");
  if (station !== "true") throw new Error("instantiable kind not draggable");
  if (gala === "true") throw new Error("navigate-only kind became draggable");
});
await T("L-7 the secondary affordance fires its handler, not the row's pick", async () => {
  await page.goto("http://localhost:4191/?mode=host");
  await page.waitForSelector("[data-library-idle]");
  await type("sushi");
  await page.waitForSelector("[data-view-definition='s1']");
  await page.click("[data-view-definition='s1']");
  const picks = await page.evaluate(() => window.__picks);
  if (picks[0] !== "definition:s1:Sushi Station") throw new Error(`picks: ${picks}`);
  if (picks.includes("closed")) throw new Error("secondary click closed the browser");
});
await T("L-8 docked mode renders the Knowledge strip", async () => {
  await page.goto("http://localhost:4191/?mode=docked");
  await page.waitForSelector("[data-knowledge-strip='true']");
});

await browser.close(); server.close();
console.log(`\naccept-library: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
