// KITCHEN QUANTITIES ACCEPTANCE (v311) — the mounted Event-facing panel rendered
// in real Chromium over fixtures shaped like kitchen_event_panel(). Claims:
//   KQ-1 the panel is marked ENACTED (not preview) and states the guest count
//   KQ-2 Recommended, Adjusted and Approved are shown as three distinct figures
//   KQ-3 the guest-count derivation is shown, not implied
//   KQ-4 an unresolved line is a real Requirement showing WHY, never a blank
//   KQ-5 Review required is surfaced with its reason
//   KQ-6 a line without an approval says it is not yet fulfillable
//   KQ-7 mutation controls appear only under an Authority Grant
//   KQ-8 approving invokes approve_kitchen_quantity with the operator's reason
//   KQ-9 a refusal is shown verbatim, not softened
//   KQ-10 the approved Requirement text states the quantity
//   KQ-11 the panel calls no derivation RPC — it renders one read model
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-kitchen-quantities.mjs
import esbuild from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const aliasPlugin = {
  name: "alias",
  setup(b) {
    b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: join(here, "mock-supabase.ts") }));
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
  entryPoints: [join(here, "kitchen-quantities.harness.tsx")],
  bundle: true, write: false, format: "iife", jsx: "automatic",
  loader: { ".ts": "ts", ".tsx": "tsx" }, plugins: [aliasPlugin], logLevel: "silent",
});
const js = built.outputFiles[0].text;
const html = readFileSync(join(here, "kitchen-quantities.html"));

const server = createServer((req, res) => {
  const u = req.url.split("?")[0];
  if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(html); }
  if (u === "/kitchen-quantities.harness.js") {
    res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js);
  }
  res.writeHead(404); res.end();
});
await new Promise((ok) => server.listen(4238, ok));

const browser = await chromium.launch();
const page = await browser.newPage();
let passed = 0, failed = 0;
const T = async (name, fn) => {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
};
const ceremonies = () => page.evaluate(() => window.__ceremonies);
const go = async (mode) => {
  await page.goto(`http://localhost:4238/?mode=${mode}`);
  await page.waitForSelector("[data-kitchen-panel]");
};
const lineText = (id) => page.textContent(`[data-kitchen-line="${id}"]`);

await T("KQ-1 the panel is marked ENACTED and states the operative guest count", async () => {
  await go("mixed");
  if (await page.getAttribute("[data-kitchen-panel]", "data-kitchen-stage") !== "enacted")
    throw new Error("panel is not marked enacted");
  if (!(await page.$("[data-kitchen-operative]"))) throw new Error("ENACTED marker missing");
  const guests = await page.textContent("[data-kitchen-guests]");
  if (!guests.includes("130 guests")) throw new Error(`guest count not stated: ${guests}`);
});

await T("KQ-2 Recommended, Adjusted and Approved are three distinct visible figures", async () => {
  const slaw = await lineText("l-slaw");
  if (!slaw.includes("Recommended") || !slaw.includes("20")) throw new Error("recommendation missing");
  if (!slaw.includes("Adjusted") || !slaw.includes("26")) throw new Error("adjustment missing");
  const brownies = await lineText("l-brownies");
  for (const want of ["Recommended", "260", "Approved", "200"]) {
    if (!brownies.includes(want)) throw new Error(`approved line missing ${want}`);
  }
});

await T("KQ-3 the guest-count derivation is shown rather than implied", async () => {
  const sliders = await lineText("l-sliders");
  if (!sliders.includes("130 guests × 1 per guest = 130"))
    throw new Error("per_person derivation not shown");
  if (!sliders.includes("130 guests × 1 per guest")) throw new Error("basis line missing");
  const slaw = await lineText("l-slaw");
  if (!slaw.includes("does not scale")) throw new Error("flat basis not explained");
});

await T("KQ-4 an unresolved line is a real Requirement that states why", async () => {
  if (!(await page.$('[data-kitchen-line="l-napkins"]'))) throw new Error("unresolved line not rendered");
  const el = await page.$('[data-kitchen-line="l-napkins"] [data-kitchen-unresolved]');
  if (!el) throw new Error("unresolved notice missing");
  const t = await el.textContent();
  if (!t.includes("committed design states basis per_person but no quantity"))
    throw new Error(`reason not shown: ${t}`);
});

await T("KQ-5 Review required is surfaced with its reason", async () => {
  const el = await page.$('[data-kitchen-line="l-brownies"] [data-kitchen-review]');
  if (!el) throw new Error("review notice missing");
  const t = await el.textContent();
  if (!t.includes("Review required") || !t.includes("no longer matches"))
    throw new Error(`review reason not shown: ${t}`);
});

await T("KQ-6 a line without an approval says it is not yet fulfillable", async () => {
  if (!(await page.$('[data-kitchen-line="l-sliders"] [data-kitchen-not-fulfillable]')))
    throw new Error("unapproved line does not say it is not fulfillable");
  if (await page.$('[data-kitchen-line="l-brownies"] [data-kitchen-not-fulfillable]'))
    throw new Error("an approved line was still marked not fulfillable");
});

await T("KQ-7 mutation controls appear only under an Authority Grant", async () => {
  if (!(await page.$('[data-kitchen-line="l-sliders"] [data-kitchen-approve]')))
    throw new Error("granted actor has no approve control");
  await go("noauth");
  if (await page.$("[data-kitchen-approve]")) throw new Error("approve control shown without a grant");
  if (await page.$("[data-kitchen-adjust]")) throw new Error("adjust control shown without a grant");
  if (!(await page.$("[data-kitchen-no-authority]"))) throw new Error("no-authority notice missing");
});

await T("KQ-8 approving invokes approve_kitchen_quantity carrying the operator's reason", async () => {
  await go("mixed");
  await page.click('[data-kitchen-line="l-sliders"] [data-kitchen-approve]');
  await page.fill('[data-kitchen-line="l-sliders"] [data-kitchen-input="reason"]', "signed off for service");
  await page.click('[data-kitchen-line="l-sliders"] [data-kitchen-submit="approve"]');
  await page.waitForTimeout(150);
  if (!(await ceremonies()).includes("rpc:approve_kitchen_quantity"))
    throw new Error("approve did not invoke the ceremony");
});

await T("KQ-9 a refusal from the database is shown verbatim, not softened", async () => {
  await go("refusal");
  await page.click('[data-kitchen-line="l-sliders"] [data-kitchen-approve]');
  await page.fill('[data-kitchen-line="l-sliders"] [data-kitchen-input="reason"]', "attempt");
  await page.click('[data-kitchen-line="l-sliders"] [data-kitchen-submit="approve"]');
  await page.waitForSelector("[data-kitchen-refusal]");
  const t = await page.textContent("[data-kitchen-refusal]");
  if (!t.includes("KITCHEN_QUANTITY_NOT_PERMITTED"))
    throw new Error(`refusal code not surfaced: ${t}`);
});

await T("KQ-10 the approved Requirement text states the quantity", async () => {
  await go("mixed");
  const t = await page.textContent('[data-kitchen-line="l-brownies"] [data-kitchen-requirement]');
  if (!t.includes("approved quantity 200"))
    throw new Error(`Requirement does not state the approved quantity: ${t}`);
});

await T("KQ-11 the panel renders one read model and calls no derivation RPC", async () => {
  await go("mixed");
  const calls = await ceremonies();
  if (!calls.includes("rpc:kitchen_event_panel")) throw new Error("panel read model was not called");
  for (const forbidden of ["rpc:kitchen_quantity_derive", "rpc:promise_current_attendance",
                           "rpc:kitchen_quantity_state", "rpc:kitchen_line_current"]) {
    if (calls.includes(forbidden)) throw new Error(`panel derived in the client via ${forbidden}`);
  }
});

await T("KQ-12 an event whose committed design has no culinary line says so plainly", async () => {
  await go("empty");
  if (!(await page.$("[data-kitchen-empty]"))) throw new Error("empty state missing");
});

await browser.close(); server.close();
console.log(`\naccept-kitchen-quantities: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
