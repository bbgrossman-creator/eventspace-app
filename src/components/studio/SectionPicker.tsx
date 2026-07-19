"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE SECTION PICKER (v221) — extracted from the page and made editorial.
// It answers exactly one question: WHAT CHAPTER CAN I ADD THAT DOESN'T
// ALREADY EXIST? Present sections are ABSENT — not disabled, not checked
// (a chapter is unique; repetition belongs to the components beneath it).
// The offer reads as a curated menu (Food · Event · Operations ·
// Presentation · General), not a lookup table; coining a custom section is
// its own deliberate act behind its own affordance. Commits nothing until
// chosen; the host owns every mutation.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useState } from "react";
import { MomentType, availableMomentTypes, groupMomentTypes } from "@/lib/moments";

const T = { ink: "#1F2A37", navy: "#102F56", rule: "#E7EDF5" } as const;

export default function SectionPicker(props: {
  types: MomentType[];
  present: { section_type_id: string }[];
  busy?: boolean;
  onPick: (sectionTypeId: string) => void;
  onCreate: (name: string) => void;
  onCancel: () => void;
}) {
  const [coining, setCoining] = useState(false);
  const offer = groupMomentTypes(availableMomentTypes(props.types, props.present));

  return (
    <div data-moment-picker className="fixed inset-0 z-50 flex items-center justify-center bg-black/25"
         onClick={props.onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-[400px] max-h-[75vh] overflow-y-auto p-4"
           onClick={(e) => e.stopPropagation()}>
        <p className="text-[13.5px] font-semibold mb-0.5" style={{ color: T.ink }}>Add a section</p>
        <p className="text-[11px] text-slate-400 mb-3">A chapter the proposal doesn't have yet.</p>

        {offer.map((g) => (
          <div key={g.group} className="mb-3" data-picker-group={g.group}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{g.group}</p>
            <div className="space-y-1">
              {g.types.map((t) => (
                <button key={t.id} data-moment-option={t.id} disabled={props.busy}
                  onClick={() => props.onPick(t.id)}
                  className="w-full text-left px-3 py-1.5 rounded-lg border text-[13px] hover:bg-[#F4F9FF]"
                  style={{ borderColor: T.rule, color: T.ink }}>{t.name}</button>
              ))}
            </div>
          </div>
        ))}
        {offer.length === 0 && (
          <p className="text-[11px] text-slate-400 mb-3">Every existing section type is already on this version.</p>
        )}

        {!coining ? (
          <button data-moment-coin onClick={() => setCoining(true)}
            className="text-[12px] font-semibold text-slate-500 hover:text-[#102F56]">
            ＋ Create custom section
          </button>
        ) : (
          <form className="flex gap-2" onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem("momentName") as HTMLInputElement;
            const name = input.value.trim();
            if (name) props.onCreate(name);
          }}>
            <input name="momentName" data-moment-new autoFocus placeholder='e.g. "After Party"'
              className="field flex-1 !text-[12px]" />
            <button type="submit" data-moment-create disabled={props.busy}
              className="text-[12px] font-semibold text-white rounded-lg px-3 py-1.5"
              style={{ background: T.navy }}>Add</button>
          </form>
        )}

        <div>
          <button data-moment-cancel onClick={props.onCancel}
            className="mt-3 text-[11px] text-slate-400 hover:text-slate-700">Cancel</button>
        </div>
      </div>
    </div>
  );
}
