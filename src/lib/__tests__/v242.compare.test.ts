// v242 — COMPARE PRESENTATION…: the Second Sheet's five exposures, pure.
import { comparePresentation } from "../compare";
import { portablePresentation } from "../portable";
import { ThemeDelta } from "../publication";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};

const source = portablePresentation({
  themeKey: "gallery",
  override: {
    colors: { accent: "#8B0000" },
    treatments: { document: { cover: "banner" }, sections: {
      "role-a": { heading: "eyebrow" }, "role-ghost": { heading: "centered" } } },
  } as ThemeDelta,
  pins: { cover: { id: "ph-present", url: "u", label: "hall" },
          sections: { "role-a": { id: "ph-gone", url: "u", label: "lost plate" } } },
});
const dest = {
  themeKey: null,
  override: {
    fonts: { pairing: "modern" },                       // dest-only leaf → must surface as inherits
    treatments: {
      document: { cover: "classic" },                   // differing leaf
      sections: { "sec-1": { divider: "dots" } },       // dest section dress → clears
      components: { "c1": { title: "caps" }, "c2": { title: "accent" } },
      items: { "items:c1": { bullet: "dash" } },
    },
  } as ThemeDelta,
  pins: { components: { "comp:c1": { id: "p", url: "u", label: "keep" } } },
};
const destSections = [{ id: "sec-1", role: "role-a" }];

T("WHAT CHANGES includes omission: the destination's own leaves surface as → (inherits); differing leaves show both sides; theme arrival shows", () => {
  const r = comparePresentation(source, dest, destSections, ["ph-present"]);
  const f = (leaf: string) => r.changes.filter((c) => c.leaf === leaf)[0];
  if (f("fonts.pairing")?.to !== "(inherits)") throw new Error("omission not shown as a change");
  if (f("treatments.document.cover")?.from !== "classic" || f("treatments.document.cover")?.to !== "banner")
    throw new Error("differing leaf not shown both-sided");
  if (f("theme")?.to !== "gallery") throw new Error("theme arrival missing");
  if (r.changes.some((c) => c.leaf.indexOf("components") >= 0 || c.leaf.indexOf("items") >= 0))
    throw new Error("bound dress leaked into the changes list");
});

T("WHAT STAYS BOUND is counted, never itemized as change: 2 component dresses · 1 item dress · 1 component pin", () => {
  const r = comparePresentation(source, dest, destSections, ["ph-present"]);
  if (r.staysBound.components !== 2 || r.staysBound.items !== 1 || r.staysBound.compPins !== 1)
    throw new Error(`bound counts wrong: ${JSON.stringify(r.staysBound)}`);
});

T("UNMATCHED waits are named; AMBIGUOUS demands decisions with candidates; arriving/clearing section counts are honest", () => {
  const r = comparePresentation(source, dest, destSections, ["ph-present"]);
  if (r.unmatched.join(",") !== "role-ghost") throw new Error("the waiting role is unnamed");
  if (r.ambiguous.length !== 0) throw new Error("phantom ambiguity");
  if (r.sectionDressArriving !== 1 || r.sectionDressClearing !== 1)
    throw new Error(`arriving/clearing wrong: ${r.sectionDressArriving}/${r.sectionDressClearing}`);
  const twin = comparePresentation(source, dest,
    [{ id: "sec-1", role: "role-a" }, { id: "sec-1b", role: "role-a" }], ["ph-present"]);
  const amb = twin.ambiguous[0];
  if (!amb || amb.role !== "role-a" || amb.matches.join(",") !== "sec-1,sec-1b")
    throw new Error("ambiguity not surfaced with its candidates");
});

T("MISSING PHOTOS: a pin whose photo the library lacks is flagged by slot and label; present photos are not", () => {
  const r = comparePresentation(source, dest, destSections, ["ph-present"]);
  if (r.missingPhotos.length !== 1 || r.missingPhotos[0].slot !== "role-a" || r.missingPhotos[0].label !== "lost plate")
    throw new Error(`missing-photo report wrong: ${JSON.stringify(r.missingPhotos)}`);
  const all = comparePresentation(source, dest, destSections, ["ph-present", "ph-gone"]);
  if (all.missingPhotos.length !== 0) throw new Error("present photo flagged as missing");
});

console.log(`\nv242.compare: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
