// v249 (PR-5) — PRINT TYPOGRAPHY: the metrics swap through the same
// strict port; one metrics source by construction; the station-title
// chain; the wrap-contract unification; the slice's own discipline.
import * as fs from "fs";
import { PDFDocument } from "pdf-lib";
import { brandMetrics, BrandFontBytes } from "../render/brandMetrics";
import { std14Metrics } from "../render/pdfMetrics";
import { renderToPdf } from "../render/render";
import { composePublication, RenderPublication } from "../render/compose";
import { paginate } from "../render/paginate";
import { fixtureMeasurer } from "../render/measure";
import { box, Box } from "../render/box";
import { resolveTheme } from "../publication";
import { projectIdentity } from "../identity";
import { PresentationModel } from "../presentation";
let passed = 0, failed = 0;
const T = async (name: string, fn: () => Promise<void> | void) => {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};

const loadBrand = (): BrandFontBytes => ({
  version: "fontsource-1",
  serif: {
    regular: new Uint8Array(fs.readFileSync("node_modules/@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff")),
    bold: new Uint8Array(fs.readFileSync("node_modules/@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff")),
    italic: new Uint8Array(fs.readFileSync("node_modules/@fontsource/playfair-display/files/playfair-display-latin-400-italic.woff")),
  },
  sans: {
    regular: new Uint8Array(fs.readFileSync("node_modules/@fontsource/inter/files/inter-latin-400-normal.woff")),
    bold: new Uint8Array(fs.readFileSync("node_modules/@fontsource/inter/files/inter-latin-700-normal.woff")),
  },
});

const pub = (): RenderPublication => ({
  model: {
    title: "Goldberg Wedding", eventLine: "Wedding · Oct 12 · 200 guests",
    intro: "An evening to remember, with stations and warmth throughout the night.",
    closing: "With gratitude.", priceVisibility: "hidden", totalLabel: null, status: "sent",
    hasUnconfirmedVisiblePrice: false, summary: null,
    sections: [0, 1, 2].map((n) => ({ id: `t${n}`, name: `Section ${n}`, subtotalLabel: null, choiceGroups: [], bands: [{
      label: "", description: null, components: [{ id: `c${n}`, title: `Station ${n}`,
        description: "Carved to order by our chefs with seasonal sides and warm bread service throughout the evening.",
        note: null, isPackage: false,
        blocks: [{ label: null, showHeading: false, layout: "vertical",
          items: [0, 1, 2, 3].map((i) => ({ name: `Item ${n}-${i} with a descriptive name`,
            description: null, price: null, priceLabel: null, priceStatus: "confirmed", note: null })) }],
        choice: null, price: null, priceLabel: null, priceStatus: "confirmed", visible: true, internalReason: null }] }] })) as unknown as PresentationModel["sections"],
  } as PresentationModel,
  theme: resolveTheme(null, null, { treatments: { document: { signature: "line" } } }).theme,
  regions: { footer: null, signature: "Ben Grossman", terms: "Deposits are non-refundable within 30 days." },
  company: projectIdentity({ "identity.trade_name": "Event Space by Burger Bar" }, {}),
  pins: null,
});

void (async () => {
  await T("THE METRICS SWAP: brand bytes behind the same strict port — a real PDF renders with metricsVersion=fontsource-1, brand wraps differ from Std14's, and the port stays strict", async () => {
    const brand = loadBrand();
    const { bytes, artifact } = await renderToPdf(pub(), "stamp", brand);
    if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]) !== "%PDF-") throw new Error("not a PDF");
    const prov = JSON.parse((await PDFDocument.load(bytes)).getSubject() ?? "{}");
    if (prov.metricsVersion !== "fontsource-1") throw new Error(`metrics dishonest: ${prov.metricsVersion}`);
    const bm = brandMetrics(brand).measurer;
    const sm = (await std14Metrics()).measurer;
    const text = "Carved to order by our chefs with seasonal sides and warm bread service";
    if (JSON.stringify(bm.wrap(text, "serif", 10.5, 200)) === JSON.stringify(sm.wrap(text, "serif", 10.5, 200)))
      throw new Error("brand metrics wrap identically to Times — the swap is cosmetic");
    let threw = false;
    try { bm.measure("x", "display", 10, 100); } catch (e) { threw = /UNDECLARED_FONT/.test((e as Error).message); }
    if (!threw) throw new Error("brand port lost its strictness");
    if (artifact.pages.length < 1) throw new Error("nothing rendered");
  });

  await T("ONE METRICS SOURCE BY CONSTRUCTION: the backend cannot choose — it is injected; render.ts passes the SAME measurer to paginate and backend", () => {
    const backend = fs.readFileSync("src/lib/render/pdfBackend.ts", "utf8");
    if (/standardMetrics|std14Metrics|brandMetrics\(/.test(backend))
      throw new Error("the backend constructs its own metrics — counting and drawing could diverge");
    const render = fs.readFileSync("src/lib/render/render.ts", "utf8");
    if (!/paginate\(tree, measurer/.test(render) || !/pdfBackend\(metrics\)/.test(render))
      throw new Error("render.ts doesn't thread one metrics object through both stages");
  });

  await T("STATION TITLES KEEP THEIR FIRST ITEM: the title→description→first-item chain never severs across a page boundary", () => {
    const tree = composePublication(pub());
    // hunt every extent from tight to roomy: at NO break height may a
    // page end on a station title or its description
    for (let h = 120; h <= 320; h += 20) {
      const r = paginate(tree, fixtureMeasurer(), () => ({ width: 460, height: h }));
      for (const p of r.pages) {
        const last = p.placed[p.placed.length - 1];
        if (!last) continue;
        if (/comp:c\d\/(title|desc)$/.test(last.box.tag) && !last.slice)
          throw new Error(`at extent ${h}, page ${p.index} ends on ${last.box.tag} — the chain severed`);
      }
    }
  });

  await T("THE WRAP CONTRACT UNIFIED: heights come from the measurer alone — the lineHeight scaler is gone from the paginator, and a styled lineHeight changes nothing", () => {
    const src = fs.readFileSync("src/lib/render/paginate.ts", "utf8");
    if (/style\.lineHeight/.test(src)) throw new Error("the paginator still scales by style.lineHeight");
    const a: Box = box("group", "d", { children: [box("text", "t", { text: "x".repeat(100), style: { font: "serif", size: 10 } })] });
    const b: Box = box("group", "d", { children: [box("text", "t", { text: "x".repeat(100), style: { font: "serif", size: 10, lineHeight: 1.8 } })] });
    const ra = paginate(a, fixtureMeasurer(), () => ({ width: 100, height: 98 }));
    const rb = paginate(b, fixtureMeasurer(), () => ({ width: 100, height: 98 }));
    if (JSON.stringify(ra.pages.map((p) => p.placed.map((x) => [x.y, x.height])))
      !== JSON.stringify(rb.pages.map((p) => p.placed.map((x) => [x.y, x.height]))))
      throw new Error("a style lineHeight moved pagination — the contract has two formulas again");
  });

  await T("GRACEFUL DEGRADATION: absent brand fonts fall back to Std14 without blocking — the fetcher returns null, never throws", async () => {
    const { fetchBrandFonts } = await import("../render/fonts");
    const r = await fetchBrandFonts("http://127.0.0.1:1/nowhere");
    if (r !== null) throw new Error("a dead font host didn't degrade to null");
    const { bytes } = await renderToPdf(pub(), "stamp", undefined);
    const prov = JSON.parse((await PDFDocument.load(bytes)).getSubject() ?? "{}");
    if (prov.metricsVersion !== "std14-afm-1") throw new Error("the fallback isn't Std14");
  });

  console.log(`\nv249.typography: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
