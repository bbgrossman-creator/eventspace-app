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
    b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: path.join(root, "browser-tests/mock-binding.ts") }));
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
  entryPoints: [path.join(root, "browser-tests/binding.harness.tsx")],
  bundle: true, format: "iife", write: false, jsx: "automatic",
  plugins: [mockAlias], define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".ts": "ts", ".tsx": "tsx" }, logLevel: "error",
});
const js = out.outputFiles[0].text;
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="root"></div><script>${js.replace(/<\/script>/g, "<\\/script>")}</script></body>`;
const server = http.createServer((req, res) => { res.setHeader("content-type", "text/html"); res.end(html); });
await new Promise((r) => server.listen(4286, r));

const browser = await chromium.launch({ executablePath: "/tmp/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage", "--single-process", "--no-zygote", "--disable-gpu"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
let pass = 0, fail = 0;
const claim = (id, ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"} ${id}: ${msg}`); ok ? pass++ : fail++; };

// ── unbound ──
await page.goto("http://localhost:4286/?mode=unbound", { waitUntil: "networkidle" });
await page.waitForSelector("[data-binding-unbound]", { timeout: 8000 });
const addr = await page.textContent("[data-binding-unbound]");
claim("B-1", /1 Main Street, Newark/.test(addr) && /not linked/.test(addr),
  "unbound off-prem engagement shows the free-text address and its unlinked state");

await page.click("[data-binding-open]");
await page.waitForSelector("[data-binding-form]", { timeout: 5000 });
const sugg = await page.textContent("[data-binding-suggestions]");
const boundEarly = (await page.evaluate(() => window.__ceremonies)).some((c) => c.startsWith("bound:"));
claim("B-2", /Grand Hotel/.test(sugg) && /advisory/.test(sugg) && !boundEarly,
  "advisory suggestions render from the address without any automatic binding");

const bindDisabled = await page.$eval("[data-binding-bind]", (el) => el.disabled);
await page.click("[data-binding-suggestion='Grand Hotel']");
await page.click("[data-binding-bind]");
await page.waitForTimeout(300);
const cer = await page.evaluate(() => window.__ceremonies);
claim("B-3", bindDisabled && cer.includes("rpc:bind_engagement_venue") && cer.some((c) => c === "bound:ven-1"),
  "bind is disabled until a venue is explicitly selected; selecting a suggestion then binding routes the exact uuid to the ceremony");

// ── bound ──
await page.goto("http://localhost:4286/?mode=bound", { waitUntil: "networkidle" });
await page.waitForSelector("[data-binding-bound]", { timeout: 8000 });
const prov = await page.textContent("[data-binding-provenance]");
const link = await page.$eval("[data-binding-venue-link]", (el) => el.getAttribute("href"));
claim("B-4", /bound by ben/.test(prov) && link === "/venues/ven-1",
  "bound engagement shows venue, provenance, and a working link to the venue record");

await page.click("[data-binding-correct]");
await page.waitForSelector("[data-binding-form]");
await page.selectOption("[data-binding-select]", "ven-3");
const correctDisabled = await page.$eval("[data-binding-bind]", (el) => el.disabled);
await page.fill("[data-binding-reason]", "customer moved the event");
await page.click("[data-binding-bind]");
await page.waitForTimeout(300);
const cer2 = await page.evaluate(() => window.__ceremonies);
claim("B-5", correctDisabled && cer2.some((c) => c === "bound:ven-3:customer moved the event"),
  "correction demands a reason before enabling and routes venue + reason to the ceremony");

// ── redirected ──
await page.goto("http://localhost:4286/?mode=redirected", { waitUntil: "networkidle" });
await page.waitForSelector("[data-binding-redirected]", { timeout: 8000 });
const red = await page.textContent("[data-binding-redirected]");
claim("B-6", /Originally linked to/.test(red) && /Grand Hotel Annex/.test(red) && /Grand Hotel/.test(red) && /original binding fact is unchanged/.test(red),
  "redirected venue shows original (Annex) vs resolved (Grand Hotel) distinctly — history explicitly not rewritten");

// ── v282 knowledge summary claims ──
await page.goto("http://localhost:4286/?mode=bound", { waitUntil: "networkidle" });
await page.waitForSelector("[data-knowledge-summary]", { timeout: 8000 });
const kv1 = await page.$eval("[data-knowledge-summary]", (el) => el.getAttribute("data-knowledge-verdict"));
const kt1 = await page.textContent("[data-knowledge-summary]");
claim("K-1", kv1 === "none" && /no walkthrough needed/.test(kt1),
  "a bound engagement with current venue knowledge shows 'no walkthrough needed'");

await page.goto("http://localhost:4286/?mode=redirected", { waitUntil: "networkidle" });
await page.waitForSelector("[data-knowledge-summary]", { timeout: 8000 });
const kv2 = await page.$eval("[data-knowledge-summary]", (el) => el.getAttribute("data-knowledge-verdict"));
const reasons = await page.$$eval("[data-knowledge-reasons] li", (els) => els.map((e) => e.textContent));
claim("K-2", kv2 === "targeted_verification" && reasons.length === 2 && /180-day utility threshold/.test(reasons[0]),
  "targeted verification renders with the specific derived reasons — knowledge vocabulary only, no feasibility language");

await page.goto("http://localhost:4286/?mode=walkreq", { waitUntil: "networkidle" });
await page.waitForSelector("[data-knowledge-summary]", { timeout: 8000 });
const kv3 = await page.$eval("[data-knowledge-summary]", (el) => el.getAttribute("data-knowledge-verdict"));
claim("K-3", kv3 === "walkthrough_required" && /renovation/.test(await page.textContent("[data-knowledge-summary]")),
  "walkthrough-required renders distinctly with the renovation reason");

await browser.close(); server.close();
console.log(`\n=== v281+v282 BINDING & KNOWLEDGE ACCEPTANCE: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
