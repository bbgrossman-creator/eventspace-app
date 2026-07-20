// v250 (PR-6) — PRINT PROOF: the wording, finally — page numbers per the
// declared position, continued/continued-from over PR-2's neutral
// markers with longest-prefix specificity and silence over machinery,
// the TOC as data + PDF outline, and the wall held to the last slice.
import * as fs from "fs";
import { PDFDocument, PDFName } from "pdf-lib";
import { applyProof, tocEntries, labelFor } from "../render/proof";
import { renderToPdf } from "../render/render";
import { RenderPublication, composeProofLabels } from "../render/compose";
import { ImposedPage } from "../render/masters";
import { resolveTheme } from "../publication";
import { projectIdentity } from "../identity";
import { PresentationModel } from "../presentation";
let passed = 0, failed = 0;
const T = async (name: string, fn: () => Promise<void> | void) => {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};

const page = (index: number, over: Partial<ImposedPage> = {}): ImposedPage => ({
  index, master: "interior", size: { width: 612, height: 792 },
  margins: { top: 54, right: 54, bottom: 60, left: 54 },
  contentOrigin: { x: 54, y: 54 }, content: { index, extent: { width: 504, height: 678 }, placed: [] },
  runningHeader: null, runningFooter: null, watermark: null, pageNumber: null, ...over });

const pub = (): RenderPublication => ({
  model: {
    title: "Goldberg Wedding", eventLine: "Wedding · Oct 12 · 200 guests",
    intro: "An evening to remember, with stations and warmth throughout the night.",
    closing: "With gratitude.", priceVisibility: "hidden", totalLabel: null, status: "sent",
    hasUnconfirmedVisiblePrice: false, summary: null,
    sections: [0, 1, 2, 3].map((n) => ({ id: `t${n}`, name: `Course ${n}`, subtotalLabel: null, choiceGroups: [], bands: [{
      label: "", description: null, components: [{ id: `c${n}`, title: `Station ${n}`,
        description: "Carved to order by our chefs with seasonal sides and warm bread service throughout the evening hours.",
        note: null, isPackage: false,
        blocks: [{ label: null, showHeading: false, layout: "vertical",
          items: [0, 1, 2, 3, 4].map((i) => ({ name: `Item ${n}-${i} with a descriptive name for realistic width`,
            description: null, price: null, priceLabel: null, priceStatus: "confirmed", note: null })) }],
        choice: null, price: null, priceLabel: null, priceStatus: "confirmed", visible: true, internalReason: null }] }] })) as unknown as PresentationModel["sections"],
  } as PresentationModel,
  theme: resolveTheme(null, null, { treatments: { document: { signature: "line" } } }).theme,
  regions: { footer: null, signature: "Ben Grossman", terms: "Deposits are non-refundable within 30 days of the event date." },
  company: projectIdentity({ "identity.trade_name": "Event Space by Burger Bar" }, {}),
  pins: null,
});

void (async () => {
  await T("PAGE NUMBERS speak per the DECLARED position: 'Page N of M' exactly, centered or outside; unnumbered pages stay silent", () => {
    const pages = [
      page(0),
      page(1, { pageNumber: { n: 2, of: 3, position: "footer-center" } }),
      page(2, { pageNumber: { n: 3, of: 3, position: "footer-outside" } }),
    ];
    const proofed = applyProof(pages, [], {});
    if (proofed[0].proof.pageNumber !== null) throw new Error("an unnumbered page spoke");
    if (proofed[1].proof.pageNumber?.text !== "Page 2 of 3") throw new Error(`wording drifted: ${proofed[1].proof.pageNumber?.text}`);
    if (proofed[1].proof.pageNumber?.style.align !== "center") throw new Error("center position ignored");
    if (proofed[2].proof.pageNumber?.style.align !== "right") throw new Error("outside position ignored");
  });

  await T("CONTINUED WORDING over neutral markers: the most SPECIFIC label wins a crossing; an unresolvable tag yields SILENCE — customers never read machinery", () => {
    const labels = { "section:t1": "Dinner", "comp:c9": "Carving Station" };
    const proofed = applyProof([page(0), page(1)], [
      { tag: "section:t1", fromPage: 0, toPage: 1 },
      { tag: "comp:c9/item", fromPage: 0, toPage: 1 },
    ], labels);
    if (proofed[0].proof.continued?.text !== "Carving Station continues\u2026")
      throw new Error(`specificity lost: ${proofed[0].proof.continued?.text}`);
    if (proofed[1].proof.continuedFrom?.text !== "Carving Station, continued")
      throw new Error(`continued-from wrong: ${proofed[1].proof.continuedFrom?.text}`);
    const silent = applyProof([page(0), page(1)], [{ tag: "doc:mystery/9", fromPage: 0, toPage: 1 }], labels);
    if (silent[0].proof.continued !== null || silent[1].proof.continuedFrom !== null)
      throw new Error("machinery leaked to the customer");
    if (labelFor("comp:c9/item", labels) !== "Carving Station") throw new Error("longest-prefix lookup broken");
  });

  await T("THE TOC is provenance data: each labeled entry once, at its FIRST page, in reading order — and it becomes the PDF OUTLINE", async () => {
    const p = pub();
    const { bytes, artifact } = await renderToPdf(p, "stamp");
    if (artifact.pages.length < 2) throw new Error("fixture must span pages");
    const toc = artifact.outline ?? [];
    const sections = toc.filter((e) => /^Course /.test(e.label));
    if (sections.length !== 4) throw new Error(`expected 4 section entries, got ${sections.length}`);
    for (let i = 1; i < sections.length; i++)
      if (sections[i].pageIndex < sections[i - 1].pageIndex) throw new Error("TOC out of reading order");
    const seen: Record<string, number> = {};
    for (const e of toc) seen[e.label] = (seen[e.label] ?? 0) + 1;
    for (const k of Object.keys(seen)) if (seen[k] > 1) throw new Error(`${k} listed twice`);
    const doc = await PDFDocument.load(bytes);
    const outlines = doc.catalog.get(PDFName.of("Outlines"));
    if (!outlines) throw new Error("the PDF carries no outline — the digital contents are missing");
  });

  await T("END TO END: a real multi-page proposal carries numbers on interiors, silence on page one, and continued wording where PR-2 marked", async () => {
    const { artifact } = await renderToPdf(pub(), "stamp");
    const proofed = artifact.pages as ReturnType<typeof applyProof>;
    if (proofed[0].proof.pageNumber !== null) throw new Error("page one numbered");
    if (proofed[1].proof.pageNumber?.text !== `Page 2 of ${artifact.pages.length}`) throw new Error("interior wording wrong");
    const anyContinued = proofed.some((p) => p.proof.continued || p.proof.continuedFrom);
    const anyMarker = proofed.length > 1;
    if (anyMarker && !anyContinued) {
      // acceptable only if no crossing had a resolvable label — but sections
      // and comps ARE labeled, so a multi-page proposal must speak somewhere
      throw new Error("a multi-page proposal never said 'continued'");
    }
  });

  await T("THE WALL, to the last slice: proof.ts is grep-clean and imports only from render/", () => {
    const src = fs.readFileSync("src/lib/render/proof.ts", "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
    const hit = src.match(/\b(section|component|proposal|price|region|theme|treatment|booking|template|brand)\b/i);
    if (hit) throw new Error(`publication vocabulary '${hit[0]}' inside proof.ts`);
    if (/from "\.\.\/(?!render)/.test(src)) throw new Error("proof.ts imports from outside render/");
  });

  console.log(`\nv250.proof: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
