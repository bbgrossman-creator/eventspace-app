// v287c PROJECTION CLIENT ACCEPTANCE — the REAL src/lib/projection modules in
// Chromium over projection fixtures. No database. Claims P-1…P-14: envelope
// validation (shape, name, version), refusal normalization, label packs,
// state glyph/tone/class language, ordering, grouping membership invariance,
// band + column resolution, risk decoration vs state separation, and the
// central discipline — the client NEVER computes a responsibility state.
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-projection.mjs
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
    for (const ext of [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"])
      if (existsSync(base + ext)) return { path: base + ext };
    return { path: base };
  });
}};
const built = await esbuild.build({
  entryPoints: [join(here, "projection.harness.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic", loader: { ".ts": "ts", ".tsx": "tsx" },
  define: { "process.env.NODE_ENV": '"development"' },
  banner: { js: "window.process=window.process||{env:{}};" },
  plugins: [aliasPlugin], logLevel: "silent",
});
const js = built.outputFiles[0].text;
const html = readFileSync(join(here, "projection.html"));
const css = existsSync(join(here, "app.css")) ? readFileSync(join(here, "app.css")) : "";
const server = createServer((req, res) => {
  const u = req.url.split("?")[0];
  if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(html); }
  if (u === "/projection.harness.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js); }
  if (u === "/app.css") { res.writeHead(200, { "content-type": "text/css" }); return res.end(css); }
  res.writeHead(404); res.end();
});
await new Promise((ok) => server.listen(4296, ok));
const browser = await chromium.launch();
const page = await browser.newPage();
let passed = 0, failed = 0;
const T = async (n, fn) => { try { await fn(); passed++; console.log(`PASS ${n}`); }
  catch (e) { failed++; console.log(`FAIL ${n}\n     ${e.message.split("\n")[0]}`); } };
const attr = (sel, name) => page.getAttribute(sel, name);
const go = async (q) => { await page.goto(`http://localhost:4296/${q}`); await page.waitForSelector("[data-projection-harness]"); };

await go("?mode=ops");

// ── envelope handling ─────────────────────────────────────────────────────
await T("P-1 a well-formed envelope is accepted by the real client", async () => {
  if (await attr("[data-envelope-verdict]", "data-envelope-verdict") !== "accepted")
    throw new Error("valid envelope refused");
});
await T("P-2 an unsupported envelope version is refused, not silently rendered", async () => {
  const v = await attr("[data-version-verdict]", "data-version-verdict");
  if (v !== "refused:PROJECTION_VERSION_UNSUPPORTED") throw new Error(`got ${v}`);
});
await T("P-3 an envelope whose projection name does not match is refused", async () => {
  const v = await attr("[data-name-verdict]", "data-name-verdict");
  if (v !== "refused:PROJECTION_NAME_MISMATCH") throw new Error(`got ${v}`);
});
await T("P-4 a payload that is not an envelope is refused on shape", async () => {
  const v = await attr("[data-shape-verdict]", "data-shape-verdict");
  if (v !== "refused:PROJECTION_SHAPE_INVALID") throw new Error(`got ${v}`);
});
await T("P-5 a server refusal is normalized to a typed code and a clean message", async () => {
  const c = await attr("[data-refusal-code]", "data-refusal-code");
  const m = await attr("[data-refusal-code]", "data-refusal-message");
  if (c !== "PROJECTION_FILTER_INVALID") throw new Error(`code ${c}`);
  if (!m.includes("unknown filter key")) throw new Error(`message ${m}`);
});
await T("P-6 the SQL-owned truth_version and counts are carried, never recomputed", async () => {
  if (await attr("[data-truth-version]", "data-truth-version") !== "tv-abc") throw new Error("truth_version lost");
  if (await attr("[data-counts-total]", "data-counts-total") !== "5") throw new Error("counts lost");
});

// ── state presentation ────────────────────────────────────────────────────
await T("P-7 every row renders the seven-state glyph language from its projected state", async () => {
  const want = { r1: "▲", r2: "●", r3: "○", r4: "◐", r5: "✓" };
  for (const [id, glyph] of Object.entries(want)) {
    const g = await attr(`[data-row="${id}"]`, "data-glyph");
    const gf = await attr(`[data-row="${id}"]`, "data-glyph-fn");
    if (g !== glyph) throw new Error(`${id}: glyph ${g} != ${glyph}`);
    if (gf !== glyph) throw new Error(`${id}: helper disagrees with presentation`);
  }
});
await T("P-8 the client never computes state — it renders only what the projection supplied", async () => {
  const states = await page.$$eval("[data-row]", (els) =>
    els.map((e) => [e.getAttribute("data-row"), e.getAttribute("data-state"), e.getAttribute("data-state-valid")]));
  const expect = { r1: "lapsed", r2: "active", r3: "derived", r4: "standing", r5: "discharged" };
  for (const [id, st, valid] of states) {
    if (st !== expect[id]) throw new Error(`${id}: ${st}`);
    if (valid !== "true") throw new Error(`${id}: state outside the constitutional seven`);
  }
});
await T("P-9 risk decorates a row without altering its state — active stays active, discharged stays discharged", async () => {
  // r5 carries exception evidence yet remains 'discharged'; r3 is at risk yet remains 'derived'
  if (await attr('[data-row="r5"]', "data-state") !== "discharged") throw new Error("exception changed state");
  if (await attr('[data-row="r5"]', "data-severity") !== "advisory") throw new Error("missing severity");
  if (await attr('[data-row="r3"]', "data-state") !== "derived") throw new Error("risk changed state");
  if (await attr('[data-row="r3"]', "data-severity") !== "warning") throw new Error("missing severity");
});
await T("P-10 event-level findings are kept separate from row findings", async () => {
  if (await attr("[data-event-finding-count]", "data-event-finding-count") !== "1")
    throw new Error("event-level finding not separated");
  const f = await attr("[data-event-findings]", "data-event-findings");
  if (!f.includes("stale")) throw new Error(`got ${f}`);
});

// ── labels ────────────────────────────────────────────────────────────────
await T("P-11 the catering pack supplies department words, verbs and state words", async () => {
  if (await attr('[data-row="r1"]', "data-dept-label") !== "Pulls") throw new Error("equipment != Pulls");
  if (await attr('[data-row="r2"]', "data-dept-label") !== "Prep") throw new Error("culinary != Prep");
  if (await attr('[data-row="r3"]', "data-dept-label") !== "Routes") throw new Error("logistics != Routes");
  if (await attr('[data-row="r4"]', "data-dept-label") !== "Roster") throw new Error("staffing != Roster");
  if (!(await attr('[data-row="r1"]', "data-verbs")).includes("Pulled")) throw new Error("verbs missing");
  if (await attr('[data-row="r3"]', "data-state-label") !== "Unassigned") throw new Error("state word");
});
await T("P-12 switching label pack changes every word and NOTHING else", async () => {
  const beforeOrder = await attr("[data-rows]", "data-order");
  const beforeStates = await page.$$eval("[data-row]", (els) => els.map((e) => e.getAttribute("data-state")).join(","));
  await page.selectOption("[data-pack-pick]", "generic");
  await page.waitForSelector('[data-projection-harness][data-pack="generic"]');
  if (await attr('[data-row="r1"]', "data-dept-label") !== "Warehouse") throw new Error("pack did not apply");
  if (await attr('[data-row="r2"]', "data-dept-label") !== "Production") throw new Error("pack did not apply");
  if (await attr('[data-row="r1"]', "data-dept-key") !== "equipment") throw new Error("constitutional key changed");
  const afterOrder = await attr("[data-rows]", "data-order");
  const afterStates = await page.$$eval("[data-row]", (els) => els.map((e) => e.getAttribute("data-state")).join(","));
  if (beforeOrder !== afterOrder) throw new Error("relabelling changed ordering");
  if (beforeStates !== afterStates) throw new Error("relabelling changed state");
  await page.selectOption("[data-pack-pick]", "catering");
  await page.waitForSelector('[data-projection-harness][data-pack="catering"]');
});

// ── ordering + grouping ───────────────────────────────────────────────────
await T("P-13 sorting changes reading order only — never membership", async () => {
  const base = (await attr("[data-rows]", "data-order")).split(",").sort().join(",");
  for (const mode of ["state", "department", "owner", "outcome", "projection"]) {
    await page.selectOption("[data-sort-pick]", mode);
    const now = (await attr("[data-rows]", "data-order")).split(",").sort().join(",");
    if (now !== base) throw new Error(`sort ${mode} changed membership`);
  }
  await page.selectOption("[data-sort-pick]", "projection");
  const projOrder = await attr("[data-rows]", "data-order");
  if (projOrder !== "r1,r2,r3,r4,r5") throw new Error(`projection order not honoured: ${projOrder}`);
});
await T("P-14 grouping changes grouping only — every row appears in exactly one group, in every mode", async () => {
  for (const g of ["department", "event", "state", "owner", "resource_role", "none"]) {
    await page.selectOption("[data-group-pick]", g);
    await page.waitForSelector(`[data-groups][data-group-by="${g}"]`, { state: "attached" });
    const total = await attr("[data-groups]", "data-grouped-total");
    if (total !== "5") throw new Error(`grouping ${g}: ${total} of 5 rows grouped`);
    const members = await page.$$eval("[data-group]", (els) =>
      els.flatMap((e) => (e.getAttribute("data-group-members") || "").split(",").filter(Boolean)));
    if (new Set(members).size !== members.length) throw new Error(`grouping ${g}: a row appeared twice`);
    if (members.length !== 5) throw new Error(`grouping ${g}: ${members.length} members`);
  }
});
await T("P-15 group keys are labelled through the pack while the key itself is unchanged", async () => {
  await page.selectOption("[data-group-pick]", "department");
  await page.waitForSelector('[data-groups][data-group-by="department"]', { state: "attached" });
  const label = await attr('[data-group="culinary"]', "data-group-label");
  if (label !== "Prep") throw new Error(`got ${label}`);
});

// ── band + column resolution ──────────────────────────────────────────────
await T("P-16 bands resolve from the same envelope — the client never re-filters membership", async () => {
  if (await attr('[data-band="ownerless"]', "data-band-count") !== "1") throw new Error("ownerless band");
  if (await attr('[data-band="mine"]', "data-band-count") !== "3") throw new Error("mine band");
  if (await attr('[data-band="at_risk"]', "data-band-count") !== "3") throw new Error("at_risk band");
});
await T("P-17 the ownerless band matches the envelope's own count — the debt list cannot shrink in the client", async () => {
  const band = await attr('[data-band="ownerless"]', "data-band-count");
  const count = await attr("[data-counts-ownerless]", "data-counts-ownerless");
  if (band !== count) throw new Error(`band ${band} != count ${count}`);
});
await go("?mode=command");
await T("P-18 Event Command columns are keyed by constitutional state and resolve from one envelope", async () => {
  for (const [s, n] of [["lapsed", "1"], ["active", "1"], ["derived", "1"], ["standing", "1"], ["discharged", "1"]]) {
    const got = await attr(`[data-column="${s}"]`, "data-column-count");
    if (got !== n) throw new Error(`column ${s}: ${got}`);
  }
});

console.log(`\naccept-projection: ${passed} passed, ${failed} failed`);
await browser.close(); server.close();
process.exit(failed === 0 ? 0 : 1);
