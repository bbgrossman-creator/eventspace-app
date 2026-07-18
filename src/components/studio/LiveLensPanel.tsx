// ═══════════════════════════════════════════════════════════════════════════
// LIVE LENS PANEL (v213 · Studio shell). The right region's owner: a second,
// persistent, READ-ONLY projection of the same graph beside the Canvas — the
// strongest demonstration of one-source-of-truth the interface can make:
// there is nothing to keep in sync, so this panel updates because the graph
// did, not because anything synchronized it.
//
// OWNERSHIP (SPEC-003 §7 shell rules): this component owns the region's
// chrome — the identity line, the read-only marking, the scroll — and
// NOTHING else. The projection inside arrives as children from the page.
//
// v214 — the switcher arrives, as v213's header promised, and the structural
// read-only claim TIGHTENS rather than bends: the CONTENT region (where the
// projection lives) contributes zero interactive controls — the projection
// cannot write, structurally — while the header hosts exactly one thing the
// page supplies: the lens switcher, which is a render decision, never a graph
// verb. This panel still contributes zero controls of ITS OWN; it hosts a
// slot. Which lenses the switcher offers is the registry's business
// (visibleLenses, in the owner above) — this file never knows.
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
  /** v214: the lens switcher, built and owned by the region above (its
   *  options come from the registry there). Hosted in the header — the one
   *  place chrome controls may live; the content region stays structurally
   *  control-free. */
  switcher?: React.ReactNode;
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
        {props.switcher}
        <span data-live-lens-readonly className="ml-auto text-[9.5px] text-slate-400">
          live · read-only
        </span>
      </div>
      <div data-live-lens-content className="flex-1 min-h-0 overflow-y-auto p-3">
        {props.children ?? (
          <p data-live-lens-empty className="text-center text-[11.5px] text-slate-400 py-10">
            {props.emptyReason ?? "Nothing to project yet — the panel fills in as the design does."}
          </p>
        )}
      </div>
    </div>
  );
}
