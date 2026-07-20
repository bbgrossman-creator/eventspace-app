// v248 (PR-4) — THE PRINT RENDERER: the Std14 real-metrics port, the
// Backend port with its PDF adapter, artifact provenance, the snapshot
// law, and the PR-5 road (fontsource metrics) proven passable.
import * as fs from "fs";
import { PDFDocument } from "pdf-lib";
import { standardMetrics, STD14_VERSION } from "../render/pdfMetrics";
import { realMeasurer } from "../render/realMeasure";
import { renderToPdf, renderPublicationFromSnapshot } from "../render/render";
import { RenderPublication } from "../render/compose";
import { resolveTheme } from "../publication";
import { projectIdentity } from "../identity";
import { PresentationModel } from "../presentation";
let passed = 0, failed = 0;
const T = async (name: string, fn: () => Promise<void> | void) => {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};

const pub = (): RenderPublication => ({
  model: {
    title: "Goldberg Wedding", eventLine: "Wedding · Oct 12 · 200 guests",
    intro: "An evening to remember, with stations and warmth throughout the night, plated with care and served with attention.",
    closing: "With gratitude.", priceVisibility: "hidden", totalLabel: null, status: "sent",
    hasUnconfirmedVisiblePrice: false, summary: null,
    sections: [0, 1, 2, 3, 4].map((n) => ({ id: `t${n}`, name: `Section ${n}`, subtotalLabel: null, choiceGroups: [], bands: [{
      label: "", description: null, components: [{ id: `c${n}`, title: `Station ${n}`,
        description: "Carved to order by our chefs with seasonal sides and warm bread service.",
        note: null, isPackage: false,
        blocks: [{ label: null, showHeading: false, layout: "vertical",
          items: [0, 1, 2, 3, 4, 5].map((i) => ({ name: `Item ${n}-${i} with a descriptive name for wrapping`,
            description: null, price: null, priceLabel: null, priceStatus: "confirmed", note: null })) }],
        choice: null, price: null, priceLabel: null, priceStatus: "confirmed", visible: true, internalReason: null }] }] })) as unknown as PresentationModel["sections"],
  } as PresentationModel,
  theme: resolveTheme(null, null, { treatments: { document: { signature: "line", watermark: "draft" } } }).theme,
  regions: { footer: null, signature: "Ben Grossman", terms: "Deposits are non-refundable within 30 days." },
  company: projectIdentity({ "identity.trade_name": "Event Space by Burger Bar", "identity.phone": "(732) 555-0100",
    "legal.supervision": "Under KCL supervision" }, {}),
  pins: null,
});

void (async () => {
  await T("STD14 is a REAL, strict, versioned metrics port: deterministic wrap by true AFM widths; measure counts exactly what wrap produces; undeclared fonts THROW", async () => {
    const { measurer } = await standardMetrics();
    if (measurer.version !== STD14_VERSION) throw new Error("unversioned or drifted");
    const a = measurer.wrap("The quick brown fox jumps over the lazy dog near the riverbank", "serif", 10, 120);
    const b = measurer.wrap("The quick brown fox jumps over the lazy dog near the riverbank", "serif", 10, 120);
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("wrap is not pure");
    if (a.length < 2) throw new Error("real widths should wrap this");
    const m = measurer.measure("The quick brown fox jumps over the lazy dog near the riverbank", "serif", 10, 120);
    if (m.lines !== a.length) throw new Error("measure and wrap disagree — drawing would diverge from counting");
    let threw = false;
    try { measurer.measure("x", "Comic Sans", 10, 100); } catch (e) { threw = /UNDECLARED_FONT/.test((e as Error).message); }
    if (!threw) throw new Error("an undeclared font fell back");
  });

  await T("THE PDF ADAPTER: bytes are a real PDF; page count equals the artifact's; provenance rides the metadata machine-readably", async () => {
    const { bytes, artifact } = await renderToPdf(pub(), "stamp-2026-07-19");
    const head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
    if (head !== "%PDF-") throw new Error(`not a PDF: ${head}`);
    const doc = await PDFDocument.load(bytes);
    if (doc.getPageCount() !== artifact.pages.length)
      throw new Error(`PDF has ${doc.getPageCount()} pages, artifact says ${artifact.pages.length}`);
    const prov = JSON.parse(doc.getSubject() ?? "{}");
    if (prov.engineVersion !== "renderer-1" || prov.metricsVersion !== STD14_VERSION || prov.sourceFingerprint !== "stamp-2026-07-19")
      throw new Error(`provenance dishonest: ${JSON.stringify(prov)}`);
    if (!prov.generatedAt) throw new Error("no generatedAt");
    if (artifact.pages.length < 2) throw new Error("fixture must span pages to prove numbering");
    if (artifact.pages[0].pageNumber !== null) throw new Error("page one numbered");
    if (!artifact.pages[1].pageNumber || artifact.pages[1].pageNumber.of !== artifact.pages.length)
      throw new Error("interior numbering wrong");
  });

  await T("THE SNAPSHOT LAW: a sent document renders from what was stamped — the mapper reads every field off the snapshot, defaults honest", () => {
    const snap = { ...resolveTheme(null, null, null).theme,
      regionTexts: { footer: "F", signature: "S", terms: "T" },
      companyFacts: [{ key: "identity.trade_name", label: "Trade name", value: "Frozen Name", region: "header" as const }],
      photoPins: null };
    const rp = renderPublicationFromSnapshot(pub().model, snap);
    if (rp.regions.signature !== "S" || rp.company[0]?.value !== "Frozen Name")
      throw new Error("the mapper read live state, not the snapshot");
    const bare = renderPublicationFromSnapshot(pub().model, resolveTheme(null, null, null).theme);
    if (bare.company.length !== 0 || bare.regions.footer !== null)
      throw new Error("a pre-v239 snapshot didn't default honestly");
  });

  await T("THE PR-5 ROAD: fontsource metrics behind the same port — deterministic, strict, and a pure metrics swap away", () => {
    const bytes = fs.readFileSync("node_modules/@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff");
    const m = realMeasurer({ serif: new Uint8Array(bytes) }, "fontsource-playfair-1");
    const one = m.measure("Carving Station by the window", "serif", 12, 140);
    const two = m.measure("Carving Station by the window", "serif", 12, 140);
    if (JSON.stringify(one) !== JSON.stringify(two)) throw new Error("real metrics not pure");
    if (one.lines < 1) throw new Error("nothing measured");
    let threw = false;
    try { m.measure("x", "sans", 10, 100); } catch (e) { threw = /UNDECLARED_FONT/.test((e as Error).message); }
    if (!threw) throw new Error("undeclared family fell back");
  });

  await T("THE PORT HOLDS: the adapter never reaches upstream — pdfBackend.ts imports neither compose nor paginate", () => {
    const src = fs.readFileSync("src/lib/render/pdfBackend.ts", "utf8");
    if (/from "\.\/compose"|from "\.\/paginate"/.test(src))
      throw new Error("the backend reached around the port — layout decisions would follow");
  });

  console.log(`\nv248.pdf: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
