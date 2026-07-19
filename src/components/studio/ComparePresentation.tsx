"use client";
// v242 — COMPARE PRESENTATION… The Second Sheet ceremony: five exposures,
// then Apply as the CLOSING ACT. Nothing happens until every ambiguous
// mapping is decided; the confirm speaks the constitutional wording.
import React, { useMemo, useState } from "react";
import { ThemeDelta } from "@/lib/publication";
import { PhotoPins } from "@/lib/photos";
import { PortablePresentation, MappingDecisions, APPLY_CONFIRM_WORDING } from "@/lib/portable";
import { comparePresentation } from "@/lib/compare";

const T = { rule: "#E7EDF5", ink: "#1E293B", navy: "#102F56" } as const;

export default function ComparePresentation(p: {
  templateName: string;
  source: PortablePresentation;
  dest: { themeKey: string | null; override: ThemeDelta | null; pins: PhotoPins | null };
  destSections: { id: string; role: string; name?: string }[];
  libraryPhotoIds: string[];
  onApply: (decisions: MappingDecisions) => void;
  onClose: () => void;
}) {
  const report = useMemo(
    () => comparePresentation(p.source, p.dest, p.destSections, p.libraryPhotoIds),
    [p.source, p.dest, p.destSections, p.libraryPhotoIds]);
  const [decisions, setDecisions] = useState<MappingDecisions>({});
  const undecided = report.ambiguous.filter((m) => decisions[m.role] === undefined);
  const nameOf = (id: string) => p.destSections.filter((s) => s.id === id)[0]?.name ?? id;

  const H = (t: string) => (
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-3 mb-1">{t}</p>
  );

  return (
    <div data-compare-presentation className="h-full overflow-y-auto px-3 py-2 text-[12px]">
      <div className="flex items-baseline justify-between border-b pb-2" style={{ borderColor: T.rule }}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Compare Presentation</p>
          <h3 className="text-[14px] font-semibold" style={{ color: T.ink }}>{p.templateName}</h3>
        </div>
        <button data-compare-close onClick={p.onClose} className="text-[11px] text-slate-400 hover:text-slate-600">Close</button>
      </div>

      {H("What changes")}
      {report.changes.length === 0 && <p className="text-[11px] text-slate-400 italic">Nothing at the document level.</p>}
      {report.changes.map((c) => (
        <div key={c.leaf} data-compare-change={c.leaf} className="flex items-baseline gap-1.5 text-[11.5px] mb-0.5">
          <span className="text-slate-500">{c.leaf}</span>
          <span className="text-slate-400 line-through">{c.from}</span>
          <span className="text-slate-300">→</span>
          <span style={{ color: T.ink }}>{c.to}</span>
        </div>
      ))}
      {(report.sectionDressArriving > 0 || report.sectionDressClearing > 0) && (
        <p className="text-[11px] text-slate-500 mt-1">
          Section dress: {report.sectionDressArriving} arriving · {report.sectionDressClearing} of this version&apos;s replaced.
        </p>
      )}

      {H("What stays bound")}
      <p data-compare-bound className="text-[11.5px] text-slate-500">
        {report.staysBound.components} component style{report.staysBound.components === 1 ? "" : "s"} ·{" "}
        {report.staysBound.items} item-list style{report.staysBound.items === 1 ? "" : "s"} ·{" "}
        {report.staysBound.compPins} component photo{report.staysBound.compPins === 1 ? "" : "s"} — all remain with this version.
      </p>

      {report.unmatched.length > 0 && (<>
        {H("Waiting — no matching section")}
        {report.unmatched.map((r) => (
          <p key={r} data-compare-waits={r} className="text-[11.5px] text-slate-400">
            {r} — this dress waits silently; it applies if such a section ever joins.
          </p>
        ))}
      </>)}

      {report.ambiguous.length > 0 && (<>
        {H("Your decision — multiple matching sections")}
        {report.ambiguous.map((m) => (
          <div key={m.role} data-compare-ambiguous={m.role} className="mb-2 rounded-lg ring-1 p-2" style={{ ["--tw-ring-color" as string]: T.rule }}>
            <p className="text-[11px] font-semibold text-slate-600 mb-1">{m.role}</p>
            {m.matches.map((id) => (
              <label key={id} className="flex items-center gap-1.5 text-[11.5px] text-slate-500 cursor-pointer">
                <input type="radio" name={`amb-${m.role}`} data-compare-choice={`${m.role}:${id}`}
                  checked={Array.isArray(decisions[m.role]) && (decisions[m.role] as string[])[0] === id}
                  onChange={() => setDecisions((d) => ({ ...d, [m.role]: [id] }))} />
                Only {nameOf(id)}
              </label>
            ))}
            <label className="flex items-center gap-1.5 text-[11.5px] text-slate-500 cursor-pointer">
              <input type="radio" name={`amb-${m.role}`} data-compare-choice={`${m.role}:all`}
                checked={decisions[m.role] === "all"}
                onChange={() => setDecisions((d) => ({ ...d, [m.role]: "all" }))} />
              All matching sections
            </label>
          </div>
        ))}
      </>)}

      {report.missingPhotos.length > 0 && (<>
        {H("Photos this library doesn't hold")}
        {report.missingPhotos.map((m) => (
          <p key={m.slot} data-compare-missing-photo={m.slot} className="text-[11.5px] text-amber-700">
            {m.label} ({m.slot}) — the pin arrives, the photo is missing until the library has it.
          </p>
        ))}
      </>)}

      <div className="mt-4 pt-3 border-t" style={{ borderColor: T.rule }}>
        <button data-compare-apply disabled={undecided.length > 0}
          onClick={() => { if (window.confirm(APPLY_CONFIRM_WORDING)) p.onApply(decisions); }}
          className={`w-full py-2 rounded-lg text-[12.5px] font-semibold text-white ${undecided.length > 0 ? "opacity-40 cursor-not-allowed" : ""}`}
          style={{ background: T.navy }}>
          Apply this presentation
        </button>
        {undecided.length > 0 && (
          <p className="text-[10.5px] text-slate-400 mt-1 text-center">Decide the mappings above first — nothing is ever guessed.</p>
        )}
      </div>
    </div>
  );
}
