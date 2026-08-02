// v290 OPERATIONS SHELL ACCEPTANCE — the REAL mounted production Sidebar in
// Chromium. Claims SH-1…SH-8.
//
// This is a NEW runner rather than an extension of accept-today.mjs: that file
// carries certified v288a claims, and editing it to add shell assertions would
// put a frozen browser floor at risk for no benefit. The shell is a different
// surface and gets its own runner.
//
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-operations-shell.mjs
import esbuild from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

// ── build the REAL Sidebar with three substitutions ───────────────────────
const aliasPlugin = { name: "alias", setup(b) {
  b.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(here, "shell-next-link.tsx") }));
  b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(here, "shell-next-navigation.ts") }));
  b.onResolve({ filter: /supabase$/ }, (a) => (
    ["@/lib/supabase", "./supabase", "../supabase", "../lib/supabase", "@/lib/supabase.ts"].includes(a.path)
      ? { path: join(here, "shell-supabase.ts") } : null));
  b.onResolve({ filter: /^@\// }, (a) => {
    const base = join(root, "src", a.path.slice(2));
    for (const ext of [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"])
      if (existsSync(base + ext)) return { path: base + ext };
    return { path: base };
  });
}};
const built = await esbuild.build({
  entryPoints: [join(here, "shell.harness.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic", loader: { ".ts": "ts", ".tsx": "tsx" },
  define: { "process.env.NODE_ENV": '"development"' },
  banner: { js: "window.process=window.process||{env:{}};" },
  plugins: [aliasPlugin], logLevel: "silent",
});
const js = built.outputFiles[0].text;
const html = readFileSync(join(here, "shell.html"));
const css = existsSync(join(here, "app.css")) ? readFileSync(join(here, "app.css")) : "";

// ── bridge ────────────────────────────────────────────────────────────────
let role = "admin";
let model = "enterprise";   // enterprise ⇒ optional capabilities ON
let signedOut = false;

const readBody = (req) => new Promise((ok) => {
  let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => ok(s ? JSON.parse(s) : {}));
});

const server = createServer(async (req, res) => {
  const u = req.url.split("?")[0];
  if (req.method === "GET") {
    if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(html); }
    if (u === "/shell.harness.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js); }
    if (u === "/app.css") { res.writeHead(200, { "content-type": "text/css" }); return res.end(css); }
    res.writeHead(404); return res.end();
  }
  const body = await readBody(req);
  const json = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };

  if (u === "/auth") {
    const user = signedOut ? null : { id: "shell-user", email: "shell@example.test" };
    return json({ data: { data: { user }, error: null }, error: null });
  }
  if (u === "/from") {
    if (body.table === "app_settings") {
      return json({ data: [
        { key: "business_type", value: "caterer" },
        { key: "operating_model", value: model },
      ], error: null });
    }
    if (body.table === "tenant_users") {
      if (signedOut) return json({ data: null, error: null });
      return json({ data: { tenant_id: "t-1", role, active: true, tenants: { name: "Fixture" } }, error: null });
    }
    return json({ data: null, error: null });
  }
  res.writeHead(404); res.end();
});
await new Promise((ok) => server.listen(4300, ok));

const browser = await chromium.launch();
const page = await browser.newPage();
let passed = 0, failed = 0;
const T = async (n, fn) => { try { await fn(); passed++; console.log(`PASS ${n}`); }
  catch (e) { failed++; console.log(`FAIL ${n}\n     ${String(e.message).split("\n")[0]}`); } };
const go = async (q = "") => {
  await page.goto(`http://localhost:4300/${q}`);
  await page.waitForSelector("aside", { state: "attached", timeout: 15000 });
  // the rail renders gated items only after caps and session resolve
  await page.waitForFunction(() => !!document.querySelector('[data-nav-item="/dashboard"]'), null,
    { timeout: 15000 }).catch(() => {});
};
const items = () => page.$$eval("[data-nav-item]", (e) => e.map((x) => x.getAttribute("data-nav-item")));

const DEPARTMENTS = ["culinary", "equipment", "staffing", "venue", "logistics"];

// v298 · Operations is a LENS, not a URL prefix: Today's canonical route left
// the /operations/ namespace while staying in the group. The permission-gate
// claims (SH-6, SH-6b) test that NOTHING in the group renders unentitled, so
// they must name membership, not a path prefix — a prefix test would have gone
// silently vacuous for Today the moment its route moved.
const isOperations = (h) => h.startsWith("/operations/") || h === "/today";

// ══ SH-1 · the Operations group exists ════════════════════════════════════
await go();
await T("SH-1 the shell renders an Operations group for a user holding ops.view", async () => {
  if (!(await page.$('[data-nav-group="Operations"]'))) throw new Error("no Operations group");
  const title = await page.textContent('[data-nav-group="Operations"]');
  if (!title.includes("Operations")) throw new Error("group is not titled Operations");
});

// ══ SH-2 · Today is reachable — the v288a orphan is closed ════════════════
// v298 rewrote SH-2 and SH-2b to the new canonical route rather than retiring
// them, exactly as v291 rewrote SH-3/SH-3b: the claim — Today is reachable from
// the shell, and the redirect path is never advertised — is unchanged. Only
// which of the two paths is canonical moved.
await T("SH-2 Operations Today is reachable from the shell at /today", async () => {
  const all = await items();
  if (!all.includes("/today")) throw new Error(`Today not in the rail: ${all.join(" ")}`);
  const link = await page.$('[data-nav-item="/today"]');
  const href = await link.getAttribute("href");
  if (href !== "/today") throw new Error(`href is ${href}`);
});

await T("SH-2b no /operations/today entry is advertised — the legacy path is a redirect, not a destination", async () => {
  const all = await items();
  if (all.includes("/operations/today")) throw new Error("the rail still advertises the legacy /operations/today path");
});

// ══ SH-3 · Departments is ONE rail position (v291 ruling) ═════════════════
// v290 asserted five per-department rail entries. That shape was overruled:
// departments must not consume five equal positions as Operations expands, so
// these two claims were rewritten to the new ruling rather than retired.
await T("SH-3 Departments occupies exactly one rail position", async () => {
  const all = await items();
  const ops = all.filter((h) => h.startsWith("/operations/"));
  if (!ops.includes("/operations/departments")) throw new Error(`no Departments entry: ${ops.join(" ")}`);
  const perDept = ops.filter((h) => h.startsWith("/operations/departments/"));
  if (perDept.length > 0) throw new Error(`the rail still advertises per-department paths: ${perDept.join(" ")}`);
  const label = await page.textContent('[data-nav-item="/operations/departments"]');
  if (!label.includes("Departments")) throw new Error(`entry reads "${label.trim()}"`);
});

await T("SH-3b Operations advertises whole surfaces only — it does not grow by department", async () => {
  const all = await items();
  const ops = all.filter((h) => h.startsWith("/operations/")).sort();
  // v296 registered Preparation and Day Sheet; v298 moved Today to /today. The
  // claim under test is unchanged — no per-department entry may appear — but
  // the enumeration it compares against had gone stale at v296 and is restated
  // here to the registry as it now stands.
  if (ops.join(",") !== "/operations/day,/operations/departments,/operations/preparation")
    throw new Error(`Operations advertises [${ops.join(",")}]`);
});

// ══ SH-4 · Operations is open by default ══════════════════════════════════
await T("SH-4 the Operations group is open on arrival — a collapsed rail is how /today stayed invisible", async () => {
  await go();
  const visible = await page.$eval('[data-nav-item="/today"]',
    (e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.width > 0; });
  if (!visible) throw new Error("Today is present but not visible without interaction");
});

// ══ SH-5 · NO capability gate ═════════════════════════════════════════════
await T("SH-5 Operations survives a tenant with every optional module OFF — it carries no capability gate", async () => {
  model = "template_driven";        // advanced=false ⇒ proposals, rolodex off
  await go();
  if (!(await page.$('[data-nav-group="Operations"]'))) throw new Error("Operations vanished with modules off");
  const all = await items();
  if (!all.includes("/today")) throw new Error("Today vanished with modules off");
  if (!all.includes("/operations/departments")) throw new Error("Departments vanished with modules off");
  // control: a genuinely module-gated entry MUST disappear, or the claim is vacuous
  if (all.includes("/price-book")) throw new Error("cap-gated Price Book still rendered — gate is not working");
  if (all.includes("/rolodex")) throw new Error("cap-gated Library still rendered — gate is not working");
  model = "enterprise";
});

// ══ SH-6 · the permission gate does bite ══════════════════════════════════
await T("SH-6 a role without ops.view sees no Operations group at all", async () => {
  role = "bookkeeper";             // holds bookings.view, dashboard.view, finance.view
  await go();
  if (await page.$('[data-nav-group="Operations"]')) throw new Error("Operations rendered without ops.view");
  const all = await items();
  if (all.some(isOperations)) throw new Error("an operations entry leaked through");
  // control: this role still sees what it is entitled to
  if (!all.includes("/dashboard")) throw new Error("gate over-applied — bookkeeper lost dashboard.view");
  role = "admin";
});

await T("SH-6b signed out, no operations entry renders", async () => {
  signedOut = true;
  await go();
  const all = await items();
  if (all.some(isOperations)) throw new Error("operations entry rendered while signed out");
  signedOut = false;
});

// ══ SH-7 · active state resolves for nested operations routes ═════════════
await T("SH-7 a nested department route still marks the single Departments entry active, and not Today", async () => {
  await go("?path=/operations/departments/equipment");
  const active = await page.$$eval("[data-nav-item]", (els) => els
    .filter((e) => e.className.includes("bg-white/10"))
    .map((e) => e.getAttribute("data-nav-item")));
  if (!active.includes("/operations/departments"))
    throw new Error(`active entries were [${active.join(",")}]`);
  if (active.includes("/today"))
    throw new Error("Today rendered active on a departments route");
});

// ══ SH-8 · the v298 canonical/legacy contract (source-level claim) ════════
// v290 asserted the opposite direction AND that no next.config existed. The
// second half was false when written — next.config.js dates from the initial
// deployment — and it is dropped rather than carried forward. v298's ruling
// replaces it: the redirect is CONFIGURED, because a page-level redirect on a
// statically prerendered route ships inside the RSC payload and never moves the
// browser. The page-level permanentRedirect stays as defense-in-depth, so this
// claim asserts BOTH halves plus the canonical mount they point at.
await T("SH-8 (source) /operations/today redirects permanently to /today, which mounts OperationsToday", async () => {
  const legacy = readFileSync(join(root, "src/app/operations/today/page.tsx"), "utf8");
  if (!/from\s+"next\/navigation"/.test(legacy)) throw new Error("does not import next/navigation");
  if (!/permanentRedirect\(\s*"\/today"\s*\)/.test(legacy)) throw new Error("does not permanently redirect to /today");
  if (/"use client"/.test(legacy)) throw new Error("redirect page is a client component");

  const canonical = readFileSync(join(root, "src/app/today/page.tsx"), "utf8");
  if (!/OperationsToday/.test(canonical) || /redirect\(/.test(canonical))
    throw new Error("/today does not mount OperationsToday — the canonical route is not canonical");

  // The authoritative half: only a config redirect resolves before routing and
  // emits a real 308 + Location.
  if (!existsSync(join(root, "next.config.js"))) throw new Error("next.config.js is absent");
  const cfg = readFileSync(join(root, "next.config.js"), "utf8");
  if (!/redirects\s*\(/.test(cfg)) throw new Error("next.config.js declares no redirects()");
  if (!/source:\s*"\/operations\/today"/.test(cfg)) throw new Error("no configured redirect from /operations/today");
  if (!/destination:\s*"\/today"/.test(cfg)) throw new Error("the configured redirect does not target /today");
  if (!/permanent:\s*true/.test(cfg)) throw new Error("the configured redirect is not permanent");
});

console.log(`\naccept-operations-shell: ${passed} passed, ${failed} failed`);
await browser.close(); server.close();
process.exit(failed === 0 ? 0 : 1);
