"use client";
// ═══════════════════════════════════════════════════════════════════════════
// PROPOSAL RENDERER (v188A) — the customer-facing view. Renders a
// PresentationModel ONLY: it has no access to bookings, tenants, costs, or
// internal notes because the model doesn't contain them. Bands become elegant
// subsections; packages show their customer description; choice groups render
// as "Choose N"; price visibility is honored.
//
// This same component serves the authenticated preview now and the public
// share page later — same model, same renderer, different resolver.
// ═══════════════════════════════════════════════════════════════════════════
import { PresentationModel } from "@/lib/presentation";

export default function ProposalRenderer({ model, draftRibbon = true }: {
  model: PresentationModel; draftRibbon?: boolean;
}) {
  const isDraft = model.status !== "approved" && model.status !== "sent";
  return (
    <div className="mx-auto max-w-3xl bg-white text-[#1F2A37] px-8 py-10 sm:px-12 sm:py-14 relative">
      {draftRibbon && isDraft && (
        <div className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-widest text-amber-600 border border-amber-300 rounded px-2 py-0.5">
          Draft preview
        </div>
      )}

      {/* Header */}
      <header className="text-center mb-10">
        <h1 className="font-display font-extrabold tracking-tight text-3xl sm:text-4xl text-[#102F56]">{model.title}</h1>
        {model.eventLine && <p className="mt-2 text-sm tracking-wide text-slate-500 uppercase">{model.eventLine}</p>}
        <div className="mx-auto mt-4 h-[3px] w-12 rounded-full bg-[#C9A34E]" />
      </header>

      {model.intro && (
        <p className="text-[15px] leading-relaxed text-slate-600 mb-10 whitespace-pre-wrap">{model.intro}</p>
      )}

      {/* Sections */}
      <div className="space-y-10">
        {model.sections.map((section, si) => (
          <section key={si}>
            <div className="flex items-baseline justify-between border-b border-[#EAD9B0] pb-1.5 mb-4">
              <h2 className="font-display font-bold text-xl text-[#102F56] tracking-tight">{section.name}</h2>
              {section.subtotalLabel && <span className="text-sm font-semibold text-slate-500">{section.subtotalLabel}</span>}
            </div>

            <div className="space-y-6">
              {section.bands.map((band, bi) => (
                <div key={bi}>
                  {band.label && (
                    <h3 className="font-display font-semibold text-[15px] text-[#334155] mb-1">{band.label}</h3>
                  )}
                  {band.description && (
                    <p className="text-[13px] italic text-slate-500 mb-2">{band.description}</p>
                  )}
                  <div className={band.label ? "pl-3 border-l-2 border-[#F0E6CC] space-y-4" : "space-y-4"}>
                    {band.components.map((comp, ci) => (
                      <div key={ci}>
                        <div className="flex items-baseline justify-between gap-3">
                          <h4 className="font-semibold text-[15px] text-[#1F2A37]">{comp.title}</h4>
                          {comp.priceLabel && <span className={`text-[13px] font-medium whitespace-nowrap ${comp.priceLabel === "Pricing pending" ? "text-amber-500 italic" : "text-slate-500"}`}>{comp.priceLabel}</span>}
                        </div>
                        {comp.description && (
                          <p className="text-[13.5px] leading-relaxed text-slate-600 mt-1">{comp.description}</p>
                        )}
                        {comp.blocks.map((block, bi) => (
                          <div key={bi} className={bi === 0 ? "mt-1.5" : "mt-2.5"}>
                            {block.showHeading && block.label && (
                              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#C9A34E] mb-1">{block.label}</div>
                            )}
                            {block.layout === "vertical" ? (
                              <ul className="space-y-0.5">
                                {block.items.map((it, ii) => (
                                  <li key={ii} className="flex items-baseline justify-between gap-3 text-[13.5px] text-slate-600">
                                    <span>
                                      <span className="text-[#C9A34E] mr-1.5">·</span>
                                      {it.name}
                                      {it.optional && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#6D28D9]">optional</span>}
                                      {it.description && <span className="text-slate-400"> — {it.description}</span>}
                                      {/* Presentation note: printed as stored, no prefix. */}
                                      {it.note && <span className="block pl-4 text-[12px] italic text-slate-400">{it.note}</span>}
                                    </span>
                                    {it.priceLabel && <span className={`whitespace-nowrap ${it.priceLabel === "Pricing pending" ? "text-amber-500 italic" : "text-slate-400"}`}>{it.priceLabel}</span>}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              /* Inline runs (comma/dot) are compact prose: per-item price
                                 labels are suppressed — choose vertical if items need prices.
                                 The note stays a distinct secondary element (italic, lighter),
                                 never parenthesised. */
                              <p className="text-[13.5px] leading-relaxed text-slate-600">
                                {block.items.map((it, ii) => (
                                  <span key={ii}>
                                    {ii > 0 && (block.layout === "dot"
                                      ? <span className="text-[#C9A34E]"> · </span>
                                      : <span>, </span>)}
                                    {it.name}
                                    {it.optional && <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-[#6D28D9]">optional</span>}
                                    {it.note && <span className="text-[12px] italic text-slate-400"> {it.note}</span>}
                                  </span>
                                ))}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Choice groups */}
              {section.choiceGroups.map((cg, gi) => (
                <div key={`cg-${gi}`} className="rounded-lg bg-[#FBFAF6] ring-1 ring-[#EAD9B0] p-4">
                  <div className="flex items-baseline gap-2 mb-2">
                    <h4 className="font-semibold text-[15px] text-[#1F2A37]">{cg.label}</h4>
                    <span className="text-[11px] font-bold uppercase tracking-wide text-[#C9A34E]">Choose {cg.chooseCount}</span>
                  </div>
                  <ul className="space-y-1">
                    {cg.options.map((o, oi) => (
                      <li key={oi} className="flex items-baseline justify-between gap-3 text-[13.5px] text-slate-600">
                        <span><span className="text-[#C9A34E] mr-1.5">○</span>{o.name}{o.description && <span className="text-slate-400"> — {o.description}</span>}</span>
                        {o.priceLabel && <span className="text-slate-400 whitespace-nowrap">{o.priceLabel}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Total */}
      {model.totalLabel && (
        <div className="mt-10 pt-4 border-t-2 border-[#102F56] flex items-baseline justify-between">
          <span className="font-display font-bold text-lg text-[#102F56]">Total</span>
          <span className="font-display font-extrabold text-2xl text-[#102F56]">{model.totalLabel}</span>
        </div>
      )}
      {model.priceVisibility === "hidden" && (
        <p className="mt-10 pt-4 border-t border-slate-200 text-center text-[13px] text-slate-400">
          Pricing provided separately.
        </p>
      )}

      {model.closing && (
        <p className="text-[15px] leading-relaxed text-slate-600 mt-10 whitespace-pre-wrap">{model.closing}</p>
      )}
    </div>
  );
}
