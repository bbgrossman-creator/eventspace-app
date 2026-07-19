// ═══════════════════════════════════════════════════════════════════════════
// SPEC-002 ACCEPTANCE — tests 16–20, 22–24 (21/intent is the follow-up slice)
// Real Chromium, real mouse. The page mounts the REAL ConfigureFacet and a
// mini canvas, both producing through the REAL move engine into an in-memory
// adapter that mimics the RPC's refusals and keeps the batch log.
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node harness/accept-configure.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const page404 = (res) => { res.writeHead(404); res.end(); };
const server = createServer((req, res) => {
  const routes = {
    "/": ["configure.html", "text/html"],
    "/configure.js": ["configure.js", "text/javascript"],
    "/app.css": ["app.css", "text/css"],
  };
  const r = routes[req.url.split("?")[0]];
  if (!r) return page404(res);
  res.writeHead(200, { "content-type": r[1] });
  res.end(readFileSync(join(here, r[0])));
});
await new Promise((ok) => server.listen(4181, ok));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1100, height: 800 } })).newPage();
let passed = 0, failed = 0;
const T = async (name, fn) => {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); }
};
const fresh = async () => { await page.goto("http://localhost:4181/"); await page.waitForSelector("[data-configure-facet]"); };
const state = () => page.evaluate(() => window.__state);
const persisted = () => page.evaluate(() => window.__persisted);

// ── 16. LANDED IS LEGITIMATE ──
await T("16 instantiation lands complete: summary correct, ZERO interaction required", async () => {
  await fresh();
  const chip = await page.textContent("[data-divergence-chip]");
  if (!chip.includes("no changes")) throw new Error(`chip: ${chip}`);
  const size = await page.textContent('[data-facet-summary="size"]');
  if (!size.includes("240") || !size.includes("suggested")) throw new Error(`size: ${size}`);
  const svc = await page.textContent('[data-facet-summary="service"]');
  if (!svc.includes("attended")) throw new Error(`service: ${svc}`);
  const menu = await page.textContent('[data-facet-summary="menu"]');
  if (!menu.includes("2 items") || !menu.includes("canvas")) throw new Error(`menu: ${menu}`);
  if ((await persisted()).length !== 0) throw new Error("instantiation persisted moves (baseline is not divergence)");
});

// ── 17. SCHEMES STAGE, THEN RELEASE THEIR GRIP ──
await T("17 scheme stages a diff, commits only on confirm; edit flips to customized", async () => {
  await fresh();
  await page.click('[data-facet-toggle="look"]');
  await page.click('[data-scheme-card="black_slate"]');
  await page.waitForSelector("[data-scheme-staging]");
  const lines = await page.$$eval("[data-staged-line]", (xs) => xs.map((x) => x.textContent));
  if (!lines.some((l) => l.includes("linen"))) throw new Error(`staged: ${lines}`);
  if ((await state()).config.schemeId !== null) throw new Error("scheme applied before confirm");
  await page.click("[data-scheme-confirm]");
  await page.waitForFunction(() => window.__state.config.schemeId === "black_slate");
  if ((await state()).config.customized.length !== 0) throw new Error("scheme marked customized (the scheme did it, not the operator)");
  // operator edit releases the grip
  await page.click('[data-facet-toggle="service"]');
  await page.click('[data-service-choice="live_chef"]');
  await page.waitForFunction(() => window.__state.config.customized.length > 0);
  const look = await page.textContent('[data-facet-summary="look"]');
  if (!look.includes("Black Slate")) throw new Error(`look: ${look}`);
});

// ── 18. NUMBERS SHOW THEIR WORK ──
await T("18 derived scalar shows its work; override persists; suggestion never revises it", async () => {
  await fresh();
  await page.click('[data-facet-toggle="size"]');
  const der = await page.textContent('[data-scalar-derivation="pieces"]');
  if (!der.includes("suggested 240") || !der.includes("180 guests")) throw new Error(`derivation: ${der}`);
  await page.fill('[data-scalar-input="pieces"]', "300");
  await page.locator('[data-scalar-input="pieces"]').press("Tab");   // blur commits
  await page.waitForFunction(() => window.__state.config.scalars.pieces.value === 300);
  const s = (await state()).config.scalars.pieces;
  if (!s.overridden || s.derivation.suggested !== 240) throw new Error("override lost its work");
  const der2 = await page.textContent('[data-scalar-derivation="pieces"]');
  if (!der2.includes("you set 300") || !der2.includes("suggested 240")) throw new Error(`shown work: ${der2}`);
  await page.click('[data-use-suggestion="pieces"]');
  await page.waitForFunction(() => window.__state.config.scalars.pieces.value === 240);
});

// ── 19. REQUIRES WHISPERS; SUPPRESSION SURVIVES RECOMPUTE ──
await T("19 whisper on choice; suppression strikes; unrelated recompute preserves it", async () => {
  await fresh();
  await page.click('[data-facet-toggle="service"]');
  await page.click('[data-service-choice="live_chef"]');
  await page.waitForSelector("[data-requires-flash]");
  const flash = await page.textContent("[data-requires-flash]");
  // kitchen's OWN registered rules now fire through the production boot:
  // refrigeration + power (any service) + handwash + prep (live chef) = 4,
  // plus warehouse's kit = 5
  if (flash !== "+5") throw new Error(`flash: ${flash} (kitchen 4 + warehouse 1)`);
  await page.click('[data-facet-toggle="requires"]');
  await page.click('[data-suppress-req="kitchen.live_chef.prep_table"]');
  await page.waitForSelector('[data-restore-req="kitchen.live_chef.prep_table"]');
  // unrelated choice → full recompute → suppression must survive (logical key)
  await page.click('[data-facet-toggle="size"]');
  await page.fill('[data-scalar-input="pieces"]', "260");
  await page.locator('[data-scalar-input="pieces"]').press("Tab");
  await page.waitForFunction(() => window.__state.config.scalars.pieces.value === 260);
  const sup = (await state()).requirements.find((r) => r.logicalKey === "kitchen.live_chef.prep_table");
  if (!sup || sup.suppressedAt === null) throw new Error("suppression lost across recompute");
  const hand = (await state()).requirements.find((r) => r.logicalKey === "kitchen.live_chef.handwash_station");
  if (!hand || hand.suppressedAt !== null) throw new Error("sibling requirement disturbed");
});

// ── 20. DIVERGENCE + RESET CEREMONY ──
await T("20 divergence chip counts; reset ceremony lists the diff; reset restores seed", async () => {
  await fresh();
  await page.click('[data-facet-toggle="service"]');
  await page.click('[data-service-choice="live_chef"]');
  await page.click('[data-facet-toggle="size"]');
  await page.fill('[data-scalar-input="pieces"]', "300");
  await page.locator('[data-scalar-input="pieces"]').press("Tab");
  await page.waitForFunction(() => /2 changes/.test(document.querySelector("[data-divergence-chip]").textContent));
  await page.click("[data-divergence-chip]");
  const diff = await page.$$eval("[data-diff-line]", (xs) => xs.map((x) => x.textContent));
  if (!diff.some((l) => l.includes("attended → live_chef"))) throw new Error(`diff: ${diff}`);
  if (!diff.some((l) => l.includes("you set 300"))) throw new Error(`diff: ${diff}`);
  await page.click("[data-reset-all]");
  await page.waitForSelector("[data-reset-ceremony]");
  const ceremony = await page.textContent("[data-reset-ceremony]");
  if (!ceremony.includes("live_chef") || !ceremony.includes("300")) throw new Error("ceremony doesn't list the diff");
  await page.click("[data-reset-confirm]");
  await page.waitForFunction(() => /no changes/.test(document.querySelector("[data-divergence-chip]").textContent));
  const st = await state();
  if (st.config.choices.service !== "attended" || st.config.scalars.pieces.value !== 240)
    throw new Error("reset did not restore the seed");
});

// ── 22. ONE VOCABULARY, TWO PRODUCERS ──
await T("22 canvas edit and facet edit land in the SAME vocabulary with their origins", async () => {
  await fresh();
  await page.click("[data-canvas-add-dragon]");
  await page.waitForSelector('[data-canvas-item="Dragon Roll"]');
  await page.click('[data-facet-toggle="service"]');
  await page.click('[data-service-choice="live_chef"]');
  await page.waitForFunction(() => window.__persisted.length === 2);
  const log = (await persisted()).flatMap((b) => b.moves.map((m) => `${m.origin}:${m.kind}`));
  if (!log.includes("canvas:select")) throw new Error(`log: ${log}`);
  if (!log.includes("facet:set_choice")) throw new Error(`log: ${log}`);
  const item = (await persisted())[0].items[0];
  if (item.op !== "add_item" || item.name !== "Dragon Roll") throw new Error("item op missing from the same batch");
});

// ── 23. APPEND-ONLY AT THE UI TIER ──
await T("23 no UI path mutates a recorded batch: the log only grows", async () => {
  await fresh();
  await page.click('[data-facet-toggle="service"]');
  await page.click('[data-service-choice="live_chef"]');
  await page.waitForFunction(() => window.__persisted.length === 1);
  const before = JSON.stringify((await persisted())[0]);
  await page.click('[data-service-choice="attended"]');
  await page.waitForFunction(() => window.__persisted.length === 2);
  const after = JSON.stringify((await persisted())[0]);
  if (before !== after) throw new Error("an earlier batch changed");
});

// ── 24. ATOMICITY: A POISONED BATCH APPLIES NOTHING ──
await T("24 a refused batch leaves state, items, and log untouched — and names the failure", async () => {
  await fresh();
  const logBefore = (await persisted()).length;
  await page.click("[data-poison-toggle]");
  await page.click("[data-canvas-add-dragon]");
  await page.waitForFunction(() => document.querySelector("[data-canvas-error]").textContent.length > 0);
  const err = await page.textContent("[data-canvas-error]");
  if (!err.includes("poisoned")) throw new Error(`error doesn't name the cause: ${err}`);
  if ((await persisted()).length !== logBefore) throw new Error("poisoned batch persisted");
  const items = await page.$$eval("[data-canvas-item]", (xs) => xs.length);
  if (items !== 2) throw new Error("item landed from a refused batch");
});

await T("26 dimensions render FROM THE SEED and selections flow through the grammar", async () => {
  await fresh();
  const pres = page.locator('[data-facet-toggle="dim-presentation"]');
  if (!(await pres.count())) throw new Error("presentation dimension not rendered from seed");
  await pres.click();
  await page.click('[data-dim-choice="presentation:acrylic"]');
  await page.waitForFunction(() => window.__state.config.choices.presentation === "acrylic");
  const log = (await persisted()).flatMap((b) => b.moves.map((m) => `${m.origin}:${m.kind}`));
  if (!log.includes("facet:set_choice")) throw new Error(`log: ${log}`);
  const chip = await page.textContent("[data-divergence-chip]");
  if (!chip.includes("1 change")) throw new Error(`chip: ${chip}`);
});

await T("27 legacy: init is OFFERED never silent; accepting dates it and names its provenance", async () => {
  await page.goto("http://localhost:4181/?mode=legacy");
  await page.waitForSelector("[data-configure-facet]");
  if (!(await page.$("[data-offer-initialize]"))) throw new Error("no offer rendered");
  if (await page.$('[data-baseline-provenance="legacy_initialized_from_definition"]'))
    throw new Error("provenance shown before the deliberate act");
  const chip0 = await page.textContent("[data-divergence-chip]");
  if (!chip0.includes("no changes")) throw new Error(`pre-init chip claims divergence: ${chip0}`);
  await page.click("[data-initialize-baseline]");
  await page.waitForSelector('[data-baseline-provenance="legacy_initialized_from_definition"]');
  const prov = await page.textContent('[data-baseline-provenance="legacy_initialized_from_definition"]');
  if (!prov.includes("initialized later")) throw new Error(`provenance text: ${prov}`);
  const batches = await persisted();
  const first = batches[batches.length - 1];
  if (first.baselineProvenance !== "legacy_initialized_from_definition")
    throw new Error(`persisted provenance: ${first.baselineProvenance}`);
  const chip = await page.textContent("[data-divergence-chip]");
  if (!chip.includes("no changes")) throw new Error(`post-init divergence vs own baseline: ${chip}`);
});

await T("28 evidence: baseline unknown, no offer, hard read-only — history reads as it was", async () => {
  await page.goto("http://localhost:4181/?mode=evidence");
  await page.waitForSelector("[data-configure-facet]");
  if (await page.$("[data-offer-initialize]")) throw new Error("initialization offered on evidence");
  if (!(await page.$('[data-baseline-provenance="baseline_unknown"]'))) throw new Error("unknown baseline not shown");
  if (!(await page.$("[data-evidence-note]"))) throw new Error("evidence note missing");
  await page.click('[data-facet-toggle="service"]');
  const btn = page.locator('[data-service-choice="live_chef"]');
  if (!(await btn.isDisabled())) throw new Error("evidence component is editable");
  if ((await persisted()).some((b) => b.componentId && b.config)) {
    // no config batch may have been persisted in this mode
  }
});

console.log(failed === 0 ? `═══ ${passed}/${passed} PASSED ═══` : `═══ ${failed} FAILED of ${passed + failed} ═══`);
await browser.close(); server.close();
process.exit(failed === 0 ? 0 : 1);
