// v247 (PR-3) — PAGE MASTERS: geometry law, the degenerate case, the
// post-pass, furniture-vs-content independence, the wall — and the v240
// reservation formally retired.
import * as fs from "fs";
import { box } from "../render/box";
import { fixtureMeasurer } from "../render/measure";
import { paginate } from "../render/paginate";
import { makeMasterSet, masterFor, printableExtent, extentsFrom, imposePages, PageMaster } from "../render/masters";
import { composePublication, composeMasters, RenderPublication } from "../render/compose";
import { resolveTheme, ThemeDelta } from "../publication";
import { projectIdentity } from "../identity";
import { PresentationModel } from "../presentation";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const M = fixtureMeasurer();

const pub = (delta: ThemeDelta | null = null): RenderPublication => ({
  model: {
    title: "Goldberg Wedding", eventLine: "Wedding · Oct 12", intro: null, closing: null,
    priceVisibility: "hidden", totalLabel: null, status: "draft", hasUnconfirmedVisiblePrice: false, summary: null,
    sections: [{ id: "t1", name: "Dinner", subtotalLabel: null, choiceGroups: [], bands: [{ label: "", description: null,
      components: [{ id: "c1", title: "Carving Station", description: "Carved to order.", note: null, isPackage: false,
        blocks: [], choice: null, price: null, priceLabel: null, priceStatus: "confirmed", visible: true, internalReason: null }] }] }] as unknown as PresentationModel["sections"],
  } as PresentationModel,
  theme: resolveTheme(null, null, delta).theme,
  regions: { footer: null, signature: null, terms: null },
  company: projectIdentity({ "identity.trade_name": "Event Space by Burger Bar", "legal.supervision": "Under KCL supervision" }, {}),
  pins: null,
});

T("THE GEOMETRY LAW: last's geometry IS interior's — enforced by the constructor even against a caller who disagrees; first may differ", () => {
  const m = (key: PageMaster["key"], h: number): PageMaster => ({ key, size: { width: 600, height: h },
    margins: { top: 50, right: 50, bottom: 50, left: 50 }, runningHeader: null, runningFooter: null,
    decorations: { pageNumbers: "none", watermark: null } });
  const set = makeMasterSet(m("first", 700), m("interior", 800), m("last", 999));   // 999 must be overruled
  if (set.last.size.height !== 800) throw new Error("a disagreeing caller changed last's geometry");
  if (printableExtent(set.last).height !== printableExtent(set.interior).height)
    throw new Error("last's printable extent differs from interior's — forward-only pagination would need clairvoyance");
  if (printableExtent(set.first).height === printableExtent(set.interior).height)
    throw new Error("first was flattened too — first MAY differ");
  const ext = extentsFrom(set);
  if (ext(0).height !== 600 || ext(1).height !== 700 || ext(7).height !== 700)
    throw new Error("extents don't follow first/interior");
});

T("masterFor + THE DEGENERATE CASE: one page wears FIRST's geometry and header, LAST's closure footer; numbering follows the closure master", () => {
  if (masterFor(0, 5) !== "first" || masterFor(4, 5) !== "last" || masterFor(2, 5) !== "interior" || masterFor(0, 1) !== "first")
    throw new Error("masterFor mapping wrong");
  const set = composeMasters(pub());
  const closure = box("text", "furniture:running-footer", { text: "CLOSURE", style: {} });
  const marked = { ...set, last: { ...set.last, runningFooter: closure } };
  const one = imposePages({ pages: [{ index: 0, extent: { width: 100, height: 100 }, placed: [] }], continuations: [], overflows: [] }, marked);
  if (one[0].master !== "first") throw new Error("one page isn't FIRST");
  if (one[0].runningFooter?.text !== "CLOSURE") throw new Error("the degenerate page lacks LAST's closure furniture");
});

T("THE POST-PASS: numbering resolves only after the count exists; page one carries no number by declared policy; the pagination result passes through untouched", () => {
  const p = pub();
  const tree = composePublication(p);
  const set = composeMasters(p);
  const result = paginate(tree, M, () => ({ width: 460, height: 160 }));
  const before = JSON.stringify(result);
  const imposed = imposePages(result, set);
  if (JSON.stringify(result) !== before) throw new Error("imposition mutated pagination — the post-pass re-broke something");
  if (imposed.length < 2) throw new Error("fixture too small to prove numbering");
  if (imposed[0].pageNumber !== null) throw new Error("page one is numbered — FIRST declared none");
  const second = imposed[1].pageNumber;
  if (!second || second.n !== 2 || second.of !== imposed.length) throw new Error(`interior numbering wrong: ${JSON.stringify(second)}`);
  if (imposed[0].runningHeader !== null) throw new Error("FIRST's running header wasn't suppressed");
  if (!imposed[1].runningHeader) throw new Error("interior lacks its running header");
});

T("FURNITURE vs CONTENT — the §4 independence: toggling the content footer never moves the running footer, and the furniture never enters the flow", () => {
  const withFooter = pub({ treatments: { document: { footer: "line" } } });
  const without = pub({ treatments: { document: { footer: "none" } } });
  const mastersA = JSON.stringify(composeMasters(withFooter));
  const mastersB = JSON.stringify(composeMasters(without));
  if (mastersA !== mastersB) throw new Error("the content footer toggle moved the masters");
  const flowTags: string[] = [];
  const walk = (b: ReturnType<typeof composePublication>) => { flowTags.push(b.tag); for (const c of b.children ?? []) walk(c as never); };
  walk(composePublication(without));
  if (flowTags.some((t) => t.indexOf("furniture:") === 0)) throw new Error("running furniture leaked into the content flow");
  walk(composePublication(withFooter));
  if (!flowTags.some((t) => t === "region:footer")) throw new Error("the content footer stopped composing");
  const set = composeMasters(without);
  if (!set.interior.runningFooter) throw new Error("running footer vanished when the content footer turned off");
  if (!/Event Space/.test(set.interior.runningFooter.text ?? "") || !/KCL/.test(set.interior.runningFooter.text ?? ""))
    throw new Error("running footer doesn't derive from company facts");
  const wm = composeMasters(pub({ treatments: { document: { watermark: "draft" } } }));
  if (wm.interior.decorations.watermark !== "DRAFT") throw new Error("watermark didn't derive");
});

T("THE WALL: masters.ts is grep-clean of publication vocabulary and imports only from render/", () => {
  const src = fs.readFileSync("src/lib/render/masters.ts", "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
  const hit = src.match(/\b(section|component|proposal|price|region|theme|treatment|booking|template|brand|fact)\b/i);
  if (hit) throw new Error(`publication vocabulary '${hit[0]}' inside masters.ts`);
  if (/from "\.\.\/(?!render)/.test(src)) throw new Error("masters.ts imports from outside render/");
});

console.log(`\nv247.masters: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
