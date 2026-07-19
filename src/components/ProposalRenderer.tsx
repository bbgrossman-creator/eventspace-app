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
function Heading({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold tracking-wide mb-1" style={{ color: "var(--pub-accent, #C9A34E)" }}>{children}</div>;
}

// ── v195 P1.7/P1.9: ONE implementation of the three layouts, shared by
//    component blocks AND choice groups. Choices are no longer vertical-only. ─
function ItemRun({ items, layout, bullet = "\u00b7" }: {
  items: PresentationItem[]; layout: "vertical" | "comma" | "dot"; bullet?: string;
}) {
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
              <span className={ghost(it) ? "line-through decoration-slate-300" : ""}>{it.name}</span>
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
          {it.name}
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
import { ResolvedTheme } from "@/lib/publication";

export default function ProposalRenderer({ model, draftRibbon = true, xray = false, theme }: {
  model: PresentationModel; draftRibbon?: boolean;
  /** v196: chrome only. The MODEL already decided what exists — an internal
   *  item is absent from a non-xray model, so this flag cannot leak one. It
   *  only labels the page as an authoring surface. */
  xray?: boolean;
  theme?: ResolvedTheme;
}) {
  // Themed dress, historical fallbacks.
  const H = { color: theme?.colors.primary ?? T.navy, fontFamily: theme?.fonts.headingStack } as const;
  const A = theme?.colors.accent ?? T.gold;
  const isDraft = model.status !== "approved" && model.status !== "sent";
  return (
    <div className="mx-auto max-w-3xl bg-white px-8 py-10 sm:px-12 sm:py-14 relative" style={{ color: T.ink }}>
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

      <header className="text-center mb-10">
        <h1 data-pub-title className="font-display font-extrabold tracking-tight text-3xl sm:text-4xl" style={H}>{model.title}</h1>
        {model.eventLine && <p className="mt-2 text-sm tracking-wide text-slate-500 uppercase">{model.eventLine}</p>}
        <div className="mx-auto mt-4 h-[3px] w-12 rounded-full" style={{ background: A }} />
      </header>

      {model.intro && <p className="text-[15px] leading-relaxed text-slate-600 mb-10 whitespace-pre-wrap">{model.intro}</p>}

      <div className="space-y-10">
        {model.sections.map((section, si) => (
          <section key={si}>
            <div className="flex items-baseline justify-between pb-1.5 mb-4 border-b" style={{ borderColor: T.goldSoft }}>
              <h2 className="font-display font-bold text-xl tracking-tight" style={H}>{section.name}</h2>
              {section.subtotalLabel && <span className="text-sm font-semibold text-slate-500">{section.subtotalLabel}</span>}
            </div>

            <div className="space-y-6">
              {section.bands.map((band, bi) => (
                <div key={bi}>
                  {band.label && <h3 className="font-display font-semibold text-[15px] mb-1" style={{ color: T.bandInk }}>{band.label}</h3>}
                  {band.description && <p className="text-[13px] italic text-slate-500 mb-2">{band.description}</p>}
                  <div className={band.label ? "pl-3 border-l-2 space-y-4" : "space-y-4"}
                       style={band.label ? { borderColor: T.goldFaint } : undefined}>
                    {band.components.map((comp, ci) => (
                      <div key={ci}>
                        <div className="flex items-baseline justify-between gap-3">
                          <h4 className="font-semibold text-[15px]" style={{ color: T.ink }}>{comp.title}</h4>
                          <Price label={comp.priceLabel} status={comp.priceStatus} strong />
                        </div>
                        {comp.description && <p className="text-[13.5px] leading-relaxed text-slate-600 mt-1">{comp.description}</p>}
                        {/* v195 P1.2: the COMPONENT's own note — "Carved to order by
                            our chefs" belongs to the station, not to the Prime Rib. */}
                        {comp.note && <p className="text-[12.5px] italic text-slate-500 mt-1">{comp.note}</p>}
                        {comp.blocks.map((block, bk) => (
                          <div key={bk} className={bk === 0 ? "mt-1.5" : "mt-2.5"}>
                            {block.showHeading && block.label && <Heading>{block.label}</Heading>}
                            <ItemRun items={block.items} layout={block.layout} />
                          </div>
                        ))}
                        {/* v195 P1.1: the choice renders HERE, inside its course. */}
                        {comp.choice && <div className="mt-3"><ChoiceCard cg={comp.choice} /></div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {/* Legacy fallback: groups not yet attached to a component. */}
              {section.choiceGroups.map((cg, gi) => <ChoiceCard key={`cg-${gi}`} cg={cg} />)}
            </div>
          </section>
        ))}
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
    </div>
  );
}
