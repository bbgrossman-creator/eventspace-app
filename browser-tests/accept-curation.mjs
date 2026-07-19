// ═══ C-1..C-5 — Executive Curation ceremony against the real DefinitionView ═══
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync } from "fs";
const server = createServer((req, res) => {
  const m = { "/": "definition.html", "/definition.js": "definition.js", "/app.css": "app.css" }[req.url.split("?")[0]];
  if (!m) { res.writeHead(404); return res.end(); }
  res.writeHead(200); res.end(readFileSync("harness/" + m));
});
await new Promise((ok) => server.listen(4195, ok));
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 900, height: 900 } })).newPage();
let pass = 0, fail = 0;
const T = async (name, fn) => { try { await fn(); pass++; console.log(`PASS ${name}`); }
  catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); } };
const acts = () => page.evaluate(() => window.__mem.acts);

await T("C-1 staged-never-silent: edits stage, nothing persists, discard restores", async () => {
  await page.goto("http://localhost:4195/");
  await page.waitForSelector("[data-definition-view]");
  await page.click('[data-default-choice="presentation:acrylic"]');
  await page.click('[data-remove-item="Ginger"]');
  await page.waitForSelector("[data-stage]");
  const label = await page.textContent("[data-stage]");
  if (!label.includes("2 changes")) throw new Error(`stage label: ${label}`);
  if ((await acts()).length !== 0) throw new Error("persisted before confirm");
  await page.click("[data-stage]");
  const staged = await page.$$eval("[data-staged-change]", (xs) => xs.map((x) => x.textContent));
  if (!staged.some((s) => s.includes("black_slate → acrylic"))) throw new Error(`staged: ${staged}`);
  if (!staged.some((s) => s.includes("Ginger: removed"))) throw new Error(`staged: ${staged}`);
  await page.click("[data-discard]");
  if (await page.$("[data-stage]")) throw new Error("discard did not restore the live document");
  if ((await acts()).length !== 0) throw new Error("discard persisted something");
});

await T("C-2 confirm authors exactly one act: curation origin, note, COMPLETE document", async () => {
  await page.click('[data-default-choice="presentation:acrylic"]');
  await page.click("[data-stage]");
  await page.fill("[data-curation-note]", "Ownership decision: acrylic is the house look now");
  await page.click("[data-curation-confirm]");
  await page.waitForFunction(() => window.__mem.acts.length === 1);
  const a = (await acts())[0];
  if (a.origin !== "executive_curation") throw new Error(`origin: ${a.origin}`);
  if (a.citations && a.citations.length) throw new Error("curation carried citations");
  if (a.data.instanceDefaults.choices.presentation !== "acrylic") throw new Error("change missing from doc");
  if (!a.data.schemes.cocktail || a.data.defaultItems.length !== 2)
    throw new Error("document is not COMPLETE — unchanged homes were dropped");
  if (a.expectedLiveRevision !== "rev-live-18") throw new Error("staging target wrong");
});

await T("C-3 empty note blocks confirm, reason named", async () => {
  await page.goto("http://localhost:4195/");
  await page.waitForSelector("[data-definition-view]");
  await page.click('[data-default-choice="service:live_chef"]');
  await page.click("[data-stage]");
  const disabled = await page.locator("[data-curation-confirm]").isDisabled();
  if (!disabled) throw new Error("confirm enabled with empty note");
  if (!(await page.$("[data-note-required-hint]"))) throw new Error("reason not named");
});

await T("C-4 staging race surfaces REVISION_SUPERSEDED; nothing persisted", async () => {
  await page.goto("http://localhost:4195/?race=1");
  await page.waitForSelector("[data-definition-view]");
  await page.click('[data-default-choice="service:live_chef"]');
  await page.click("[data-stage]");
  await page.fill("[data-curation-note]", "will hit the race");
  await page.click("[data-curation-confirm]");
  await page.waitForSelector("[data-curation-error]");
  const err = await page.textContent("[data-curation-error]");
  if (!err.includes("REVISION_SUPERSEDED")) throw new Error(`error: ${err}`);
  if ((await acts()).length !== 0) throw new Error("refused act persisted");
});

await T("C-5 without knowledge.curate: read surface + history remain, zero edit affordances", async () => {
  await page.goto("http://localhost:4195/?cap=off");
  await page.waitForSelector("[data-definition-view]");
  if (!(await page.$('[data-def-section="defaults"]'))) throw new Error("read surface missing");
  if (!(await page.$('[data-ledger-origin="pre_ledger"]'))) throw new Error("pre-ledger history entry missing");
  const editors = await page.$$eval(
    "[data-add-option],[data-remove-option],[data-add-default-item],[data-remove-item],[data-scalar-default]",
    (xs) => xs.length);
  if (editors !== 0) throw new Error(`${editors} edit affordances visible`);
  await page.click('[data-default-choice="service:live_chef"]').catch(() => {});
  if (await page.$("[data-stage]")) throw new Error("read-only view staged a change");
});

console.log(fail === 0 ? `═══ ${pass}/${pass} PASSED ═══` : `═══ ${fail} FAILED of ${pass + fail} ═══`);
await b.close(); server.close(); process.exit(fail === 0 ? 0 : 1);
