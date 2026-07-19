// ═══ P-1..P-7 — the Promotion ceremony, real Chromium ═══════════════════════
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync } from "fs";
const server = createServer((req, res) => {
  const m = { "/": "promotion.html", "/promotion.js": "promotion.js", "/app.css": "app.css" }[req.url.split("?")[0]];
  if (!m) { res.writeHead(404); return res.end(); }
  res.writeHead(200); res.end(readFileSync("harness/" + m));
});
await new Promise((ok) => server.listen(4197, ok));
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 900, height: 1000 } })).newPage();
let pass = 0, fail = 0;
const T = async (name, fn) => { try { await fn(); pass++; console.log(`PASS ${name}`); }
  catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); } };
const fresh = async () => { await page.goto("http://localhost:4197/"); await page.waitForSelector("[data-promotion-review]"); };
const acts = () => page.evaluate(() => window.__mem.acts);

await T("P-1 lines carry frozen-baseline provenance; evidence events marked read-only", async () => {
  await fresh();
  const badges = await page.$$eval("[data-evidence-badge]", (xs) => xs.length);
  if (badges < 4) throw new Error(`evidence badges: ${badges}`);
  const prov = await page.$$eval('[data-line-baseline="instantiation_stamp"]', (xs) => xs.length);
  if (prov < 5) throw new Error(`stamped provenance labels: ${prov}`);
  const f = await page.textContent('[data-frequency="choice:presentation"]');
  if (!f.includes("2 of 9")) throw new Error(`frequency: ${f} (acrylic appears in 2 of 9 events)`);
});

await T("P-2 nothing pre-checked; staging disabled at zero selections", async () => {
  await fresh();
  const checked = await page.$$eval("[data-select-line]:checked", (xs) => xs.length);
  if (checked !== 0) throw new Error(`${checked} pre-checked`);
  if (!(await page.locator("[data-open-staging]").isDisabled())) throw new Error("staging enabled with zero lines");
});

await T("P-3 checked lines land where labeled; unchecked lines absent from the staged document", async () => {
  await fresh();
  await page.click('[data-select-line="0"]');   // acrylic (Goldberg)
  await page.click('[data-select-line="1"]');   // Dragon Roll
  await page.click('[data-select-line="2"]');   // remove Ginger
  const lands = await page.textContent('[data-where-lands="choice:presentation"]');
  if (!lands.includes("default presentation")) throw new Error(`where-lands: ${lands}`);
  await page.click("[data-open-staging]");
  const staged = await page.$$eval("[data-staged-change]", (xs) => xs.map((x) => x.textContent));
  if (!staged.some((s) => s.includes("black_slate → acrylic"))) throw new Error(`staged: ${staged}`);
  if (!staged.some((s) => s.includes("Dragon Roll: added"))) throw new Error(`staged: ${staged}`);
  if (!staged.some((s) => s.includes("Ginger: removed"))) throw new Error(`staged: ${staged}`);
  if (staged.some((s) => s.includes("pieces_per_person"))) throw new Error("UNSELECTED scalar leaked into the staged document");
});

await T("P-4 an incoherent selection blocks staging with the finding named", async () => {
  await fresh();
  await page.click('[data-select-line="6"]');   // boat_display — outside options
  await page.waitForSelector("[data-coherence-findings]");
  const f = await page.textContent("[data-coherence-finding]");
  if (!f.includes("boat_display") || !f.includes("not among its options")) throw new Error(`finding: ${f}`);
  if (!(await page.locator("[data-open-staging]").isDisabled())) throw new Error("staging enabled despite findings");
});

await T("P-5 confirm lands ONE act: promotion origin, note, per-line citations with values", async () => {
  await fresh();
  await page.click('[data-select-line="0"]');
  await page.click('[data-select-line="2"]');
  await page.click("[data-open-staging]");
  await page.fill("[data-promotion-note]", "Season review: the Goldberg pattern is our standard now");
  await page.click("[data-promotion-confirm]");
  await page.waitForFunction(() => window.__mem.acts.length === 1);
  const a = (await acts())[0];
  if (a.origin !== "promotion") throw new Error(`origin: ${a.origin}`);
  if (a.citations.length !== 2) throw new Error(`citations: ${a.citations.length}`);
  const c = a.citations.find((x) => x.dimension_key === "choice:presentation");
  if (c.from_value !== "black_slate" || c.to_value !== "acrylic") throw new Error("citation values wrong");
  if (c.baseline_kind !== "instantiation_stamp" || c.baseline_revision !== "rev-18")
    throw new Error("citation baseline provenance wrong");
  if (a.data.instanceDefaults.choices.presentation !== "acrylic") throw new Error("composed doc wrong");
  if (a.data.defaultItems.some((i) => i.name === "Ginger")) throw new Error("Ginger survived removal");
});

await T("P-6 stillness at the pixel tier: the source event is byte-identical after promotion", async () => {
  const [before, after] = await page.evaluate(() => [
    JSON.stringify(window.__goldberg), JSON.stringify(window.__goldbergLive)]);
  if (before !== after) throw new Error("the Goldberg Wedding moved");
});

await T("P-7 §0a: the no-item-baseline line renders honestly and cites its kind", async () => {
  await fresh();
  const lbl = await page.textContent('[data-line-baseline="no_item_baseline"]');
  if (!lbl.includes("no item baseline")) throw new Error(`label: ${lbl}`);
  await page.click('[data-select-line="5"]');
  await page.click("[data-open-staging]");
  await page.fill("[data-promotion-note]", "Adopting the Klein selection");
  await page.click("[data-promotion-confirm]");
  await page.waitForFunction(() => window.__mem.acts.length === 1);
  const c = (await acts())[0].citations[0];
  if (c.baseline_kind !== "no_item_baseline") throw new Error(`cited kind: ${c.baseline_kind} — the chain must never overstate the comparison`);
});

await T("S-1 framing: the same choice lines land as defaults OR as a named scheme — never both", async () => {
  await fresh();
  await page.click('[data-select-line="0"]');   // acrylic (Goldberg)
  await page.click('[data-select-line="4"]');   // acrylic (Stein) — 2 choice lines
  await page.waitForSelector("[data-framing]");
  await page.click("[data-framing-scheme]");
  if (!(await page.locator("[data-open-staging]").isDisabled())) throw new Error("staging enabled without a scheme name");
  await page.fill("[data-scheme-label]", "Modern Display");
  await page.click("[data-open-staging]");
  const staged = await page.$$eval("[data-staged-change]", (xs) => xs.map((x) => x.textContent));
  if (!staged.some((s) => s.includes("scheme Modern Display: added"))) throw new Error(`staged: ${staged}`);
  if (staged.some((s) => s.includes("black_slate → acrylic"))) throw new Error("default ALSO changed under scheme framing");
  await page.fill("[data-promotion-note]", "The Goldberg look, offered as a scheme");
  await page.click("[data-promotion-confirm]");
  await page.waitForFunction(() => window.__mem.acts.length === 1);
  const a = (await acts())[0];
  if (a.data.schemes.modern_display.sets.choices.presentation !== "acrylic") throw new Error("scheme missing from doc");
  if (a.data.instanceDefaults.choices.presentation !== "black_slate") throw new Error("default moved under scheme framing");
  if (a.sessionKey !== "season-review-feb-2027") throw new Error(`session: ${a.sessionKey}`);
});

await T("S-2 formalization is deliberate: blocked by name until the operator formalizes in-act", async () => {
  await fresh();
  await page.click('[data-select-line="6"]');   // boat_display
  await page.waitForSelector("[data-coherence-findings]");
  await page.click('[data-formalize="6"]');
  await page.waitForFunction(() => !document.querySelector("[data-coherence-findings]"));
  const lands = await page.textContent('[data-where-lands="choice:presentation"]');
  if (!lands.includes("and a new option")) throw new Error(`where-lands: ${lands}`);
  await page.click("[data-open-staging]");
  await page.fill("[data-promotion-note]", "Boat display formalized");
  await page.click("[data-promotion-confirm]");
  await page.waitForFunction(() => window.__mem.acts.length === 1);
  const d = (await acts())[0].data;
  if (!d.dimensions.presentation.options.includes("boat_display")) throw new Error("option not formalized");
  if (d.instanceDefaults.choices.presentation !== "boat_display") throw new Error("default not set");
});

await T("S-3 a layer line composes into p_layers; a layer-only selection sends data:null (F-2)", async () => {
  await fresh();
  await page.click('[data-select-line="7"]');   // the kitchen layer line
  const lands = await page.textContent('[data-where-lands="layer:kitchen"]');
  if (!lands.includes("revises the kitchen layer")) throw new Error(`where-lands: ${lands}`);
  await page.click("[data-open-staging]");
  const lp = await page.textContent('[data-staged-layer="kitchen"]');
  if (!lp.includes("kitchen layer: revised")) throw new Error(`staged layer: ${lp}`);
  await page.fill("[data-promotion-note]", "Chef+runner staffing promoted");
  await page.click("[data-promotion-confirm]");
  await page.waitForFunction(() => window.__mem.acts.length === 1);
  const a = (await acts())[0];
  if (a.data !== null) throw new Error("layer-only act carried a config document (no-op churn)");
  if (a.layers.length !== 1 || a.layers[0].layer_key !== "kitchen"
      || a.layers[0].expected_live !== "lrev-18") throw new Error(`layers: ${JSON.stringify(a.layers)}`);
  if (a.layers[0].data.staffing[0] !== "1 chef") throw new Error("layer content wrong");
  if (a.citations.length !== 1 || a.citations[0].dimension_key !== "layer:kitchen")
    throw new Error("layer citation missing");
});

console.log(fail === 0 ? `═══ ${pass}/${pass} PASSED ═══` : `═══ ${fail} FAILED of ${pass + fail} ═══`);
await b.close(); server.close(); process.exit(fail === 0 ? 0 : 1);
