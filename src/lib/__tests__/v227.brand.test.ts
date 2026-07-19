// v227 — Brand Studio's pure claims: theme keys resolve across both shelves,
// the brand rung changes a proposal's dress without any theme chosen, and
// the pairing shelf stayed curated while it grew.
import { resolveThemeKey, resolveTheme, FONT_PAIRINGS, BUILT_IN_THEMES } from "../publication";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
T("theme keys resolve across BOTH shelves: built-ins by key, tenant themes by id, unknown skips the rung", () => {
  const tenant = [{ id: "t-1", delta: { colors: { primary: "#5B1E2D" } } }];
  const lux = resolveThemeKey("luxury", tenant);
  if (!lux || lux.fonts?.pairing !== "cormorant-source") throw new Error("built-in lost");
  const mine = resolveThemeKey("t-1", tenant);
  if (!mine || mine.colors?.primary !== "#5B1E2D") throw new Error("tenant theme lost");
  if (resolveThemeKey("gone", tenant) !== null) throw new Error("phantom theme");
  if (resolveThemeKey(null, tenant) !== null) throw new Error("null must skip the rung");
  const { theme } = resolveTheme(null, resolveThemeKey("gone", tenant), null);
  if (theme.colors.primary !== "#102F56") throw new Error("an unknown key must fall through to system, not crash");
});
T("the brand rung alone dresses a proposal — no theme chosen, the company look applies", () => {
  const { theme, provenance } = resolveTheme(
    { fonts: { pairing: "montserrat-inter" }, colors: { primary: "#0F172A" } }, null, null);
  if (theme.fonts.pairing !== "montserrat-inter") throw new Error("brand pairing lost");
  if (provenance.colors.primary !== "brand" || provenance.colors.accent !== "system")
    throw new Error(JSON.stringify(provenance.colors));
});
T("the shelf grew and stayed curated: 12+ pairings, unique keys, every stack has a fallback", () => {
  if (FONT_PAIRINGS.length < 12) throw new Error(`only ${FONT_PAIRINGS.length} pairings`);
  const seen: Record<string, true> = {};
  for (const f of FONT_PAIRINGS) {
    if (seen[f.key]) throw new Error("dup " + f.key);
    seen[f.key] = true;
    if (f.headingStack.split(",").length < 2 || f.bodyStack.split(",").length < 2)
      throw new Error(f.key + " has no graceful fallback");
  }
  const keys: Record<string, true> = {};
  for (const t of BUILT_IN_THEMES) { if (keys[t.key]) throw new Error("dup theme"); keys[t.key] = true; }
});
console.log(`\nv227.brand: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
