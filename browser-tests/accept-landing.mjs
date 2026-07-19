// ═══════════════════════════════════════════════════════════════════════════
// v216 ACCEPTANCE — the landing decision + the Library's gesture rows, real
// Chromium, real components (landing.harness.tsx). The claims:
//   never a silent merge → D-1 (the decision open = ZERO commits recorded;
//                          THE VARIANT'S TARGET: a copy that commits on
//                          mount — the silent merge mechanized — must fail)
//   the three options    → D-2 (Add commits add, once)
//   Replace confirms     → D-3 (option arms a confirm; Back = nothing
//                          committed; only the confirm fires replace)
//   Choose is exact      → D-4 (empty choice can't commit; subset commits
//                          exactly the chosen ids)
//   Cancel is free       → D-5 (cancel commits nothing but cancel)
//   gesture: blueprint   → D-6 (REAL mouse drag of the blueprint card onto
//                          the canvas → text/eventcore-blueprint payload —
//                          the drop is a request the host routes)
//   gesture: component   → D-7 (identity card drags the identity payload —
//                          v215's L-6 debt, paid at gesture level)
//   click path exists    → D-8 (↵ on the blueprint card fires onLandDesign —
//                          every drag has a click path)
// Run:      PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-landing.mjs
// Regression: node browser-tests/accept-landing.mjs --variant   (expects D-1 FAIL)
// Variant build (patched LandingDecision INSIDE src, auto-firing onAdd on
// mount — transient, never shipped):
//   mkdir -p src/components/studio/__variant__
//   python3 - <<'PY'
//   s = open("src/components/studio/LandingDecision.tsx").read()
//   s = s.replace('import React, { useState } from "react";',
//                 'import React, { useState, useEffect } from "react";')
//   s = s.replace('const [mode, setMode] = useState<"decide" | "confirmReplace" | "choose">("decide");',
//                 'const [mode, setMode] = useState<"decide" | "confirmReplace" | "choose">("decide");\n  useEffect(() => { props.onAdd(); }, []);')
//   open("src/components/studio/__variant__/LandingDecision.autocommit.tsx","w").write(s)
//   PY
//   npx esbuild browser-tests/landing.harness.tsx --bundle --outfile=browser-tests/landing.variant.js \
//     --jsx=automatic --define:process.env.NODE_ENV='"development"' \
//     --alias:@/components/studio/LandingDecision=./src/components/studio/__variant__/LandingDecision.autocommit.tsx \
//     --alias:@=./src
// Main build: same command minus the variant alias → landing.harness.js.
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const variant = process.argv.includes("--variant");
const js = variant ? "landing.variant.js" : "landing.harness.js";
const server = createServer((req, res) => {
  const routes = { "/": ["landing.html", "text/html"],
    "/landing.harness.js": [js, "text/javascript"],
    "/app.css": ["app.css", "text/css"] };
  const r = routes[req.url.split("?")[0]];
  if (!r) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": r[1] }); res.end(readFileSync(join(here, r[0])));
});
await new Promise((ok) => server.listen(4192, ok));
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1100, height: 780 } })).newPage();
let passed = 0, failed = 0;
const T = async (name, fn) => { try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); } };
const commits = () => page.evaluate(() => window.__commits);

// Real mouse drag, v197 doctrine: press, move in steps, release.
async function dragTo(fromSel, toSel) {
  const from = await (await page.waitForSelector(fromSel)).boundingBox();
  const to = await (await page.waitForSelector(toSel)).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(
      from.x + ((to.x + to.width / 2 - from.x) * i) / 8,
      from.y + ((to.y + to.height / 2 - from.y) * i) / 8, { steps: 3 });
  }
  await page.mouse.up();
}

await T("D-1 the decision open commits NOTHING — never a silent merge", async () => {
  await page.goto("http://localhost:4192/?mode=decision");
  await page.waitForSelector("[data-landing]");
  await page.waitForTimeout(150);
  const c = await commits();
  if (c.length !== 0) throw new Error(`commits on open: ${c}`);
  for (const t of ["add", "replace", "choose"]) {
    if (!(await page.$(`[data-landing-option='${t}']`))) throw new Error(`option ${t} missing`);
  }
});
await T("D-2 Add commits add, exactly once", async () => {
  await page.click("[data-landing-option='add']");
  await page.waitForSelector("[data-landing-closed]");
  const c = await commits();
  if (c.join(",") !== "add") throw new Error(`commits: ${c}`);
});
await T("D-3 Replace arms a confirm; Back is free; only the confirm commits", async () => {
  await page.goto("http://localhost:4192/?mode=decision");
  await page.waitForSelector("[data-landing]");
  await page.click("[data-landing-option='replace']");
  await page.waitForSelector("[data-landing-confirm]");
  if ((await commits()).length !== 0) throw new Error("arming the confirm committed something");
  await page.click("[data-landing-confirm-back]");
  await page.waitForSelector("[data-landing-option='replace']");
  if ((await commits()).length !== 0) throw new Error("backing out committed something");
  await page.click("[data-landing-option='replace']");
  await page.click("[data-landing-confirm-replace]");
  await page.waitForSelector("[data-landing-closed]");
  const c = await commits();
  if (c.join(",") !== "replace") throw new Error(`commits: ${c}`);
});
await T("D-4 Choose: empty choice cannot commit; a subset commits exactly the chosen ids", async () => {
  await page.goto("http://localhost:4192/?mode=decision");
  await page.waitForSelector("[data-landing]");
  await page.click("[data-landing-option='choose']");
  await page.waitForSelector("[data-landing-pick='src-1']");
  const disabled = await page.getAttribute("[data-landing-choose-commit]", "disabled");
  if (disabled === null) throw new Error("empty choice was committable");
  await page.click("[data-landing-pick='src-1']");
  await page.click("[data-landing-pick='src-3']");
  await page.click("[data-landing-choose-commit]");
  await page.waitForSelector("[data-landing-closed]");
  const c = await commits();
  if (c.join(",") !== "choose:src-1,src-3") throw new Error(`commits: ${c}`);
});
await T("D-5 Cancel lands nothing", async () => {
  await page.goto("http://localhost:4192/?mode=decision");
  await page.waitForSelector("[data-landing]");
  await page.click("[data-landing-cancel]");
  await page.waitForSelector("[data-landing-closed]");
  const c = await commits();
  if (c.join(",") !== "cancel") throw new Error(`commits: ${c}`);
});
await T("D-6 REAL drag: the blueprint card lands its declared payload on the canvas", async () => {
  await page.goto("http://localhost:4192/?mode=drag");
  await page.waitForSelector("[data-knowledge-strip]");
  await page.fill("input", "elegant");
  await page.waitForSelector("[data-library-rail='fx-menu'] button");
  await dragTo("[data-library-rail='fx-menu'] button", "[data-fixture-canvas]");
  await page.waitForSelector("[data-received]");
  const got = await page.$$eval("[data-received]", (xs) => xs.map((x) => x.textContent));
  const hit = got.filter((g) => g.indexOf("drop-blueprint:") === 0)[0];
  if (!hit) throw new Error(`received: ${got}`);
  const payload = JSON.parse(hit.slice("drop-blueprint:".length));
  if (payload.blueprintId !== "m1" || payload.name !== "Elegant Wedding") throw new Error(hit);
});
await T("D-7 REAL drag: the component card lands the identity payload (v215's L-6 debt, paid)", async () => {
  await dragTo("[data-library-rail='fx-station'] button", "[data-fixture-canvas]");
  await page.waitForFunction(() =>
    Array.prototype.some.call(document.querySelectorAll("[data-received]"),
      (x) => x.textContent.indexOf("drop-identity:") === 0));
  const got = await page.$$eval("[data-received]", (xs) => xs.map((x) => x.textContent));
  const hit = got.filter((g) => g.indexOf("drop-identity:") === 0)[0];
  const payload = JSON.parse(hit.slice("drop-identity:".length));
  if (payload.identityId !== "s1") throw new Error(hit);
});
await T("D-8 every drag has a click path: ↵ on the blueprint card fires the landing host", async () => {
  await page.goto("http://localhost:4192/?mode=drag");
  await page.waitForSelector("[data-knowledge-strip]");
  await page.fill("input", "elegant wedding");
  await page.waitForSelector("[data-library-rail='fx-menu'] button");
  await page.press("input", "Enter");
  await page.waitForSelector("[data-received]");
  const got = await page.$$eval("[data-received]", (xs) => xs.map((x) => x.textContent));
  if (got.filter((g) => g === "land-click:m1:Elegant Wedding").length !== 1) throw new Error(`received: ${got}`);
});

await browser.close(); server.close();
console.log(`\naccept-landing: ${passed} passed, ${failed} failed${variant ? "  (VARIANT — D-1 must FAIL or the suite has no teeth)" : ""}`);
process.exit(variant ? (failed > 0 ? 0 : 1) : (failed === 0 ? 0 : 1));
