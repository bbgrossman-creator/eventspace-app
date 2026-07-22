// ═══════════════════════════════════════════════════════════════════════════
// v217 ACCEPTANCE — THE LAW (STUDIO_COMPOSITION §0), real Chromium, real
// organs (paper.harness.tsx). The invariants, mapped:
//   §0.1 four citizens at rest         → P-1
//   §0.4 the dial turns the Paper      → P-2 (one paper before, one after)
//   §0.3 summons never reflow          → P-3 (drawer opens; the Paper's box
//                                        is IDENTICAL — measured, not hoped)
//   §4   outline subordinated          → P-4 (ticks at rest; ⌘G panel;
//                                        travel; dismissal)
//   §0.5 two whole papers, no sidecar  → P-5 (split: widths within 25%;
//                                        choice via the sheet dial; reload
//                                        forgets both split and choice —
//                                        THE VARIANT'S TARGET)
//   §10  the meter                     → P-6 (floating facts; debt travels
//                                        into the drawer)
//   §7   knowledge summoned            → P-7 (summon row under the Line with
//                                        the Paper visible; Esc clears; ⌘K
//                                        opens the Shade instead)
//   §0.2 Esc retreats ONE layer        → P-8 (ghost + drawer stacked: first
//                                        Esc closes the drawer only)
// Run:       PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-paper.mjs
// Regression: node browser-tests/accept-paper.mjs --variant       (expects P-5 FAIL)
// Regression: node browser-tests/accept-paper.mjs --variant-pub   (expects P-14 FAIL)
//   The persist-on-pick PresentationControls — the ceremony law broken
//   mechanically: a copy whose pick handlers call onSave immediately.
//   Build: sed 's/props.onOverride(mergeDelta(props.override, d));/{ props.onOverride(mergeDelta(props.override, d)); props.onSave(); }/' \
//     src/components/studio/PresentationControls.tsx > src/components/studio/__variant__/PresentationControls.persisting.tsx
//   then esbuild with --alias:@/components/studio/PresentationControls=./src/components/studio/__variant__/PresentationControls.persisting.tsx
//   → browser-tests/paper.pub-variant.js
// Variant build (patched SecondSheet INSIDE src persisting the choice —
// transient, never shipped):
//   mkdir -p src/components/studio/__variant__
//   sed -e 's/useState<string | null>(null)/useState<string | null>(() => { try { return localStorage.getItem("ec:sheet"); } catch { return null; } })/' \
//       -e 's/onClick={() => setChosen(o.key)}/onClick={() => { try { localStorage.setItem("ec:sheet", o.key); } catch {} setChosen(o.key); }}/' \
//       -e 's|from "./LiveLensPanel"|from "../LiveLensPanel"|' \
//     src/components/studio/SecondSheet.tsx > src/components/studio/__variant__/SecondSheet.persisting.tsx
//   npx esbuild browser-tests/paper.harness.tsx --bundle --outfile=browser-tests/paper.variant.js \
//     --jsx=automatic --define:process.env.NODE_ENV='"development"' \
//     --define:process.env.NEXT_PUBLIC_SUPABASE_URL='"http://localhost:9"' \
//     --define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='"fixture"' \
//     --alias:@/components/studio/SecondSheet=./src/components/studio/__variant__/SecondSheet.persisting.tsx \
//     --alias:@=./src
// Main build: same minus the variant alias → paper.harness.js.
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const variant = process.argv.includes("--variant");
const variantPub = process.argv.includes("--variant-pub");
// --variant-nofonts (v232): css arrives, woff2 vanishes — the silent-fallback
// world Font Delivery retires. P-22 must FAIL under it: the metric probe is
// the instrument that catches the lie. Recipe: no build step; run
//   node browser-tests/accept-paper.mjs --variant-nofonts
const variantNoFonts = process.argv.includes("--variant-nofonts");
const js = variant ? "paper.variant.js" : variantPub ? "paper.pub-variant.js" : "paper.harness.js";
const server = createServer((req, res) => {
  const routes = { "/": ["paper.html", "text/html"],
    "/paper.harness.js": [js, "text/javascript"],
    "/app.css": ["app.css", "text/css"] };
  const u = req.url.split("?")[0];
  // v232 — self-hosted faces, served exactly as the app serves them
  if (u.startsWith("/fontsource/")) {
    if (variantNoFonts && /\.woff2?$/.test(u)) { res.writeHead(404); return res.end(); }
    try {
      const f = readFileSync(join(here, "..", "node_modules", "@fontsource", u.slice("/fontsource/".length)));
      res.writeHead(200, { "content-type": u.endsWith(".css") ? "text/css" : "font/woff2" });
      return res.end(f);
    } catch { res.writeHead(404); return res.end(); }
  }
  const r = routes[u];
  if (!r) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": r[1] }); res.end(readFileSync(join(here, r[0])));
});
await new Promise((ok) => server.listen(4193, ok));
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1360, height: 850 } })).newPage();
let passed = 0, failed = 0;
const T = async (name, fn) => { try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); } };
const box = async (sel) => (await page.$(sel)).boundingBox();
const absent = async (sel, why) => { if (await page.$(sel)) throw new Error(why); };

await T("P-1 at rest: the four citizens, and nothing else", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-paper]");
  await page.waitForSelector("[data-line]");
  await page.waitForSelector("[data-meter]");
  await page.waitForSelector("[data-ghost-ticks]");
  for (const [sel, why] of [
    ["[data-drawer]", "a drawer at rest"], ["[data-ghost-panel]", "the outline panel at rest"],
    ["[data-paper-second]", "a second sheet at rest"], ["[data-summon-row]", "a summon row at rest"],
    ["[data-knowledge-strip]", "the dead docked strip"], ["[data-dial-menu]", "an open dial at rest"],
  ]) await absent(sel, why);
  const stage = await box("[data-stage]"), paper = await box("[data-paper]");
  const left = paper.x - stage.x, right = (stage.x + stage.width) - (paper.x + paper.width);
  if (Math.abs(left - right) > 40) throw new Error(`paper not centered (${left} vs ${right})`);
  if (paper.width < stage.width * 0.4) throw new Error("paper not dominant");
});
await T("P-2 the dial turns the Paper — one artifact before, one after", async () => {
  await page.click("[data-dial]");
  await page.waitForSelector("[data-dial-menu]");
  await page.click("[data-dial-option='production']");
  await page.waitForSelector("[data-paper] [data-prod-component]");
  await absent("[data-dial-menu]", "dial stayed open");
  const n = await page.$$eval("[data-paper]", (x) => x.length);
  if (n !== 1) throw new Error(`${n} papers`);
  await page.click("[data-dial]"); await page.click("[data-dial-option='design']");
  await page.waitForSelector("[data-fixture-row]");
});
await T("P-3 the inspector reflows the Paper LAWFULLY (v237 repeals the no-reflow law): contraction, no overlap, hero floor, restoration", async () => {
  const before = await box("[data-paper]");
  await page.click("[data-fixture-row]");
  await page.waitForSelector("[data-inspector-region]");
  const during = await box("[data-paper]");
  const wing = await box("[data-inspector-region]");
  if (during.width >= before.width) throw new Error("the paper didn't acknowledge the inspector");
  if (during.width < 300) throw new Error("the paper stopped being the hero");
  if (!(wing.x >= during.x + during.width - 1)) throw new Error("the inspector overlaps the paper");
  await page.keyboard.press("Escape");
  await absent("[data-inspector-region]", "wing survived Esc");
  const after = await box("[data-paper]");
  if (Math.abs(after.width - before.width) > 2) throw new Error("the workspace didn't restore");
});
await T("P-4 the outline, subordinated: ticks · ⌘G panel · travel · dismissal", async () => {
  const ticks = await page.$$eval("[data-ghost-tick]", (xs) => xs.map((x) => x.style.background));
  if (ticks.length !== 3) throw new Error(`${ticks.length} ticks`);
  if (!ticks[0].includes("201, 163, 78") && !ticks[0].includes("C9A34E")) throw new Error(`debt tick not gold: ${ticks[0]}`);
  await page.keyboard.press("Control+g");
  await page.waitForSelector("[data-ghost-panel]");
  await page.keyboard.press("Escape");
  await absent("[data-ghost-panel]", "panel survived Esc");
  await page.click("[data-ghost-tick='ch3']");
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-chapter='ch3']");
    return el && el.getBoundingClientRect().top < 300;
  });
});
await T("P-5 the Second Sheet: two whole papers, never a sidecar; forgotten on reload", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-paper]");
  await page.click("[data-split]");
  await page.waitForSelector("[data-paper-second]");
  const a = await box("[data-paper]"), s = await box("[data-paper-second]");
  if (Math.abs(a.width - s.width) > a.width * 0.25) throw new Error(`sidecar: ${a.width} vs ${s.width}`);
  await page.waitForSelector("[data-paper-second] [data-live-lens]");
  await page.click("[data-sheet-lens='production']");
  await page.waitForSelector("[data-paper-second] [data-prod-component]");
  await page.reload();
  await page.waitForSelector("[data-paper]");
  await absent("[data-paper-second]", "split persisted");
  await page.click("[data-split]");
  await page.waitForSelector("[data-paper-second] [data-live-lens]");
  const label = await page.textContent("[data-paper-second] [data-live-lens-label]");
  if (label !== "Presentation") throw new Error(`choice persisted or the label sweep missed: ${label}`);
});
await T("P-6 the meter: floating facts; debt travels into the drawer", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-meter]");
  const total = await page.textContent("[data-meter-total]");
  if (!total.includes("18000") && !total.includes("18,000")) throw new Error(`total: ${total}`);
  await page.click("[data-meter-debt]");
  await page.waitForSelector("[data-inspector-region]");
  await page.keyboard.press("Escape");
});
await T("P-7 knowledge, summoned: the row under the Line, the Paper visible; ⌘K is the Shade", async () => {
  await page.fill("[data-ask]", "sushi");
  await page.waitForSelector("[data-summon-row] [data-library-rail='fx-station']");
  const paper = await box("[data-paper]");
  if (paper.y > 800) throw new Error("paper pushed out of view by the row");
  await page.press("[data-ask]", "Escape");
  await absent("[data-summon-row]", "row survived Esc");
  await page.keyboard.press("Control+k");
  await page.waitForSelector("[data-library-idle]");
  await absent("[data-summon-row]", "row and shade at once");
  await page.keyboard.press("Escape");   // shade's own input has focus
  await absent("[data-library-idle]", "shade survived Esc");
});
await T("P-8 the Esc law: one key retreats ONE layer (drawer, then ghost)", async () => {
  await page.keyboard.press("Control+g");
  await page.waitForSelector("[data-ghost-panel]");
  await page.click("[data-fixture-row]");
  await page.waitForSelector("[data-inspector-region]");
  await page.keyboard.press("Escape");
  await absent("[data-inspector-region]", "inspector survived");
  if (!(await page.$("[data-ghost-panel]"))) throw new Error("Esc fell through and closed the ghost too");
  await page.keyboard.press("Escape");
  await absent("[data-ghost-panel]", "ghost survived the second Esc");
});

await T("P-9 x-ray is contextual: absent on the inherent edition, a live modifier on Proposal", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-paper]");
  await absent("[data-xray]", "a dead control on the Design edition");
  await page.click("[data-dial]");
  await page.click("[data-dial-option='customer']");
  await page.waitForSelector("[data-xray]");
  const before = await page.getAttribute("[data-xray]", "aria-pressed");
  await page.click("[data-xray]");
  const after = await page.getAttribute("[data-xray]", "aria-pressed");
  if (before === after) throw new Error("modifier did not toggle");
  await page.click("[data-dial]");
  await page.click("[data-dial-option='design']");
  await absent("[data-xray]", "modifier survived the turn back to Design");
});
await T("P-10 the version axis: v2 on the sheet dial summons that version's paper with its diff line", async () => {
  await page.click("[data-split]");
  await page.waitForSelector("[data-paper-second] [data-live-lens]");
  await page.waitForSelector("[data-sheet-lens='v:v2']");
  await page.click("[data-sheet-lens='v:v2']");
  await page.waitForSelector("[data-sheet-diff]");
  const cap = await page.textContent("[data-sheet-diff]");
  if (!cap.includes("1 added") || !cap.includes("1 removed") || !cap.includes("2 changed") || !cap.includes("1500"))
    throw new Error(`caption: ${cap}`);
  const body = await page.textContent("[data-paper-second]");
  if (!body.includes("Pasta Station")) throw new Error("the second paper is not the old version");
  await page.click("[data-sheet-lens='customer']");
  await page.waitForFunction(() => !document.querySelector("[data-sheet-diff]"));
});

await T("P-11 the Desk menu has real physics: outside click, Esc, and the dial each dismiss it", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  await page.click("[data-desk]");
  await page.waitForSelector("[data-desk-menu]");
  await page.mouse.click(400, 500);
  await absent("[data-desk-menu]", "survived outside click");
  await page.click("[data-desk]");
  await page.waitForSelector("[data-desk-menu]");
  await page.keyboard.press("Escape");
  await absent("[data-desk-menu]", "survived Esc");
  await page.click("[data-desk]");
  await page.click("[data-dial]");
  await absent("[data-desk-menu]", "desk and dial open together");
  await page.waitForSelector("[data-dial-menu]");
  await page.keyboard.press("Escape");
});
await T("P-12 status is PASSIVE DOCUMENT METADATA: no pill, no border, no tooltip, no pointer — just text", async () => {
  const el = await page.$("[data-flow-status]");
  const facts = await el.evaluate((x) => {
    const cs = getComputedStyle(x);
    return { tag: x.tagName, title: x.getAttribute("title"),
      bg: cs.backgroundColor, border: cs.borderWidth, radius: cs.borderRadius, cursor: cs.cursor,
      text: x.textContent };
  });
  if (facts.tag === "BUTTON") throw new Error("still a button");
  if (facts.title) throw new Error("good UI shouldn't need a tooltip to say it isn't clickable — and it has one");
  if (facts.bg !== "rgba(0, 0, 0, 0)" && facts.bg !== "transparent") throw new Error(`pill background survived: ${facts.bg}`);
  if (facts.border !== "0px") throw new Error(`border survived: ${facts.border}`);   // preflight sets style:solid at width 0 on everything
  if (facts.cursor === "pointer" || facts.cursor === "help") throw new Error(`interactive cursor: ${facts.cursor}`);
  if (!facts.text.includes("Draft")) throw new Error(`status text missing: ${facts.text}`);
});

await T("P-13 the control surface belongs to the LENS: presentation controls exist on Presentation, not on Design", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  await absent("[data-pub-controls]", "presentation controls on the Design edition");
  await absent("[data-lens-controls]", "an empty control region rendered");
  await page.click("[data-dial]");
  await page.click("[data-dial-option='customer']");
  await page.waitForSelector("[data-lens-controls] [data-pub-controls]");
  const dial = await page.textContent("[data-dial]");
  if (!dial.includes("Presentation")) throw new Error(`the dial still says: ${dial}`);
  await page.click("[data-dial]");
  await page.click("[data-dial-option='design']");
  await absent("[data-pub-controls]", "the toolbar survived the turn back to Design");
});

await T("P-14 the look is render state until SAVED: pick redraws live, Save commits once, discard restores", async () => {
  await page.click("[data-dial]");
  await page.click("[data-dial-option='customer']");
  await page.waitForSelector("[data-pub-controls]");
  const before = await page.$eval("[data-pub-title]", (el) => getComputedStyle(el).fontFamily);
  await absent("[data-pub-save]", "Save offered before anything changed");
  // v228 — ONE entry on the Line; the navigator lives inside the Room.
  await page.click("[data-pub-entry]");
  await page.waitForSelector("[data-pub-region] [data-room='appearance']");
  await page.click("[data-pub-room='typography']");
  await page.waitForSelector("[data-room='typography']");
  await page.click("[data-room-pairing='montserrat-inter']");
  await page.waitForFunction((prev) => {
    const el = document.querySelector("[data-pub-title]");
    return el && getComputedStyle(el).fontFamily !== prev;
  }, before);
  const after = await page.$eval("[data-pub-title]", (el) => getComputedStyle(el).fontFamily);
  if (!after.includes("Montserrat")) throw new Error(`redraw missed: ${after}`);
  let saves = await page.evaluate(() => window.__saves);
  if (saves.length !== 0) throw new Error(`persisted on pick — the ceremony law broken: ${saves}`);
  // v226: the Line lives above the click-away plane — Save is reachable
  // WHILE the room is open (the chrome always quietly serves the paper).
  await page.waitForSelector("[data-pub-save]");
  await page.click("[data-pub-save]");
  saves = await page.evaluate(() => window.__saves);
  if (saves.length !== 1 || !saves[0].includes("montserrat-inter")) throw new Error(`saves: ${saves}`);
  await absent("[data-pub-save]", "Save offered while clean");
  // theme pick + discard restores the resolved dress
  if (!(await page.$("[data-pub-region]"))) { await page.click("[data-pub-entry]"); }
  await page.click("[data-pub-room='appearance']");
  await page.waitForSelector("[data-room='appearance']");
  await page.click("[data-room-theme='luxury']");
  await page.waitForSelector("[data-pub-discard]");
  await page.click("[data-pub-discard]");
  await page.waitForFunction((orig) => {
    const el = document.querySelector("[data-pub-title]");
    return el && getComputedStyle(el).fontFamily === orig;
  }, before);
  saves = await page.evaluate(() => window.__saves);
  if (saves.length !== 1) throw new Error("discard committed something");
});

await T("P-15 THE ROOMS LAW: one room, one identity; switching replaces; Esc returns to the paper", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  await page.click("[data-dial]");
  await page.click("[data-dial-option='customer']");
  await page.click("[data-pub-entry]");
  await page.waitForSelector("[data-pub-region]");
  await page.click("[data-pub-room='typography']");
  await page.waitForSelector("[data-room='typography']");
  await page.click("[data-pub-room='paper']");
  await page.waitForSelector("[data-room='paper']");
  await absent("[data-room='typography']", "two rooms exist at once — the identity didn't change, it stacked");
  if ((await page.$$("[data-room]")).length !== 1) throw new Error("more than one room mounted");
  await page.keyboard.press("Escape");
  await absent("[data-room]", "Esc didn't put us back on the paper");
  await absent("[data-pub-region]", "the Room's wing outlived its rooms");
});
await T("P-16 the paper IS the interaction surface: select a section, its toolbar appears, semantic picks redraw as render state, no structural actions", async () => {
  await absent("[data-treatment-toolbar]", "a toolbar with nothing selected");
  await page.click("[data-pub-section='sec-fx-1'] [data-pub-headstyle]");
  await page.waitForSelector("[data-treatment-toolbar]");
  // the toolbar belongs to the selection — and carries NO structure (§0.2)
  const txt = await page.textContent("[data-treatment-toolbar]");
  for (const bad of ["Remove", "Move", "Delete", "Add"]) {
    if (txt.includes(bad)) throw new Error(`structural leak on the canvas toolbar: ${bad}`);
  }
  const savesBefore = (await page.evaluate(() => window.__saves)).length;
  await page.click("[data-treat='heading:eyebrow']");
  await page.waitForSelector("[data-pub-section='sec-fx-1'] [data-pub-headstyle='eyebrow']");
  await page.click("[data-treat='divider:dots']");
  // divider renders only between sections (si>0); the FACT is in the override → spacing pick proves redraw:
  await page.click("[data-treat='spacing:airy']");
  await page.waitForSelector("[data-pub-section='sec-fx-1'][data-pub-spacing='airy']");
  const savesAfter = (await page.evaluate(() => window.__saves)).length;
  if (savesAfter !== savesBefore) throw new Error("the canvas persisted on pick — Save look is the only commit");
  await page.waitForSelector("[data-pub-save]");
  // ONE THING OPEN: opening the Room kills the toolbar; while the Room is
  // open, ANY click on the paper is its dismissal (the click-away law), so
  // room and toolbar can never coexist by construction.
  await page.click("[data-pub-entry]");
  await page.waitForSelector("[data-pub-region]");
  await page.click("[data-pub-room='palette']");
  await page.waitForSelector("[data-room='palette']");
  await absent("[data-treatment-toolbar]", "toolbar survived a room opening");
  await page.keyboard.press("Escape");
  await page.click("[data-pub-section='sec-fx-1'] [data-pub-headstyle]");
  await page.waitForSelector("[data-treatment-toolbar]");
  await absent("[data-room]", "room survived a paper selection — two things open");
  await page.click("[data-treat-close]");
  await absent("[data-treatment-toolbar]", "✕ didn't return to the paper");
});

await T("P-17 THE LINE'S GRAMMAR: three owned zones, a single Presentation entry, no wrapping", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  for (const z of ["identity", "workspace", "tools"]) {
    if (!(await page.$(`[data-line-${z}]`))) throw new Error(`zone ${z} missing`);
  }
  await page.click("[data-dial]");
  await page.click("[data-dial-option='customer']");
  await page.waitForSelector("[data-pub-entry]");
  // ONE entry at rest — the navigator does NOT live on the Line
  if (await page.$("[data-line] [data-pub-room]")) throw new Error("room navigation leaked onto the Line");
  // the entry lives in the tools zone, the Ask in the workspace zone
  if (!(await page.$("[data-line-tools] [data-pub-entry]"))) throw new Error("the entry is homeless");
  if (!(await page.$("[data-line-workspace] [data-ask]"))) throw new Error("search left its zone");
  // and the Line never stacks: single row even with everything mounted
  const box = await (await page.$("[data-line]")).boundingBox();
  if (box.height > 56) throw new Error(`the Line wrapped: ${box.height}px tall`);
});
await T("P-20 THE ROOM NEVER OBSCURES THE PAPER: the workspace reshapes — Room | Paper — and restores", async () => {
  await page.keyboard.press("Escape");
  const closedBox = await (await page.$("[data-paper]")).boundingBox();
  await page.click("[data-pub-entry]");
  await page.waitForSelector("[data-pub-region]");
  const region = await (await page.$("[data-pub-region]")).boundingBox();
  const openBox = await (await page.$("[data-paper]")).boundingBox();
  if (openBox.width >= closedBox.width) throw new Error("the paper didn't contract — the Room isn't reshaping");
  if (region.x + region.width > openBox.x + 1) throw new Error("the Room overlaps the paper — it obscures instead of reshaping");
  if (openBox.width < 300) throw new Error(`the paper stopped being the hero: ${openBox.width}px`);
  // and the paper's content is still LIVE beneath nothing: its title is visible
  if (!(await page.$eval("[data-pub-title]", (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("[data-paper]") != null;
  }))) throw new Error("the paper's title is covered by chrome");
  await page.keyboard.press("Escape");
  await absent("[data-pub-region]", "Esc didn't close the wing");
  const restored = await (await page.$("[data-paper]")).boundingBox();
  if (Math.abs(restored.width - closedBox.width) > 2) throw new Error("closing didn't restore the workspace");
});

await T("P-18 THE DOCUMENT is an identity: click the title, its OWN toolbar appears, picks redraw as render state", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  await page.click("[data-dial]");
  await page.click("[data-dial-option='customer']");
  await page.waitForSelector("[data-pub-doc]");
  await page.click("[data-pub-doc]");
  await page.waitForSelector("[data-treatment-toolbar][data-treatment-kind='document']");
  const txt = await page.textContent("[data-treatment-toolbar]");
  if (!txt.includes("Title") || !txt.includes("Measure")) throw new Error(`document groups missing: ${txt}`);
  if (txt.includes("Heading") || txt.includes("Background")) throw new Error("section-only groups leaked onto the document toolbar");
  const savesBefore = (await page.evaluate(() => window.__saves)).length;
  await page.click("[data-treat='title:understated']");
  await page.waitForSelector("[data-pub-doc][data-pub-titlestyle='understated']");
  await page.click("[data-treat='measure:wide']");
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-publication]");
    return el && getComputedStyle(el).maxWidth === "880px";
  });
  if ((await page.evaluate(() => window.__saves)).length !== savesBefore)
    throw new Error("the document toolbar persisted on pick");
  await page.waitForSelector("[data-pub-save]");
  await page.click("[data-treat-close]");
});
await T("P-19 selectability is VISIBLE: hover outlines; a section takes a background wash the document didn't force", async () => {
  const shadowBefore = await page.$eval("[data-pub-section='sec-fx-1'] [data-pub-headstyle]", (el) => getComputedStyle(el).boxShadow);
  await page.hover("[data-pub-section='sec-fx-1'] [data-pub-headstyle]");
  const shadowHover = await page.$eval("[data-pub-section='sec-fx-1'] [data-pub-headstyle]", (el) => getComputedStyle(el).boxShadow);
  if (shadowBefore === shadowHover) throw new Error("no hover outline — selectability is invisible");
  await page.click("[data-pub-section='sec-fx-1'] [data-pub-headstyle]");
  await page.waitForSelector("[data-treatment-toolbar][data-treatment-kind='section']");
  const txt = await page.textContent("[data-treatment-toolbar]");
  if (!txt.includes("Background")) throw new Error("the section toolbar lost its Background group");
  if (txt.includes("Title") || txt.includes("Measure")) throw new Error("document-only groups leaked onto a section toolbar");
  await page.click("[data-treat='background:panel']");
  await page.waitForSelector("[data-pub-section='sec-fx-1'][data-pub-bg='panel']");
  const bg = await page.$eval("[data-pub-section='sec-fx-1']", (el) => getComputedStyle(el).boxShadow);
  if (bg === "none") throw new Error("the panel wash didn't render");
  await page.click("[data-treat='background:none']");
  await page.waitForSelector("[data-pub-section='sec-fx-1'][data-pub-bg='none']");
  await page.click("[data-treat-close]");
});

await T("P-21 PUBLICATION REGIONS: slots dress the paper as render state; words come from the brand; empty slots coach, never lie", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  await page.click("[data-dial]");
  await page.click("[data-dial-option='customer']");
  await page.click("[data-pub-entry]");
  await page.waitForSelector("[data-pub-region]");
  await page.click("[data-pub-room='regions']");
  await page.waitForSelector("[data-room='regions']");
  const savesBefore = (await page.evaluate(() => window.__saves)).length;
  // footer (v239): no explicit words → the line DERIVES from company facts
  await page.click("[data-room-region='footer:line']");
  await page.waitForSelector("[data-pub-footer]");
  const footer = await page.textContent("[data-pub-footer]");
  if (!footer.includes("Event Space by Burger Bar") || !footer.includes("KCL"))
    throw new Error("the footer isn't derived from the company's facts");
  // signature: toggled with NO words → a coaching hint, never a fake block
  await page.click("[data-room-region='signature:line']");
  await page.waitForSelector("[data-pub-signature-hint]");
  await absent("[data-pub-signature]", "an empty signature rendered as if it had a name");
  // cover + watermark redraw the paper
  await page.click("[data-room-region='cover:banner']");
  await page.waitForSelector("[data-pub-doc][data-pub-cover='banner']");
  await page.click("[data-room-region='watermark:draft']");
  await page.waitForSelector("[data-pub-watermark]");
  if ((await page.evaluate(() => window.__saves)).length !== savesBefore)
    throw new Error("regions persisted on pick — Save look is the only commit");
  await page.waitForSelector("[data-pub-save]");
  // and OFF is honest too
  await page.click("[data-room-region='watermark:none']");
  await absent("[data-pub-watermark]", "the ghost outlived its setting");
  await page.keyboard.press("Escape");
});

await T("P-22 FONT DELIVERY is deterministic: the faces LOAD from our origin and the paper wears them — no silent fallback", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  await page.click("[data-dial]");
  await page.click("[data-dial-option='customer']");
  await page.waitForSelector("[data-pub-title]");
  await page.evaluate(() => document.fonts.ready);
  // the delivered faces are real, loadable, and loaded
  const facts = await page.evaluate(async () => {
    await document.fonts.load('700 16px "Playfair Display"');
    await document.fonts.load('400 16px "Inter"');
    return {
      playfair: document.fonts.check('700 16px "Playfair Display"'),
      inter: document.fonts.check('400 16px "Inter"'),
      titleStack: getComputedStyle(document.querySelector("[data-pub-title]")).fontFamily,
    };
  });
  if (!facts.playfair) throw new Error("Playfair Display did not load from our origin");
  if (!facts.inter) throw new Error("Inter did not load from our origin");
  // (fonts.check answers "can this render", which is true via fallback for
  //  ANY family — so the decisive instrument below is METRICS, not check.)
  if (!facts.titleStack.includes("Playfair Display")) throw new Error(`the title isn't wearing the delivered face: ${facts.titleStack}`);
  // and the rendered metrics PROVE the face is in use, not a fallback:
  const w = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.textContent = "Goldberg Wedding Proposal";
    probe.style.cssText = "position:absolute;visibility:hidden;font-size:32px";
    document.body.appendChild(probe);
    probe.style.fontFamily = '"Playfair Display", Georgia, serif';
    const a = probe.offsetWidth;
    probe.style.fontFamily = "Georgia, serif";
    const b = probe.offsetWidth;
    probe.remove();
    return { a, b };
  });
  if (w.a === w.b) throw new Error("Playfair renders with Georgia's metrics — the woff2 never arrived");
});

await T("P-23 PHOTOGRAPHY: select the slot, the system PROPOSES, choosing pins as render state, the paper wears it, Save commits", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  await page.click("[data-dial]");
  await page.click("[data-dial-option='customer']");
  await page.waitForSelector("[data-pub-section='sec-fx-1']");
  await absent("[data-pub-photo]", "a photo rendered before any pin — the pin decides existence");
  // from the section's own toolbar into its slot
  await page.click("[data-pub-section='sec-fx-1'] [data-pub-headstyle]");
  await page.waitForSelector("[data-treatment-toolbar][data-treatment-kind='section']");
  await page.click("[data-treat-photo]");
  await page.waitForSelector("[data-pub-region] [data-photo-slot='sec-fx-1']");
  await absent("[data-treatment-toolbar]", "toolbar survived the room opening");
  // the PROPOSAL: cocktails first for Cocktail Hour, marked as proposed
  const firstPick = await page.$eval("[data-photo-slot='sec-fx-1'] [data-photo-pick]", (el) => el.getAttribute("data-photo-pick"));
  if (firstPick !== "sec-fx-1:ph-cocktails") throw new Error(`the system proposed ${firstPick}`);
  const savesBefore = (await page.evaluate(() => window.__saves)).length;
  await page.click("[data-photo-pick='sec-fx-1:ph-cocktails']");
  await page.waitForSelector("[data-pub-photo='sec-fx-1'][data-pub-photostyle='band']");
  if ((await page.evaluate(() => window.__saves)).length !== savesBefore)
    throw new Error("pinning persisted — Save look is the only commit");
  await page.waitForSelector("[data-pub-save]");
  // placement is a TREATMENT: side redraws the same pin
  await page.keyboard.press("Escape");
  await page.click("[data-pub-section='sec-fx-1'] [data-pub-headstyle]");
  await page.click("[data-treat='photo:side']");
  await page.waitForSelector("[data-pub-photo='sec-fx-1'][data-pub-photostyle='side']");
  // and NONE suppresses render without losing the pin
  await page.click("[data-treat='photo:none']");
  await absent("[data-pub-photo='sec-fx-1']", "'none' didn't suppress the render");
  await page.click("[data-treat='photo:band']");
  await page.waitForSelector("[data-pub-photo='sec-fx-1']");
  await page.click("[data-treat-close]");
  // Save carries the pin; unpin is the same ceremony
  await page.click("[data-pub-save]");
  const saved = (await page.evaluate(() => window.__saves));
  if (!saved.length) throw new Error("nothing saved");
  await page.click("[data-pub-entry]");
  await page.click("[data-pub-room='photography']");
  await page.waitForSelector("[data-photo-unpin='sec-fx-1']");
  await page.click("[data-photo-unpin='sec-fx-1']");
  await absent("[data-pub-photo='sec-fx-1']", "unpin left the image on the paper");
  await page.waitForSelector("[data-pub-save]");
  await page.keyboard.press("Escape");
});

await T("P-24 COMPONENT TREATMENTS: the component is an identity — its own toolbar, four semantic axes, imagery, the same ceremony", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  await page.click("[data-dial]");
  await page.click("[data-dial-option='customer']");
  await page.waitForSelector("[data-pub-comp='comp-fx-1']");
  // v235: the items region now lives INSIDE the component and owns its own
  // clicks — aim at the component's title, its unambiguous surface.
  await page.click("[data-pub-comp='comp-fx-1'] h4");
  await page.waitForSelector("[data-treatment-toolbar][data-treatment-kind='component']");
  const txt = await page.textContent("[data-treatment-toolbar]");
  for (const need of ["Title", "Description", "Price", "Photo"]) {
    if (!txt.includes(need)) throw new Error(`component axis missing: ${need}`);
  }
  if (txt.includes("Measure") || txt.includes("Divider")) throw new Error("document/section groups leaked onto a component");
  const savesBefore = (await page.evaluate(() => window.__saves)).length;
  await page.click("[data-treat='title:caps']");
  await page.waitForSelector("[data-pub-comp='comp-fx-1'][data-pub-comptitle='caps']");
  const tt = await page.$eval("[data-pub-comp='comp-fx-1'] h4", (el) => getComputedStyle(el).textTransform);
  if (tt !== "uppercase") throw new Error("caps didn't render");
  await page.click("[data-treat='price:muted']");
  // the fixture has no price label — the span is real but empty, so wait
  // for ATTACHMENT (visibility is a lie for zero-size elements)
  await page.waitForSelector("[data-pub-comp='comp-fx-1'] [data-pub-price='muted']", { state: "attached" });
  if ((await page.evaluate(() => window.__saves)).length !== savesBefore)
    throw new Error("component picks persisted — Save look is the only commit");
  await page.waitForSelector("[data-pub-save]");
  // imagery: Choose photo… from the component's toolbar into its own slot
  await page.click("[data-treat-photo]");
  await page.waitForSelector("[data-pub-region] [data-photo-slot='comp:comp-fx-1']");
  await page.click("[data-photo-pick='comp:comp-fx-1:ph-cocktails']");
  await page.waitForSelector("[data-pub-photo='comp:comp-fx-1'][data-pub-photostyle='side']");
  await page.keyboard.press("Escape");
  await absent("[data-pub-region]", "the wing outlived Esc");
});

await T("P-25 ITEM TREATMENTS: the smallest identity — its own toolbar, bullets, category, emphasis, and layout that defers to Design", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  await page.click("[data-dial]");
  await page.click("[data-dial-option='customer']");
  await page.waitForSelector("[data-pub-items='comp-fx-1']");
  await page.click("[data-pub-items='comp-fx-1']");
  await page.waitForSelector("[data-treatment-toolbar][data-treatment-kind='item']");
  const txt = await page.textContent("[data-treatment-toolbar]");
  for (const need of ["Bullet", "Category", "Emphasis", "Layout", "As designed"]) {
    if (!txt.includes(need)) throw new Error(`item axis missing: ${need}`);
  }
  if (txt.includes("Measure") || txt.includes("Divider") || txt.includes("Price")) throw new Error("other identities' groups leaked");
  const savesBefore = (await page.evaluate(() => window.__saves)).length;
  // bullet: the paper's actual glyph changes
  await page.click("[data-treat='bullet:diamond']");
  await page.waitForSelector("[data-pub-items='comp-fx-1'][data-pub-bullet='diamond']");
  const glyph = await page.$eval("[data-pub-items='comp-fx-1'] li span span:first-child", (el) => el.textContent);
  if (glyph !== "◆") throw new Error(`bullet renders '${glyph}'`);
  // emphasis: computed weight
  await page.click("[data-treat='emphasis:strong']");
  await page.waitForFunction(() => {
    const el = document.querySelectorAll("[data-pub-items='comp-fx-1'] li span span")[1];
    return el && parseInt(getComputedStyle(el).fontWeight, 10) >= 600;
  });
  // category heading eyebrow: computed uppercase
  await page.click("[data-treat='heading:eyebrow']");
  await page.waitForFunction(() => {
    const h = document.querySelector("[data-pub-items='comp-fx-1'] > div > div");
    return h && getComputedStyle(h).textTransform === "uppercase";
  });
  // layout: Run overrides Design's vertical; As designed restores it
  await page.click("[data-treat='layout:dot']");
  await page.waitForSelector("[data-pub-items='comp-fx-1'] [data-pub-itemlayout='dot']");
  await absent("[data-pub-items='comp-fx-1'] ul", "the list survived a Run layout");
  await page.click("[data-treat='layout:inherit']");
  await page.waitForSelector("[data-pub-items='comp-fx-1'] [data-pub-itemlayout='vertical']");
  if (!(await page.$("[data-pub-items='comp-fx-1'] ul"))) throw new Error("'As designed' didn't restore Design's layout");
  if ((await page.evaluate(() => window.__saves)).length !== savesBefore)
    throw new Error("item picks persisted — Save look is the only commit");
  await page.waitForSelector("[data-pub-save]");
  await page.click("[data-treat-close]");
});

const overlaps = (a, b) => !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);

await T("P-26 THE PRESSURE LAW: search keeps usable geometry; the hint yields; secondary controls surrender to the desk; one row; no duplicate Presentation", async () => {
  await page.setViewportSize({ width: 1360, height: 850 });
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  await page.click("[data-dial]");
  await page.click("[data-dial-option='customer']");
  await page.waitForSelector("[data-pub-entry]");
  // wide: everything present, and the dedup ruling holds
  if (!(await page.$("[data-open-shade]"))) throw new Error("hint missing at width");
  if (!(await page.$("[data-line] [data-xray]"))) throw new Error("x-ray missing at width");
  const dialTxt = await page.textContent("[data-dial]");
  const entryTxt = await page.textContent("[data-pub-entry]");
  if (!dialTxt.includes("Presentation")) throw new Error("the dial lost the lens name");
  if (entryTxt.includes("Presentation")) throw new Error("the entry still borrows the lens's name — reads as a duplicate");
  // pressure
  await page.setViewportSize({ width: 1000, height: 850 });
  await page.waitForFunction(() => !document.querySelector("[data-open-shade]"));
  await absent("[data-line] [data-xray]", "x-ray didn't surrender under pressure");
  await absent("[data-line] [data-split]", "split didn't surrender under pressure");
  await page.click("[data-desk]");
  await page.waitForSelector("[data-desk-xray]");
  if (!(await page.$("[data-desk-split]"))) throw new Error("the desk didn't absorb the split");
  await page.keyboard.press("Escape");
  // search geometry: protected floor, no internal collision
  const ask = await box("[data-ask]");
  if (ask.width < 200) throw new Error(`search starved: ${Math.round(ask.width)}px`);
  const zone = await box("[data-line-workspace]");
  const icon = await page.$eval("[data-line-workspace] span[aria-hidden]", (el) => el.getBoundingClientRect());
  if (overlaps(icon, ask)) throw new Error("the icon overlaps the input");
  if (ask.x + ask.width > zone.x + zone.width + 1) throw new Error("the input escapes its zone");
  // one row, still
  const line = await box("[data-line]");
  if (line.height > 56) throw new Error(`the Line wrapped under pressure: ${line.height}px`);
  await page.setViewportSize({ width: 1360, height: 850 });
});

await T("P-27 PROTECTED GEOMETRY: the Meter participates in layout — no chrome intersects the paper, single or dual view, wide or narrow", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-meter]");
  for (const width of [1360, 1100]) {
    await page.setViewportSize({ width, height: 850 });
    // single sheet
    let meter = await box("[data-meter]");
    let paper = await box("[data-paper]");
    if (overlaps(meter, paper)) throw new Error(`meter intersects the paper at ${width}px`);
    // dual view
    if (!(await page.$("[data-paper-second]"))) {
      if (await page.$("[data-line] [data-split]")) { await page.click("[data-line] [data-split]"); }
      else { await page.click("[data-desk]"); await page.click("[data-desk-split]"); }
      await page.waitForSelector("[data-paper-second]");
    }
    meter = await box("[data-meter]");
    paper = await box("[data-paper]");
    const second = await box("[data-paper-second]");
    if (overlaps(meter, paper) || overlaps(meter, second))
      throw new Error(`meter intersects a paper in dual view at ${width}px`);
    // and the Presentation wing keeps its own law under split (P-20's rule, dual)
  }
  await page.setViewportSize({ width: 1360, height: 850 });
});

await T("P-28 THE INSPECTOR WING: the hinge is the paper — seam, subject thread, contraction, restoration", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  const closedBox = await box("[data-paper]");
  await page.click("[data-fixture-row]");
  await page.waitForSelector("[data-inspector-region]");
  const region = await box("[data-inspector-region]");
  const paper = await box("[data-paper]");
  // Proposal │ Inspector — the wing sits at the paper's edge, never over it
  if (overlaps(region, paper)) throw new Error("the inspector obscures the paper");
  if (region.x < paper.x + paper.width - 1) throw new Error("the inspector isn't hinged to the paper's right edge");
  if (paper.width >= closedBox.width) throw new Error("the paper didn't acknowledge the inspector's arrival");
  // the SEAM: a visible hinge-rule on the paper-facing edge
  const seam = await page.$eval("[data-inspector-region]", (el) => getComputedStyle(el).borderLeftWidth + " " + getComputedStyle(el).borderLeftColor);
  if (!seam.startsWith("3px")) throw new Error(`the seam is missing: ${seam}`);
  // the SUBJECT THREAD: the eye never hunts — the wing names its selection
  const subject = await page.textContent("[data-inspector-subject]");
  if (!subject.includes("Sushi Station")) throw new Error("the wing doesn't name its subject");
  // Esc retreats; the workspace restores
  await page.keyboard.press("Escape");
  await absent("[data-inspector-region]", "Esc didn't close the wing");
  const restored = await box("[data-paper]");
  if (Math.abs(restored.width - closedBox.width) > 2) throw new Error("closing didn't restore the workspace");
});

await T("P-29 THE VERSION IDENTITY MENU: lifecycle verbs live behind the version's name; drafts may die, history may not", async () => {
  await page.waitForSelector("[data-version-menu]");
  // in the IDENTITY zone — never a fifth peer control
  if (!(await page.$("[data-line-identity] [data-version-menu]"))) throw new Error("the menu left the identity zone");
  await page.click("[data-version-menu]");
  await page.waitForSelector("[data-version-menu-list]");
  for (const k of ["duplicate", "reset-presentation", "archive", "delete"]) {
    if (!(await page.$(`[data-version-action='${k}']`))) throw new Error(`verb missing: ${k}`);
  }
  // a DRAFT: disposal is permitted, and the verb actually fires
  const before = (await page.evaluate(() => window.__saves)).length;
  await page.click("[data-version-action='archive']");
  const a = await page.evaluate(() => window.__saves);
  if (a[a.length - 1] !== "version:archive" || a.length !== before + 1) throw new Error(`verb didn't fire: ${a}`);
  await absent("[data-version-menu-list]", "the menu outlived its verb");
});

await T("P-30 INSPECTOR UNIFICATION: one visual language — the object's bar and the wing's seam are the SAME measured color; facets obey the declaration", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  await page.click("[data-fixture-row]");
  await page.waitForSelector("[data-inspector-region]");
  // the pair reads as ONE THOUGHT — computed equality, not vibes
  const seam = await page.$eval("[data-inspector-region]", (el) => getComputedStyle(el).borderLeftColor);
  const tick = await page.$eval("[data-inspector-tick]", (el) => getComputedStyle(el).color);
  if (seam !== tick) throw new Error(`seam ${seam} ≠ tick ${tick}`);
  // the selected object on the paper wears the same accent (fixture row is
  // the design surface's selected object; its bar rides the wing's color)
  // — assert the token reached the paper: any selected pub identity shows it.
  await page.keyboard.press("Escape");
  await page.click("[data-dial]");
  await page.click("[data-dial-option='customer']");
  await page.waitForSelector("[data-pub-comp='comp-fx-1']");
  await page.click("[data-pub-comp='comp-fx-1'] h4");
  await page.waitForSelector("[data-treatment-toolbar]");
  const shadow = await page.$eval("[data-pub-comp='comp-fx-1']", (el) => getComputedStyle(el).boxShadow);
  if (!shadow.includes("inset")) throw new Error("the selected object has no accent bar");
  // seam color and bar color must be the SAME rgb
  const rgb = seam.replace(/\s/g, "");
  if (!shadow.replace(/\s/g, "").includes(rgb)) throw new Error(`bar (${shadow}) ≠ seam (${seam})`);
  // the warm wash ARRIVES — via the 150ms transition, which this wait proves
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-pub-comp='comp-fx-1']");
    return el && getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)";
  }, { timeout: 2000 }).catch(() => { throw new Error("no warm wash behind the active thing"); });
  await page.keyboard.press("Escape");
  // facet order: the declaration's sequence, then a DIFFERENT declaration
  await page.click("[data-dial]");
  await page.click("[data-dial-option='design']");
  await page.click("[data-fixture-row]");
  await page.waitForSelector("[data-inspector-region] [data-inspector-section='Commercial']");
  const order1 = await page.$$eval("[data-inspector-region] [data-inspector-section]", (xs) => xs.map((x) => x.getAttribute("data-inspector-section")).join(","));
  if (!order1.startsWith("Commercial")) throw new Error(`declared order lost: ${order1}`);
  if (!order1.includes("Media") || !order1.includes("Used in")) throw new Error(`facets missing: ${order1}`);
  await page.evaluate(() => document.querySelector("[data-swap-facets]").click());
  await page.waitForFunction(() => {
    const xs = Array.from(document.querySelectorAll("[data-inspector-region] [data-inspector-section]"));
    return xs.length && xs[0].getAttribute("data-inspector-section") === "Used in";
  });
  const order2 = await page.$$eval("[data-inspector-region] [data-inspector-section]", (xs) => xs.map((x) => x.getAttribute("data-inspector-section")).join(","));
  if (order2 === order1) throw new Error("the Inspector ignores the declaration — order didn't follow it");
  // price is inside Commercial, not a second application
  if (!(await page.$("[data-inspector-section='Commercial'] [data-facet='commercial']"))) throw new Error("price escaped the Commercial group");
  await page.keyboard.press("Escape");
});

await T("P-31 PUBLICATION ELIGIBILITY: restricted truth NEVER reaches the paper; sensitive appears only when shown; required regions make new papers complete automatically", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  await page.click("[data-dial]");
  await page.click("[data-dial-option='customer']");
  // 1 — REQUIRED REGIONS ON: the company header and contact arrive with
  //     no one asking; the new paper is complete automatically.
  await page.waitForSelector("[data-pub-header]");
  const header = await page.textContent("[data-pub-header]");
  if (!header.includes("Event Space by Burger Bar")) throw new Error("the company header lacks the trade name");
  await page.waitForSelector("[data-pub-contact]");
  const contact = await page.textContent("[data-pub-contact]");
  if (!contact.includes("(732) 555-0100")) throw new Error("the contact region lacks the phone");
  // 2 — RESTRICTED: the tax id lives in company TRUTH but must not exist
  //     anywhere on the customer document without explicit enablement.
  const paper = await page.textContent("[data-publication]");
  if (paper.includes("22-1234567")) throw new Error("RESTRICTED FACT LEAKED — the tax id is on the paper");
  // 3 — SENSITIVE: ACH hidden by default; shown only when policy says so.
  if (paper.includes("021000021")) throw new Error("sensitive ACH rendered without being shown");
  if (await page.$("[data-pub-payment]")) throw new Error("payment region rendered with nothing eligible");
  await page.evaluate(() => document.querySelector("[data-show-ach]").click());
  await page.waitForSelector("[data-pub-payment]");
  const pay = await page.textContent("[data-pub-payment]");
  if (!pay.includes("021000021")) throw new Error("shown ACH still absent");
  if (!pay.includes("Bank / ACH instructions")) throw new Error("payment fact lost its label");
  // even now the restricted fact stays out — eligibility is not a mood
  if ((await page.textContent("[data-publication]")).includes("22-1234567"))
    throw new Error("tax id leaked when an unrelated fact was shown");
  // 4 — EXPLICIT EXCEPTION: a version MAY disable a required region.
  await page.click("[data-pub-entry]");
  await page.waitForSelector("[data-pub-region]");
  await page.click("[data-pub-room='regions']");
  await page.waitForSelector("[data-room='regions']");
  await page.click("[data-room-region='header:none']");
  await page.waitForFunction(() => !document.querySelector("[data-pub-header]"));
  await page.keyboard.press("Escape");
});

await T("P-32 PAGE ANATOMY: the paper wears its five named zones; the room reads as anatomy; page-master furniture is reserved out loud", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  await page.click("[data-dial]");
  await page.click("[data-dial-option='customer']");
  // 1 — the paper's zones, in reading order, each claiming its regions
  await page.waitForSelector("[data-page-zone='header']");
  const hz = await page.textContent("[data-page-zone='header']");
  if (!hz.includes("Event Space by Burger Bar")) throw new Error("the header zone doesn't hold the company header");
  const body = await page.$("[data-page-zone='body'] [data-pub-doc]");
  if (!body) throw new Error("the body zone doesn't hold the document opening");
  if (!(await page.$("[data-page-zone='body'] [data-pub-section]"))) throw new Error("the body zone doesn't hold the sections");
  const fz = await page.textContent("[data-page-zone='footer']");
  if (!fz.includes("(732) 555-0100")) throw new Error("the footer zone doesn't hold contact");
  if (!fz.includes("Event Space by Burger Bar")) throw new Error("the footer zone doesn't hold the derived footer line");
  // 2 — decorations: enable the watermark, find it zoned
  await page.click("[data-pub-entry]");
  await page.waitForSelector("[data-pub-region]");
  await page.click("[data-pub-room='regions']");
  await page.waitForSelector("[data-room='regions']");
  await page.click("[data-room-region='watermark:draft']");
  await page.waitForSelector("[data-pub-watermark][data-page-zone='decorations']");
  // 3 — the room reads as anatomy: five zones, page-master reservations,
  //     the sidebar named and inert
  const zones = await page.$$eval("[data-room-zone]", (xs) => xs.map((x) => x.getAttribute("data-room-zone")).join(","));
  if (zones !== "header,body,footer,decorations,sidebar") throw new Error(`the room's anatomy reads ${zones}`);
  const pm = await page.$$eval("[data-room-pagemaster]", (xs) => xs.map((x) => x.textContent));
  if (!pm.some((t) => /page numbers/i.test(t)) || !pm.every((t) => /print/i.test(t)))
    throw new Error("page-master furniture is not reserved out loud");
  if (!(await page.$("[data-room-zone='sidebar'] [data-room-reserved]"))) throw new Error("the sidebar is not named as reserved");
  // no zone in the room offers a buildable control for reserved furniture
  if (await page.$("[data-room-zone='sidebar'] [data-room-region]")) throw new Error("the sidebar offers a buildable control");
  await page.click("[data-room-region='watermark:none']");
  await page.keyboard.press("Escape");
});

await T("P-33 THE PORTABLE STRATUM CAPTURED: 'Save presentation as template…' takes document, regions, and role-keyed section dress — and NOTHING bound", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  await page.click("[data-dial]");
  await page.click("[data-dial-option='customer']");
  // dress the version across BOTH strata first —
  // portable: a section heading; bound: a component title
  await page.click("[data-pub-headstyle]");
  await page.waitForSelector("[data-treatment-toolbar]");
  await page.click("[data-treat='heading:eyebrow']");
  await page.keyboard.press("Escape");
  await page.click("[data-pub-comp='comp-fx-1'] h4");
  await page.waitForSelector("[data-treatment-toolbar][data-treatment-kind='component']");
  await page.click("[data-treat='title:caps']");
  await page.keyboard.press("Escape");
  // capture
  await page.click("[data-pub-entry]");
  await page.waitForSelector("[data-pub-region]");
  await page.click("[data-pub-room='appearance']");
  await page.waitForSelector("[data-room-save-template]");
  await page.evaluate(() => { window.prompt = () => "Autumn Wedding"; });
  await page.click("[data-room-save-template]");
  const captured = await page.evaluate(() => window.__templates);
  if (captured.length !== 1) throw new Error("nothing captured");
  const t = captured[0];
  if (t.name !== "Autumn Wedding") throw new Error("name lost");
  const json = JSON.stringify(t.portable);
  // portable stratum present
  if (!t.portable.sectionDress || !Object.values(t.portable.sectionDress).some((d) => d.heading === "eyebrow"))
    throw new Error("section dress (portable) not captured");
  // bound stratum ABSENT — the wall, measured at the verb
  if (json.includes('"components"') || json.includes('"items"') || json.includes("comp:"))
    throw new Error("BOUND presentation escaped through a presentation-only verb");
  await page.keyboard.press("Escape");
});

await T("P-34 COMPARE PRESENTATION…: five exposures before anything happens; Apply is the closing act; bound dress survives ON THE PAPER; ambiguity gates Apply", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  await page.click("[data-dial]");
  await page.click("[data-dial-option='customer']");
  // give the version BOUND dress first — it must survive the apply
  await page.click("[data-pub-comp='comp-fx-1'] h4");
  await page.waitForSelector("[data-treatment-toolbar][data-treatment-kind='component']");
  await page.click("[data-treat='title:caps']");
  await page.keyboard.press("Escape");
  const titleBefore = await page.$eval("[data-pub-comp='comp-fx-1']", (el) => el.getAttribute("data-pub-comptitle"));
  if (titleBefore !== "caps") throw new Error("fixture bound dress didn't take");
  // open the compare from the template shelf
  await page.click("[data-pub-entry]");
  await page.waitForSelector("[data-pub-region]");
  await page.click("[data-pub-room='appearance']");
  await page.waitForSelector("[data-room-template='tpl-fx-1']");
  await page.click("[data-room-template='tpl-fx-1']");
  await page.waitForSelector("[data-compare-presentation]");
  // 1 — what changes: the accent leaf, both sides visible
  await page.waitForSelector("[data-compare-change='colors.accent']");
  // 2 — what stays bound: the component style is COUNTED here, not changed
  const bound = await page.textContent("[data-compare-bound]");
  if (!bound.includes("1 component style")) throw new Error(`bound not counted: ${bound}`);
  // 3 — unmatched dress waits, named
  await page.waitForSelector("[data-compare-waits='role-ghost']");
  // 4 — missing photo flagged by label
  const miss = await page.textContent("[data-compare-missing-photo='sec-fx-1']");
  if (!miss.includes("lost plate")) throw new Error("missing photo not flagged");
  // 5 — Apply (no ambiguity yet): confirm speaks, paper re-dresses, bound survives
  page.once("dialog", (d) => {
    if (!d.message().includes("Component and item-list styling will remain"))
      throw new Error("the confirm abandoned the constitutional wording");
    void d.accept();
  });
  await page.click("[data-compare-apply]");
  await page.waitForSelector("[data-pub-headstyle='eyebrow']");            // portable arrived
  const titleAfter = await page.$eval("[data-pub-comp='comp-fx-1']", (el) => el.getAttribute("data-pub-comptitle"));
  if (titleAfter !== "caps") throw new Error("BOUND DRESS DIED IN THE APPLY — the wall failed on the paper");
  const applied = await page.evaluate(() => window.__applied);
  const prov = applied[0]?.provenance;
  if (!prov || prov.template_id !== "tpl-fx-1" || prov.mode !== "midflight" || !prov.fingerprint)
    throw new Error("provenance not recorded at application");
  // 6 — ambiguity gates Apply until decided
  await page.evaluate(() => document.querySelector("[data-ambig-twin]").click());
  await page.click("[data-pub-entry]");
  await page.waitForSelector("[data-pub-region]");
  await page.click("[data-pub-room='appearance']");
  await page.click("[data-room-template='tpl-fx-1']");
  await page.waitForSelector("[data-compare-ambiguous='sec-fx-1']");
  if (!(await page.$eval("[data-compare-apply]", (el) => el.disabled))) throw new Error("Apply enabled with an undecided mapping");
  await page.click("[data-compare-choice='sec-fx-1:all']");
  await page.waitForFunction(() => !document.querySelector("[data-compare-apply]").disabled);
  await page.click("[data-compare-close]");
  await page.keyboard.press("Escape");
});

await T("P-36 THE PRINT RENDERER IN A REAL BROWSER: compose→paginate→impose→PDF with BRAND FACES (fontsource metrics) — real bytes, honest provenance, client-side", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-line]");
  await page.evaluate(() => document.querySelector("[data-render-pdf]").click());
  await page.waitForFunction(() => !!window.__pdf, { timeout: 15000 });
  const pdf = await page.evaluate(() => window.__pdf);
  if (pdf.head !== "%PDF-") throw new Error(`not a PDF in the browser: ${pdf.head}`);
  if (pdf.pages < 1) throw new Error("no pages");
  if (pdf.provenance.engineVersion !== "renderer-1") throw new Error("engine version missing");
  if (!pdf.provenance.generatedAt) throw new Error("provenance incomplete");
  // PR-5 — the brand faces measured and drew this: the metrics swap, live in Chromium
  if (pdf.provenance.metricsVersion !== "fontsource-1")
    throw new Error(`brand metrics didn't govern the browser render: ${pdf.provenance.metricsVersion}`);
  if (pdf.provenance.sourceFingerprint !== "harness-stamp") throw new Error("fingerprint lost");
  // PR-6 — proof in the browser: the outline exists; if the render spans
  // pages, page two SPEAKS its number in the constitutional wording
  if (pdf.outline < 1) throw new Error("no digital contents");
  if (pdf.pages > 1 && !/^Page 2 of \d+$/.test(pdf.secondPageNumber ?? ""))
    throw new Error(`page two doesn't speak: ${pdf.secondPageNumber}`);
});

await browser.close(); server.close();
console.log(`\naccept-paper: ${passed} passed, ${failed} failed${variant ? "  (VARIANT — P-5 must FAIL or the suite has no teeth)" : ""}`);
process.exit((variant || variantPub || variantNoFonts) ? (failed > 0 ? 0 : 1) : (failed === 0 ? 0 : 1));
