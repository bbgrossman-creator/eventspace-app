// ═══════════════════════════════════════════════════════════════════════════
// LIVE LENS PANEL (v213 · Studio shell). The right region's owner: a second,
// persistent, READ-ONLY projection of the same graph beside the Canvas — the
// strongest demonstration of one-source-of-truth the interface can make:
// there is nothing to keep in sync, so this panel updates because the graph
// did, not because anything synchronized it.
//
// OWNERSHIP (SPEC-003 §7 shell rules): this component owns the region's
// chrome — the identity line, the read-only marking, the scroll — and
// NOTHING else. The projection inside arrives as children from the page
// (today: the Customer model through ProposalRenderer; v214 adds the
// switcher and further lenses). This panel contributes zero interactive
// controls of its own: read-only is structural, not disciplined.
// ═══════════════════════════════════════════════════════════════════════════
"use client";
import React from "react";

const T = { ink: "#1F2A37", gold: "#C9A34E", rule: "#E7EDF5", soft: "#5B6673" } as const;

export default function LiveLensPanel(props: {
  /** What the panel is currently projecting — printed, never inferred. */
  lensLabel: string;
  /** The projection's rendering, supplied by the page. */
  children: React.ReactNode;
  /** Nothing to project yet — empty is information (SPEC-003 §5). */
  emptyReason?: string | null;
}) {
  return (
    <div data-live-lens className="h-full min-h-0 flex flex-col bg-[#EEF2F7]">
      <div data-live-lens-header
           className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b bg-white"
           style={{ borderColor: T.rule }}>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.soft }}>
          Live Lens
        </span>
        <span data-live-lens-label className="text-[11px] font-semibold" style={{ color: T.ink }}>
          {props.lensLabel}
        </span>
        <span data-live-lens-readonly className="ml-auto text-[9.5px] text-slate-400">
          live · read-only
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {props.children ?? (
          <p data-live-lens-empty className="text-center text-[11.5px] text-slate-400 py-10">
            {props.emptyReason ?? "Nothing to project yet — the panel fills in as the design does."}
          </p>
        )}
      </div>
    </div>
  );
}
