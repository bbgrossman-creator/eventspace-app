// v217 — the harness's own Tailwind config. The PRODUCTION config lives at
// repo root outside the src zips (standing environment note) and never ships
// here — so every harness build v213–v216 ran the CLI configless, emitting
// ZERO utilities: geometry assertions were passing against plain block flow.
// This config exists so the suites measure the real layout. Build with:
//   npx tailwindcss -c browser-tests/tailwind.harness.config.js -i browser-tests/tw.css -o browser-tests/app.css --minify
// (v218 note: strip built bundles with `rm browser-tests/*.harness.js
// browser-tests/*.variant.js` — a bare *.js deleted THIS FILE before the
// v217 zip was cut, which is why v217 shipped without it.)
module.exports = {
  content: ["./src/**/*.{ts,tsx}", "./browser-tests/**/*.{ts,tsx,html}"],
  theme: { extend: {} },
  plugins: [],
};
