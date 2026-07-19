"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE CONTEXTUAL TOOLBAR (v226 · PUBLICATION §6.3) — belongs to the SELECTED
// identity, not the application. Floats over the paper only while a
// presentation identity is selected; renders SEMANTIC options from the
// treatment registry; carries NO structural actions (§0.2 survives the
// canvas). Every pick is render state; Save look commits (§6.4).
// ═══════════════════════════════════════════════════════════════════════════
import React from "react";
import { TREATMENT_OPTIONS, SectionTreatment } from "@/lib/publication";

export default function TreatmentToolbar(props: {
  sectionName: string;
  effective: Required<SectionTreatment>;
  onPick: (patch: SectionTreatment) => void;
  onClose: () => void;
}) {
  return (
    <div data-treatment-toolbar
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white rounded-xl shadow-2xl ring-1 ring-[#E7EDF5] px-3 py-2 flex items-center gap-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 max-w-[120px] truncate">{props.sectionName}</span>
      {TREATMENT_OPTIONS.map((g) => (
        <span key={g.key} className="flex items-center gap-1">
          <span className="text-[9.5px] text-slate-300 uppercase">{g.label}</span>
          {g.options.map((o) => (
            <button key={o.value} data-treat={`${g.key}:${o.value}`}
              onClick={() => props.onPick({ [g.key]: o.value } as SectionTreatment)}
              className={`text-[10.5px] px-1.5 py-0.5 rounded ${props.effective[g.key] === o.value
                ? "bg-[#102F56] text-white" : "text-slate-500 hover:bg-slate-100"}`}>
              {o.label}
            </button>
          ))}
        </span>
      ))}
      <button data-treat-close onClick={props.onClose} title="Done — back to the paper"
        className="text-slate-300 hover:text-slate-600 text-[12px] pl-1">✕</button>
    </div>
  );
}
