// v241 — THE PORTABILITY RULING, proven. Match behavior · omission
// semantics · bound preservation · asset kind · provenance · fingerprint.
import { portablePresentation, matchSections, applyPortable, replaceOntoDestination,
  fingerprintPortable, makeProvenance, ASSET_KINDS, APPLY_CONFIRM_WORDING } from "../portable";
import { ThemeDelta } from "../publication";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};

const ov: ThemeDelta = {
  colors: { accent: "#8B0000" },
  treatments: {
    document: { cover: "banner", footer: "line" },
    sections: { "role-dinner": { heading: "eyebrow" }, "role-dessert": { divider: "dots" } },
    components: { "comp-1": { title: "caps" } },
    items: { "items:comp-1": { bullet: "diamond" } },
  },
};
const pins = {
  cover: { id: "ph1", url: "u1", label: "hall" },
  sections: { "role-dinner": { id: "ph2", url: "u2", label: "plated" } },
  components: { "comp:comp-1": { id: "ph3", url: "u3", label: "close-up" } },
};

T("the extractor takes ONLY the portable stratum: document delta, regions, role-keyed section dress & pins — bound dress never leaves", () => {
  const p = portablePresentation({ themeKey: "classic", override: ov, pins });
  if (p.delta.colors?.accent !== "#8B0000") throw new Error("document delta lost");
  if (p.delta.treatments?.document?.cover !== "banner") throw new Error("regions lost");
  if ((p.delta.treatments as Record<string, unknown>)?.components) throw new Error("component dress leaked into the delta");
  if ((p.delta.treatments as Record<string, unknown>)?.items) throw new Error("item dress leaked into the delta");
  if (!p.sectionDress["role-dinner"] || !p.sectionDress["role-dessert"]) throw new Error("section dress lost");
  if (p.documentPin?.id !== "ph1") throw new Error("document pin lost");
  if (p.sectionPins["role-dinner"]?.id !== "ph2") throw new Error("section pin lost");
  if (JSON.stringify(p).includes("ph3") || JSON.stringify(p).includes("comp-1"))
    throw new Error("BOUND presentation escaped through a presentation-only verb");
});

T("THE MATCH LAW: no match waits silently · one match applies · many matches DEMAND a decision — guessing is forbidden, 'all' only by explicit choice", () => {
  const p = portablePresentation({ themeKey: null, override: ov, pins });
  const dest = [
    { id: "s1", role: "role-dinner" }, { id: "s2", role: "role-dinner" },  // ambiguous
    { id: "s3", role: "role-dessert" },                                     // exactly one
  ];                                                                        // no role for a third dress → waits
  const report = matchSections(p, dest);
  if (report.find((m) => m.role === "role-dinner")?.outcome !== "decide") throw new Error("ambiguity not surfaced");
  if (report.find((m) => m.role === "role-dessert")?.outcome !== "applies") throw new Error("single match refused");
  let threw = false;
  try { applyPortable(p, dest); } catch (e) { threw = /AMBIGUOUS_ROLE:role-dinner/.test((e as Error).message); }
  if (!threw) throw new Error("application GUESSED among multiple matches");
  const chosen = applyPortable(p, dest, { "role-dinner": ["s2"] });
  if (chosen.override.treatments?.sections?.["s2"]?.heading !== "eyebrow") throw new Error("explicit choice not honored");
  if (chosen.override.treatments?.sections?.["s1"]) throw new Error("un-chosen sibling dressed anyway");
  const all = applyPortable(p, dest, { "role-dinner": "all" });
  if (!all.override.treatments?.sections?.["s1"] || !all.override.treatments?.sections?.["s2"])
    throw new Error("explicit 'all' did not reach all matches");
  if (chosen.pins.sections?.["s2"]?.id !== "ph2") throw new Error("section pin didn't follow the mapping");
});

T("OMISSION MEANS INHERITANCE: replacement lands the WHOLE portable namespace; nothing of the destination's old portable dress survives; bound stays exactly", () => {
  const p = portablePresentation({ themeKey: null, override: ov, pins });
  const destOverride: ThemeDelta = {
    fonts: { pairing: "modern" },                                  // old portable — must die
    treatments: {
      document: { watermark: "confidential" },                     // old portable — must die
      sections: { "s9": { heading: "centered" } },              // old portable — must die
      components: { "comp-9": { title: "accent" } },               // BOUND — must live
      items: { "items:comp-9": { bullet: "dash" } },               // BOUND — must live
    },
  };
  const destPins = { sections: { "s9": { id: "ph9", url: "u9", label: "old" } },
    components: { "comp:comp-9": { id: "ph10", url: "u10", label: "keep" } } };
  const applied = applyPortable(p, [{ id: "d1", role: "role-dinner" }]);
  const out = replaceOntoDestination(destOverride, destPins, applied);
  if (out.override.fonts) throw new Error("old portable fonts survived — omission preserved instead of inheriting");
  if (out.override.treatments?.document?.watermark) throw new Error("old region value survived replacement");
  if (out.override.treatments?.sections?.["s9"]) throw new Error("old section dress survived replacement");
  if (out.override.treatments?.components?.["comp-9"]?.title !== "accent") throw new Error("bound component dress lost");
  if (out.override.treatments?.items?.["items:comp-9"]?.bullet !== "dash") throw new Error("bound item dress lost");
  if (out.pins.sections?.["s9"]) throw new Error("old section pin survived replacement");
  if (out.pins.components?.["comp:comp-9"]?.id !== "ph10") throw new Error("bound pin lost");
  if (out.pins.sections?.["d1"]?.id !== "ph2") throw new Error("applied pin missing");
  if (!APPLY_CONFIRM_WORDING.includes("Component and item-list styling will remain"))
    throw new Error("the confirm no longer states the law");
});

T("ASSET KIND is declared, never blurred; PROVENANCE records application, never theme_key; the fingerprint is content-true and order-blind", () => {
  if (ASSET_KINDS.join(",") !== "theme,template") throw new Error("asset kinds drifted");
  const p1 = portablePresentation({ themeKey: "classic", override: ov, pins });
  const p2 = portablePresentation({ themeKey: "classic", override: JSON.parse(JSON.stringify(ov)), pins });
  if (fingerprintPortable(p1) !== fingerprintPortable(p2)) throw new Error("fingerprint unstable across identical content");
  const p3 = portablePresentation({ themeKey: "classic", override: { ...ov, colors: { accent: "#000080" } }, pins });
  if (fingerprintPortable(p1) === fingerprintPortable(p3)) throw new Error("fingerprint blind to content change");
  const prov = makeProvenance("tpl-1", p1, "midflight");
  if (prov.template_id !== "tpl-1" || prov.mode !== "midflight" || !prov.applied_at || prov.fingerprint !== fingerprintPortable(p1))
    throw new Error("provenance shape wrong");
  if ("theme_key" in prov) throw new Error("provenance smells like reconstruction-by-theme_key");
});

console.log(`\nv241.portable: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
