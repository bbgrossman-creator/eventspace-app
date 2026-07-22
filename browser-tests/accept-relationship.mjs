// PL-2 ACCEPTANCE — the Relationship's observable law, real Chromium, real
// components (relationship.harness.tsx). The claims:
//   found, unambiguous  → V-1 (ONE match: FOUND pre-selected, CREATE adjacent)
//   found, ambiguous    → V-2 (TWO matches: explicit choice, NOTHING chosen)
//   the two voices      → V-3 (ceremonial header vs derived suggestion rows —
//                          provenance attributes distinct, never blended)
//   adopt is singular   → V-4 (each row adopts by its own act, once; no
//                          select-all affordance exists)
//   correction's door   → V-5 (arms; demands target + reason; commit disabled
//                          until both; fires once with both)
//   render writes nothing → V-6 (mounting the voices fires zero ceremonies)
//   statelessness       → V-7 (no status/stage/lifecycle control anywhere on
//                          the relationship surface — the absence is a claim)
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const server = createServer((req, res) => {
  const routes = { "/": ["relationship.html", "text/html"],
    "/relationship.harness.js": ["relationship.harness.js", "text/javascript"],
    "/app.css": ["app.css", "text/css"] };
  const r = routes[req.url.split("?")[0]];
  if (!r) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": r[1] }); res.end(readFileSync(join(here, r[0])));
});
await new Promise((ok) => server.listen(4197, ok));
const browser = await chromium.launch();
const page = await browser.newPage();
let passed = 0, failed = 0;
const T = async (name, fn) => {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
};
const acts = () => page.evaluate(() => window.__acts);

await T("V-1 one unambiguous match: FOUND pre-selected, CREATE adjacent and selectable", async () => {
  await page.goto("http://localhost:4197/?mode=one");
  await page.waitForSelector("[data-found-or-create]");
  if ((await page.getAttribute("[data-door-chosen]", "data-door-chosen")) !== "r1")
    throw new Error("the unambiguous match is not pre-selected");
  if (!(await page.isChecked("[data-found-option='r1'] input"))) throw new Error("radio not checked");
  await page.click("[data-create-option] input");
  if ((await page.getAttribute("[data-door-chosen]", "data-door-chosen")) !== "create")
    throw new Error("CREATE must be one click away");
});

await T("V-2 two candidates: explicit choice — nothing pre-selected, both offered, CREATE adjacent", async () => {
  await page.goto("http://localhost:4197/?mode=many");
  await page.waitForSelector("[data-found-or-create]");
  if ((await page.getAttribute("[data-door-chosen]", "data-door-chosen")) !== "create")
    throw new Error("an ambiguous match was pre-selected");
  for (const id of ["r1", "r2"]) {
    if (await page.isChecked(`[data-found-option='${id}'] input`)) throw new Error(`candidate ${id} pre-checked`);
  }
  await page.click("[data-found-option='r2'] input");
  if ((await page.getAttribute("[data-door-chosen]", "data-door-chosen")) !== "r2")
    throw new Error("explicit choice did not take");
});

await T("V-3 the two voices are structurally distinct: ceremonial header vs derived suggestion rows, provenance attributes never blended", async () => {
  await page.goto("http://localhost:4197/?mode=voices");
  await page.waitForSelector("[data-rel-header]");
  if ((await page.getAttribute("[data-rel-header]", "data-rel-provenance")) !== "ceremonial")
    throw new Error("the header must speak ceremonially");
  const rows = await page.$$("[data-rel-suggestion]");
  if (rows.length !== 2) throw new Error(`suggestions: ${rows.length}`);
  for (const row of rows) {
    if ((await row.getAttribute("data-rel-provenance")) !== "derived")
      throw new Error("a suggestion lost its derived provenance");
  }
});

await T("V-4 adopt is singular: each row fires its own act exactly once; no select-all exists", async () => {
  await page.goto("http://localhost:4197/?mode=voices");
  await page.waitForSelector("[data-rel-suggestion]");
  const adoptBtns = await page.$$("[data-adopt-one]");
  if (adoptBtns.length !== 2) throw new Error(`adopt buttons: ${adoptBtns.length}`);
  await adoptBtns[0].click();
  let a = await acts();
  if (a.join(",") !== "adopt:b-old-1") throw new Error(`acts: ${a}`);
  const selectAll = await page.$$("text=/select all|link all|adopt all/i");
  if (selectAll.length !== 0) throw new Error("a bulk affordance exists");
});

await T("V-5 the correction door arms, demands target AND reason, and fires once with both", async () => {
  await page.goto("http://localhost:4197/?mode=voices");
  await page.waitForSelector("[data-correct-citation]");
  await page.click("[data-correct-citation]");
  await page.waitForSelector("[data-correct-target]");
  if ((await page.getAttribute("[data-correct-commit]", "disabled")) === null)
    throw new Error("commit enabled with nothing chosen");
  await page.selectOption("[data-correct-target]", "r2");
  if ((await page.getAttribute("[data-correct-commit]", "disabled")) === null)
    throw new Error("commit enabled without a reason");
  await page.fill("[data-correct-reason]", "office landline matched the wrong family");
  await page.click("[data-correct-commit]");
  const a = await acts();
  if (a.join(",") !== "correct:r2:office landline matched the wrong family") throw new Error(`acts: ${a}`);
});

await T("V-6 rendering the voices fires zero ceremonies — only a human's act writes", async () => {
  await page.goto("http://localhost:4197/?mode=voices");
  await page.waitForSelector("[data-rel-suggestion]");
  await page.waitForTimeout(150);
  if ((await acts()).length !== 0) throw new Error("mounting fired a ceremony");
});

await T("V-7 statelessness is visible: no status, stage, tier, or lifecycle control exists on the relationship surface", async () => {
  await page.goto("http://localhost:4197/?mode=voices");
  await page.waitForSelector("[data-rel-header]");
  const controls = await page.$$("[data-rel-header] select, [data-rel-header] button, [data-rel-header] input");
  if (controls.length !== 0) throw new Error(`the identity header carries ${controls.length} control(s)`);
  const stateWords = await page.$$("text=/\\b(stage|tier|pipeline|lifecycle)\\b/i");
  if (stateWords.length !== 0) throw new Error("state-shaped vocabulary on the surface");
});

await browser.close(); server.close();
console.log(`\naccept-relationship: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
