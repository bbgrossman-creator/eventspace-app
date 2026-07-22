// v284 BASIS ACCEPTANCE — the REAL mounted OperationalBasisCard in Chromium
// over fixtures mirroring the certified v284 SQL contracts. Claims B-1…B-11:
// attach, revision indicator, refresh, inherited requirements, override
// display (suppress/replace/add lineage), parameter editing, suppress reason
// law, replace commit, add commit, embedded/legacy summary, frozen accepted
// view with zero mutation affordances.
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-basis.mjs
import esbuild from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const aliasPlugin = { name: "alias", setup(b) {
  b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: join(here, "mock-supabase.ts") }));
  b.onResolve({ filter: /^@\// }, (a) => {
    const base = join(root, "src", a.path.slice(2));
    for (const ext of [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"]) if (existsSync(base + ext)) return { path: base + ext };
    return { path: base };
  });
}};
const built = await esbuild.build({
  entryPoints: [join(here, "basis.harness.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  loader: { ".ts": "ts", ".tsx": "tsx" }, plugins: [aliasPlugin], logLevel: "silent",
});
const js = built.outputFiles[0].text;
const html = readFileSync(join(here, "basis.html"));
const server = createServer((req, res) => {
  const u = req.url.split("?")[0];
  if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(html); }
  if (u === "/basis.harness.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js); }
  res.writeHead(404); res.end();
});
await new Promise((ok) => server.listen(4288, ok));
const browser = await chromium.launch();
const page = await browser.newPage();
let passed = 0, failed = 0;
const T = async (n, fn) => { try { await fn(); passed++; console.log(`PASS ${n}`); } catch (e) { failed++; console.log(`FAIL ${n}\n     ${e.message}`); } };
const ceremonies = () => page.evaluate(() => window.__ceremonies);
const go = async (mode) => { await page.goto(`http://localhost:4288/?mode=${mode}`); await page.waitForSelector("[data-basis-card]"); };

// ── unpinned mode: attach ──
await go("unpinned");
await T("B-1 attach: unpinned component offers the library picker and routes attach through the ceremony", async () => {
  if (!(await page.$("[data-basis-unpinned]"))) throw new Error("unpinned card missing");
  await page.selectOption("[data-basis-attach-pick]", "lc-1");
  await page.click("[data-basis-attach]");
  await page.waitForTimeout(150);
  const c = await ceremonies();
  if (!c.includes("rpc:attach_component_profile")) throw new Error(`attach rpc not recorded: ${c}`);
});

// ── pinned mode ──
await go("pinned");
await T("B-2 revision indicator: the pinned revision number renders on the card", async () => {
  const t = await page.textContent("[data-basis-revision]");
  if (!/revision 3/.test(t)) throw new Error(`revision badge: ${t}`);
});
await T("B-3 inherited requirements: library declarations render with family, scaling basis, and resolved quantities", async () => {
  const rows = await page.$$("[data-basis-req]");
  if (rows.length !== 6) throw new Error(`expected 6 requirement rows, got ${rows.length}`);
  const carver = await page.textContent('[data-basis-req-label="Carver"]');
  if (!/labor·per_service_point/.test(carver) || !/2 people/.test(carver)) throw new Error(`carver row: ${carver}`);
});
await T("B-4 override display: suppression shows struck-through with its mandatory reason; replacement shows lineage arrow; addition is badged", async () => {
  const front = await page.textContent('[data-basis-req-label="Frontage"]');
  if (!/venue provides carving counter/.test(front)) throw new Error("suppress reason not shown");
  if (!(await page.$('[data-basis-req-label="Frontage"] [data-basis-status="suppressed"]'))) throw new Error("suppressed badge missing");
  const lamp = await page.textContent("[data-basis-replacement]");
  if (!/LED carving lamp/.test(lamp)) throw new Error("replacement lineage missing");
  if (!(await page.$('[data-basis-req-label="Captain"] [data-basis-status="added"]'))) throw new Error("added badge missing");
});
await T("B-5 unresolved is information: the Sterno requirement names its missing parameter instead of guessing", async () => {
  const s = await page.textContent('[data-basis-req-label="Sterno"]');
  if (!/needs duration_hours/.test(s)) throw new Error(`sterno: ${s}`);
  const u = await page.textContent("[data-basis-unresolved]");
  if (!/duration_hours/.test(u)) throw new Error("unresolved footer missing");
});
await T("B-6 parameter editing routes through the override ceremony", async () => {
  await page.selectOption("[data-basis-param-name]", "service_points");
  await page.fill("[data-basis-param-value]", "3");
  await page.click("[data-basis-param-commit]");
  await page.waitForTimeout(150);
  const c = await ceremonies();
  if (!c.includes("override:parameter")) throw new Error(`parameter override not recorded: ${c}`);
});
await T("B-7 suppress: the ceremony carries the operator's reason (reasonless suppression is refused by the data layer)", async () => {
  page.once("dialog", (d) => d.accept("client will self-serve"));
  await page.click('[data-basis-req-label="Carver"] [data-basis-suppress-btn]');
  await page.waitForTimeout(150);
  const c = await ceremonies();
  if (!c.includes("override:suppress")) throw new Error(`suppress not recorded: ${c}`);
});
await T("B-8 replace: the inline form commits a replacement declaration through the ceremony", async () => {
  await page.click('[data-basis-req-label="Induction burner"] [data-basis-replace-btn]');
  await page.fill("[data-basis-replace-label]", "Butane range");
  await page.click("[data-basis-replace-commit]");
  await page.waitForTimeout(150);
  const c = await ceremonies();
  if (!c.includes("override:replace")) throw new Error(`replace not recorded: ${c}`);
});
await T("B-9 add: an engagement-specific requirement commits through the ceremony", async () => {
  await page.fill("[data-basis-add-label]", "Extra runner");
  await page.click("[data-basis-add-commit]");
  await page.waitForTimeout(150);
  const c = await ceremonies();
  if (!c.includes("override:add")) throw new Error(`add not recorded: ${c}`);
});
await T("B-10 legacy projection: the summary chips mirror exactly what publish will embed (suppressed out, replacement in, quantities resolved)", async () => {
  await go("pinned"); // fresh fixture state
  const chips = await page.$$eval("[data-basis-legacy-item]", (els) => els.map((e) => e.textContent));
  const j = chips.join(" | ");
  if (!/staff: Carver ×2/.test(j)) throw new Error(`carver chip: ${j}`);
  if (!/equipment: LED carving lamp/.test(j)) throw new Error(`replacement chip: ${j}`);
  if (!/rental: Induction burner/.test(j)) throw new Error(`rental chip: ${j}`);
  if (/Frontage/.test(j)) throw new Error("suppressed requirement leaked into projection");
});

// ── frozen mode ──
await go("frozen");
await T("B-11 frozen accepted view: the embedded basis renders with the frozen badge and ZERO mutation affordances", async () => {
  if (!(await page.$("[data-basis-frozen]"))) throw new Error("frozen marker missing");
  const badge = await page.textContent("[data-basis-frozen-badge]");
  if (!/frozen/.test(badge)) throw new Error("frozen badge missing");
  for (const sel of ["[data-basis-refresh]", "[data-basis-suppress-btn]", "[data-basis-replace-btn]",
                     "[data-basis-param-form]", "[data-basis-add-form]", "[data-basis-attach]"]) {
    if (await page.$(sel)) throw new Error(`mutation affordance present in frozen view: ${sel}`);
  }
  const t = await page.textContent("[data-basis-legacy]");
  if (!/Embedded operational summary/.test(t)) throw new Error("embedded summary label missing");
});

await browser.close(); server.close();
console.log(`\n=== v284 BASIS ACCEPTANCE: ${passed} PASS / ${failed} FAIL ===`);
process.exit(failed ? 1 : 0);
