// v296 NAVIGATION ACCEPTANCE — the REAL Sidebar rendered in Chromium.
// Claims NV-1..NV-10.
//
// NO DATABASE. v296 deploys no SQL object, so this suite never opens psql,
// never clones ec, and never crosses an OS-user boundary. The scratch directory
// is read only by esbuild running as the invoking user.
//
// Module strategy, deliberate:
//   · @/lib/permissions is the REAL module — the permission gate under test
//     must be the product's own, not a double. It reaches supabase, which is
//     aliased to the harness stub exactly as the v295 suite does.
//   · @/lib/capabilities IS stubbed. Sidebar loads it inside a Promise.all with
//     loadSession, so a rejection there would blank the whole rail and every
//     claim would fail for a reason unrelated to navigation. Operations rows
//     carry no `cap`, so stubbing it cannot mask a capability defect.
//   · next/navigation and next/link are stubbed: they are framework, not product.
//
// Run: node browser-tests/accept-navigation.mjs
import esbuild from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "http";
import { existsSync, writeFileSync, mkdtempSync, chmodSync, rmSync } from "fs";
import { dirname, join, resolve } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const scratch = mkdtempSync(join(tmpdir(), "v296-"));
chmodSync(scratch, 0o755);
const PORT = 4296;

// ── the frozen registry contract, asserted against the rendered rail ────────
// The real Session contract. `perms` is what can() actually reads; a row-shaped
// stub without it would blank the entire rail and every claim would fail for a
// fixture reason rather than a navigation one.
const SESSION = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "nav@e.test",
  tenantId: "22222222-2222-2222-2222-222222222222",
  tenantName: "Fixture",
  role: "admin",
  // Enumerated rather than derived: permissionsFor() is not part of the frozen
  // v296 surface, and a broad set keeps the whole rail populated so NV-6 and
  // NV-7 scan every registered entry, not just the Operations group.
  perms: ["ops.view", "dashboard.view", "bookings.view", "calendar.view",
          "inquiries.create", "knowledge.view", "content.manage",
          "communications.view", "config.manage", "users.manage", "staff.manage"],
  unassigned: false,
};

const EXPECTED = [
  { href: "/operations/today", label: "Today" },
  { href: "/operations/preparation", label: "Preparation" },
  { href: "/operations/day", label: "Day Sheet" },
  { href: "/operations/departments", label: "Departments" },
];

writeFileSync(join(scratch, "stub-link.tsx"),
  `export default function Link(p:any){const{href,children,...r}=p;return <a href={href} {...r}>{children}</a>;}\n`);
writeFileSync(join(scratch, "stub-navigation.ts"),
  `export function usePathname(){return (window as any).__PATH__ ?? "/";}\n` +
  `export function useRouter(){return {push(){},replace(){},back(){}};}\n` +
  `export function useSearchParams(){return new URLSearchParams();}\n`);
writeFileSync(join(scratch, "stub-permissions.ts"),
  // can() is imported from the REAL module and re-exported untouched.
  `export { can } from ${JSON.stringify(join(root, "src/lib/permissions"))};\n` +
  `export type { Session, Permission } from ${JSON.stringify(join(root, "src/lib/permissions"))};\n` +
  `export async function loadSession(){ return (window as any).__SESSION__ ?? null; }\n`);
writeFileSync(join(scratch, "stub-capabilities.ts"),
  `export const CAPS_CHANGED_EVENT = "eventcore:caps-changed";\n` +
  `export type Capabilities = Record<string, boolean>;\n` +
  `export async function loadCapabilities(){\n` +
  `  return { caps: { rolodex: true, proposals: true, production: true } as Capabilities };\n` +
  `}\n`);
writeFileSync(join(scratch, "nav.harness.tsx"), `
import { createRoot } from "react-dom/client";
import Sidebar from "@/components/Sidebar";
const q = new URLSearchParams(location.search);
(window as any).__PATH__ = q.get("path") ?? "/";
(window as any).__SESSION__ = q.get("session") === "none" ? null : JSON.parse(q.get("session")!);
createRoot(document.getElementById("root")!).render(<Sidebar />);
`);

const aliasPlugin = { name: "alias", setup(b) {
  // order matters: the specific filters must precede the generic @/ resolver
  b.onResolve({ filter: /supabase$/ }, (a) => (
    ["@/lib/supabase", "./supabase", "../supabase", "../lib/supabase"].includes(a.path)
      ? { path: join(here, "live-supabase.ts") } : null));
  b.onResolve({ filter: /^@\/lib\/capabilities$/ }, () => ({ path: join(scratch, "stub-capabilities.ts") }));
  b.onResolve({ filter: /^@\/lib\/permissions$/ }, () => ({ path: join(scratch, "stub-permissions.ts") }));
  b.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(scratch, "stub-link.tsx") }));
  b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(scratch, "stub-navigation.ts") }));
  b.onResolve({ filter: /^@\// }, (a) => {
    const base = join(root, "src", a.path.slice(2));
    for (const ext of [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"])
      if (existsSync(base + ext)) return { path: base + ext };
    return { path: base };
  });
}};

const built = await esbuild.build({
  entryPoints: [join(scratch, "nav.harness.tsx")], bundle: true, write: false,
  // /tmp cannot walk up to the repo's node_modules; nodePaths is esbuild's own
  // resolver option and IS honoured (v295 lesson).
  nodePaths: [join(root, "node_modules")],
  absWorkingDir: root,
  format: "iife", jsx: "automatic", loader: { ".ts": "ts", ".tsx": "tsx" },
  define: { "process.env.NODE_ENV": '"development"' },
  banner: { js: "window.process=window.process||{env:{}};" },
  plugins: [aliasPlugin], logLevel: "silent",
});
const js = built.outputFiles[0].text;
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/n.js"></script></body></html>`;

// ── in-memory supabase stub. No database is involved anywhere in this suite. ─
const readBody = (req) => new Promise((ok) => { let s = ""; req.on("data", (c) => s += c); req.on("end", () => ok(s ? JSON.parse(s) : {})); });
const server = createServer(async (req, res) => {
  const u = req.url.split("?")[0];
  if (req.method === "GET") {
    if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(html); }
    if (u === "/n.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js); }
    res.writeHead(404); return res.end();
  }
  await readBody(req);
  const json = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  // Session truth is supplied directly to loadSession(); these remain only so
  // that any incidental supabase call from the real modules resolves.
  if (u === "/auth") return json({ data: { data: { user: { id: SESSION.userId, email: SESSION.email } }, error: null }, error: null });
  if (u === "/from") return json({ data: { tenant_id: SESSION.tenantId, role: SESSION.role, active: true, tenants: { name: SESSION.tenantName } }, error: null });
  if (u === "/rpc") return json({ data: null, error: null });
  res.writeHead(404); res.end();
});
await new Promise((ok) => server.listen(PORT, ok));

let browser = null, cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { if (browser) browser.close(); } catch {}
  try { server.close(); } catch {}
  try { rmSync(scratch, { recursive: true, force: true }); } catch {}
};
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });

browser = await chromium.launch();
const page = await browser.newPage();
let passed = 0, failed = 0;
const T = async (n, fn) => {
  try { await fn(); passed++; console.log(`PASS ${n}`); }
  catch (e) { failed++; console.log(`FAIL ${n}\n     ${(e.message || "").split("\n")[0]}`); }
};
const url = (path, session) =>
  `http://localhost:${PORT}/?path=${encodeURIComponent(path)}&session=${encodeURIComponent(session)}`;
const go = async (path) => {
  await page.goto(url(path, JSON.stringify(SESSION)));
  await page.waitForSelector("aside", { timeout: 15000 });
  await page.waitForSelector('[data-nav-group="Operations"]', { timeout: 15000 });
  await page.waitForTimeout(150);   // settle the ready-gated render
};
const opsHrefs = () => page.$$eval(
  '[data-nav-group="Operations"] [data-nav-item]', (els) => els.map((e) => e.getAttribute("data-nav-item")));
const opsLabels = () => page.$$eval(
  '[data-nav-group="Operations"] [data-nav-item]', (els) => els.map((e) => (e.textContent || "").trim()));

try {
  await go("/operations/today");

  await T("NV-1 the Operations group renders exactly four registry rows", async () => {
    const h = await opsHrefs();
    if (h.length === 0) {
      const total = await page.$$eval("[data-nav-item]", (els) => els.length);
      throw new Error(total === 0
        ? "the ENTIRE rail is empty — session fixture problem (can() reads session.perms), not a registry problem"
        : `${total} rail entries render but zero under Operations — registry problem`);
    }
    if (h.length !== 4) throw new Error(`${h.length} items: ${h.join(", ")}`);
  });

  await T("NV-2 hrefs are the four certified routes, in the frozen order", async () => {
    const h = await opsHrefs();
    const want = EXPECTED.map((e) => e.href);
    if (h.join("|") !== want.join("|")) throw new Error(`got ${h.join(", ")}`);
  });

  await T("NV-3 labels read Today · Preparation · Day Sheet · Departments", async () => {
    const l = await opsLabels();
    for (const [i, e] of EXPECTED.entries())
      if (!l[i] || !l[i].includes(e.label)) throw new Error(`position ${i} reads "${l[i]}", expected "${e.label}"`);
  });

  await T("NV-4 the v294 Preparation Queue is reachable from the rail", async () => {
    if (!(await page.$('[data-nav-group="Operations"] [data-nav-item="/operations/preparation"]')))
      throw new Error("unregistered — the surface remains URL-only");
  });

  await T("NV-5 the Day Sheet is reachable from the rail", async () => {
    if (!(await page.$('[data-nav-group="Operations"] [data-nav-item="/operations/day"]')))
      throw new Error("unregistered — the surface remains URL-only");
  });

  await T("NV-6 the stale /operations/day-sheet route appears nowhere in the rail", async () => {
    const all = await page.$$eval("[data-nav-item]", (els) => els.map((e) => e.getAttribute("data-nav-item")));
    if (all.some((h) => h === "/operations/day-sheet")) throw new Error("a route that does not exist is registered");
  });

  await T("NV-7 per-entity routes are NOT registered — they mount contextually", async () => {
    const all = await page.$$eval("[data-nav-item]", (els) => els.map((e) => e.getAttribute("data-nav-item")));
    const bad = all.filter((h) => /\/occurrences\/|\/responsibilities\//.test(h || ""));
    if (bad.length) throw new Error(`registered: ${bad.join(", ")}`);
  });

  await T("NV-8 active state marks the current route and only it", async () => {
    for (const target of ["/operations/preparation", "/operations/day"]) {
      await go(target);
      const marked = await page.$$eval('[data-nav-group="Operations"] [data-nav-item]',
        (els) => els.filter((e) => e.className.includes("bg-white/10"))
                    .map((e) => e.getAttribute("data-nav-item")));
      if (marked.length !== 1 || marked[0] !== target)
        throw new Error(`on ${target} the rail marked [${marked.join(", ")}]`);
    }
    await go("/operations/today");
  });

  await T("NV-9 without a trusted session no Operations entry renders", async () => {
    // A null session through the REAL can(): !!session is false, so every
    // perm-gated item filters out and filterGroups drops the empty group.
    await page.goto(url("/operations/today", "none"));
    await page.waitForSelector("aside", { timeout: 15000 });
    await page.waitForTimeout(400);
    const n = await page.$$eval('[data-nav-group="Operations"] [data-nav-item]', (els) => els.length);
    if (n !== 0) throw new Error(`${n} Operations entries rendered for an untrusted session`);
  });

  await T("NV-10 every registered href resolves to a page that exists on disk", async () => {
    const missing = EXPECTED
      .map((e) => ({ href: e.href, file: join(root, "src/app", e.href.replace(/^\//, ""), "page.tsx") }))
      .filter((x) => !existsSync(x.file));
    if (missing.length) throw new Error(`no page.tsx for ${missing.map((m) => m.href).join(", ")}`);
  });
} finally {
  cleanup();
}

console.log(`\naccept-navigation: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
