// repro-items.mjs — CONVICTION RUN for the live cross-category reparent bug.
// Three scenarios, real mouse. Expected against current code: 1 passes,
// 2 and 3 fail — convicting the stale dwell-timer ref and the lost dragend.
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync } from "fs";
const server = createServer((req, res) => {
  const m = { "/": "index.html", "/app.js": "app.js", "/app.css": "app.css" }[req.url.split("?")[0]];
  if (!m) { res.writeHead(404); return res.end(); }
  res.writeHead(200); res.end(readFileSync("harness/" + m));
});
await new Promise((ok) => server.listen(4190, ok));
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const log = (...a) => console.log(...a);

async function grip(id) {
  const row = page.locator(`[data-node-id="${id}"]`);
  await row.hover();
  const g = page.locator(`[data-node-id="${id}"] [data-grip]`);
  await g.waitFor({ state: "visible" });
  return (await g.boundingBox());
}
async function dragItemTo(itemId, destSelector, { dwellOn = null, drop = true } = {}) {
  const g = await grip(itemId);
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + 40, g.y + 10, { steps: 6 });       // exceed threshold
  if (dwellOn) {
    const hdr = await page.locator(dwellOn).boundingBox();
    await page.mouse.move(hdr.x + hdr.width / 2, hdr.y + hdr.height / 2, { steps: 8 });
    await page.waitForTimeout(850);                               // dwell > 700ms
  }
  if (drop && destSelector) {
    const tgt = await page.locator(destSelector).first().boundingBox();
    if (!tgt) return { dropped: false, reason: "target never rendered" };
    await page.mouse.move(tgt.x + tgt.width / 2, tgt.y + tgt.height / 2, { steps: 6 });
    await page.waitForTimeout(120);
    await page.mouse.up();
    return { dropped: true };
  }
  // cancel: release over dead space
  await page.mouse.move(30, 850, { steps: 6 });
  await page.mouse.up();
  return { dropped: false, reason: "cancelled" };
}
const dragStateStuck = () => page.evaluate(() =>
  !!document.querySelector("[data-drag-live]") ||
  [...document.querySelectorAll("[data-cat-collapsed]")].length > 0);

await page.goto("http://localhost:4190/");
await page.waitForSelector('[data-node-id="it-spicy"]');

// ── 1. First cross-category drop, between items ──
let drops = 0;
await page.exposeFunction("__onDropCount", () => drops++);
await page.evaluate(() => { window.__drops = 0; document.addEventListener("des-drop", () => window.__drops++); });
let r = await dragItemTo("it-spicy", '[data-cat-list="comp-sushi::classic"] [data-band-label="Drop here"]',
  { dwellOn: '[data-cat-header="comp-sushi::classic"]' });
const moved1 = await page.evaluate(() => window.__lastDrop ?? null);
log("S1 first drop:", JSON.stringify({ ...r, lastDrop: moved1 }));

// ── 2. SECOND drag to the SAME destination (stale timer suspect) ──
await page.waitForTimeout(300);
r = await dragItemTo("it-cali", '[data-cat-list="comp-sushi::classic"] [data-band-label="Drop here"]',
  { dwellOn: '[data-cat-header="comp-sushi::classic"]' });
const moved2 = await page.evaluate(() => window.__lastDrop ?? null);
log("S2 second drop, same destination:", JSON.stringify({ ...r, lastDrop: moved2 }));

// ── 3. Cancelled drag AFTER destination opened (lost-dragend suspect) ──
await page.waitForTimeout(300);
await dragItemTo("it-sweet", null, { dwellOn: '[data-cat-header="comp-sushi::classic"]', drop: false });
await page.waitForTimeout(400);
const stuck = await page.evaluate(() => ({
  liveAttr: !!document.querySelector("[data-drag-live]"),
  bodyText: document.body.innerText.includes("Drop here"),
  sigItemsVisible: !!document.querySelector('[data-node-id="it-cali"]') || !!document.querySelector('[data-node-id="it-sweet"]'),
}));
log("S3 after cancelled drag:", JSON.stringify(stuck));
// a follow-up drag should still work if state cleared
r = await dragItemTo("it-avo", '[data-cat-list="comp-sushi::sig"] [data-band-label="Drop at end"]',
  { dwellOn: '[data-cat-header="comp-sushi::sig"]' });
const moved4 = await page.evaluate(() => window.__lastDrop ?? null);
log("S3b drag after cancel:", JSON.stringify({ ...r, lastDrop: moved4 }));
await b.close(); server.close(); process.exit(0);
