// PL-1 ACCEPTANCE — the spine's observable law, real Chromium, real
// components (spine.harness.tsx). The claims:
//   value AND provenance  → S-1 (a legacy engagement shows its effective
//                           position WITH the legacy-derived chip; the
//                           display never collapses the two concepts)
//   ceremonial is plain   → S-2 (a ceremonially governed engagement shows
//                           no derived chip — provenance is legible both ways)
//   append-only, visible  → S-3 (history entries carry NO edit or delete
//                           affordance; honest emptiness renders as itself)
//   the guardrail         → S-4 (the decline door does NOT exist for a
//                           legacy-derived row — no bridge transitions)
//   ceremony fires once   → S-5 (decline arms, requires a reason, fires the
//                           door exactly once with that reason)
//   no implicit moves     → S-6 (ordinary interaction leaves the badge inert)
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-spine.mjs
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const server = createServer((req, res) => {
  const routes = { "/": ["spine.html", "text/html"],
    "/spine.harness.js": ["spine.harness.js", "text/javascript"],
    "/app.css": ["app.css", "text/css"] };
  const r = routes[req.url.split("?")[0]];
  if (!r) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": r[1] }); res.end(readFileSync(join(here, r[0])));
});
await new Promise((ok) => server.listen(4196, ok));
const browser = await chromium.launch();
const page = await browser.newPage();
let passed = 0, failed = 0;
const T = async (name, fn) => {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
};
const ceremonies = () => page.evaluate(() => window.__ceremonies);

await T("S-1 a legacy engagement shows value AND provenance: effective position Committed, the legacy-derived chip visible, ceremonial absence in the title", async () => {
  await page.goto("http://localhost:4196/?mode=legacy");
  await page.waitForSelector("[data-spine-badge]");
  const prov = await page.getAttribute("[data-spine-badge]", "data-spine-provenance");
  if (prov !== "legacy-derived") throw new Error(`provenance: ${prov}`);
  const text = await page.textContent("[data-spine-badge]");
  if (!text.includes("Committed")) throw new Error(`position: ${text}`);
  if (!(await page.$("[data-spine-derived-chip]"))) throw new Error("the derived chip is missing");
  const title = await page.getAttribute("[data-spine-badge]", "title");
  if (!title.includes("ceremonial spine state: absent")) throw new Error(`title: ${title}`);
});

await T("S-2 a ceremonially governed engagement renders plainly — no derived chip, ceremonial provenance", async () => {
  await page.goto("http://localhost:4196/?mode=ceremonial");
  await page.waitForSelector("[data-spine-badge]");
  const prov = await page.getAttribute("[data-spine-badge]", "data-spine-provenance");
  if (prov !== "ceremonial") throw new Error(`provenance: ${prov}`);
  if (await page.$("[data-spine-derived-chip]")) throw new Error("a ceremonial badge wears the derived chip");
});

await T("S-3 the history is append-only to the eye: entries render with zero edit/delete affordances; a legacy history is honestly empty", async () => {
  await page.goto("http://localhost:4196/?mode=ceremonial");
  await page.waitForSelector("[data-engagement-history]");
  const n = (await page.$$("[data-ledger-entry]")).length;
  if (n !== 2) throw new Error(`entries: ${n}`);
  const buttons = (await page.$$("[data-ledger-entry] button")).length
    + (await page.$$("[data-ledger-entry] input")).length;
  if (buttons !== 0) throw new Error(`an entry carries ${buttons} interactive affordance(s)`);
  await page.goto("http://localhost:4196/?mode=legacy");
  await page.waitForSelector("[data-history-empty]");
});

await T("S-4 THE GUARDRAIL: no decline door exists for a legacy-derived row — no bridge transitions", async () => {
  await page.goto("http://localhost:4196/?mode=legacy");
  await page.waitForSelector("[data-spine-badge]");
  if (await page.$("[data-ceremony-decline]")) throw new Error("a ceremony door is offered to a legacy row");
});

await T("S-5 decline arms, requires a reason, and fires the door exactly once with that reason", async () => {
  await page.goto("http://localhost:4196/?mode=ceremonial");
  await page.waitForSelector("[data-ceremony-decline]");
  await page.click("[data-ceremony-decline]");
  await page.waitForSelector("[data-decline-reason]");
  const disabledEmpty = await page.getAttribute("[data-decline-commit]", "disabled");
  if (disabledEmpty === null) throw new Error("commit enabled with an empty reason");
  await page.fill("[data-decline-reason]", "budget moved");
  await page.click("[data-decline-commit]");
  const c = await ceremonies();
  if (c.join(",") !== "decline:budget moved") throw new Error(`ceremonies: ${c}`);
});

await T("S-6 ordinary interaction leaves the badge inert — no implicit transitions exist", async () => {
  await page.goto("http://localhost:4196/?mode=ceremonial");
  await page.waitForSelector("[data-spine-badge]");
  const before = await page.textContent("[data-spine-badge]");
  await page.fill("[data-ordinary-edit]", "typing in an ordinary field");
  await page.waitForTimeout(120);
  const after = await page.textContent("[data-spine-badge]");
  if (before !== after) throw new Error(`the badge moved: ${before} → ${after}`);
  if ((await ceremonies()).length !== 0) throw new Error("ordinary edit fired a ceremony");
});

await browser.close(); server.close();
console.log(`\naccept-spine: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
