// ═══════════════════════════════════════════════════════════════════════════
// DRAG-ENGINE ACCEPTANCE (v262: the decision claims D-1..D-5 retired WITH
// the v216 doctrine — their commitment disciplines live in the
// constitutional heirs' unit pins). Real Chromium, real components
// (landing.harness.tsx). The claims:
//   gesture: card        → D-6 (REAL mouse drag of the payload card onto
//                          the canvas → its declared mime payload —
//                          the drop is a request the host routes)
//   gesture: component   → D-7 (identity card drags the identity payload —
//                          v215's L-6 debt, paid at gesture level)
//   click path exists    → D-8 (↵ on the payload card fires onLandDesign —
//                          every drag has a click path)
// Run:      PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-landing.mjs
// (v262: the decision-variant recipe retired with its surface.)
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const variant = process.argv.includes("--variant");
const js = variant ? "landing.variant.js" : "landing.harness.js";
const server = createServer((req, res) => {
  const routes = { "/": ["landing.html", "text/html"],
    "/landing.harness.js": [js, "text/javascript"],
    "/app.css": ["app.css", "text/css"] };
  const r = routes[req.url.split("?")[0]];
  if (!r) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": r[1] }); res.end(readFileSync(join(here, r[0])));
});
await new Promise((ok) => server.listen(4192, ok));
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1100, height: 780 } })).newPage();
let passed = 0, failed = 0;
const T = async (name, fn) => { try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); } };
const commits = () => page.evaluate(() => window.__commits);

// Real mouse drag, v197 doctrine: press, move in steps, release.
async function dragTo(fromSel, toSel) {
  const from = await (await page.waitForSelector(fromSel)).boundingBox();
  const to = await (await page.waitForSelector(toSel)).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(
      from.x + ((to.x + to.width / 2 - from.x) * i) / 8,
      from.y + ((to.y + to.height / 2 - from.y) * i) / 8, { steps: 3 });
  }
  await page.mouse.up();
}

// D-1..D-5 retired WITH their surface (v262): they exercised the v216
// LandingDecision dialog — open-commits-nothing, add-once, armed replace,
// exact subsets, cancel-lands-nothing. Those commitment disciplines are
// carried by the constitutional heirs and their unit pins (CopyIntoDraft:
// staged problems block the single act; StartFromBlueprint: conflicts →
// "nothing was created"). The drag ENGINE claims below remain — the drag
// grammar is live product.

await T("D-6 REAL drag: the payload card lands its declared payload on the canvas", async () => {
  await page.goto("http://localhost:4192/?mode=drag");
  await page.waitForSelector("[data-knowledge-strip]");
  await page.fill("input", "elegant");
  await page.waitForSelector("[data-library-rail='fx-menu'] button");
  await dragTo("[data-library-rail='fx-menu'] button", "[data-fixture-canvas]");
  await page.waitForSelector("[data-received]");
  const got = await page.$$eval("[data-received]", (xs) => xs.map((x) => x.textContent));
  const hit = got.filter((g) => g.indexOf("drop-card:") === 0)[0];
  if (!hit) throw new Error(`received: ${got}`);
  const payload = JSON.parse(hit.slice("drop-card:".length));
  if (payload.cardId !== "m1" || payload.name !== "Elegant Wedding") throw new Error(hit);
});
await T("D-7 REAL drag: the component card lands the identity payload (v215's L-6 debt, paid)", async () => {
  await dragTo("[data-library-rail='fx-station'] button", "[data-fixture-canvas]");
  await page.waitForFunction(() =>
    Array.prototype.some.call(document.querySelectorAll("[data-received]"),
      (x) => x.textContent.indexOf("drop-identity:") === 0));
  const got = await page.$$eval("[data-received]", (xs) => xs.map((x) => x.textContent));
  const hit = got.filter((g) => g.indexOf("drop-identity:") === 0)[0];
  const payload = JSON.parse(hit.slice("drop-identity:".length));
  if (payload.identityId !== "s1") throw new Error(hit);
});
await T("D-8 every drag has a click path: ↵ on the payload card fires the landing host", async () => {
  await page.goto("http://localhost:4192/?mode=drag");
  await page.waitForSelector("[data-knowledge-strip]");
  await page.fill("input", "elegant wedding");
  await page.waitForSelector("[data-library-rail='fx-menu'] button");
  await page.press("input", "Enter");
  await page.waitForSelector("[data-received]");
  const got = await page.$$eval("[data-received]", (xs) => xs.map((x) => x.textContent));
  if (got.filter((g) => g === "land-click:m1:Elegant Wedding").length !== 1) throw new Error(`received: ${got}`);
});

await browser.close(); server.close();
console.log(`\naccept-landing: ${passed} passed, ${failed} failed${variant ? "  (VARIANT — D-1 must FAIL or the suite has no teeth)" : ""}`);
process.exit(variant ? (failed > 0 ? 0 : 1) : (failed === 0 ? 0 : 1));
