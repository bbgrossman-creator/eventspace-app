// ═══════════════════════════════════════════════════════════════════════════
// ITEM REPARENTING & CREATION — regression suite (found in live use)
// Bug record: cancelling or failing a drop AFTER a destination category had
// opened froze the Studio in drag state until refresh. Convicted cause: the
// source category's list UNMOUNTED when a destination opened; Chromium
// delivers dragend to the original source node, so no node → no dragend → no
// cleanup. (A re-mounted copy does not help: new node ≠ captured node.)
// Fix: the source category collapses by CSS only (display:none) — same nodes,
// dragend always has a home. Against pre-fix code this suite fails T3/T4.
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node harness/accept-items.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync } from "fs";
const server = createServer((req, res) => {
  const m = { "/": "index.html", "/app.js": "app.js", "/app.css": "app.css" }[req.url.split("?")[0]];
  if (!m) { res.writeHead(404); return res.end(); }
  res.writeHead(200); res.end(readFileSync("harness/" + m));
});
await new Promise((ok) => server.listen(4192, ok));
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
let pass = 0, fail = 0;
const T = async (name, fn) => { try { await fn(); pass++; console.log(`PASS ${name}`); }
  catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); } };
const fresh = async () => {
  await page.goto("http://localhost:4192/");
  await page.waitForSelector('[data-node-id="it-spicy"]');
  await page.evaluate(() => { window.__lastDrop = null; });
};
async function startDrag(id) {
  await page.locator(`[data-node-id="${id}"]`).hover();
  const g = await page.locator(`[data-node-id="${id}"] [data-grip]`).boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + 45, g.y + 12, { steps: 6 });
}
async function dwell(catKey) {
  const hdr = await page.locator(`[data-cat-header="${catKey}"]`).boundingBox();
  await page.mouse.move(hdr.x + 70, hdr.y + 10, { steps: 8 });
  await page.waitForTimeout(850);
}
async function dropOn(sel) {
  const t = await page.locator(sel).first().boundingBox();
  if (!t) throw new Error(`drop target not visible: ${sel}`);
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 6 });
  await page.waitForTimeout(120);
  await page.mouse.up();
}
const lastDrop = () => page.evaluate(() => window.__lastDrop);
const CLASSIC = "comp-sushi::classic", SIG = "comp-sushi::sig";

await T("T1 cross-category drop BETWEEN items lands with the right insertion point", async () => {
  await fresh();
  await startDrag("it-spicy"); await dwell(CLASSIC);
  await dropOn(`[data-cat-list="${CLASSIC}"] [data-band-label="Drop here"]`);
  const d = await lastDrop();
  if (!d || d.id !== "it-spicy" || d.to !== CLASSIC || !d.before) throw new Error(JSON.stringify(d));
});

await T("T2 a SECOND drag to the SAME destination works (no stale dwell state)", async () => {
  await startDrag("it-cali"); await dwell(CLASSIC);
  await dropOn(`[data-cat-list="${CLASSIC}"] [data-band-label="Drop here"]`);
  const d = await lastDrop();
  if (!d || d.id !== "it-cali" || d.to !== CLASSIC) throw new Error(JSON.stringify(d));
});

await T("T3 cancelled drag AFTER destination opened cleans up fully — no freeze, no refresh", async () => {
  await fresh();
  await startDrag("it-sweet"); await dwell(CLASSIC);
  await page.mouse.move(30, 860, { steps: 6 });   // dead space
  await page.mouse.up();
  await page.waitForTimeout(350);
  const live = await page.getAttribute("[data-drag-live]", "data-drag-live").catch(() => null);
  if (live) throw new Error(`drag state stuck: data-drag-live=${live}`);
  const sig = await page.$$eval(`[data-cat-list="${SIG}"] [data-node-id]`,
    (xs) => xs.filter((x) => x.offsetParent !== null).length);
  if (sig < 3) throw new Error(`source items not restored (${sig} visible)`);
});

await T("T4 there-and-back: Signature → Classic, then Classic → Signature, after a cancel", async () => {
  await startDrag("it-spicy"); await dwell(CLASSIC);
  await dropOn(`[data-cat-list="${CLASSIC}"] [data-band-label="Drop at end"]`);
  let d = await lastDrop();
  if (!d || d.to !== CLASSIC) throw new Error(`outbound: ${JSON.stringify(d)}`);
  await startDrag("it-avo"); await dwell(SIG);
  await dropOn(`[data-cat-list="${SIG}"] [data-band-label="Drop at end"]`);
  d = await lastDrop();
  if (!d || d.id !== "it-avo" || d.to !== SIG) throw new Error(`return: ${JSON.stringify(d)}`);
});

await T("T5 add-item: two entry points, one command; category key carried by both", async () => {
  await fresh();
  await page.evaluate(() => { window.__added = null; });
  const bottom = page.locator(`[data-add-item="${CLASSIC}"]`);
  if (!(await bottom.isVisible())) throw new Error("bottom affordance not visible at rest");
  await bottom.click();
  let added = await page.evaluate(() => window.__added);
  if (!added || added.categoryKey !== "classic" || added.componentId !== "comp-sushi")
    throw new Error(`bottom payload: ${JSON.stringify(added)}`);
  // header entry point: revealed on hover, same command
  await page.evaluate(() => { window.__added = null; });
  await page.locator(`[data-cat-header="${CLASSIC}"]`).hover();
  const header = page.locator(`[data-add-item-header="${CLASSIC}"]`);
  await header.waitFor({ state: "visible" });
  await header.click();
  added = await page.evaluate(() => window.__added);
  if (!added || added.categoryKey !== "classic") throw new Error(`header payload: ${JSON.stringify(added)}`);
});

await T("T6 hiding is scoped: an ITEM drag hides add-item; a COMPONENT drag does not", async () => {
  await fresh();
  const btn = page.locator(`[data-add-item="${CLASSIC}"]`);
  // item drag hides
  await startDrag("it-spicy");
  if (await btn.isVisible()) throw new Error("visible during an item drag");
  await page.mouse.move(30, 860, { steps: 4 }); await page.mouse.up();
  await page.waitForTimeout(300);
  // component drag: FOCUS MODE folds every component body wholesale — the
  // affordance disappears WITH its container, never by its own rule. The
  // contract: no independent suppression, and instant return when the
  // container returns.
  await page.locator('[data-node-id="comp-carving"]').hover();
  const g = await page.locator('[data-node-id="comp-carving"] [data-grip]').boundingBox();
  await page.mouse.move(g.x + 5, g.y + 5); await page.mouse.down();
  await page.mouse.move(g.x + 50, g.y + 14, { steps: 6 });
  const live = await page.getAttribute("[data-drag-live]", "data-drag-live");
  if (live !== "component") throw new Error(`expected component drag, got ${live}`);
  const bodyFolded = !(await page.locator(`[data-cat-list="${CLASSIC}"]`).isVisible().catch(() => false));
  if (!bodyFolded) {
    // if the body IS visible during a component drag, the button must be too —
    // that is the "no independent suppression" clause
    if (!(await btn.isVisible())) throw new Error("independently hidden by an unrelated component drag");
  }
  await page.mouse.move(30, 860, { steps: 4 }); await page.mouse.up();
  await page.waitForTimeout(350);
  if (!(await btn.isVisible())) throw new Error("did not return with its container after the drag");
});

console.log(fail === 0 ? `═══ ${pass}/${pass} PASSED ═══` : `═══ ${fail} FAILED of ${pass + fail} ═══`);
await b.close(); server.close(); process.exit(fail === 0 ? 0 : 1);
