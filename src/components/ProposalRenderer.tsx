"use client";
// ═══════════════════════════════════════════════════════════════════════════
// PROPOSAL RENDERER (v195) — the customer-facing view.
//
// Renders a PresentationModel ONLY: no bookings, tenants, costs or internal
// notes, because the model doesn't contain them. Same component serves the
// authenticated preview and the public share page — same model, different
// resolver.
//
// v195 CLEANUP — this file used to duplicate its own logic:
//   • the optional badge existed twice, with different margins (already drifting)
//   • price styling branched on the ENGLISH string "Pricing pending"
//   • category headings were force-uppercased, discarding authored capitalisation
//   • choice groups always rendered vertically, ignoring the layout system
//   • colour literals were scattered across ~20 sites
// Everything now flows through the primitives at the top of this file. This is
// NOT theming — the palette is still hard-coded here. It is the PREREQUISITE:
// you cannot extract a theme from logic that is copy-pasted. One place per
// decision, so a later theme has one seam to cut.
// ═══════════════════════════════════════════════════════════════════════════
import { PresentationModel, PresentationItem, PresentationChoiceGroup, PriceStatus } from "@/lib/presentation";

// ── Design tokens: the single seam a future theme replaces ─────────────────
const T = {
  ink: "#1F2A37", navy: "#102F56", gold: "#C9A34E",
  goldSoft: "#EAD9B0", goldFaint: "#F0E6CC", cream: "#FBFAF6",
  bandInk: "#334155", optional: "#6D28D9",
  /** v196 X-ray chrome. Deliberately in the SAME token object: X-ray is not a
   *  separate theme, it is chrome drawn over the artifact. */
  xrayInk: "#94A3B8", xrayEdge: "#CBD5E1",
} as const;

// ── Price ─ v195 P1.4: styling keyed off a TYPED status, never off wording ──
const PRICE_TONE: Record<PriceStatus, string> = {
  none: "", quoted: "text-slate-400", pending: "text-amber-500 italic",
  included: "text-slate-400 italic", free: "text-slate-400 italic",
};
function Price({ label, status, strong = false }: { label: string | null; status: PriceStatus; strong?: boolean }) {
  if (!label) return null;
  const tone = status === "pending" ? "text-amber-500 italic" : strong ? "text-slate-500" : PRICE_TONE[status];
  return <span className={`whitespace-nowrap ${strong ? "text-[13px] font-medium" : ""} ${tone}`}>{label}</span>;
}

// ── v195 P1.5: was two copies with different margins. Now one. ─────────────
function OptionalBadge() {
  return <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: T.optional }}>optional</span>;
}

// ── v195 P1.6: `uppercase` removed — authored casing is data, not decoration ─
function Heading({ children, variant = "standard" }: { children: React.ReactNode; variant?: "standard" | "eyebrow" | "understated" }) {
  if (variant === "eyebrow")
    return <div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style={{ color: "var(--pub-accent, #C9A34E)" }}>{children}</div>;
  if (variant === "understated")
    return <div className="text-[11px] font-medium tracking-wide mb-1 text-slate-400">{children}</div>;
  return <div className="text-[11px] font-semibold tracking-wide mb-1" style={{ color: "var(--pub-accent, #C9A34E)" }}>{children}</div>;
}

// ── v195 P1.7/P1.9: ONE implementation of the three layouts, shared by
//    component blocks AND choice groups. Choices are no longer vertical-only. ─
function ItemRun({ items, layout, bullet = "\u00b7", emphasis = "standard" }: {
  items: PresentationItem[]; layout: "vertical" | "comma" | "dot"; bullet?: string;
  emphasis?: "standard" | "strong" | "subtle";
}) {
  const emph = emphasis === "strong" ? "font-semibold text-slate-700"
    : emphasis === "subtle" ? "text-slate-400" : "";
  // v196: an internal row is drawn GHOSTED — struck through, greyed, with the
  // reason. It is not styled to look deleted; it is styled to look like truth
  // the customer will never receive. The distinction matters: the chef needs
  // these rows, so they must read as real, just not customer-facing.
  const ghost = (it: PresentationItem) => it.internal === true;
  if (!items.length) return null;
  if (layout === "vertical") {
    return (
      <ul className="space-y-0.5">
        {items.map((it, i) => (
          <li key={i}
              className={`flex items-baseline justify-between gap-3 text-[13.5px] ${
                ghost(it) ? "" : "text-slate-600"}`}
              style={ghost(it) ? { color: T.xrayInk } : undefined}>
            <span>
              <span className="mr-1.5" style={{ color: ghost(it) ? T.xrayEdge : T.gold }}>{bullet}</span>
              <span className={ghost(it) ? "line-through decoration-slate-300" : emph}>{it.name}</span>
              {ghost(it) && (
                <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded"
                      style={{ background: "#F1F5F9", color: T.xrayInk }}>
                  {it.hiddenReason ?? "internal"}
                </span>
              )}
              {it.unconfirmed && !ghost(it) && (
                <span title="Carried price — not yet confirmed"
                      className="ml-1.5 text-[9px] font-bold text-amber-600">⚠</span>
              )}
              {it.optional && <OptionalBadge />}
              {it.description && <span className="text-slate-400"> &mdash; {it.description}</span>}
              {it.note && <span className="block pl-4 text-[12px] italic text-slate-400">{it.note}</span>}
            </span>
            <Price label={it.priceLabel} status={it.priceStatus} />
          </li>
        ))}
      </ul>
    );
  }
  // Inline runs are compact prose: per-item price labels are suppressed —
  // choose vertical if items need prices. Notes stay a distinct secondary
  // element (italic, lighter), never parenthesised.
  return (
    <p className="text-[13.5px] leading-relaxed text-slate-600">
      {items.map((it, i) => (
        <span key={i}>
          {i > 0 && (layout === "dot" ? <span style={{ color: "var(--pub-accent, #C9A34E)" }}> &middot; </span> : <span>, </span>)}
          <span className={emph}>{it.name}</span>
          {it.optional && <OptionalBadge />}
          {it.note && <span className="text-[12px] italic text-slate-400"> {it.note}</span>}
        </span>
      ))}
    </p>
  );
}

function ChoiceCard({ cg }: { cg: PresentationChoiceGroup }) {
  const asItems: PresentationItem[] = cg.options.map((o) => ({
    name: o.name, description: o.description, price: null,
    priceLabel: o.priceLabel, priceStatus: o.priceStatus, note: null, optional: false,
  }));
  return (
    <div className="rounded-lg p-4" style={{ background: T.cream, boxShadow: `inset 0 0 0 1px ${T.goldSoft}` }}>
      <div className="flex items-baseline gap-2 mb-2">
        {/* v195 P1.3: an empty label means the component title already said it. */}
        {cg.label && <h4 className="font-semibold text-[15px]" style={{ color: T.ink }}>{cg.label}</h4>}
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--pub-accent, #C9A34E)" }}>Choose {cg.chooseCount}</span>
      </div>
      <ItemRun items={asItems} layout={cg.layout} bullet={"○"} />
    </div>
  );
}

// v225 PUBLICATION — the renderer is PARAMETERIZED by a resolved theme
// (Proposal data → Lens projection → PublicationTheme → Renderer). Unthemed
// callers render exactly the historical dress: every themed value falls back
// to the constants that were always here. The theme decides how things look
// — nothing here lets it decide what exists.
import { ResolvedTheme, effectiveSectionTreatment, effectiveComponentTreatment, effectiveItemTreatment, COMPONENT_TREATMENT_DEFAULTS, ITEM_TREATMENT_DEFAULTS, ComponentTreatment, ItemTreatment, BULLET_CHARS, SectionTreatment, DocumentTreatment, RegionTexts } from "@/lib/publication";
import { PhotoPins, pinnedFor } from "@/lib/photos";
import { selectedStyle } from "@/lib/selection";

export default function ProposalRenderer({ model, draftRibbon = true, xray = false, theme, onSectionSelect, onDocumentSelect, selectedSectionId, documentSelected, regions, photos, onComponentSelect, selectedComponentId, onItemsSelect, selectedItemsId }: {
  model: PresentationModel; draftRibbon?: boolean;
  /** v226 THE CANVAS — Studio-only interactivity: the paper is the primary
   *  interaction surface; clicking a section head selects its PRESENTATION
   *  IDENTITY. Preview/share callers omit these and render inert. */
  onSectionSelect?: (sectionId: string) => void;
  /** v229 — the DOCUMENT is an identity too: clicking the title block
   *  selects it for its own contextual toolbar. */
  onDocumentSelect?: () => void;
  /** v234 — components are identities too (selects.component). */
  onComponentSelect?: (componentId: string) => void;
  selectedComponentId?: string | null;
  /** v235 — the item run ("the items of component X") is an identity. */
  onItemsSelect?: (componentId: string) => void;
  selectedItemsId?: string | null;
  selectedSectionId?: string | null;
  documentSelected?: boolean;
  /** v231 — the region WORDS (footer/signature/terms), brand-owned. */
  regions?: RegionTexts;
  /** v233 — the version's PINNED imagery: the pin decides existence, the
   *  treatment decides dress. */
  photos?: PhotoPins | null;
  /** v196: chrome only. The MODEL already decided what exists — an internal
   *  item is absent from a non-xray model, so this flag cannot leak one. It
   *  only labels the page as an authoring surface. */
  xray?: boolean;
  theme?: ResolvedTheme;
}) {
  // Themed dress, historical fallbacks.
  const H = { color: theme?.colors.primary ?? T.navy, fontFamily: theme?.fonts.headingStack } as const;
  const A = theme?.colors.accent ?? T.gold;
  const docTr: Required<DocumentTreatment> = theme
    ? theme.treatments.document
    : { divider: "rule", heading: "standard", spacing: "standard", background: "none", title: "standard",
        cover: "none", watermark: "none", footer: "none", signature: "none", terms: "none", photo: "band" };
  const isDraft = model.status !== "approved" && model.status !== "sent";
  return (
    // v229 — the ROOT is themed (repairing a silent v225 miss: the wrap
    // targeted a class the root never had, so paper tint, body stack, ink,
    // measure, and --pub-accent never landed; sub-components rode the
    // fallback gold). Unthemed callers keep the historical dress exactly.
    <div data-publication
      className="mx-auto max-w-3xl bg-white px-8 py-10 sm:px-12 sm:py-14 relative"
      style={theme ? {
        color: theme.colors.ink,
        fontFamily: theme.fonts.bodyStack,
        backgroundColor: theme.paper.tint,
        maxWidth: theme.margins.measure,
        ["--pub-accent" as never]: theme.colors.accent,
      } : { color: T.ink }}>
      {xray && (
        <div className="absolute top-4 left-4 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
             style={{ background: T.gold, color: "white" }}>
          X-ray — the customer sees none of this chrome
        </div>
      )}
      {draftRibbon && isDraft && (
        <div className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-widest text-amber-600 border border-amber-300 rounded px-2 py-0.5">
          Draft preview
        </div>
      )}

      {/* v231 — THE WATERMARK REGION: a ghost across the paper, never over
           the reader's patience. Behind everything, pointer-transparent. */}
      {docTr.watermark !== "none" && (
        <div data-pub-watermark aria-hidden
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
          <span className="font-display font-extrabold uppercase tracking-[0.3em] opacity-[0.05] rotate-[-28deg] whitespace-nowrap"
            style={{ fontSize: 110, color: theme?.colors.primary ?? T.navy }}>
            {docTr.watermark === "draft" ? "Draft" : "Confidential"}
          </span>
        </div>
      )}

      <header data-pub-doc data-pub-titlestyle={docTr.title} data-pub-cover={docTr.cover}
        onClick={onDocumentSelect ? () => onDocumentSelect() : undefined}
        title={onDocumentSelect ? "Style this document" : undefined}
        className={`rounded-sm ${docTr.cover === "banner" ? "-mx-8 sm:-mx-12 -mt-10 sm:-mt-14 px-8 sm:px-12 pt-12 pb-10 mb-10" : docTr.cover === "classic" ? "py-14 mb-10" : "mb-10"} ${
          docTr.title === "understated" && docTr.cover === "none" ? "text-left" : "text-center"}${
          onDocumentSelect ? " cursor-pointer hover:ring-1 hover:ring-[#4A9EFF]/40 hover:ring-offset-4" : ""}${
          documentSelected ? " pl-2 -ml-2" : ""}`}
        style={{ ...(docTr.cover === "banner" ? { background: `${A}14` } : {}), ...selectedStyle(!!documentSelected) }}>
        {docTr.cover !== "none" && (
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] mb-3" style={{ color: A }}>Proposal</p>
        )}
        <h1 data-pub-title className={`font-display tracking-tight ${
          docTr.title === "understated" ? "font-semibold text-2xl" : "font-extrabold text-3xl sm:text-4xl"}`} style={H}>{model.title}</h1>
        {model.eventLine && <p className="mt-2 text-sm tracking-wide text-slate-500 uppercase">{model.eventLine}</p>}
        {docTr.title !== "understated" && (
          <div className={`${docTr.title === "standard" || docTr.title === "centered" ? "mx-auto" : ""} mt-4 h-[3px] w-12 rounded-full`} style={{ background: A }} />
        )}
        {(() => {
          const pin = pinnedFor(photos, "__document__");
          if (!pin || docTr.photo === "none") return null;
          return (
            <img data-pub-photo="__document__" data-pub-photostyle={docTr.photo}
              src={pin.url} alt={pin.label}
              className={docTr.photo === "full"
                ? "-mx-8 sm:-mx-12 mt-8 -mb-10 block w-[calc(100%+4rem)] sm:w-[calc(100%+6rem)] max-w-none h-64 object-cover"
                : "mt-8 block w-full h-44 object-cover rounded-md"} />
          );
        })()}
      </header>

      {model.intro && <p className="text-[15px] leading-relaxed text-slate-600 mb-10 whitespace-pre-wrap">{model.intro}</p>}
      {/* content sits above the watermark plane */}

      <div className="space-y-10">
        {model.sections.map((section, si) => {
          // v226 THE CANVAS — the section's effective dress: semantic
          // treatments (document defaults overlaid by this identity's own
          // entry). Unthemed callers keep the historical section rendering.
          const tr: Required<SectionTreatment> = theme
            ? effectiveSectionTreatment(theme, section.id)
            : { divider: "rule", heading: "standard", spacing: "standard", background: "none", photo: "band" };
          const gap = theme ? theme.margins.sectionGap : 40;
          const mb = tr.spacing === "compact" ? Math.round(gap * 0.6) : tr.spacing === "airy" ? Math.round(gap * 1.5) : gap;
          const selectable = !!onSectionSelect;
          const selected = selectedSectionId === section.id;
          return (
          <section key={si} data-pub-section={section.id} data-pub-spacing={tr.spacing} data-pub-bg={tr.background}
            className={tr.background === "tint" ? "rounded-lg px-5 py-4" : tr.background === "panel" ? "rounded-lg px-5 py-4 ring-1 bg-white shadow-sm" : undefined}
            style={{ marginBottom: mb,
              ...(tr.background === "tint" ? { background: `${A}14` } : {}),
              ...(tr.background === "panel" ? { borderColor: T.goldFaint, boxShadow: "0 1px 2px rgba(16,47,86,0.06)" } : {}) }}>
            {si > 0 && tr.divider !== "none" && (
              <div data-pub-divider={tr.divider} aria-hidden className="mb-6 flex justify-center">
                {tr.divider === "rule" && <span className="block h-px w-full" style={{ background: T.goldSoft }} />}
                {tr.divider === "double" && (
                  <span className="block w-full">
                    <span className="block h-px w-full mb-[3px]" style={{ background: T.goldSoft }} />
                    <span className="block h-px w-full" style={{ background: T.goldSoft }} />
                  </span>
                )}
                {tr.divider === "dots" && <span className="tracking-[0.6em] text-[12px]" style={{ color: "var(--pub-accent, #C9A34E)" }}>···</span>}
              </div>
            )}
            <div
              data-pub-headstyle={tr.heading}
              onClick={selectable ? () => onSectionSelect(section.id) : undefined}
              className={`${tr.heading === "centered" ? "text-center " : "flex items-baseline justify-between "}pb-1.5 mb-4 border-b${selectable ? " cursor-pointer rounded-sm hover:ring-1 hover:ring-[#4A9EFF]/40 hover:ring-offset-2" : ""}${selected ? " pl-2 -ml-2" : ""}`}
              style={{ borderColor: T.goldSoft, ...selectedStyle(selected) }}
              title={selectable ? "Style this section" : undefined}>
              {tr.heading === "eyebrow" && (
                <span className="block w-full text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: "var(--pub-accent, #C9A34E)" }}>{section.name}</span>
              )}
              {tr.heading !== "eyebrow" && (
                <h2 className="font-display font-bold text-xl tracking-tight" style={H}>{section.name}</h2>
              )}
              {section.subtotalLabel && tr.heading !== "centered" && <span className="text-sm font-semibold text-slate-500">{section.subtotalLabel}</span>}
            </div>

            {(() => {
              const pin = pinnedFor(photos, section.id);
              if (!pin || tr.photo === "none" || tr.photo === "full") return null;
              return tr.photo === "side" ? (
                <img data-pub-photo={section.id} data-pub-photostyle="side" src={pin.url} alt={pin.label}
                  className="float-right ml-4 mb-2 w-36 h-28 object-cover rounded-md" />
              ) : (
                <img data-pub-photo={section.id} data-pub-photostyle="band" src={pin.url} alt={pin.label}
                  className="mb-4 block w-full h-40 object-cover rounded-md" />
              );
            })()}
            <div className="space-y-6">
              {section.bands.map((band, bi) => (
                <div key={bi}>
                  {band.label && <h3 className="font-display font-semibold text-[15px] mb-1" style={{ color: T.bandInk }}>{band.label}</h3>}
                  {band.description && <p className="text-[13px] italic text-slate-500 mb-2">{band.description}</p>}
                  <div className={band.label ? "pl-3 border-l-2 space-y-4" : "space-y-4"}
                       style={band.label ? { borderColor: T.goldFaint } : undefined}>
                    {band.components.map((comp, ci) => {
                      const ct: Required<ComponentTreatment> = theme
                        ? effectiveComponentTreatment(theme, comp.id) : COMPONENT_TREATMENT_DEFAULTS;
                      const cSel = !!onComponentSelect;
                      const cPin = pinnedFor(photos, "comp:" + comp.id);
                      return (
                      <div key={ci} data-pub-comp={comp.id} data-pub-comptitle={ct.title}
                        className={`${cSel ? "cursor-pointer rounded-sm hover:ring-1 hover:ring-[#4A9EFF]/40 hover:ring-offset-2" : ""}${
                          selectedComponentId === comp.id ? " pl-2 -ml-2" : ""}`}
                        style={selectedStyle(selectedComponentId === comp.id)}
                        onClick={cSel ? (e) => { e.stopPropagation(); onComponentSelect(comp.id); } : undefined}
                        title={cSel ? "Style this component" : undefined}>
                        {cPin && ct.photo === "band" && (
                          <img data-pub-photo={"comp:" + comp.id} data-pub-photostyle="band" src={cPin.url} alt={cPin.label}
                            className="mb-2 block w-full h-28 object-cover rounded-md" />
                        )}
                        {cPin && ct.photo === "side" && (
                          <img data-pub-photo={"comp:" + comp.id} data-pub-photostyle="side" src={cPin.url} alt={cPin.label}
                            className="float-right ml-3 mb-1 w-24 h-20 object-cover rounded-md" />
                        )}
                        <div className="flex items-baseline justify-between gap-3">
                          <h4 className={`text-[15px] ${ct.title === "caps" ? "font-bold uppercase tracking-[0.08em] text-[13px]" : "font-semibold"}`}
                            style={ct.title === "accent" ? { color: "var(--pub-accent, #C9A34E)" } : { color: T.ink }}>{comp.title}</h4>
                          <span data-pub-price={ct.price} className={
                            ct.price === "tabular" ? "tabular-nums font-semibold"
                            : ct.price === "muted" ? "opacity-60" : undefined}>
                            <Price label={comp.priceLabel} status={comp.priceStatus} strong={ct.price !== "muted"} />
                          </span>
                        </div>
                        {comp.description && (
                          <p className={`text-[13.5px] leading-relaxed mt-1 ${
                            ct.description === "italic" ? "italic text-slate-500"
                            : ct.description === "understated" ? "text-[12.5px] text-slate-400" : "text-slate-600"}`}>{comp.description}</p>
                        )}
                        {/* v195 P1.2: the COMPONENT's own note — "Carved to order by
                            our chefs" belongs to the station, not to the Prime Rib. */}
                        {comp.note && <p className="text-[12.5px] italic text-slate-500 mt-1">{comp.note}</p>}
                        {comp.blocks.length > 0 && (() => {
                          const itr: Required<ItemTreatment> = theme
                            ? effectiveItemTreatment(theme, comp.id) : ITEM_TREATMENT_DEFAULTS;
                          const iSel = !!onItemsSelect;
                          return (
                            <div data-pub-items={comp.id}
                              data-pub-bullet={itr.bullet} data-pub-itememphasis={itr.emphasis}
                              onClick={iSel ? (e) => { e.stopPropagation(); onItemsSelect(comp.id); } : undefined}
                              title={iSel ? "Style these items" : undefined}
                              className={`${iSel ? "cursor-pointer rounded-sm hover:ring-1 hover:ring-[#4A9EFF]/40 hover:ring-offset-2" : ""}${
                                selectedItemsId === comp.id ? " pl-2 -ml-2" : ""}`}
                              style={selectedStyle(selectedItemsId === comp.id)}>
                              {comp.blocks.map((block, bk) => {
                                const lay = itr.layout === "inherit" ? block.layout : itr.layout;
                                return (
                                  <div key={bk} data-pub-itemlayout={lay} className={bk === 0 ? "mt-1.5" : "mt-2.5"}>
                                    {block.showHeading && block.label && <Heading variant={itr.heading}>{block.label}</Heading>}
                                    <ItemRun items={block.items} layout={lay}
                                      bullet={BULLET_CHARS[itr.bullet]} emphasis={itr.emphasis} />
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                        {/* v195 P1.1: the choice renders HERE, inside its course. */}
                        {comp.choice && <div className="mt-3"><ChoiceCard cg={comp.choice} /></div>}
                      </div>
                    ); })}
                  </div>
                </div>
              ))}
              {/* Legacy fallback: groups not yet attached to a component. */}
              {section.choiceGroups.map((cg, gi) => <ChoiceCard key={`cg-${gi}`} cg={cg} />)}
            </div>
          </section>
        ); })}
      </div>

      {/* ── v195: the ending, made intentional ── */}
      {model.summary ? (
        <div className="mt-12 pt-5 border-t-2" style={{ borderColor: T.navy }}>
          <h3 className="font-display font-bold text-lg mb-3" style={H}>Estimated Investment</h3>
          <div className="space-y-1.5 mb-4">
            {model.summary.lines.map((l, i) => (
              <div key={i} className="flex items-baseline justify-between text-[13.5px] text-slate-600">
                <span>{l.label}</span>
                <span className="whitespace-nowrap tabular-nums">{l.amount}</span>
              </div>
            ))}
          </div>
          <div className="flex items-baseline justify-between pt-3 border-t" style={{ borderColor: T.goldSoft }}>
            <span className="font-display font-bold text-lg" style={H}>Estimated Total</span>
            <span className="font-display font-extrabold text-2xl tabular-nums" style={H}>{model.summary.totalLabel}</span>
          </div>
          {model.summary.preparedFor && (
            <p className="mt-6 text-[12.5px] text-slate-400">Prepared for {model.summary.preparedFor}</p>
          )}
        </div>
      ) : model.priceVisibility === "hidden" ? (
        <p className="mt-10 pt-4 border-t border-slate-200 text-center text-[13px] text-slate-400">
          Pricing provided separately.
        </p>
      ) : null}

      {model.closing && <p className="text-[15px] leading-relaxed text-slate-600 mt-10 whitespace-pre-wrap">{model.closing}</p>}

      {/* ── v231 — THE END REGIONS. The dress rides the ladder; the WORDS
           are brand facts. A toggled region with no words renders nothing
           for the customer — and a quiet coaching line in the Studio
           (draftRibbon is the Studio/preview tell). ── */}
      {docTr.signature === "line" && (
        regions?.signature ? (
          <div data-pub-signature className="mt-14">
            <div className="w-56 border-t pt-2" style={{ borderColor: T.goldSoft }}>
              <p className="text-[13px] font-semibold" style={H}>{regions.signature}</p>
            </div>
          </div>
        ) : draftRibbon ? (
          <p data-pub-signature-hint className="mt-14 text-[11px] text-slate-300 italic">Signature is on — add the name in Brand Studio.</p>
        ) : null
      )}
      {docTr.terms === "standard" && (
        regions?.terms ? (
          <div data-pub-terms className="mt-10 pt-4 border-t" style={{ borderColor: T.goldFaint }}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Terms</p>
            <p className="text-[11px] leading-relaxed text-slate-400 whitespace-pre-wrap">{regions.terms}</p>
          </div>
        ) : draftRibbon ? (
          <p data-pub-terms-hint className="mt-10 text-[11px] text-slate-300 italic">Terms are on — add the words in Brand Studio.</p>
        ) : null
      )}
      {docTr.footer === "line" && (
        regions?.footer ? (
          <p data-pub-footer className="mt-12 pt-3 border-t text-center text-[11px] tracking-wide text-slate-400"
            style={{ borderColor: T.goldFaint }}>{regions.footer}</p>
        ) : draftRibbon ? (
          <p data-pub-footer-hint className="mt-12 text-center text-[11px] text-slate-300 italic">Footer is on — add the line in Brand Studio.</p>
        ) : null
      )}
    </div>
  );
}
