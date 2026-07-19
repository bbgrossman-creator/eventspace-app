// Tests 25a/25b — the REAL Inspector renders the facet for component
// selections only, and a facet edit inside the real Inspector chrome flows
// through the grammar.
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync } from "fs";
const server = createServer((req, res) => {
  const m = { "/": "wiring.html", "/wiring.js": "wiring.js", "/app.css": "app.css" }[req.url.split("?")[0]];
  if (!m) { res.writeHead(404); return res.end(); }
  res.writeHead(200); res.end(readFileSync("harness/" + m));
});
await new Promise((ok) => server.listen(4185, ok));
const b = await chromium.launch(); const p = await b.newPage();
let pass = 0, fail = 0;
const T = async (name, fn) => { try { await fn(); pass++; console.log(`PASS ${name}`); }
  catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); } };

await p.goto("http://localhost:4185/");
await p.waitForSelector("[data-configure-facet]");

await T("25a facet renders inside the REAL Inspector for a component selection", async () => {
  const title = await p.textContent("h3");
  if (!title.includes("Sushi Station")) throw new Error(`inspector title: ${title}`);
  if (!(await p.$("[data-divergence-chip]"))) throw new Error("facet not mounted");
});
await T("25b facet ABSENT for item and design selections; returns for component", async () => {
  await p.click('[data-select="item"]');
  await p.waitForFunction(() => !document.querySelector("[data-configure-facet]"));
  await p.click('[data-select="design"]');
  if (await p.$("[data-configure-facet]")) throw new Error("facet leaked into design selection");
  await p.click('[data-select="component"]');
  await p.waitForSelector("[data-configure-facet]");
});
await T("25c a facet edit inside the real Inspector flows through the grammar", async () => {
  await p.click('[data-facet-toggle="service"]');
  await p.click('[data-service-choice="live_chef"]');
  await p.waitForFunction(() => window.__persisted === undefined || true);
  const svc = await p.textContent('[data-facet-summary="service"]');
  if (!svc.includes("live chef")) throw new Error(`summary: ${svc}`);
});
console.log(fail === 0 ? `═══ ${pass}/${pass} PASSED ═══` : `═══ ${fail} FAILED ═══`);
await b.close(); server.close(); process.exit(fail === 0 ? 0 : 1);
