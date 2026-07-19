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
// Regression: node browser-tests/accept-paper.mjs --variant   (expects P-5 FAIL)
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
const js = variant ? "paper.variant.js" : "paper.harness.js";
const server = createServer((req, res) => {
  const routes = { "/": ["paper.html", "text/html"],
    "/paper.harness.js": [js, "text/javascript"],
    "/app.css": ["app.css", "text/css"] };
  const r = routes[req.url.split("?")[0]];
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
await T("P-3 the drawer never reflows the Paper — measured", async () => {
  const before = await box("[data-paper]");
  await page.click("[data-fixture-row]");
  await page.waitForSelector("[data-drawer]");
  const during = await box("[data-paper]");
  if (Math.abs(before.x - during.x) > 1 || Math.abs(before.width - during.width) > 1)
    throw new Error(`paper moved: ${before.x}/${before.width} → ${during.x}/${during.width}`);
  await page.keyboard.press("Escape");
  await absent("[data-drawer]", "drawer survived Esc");
  await page.mouse.move(680, 600);    // neutral point — off the ghost's hover margin
  await page.click("[data-fixture-row]");
  await page.waitForSelector("[data-drawer]");
  await page.mouse.click(680, 800);   // click-away onto the stage, clear of the left margin
  await absent("[data-drawer]", "drawer survived click-away");
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
  if (label !== "Customer") throw new Error(`choice persisted: ${label}`);
});
await T("P-6 the meter: floating facts; debt travels into the drawer", async () => {
  await page.goto("http://localhost:4193/");
  await page.waitForSelector("[data-meter]");
  const total = await page.textContent("[data-meter-total]");
  if (!total.includes("18000") && !total.includes("18,000")) throw new Error(`total: ${total}`);
  await page.click("[data-meter-debt]");
  await page.waitForSelector("[data-drawer]");
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
  await page.waitForSelector("[data-drawer]");
  await page.keyboard.press("Escape");
  await absent("[data-drawer]", "drawer survived");
  if (!(await page.$("[data-ghost-panel]"))) throw new Error("Esc fell through and closed the ghost too");
  await page.keyboard.press("Escape");
  await absent("[data-ghost-panel]", "ghost survived the second Esc");
});

await browser.close(); server.close();
console.log(`\naccept-paper: ${passed} passed, ${failed} failed${variant ? "  (VARIANT — P-5 must FAIL or the suite has no teeth)" : ""}`);
process.exit(variant ? (failed > 0 ? 0 : 1) : (failed === 0 ? 0 : 1));
