// ═══════════════════════════════════════════════════════════════════════════
// THE COMPOSER (PR-1 · docs/PUBLICATION_RENDERER.md §2)
//
// The semantic wall's ONE GATE. This is the only renderer stage that
// knows what a section is. It translates a ResolvedPublication into the
// box vocabulary — once, completely, forward-only — and attaches the
// constitutional DEFAULT BREAK POLICY: headings keep with what follows;
// the signature group never splits; terms never split. PR-5 refines
// policy here and only here.
//
// Downstream of this file, publication vocabulary is forbidden.
// ═══════════════════════════════════════════════════════════════════════════
import { PresentationModel } from "../presentation";
import { ResolvedTheme, RegionTexts } from "../publication";
import { ResolvedFact, factsIn, derivedFooterLine } from "../identity";
import { PhotoPins, pinnedFor } from "../photos";
import { Box, box } from "./box";
import { PageMaster, MasterSet, makeMasterSet } from "./masters";

/** What the renderer consumes — the snapshot's material, whole (§0). */
export interface RenderPublication {
  model: PresentationModel;
  theme: ResolvedTheme;
  regions: RegionTexts;
  company: ResolvedFact[];
  pins: PhotoPins | null;
}

/** Print-scale constants (points). PR-5 owns tuning; PR-1 owns existence. */
const SIZES = { title: 30, eyebrow: 9, sectionHead: 16, compTitle: 12.5, body: 10.5, small: 9, terms: 8.5 } as const;
const seriffed = (t: ResolvedTheme): string => (t.fonts.pairing ? "serif" : "serif");
const sans = (): string => "sans";

const textBox = (tag: string, text: string, style: Box["style"], rules: Box["rules"] = {}): Box =>
  box("text", tag, { text, style, rules: { minLinesBefore: 2, minLinesAfter: 2, ...rules } });

export function composePublication(pub: RenderPublication): Box {
  const t = pub.theme;
  const accent = t.colors.accent;
  const ink = t.colors.ink;
  const doc = t.treatments.document;
  const children: Box[] = [];

  // ── HEADER region (content, flows once — §4 furniture-vs-content) ──
  const trade = pub.company.filter((f) => f.key === "identity.trade_name")[0];
  if (doc.header === "block" && trade) {
    children.push(box("group", "region:header", { children: [
      textBox("region:header/trade", trade.value.toUpperCase(),
        { font: sans(), size: SIZES.small, weight: 700, letterSpacing: 0.12, color: accent }),
      box("rule", "region:header/rule", { style: { ruleColor: accent, ruleWidth: 0.5, marginTop: 4, marginBottom: 14 } }),
    ] }));
  }

  // ── Document head ──
  const head: Box[] = [];
  if (doc.cover !== "none")
    head.push(textBox("doc:eyebrow", "PROPOSAL", { font: sans(), size: SIZES.eyebrow, weight: 700, letterSpacing: 0.3, color: accent, align: "center" }));
  head.push(textBox("doc:title", pub.model.title,
    { font: seriffed(t), size: SIZES.title, weight: 700, color: ink, align: doc.title === "understated" && doc.cover === "none" ? "left" : "center", marginBottom: 4 }));
  head.push(textBox("doc:eventline", pub.model.eventLine,
    { font: sans(), size: SIZES.body, color: "#64748B", align: "center", marginBottom: 18 }));
  children.push(box("group", "doc:head", { children: head, rules: { keepTogether: true } }));

  if (pub.model.intro)
    children.push(textBox("doc:intro", pub.model.intro, { font: seriffed(t), size: SIZES.body, color: ink, marginBottom: 14 }));

  // ── Sections ──
  for (const section of pub.model.sections) {
    const kids: Box[] = [];
    // THE CONSTITUTIONAL DEFAULT: a heading never ends a page alone.
    kids.push(textBox(`section:${section.id}/head`, section.name,
      { font: seriffed(t), size: SIZES.sectionHead, weight: 600, color: ink, marginTop: 16, marginBottom: 8 },
      { keepWithNext: true }));
    const pin = pinnedFor(pub.pins, section.id);
    if (pin) kids.push(box("image", `section:${section.id}/photo`, { src: pin.url,
      style: { width: 504, height: 200, marginBottom: 10 }, rules: {} }));
    for (const band of section.bands) {
      if (band.label) kids.push(textBox(`section:${section.id}/band`, band.label,
        { font: sans(), size: SIZES.small, weight: 700, letterSpacing: 0.08, color: "#94A3B8" }, { keepWithNext: true }));
      for (const comp of band.components) {
        const c: Box[] = [
          textBox(`comp:${comp.id}/title`, comp.title,
            { font: seriffed(t), size: SIZES.compTitle, weight: 600, color: ink }, { keepWithNext: true }),
        ];
        const hasItems = comp.blocks.some((bl) => bl.items.length > 0);
        if (comp.description) c.push(textBox(`comp:${comp.id}/desc`, comp.description,
          { font: sans(), size: SIZES.body, color: "#475569" },
          hasItems ? { keepWithNext: true } : {}));
        const cPin = pinnedFor(pub.pins, "comp:" + comp.id);
        if (cPin) c.push(box("image", `comp:${comp.id}/photo`, { src: cPin.url, style: { width: 230, height: 130, marginBottom: 4 } }));
        for (const block of comp.blocks) {
          if (block.label && block.showHeading)
            c.push(textBox(`comp:${comp.id}/blockhead`, block.label,
              { font: sans(), size: SIZES.small, weight: 600, color: "#64748B" }, { keepWithNext: true }));
          for (const it of block.items)
            c.push(textBox(`comp:${comp.id}/item`, "\u00b7 " + it.name,
              { font: sans(), size: SIZES.body, color: "#475569", indent: 12 }));
        }
        kids.push(box("group", `comp:${comp.id}`, { children: c, style: { marginBottom: 8 } }));
      }
    }
    children.push(box("group", `section:${section.id}`, { children: kids }));
  }

  if (pub.model.closing)
    children.push(textBox("doc:closing", pub.model.closing, { font: seriffed(t), size: SIZES.body, italic: true, color: ink, marginTop: 14 }));

  // ── End regions (content; §4) ──
  const contact = factsIn(pub.company, "contact");
  if (doc.contact === "block" && contact.length) {
    children.push(box("group", "region:contact", { children: [
      textBox("region:contact/head", "CONTACT", { font: sans(), size: SIZES.eyebrow, weight: 700, letterSpacing: 0.1, color: "#94A3B8", marginTop: 20 }),
      ...contact.map((f, i) => textBox(`region:contact/${i}`, f.value, { font: sans(), size: SIZES.small, color: "#64748B" })),
    ], rules: { keepTogether: true } }));
  }
  const payment = factsIn(pub.company, "payment");
  if (payment.length) {
    children.push(box("group", "region:payment", { children:
      payment.map((f, i) => textBox(`region:payment/${i}`, `${f.label}: ${f.value}`, { font: sans(), size: SIZES.small, color: "#64748B" })),
      style: { marginTop: 14 }, rules: { keepTogether: true } }));
  }
  if (doc.signature === "line" && pub.regions.signature) {
    // THE CONSTITUTIONAL DEFAULT: a signature never splits.
    children.push(box("group", "region:signature", { children: [
      box("rule", "region:signature/rule", { style: { ruleColor: "#E7CFA0", ruleWidth: 0.5, marginTop: 28, width: 160 } }),
      textBox("region:signature/name", pub.regions.signature, { font: seriffed(t), size: SIZES.body, weight: 600, color: ink }),
    ], rules: { keepTogether: true } }));
  }
  const termsWords = pub.regions.terms ?? factsIn(pub.company, "terms").map((f) => f.value).join("\n\n");
  if (doc.terms === "standard" && termsWords) {
    // THE CONSTITUTIONAL DEFAULT: terms never split.
    children.push(box("group", "region:terms", { children: [
      textBox("region:terms/head", "TERMS", { font: sans(), size: SIZES.eyebrow, weight: 700, letterSpacing: 0.1, color: "#94A3B8", marginTop: 20 }),
      textBox("region:terms/body", termsWords, { font: sans(), size: SIZES.terms, color: "#94A3B8" }),
    ], rules: { keepTogether: true } }));
  }
  const footerLine = pub.regions.footer ?? derivedFooterLine(pub.company);
  if (doc.footer === "line" && footerLine) {
    children.push(box("group", "region:footer", { children: [
      box("rule", "region:footer/rule", { style: { ruleColor: "#F0E4C8", ruleWidth: 0.5, marginTop: 24, marginBottom: 6 } }),
      textBox("region:footer/line", footerLine, { font: sans(), size: SIZES.small, color: "#94A3B8", align: "center" }),
    ], rules: { keepTogether: true } }));
  }

  return box("group", "document", { children });
}

// ═══ PR-3 — THE MASTER COMPOSER: geometry + furniture derived at the
// wall's gate. FIRST suppresses the running header (the content company
// header already opens the paper — a declared master decision, §4).
// Running furniture DERIVES from company facts but is a SEPARATE object
// from the content regions: toggling the content footer never moves the
// running footer, and vice versa — the §4 independence, unit-proven. ═══
const LETTER = { width: 612, height: 792 };
const MARGINS = { top: 54, right: 54, bottom: 60, left: 54 };

export function composeMasters(pub: RenderPublication): MasterSet {
  const trade = pub.company.filter((f) => f.key === "identity.trade_name")[0]?.value ?? null;
  const supervision = pub.company.filter((f) => f.key === "legal.supervision")[0]?.value ?? null;
  const watermark = pub.theme.treatments.document.watermark !== "none"
    ? (pub.theme.treatments.document.watermark === "draft" ? "DRAFT" : "CONFIDENTIAL") : null;

  const runningHeader: Box | null = trade
    ? box("text", "furniture:running-header", {
        text: trade.toUpperCase(),
        style: { font: "sans", size: 7.5, weight: 700, letterSpacing: 0.14, color: "#94A3B8" } })
    : null;
  const footerLine = [trade, supervision].filter(Boolean).join("  \u00b7  ");
  const runningFooter: Box | null = footerLine
    ? box("text", "furniture:running-footer", {
        text: footerLine,
        style: { font: "sans", size: 7.5, color: "#94A3B8", align: "center" } })
    : null;

  const master = (key: PageMaster["key"], over: Partial<PageMaster>): PageMaster => ({
    key, size: LETTER, margins: MARGINS,
    runningHeader, runningFooter,
    decorations: { pageNumbers: "footer-center", watermark }, ...over });

  return makeMasterSet(
    master("first", { runningHeader: null,                       // §4: declared suppression
      decorations: { pageNumbers: "none", watermark } }),        // page one carries no number
    master("interior", {}),
    master("last", {}),
  );
}

/** PR-6 — the LABEL MAP, built at the wall's gate: tag prefixes → human
 *  names, so proof can speak ("Dinner, continued") without ever knowing
 *  what a section is. Sections and components label; regions that read
 *  as documents label; machinery stays silent. */
export function composeProofLabels(pub: RenderPublication): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const section of pub.model.sections) {
    labels[`section:${section.id}`] = section.name;
    for (const band of section.bands) for (const comp of band.components)
      labels[`comp:${comp.id}`] = comp.title;
  }
  labels["region:terms"] = "Terms";
  return labels;
}
