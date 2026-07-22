// PL-3 PHASE A ACCEPTANCE — the Publish door's observable law, real Chromium,
// the real PublishDoor component. The claims:
//   prepare-first    → PU-1 (unprepared: only Prepare; no publish affordance)
//   two evidence bases → PU-2 (prepared+ready: observed publish AND attest offered)
//   attest demands a note → PU-3 (attest arms, requires a note, fires once with it)
//   archive honesty  → PU-4 (archive missing shown on the door; a publish attempt
//                      surfaces the honest block — no false "sent")
//   sealed is sealed → PU-5 (published: the sealed card shows, and NO edit
//                      affordance exists — only "new version" language)
//   observed fires once → PU-6 (the observed publish records exactly one act)
// Seal-biting variant (--variant): a sealed version that exposes an edit
// affordance must FAIL PU-5.
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const variant = process.argv.includes("--variant");
const js = variant ? "publish.variant.js" : "publish.harness.js";
const server = createServer((req, res) => {
  const routes = { "/": ["publish.html", "text/html"],
    "/publish.harness.js": [js, "text/javascript"],
    "/app.css": ["app.css", "text/css"] };
  const r = routes[req.url.split("?")[0]];
  if (!r) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": r[1] }); res.end(readFileSync(join(here, r[0])));
});
await new Promise((ok) => server.listen(4198, ok));
const browser = await chromium.launch();
const page = await browser.newPage();
let passed = 0, failed = 0;
const T = async (name, fn) => {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
};
const acts = () => page.evaluate(() => window.__acts);

await T("PU-1 unprepared: only the Prepare affordance exists — no publish button before an artifact is staged", async () => {
  await page.goto("http://localhost:4198/?mode=prepare");
  await page.waitForSelector("[data-publish-door]");
  if (!(await page.$("[data-prepare]"))) throw new Error("Prepare affordance missing");
  if (await page.$("[data-publish-observed]")) throw new Error("a publish button exists before preparation");
});

await T("PU-2 prepared and ready: both Phase-A evidence bases are offered — observed publish and attested in-person", async () => {
  await page.goto("http://localhost:4198/?mode=ready");
  await page.waitForSelector("[data-publish-observed]");
  if (!(await page.$("[data-publish-attest]"))) throw new Error("attested basis not offered");
  if (!(await page.$("[data-prep-archive]"))) throw new Error("archive status not shown");
});

await T("PU-3 attestation arms, requires a note, and fires once with it", async () => {
  await page.goto("http://localhost:4198/?mode=ready");
  await page.click("[data-publish-attest]");
  await page.waitForSelector("[data-attest-note]");
  if ((await page.getAttribute("[data-attest-commit]", "disabled")) === null)
    throw new Error("commit enabled with an empty note");
  await page.fill("[data-attest-note]", "shown at the tasting");
  await page.click("[data-attest-commit]");
  const a = await acts();
  if (a.join(",") !== "publish:attested:shown at the tasting") throw new Error(`acts: ${a}`);
});

await T("PU-4 archive honesty: a missing archive is shown on the door, and a publish attempt surfaces the honest block — never a false 'sent'", async () => {
  await page.goto("http://localhost:4198/?mode=noarchive");
  await page.waitForSelector("[data-prep-archive]");
  const txt = await page.textContent("[data-prep-archive]");
  if (!/missing/i.test(txt)) throw new Error(`archive status not honest: ${txt}`);
  await page.click("[data-publish-observed]");
  await page.waitForSelector("[data-publish-refusal]");
  const refusal = await page.textContent("[data-publish-refusal]");
  if (!/blocked|isn't ready/i.test(refusal)) throw new Error(`no honest block: ${refusal}`);
});

await T("PU-5 sealed is sealed: a published offer shows the sealed card and offers NO edit affordance — only new-version language", async () => {
  await page.goto("http://localhost:4198/?mode=sealed");
  await page.waitForSelector("[data-publish-sealed]");
  const note = await page.textContent("[data-sealed-note]");
  if (!/new version/i.test(note)) throw new Error("sealed card must point to a new version");
  // no edit affordances of any kind on a sealed offer
  const edits = await page.$$("[data-publish-sealed] input, [data-publish-sealed] textarea, [data-publish-sealed] [data-edit]");
  if (edits.length !== 0) throw new Error(`a sealed offer exposes ${edits.length} edit affordance(s)`);
  if (await page.$("[data-prepare]")) throw new Error("a sealed offer still offers Prepare");
});

await T("PU-6 the observed publish records exactly one act", async () => {
  await page.goto("http://localhost:4198/?mode=ready");
  await page.waitForSelector("[data-publish-observed]");
  await page.click("[data-publish-observed]");
  const a = await acts();
  if (a.join(",") !== "publish:observed") throw new Error(`acts: ${a}`);
});

await browser.close(); server.close();
console.log(`\naccept-publish: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
