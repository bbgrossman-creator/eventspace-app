// v231 — Publication Regions' pure claims: every region defaults OFF (zero
// visual change for existing documents), the registry offers each system
// default, and region leaves ride the ladder like any other dress.
import { resolveTheme, SYSTEM_DEFAULT_THEME, REGION_OPTIONS } from "../publication";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
T("every region defaults to NONE — a paper that never asked stays exactly as it was", () => {
  const doc = resolveTheme(null, null, null).theme.treatments.document;
  for (const g of REGION_OPTIONS) {
    if (doc[g.key] !== (g.key === "terms" ? "none" : "none")) throw new Error(`${g.key} defaults ${doc[g.key]}`);
  }
});
T("the registry is honest: every region's system default is offered; options are named, never free-form", () => {
  const sys = SYSTEM_DEFAULT_THEME.treatments!.document!;
  for (const g of REGION_OPTIONS) {
    if (!g.options.some((o) => o.value === (sys as Record<string, string>)[g.key]))
      throw new Error(`${g.key}: system default missing from its own registry`);
    for (const o of g.options) if (!/^[a-z]+$/.test(o.value)) throw new Error(`free-form leak: ${o.value}`);
    if (!g.blurb) throw new Error(`${g.key} has no story`);
  }
});
T("region leaves ride the ladder: brand turns the footer on, a version turns it back off", () => {
  const { theme } = resolveTheme(
    { treatments: { document: { footer: "line", watermark: "draft" } } }, null,
    { treatments: { document: { footer: "none" } } });
  if (theme.treatments.document.footer !== "none") throw new Error("the version's no lost to the brand's yes");
  if (theme.treatments.document.watermark !== "draft") throw new Error("untouched region leaf lost its brand rung");
});
console.log(`\nv231.regions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
