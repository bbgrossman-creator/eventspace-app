"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE INSPECTOR WING (v237) — the Inspector stops sliding in from the
// browser edge and becomes what the Presentation Room already is: a
// workspace wing. The hinge is the PAPER, not the window:
//     Proposal │ Inspector
// The stage recomposes, the paper contracts and stays whole (§6.10), and
// the SEAM says "this belongs to this document": a gold hinge-rule on the
// wing's paper-facing edge, the paper's own ring and shadow family, and a
// subject thread in the header naming exactly what's selected — the eye
// never hunts. Esc retreats one layer; selecting another object on the
// paper swaps the subject in place. The destructive action stays at the
// very bottom, where the host puts it — clearly separated from editing.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect } from "react";

export default function InspectorRegion(props: {
  subjectLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); props.onClose(); }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [props.onClose]);

  return (
    <div data-inspector-region
      className="my-10 bg-white rounded-[4px] ring-1 ring-black/5 self-start sticky top-[64px] flex flex-col overflow-hidden"
      style={{ maxHeight: "calc(100vh - 96px)",
        boxShadow: "0 1px 2px rgba(16,47,86,.08)",
        borderLeft: "3px solid #C9A34E" /* the seam — the hinge to the paper */ }}>
      <div data-inspector-subject className="shrink-0 flex items-baseline gap-1.5 px-3 pt-2.5 pb-1.5">
        <span aria-hidden className="text-[10px]" style={{ color: "#C9A34E" }}>◀</span>
        <span className="text-[12px] font-semibold text-[#1F2A37] truncate">{props.subjectLabel}</span>
        <button data-inspector-close onClick={props.onClose}
          className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-400 hover:text-slate-600">Esc</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">{props.children}</div>
    </div>
  );
}
