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
//   (v262: the blueprint route is retired — creation from a Blueprint is
//    BP-3, New Proposal → Start from Blueprint; one workflow, one language.)
//                            own activity log.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useState } from "react";

const T = { ink: "#1F2A37", navy: "#102F56", rule: "#E7EDF5" } as const;

export interface GenesisVersionRow {
  id: string; label: string; statusLabel: string; date: string; count: number;
}

export default function VersionGenesis(props: {
  /** v222 — the PRIMARY revise route names its exact source, because the two
   *  doors (Studio: the viewed version; Booking page: the latest) revise
   *  different things and must say so. */
  reviseTarget: { label: string; blurb: string };
  /** Every OTHER version — the "Copy another version…" route's offer, with
   *  the facts a choice needs: number, status, date, component count. */
  otherVersions: GenesisVersionRow[];
  busy?: boolean;
  onRevise: () => void;
  onCopyVersion: (versionId: string) => void;
  onBlank: () => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"decide" | "copy">("decide");

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
            <Option testid="revise" mark="✎" title={props.reviseTarget.label}
              blurb={props.reviseTarget.blurb}
              onClick={props.onRevise} />
            {props.otherVersions.length > 0 && (
              <Option testid="copy" mark="⧉" title="Copy another version…"
                blurb="Choose exactly which prior version becomes the new draft."
                onClick={() => setMode("copy")} />
            )}
            <Option testid="blank" mark="○" title="Start blank"
              blurb="A genuinely empty version — no sections, no components, no items."
              onClick={props.onBlank} />
          </div>
        )}

        {mode === "copy" && (
          <div>
            <div className="space-y-1 mb-3">
              {props.otherVersions.map((v) => (
                <button key={v.id} data-genesis-copy={v.id} disabled={props.busy}
                  onClick={() => props.onCopyVersion(v.id)}
                  className="w-full text-left px-3 py-2 rounded-lg border hover:bg-[#F4F9FF]"
                  style={{ borderColor: T.rule }}>
                  <span className="text-[13px] font-semibold" style={{ color: T.ink }}>{v.label}</span>
                  <span className="text-[10.5px] text-slate-400 ml-2">
                    {v.statusLabel} · {v.date} · {v.count} component{v.count === 1 ? "" : "s"}
                  </span>
                </button>
              ))}
            </div>
            <button data-genesis-copy-back onClick={() => setMode("decide")}
              className="text-[12px] text-slate-500 rounded-lg px-3 py-1.5 ring-1 ring-slate-200">Back</button>
          </div>
        )}

        <button data-genesis-cancel onClick={props.onCancel}
          className="mt-3 text-[11px] text-slate-400 hover:text-slate-700">Cancel — no new version</button>
      </div>
    </div>
  );
}
