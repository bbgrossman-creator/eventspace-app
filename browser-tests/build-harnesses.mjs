import esbuild from "esbuild";
import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

// Identical alias resolution to the in-process runners (e.g. accept-basis.mjs):
// map @/lib/supabase -> mock-supabase.ts, and @/* -> src/*
const aliasPlugin = { name: "alias", setup(b) {
  b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: join(here, "mock-supabase.ts") }));
  b.onResolve({ filter: /^@\// }, (a) => {
    const base = join(root, "src", a.path.slice(2));
    for (const ext of [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"])
      if (existsSync(base + ext)) return { path: base + ext };
    return { path: base };
  });
}};

// Browser bundles must not reference the Node `process` global. The certified
// build commands (documented in the runners) define process.env.NODE_ENV and,
// for paper, the NEXT_PUBLIC_SUPABASE_* fixtures. Transitively-imported src
// (brand.ts, googleCalendar.ts, AddressAutocomplete.tsx) reads more keys; define
// every referenced key to a harmless fixture value, and add a banner shim so any
// unforeseen process.* lookup yields undefined instead of throwing at runtime.
const envDefine = {
  "process.env.NODE_ENV": '"development"',
  "process.env.NEXT_PUBLIC_SUPABASE_URL": '"http://localhost:9"',
  "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '"fixture"',
  "process.env.NEXT_PUBLIC_BASE_URL": '"http://localhost:9"',
  "process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY": '"fixture"',
  "process.env.CRON_SECRET": '"fixture"',
  "process.env.EMAIL_BETA_ADDRESS": '"fixture"',
  "process.env.EMAIL_BETA_MODE": '"fixture"',
  "process.env.EMAIL_FROM": '"fixture"',
  "process.env.EMAIL_INTERNAL_ADDRESS": '"fixture"',
  "process.env.GOOGLE_CALENDAR_ID": '"fixture"',
  "process.env.GOOGLE_SERVICE_ACCOUNT_JSON": '"{}"',
  "process.env.RESEND_API_KEY": '"fixture"',
  "process.env.SUPABASE_SERVICE_ROLE_KEY": '"fixture"',
  "process.env.VERCEL_URL": '"localhost:9"',
};
const shimBanner = { js: 'window.process=window.process||{env:{}};' };

// (entry basename, output basename) pairs. The *.harness.tsx set outputs
// *.harness.js; a second set of plain harness sources output *.js.
const pairs = [
  ["landing.harness.tsx","landing.harness.js"],
  ["library.harness.tsx","library.harness.js"],
  ["lifecycle.harness.tsx","lifecycle.harness.js"],
  ["paper.harness.tsx","paper.harness.js"],
  ["production.harness.tsx","production.harness.js"],
  ["publish.harness.tsx","publish.harness.js"],
  ["relationship.harness.tsx","relationship.harness.js"],
  ["shell.harness.tsx","shell.harness.js"],
  ["spine.harness.tsx","spine.harness.js"],
  ["configure.tsx","configure.js"],
  ["definition.tsx","definition.js"],
  ["app.tsx","app.js"],
  ["promotion.tsx","promotion.js"],
  ["wiring.tsx","wiring.js"],
];
let built = 0;
for (const [src, outName] of pairs) {
  const entry = join(here, src);
  if (!existsSync(entry)) { console.log(`SKIP ${src} (missing)`); continue; }
  try {
    await esbuild.build({
      entryPoints: [entry],
      outfile: join(here, outName),
      bundle: true, format: "iife", jsx: "automatic",
      loader: { ".ts": "ts", ".tsx": "tsx" },
      define: envDefine, banner: shimBanner,
      plugins: [aliasPlugin], logLevel: "silent",
    });
    built++;
    console.log(`built ${outName}`);
  } catch (e) {
    console.log(`FAILED ${outName}: ${(e.message||"").split("\n").slice(0,3).join(" | ")}`);
  }
}
console.log(`DONE: ${built} artifacts built`);

