// ═══════════════════════════════════════════════════════════════════════════
// THE LANDING DECISION (v216) — what happens when a WHOLE DESIGN meets a
// POPULATED Canvas. The constitution's words are the spec (KA §6,
// UI_GRAMMAR §10/§11):
//
//   "Full designs never merge silently. … Onto a populated Canvas, the drop
//    OPENS the landing decision — Add to current · Replace current draft ·
//    Choose content — and commits nothing until chosen. The drop is the
//    request, not the commit. Replace additionally confirms, because it is
//    destructive."
//
// This component is that decision and NOTHING else:
//   • It renders only when the host routed here (landingRoute === "decision"
//    — the empty-Canvas no-ceremony branch never mounts it).
//   • It COMMITS NOTHING on its own. Every commit is a handler the host
//     supplied, fired exactly once, only by an explicit click. The regression
//     variant proves the suite catches a copy that commits on mount — the
//     silent merge, mechanized.
//   • Replace is a two-step: the option arms a confirm; only the confirm
//     fires the handler. Backing out of the confirm returns to the decision
//     with nothing committed.
//   • Choose renders the design's real content (the host's previewBlueprint
//     projection); committing sends exactly the chosen ids; choosing none
//     disables the commit — an empty choice is not a decision.
//   • Cancel is always available and always free.
// ═══════════════════════════════════════════════════════════════════════════
"use client";
import React, { useState } from "react";
import { BlueprintPreview } from "@/lib/blueprints";

const T = { ink: "#1F2A37", navy: "#102F56", gold: "#C9A34E", rule: "#E7EDF5" } as const;

export default function LandingDecision(props: {
  /** The design being landed — printed, never inferred. */
  name: string;
  /** Its real content, for Choose (and for honesty: you decide over what IS). */
  preview: BlueprintPreview;
  busy?: boolean;
  onAdd: () => void;
  onReplace: () => void;
  onChoose: (sourceComponentIds: string[]) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"decide" | "confirmReplace" | "choose">("decide");
  const [chosen, setChosen] = useState<Record<string, true>>({});
  const chosenIds = Object.keys(chosen);
  const n = props.preview.components.length;

  const Option = (p: { mark: string; title: string; blurb: string; onClick: () => void; testid: string; danger?: boolean }) => (
    <button data-landing-option={p.testid} disabled={props.busy} onClick={p.onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg border transition-colors hover:bg-[#F4F9FF]"
      style={{ borderColor: p.danger ? "#FECACA" : T.rule }}>
      <div className="text-[13px] font-semibold" style={{ color: p.danger ? "#B91C1C" : T.ink }}>
        {p.mark} {p.title}
      </div>
      <div className="text-[11px] text-slate-400">{p.blurb}</div>
    </button>
  );

  return (
    <div data-landing className="fixed inset-0 z-50 flex items-center justify-center bg-black/25"
         onClick={props.onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-[440px] max-h-[80vh] overflow-y-auto p-4"
           onClick={(e) => e.stopPropagation()}>
        <p className="text-[13.5px] font-semibold mb-0.5" style={{ color: T.ink }}>
          Landing “{props.name}”
        </p>
        <p className="text-[11px] text-slate-400 mb-3">
          This Canvas already has work on it — a whole design never merges silently. Nothing
          happens until you choose.
        </p>

        {mode === "decide" && (
          <div className="space-y-2">
            <Option testid="add" mark="＋" title="Add to current"
              blurb={`Everything in the blueprint (${n} component${n === 1 ? "" : "s"}) joins what's here.`}
              onClick={props.onAdd} />
            <Option testid="replace" mark="⟳" title="Replace current draft" danger
              blurb="Clears this version's components first — asks again before it does."
              onClick={() => setMode("confirmReplace")} />
            <Option testid="choose" mark="☰" title="Choose content"
              blurb="Pick which of its components to bring in."
              onClick={() => setMode("choose")} />
          </div>
        )}

        {mode === "confirmReplace" && (
          <div data-landing-confirm className="rounded-lg border p-3" style={{ borderColor: "#FECACA" }}>
            <p className="text-[12.5px] font-semibold text-[#B91C1C] mb-1">Replace the current draft?</p>
            <p className="text-[11px] text-slate-500 mb-3">
              This removes everything on this version and lands “{props.name}” in its place. Other
              versions are untouched. This cannot be undone here.
            </p>
            <div className="flex gap-2">
              <button data-landing-confirm-replace disabled={props.busy} onClick={props.onReplace}
                className="text-[12px] font-semibold text-white rounded-lg px-3 py-1.5"
                style={{ background: "#B91C1C" }}>Replace draft</button>
              <button data-landing-confirm-back onClick={() => setMode("decide")}
                className="text-[12px] text-slate-500 rounded-lg px-3 py-1.5 ring-1 ring-slate-200">Back</button>
            </div>
          </div>
        )}

        {mode === "choose" && (
          <div>
            <div className="space-y-1 mb-3">
              {props.preview.components.map((c) => {
                const on = chosen[c.id] === true;
                return (
                  <button key={c.id} data-landing-pick={c.id} aria-pressed={on}
                    onClick={() => setChosen((prev) => {
                      const next: Record<string, true> = { ...prev };
                      if (next[c.id]) delete next[c.id]; else next[c.id] = true;
                      return next;
                    })}
                    className={`w-full text-left px-3 py-1.5 rounded-lg border text-[12.5px] flex items-baseline gap-2 ${on ? "bg-[#F4F9FF]" : ""}`}
                    style={{ borderColor: on ? T.gold : T.rule }}>
                    <span style={{ color: T.gold }}>{on ? "▣" : "▢"}</span>
                    <span className="font-medium" style={{ color: T.ink }}>{c.title}</span>
                    <span className="text-[10.5px] text-slate-400">
                      {[c.sectionName, `${c.itemCount} item${c.itemCount === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button data-landing-choose-commit disabled={props.busy || chosenIds.length === 0}
                onClick={() => props.onChoose(chosenIds)}
                className="text-[12px] font-semibold text-white rounded-lg px-3 py-1.5 disabled:opacity-40"
                style={{ background: T.navy }}>
                Add {chosenIds.length || "…"} chosen
              </button>
              <button data-landing-choose-back onClick={() => { setMode("decide"); setChosen({}); }}
                className="text-[12px] text-slate-500 rounded-lg px-3 py-1.5 ring-1 ring-slate-200">Back</button>
            </div>
          </div>
        )}

        <button data-landing-cancel onClick={props.onCancel}
          className="mt-3 text-[11px] text-slate-400 hover:text-slate-700">Cancel — land nothing</button>
      </div>
    </div>
  );
}
