// v208 unit suite — the pure core, where promotion bugs would live.
import {
  registerCorePromotionKinds, _resetPromotionKindsForTests, composeRevision,
  checkCoherence, aggregateEvidence, citationsFor, EvidenceLine,
} from "../promotion";
import { RevisionDoc, emptyDoc } from "../curation";

let passed = 0, failed = 0;
function eq(a: unknown, b: unknown, msg: string) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) { passed++; } else { failed++; console.log(`FAIL ${msg}\n  got ${A}\n  want ${B}`); }
}
function throws(fn: () => void, needle: string, msg: string) {
  try { fn(); failed++; console.log(`FAIL ${msg}: did not throw`); }
  catch (e) { if (String(e).includes(needle)) passed++; else { failed++; console.log(`FAIL ${msg}: ${e}`); } }
}
const line = (key: string, to: unknown, from?: unknown, extra?: Partial<EvidenceLine>): EvidenceLine => ({
  key, text: key, to, from, componentId: "c1", eventLabel: "Goldberg Wedding · Aug 2026",
  isEvidence: true, baselineKind: "instantiation_stamp", baselineRevision: "rev-18", ...extra,
});
function liveDoc(): RevisionDoc {
  const d = emptyDoc();
  d.dimensions = { presentation: { label: "Presentation", options: ["wood", "black_slate", "acrylic"] },
                   service: { label: "Service", options: ["attended", "live_chef"] } };
  d.instanceDefaults.choices = { presentation: "black_slate", service: "attended" };
  d.instanceDefaults.scalars = { pieces_per_person: { value: 6, overridden: false, derivation: { formula: "house standard", suggested: 6 } } };
  d.defaultItems = [{ name: "California Roll", unit_price: 4, quantity_basis: "per_person", position: 0 },
                    { name: "Ginger", unit_price: 0.5, quantity_basis: "per_person", position: 1 }];
  d.schemes = { kids: { id: "kids", label: "Kids", sets: { choices: { presentation: "wood" } } } };
  return d;
}

_resetPromotionKindsForTests(); registerCorePromotionKinds();

// composition: choice, scalar, item add + remove — and live is NEVER mutated
{
  const live = liveDoc();
  const out = composeRevision(live, [
    line("choice:presentation", "acrylic", "black_slate"),
    line("scalar:pieces_per_person", 8, 6),
    line("item:Dragon Roll", { unit_price: 6, quantity_basis: "per_person" }),
    line("item:Ginger", null, { unit_price: 0.5 }),
  ]);
  eq(out.instanceDefaults.choices.presentation, "acrylic", "choice lands as default");
  eq(out.instanceDefaults.scalars.pieces_per_person.value, 8, "scalar value lands");
  eq(out.instanceDefaults.scalars.pieces_per_person.derivation!.suggested, 8, "derivation suggestion follows");
  eq(out.instanceDefaults.scalars.pieces_per_person.overridden, false, "a promoted standard is not an override");
  eq(out.defaultItems!.map((i) => i.name), ["California Roll", "Dragon Roll"], "item add + remove");
  eq(live.instanceDefaults.choices.presentation, "black_slate", "the LIVE document is never mutated");
  eq(live.defaultItems!.length, 2, "live items untouched");
}
// selection is literal: unselected lines change nothing
{
  const out = composeRevision(liveDoc(), [line("choice:presentation", "acrylic")]);
  eq(out.instanceDefaults.choices.service, "attended", "unselected dimension untouched");
  eq(out.defaultItems!.length, 2, "unselected items untouched");
}
// NO_HOME: principle 9 at the composer tier
throws(() => composeRevision(liveDoc(), [line("prose:sales_copy", "Great station")]),
  "NO_HOME", "a line with no home refuses, naming it a spec change");
// idempotent add: promoting an item that already exists does not duplicate
{
  const out = composeRevision(liveDoc(), [line("item:California Roll", { unit_price: 4 })]);
  eq(out.defaultItems!.filter((i) => i.name === "California Roll").length, 1, "no duplicate default items");
}
// coherence: default outside options; scheme→missing item; derivation refs
{
  const doc = liveDoc();
  doc.instanceDefaults.choices.presentation = "boat_display";     // not an option
  (doc.schemes!.kids as { sets: { items?: string[] } }).sets.items = ["Wasabi Bomb"];
  doc.instanceDefaults.scalars.total = { value: 0, overridden: false, derivation: { formula: "{guests} × {pieces_per_person}", suggested: 0 } };
  const f = checkCoherence(doc);
  eq(f.length, 3, "three findings");
  eq(f.some((x) => x.includes("boat_display")), true, "names the out-of-options default");
  eq(f.some((x) => x.includes("Wasabi Bomb")), true, "names the scheme's missing item");
  eq(f.some((x) => x.includes("guests")), true, "names the absent scalar reference");
  eq(checkCoherence(liveDoc()).length, 0, "a coherent doc has zero findings");
}
// aggregation: same key+value counts together; different values apart
{
  const m = aggregateEvidence([
    line("choice:presentation", "acrylic"), line("choice:presentation", "acrylic"),
    line("choice:presentation", "wood"), line("scalar:pieces_per_person", 8),
  ], 9);
  eq(m.get('choice:presentation="acrylic"')!.count, 2, "acrylic counted twice");
  eq(m.get('choice:presentation="wood"')!.count, 1, "wood counted once, separately");
  eq(m.get('scalar:pieces_per_person=8')!.ofEvents, 9, "denominator carried");
}
// citations: provenance travels — including the §0a no-item-baseline marker
{
  const c = citationsFor([
    line("choice:presentation", "acrylic", "black_slate"),
    line("item:Dragon Roll", { unit_price: 6 }, undefined, { noItemBaseline: true, baselineKind: "reconstructed_from_instance" }),
  ]);
  eq(c[0].baseline_kind, "instantiation_stamp", "stamped baseline cited");
  eq(c[0].baseline_revision, "rev-18", "revision cited");
  eq(c[1].baseline_kind, "no_item_baseline", "§0a marker cited, never overstating the comparison");
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
