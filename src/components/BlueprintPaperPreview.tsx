"use client";
// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT PAPER PREVIEW (v256 · BP-6) — a published revision, previewed
// as a page, wearing TODAY'S CLOTHES and saying so: presentation resolves
// at instantiation; the portable stratum travels by value; what this
// preview wears is the company's current look, not a promise.
//
// THE WALL STANDS: this component imports only the content shape. The
// Publication Renderer (src/lib/render) still contains no blueprint
// vocabulary — a blueprint previews as structured content on the shelf,
// and becomes a real paper only through BP-3's ceremony. (Unit-pinned.)
// ═══════════════════════════════════════════════════════════════════════════
import { BlueprintContent } from "@/lib/blueprintContent";

const INTENT_LABEL: Record<string, string> = {
  "reference-current": "priced from the catalog at arrival",
  "authored-suggestion": "suggested price",
  "formula": "per-guest formula",
  "fixed-package": "fixed package (policy-backed)",
};

export default function BlueprintPaperPreview({ content }: { content: BlueprintContent }) {
  const c = content;
  return (
    <div data-blueprint-preview className="mt-3">
      <div data-todays-clothes className="text-[11px] text-slate-400 mb-1.5">
        Previewed in today's clothes — presentation resolves at instantiation; the portable stratum
        travels by value{c.presentation?.portable.themeKey ? ` (authored theme: ${c.presentation.portable.themeKey})` : ""}.
      </div>
      <div className="bg-white rounded-[3px] ring-1 ring-black/10 shadow-sm px-8 py-6 max-w-[640px]">
        {(c.constraints.character || c.constraints.serviceStyle || c.constraints.supervision) && (
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400 mb-3">
            {[c.constraints.character, c.constraints.serviceStyle, c.constraints.supervision].filter(Boolean).join(" · ")}
            {c.constraints.calendarSensitive ? " · calendar-sensitive" : ""}
          </div>
        )}
        {c.structure.map((ch) => (
          <div key={ch.key} className="mb-4">
            <div className="text-[19px] text-slate-800" style={{ fontFamily: "'Playfair Display', serif" }}>{ch.title || "—"}</div>
            {ch.prose && <p className="mt-1 text-[12px] text-slate-500 leading-relaxed">{ch.prose}</p>}
            {ch.sections.map((se) => (
              <div key={se.key} className="mt-3 pl-1">
                <div className="text-[14px] font-medium text-slate-700">{se.title || "—"}</div>
                {se.prose && <p className="mt-0.5 text-[12px] text-slate-500">{se.prose}</p>}
                {se.entries.map((en) => (
                  <div key={en.key} className="mt-1.5 pl-3 border-l-2 border-[#EDF2F8]">
                    <div className="text-[13px] text-slate-700">{en.title || "(component)"}</div>
                    {en.itemSelections.filter((i) => i.include).length > 0 && (
                      <div className="text-[11px] text-slate-500">
                        {en.itemSelections.filter((i) => i.include).map((i) => i.name).join(" · ")}
                      </div>
                    )}
                    {en.choiceGroups.map((cg) => (
                      <div key={cg.key} className="text-[11px] text-slate-400">
                        {cg.label}: {cg.options.join(" / ")}{cg.required ? "" : " (optional)"}
                      </div>
                    ))}
                    {en.pricingIntent && (
                      <div className="text-[11px] text-slate-400 italic">{INTENT_LABEL[en.pricingIntent.form]}</div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
        {c.parameters.length > 0 && (
          <div className="mt-3 pt-2 border-t border-[#F1F5FA] text-[11px] text-slate-400">
            Asked at instantiation: {c.parameters.map((p) => p.label || p.key).join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}
