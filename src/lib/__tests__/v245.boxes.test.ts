// v245 (PR-1) — LAYOUT BOXES & COMPOSITION: the closed kind set, lossless
// stable serialization, the STRICT measurement port, the composer's
// constitutional break policy, and the semantic wall — grep-enforced.
import * as fs from "fs";
import { BOX_KINDS, Box, box, serializeBoxTree, parseBoxTree } from "../render/box";
import { fixtureMeasurer } from "../render/measure";
import { composePublication, RenderPublication } from "../render/compose";
import { resolveTheme } from "../publication";
import { projectIdentity } from "../identity";
import { PresentationModel } from "../presentation";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};

T("the kind set is CLOSED and serialization is LOSSLESS and STABLE — identical trees serialize identically regardless of construction order", () => {
  if (BOX_KINDS.join(",") !== "block,text,image,rule,spacer,group") throw new Error("the closed set drifted");
  const a: Box = box("group", "t", { children: [box("text", "t/1", { text: "hi", style: { size: 10, font: "serif" }, rules: { keepWithNext: true } })] });
  const b: Box = { children: [{ rules: { keepWithNext: true }, style: { font: "serif", size: 10 }, text: "hi", tag: "t/1", kind: "text" }], rules: {}, style: {}, tag: "t", kind: "group" };
  if (serializeBoxTree(a) !== serializeBoxTree(b)) throw new Error("serialization is order-sensitive — replay would be unstable");
  const back = parseBoxTree(serializeBoxTree(a));
  if (serializeBoxTree(back) !== serializeBoxTree(a)) throw new Error("round-trip lost information");
});

T("the measurement port is STRICT: pure, total over declared fonts, versioned — and an undeclared font THROWS, never falls back", () => {
  const m = fixtureMeasurer();
  if (!m.version) throw new Error("unversioned metrics — upgrades would be silent drift");
  const one = m.measure("The quick brown fox", "serif", 10, 100);
  const two = m.measure("The quick brown fox", "serif", 10, 100);
  if (JSON.stringify(one) !== JSON.stringify(two)) throw new Error("measurement is not pure");
  if (one.lines !== 1 || one.height !== 14) throw new Error(`fixture arithmetic drifted: ${JSON.stringify(one)}`);
  const long = m.measure("x".repeat(45), "serif", 10, 100);   // 20 chars/line → 3 lines
  if (long.lines !== 3) throw new Error(`wrap arithmetic wrong: ${long.lines}`);
  let threw = false;
  try { m.measure("hello", "Comic Sans", 10, 100); } catch (e) { threw = /UNDECLARED_FONT/.test((e as Error).message); }
  if (!threw) throw new Error("an undeclared font was measured — fallback happened");
});

const fixturePub = (): RenderPublication => ({
  model: {
    title: "Goldberg Wedding", eventLine: "Wedding · Oct 12 · 200 guests", intro: "An evening to remember.",
    closing: "With gratitude.", priceVisibility: "hidden", totalLabel: null, status: "draft",
    hasUnconfirmedVisiblePrice: false, summary: null,
    sections: [{ id: "type-dinner", name: "Dinner", subtotalLabel: null, choiceGroups: [], bands: [{
      label: "", description: null, components: [{
        id: "c1", title: "Carving Station", description: "Carved to order.", note: null, isPackage: false,
        blocks: [{ label: null, showHeading: false, layout: "vertical", items: [
          { name: "Smoked brisket", description: null, price: null, priceLabel: null, priceStatus: "confirmed", note: null } ] }],
        choice: null, price: null, priceLabel: null, priceStatus: "confirmed", visible: true, internalReason: null,
      } as unknown as PresentationModel["sections"][0]["bands"][0]["components"][0]] }] }] as unknown as PresentationModel["sections"],
  } as PresentationModel,
  theme: resolveTheme(null, null, { treatments: { document: { signature: "line" } } }).theme,
  regions: { footer: null, signature: "Ben Grossman", terms: "Deposits are non-refundable." },
  company: projectIdentity({ "identity.trade_name": "Event Space by Burger Bar", "identity.phone": "(732) 555-0100" }, {}),
  pins: null,
});

T("the composer speaks the CONSTITUTIONAL BREAK POLICY: headings keep with what follows; the signature group never splits; terms never split", () => {
  const tree = composePublication(fixturePub());
  const all: Box[] = [];
  const walk = (b: Box) => { all.push(b); for (const c of b.children ?? []) walk(c); };
  walk(tree);
  const head = all.filter((b) => b.tag === "section:type-dinner/head")[0];
  if (!head?.rules.keepWithNext) throw new Error("a section heading may end a page alone");
  const compTitle = all.filter((b) => b.tag === "comp:c1/title")[0];
  if (!compTitle?.rules.keepWithNext) throw new Error("a component title may end a page alone");
  const sig = all.filter((b) => b.tag === "region:signature")[0];
  if (!sig?.rules.keepTogether) throw new Error("the signature may split");
  const terms = all.filter((b) => b.tag === "region:terms")[0];
  if (!terms?.rules.keepTogether) throw new Error("terms may split");
  for (const b of all) if (!b.tag) throw new Error(`a box without provenance: ${b.kind}`);
  const item = all.filter((b) => b.tag === "comp:c1/item")[0];
  if (!item || item.kind !== "text" || !/brisket/.test(item.text ?? "")) throw new Error("content lost in translation");
  const header = all.filter((b) => b.tag === "region:header/trade")[0];
  if (!header || !/EVENT SPACE/.test(header.text ?? "")) throw new Error("the company header region didn't compose");
  for (const b of all) if (b.style.font && b.style.font !== "serif" && b.style.font !== "sans")
    throw new Error(`an undeclared font composed: ${b.style.font}`);
});

T("THE SEMANTIC WALL: downstream of composition, publication vocabulary does not exist — box.ts and measure.ts are grep-clean", () => {
  for (const f of ["src/lib/render/box.ts", "src/lib/render/measure.ts"]) {
    const src = fs.readFileSync(f, "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
    const hit = src.match(/\b(section|component|proposal|price|region|theme|treatment|booking|template)\b/i);
    if (hit) throw new Error(`publication vocabulary '${hit[0]}' inside ${f}`);
    if (/from "\.\.\/(?!render)/.test(src)) throw new Error(`${f} imports from outside render/ — the wall has a hole`);
  }
});

console.log(`\nv245.boxes: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
