// v226 — THE CANVAS, pure claims: treatments resolve (document defaults →
// section overlay, per leaf, through the ladder), merge sparsely by
// identity, and the registry is semantic-only.
import {
  resolveTheme, effectiveSectionTreatment, mergeDelta, TREATMENT_OPTIONS, SYSTEM_DEFAULT_THEME,
} from "../publication";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
T("document treatments ride the ladder; a section entry overlays per LEAF", () => {
  const { theme } = resolveTheme(
    { treatments: { document: { spacing: "airy" } } },                       // brand
    { treatments: { document: { divider: "dots" }, sections: { "s1": { heading: "eyebrow" } } } }, // named
    { treatments: { sections: { "s1": { divider: "none" }, "s2": { spacing: "compact" } } } },     // override
  );
  if (theme.treatments.document.spacing !== "airy") throw new Error("brand document spacing lost");
  if (theme.treatments.document.divider !== "dots") throw new Error("named document divider lost");
  const s1 = effectiveSectionTreatment(theme, "s1");
  if (s1.divider !== "none") throw new Error("override section divider lost");
  if (s1.heading !== "eyebrow") throw new Error("named section heading lost through the rung merge");
  if (s1.spacing !== "airy") throw new Error("s1 must inherit the document's spacing");
  const s2 = effectiveSectionTreatment(theme, "s2");
  if (s2.spacing !== "compact" || s2.divider !== "dots" || s2.heading !== "standard")
    throw new Error(JSON.stringify(s2));
  const s3 = effectiveSectionTreatment(theme, "never-touched");
  if (s3.divider !== "dots" || s3.spacing !== "airy") throw new Error("untouched identity must wear the document defaults");
});
T("mergeDelta scopes by identity: patching s1 never touches s2 or the document", () => {
  const base = { treatments: { document: { divider: "rule" as const }, sections: { s2: { spacing: "airy" as const } } } };
  const out = mergeDelta(base, { treatments: { sections: { s1: { heading: "centered" } } } });
  if (out.treatments?.sections?.s1?.heading !== "centered") throw new Error("patch lost");
  if (out.treatments?.sections?.s2?.spacing !== "airy") throw new Error("sibling identity disturbed");
  if (out.treatments?.document?.divider !== "rule") throw new Error("document disturbed");
});
T("the registry is SEMANTIC-ONLY: named options, no free-form values, defaults present", () => {
  for (const g of TREATMENT_OPTIONS) {
    if (!g.options.length) throw new Error(g.key + " offers nothing");
    for (const o of g.options) if (!/^[a-z]+$/.test(o.value)) throw new Error(`free-form leak: ${o.value}`);
    const def = (SYSTEM_DEFAULT_THEME.treatments!.document as Record<string, string>)[g.key];
    if (!g.options.some((o) => o.value === def)) throw new Error(`system default ${def} not offered for ${g.key}`);
  }
});
console.log(`\nv226.canvas: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
