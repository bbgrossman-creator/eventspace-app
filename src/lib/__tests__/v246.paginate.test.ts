// v246 (PR-2) — THE PAGINATION ENGINE: extent filling, the keeps, the
// widow/orphan law, atomic images, honest overflow, continuation
// markers, forward-only determinism — proven on synthetic trees AND a
// real composed fixture under the fixture measurer.
import { Box, box, serializeBoxTree, parseBoxTree } from "../render/box";
import { fixtureMeasurer } from "../render/measure";
import { paginate } from "../render/paginate";
import { composePublication, RenderPublication } from "../render/compose";
import { resolveTheme } from "../publication";
import { projectIdentity } from "../identity";
import { PresentationModel } from "../presentation";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const M = fixtureMeasurer();
const EXT = (w: number, h: number) => () => ({ width: w, height: h });
// fixture ruler: size 10 → charW 5, lineHeight 14; width 100 → 20 chars/line
const txt = (tag: string, chars: number, rules = {}, style = {}): Box =>
  box("text", tag, { text: "x".repeat(chars), style: { font: "serif", size: 10, ...style }, rules });

T("pages FILL and never overflow; pagination is FORWARD-ONLY DETERMINISTIC — a serialized replay makes identical break decisions", () => {
  const tree = box("group", "doc", { children: [txt("a", 200), txt("b", 200), txt("c", 200)] });
  const r1 = paginate(tree, M, EXT(100, 100));            // 7 lines/page, 10 lines per box
  for (const p of r1.pages) for (const pb of p.placed)
    if (pb.y + pb.height > p.extent.height + 1e-6) throw new Error(`overflow on page ${p.index}: ${pb.box.tag}`);
  if (r1.pages.length < 4) throw new Error(`30 lines into 7-line pages needs ≥4 pages, got ${r1.pages.length}`);
  const r2 = paginate(parseBoxTree(serializeBoxTree(tree)), M, EXT(100, 100));
  // compare BREAK DECISIONS, not object key order — the constitutional claim
  const digest = (r: typeof r1) => JSON.stringify({
    pages: r.pages.map((p) => p.placed.map((pb) => [pb.box.tag, pb.y, pb.height, pb.slice ?? null])),
    cont: r.continuations, over: r.overflows });
  if (digest(r1) !== digest(r2)) throw new Error("replay diverged — determinism broken");
});

T("keepWithNext: a heading never ends a page alone; breakBefore:'avoid' on the follower means the same thing", () => {
  const mk = (rule: object, nextRule: object) => box("group", "doc", { children: [
    txt("filler", 100),                                    // 5 lines = 70pt
    txt("head", 20, rule),                                 // 1 line — would fit as the page's last line
    txt("body", 100, nextRule),
  ] });
  for (const [a, b, name] of [[{ keepWithNext: true }, {}, "keepWithNext"], [{}, { breakBefore: "avoid" }, "avoid"]] as const) {
    const r = paginate(mk(a, b), M, EXT(100, 98));         // 7 lines/page
    for (const p of r.pages) {
      const last = p.placed[p.placed.length - 1];
      if (last?.box.tag === "head") throw new Error(`${name}: the heading ended page ${p.index} alone`);
    }
  }
});

T("THE WIDOW/ORPHAN LAW: a split never leaves fewer than minLinesAfter behind nor takes fewer than minLinesBefore first", () => {
  // 8-line text; page has room for exactly 7 lines after 0 used → naive split 7/1 (widow!)
  const tree = box("group", "doc", { children: [txt("w", 160)] });   // 8 lines
  const r = paginate(tree, M, EXT(100, 98));               // 7 lines per page
  const slices = r.pages.flatMap((p) => p.placed).filter((pb) => pb.slice);
  if (slices.length !== 2) throw new Error(`expected 2 slices, got ${slices.length}`);
  const [s1, s2] = slices.map((pb) => pb.slice!);
  if (s2.toLine - s2.fromLine < 2) throw new Error(`widow: ${s2.toLine - s2.fromLine} line carried over`);
  if (s1.toLine - s1.fromLine < 2) throw new Error(`orphan: ${s1.toLine - s1.fromLine} line left behind`);
  // orphan push: only 1 line of room → the whole paragraph moves
  const tree2 = box("group", "doc", { children: [txt("filler", 120), txt("o", 80)] }); // 6 + 4 lines
  const r2 = paginate(tree2, M, EXT(100, 98));
  const oSlices = r2.pages.flatMap((p) => p.placed).filter((pb) => pb.box.tag === "o");
  if (oSlices.length !== 1 || oSlices[0].slice) throw new Error("one-line orphan was left behind instead of pushing whole");
});

T("keepTogether moves whole; taller-than-any-page splits least-bad WITH an honest overflow note; continuation markers carry tags verbatim", () => {
  const fits = box("group", "doc", { children: [txt("filler", 100),
    box("group", "sig", { rules: { keepTogether: true }, children: [txt("sig/1", 40), txt("sig/2", 40)] })] });
  const r = paginate(fits, M, EXT(100, 98));
  const sigPages = new Set(r.pages.filter((p) => p.placed.some((pb) => pb.box.tag.indexOf("sig") === 0)).map((p) => p.index));
  if (sigPages.size !== 1) throw new Error("a keepTogether group split though it fit a page");
  if (r.overflows.length !== 0) throw new Error("phantom overflow note");
  const giant = box("group", "doc", { children: [
    box("group", "monster", { rules: { keepTogether: true }, children: [txt("m/1", 200), txt("m/2", 200)] })] });
  const g = paginate(giant, M, EXT(100, 98));
  if (!g.overflows.some((o) => o.tag === "monster")) throw new Error("keepTogether violation was silent");
  if (!g.continuations.some((c) => c.tag === "monster")) throw new Error("no continuation marker for the split group");
  if (g.continuations.some((c) => typeof c.tag !== "string")) throw new Error("tags mutated");
});

T("IMAGES ARE ATOMIC: never split, scale-to-fit RECORDED when taller than any page; rules and spacers never begin a page", () => {
  const tree = box("group", "doc", { children: [
    txt("lead", 100),
    box("image", "img", { src: "u", style: { width: 300, height: 200 } }),   // taller than the 98pt page
    box("spacer", "sp", { style: { gap: 10 } }),
    box("rule", "rl", { style: { ruleWidth: 1 } }),
    txt("tail", 40),
  ] });
  const r = paginate(tree, M, EXT(100, 98));
  const img = r.pages.flatMap((p) => p.placed).filter((pb) => pb.box.tag === "img")[0];
  if (!img?.scaledTo) throw new Error("oversize image not scaled (or scaled silently)");
  if (Math.abs(img.scaledTo.height - 98) > 1e-6) throw new Error("scale-to-fit arithmetic wrong");
  if (!r.overflows.some((o) => o.tag === "img")) throw new Error("image scaling unrecorded");
  for (const p of r.pages) {
    const first = p.placed[0];
    if (first && (first.box.kind === "rule" || first.box.kind === "spacer"))
      throw new Error(`page ${p.index} begins with a ${first.box.kind}`);
  }
});

T("A REAL COMPOSED PUBLICATION paginates: multiple pages, the signature intact on one page, every page within extent, markers speak provenance", () => {
  const pub: RenderPublication = {
    model: {
      title: "Goldberg Wedding", eventLine: "Wedding · Oct 12 · 200 guests",
      intro: "An evening to remember, with stations and warmth throughout the night.",
      closing: "With gratitude.", priceVisibility: "hidden", totalLabel: null, status: "draft",
      hasUnconfirmedVisiblePrice: false, summary: null,
      sections: [0, 1, 2].map((n) => ({ id: `type-${n}`, name: `Section ${n}`, subtotalLabel: null, choiceGroups: [], bands: [{
        label: "", description: null, components: [{
          id: `c${n}`, title: `Station ${n}`, description: "Carved to order by our chefs with seasonal sides.",
          note: null, isPackage: false,
          blocks: [{ label: null, showHeading: false, layout: "vertical", items:
            [0, 1, 2, 3].map((i) => ({ name: `Item ${n}-${i} with a reasonably long descriptive name`, description: null,
              price: null, priceLabel: null, priceStatus: "confirmed", note: null })) }],
          choice: null, price: null, priceLabel: null, priceStatus: "confirmed", visible: true, internalReason: null,
        }] }] })) as unknown as PresentationModel["sections"],
    } as PresentationModel,
    theme: resolveTheme(null, null, { treatments: { document: { signature: "line" } } }).theme,
    regions: { footer: null, signature: "Ben Grossman", terms: "Deposits are non-refundable within 30 days. Final counts due 7 days prior." },
    company: projectIdentity({ "identity.trade_name": "Event Space by Burger Bar", "identity.phone": "(732) 555-0100" }, {}),
    pins: null,
  };
  const tree = composePublication(pub);
  const r = paginate(tree, M, EXT(468, 260));
  if (r.pages.length < 2) throw new Error(`a real proposal on small pages must break: ${r.pages.length} page(s)`);
  for (const p of r.pages) for (const pb of p.placed)
    if (pb.y + pb.height > p.extent.height + 1e-6) throw new Error(`overflow page ${p.index}: ${pb.box.tag}`);
  const sigPages = new Set(r.pages.filter((p) => p.placed.some((pb) => pb.box.tag.indexOf("region:signature") === 0)).map((p) => p.index));
  if (sigPages.size !== 1) throw new Error("the signature split across pages");
  for (const c of r.continuations) if (!c.tag || typeof c.tag !== "string") throw new Error("a marker without provenance");
});

console.log(`\nv246.paginate: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
