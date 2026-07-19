"use client";
// ═══════════════════════════════════════════════════════════════════════════
// VERSION GENESIS (v220) — what "＋ New Version" means is a DECISION, not a
// default. The old desk item silently copied the latest version; correct for
// revisions, silently wrong for every other intent. This ceremony follows
// the LandingDecision's law: it renders the routes, commits NOTHING until
// one is chosen, and the host owns every mutation. No version exists before
// the user chooses — the regression variant proves the suite bites a copy
// that chooses for them.
//
//   Revise this version    — copy the VIEWED version into a new draft
//                            (provenance: "from vN", as createVersion logs).
//   Start blank            — a genuinely empty version: no sections, no
//                            components, no items (provenance: "blank").
//   Start from a blueprint — blank + the landing machinery (applyBlueprint),
//                            listed inline; provenance rides the blueprint's
//                            own activity log.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useState } from "react";

const T = { ink: "#1F2A37", navy: "#102F56", rule: "#E7EDF5" } as const;

export default function VersionGenesis(props: {
  /** The viewed version's label — "v3" — printed so "revise" names its source. */
  currentLabel: string;
  blueprints: { id: string; name: string }[];
  busy?: boolean;
  onRevise: () => void;
  onBlank: () => void;
  onBlueprint: (blueprintId: string, name: string) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"decide" | "blueprint">("decide");

  const Option = (p: { mark: string; title: string; blurb: string; onClick: () => void; testid: string }) => (
    <button data-genesis-option={p.testid} disabled={props.busy} onClick={p.onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg border transition-colors hover:bg-[#F4F9FF]"
      style={{ borderColor: T.rule }}>
      <div className="text-[13px] font-semibold" style={{ color: T.ink }}>{p.mark} {p.title}</div>
      <div className="text-[11px] text-slate-400">{p.blurb}</div>
    </button>
  );

  return (
    <div data-genesis className="fixed inset-0 z-50 flex items-center justify-center bg-black/25"
         onClick={props.onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-[420px] max-h-[75vh] overflow-y-auto p-4"
           onClick={(e) => e.stopPropagation()}>
        <p className="text-[13.5px] font-semibold mb-0.5" style={{ color: T.ink }}>New version</p>
        <p className="text-[11px] text-slate-400 mb-3">
          Same proposal, same history — you're choosing where the new draft begins.
        </p>

        {mode === "decide" && (
          <div className="space-y-2">
            <Option testid="revise" mark="✎" title={`Revise ${props.currentLabel}`}
              blurb={`Copies everything on ${props.currentLabel} into a new draft.`}
              onClick={props.onRevise} />
            <Option testid="blank" mark="○" title="Start blank"
              blurb="A genuinely empty version — no sections, no components, no items."
              onClick={props.onBlank} />
            <Option testid="blueprint" mark="📐" title="Start from a blueprint"
              blurb="An empty version, landed from the Library's designs."
              onClick={() => setMode("blueprint")} />
          </div>
        )}

        {mode === "blueprint" && (
          <div>
            <div className="space-y-1 mb-3">
              {props.blueprints.map((bp) => (
                <button key={bp.id} data-genesis-bp={bp.id} disabled={props.busy}
                  onClick={() => props.onBlueprint(bp.id, bp.name)}
                  className="w-full text-left px-3 py-2 rounded-lg border text-[13px] hover:bg-[#F4F9FF]"
                  style={{ borderColor: T.rule, color: T.ink }}>📐 {bp.name}</button>
              ))}
              {props.blueprints.length === 0 && (
                <p className="text-[11px] text-slate-400 px-1">
                  No blueprints yet — promote a design you're proud of, and it will be offered here.
                </p>
              )}
            </div>
            <button data-genesis-back onClick={() => setMode("decide")}
              className="text-[12px] text-slate-500 rounded-lg px-3 py-1.5 ring-1 ring-slate-200">Back</button>
          </div>
        )}

        <button data-genesis-cancel onClick={props.onCancel}
          className="mt-3 text-[11px] text-slate-400 hover:text-slate-700">Cancel — no new version</button>
      </div>
    </div>
  );
}
