// ═══════════════════════════════════════════════════════════════════════════
// v219 ACCEPTANCE — THE ADVERTISING RULE (STUDIO_COMPOSITION §14), real
// Chromium over the REAL DesignStage + Inspector + Drawer
// (lifecycle.harness.tsx). Click affordances are in scope here; real-mouse
// DRAGS stay quarantined to the v197 suites.
//   C-1 the Proposal advertises ＋ moment (tail) — fires the host once
//       [THE VARIANT'S TARGET: a Stage with the affordance stripped — the
//        "everything is a component" lie, restored — must fail here]
//   C-2 a moment's head advertises its lifecycle: hover ⋯ → remove fires
//       with the moment's id; the menu closes
//   C-3 move earlier / move later fire with direction
//   C-4 read-only advertises NOTHING: no ＋ moment, no ⋯, no + component
//   C-5 the other rungs advertise in place: + component on the moment,
//       + item within the component (pre-existing affordances, now claims)
//   C-6 the object's Drawer advertises removal: component fires
//       remove:component and the drawer closes with it; item likewise
// Run:       PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-lifecycle.mjs
// Regression: node browser-tests/accept-lifecycle.mjs --variant  (expects C-1 FAIL)
// Variant build (patched Stage WITHOUT the ＋ moment affordance):
//   mkdir -p src/components/studio/renderers/__variant__
//   python3 - <<'PY'
//   s = open("src/components/studio/renderers/DesignStage.tsx").read()
//   s = s.replace('{p.onAddChapter && p.mayEdit && !live && (', '{false && p.onAddChapter && p.mayEdit && !live && (')
//   s = s.replace('{p.onAddChapter && p.mayEdit && (', '{false && p.onAddChapter && p.mayEdit && (')
//   s = s.replace('from "@/lib/dragGrammar"', 'from "@/lib/dragGrammar"')
//   open("src/components/studio/renderers/__variant__/DesignStage.mute.tsx","w").write(s)
//   PY
//   npx esbuild browser-tests/lifecycle.harness.tsx --bundle --outfile=browser-tests/lifecycle.variant.js \
//     --jsx=automatic --define:process.env.NODE_ENV='"development"' \
//     --alias:@/components/studio/renderers/DesignStage=./src/components/studio/renderers/__variant__/DesignStage.mute.tsx \
//     --alias:@=./src
// Main build: same minus the variant alias → lifecycle.harness.js.
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const variant = process.argv.includes("--variant");
const variantGenesis = process.argv.includes("--variant-genesis");
const variantPicker = process.argv.includes("--variant-picker");
const variantThread = process.argv.includes("--variant-thread");
const variantBrand = process.argv.includes("--variant-brand");
const js = variant ? "lifecycle.variant.js" : variantGenesis ? "lifecycle.genesis-variant.js"
  : variantPicker ? "lifecycle.picker-variant.js" : variantThread ? "lifecycle.thread-variant.js"
  : variantBrand ? "lifecycle.brand-variant.js" : "lifecycle.harness.js";
const server = createServer((req, res) => {
  const routes = { "/": ["lifecycle.html", "text/html"],
    "/lifecycle.harness.js": [js, "text/javascript"],
    "/app.css": ["app.css", "text/css"] };
  const r = routes[req.url.split("?")[0]];
  if (!r) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": r[1] }); res.end(readFileSync(join(here, r[0])));
});
await new Promise((ok) => server.listen(4195, ok));
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
let passed = 0, failed = 0;
const T = async (name, fn) => { try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); } };
const adverts = () => page.evaluate(() => window.__adverts);
const absent = async (sel, why) => { if (await page.$(sel)) throw new Error(why); };

await T("C-1 the Proposal advertises ＋ moment; the host hears it once", async () => {
  await page.goto("http://localhost:4195/");
  await page.waitForSelector("[data-paper]");
  await page.waitForSelector("[data-add-moment]");
  await page.click("[data-add-moment]");
  const a = await adverts();
  if (a.join(",") !== "add-moment") throw new Error(`adverts: ${a}`);
});
await T("C-2 a moment's head advertises its lifecycle: ⋯ → remove, with the moment's id", async () => {
  // Dinner rests COLLAPSED (v221) — the ⋯ lives on the collapsed row too,
  // because removal must be discoverable without expanding first.
  await page.click("[data-chapter-menu-btn='ch-dinner']");
  await page.waitForSelector("[data-chapter-menu]");
  await page.click("[data-chapter-act='remove']");
  await absent("[data-chapter-menu]", "menu survived the choice");
  const a = await adverts();
  if (a[a.length - 1] !== "chapter:remove:ch-dinner") throw new Error(`adverts: ${a}`);
});
await T("C-3 reorder advertised the same way: earlier and later, with direction", async () => {
  await page.hover("h3:has-text('Cocktail Hour')");
  await page.click("[data-chapter-menu-btn='ch-cocktail']");
  await page.click("[data-chapter-act='down']");
  await page.click("[data-chapter-menu-btn='ch-cocktail']");
  await page.click("[data-chapter-act='up']");
  const a = await adverts();
  if (a[a.length - 2] !== "chapter:down:ch-cocktail" || a[a.length - 1] !== "chapter:up:ch-cocktail")
    throw new Error(`adverts: ${a}`);
});
await T("C-4 read-only advertises NOTHING", async () => {
  await page.goto("http://localhost:4195/?mode=readonly");
  await page.waitForSelector("[data-paper]");
  await absent("[data-add-moment]", "＋ section on a read-only paper");
  await absent("[data-chapter-menu-btn='ch-cocktail']", "a lifecycle menu on a read-only paper");
  await absent("[data-component-menu-btn='comp-sushi']", "a component ⋯ on a read-only paper");
  await absent("[data-item-remove='it-nigiri']", "an item × on a read-only paper");
  const plus = await page.$$eval("button", (bs) => bs.filter((b) => b.textContent.trim() === "+ component").length);
  if (plus !== 0) throw new Error("+ component on a read-only paper");
});
await T("C-5 every rung advertises in place: + component on open sections (collapsed reveal on expand), + item within", async () => {
  await page.goto("http://localhost:4195/");
  await page.waitForSelector("[data-paper]");
  let plusComp = await page.$$eval("button", (bs) => bs.filter((b) => b.textContent.trim() === "+ component").length);
  if (plusComp !== 1) throw new Error(`${plusComp} + component at rest (only the open section should advertise)`);
  await page.click("[data-chapter-expand='ch-dinner']");
  await page.waitForSelector("[data-chapter='ch-dinner']:not([data-chapter-collapsed])");
  plusComp = await page.$$eval("button", (bs) => bs.filter((b) => b.textContent.trim() === "+ component").length);
  if (plusComp !== 2) throw new Error(`${plusComp} + component after expanding`);
  const plusItem = await page.$$eval("button", (bs) => bs.filter((b) => b.textContent.indexOf("+ item") >= 0).length);
  if (plusItem < 1) throw new Error("no + item inside the component");
});
await T("C-6 the object's Drawer advertises removal; the drawer dies with the object", async () => {
  // Inline editors deliberately stopPropagation (typing must not toggle
  // selection), so a SELECTION click is the row's non-input territory —
  // the subtotal is the honest target, as a cursor would find it.
  // …and scoped to the ROW (the chapter head shows the same subtotal first
  // in DOM; a bare text= would click the head's inert span).
  await page.click("[data-node-id='comp-sushi'] >> text=$2950.00");
  await page.waitForSelector("[data-inspector-remove]");
  const label = await page.textContent("[data-inspector-remove]");
  if (!label.includes("component")) throw new Error(`label: ${label}`);
  await page.click("[data-inspector-remove]");
  await absent("[data-drawer]", "drawer survived the removal");
  const a = await adverts();
  if (a[a.length - 1] !== "remove:component:comp-sushi") throw new Error(`adverts: ${a}`);
});

await T("C-7 a component advertises its own removal: ⋯ → Remove component…, host hears the id", async () => {
  await page.goto("http://localhost:4195/");
  await page.waitForSelector("[data-paper]");
  await page.click("[data-component-menu-btn='comp-sushi']");
  await page.waitForSelector("[data-component-menu]");
  await page.click("[data-component-act='remove']");
  await absent("[data-component-menu]", "menu survived the choice");
  const a = await adverts();
  if (a[a.length - 1] !== "remove:component:comp-sushi") throw new Error(`adverts: ${a}`);
});
await T("C-8 an item advertises its own removal: × fires with the item's id, selection untouched", async () => {
  // the item's name is a Text INPUT (text= can't see it); the × is present
  // at rest (opacity only) and honestly clickable.
  await page.click("[data-item-remove='it-nigiri']");
  const a = await adverts();
  if (a[a.length - 1] !== "remove:item:it-nigiri") throw new Error(`adverts: ${a}`);
  await absent("[data-drawer]", "the × opened a drawer — removal is not interrogation");
});
await T("C-9 empty sections rest collapsed (▶) — compact, present, expandable; populated stay open", async () => {
  await page.goto("http://localhost:4195/");
  await page.waitForSelector("[data-paper]");
  await page.waitForSelector("[data-chapter-collapsed][data-chapter='ch-dinner']");
  if (await page.$("[data-chapter='ch-cocktail'][data-chapter-collapsed]")) throw new Error("a populated chapter collapsed");
  const box = await (await page.$("[data-chapter-collapsed]")).boundingBox();
  if (box.height > 60) throw new Error(`collapsed row is ${box.height}px — that's not compact`);
  await page.click("[data-chapter-expand='ch-dinner']");
  await page.waitForSelector("[data-chapter='ch-dinner']:not([data-chapter-collapsed])");
  const plus = await page.$$eval("button", (bs) => bs.filter((b) => b.textContent.trim() === "+ component").length);
  if (plus < 2) throw new Error("expanding didn't reveal the section's + component");
});
await T("S-1 the picker is curated and absence-ruled: groups in order, the present chapter offered NOWHERE", async () => {
  await page.goto("http://localhost:4195/?mode=picker");
  await page.waitForSelector("[data-moment-picker]");
  const groups = await page.$$eval("[data-picker-group]", (xs) => xs.map((x) => x.getAttribute("data-picker-group")));
  if (groups.join(",") !== "Food,Event,Presentation,General") throw new Error(`groups: ${groups}`);
  await absent("[data-moment-option='t-dinner']", "the present chapter was offered — a duplicate-in-waiting");
  if (!(await page.$("[data-moment-option='t-late']"))) throw new Error("an absent chapter is missing from the offer");
});
await T("S-2 a pick commits the id; coining is its own act behind its own affordance", async () => {
  await page.click("[data-moment-option='t-ceremony']");
  await page.waitForSelector("[data-picker-closed]");
  let a = await adverts();
  if (a[a.length - 1] !== "pick:t-ceremony") throw new Error(`adverts: ${a}`);
  await page.goto("http://localhost:4195/?mode=picker");
  await page.waitForSelector("[data-moment-picker]");
  await absent("[data-moment-new]", "the coin input renders before the act is chosen");
  await page.click("[data-moment-coin]");
  await page.fill("[data-moment-new]", "After Midnight");
  await page.click("[data-moment-create]");
  await page.waitForSelector("[data-picker-closed]");
  a = await adverts();
  if (a[a.length - 1] !== "coin:After Midnight") throw new Error(`adverts: ${a}`);
});
await T("A-1 the outline question starts unanswered and reports the chosen grammar", async () => {
  await page.goto("http://localhost:4195/?mode=archetype");
  await page.waitForSelector("[data-archetype-pick]");
  const v0 = await page.textContent("[data-arch-value]");
  if (v0 !== "unanswered") throw new Error(`preselected: ${v0}`);
  const checked = await page.$$eval("[data-archetype-pick] input", (xs) => xs.filter((x) => x.checked).length);
  if (checked !== 0) throw new Error("a grammar was chosen FOR the user");
  await page.click("[data-archetype='reception']");
  const a = await adverts();
  if (a[a.length - 1] !== "arch:reception") throw new Error(`adverts: ${a}`);
  if ((await page.textContent("[data-arch-value]")) !== "reception") throw new Error("value didn't travel");
});
await T("G-1 genesis open: NO version before the user chooses", async () => {
  await page.goto("http://localhost:4195/?mode=genesis");
  await page.waitForSelector("[data-genesis]");
  await page.waitForTimeout(150);
  const a = await adverts();
  if (a.length !== 0) throw new Error(`commits on open: ${a}`);
  for (const t of ["revise", "blank"]) {
    if (!(await page.$(`[data-genesis-option='${t}']`))) throw new Error(`route ${t} missing`);
  }
});
await T("G-2 revise commits revise, once — and names its source", async () => {
  const label = await page.textContent("[data-genesis-option='revise']");
  if (!label.includes("v3")) throw new Error(`revise doesn't name the source: ${label}`);
  await page.click("[data-genesis-option='revise']");
  await page.waitForSelector("[data-genesis-closed]");
  const a = await adverts();
  if (a.join(",") !== "genesis:revise") throw new Error(`adverts: ${a}`);
});
await T("G-3 blank commits blank, once", async () => {
  await page.goto("http://localhost:4195/?mode=genesis");
  await page.waitForSelector("[data-genesis]");
  await page.click("[data-genesis-option='blank']");
  await page.waitForSelector("[data-genesis-closed]");
  const a = await adverts();
  if (a.join(",") !== "genesis:blank") throw new Error(`adverts: ${a}`);
});
await T("G-4 v262: the genesis offers exactly revise/copy/blank — the retired blueprint route does not exist", async () => {
  await page.goto("http://localhost:4195/?mode=genesis");
  await page.waitForSelector("[data-genesis]");
  if (await page.$("[data-genesis-option='blueprint']")) throw new Error("the retired route is still offered");
  if (await page.$("[data-genesis-bp='bp-1']")) throw new Error("a blueprint pick surface survives");
  for (const t of ["revise", "blank"]) {
    if (!(await page.$(`[data-genesis-option='${t}']`))) throw new Error(`route ${t} missing`);
  }
  if ((await adverts()).length !== 0) throw new Error("looking committed something");
});
await T("G-6 Copy another version… offers the facts and commits exactly the chosen source", async () => {
  await page.goto("http://localhost:4195/?mode=genesis");
  await page.waitForSelector("[data-genesis]");
  await page.click("[data-genesis-option='copy']");
  await page.waitForSelector("[data-genesis-copy='v2']");
  const row = await page.textContent("[data-genesis-copy='v2']");
  if (!row.includes("Sent") || !row.includes("14 components") || !row.includes("6/1/2026"))
    throw new Error(`facts missing: ${row}`);
  await page.click("[data-genesis-copy-back]");
  await page.waitForSelector("[data-genesis-option='revise']");
  if ((await adverts()).length !== 0) throw new Error("browsing committed something");
  await page.click("[data-genesis-option='copy']");
  await page.click("[data-genesis-copy='v1']");
  await page.waitForSelector("[data-genesis-closed]");
  const a = await adverts();
  if (a.join(",") !== "genesis:copy:v1") throw new Error(`adverts: ${a}`);
});
await T("T-1 the thread teaches: CURRENT = latest non-archived, prominent; history folded", async () => {
  await page.goto("http://localhost:4195/?mode=thread");
  await page.waitForSelector("[data-version-current]");
  const cur = await page.textContent("[data-version-current]");
  // v4 exists but is archived — current must fall to v3, the latest ACTIVE.
  if (!cur.includes("v3") || !cur.includes("current") || !cur.includes("Open Studio") || !cur.includes("Create New Version"))
    throw new Error(`current row: ${cur}`);
  if (cur.includes("Archived")) throw new Error("an archived version was crowned current");
  await absent("[data-version-history]", "history unfolded at rest");
  await absent("[data-version-row='v1']", "an old version rendered outside the fold");
  await page.click("[data-version-history-toggle]");
  await page.waitForSelector("[data-version-history] [data-version-row='v1']");
  if (await page.$("[data-version-history] [data-version-current]")) throw new Error("history contains a 'current'");
});
await T("T-3 ONE uninterrupted history: archived versions sit at their historical position, decorated", async () => {
  const ids = await page.$$eval("[data-version-history] [data-version-row]",
    (xs) => xs.map((x) => x.getAttribute("data-version-row")));
  // v4 archived 6/15, v2 archived 7/1 — order must be VERSION order (4,2,1
  // interleaved with 1? history = v4,v2,v1 by number desc), never archive
  // or restore time.
  if (ids.join(",") !== "v4,v2,v1") throw new Error(`history order: ${ids} — archive time leaked into the narrative`);
  const v2row = await page.textContent("[data-version-row='v2']");
  if (!v2row.includes("Archived")) throw new Error("archived version undecorated");
  if (!(await page.$("[data-version-row='v2'][data-version-archived]"))) throw new Error("archived marker missing");
  const v1row = await page.textContent("[data-version-row='v1']");
  if (v1row.includes("Archived")) throw new Error("an active version wears the archive badge");
  if (!(await page.$("[data-version-history] [data-archived-badge]"))) throw new Error("no badge in the one history");
});
await T("T-5 (v265/v266) sending is now PUBLISHING: the retired '↻ Send again' status affordance no longer exists on a sent version — re-presentation is a communication through the Publish door, not a status control", async () => {
  // v3 (current) is SENT. Under the Publish law, there is NO status-menu
  // re-send: the affordance was retired, because sending crosses to publishing
  // and a sealed offer's content is frozen. The absence IS the claim.
  await page.waitForSelector("[data-thread-studio]");
  if (await page.$("[data-version-resend='v3']")) throw new Error("the retired send-again affordance survived on a sent version");
  if (await page.$("[data-version-resend='v2']")) throw new Error("the retired send-again affordance survived on an archived version");
});
await T("T-4 restore is advertised on the archived row and fires with the version; no separate bucket exists", async () => {
  if (await page.$("text=Show archived")) throw new Error("the separate archived bucket survived");
  await page.click("[data-version-restore='v2']");
  const a = await adverts();
  if (a[a.length - 1] !== "restore:v2") throw new Error(`adverts: ${a}`);
});
await T("T-2 the thread's New Version opens Genesis with NOTHING created; revise-latest names v3", async () => {
  await page.goto("http://localhost:4195/?mode=thread");   // fresh recorder — T-4's restore was its own claim
  await page.waitForSelector("[data-thread-new-version]");
  await page.click("[data-thread-new-version]");
  await page.waitForSelector("[data-genesis]");
  const a = await adverts();
  if (a.join(",") !== "thread:open-genesis") throw new Error(`mutations before choosing: ${a}`);
  const label = await page.textContent("[data-genesis-option='revise']");
  if (!label.includes("latest") || !label.includes("v3")) throw new Error(`revise label: ${label}`);
  await page.click("[data-genesis-cancel]");
  const a2 = await adverts();
  if (a2.join(",") !== "thread:open-genesis,genesis:cancel") throw new Error(`cancel wasn't free: ${a2}`);
});
await T("G-5 cancel creates nothing", async () => {
  await page.goto("http://localhost:4195/?mode=genesis");
  await page.waitForSelector("[data-genesis]");
  await page.click("[data-genesis-cancel]");
  await page.waitForSelector("[data-genesis-closed]");
  const a = await adverts();
  if (a.join(",") !== "genesis:cancel") throw new Error(`adverts: ${a}`);
});

await T("B-1 the Brand Kit is draft state until Save brand: picks redraw the resolve, nothing commits", async () => {
  await page.goto("http://localhost:4195/?mode=brand");
  await page.waitForSelector("[data-brand-kit]");
  await page.click("[data-brand-palette='wine-blush']");
  await page.waitForFunction(() => document.querySelector("[data-brand-resolved-primary]").textContent === "#5B1E2D");
  await page.click("[data-brand-pairing='garamond-lato']");
  const a = await adverts();
  if (a.length !== 0) throw new Error(`the kit committed on pick: ${a}`);
  await page.waitForSelector("[data-brand-save]");
  await page.click("[data-brand-save]");
  const a2 = await adverts();
  if (a2.length !== 1 || !a2[0].startsWith("brand-save:") || !a2[0].includes("garamond-lato") || !a2[0].includes("#5B1E2D"))
    throw new Error(`save: ${a2}`);
  await absent("[data-brand-save]", "Save offered while clean");
});
await T("B-2 Save as theme… NAMES the draft without committing the brand", async () => {
  await page.goto("http://localhost:4195/?mode=brand");
  await page.waitForSelector("[data-brand-kit]");
  await page.click("[data-brand-paper='ivory']");
  await page.fill("[data-brand-theme-name]", "Wedding Luxury");
  await page.click("[data-brand-save-theme]");
  const a = await adverts();
  if (a.length !== 1 || !a[0].startsWith("theme-save:Wedding Luxury:") || !a[0].includes("#FDFBF7"))
    throw new Error(`adverts: ${a}`);
  if (!(await page.$("[data-brand-save]"))) throw new Error("naming a theme cleared the brand's dirty state — two different commits");
});
await T("B-3 the default theme is a choice, and 'Company brand' means the bare kit", async () => {
  await page.goto("http://localhost:4195/?mode=brand");
  await page.waitForSelector("[data-brand-default]");
  await page.selectOption("[data-brand-default]", "luxury");
  let a = await adverts();
  if (a[a.length - 1] !== "default:luxury") throw new Error(`adverts: ${a}`);
  await page.selectOption("[data-brand-default]", "__brand__");
  a = await adverts();
  if (a[a.length - 1] !== "default:__brand__") throw new Error(`adverts: ${a}`);
});

await T("B-4 the region WORDS are brand facts with the brand's ceremony: draft until Save brand", async () => {
  await page.goto("http://localhost:4195/?mode=brand");
  await page.waitForSelector("[data-brand-kit]");
  await page.fill("[data-brand-footer]", "Burger Bar Catering · (732) 555-0140");
  await page.fill("[data-brand-signature]", "Ben Grossman");
  if ((await adverts()).length !== 0) throw new Error("typing committed");
  await page.waitForSelector("[data-brand-save]");
  await page.click("[data-brand-save]");
  const a = await adverts();
  if (a.length !== 1 || !a[0].includes("(732) 555-0140") || !a[0].includes("Ben Grossman"))
    throw new Error(`save payload lost the words: ${a}`);
});

await browser.close(); server.close();
console.log(`\naccept-lifecycle: ${passed} passed, ${failed} failed${variant ? "  (VARIANT — C-1 must FAIL or the suite has no teeth)" : ""}${variantGenesis ? "  (GENESIS VARIANT — G-1 must FAIL: a version chosen FOR the user)" : ""}`);
process.exit((variant || variantGenesis || variantPicker || variantThread || variantBrand) ? (failed > 0 ? 0 : 1) : (failed === 0 ? 0 : 1));
