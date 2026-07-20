// v248 (PR-4) — THE PRINT RENDERER: the Backend port, real AFM metrics
// behind the Measurement port, the PDF adapter proven by LOADING ITS OWN
// OUTPUT BACK, provenance stamped, and the snapshot mapper's freezing law.
import * as fs from "fs";
import { PDFDocument } from "pdf-lib";
import { standardMetrics, STD14_VERSION } from "../render/pdfMetrics";
import { renderToPdf, renderPublicationFromSnapshot } from "../render/render";
import { RenderPublication } from "../render/compose";
import { RENDER_ENGINE_VERSION } from "../render/backend";
import { resolveTheme } from "../publication";
import { projectIdentity, ResolvedFact } from "../identity";
import { PresentationModel } from "../presentation";
let passed = 0, failed = 0, done = 0, total = 4;
const T = (name: string, fn: () => Promise<void>) => fn().then(
  () => { passed++; console.log(`PASS ${name}`); },
  (e) => { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); },
).finally(() => { if (++done === total) {
  console.log(`\nv248.print: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} });

const fixturePub = (): RenderPublication => ({
  model: {
    title: "Goldberg Wedding", eventLine: "Wedding · Oct 12 · 200 guests",
    intro: "An evening of stations, seasonal plates, and unhurried hospitality for two hundred guests.",
    closing: "With gratitude.", priceVisibility: "hidden", totalLabel: null, status: "sent",
    hasUnconfirmedVisiblePrice: false, summary: null,
    sections: [0, 1, 2, 3].map((n) => ({ id: `t${n}`, name: `Station ${n}`, subtotalLabel: null, choiceGroups: [], bands: [{
      label: "", description: null, components: [{
        id: `c${n}`, title: `Carving Station ${n}`, description: "Carved to order by our chefs with seasonal accompaniments and warm sides.",
        note: null, isPackage: false,
        blocks: [{ label: null, showHeading: false, layout: "vertical", items:
          [0, 1, 2].map((i) => ({ name: `Item ${n}-${i} — house-cured, hand-finished, served warm`, description: null,
            price: null, priceLabel: null, priceStatus: "confirmed", note: null })) }],
        choice: null, price: null, priceLabel: null, priceStatus: "confirmed", visible: true, internalReason: null,
      }] }] })) as unknown as PresentationModel["sections"],
  } as PresentationModel,
  theme: resolveTheme(null, null, { treatments: { document: { signature: "line", watermark: "draft" } } }).theme,
  regions: { footer: null, signature: "Ben Grossman", terms: "Deposits are non-refundable within 30 days of the event. Final guest counts are due 7 days prior." },
  company: projectIdentity({ "identity.trade_name": "Event Space by Burger Bar", "identity.phone": "(732) 555-0100", "legal.supervision": "Under KCL supervision" }, {}),
  pins: null,
});

T("the std-14 metrics are REAL and STRICT: deterministic word-wrap on AFM widths; wrap().length === measure().lines always; undeclared font THROWS", async () => {
  const { measurer } = await standardMetrics();
  if (measurer.version !== STD14_VERSION) throw new Error("metrics unversioned");
  const text = "Carved to order by our chefs with seasonal accompaniments and warm sides for every guest.";
  const a = measurer.measure(text, "serif", 10.5, 300);
  const b = measurer.measure(text, "serif", 10.5, 300);
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("metrics not deterministic");
  const lines = measurer.wrap(text, "serif", 10.5, 300);
  if (lines.length !== a.lines) throw new Error(`THE WRAP LAW broke: wrap ${lines.length} vs measure ${a.lines}`);
  if (lines.length < 2) throw new Error("fixture should wrap");
  const { measurer: m2 } = await standardMetrics();
  if (m2.measure(text, "serif", 10.5, 300).lines !== a.lines) throw new Error("cross-instance drift");
  let threw = false;
  try { measurer.measure("x", "Papyrus", 10, 100); } catch (e) { threw = /UNDECLARED_FONT/.test((e as Error).message); }
  if (!threw) throw new Error("an undeclared font measured — fallback happened");
});

T("the PDF adapter is proven by ITS OWN OUTPUT: bytes load back as a PDF whose page count and page size match the imposed artifact; provenance is stamped", async () => {
  const { bytes, artifact } = await renderToPdf(fixturePub(), "v1:2026-07-19");
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") throw new Error("not a PDF");
  const back = await PDFDocument.load(bytes);
  if (back.getPageCount() !== artifact.pages.length)
    throw new Error(`pages: pdf ${back.getPageCount()} vs artifact ${artifact.pages.length}`);
  if (artifact.pages.length < 2) throw new Error("fixture must exceed one page to prove anything");
  const { width, height } = back.getPage(0).getSize();
  if (Math.round(width) !== 612 || Math.round(height) !== 792) throw new Error(`page size ${width}×${height}`);
  const p = artifact.provenance;
  if (p.engineVersion !== RENDER_ENGINE_VERSION || p.metricsVersion !== STD14_VERSION || !p.generatedAt || p.sourceFingerprint !== "v1:2026-07-19")
    throw new Error(`provenance incomplete: ${JSON.stringify(p)}`);
  if (!(back.getKeywords() ?? "").includes(RENDER_ENGINE_VERSION) || !(back.getKeywords() ?? "").includes(STD14_VERSION))
    throw new Error("provenance not written into the file");
  if (back.getSubject() !== "v1:2026-07-19") throw new Error("fingerprint not written into the file");
  if (artifact.pages[0].pageNumber !== null) throw new Error("page one numbered");
  if (!artifact.pages[1].pageNumber) throw new Error("interior numbering data missing from the artifact");
});

T("THE SNAPSHOT MAPPER freezes: every publication field comes off the snapshot — live state contributes nothing", async () => {
  const facts: ResolvedFact[] = [{ key: "identity.trade_name", label: "Trade name", value: "FROZEN NAME", region: "header" }];
  const snap = { ...resolveTheme(null, null, null).theme,
    regionTexts: { footer: "FROZEN FOOTER", signature: "FROZEN HAND", terms: null },
    companyFacts: facts, photoPins: null };
  const pub = renderPublicationFromSnapshot(fixturePub().model, snap);
  if (pub.company[0]?.value !== "FROZEN NAME") throw new Error("company not from snapshot");
  if (pub.regions.footer !== "FROZEN FOOTER" || pub.regions.signature !== "FROZEN HAND") throw new Error("regions not from snapshot");
  if (pub.theme !== snap) throw new Error("theme not the snapshot itself");
  if (pub.pins !== null) throw new Error("pins invented");
});

T("THE WALL holds through the backend: backend.ts and pdfBackend.ts are grep-clean of publication vocabulary; the adapter never imports the composer", async () => {
  for (const f of ["src/lib/render/backend.ts", "src/lib/render/pdfBackend.ts"]) {
    const src = fs.readFileSync(f, "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
    const hit = src.match(/\b(section|component|proposal|price|treatment|booking|template|brand)\b/i);
    if (hit) throw new Error(`publication vocabulary '${hit[0]}' inside ${f}`);
    if (/from "\.\/compose"|from "\.\.\//.test(src)) throw new Error(`${f} reaches upstream or outside render/`);
  }
});
