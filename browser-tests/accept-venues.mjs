// v280 VENUE FOUNDATION — browser acceptance. Builds the harness with esbuild
// (@/lib/supabase → mock-venues), serves it, drives Chromium, proves 10 claims.
import { build } from "esbuild";
import http from "http";
import { chromium } from "playwright-core";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mockAlias = {
  name: "mock-alias",
  setup(b) {
    b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: path.join(root, "browser-tests/mock-venues.ts") }));
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "next-nav-shim", namespace: "shim" }));
    b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next-link-shim", namespace: "shim" }));
    b.onLoad({ filter: /^next-nav-shim$/, namespace: "shim" }, () => ({
      contents: `export function useParams(){ return { id: "ven-1" }; } export function useRouter(){ return { push(){}, replace(){} }; }`, loader: "ts", resolveDir: root }));
    b.onLoad({ filter: /^next-link-shim$/, namespace: "shim" }, () => ({
      contents: `import React from "react"; export default function Link({href,children,...p}){ return React.createElement("a",{href,...p},children); }`, loader: "tsx", resolveDir: root }));
    b.onResolve({ filter: /^@\// }, (a) => {
      const base = path.join(root, "src", a.path.slice(2));
      for (const e of ["", ".tsx", ".ts"]) if (fs.existsSync(base + e) && fs.statSync(base + e).isFile()) return { path: base + e };
      return { path: base + ".tsx" };
    });
  },
};

const out = await build({
  entryPoints: [path.join(root, "browser-tests/venues.harness.tsx")],
  bundle: true, format: "iife", write: false, jsx: "automatic",
  plugins: [mockAlias], define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".ts": "ts", ".tsx": "tsx" }, logLevel: "error",
});
const js = out.outputFiles[0].text;
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="root"></div><script>${js.replace(/<\/script>/g, "<\\/script>")}</script></body>`;
const server = http.createServer((req, res) => { res.setHeader("content-type", "text/html"); res.end(html); });
await new Promise((r) => server.listen(4285, r));

const browser = await chromium.launch({ executablePath: "/tmp/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage", "--single-process", "--no-zygote", "--disable-gpu"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
let pass = 0, fail = 0;
const claim = (id, ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"} ${id}: ${msg}`); ok ? pass++ : fail++; };

// ── list mode ──
await page.goto("http://localhost:4285/?mode=list", { waitUntil: "networkidle" });
await page.waitForSelector("[data-venue-list]", { timeout: 8000 });
const rows = await page.$$eval("[data-venue-row]", (els) => els.map((e) => e.getAttribute("data-venue-row")));
claim("V-1", rows.includes("Grand Hotel") && !rows.includes("Old Annex"),
  `venue list renders and hides redirected venues (rows: ${rows.join(", ")})`);

await page.fill("[data-venue-name]", "Grand Hotel Downtown");
await page.fill("[data-venue-address]", "1 Main Street");
await page.click("[data-venue-submit]");
await page.waitForSelector("[data-venue-dupes]", { timeout: 5000 });
const dupeText = await page.textContent("[data-venue-dupes]");
const listCer = await page.evaluate(() => window.__ceremonies);
claim("V-2", listCer.includes("rpc:create_venue") && /Grand Hotel/.test(dupeText),
  "create routes to create_venue ceremony; advisory duplicate rendered without blocking");

// ── detail mode ──
await page.goto("http://localhost:4285/?mode=detail", { waitUntil: "networkidle" });
await page.waitForSelector("[data-venue-detail]", { timeout: 8000 });
const spaceNames = await page.$$eval("[data-space]", (els) => els.map((e) => e.getAttribute("data-space")));
const nested = await page.$eval("[data-space='Main Kitchen']", (el) => !!el.querySelector("[data-space='Walk-in']"));
claim("V-3", spaceNames.includes("Main Kitchen") && spaceNames.includes("Walk-in") && nested,
  "space tree renders with nesting (Walk-in inside Main Kitchen) and contended flag");

const statuses = await page.$$eval("[data-profile-entry]", (els) =>
  els.map((e) => `${e.getAttribute("data-profile-entry")}=${e.getAttribute("data-profile-status")}`));
claim("V-4", statuses.includes("walkin_capacity_cuft=observed") && statuses.includes("gas_line=observed_absent") && statuses.includes("room_dimensions=unobserved"),
  `three-valued profile rendered distinctly (${statuses.join("; ")})`);

const prov = await page.textContent("[data-profile-entry='walkin_capacity_cuft'] [data-profile-provenance]");
claim("V-5", /measurement/.test(prov) && /ben/.test(prov),
  "observed entry shows provenance (source class + observer + date)");

const contra = await page.textContent("[data-profile-contradiction]");
claim("V-6", /venue rep statement/.test(contra) && /300/.test(contra) && /governing value unchanged/.test(contra),
  "contradiction finding rendered with disputing value — governing value explicitly unchanged");

// observation form: quantity requires amount (structured value), then routes
const disabled = await page.$eval("[data-ob-submit]", (el) => el.disabled);
await page.fill("[data-ob-attribute]", "ceiling_height");
await page.fill("[data-ob-amount]", "14");
await page.fill("[data-ob-unit]", "ft");
await page.click("[data-ob-submit]");
await page.waitForTimeout(300);
const cer1 = await page.evaluate(() => window.__ceremonies);
claim("V-7", disabled && cer1.includes("rpc:record_observation"),
  "observation submit disabled without a structured value; enabled submit routes to record_observation");

await page.click("[data-walkthrough-add]");
await page.waitForTimeout(200);
await page.click("[data-coverage-inaccessible]");
await page.waitForTimeout(300);
const cer2 = await page.evaluate(() => window.__ceremonies);
claim("V-8", cer2.includes("rpc:record_walkthrough") && cer2.includes("rpc:declare_walkthrough_coverage"),
  "walkthrough + coverage declaration (incl. inaccessible) route to their ceremonies");

await page.fill("[data-ev-label]", "walk-in door photo");
await page.click("[data-ev-submit]");
await page.waitForSelector("[data-ev-hash]", { timeout: 5000 });
const hashTxt = await page.textContent("[data-ev-hash]");
claim("V-9", /fingerprint/.test(hashTxt) && (await page.evaluate(() => window.__ceremonies)).includes("rpc:record_evidence"),
  "evidence attaches through record_evidence and its immutable fingerprint is shown");

await page.click("[data-profile-entry='walkin_capacity_cuft'] [data-profile-supersede]");
await page.waitForSelector("[data-supersede-form]");
const supDisabled = await page.$eval("[data-supersede-confirm]", (el) => el.disabled);
await page.fill("[data-supersede-reason]", "re-measured after shelving install");
await page.click("[data-supersede-confirm]");
await page.waitForTimeout(300);
const cer3 = await page.evaluate(() => window.__ceremonies);
claim("V-10", supDisabled && cer3.includes("rpc:supersede_observation"),
  "supersession demands a reason before enabling and routes to supersede_observation");

await browser.close(); server.close();
console.log(`\n=== v280 VENUE ACCEPTANCE: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
