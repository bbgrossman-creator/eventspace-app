// v312 EVENT WORKSPACE ACCEPTANCE — the REAL mounted Event Workspace shell in
// Chromium over fixtures shaped like the certified reads it consumes.
//
// Claims:
//   EW-1  the Event header states the Product Event's own name and reference
//   EW-2  zero Functions → no Function selector, and none is invented
//   EW-3  one Function → no pointless selector, but its facts are shown
//   EW-4  many Functions → All Functions plus one choice per Function
//   EW-5  generic entry (no context in the address) → All Functions
//   EW-6  an explicit Function context selects that Function
//   EW-7  an unknown or foreign Function context returns safely to All Functions
//   EW-8  Product Event identity is unchanged when Function context changes
//   EW-9  the selected Function shows its own authoritative facts
//   EW-10 a Function with no execution record stays visible and says so
//   EW-11 All Functions composes siblings, each attributed and separate
//   EW-12 no aggregate Event progress / readiness / lifecycle figure is rendered
//   EW-13 a released Function reads ITS OWN execution record, by id
//   EW-14 no storage API is read or written — a remembered default is impossible
//
// NO DATABASE. v312 deploys no SQL object; this suite never opens psql.
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-events-workspace.mjs
import esbuild from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const PORT = 4312;

const aliasPlugin = {
  name: "alias",
  setup(b) {
    // v312 binds its OWN data layer: no v311 regression asset is touched.
    b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: join(here, "events-mock-supabase.ts") }));
    b.onResolve({ filter: /^@\// }, (args) => {
      const base = join(root, "src", args.path.slice(2));
      for (const ext of [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"]) {
        if (existsSync(base + ext)) return { path: base + ext };
      }
      return { path: base };
    });
  },
};

const built = await esbuild.build({
  entryPoints: [join(here, "events-workspace.harness.tsx")],
  bundle: true, write: false, format: "iife", jsx: "automatic",
  loader: { ".ts": "ts", ".tsx": "tsx" }, plugins: [aliasPlugin], logLevel: "silent",
});
const js = built.outputFiles[0].text;
const html = readFileSync(join(here, "events-workspace.html"));

const server = createServer((req, res) => {
  const u = req.url.split("?")[0];
  if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(html); }
  if (u === "/events-workspace.harness.js") {
    res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js);
  }
  res.writeHead(404); res.end();
});
await new Promise((ok) => server.listen(PORT, ok));

const browser = await chromium.launch();
const page = await browser.newPage();
let passed = 0, failed = 0;
const T = async (name, fn) => {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
};
const go = async (mode, fnCtx) => {
  const q = `mode=${mode}` + (fnCtx === undefined ? "" : `&function=${encodeURIComponent(fnCtx)}`);
  await page.goto(`http://localhost:${PORT}/?${q}`);
  await page.waitForSelector("[data-event-workspace-shell]");
};
const calls = () => page.evaluate(() => window.__calls);

await T("EW-1 the Event header states the Product Event's own name and reference", async () => {
  await go("many");
  const name = await page.textContent("[data-event-name]");
  if (!name.includes("Adler Wedding")) throw new Error(`name not stated: ${name}`);
  const ref = await page.textContent("[data-event-reference]");
  if (!ref.includes("EV-2026-0402")) throw new Error(`reference not stated: ${ref}`);
  const shellId = await page.getAttribute("[data-event-workspace-shell]", "data-product-event");
  if (shellId !== "bk-adler") throw new Error(`canonical identity is not the Product Event: ${shellId}`);
});

await T("EW-2 zero Functions → no Function selector, and none is invented", async () => {
  await go("zero");
  if (await page.$("[data-function-bar]")) throw new Error("a selector was rendered for zero Functions");
  if (await page.$("[data-function-context]")) throw new Error("a Function context card was invented");
  if (!(await page.$("[data-no-functions]"))) throw new Error("the zero-Function state was not stated");
});

await T("EW-3 one Function → no pointless selector, but its facts are shown", async () => {
  await go("one");
  if (await page.$("[data-function-bar]"))
    throw new Error("a selector offered a choice between All and the only Function");
  const card = await page.textContent("[data-function-context]");
  if (!card.includes("Kiddush")) throw new Error(`the only Function's facts are missing: ${card}`);
});

await T("EW-4 many Functions → All Functions plus one choice per Function", async () => {
  await go("many");
  const choices = await page.$$eval("[data-function-choice]",
    (els) => els.map((e) => e.getAttribute("data-function-choice")));
  if (choices[0] !== "ALL") throw new Error(`All Functions is not first: ${choices.join(",")}`);
  for (const id of ["fn-cer", "fn-rec", "fn-bru"]) {
    if (!choices.includes(id)) throw new Error(`Function ${id} has no choice`);
  }
  if (choices.length !== 4) throw new Error(`expected 4 controls, got ${choices.length}`);
});

await T("EW-5 generic entry → All Functions", async () => {
  await go("many");
  const pressed = await page.getAttribute('[data-function-choice="ALL"]', "aria-pressed");
  if (pressed !== "true") throw new Error("generic entry did not default to All Functions");
  if (await page.$("[data-function-context]"))
    throw new Error("a Function context card rendered under All Functions");
});

await T("EW-6 an explicit Function context selects that Function", async () => {
  await go("many", "fn-rec");
  if (await page.getAttribute('[data-function-choice="fn-rec"]', "aria-pressed") !== "true")
    throw new Error("the addressed Function is not selected");
  const id = await page.getAttribute("[data-function-context]", "data-function-id");
  if (id !== "fn-rec") throw new Error(`context card shows ${id}`);
});

await T("EW-7 an unknown or foreign Function context returns safely to All Functions", async () => {
  for (const bogus of ["fn-not-mine", "ALL-ish", "00000000-0000-0000-0000-000000000000"]) {
    await go("many", bogus);
    if (await page.getAttribute('[data-function-choice="ALL"]', "aria-pressed") !== "true")
      throw new Error(`context "${bogus}" did not fall back to All Functions`);
    if (await page.$("[data-event-error]")) throw new Error(`context "${bogus}" produced an error surface`);
  }
});

await T("EW-8 Product Event identity is unchanged when Function context changes", async () => {
  await go("many");
  const before = await page.textContent("[data-event-name]");
  const refBefore = await page.textContent("[data-event-reference]");
  await page.click('[data-function-choice="fn-bru"]');
  await page.waitForSelector('[data-function-context][data-function-id="fn-bru"]');
  if (await page.textContent("[data-event-name]") !== before)
    throw new Error("the Event name changed with Function context");
  if (await page.textContent("[data-event-reference]") !== refBefore)
    throw new Error("the Event reference changed with Function context");
  if (await page.getAttribute("[data-event-workspace-shell]", "data-product-event") !== "bk-adler")
    throw new Error("the canonical Event identity changed with Function context");
});

await T("EW-9 the selected Function shows its own authoritative facts", async () => {
  await go("many", "fn-bru");
  const facts = await page.textContent("[data-function-facts]");
  for (const bit of ["2026-09-28", "Garden Room", "70 guests"]) {
    if (!facts.includes(bit)) throw new Error(`Function fact missing (${bit}): ${facts}`);
  }
  const name = await page.textContent("[data-function-name]");
  if (!name.includes("Brunch")) throw new Error(`Function name missing: ${name}`);
});

await T("EW-10 a Function with no execution record stays visible and says so", async () => {
  await go("unreleased", "fn-rec");
  const choices = await page.$$eval("[data-function-choice]",
    (els) => els.map((e) => e.getAttribute("data-function-choice")));
  if (!choices.includes("fn-rec")) throw new Error("the unreleased Function disappeared from the selector");
  if (!(await page.$('[data-function-unreleased="fn-rec"]')))
    throw new Error("the unreleased state was not stated");
  const txt = await page.textContent('[data-function-unreleased="fn-rec"]');
  if (!txt.includes("Not yet operationally released"))
    throw new Error(`unreleased wording is not direct: ${txt}`);
  if (await page.$('[data-function-operations="fn-rec"]'))
    throw new Error("operational truth was fabricated for an unreleased Function");
  const seen = await calls();
  if (seen.some((c) => c.startsWith("rpc:event_workspace:null") || c === "rpc:event_workspace:undefined"))
    throw new Error("an execution record was read for a Function that has none");
});

await T("EW-11 All Functions composes siblings, each attributed and separate", async () => {
  await go("many");
  const sections = await page.$$eval("[data-function-section]",
    (els) => els.map((e) => e.getAttribute("data-function-section")));
  if (sections.length !== 3) throw new Error(`expected 3 Function sections, got ${sections.length}`);
  const names = await page.$$eval("[data-function-section-name]", (els) => els.map((e) => e.textContent));
  for (const n of ["Ceremony", "Reception", "Brunch"]) {
    if (!names.some((x) => x.includes(n))) throw new Error(`Function ${n} is not attributed`);
  }
  // Each sibling keeps its own operational record — never one merged surface.
  const ops = await page.$$eval("[data-operational-event]",
    (els) => els.map((e) => e.getAttribute("data-operational-event")));
  if (new Set(ops).size !== ops.length) throw new Error("sibling Functions shared one operational record");
});

await T("EW-12 no aggregate Event progress / readiness / lifecycle figure is rendered", async () => {
  await go("many");
  const header = await page.textContent("[data-event-header]");
  if (/\d+\s*%/.test(header)) throw new Error(`an Event percentage appeared: ${header}`);
  if (/\b\d+\s*\/\s*\d+\b/.test(header)) throw new Error(`an Event x/y readiness figure appeared: ${header}`);
  for (const sel of ["[data-event-progress]", "[data-event-readiness]", "[data-event-lifecycle-aggregate]"]) {
    if (await page.$(sel)) throw new Error(`an aggregate element exists: ${sel}`);
  }
});

await T("EW-13 a released Function reads ITS OWN execution record, by id", async () => {
  await go("many", "fn-rec");
  await page.waitForSelector('[data-function-operations="fn-rec"]');
  const ev = await page.getAttribute('[data-function-operations="fn-rec"]', "data-operational-event");
  if (ev !== "ev-rec") throw new Error(`Reception is bound to ${ev}`);
  const seen = await calls();
  if (!seen.includes("rpc:event_workspace:ev-rec"))
    throw new Error(`the Function's own execution record was not read: ${seen.join(",")}`);
  for (const other of ["rpc:event_workspace:ev-cer", "rpc:event_workspace:ev-bru"]) {
    if (seen.includes(other)) throw new Error(`a sibling Function's record was read under narrowing: ${other}`);
  }
});

await T("EW-14 no storage API is read or written — a remembered default is impossible", async () => {
  await go("many");
  const touched = await page.evaluate(() => {
    const hits = [];
    for (const k of ["localStorage", "sessionStorage"]) {
      try {
        const s = window[k];
        for (let i = 0; i < s.length; i++) {
          const key = s.key(i);
          if (/function|occurrence|event/i.test(key || "")) hits.push(`${k}:${key}`);
        }
      } catch { /* blocked storage is also "not used" */ }
    }
    return hits;
  });
  if (touched.length) throw new Error(`a Function preference was persisted: ${touched.join(",")}`);
  // Proven structurally as well: the shell takes context as a prop and the route
  // reads it from the address, so there is no code path that could remember one.
  const src = readFileSync(join(root, "src/lib/events/productEvent.ts"), "utf8")
    + readFileSync(join(root, "src/components/events/EventWorkspaceShell.tsx"), "utf8")
    + readFileSync(join(root, "src/app/events/[id]/page.tsx"), "utf8");
  if (/localStorage|sessionStorage|indexedDB|document\.cookie/.test(src))
    throw new Error("v312 source references a storage API");
});

await browser.close(); server.close();
console.log(`\naccept-events-workspace: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
