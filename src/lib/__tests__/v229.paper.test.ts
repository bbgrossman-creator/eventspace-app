// v229 — Interactive Paper's pure claims: the document treatment carries its
// own leaves and defaults them; background rides the shared shape and the
// ladder; sections inherit the document's background; the new registries
// stay semantic.
import {
  resolveTheme, effectiveSectionTreatment, SYSTEM_DEFAULT_THEME,
  DOCUMENT_TITLE_OPTIONS, MEASURE_OPTIONS, TREATMENT_OPTIONS,
} from "../publication";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
T("the document has its own dress: title resolves through the ladder, defaults standard", () => {
  const base = resolveTheme(null, null, null).theme;
  if (base.treatments.document.title !== "standard" || base.treatments.document.background !== "none")
    throw new Error(JSON.stringify(base.treatments.document));
  const { theme } = resolveTheme({ treatments: { document: { title: "understated" } } }, null,
    { treatments: { document: { title: "centered" } } });
  if (theme.treatments.document.title !== "centered") throw new Error("override title lost");
});
T("background rides the shared shape: document default washes every untouched section; a section opts out per leaf", () => {
  const { theme } = resolveTheme(null,
    { treatments: { document: { background: "tint" } } },
    { treatments: { sections: { s1: { background: "none" } } } });
  if (effectiveSectionTreatment(theme, "s1").background !== "none") throw new Error("section opt-out lost");
  if (effectiveSectionTreatment(theme, "anywhere").background !== "tint") throw new Error("document wash didn't inherit");
});
T("the new registries are semantic and complete: title options cover the type; measures are named numbers", () => {
  const sys = SYSTEM_DEFAULT_THEME.treatments!.document!;
  if (!DOCUMENT_TITLE_OPTIONS.some((o) => o.value === sys.title)) throw new Error("system title not offered");
  if (!MEASURE_OPTIONS.some((o) => o.value === SYSTEM_DEFAULT_THEME.margins!.measure)) throw new Error("system measure not offered");
  for (const o of MEASURE_OPTIONS) if (typeof o.value !== "number" || !o.label) throw new Error("measure must be a NAMED number");
  const bg = TREATMENT_OPTIONS.filter((g) => g.key === "background")[0];
  if (!bg || bg.options.length !== 3) throw new Error("background group malformed");
});
console.log(`\nv229.paper: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
