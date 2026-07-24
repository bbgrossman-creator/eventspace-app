// Generates /tmp/app_broken.js — the DELIBERATELY BROKEN bundle that proves
// accept-regression (and accept-items) detect the drag-cleanup regression.
//
// Convicted cause, recorded in accept-items.mjs: the source category's list
// UNMOUNTED when a destination opened, so Chromium had no node left to deliver
// dragend to and the Studio froze in drag state until refresh. The shipped fix
// keeps the source mounted and hides it with CSS.
//
// This script reverts exactly that one decision:
//   FIXED  : {(isOpen || isSource) && (<div style={!isOpen ? {display:"none"} : undefined} data-cat-list={key}>
//   BROKEN : {isOpen && (<div data-cat-list={key}>
//
// The variant source is written under browser-tests/__variant__/ — deliberately
// OUTSIDE src/ so it can never pollute a tsc config or ship in a src zip.
//
// Usage:  node browser-tests/build-broken-bundle.mjs
// Then :  node browser-tests/accept-regression.mjs --variant
//         node browser-tests/accept-items.mjs        (after swapping app.js)
import esbuild from "esbuild";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const SRC = join(root, "src/components/studio/renderers/DesignStage.tsx");
const VDIR = join(here, "__variant__");
const VARIANT = join(VDIR, "DesignStage.unmounting.tsx");

const FIXED = `      {(isOpen || isSource) && (
        <div style={!isOpen ? { display: "none" } : undefined} data-cat-list={key}>`;
const BROKEN = `      {isOpen && (
        <div data-cat-list={key}>`;

const src = readFileSync(SRC, "utf8");
if (src.split(FIXED).length - 1 !== 1)
  throw new Error("anchor not found exactly once in DesignStage.tsx — the fix site moved; update this script rather than guessing");
mkdirSync(VDIR, { recursive: true });
writeFileSync(VARIANT, src.replace(FIXED, BROKEN));
console.log("variant written:", VARIANT);

const envDefine = {
  "process.env.NODE_ENV": '"development"',
  "process.env.NEXT_PUBLIC_SUPABASE_URL": '"http://localhost:9"',
  "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '"fixture"',
  "process.env.NEXT_PUBLIC_BASE_URL": '"http://localhost:9"',
  "process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY": '"fixture"',
};
const alias = { name: "alias", setup(b) {
  b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: join(here, "mock-supabase.ts") }));
  b.onResolve({ filter: /DesignStage$/ }, (a) => (a.importer.includes("__variant__") ? null : { path: VARIANT }));
  b.onResolve({ filter: /^@\// }, (a) => {
    const base = join(root, "src", a.path.slice(2));
    for (const e of [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"])
      if (existsSync(base + e)) return { path: base + e };
    return { path: base };
  });
}};

await esbuild.build({
  entryPoints: [join(here, "app.tsx")],
  outfile: "/tmp/app_broken.js",
  bundle: true, format: "iife", jsx: "automatic",
  loader: { ".ts": "ts", ".tsx": "tsx" },
  define: envDefine, banner: { js: "window.process=window.process||{env:{}};" },
  plugins: [alias], logLevel: "silent",
});
console.log("broken bundle written: /tmp/app_broken.js");
