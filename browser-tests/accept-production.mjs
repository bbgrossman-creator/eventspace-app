// ═══════════════════════════════════════════════════════════════════════════
// v212 ACCEPTANCE — the Production lens (SPEC-003 §9), real Chromium.
// THE PIPELINE'S VALIDATION per the acceptance advisory; the criteria map:
//   ownership chain      → K-6 (sections arrive via the registration; ids are
//                          the registration's own; nothing else parsed them)
//                          + the v212 unit agnosticism proof
//   zero lens diffs      → v211 fixture proof (registry suite) + K-6's
//                          registration-owned ids
//   read-only projection → K-4 (no write occurs; no mutation affordance)
//   projection contract  → K-2/K-3/K-5 (whys, suppressed-struck, honest
//                          absence — the renderer shows only what the model
//                          carries)
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-production.mjs
// Regression: node browser-tests/accept-production.mjs --variant  (expects K-3 FAIL)
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const variant = process.argv.includes("--variant");
const js = variant ? "production.variant.js" : "production.harness.js";
const server = createServer((req, res) => {
  const routes = {
    "/": ["production.html", "text/html"],
    "/production.harness.js": [js, "text/javascript"],
    "/app.css": ["app.css", "text/css"],
  };
  const r = routes[req.url.split("?")[0]];
  if (!r) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": r[1] });
  res.end(readFileSync(join(here, r[0])));
});
await new Promise((ok) => server.listen(4188, ok));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
let passed = 0, failed = 0;
const T = async (name, fn) => {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); }
};
const goto = async (mode) => {
  await page.goto(`http://localhost:4188/?mode=${mode}`);
  await page.waitForSelector("[data-production-sheet]");
};

await T("K-1 identity renders canonical fields; honesty band absent on a live unlocked event", async () => {
  await goto("full");
  const id = await page.textContent("[data-prod-identity]");
  if (!id.includes("2026-08-22") || !id.includes("180 guests")) throw new Error(`identity: ${id}`);
  if (await page.$("[data-prod-honesty]")) throw new Error("honesty band rendered on a live event");
});

await T("K-2 numbers show their work: override large, derivation quiet, suggestion intact", async () => {
  await goto("full");
  const q = await page.textContent('[data-prod-quantity="pieces"]');
  if (!q.includes("300")) throw new Error(`value: ${q}`);
  if (!q.includes("overridden")) throw new Error("override not marked");
  const why = await page.textContent('[data-prod-quantity="pieces"] [data-prod-why]');
  if (!why.includes("suggested 240") || !why.includes("180 guests × 8 ÷ 6"))
    throw new Error(`why: ${why}`);
});

await T("K-3 suppressed requirement is STRUCK with its cause — present, never hidden", async () => {
  await goto("full");
  const sup = await page.$('[data-prod-req="Prep table"][data-suppressed="true"]');
  if (!sup) throw new Error("suppressed requirement missing from the sheet");
  const deco = await sup.evaluate((el) => getComputedStyle(el).textDecorationLine);
  if (!deco.includes("line-through")) throw new Error(`not struck: ${deco}`);
  const txt = await sup.textContent();
  if (!txt.includes("considered and declined")) throw new Error("suppression not explained");
  const live = await page.textContent('[data-prod-req="Handwash station"]');
  if (!live.includes("from live chef")) throw new Error(`cause missing: ${live}`);
  // layer filtering: the warehouse row must NOT appear on the kitchen sheet
  if (await page.$('[data-prod-req="Chef station kit"]'))
    throw new Error("warehouse requirement leaked onto the production sheet");
});

await T("K-4 read-only, structurally: no writes occurred, no mutation affordance exists", async () => {
  await goto("full");
  const writes = await page.evaluate(() => window.__writes);
  if (writes !== 0) throw new Error(`writes: ${writes}`);
  const buttons = await page.$$eval("[data-production-sheet] button, [data-production-sheet] input, [data-production-sheet] select, [data-production-sheet] textarea", (xs) => xs.length);
  if (buttons !== 0) throw new Error(`${buttons} interactive controls on a verbs:[] lens`);
});

await T("K-5 empty is information: absent config, layer, and requirements each state themselves", async () => {
  await goto("empty");
  const missing = await page.textContent("[data-prod-missing-layer]");
  if (!missing.includes("nothing was copied at instantiation")) throw new Error(`missing: ${missing}`);
  if (await page.$("[data-prod-quantity]")) throw new Error("quantities rendered without config");
  if (await page.$("[data-prod-req]")) throw new Error("requirements rendered from nothing");
});

await T("K-6 layer content arrives via the registration's own sections (ownership chain)", async () => {
  await goto("full");
  const ids = await page.$$eval("[data-prod-section]", (xs) => xs.map((x) => x.getAttribute("data-prod-section")));
  for (const want of ["kitchen.staffing", "kitchen.requirements", "kitchen.equipment", "kitchen.notes"])
    if (!ids.includes(want)) throw new Error(`section '${want}' absent; got ${ids}`);
  const row = await page.textContent('[data-prod-section="kitchen.staffing"]');
  if (!row.includes("Sushi chef") || !row.includes("× 2") || !row.includes("for 180 guests"))
    throw new Error(`staffing row: ${row}`);
  const note = await page.textContent('[data-prod-section="kitchen.notes"] [data-prod-note]');
  if (!note.includes("Rice at dawn")) throw new Error(`note: ${note}`);
});

await T("K-7 evidence event carries the honesty band and reads as it was", async () => {
  await goto("evidence");
  const band = await page.textContent("[data-prod-honesty]");
  if (!band.includes("reads as it was")) throw new Error(`band: ${band}`);
});

await browser.close();
server.close();
console.log(`\naccept-production: ${passed} passed, ${failed} failed${variant ? "  (VARIANT — K-3 must FAIL or the suite has no teeth)" : ""}`);
process.exit(variant ? (failed > 0 ? 0 : 1) : (failed === 0 ? 0 : 1));
