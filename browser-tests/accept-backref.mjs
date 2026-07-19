// ═══════════════════════════════════════════════════════════════════════════
// v210 ACCEPTANCE — R-1: the back-reference (IMPLEMENTATION-004, final slice)
// Real Chromium, real mouse, same harness as accept-configure. The claim
// under proof: the informational line appears ONLY for promoted keys newer
// than the baseline, links to the act's note, and its absence changes
// nothing — no computation, no write, no divergence difference.
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-backref.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const server = createServer((req, res) => {
  const routes = {
    "/": ["configure.html", "text/html"],
    "/configure.js": ["configure.js", "text/javascript"],
    "/app.css": ["app.css", "text/css"],
  };
  const r = routes[req.url.split("?")[0]];
  if (!r) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": r[1] });
  res.end(readFileSync(join(here, r[0])));
});
await new Promise((ok) => server.listen(4186, ok));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1100, height: 800 } })).newPage();
let passed = 0, failed = 0;
const T = async (name, fn) => {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); }
};
const goto = async (mode) => {
  await page.goto(`http://localhost:4186/?mode=${mode}`);
  await page.waitForSelector("[data-configure-facet]");
};
const diverge = async () => {                       // service → live_chef (a promoted key)
  await page.click('[data-facet-toggle="service"]');
  await page.click('[data-service-choice="live_chef"]');
  await page.waitForFunction(() => /change/.test(document.querySelector("[data-divergence-chip]").textContent));
  await page.click("[data-divergence-chip]");
  await page.waitForSelector("[data-divergence-list]");
};

// ── R-1a: the line appears only for promoted keys ──
await T("R-1a line renders for the matching act only; pre-baseline and unrelated acts never render", async () => {
  await goto("backref");
  await diverge();
  await page.waitForSelector('[data-back-reference="act-goldberg"]');
  const txt = await page.textContent('[data-back-reference="act-goldberg"]');
  if (!/1 of these .* promoted|This change was promoted|were promoted/.test(txt))
    throw new Error(`back-reference text unexpected: ${txt}`);
  if (await page.$('[data-back-reference="act-old"]'))
    throw new Error("pre-baseline act rendered — 'newer than its baseline' violated");
  if (await page.$('[data-back-reference="act-unrelated"]'))
    throw new Error("act with no matched key rendered");
});

// ── R-1b: links to the act's note ──
await T("R-1b the line links to the act's note; the note is the act's own text", async () => {
  await goto("backref");
  await diverge();
  await page.waitForSelector('[data-back-reference="act-goldberg"]');
  await page.click('[data-back-reference="act-goldberg"] [data-back-reference-note]');
  await page.waitForSelector("[data-back-reference-note-text]");
  const note = await page.textContent("[data-back-reference-note-text]");
  if (!note.includes("Goldberg pattern is our standard")) throw new Error(`note text: ${note}`);
});

// ── R-1c: a reverted change stops matching — the diff wins over history ──
await T("R-1c reverting the promoted change removes the line (state-vs-baseline wins)", async () => {
  await goto("backref");
  await diverge();
  await page.waitForSelector('[data-back-reference="act-goldberg"]');
  await page.click('[data-service-choice="attended"]');          // revert
  await page.waitForFunction(() => !document.querySelector('[data-back-reference="act-goldberg"]'));
  // divergence gone with it — nothing lingers from an informational read
  const chip = await page.textContent("[data-divergence-chip]");
  if (!/no changes/.test(chip)) throw new Error(`chip after revert: ${chip}`);
});

// ── R-1d: absence changes nothing ──
await T("R-1d without acts the panel is byte-identical in its diff lines; no back-reference exists; no write occurred", async () => {
  await goto("backref");
  await diverge();
  const withRefs = await page.$$eval("[data-diff-line]", (xs) => xs.map((x) => x.textContent));
  const persistedWith = await page.evaluate(() => window.__persisted.length);

  await goto("instantiated");                                    // same state, NO acts fixture
  await diverge();
  const without = await page.$$eval("[data-diff-line]", (xs) => xs.map((x) => x.textContent));
  if (JSON.stringify(withRefs) !== JSON.stringify(without))
    throw new Error(`diff lines differ with/without acts:\n  ${withRefs}\n  ${without}`);
  if (await page.$("[data-back-reference]")) throw new Error("back-reference rendered with no acts");
  const persistedWithout = await page.evaluate(() => window.__persisted.length);
  if (persistedWith !== persistedWithout)
    throw new Error("persistence count differs — the back-reference is not read-only");
});

await browser.close();
server.close();
console.log(`\naccept-backref: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
