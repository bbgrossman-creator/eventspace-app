// v213 acceptance — the Live Lens region's structural claims, real Chromium.
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const here = dirname(fileURLToPath(import.meta.url));
const server = createServer((req, res) => {
  const routes = { "/": ["shell.html", "text/html"],
    "/shell.harness.js": ["shell.harness.js", "text/javascript"],
    "/app.css": ["app.css", "text/css"] };
  const r = routes[req.url.split("?")[0]];
  if (!r) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": r[1] }); res.end(readFileSync(join(here, r[0])));
});
await new Promise((ok) => server.listen(4189, ok));
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 900, height: 700 } })).newPage();
let passed = 0, failed = 0;
const T = async (name, fn) => { try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); } };

await T("SH-1 the panel names what it projects and marks itself read-only", async () => {
  await page.goto("http://localhost:4189/?mode=content");
  await page.waitForSelector("[data-live-lens]");
  const label = await page.textContent("[data-live-lens-label]");
  if (label !== "Customer") throw new Error(`label: ${label}`);
  const ro = await page.textContent("[data-live-lens-readonly]");
  if (!ro.includes("read-only")) throw new Error(`marker: ${ro}`);
});
await T("SH-2 the panel's own markup contributes ZERO interactive controls — read-only structurally", async () => {
  await page.goto("http://localhost:4189/?mode=content");
  await page.waitForSelector("[data-live-lens]");
  const n = await page.$$eval("[data-live-lens] button, [data-live-lens] input, [data-live-lens] select, [data-live-lens] textarea", (x) => x.length);
  if (n !== 0) throw new Error(`${n} controls in the panel's chrome`);
});
await T("SH-3 empty is information: the reason renders, nothing simulated", async () => {
  await page.goto("http://localhost:4189/?mode=empty");
  await page.waitForSelector("[data-live-lens-empty]");
  const t = await page.textContent("[data-live-lens-empty]");
  if (!t.includes("appears here as you build")) throw new Error(`empty: ${t}`);
});
await T("SH-4 the projection renders inside the panel's scroll region", async () => {
  await page.goto("http://localhost:4189/?mode=content");
  await page.waitForSelector("[data-live-lens] [data-fixture-proposal]");
});
await T("SH-5 (v214) a hosted switcher lives in the HEADER; the content region stays control-free", async () => {
  await page.goto("http://localhost:4189/?mode=switcher");
  await page.waitForSelector("[data-live-lens-header] [data-fixture-switch]");
  const inContent = await page.$$eval(
    "[data-live-lens-content] button, [data-live-lens-content] input, [data-live-lens-content] select, [data-live-lens-content] textarea",
    (x) => x.length);
  if (inContent !== 0) throw new Error(`${inContent} controls inside the projection region`);
});
await browser.close(); server.close();
console.log(`\naccept-shell: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
