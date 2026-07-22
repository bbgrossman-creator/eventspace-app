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
    b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: path.join(root, "browser-tests/mock-oplib.ts") }));
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
  entryPoints: [path.join(root, "browser-tests/oplib.harness.tsx")],
  bundle: true, format: "iife", write: false, jsx: "automatic",
  plugins: [mockAlias], define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".ts": "ts", ".tsx": "tsx" }, logLevel: "error",
});
const js = out.outputFiles[0].text;
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="root"></div><script>${js.replace(/<\/script>/g, "<\\/script>")}</script></body>`;
const server = http.createServer((req, res) => { res.setHeader("content-type", "text/html"); res.end(html); });
await new Promise((r) => server.listen(4287, r));

const browser = await chromium.launch({ executablePath: "/tmp/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage", "--single-process", "--no-zygote", "--disable-gpu"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
let pass = 0, fail = 0;
const claim = (id, ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"} ${id}: ${msg}`); ok ? pass++ : fail++; };

// list: creation + advisory dupes
await page.goto("http://localhost:4287/?mode=list", { waitUntil: "networkidle" });
await page.waitForSelector("[data-oplib-list]", { timeout: 8000 });
await page.fill("[data-oplib-name]", "Carving  Station");
await page.click("[data-oplib-create]");
await page.waitForSelector("[data-oplib-dupes]", { timeout: 5000 });
const dupe = await page.textContent("[data-oplib-dupes]");
const cer = await page.evaluate(() => window.__ceremonies);
claim("L-1", cer.includes("rpc:create_library_component") && /Carving Station/.test(dupe) && /identity is never name-based/.test(dupe),
  "library component creation routes to the ceremony; similar names surface as advisory only");

// detail: current revision + grouped requirements
await page.goto("http://localhost:4287/?mode=detail", { waitUntil: "networkidle" });
await page.waitForSelector("[data-oplib-requirements]", { timeout: 8000 });
const title = await page.textContent("[data-oplib-detail] header");
claim("L-2", /Carving Station/.test(title) && /revision 2/.test(title),
  "the current revision renders with its number and author");

const groups = await page.$$eval("[data-family-group]", (els) => els.map((e) => e.getAttribute("data-family-group")));
claim("L-3", groups.includes("space") && groups.includes("utility") && groups.includes("labor") && groups.includes("production"),
  `requirements group by family (${groups.join(", ")})`);

const scal = await page.textContent("[data-req='Carver'] [data-req-scaling]");
claim("L-4", /1 people per guest band \(band 125\)/.test(scal) && /min 1/.test(scal),
  "scaling structure renders declaratively (rate, basis, band, min)");

const qty = await page.textContent("[data-req='Service frontage'] [data-req-qty]");
const missing = await page.textContent("[data-req='Carver'] [data-req-missing]");
const inactive = await page.textContent("[data-req='Mashgiach'] [data-req-inactive]");
claim("L-5", /20 ft/.test(qty) && /needs guest_count/.test(missing) && /kosher_class=strict/.test(inactive),
  "resolution renders three-state: resolved quantity with unit, explicit unresolved naming the gap, inactive conditional");

const hist = await page.$$eval("[data-history-rev]", (els) => els.map((e) => e.getAttribute("data-history-rev")));
claim("L-6", hist.includes("2") && hist.includes("1") && /frontage corrected/.test(await page.textContent("[data-oplib-history]")),
  "the append-only revision history lists every revision with correction reasons");

// authoring: build a set, publish one atomic revision
await page.fill("[data-au-label]", "Test frontage");
await page.click("[data-au-add]");
await page.selectOption("[data-au-family]", "utility");
await page.fill("[data-au-label]", "Test circuits");
await page.click("[data-au-add]");
const draftRows = await page.$$eval("[data-au-draft-row]", (els) => els.length);
await page.click("[data-au-publish]");
await page.waitForTimeout(300);
const cer2 = await page.evaluate(() => window.__ceremonies);
claim("L-7", draftRows === 2 && cer2.includes("rpc:author_profile_revision") && cer2.includes("authored:n2"),
  "authoring publishes the complete set as one revision (2 rows in one ceremony call)");

await browser.close(); server.close();
console.log(`\n=== v283 LIBRARY INSPECTOR ACCEPTANCE: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
